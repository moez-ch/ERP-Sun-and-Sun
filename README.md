# Sun & Sun ERP System

Internal business management platform for Sun & Sun, built as a single web application covering CRM, contracts, bulk email, price quoting, and AI-assisted document scanning.

---

## What It Does

The ERP replaces scattered tools (spreadsheets, email drafts, manual PDF creation) with one unified system that the Sun & Sun team uses daily. It connects to Monday.com for contact management, generates and stores contracts as PDFs, sends bulk emails with personalized signatures, and produces client-ready price quote slides that merge directly into Canva presentations.

---

## How to Start It

**Normal startup (one double-click):**

```
Double-click  start.bat
```

This pulls the latest code from GitHub, installs any new dependencies, starts both the backend server and the frontend, and opens the browser automatically at `http://localhost:5174`.

**If the ML/OCR service is needed (for tax certificate scanning):**

```
python ml_service/app.py
```

This starts a separate Python service on port 8000. It only needs to be running when OCR features are used.

**Login credentials (default admin):**

| Field    | Value                         |
|----------|-------------------------------|
| Email    | moez.cherni@sunandsun.com.tr  |
| Password | admin123                      |

---

## System Architecture

```
Browser (React frontend)
        │
        ▼
Node.js / Express backend  ──────►  SQLite database (erp_auth.db)
        │
        ├──► Monday.com API         (CRM contact data)
        ├──► SendGrid API           (bulk email delivery)
        ├──► Canva API (OAuth2)     (presentation integration)
        ├──► LibreOffice            (Word .docx → PDF conversion)
        ├──► Puppeteer + Edge       (HTML → PDF conversion)
        └──► Python FastAPI ML      (OCR via EasyOCR, port 8000)
```

- **Frontend**: React 18 + Vite — runs on port 5174
- **Backend**: Node.js + Express — runs on port 3001
- **Database**: SQLite (single file, no server installation needed)
- **Auth**: JWT tokens + bcrypt password hashing

---

## Modules

### 1. Authentication
Role-based login system. Two roles:
- **Admin** — full access including user management and template management
- **User** — standard access to all operational features

### 2. CRM (Monday.com Integration)
Pulls all contact and company data from the Sun & Sun Monday.com board.

Features:
- View contacts and companies with full field details
- Column titles automatically translated from Turkish to English
- Filter by tag, company, or free-text search
- Detect and merge duplicate contacts
- Bulk email directly from the contact list

### 3. Bulk Email
Send personalized emails to multiple contacts in one action.

Features:
- Saved email templates stored in the database
- Automatic sender signature selection (Merve or Ahmet) based on template settings
- Salutation logic adapts per recipient
- Tracks sent campaigns and bounce history
- Delivered via SendGrid

### 4. Contracts
Upload contract templates (.docx or .html files) with `@@variable@@` placeholders, then fill them in through a form to generate a signed PDF.

Features:
- Supports up to 3 parties, each with their own fields
- OCR scanning of tax certificates to auto-fill party details (uses the ML service)
- Payment schedule table (EK-1 attachment)
- Multi-program contract blocks (up to 3 programs per contract)
- PDF generation: LibreOffice for Word templates, Puppeteer+Edge for HTML templates
- Optional: merge the generated contract page into a Canva presentation at a specific slide position
- Full English / Turkish interface

### 5. Contracts Reporting
View and filter all contracts that have been generated.

Features:
- Filter by date range and preparer name
- Results grouped by template type
- Displays total contract values in TL + KDV

### 6. Price Quote
Generate a client-facing price quote slide and merge it into a selected Canva presentation.

Features:
- Supports 1, 2, or 3 program options on a single slide
- Two visual themes: **Blue** (dark navy + red) and **Green** (dark green + navy)
- Each option shows: title badge, down payment, success fee(s), and notes
- Select a presentation from a curated list of 33 Canva presentations grouped by category (KOSGEB, TÜBİTAK, Ticaret Bakanlığı, Kalkınma Ajansı, etc.)
- Slide is inserted at the second-to-last page of the selected presentation
- If Canva is not connected, a standalone PDF is returned instead
- Admin can add or remove presentations from the list by pasting a Canva link

### 7. OCR / ML Service
A Python-based service (FastAPI + EasyOCR) that reads tax certificates and extracts structured data.

Features:
- Accepts uploaded image files
- Preprocesses image for better accuracy (contrast, sharpening, grayscale)
- Fuzzy-matches tax office names against a known list
- Returns extracted fields (tax number, company name, tax office, address)
- Lazy-loads the EasyOCR model on first use to keep startup fast

---

## External Services & Credentials

| Service    | Purpose                           | Where configured    |
|------------|-----------------------------------|---------------------|
| Monday.com | CRM data source                   | `.env` file         |
| SendGrid   | Email delivery                    | `.env` file         |
| Canva      | Presentation integration (OAuth2) | Settings tab in app |

The `.env` file in the project root holds all API keys. It is never committed to GitHub.

---

## Key Files and Folders

```
ERP-Sun-and-Sun/
├── server.js                  ← All backend API routes (Node.js/Express)
├── lead_erp.jsx               ← Entire frontend (React, single file)
├── vite.config.js             ← Frontend build configuration
├── start.bat                  ← One-click startup script
├── erp_auth.db                ← SQLite database (not in GitHub)
├── .env                       ← API keys and secrets (not in GitHub)
│
├── ml_service/
│   ├── app.py                 ← FastAPI server for OCR
│   └── classifier.py          ← EasyOCR preprocessing pipeline
│
├── pricing_1program.html      ← Price quote slide template (1 option)
├── pricing_2programs.html     ← Price quote slide template (2 options)
├── pricing_3programs.html     ← Price quote slide template (3 options)
│
├── Pricing_1Program_template.docx   ← Word-based pricing template
├── Pricing_2Programs_template.docx
├── Pricing_3Programs_template.docx
│
└── tmp_contracts/             ← Temporary folder for generated PDFs
                                  (auto-cleared, not in GitHub)
```

---

## Database Tables (overview)

| Table                   | Stores                                            |
|-------------------------|---------------------------------------------------|
| `users`                 | Login accounts and roles                          |
| `email_templates`       | Saved bulk email templates                        |
| `campaigns`             | History of sent email campaigns                   |
| `contracts`             | Generated contract records                        |
| `contract_templates`    | Uploaded .docx / .html template files             |
| `canva_config`          | Canva OAuth2 tokens and client credentials        |
| `canva_designs`         | Registered Canva designs for contract integration |
| `program_presentations` | Curated presentation list for Price Quote tab     |

---

## Pending Items

- Upload social media images (Instagram, LinkedIn logos) to WordPress so email signatures display correctly
- Connect a Tally form to Google Sheets for lead capture
- Provide shared inbox credentials so the Inbox tab can fetch emails automatically
- Add labelled training samples to `ml_service/data/` to improve OCR classifier accuracy
- Register remaining Sun Group company tax certificates in Settings
- Upload tagged contract templates through the Contracts → Manage Templates screen

---

## Troubleshooting

| Problem                       | Fix                                                                    |
|-------------------------------|------------------------------------------------------------------------|
| App won't open / port in use  | Run `taskkill /F /IM node.exe` in terminal, then restart `start.bat`  |
| OCR not working               | Start the ML service: `python ml_service/app.py`                      |
| Canva features not working    | Go to Settings → reconnect Canva account                              |
| Contracts PDF blank / error   | Ensure LibreOffice is installed at `C:\Program Files\LibreOffice\`    |
| Email not delivering          | Check SendGrid API key in `.env` file                                 |
