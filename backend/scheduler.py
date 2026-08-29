"""Background collection and notification jobs.

Run these jobs in exactly one process by setting ``RUN_SCHEDULER=true`` there
and ``false`` in additional web workers.  Jobs are deliberately separate from
request handlers so an unavailable upstream API never blocks application boot.
"""

from __future__ import annotations

import datetime as dt
import logging
import time

from flask_apscheduler import APScheduler

from backend.models import Account, ProviderCount, Stats, Webhook, db
from backend.security import authenticate_account
from backend.ur_api import fetch_devices, fetch_provider_locations, fetch_transfer_stats, remove_device
from backend.webhooks import deliver_webhook, render_payload

scheduler = APScheduler()


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC).replace(tzinfo=None, microsecond=0)


def _snapshot_timestamp(value: dt.datetime | None = None) -> str:
    return (value or _utc_now()).strftime("%Y-%m-%d %H:%M:%S")


def format_bytes(bytes_count: int | float) -> str:
    """Format bytes with decimal units, matching the upstream API."""
    value = max(0, float(bytes_count or 0))
    if value < 1e6:
        return f"{value / 1e3:.2f} KB"
    if value < 1e9:
        return f"{value / 1e6:.2f} MB"
    if value >= 1e12:
        return f"{value / 1e12:.2f} TB"
    return f"{value / 1e9:.3f} GB"


def get_traffic_delta(account_id: int, minutes: int) -> tuple[int, int]:
    """Calculate transferred traffic against the closest snapshot before cutoff."""
    cutoff = _utc_now() - dt.timedelta(minutes=minutes)
    old_stat = (
        Stats.query.filter(Stats.account_id == account_id, Stats.timestamp <= cutoff)
        .order_by(Stats.timestamp.desc(), Stats.id.desc())
        .first()
    )
    if not old_stat:
        old_stat = Stats.query.filter_by(account_id=account_id).order_by(Stats.timestamp.asc()).first()
    latest_stat = (
        Stats.query.filter_by(account_id=account_id)
        .order_by(Stats.timestamp.desc(), Stats.id.desc())
        .first()
    )
    if not old_stat or not latest_stat or old_stat.id == latest_stat.id:
        return 0, 0
    return (
        max(0, latest_stat.paid_bytes - old_stat.paid_bytes),
        max(0, latest_stat.unpaid_bytes - old_stat.unpaid_bytes),
    )


def _webhook_substitutions(account: Account, current_stats: Stats, now: dt.datetime) -> dict[str, str]:
    return {
        "account": account.nickname or account.username,
        "paid_gb": f"{current_stats.paid_bytes / 1e9:.3f}",
        "unpaid_gb": f"{current_stats.unpaid_bytes / 1e9:.3f}",
        "total_gb": f"{(current_stats.paid_bytes + current_stats.unpaid_bytes) / 1e9:.3f}",
        "update_time": now.strftime("%Y-%m-%d %H:%M:%S UTC"),
    }


