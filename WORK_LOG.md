# Sun & Sun ERP — Work Log

## Stack
- **Frontend:** React 18 + Vite (port 5174)
- **Backend:** Node.js + Express (port 3001)
- **Database:** SQLite via better-sqlite3
- **Auth:** JWT + bcrypt
- **Email:** SendGrid
- **PDF:** LibreOffice (docx→pdf) + Puppeteer/Edge (html→pdf)
- **OCR:** EasyOCR via Python FastAPI (port 8000)
- **CRM:** Monday.com API

---

## How to Run
1. Double-click `start.bat` — pulls latest, installs packages, opens browser at localhost:5174
2. ML service (OCR): `python ml_service/app.py` from the ERP folder (port 8000)
3. Kill stuck Node processes: `taskkill /F /IM node.exe`

---

## Modules Built

### Auth
- JWT login, bcrypt passwords, role-based (admin/user)
- Default admin: moez.cherni@sunandsun.com.tr / admin123

### Monday.com Integration
- Fetch full board (paginated, 500 items/page) — contacts or companies board
- **Contacts / Companies toggle** in the Monday view header; single Board ID field in Settings adapts to which board is active
- **Deduplication:** manual "Find Duplicates" button; union-find groups contacts by same name, email, or phone; merges fields from duplicates; merge report modal shows what was merged and why
- **Unmerge:** per-group and "Unmerge All" buttons in the merge report modal
- **Merge signal toggles:** choose which signals (Name / Email / Phone) to use for dedup
- **Column title translation:** Turkish → English when lang=EN (MONDAY_COL_TITLE_EN map)
- **Filters:** Name, Email, Phone, Employee Count presence filters; tag filter (Mail Konuları for contacts, Ortak Mail for companies); "No tag" pill; Exclude toggle per filter
- **Tags:** fetched from board query (workspace tags, sorted alphabetically)
- **Salutation:** companies board → always "Merhaba,"; contacts board → name + gender logic
- **Bulk email:** SendGrid integration, per-recipient salutation, campaign history, Monday activity note + tag update after send
- No auto-load on dashboard; no auto-merge on fetch

### Bulk Email Module
- DB-backed email templates
- Server-side signature (Merve / Ahmet)
- Bounce sync from SendGrid
- Email domain MX verification
- Campaign history

### ML Classifier
- FastAPI service (port 8000) — lazy-loads model on first use (no startup delay)
- EasyOCR for tax certificate scanning

### Contracts Module
- Upload .docx or .html templates with @@variable@@ markers; auto-detects variables on upload
- **Generate:** docx → PDF via LibreOffice; html → PDF via Puppeteer + Edge (full CSS)
- Contract form: Party 1 dropdown (auto-fills IBAN), Party 2 + OCR scan, Party 3 optional
- **Multi-program:** up to 3 program blocks (Program Name, Service Fee, Success Bonus %) with + Add Program button; Notes field
- Selecting a template auto-sets the number of program blocks from its variables
- HTML pricing templates show a simplified form (no Party 1 needed); Download button in Contract Details panel
- Payment schedule table (EK-1)
- Word → PDF via LibreOffice headless (`C:\Program Files\LibreOffice\`)
- Sun Group Companies: DB-backed CRUD in Settings, OCR button
- Full EN/TR i18n

### Contracts Reporting
- 📊 Report button in Contracts tab
- Filter by date range + preparer
- Results grouped by template type: count + total TL+KDV
- Details table: date, type, prepared by, prepared for, value
- `created_by_name` stored on every generated contract

### OCR (Tax Certificate Scanner)
- EasyOCR local (no Google account needed)
- Image preprocessing: upscale to 1400px, autocontrast, contrast ×1.8, sharpen ×2.5, median denoise
- Digit OCR fixes: O→0, I→1, S→5 etc.
- Fuzzy tax office detection, multi-line company name merge, multi-line address capture
- Lazy-loads model — service starts instantly

---

## Pricing Proposal Templates (HTML → PDF via Puppeteer/Edge)

Three 16:9 slide-format templates (338.67mm × 190.5mm):

| File | Programs | Variables |
|------|----------|-----------|
| `pricing_1program.html` | 1 | @@program_name@@, @@down_payment@@, @@success_bonus@@ |
| `pricing_2programs.html` | 2 | + @@program2_name@@, @@program2_fee@@, @@program2_bonus@@ |
| `pricing_3programs.html` | 3 | + @@program3_name@@, @@program3_fee@@, @@program3_bonus@@ |

Common variables: @@party2_name@@, @@notes@@, @@contract_date@@

**Layout:** white top (title + client + colored badges) → dark gradient section (white floating cards + notes + date)

**To upload:** Contracts → Manage Templates → upload the .html files. Delete old ones first if re-uploading.

---

## Key Variable Reference

| Variable | Description |
|----------|-------------|
| @@party1_name@@ | Sun Group company (auto from Settings) |
| @@party1_tax_office@@ | Party 1 tax office |
| @@party1_tax_no@@ | Party 1 tax number |
| @@party1_address@@ | Party 1 address |
| @@party1_iban@@ | Party 1 IBAN |
| @@party2_name@@ | Client company name |
| @@party2_tax_office@@ | Client tax office |
| @@party2_tax_no@@ | Client tax number |
| @@party2_address@@ | Client address |
| @@program_name@@ | Program 1 name |
| @@down_payment@@ | Program 1 service fee |
| @@success_bonus@@ | Program 1 success bonus % |
| @@program2_name@@ | Program 2 name |
| @@program2_fee@@ | Program 2 service fee |
| @@program2_bonus@@ | Program 2 success bonus % |
| @@program3_name@@ | Program 3 name |
| @@program3_fee@@ | Program 3 service fee |
| @@program3_bonus@@ | Program 3 success bonus % |
| @@notes@@ | Notes / observations |
| @@contract_date@@ | Contract date (auto-fills today) |
| @@payment_schedule@@ | EK-1 payment table |

---

## Pending / Not Yet Done
- Upload instagram-logo.avif, linkedin-logo.webp to WordPress → fix email signature images
- Create Tally form, connect to Google Sheets
- Share inbox email + provider for automatic email fetching in Inbox tab
- Drop training .txt files into ml_service/data/positive/ and negative/
- Add remaining Sun Group companies in Settings (OCR their tax certs)
- Upload tagged contract templates via Contracts → Manage Templates

---

## Server Ports
| Service | Port |
|---------|------|
| Express API | 3001 |
| Vite frontend | 5174 |
| ML service (OCR) | 8000 |

---

## Important Paths
| Item | Path |
|------|------|
| ERP folder | `C:\Users\MOEZ\Desktop\sun_and_sun\ERP-Sun-and-Sun\` |
| Database | `ERP-Sun-and-Sun\erp_auth.db` |
| Temp contracts | `ERP-Sun-and-Sun\tmp_contracts\` |
| LibreOffice | `C:\Program Files\LibreOffice\program\soffice.exe` |
| Edge (Puppeteer) | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` |
| ML service | `ERP-Sun-and-Sun\ml_service\app.py` |
