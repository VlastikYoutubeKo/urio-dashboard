import time
import logging
import requests
from cachetools import cached, TTLCache

UR_API_BASE = "https://api.bringyour.com"

# Caches
locations_cache = TTLCache(maxsize=1, ttl=300)
stats_cache = TTLCache(maxsize=100, ttl=120)
payments_cache = TTLCache(maxsize=100, ttl=120)
details_cache = TTLCache(maxsize=100, ttl=120)
leaderboard_cache = TTLCache(maxsize=100, ttl=120)
devices_cache = TTLCache(maxsize=100, ttl=120)
jwt_cache = TTLCache(maxsize=100, ttl=3600)

def request_with_retry(method, url, retries=2, backoff=1, timeout=45, **kwargs):
    """Issue an HTTP request with retries. Returns response on 4xx to allow error parsing."""
    last_exc = None
    headers = kwargs.get('headers', {}).copy()
    if 'Connection' not in headers:
        headers['Connection'] = 'close'
    kwargs['headers'] = headers

    for attempt in range(1, retries + 1):
        try:
            resp = requests.request(method, url, timeout=timeout, **kwargs)
            if 400 <= resp.status_code < 500:
                return resp
            resp.raise_for_status()
            return resp
        except (requests.exceptions.RequestException, Exception) as e:
            last_exc = e
            logging.warning(f"[{method.upper()} {url}] attempt {attempt}/{retries} failed: {e}")
            if attempt < retries:
                time.sleep(backoff)
    logging.error(f"All {retries} attempts to {method.upper()} {url} failed: {last_exc}")
    return None

@cached(cache=jwt_cache)
def get_jwt_from_credentials(user, password):
    """Fetch a new JWT token using username and password."""
    try:
        resp = request_with_retry(
            "post",
            f"{UR_API_BASE}/auth/login-with-password",
            headers={"Content-Type": "application/json"},
            json={"user_auth": user, "password": password},
        )
        if not resp or resp.status_code != 200:
            raise RuntimeError("API request failed.")
        data = resp.json()
        token = data.get("network", {}).get("by_jwt")
        if not token:
            err = data.get("message") or data.get("error") or str(data)
            raise RuntimeError(f"Login failed: {err}")
        return token
    except Exception as e:
        logging.error(f"Could not get JWT from credentials: {e}")
        return None

@cached(cache=stats_cache)
def fetch_transfer_stats(jwt_token):
    if not jwt_token: return None
    resp = request_with_retry("get", f"{UR_API_BASE}/transfer/stats", headers={"Authorization": f"Bearer {jwt_token}"})
    if not resp or resp.status_code != 200: return None
    data = resp.json()
    paid = data.get("paid_bytes_provided", 0)
    unpaid = data.get("unpaid_bytes_provided", 0)
    return {
        "paid_bytes": paid, "paid_gb": paid / 1e9,
        "unpaid_bytes": unpaid, "unpaid_gb": unpaid / 1e9
    }

@cached(cache=payments_cache)
def fetch_payment_stats(jwt_token):
    if not jwt_token: return []
    resp = request_with_retry("get", f"{UR_API_BASE}/account/payments", headers={"Authorization": f"Bearer {jwt_token}"})
    if not resp or resp.status_code != 200: return []
    return resp.json().get("account_payments", [])

@cached(cache=details_cache)
def fetch_account_details(jwt_token):
    if not jwt_token: return {}
    headers = {"Authorization": f"Bearer {jwt_token}"}
    details = {}

    points_resp = request_with_retry("get", f"{UR_API_BASE}/account/points", headers=headers)
    if points_resp and points_resp.status_code == 200:
        details['points'] = sum(p.get('point_value', 0) for p in points_resp.json().get("network_points", []))

    referral_resp = request_with_retry("get", f"{UR_API_BASE}/account/referral-code", headers=headers)
    if referral_resp and referral_resp.status_code == 200:
        details['referrals'] = referral_resp.json()

    ref_net_resp = request_with_retry("get", f"{UR_API_BASE}/account/referral-network", headers=headers)
    if ref_net_resp and ref_net_resp.status_code == 200:
        details['referral_network'] = ref_net_resp.json().get('network', {})

    ranking_resp = request_with_retry("get", f"{UR_API_BASE}/network/ranking", headers=headers)
    if ranking_resp and ranking_resp.status_code == 200:
        details['ranking'] = ranking_resp.json().get('network_ranking', {})

    sub_resp = request_with_retry("get", f"{UR_API_BASE}/subscription/balance", headers=headers)
    if sub_resp and sub_resp.status_code == 200:
        sub_data = sub_resp.json()
        pending_nano = sub_data.get("pending_payout_usd_nano_cents", 0)
        details['approximate_payments'] = pending_nano / 1e9
        details['subscription'] = sub_data

    rel_resp = request_with_retry("get", f"{UR_API_BASE}/network/reliability", headers=headers)
    if rel_resp and rel_resp.status_code == 200:
        details['reliability'] = rel_resp.json().get('reliability_window', {})

    return details