def send_webhook_notification(app, account: Account, current_stats: Stats, previous_stats: Stats | None = None) -> None:
    """Send payment/balance-change notifications and persist delivery state."""
    now = _utc_now()
    paid_diff = current_stats.paid_bytes - (previous_stats.paid_bytes if previous_stats else current_stats.paid_bytes)
    unpaid_diff = current_stats.unpaid_bytes - (previous_stats.unpaid_bytes if previous_stats else current_stats.unpaid_bytes)
    total_diff = paid_diff + unpaid_diff

    for webhook in Webhook.query.all():
        event = None
        color = 5814783
        if webhook.on_payment and paid_diff > 0:
            event, color = "💰 Payment Received", 3066993
        elif webhook.on_change and total_diff >= 1e6:
            event, color = "🔄 Wallet Balance Updated", 3447003
        if not event:
            continue

        s30m = sum(get_traffic_delta(account.id, 30))
        s1h = sum(get_traffic_delta(account.id, 60))
        s12h = sum(get_traffic_delta(account.id, 12 * 60))
        s1d = sum(get_traffic_delta(account.id, 24 * 60))
        default_payload = {
            "embeds": [
                {
                    "title": f"{event} - {account.nickname or account.username}",
                    "color": color,
                    "fields": [
                        {"name": "Account", "value": account.nickname or account.username, "inline": False},
                        {
                            "name": "Current Total",
                            "value": format_bytes(current_stats.paid_bytes + current_stats.unpaid_bytes),
                            "inline": True,
                        },
                        {"name": "Recent Change", "value": f"+{format_bytes(total_diff)}", "inline": True},
                        {
                            "name": "Traffic Shared (Summaries)",
                            "value": (
                                f"**Last 30m:** {format_bytes(s30m)}\n"
                                f"**Last 1h:** {format_bytes(s1h)}\n"
                                f"**Last 12h:** {format_bytes(s12h)}\n"
                                f"**Last 24h:** {format_bytes(s1d)}"
                            ),
                            "inline": False,
                        },
                    ],
                    "footer": {"text": "URnetwork Stats Dashboard"},
                    "timestamp": now.replace(tzinfo=dt.UTC).isoformat().replace("+00:00", "Z"),
                }
            ]
        }
        payload = render_payload(webhook, default_payload, _webhook_substitutions(account, current_stats, now))
        deliver_webhook(webhook, payload, allowed_hosts=app.config["WEBHOOK_ALLOWED_HOSTS"])
    db.session.commit()


def log_stats_job(app) -> None:
    """Fetch and store one snapshot per active account."""
    with app.app_context():
        try:
            for account in Account.query.filter_by(is_active=True).all():
                try:
                    jwt = authenticate_account(account, app)
                    if not jwt:
                        continue
                    data = fetch_transfer_stats(jwt)
                    if not data:
                        logging.warning("No transfer statistics returned for account id %s.", account.id)
                        continue
                    previous = (
                        Stats.query.filter_by(account_id=account.id)
                        .order_by(Stats.timestamp.desc(), Stats.id.desc())
                        .first()
                    )
                    current = Stats(
                        account_id=account.id,
                        timestamp=_utc_now(),
                        paid_bytes=int(data["paid_bytes"]),
                        paid_gb=float(data["paid_gb"]),
                        unpaid_bytes=int(data["unpaid_bytes"]),
                        unpaid_gb=float(data["unpaid_gb"]),
                    )
                    db.session.add(current)
                    db.session.commit()
                    send_webhook_notification(app, account, current, previous)
                except Exception:
                    db.session.rollback()
                    logging.exception("Statistics job failed for account id %s.", account.id)
        except Exception:
            db.session.rollback()
            logging.exception("Statistics collection job failed before account processing completed.")
        finally:
            db.session.remove()


SUMMARY_INTERVAL_MINUTES = {"30m": 30, "1h": 60, "12h": 12 * 60, "1d": 24 * 60}


def _summary_due(webhook: Webhook, now: dt.datetime) -> bool:
    if webhook.summary_interval == "30m":
        return now.minute in {0, 30}
    if webhook.summary_interval == "1h":
        return now.minute == 0
    if webhook.summary_interval == "12h":
        return now.hour in {0, 12} and now.minute == 0
    if webhook.summary_interval == "1d":
        return now.hour == 0 and now.minute == 0
    return False


def _summary_was_delivered_in_current_slot(webhook: Webhook, now: dt.datetime) -> bool:
    """Avoid duplicate summaries when a scheduler process restarts mid-slot."""
    last_sent = webhook.last_summary_at
    interval_minutes = SUMMARY_INTERVAL_MINUTES.get(webhook.summary_interval)
    return bool(last_sent and interval_minutes and last_sent > now - dt.timedelta(minutes=interval_minutes))


