import datetime
import logging
import json
import requests
from string import Template
from flask_apscheduler import APScheduler
from backend.models import db, Account, Stats, Webhook
from backend.ur_api import get_jwt_from_credentials, fetch_transfer_stats

scheduler = APScheduler()

def send_webhook_notification(app, stats_data, account_nickname=None):
    """Sends a notification to all configured webhooks."""
    with app.app_context():
        webhooks = Webhook.query.all()
        if not webhooks:
            return

        for webhook in webhooks:
            payload_to_send = None
            try:
                if webhook.payload:
                    template = Template(webhook.payload)
                    payload_str = template.safe_substitute(
                        account=account_nickname or "Unknown",
                        paid_gb=f"{stats_data['paid_gb']:.3f}",
                        unpaid_gb=f"{stats_data['unpaid_gb']:.3f}",
                        total_gb=f"{(stats_data['paid_gb'] + stats_data['unpaid_gb']):.3f}",
                        update_time=datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                    )
                    payload_to_send = json.loads(payload_str)
                else:
                    payload_to_send = {
                        "embeds": [{
                            "title": f"UrNetwork Stats Update - {account_nickname or 'Account'}",
                            "description": "New data has been synced from the UrNetwork API.",
                            "color": 5814783,
                            "fields": [
                                {"name": "Account", "value": account_nickname or "Unknown", "inline": False},
                                {"name": "Total Paid Data", "value": f"{stats_data['paid_gb']:.3f} GB", "inline": True},
                                {"name": "Total Unpaid Data", "value": f"{stats_data['unpaid_gb']:.3f} GB", "inline": True},
                                {"name": "Total Data Provided", "value": f"{(stats_data['paid_gb'] + stats_data['unpaid_gb']):.3f} GB", "inline": True},
                            ],
                            "footer": {"text": f"Update Time: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"}
                        }]
                    }

                requests.post(webhook.url, json=payload_to_send, timeout=10)
                logging.info(f"Sent webhook notification to {webhook.url}")
            except (json.JSONDecodeError, TypeError) as e:
                logging.error(f"Failed to parse or substitute custom payload for webhook {webhook.url}: {e}")
            except requests.exceptions.RequestException as e:
                logging.error(f"Failed to send webhook to {webhook.url}: {e}")


def init_scheduler(app):
    scheduler.init_app(app)

    @scheduler.task(id="log_stats_job", trigger="cron", minute="0,15,30,45")
    def log_stats_job():
        """Scheduled job to fetch and store stats every 15 minutes for all active accounts."""
        with app.app_context():
            logging.info("Running scheduled stats fetch for all accounts...")
            accounts = Account.query.filter_by(is_active=True).all()
            
            for account in accounts:
                try:
                    jwt = get_jwt_from_credentials(account.username, account.password)
                    if not jwt:
                        logging.warning(f"Could not authenticate account {account.username}")
                        continue
                        
                    stats_data = fetch_transfer_stats(jwt)
                    if not stats_data:
                        logging.warning(f"Could not fetch stats for account {account.username}")
                        continue

                    entry = Stats(
                        account_id=account.id,
                        paid_bytes=stats_data["paid_bytes"],
                        paid_gb=stats_data["paid_gb"],
                        unpaid_bytes=stats_data["unpaid_bytes"],
                        unpaid_gb=stats_data["unpaid_gb"]
                    )
                    db.session.add(entry)
                    db.session.commit()
                    logging.info(f"Logged stats for account {account.nickname or account.username} at {entry.timestamp}")
                    send_webhook_notification(app, stats_data, account.nickname or account.username)
                except Exception as e:
                    logging.error(f"Failed to fetch stats for account {account.username}: {e}")

    @scheduler.task(id="cleanup_old_stats_job", trigger="cron", hour="3", minute="0")
    def cleanup_old_stats_job():
        """Scheduled job to delete stats data older than 7 days, runs daily at 3 AM."""
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
            except Exception as e:
                logging.error(f"Scheduled job 'cleanup_old_stats_job' failed: {e}")
                db.session.rollback()

    scheduler.start()
