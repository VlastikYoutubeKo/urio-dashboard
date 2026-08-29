"""HTTP API routes for the dashboard.

The routes deliberately keep account-management data private, validate every
state-changing request, and expose only aggregate provider information without
login.  Upstream URnetwork requests are isolated in ``backend.ur_api``.
"""

from __future__ import annotations

import concurrent.futures
import copy
import datetime as dt
from collections import OrderedDict
import json
import logging
import hashlib
import re
import secrets
import threading
import time
from decimal import Decimal, InvalidOperation
from functools import wraps
from typing import Any

from dateutil.parser import isoparse
from flask import Blueprint, Response, current_app, g, jsonify, request, session, stream_with_context
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import BadRequest

from backend.config import persist_environment
from backend.models import (
    Account,
    ProviderCount,
    Stats,
    Webhook,
    db,
    get_boolean_setting,
    set_setting,
)
from backend.security import (
    CredentialEncryptionError,
    account_password,
    authenticate_account,
    client_identifier,
    csrf_token,
    encrypt_credential,
    generate_credential_key,
    is_installed,
    login_rate_limiter,
    reset_session,
    validate_admin_password,
    verify_admin_password,
    verify_csrf,
)
from backend.ur_api import (
    add_account_wallet,
    block_location,
    create_api_key,
    fetch_account_details,
    fetch_api_keys,
    fetch_associations,
    fetch_blocked_locations,
    fetch_devices,
    fetch_hello,
    fetch_leaderboard,
    fetch_payment_stats,
    fetch_payout_wallet,
    fetch_preferences,
    fetch_provider_locations,
    fetch_provider_stats,
    fetch_wallet_balance,
    fetch_wallets,
    generate_auth_code,
    get_jwt_from_credentials,
    init_circle_wallet,
    redeem_balance_code,
    remove_api_key,
    remove_device,
    remove_wallet,
    send_feedback,
    set_device_name,
    set_device_provide_mode,
    set_payout_wallet,
    set_preferences,
    set_ranking_visibility,
    set_referral_network,
    transfer_out_circle,
    unblock_location,
    unlink_referral_network,
    validate_wallet_address,
)
from backend.webhooks import (
    VALID_SUMMARY_INTERVALS,
    deliver_webhook,
    redact_webhook_url,
    validate_custom_payload,
    validate_webhook_url,
)

api_bp = Blueprint("api", __name__)

# Provider endpoints are public and frequently requested. Cache JSON data, not
# Flask Response objects, so each request receives a fresh response object.
_API_CACHE_MAX_ENTRIES = 256
_api_cache: OrderedDict[str, tuple[Any, float]] = OrderedDict()
_api_cache_lock = threading.Lock()
_installation_lock = threading.Lock()
COUNTRY_CODE_RE = re.compile(r"^[a-z]{2}$", re.IGNORECASE)


def clear_api_cache() -> None:
    """Invalidate bounded server-side JSON caches after source data changes."""
    with _api_cache_lock:
        _api_cache.clear()


def clear_provider_api_cache() -> None:
    """Backward-compatible name used by the provider polling scheduler."""
    clear_api_cache()


def cached_api(ttl_seconds: int = 900):
    def decorator(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            # Query parameters are part of the cache key; this is important for
            # endpoints such as anomaly thresholds and historical point counts.
            # Hashing also prevents unusually long public query strings from
            # consuming cache memory or appearing in diagnostics.
            request_fingerprint = hashlib.sha256(request.full_path.encode("utf-8")).hexdigest()
            key = f"{function.__name__}:{request_fingerprint}"
            now = time.monotonic()
            with _api_cache_lock:
                cached = _api_cache.get(key)
                if cached and now < cached[1]:
                    _api_cache.move_to_end(key)
                    return jsonify(copy.deepcopy(cached[0]))
                if cached:
                    _api_cache.pop(key, None)

            result = function(*args, **kwargs)
            with _api_cache_lock:
                _api_cache[key] = (copy.deepcopy(result), now + ttl_seconds)
                _api_cache.move_to_end(key)
                while len(_api_cache) > _API_CACHE_MAX_ENTRIES:
                    _api_cache.popitem(last=False)
            return jsonify(result)

        return wrapped

    return decorator


def _json_payload() -> tuple[dict[str, Any] | None, tuple[Response, int] | None]:
    """Return the JSON request object prepared by the API request guard."""
    payload = getattr(g, "api_json", None)
    if not isinstance(payload, dict):
        return None, (jsonify({"error": "A JSON object request body is required."}), 400)
    return payload, None


def _error(message: str, status: int = 400) -> tuple[Response, int]:
    return jsonify({"error": message}), status


def _optional_string(
    value: object,
    field: str,
    *,
    maximum: int,
    required: bool = False,
    strip: bool = True,
) -> tuple[str | None, tuple[Response, int] | None]:
    if value is None:
        if required:
            return None, _error(f"{field} is required.")
        return None, None
    if not isinstance(value, str):
        return None, _error(f"{field} must be text.")
    cleaned = value.strip() if strip else value
    if required and not cleaned:
        return None, _error(f"{field} is required.")
    if len(cleaned) > maximum:
        return None, _error(f"{field} must be at most {maximum} characters.")
    return cleaned or None, None


def _boolean(value: object, field: str) -> tuple[bool | None, tuple[Response, int] | None]:
    if not isinstance(value, bool):
        return None, _error(f"{field} must be a boolean.")
    return value, None


def _account_from_value(value: object) -> tuple[Account | None, tuple[Response, int] | None]:
    if isinstance(value, bool):
        return None, _error("account_id must be a positive integer.")
    try:
        account_id = int(value)
    except (TypeError, ValueError):
        return None, _error("account_id must be a positive integer.")
    if account_id <= 0:
        return None, _error("account_id must be a positive integer.")
    account = db.session.get(Account, account_id)
    if not account:
        return None, _error("Account was not found.", 404)
    return account, None


def _account_from_payload(payload: dict[str, Any]) -> tuple[Account | None, tuple[Response, int] | None]:
    return _account_from_value(payload.get("account_id"))


def _account_from_query() -> tuple[Account | None, tuple[Response, int] | None]:
    return _account_from_value(request.args.get("account_id"))


def _valid_country_code(code: str) -> bool:
    return bool(COUNTRY_CODE_RE.fullmatch(code))


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC).replace(tzinfo=None, microsecond=0)


def _snapshot_timestamp(value: dt.datetime | None = None) -> str:
    return (value or _utc_now()).strftime("%Y-%m-%d %H:%M:%S")


def _as_utc_iso(value: str | dt.datetime | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    else:
        parsed = value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.UTC)
    else:
        parsed = parsed.astimezone(dt.UTC)
    return parsed.isoformat().replace("+00:00", "Z")


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)  # API values can be numeric strings.
    except (TypeError, ValueError):
        return default


def _chart_name(account: Account, existing: dict[str, Any]) -> str:
    base = account.nickname or account.username
    if base not in existing:
        return base
    return f"{base} ({account.id})"


def _latest_stat(account_id: int) -> Stats | None:
    return (
        Stats.query.filter_by(account_id=account_id)
        .order_by(Stats.timestamp.desc(), Stats.id.desc())
        .first()
    )


