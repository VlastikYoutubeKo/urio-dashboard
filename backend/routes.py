import os
import secrets
from functools import wraps
from flask import Blueprint, request, jsonify, session, current_app
from dateutil.parser import isoparse
import datetime

from backend.models import db, Account, Stats, Webhook, Setting, get_boolean_setting
from backend.ur_api import (
    get_jwt_from_credentials, fetch_transfer_stats, fetch_payment_stats,
    fetch_account_details, fetch_leaderboard, fetch_devices, remove_device,
    fetch_provider_locations
)

api_bp = Blueprint('api', __name__, url_prefix='/api')

ENV_FILE = ".env"

def is_installed():
    return os.getenv("SECRET_KEY") and os.getenv("SECRET_KEY") != "default-secret-key-for-initial-setup"

def load_env():
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value

def save_env_file(config_data):
    try:
        existing_env = {}
        if os.path.exists(ENV_FILE):
            with open(ENV_FILE, 'r') as f:
                for line in f:
                    if '=' in line and not line.strip().startswith('#'):
                        key, value = line.strip().split('=', 1)
                        existing_env[key] = value
        
        existing_env.update(config_data)
        
        with open(ENV_FILE, "w") as f:
            for key, value in existing_env.items():
                f.write(f"{key}={value}\n")
            if "ENABLE_ACCOUNT_STATS" not in existing_env:
                f.write("\n# Feature Flags\n")
                f.write("ENABLE_ACCOUNT_STATS=True\n")
                f.write("ENABLE_LEADERBOARD=True\n")
                f.write("ENABLE_DEVICE_STATS=True\n")
        load_env()
        return True
    except IOError:
        return False

def get_valid_jwt(account):
    if not account:
        return None
    return get_jwt_from_credentials(account.username, account.password)

def calculate_earnings(payments, unpaid_bytes=0):
    total_earnings = 0
    monthly_earnings = 0
    now = datetime.datetime.now(datetime.timezone.utc)
    one_month_ago = now - datetime.timedelta(days=30)
    sixty_days_ago = now - datetime.timedelta(days=60)
    
    recent_nano_cents = 0
    recent_bytes = 0

    if not payments:
        return 0, 0, 0

    for payment in payments:
        if "payout_nano_cents" in payment:
            amount_usd = (payment.get("payout_nano_cents", 0) + payment.get("subsidy_payout_nano_cents", 0) + payment.get("reliability_subsidy_nano_cents", 0)) / 1e11
            total_earnings += amount_usd
            payment_time_str = payment.get("create_time")
            if payment_time_str:
                try:
                    payment_time = isoparse(payment_time_str)
                    if payment_time > one_month_ago:
                        monthly_earnings += amount_usd
                    if payment_time > sixty_days_ago:
                        recent_nano_cents += (payment.get("payout_nano_cents", 0) + payment.get("subsidy_payout_nano_cents", 0) + payment.get("reliability_subsidy_nano_cents", 0))
                        recent_bytes += payment.get("payout_byte_count", 0)
                except (ValueError, TypeError):
                    pass
        elif payment.get("completed"):
            amount = payment.get("token_amount", 0)
            total_earnings += amount
            payment_time_str = payment.get("payment_time")
            if payment_time_str:
                try:
                    payment_time = isoparse(payment_time_str)
                    if payment_time > one_month_ago:
                        monthly_earnings += amount
                except (ValueError, TypeError):
                    pass

    approx_pending = 0
    if recent_bytes > 0:
        rate = recent_nano_cents / recent_bytes
        approx_pending = (unpaid_bytes * rate) / 1e9

    return total_earnings, monthly_earnings, approx_pending

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated_function


@api_bp.route('/status', methods=['GET'])
def status():
    return jsonify({
        "installed": is_installed(),
        "logged_in": session.get('logged_in', False)
    })

