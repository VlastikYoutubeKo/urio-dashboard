from __future__ import annotations

import requests

from backend import ur_api


class FakeResponse:
    def __init__(self, status_code: int, payload=None, *, json_error: bool = False, headers=None):
        self.status_code = status_code
        self._payload = {} if payload is None else payload
        self._json_error = json_error
        self.headers = headers or {}
        self.closed = False

    def json(self):
        if self._json_error:
            raise ValueError("not JSON")
        return self._payload

    def close(self):
        self.closed = True


def _clear_caches():
    ur_api.clear_upstream_caches(include_credentials=True)


def test_safe_requests_retry_transient_responses(monkeypatch):
    responses = [FakeResponse(503), FakeResponse(200, {"ok": True})]
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return responses.pop(0)

    monkeypatch.setattr(ur_api.requests, "request", fake_request)
    response = ur_api.request_with_retry("GET", "https://api.bringyour.com/hello", retries=2, backoff=0)

    assert response.status_code == 200
    assert len(calls) == 2
    assert calls[0][2]["timeout"] == ur_api.DEFAULT_TIMEOUT
    assert calls[0][2]["allow_redirects"] is False


def test_unsafe_requests_do_not_retry_without_idempotency_contract(monkeypatch):
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return FakeResponse(503)

    monkeypatch.setattr(ur_api.requests, "request", fake_request)
    success, message = ur_api.remove_device("upstream-token", "client-1")

    assert success is False
    assert message == "URnetwork API returned HTTP 503."
    assert len(calls) == 1


def test_cached_device_results_are_isolated_and_token_is_not_a_cache_key(monkeypatch):
    _clear_caches()
    calls = []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        return FakeResponse(200, {"clients": [{"client_id": "one", "provide_mode": 3}]})

    monkeypatch.setattr(ur_api.requests, "request", fake_request)
    first = ur_api.fetch_devices("very-secret-upstream-token")
    first[0]["account_nickname"] = "mutated by route"
    second = ur_api.fetch_devices("very-secret-upstream-token")

    assert len(calls) == 1
    assert second == [{"client_id": "one", "provide_mode": 3, "provide_mode_str": "Public"}]
    assert all("very-secret-upstream-token" not in repr(key) for key in ur_api.devices_cache)

    ur_api.clear_upstream_caches()
    ur_api.fetch_devices("very-secret-upstream-token")
    assert len(calls) == 2


def test_invalid_upstream_json_is_handled_without_leaking_exception(monkeypatch):
    _clear_caches()
    monkeypatch.setattr(
        ur_api.requests,
        "request",
        lambda *args, **kwargs: FakeResponse(200, json_error=True),
    )

    assert ur_api.fetch_transfer_stats("token") is None


def test_transport_failure_returns_a_safe_result(monkeypatch):
    _clear_caches()
    monkeypatch.setattr(
        ur_api.requests,
        "request",
        lambda *args, **kwargs: (_ for _ in ()).throw(requests.ConnectionError("network down")),
    )

    assert ur_api.fetch_provider_locations() is None