def calculate_earnings(payments: list[dict[str, Any]] | None, unpaid_bytes: int = 0) -> tuple[float, float, float]:
    """Calculate historical, 30-day, and approximate unpaid earnings safely."""
    total_earnings = 0.0
    monthly_earnings = 0.0
    now = dt.datetime.now(dt.UTC)
    one_month_ago = now - dt.timedelta(days=30)
    sixty_days_ago = now - dt.timedelta(days=60)
    recent_usd = 0.0
    recent_bytes = 0

    for payment in payments or []:
        amount = payment.get("token_amount")
        if amount is None:
            amount = _safe_float(payment.get("payout_nano_cents")) / 1e9
        amount_usd = _safe_float(amount)
        total_earnings += amount_usd

        payment_time_str = payment.get("payment_time") or payment.get("create_time")
        if not payment_time_str:
            continue
        try:
            payment_time = isoparse(payment_time_str)
            if payment_time.tzinfo is None:
                payment_time = payment_time.replace(tzinfo=dt.UTC)
            if payment_time > one_month_ago:
                monthly_earnings += amount_usd
            if payment_time > sixty_days_ago:
                recent_usd += amount_usd
                recent_bytes += int(_safe_float(payment.get("payout_byte_count")))
        except (TypeError, ValueError, OverflowError):
            continue

    approximate_pending = (unpaid_bytes * recent_usd / recent_bytes) if recent_bytes > 0 else 0.0
    return total_earnings, monthly_earnings, approximate_pending


