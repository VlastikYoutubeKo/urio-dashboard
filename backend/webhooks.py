"""Validated webhook rendering and delivery helpers."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from string import Template
from urllib.parse import urlparse

import requests


MAX_WEBHOOK_PAYLOAD_BYTES = 16 * 1024
VALID_SUMMARY_INTERVALS = {"30m", "1h", "12h", "1d"}


def redact_webhook_url(url: str) -> str:
    """Keep webhook tokens and embedded credentials out of diagnostics."""
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if ":" in host:  # Preserve a readable IPv6 host without retaining userinfo.
        host = f"[{host}]"
    try:
        port = parsed.port
    except ValueError:
        port = None
    authority = f"{host}:{port}" if port else host
    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) >= 3:
        path = "/" + "/".join(parts[:3]) + "/…"
    else:
        path = parsed.path
    return f"{parsed.scheme}://{authority}{path}"


def validate_webhook_url(url: object, allowed_hosts: tuple[str, ...]) -> tuple[bool, str]:
    if not isinstance(url, str) or not url.strip():
        return False, "Webhook URL is required."
    if len(url) > 2048:
        return False, "Webhook URL is too long."

    try:
        parsed = urlparse(url.strip())
        port = parsed.port
    except ValueError:
        return False, "Webhook URL is invalid."

    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        return False, "Webhook URLs must use HTTPS without embedded credentials."
    if port not in (None, 443):
        return False, "Webhook URLs must use the standard HTTPS port."
    if host not in set(allowed_hosts):
        return False, "Webhook host is not in the allowed host list."
    if not parsed.path.startswith("/api/webhooks/"):
        return False, "Only Discord-compatible webhook paths are allowed."
    return True, ""


def validate_custom_payload(payload: object) -> tuple[bool, str, str | None]:
    """Validate a JSON template without storing malformed webhook payloads."""
    if payload in (None, ""):
        return True, "", None
    if not isinstance(payload, str):
        return False, "Custom payload must be text.", None
    if len(payload.encode("utf-8")) > MAX_WEBHOOK_PAYLOAD_BYTES:
        return False, f"Custom payload must be at most {MAX_WEBHOOK_PAYLOAD_BYTES} bytes.", None
    try:
        rendered = Template(payload).safe_substitute(
            account="Example account",
            paid_gb="1.000",
            unpaid_gb="0.500",
            total_gb="1.500",
            update_time="2026-01-01 00:00:00 UTC",
        )
        parsed = json.loads(rendered)
    except (ValueError, json.JSONDecodeError) as exc:
        return False, f"Custom payload must be valid JSON after template substitution: {exc}", None
    if not isinstance(parsed, dict):
        return False, "Custom payload must be a JSON object.", None
    return True, "", payload


def render_payload(webhook, default_payload: dict, substitutions: dict[str, str]) -> dict:
    """Use a verified custom JSON template, falling back to the default payload."""
    if not webhook.payload or not webhook.payload.strip():
        return default_payload
    try:
        rendered = Template(webhook.payload).safe_substitute(substitutions)
        payload = json.loads(rendered)
        if isinstance(payload, dict):
            return payload
    except (ValueError, json.JSONDecodeError) as exc:
        logging.warning("Webhook %s has an invalid stored payload: %s", webhook.id, exc)
    return default_payload


def deliver_webhook(webhook, payload: dict, *, allowed_hosts: tuple[str, ...]) -> tuple[bool, str | None]:
    """POST a payload only after validating its destination and HTTP response."""
    valid, error = validate_webhook_url(webhook.url, allowed_hosts)
    now = datetime.now(UTC).replace(tzinfo=None)
    if not valid:
        webhook.last_delivery_at = now
        webhook.last_delivery_error = error
        return False, error

    response = None
    try:
        response = requests.post(
            webhook.url,
            json=payload,
            timeout=(5, 15),
            headers={"User-Agent": "URnetwork-Stats-Dashboard/secure-webhook"},
            # Never follow a redirect to an arbitrary URL after validation.
            allow_redirects=False,
        )
        if not 200 <= response.status_code < 300:
            error = f"Webhook returned HTTP {response.status_code}."
            webhook.last_delivery_at = now
            webhook.last_delivery_error = error
            logging.warning("Webhook delivery to %s failed: %s", redact_webhook_url(webhook.url), error)
            return False, error
    except requests.RequestException as exc:
        error = f"Webhook request failed: {type(exc).__name__}."
        webhook.last_delivery_at = now
        webhook.last_delivery_error = error
        logging.warning("Webhook delivery to %s failed: %s", redact_webhook_url(webhook.url), error)
        return False, error
    finally:
        close = getattr(response, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                # The delivery outcome is already known; a transport cleanup
                # error must not turn a successfully accepted webhook into a
                # failed scheduler/request transaction.
                logging.debug("Webhook response cleanup failed.", exc_info=True)

    webhook.last_delivery_at = now
    webhook.last_delivery_error = None
    logging.info("Webhook delivered to %s", redact_webhook_url(webhook.url))
    return True, None
