"""Small, defensive client for the URnetwork API.

All dashboard traffic to the upstream service goes through this module.  It
keeps network timeouts bounded, never retries a potentially irreversible write
by default, and makes cached results safe for callers to mutate.
"""

from __future__ import annotations

import copy
import hashlib
import logging
import os
import threading
import time
from collections.abc import Callable
from functools import wraps
from typing import Any, TypeVar
from urllib.parse import urlsplit

import requests
from cachetools import TTLCache

UR_API_BASE = os.getenv("UR_API_BASE", "https://api.bringyour.com").rstrip("/")
DEFAULT_TIMEOUT = (5, 20)  # connect, read (seconds)
DEFAULT_RETRIES = 3
DEFAULT_BACKOFF_SECONDS = 0.5
SAFE_RETRY_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
RETRYABLE_STATUS_CODES = frozenset({408, 425, 429, 500, 502, 503, 504})
USER_AGENT = "URnetwork-Stats-Dashboard/1.2"

# Token- and credential-derived cache keys are SHA-256 digests. This prevents
# an accidental cache dump or debug repr from exposing upstream credentials.
locations_cache = TTLCache(maxsize=2, ttl=300)
stats_cache = TTLCache(maxsize=100, ttl=120)
payments_cache = TTLCache(maxsize=100, ttl=120)
details_cache = TTLCache(maxsize=100, ttl=120)
leaderboard_cache = TTLCache(maxsize=100, ttl=120)
devices_cache = TTLCache(maxsize=100, ttl=120)
jwt_cache = TTLCache(maxsize=100, ttl=3600)
_cache_lock = threading.RLock()

T = TypeVar("T")
_NO_PAYLOAD = object()


def _cache_key(namespace: str, args: tuple[Any, ...], kwargs: dict[str, Any]) -> tuple[str, str]:
    """Build a stable opaque cache key without retaining raw secret arguments."""
    digest = hashlib.sha256(namespace.encode("utf-8"))
    for value in args:
        digest.update(b"\0")
        digest.update(str(value).encode("utf-8", errors="surrogatepass"))
    for key, value in sorted(kwargs.items()):
        digest.update(b"\0")
        digest.update(str(key).encode("utf-8", errors="surrogatepass"))
        digest.update(b"=")
        digest.update(str(value).encode("utf-8", errors="surrogatepass"))
    return namespace, digest.hexdigest()


