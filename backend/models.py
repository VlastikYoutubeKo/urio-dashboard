from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Account(db.Model):
    """Represents a UrNetwork account."""
    __tablename__ = 'accounts'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    nickname = db.Column(db.String(100), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    
class Stats(db.Model):
    """Represents a snapshot of paid vs unpaid bytes at a given timestamp."""
    __tablename__ = 'stats'
    id = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey('accounts.id'), nullable=False)
    timestamp = db.Column(db.DateTime, server_default=db.func.now())
    paid_bytes = db.Column(db.BigInteger, nullable=False)
    paid_gb = db.Column(db.Float, nullable=False)
    unpaid_bytes = db.Column(db.BigInteger, nullable=False)
    unpaid_gb = db.Column(db.Float, nullable=False)
    account = db.relationship('Account', backref='stats')

class Webhook(db.Model):
    """Represents a webhook URL with optional filters and periodic summaries."""
    __tablename__ = 'webhook'
    id = db.Column(db.Integer, primary_key=True)
    url = db.Column(db.String, unique=True, nullable=False)
    payload = db.Column(db.Text, nullable=True)
    
    # Event triggers
    on_payment = db.Column(db.Boolean, default=True)  # Triggered when paid_bytes increases
    on_change = db.Column(db.Boolean, default=False)  # Triggered when any balance changes
    on_summary = db.Column(db.Boolean, default=True)  # Triggered on periodic summaries
    
    # Summary intervals (controlled by a separate job)
    summary_interval = db.Column(db.String(10), default='1h') # 30m, 1h, 12h, 1d
    last_summary_at = db.Column(db.DateTime, nullable=True)

class Setting(db.Model):
    """Represents a key-value setting for the application."""
    __tablename__ = 'settings'
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(100), nullable=False)

class ProviderCount(db.Model):
    """Represents a snapshot of a country's provider count at a given timestamp."""
    __tablename__ = 'provider_counts'
    timestamp = db.Column(db.String(30), primary_key=True)
    country_code = db.Column(db.String(10), primary_key=True)
    country_name = db.Column(db.String(100), nullable=False)
    provider_count = db.Column(db.Integer, nullable=False)

def get_setting(key, default=None):
    """Gets a setting value from the database."""
    setting = Setting.query.get(key)
    return setting.value if setting else default

def get_boolean_setting(key):
    """Gets a boolean setting from the database."""
    value = get_setting(key, 'False')
    return value.lower() in ('true', '1', 't')