def periodic_summary_job(app) -> None:
    """Deliver clock-aligned summaries and leave sessions clean on every path."""
    with app.app_context():
        try:
            now = _utc_now()
            accounts = Account.query.filter_by(is_active=True).all()
            for webhook in Webhook.query.filter_by(on_summary=True).all():
                if not _summary_due(webhook, now) or _summary_was_delivered_in_current_slot(webhook, now):
                    continue

                delivered_any = False
                for account in accounts:
                    latest = (
                        Stats.query.filter_by(account_id=account.id)
                        .order_by(Stats.timestamp.desc(), Stats.id.desc())
                        .first()
                    )
                    if not latest:
                        continue
                    s30m = sum(get_traffic_delta(account.id, 30))
                    s1h = sum(get_traffic_delta(account.id, 60))
                    s12h = sum(get_traffic_delta(account.id, 12 * 60))
                    s1d = sum(get_traffic_delta(account.id, 24 * 60))
                    totals = {"30m": s30m, "1h": s1h, "12h": s12h, "1d": s1d}
                    if totals.get(webhook.summary_interval, 0) <= 0:
                        continue
                    default_payload = {
                        "embeds": [
                            {
                                "title": f"📊 Traffic Summary - {account.nickname or account.username}",
                                "color": 9124843,
                                "fields": [
                                    {
                                        "name": "Total Shared",
                                        "value": format_bytes(latest.paid_bytes + latest.unpaid_bytes),
                                        "inline": True,
                                    },
                                    {
                                        "name": "Summary Windows",
                                        "value": (
                                            f"**Last 30m:** {format_bytes(s30m)}\n"
                                            f"**Last 1h:** {format_bytes(s1h)}\n"
                                            f"**Last 12h:** {format_bytes(s12h)}\n"
                                            f"**Last 24h:** {format_bytes(s1d)}"
                                        ),
                                        "inline": False,
                                    },
                                ],
                                "footer": {"text": f"Interval: {webhook.summary_interval}"},
                                "timestamp": now.replace(tzinfo=dt.UTC).isoformat().replace("+00:00", "Z"),
                            }
                        ]
                    }
                    payload = render_payload(webhook, default_payload, _webhook_substitutions(account, latest, now))
                    delivered, _ = deliver_webhook(
                        webhook, payload, allowed_hosts=app.config["WEBHOOK_ALLOWED_HOSTS"]
                    )
                    delivered_any = delivered_any or delivered
                if delivered_any:
                    webhook.last_summary_at = now
            db.session.commit()
        except Exception:
            db.session.rollback()
            logging.exception("Periodic webhook summary job failed.")
        finally:
            db.session.remove()


def cleanup_old_stats_job(app) -> None:
    with app.app_context():
        try:
            account_cutoff = _utc_now() - dt.timedelta(days=app.config["STATS_RETENTION_DAYS"])
            provider_cutoff = _snapshot_timestamp(
                _utc_now() - dt.timedelta(days=app.config["PROVIDER_STATS_RETENTION_DAYS"])
            )
            account_deleted = (
                db.session.query(Stats)
                .filter(Stats.timestamp < account_cutoff)
                .delete(synchronize_session=False)
            )
            provider_deleted = (
                db.session.query(ProviderCount)
                .filter(ProviderCount.timestamp < provider_cutoff)
                .delete(synchronize_session=False)
            )
            db.session.commit()
            logging.info(
                "Retention cleanup removed %s account and %s provider snapshots.",
                account_deleted,
                provider_deleted,
            )
        except Exception:
            db.session.rollback()
            logging.exception("Retention cleanup failed.")
        finally:
            db.session.remove()


def poll_provider_counts_job(app) -> None:
    """Fetch one global provider-country snapshot and invalidate route caches."""
    with app.app_context():
        try:
            data = fetch_provider_locations()
            locations = (data or {}).get("locations", [])
            if not locations:
                logging.warning("Provider polling returned no locations; keeping existing snapshot.")
                return
            timestamp = _snapshot_timestamp()
            stored = 0
            for location in locations:
                if not isinstance(location, dict):
                    continue
                code = str(location.get("country_code", "")).lower()
                name = str(location.get("name", "")).strip()
                count = location.get("provider_count")
                if len(code) != 2 or not code.isalpha() or not name or len(name) > 100:
                    continue
                try:
                    count = int(count)
                except (TypeError, ValueError, OverflowError):
                    continue
                if not 0 <= count <= 9_223_372_036_854_775_807:
                    continue
                db.session.merge(
                    ProviderCount(
                        timestamp=timestamp,
                        country_code=code,
                        country_name=name,
                        provider_count=max(0, count),
                    )
                )
                stored += 1
            if not stored:
                db.session.rollback()
                logging.warning("Provider polling returned no valid country records; keeping existing snapshot.")
                return
            db.session.commit()
            from backend.routes import clear_provider_api_cache

            clear_provider_api_cache()
            logging.info("Stored provider snapshot at %s.", timestamp)
        except Exception:
            db.session.rollback()
            logging.exception("Provider polling failed.")
        finally:
            db.session.remove()