def login_required(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        if not is_installed() or not session.get("logged_in"):
            return _error("Unauthorized.", 401)
        return function(*args, **kwargs)

    return wrapped


@api_bp.before_request
def api_request_guard():
    """Apply CSRF protection and reject malformed JSON before route logic."""
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        csrf_failure = verify_csrf()
        if csrf_failure:
            return csrf_failure

        if request.content_length:
            if not request.is_json:
                return _error("Content-Type must be application/json.", 415)
            try:
                payload = request.get_json(silent=False)
            except BadRequest:
                return _error("Malformed JSON request body.")
            if not isinstance(payload, dict):
                return _error("JSON request body must be an object.")
            g.api_json = payload
        else:
            g.api_json = {}


# ---------------------------------------------------------------------------
# Installation and authentication
# ---------------------------------------------------------------------------

@api_bp.get("/status")
def status():
    return jsonify(
        {
            "installed": is_installed(),
            "logged_in": bool(session.get("logged_in") and is_installed()),
            "csrf_token": csrf_token(),
        }
    )


@api_bp.post("/install")
def install():
    payload, failure = _json_payload()
    if failure:
        return failure

    with _installation_lock:
        if is_installed():
            return _error("Dashboard is already installed.", 409)

        password = payload.get("admin_pass")
        password_error = validate_admin_password(password, current_app.config["MIN_ADMIN_PASSWORD_LENGTH"])
        if password_error:
            return _error(password_error)

        secret_key = secrets.token_urlsafe(48)
        credential_key = generate_credential_key()
        from werkzeug.security import generate_password_hash

        password_hash = generate_password_hash(password)
        try:
            persist_environment(
                {
                    "SECRET_KEY": secret_key,
                    "ADMIN_PASSWORD_HASH": password_hash,
                    "CREDENTIAL_ENCRYPTION_KEY": credential_key,
                    "STATS_RETENTION_DAYS": current_app.config["STATS_RETENTION_DAYS"],
                    "PROVIDER_STATS_RETENTION_DAYS": current_app.config["PROVIDER_STATS_RETENTION_DAYS"],
                },
                remove=("ADMIN_PASSWORD",),
                env_file=current_app.config.get("ENV_FILE"),
            )
        except OSError:
            logging.exception("Could not save initial dashboard configuration.")
            return _error("Failed to save private configuration.", 500)

        # Updating the running app before Flask writes the response means the
        # first authenticated cookie is signed with the newly generated key.
        current_app.config.update(
            SECRET_KEY=secret_key,
            SECRET_KEY_PERSISTED=True,
            ADMIN_PASSWORD_HASH=password_hash,
            CREDENTIAL_ENCRYPTION_KEY=credential_key,
            LEGACY_ADMIN_PASSWORD="",
        )
        reset_session(logged_in=True)
        db.create_all()
        return jsonify({"message": "Dashboard installed successfully."}), 201


@api_bp.post("/auth/login")
def login():
    payload, failure = _json_payload()
    if failure:
        return failure
    if not is_installed():
        return _error("Dashboard has not been installed yet.", 409)

    client_id = client_identifier()
    maximum = current_app.config["LOGIN_MAX_ATTEMPTS"]
    window = current_app.config["LOGIN_WINDOW_SECONDS"]
    if not login_rate_limiter.allowed(client_id, maximum=maximum, window=window):
        retry_after = login_rate_limiter.retry_after(client_id, window=window)
        response, status_code = _error("Too many login attempts. Try again later.", 429)
        response.headers["Retry-After"] = str(retry_after)
        return response, status_code

    if verify_admin_password(payload.get("password")):
        login_rate_limiter.succeeded(client_id)
        reset_session(logged_in=True)
        return jsonify({"message": "Logged in successfully."})

    login_rate_limiter.failed(client_id, window=window)
    return _error("Invalid password.", 401)


@api_bp.post("/auth/logout")
def logout():
    reset_session(logged_in=False)
    return jsonify({"message": "Logged out successfully."})


# ---------------------------------------------------------------------------
# Public dashboard and private overview
# ---------------------------------------------------------------------------

@api_bp.get("/public/dashboard")
@cached_api(ttl_seconds=60)
def public_dashboard():
    enabled = get_boolean_setting(
        "public_dashboard_enabled", current_app.config["PUBLIC_DASHBOARD_DEFAULT"]
    )
    show_financials = get_boolean_setting(
        "public_dashboard_show_financials",
        current_app.config["PUBLIC_DASHBOARD_FINANCIALS_DEFAULT"],
    )
    empty_chart = {"labels": [], "data": []}
    response: dict[str, Any] = {
        "enabled": enabled,
        "financials_available": bool(enabled and show_financials),
        "combined": None,
        "active_accounts": None,
        "monthly_earnings": None,
        "chart_data": empty_chart,
        # Per-account breakdowns are never a public endpoint, even when the
        # owner explicitly chooses to publish aggregate figures.
        "account_charts": {},
    }
    if not enabled or not show_financials:
        return response

    accounts = Account.query.filter_by(is_active=True).all()
    paid = unpaid = monthly_earnings = 0.0
    time_grouped: dict[str, dict[str, float]] = {}
    for account in accounts:
        latest = _latest_stat(account.id)
        if latest:
            paid += latest.paid_gb
            unpaid += latest.unpaid_gb
        jwt = authenticate_account(account)
        if jwt:
            _, monthly, _ = calculate_earnings(fetch_payment_stats(jwt))
            monthly_earnings += monthly
        for entry in Stats.query.filter_by(account_id=account.id).order_by(Stats.timestamp.asc()):
            key = _as_utc_iso(entry.timestamp) or ""
            bucket = time_grouped.setdefault(key, {"paid": 0.0, "unpaid": 0.0})
            bucket["paid"] += entry.paid_gb
            bucket["unpaid"] += entry.unpaid_gb

    response.update(
        {
            "combined": {"paid_gb": paid, "unpaid_gb": unpaid},
            "active_accounts": len(accounts),
            "monthly_earnings": monthly_earnings,
            "chart_data": {
                "labels": list(time_grouped),
                "data": [bucket["paid"] + bucket["unpaid"] for bucket in time_grouped.values()],
            },
        }
    )
    return response


@api_bp.get("/locations")
def locations():
    # Global provider distribution is intentionally public and contains no
    # account-specific information.
    return jsonify(fetch_provider_locations() or {"locations": []})


@api_bp.get("/dashboard/overview")
@login_required
def dashboard_overview():
    accounts = Account.query.filter_by(is_active=True).all()
    paid = unpaid = total_earnings = 0.0
    time_grouped: dict[str, dict[str, float]] = {}
    account_charts: dict[str, dict[str, list[Any]]] = {}

    for account in accounts:
        latest = _latest_stat(account.id)
        if latest:
            paid += latest.paid_gb
            unpaid += latest.unpaid_gb
        jwt = authenticate_account(account)
        if jwt:
            total, _, _ = calculate_earnings(fetch_payment_stats(jwt))
            total_earnings += total

        entries = Stats.query.filter_by(account_id=account.id).order_by(Stats.timestamp.asc()).all()
        if entries:
            name = _chart_name(account, account_charts)
            account_charts[name] = {
                "labels": [_as_utc_iso(entry.timestamp) for entry in entries],
                "data": [entry.paid_gb + entry.unpaid_gb for entry in entries],
            }
        for entry in entries:
            key = _as_utc_iso(entry.timestamp) or ""
            bucket = time_grouped.setdefault(key, {"paid": 0.0, "unpaid": 0.0})
            bucket["paid"] += entry.paid_gb
            bucket["unpaid"] += entry.unpaid_gb

    return jsonify(
        {
            "combined": {"paid_gb": paid, "unpaid_gb": unpaid},
            "total_earnings": total_earnings,
            "active_accounts": len(accounts),
            "combined_chart": {
                "labels": list(time_grouped),
                "paid_gb": [bucket["paid"] for bucket in time_grouped.values()],
                "unpaid_gb": [bucket["unpaid"] for bucket in time_grouped.values()],
            },
            "account_charts": account_charts,
        }
    )


@api_bp.get("/dashboard/account")
@login_required
def dashboard_account():
    selected = request.args.get("account_id", "all")
    accounts = Account.query.order_by(Account.created_at.asc()).all()
    response: dict[str, Any] = {
        "accounts": [
            {"id": account.id, "username": account.username, "nickname": account.nickname, "is_active": account.is_active}
            for account in accounts
        ]
    }

    if selected != "all":
        account, failure = _account_from_value(selected)
        if failure:
            return failure
        jwt = authenticate_account(account)
        if not jwt:
            return _error("Could not authenticate the selected account with URnetwork.", 502)
        details = fetch_account_details(jwt) or {}
        payments = fetch_payment_stats(jwt) or []
        latest = _latest_stat(account.id)
        total, _, approximate_pending = calculate_earnings(
            payments, latest.unpaid_bytes if latest else 0
        )
        details["approximate_payments"] = approximate_pending
        response.update(
            {
                "account_details": details,
                "leaderboard": fetch_leaderboard(jwt) or [],
                "total_earnings": total,
            }
        )
    else:
        active_account = next((account for account in accounts if account.is_active), None)
        jwt = authenticate_account(active_account) if active_account else None
        if jwt:
            response["leaderboard"] = fetch_leaderboard(jwt) or []
    return jsonify(response)


# ---------------------------------------------------------------------------
# Devices and account lifecycle
# ---------------------------------------------------------------------------

def _device_accounts() -> list[dict[str, Any]]:
    accounts = Account.query.filter_by(is_active=True).all()
    result: list[dict[str, Any]] = []
    for account in accounts:
        try:
            result.append(
                {
                    "id": account.id,
                    "username": account.username,
                    "password": account_password(account),
                    "nickname": account.nickname or account.username,
                }
            )
        except CredentialEncryptionError:
            logging.error("Skipping account id %s because its encrypted credential is unavailable.", account.id)
    return result


def _fetch_devices_for_account(account_data: dict[str, Any]) -> list[dict[str, Any]]:
    jwt = get_jwt_from_credentials(account_data["username"], account_data["password"])
    if not jwt:
        return []
    devices = fetch_devices(jwt) or []
    for device in devices:
        device["account_id"] = account_data["id"]
        device["account_nickname"] = account_data["nickname"]
    return devices


@api_bp.get("/dashboard/devices/stream")
@login_required
def dashboard_devices_stream():
    account_data = _device_accounts()

    @stream_with_context
    def generate():
        if not account_data:
            yield "event: done\ndata: {}\n\n"
            return
        workers = min(10, len(account_data))
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            futures = [executor.submit(_fetch_devices_for_account, account) for account in account_data]
            for future in concurrent.futures.as_completed(futures):
                try:
                    devices = future.result()
                except Exception:
                    logging.exception("Device stream worker failed.")
                    yield "event: error\ndata: {\"error\": \"A device request failed.\"}\n\n"
                    continue
                if devices:
                    yield f"data: {json.dumps(devices)}\n\n"
        yield "event: done\ndata: {}\n\n"

    response = Response(generate(), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache, no-transform"
    response.headers["X-Accel-Buffering"] = "no"
    return response


@api_bp.get("/dashboard/devices")
@login_required
def dashboard_devices():
    """Return devices from every active account without one failure aborting all."""
    account_data = _device_accounts()
    all_devices: list[dict[str, Any]] = []
    if account_data:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(10, len(account_data))) as executor:
            futures = [executor.submit(_fetch_devices_for_account, account) for account in account_data]
            for future in concurrent.futures.as_completed(futures):
                try:
                    devices = future.result()
                    if isinstance(devices, list):
                        all_devices.extend(devices)
                except Exception:
                    logging.exception("Device request failed for one account.")
    return jsonify({"devices": all_devices})


@api_bp.post("/dashboard/devices/remove/<int:account_id>/<string:client_id>")
@login_required
def dashboard_remove_device(account_id: int, client_id: str):
    if not client_id or len(client_id) > 255:
        return _error("Invalid client id.")
    account, failure = _account_from_value(account_id)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, message = remove_device(jwt, client_id)
    return (jsonify({"message": message}), 200) if success else _error(message, 502)


@api_bp.get("/accounts")
@login_required
def accounts_list():
    return jsonify(
        [
            {
                "id": account.id,
                "username": account.username,
                "nickname": account.nickname,
                "is_active": account.is_active,
                "created_at": _as_utc_iso(account.created_at),
            }
            for account in Account.query.order_by(Account.created_at.asc()).all()
        ]
    )


@api_bp.post("/accounts/add")
@login_required
def accounts_add():
    payload, failure = _json_payload()
    if failure:
        return failure
    username, failure = _optional_string(payload.get("username"), "username", maximum=100, required=True)
    if failure:
        return failure
    # Passwords are opaque credentials: leading/trailing whitespace may be
    # meaningful to the upstream account and must not be silently altered.
    password, failure = _optional_string(
        payload.get("password"), "password", maximum=1024, required=True, strip=False
    )
    if failure:
        return failure
    nickname, failure = _optional_string(payload.get("nickname"), "nickname", maximum=100)
    if failure:
        return failure
    if Account.query.filter_by(username=username).first():
        return _error("Account already exists.", 409)

    jwt = get_jwt_from_credentials(username, password)
    if not jwt:
        return _error("Invalid URnetwork credentials.", 400)
    try:
        encrypted_password = encrypt_credential(password, current_app.config["CREDENTIAL_ENCRYPTION_KEY"])
    except CredentialEncryptionError:
        logging.exception("Credential encryption setup is invalid.")
        return _error("Credential encryption is not configured correctly.", 500)

    account = Account(username=username, password=encrypted_password, nickname=nickname)
    db.session.add(account)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("Account already exists.", 409)
    return jsonify({"message": "Account added successfully.", "id": account.id}), 201


@api_bp.post("/accounts/toggle/<int:account_id>")
@login_required
def accounts_toggle(account_id: int):
    account, failure = _account_from_value(account_id)
    if failure:
        return failure
    account.is_active = not account.is_active
    db.session.commit()
    return jsonify({"message": "Account status updated.", "is_active": account.is_active})


@api_bp.post("/accounts/remove/<int:account_id>")
@login_required
def accounts_remove(account_id: int):
    account, failure = _account_from_value(account_id)
    if failure:
        return failure
    Stats.query.filter_by(account_id=account.id).delete(synchronize_session=False)
    db.session.delete(account)
    db.session.commit()
    return jsonify({"message": "Account and its local statistics were removed."})


# ---------------------------------------------------------------------------
# Webhooks, private dashboard preferences and diagnostics
# ---------------------------------------------------------------------------

def _webhook_values(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, tuple[Response, int] | None]:
    url, failure = _optional_string(payload.get("url"), "url", maximum=2048, required=True)
    if failure:
        return None, failure
    valid, message = validate_webhook_url(url, current_app.config["WEBHOOK_ALLOWED_HOSTS"])
    if not valid:
        return None, _error(message)
    payload_valid, payload_message, clean_payload = validate_custom_payload(payload.get("payload"))
    if not payload_valid:
        return None, _error(payload_message)

    values: dict[str, Any] = {"url": url, "payload": clean_payload}
    for key, default in (("on_payment", True), ("on_change", False), ("on_summary", True)):
        value = payload.get(key, default)
        value, failure = _boolean(value, key)
        if failure:
            return None, failure
        values[key] = value
    interval = payload.get("summary_interval", "1h")
    if not isinstance(interval, str) or interval not in VALID_SUMMARY_INTERVALS:
        return None, _error("summary_interval must be one of 30m, 1h, 12h, or 1d.")
    if not any(values[key] for key in ("on_payment", "on_change", "on_summary")):
        return None, _error("Select at least one webhook event.")
    values["summary_interval"] = interval
    return values, None


@api_bp.get("/webhooks")
@login_required
def webhooks_list():
    return jsonify(
        [
            {
                "id": webhook.id,
                "display_url": redact_webhook_url(webhook.url),
                "payload": webhook.payload,
                "on_payment": webhook.on_payment,
                "on_change": webhook.on_change,
                "on_summary": webhook.on_summary,
                "summary_interval": webhook.summary_interval,
                "last_summary_at": _as_utc_iso(webhook.last_summary_at),
                "last_delivery_at": _as_utc_iso(webhook.last_delivery_at),
                "last_delivery_error": webhook.last_delivery_error,
            }
            for webhook in Webhook.query.order_by(Webhook.id.desc()).all()
        ]
    )


@api_bp.post("/webhooks/add")
@login_required
def webhooks_add():
    payload, failure = _json_payload()
    if failure:
        return failure
    values, failure = _webhook_values(payload)
    if failure:
        return failure
    if Webhook.query.filter_by(url=values["url"]).first():
        return _error("Webhook already exists.", 409)
    webhook = Webhook(**values)
    db.session.add(webhook)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("Webhook already exists.", 409)
    return jsonify({"message": "Webhook added successfully.", "id": webhook.id}), 201


@api_bp.post("/webhooks/update/<int:webhook_id>")
@login_required
def webhooks_update(webhook_id: int):
    payload, failure = _json_payload()
    if failure:
        return failure
    webhook = db.session.get(Webhook, webhook_id)
    if not webhook:
        return _error("Webhook was not found.", 404)
    # The UI currently exposes deletion/testing; this endpoint remains safe for
    # API users and future editing UI.
    merged_payload = {
        "url": payload.get("url", webhook.url),
        "payload": payload.get("payload", webhook.payload),
        "on_payment": payload.get("on_payment", webhook.on_payment),
        "on_change": payload.get("on_change", webhook.on_change),
        "on_summary": payload.get("on_summary", webhook.on_summary),
        "summary_interval": payload.get("summary_interval", webhook.summary_interval),
    }
    values, failure = _webhook_values(merged_payload)
    if failure:
        return failure
    for key, value in values.items():
        setattr(webhook, key, value)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("Webhook already exists.", 409)
    return jsonify({"message": "Webhook updated successfully."})


@api_bp.post("/webhooks/test/<int:webhook_id>")
@login_required
def webhooks_test(webhook_id: int):
    webhook = db.session.get(Webhook, webhook_id)
    if not webhook:
        return _error("Webhook was not found.", 404)
    delivered, message = deliver_webhook(
        webhook,
        {"content": "✅ URnetwork Stats Dashboard webhook test was delivered successfully."},
        allowed_hosts=current_app.config["WEBHOOK_ALLOWED_HOSTS"],
    )
    db.session.commit()
    if not delivered:
        return _error(message or "Webhook delivery failed.", 502)
    return jsonify({"message": "Test webhook delivered."})


@api_bp.post("/webhooks/remove/<int:webhook_id>")
@login_required
def webhooks_remove(webhook_id: int):
    webhook = db.session.get(Webhook, webhook_id)
    if not webhook:
        return _error("Webhook was not found.", 404)
    db.session.delete(webhook)
    db.session.commit()
    return jsonify({"message": "Webhook removed."})


@api_bp.get("/settings/privacy")
@login_required
def privacy_settings():
    return jsonify(
        {
            "public_dashboard_enabled": get_boolean_setting(
                "public_dashboard_enabled", current_app.config["PUBLIC_DASHBOARD_DEFAULT"]
            ),
            "public_dashboard_show_financials": get_boolean_setting(
                "public_dashboard_show_financials",
                current_app.config["PUBLIC_DASHBOARD_FINANCIALS_DEFAULT"],
            ),
            "auto_remove_offline_devices": current_app.config["AUTO_REMOVE_OFFLINE_DEVICES"],
            "stats_retention_days": current_app.config["STATS_RETENTION_DAYS"],
            "provider_stats_retention_days": current_app.config["PROVIDER_STATS_RETENTION_DAYS"],
        }
    )


@api_bp.post("/settings/privacy")
@login_required
def update_privacy_settings():
    payload, failure = _json_payload()
    if failure:
        return failure
    values: dict[str, bool] = {}
    for key in ("public_dashboard_enabled", "public_dashboard_show_financials"):
        if key in payload:
            value, failure = _boolean(payload[key], key)
            if failure:
                return failure
            values[key] = value
    if not values:
        return _error("No supported setting was supplied.")
    for key, value in values.items():
        set_setting(key, value)
    db.session.commit()
    clear_api_cache()
    return privacy_settings()


@api_bp.get("/settings/health")
@login_required
def health_settings():
    return jsonify(
        {
            "scheduler_enabled": current_app.config["SCHEDULER_ENABLED"],
            "latest_account_snapshot": _as_utc_iso(db.session.query(db.func.max(Stats.timestamp)).scalar()),
            "latest_provider_snapshot": _as_utc_iso(db.session.query(db.func.max(ProviderCount.timestamp)).scalar()),
            "active_accounts": Account.query.filter_by(is_active=True).count(),
        }
    )


# ---------------------------------------------------------------------------
# Auth codes, payouts, wallets, preferences and network controls
# ---------------------------------------------------------------------------

@api_bp.post("/dashboard/generate-auth-code")
@login_required
def dashboard_generate_auth_code():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    try:
        uses = int(payload.get("uses", 1))
        duration = float(payload.get("duration_minutes", 5))
    except (TypeError, ValueError):
        return _error("uses and duration_minutes must be numeric.")
    if not 1 <= uses <= 10 or not 1 <= duration <= 60:
        return _error("uses must be 1–10 and duration_minutes must be 1–60.")
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    code, error = generate_auth_code(jwt, uses=uses, duration_minutes=duration)
    if code:
        return jsonify({"auth_code": code})
    return _error(error or "Failed to generate auth code.", 502)


@api_bp.get("/account/payments")
@login_required
def get_payouts():
    account, failure = _account_from_query()
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    return jsonify({"account_payments": fetch_payment_stats(jwt) or []})


@api_bp.get("/dashboard/wallet/balance")
@login_required
def get_wallet_balance():
    account, failure = _account_from_query()
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    return jsonify(fetch_wallet_balance(jwt) or {})


@api_bp.post("/dashboard/wallet/validate")
@login_required
def dashboard_validate_address():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    address, failure = _optional_string(payload.get("address"), "address", maximum=256, required=True)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    valid, message = validate_wallet_address(jwt, address)
    return jsonify({"valid": valid, "message": message})


@api_bp.post("/dashboard/wallet/circle/init")
@login_required
def dashboard_circle_init():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = init_circle_wallet(jwt)
    return jsonify(result) if success else _error(str(result), 502)


@api_bp.post("/dashboard/wallet/circle/transfer")
@login_required
def dashboard_circle_transfer():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    address, failure = _optional_string(payload.get("address"), "address", maximum=256, required=True)
    if failure:
        return failure
    if payload.get("confirmed") is not True:
        return _error("Set confirmed to true after reviewing this irreversible transfer.")
    try:
        amount = Decimal(str(payload.get("amount_usdc")))
    except (InvalidOperation, TypeError, ValueError):
        return _error("amount_usdc must be a positive decimal amount.")
    if not amount.is_finite() or amount <= 0 or amount > Decimal("1000000"):
        return _error("amount_usdc must be between 0 and 1,000,000.")
    if amount.as_tuple().exponent < -9:
        return _error("amount_usdc may contain at most 9 decimal places.")
    nano_cents = int(amount * Decimal("1000000000"))
    if nano_cents <= 0:
        return _error("amount_usdc is too small.")
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    valid, validation_message = validate_wallet_address(jwt, address)
    if not valid:
        return _error(validation_message or "Recipient address is invalid.")
    success, result = transfer_out_circle(jwt, address, nano_cents)
    return jsonify(result) if success else _error(str(result), 502)


@api_bp.get("/dashboard/payout-wallet")
@login_required
def get_payout_wallet_id():
    account, failure = _account_from_query()
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    return jsonify({"wallet_id": fetch_payout_wallet(jwt)})


@api_bp.post("/dashboard/payout-wallet/set")
@login_required
def dashboard_set_payout_wallet():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    wallet_id, failure = _optional_string(payload.get("wallet_id"), "wallet_id", maximum=255, required=True)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = set_payout_wallet(jwt, wallet_id)
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.post("/dashboard/wallets/add")
@login_required
def dashboard_add_wallet():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    blockchain, failure = _optional_string(payload.get("blockchain"), "blockchain", maximum=20, required=True)
    if failure:
        return failure
    if blockchain not in {"SOL", "MATIC"}:
        return _error("blockchain must be SOL or MATIC.")
    address, failure = _optional_string(payload.get("address"), "address", maximum=256, required=True)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    valid, message = validate_wallet_address(jwt, address)
    if not valid:
        return _error(message or "Wallet address is invalid.")
    success, result = add_account_wallet(jwt, blockchain, address)
    return jsonify({"wallet_id": result}) if success else _error(str(result), 502)


@api_bp.get("/preferences")
@login_required
def get_prefs():
    account, failure = _account_from_query()
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    return jsonify(fetch_preferences(jwt) or {})


@api_bp.post("/preferences/set")
@login_required
def save_prefs():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    updates, failure = _boolean(payload.get("product_updates"), "product_updates")
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = set_preferences(jwt, updates)
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.post("/feedback/send")
@login_required
def dashboard_send_feedback():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    text_value, failure = _optional_string(payload.get("text", ""), "text", maximum=2000)
    if failure:
        return failure
    try:
        stars = int(payload.get("star_count", 5))
    except (TypeError, ValueError):
        return _error("star_count must be an integer from 1 to 5.")
    if not 1 <= stars <= 5:
        return _error("star_count must be an integer from 1 to 5.")
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = send_feedback(jwt, stars, text_value or "")
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.get("/hello")
@login_required
def get_hello():
    # Kept for backwards compatibility with authenticated clients. The UI no
    # longer invokes this server-side proxy because an IP lookup should be a
    # deliberate user choice and unauthenticated callers must not turn it into
    # an upstream request relay.
    return jsonify(fetch_hello())


@api_bp.get("/dashboard/devices/stats")
@login_required
def get_provider_stats():
    account, failure = _account_from_query()
    if failure:
        return failure
    client_id, failure = _optional_string(request.args.get("client_id"), "client_id", maximum=255, required=True)
    if failure:
        return failure
    last_n = request.args.get("last_n", 24, type=int)
    if last_n is None or not 1 <= last_n <= 720:
        return _error("last_n must be between 1 and 720.")
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    return jsonify(fetch_provider_stats(jwt, client_id, last_n) or {})


@api_bp.post("/dashboard/subscription/redeem")
@login_required
def dashboard_redeem_code():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    secret, failure = _optional_string(payload.get("secret"), "secret", maximum=500, required=True)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = redeem_balance_code(jwt, secret)
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.get("/dashboard/devices/associations")
@login_required
def get_associations():
    account, failure = _account_from_query()
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    return jsonify(fetch_associations(jwt) or {})


@api_bp.post("/dashboard/devices/set-name")
@login_required
def dashboard_set_device_name():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    device_id, failure = _optional_string(payload.get("device_id"), "device_id", maximum=255, required=True)
    if failure:
        return failure
    name, failure = _optional_string(payload.get("name"), "name", maximum=100, required=True)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = set_device_name(jwt, device_id, name)
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.get("/dashboard/network/locations/blocked")
@login_required
def get_blocked_locations():
    account, failure = _account_from_query()
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    return jsonify({"blocked_locations": fetch_blocked_locations(jwt) or []})


def _location_action(action):
    @wraps(action)
    def wrapped():
        payload, failure = _json_payload()
        if failure:
            return failure
        account, failure = _account_from_payload(payload)
        if failure:
            return failure
        location_id, failure = _optional_string(payload.get("location_id"), "location_id", maximum=255, required=True)
        if failure:
            return failure
        jwt = authenticate_account(account)
        if not jwt:
            return _error("Failed to authenticate account.", 502)
        success, result = action(jwt, location_id)
        return jsonify({"message": result}) if success else _error(str(result), 502)

    return wrapped


@api_bp.post("/dashboard/network/locations/block")
@login_required
@_location_action
def dashboard_block_location(jwt: str, location_id: str):
    return block_location(jwt, location_id)


@api_bp.post("/dashboard/network/locations/unblock")
@login_required
@_location_action
def dashboard_unblock_location(jwt: str, location_id: str):
    return unblock_location(jwt, location_id)


@api_bp.post("/dashboard/devices/set-provide")
@login_required
def dashboard_set_provide():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    client_id, failure = _optional_string(payload.get("client_id"), "client_id", maximum=255, required=True)
    if failure:
        return failure
    try:
        provide_mode = int(payload.get("provide_mode"))
    except (TypeError, ValueError):
        return _error("provide_mode must be an integer.")
    if provide_mode not in {-1, 0, 1, 2, 3, 4}:
        return _error("provide_mode is invalid.")
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = set_device_provide_mode(jwt, client_id, provide_mode)
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.post("/dashboard/network/visibility")
@login_required
def dashboard_set_visibility():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    is_public, failure = _boolean(payload.get("is_public"), "is_public")
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = set_ranking_visibility(jwt, is_public)
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.post("/dashboard/network/set-referral")
@login_required
def dashboard_set_referral():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    referral_code, failure = _optional_string(payload.get("referral_code"), "referral_code", maximum=100, required=True)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = set_referral_network(jwt, referral_code)
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.post("/dashboard/network/unlink-referral")
@login_required
def dashboard_unlink_referral():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = unlink_referral_network(jwt)
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.get("/dashboard/api-keys")
@login_required
def get_api_keys():
    account, failure = _account_from_query()
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    return jsonify({"api_keys": fetch_api_keys(jwt) or []})


@api_bp.post("/dashboard/api-keys/add")
@login_required
def add_api_key():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    name, failure = _optional_string(payload.get("name"), "name", maximum=100, required=True)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = create_api_key(jwt, name)
    return jsonify(result) if success else _error(str(result), 502)


@api_bp.post("/dashboard/api-keys/remove")
@login_required
def delete_api_key():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    key_id, failure = _optional_string(payload.get("key_id"), "key_id", maximum=255, required=True)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = remove_api_key(jwt, key_id)
    return jsonify({"message": result}) if success else _error(str(result), 502)


@api_bp.get("/dashboard/wallets")
@login_required
def get_wallets():
    account, failure = _account_from_query()
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    return jsonify({"wallets": fetch_wallets(jwt) or []})


@api_bp.post("/dashboard/wallets/remove")
@login_required
def delete_wallet():
    payload, failure = _json_payload()
    if failure:
        return failure
    account, failure = _account_from_payload(payload)
    if failure:
        return failure
    wallet_id, failure = _optional_string(payload.get("wallet_id"), "wallet_id", maximum=255, required=True)
    if failure:
        return failure
    jwt = authenticate_account(account)
    if not jwt:
        return _error("Failed to authenticate account.", 502)
    success, result = remove_wallet(jwt, wallet_id)
    return jsonify({"message": result}) if success else _error(str(result), 502)


# ---------------------------------------------------------------------------
# Public provider tracking
# ---------------------------------------------------------------------------

# Kept intentionally explicit so regional groupings do not depend on a remote
# service. Countries not listed are reported as "Other" rather than guessed.
REGIONS_DICT = {
    "us": "North America", "ca": "North America", "mx": "North America",
    "gb": "Europe", "de": "Europe", "fr": "Europe", "es": "Europe", "fi": "Europe",
    "nl": "Europe", "se": "Europe", "no": "Europe", "dk": "Europe", "it": "Europe",
    "pl": "Europe", "cz": "Europe", "at": "Europe", "ch": "Europe", "be": "Europe",
    "ie": "Europe", "pt": "Europe", "ru": "Europe", "ua": "Europe", "ro": "Europe",
    "bg": "Europe", "hu": "Europe", "lt": "Europe", "lv": "Europe", "sk": "Europe",
    "hr": "Europe", "rs": "Europe", "md": "Europe", "by": "Europe", "is": "Europe",
    "lu": "Europe", "mt": "Europe", "si": "Europe", "cy": "Europe", "gr": "Europe",
    "mk": "Europe", "al": "Europe", "ba": "Europe", "am": "Europe", "ge": "Europe",
    "kz": "Europe", "az": "Europe", "xk": "Europe", "ee": "Europe", "li": "Europe",
    "mc": "Europe", "ad": "Europe", "tr": "Europe",
    "vn": "Asia-Pacific", "sg": "Asia-Pacific", "hk": "Asia-Pacific", "kr": "Asia-Pacific",
    "in": "Asia-Pacific", "jp": "Asia-Pacific", "th": "Asia-Pacific", "my": "Asia-Pacific",
    "id": "Asia-Pacific", "ph": "Asia-Pacific", "cn": "Asia-Pacific", "tw": "Asia-Pacific",
    "bd": "Asia-Pacific", "kh": "Asia-Pacific", "mn": "Asia-Pacific", "mm": "Asia-Pacific",
    "la": "Asia-Pacific", "nz": "Asia-Pacific", "au": "Asia-Pacific", "lk": "Asia-Pacific",
    "np": "Asia-Pacific", "uz": "Asia-Pacific", "tj": "Asia-Pacific", "kg": "Asia-Pacific",
    "pk": "Asia-Pacific", "ir": "Middle East", "ae": "Middle East", "sa": "Middle East",
    "il": "Middle East", "jo": "Middle East", "qa": "Middle East", "kw": "Middle East",
    "iq": "Middle East", "sy": "Middle East", "lb": "Middle East", "ps": "Middle East",
    "bh": "Middle East", "om": "Middle East", "br": "South America", "ar": "South America",
    "co": "South America", "cl": "South America", "pe": "South America", "uy": "South America",
    "py": "South America", "ec": "South America", "bo": "South America", "ve": "South America",
    "cr": "Central America & Caribbean", "pa": "Central America & Caribbean", "hn": "Central America & Caribbean",
    "gt": "Central America & Caribbean", "jm": "Central America & Caribbean", "do": "Central America & Caribbean",
    "pr": "Central America & Caribbean", "ky": "Central America & Caribbean", "bs": "Central America & Caribbean",
    "vi": "Central America & Caribbean", "bq": "Central America & Caribbean", "tt": "Central America & Caribbean",
    "gd": "Central America & Caribbean", "ng": "Africa", "ma": "Africa", "ke": "Africa",
    "za": "Africa", "sn": "Africa", "tz": "Africa", "ug": "Africa", "mz": "Africa",
    "gh": "Africa", "cd": "Africa", "et": "Africa", "ga": "Africa", "ci": "Africa",
    "tn": "Africa", "eg": "Africa", "ly": "Africa", "dz": "Africa", "mu": "Africa", "bw": "Africa",
}


def _latest_provider_timestamp() -> str | None:
    return db.session.execute(text("SELECT MAX(timestamp) FROM provider_counts")).scalar()


def _nearest_provider_timestamp(target: dt.datetime) -> str | None:
    return db.session.execute(
        text("SELECT MAX(timestamp) FROM provider_counts WHERE timestamp <= :target"),
        {"target": _snapshot_timestamp(target)},
    ).scalar()


def _provider_total(timestamp: str | None) -> int:
    if not timestamp:
        return 0
    return int(
        db.session.execute(
            text("SELECT COALESCE(SUM(provider_count), 0) FROM provider_counts WHERE timestamp = :timestamp"),
            {"timestamp": timestamp},
        ).scalar()
        or 0
    )


def _provider_snapshot(timestamp: str | None) -> dict[str, dict[str, Any]]:
    if not timestamp:
        return {}
    rows = db.session.execute(
        text(
            "SELECT country_code, country_name, provider_count "
            "FROM provider_counts WHERE timestamp = :timestamp"
        ),
        {"timestamp": timestamp},
    ).mappings()
    return {
        row["country_code"].lower(): {
            "code": row["country_code"].lower(),
            "name": row["country_name"],
            "current": int(row["provider_count"]),
        }
        for row in rows
    }


def _parse_snapshot(value: str) -> dt.datetime:
    """Parse legacy and current snapshot timestamps as UTC consistently."""
    parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.UTC)
    return parsed.astimezone(dt.UTC)


