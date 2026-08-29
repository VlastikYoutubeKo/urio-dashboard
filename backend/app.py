"""Flask application factory for the URnetwork dashboard."""

from __future__ import annotations

import logging
import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.middleware.proxy_fix import ProxyFix
from sqlalchemy import text

from backend.config import default_app_config, load_environment
from backend.models import db, ensure_database_indexes
from backend.routes import api_bp
from backend.scheduler import init_scheduler
from backend.security import csrf_token, migrate_legacy_account_credentials, prepare_security_material

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def create_app(config_overrides: dict | None = None) -> Flask:
    """Create the dashboard app without relying on import-time configuration."""
    # Tests and container deployments may keep their private .env file outside
    # the source tree. Load that explicit path before deriving configuration.
    load_environment((config_overrides or {}).get("ENV_FILE"))

    project_root = Path(__file__).resolve().parent.parent
    frontend_dist = project_root / "frontend" / "dist"
    app = Flask(__name__, static_folder=str(frontend_dist), static_url_path="")
    app.config.from_mapping(default_app_config())
    if config_overrides:
        app.config.update(config_overrides)

    Path(app.config["INSTANCE_DIR"]).mkdir(parents=True, exist_ok=True)

    if app.config["TRUST_PROXY_HEADERS"]:
        # Enable this only behind a reverse proxy that strips client-supplied
        # forwarding headers. It is intentionally off by default.
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    configured_origins = app.config["CORS_ALLOWED_ORIGINS"]
    if isinstance(configured_origins, str):
        configured_origins = tuple(origin.strip() for origin in configured_origins.split(",") if origin.strip())
    allowed_origins = tuple(origin for origin in configured_origins if origin != "*")
    if len(allowed_origins) != len(configured_origins):
        logging.warning("Ignoring wildcard CORS origin because API sessions use credentials.")
    if allowed_origins:
        CORS(
            app,
            resources={r"/api/*": {"origins": list(allowed_origins)}},
            supports_credentials=True,
            allow_headers=["Content-Type", "X-CSRF-Token"],
            methods=["GET", "POST", "OPTIONS"],
            max_age=600,
        )

    db.init_app(app)
    app.register_blueprint(api_bp, url_prefix="/api")

    with app.app_context():
        prepare_security_material(app)
        db.create_all()
        ensure_database_indexes()
        migrate_legacy_account_credentials(app)

    init_scheduler(app)

    @app.get("/healthz")
    def healthcheck():
        """Minimal unauthenticated liveness/readiness endpoint for a proxy."""
        try:
            db.session.execute(text("SELECT 1"))
        except Exception:
            logging.exception("Health check database query failed.")
            return jsonify({"status": "unavailable"}), 503
        return jsonify({"status": "ok"})

    @app.after_request
    def add_security_headers(response):
        # Dynamic admin and financial responses must not be retained by shared
        # caches. Public provider metrics can still be cached by their route.
        if request.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
            # Do not create a session cookie merely because an anonymous visitor
            # reads a public API endpoint. The bootstrap status endpoint and all
            # existing sessions still receive a token. A 401 additionally gets a
            # fresh token so an expired session can immediately sign in again.
            if request.path == "/api/status" or session or response.status_code == 401:
                response.headers.setdefault("X-CSRF-Token", csrf_token())

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")

        if response.mimetype == "text/html":
            response.headers.setdefault(
                "Content-Security-Policy",
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https://*.basemaps.cartocdn.com; "
                "connect-src 'self' https://api.bringyour.com; "
                "font-src 'self' data:; "
                "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
            )
        if app.config["ENABLE_HSTS"] and request.is_secure:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.errorhandler(RequestEntityTooLarge)
    def request_too_large(_error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Request body is too large."}), 413
        return "Request body is too large.", 413

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Not found."}), 404
        # BrowserRouter routes should resolve to the SPA entry point, whereas
        # real API mistakes must stay JSON 404s.
        index_file = Path(app.static_folder or "") / "index.html"
        if index_file.exists():
            return send_from_directory(app.static_folder, "index.html")
        return "Frontend assets have not been built. Run npm run build in frontend/.", 503

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve(path: str):
        static_root = Path(app.static_folder or "")
        requested_file = static_root / path
        if path and requested_file.is_file():
            return send_from_directory(app.static_folder, path)
        index_file = static_root / "index.html"
        if index_file.exists():
            return send_from_directory(app.static_folder, "index.html")
        return "Frontend assets have not been built. Run npm run build in frontend/.", 503

    return app


if __name__ == "__main__":
    # The development runner is useful locally. Production deployment is
    # documented with Gunicorn/Docker in the repository README.
    create_app().run(host="0.0.0.0", port=int(os.getenv("PORT", "90")), debug=False)
