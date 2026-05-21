# Project Overview
UrNetwork Stats Dashboard is a Python Flask web application designed to track, log, and display BringYour.io bandwidth usage statistics. 

The repository currently contains two versions of the application:
1. **Enhanced Multi-Account Edition (Root Directory):** Located in `main.py`. This is a more advanced version featuring multi-account support, a React-based private dashboard, global leaderboards, device management, webhooks, and internationalization (i18n).
2. **Single-Account Legacy Edition (`good/` Directory):** Located in `good/app.py`. A simpler version focused on tracking a single account, with basic Bootstrap UI and dark/light mode toggle.

Both versions use SQLite for persistent data storage, SQLAlchemy as the ORM, and APScheduler to periodically fetch and log data from the BringYour API. A `migrate.py` script is provided to upgrade the SQLite database from the single-account structure to the multi-account structure.

# Building and Running

## Enhanced Multi-Account Edition (`main.py`)
1. **Dependencies:** Install the required Python packages (e.g., Flask, flask_sqlalchemy, flask_apscheduler, requests, python-dateutil).
2. **Environment:** The application uses a `.env` file for configuration. It features a built-in setup wizard. If no configuration is detected, visiting the app in a browser will redirect you to an `/install` route to set an admin password.
3. **Execution:** Run the application using standard Python: `python main.py`.

## Legacy Single-Account Edition (`good/app.py`)
1. **Dependencies:** Listed in `good/requirements.txt`. Install via `pip install -r good/requirements.txt`.
2. **Environment:** Copy `good/.env.example` to `good/.env` and configure your `UR_USER` and `UR_PASS` (or `UR_JWT`).
3. **Execution:** 
   - **Locally:** Run `python good/app.py` (binds to port 92 by default).
   - **Docker:** The `good/` directory contains a `Dockerfile`. You can build and run it using:
     ```bash
     docker build -t urnetwork-stats-dashboard good/
     docker run -d --env-file good/.env -p 90:92 --name urnetwork-stats-dashboard urnetwork-stats-dashboard
     ```

# Development Conventions
- **Frameworks:** Built on Flask, with SQLite databases typically stored in an `instance/` directory (`instance/transfer_stats.db`).
- **Scheduling:** APScheduler is used to run background jobs (e.g., fetching stats every 15 minutes, cleaning up old stats daily).
- **Frontend (Main App):** Uses vanilla HTML/CSS/JS for the public view and React (via CDN and Babel standalone) for the private admin dashboard.
- **Frontend (Legacy App):** Uses server-side rendered HTML with Bootstrap 5.
- **Security:** Credentials and sensitive settings are managed via `.env` files. The main app hashes/manages access via an admin password set during installation.
- **API Integration:** Makes HTTP requests to the `api.bringyour.com` endpoints with built-in retry logic.