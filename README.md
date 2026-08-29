# URnetwork Stats Dashboard

A self-hosted React + Flask dashboard for monitoring and managing URnetwork
(BringYour) accounts, devices, wallets, provider distribution, and optional
Discord webhooks.

> **Privacy and security:** this application is intended for a single owner or
> trusted administrator. It stores encrypted upstream account credentials and
> usage history. Keep the host, database, and secret file private.

## Features

- Account-level paid/unpaid transfer history and aggregated charts.
- Device, API key, wallet, referral, and preference management.
- Public provider analytics with historical growth, regional views, movers, and
  at-risk country detection.
- Public dashboard privacy controls: financial/account aggregates remain private
  unless the owner explicitly enables aggregate publication.
- Validated Discord-compatible webhooks with HTTPS host allowlisting.
- CSRF-protected session authentication, password hashing, rate-limited login,
  encrypted stored upstream credentials, and security response headers.
- Czech and English UI.

## Quick start (local development)

Requirements: Python **3.11+** and Node.js **22+**.

```bash
git clone https://github.com/VlastikYoutubeKo/urio-dashboard.git
cd urio-dashboard

python -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt

(cd frontend && npm ci && npm run build)
RUN_SCHEDULER=false python main.py
```

Open `http://127.0.0.1:90`, complete the installation wizard, then add
URnetwork accounts from the private Accounts page. The wizard creates a private
`.env` file containing a random Flask secret, an administrator password hash,
and the credential-encryption key. It is written with mode `0600` and is
ignored by Git.

For frontend live development, run Vite separately; its proxy keeps browser API
calls relative rather than targeting localhost directly:

```bash
RUN_SCHEDULER=false python main.py
(cd frontend && npm run dev -- --host 0.0.0.0)
```

## Quality checks

```bash
python -m pytest -q
(cd frontend && npm run lint && npm run build)
```

Run these backend and frontend checks before opening a pull request.

## Production

Use Docker Compose or Gunicorn behind an HTTPS reverse proxy. The full secure
deployment guide, backup procedure, scheduler topology, and configuration
reference are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```bash
docker compose up -d --build
```

The included Compose file binds the application only to `127.0.0.1:8000`; put
Caddy, nginx, or another trusted TLS proxy in front of it. Do not expose Flask
or Gunicorn directly to the internet.

### Important operational constraints

- Keep exactly **one** process with `RUN_SCHEDULER=true`. Additional web workers
  must set it to `false`.
- Back up both the database and the private environment file. The encryption key
  in that file is required to decrypt existing account credentials.
- Keep `SESSION_COOKIE_SECURE=true` and use HTTPS in production.
- Leave `CORS_ALLOWED_ORIGINS` blank for the bundled same-origin frontend. If a
  separate frontend is necessary, set only exact trusted HTTPS origins—never
  `*`.
- `AUTO_REMOVE_OFFLINE_DEVICES` is disabled by default because it removes
  upstream devices; enable it only after understanding the impact.

## Configuration

Copy [`.env.example`](.env.example) as a documented template. Do not commit a
real `.env` file or paste its values into support tickets. See the deployment
guide for every setting and safe deployment examples.

## License

This project is for personal use with the URnetwork API. See the
[Mozilla Public License 2.0](https://mozilla.org/MPL/2.0/) for library
dependencies.
