from __future__ import annotations

import datetime as dt

from backend.models import Account, ProviderCount, Stats, Webhook, db
from backend.scheduler import (
    _summary_was_delivered_in_current_slot,
    cleanup_old_stats_job,
    get_traffic_delta,
)


def test_traffic_delta_uses_latest_snapshot_at_or_before_cutoff(app):
    now = dt.datetime.now(dt.UTC).replace(tzinfo=None, microsecond=0)
    with app.app_context():
        account = Account(username="traffic@example.test", password="legacy")
        db.session.add(account)
        db.session.flush()
        db.session.add_all(
            [
                Stats(account_id=account.id, timestamp=now - dt.timedelta(minutes=90), paid_bytes=100, paid_gb=0, unpaid_bytes=20, unpaid_gb=0),
                Stats(account_id=account.id, timestamp=now - dt.timedelta(minutes=30), paid_bytes=145, paid_gb=0, unpaid_bytes=65, unpaid_gb=0),
            ]
        )
        db.session.commit()

        assert get_traffic_delta(account.id, 60) == (45, 45)


def test_summary_slot_guard_prevents_duplicate_delivery():
    now = dt.datetime(2026, 8, 29, 12, 0)
    webhook = Webhook(summary_interval="30m", last_summary_at=now)
    assert _summary_was_delivered_in_current_slot(webhook, now) is True

    webhook.last_summary_at = now - dt.timedelta(minutes=30)
    assert _summary_was_delivered_in_current_slot(webhook, now) is False


def test_retention_cleanup_removes_old_account_and_provider_rows(app):
    now = dt.datetime.now(dt.UTC).replace(tzinfo=None, microsecond=0)
    old = now - dt.timedelta(days=100)
    with app.app_context():
        account = Account(username="retention@example.test", password="legacy")
        db.session.add(account)
        db.session.flush()
        db.session.add(Stats(account_id=account.id, timestamp=old, paid_bytes=1, paid_gb=0, unpaid_bytes=0, unpaid_gb=0))
        db.session.add(ProviderCount(timestamp=old.strftime("%Y-%m-%d %H:%M:%S"), country_code="cz", country_name="Czechia", provider_count=1))
        db.session.commit()

    cleanup_old_stats_job(app)

    with app.app_context():
        assert Stats.query.count() == 0
        assert ProviderCount.query.count() == 0