def _build_detailed_movers() -> dict[str, list[dict[str, Any]]]:
    latest = _latest_provider_timestamp()
    if not latest:
        return {"gainers": [], "losers": []}
    latest_dt = _parse_snapshot(latest)
    current = _provider_snapshot(latest)
    windows = {
        "15m": 15, "1h": 60, "2h": 120, "3h": 180, "6h": 360, "12h": 720,
        "24h": 1440, "2d": 2880, "3d": 4320, "4d": 5760, "5d": 7200, "6d": 8640, "7d": 10080,
    }
    past_by_window: dict[str, dict[str, dict[str, Any]]] = {}
    for label, minutes in windows.items():
        timestamp = _nearest_provider_timestamp(latest_dt - dt.timedelta(minutes=minutes))
        past_by_window[label] = _provider_snapshot(timestamp)

    # Include countries that disappeared from the latest API response as zero;
    # this makes the movers and at-risk panels work whether or not the source
    # API emits explicit zero-count country rows.
    countries = set(current)
    for snapshot in past_by_window.values():
        countries.update(snapshot)

    rows: list[dict[str, Any]] = []
    for code in countries:
        latest_row = current.get(code)
        fallback = next((snapshot[code] for snapshot in past_by_window.values() if code in snapshot), None)
        if not latest_row and not fallback:
            continue
        row = {
            "code": code,
            "name": (latest_row or fallback)["name"],
            "current": (latest_row or {}).get("current", 0),
            "deltas": {},
        }
        for label, snapshot in past_by_window.items():
            # Treat unavailable history as no change, not as an artificial gain.
            past = snapshot.get(code)
            row["deltas"][label] = row["current"] - past["current"] if past else 0
        rows.append(row)

    gainers = sorted(rows, key=lambda row: (row["deltas"]["24h"], row["current"]), reverse=True)[:50]
    losers = sorted(rows, key=lambda row: (row["deltas"]["24h"], -row["current"]))[:50]
    return {"gainers": gainers, "losers": losers}