def cleanup_offline_devices_job(app) -> None:
    """Optionally remove stale devices; disabled unless explicitly opted in."""
    if not app.config["AUTO_REMOVE_OFFLINE_DEVICES"]:
        return
    with app.app_context():
        try:
            cutoff = dt.datetime.now(dt.UTC) - dt.timedelta(days=7)
            for account in Account.query.filter_by(is_active=True).all():
                try:
                    jwt = authenticate_account(account, app)
                    if not jwt:
                        continue
                    for device in fetch_devices(jwt) or []:
                        client_id = device.get("client_id")
                        if not client_id or device.get("connections"):
                            continue
                        auth_time_value = device.get("auth_time")
                        if not auth_time_value:
                            continue
                        try:
                            from dateutil.parser import isoparse

                            auth_time = isoparse(auth_time_value)
                            if auth_time.tzinfo is None:
                                auth_time = auth_time.replace(tzinfo=dt.UTC)
                        except (TypeError, ValueError):
                            logging.warning("Skipping device with invalid auth_time for account id %s.", account.id)
                            continue
                        if auth_time < cutoff:
                            success, _ = remove_device(jwt, client_id)
                            if success:
                                logging.info("Removed opted-in stale device %s from account id %s.", client_id, account.id)
                            # Keep automated mutation traffic gentle even for a
                            # large account, regardless of upstream cache state.
                            time.sleep(0.1)
                except Exception:
                    logging.exception("Stale-device cleanup failed for account id %s.", account.id)
        except Exception:
            db.session.rollback()
            logging.exception("Offline-device cleanup job failed.")
        finally:
            db.session.remove()


def _add_job(identifier: str, function, *, trigger: str, **kwargs) -> None:
    scheduler.add_job(
        id=identifier,
        func=function,
        trigger=trigger,
        replace_existing=True,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=300,
        **kwargs,
    )


def init_scheduler(app) -> None:
    """Start scheduler jobs only in the explicitly designated process."""
    if not app.config["SCHEDULER_ENABLED"]:
        logging.info("Background scheduler disabled by RUN_SCHEDULER.")
        return
    if scheduler.running:
        logging.warning("Scheduler is already running; not registering duplicate jobs.")
        return

    scheduler.init_app(app)
    _add_job("log_stats_job", lambda: log_stats_job(app), trigger="cron", minute="0,15,30,45", timezone="UTC")
    _add_job("periodic_summary_job", lambda: periodic_summary_job(app), trigger="cron", minute="0,15,30,45", timezone="UTC")
    _add_job("cleanup_old_stats_job", lambda: cleanup_old_stats_job(app), trigger="cron", hour="3", minute="0", timezone="UTC")
    _add_job("poll_provider_counts_job", lambda: poll_provider_counts_job(app), trigger="cron", minute="2", timezone="UTC")
    _add_job("cleanup_offline_devices_job", lambda: cleanup_offline_devices_job(app), trigger="interval", hours=6)

    with app.app_context():
        provider_data_empty = db.session.query(ProviderCount).count() == 0
    if provider_data_empty:
        # Do not make an external HTTP request in create_app(). The one-time
        # task starts just after the scheduler, leaving web startup responsive.
        _add_job(
            "initial_provider_sync",
            lambda: poll_provider_counts_job(app),
            trigger="date",
            run_date=dt.datetime.now(dt.UTC) + dt.timedelta(seconds=1),
        )
    scheduler.start()
