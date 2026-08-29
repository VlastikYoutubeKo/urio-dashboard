# Project overview

URnetwork Stats Dashboard is a self-hosted Flask API and React single-page
application for tracking BringYour/URnetwork usage, accounts, devices, wallets,
provider history, and optional Discord webhooks.

## Architecture

- `main.py` exposes the WSGI application (`main:app`) and local development
  entry point.
- `backend/app.py` contains the Flask application factory.
- `backend/routes.py` contains the JSON API and public provider analytics.
- `backend/scheduler.py` contains collection, retention, and webhook jobs.
- `backend/ur_api.py` is the defensive client for `api.bringyour.com`.
- `frontend/` is the Vite/React application; built assets are served by Flask.
- `tests/` contains isolated SQLite regression and security tests.

## Development

Use Python 3.11+ and Node.js 22+:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
(cd frontend && npm ci)

python -m pytest -q
(cd frontend && npm run lint && npm run build)
```

For local development, keep the scheduler out of the web process unless testing
jobs explicitly:

```bash
RUN_SCHEDULER=false python main.py
(cd frontend && npm run dev -- --host 0.0.0.0)
```

The browser must use relative `/api` paths. Vite proxies those requests to the
local Flask server during development.

## Security and operations

- Never commit `.env`, database files, tokens, passwords, or webhook URLs.
- The setup wizard writes a password hash, Flask secret, and credential
  encryption key to the private environment file. Back up that file with the
  database.
- All unsafe API routes require a CSRF token from `/api/status`.
- Only one process may run with `RUN_SCHEDULER=true`; all additional Gunicorn
  workers/replicas must disable it.
- See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Docker, reverse proxy,
  CORS, backup, and production configuration guidance.
