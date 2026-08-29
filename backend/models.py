from __future__ import annotations

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text


db = SQLAlchemy()


class Account(db.Model):
    """A URnetwork account whose upstream password is encrypted at rest."""

    __tablename__ = "accounts"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    # Fernet ciphertext is longer than the legacy VARCHAR(200) field. SQLite
    # does not enforce that old length, and Text also supports future databases.
    password = db.Column(db.Text, nullable=False)
    nickname = db.Column(db.String(100), nullable=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, server_default=db.func.now(), nullable=False)


class Stats(db.Model):
    """A snapshot of paid vs. unpaid bytes for a dashboard account."""

    __tablename__ = "stats"
    __table_args__ = (
        db.Index("ix_stats_account_timestamp", "account_id", "timestamp"),
    )

    id = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey("accounts.id"), nullable=False)
    timestamp = db.Column(db.DateTime, server_default=db.func.now(), nullable=False)
    paid_bytes = db.Column(db.BigInteger, nullable=False)
    paid_gb = db.Column(db.Float, nullable=False)
    unpaid_bytes = db.Column(db.BigInteger, nullable=False)
    unpaid_gb = db.Column(db.Float, nullable=False)
    account = db.relationship("Account", backref="stats")


class Webhook(db.Model):
    """A validated Discord-compatible webhook with delivery preferences."""

    __tablename__ = "webhook"

    id = db.Column(db.Integer, primary_key=True)
    url = db.Column(db.String, unique=True, nullable=False)
    payload = db.Column(db.Text, nullable=True)
    on_payment = db.Column(db.Boolean, default=True, nullable=False)
    on_change = db.Column(db.Boolean, default=False, nullable=False)
    on_summary = db.Column(db.Boolean, default=True, nullable=False)
    summary_interval = db.Column(db.String(10), default="1h", nullable=False)
    last_summary_at = db.Column(db.DateTime, nullable=True)
    last_delivery_at = db.Column(db.DateTime, nullable=True)
    last_delivery_error = db.Column(db.String(200), nullable=True)


class Setting(db.Model):
    """A small key/value store for dashboard-level preferences."""

    __tablename__ = "settings"

    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(100), nullable=False)


class ProviderCount(db.Model):
    """A UTC snapshot of a country's active provider count."""

    __tablename__ = "provider_counts"
    __table_args__ = (
        db.Index("ix_provider_counts_country_timestamp", "country_code", "timestamp"),
    )

    timestamp = db.Column(db.String(30), primary_key=True)
    country_code = db.Column(db.String(10), primary_key=True)
    country_name = db.Column(db.String(100), nullable=False)
    provider_count = db.Column(db.Integer, nullable=False)


def ensure_database_indexes() -> None:
    """Apply small, additive schema upgrades to local installations.

    This project predates a migration framework.  These statements are safe to
    run at every startup and cover the additions that are required for existing
    SQLite databases.  A production database can later be moved to Alembic
    without data loss.
    """
    dialect = db.engine.dialect.name
    inspector = inspect(db.engine)
    if dialect == "sqlite":
        columns = {column["name"] for column in inspector.get_columns("webhook")}
        for column_name, column_type in (
            ("last_delivery_at", "DATETIME"),
            ("last_delivery_error", "VARCHAR(200)"),
        ):
            if column_name not in columns:
                db.session.execute(text(f"ALTER TABLE webhook ADD COLUMN {column_name} {column_type}"))

    # Existing PostgreSQL installs used VARCHAR(200) for account passwords.
    # Fernet ciphertext for a long valid upstream password exceeds that limit;
    # widening it is lossless and avoids a failed migration on first login.
    if dialect == "postgresql":
        password_column = next(
            (column for column in inspector.get_columns("accounts") if column["name"] == "password"),
            None,
        )
        if password_column is not None and getattr(password_column["type"], "length", None):
            db.session.execute(text("ALTER TABLE accounts ALTER COLUMN password TYPE TEXT"))

    # ``create_all`` does not reliably add newly declared indexes to an
    # existing table, so make the additive upgrades explicit and idempotent.
    db.session.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_provider_counts_country_timestamp "
            "ON provider_counts(country_code, timestamp)"
        )
    )
    db.session.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_stats_account_timestamp "
            "ON stats(account_id, timestamp)"
        )
    )
    db.session.commit()


def get_setting(key: str, default: str | None = None) -> str | None:
    setting = db.session.get(Setting, key)
    return setting.value if setting else default


def set_setting(key: str, value: str | bool | int) -> None:
    setting = db.session.get(Setting, key)
    if setting:
        setting.value = str(value)
    else:
        db.session.add(Setting(key=key, value=str(value)))


def get_boolean_setting(key: str, default: bool = False) -> bool:
    value = get_setting(key)
    if value is None:
        return default
    return value.strip().lower() in {"true", "1", "t", "yes", "on"}