@api_bp.get("/provider/summary")
@cached_api(ttl_seconds=300)
def provider_summary():
    latest = _latest_provider_timestamp()
    if not latest:
        return {"timestamp": None, "total": 0, "hour_delta": 0, "day_delta": 0, "top_10": []}
    latest_dt = _parse_snapshot(latest)
    total = _provider_total(latest)
    hour_timestamp = _nearest_provider_timestamp(latest_dt - dt.timedelta(hours=1))
    day_timestamp = _nearest_provider_timestamp(latest_dt - dt.timedelta(days=1))
    hour_total = _provider_total(hour_timestamp)
    day_total = _provider_total(day_timestamp)
    rows = db.session.execute(
        text(
            "SELECT country_name, country_code, provider_count FROM provider_counts "
            "WHERE timestamp = :timestamp ORDER BY provider_count DESC LIMIT 10"
        ),
        {"timestamp": latest},
    ).mappings()
    return {
        "timestamp": _as_utc_iso(latest),
        "total": total,
        "hour_delta": total - hour_total if hour_timestamp else 0,
        "day_delta": total - day_total if day_timestamp else 0,
        "top_10": [dict(row) for row in rows],
    }


@api_bp.get("/provider/network_total")
@cached_api(ttl_seconds=300)
def provider_network_total():
    points = request.args.get("points", 2160, type=int)
    if points is None:
        points = 2160
    points = max(24, min(points, min(10_000, 24 * current_app.config["PROVIDER_STATS_RETENTION_DAYS"])))
    rows = db.session.execute(
        text(
            "SELECT timestamp, SUM(provider_count) AS total FROM provider_counts "
            "GROUP BY timestamp ORDER BY timestamp DESC LIMIT :points"
        ),
        {"points": points},
    ).mappings()
    data = [{"timestamp": _as_utc_iso(row["timestamp"]), "total": int(row["total"])} for row in rows]
    data.reverse()
    for index, row in enumerate(data):
        start = max(0, index - 23)
        row["ma"] = round(sum(item["total"] for item in data[start : index + 1]) / (index - start + 1), 2)
    return data


