from __future__ import annotations

import pytest
from cryptography.fernet import Fernet
from werkzeug.security import generate_password_hash

from backend.app import create_app
from backend.models import db
from backend.security import login_rate_limiter
from backend.routes import clear_provider_api_cache


@pytest.fixture
def app(tmp_path):
    database_file = tmp_path / "dashboard.sqlite"
    application = create_app(
        {
            "TESTING": True,
            "INSTANCE_DIR": str(tmp_path),
            "ENV_FILE": str(tmp_path / ".env"),
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{database_file}",
            "SECRET_KEY": "test-session-secret",
            "SECRET_KEY_PERSISTED": True,
            "ADMIN_PASSWORD_HASH": generate_password_hash("correct horse battery staple"),
            "CREDENTIAL_ENCRYPTION_KEY": Fernet.generate_key().decode("ascii"),
            "SCHEDULER_ENABLED": False,
            "LOGIN_MAX_ATTEMPTS": 3,
            "LOGIN_WINDOW_SECONDS": 60,
            "PUBLIC_DASHBOARD_DEFAULT": False,
            "PUBLIC_DASHBOARD_FINANCIALS_DEFAULT": False,
        }
    )
    with application.app_context():
        db.drop_all()
        db.create_all()
    login_rate_limiter.attempts.clear()
    clear_provider_api_cache()
    yield application
    with application.app_context():
        db.session.remove()
        db.drop_all()
    login_rate_limiter.attempts.clear()
    clear_provider_api_cache()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def csrf(client):
    response = client.get("/api/status")
    assert response.status_code == 200
    return response.headers["X-CSRF-Token"]


@pytest.fixture
def logged_in_client(client, csrf):
    response = client.post(
        "/api/auth/login",
        json={"password": "correct horse battery staple"},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 200
    return client, response.headers["X-CSRF-Token"]