@api_bp.route('/install', methods=['POST'])
def install():
    if is_installed():
        return jsonify({"error": "Already installed"}), 400
    
    data = request.json
    admin_pass = data.get('admin_pass')
    
    if not admin_pass or len(admin_pass) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    config_data = {
        "SECRET_KEY": secrets.token_hex(24),
        "ADMIN_PASSWORD": admin_pass
    }
    
    if save_env_file(config_data):
        db.create_all()
        session['logged_in'] = True
        return jsonify({"message": "Dashboard installed successfully"})
    return jsonify({"error": "Failed to save configuration"}), 500

@api_bp.route('/auth/login', methods=['POST'])
def login():
    if session.get('logged_in'):
        return jsonify({"message": "Already logged in"})
        
    data = request.json
    password = data.get('password')
    admin_password = os.getenv('ADMIN_PASSWORD')

    if password and password == admin_password:
        session['logged_in'] = True
        return jsonify({"message": "Logged in successfully"})
    return jsonify({"error": "Invalid password"}), 401

@api_bp.route('/auth/logout', methods=['POST'])
def logout():
    session.pop('logged_in', None)
    return jsonify({"message": "Logged out successfully"})

@api_bp.route('/public/dashboard', methods=['GET'])
def public_dashboard():
    accounts = Account.query.filter_by(is_active=True).all()
    active_accounts = len(accounts)
    
    combined_paid = 0
    combined_unpaid = 0
    monthly_earnings_total = 0
    account_charts = {}
    
    for account in accounts:
        latest_stat = Stats.query.filter_by(account_id=account.id).order_by(Stats.timestamp.desc()).first()
        if latest_stat:
            combined_paid += latest_stat.paid_gb
            combined_unpaid += latest_stat.unpaid_gb
        
        jwt = get_valid_jwt(account)
        if jwt:
            payments = fetch_payment_stats(jwt)
            _, monthly, _ = calculate_earnings(payments)
            monthly_earnings_total += monthly
        
        entries = Stats.query.filter_by(account_id=account.id).order_by(Stats.timestamp.asc()).all()
        if entries:
            account_name = account.nickname or account.username
            account_charts[account_name] = {
                "labels": [e.timestamp.strftime('%m-%d %H:%M') for e in entries],
                "data": [e.paid_gb + e.unpaid_gb for e in entries]
            }
    
    all_entries = Stats.query.order_by(Stats.timestamp.asc()).all()
    time_grouped = {}
    for entry in all_entries:
        time_key = entry.timestamp.strftime('%m-%d %H:%M')
        if time_key not in time_grouped:
            time_grouped[time_key] = {"paid": 0, "unpaid": 0}
        time_grouped[time_key]["paid"] += entry.paid_gb
        time_grouped[time_key]["unpaid"] += entry.unpaid_gb
    
    chart_data = {
        "labels": list(time_grouped.keys()),
        "data": [time_grouped[k]["paid"] + time_grouped[k]["unpaid"] for k in time_grouped.keys()]
    }

    return jsonify({
        "combined": {
            "paid_gb": combined_paid,
            "unpaid_gb": combined_unpaid
        },
        "active_accounts": active_accounts,
        "monthly_earnings": monthly_earnings_total,
        "chart_data": chart_data,
        "account_charts": account_charts
    })

@api_bp.route('/locations', methods=['GET'])
def locations():
    data = fetch_provider_locations()
    return jsonify(data or {})