def cached_copy(cache: TTLCache, namespace: str) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Cache non-``None`` values and give every caller an isolated copy.

    ``cachetools.cached`` returns the same mutable object on cache hits. That
    was especially problematic for device records, which receive account labels
    in route code. This lightweight wrapper avoids cache poisoning and does not
    cache transient transport failures represented by ``None``.
    """

    def decorator(function: Callable[..., T]) -> Callable[..., T]:
        @wraps(function)
        def wrapped(*args: Any, **kwargs: Any) -> T:
            key = _cache_key(namespace, args, kwargs)
            with _cache_lock:
                try:
                    cached_value = cache[key]
                except KeyError:
                    cached_value = _NO_PAYLOAD
            if cached_value is not _NO_PAYLOAD:
                return copy.deepcopy(cached_value)

            result = function(*args, **kwargs)
            if result is not None:
                # Keep the cached object independent from the first caller too.
                stored_result = copy.deepcopy(result)
                with _cache_lock:
                    cache[key] = stored_result
                return copy.deepcopy(stored_result)
            return result

        return wrapped

    return decorator


def clear_upstream_caches(*, include_credentials: bool = False) -> None:
    """Clear response caches after a successful upstream mutation.

    JWTs are intentionally kept unless an upstream response proves they are no
    longer valid. Re-authenticating every account after an unrelated device
    update would otherwise create avoidable login traffic.
    """
    caches = (locations_cache, stats_cache, payments_cache, details_cache, leaderboard_cache, devices_cache)
    with _cache_lock:
        for cache in caches:
            cache.clear()
        if include_credentials:
            jwt_cache.clear()


def _safe_url_for_log(url: str) -> str:
    """Log only protocol, host and path; never query strings or credentials."""
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if ":" in host:
        host = f"[{host}]"
    try:
        port = parsed.port
    except ValueError:
        port = None
    authority = f"{host}:{port}" if port else host
    return f"{parsed.scheme}://{authority}{parsed.path}"


def _close_response(response: requests.Response) -> None:
    close = getattr(response, "close", None)
    if callable(close):
        try:
            close()
        except Exception:
            # A response has already been consumed or rejected by this point;
            # cleanup must not hide the actual upstream result.
            logging.debug("URnetwork response cleanup failed.", exc_info=True)


def _retry_delay(response: requests.Response | None, attempt_index: int, backoff: float) -> float:
    """Honor a reasonable Retry-After value, otherwise use capped exponential backoff."""
    if response is not None and response.status_code == 429:
        raw_retry_after = response.headers.get("Retry-After")
        try:
            return min(30.0, max(0.0, float(raw_retry_after)))
        except (TypeError, ValueError):
            pass
    return min(5.0, max(0.0, backoff) * (2**attempt_index))


def request_with_retry(
    method: str,
    url: str,
    retries: int = DEFAULT_RETRIES,
    backoff: float = DEFAULT_BACKOFF_SECONDS,
    timeout: float | tuple[float, float] = DEFAULT_TIMEOUT,
    *,
    retry_unsafe: bool = False,
    **kwargs: Any,
) -> requests.Response | None:
    """Call the upstream API with bounded retries for safe operations.

    Network failures and temporary upstream statuses are retried only for safe
    HTTP methods by default. A duplicate POST can create an API key, remove a
    device, or initiate a transfer, so callers must explicitly opt in before a
    write is retried.
    """
    normalized_method = method.upper()
    attempts = max(1, int(retries))
    can_retry = retry_unsafe or normalized_method in SAFE_RETRY_METHODS
    headers = dict(kwargs.pop("headers", {}) or {})
    headers.setdefault("Accept", "application/json")
    headers.setdefault("User-Agent", USER_AGENT)
    kwargs["headers"] = headers
    kwargs.setdefault("allow_redirects", False)

    last_error: requests.RequestException | None = None
    safe_url = _safe_url_for_log(url)
    for attempt in range(attempts):
        response: requests.Response | None = None
        try:
            response = requests.request(normalized_method, url, timeout=timeout, **kwargs)
            if response.status_code not in RETRYABLE_STATUS_CODES or not can_retry or attempt == attempts - 1:
                return response

            logging.warning(
                "URnetwork API %s %s returned HTTP %s (attempt %s/%s); retrying.",
                normalized_method,
                safe_url,
                response.status_code,
                attempt + 1,
                attempts,
            )
            delay = _retry_delay(response, attempt, float(backoff))
            _close_response(response)
        except requests.RequestException as exc:
            last_error = exc
            if not can_retry or attempt == attempts - 1:
                logging.warning(
                    "URnetwork API %s %s failed after %s attempt(s): %s",
                    normalized_method,
                    safe_url,
                    attempt + 1,
                    type(exc).__name__,
                )
                return None
            logging.warning(
                "URnetwork API %s %s failed with %s (attempt %s/%s); retrying.",
                normalized_method,
                safe_url,
                type(exc).__name__,
                attempt + 1,
                attempts,
            )
            delay = _retry_delay(None, attempt, float(backoff))

        if delay:
            time.sleep(delay)

    # This is defensive: all loop paths above return, but preserves a stable
    # result if the request implementation is changed later.
    if last_error:
        logging.warning("URnetwork API %s %s could not be reached.", normalized_method, safe_url)
    return None


def _url(path: str) -> str:
    return f"{UR_API_BASE}/{path.lstrip('/')}"


def _headers(jwt_token: str | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {jwt_token}"} if jwt_token else {}


def _is_success(response: requests.Response | None, *, expected_status: int | None = 200) -> bool:
    if response is None:
        return False
    if expected_status is None:
        return 200 <= response.status_code < 300
    return response.status_code == expected_status


def _invalidate_credentials_on_auth_failure(response: requests.Response | None) -> None:
    if response is not None and response.status_code in {401, 403}:
        # A cached JWT is likely expired or revoked. Clear the small cache so
        # the next dashboard request obtains fresh credentials.
        with _cache_lock:
            jwt_cache.clear()


def _json_response(
    response: requests.Response | None,
    *,
    endpoint: str,
    expected_status: int | None = 200,
) -> dict[str, Any] | None:
    """Return a JSON object only for an expected response status."""
    if not _is_success(response, expected_status=expected_status):
        _invalidate_credentials_on_auth_failure(response)
        if response is not None:
            logging.info("URnetwork API %s returned HTTP %s.", endpoint, response.status_code)
            _close_response(response)
        return None
    if response is not None and response.status_code == 204:
        _close_response(response)
        return {}
    try:
        payload = response.json()
    except ValueError:
        logging.warning("URnetwork API %s returned invalid JSON.", endpoint)
        return None
    finally:
        if response is not None:
            _close_response(response)
    if not isinstance(payload, dict):
        logging.warning("URnetwork API %s returned an unexpected JSON shape.", endpoint)
        return None
    return payload


def _failure_message(response: requests.Response | None) -> str:
    """Return a concise, non-sensitive upstream failure message."""
    if response is None:
        return "Unable to reach the URnetwork API."
    return f"URnetwork API returned HTTP {response.status_code}."


def _post_result(endpoint: str, jwt_token: str, payload: dict[str, Any] | object = _NO_PAYLOAD) -> tuple[bool, dict[str, Any] | str]:
    kwargs: dict[str, Any] = {"headers": _headers(jwt_token)}
    if payload is not _NO_PAYLOAD:
        kwargs["json"] = payload
    response = request_with_retry("POST", _url(endpoint), **kwargs)
    parsed = _json_response(response, endpoint=endpoint, expected_status=None)
    if parsed is None:
        return False, _failure_message(response)
    clear_upstream_caches()
    return True, parsed


def _nonnegative_int(value: Any) -> int:
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError, OverflowError):
        return 0


@cached_copy(jwt_cache, "jwt")
def get_jwt_from_credentials(user: str, password: str) -> str | None:
    """Fetch and cache an upstream JWT without storing raw credentials as keys."""
    response = request_with_retry(
        "POST",
        _url("auth/login-with-password"),
        headers={"Content-Type": "application/json"},
        json={"user_auth": user, "password": password},
    )
    data = _json_response(response, endpoint="auth/login-with-password")
    network = (data or {}).get("network")
    token = network.get("by_jwt") if isinstance(network, dict) else None
    if not isinstance(token, str) or not token:
        logging.info("URnetwork credential login was rejected or returned no token.")
        return None
    return token


def generate_auth_code(jwt_token: str, uses: int = 1, duration_minutes: float = 5.0) -> tuple[str | None, str | None]:
    if not jwt_token:
        return None, "Not authenticated."
    success, result = _post_result("auth/code-create", jwt_token, {"uses": uses, "duration_minutes": duration_minutes})
    if not success:
        return None, str(result)
    code = result.get("auth_code") if isinstance(result, dict) else None
    return (code, None) if isinstance(code, str) and code else (None, "URnetwork did not return an auth code.")


@cached_copy(stats_cache, "transfer-stats")
def fetch_transfer_stats(jwt_token: str) -> dict[str, int | float] | None:
    if not jwt_token:
        return None
    response = request_with_retry("GET", _url("transfer/stats"), headers=_headers(jwt_token))
    data = _json_response(response, endpoint="transfer/stats")
    if data is None:
        return None
    paid = _nonnegative_int(data.get("paid_bytes_provided"))
    unpaid = _nonnegative_int(data.get("unpaid_bytes_provided"))
    return {"paid_bytes": paid, "paid_gb": paid / 1e9, "unpaid_bytes": unpaid, "unpaid_gb": unpaid / 1e9}


@cached_copy(payments_cache, "payments")
def fetch_payment_stats(jwt_token: str) -> list[dict[str, Any]] | None:
    if not jwt_token:
        return []
    response = request_with_retry("GET", _url("account/payments"), headers=_headers(jwt_token))
    data = _json_response(response, endpoint="account/payments")
    if data is None:
        return None
    payments = data.get("account_payments", [])
    return [dict(item) for item in payments if isinstance(item, dict)] if isinstance(payments, list) else []


@cached_copy(details_cache, "account-details")
def fetch_account_details(jwt_token: str) -> dict[str, Any] | None:
    if not jwt_token:
        return {}
    headers = _headers(jwt_token)
    details: dict[str, Any] = {}

    points = _json_response(request_with_retry("GET", _url("account/points"), headers=headers), endpoint="account/points")
    if points is not None:
        network_points = points.get("network_points", [])
        if isinstance(network_points, list):
            details["points"] = sum(
                _nonnegative_int(point.get("point_value")) for point in network_points if isinstance(point, dict)
            )

    referrals = _json_response(request_with_retry("GET", _url("account/referral-code"), headers=headers), endpoint="account/referral-code")
    if referrals is not None:
        details["referrals"] = referrals

    referral_network = _json_response(request_with_retry("GET", _url("account/referral-network"), headers=headers), endpoint="account/referral-network")
    if referral_network is not None:
        details["referral_network"] = referral_network.get("network", {})

    ranking = _json_response(request_with_retry("GET", _url("network/ranking"), headers=headers), endpoint="network/ranking")
    if ranking is not None:
        details["ranking"] = ranking.get("network_ranking", {})

    subscription = _json_response(request_with_retry("GET", _url("subscription/balance"), headers=headers), endpoint="subscription/balance")
    if subscription is not None:
        details["approximate_payments"] = _nonnegative_int(subscription.get("pending_payout_usd_nano_cents")) / 1e9
        details["subscription"] = subscription

    reliability = _json_response(request_with_retry("GET", _url("network/reliability"), headers=headers), endpoint="network/reliability")
    if reliability is not None:
        details["reliability"] = reliability.get("reliability_window", {})

    return details


@cached_copy(leaderboard_cache, "leaderboard")
def fetch_leaderboard(jwt_token: str) -> list[dict[str, Any]] | None:
    if not jwt_token:
        return []
    response = request_with_retry("POST", _url("stats/leaderboard"), headers=_headers(jwt_token), json={})
    data = _json_response(response, endpoint="stats/leaderboard")
    if data is None:
        return None
    earners = data.get("earners", [])
    return [dict(entry) for entry in earners if isinstance(entry, dict)] if isinstance(earners, list) else []


@cached_copy(devices_cache, "devices")
def fetch_devices(jwt_token: str) -> list[dict[str, Any]] | None:
    if not jwt_token:
        return []
    response = request_with_retry("GET", _url("network/clients"), headers=_headers(jwt_token))
    data = _json_response(response, endpoint="network/clients")
    if data is None:
        return None
    mode_names = {-1: "Default", 0: "None", 1: "Network", 2: "Friends & Family", 3: "Public", 4: "Stream"}
    clients = data.get("clients", [])
    if not isinstance(clients, list):
        return []
    devices: list[dict[str, Any]] = []
    for client in clients:
        if not isinstance(client, dict):
            continue
        device = dict(client)
        device["provide_mode_str"] = mode_names.get(device.get("provide_mode"), "Unknown")
        devices.append(device)
    return devices


def remove_device(jwt_token: str, client_id: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("network/remove-client", jwt_token, {"client_id": client_id})
    return (True, "Device removed.") if success else (False, str(result))


@cached_copy(locations_cache, "provider-locations")
def fetch_provider_locations(jwt_token: str | None = None) -> dict[str, Any] | None:
    response = request_with_retry("GET", _url("network/provider-locations"), headers=_headers(jwt_token))
    return _json_response(response, endpoint="network/provider-locations")


def fetch_api_keys(jwt_token: str) -> list[dict[str, Any]] | None:
    if not jwt_token:
        return []
    response = request_with_retry("GET", _url("account/api-keys"), headers=_headers(jwt_token))
    data = _json_response(response, endpoint="account/api-keys")
    if data is None:
        return None
    keys = data.get("api_keys", [])
    return [dict(item) for item in keys if isinstance(item, dict)] if isinstance(keys, list) else []


def create_api_key(jwt_token: str, name: str) -> tuple[bool, dict[str, Any] | str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("account/api-key", jwt_token, {"name": name})
    if not success:
        return False, result
    if not isinstance(result, dict) or not isinstance(result.get("api_key"), str) or not result["api_key"]:
        return False, "URnetwork did not return a new API key."
    return True, result


def remove_api_key(jwt_token: str, key_id: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("account/api-key/remove", jwt_token, {"id": key_id})
    return (True, "API key removed.") if success else (False, str(result))


def fetch_wallets(jwt_token: str) -> list[dict[str, Any]] | None:
    if not jwt_token:
        return []
    response = request_with_retry("GET", _url("account/wallets"), headers=_headers(jwt_token))
    data = _json_response(response, endpoint="account/wallets")
    if data is None:
        return None
    wallets = data.get("wallets", [])
    return [dict(item) for item in wallets if isinstance(item, dict)] if isinstance(wallets, list) else []


def remove_wallet(jwt_token: str, wallet_id: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("account/wallets/remove", jwt_token, {"wallet_id": wallet_id})
    return (True, "Wallet removed.") if success else (False, str(result))


def fetch_wallet_balance(jwt_token: str) -> dict[str, Any] | None:
    if not jwt_token:
        return None
    response = request_with_retry("GET", _url("wallet/balance"), headers=_headers(jwt_token))
    data = _json_response(response, endpoint="wallet/balance")
    wallet_info = (data or {}).get("wallet_info")
    return dict(wallet_info) if isinstance(wallet_info, dict) else None


def validate_wallet_address(jwt_token: str, address: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("wallet/validate-address", jwt_token, {"address": address})
    if not success:
        return False, str(result)
    valid = bool(result.get("valid")) if isinstance(result, dict) else False
    return valid, "Address is valid." if valid else "Address is invalid."


def init_circle_wallet(jwt_token: str) -> tuple[bool, dict[str, Any] | str]:
    if not jwt_token:
        return False, "Not authenticated."
    return _post_result("wallet/circle-init", jwt_token)


def transfer_out_circle(jwt_token: str, to_address: str, amount_nano_cents: int) -> tuple[bool, dict[str, Any] | str]:
    if not jwt_token:
        return False, "Not authenticated."
    return _post_result(
        "wallet/circle-transfer-out",
        jwt_token,
        {"to_address": to_address, "amount_usdc_nano_cents": amount_nano_cents, "terms": True},
    )


def fetch_payout_wallet(jwt_token: str) -> str | None:
    if not jwt_token:
        return None
    response = request_with_retry("GET", _url("account/payout-wallet"), headers=_headers(jwt_token))
    data = _json_response(response, endpoint="account/payout-wallet")
    wallet_id = (data or {}).get("wallet_id")
    return wallet_id if isinstance(wallet_id, str) else None


def set_payout_wallet(jwt_token: str, wallet_id: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("account/payout-wallet", jwt_token, {"wallet_id": wallet_id})
    return (True, "Primary payout wallet updated.") if success else (False, str(result))


def add_account_wallet(jwt_token: str, blockchain: str, address: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result(
        "account/wallet",
        jwt_token,
        {"blockchain": blockchain, "wallet_address": address, "default_token_type": "USDC"},
    )
    if not success:
        return False, str(result)
    wallet_id = result.get("wallet_id") if isinstance(result, dict) else None
    return True, wallet_id if isinstance(wallet_id, str) and wallet_id else "Wallet added."


def set_device_provide_mode(jwt_token: str, client_id: str, provide_mode: int) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("device/set-provide", jwt_token, {"client_id": client_id, "provide_mode": provide_mode})
    return (True, "Provide mode updated.") if success else (False, str(result))


def set_ranking_visibility(jwt_token: str, is_public: bool) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("network/ranking-visibility", jwt_token, {"is_public": is_public})
    return (True, "Ranking visibility updated.") if success else (False, str(result))


def set_referral_network(jwt_token: str, referral_code: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("account/set-referral", jwt_token, {"referral_code": referral_code})
    return (True, "Referral network updated.") if success else (False, str(result))


def unlink_referral_network(jwt_token: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    # The upstream API currently exposes this mutation as GET. Override the
    # normal safe-method retry policy so a transport failure cannot repeat it.
    response = request_with_retry(
        "GET", _url("account/unlink-referral-network"), headers=_headers(jwt_token), retries=1
    )
    parsed = _json_response(response, endpoint="account/unlink-referral-network", expected_status=None)
    if parsed is None:
        return False, _failure_message(response)
    clear_upstream_caches()
    return True, "Referral network unlinked."


def fetch_blocked_locations(jwt_token: str) -> list[Any] | None:
    if not jwt_token:
        return []
    response = request_with_retry("GET", _url("network/blocked-locations"), headers=_headers(jwt_token))
    data = _json_response(response, endpoint="network/blocked-locations")
    if data is None:
        return None
    locations = data.get("blocked_locations", [])
    return copy.deepcopy(locations) if isinstance(locations, list) else []


def block_location(jwt_token: str, location_id: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("network/block-location", jwt_token, {"location_id": location_id})
    return (True, "Location blocked.") if success else (False, str(result))


def unblock_location(jwt_token: str, location_id: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("network/unblock-location", jwt_token, {"location_id": location_id})
    return (True, "Location unblocked.") if success else (False, str(result))


def set_device_name(jwt_token: str, device_id: str, name: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("device/set-name", jwt_token, {"device_id": device_id, "device_name": name})
    return (True, "Device name updated.") if success else (False, str(result))


def fetch_associations(jwt_token: str) -> dict[str, Any] | None:
    if not jwt_token:
        return {}
    response = request_with_retry("GET", _url("device/associations"), headers=_headers(jwt_token))
    return _json_response(response, endpoint="device/associations")


def redeem_balance_code(jwt_token: str, secret: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("subscription/redeem-balance-code", jwt_token, {"secret": secret})
    return (True, "Balance code redeemed.") if success else (False, str(result))


def fetch_provider_stats(jwt_token: str, client_id: str, last_n: int = 24) -> dict[str, Any] | None:
    if not jwt_token:
        return {}
    # This is a read query represented as POST by the upstream API. Never
    # auto-retry it until the API offers an idempotency contract.
    response = request_with_retry(
        "POST",
        _url("stats/provider-last-n"),
        headers=_headers(jwt_token),
        json={"client_id": client_id, "last_n": last_n},
    )
    return _json_response(response, endpoint="stats/provider-last-n")


def fetch_preferences(jwt_token: str) -> dict[str, Any] | None:
    if not jwt_token:
        return {}
    response = request_with_retry("GET", _url("preferences"), headers=_headers(jwt_token))
    return _json_response(response, endpoint="preferences")


def set_preferences(jwt_token: str, product_updates: bool) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("preferences/set-preferences", jwt_token, {"product_updates": product_updates})
    return (True, "Preferences updated.") if success else (False, str(result))


def send_feedback(jwt_token: str, star_count: int, text: str) -> tuple[bool, str]:
    if not jwt_token:
        return False, "Not authenticated."
    success, result = _post_result("feedback/send-feedback", jwt_token, {"star_count": star_count, "needs": {"other": text}})
    return (True, "Feedback sent.") if success else (False, str(result))


def fetch_hello() -> dict[str, Any]:
    response = request_with_retry("GET", _url("hello"))
    return _json_response(response, endpoint="hello") or {}
