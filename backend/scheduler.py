import datetime
import logging
import json
import requests
from string import Template
from flask_apscheduler import APScheduler
from backend.models import db, Account, Stats, Webhook, ProviderCount
from backend.ur_api import get_jwt_from_credentials, fetch_transfer_stats, fetch_provider_locations, fetch_devices, remove_device

scheduler = APScheduler()

def format_bytes(bytes_count):
    """Formats bytes into KB/MB/GB/TB for display using decimal units (matching UrNetwork API)."""
    if bytes_count < 1e6:
        return f"{bytes_count / 1e3:.2f} KB"
    elif bytes_count < 1e9:
        return f"{bytes_count / 1e6:.2f} MB"
    elif bytes_count >= 1e12:
        return f"{bytes_count / 1e12:.2f} TB"
    return f"{bytes_count / 1e9:.3f} GB"

def get_traffic_delta(account_id, minutes):
    """Calculates the traffic shared by an account in the last X minutes."""
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(minutes=minutes)
    # Find the stats record closest to the cutoff but not newer than now
    old_stat = Stats.query.filter(
        Stats.account_id == account_id,
        Stats.timestamp <= cutoff
    ).order_by(Stats.timestamp.desc()).first()
    
    if not old_stat:
        # If no old stat found, we might be just starting, or the database was cleared.
        # Fallback to the oldest available stat within a reasonable range
        old_stat = Stats.query.filter(
            Stats.account_id == account_id
        ).order_by(Stats.timestamp.asc()).first()
        
    if not old_stat:
        return 0, 0
        
    # Get current (latest) stat
    latest_stat = Stats.query.filter(
        Stats.account_id == account_id
    ).order_by(Stats.timestamp.desc()).first()
    
    if not latest_stat or latest_stat.id == old_stat.id:
        return 0, 0
        
    paid_delta = max(0, latest_stat.paid_bytes - old_stat.paid_bytes)
    unpaid_delta = max(0, latest_stat.unpaid_bytes - old_stat.unpaid_bytes)
    return paid_delta, unpaid_delta

def send_webhook_notification(app, account, current_stats, prev_stats=None):
    """Sends notifications to webhooks based on event triggers."""
    with app.app_context():
        webhooks = Webhook.query.all()
        if not webhooks:
            return

        now = datetime.datetime.utcnow()
        paid_diff = current_stats.paid_bytes - (prev_stats.paid_bytes if prev_stats else current_stats.paid_bytes)
        unpaid_diff = current_stats.unpaid_bytes - (prev_stats.unpaid_bytes if prev_stats else current_stats.unpaid_bytes)
        total_diff = paid_diff + unpaid_diff

        for webhook in webhooks:
            trigger_event = None
            color = 5814783  # Default blue
            
            # 1. Check for Payment (paid_bytes increased)
            if webhook.on_payment and paid_diff > 0:
                trigger_event = "💰 Payment Received"
                color = 3066993  # Green
            
            # 2. Check for Wallet Change (any increase >= 1 MB to prevent spam)
            elif webhook.on_change and total_diff >= 1e6:
                trigger_event = "🔄 Wallet Balance Updated"
                color = 3447003  # Blue
            
            # 3. Check for Periodic Summary (if 15 min have passed or similar)
            # We'll handle summaries in a separate logic or if specifically requested.
            # For now, if no event triggered, we skip this webhook if it's not a summary time.
            
            if not trigger_event:
                continue

            try:
                # Calculate summaries for the webhook
                s30m_p, s30m_u = get_traffic_delta(account.id, 30)
                s1h_p, s1h_u = get_traffic_delta(account.id, 60)
                s12h_p, s12h_u = get_traffic_delta(account.id, 12 * 60)
                s1d_p, s1d_u = get_traffic_delta(account.id, 24 * 60)

                default_payload = {
                    "embeds": [{
                        "title": f"{trigger_event} - {account.nickname or account.username}",
                        "color": color,
                        "fields": [
                            {"name": "Account", "value": account.nickname or account.username, "inline": False},
                            {"name": "Current Total", "value": format_bytes(current_stats.paid_bytes + current_stats.unpaid_bytes), "inline": True},
                            {"name": "Recent Change", "value": f"+{format_bytes(total_diff)}", "inline": True},
                            {"name": "Traffic Shared (Summaries)", "value": (
                                f"**Last 30m:** {format_bytes(s30m_p + s30m_u)}\n"
                                f"**Last 1h:** {format_bytes(s1h_p + s1h_u)}\n"
                                f"**Last 12h:** {format_bytes(s12h_p + s12h_u)}\n"
                                f"**Last 24h:** {format_bytes(s1d_p + s1d_u)}"
                            ), "inline": False}
                        ],
                        "footer": {"text": "UrNetwork Stats Dashboard"},
                        "timestamp": now.isoformat() + "Z"
                    }]
                }
                
                payload = default_payload
                if webhook.payload and webhook.payload.strip():
                    try:
                        tmpl = Template(webhook.payload)
                        rendered = tmpl.safe_substitute({
                            "account": account.nickname or account.username,
                            "paid_gb": f"{(current_stats.paid_bytes / 1e9):.3f}",
                            "unpaid_gb": f"{(current_stats.unpaid_bytes / 1e9):.3f}",
                            "total_gb": f"{((current_stats.paid_bytes + current_stats.unpaid_bytes) / 1e9):.3f}",
                            "update_time": now.strftime("%Y-%m-%d %H:%M:%S UTC")
                        })
                        payload = json.loads(rendered)
                    except Exception as e:
                        logging.error(f"Failed to parse custom JSON payload: {e}")

                requests.post(webhook.url, json=payload, timeout=10)
                logging.info(f"Sent {trigger_event} notification to {webhook.url}")
            except Exception as e:
                logging.error(f"Failed to send webhook to {webhook.url}: {e}")