@api_bp.route('/dashboard/overview', methods=['GET'])
@login_required
def dashboard_overview():
    accounts = Account.query.filter_by(is_active=True).all()
    
    combined_paid = 0
    combined_unpaid = 0
    total_earnings = 0
    
    for account in accounts:
        latest_stat = Stats.query.filter_by(account_id=account.id).order_by(Stats.timestamp.desc()).first()
        if latest_stat:
            combined_paid += latest_stat.paid_gb
            combined_unpaid += latest_stat.unpaid_gb
        
        jwt = get_valid_jwt(account)
        if jwt:
            payments = fetch_payment_stats(jwt)
            total, _, _ = calculate_earnings(payments)
            total_earnings += total
            
    # Time grouped logic identical to public dashboard for the charts, combined vs individual
    all_entries = Stats.query.order_by(Stats.timestamp.asc()).all()
    time_grouped = {}
    for entry in all_entries:
        time_key = entry.timestamp.strftime('%m-%d %H:%M')
        if time_key not in time_grouped:
            time_grouped[time_key] = {"paid": 0, "unpaid": 0}
        time_grouped[time_key]["paid"] += entry.paid_gb
        time_grouped[time_key]["unpaid"] += entry.unpaid_gb
        
    combined_chart = {
        "labels": list(time_grouped.keys()),
        "paid_gb": [time_grouped[k]["paid"] for k in time_grouped.keys()],
        "unpaid_gb": [time_grouped[k]["unpaid"] for k in time_grouped.keys()]
    }
    
    account_charts = {}
    for account in accounts:
        entries = Stats.query.filter_by(account_id=account.id).order_by(Stats.timestamp.asc()).all()
        if entries:
            account_charts[account.nickname or account.username] = {
                "labels": [e.timestamp.strftime('%m-%d %H:%M') for e in entries],
                "data": [e.paid_gb + e.unpaid_gb for e in entries]
            }
            
    return jsonify({
        "combined": {"paid_gb": combined_paid, "unpaid_gb": combined_unpaid},
        "total_earnings": total_earnings,
        "active_accounts": len(accounts),
        "combined_chart": combined_chart,
        "account_charts": account_charts
    })

@api_bp.route('/dashboard/account', methods=['GET'])
@login_required
def dashboard_account():
    account_id = request.args.get('account_id')
    accounts = Account.query.all()
    accounts_data = [{"id": a.id, "username": a.username, "nickname": a.nickname} for a in accounts]
    
    response = {"accounts": accounts_data}
    
    if account_id and account_id != 'all':
        acc = Account.query.get(account_id)
        if acc:
            jwt = get_valid_jwt(acc)
            if jwt:
                response["account_details"] = fetch_account_details(jwt)
                response["leaderboard"] = fetch_leaderboard(jwt)
                payments = fetch_payment_stats(jwt)
                
                latest_stat = Stats.query.filter_by(account_id=acc.id).order_by(Stats.timestamp.desc()).first()
                unpaid_bytes = latest_stat.unpaid_bytes if latest_stat else 0
                
                total, _, approx_pending = calculate_earnings(payments, unpaid_bytes)
                response["total_earnings"] = total
                response["account_details"]["approximate_payments"] = approx_pending
                
    elif len(accounts) > 0:
        # fetch leaderboard from the first active account if 'all' is selected just to show something
        jwt = get_valid_jwt(accounts[0])
        if jwt:
             response["leaderboard"] = fetch_leaderboard(jwt)
             
    return jsonify(response)

import concurrent.futures

import json

@api_bp.route('/dashboard/devices/stream', methods=['GET'])
@login_required
def dashboard_devices_stream():
    app = current_app._get_current_object()
    def generate():
        with app.app_context():
            accounts = Account.query.all()
            account_data = [{'id': a.id, 'username': a.username, 'password': a.password, 'nickname': a.nickname or a.username} for a in accounts]
            
            def fetch_acc_devices(acc):
                jwt = get_jwt_from_credentials(acc['username'], acc['password'])
                if jwt:
                    devices = fetch_devices(jwt)
                    for d in devices:
                        d['account_id'] = acc['id']
                        d['account_nickname'] = acc['nickname']
                    return devices
                return []

            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                for devices in executor.map(fetch_acc_devices, account_data):
                    if devices:
                        yield f"data: {json.dumps(devices)}\n\n"
            yield "event: done\ndata: {}\n\n"
    
    return current_app.response_class(generate(), mimetype='text/event-stream')

