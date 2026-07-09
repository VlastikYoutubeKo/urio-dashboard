# Changelog

All notable changes to the **UrNetwork Stats Dashboard** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.3] - 2026-07-09

### Added
- **Automated Device Cleanup:** Configured a `cleanup_offline_devices_job` background task that tracks native BringYour API connection timestamps (`auth_time`) and automatically removes offline devices inactive for more than 7 days, keeping the dashboard clean.

### Changed
- **Payout Amount Calculation:** Switched payout history from using generic estimations to parsing the exact `token_amount` directly from UrNetwork API receipts to reflect the true monetary amount paid out.
- **Dashboard Earnings Estimate:** Renamed "Total Earnings & Pending" to "Total Earnings & Estimate" and added explicit explanations that pending sums are extrapolated from current unswiped bytes and recent averages, eliminating user confusion.
- **Device Management:** Fixed JSX translation string interpolation in device pagination text ("Showing X to Y of Z devices") that previously rendered as raw, broken React template strings.

## [1.1.2] - 2026-05-26

### Fixed
- **API Routing Conflict:** Removed a duplicated blueprint configuration that was overriding the newly implemented Provider tracking analytics with outdated code from the original `routes.py` implementation.
- **Historical Data Calculation:** Fixed a critical SQL correlation bug in `provider_movers_detailed` and `provider_summary` endpoints where the use of `SUM(provider_count)` was summing all historical records instead of the single historical record matching the target timeframe window. This resolves the impossibly large negative 1h and 24h delta values.
- **Movers Table Sorting:** Added a secondary sorting key based on the absolute number of providers. When changes (deltas) are equal across regions, the Movers table now properly ranks the countries with the largest overall provider network size first.

## [1.1.1] - 2026-05-25

### Fixed
- **Hallucinated Public Stats:** Completely removed the fabricated `/stats/last-90` API endpoint and its associated non-existent global UI stats cards.
- **Provider Analytics Alignment:** Ported genuine SQLite querying logic directly from the original `provider-tracking` reference repository, guaranteeing the UI perfectly reflects the actual stored hourly tracker numbers.

## [1.1.0] - 2026-05-25

### Added
- **Providers Dashboard (`/providers`):** A premium, fully animated multi-tab tracking interface featuring global provider aggregates, growth charts, moving averages, daily churn monitoring, outage detection alerts, and side-by-side country capacity comparisons.
- **About Project Page (`/about`):** An educational page explaining **ur.io (UrNetwork)** node sandboxing and residential proxy sharing, featuring modern custom vector badges and interactive accordion FAQs.
- **Browser Language Auto-Detection:** Automatically reads the client's system languages on first visit to default to Czech/Slovak (`cs`) or fallback to English (`en`).
- **Unified Provider Tracking Scheduler:** Configured a cron-based APScheduler background polling job in `backend/scheduler.py` to collect snapshots hourly and clean records older than 90 days.
- **Changelog Button in About View:** Added a direct "Zápis změn (Changelog)" button to the **About Project** page linking to this repository's changelog, making recent release summaries easily accessible from inside the application.

### Changed
- **Full App-Wide Bilingual Localization (CS/EN):** Replaced hardcoded English text blocks with a dynamic translation state (`lang`) across all pages, forms, tables, and settings, resolving the previous language mix:
  - **Public Dashboard:** Dynamic charts, world map tooltip density, and statistics cards.
  - **Login & Initial Setup:** Translating credential inputs, onboarding flows, and validation warnings.
  - **Account Management:** Table statuses, actions, nicknames, and deletion prompts.
  - **Webhook Settings:** Summary intervals (e.g. Every 30 Minutes, Hourly, Daily), trigger checkboxes, JSON payloads, and delete modals.
  - **Owner Dashboard Panels:** Localizing all 7 administrative sections (Overview, Network & Referrals, Devices, API Keys, Wallets, Preferences, Feedback).
- **Corrected Metric Explanations:** Clarified "Paid" vs "Unpaid" data metrics to match correct system payouts:
  - **Paid:** Bytes that have already been paid out to the provider.
  - **Unpaid:** Bytes provided but not yet paid by the system.
- **Payout FAQ Alignment:** Corrected payout text in `AboutProject.jsx` to state that earnings are paid out **exclusively in USDC on the Solana blockchain**.

### Fixed
- **Webhook Interval Shifting:** Swapped the elapsed time delta calculation with a bulletproof clock-aligned cron trigger check. Periodic webhooks will now trigger exactly at the clock marks (e.g. `:00` and `:30` for 30m, `:00` for 1h) without shifting or drifting due to server restarts.
- **Vite React Frontend Syntax:** Resolved a redundant closing bracket duplicate (`);`) inside `frontend/src/App.jsx` that was breaking production builds.

### Added
- **Vite/HTML Head Metadata:** Added full OpenGraph/Twitter Card tags and `og:site_name` metadata to `index.html` to ensure links shared on Discord show a gorgeous card embed preview.
