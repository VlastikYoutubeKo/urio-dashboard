# Production deployment

This dashboard stores an administrator password hash, an encryption key for
URnetwork credentials, and historical usage data. Treat the host and its data
volume as private infrastructure.

## Before exposing the dashboard

1. Build the frontend and use a production WSGI server; do **not** use Flask's
development server on the public internet.
2. Put the application behind HTTPS. The session cookie is secure by default
   when `APP_ENV=production`, so an HTTP-only deployment cannot log in safely.
3. Keep the application port private (loopback or an internal network), then
   expose only the TLS reverse proxy.
4. Keep exactly one process with `RUN_SCHEDULER=true`. The scheduler is
   in-process and must not run in every Gunicorn worker or replica.
5. Back up both the SQLite database **and** the private environment file. The
environment file includes the encryption key needed to read stored account
credentials.

## Docker Compose

The included [`compose.yaml`](../compose.yaml) builds the React application,
runs Gunicorn as an unprivileged user, mounts a persistent `/data` volume, and
binds the service only to `127.0.0.1:8000`.

```bash
docker compose up -d --build
```

Configure a TLS proxy on the host. A minimal Caddy example is:

```caddyfile
dashboard.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

The Compose configuration enables `TRUST_PROXY_HEADERS=true` because only this
trusted local proxy can reach the container's published port. Do not enable it
when clients can connect to the Flask/Gunicorn port directly: spoofed
forwarding headers could otherwise affect HTTPS detection and client logging.

On first visit, complete the installation wizard through the HTTPS hostname.
It writes `/data/.env` with mode `0600` and creates `/data/transfer_stats.db`.
Back up both files together. Do not move a database to another host without the
matching `.env`, or encrypted upstream account credentials cannot be recovered.

For a separately hosted frontend, set `CORS_ALLOWED_ORIGINS` to a
comma-separated list of exact HTTPS origins, for example:

```dotenv
CORS_ALLOWED_ORIGINS=https://dashboard.example.com,https://admin.example.com
```

Never use `*` with credentialed sessions.

## Native deployment

Requirements: Python **3.11+** and Node.js **22+**.

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
(cd frontend && npm ci && npm run build)

# Store secrets outside the repository if possible.
export URIO_ENV_FILE=/srv/urio-dashboard/.env
export INSTANCE_DIR=/srv/urio-dashboard/data/instance
export DATABASE_URL=sqlite:////srv/urio-dashboard/data/transfer_stats.db
export APP_ENV=production
export SESSION_COOKIE_SECURE=true
export ENABLE_HSTS=true
export RUN_SCHEDULER=true

gunicorn --workers 1 --threads 4 --bind 127.0.0.1:8000 main:app
```

Create the parent directories with ownership for the service user before
starting Gunicorn. The first installation requires write access to
`URIO_ENV_FILE`; after setup it should be owned by that service user with mode
`0600`.

If web traffic needs more workers, run them in a second process with
`RUN_SCHEDULER=false`, or move the scheduler to a dedicated one-worker process:

```bash
# scheduler process
RUN_SCHEDULER=true gunicorn --workers 1 --threads 2 --bind 127.0.0.1:8001 main:app

# web process(es), no scheduler
RUN_SCHEDULER=false gunicorn --workers 3 --threads 4 --bind 127.0.0.1:8000 main:app
```

Do not publicly expose the scheduler-only listener. A future external job queue
can replace this two-process arrangement for multi-host deployments.

## Configuration reference

Copy [`.env.example`](../.env.example) as a starting point. Environment
variables supplied by the service manager override values in that file.

| Variable | Purpose |
| --- | --- |
| `URIO_ENV_FILE` | Private file used for generated `SECRET_KEY`, password hash, and credential encryption key. Defaults to `.env` in the repository. |
| `DATABASE_URL` | SQLAlchemy database URL. SQLite is appropriate for one host/process; use a managed database and migration plan before multi-host scaling. |
| `INSTANCE_DIR` | Directory created for application-local files. |
| `APP_ENV` | Set to `production` in real deployments. Enables secure cookie and HSTS defaults. |
| `SESSION_COOKIE_SECURE` | Keep `true` behind HTTPS. Set `false` only for local HTTP development. |
| `TRUST_PROXY_HEADERS` | Enable only behind a proxy that strips and supplies forwarding headers. |
| `CORS_ALLOWED_ORIGINS` | Exact, comma-separated origins for a separate frontend. Empty by default. |
| `RUN_SCHEDULER` | Enables collection, notification, and retention jobs in this process. Exactly one process should set it to `true`. |
| `AUTO_REMOVE_OFFLINE_DEVICES` | Dangerous-by-default setting; remains `false` until explicitly enabled. |
| `STATS_RETENTION_DAYS` / `PROVIDER_STATS_RETENTION_DAYS` | Retention windows for local account and provider snapshots. |
| `WEBHOOK_ALLOWED_HOSTS` | HTTPS Discord-compatible webhook host allowlist, used to prevent server-side request forgery. |

## Upgrades and backups

1. Back up the database and private environment file.
2. Build the new frontend and install updated Python dependencies.
3. Stop the old process, deploy the new code, and start it again.
4. Inspect the application logs for additive schema/index upgrade messages.
5. Verify `/api/status` through the proxy and log in.

For SQLite, stop writes before copying the database, or use SQLite's backup
command. Keep database backups encrypted and access-controlled: usage history
and encrypted credentials are still sensitive data.

## Local development

Use two processes: Flask without its scheduler and Vite with its `/api` proxy.
The browser talks only to Vite using relative `/api` URLs; Vite forwards those
requests to Flask.

```bash
RUN_SCHEDULER=false python main.py
(cd frontend && npm run dev -- --host 0.0.0.0)
```

For local HTTP testing, set `APP_ENV=development` or
`SESSION_COOKIE_SECURE=false`. Never carry that setting into production.