@api_bp.route('/dashboard/devices', methods=['GET'])
@login_required
def dashboard_devices():
    all_devices = []
    accounts = Account.query.all()
    account_data = [{'id': a.id, 'username': a.username, 'password': a.password, 'nickname': a.nickname or a.username} for a in accounts]
    
    def fetch_acc_devices(acc):
        jwt = get_jwt_from_credentials(acc['username'], acc['password'])
        if jwt:
            devices = fetch_devices(jwt)
            for d in devices:
                d['account_id'] = acc['id']
                d['account_nickname'] = acc['nickname']
            return devices
        return []

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        for devices in executor.map(fetch_acc_devices, account_data):
            all_devices.extend(devices)
            
    return jsonify({"devices": all_devices})

@api_bp.route('/dashboard/devices/remove/<int:account_id>/<string:client_id>', methods=['POST'])
@login_required
def dashboard_remove_device(account_id, client_id):
    account = Account.query.get_or_404(account_id)
    jwt = get_valid_jwt(account)
    if not jwt:
        return jsonify({"error": "Failed to authenticate"}), 401
        
    success, msg = remove_device(jwt, client_id)
    if success:
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 400

@api_bp.route('/accounts', methods=['GET'])
@login_required
def accounts_list():
    accounts = Account.query.all()
    return jsonify([{
        "id": a.id,
        "username": a.username,
        "nickname": a.nickname,
        "is_active": a.is_active
    } for a in accounts])

@api_bp.route('/accounts/add', methods=['POST'])
@login_required
def accounts_add():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    nickname = data.get('nickname')
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
        
    if Account.query.filter_by(username=username).first():
        return jsonify({"error": "Account already exists"}), 400
        
    # Verify credentials
    jwt = get_jwt_from_credentials(username, password)
    if not jwt:
        return jsonify({"error": "Invalid UrNetwork credentials"}), 400
        
    new_account = Account(username=username, password=password, nickname=nickname)
    db.session.add(new_account)
    db.session.commit()
    
    return jsonify({"message": "Account added successfully", "id": new_account.id})

@api_bp.route('/accounts/toggle/<int:account_id>', methods=['POST'])
@login_required
def accounts_toggle(account_id):
    account = Account.query.get_or_404(account_id)
    account.is_active = not account.is_active
    db.session.commit()
    return jsonify({"message": "Account toggled", "is_active": account.is_active})

@api_bp.route('/accounts/remove/<int:account_id>', methods=['POST'])
@login_required
def accounts_remove(account_id):
    account = Account.query.get_or_404(account_id)
    Stats.query.filter_by(account_id=account.id).delete()
    db.session.delete(account)
    db.session.commit()
    return jsonify({"message": "Account removed"})

@api_bp.route('/webhooks', methods=['GET'])
@login_required
def webhooks_list():
    webhooks = Webhook.query.all()
    return jsonify([{
        "id": w.id,
        "url": w.url,
        "payload": w.payload
    } for w in webhooks])

@api_bp.route('/webhooks/add', methods=['POST'])
@login_required
def webhooks_add():
    data = request.json
    url = data.get('url')
    payload = data.get('payload')
    
    if not url:
        return jsonify({"error": "URL required"}), 400
        
    if Webhook.query.filter_by(url=url).first():
        return jsonify({"error": "Webhook already exists"}), 400
        
    webhook = Webhook(url=url, payload=payload)
    db.session.add(webhook)
    db.session.commit()
    
    return jsonify({"message": "Webhook added successfully"})

@api_bp.route('/webhooks/remove/<int:webhook_id>', methods=['POST'])
@login_required
def webhooks_remove(webhook_id):
    webhook = Webhook.query.get_or_404(webhook_id)
    db.session.delete(webhook)
    db.session.commit()
    return jsonify({"message": "Webhook removed"})