@api_bp.get("/provider/movers")
@cached_api(ttl_seconds=300)
def provider_movers():
    detailed = _build_detailed_movers()
    return {
        "1h": {
            "gainers": sorted(detailed["gainers"], key=lambda row: row["deltas"]["1h"], reverse=True)[:10],
            "losers": sorted(detailed["losers"], key=lambda row: row["deltas"]["1h"])[:10],
        },
        "24h": {
            "gainers": detailed["gainers"][:10],
            "losers": detailed["losers"][:10],
        },
    }


@api_bp.get("/provider/movers-detailed")
@cached_api(ttl_seconds=300)
def provider_movers_detailed():
    return _build_detailed_movers()


@api_bp.get("/provider/anomalies")
@cached_api(ttl_seconds=300)
def provider_anomalies():
    threshold_pct = request.args.get("threshold", 15, type=float)
    if threshold_pct is None or not 0 < threshold_pct <= 1000:
        return {"anomalies": [], "threshold": None, "error": "threshold must be between 0 and 1000."}
    latest = _latest_provider_timestamp()
    if not latest:
        return {"anomalies": [], "threshold": threshold_pct}
    current = _provider_snapshot(latest)
    past = _provider_snapshot(_nearest_provider_timestamp(_parse_snapshot(latest) - dt.timedelta(hours=1)))
    anomalies = []
    for code, row in current.items():
        prior = past.get(code)
        if not prior or prior["current"] <= 0:
            continue
        delta = row["current"] - prior["current"]
        pct_change = delta / prior["current"] * 100
        if abs(pct_change) > threshold_pct:
            anomalies.append(
                {
                    "country_name": row["name"],
                    "country_code": code,
                    "provider_count": row["current"],
                    "delta": delta,
                    "pct_change": round(pct_change, 3),
                }
            )
    anomalies.sort(key=lambda row: abs(row["pct_change"]), reverse=True)
    return {"anomalies": anomalies, "threshold": threshold_pct}