@cached(cache=leaderboard_cache)
def fetch_leaderboard(jwt_token):
    if not jwt_token: return []
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/stats/leaderboard", headers=headers, json={})
    if not resp or resp.status_code != 200: return []
    return resp.json().get("earners", [])

@cached(cache=devices_cache)
def fetch_devices(jwt_token):
    if not jwt_token: return []
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("get", f"{UR_API_BASE}/network/clients", headers=headers)
    if not resp or resp.status_code != 200: return []
    devices = resp.json().get("clients", [])
    provide_mode_map = {-1: "Default", 0: "None", 1: "Network", 2: "Friends & Family", 3: "Public", 4: "Stream"}
    for device in devices:
        device['provide_mode_str'] = provide_mode_map.get(device.get('provide_mode'), 'Unknown')
    return devices

def remove_device(jwt_token, client_id):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/network/remove-client", headers=headers, json={"client_id": client_id})
    if resp and resp.status_code == 200:
        return True, "Removed"
    return False, "Failed"

@cached(cache=locations_cache)
def fetch_provider_locations(jwt_token=None):
    headers = {}
    if jwt_token:
        headers["Authorization"] = f"Bearer {jwt_token}"
    resp = request_with_retry("get", f"{UR_API_BASE}/network/provider-locations", headers=headers)
    if not resp or resp.status_code != 200: return None
    return resp.json()


def fetch_api_keys(jwt_token):
    if not jwt_token: return []
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("get", f"{UR_API_BASE}/account/api-keys", headers=headers)
    if not resp or resp.status_code != 200: return []
    return resp.json().get("api_keys") or []

def create_api_key(jwt_token, name):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/account/api-key", headers=headers, json={"name": name})
    if resp and resp.status_code == 200:
        return True, resp.json()
    return False, "Failed"

def remove_api_key(jwt_token, key_id):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/account/api-key/remove", headers=headers, json={"id": key_id})
    if resp and resp.status_code == 200:
        return True, "Removed"
    return False, "Failed"

def fetch_wallets(jwt_token):
    if not jwt_token: return []
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("get", f"{UR_API_BASE}/account/wallets", headers=headers)
    if not resp or resp.status_code != 200: return []
    return resp.json().get("wallets") or []

def remove_wallet(jwt_token, wallet_id):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/account/wallets/remove", headers=headers, json={"wallet_id": wallet_id})
    if resp and resp.status_code == 200:
        return True, "Removed"
    return False, "Failed"

def fetch_wallet_balance(jwt_token):
    if not jwt_token: return None
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("get", f"{UR_API_BASE}/wallet/balance", headers=headers)
    if not resp or resp.status_code != 200: return None
    return resp.json().get("wallet_info")

def validate_wallet_address(jwt_token, address):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/wallet/validate-address", headers=headers, json={"address": address})
    if resp and resp.status_code == 200:
        return resp.json().get("valid", False), "Success"
    return False, "Failed"

def init_circle_wallet(jwt_token):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/wallet/circle-init", headers=headers)
    if resp and resp.status_code == 200:
        return True, resp.json()
    return False, "Failed"

def transfer_out_circle(jwt_token, to_address, amount_nano_cents):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    payload = {"to_address": to_address, "amount_usdc_nano_cents": amount_nano_cents, "terms": True}
    resp = request_with_retry("post", f"{UR_API_BASE}/wallet/circle-transfer-out", headers=headers, json=payload)
    if resp and resp.status_code == 200:
        return True, resp.json()
    return False, "Failed"

def fetch_payout_wallet(jwt_token):
    if not jwt_token: return None
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("get", f"{UR_API_BASE}/account/payout-wallet", headers=headers)
    if not resp or resp.status_code != 200: return None
    return resp.json().get("wallet_id")

