"""Security primitives used by the Flask API.

This module keeps authentication concerns in one place: password hashing,
CSRF protection, encrypted upstream credentials and a small login throttle.
It intentionally does not log secrets, account passwords or webhook tokens.
"""

from __future__ import annotations

import hmac
import logging
import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from flask import Response, current_app, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from backend.config import KNOWN_INSECURE_SECRET, persist_environment

CREDENTIAL_PREFIX = "fernet:v1:"
CSRF_SESSION_KEY = "_csrf_token"


class CredentialEncryptionError(RuntimeError):
    """Raised when a stored upstream credential cannot be safely decrypted."""


def generate_credential_key() -> str:
    return Fernet.generate_key().decode("ascii")


def _fernet(key: str) -> Fernet:
    if not key:
        raise CredentialEncryptionError("Credential encryption key is not configured.")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise CredentialEncryptionError("Credential encryption key is invalid.") from exc


def is_encrypted_credential(value: str | None) -> bool:
    return bool(value and value.startswith(CREDENTIAL_PREFIX))


def encrypt_credential(value: str, key: str) -> str:
    if not isinstance(value, str) or not value:
        raise CredentialEncryptionError("Credential must be a non-empty string.")
    return CREDENTIAL_PREFIX + _fernet(key).encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_credential(value: str, key: str) -> str:
    """Decrypt a credential, accepting legacy plaintext only for migration.

    Returning legacy plaintext here enables a one-time, in-place migration at
    startup. New writes always go through :func:`encrypt_credential`.
    """
    if not is_encrypted_credential(value):
        return value
    try:
        token = value[len(CREDENTIAL_PREFIX):].encode("ascii")
        return _fernet(key).decrypt(token).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError, CredentialEncryptionError) as exc:
        raise CredentialEncryptionError(
            "Stored account credential cannot be decrypted. Restore the original "
            "CREDENTIAL_ENCRYPTION_KEY or re-add this account."
        ) from exc


def account_password(account: Any, app=None) -> str:
    """Return an account's upstream password without exposing storage format."""
    config = (app or current_app).config
    return decrypt_credential(account.password, config["CREDENTIAL_ENCRYPTION_KEY"])


def authenticate_account(account: Any, app=None) -> str | None:
    """Obtain an upstream JWT for an account using its decrypted credential."""
    if not account:
        return None
    from backend.ur_api import get_jwt_from_credentials

    try:
        return get_jwt_from_credentials(account.username, account_password(account, app))
    except CredentialEncryptionError as exc:
        logging.error("Unable to decrypt credentials for account id %s: %s", account.id, exc)
        return None


def is_installed() -> bool:
    return bool(
        current_app.config.get("ADMIN_PASSWORD_HASH")
        and (current_app.config.get("SECRET_KEY_PERSISTED") or current_app.config.get("TESTING"))
    )


def prepare_security_material(app) -> None:
    """Migrate legacy local secrets and ensure persistent encryption material.

    Earlier releases saved an unhashed admin password and used a public default
    Flask secret until the process restarted.  This migration happens before
    routes are served and writes only to the repository-local ``.env`` file.
    Tests can supply complete values and avoid any disk mutation.
    """
    legacy_password = app.config.get("LEGACY_ADMIN_PASSWORD")
    password_hash = app.config.get("ADMIN_PASSWORD_HASH")
    persisted_secret = app.config.get("SECRET_KEY_PERSISTED")
    secret_key = app.config.get("SECRET_KEY")
    encryption_key = app.config.get("CREDENTIAL_ENCRYPTION_KEY")

    updates: dict[str, str] = {}
    remove: list[str] = []

    if legacy_password and not password_hash:
        password_hash = generate_password_hash(legacy_password)
        app.config["ADMIN_PASSWORD_HASH"] = password_hash
        app.config["LEGACY_ADMIN_PASSWORD"] = ""
        updates["ADMIN_PASSWORD_HASH"] = password_hash
        remove.append("ADMIN_PASSWORD")

    # A fixed legacy fallback must never continue signing cookies.
    if secret_key == KNOWN_INSECURE_SECRET or not persisted_secret:
        # Do not mark a completely uninstalled app as installed. Its ephemeral
        # key becomes persistent only in the explicit installation endpoint.
        if password_hash:
            secret_key = secrets.token_urlsafe(48)
            app.config["SECRET_KEY"] = secret_key
            app.config["SECRET_KEY_PERSISTED"] = True
            updates["SECRET_KEY"] = secret_key

    if password_hash and not encryption_key:
        encryption_key = generate_credential_key()
        app.config["CREDENTIAL_ENCRYPTION_KEY"] = encryption_key
        updates["CREDENTIAL_ENCRYPTION_KEY"] = encryption_key
    if password_hash and encryption_key:
        try:
            _fernet(encryption_key)
        except CredentialEncryptionError as exc:
            # Starting with an invalid key risks silent credential loss. Refuse
            # to serve instead of treating the app as a fresh installation.
            raise RuntimeError("CREDENTIAL_ENCRYPTION_KEY is invalid.") from exc

    if updates and not app.config.get("TESTING"):
        try:
            persist_environment(
                updates,
                remove=tuple(remove),
                env_file=app.config.get("ENV_FILE"),
            )
        except OSError as exc:
            # Failing closed is preferable to silently continuing with a known
            # secret or an ephemeral encryption key. Existing env-driven
            # deployments can still provide every required value directly.
            logging.error("Unable to persist security configuration: %s", exc)
            if "SECRET_KEY" in updates or "CREDENTIAL_ENCRYPTION_KEY" in updates:
                app.config["SECRET_KEY_PERSISTED"] = False


