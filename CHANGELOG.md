# Changelog

All notable changes to the **UrNetwork Stats Dashboard** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-05-25

### Added
- **Providers Dashboard (`/providers`):** A premium, fully animated multi-tab tracking interface featuring global provider aggregates, growth charts, moving averages, daily churn monitoring, outage detection alerts, and side-by-side country capacity comparisons.
- **About Project Page (`/about`):** An educational page explaining **ur.io (UrNetwork)** node sandboxing and residential proxy sharing, featuring modern custom vector badges and interactive accordion FAQs.
- **Browser Language Auto-Detection:** Automatically reads the client's system languages on first visit to default to Czech/Slovak (`cs`) or fallback to English (`en`).
- **Unified Provider Tracking Scheduler:** Configured a cron-based APScheduler background polling job in `backend/scheduler.py` to collect snapshots hourly and clean records older than 90 days.

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
- **Webhook Rescheduling:** Shifted `periodic_summary_job` from random `:05` and `:35` minutes to run precisely at `:00`, `:15`, `:30`, and `:45` of every hour, matching the core stats logging schedule.
- **Vite React Frontend Syntax:** Resolved a redundant closing bracket duplicate (`);`) inside `frontend/src/App.jsx` that was breaking production builds.
