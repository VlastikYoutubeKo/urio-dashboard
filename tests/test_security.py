from __future__ import annotations

from types import SimpleNamespace

from backend.app import create_app
from backend.models import Account, Stats, db
from backend.security import CREDENTIAL_PREFIX, decrypt_credential
from backend.webhooks import deliver_webhook, redact_webhook_url


def test_healthcheck_is_available_without_a_session(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json == {"status": "ok"}


def test_legacy_hello_proxy_is_not_public(client):
    response = client.get("/api/hello")
    assert response.status_code == 401
    # An expired visitor can reuse this fresh token on the login form without
    # requiring a full page reload, while public endpoints remain cookie-free.
    token = response.headers["X-CSRF-Token"]
    login = client.post(
        "/api/auth/login",
        json={"password": "correct horse battery staple"},
        headers={"X-CSRF-Token": token},
    )
    assert login.status_code == 200


def test_unsafe_api_calls_require_csrf(client):
    response = client.post("/api/auth/login", json={"password": "correct horse battery staple"})
    assert response.status_code == 403
    assert response.json["error"] == "Invalid or missing CSRF token."


def test_login_rotates_csrf_token_and_sets_secure_headers(client, csrf):
    response = client.post(
        "/api/auth/login",
        json={"password": "correct horse battery staple"},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 200
    assert response.headers["X-CSRF-Token"] != csrf
    assert response.headers["Cache-Control"] == "no-store"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"


def test_login_is_rate_limited(client, csrf):
    for _ in range(3):
        response = client.post(
            "/api/auth/login",
            json={"password": "wrong"},
            headers={"X-CSRF-Token": csrf},
        )
        assert response.status_code == 401
    response = client.post(
        "/api/auth/login",
        json={"password": "wrong"},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0


def test_account_password_is_encrypted_at_rest(app, logged_in_client, monkeypatch):
    client, csrf = logged_in_client
    seen_passwords = []
    monkeypatch.setattr(
        "backend.routes.get_jwt_from_credentials",
        lambda username, password: seen_passwords.append(password) or "upstream-jwt",
    )
    response = client.post(
        "/api/accounts/add",
        json={"username": "owner@example.test", "password": " upstream-password ", "nickname": "Home"},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 201
    with app.app_context():
        account = Account.query.filter_by(username="owner@example.test").one()
        assert account.password.startswith(CREDENTIAL_PREFIX)
        assert account.password != " upstream-password "
        assert decrypt_credential(account.password, app.config["CREDENTIAL_ENCRYPTION_KEY"]) == " upstream-password "
    assert seen_passwords == [" upstream-password "]


def test_device_collection_keeps_other_accounts_when_one_request_fails(logged_in_client, monkeypatch):
    client, _csrf = logged_in_client
    monkeypatch.setattr(
        "backend.routes._device_accounts",
        lambda: [{"id": 1}, {"id": 2}],
    )

    def fetch_for_account(account):
        if account["id"] == 1:
            raise RuntimeError("upstream account failure")
        return [{"client_id": "available-device", "account_id": account["id"]}]

    monkeypatch.setattr("backend.routes._fetch_devices_for_account", fetch_for_account)
    response = client.get("/api/dashboard/devices")

    assert response.status_code == 200
    assert response.json == {"devices": [{"client_id": "available-device", "account_id": 2}]}


def test_circle_transfer_rejects_precision_beyond_nano_cents(app, logged_in_client):
    client, csrf = logged_in_client
    with app.app_context():
        account = Account(username="circle@example.test", password="legacy-value")
        db.session.add(account)
        db.session.commit()
        account_id = account.id

    response = client.post(
        "/api/dashboard/wallet/circle/transfer",
        json={"account_id": account_id, "address": "recipient", "amount_usdc": "1.1234567891", "confirmed": True},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 400
    assert "9 decimal places" in response.json["error"]


def test_public_endpoint_hides_account_data_until_explicitly_enabled(app, logged_in_client, monkeypatch):
    client, csrf = logged_in_client
    monkeypatch.setattr("backend.routes.authenticate_account", lambda account: None)
    with app.app_context():
        account = Account(username="private@example.test", password="legacy-value", nickname=None)
        db.session.add(account)
        db.session.flush()
        db.session.add(
            Stats(
                account_id=account.id,
                paid_bytes=1_000_000_000,
                paid_gb=1.0,
                unpaid_bytes=0,
                unpaid_gb=0.0,
            )
        )
        db.session.commit()

    private_response = client.get("/api/public/dashboard")
    assert private_response.status_code == 200
    assert private_response.json["enabled"] is False
    assert private_response.json["account_charts"] == {}
    assert "private@example.test" not in str(private_response.json)

    enabled = client.post(
        "/api/settings/privacy",
        json={"public_dashboard_enabled": True, "public_dashboard_show_financials": True},
        headers={"X-CSRF-Token": csrf},
    )
    assert enabled.status_code == 200
    public_response = client.get("/api/public/dashboard")
    assert public_response.json["financials_available"] is True
    assert public_response.json["combined"]["paid_gb"] == 1.0
    assert public_response.json["account_charts"] == {}
    assert "private@example.test" not in str(public_response.json)


def test_webhook_redaction_hides_userinfo_and_token():
    redacted = redact_webhook_url("https://user:password@discord.com/api/webhooks/12345/secret-token")
    assert "user" not in redacted
    assert "password" not in redacted
    assert "secret-token" not in redacted
    assert redacted == "https://discord.com/api/webhooks/12345/…"


def test_webhook_delivery_does_not_follow_redirects(monkeypatch):
    captured = {}

    class Response:
        status_code = 200
        closed = False

        def close(self):
            self.closed = True

    def fake_post(*args, **kwargs):
        captured.update(kwargs)
        response = Response()
        captured["response"] = response
        return response

    monkeypatch.setattr("backend.webhooks.requests.post", fake_post)
    webhook = SimpleNamespace(url="https://discord.com/api/webhooks/12345/token", last_delivery_at=None, last_delivery_error=None)
    delivered, error = deliver_webhook(webhook, {"content": "test"}, allowed_hosts=("discord.com",))

    assert delivered is True
    assert error is None
    assert captured["allow_redirects"] is False
    assert captured["response"].closed is True


def test_untrusted_webhook_host_is_rejected(logged_in_client):
    client, csrf = logged_in_client
    response = client.post(
        "/api/webhooks/add",
        json={"url": "https://127.0.0.1:8443/admin", "on_payment": True, "on_change": False, "on_summary": False},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 400
    assert "Webhook" in response.json["error"]


def test_cors_is_not_open_by_default(client):
    response = client.options(
        "/api/auth/login",
        headers={"Origin": "https://attacker.example", "Access-Control-Request-Method": "POST"},
    )
    assert response.headers.get("Access-Control-Allow-Origin") is None


def test_public_api_request_does_not_create_anonymous_session(client):
    response = client.get("/api/public/dashboard")
    assert response.status_code == 200
    assert "Set-Cookie" not in response.headers


def test_install_persists_only_hashed_security_material(tmp_path, monkeypatch):
    # Track process-environment changes made by the installation flow so this
    # isolated test cannot influence the rest of the suite.
    for key in ("SECRET_KEY", "ADMIN_PASSWORD_HASH", "CREDENTIAL_ENCRYPTION_KEY"):
        monkeypatch.setenv(key, "")
    env_file = tmp_path / "private.env"
    app = create_app(
        {
            "TESTING": True,
            "INSTANCE_DIR": str(tmp_path),
            "ENV_FILE": str(env_file),
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'install.sqlite'}",
            "ADMIN_PASSWORD_HASH": "",
            "SECRET_KEY_PERSISTED": False,
            "CREDENTIAL_ENCRYPTION_KEY": "",
            "SCHEDULER_ENABLED": False,
        }
    )
    client = app.test_client()
    token = client.get("/api/status").headers["X-CSRF-Token"]

    response = client.post(
        "/api/install",
        json={"admin_pass": "correct horse battery staple"},
        headers={"X-CSRF-Token": token},
    )

    assert response.status_code == 201
    assert client.get("/api/status").json["logged_in"] is True
    contents = env_file.read_text()
    assert "ADMIN_PASSWORD_HASH" in contents
    assert "CREDENTIAL_ENCRYPTION_KEY" in contents
    assert "correct horse battery staple" not in contents
    assert env_file.stat().st_mode & 0o777 == 0o600
    with app.app_context():
        db.session.remove()
        db.drop_all()