from backend.ur_api import (
    fetch_api_keys, create_api_key, remove_api_key, fetch_wallets, remove_wallet, 
    set_device_provide_mode, set_ranking_visibility, set_referral_network, 
    unlink_referral_network, fetch_blocked_locations, block_location, 
    unblock_location, set_device_name, fetch_associations, redeem_balance_code, 
    fetch_provider_stats, fetch_preferences, set_preferences, send_feedback, 
    fetch_90_day_stats, fetch_hello, fetch_wallet_balance, validate_wallet_address,
    init_circle_wallet, transfer_out_circle, fetch_payout_wallet, set_payout_wallet,
    add_account_wallet, fetch_payment_stats
)

@api_bp.route('/account/payments', methods=['GET'])
@login_required
def get_payouts():
    account_id = request.args.get('account_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    return jsonify({"account_payments": fetch_payment_stats(jwt) if jwt else []})

@api_bp.route('/dashboard/wallet/balance', methods=['GET'])
@login_required
def get_wallet_balance():
    account_id = request.args.get('account_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    return jsonify(fetch_wallet_balance(jwt) if jwt else {})

@api_bp.route('/dashboard/wallet/validate', methods=['POST'])
@login_required
def dashboard_validate_address():
    data = request.json
    account_id = data.get('account_id')
    address = data.get('address')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    valid, msg = validate_wallet_address(jwt, address)
    return jsonify({"valid": valid, "message": msg})

@api_bp.route('/dashboard/wallet/circle/init', methods=['POST'])
@login_required
def dashboard_circle_init():
    data = request.json
    account_id = data.get('account_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = init_circle_wallet(jwt)
    if success: return jsonify(res)
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/wallet/circle/transfer', methods=['POST'])
@login_required
def dashboard_circle_transfer():
    data = request.json
    account_id = data.get('account_id')
    address = data.get('address')
    amount = data.get('amount') # in nano cents
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = transfer_out_circle(jwt, address, amount)
    if success: return jsonify(res)
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/payout-wallet', methods=['GET'])
@login_required
def get_payout_wallet_id():
    account_id = request.args.get('account_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    return jsonify({"wallet_id": fetch_payout_wallet(jwt) if jwt else None})

@api_bp.route('/dashboard/payout-wallet/set', methods=['POST'])
@login_required
def dashboard_set_payout_wallet():
    data = request.json
    account_id = data.get('account_id')
    wallet_id = data.get('wallet_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = set_payout_wallet(jwt, wallet_id)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/wallets/add', methods=['POST'])
@login_required
def dashboard_add_wallet():
    data = request.json
    account_id = data.get('account_id')
    blockchain = data.get('blockchain')
    address = data.get('address')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = add_account_wallet(jwt, blockchain, address)
    if success: return jsonify({"wallet_id": res})
    return jsonify({"error": res}), 400

@api_bp.route('/preferences', methods=['GET'])
@login_required
def get_prefs():
    account_id = request.args.get('account_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    return jsonify(fetch_preferences(jwt) if jwt else {})

@api_bp.route('/preferences/set', methods=['POST'])
@login_required
def save_prefs():
    data = request.json
    account_id = data.get('account_id')
    product_updates = data.get('product_updates')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = set_preferences(jwt, product_updates)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/feedback/send', methods=['POST'])
@login_required
def dashboard_send_feedback():
    data = request.json
    account_id = data.get('account_id')
    stars = data.get('star_count', 5)
    text = data.get('text', '')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = send_feedback(jwt, stars, text)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/stats/last-90', methods=['GET'])
def get_90_day_stats():
    return jsonify(fetch_90_day_stats())

@api_bp.route('/hello', methods=['GET'])
def get_hello():
    return jsonify(fetch_hello())

@api_bp.route('/dashboard/devices/stats', methods=['GET'])
@login_required
def get_provider_stats():
    account_id = request.args.get('account_id')
    client_id = request.args.get('client_id')
    last_n = request.args.get('last_n', 24, type=int)
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    return jsonify(fetch_provider_stats(jwt, client_id, last_n) if jwt else {})

@api_bp.route('/dashboard/subscription/redeem', methods=['POST'])
@login_required
def dashboard_redeem_code():
    data = request.json
    account_id = data.get('account_id')
    secret = data.get('secret')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = redeem_balance_code(jwt, secret)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/devices/associations', methods=['GET'])
@login_required
def get_associations():
    account_id = request.args.get('account_id')
    if not account_id: return jsonify({"error": "account_id required"}), 400
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    return jsonify(fetch_associations(jwt) if jwt else {})

@api_bp.route('/dashboard/devices/set-name', methods=['POST'])
@login_required
def dashboard_set_device_name():
    data = request.json
    account_id = data.get('account_id')
    device_id = data.get('device_id')
    name = data.get('name')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = set_device_name(jwt, device_id, name)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/network/locations/blocked', methods=['GET'])
@login_required
def get_blocked_locations():
    account_id = request.args.get('account_id')
    if not account_id: return jsonify({"error": "account_id required"}), 400
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    return jsonify({"blocked_locations": fetch_blocked_locations(jwt) if jwt else []})

@api_bp.route('/dashboard/network/locations/block', methods=['POST'])
@login_required
def dashboard_block_location():
    data = request.json
    account_id = data.get('account_id')
    location_id = data.get('location_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = block_location(jwt, location_id)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/network/locations/unblock', methods=['POST'])
@login_required
def dashboard_unblock_location():
    data = request.json
    account_id = data.get('account_id')
    location_id = data.get('location_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = unblock_location(jwt, location_id)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/devices/set-provide', methods=['POST'])
@login_required
def dashboard_set_provide():
    data = request.json
    account_id = data.get('account_id')
    client_id = data.get('client_id')
    provide_mode = data.get('provide_mode')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = set_device_provide_mode(jwt, client_id, provide_mode)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/network/visibility', methods=['POST'])
@login_required
def dashboard_set_visibility():
    data = request.json
    account_id = data.get('account_id')
    is_public = data.get('is_public')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = set_ranking_visibility(jwt, is_public)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/network/set-referral', methods=['POST'])
@login_required
def dashboard_set_referral():
    data = request.json
    account_id = data.get('account_id')
    referral_code = data.get('referral_code')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = set_referral_network(jwt, referral_code)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/network/unlink-referral', methods=['POST'])
@login_required
def dashboard_unlink_referral():
    data = request.json
    account_id = data.get('account_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = unlink_referral_network(jwt)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/api-keys', methods=['GET'])
@login_required
def get_api_keys():
    account_id = request.args.get('account_id')
    if not account_id: return jsonify({"error": "account_id required"}), 400
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    return jsonify({"api_keys": fetch_api_keys(jwt) if jwt else []})

@api_bp.route('/dashboard/api-keys/add', methods=['POST'])
@login_required
def add_api_key():
    data = request.json
    account_id = data.get('account_id')
    name = data.get('name')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = create_api_key(jwt, name)
    if success: return jsonify(res)
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/api-keys/remove', methods=['POST'])
@login_required
def delete_api_key():
    data = request.json
    account_id = data.get('account_id')
    key_id = data.get('key_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = remove_api_key(jwt, key_id)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

@api_bp.route('/dashboard/wallets', methods=['GET'])
@login_required
def get_wallets():
    account_id = request.args.get('account_id')
    if not account_id: return jsonify({"error": "account_id required"}), 400
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    return jsonify({"wallets": fetch_wallets(jwt) if jwt else []})

@api_bp.route('/dashboard/wallets/remove', methods=['POST'])
@login_required
def delete_wallet():
    data = request.json
    account_id = data.get('account_id')
    wallet_id = data.get('wallet_id')
    account = Account.query.get(account_id)
    jwt = get_valid_jwt(account)
    if not jwt: return jsonify({"error": "Auth failed"}), 401
    success, res = remove_wallet(jwt, wallet_id)
    if success: return jsonify({"message": res})
    return jsonify({"error": res}), 400