def init_scheduler(app):
    scheduler.init_app(app)

    @scheduler.task(id="log_stats_job", trigger="cron", minute="0,15,30,45")
    def log_stats_job():
        """Scheduled job to fetch and store stats every 15 minutes."""
        with app.app_context():
            accounts = Account.query.filter_by(is_active=True).all()
            for account in accounts:
                try:
                    jwt = get_jwt_from_credentials(account.username, account.password)
                    if not jwt: continue
                    
                    data = fetch_transfer_stats(jwt)
                    if not data: continue

                    prev_stats = Stats.query.filter_by(account_id=account.id).order_by(Stats.timestamp.desc()).first()
                    
                    new_stats = Stats(
                        account_id=account.id,
                        paid_bytes=data["paid_bytes"],
                        paid_gb=data["paid_gb"],
                        unpaid_bytes=data["unpaid_bytes"],
                        unpaid_gb=data["unpaid_gb"]
                    )
                    db.session.add(new_stats)
                    db.session.commit()
                    
                    send_webhook_notification(app, account, new_stats, prev_stats)
                    
                except Exception as e:
                    logging.error(f"Error in log_stats_job for {account.username}: {e}")

    @scheduler.task(id="periodic_summary_job", trigger="cron", minute="0,15,30,45")
    def periodic_summary_job():
        """Sends periodic summaries to webhooks that have on_summary=True."""
        with app.app_context():
            webhooks = Webhook.query.filter_by(on_summary=True).all()
            if not webhooks: return
            
            now = datetime.datetime.utcnow()
            accounts = Account.query.filter_by(is_active=True).all()
            
            for webhook in webhooks:
                # Direct clock-aligned trigger checks
                should_trigger = False
                current_minute = now.minute
                current_hour = now.hour
                
                # Determine interval in minutes for fallback
                interval_map = {"30m": 30, "1h": 60, "12h": 12 * 60, "1d": 24 * 60}
                minutes = interval_map.get(webhook.summary_interval, 60)
                
                if webhook.summary_interval == "30m":
                    if current_minute in (0, 30):
                        should_trigger = True
                elif webhook.summary_interval == "1h":
                    if current_minute == 0:
                        should_trigger = True
                elif webhook.summary_interval == "12h":
                    if current_hour in (0, 12) and current_minute == 0:
                        should_trigger = True
                elif webhook.summary_interval == "1d":
                    if current_hour == 0 and current_minute == 0:
                        should_trigger = True
                else:
                    # Fallback to time delta if custom or not matched
                    last_sent = webhook.last_summary_at or (now - datetime.timedelta(days=1))
                    if (now - last_sent).total_seconds() / 60 >= (minutes - 2):
                        should_trigger = True
                
                if not should_trigger:
                    continue

                logging.info(f"Triggering periodic summary ({webhook.summary_interval}) for webhook ID {webhook.id}")

                for account in accounts:
                    s30m_p, s30m_u = get_traffic_delta(account.id, 30)
                    s1h_p, s1h_u = get_traffic_delta(account.id, 60)
                    s12h_p, s12h_u = get_traffic_delta(account.id, 12 * 60)
                    s1d_p, s1d_u = get_traffic_delta(account.id, 24 * 60)
                    
                    interval_totals = {
                        "30m": s30m_p + s30m_u,
                        "1h": s1h_p + s1h_u,
                        "12h": s12h_p + s12h_u,
                        "1d": s1d_p + s1d_u
                    }
                    if interval_totals.get(webhook.summary_interval, 0) == 0:
                        continue
                        
                    latest = Stats.query.filter_by(account_id=account.id).order_by(Stats.timestamp.desc()).first()
                    if not latest: continue

                    default_payload = {
                        "embeds": [{
                            "title": f"📊 Traffic Summary - {account.nickname or account.username}",
                            "color": 9124843, # Purple
                            "fields": [
                                {"name": "Total Shared", "value": format_bytes(latest.paid_bytes + latest.unpaid_bytes), "inline": True},
                                {"name": "Summary Windows", "value": (
                                    f"**Last 30m:** {format_bytes(s30m_p + s30m_u)}\n"
                                    f"**Last 1h:** {format_bytes(s1h_p + s1h_u)}\n"
                                    f"**Last 12h:** {format_bytes(s12h_p + s12h_u)}\n"
                                    f"**Last 24h:** {format_bytes(s1d_p + s1d_u)}"
                                ), "inline": False}
                            ],
                            "footer": {"text": f"Interval: {webhook.summary_interval}"},
                            "timestamp": now.isoformat() + "Z"
                        }]
                    }
                    
                    payload = default_payload
                    if webhook.payload and webhook.payload.strip():
                        try:
                            tmpl = Template(webhook.payload)
                            rendered = tmpl.safe_substitute({
                                "account": account.nickname or account.username,
                                "paid_gb": f"{(latest.paid_bytes / 1e9):.3f}",
                                "unpaid_gb": f"{(latest.unpaid_bytes / 1e9):.3f}",
                                "total_gb": f"{((latest.paid_bytes + latest.unpaid_bytes) / 1e9):.3f}",
                                "update_time": now.strftime("%Y-%m-%d %H:%M:%S UTC")
                            })
                            payload = json.loads(rendered)
                        except Exception as e:
                            logging.error(f"Failed to parse custom JSON payload: {e}")
                    try:
                        requests.post(webhook.url, json=payload, timeout=10)
                    except: pass
                
                webhook.last_summary_at = now
                db.session.commit()

    @scheduler.task(id="cleanup_old_stats_job", trigger="cron", hour="3", minute="0")
    def cleanup_old_stats_job():
        """Scheduled job to delete stats data older than 7 days, and provider data older than 90 days, runs daily at 3 AM."""
        with app.app_context():
            logging.info("Running daily stats cleanup job...")
            try:
                cutoff_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
                num_rows_deleted = db.session.query(Stats).filter(Stats.timestamp < cutoff_date).delete(synchronize_session=False)
                db.session.commit()

                if num_rows_deleted > 0:
                    logging.info(f"Successfully deleted {num_rows_deleted} stats records older than 7 days.")
                else:
                    logging.info("No old stats records found to delete.")

                # Cleanup provider counts older than 90 days
                cutoff_provider_str = (datetime.datetime.utcnow() - datetime.timedelta(days=90)).strftime("%Y-%m-%d %H:%M:%S")
                num_providers_deleted = db.session.query(ProviderCount).filter(ProviderCount.timestamp < cutoff_provider_str).delete(synchronize_session=False)
                db.session.commit()
                if num_providers_deleted > 0:
                    logging.info(f"Successfully deleted {num_providers_deleted} provider counts older than 90 days.")
            except Exception as e:
                logging.error(f"Scheduled job 'cleanup_old_stats_job' failed: {e}")
                db.session.rollback()

    @scheduler.task(id="poll_providers_job", trigger="cron", minute="2")
    def poll_providers_job():
        """Scheduled job to fetch provider counts by country hourly."""
        with app.app_context():
            logging.info("Running provider counts polling job...")
            try:
                jwt = None
                account = Account.query.filter_by(is_active=True).first()
                if account:
                    jwt = get_jwt_from_credentials(account.username, account.password)

                data = fetch_provider_locations(jwt)
                if not data:
                    logging.error("Failed to fetch provider locations in scheduler job.")
                    return

                timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                for location in data.get("locations", []):
                    provider_count = ProviderCount(
                        timestamp=timestamp,
                        country_code=location["country_code"].lower(),
                        country_name=location["name"],
                        provider_count=location["provider_count"]
                    )
                    db.session.merge(provider_count)
                db.session.commit()
                logging.info(f"Successfully polled and saved provider counts at {timestamp}")
            except Exception as e:
                logging.error(f"Error in poll_providers_job: {e}")
                db.session.rollback()

    @scheduler.task(id="cleanup_offline_devices_job", trigger="interval", hours=6)
    def cleanup_offline_devices_job():
        """Removes devices that have been offline for more than 7 days."""
        import os
        import time
        
        filepath = os.path.join(app.instance_path, 'devices_last_seen.json')
        last_seen = {}
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r') as f:
                    last_seen = json.load(f)
            except Exception:
                pass
                
        now = time.time()
        week_seconds = 7 * 24 * 3600
        
        with app.app_context():
            accounts = Account.query.filter_by(is_active=True).all()
            for account in accounts:
                try:
                    jwt = get_jwt_from_credentials(account.username, account.password)
                    if not jwt: continue
                    devices = fetch_devices(jwt)
                    for d in devices:
                        client_id = d.get('client_id')
                        if not client_id: continue
                        
                        is_online = 'connections' in d and len(d['connections']) > 0
                        if is_online:
                            last_seen[client_id] = now
                        else:
                            if client_id not in last_seen:
                                last_seen[client_id] = now
                            else:
                                if now - last_seen[client_id] > week_seconds:
                                    logging.info(f"Removing device {client_id} (offline > 7 days)")
                                    remove_device(jwt, client_id)
                                    last_seen.pop(client_id, None)
                except Exception as e:
                    logging.error(f"Error in cleanup_offline_devices_job for {account.username}: {e}")
                    
        try:
            with open(filepath, 'w') as f:
                json.dump(last_seen, f)
        except Exception as e:
            logging.error(f"Failed to save devices_last_seen: {e}")

    # Run initial sync for provider counts if the table is empty
    with app.app_context():
        try:
            if db.session.query(ProviderCount).count() == 0:
                logging.info("Provider counts table is empty. Running initial sync on startup...")
                jwt = None
                account = Account.query.filter_by(is_active=True).first()
                if account:
                    jwt = get_jwt_from_credentials(account.username, account.password)
                data = fetch_provider_locations(jwt)
                if data:
                    timestamp = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
                    for location in data.get("locations", []):
                        provider_count = ProviderCount(
                            timestamp=timestamp,
                            country_code=location["country_code"].lower(),
                            country_name=location["name"],
                            provider_count=location["provider_count"]
                        )
                        db.session.merge(provider_count)
                    db.session.commit()
                    logging.info("Initial sync of provider counts completed successfully.")
        except Exception as e:
            logging.error(f"Failed to run initial sync of provider counts: {e}")
            db.session.rollback()

    scheduler.start()
