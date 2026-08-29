"""Development and WSGI entry point for the dashboard."""

from __future__ import annotations

import os

from backend.app import create_app

# Gunicorn imports this object as ``main:app``. Keep the Docker deployment at a
# single worker when its in-process scheduler is enabled; see DEPLOYMENT.md.
app = create_app()


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "90")),
        # Avoid Werkzeug's reloader starting a second in-process scheduler.
        # Use a separate development process with RUN_SCHEDULER=false for live reload.
        debug=False,
    )