def set_payout_wallet(jwt_token, wallet_id):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/account/payout-wallet", headers=headers, json={"wallet_id": wallet_id})
    if resp and resp.status_code == 200:
        return True, "Success"
    return False, "Failed"

def add_account_wallet(jwt_token, blockchain, address):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    payload = {"blockchain": blockchain, "wallet_address": address, "default_token_type": "USDC"}
    resp = request_with_retry("post", f"{UR_API_BASE}/account/wallet", headers=headers, json=payload)
    if resp and resp.status_code == 200:
        return True, resp.json().get("wallet_id")
    return False, "Failed"

def set_device_provide_mode(jwt_token, client_id, provide_mode):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    payload = {"client_id": client_id, "provide_mode": provide_mode}
    resp = request_with_retry("post", f"{UR_API_BASE}/device/set-provide", headers=headers, json=payload)
    if resp and resp.status_code == 200:
        return True, "Success"
    return False, "Failed"

def set_ranking_visibility(jwt_token, is_public):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/network/ranking-visibility", headers=headers, json={"is_public": is_public})
    if resp and resp.status_code == 200: return True, "Success"
    return False, "Failed"

def set_referral_network(jwt_token, referral_code):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/account/set-referral", headers=headers, json={"referral_code": referral_code})
    if resp and resp.status_code == 200: return True, "Success"
    return False, "Failed"

def unlink_referral_network(jwt_token):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("get", f"{UR_API_BASE}/account/unlink-referral-network", headers=headers)
    if resp and resp.status_code == 200: return True, "Success"
    return False, "Failed"

def fetch_blocked_locations(jwt_token):
    if not jwt_token: return []
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("get", f"{UR_API_BASE}/network/blocked-locations", headers=headers)
    if not resp or resp.status_code != 200: return []
    return resp.json().get("blocked_locations") or []

def block_location(jwt_token, location_id):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/network/block-location", headers=headers, json={"location_id": location_id})
    if resp and resp.status_code == 200: return True, "Success"
    return False, "Failed"

def unblock_location(jwt_token, location_id):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/network/unblock-location", headers=headers, json={"location_id": location_id})
    if resp and resp.status_code == 200: return True, "Success"
    return False, "Failed"

def set_device_name(jwt_token, device_id, name):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/device/set-name", headers=headers, json={"device_id": device_id, "device_name": name})
    if resp and resp.status_code == 200: return True, "Success"
    return False, "Failed"

def fetch_associations(jwt_token):
    if not jwt_token: return {}
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("get", f"{UR_API_BASE}/device/associations", headers=headers)
    if not resp or resp.status_code != 200: return {}
    return resp.json()

def redeem_balance_code(jwt_token, secret):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/subscription/redeem-balance-code", headers=headers, json={"secret": secret})
    if resp and resp.status_code == 200: return True, "Success"
    return False, "Failed"

def fetch_provider_stats(jwt_token, client_id, last_n=24):
    if not jwt_token: return {}
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/stats/provider-last-n", headers=headers, json={"client_id": client_id, "last_n": last_n})
    if not resp or resp.status_code != 200: return {}
    return resp.json()

def fetch_preferences(jwt_token):
    if not jwt_token: return {}
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("get", f"{UR_API_BASE}/preferences", headers=headers)
    if not resp or resp.status_code != 200: return {}
    return resp.json()

def set_preferences(jwt_token, product_updates):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    resp = request_with_retry("post", f"{UR_API_BASE}/preferences/set-preferences", headers=headers, json={"product_updates": product_updates})
    if resp and resp.status_code == 200: return True, "Success"
    return False, "Failed"

def send_feedback(jwt_token, star_count, text):
    if not jwt_token: return False, "Auth error"
    headers = {"Authorization": f"Bearer {jwt_token}"}
    payload = {"star_count": star_count, "needs": {"other": text}}
    resp = request_with_retry("post", f"{UR_API_BASE}/feedback/send-feedback", headers=headers, json=payload)
    if resp and resp.status_code == 200: return True, "Success"
    return False, "Failed"

def fetch_hello():
    resp = request_with_retry("get", f"{UR_API_BASE}/hello")
    return resp.json() if resp and resp.status_code == 200 else {}

def fetch_90_day_stats():
    resp = request_with_retry("get", f"{UR_API_BASE}/stats/last-90")
    return resp.json() if resp and resp.status_code == 200 else {}