@api_bp.get("/provider/growth-projection")
@cached_api(ttl_seconds=300)
def provider_growth_projection():
    latest = _latest_provider_timestamp()
    if not latest:
        return {"current": 0, "daily_growth": 0, "growth_rate": 0, "projected_30d": 0, "projected_90d": 0}
    current = _provider_total(latest)
    previous_timestamp = _nearest_provider_timestamp(_parse_snapshot(latest) - dt.timedelta(days=1))
    previous = _provider_total(previous_timestamp)
    if previous_timestamp is None:
        daily_growth = 0
        growth_rate = 0.0
    else:
        daily_growth = current - previous
        growth_rate = daily_growth / previous * 100 if previous > 0 else 0.0
    # Cap extrapolation, not the source metric, so a one-off API outage cannot
    # produce absurd forecasts while operators still see the real daily delta.
    projected_daily_growth = max(-1000, min(1000, daily_growth))
    return {
        "current": current,
        "daily_growth": daily_growth,
        "growth_rate": round(growth_rate, 3),
        "projected_30d": max(0, int(current + projected_daily_growth * 30)),
        "projected_90d": max(0, int(current + projected_daily_growth * 90)),
        "comparison_timestamp": _as_utc_iso(previous_timestamp),
    }


@api_bp.get("/provider/country-stats/<code>")
def provider_country_stats(code: str):
    if not _valid_country_code(code):
        return _error("country code must be a two-letter ISO code.")
    rows = db.session.execute(
        text(
            "SELECT timestamp, provider_count FROM provider_counts "
            "WHERE country_code = :code ORDER BY timestamp DESC LIMIT 24"
        ),
        {"code": code.lower()},
    ).mappings().all()
    rows.reverse()
    if len(rows) < 2:
        return jsonify({"volatility": "N/A", "churn_rate": 0, "sample_count": len(rows)})
    changes = [abs(int(rows[index + 1]["provider_count"]) - int(rows[index]["provider_count"])) for index in range(len(rows) - 1)]
    average = sum(changes) / len(changes)
    volatility = "high" if average > 100 else "medium" if average > 50 else "low"
    return jsonify({"volatility": volatility, "churn_rate": round(average, 1), "sample_count": len(rows)})


