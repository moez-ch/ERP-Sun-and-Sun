# Sun&Sun Lead ERP

A single-page React application for B2B lead management, prospecting, and pipeline tracking — built for **Sun&Sun** consultancy operations in Turkey.

## Overview

Sun&Sun Lead ERP is an internal tool for managing business leads across Turkish industries. It combines manual lead entry, XLS bulk import, AI-powered prospecting via **Lusha**, and email enrichment via **Snov.io** — all in one lightweight, browser-based interface with no backend required.

## Features

### Dashboard
- Live KPI cards: total leads, qualified leads, email coverage rate, average lead score
- Industry breakdown chart
- Status funnel visualization
- Top leads by score

### Lead Management
- Full CRUD: add, edit, delete leads
- Fields: name, title, company, industry, city, company size, email, phone, LinkedIn URL, website, needs, status, source, notes
- Real-time search across all fields
- Multi-filter: industry, status, city
- Lead scoring (0–100) based on profile completeness, industry fit, and status
- Auto-generated tags (Hot Lead, Export Candidate, etc.)

### Pipeline View
- Kanban-style board organized by lead status
- Statuses: New → Contacted → Qualified → Proposal Sent → Negotiation → Won / Lost
- Drag-free status update via inline controls

### AI Prospecting Agent (Lusha)
- Searches Lusha's B2B database by job title and location (Turkey)
- Two-step flow: search contacts → enrich with email, phone, LinkedIn
- Configurable: target job titles, cities, max leads per run
- Deduplication by LinkedIn URL or name+company
- Real-time log panel with status indicators

### Snov.io Enrichment Agent
- Authenticates via OAuth2 client credentials
- Targets existing leads that have a website but no email
- Uses Snov.io domain search to find matching contacts
- Merges found emails back into lead records

### XLS Import (SoGreen Format)
- Drag-and-drop or click-to-upload `.xlsx` / `.xls` files
- Parses SoGreen export column layout automatically
- Turkish sector names mapped to normalized industry categories
- Preview with stats (total rows, rows with contact info, rows with website only)
- Duplicate detection before import confirmation

### Settings
- Lusha API key storage (browser `localStorage`, never sent to any server)
- Snov.io Client ID / Client Secret storage
- All keys remain local to the browser session

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 |
| Build tool | Vite 5 |
| Spreadsheet parsing | SheetJS (`xlsx`) |
| Styling | Inline CSS-in-JS (no external CSS framework) |
| Icons | Inline SVG components |
| Fonts | DM Sans + JetBrains Mono (Google Fonts) |
| API proxying | Vite dev-server proxy (Lusha, Snov.io) |

## Project Structure

```
sunandsun/
├── index.html          # App shell
├── main.jsx            # React entry point
├── lead_erp.jsx        # Entire application (single-file architecture)
├── sns_logo.png        # Sun&Sun brand logo
├── vite.config.js      # Vite config + API proxy rules
├── package.json
└── package-lock.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
```

Static files are output to `dist/`. Since there is no backend, the built files can be served from any static host (Nginx, GitHub Pages, Vercel, Netlify, etc.).

> **Note:** API keys are stored in browser `localStorage`. The Vite proxy rules that forward `/api/lusha` and `/api/snov` requests are **dev-only**. For production, you need a reverse proxy or a thin serverless function to forward those requests and protect your API keys.

## API Keys

### Lusha
1. Sign up at [lusha.com](https://www.lusha.com) and obtain a Prospecting API key.
2. Open the app → **Settings** → paste your key in **Lusha API Key**.

### Snov.io
1. Sign up at [snov.io](https://snov.io) and create an API application to get a Client ID and Client Secret.
2. Open the app → **Settings** → fill in both fields.

## Industry & Needs Mapping

The app maps Turkish sector keywords to normalized English industry categories, and each industry is pre-wired to a set of relevant consulting needs:

| Industry | Example Needs |
|----------|--------------|
| Manufacturing | Lean Production, ISO Quality, Export Development |
| Software/IT | TÜBİTAK Projects, KOSGEB Grants, GDPR Compliance |
| Food & Beverage | Turquality, Export Development, ISO Quality |
| Textile & Fashion | Turquality, Brand Strategy, Export Development |
| Tourism & Hospitality | Digital Marketing, Brand Strategy, EU Grants |
| Agriculture | KOSGEB Grants, Investment Incentives, EU Grants |
| Healthcare | KVKK/GDPR Compliance, Investment Incentives |
| Energy | Investment Incentives, EU Grants, TÜBİTAK Projects |
| Construction | KOSGEB Grants, Investment Incentives, ISO Quality |
| Automotive | Lean Production, ISO Quality, TÜBİTAK Projects |
| Defense | TÜBİTAK Projects, Investment Incentives |
| Education | EU Grants, Digital Marketing, HR Consulting |

## Lead Scoring

Scores are computed automatically on every render:

| Factor | Points |
|--------|--------|
| Has email | +20 |
| Has phone | +15 |
| Has LinkedIn | +10 |
| Has website | +5 |
| Has job title | +10 |
| Industry filled | +10 |
| 1–3 needs filled | +10 |
| Status: Qualified | +10 |
| Status: Proposal / Negotiation | +15 |
| Status: Won | +20 |

## License

Internal tool — proprietary to Sun&Sun. Not licensed for external distribution.
