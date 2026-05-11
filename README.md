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
- **Admin** — full access including user management, template management, and company/IBAN settings
- **User** — standard access to all operational features

### Navigation
The left sidebar is collapsible. Click the **‹** arrow in the header to collapse it to icon-only mode (56px), and the **›** arrow to expand it back. Each icon shows a tooltip on hover when collapsed.

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

#### Contract Template Placeholders

When preparing a `.docx` contract file, use these tags exactly as written — the system detects and fills them automatically.

| Placeholder | What it represents |
|---|---|
| `@@party1_name@@` | Sun & Sun company name (auto-filled from Settings) |
| `@@party1_tax_office@@` | Sun & Sun tax office (auto-filled from Settings) |
| `@@party1_tax_no@@` | Sun & Sun tax number (auto-filled from Settings) |
| `@@party1_address@@` | Sun & Sun address (auto-filled from Settings) |
| `@@party2_name@@` | Client company name |
| `@@party2_tax_office@@` | Client tax office |
| `@@party2_tax_no@@` | Client tax number |
| `@@party2_address@@` | Client address |
| `@@contract_date@@` | Date the contract is signed |
| `@@iban@@` | Sun & Sun bank IBAN — auto-filled from the selected company's default IBAN |
| `@@down_payment@@` | Upfront service fee amount (e.g. `50000 TL + KDV`) |
| `@@success_bonus@@` | Success fee percentage (e.g. `3`) |
| `@@program_name@@` | Name of the first / main program |
| `@@program2_name@@` | Name of the second program |
| `@@program2_fee@@` | Service fee for the second program |
| `@@program2_bonus@@` | Success fee for the second program |
| `@@program3_name@@` | Name of the third program |
| `@@program3_fee@@` | Service fee for the third program |
| `@@program3_bonus@@` | Success fee for the third program |
| `@@notes@@` | General notes or additional terms |
| `@@payment_schedule@@` | ⚠ Special — replaced by a full EK-1 payment schedule table |

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

### 7. Settings (Admin only)
Manage system-wide configuration. Only visible to admin users.

**Sun Group Companies**
Each company used as Party 1 in contracts is managed here:
- Add / edit / delete companies (name, short name, tax office, tax number, address)
- Mark one company as **Default** — it is automatically pre-selected when opening the Contracts form
- Each company supports **multiple IBANs**: add as many as needed with an optional label (e.g. "Garanti", "İş Bankası"), mark one as the default IBAN, and remove any that are no longer needed
- When generating a contract, the default IBAN fills automatically; if the company has multiple IBANs a dropdown appears to switch for that specific contract

**Other settings panels**
- SendGrid API key, sender name and email
- Monday.com API key and board IDs
- Twilio and Vapi configuration for cold calling
- Canva OAuth2 connection

### 8. OCR / ML Service
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

| Table                   | Stores                                                        |
|-------------------------|---------------------------------------------------------------|
| `users`                 | Login accounts and roles                                      |
| `email_templates`       | Saved bulk email templates                                    |
| `campaigns`             | History of sent email campaigns                               |
| `contracts`             | Generated contract records                                    |
| `contract_templates`    | Uploaded .docx / .html template files                         |
| `contract_companies`    | Sun Group company records (name, tax info, address, default)  |
| `company_ibans`         | Multiple IBANs per company, each with a label and default flag|
| `canva_config`          | Canva OAuth2 tokens and client credentials                    |
| `canva_designs`         | Registered Canva designs for contract integration             |
| `program_presentations` | Curated presentation list for Price Quote tab                 |

---

## Troubleshooting

| Problem                       | Fix                                                                    |
|-------------------------------|------------------------------------------------------------------------|
| App won't open / port in use  | Run `taskkill /F /IM node.exe` in terminal, then restart `start.bat`  |
| OCR not working               | Start the ML service: `python ml_service/app.py`                      |
| Canva features not working    | Go to Settings → reconnect Canva account                              |
| Contracts PDF blank / error   | Ensure LibreOffice is installed at `C:\Program Files\LibreOffice\`    |
| Email not delivering          | Check SendGrid API key in `.env` file                                 |