@api_bp.get("/provider/country/<code>")
@cached_api(ttl_seconds=300)
def provider_country(code: str):
    if not _valid_country_code(code):
        return []
    points = request.args.get("points", 720, type=int)
    if points is None:
        points = 720
    points = max(2, min(points, min(10_000, 24 * current_app.config["PROVIDER_STATS_RETENTION_DAYS"])))
    rows = db.session.execute(
        text(
            "SELECT timestamp, provider_count FROM provider_counts "
            "WHERE country_code = :code ORDER BY timestamp DESC LIMIT :points"
        ),
        {"code": code.lower(), "points": points},
    ).mappings().all()
    return [
        {"timestamp": _as_utc_iso(row["timestamp"]), "count": int(row["provider_count"])}
        for row in reversed(rows)
    ]


@api_bp.get("/provider/countries")
@cached_api(ttl_seconds=300)
def provider_countries():
    latest = _latest_provider_timestamp()
    if not latest:
        return []
    rows = db.session.execute(
        text(
            "SELECT country_code, country_name, provider_count FROM provider_counts "
            "WHERE timestamp = :timestamp ORDER BY country_name"
        ),
        {"timestamp": latest},
    ).mappings()
    return [
        {"code": row["country_code"].lower(), "name": row["country_name"], "count": int(row["provider_count"])}
        for row in rows
    ]


@api_bp.get("/provider/regions")
@cached_api(ttl_seconds=300)
def provider_regions():
    latest = _latest_provider_timestamp()
    if not latest:
        return []
    current = _provider_snapshot(latest)
    previous = _provider_snapshot(_nearest_provider_timestamp(_parse_snapshot(latest) - dt.timedelta(days=1)))
    regions: dict[str, dict[str, int]] = {}
    for code, row in current.items():
        region = REGIONS_DICT.get(code, "Other")
        bucket = regions.setdefault(region, {"total": 0, "previous": 0})
        bucket["total"] += row["current"]
        bucket["previous"] += previous.get(code, row)["current"]
    return sorted(
        [
            {"region": region, "total": values["total"], "delta_24h": values["total"] - values["previous"]}
            for region, values in regions.items()
        ],
        key=lambda item: item["total"],
        reverse=True,
    )


@api_bp.get("/provider/at-risk")
@cached_api(ttl_seconds=300)
def provider_at_risk():
    latest = _latest_provider_timestamp()
    if not latest:
        return {"disappeared": [], "near_zero": []}
    current = _provider_snapshot(latest)
    previous = _provider_snapshot(_nearest_provider_timestamp(_parse_snapshot(latest) - dt.timedelta(days=1)))
    disappeared = [
        {
            "country_code": code,
            "country_name": past["name"],
            "prev_count": past["current"],
            "last_seen_ts": _as_utc_iso(_nearest_provider_timestamp(_parse_snapshot(latest) - dt.timedelta(days=1))),
        }
        for code, past in previous.items()
        if past["current"] > 0 and current.get(code, {}).get("current", 0) == 0
    ]
    near_zero = []
    for code, row in current.items():
        previous_count = previous.get(code, row)["current"]
        delta = row["current"] - previous_count
        if 1 <= row["current"] <= 5 and delta < 0:
            near_zero.append(
                {
                    "country_name": row["name"],
                    "country_code": code,
                    "provider_count": row["current"],
                    "delta_24h": delta,
                }
            )
    return {
        "disappeared": sorted(disappeared, key=lambda item: item["prev_count"], reverse=True),
        "near_zero": sorted(near_zero, key=lambda item: item["provider_count"]),
    }