def migrate_legacy_account_credentials(app) -> int:
    """Encrypt plaintext account passwords left by pre-encryption releases."""
    from backend.models import Account, db

    key = app.config.get("CREDENTIAL_ENCRYPTION_KEY")
    if not key:
        return 0

    migrated = 0
    for account in Account.query.all():
        if is_encrypted_credential(account.password):
            continue
        try:
            account.password = encrypt_credential(account.password, key)
        except CredentialEncryptionError:
            # A malformed legacy row should not prevent every other account
            # from being migrated or make the complete dashboard unavailable.
            logging.error("Skipping malformed legacy credential for account id %s.", account.id)
            continue
        migrated += 1
    if migrated:
        db.session.commit()
        logging.info("Encrypted %s legacy account credential(s).", migrated)
    return migrated


def csrf_token() -> str:
    """Create or retrieve the per-session synchronizer token."""
    token = session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = token
    return token


def reset_session(*, logged_in: bool = False) -> str:
    """Clear old client-controlled session data and create a fresh CSRF token."""
    session.clear()
    session.permanent = True
    if logged_in:
        session["logged_in"] = True
    return csrf_token()


def csrf_error() -> tuple[Response, int]:
    return jsonify({"error": "Invalid or missing CSRF token."}), 403


def verify_csrf() -> tuple[Response, int] | None:
    """Validate CSRF on every unsafe API request, including login/setup."""
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return None
    expected = session.get(CSRF_SESSION_KEY)
    supplied = request.headers.get("X-CSRF-Token", "")
    if not expected or not supplied or not hmac.compare_digest(expected, supplied):
        return csrf_error()
    return None


@dataclass
class LoginRateLimiter:
    """Bounded, thread-safe in-memory throttle for a self-hosted process."""

    max_clients: int = 10_000
    attempts: dict[str, deque[float]] = field(default_factory=dict)
    lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    def _prune(self, client_id: str, now: float, window: int) -> deque[float]:
        entries = self.attempts.get(client_id)
        if entries is None:
            return deque()
        while entries and entries[0] <= now - window:
            entries.popleft()
        if not entries:
            self.attempts.pop(client_id, None)
        return entries

    def allowed(self, client_id: str, *, maximum: int, window: int) -> bool:
        with self.lock:
            return len(self._prune(client_id, time.monotonic(), window)) < maximum

    def failed(self, client_id: str, *, window: int) -> None:
        now = time.monotonic()
        with self.lock:
            entries = self._prune(client_id, now, window)
            if not entries:
                if len(self.attempts) >= self.max_clients:
                    # Bounded-memory protection. A client that is evicted only
                    # loses an in-memory throttle entry; it never affects auth.
                    self.attempts.pop(next(iter(self.attempts)), None)
                entries = deque()
                self.attempts[client_id] = entries
            entries.append(now)

    def succeeded(self, client_id: str) -> None:
        with self.lock:
            self.attempts.pop(client_id, None)

    def retry_after(self, client_id: str, *, window: int) -> int:
        with self.lock:
            entries = self._prune(client_id, time.monotonic(), window)
            if not entries:
                return 0
            return max(1, int(window - (time.monotonic() - entries[0])))


login_rate_limiter = LoginRateLimiter()


def client_identifier() -> str:
    """Use the direct peer address unless ProxyFix was explicitly enabled."""
    return request.remote_addr or "unknown"


def validate_admin_password(password: object, minimum_length: int) -> str | None:
    if not isinstance(password, str):
        return "Password is required."
    if len(password) < minimum_length:
        return f"Password must be at least {minimum_length} characters."
    if len(password) > 1024:
        return "Password is too long."
    return None


def verify_admin_password(password: object) -> bool:
    if not isinstance(password, str):
        return False
    password_hash = current_app.config.get("ADMIN_PASSWORD_HASH", "")
    if not password_hash:
        return False
    try:
        return check_password_hash(password_hash, password)
    except (ValueError, TypeError):
        return False
