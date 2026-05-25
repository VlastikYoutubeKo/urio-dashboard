# URnetwork Stats Dashboard (Redesigned)

A modern, SaaS-grade dashboard for tracking and managing bandwidth usage on the URnetwork (BringYour.io). This version features a sleek React-based single-page application (SPA) with a powerful Flask backend, real-time data streaming, and comprehensive management tools.

## Key Features

- **Modern Dark UI:** A refined, Vercel-inspired interface with a responsive sidebar and interactive charts.
- **Real-Time Device Streaming:** View thousands of devices instantly using Server-Sent Events (SSE) and concurrent fetching.
- **Comprehensive Analytics:** Track paid vs. unpaid data, 90-day network growth, and individual device statistics.
- **Account Management:** Manage multiple URnetwork accounts, API keys, payout wallets, and referral networks.
- **Interactive Global Map:** Visualize provider distribution worldwide with an interactive country density map.
- **Robust Caching:** Built-in backend caching (TTLCache) prevents API rate-limiting and ensures high performance.
- **Management Tools:** Easily rename devices, update provide modes, and manage blocked locations directly from the dashboard.
- **Bilingual Localization:** Full Czech and English language support with automatic browser locale detection and instant dynamic toggling.
- **Rich Discord Embed Previews:** Optimized OpenGraph and Twitter Card metadata for premium, visual link previews when shared on Discord.

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Recharts, React-Leaflet, Lucide React.
- **Backend:** Flask, Flask-SQLAlchemy, Flask-APScheduler, Cachetools, Requests.
- **Database:** SQLite (persisted in `instance/transfer_stats.db`).

---

## Getting Started

### 1. Prerequisites
- Python 3.8+
- Node.js (for building the frontend)
- `pip` and `npm`

### 2. Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/VlastikYoutubeKo/urio-dashboard.git
    cd urio-dashboard
    ```

2.  **Setup Backend:**
    Install Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Setup Frontend:**
    Install Node dependencies and build the production assets:
    ```bash
    cd frontend
    npm install
    npm run build
    cd ..
    ```

### 3. Running the Application

Start the Flask server:
```bash
python main.py
```
By default, the application will be available at **`http://127.0.0.1:90`**.

---

## Initial Setup (Installation Wizard)

When you first visit the dashboard, you will be redirected to the `/install` page.
1. Set an **Admin Password**. This password will be required for all private dashboard actions.
2. Once installed, a `.env` file will be created in your root directory.
3. Log in using your admin password.
4. Go to the **Accounts** page to add your URnetwork credentials.

---

## Project Structure

- `main.py`: The entry point for the application.
- `backend/`: The Python Flask API backend.
- `frontend/`: The React source code.
- `frontend/dist/`: The built frontend assets (served by Flask).
- `instance/`: Directory for the SQLite database and backups.

## Deployment Notes

- **Port Configuration:** The application defaults to port 90. You can change this in `main.py`.
- **Environment Variables:** Credentials and the admin password hash are stored in the `.env` file. **Do not share this file.**
- **Database Backups:** It is recommended to regularly back up the `instance/transfer_stats.db` file.

## Credits & Attributions

- **Developed Entirely with AI:** This redesigned version of the dashboard was conceptualized, architected, and coded entirely using AI.
- **Original Basis:** Before the full SaaS redesign, this project was based on the original code by [techroy23/UrNetwork-Stats-Dashboard](https://github.com/techroy23/UrNetwork-Stats-Dashboard).

---

## License
This project is for personal use with the URnetwork API. See the [Mozilla Public License 2.0](https://mozilla.org/MPL/2.0/) for library dependencies.
