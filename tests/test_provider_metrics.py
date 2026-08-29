from __future__ import annotations

from backend.models import ProviderCount, db


def add_snapshot(timestamp, countries):
    for code, (name, count) in countries.items():
        db.session.add(
            ProviderCount(
                timestamp=timestamp,
                country_code=code,
                country_name=name,
                provider_count=count,
            )
        )
    db.session.commit()


def test_growth_projection_uses_single_prior_snapshot(app, client):
    with app.app_context():
        add_snapshot("2026-08-27 12:00:00", {"cz": ("Czechia", 100)})
        add_snapshot("2026-08-28 12:00:00", {"cz": ("Czechia", 110)})
        add_snapshot("2026-08-29 12:00:00", {"cz": ("Czechia", 120)})

    response = client.get("/api/provider/growth-projection")
    assert response.status_code == 200
    assert response.json["current"] == 120
    assert response.json["daily_growth"] == 10
    assert response.json["growth_rate"] == round(10 / 110 * 100, 3)
    assert response.json["projected_30d"] == 420


def test_growth_projection_keeps_real_delta_when_previous_snapshot_is_zero(app, client):
    with app.app_context():
        add_snapshot("2026-08-28 12:00:00", {"cz": ("Czechia", 0)})
        add_snapshot("2026-08-29 12:00:00", {"cz": ("Czechia", 12)})

    response = client.get("/api/provider/growth-projection")
    assert response.status_code == 200
    assert response.json["daily_growth"] == 12
    assert response.json["growth_rate"] == 0.0


def test_at_risk_detects_country_absent_from_new_snapshot(app, client):
    with app.app_context():
        add_snapshot(
            "2026-08-28 12:00:00",
            {"cz": ("Czechia", 20), "xy": ("Exampleland", 7)},
        )
        add_snapshot("2026-08-29 12:00:00", {"cz": ("Czechia", 21)})

    response = client.get("/api/provider/at-risk")
    assert response.status_code == 200
    assert response.json["disappeared"] == [
        {
            "country_code": "xy",
            "country_name": "Exampleland",
            "last_seen_ts": "2026-08-28T12:00:00Z",
            "prev_count": 7,
        }
    ]


def test_provider_cache_key_includes_query_parameters(app, client):
    with app.app_context():
        add_snapshot("2026-08-29 11:00:00", {"cz": ("Czechia", 100)})
        add_snapshot("2026-08-29 12:00:00", {"cz": ("Czechia", 120)})

    strict = client.get("/api/provider/anomalies?threshold=30")
    permissive = client.get("/api/provider/anomalies?threshold=10")
    assert strict.json["anomalies"] == []
    assert len(permissive.json["anomalies"]) == 1
