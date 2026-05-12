import "dotenv/config";
import express from "express";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import multer from "multer";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import puppeteer from "puppeteer-core";
import { PDFDocument } from "pdf-lib";
import { randomBytes, createHash } from "node:crypto";

const EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || "sns-erp-2025-secret-key";
const PORT = 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// ── DATABASE ──────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, "erp_auth.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    email        TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT   NOT NULL,
    role         TEXT    NOT NULL DEFAULT 'user',
    created_at   TEXT    DEFAULT (datetime('now')),
    last_login   TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS email_campaigns (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    sent_at      TEXT    DEFAULT (datetime('now')),
    subject      TEXT    NOT NULL,
    recipients   INTEGER NOT NULL DEFAULT 0,
    sent         INTEGER NOT NULL DEFAULT 0,
    failed       INTEGER NOT NULL DEFAULT 0,
    source       TEXT    DEFAULT 'monday',
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS email_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#088FC4',
    subject    TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bounced_emails (
    email      TEXT PRIMARY KEY,
    event      TEXT NOT NULL,
    reason     TEXT,
    bounced_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS email_sends (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id     INTEGER,
    sent_at         TEXT DEFAULT (datetime('now')),
    recipient_email TEXT NOT NULL,
    recipient_name  TEXT,
    subject         TEXT,
    status          TEXT NOT NULL DEFAULT 'sent',
    signature_key   TEXT,
    FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_email_sends_sent_at ON email_sends(sent_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_email_sends_email   ON email_sends(recipient_email)`);

db.exec(`
  CREATE TABLE IF NOT EXISTS contract_templates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    filename      TEXT NOT NULL,
    file          BLOB NOT NULL,
    variables     TEXT NOT NULL DEFAULT '[]',
    template_type TEXT NOT NULL DEFAULT 'docx',
    created_at    TEXT DEFAULT (datetime('now'))
  )
`);
try { db.exec(`ALTER TABLE contract_templates ADD COLUMN template_type TEXT NOT NULL DEFAULT 'docx'`); } catch {}
db.exec(`UPDATE contract_templates SET template_type = 'html' WHERE filename LIKE '%.html' AND template_type = 'docx'`);
db.exec(`
  CREATE TABLE IF NOT EXISTS contracts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER,
    template_name TEXT,
    data        TEXT NOT NULL,
    created_by  INTEGER,
    created_by_name TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  )
`);
// Migration: add created_by_name if it doesn't exist yet
try { db.exec(`ALTER TABLE contracts ADD COLUMN created_by_name TEXT`); } catch {}

// ── SUN GROUP COMPANIES (DB-backed, editable from Settings) ──────
db.exec(`
  CREATE TABLE IF NOT EXISTS contract_companies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    short       TEXT NOT NULL DEFAULT '',
    tax_office  TEXT NOT NULL DEFAULT '',
    tax_no      TEXT NOT NULL DEFAULT '',
    address     TEXT NOT NULL DEFAULT '',
    iban        TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_default  INTEGER NOT NULL DEFAULT 0
  )
`);
try { db.exec(`ALTER TABLE contract_companies ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`); } catch {}

// ── COMPANY IBANs (multiple IBANs per company) ────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS company_ibans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    label      TEXT NOT NULL DEFAULT '',
    iban       TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0
  )
`);
// Migrate any existing single IBANs from contract_companies into company_ibans
{
  const toMigrate = db.prepare("SELECT id, iban FROM contract_companies WHERE iban != ''").all();
  for (const c of toMigrate) {
    const already = db.prepare("SELECT COUNT(*) as n FROM company_ibans WHERE company_id=?").get(c.id).n;
    if (!already) db.prepare("INSERT INTO company_ibans (company_id, label, iban, is_default) VALUES (?,?,?,1)").run(c.id, "", c.iban);
  }
}

// Seed known companies if table is empty
const companyCount = db.prepare("SELECT COUNT(*) as c FROM contract_companies").get().c;
if (companyCount === 0) {
  const ins = db.prepare("INSERT INTO contract_companies (name,short,tax_office,tax_no,address,iban,sort_order) VALUES (?,?,?,?,?,?,?)");
  ins.run("Sun Proje Tercüme Danışmanlık Eğt. İth. İhr. ve San. Tic. Ltd. Şti.","Sun Proje","Doğanbey Vergi Dairesi","782 053 6086","Ümit Mah. 2545. Sok. No:11 Çankaya ANKARA","TR10 0010 0068 1460 8882 1500 1",1);
  ins.run("Analiz Kariyer Danışmanlık Eğt. Özel İstih. ve İns. Kay. Turz. Bil. Yaz. Tic. Ltd. Şti.","Analiz Kariyer","Doğanbey Vergi Dairesi","068 083 9717","Aşağı Öveçler Mah. 1324. Cad. 37/4 Çankaya ANKARA","TR18 0010 0068 1690 9836 9500 1",2);
  ins.run("Sun ve Sun Danışmanlık Bilişim San. ve Tic. A.Ş.","Sun ve Sun A.Ş.","","","","",3);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS canva_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS canva_designs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT NOT NULL,
    design_id   TEXT NOT NULL,
    slide_index INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS program_presentations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    category   TEXT NOT NULL DEFAULT '',
    name       TEXT NOT NULL,
    canva_link TEXT NOT NULL DEFAULT '',
    design_id  TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// Seed program presentations on first run
if (db.prepare("SELECT COUNT(*) as c FROM program_presentations").get().c === 0) {
  const SEED = [
    // 1 - Genel İmalat & Bilişim
    ["Genel İmalat & Bilişim", "Fiyat Teklifi_Yıllık Danışmanlık",                                 "https://canva.link/h6vfz4blji341lh"],
    // 2 - KOSGEB
    ["KOSGEB", "Fiyat Teklifi_DDX",                                                                  "https://canva.link/kl1nd04h9tnvuil"],
    ["KOSGEB", "Fiyat Teklifi_Girişimci Destek Programı",                                            "https://canva.link/ge0arh0lm1ubo1o"],
    ["KOSGEB", "Fiyat Teklifi_İş Geliştirme Desteği",                                               "https://canva.link/alco513lxup9o1r"],
    ["KOSGEB", "Fiyat Teklifi_Kapasite Geliştirme Destek Programı",                                  "https://canva.link/2xo7evg16s1nplz"],
    ["KOSGEB", "Fiyat Teklifi_Küresel Rekabetçilik Destek Programı",                                 "https://canva.link/vu9t9z77lb8z56l"],
    // 3 - TÜBİTAK
    ["TÜBİTAK", "Fiyat Teklifi_Ar-Ge Destekleri",                                                   "https://canva.link/syqk2j761fo24hv"],
    ["TÜBİTAK", "Fiyat Teklifi_1832 Sanayide Yeşil Dönüşüm",                                        "https://canva.link/8i4k12ixl03at8s"],
    ["TÜBİTAK", "Fiyat Teklifi_1507",                                                                "https://canva.link/y7avs8zx8xnm0qr"],
    // 4 - Ticaret Bakanlığı
    ["Ticaret Bakanlığı", "Fiyat Teklifi_Bilişim Sektörü",                                           "https://canva.link/be58dthymdvebid"],
    ["Ticaret Bakanlığı", "Fiyat Teklifi_İmalat Sektörü",                                            "https://canva.link/9w37thw9klwsrtg"],
    ["Ticaret Bakanlığı", "Fiyat Teklifi_Küresel Tedarik Zinciri",                                   "https://canva.link/80h3sngoyg6xg90"],
    ["Ticaret Bakanlığı", "Fiyat Teklifi_Turquality",                                                "https://canva.link/5gsr2os02use11o"],
    // 5 - Kalkınma Ajansı
    ["Kalkınma Ajansı", "Fiyat Teklifi_SoGreen",                                                     "https://canva.link/o3k40ciyf7fk8kv"],
    ["Kalkınma Ajansı", "Fiyat Teklifi_SoGreen & 1831 & YTB",                                        "https://canva.link/ntfighndbng4ulm"],
    ["Kalkınma Ajansı", "Fiyat Teklifi_SoGreen & 1831",                                              "https://canva.link/8tn9u9pz2pev1mv"],
    // 6 - Yatırım Teşvik Sistemi
    ["Yatırım Teşvik Sistemi", "Fiyat Teklifi_Türkiye Yüzyılı Hamlesi",                              "https://canva.link/7s5kh1zponovcku"],
    ["Yatırım Teşvik Sistemi", "Fiyat Teklifi_Yeni YTB (Kısa)",                                      "https://canva.link/07m6yydxc1lx0a6"],
    // 7 - Dış Ticaret
    ["Dış Ticaret", "Fiyat Teklifi (Veri Dahil)_Yurt Dışı Pazar Araştırması Raporu",                 "https://canva.link/vnu7ze6lt9hkwc2"],
    ["Dış Ticaret", "Fiyat Teklifi_Yurt Dışı Pazar Araştırması Raporu",                              "https://canva.link/8tae6gvrpmdwf0a"],
    ["Dış Ticaret", "Fiyat Teklifi_Data Analytics",                                                  "https://canva.link/4njhc52fg5r65e8"],
    ["Dış Ticaret", "Fiyat Teklifi_Dış Ticaret Ofisiniz",                                            "https://canva.link/iyid0b4guwys7k7"],
    ["Dış Ticaret", "Fiyat Teklifi_Dış Ticaret Sistem Kurulumu",                                     "https://canva.link/zbubuqfekhqryo2"],
    ["Dış Ticaret", "Fiyat Teklifi_Uluslararası İş Geliştirme",                                      "https://canva.link/gmrxdcs6hwa5lxj"],
    // 8 - Sürdürülebilirlik
    ["Sürdürülebilirlik", "Fiyat Teklifi_1831 Yeşil İnovasyon Teknoloji Mentörlük Çağrısı",          "https://canva.link/s8hcrr5vj36zhnb"],
    ["Sürdürülebilirlik", "Fiyat Teklifi_Karbon Ayak İzi_Sürdürülebilirlik Danışmanlığı",            "https://canva.link/jyqgprbytdb5zjb"],
    ["Sürdürülebilirlik", "Fiyat Teklifi_Sürdürülebilirlik Danışmanlığı",                            "https://canva.link/g1cm034ici5n5lz"],
    ["Sürdürülebilirlik", "Fiyat Teklifi_Sürdürülebilirlik ve 1831",                                 "https://canva.link/yfazdkfu1israco"],
    // 9 - Vergi/SGK
    ["Vergi/SGK", "Fiyat Teklifi_Vergi/SGK",                                                         "https://canva.link/f3u8uurwzv72e4m"],
    // Ar-Ge ve Tasarım Merkezi
    ["Ar-Ge ve Tasarım Merkezi", "Fiyat Teklifi_Ar-Ge Merkezi Yürütme Teknik Destek Danışmanlığı",   "https://canva.link/4sqmv72narwekks"],
    ["Ar-Ge ve Tasarım Merkezi", "Fiyat Teklifi_Ar-Ge Ve Tasarım Merkezi Kurulumu",                  "https://canva.link/y6e24xxhu8bfkc9"],
    // Diğer
    ["Diğer", "Fiyat Teklifi_Patent ve Faydalı Model Danışmanlığı",                                  "https://canva.link/eh06utmbe8v0946"],
    // Teknokent
    ["Teknokent", "Fiyat Teklifi_Teknokent Projesi",                                                 "https://canva.link/lk25nco878c7ler"],
  ];
  const ins = db.prepare("INSERT INTO program_presentations (category, name, canva_link, design_id) VALUES (?,?,?,?)");
  for (const [cat, name, link] of SEED) ins.run(cat, name, link, "");

  // Resolve design IDs in the background
  (async () => {
    const upd = db.prepare("UPDATE program_presentations SET design_id=? WHERE canva_link=?");
    for (const [, , link] of SEED) {
      try {
        const r = await fetch(link, { redirect: "follow", signal: AbortSignal.timeout(10000) });
        const match = r.url.match(/canva\.com\/design\/([A-Za-z0-9_-]+)/);
        if (match) { upd.run(match[1], link); console.log("[presentations] resolved", link, "→", match[1]); }
      } catch { /* skip failed */ }
    }
    console.log("[presentations] all design IDs resolved");
  })();
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const LIBREOFFICE = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
const TMP_DIR = path.join(__dirname, "tmp_contracts");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

// Remove default seeded templates
db.prepare(`DELETE FROM email_templates WHERE label IN ('İlgileniyoruz ✓','Sektör Dışı ✗','İlgilenmiyoruz ✗','Hibe Duyurusu 📢')`).run();

// Seed default admin on first run
const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
if (count === 0) {
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  ).run("Moez Cherni", "moez.cherni@sunandsun.com.tr", hash, "admin");
  console.log(
    "\n✓ Default admin seeded:\n  Email:    moez.cherni@sunandsun.com.tr\n  Password: admin123\n  (Change this after first login)\n"
  );
}

// ── MIDDLEWARE ────────────────────────────────────────────────────
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ error: "Admin access required" });
  next();
}

// ── ROUTES ────────────────────────────────────────────────────────

// POST /auth/login
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: "Invalid email or password" });

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(
    user.id
  );

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// GET /auth/me — verify stored token
app.get("/auth/me", authenticate, (req, res) => {
  const user = db
    .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

// GET /auth/users — list all (admin)
app.get("/auth/users", authenticate, requireAdmin, (req, res) => {
  const users = db
    .prepare(
      "SELECT id, name, email, role, created_at, last_login FROM users ORDER BY created_at DESC"
    )
    .all();
  res.json(users);
});

// POST /auth/users — create user (admin)
app.post("/auth/users", authenticate, requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password)
    return res
      .status(400)
      .json({ error: "Name, email and password are required" });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db
      .prepare(
        "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
      )
      .run(
        name.trim(),
        email.trim().toLowerCase(),
        hash,
        role === "admin" ? "admin" : "user"
      );
    res
      .status(201)
      .json({ id: result.lastInsertRowid, name, email, role: role || "user" });
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE")
      return res.status(409).json({ error: "Email already exists" });
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /auth/users/:id — delete user (admin, not self)
app.delete("/auth/users/:id", authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id)
    return res.status(400).json({ error: "Cannot delete your own account" });
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ success: true });
});

// PUT /auth/users/:id/password — change password (admin or self)
app.put("/auth/users/:id/password", authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  if (req.user.role !== "admin" && req.user.id !== id)
    return res.status(403).json({ error: "Forbidden" });
  const { password } = req.body || {};
  if (!password || password.length < 6)
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
  res.json({ success: true });
});

// ── EMAIL SIGNATURE ───────────────────────────────────────────────
const _logoSrc = "https://www.sunandsun.com.tr/wp-content/uploads/2024/06/SunSun-Opak-Logo.png";
const _igSrc   = "https://www.sunandsun.com.tr/wp-content/uploads/2026/04/instagram.png";
const _liSrc   = "https://www.sunandsun.com.tr/wp-content/uploads/2026/04/linkedin.png";
const _gifSrc  = "https://www.sunandsun.com.tr/wp-content/uploads/2026/04/unnamed.gif";

const SIGNATORIES = {
  merve:  { name: "Merve Çöloğlu",  title: "Müşteri İletişim Sorumlusu",               phone: "541 634 9576",    tel: "+905416349576", email: "merve.cologlu@sundanismanlik.net" },
  sura:   { name: "Şura Kurtoğlu",  title: "Müşteri İletişim Sorumlusu",               phone: "0 543 459 71 57", tel: "+905434597157", email: "sura.kurtoglu@sundanismanlik.net" },
  ahmet:  { name: "Ahmet Sungur",   title: "Genel Müdür",                              phone: "0 533 506 32 32", tel: "+905335063232", email: "ahmet.sungur@sundanismanlik.net" },
  esra:   { name: "Esra Serin",     title: "İdari İşler Koordinatörü",                 phone: "0 505 039 47 67", tel: "+905050394767", email: "esra.serin@sundanismanlik.net" },
  melek:  { name: "Melek Çıtak",    title: "Proje Geliştirme ve Yürütme Koordinatörü", phone: "0532 778 50 31",  tel: "+905327785031", email: "melek.citak@sundanismanlik.net" },
};

function buildSignature(key) {
  const s = SIGNATORIES[key] || SIGNATORIES.merve;
  return `
<br><br>
<div style="font-family:Arial,sans-serif;color:#333;max-width:600px;font-size:12px;">

  <!-- Contact card -->
  <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
    <tr>
      <td style="padding-right:18px;vertical-align:middle;">
        <a href="https://www.sunandsun.com.tr/" target="_blank">
          <img src="${_logoSrc}" alt="Sun &amp; Sun" width="88" style="display:block;" />
        </a>
      </td>
      <td style="vertical-align:top;border-left:2px solid #ddd;padding-left:18px;">
        <div style="font-weight:bold;font-size:14px;color:#c0392b;margin-bottom:2px;">${s.name}</div>
        <div style="color:#555;font-size:12px;padding-bottom:7px;border-bottom:1px solid #ddd;margin-bottom:7px;">${s.title}</div>
        <div style="margin-bottom:4px;">&#128222;&nbsp;<a href="tel:${s.tel}" style="color:#333;text-decoration:none;">${s.phone}</a></div>
        <div style="margin-bottom:10px;">&#127760;&nbsp;<a href="https://www.sunandsun.com.tr/" style="color:#0A3E62;text-decoration:none;">www.sunandsun.com.tr</a></div>
        <div>
          <a href="https://www.instagram.com/sunandsuninternational/" target="_blank" style="display:inline-block;margin-right:6px;text-decoration:none;">
            <img src="${_igSrc}" alt="Instagram" width="34" height="34" style="display:block;border-radius:8px;" />
          </a>
          <a href="https://www.linkedin.com/company/sun-and-sun-consulting/" target="_blank" style="display:inline-block;text-decoration:none;">
            <img src="${_liSrc}" alt="LinkedIn" width="34" height="34" style="display:block;border-radius:6px;" />
          </a>
        </div>
      </td>
    </tr>
  </table>

  <!-- Banner GIF -->
  <div style="margin-bottom:12px;">
    <a href="https://www.sunandsun.com.tr/" target="_blank" style="display:block;">
      <img src="${_gifSrc}" alt="Sun &amp; Sun" width="500" style="display:block;max-width:100%;border:none;" />
    </a>
  </div>

  <!-- Office locations -->
  <table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:12px;font-size:11px;">
    <tr>
      <td style="vertical-align:top;width:25%;padding-right:10px;">
        <div style="font-weight:bold;text-decoration:underline;margin-bottom:4px;">Ankara</div>
        <div style="color:#555;line-height:1.5;">&#128205;&nbsp;Aşağı Öveçler Mah.<br>1324. Cad. No:37/4<br>Çankaya/Ankara</div>
        <div style="color:#555;margin-top:4px;">&#128222;&nbsp;0 312 922 09 51</div>
      </td>
      <td style="vertical-align:top;width:25%;padding-right:10px;">
        <div style="font-weight:bold;text-decoration:underline;margin-bottom:4px;">Konya</div>
        <div style="color:#555;line-height:1.5;">&#128205;&nbsp;Büyükkayacık OSB<br>101. Cad. No: 4/302<br>Selçuklu Konya</div>
      </td>
      <td style="vertical-align:top;width:25%;padding-right:10px;">
        <div style="font-weight:bold;text-decoration:underline;margin-bottom:4px;">İzmir</div>
        <div style="color:#555;line-height:1.5;">&#128205;&nbsp;Kazım Dirik Mah.<br>296/2 No:33<br>Bornova/İzmir</div>
        <div style="color:#555;margin-top:4px;">&#128222;&nbsp;0 232 532 19 52</div>
      </td>
      <td style="vertical-align:top;width:25%;">
        <div style="font-weight:bold;text-decoration:underline;margin-bottom:4px;">Almanya</div>
        <div style="color:#555;line-height:1.5;">&#128205;&nbsp;Bahnhofstrasse<br>No:8 30159<br>Hannover</div>
      </td>
    </tr>
  </table>

  <!-- Legal -->
  <div style="font-size:10px;color:#888;border-top:1px solid #eee;padding-top:8px;line-height:1.6;">
    <strong>YASAL UYARI</strong><br>
    Bu e-posta ve ilişkili dosyalar sadece alması amaçlanan şahsi veya tüzel kişiye özeldir. Eğer yetkili alıcı değilseniz içeriği açmanız, açıklamanız, kopyalamanız, yönlendirmeniz ve kullanmanız yasaktır ve bu e-postayı derhal silmeniz gerekmektedir. Veri sorumluları olarak Sun Proje Tercüme Danışmanlık Eğitim İthalat İhracat ve Sanayi Ticaret Limited Şirketi ve Sun ve Sun Danışmanlık Bilişim Sanayi ve Ticaret Anonim Şirketi (Hepsi birlikte bundan sonra "SUN DANIŞMANLIK" veya "Veri Sorumlusu" olarak anılacaktır.), bu mesajın içerdiği bilgilerin mutlak doğruluğu veya eksiksiz olduğu konusunda herhangi bir garanti vermez. Bu nedenle bu bilgilerin kullanımı ile ilgili kayıplardan sorumlu tutulamaz. Bu mesajın içeriğiyle ilgili sorumluluk yalnızca gönderen kişiye aittir ve bu içerik veri sorumlusunun görüşlerini yansıtmayabilir. Bu e-posta bilinen bilgisayar virüslerine karşı taranmıştır. 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında Veri Sorumlusu sıfatıyla, e-posta ortamında toplanan kişisel verilerinizi internet sitemizde bulunan kişisel verilerin işlenmesine ilişkin aydınlatma metninde belirtilen amaçlara uygun olarak işlemekte ve saklamaktayız. Kişisel Verilerle ilgili bilgilendirmeyi <a href="https://www.sundanismanlik.net" style="color:#0A3E62;">www.sundanismanlik.net</a> adresinden okuyabilirsiniz.
    <br><br>
    <strong>DISCLAIMER</strong><br>
    This e-mail and related files are the private property of the sender, the personal and the legal entities to whom they were intended to be sent. If you are not an authorized recipient of this e-mail, it is forbidden to open, copy, forward or use it and it is required that you should delete this e-mail immediately. As data controllers, Sun Proje Tercüme Danışmanlık Eğitim İthalat İhracat ve Sanayi Ticaret Limited Şirketi and Sun ve Sun Danışmanlık Bilişim Sanayi ve Ticaret Anonim Şirketi (Hereinafter collectively referred to as "SUN DANIŞMANLIK" or "Data Controller".) do not guarantee absolutely the correctness and completeness of the information within this e-mail. Therefore, it cannot be held responsible for losses related to the use of this information. The sole responsibility will belong to the person who sends it, and the contents herein might not be reflecting the opinions of Data Controller. This e-mail has been scanned for all known computer viruses. As Data Controller in accordance with Law No. 6698 (Personal Data Protection Law), We process and store your personal data collected in the e-mail environment in accordance with the purposes specified in the privacy notice regarding the processing of personal data on our website. You can read the personal data privacy notice via <a href="https://www.sundanismanlik.net" style="color:#0A3E62;">www.sundanismanlik.net</a>.
  </div>
</div>`;
}

// POST /email/send — send bulk email via SendGrid (admin)
// recipients may include per-recipient htmlBody for personalization
app.post("/email/send", authenticate, async (req, res) => {
  const { apiKey, fromEmail, fromName, subject, htmlBody, body, recipients, attachments, signatureKey } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: "SendGrid API key is required" });
  const defaultBody = htmlBody || body || "";
  if (!fromEmail || !subject || !defaultBody) return res.status(400).json({ error: "fromEmail, subject and body are required" });
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: "No recipients provided" });

  // Admin can send on behalf of a signatory — override from address if signatory has an email
  const signatory = SIGNATORIES[signatureKey];
  const effectiveFromEmail = (req.user.role === "admin" && signatory?.email) ? signatory.email : fromEmail;
  const effectiveFromName  = (req.user.role === "admin" && signatory?.email) ? signatory.name  : (fromName || "Sun & Sun");

  console.log(`📧 /email/send — ${recipients.length} recipients, from: ${effectiveFromEmail}, subject: "${subject}"`);
  recipients.forEach((r, i) => console.log(`  [${i}] email=${r.email} name=${r.name} hasBody=${!!r.htmlBody}`));

  const CHUNK = 1000;
  let totalSent = 0;
  let totalFailed = 0;
  const errors = [];
  const sentEmails = [];

  // Group recipients by their individual body (for personalization); fall back to defaultBody
  const groups = new Map();
  for (const r of recipients) {
    const key = r.htmlBody || defaultBody;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  // Create campaign record first to get campaign_id
  const campaignRow = db.prepare(
    "INSERT INTO email_campaigns (user_id, subject, recipients, sent, failed, source) VALUES (?, ?, ?, 0, 0, ?)"
  ).run(req.user.id, subject, recipients.length, req.body.source || "erp");
  const campaignId = campaignRow.lastInsertRowid;

  const insertSend = db.prepare(
    "INSERT INTO email_sends (campaign_id, recipient_email, recipient_name, subject, status, signature_key) VALUES (?, ?, ?, ?, ?, ?)"
  );

  for (const [groupBody, groupRecipients] of groups) {
    for (let i = 0; i < groupRecipients.length; i += CHUNK) {
      const chunk = groupRecipients.slice(i, i + CHUNK);
      const payload = {
        personalizations: chunk.map((r) => ({ to: [{ email: r.email, name: r.name || "" }] })),
        from: { email: effectiveFromEmail, name: effectiveFromName },
        subject,
        content: [{ type: "text/html", value: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#222;max-width:600px;">${groupBody}</div>${buildSignature(signatureKey)}` }],
        ...(Array.isArray(attachments) && attachments.length > 0 ? {
          attachments: attachments.map(a => ({ content: a.content, filename: a.name, type: a.type || "application/octet-stream", disposition: "attachment" }))
        } : {}),
      };
      try {
        const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        console.log(`  SendGrid status: ${sgRes.status} for ${chunk.length} recipients`);
        const chunkOk = sgRes.ok || sgRes.status === 202;
        if (chunkOk) {
          totalSent += chunk.length;
          for (const r of chunk) sentEmails.push(r.email);
        } else {
          const errBody = await sgRes.json().catch(() => ({}));
          console.log(`  SendGrid error:`, JSON.stringify(errBody));
          totalFailed += chunk.length;
          errors.push(errBody?.errors?.[0]?.message || `HTTP ${sgRes.status}`);
        }
        const status = chunkOk ? "sent" : "failed";
        const logInserts = db.transaction(() => {
          for (const r of chunk) insertSend.run(campaignId, r.email, r.name || "", subject, status, signatureKey || "merve");
        });
        logInserts();
      } catch (e) {
        totalFailed += chunk.length;
        errors.push(e.message);
        const logFailed = db.transaction(() => {
          for (const r of chunk) insertSend.run(campaignId, r.email, r.name || "", subject, "failed", signatureKey || "merve");
        });
        logFailed();
      }
    }
  }

  // Update campaign totals
  db.prepare("UPDATE email_campaigns SET sent=?, failed=? WHERE id=?").run(totalSent, totalFailed, campaignId);

  res.json({ sent: totalSent, failed: totalFailed, errors, campaignId, sentEmails });
});

// GET /email/sends — filterable individual send log
app.get("/email/sends", authenticate, (req, res) => {
  const { search, date_from, date_to, status, subject, limit = 200, offset = 0 } = req.query;
  let where = [];
  const params = [];
  if (search)    { where.push("(recipient_email LIKE ? OR recipient_name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  if (date_from) { where.push("sent_at >= ?"); params.push(date_from); }
  if (date_to)   { where.push("sent_at <= ?"); params.push(date_to + " 23:59:59"); }
  if (status)    { where.push("status = ?"); params.push(status); }
  if (subject)   { where.push("subject LIKE ?"); params.push(`%${subject}%`); }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM email_sends ${whereClause} ORDER BY sent_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset));
  const total = db.prepare(`SELECT COUNT(*) AS n FROM email_sends ${whereClause}`).get(...params).n;
  res.json({ rows, total });
});

// ── ML SERVICE PROXY ─────────────────────────────────────────────
const ML_URL = "http://localhost:8000";

async function mlProxy(req, res, path) {
  try {
    const r = await fetch(`${ML_URL}${path}`, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch {
    res.status(503).json({ error: "ML service is not running. Start it with: cd ml_service && python app.py" });
  }
}

app.post("/ml/classify", authenticate, (req, res) => mlProxy(req, res, "/classify"));
app.post("/ml/label",    authenticate, (req, res) => mlProxy(req, res, "/label"));
app.post("/ml/train",    authenticate, requireAdmin, (req, res) => mlProxy(req, res, "/train"));
app.get("/ml/status",    authenticate, (req, res) => mlProxy(req, res, "/status"));

// ── EMAIL TEMPLATES ───────────────────────────────────────────────

// GET /email/templates — any authenticated user (or external CRM)
app.get("/email/templates", authenticate, (req, res) => {
  const rows = db.prepare("SELECT * FROM email_templates ORDER BY id ASC").all();
  res.json(rows);
});

// POST /email/templates — admin only
app.post("/email/templates", authenticate, requireAdmin, (req, res) => {
  const { label, color, subject, body } = req.body || {};
  if (!label?.trim() || !subject?.trim())
    return res.status(400).json({ error: "label and subject are required" });
  const result = db.prepare(
    "INSERT INTO email_templates (label, color, subject, body) VALUES (?, ?, ?, ?)"
  ).run(label.trim(), color || "#088FC4", subject.trim(), body || "");
  const row = db.prepare("SELECT * FROM email_templates WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(row);
});

// PUT /email/templates/:id — admin only
app.put("/email/templates/:id", authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const { label, color, subject, body } = req.body || {};
  if (!label?.trim() || !subject?.trim())
    return res.status(400).json({ error: "label and subject are required" });
  db.prepare(
    "UPDATE email_templates SET label=?, color=?, subject=?, body=?, updated_at=datetime('now') WHERE id=?"
  ).run(label.trim(), color || "#088FC4", subject.trim(), body || "", id);
  const row = db.prepare("SELECT * FROM email_templates WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Template not found" });
  res.json(row);
});

// DELETE /email/templates/:id — admin only
app.delete("/email/templates/:id", authenticate, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("DELETE FROM email_templates WHERE id = ?").run(id);
  res.json({ success: true });
});

// ── EMAIL CAMPAIGNS ──────────────────────────────────────────────────────────

app.get("/email/campaigns", authenticate, (req, res) => {
  const rows = db.prepare(
    "SELECT ec.*, u.name as user_name, u.email as user_email FROM email_campaigns ec JOIN users u ON ec.user_id = u.id WHERE ec.user_id = ? ORDER BY ec.sent_at DESC LIMIT 50"
  ).all(req.user.id);
  res.json(rows);
});

app.post("/email/campaigns", authenticate, (req, res) => {
  const { subject, recipients, sent, failed, source } = req.body || {};
  const result = db.prepare(
    "INSERT INTO email_campaigns (user_id, subject, recipients, sent, failed, source) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(req.user.id, subject || "", recipients || 0, sent || 0, failed || 0, source || "monday");
  res.json({ id: result.lastInsertRowid });
});

// POST /email/verify-domains — check MX records to confirm email domains exist
app.post("/email/verify-domains", authenticate, async (req, res) => {
  const { emails } = req.body || {};
  if (!Array.isArray(emails) || emails.length === 0) return res.json({});
  const dns = await import("dns/promises");
  const results = await Promise.all(
    emails.map(async (email) => {
      try {
        const domain = (email || "").split("@")[1];
        if (!domain) return [email, false];
        const records = await dns.resolveMx(domain);
        return [email, records.length > 0];
      } catch {
        return [email, false];
      }
    })
  );
  res.json(Object.fromEntries(results));
});

// POST /email/webhook — SendGrid event webhook (no auth, called by SendGrid)
app.post("/email/webhook", (req, res) => {
  const events = Array.isArray(req.body) ? req.body : [];
  const insert = db.prepare(
    "INSERT OR REPLACE INTO bounced_emails (email, event, reason, bounced_at) VALUES (?, ?, ?, datetime('now'))"
  );
  const bad = ["bounce", "dropped", "spamreport", "unsubscribe"];
  for (const ev of events) {
    if (bad.includes(ev.event) && ev.email) {
      insert.run(ev.email.toLowerCase(), ev.event, ev.reason || null);
    }
  }
  res.sendStatus(200);
});

// GET /email/bounces — return all bounced/bad emails
app.get("/email/bounces", authenticate, (req, res) => {
  const rows = db.prepare("SELECT email, event, reason, bounced_at FROM bounced_emails ORDER BY bounced_at DESC").all();
  res.json(rows);
});

// POST /email/bounces/sync — pull bounces/invalids/spam from SendGrid and store locally
app.post("/email/bounces/sync", authenticate, async (req, res) => {
  const { apiKey } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: "SendGrid API key is required" });

  const endpoints = [
    { url: "https://api.sendgrid.com/v3/suppression/bounces", event: "bounce" },
    { url: "https://api.sendgrid.com/v3/suppression/invalid_emails", event: "invalid" },
    { url: "https://api.sendgrid.com/v3/suppression/spam_reports", event: "spamreport" },
  ];

  const insert = db.prepare(
    "INSERT OR REPLACE INTO bounced_emails (email, event, reason, bounced_at) VALUES (?, ?, ?, datetime('now'))"
  );
  let synced = 0;

  for (const { url, event } of endpoints) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.email) {
            insert.run(item.email.toLowerCase(), event, item.reason || null);
            synced++;
          }
        }
      }
    } catch {}
  }

  const rows = db.prepare(
    "SELECT email, event, reason, bounced_at FROM bounced_emails ORDER BY bounced_at DESC"
  ).all();
  res.json({ synced, bounces: rows });
});

// ── MONDAY.COM ───────────────────────────────────────────────────────────────

// POST /monday/board — fetch ALL items from a Monday.com board (paginated)
app.post("/monday/board", authenticate, async (req, res) => {
  const { apiKey, boardId } = req.body || {};
  if (!apiKey || !boardId) return res.status(400).json({ error: "apiKey and boardId are required" });

  const headers = { "Content-Type": "application/json", "Authorization": apiKey, "API-Version": "2024-01" };
  const boardInt = parseInt(boardId);

  const firstQuery = `query {
    boards(ids: [${boardInt}]) {
      name
      columns { id title type settings_str }
      items_page(limit: 500) {
        cursor
        items {
          id name
          column_values { id text value column { title type } }
        }
      }
    }
    tags { id name color }
  }`;

  try {
    const firstRes = await fetch("https://api.monday.com/v2", { method: "POST", headers, body: JSON.stringify({ query: firstQuery }) });
    const firstData = await firstRes.json();
    const board = firstData?.data?.boards?.[0];
    if (!board) return res.json(firstData);

    const allItems = [...board.items_page.items];
    let cursor = board.items_page.cursor;

    while (cursor) {
      const nextQuery = `query { next_items_page(limit: 500, cursor: "${cursor}") { cursor items { id name column_values { id text value column { title type } } } } }`;
      const nextRes = await fetch("https://api.monday.com/v2", { method: "POST", headers, body: JSON.stringify({ query: nextQuery }) });
      const nextData = await nextRes.json();
      const page = nextData?.data?.next_items_page;
      if (!page) break;
      allItems.push(...page.items);
      cursor = page.cursor;
    }

    console.log(`[monday/board] fetched ${allItems.length} items total for board ${boardId}`);
    res.json({ data: { boards: [{ ...board, items_page: { items: allItems } }], tags: firstData.data?.tags || [] } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /monday/add-updates — post activity notes to Monday items after email send
app.post("/monday/add-updates", authenticate, async (req, res) => {
  const { apiKey, updates } = req.body || {};
  if (!apiKey || !Array.isArray(updates) || updates.length === 0)
    return res.status(400).json({ error: "apiKey and updates array required" });

  const mutation = `mutation CreateUpdate($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }`;
  const results = [];
  for (const { itemId, body } of updates) {
    try {
      const r = await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": apiKey, "API-Version": "2024-01" },
        body: JSON.stringify({ query: mutation, variables: { itemId: String(itemId), body } }),
      });
      const data = await r.json();
      console.log(`Monday update item ${itemId}:`, JSON.stringify(data));
      results.push({ itemId, ok: !data.errors, error: data.errors?.[0]?.message });
    } catch (e) {
      results.push({ itemId, ok: false, error: e.message });
    }
  }
  res.json({ results });
});

// POST /monday/delete-items — delete items from a Monday.com board
app.post("/monday/delete-items", authenticate, async (req, res) => {
  const { apiKey, itemIds } = req.body || {};
  if (!apiKey || !Array.isArray(itemIds) || itemIds.length === 0)
    return res.status(400).json({ error: "apiKey and itemIds are required" });

  const mutation = `mutation DeleteItem($itemId: ID!) { delete_item(item_id: $itemId) { id } }`;
  const results = [];
  for (const itemId of itemIds) {
    try {
      const r = await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": apiKey, "API-Version": "2024-01" },
        body: JSON.stringify({ query: mutation, variables: { itemId: String(itemId) } }),
      });
      const data = await r.json();
      results.push({ itemId, ok: !data.errors });
    } catch (e) {
      results.push({ itemId, ok: false, error: e.message });
    }
  }
  res.json({ results });
});

// POST /monday/tags — fetch all existing tags from Monday account
app.post("/monday/tags", authenticate, async (req, res) => {
  const { apiKey } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: "apiKey is required" });
  try {
    const query = `query { tags { id name color } }`;
    const r = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": apiKey, "API-Version": "2024-01" },
      body: JSON.stringify({ query }),
    });
    const data = await r.json();
    if (data.errors) return res.status(400).json({ error: data.errors[0]?.message });
    res.json({ tags: data.data.tags || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /monday/update-columns — update mail Konuları and ortak mail tag columns
app.post("/monday/update-columns", authenticate, async (req, res) => {
  const { apiKey, boardId, updates } = req.body || {};
  if (!apiKey || !boardId || !Array.isArray(updates) || updates.length === 0)
    return res.status(400).json({ error: "apiKey, boardId, and updates are required" });

  const results = [];
  for (const { itemId, columnId, colType, value } of updates) {
    try {
      let inlineValue;
      if (value === "" || value === null) {
        inlineValue = '"{}"';
      } else if (colType === "tag") {
        inlineValue = JSON.stringify(JSON.stringify({ tag_ids: value }));
      } else {
        inlineValue = JSON.stringify(JSON.stringify({ text: String(value) }));
      }
      const mutation = `mutation { change_column_value(board_id: ${parseInt(boardId)}, item_id: ${parseInt(itemId)}, column_id: "${columnId}", value: ${inlineValue}) { id } }`;
      const r = await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": apiKey, "API-Version": "2024-01" },
        body: JSON.stringify({ query: mutation }),
      });
      const data = await r.json();
      console.log(`[update-columns] item=${itemId} col=${columnId} val=${JSON.stringify(value)} → monday:`, JSON.stringify(data));
      results.push({ itemId, columnId, ok: !data.errors, errors: data.errors });
    } catch (e) {
      results.push({ itemId, columnId, ok: false, error: e.message });
    }
  }
  res.json({ results });
});

// ══════════════════════════════════════════════════════════════════
// CONTRACT ROUTES
// ══════════════════════════════════════════════════════════════════

// GET /contracts/companies
app.get("/contracts/companies", authenticate, (req, res) => {
  const companies = db.prepare("SELECT * FROM contract_companies ORDER BY sort_order, id").all();
  const allIbans = db.prepare("SELECT * FROM company_ibans ORDER BY is_default DESC, id").all();
  res.json(companies.map(c => ({ ...c, ibans: allIbans.filter(i => i.company_id === c.id) })));
});

// POST /contracts/companies
app.post("/contracts/companies", authenticate, (req, res) => {
  const { name, short, tax_office, tax_no, address, iban } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Name required" });
  const maxOrder = db.prepare("SELECT MAX(sort_order) as m FROM contract_companies").get().m || 0;
  const r = db.prepare("INSERT INTO contract_companies (name,short,tax_office,tax_no,address,iban,sort_order) VALUES (?,?,?,?,?,?,?)").run(name.trim(), short||"", tax_office||"", tax_no||"", address||"", iban||"", maxOrder+1);
  res.json(db.prepare("SELECT * FROM contract_companies WHERE id=?").get(r.lastInsertRowid));
});

// PUT /contracts/companies/:id
app.put("/contracts/companies/:id", authenticate, (req, res) => {
  const { name, short, tax_office, tax_no, address } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Name required" });
  db.prepare("UPDATE contract_companies SET name=?,short=?,tax_office=?,tax_no=?,address=? WHERE id=?").run(name.trim(), short||"", tax_office||"", tax_no||"", address||"", req.params.id);
  const company = db.prepare("SELECT * FROM contract_companies WHERE id=?").get(req.params.id);
  const ibans = db.prepare("SELECT * FROM company_ibans WHERE company_id=? ORDER BY is_default DESC, id").all(req.params.id);
  res.json({ ...company, ibans });
});

// DELETE /contracts/companies/:id
app.delete("/contracts/companies/:id", authenticate, (req, res) => {
  db.prepare("DELETE FROM contract_companies WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// PUT /contracts/companies/:id/set-default (admin only)
app.put("/contracts/companies/:id/set-default", authenticate, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  db.prepare("UPDATE contract_companies SET is_default=0").run();
  db.prepare("UPDATE contract_companies SET is_default=1 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// POST /contracts/companies/:id/ibans (admin only)
app.post("/contracts/companies/:id/ibans", authenticate, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const { iban, label } = req.body || {};
  if (!iban?.trim()) return res.status(400).json({ error: "IBAN required" });
  const hasDefault = db.prepare("SELECT COUNT(*) as n FROM company_ibans WHERE company_id=? AND is_default=1").get(req.params.id).n;
  const isDefault = hasDefault ? 0 : 1;
  const r = db.prepare("INSERT INTO company_ibans (company_id, label, iban, is_default) VALUES (?,?,?,?)").run(req.params.id, label||"", iban.trim(), isDefault);
  if (isDefault) db.prepare("UPDATE contract_companies SET iban=? WHERE id=?").run(iban.trim(), req.params.id);
  res.json(db.prepare("SELECT * FROM company_ibans WHERE id=?").get(r.lastInsertRowid));
});

// DELETE /contracts/companies/ibans/:ibanId (admin only)
app.delete("/contracts/companies/ibans/:ibanId", authenticate, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const row = db.prepare("SELECT * FROM company_ibans WHERE id=?").get(req.params.ibanId);
  if (!row) return res.status(404).json({ error: "Not found" });
  db.prepare("DELETE FROM company_ibans WHERE id=?").run(req.params.ibanId);
  if (row.is_default) {
    const next = db.prepare("SELECT * FROM company_ibans WHERE company_id=? ORDER BY id LIMIT 1").get(row.company_id);
    if (next) {
      db.prepare("UPDATE company_ibans SET is_default=1 WHERE id=?").run(next.id);
      db.prepare("UPDATE contract_companies SET iban=? WHERE id=?").run(next.iban, row.company_id);
    } else {
      db.prepare("UPDATE contract_companies SET iban='' WHERE id=?").run(row.company_id);
    }
  }
  res.json({ ok: true });
});

// PUT /contracts/companies/ibans/:ibanId/set-default (admin only)
app.put("/contracts/companies/ibans/:ibanId/set-default", authenticate, (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const row = db.prepare("SELECT * FROM company_ibans WHERE id=?").get(req.params.ibanId);
  if (!row) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE company_ibans SET is_default=0 WHERE company_id=?").run(row.company_id);
  db.prepare("UPDATE company_ibans SET is_default=1 WHERE id=?").run(req.params.ibanId);
  db.prepare("UPDATE contract_companies SET iban=? WHERE id=?").run(row.iban, row.company_id);
  res.json({ ok: true });
});

// GET /contracts/templates
app.get("/contracts/templates", authenticate, (req, res) => {
  const rows = db.prepare("SELECT id, name, filename, variables, template_type, created_at FROM contract_templates ORDER BY created_at DESC").all();
  res.json(rows.map(r => ({ ...r, variables: JSON.parse(r.variables) })));
});

// POST /contracts/templates — upload .docx or .html, detect @@var@@ tags
app.post("/contracts/templates", authenticate, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const isHtml = req.file.originalname.toLowerCase().endsWith(".html");
  const isDocx = req.file.originalname.toLowerCase().endsWith(".docx");
  if (!isDocx && !isHtml) return res.status(400).json({ error: "Only .docx or .html files are supported" });

  const name = (req.body.name || req.file.originalname.replace(/\.(docx|html)$/i, "")).trim();
  const buf  = req.file.buffer;
  let variables = [];

  if (isHtml) {
    const html = buf.toString("utf-8");
    variables = [...new Set([...html.matchAll(/@@([a-zA-Z0-9_]+)@@/g)].map(m => m[1]))];
  } else {
    try {
      const zip = new PizZip(buf);
      const xmlFiles = ["word/document.xml", "word/header1.xml", "word/footer1.xml"];
      const fullXml = xmlFiles.map(f => {
        try { return mergeRuns(zip.file(f)?.asText() || ""); } catch { return ""; }
      }).join("");
      const stripped = fullXml.replace(/<[^>]+>/g, " ");
      variables = [...new Set([...stripped.matchAll(/@@([a-zA-Z0-9_]+)@@/g)].map(m => m[1]))];
    } catch (e) {
      return res.status(400).json({ error: "Could not parse .docx: " + e.message });
    }
  }

  db.prepare("INSERT INTO contract_templates (name, filename, file, variables, template_type) VALUES (?, ?, ?, ?, ?)")
    .run(name, req.file.originalname, buf, JSON.stringify(variables), isHtml ? "html" : "docx");
  res.json({ ok: true, variables });
});

// GET /contracts/templates/:id/content — returns HTML content for preview
app.get("/contracts/templates/:id/content", authenticate, (req, res) => {
  const row = db.prepare("SELECT file, template_type FROM contract_templates WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  if (row.template_type !== "html") return res.json({ content: null });
  res.json({ content: row.file.toString("utf-8") });
});

// DELETE /contracts/templates/:id
app.delete("/contracts/templates/:id", authenticate, (req, res) => {
  db.prepare("DELETE FROM contract_templates WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// POST /contracts/generate — fill template and return PDF or Word
app.post("/contracts/generate", authenticate, async (req, res) => {
  const { templateId, data, format } = req.body || {};
  const returnWord = format === "word";
  const row = db.prepare("SELECT * FROM contract_templates WHERE id=?").get(templateId);
  if (!row) return res.status(404).json({ error: "Template not found" });

  const tmpId   = Date.now() + "_" + Math.random().toString(36).slice(2);
  const pdfPath = path.join(TMP_DIR, tmpId + ".pdf");

  // ── HTML template path ────────────────────────────────────────────
  const isHtmlTemplate = row.template_type === "html" || (row.filename || "").toLowerCase().endsWith(".html");
  if (isHtmlTemplate) {
    try {
      let html = row.file.toString("utf-8");
      for (const [key, val] of Object.entries(data)) {
        if (key === "payment_schedule") continue;
        html = html.split(`@@${key}@@`).join(String(val ?? ""));
      }
      // Clear any remaining unfilled variables
      html = html.replace(/@@[a-zA-Z0-9_]+@@/g, "");
      const htmlPath = path.join(TMP_DIR, tmpId + ".html");
      fs.writeFileSync(htmlPath, html, "utf-8");
      // Use Edge via Puppeteer for full CSS support
      const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
      const page = await browser.newPage();
      await page.goto("file:///" + htmlPath.replaceAll("\\", "/"), { waitUntil: "networkidle0" });
      const pdfBytes = await page.pdf({ width: "338.67mm", height: "190.5mm", printBackground: true, margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" } });
      await browser.close();
      fs.unlinkSync(htmlPath);
      fs.writeFileSync(pdfPath, pdfBytes);
      db.prepare("INSERT INTO contracts (template_id, template_name, data, created_by, created_by_name) VALUES (?,?,?,?,?)")
        .run(templateId, row.name, JSON.stringify(data), req.user.id, req.user.name || req.user.email);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="sozlesme_${tmpId}.pdf"`);
      return res.send(pdfBytes);
    } catch (e) {
      console.error("[contracts/generate html]", e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── docxtemplater path (templates using {variable} syntax) ───────
  let isDocxtemplater = false;
  try {
    const zipCheck = new PizZip(row.file);
    const xmlCheck = zipCheck.file("word/document.xml")?.asText() || "";
    isDocxtemplater = xmlCheck.includes("[[party1_name") || xmlCheck.includes("[[#");
  } catch {}

  if (isDocxtemplater) {
    try {
      const zip = new PizZip(row.file);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: "[[", end: "]]" } });
      const schedule = (data.payment_schedule || []).map(r => ({
        payment_date: r.date || "",
        down_payment: r.amount || "",
      }));
      doc.render({ ...data, payment_schedule: schedule });
      const docxBuf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
      const docxPath = path.join(TMP_DIR, tmpId + ".docx");
      fs.writeFileSync(docxPath, docxBuf);
      db.prepare("INSERT INTO contracts (template_id, template_name, data, created_by, created_by_name) VALUES (?,?,?,?,?)")
        .run(templateId, row.name, JSON.stringify(data), req.user.id, req.user.name || req.user.email);
      if (returnWord) {
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="sozlesme_${tmpId}.docx"`);
        return res.send(docxBuf);
      }
      execSync(`"${LIBREOFFICE}" --headless --convert-to pdf --outdir "${TMP_DIR}" "${docxPath}"`, { timeout: 60000 });
      const pdfPath = path.join(TMP_DIR, tmpId + ".pdf");
      if (!fs.existsSync(pdfPath)) throw new Error("PDF conversion failed");
      const pdfBuf = fs.readFileSync(pdfPath);
      fs.unlinkSync(docxPath);
      fs.unlinkSync(pdfPath);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="sozlesme_${tmpId}.pdf"`);
      return res.send(pdfBuf);
    } catch (e) {
      console.error("[contracts/generate docxtemplater]", e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DOCX template path (legacy @@variable@@ templates) ────────────
  try {
    const zip = new PizZip(row.file);
    const xmlFiles = Object.keys(zip.files).filter(f => f.startsWith("word/") && f.endsWith(".xml") && !f.includes("theme") && !f.includes("settings"));

    // Expand payment_schedule array → named variables (payment_date1, down_payment1, ...)
    {
      const schedule = data.payment_schedule || [];
      schedule.forEach((row, i) => {
        data[`payment_date${i + 1}`] = row.date || "";
        data[`down_payment${i + 1}`] = row.amount || "";
      });
      // Clear unused slots up to 20
      for (let i = schedule.length + 1; i <= 20; i++) {
        data[`payment_date${i}`] = "";
        data[`down_payment${i}`] = "";
      }
    }

    // If Party 3 data provided, clone Party 2 blocks → Party 3 before variable replacement
    const hasParty3 = data.party3_name && String(data.party3_name).trim();
    if (hasParty3) {
      const docFile = zip.file("word/document.xml");
      if (docFile) {
        let docXml = mergeRuns(docFile.asText());
        // Try table rows first (party2 in a table)
        const hasTableParty2 = /<w:tr[ >][\s\S]*?@@party2_[\s\S]*?<\/w:tr>/.test(docXml);
        if (hasTableParty2) {
          docXml = docXml.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, match =>
            match.includes("@@party2_") ? match + match.replace(/@@party2_/g, "@@party3_") : match
          );
        } else {
          docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, match =>
            match.includes("@@party2_") ? match + match.replace(/@@party2_/g, "@@party3_") : match
          );
        }
        zip.file("word/document.xml", docXml);
      }
    }

    // Build payment schedule table XML if needed
    const scheduleRows = (data.payment_schedule || []);
    const scheduleTableXml = scheduleRows.length > 0 ? buildScheduleTable(scheduleRows) : "";

    for (const fname of xmlFiles) {
      const xmlFile = zip.file(fname);
      if (!xmlFile) continue;
      let xml = xmlFile.asText();

      // Replace each @@var@@ with its value
      for (const [key, val] of Object.entries(data)) {
        if (key === "payment_schedule") continue;
        const escaped = String(val ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        xml = xml.split(`@@${key}@@`).join(escaped);
      }

      // Replace @@payment_schedule@@ with table XML
      if (scheduleTableXml) {
        xml = xml.split("@@payment_schedule@@").join(scheduleTableXml);
      } else {
        xml = xml.split("@@payment_schedule@@").join("");
      }

      zip.file(fname, xml);
    }

    const docxBuf  = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
    const docxPath = path.join(TMP_DIR, tmpId + ".docx");
    fs.writeFileSync(docxPath, docxBuf);

    // Save contract record
    db.prepare("INSERT INTO contracts (template_id, template_name, data, created_by, created_by_name) VALUES (?,?,?,?,?)")
      .run(templateId, row.name, JSON.stringify(data), req.user.id, req.user.name || req.user.email);

    if (returnWord) {
      const buf = fs.readFileSync(docxPath);
      fs.unlinkSync(docxPath);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="sozlesme_${tmpId}.docx"`);
      return res.send(buf);
    }

    // Convert to PDF with LibreOffice headless
    execSync(`"${LIBREOFFICE}" --headless --convert-to pdf --outdir "${TMP_DIR}" "${docxPath}"`, { timeout: 60000 });

    if (!fs.existsSync(pdfPath)) throw new Error("PDF conversion failed");

    const pdfBuf = fs.readFileSync(pdfPath);
    fs.unlinkSync(docxPath);
    fs.unlinkSync(pdfPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="sozlesme_${tmpId}.pdf"`);
    res.send(pdfBuf);
  } catch (e) {
    console.error("[contracts/generate]", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /contracts/ocr — extract text from tax certificate image via local EasyOCR
app.post("/contracts/ocr", authenticate, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image provided" });
  try {
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    form.append("file", blob, req.file.originalname || "image.jpg");
    const mlRes = await fetch("http://localhost:8000/ocr", { method: "POST", body: form });
    if (!mlRes.ok) {
      const err = await mlRes.json().catch(() => ({}));
      return res.status(500).json({ error: err.detail || "OCR service error" });
    }
    res.json(await mlRes.json());
  } catch (e) {
    res.status(500).json({ error: "OCR service unavailable. Make sure the ML service is running." });
  }
});

// GET /contracts/history
app.get("/contracts/history", authenticate, (req, res) => {
  const rows = db.prepare("SELECT id, template_name, data, created_by_name, created_at FROM contracts ORDER BY created_at DESC LIMIT 50").all();
  res.json(rows.map(r => ({ ...r, data: JSON.parse(r.data) })));
});

// GET /contracts/report — aggregated reporting with date + preparer filters
app.get("/contracts/report", authenticate, (req, res) => {
  const { date_from, date_to, prepared_by } = req.query;
  let where = "WHERE 1=1";
  const params = [];
  if (date_from) { where += " AND date(created_at) >= date(?)"; params.push(date_from); }
  if (date_to)   { where += " AND date(created_at) <= date(?)"; params.push(date_to); }
  if (prepared_by) { where += " AND created_by_name = ?"; params.push(prepared_by); }

  const rows = db.prepare(
    `SELECT id, template_name, data, created_by_name, created_at FROM contracts ${where} ORDER BY created_at DESC`
  ).all(...params);

  const parsed = rows.map(r => {
    const d = JSON.parse(r.data);
    const raw = String(d.down_payment || "0").replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
    const value = parseFloat(raw) || 0;
    return { id: r.id, template_name: r.template_name, prepared_by: r.created_by_name, prepared_for: d.party2_name || "", value, created_at: r.created_at };
  });

  // Group by template_name + prepared_by
  const groups = {};
  parsed.forEach(c => {
    const key = `${c.template_name}|||${c.prepared_by}`;
    if (!groups[key]) groups[key] = { template_name: c.template_name, prepared_by: c.prepared_by, count: 0, total_value: 0, contracts: [] };
    groups[key].count++;
    groups[key].total_value += c.value;
    groups[key].contracts.push(c);
  });

  const preparers = [...new Set(db.prepare("SELECT DISTINCT created_by_name FROM contracts WHERE created_by_name IS NOT NULL").all().map(r => r.created_by_name))].sort();

  res.json({ groups: Object.values(groups), total_count: parsed.length, total_value: parsed.reduce((s, c) => s + c.value, 0), preparers });
});

// ── Helpers ───────────────────────────────────────────────────────

function mergeRuns(xml) {
  // Merge adjacent <w:r> runs within the same <w:p> so @@var@@ isn't split
  return xml.replace(/(<\/w:t>)(<\/w:r>)(<w:r(?:\s[^>]*)?>(?:<w:rPr>[^]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>)/g, (_, close_t, close_r, open_next) => {
    return close_t.replace("</w:t>", "") + close_r + open_next;
  }).replace(/<\/w:t><w:t[^>]*>/g, "");
}

function buildScheduleTable(rows) {
  const headerRow = `
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="4320" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>ÖDEME TARİHİ</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="4320" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>ÖDENECEK MEBLAĞ</w:t></w:r></w:p></w:tc>
    </w:tr>`;
  const dataRows = rows.map(r => `
    <w:tr>
      <w:tc><w:tcPr><w:tcW w:w="4320" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${escapeXml(r.date)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:tcPr><w:tcW w:w="4320" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>${escapeXml(r.amount)}</w:t></w:r></w:p></w:tc>
    </w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="8640" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4320"/><w:gridCol w:w="4320"/></w:tblGrid>${headerRow}${dataRows}</w:tbl>`;
}

function escapeXml(s) {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}



// ── CANVA HELPERS ─────────────────────────────────────────────────

function getCanvaConfig() {
  const rows = db.prepare("SELECT key, value FROM canva_config").all();
  const db_cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    ...db_cfg,
    client_id:     process.env.CANVA_CLIENT_ID     || db_cfg.client_id     || "",
    client_secret: process.env.CANVA_CLIENT_SECRET || db_cfg.client_secret || "",
  };
}

async function refreshCanvaToken(cfg) {
  const resp = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cfg.refresh_token,
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
    })
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error("Canva token refresh failed: " + JSON.stringify(data));
  const set = db.prepare("INSERT OR REPLACE INTO canva_config (key, value) VALUES (?, ?)");
  set.run("access_token", data.access_token);
  set.run("token_expires_at", String(Date.now() + (data.expires_in || 3600) * 1000));
  if (data.refresh_token) set.run("refresh_token", data.refresh_token);
  return data.access_token;
}

async function getValidCanvaToken() {
  const cfg = getCanvaConfig();
  if (!cfg.access_token) throw new Error("Canva not connected. Please authorize via Settings → Canva.");
  const expires = parseInt(cfg.token_expires_at || "0");
  if (Date.now() > expires - 60000) return await refreshCanvaToken(cfg);
  return cfg.access_token;
}

async function exportCanvaDesignAsPdf(canvaDesignId, token) {
  const createResp = await fetch("https://api.canva.com/rest/v1/exports", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ design_id: canvaDesignId, format: { type: "pdf", export_quality: "regular" } })
  });
  if (!createResp.ok) throw new Error("Canva export request failed: " + createResp.status);
  const createData = await createResp.json();
  const exportId = createData.job?.id;
  if (!exportId) throw new Error("No export job ID from Canva: " + JSON.stringify(createData));

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pollResp = await fetch(`https://api.canva.com/rest/v1/exports/${exportId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const pollData = await pollResp.json();
    const job = pollData.job;
    if (job?.status === "success") {
      const url = job.urls?.[0];
      if (!url) throw new Error("No download URL in Canva export result");
      const fileResp = await fetch(url);
      return Buffer.from(await fileResp.arrayBuffer());
    }
    if (job?.status === "failed") throw new Error("Canva export job failed");
  }
  throw new Error("Canva export timed out after 60 seconds");
}

function buildContractSlideHtml(data, theme = {}) {
  const accent = theme.accent_color || "#2563eb";
  const dark   = theme.dark_color   || "#1a2e47";
  // derive a slightly lighter shade for the gradient end
  const esc = s => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const programs = [
    data.program_name  ? { name: data.program_name,  fee: data.down_payment, bonus: data.success_bonus } : null,
    data.program2_name ? { name: data.program2_name, fee: data.program2_fee,  bonus: data.program2_bonus } : null,
    data.program3_name ? { name: data.program3_name, fee: data.program3_fee,  bonus: data.program3_bonus } : null,
  ].filter(Boolean);
  const progCards = programs.map(p => `
    <div class="card">
      <div class="card-title">${esc(p.name)}</div>
      ${p.fee   ? `<div class="card-row"><span class="card-label">Service Fee</span><span class="card-val">${esc(p.fee)}</span></div>` : ""}
      ${p.bonus ? `<div class="card-row"><span class="card-label">Success Bonus</span><span class="card-val">${esc(p.bonus)}%</span></div>` : ""}
    </div>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:338.67mm;height:190.5mm;font-family:'Segoe UI',Arial,sans-serif;display:flex;flex-direction:column;background:#fff;overflow:hidden}
  .top{padding:32px 44px 24px;flex:1}
  .subtitle{font-size:10px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .client{font-size:26px;font-weight:800;color:${dark};margin-bottom:4px}
  .date{font-size:12px;color:#8899b0;margin-bottom:24px}
  .bottom{background:linear-gradient(135deg,${dark} 0%,${accent} 100%);padding:26px 44px;display:flex;gap:20px;align-items:stretch}
  .card{flex:1;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:16px 18px}
  .card-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:10px;border-bottom:1px solid rgba(255,255,255,.2);padding-bottom:8px}
  .card-row{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
  .card-label{font-size:10px;color:rgba(255,255,255,.65);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
  .card-val{font-size:13px;font-weight:700;color:#fff}
  .notes-box{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:16px 18px}
  .notes-label{font-size:10px;font-weight:700;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
  .notes-text{font-size:12px;color:rgba(255,255,255,.85);line-height:1.5}
</style></head><body>
  <div class="top">
    <div class="subtitle">Fiyat Teklifi</div>
    <div class="client">${esc(data.party2_name || "—")}</div>
    <div class="date">${esc(data.contract_date || "")}</div>
  </div>
  <div class="bottom">
    ${progCards || '<div class="card"><div class="card-title">No program specified</div></div>'}
    ${data.notes ? `<div class="notes-box"><div class="notes-label">Notlar</div><div class="notes-text">${esc(data.notes)}</div></div>` : ""}
  </div>
</body></html>`;
}

async function generateContractSlide(contractData, theme = {}) {
  const html = buildContractSlideHtml(contractData, theme);
  const htmlPath = path.join(TMP_DIR, `canva_slide_${Date.now()}.html`);
  fs.writeFileSync(htmlPath, html, "utf-8");
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: true, args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.goto("file:///" + htmlPath.replaceAll("\\", "/"), { waitUntil: "networkidle0" });
  const pdfBytes = await page.pdf({ width: "338.67mm", height: "190.5mm", printBackground: true, margin: { top:"0mm", bottom:"0mm", left:"0mm", right:"0mm" } });
  await browser.close();
  fs.unlinkSync(htmlPath);
  return Buffer.from(pdfBytes);
}

async function mergeCanvaPdfWithSlide(canvaPdfBytes, slidePdfBytes, slideIndex) {
  const canvaDoc = await PDFDocument.load(canvaPdfBytes);
  const slideDoc = await PDFDocument.load(slidePdfBytes);
  const idx = Math.max(0, slideIndex - 1);

  // Get Canva's page dimensions so we can match them exactly
  const refIdx = Math.min(idx, canvaDoc.getPageCount() - 1);
  const { width: targetW, height: targetH } = canvaDoc.getPage(refIdx).getSize();

  // Remove the original slide at that position
  if (idx < canvaDoc.getPageCount()) canvaDoc.removePage(idx);

  // Create a new page at Canva's exact dimensions and draw our slide scaled to fill it
  const [embedded] = await canvaDoc.embedPages([slideDoc.getPage(0)]);
  const newPage = canvaDoc.insertPage(Math.min(idx, canvaDoc.getPageCount()));
  newPage.setSize(targetW, targetH);
  newPage.drawPage(embedded, { x: 0, y: 0, width: targetW, height: targetH });

  return Buffer.from(await canvaDoc.save());
}

// ── CANVA ROUTES ─────────────────────────────────────────────────

// GET /canva/config
app.get("/canva/config", authenticate, (req, res) => {
  const cfg = getCanvaConfig();
  res.json({ connected: !!cfg.access_token, has_credentials: !!(cfg.client_id && cfg.client_secret), client_id: cfg.client_id || "" });
});

// POST /canva/config — save client credentials (admin only)
app.post("/canva/config", authenticate, requireAdmin, (req, res) => {
  const { client_id, client_secret } = req.body || {};
  if (!client_id || !client_secret) return res.status(400).json({ error: "client_id and client_secret required" });
  const set = db.prepare("INSERT OR REPLACE INTO canva_config (key, value) VALUES (?, ?)");
  set.run("client_id", client_id.trim());
  set.run("client_secret", client_secret.trim());
  res.json({ ok: true });
});

// GET /canva/auth — start OAuth (opens in browser, no auth required)
app.get("/canva/auth", (req, res) => {
  const cfg = getCanvaConfig();
  if (!cfg.client_id) return res.status(400).send("<h2>Canva client_id not configured. Save credentials first.</h2>");
  const verifier = randomBytes(32).toString("base64url");
  db.prepare("INSERT OR REPLACE INTO canva_config (key, value) VALUES (?, ?)").run("oauth_verifier", verifier);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.client_id,
    redirect_uri: "http://127.0.0.1:3001/canva/callback",
    scope: "design:content:read design:meta:read",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "sns_erp"
  });
  res.redirect(`https://www.canva.com/api/oauth/authorize?${params}`);
});

// GET /canva/callback — OAuth callback
app.get("/canva/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("<h2>No authorization code received.</h2>");
  const cfg = getCanvaConfig();
  try {
    const tokenResp = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
        redirect_uri: "http://127.0.0.1:3001/canva/callback",
        code_verifier: cfg.oauth_verifier || ""
      })
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) return res.status(400).send("Token exchange failed: " + JSON.stringify(tokenData));
    const set = db.prepare("INSERT OR REPLACE INTO canva_config (key, value) VALUES (?, ?)");
    set.run("access_token", tokenData.access_token);
    set.run("refresh_token", tokenData.refresh_token || "");
    set.run("token_expires_at", String(Date.now() + (tokenData.expires_in || 3600) * 1000));
    res.send(`<html><body style="font-family:'Segoe UI',sans-serif;text-align:center;padding:80px;background:#0f172a;color:#fff">
      <h2 style="font-size:28px;margin-bottom:12px">✓ Canva Connected!</h2>
      <p style="color:#8899b0">You can close this tab and return to the ERP.</p>
      <script>setTimeout(()=>window.close(),2000)</script>
    </body></html>`);
  } catch (e) {
    res.status(500).send("Error: " + e.message);
  }
});

// POST /canva/exchange — frontend sends the code received from Canva redirect
app.post("/canva/exchange", authenticate, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "No code provided" });
  const cfg = getCanvaConfig();
  try {
    const tokenResp = await fetch("https://api.canva.com/rest/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
        redirect_uri: "http://127.0.0.1:3001/canva/callback",
        code_verifier: cfg.oauth_verifier || ""
      })
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) return res.status(400).json({ error: "Token exchange failed: " + JSON.stringify(tokenData) });
    const set = db.prepare("INSERT OR REPLACE INTO canva_config (key, value) VALUES (?, ?)");
    set.run("access_token", tokenData.access_token);
    set.run("refresh_token", tokenData.refresh_token || "");
    set.run("token_expires_at", String(Date.now() + (tokenData.expires_in || 3600) * 1000));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /canva/designs
app.get("/canva/designs", authenticate, (req, res) => {
  res.json(db.prepare("SELECT * FROM canva_designs ORDER BY created_at DESC").all());
});

// POST /canva/designs
app.post("/canva/designs", authenticate, requireAdmin, (req, res) => {
  const { label, design_id, slide_index } = req.body || {};
  if (!label?.trim() || !design_id?.trim()) return res.status(400).json({ error: "label and design_id required" });
  const r = db.prepare("INSERT INTO canva_designs (label, design_id, slide_index) VALUES (?,?,?)").run(label.trim(), design_id.trim(), parseInt(slide_index) || 1);
  res.json(db.prepare("SELECT * FROM canva_designs WHERE id=?").get(r.lastInsertRowid));
});

// PUT /canva/designs/:id
app.put("/canva/designs/:id", authenticate, requireAdmin, (req, res) => {
  const { label, design_id, slide_index, accent_color, dark_color } = req.body || {};
  db.prepare("UPDATE canva_designs SET label=?, design_id=?, slide_index=?, accent_color=?, dark_color=? WHERE id=?")
    .run(label, design_id, parseInt(slide_index) || 1, accent_color || "#2563eb", dark_color || "#1a2e47", req.params.id);
  res.json(db.prepare("SELECT * FROM canva_designs WHERE id=?").get(req.params.id));
});

// GET /canva/my-presentations — list all Canva presentations from the user's account
app.get("/canva/my-presentations", authenticate, async (req, res) => {
  try {
    const token = await getValidCanvaToken();
    let designs = [], continuation = null;
    do {
      const url = new URL("https://api.canva.com/rest/v1/designs");
      url.searchParams.set("type", "presentation");
      url.searchParams.set("ownership", "owned");
      if (continuation) url.searchParams.set("continuation", continuation);
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Canva API error: " + r.status);
      const data = await r.json();
      designs = designs.concat(data.items || []);
      continuation = data.continuation || null;
    } while (continuation && designs.length < 200);
    res.json(designs.map(d => ({ id: d.id, title: d.title || "Untitled", thumbnail: d.thumbnail?.url || null, updated_at: d.updated_at })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /canva/designs/:id/thumbnail — returns a fresh thumbnail URL for slide 1
app.get("/canva/designs/:id/thumbnail", authenticate, async (req, res) => {
  const design = db.prepare("SELECT * FROM canva_designs WHERE id=?").get(req.params.id);
  if (!design) return res.status(404).json({ error: "Not found" });
  try {
    const token = await getValidCanvaToken();
    const r = await fetch(`https://api.canva.com/rest/v1/designs/${design.design_id}/pages?limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await r.json();
    const thumb = data?.items?.[0]?.thumbnail?.url;
    if (!thumb) return res.status(404).json({ error: "No thumbnail" });
    res.json({ url: thumb });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /canva/designs/:id
app.delete("/canva/designs/:id", authenticate, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM canva_designs WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// POST /canva/generate — export Canva PDF, inject dynamic slide, return merged PDF
app.post("/canva/generate", authenticate, async (req, res) => {
  const { designDbId, contractData } = req.body || {};
  const design = db.prepare("SELECT * FROM canva_designs WHERE id=?").get(designDbId);
  if (!design) return res.status(404).json({ error: "Design not found" });
  try {
    const token = await getValidCanvaToken();
    const [canvaPdfBytes, slidePdfBytes] = await Promise.all([
      exportCanvaDesignAsPdf(design.design_id, token),
      generateContractSlide(contractData || {}, { accent_color: design.accent_color, dark_color: design.dark_color })
    ]);
    const mergedPdfBytes = await mergeCanvaPdfWithSlide(canvaPdfBytes, slidePdfBytes, design.slide_index);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="presentation_${Date.now()}.pdf"`);
    res.send(mergedPdfBytes);
  } catch (e) {
    console.error("[canva/generate]", e);
    res.status(500).json({ error: e.message });
  }
});

// ── PRICING (PPTX substitution) ─────────────────────────────────

const PRICING_DESIGN_ID = "DAHIU8eLrYs";

async function exportCanvaDesignAsPptx(designId, token, pages = null) {
  const format = pages
    ? { type: "pptx", export_quality: "regular", pages }
    : { type: "pptx", export_quality: "regular" };
  const createResp = await fetch("https://api.canva.com/rest/v1/exports", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ design_id: designId, format })
  });
  if (!createResp.ok) throw new Error("Canva PPTX export failed: " + createResp.status);
  const createData = await createResp.json();
  const exportId = createData.job?.id;
  if (!exportId) throw new Error("No export job ID: " + JSON.stringify(createData));
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pollData = await fetch(`https://api.canva.com/rest/v1/exports/${exportId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    }).then(r => r.json());
    const job = pollData.job;
    if (job?.status === "success") {
      const url = job.urls?.[0];
      if (!url) throw new Error("No download URL in PPTX export");
      return Buffer.from(await (await fetch(url)).arrayBuffer());
    }
    if (job?.status === "failed") throw new Error("Canva PPTX export job failed");
  }
  throw new Error("Canva PPTX export timed out");
}

function replacePptxPlaceholders(pptxBuffer, replacements) {
  const zip = new PizZip(pptxBuffer);
  // Font substitution map — replaces fonts LibreOffice doesn't have with system equivalents
  const FONT_SUBS = {
    "Montserrat Bold":    "Calibri",
    "Montserrat":         "Calibri",
    "Raleway":            "Calibri",
    "Lato":               "Calibri",
    "Poppins":            "Calibri",
    "Nunito":             "Calibri",
  };

  // Consolidate split runs in a paragraph then replace — handles Canva's XML fragmentation
  function processXml(xml) {
    // Step 1: consolidate placeholder text split across <a:r> runs within each <a:p>
    xml = xml.replace(/(<a:p\b[^>]*>)([\s\S]*?)(<\/a:p>)/g, (full, open, inner, close) => {
      // collect all run texts in this paragraph
      const texts = [];
      const runRe = /(<a:r\b[^>]*>)([\s\S]*?)(<\/a:r>)/g;
      let m;
      while ((m = runRe.exec(inner)) !== null) {
        const tMatch = m[2].match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/);
        texts.push({ full: m[0], text: tMatch ? tMatch[1] : "" });
      }
      const combined = texts.map(t => t.text).join("");
      const hasPlaceholder = Object.keys(replacements).some(k => combined.includes(k));
      if (!hasPlaceholder) return full;
      // rebuild: keep first run's properties, put combined (replaced) text in it, drop other runs
      if (texts.length === 0) return full;
      let replaced = combined;
      for (const [k, v] of Object.entries(replacements)) {
        replaced = replaced.replaceAll(k, v);
      }
      const firstRun = texts[0].full;
      const rPropsMatch = firstRun.match(/<a:rPr[\s\S]*?\/>/)?.[0] || firstRun.match(/<a:rPr[\s\S]*?<\/a:rPr>/)?.[0] || "";
      const newRun = `<a:r>${rPropsMatch}<a:t>${escapeXml(replaced)}</a:t></a:r>`;
      // replace all runs in inner with single new run
      const newInner = inner.replace(/(<a:r\b[^>]*>[\s\S]*?<\/a:r>)+/, newRun);
      return `${open}${newInner}${close}`;
    });

    // Step 2: catch any remaining placeholders that survived as single runs
    for (const [k, v] of Object.entries(replacements)) {
      xml = xml.replaceAll(k, escapeXml(v));
    }
    // Step 3: substitute fonts LibreOffice can't render
    for (const [from, to] of Object.entries(FONT_SUBS)) {
      xml = xml.replaceAll(`typeface="${from}"`, `typeface="${to}"`);
    }
    return xml;
  }

  for (const name of Object.keys(zip.files)) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue;
    let xml = zip.files[name].asText();
    // Apply font subs to ALL slides regardless of placeholders
    for (const [from, to] of Object.entries(FONT_SUBS)) {
      xml = xml.replaceAll(`typeface="${from}"`, `typeface="${to}"`);
    }
    const hasAny = Object.keys(replacements).some(k => xml.includes(k));
    if (!hasAny) { zip.file(name, xml); continue; }
    zip.file(name, processXml(xml));
  }

  return zip.generate({ type: "nodebuffer" });
}

function buildPricingSlideHtml(d) {
  const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const n = Math.min(Math.max(parseInt(d.num_options) || 1, 1), 3);
  const opts = (d.opt || []).slice(0, n);
  while (opts.length < n) opts.push({});

  const BADGE_COLORS = ["#ad3125", "#0b3e64", "#1B5EA8"];

  const cardHtml = (o, valSize) => {
    const fee2 = o.succ_fee_2;
    return `<div class="card">
      <div class="price-label">Peşinat / Down Payment</div>
      <div class="price-value" style="font-size:${valSize}px">${esc(o.dp ? o.dp+" TL + KDV" : "")}</div>
      <hr class="divider">
      <div class="price-label">Başarı Primi 1 / Success Fee 1</div>
      <div class="price-value" style="font-size:${valSize}px;margin-bottom:4px">${esc(o.succ_fee_1 ? "%"+o.succ_fee_1+" + KDV" : "")}</div>
      ${o.note1 ? `<div class="price-note">${esc(o.note1)}</div>` : `<div style="margin-bottom:10px"></div>`}
      ${fee2 ? `<hr class="divider">
      <div class="price-label">Başarı Primi 2 / Success Fee 2</div>
      <div class="price-value" style="font-size:${valSize}px;margin-bottom:4px">${esc("%"+fee2+" + KDV")}</div>
      ${o.note2 ? `<div class="price-note" style="margin-bottom:0">${esc(o.note2)}</div>` : ""}` : ""}
    </div>`;
  };

  const is1 = n === 1, is3 = n === 3;
  const gap       = is3 ? "14px" : "18px";
  const topPad    = is1 ? "26px 80px 0" : is3 ? "20px 16px 0" : "22px 20px 0";
  const valSize   = is3 ? 20 : is1 ? 26 : 22;
  const labelSize = is3 ? 11 : 13;
  const noteSize  = is3 ? 10 : 11;
  const cardPad   = "22px 40px";
  const cardW     = "350px";
  const notesW    = is1 ? cardW : `calc(${n} * ${cardW} + ${n-1} * ${gap})`;

  const badgesHtml = is1
    ? `<div class="badge" style="background:${BADGE_COLORS[0]}">${esc(opts[0]?.title || "FİYATLANDIRMA")}</div>`
    : `<div class="badges">${opts.map((o, i) =>
        `<div class="badge" style="background:${BADGE_COLORS[i]}">${esc(o.title || `Seçenek ${i+1}`)}</div>`
      ).join("")}</div>`;

  const cardsHtml = is1
    ? cardHtml(opts[0], valSize)
    : `<div class="cols">${opts.map(o => cardHtml(o, valSize)).join("")}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Arial', sans-serif; color: #0b3e64; width: 338.67mm; height: 190.5mm; overflow: hidden; }
.page { display: flex; flex-direction: column; height: 190.5mm; position: relative; }

/* White top half */
.top { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 80px 80px 0; background: #fff; position: relative; overflow: hidden; }
.deco-tr { position: absolute; width: 90px; height: 90px; border-radius: 50%; background: #ad3125; top: -30px; right: -25px; }
.title { font-size: ${is3 ? 36 : 40}px; font-weight: 900; color: #ad3125; letter-spacing: 4px; }

/* Dark bottom half — overflow:hidden so decos are clipped cleanly */
.dark-section { flex: 1; background: #081828; position: relative; overflow: hidden; }
.deco-left { position: absolute; width: 36px; height: 36px; border-radius: 50%; background: #0b3e64; left: 24px; top: 42%; }
.deco-br { position: absolute; width: 150px; height: 150px; border-radius: 50%; background: #ad3125; right: -50px; bottom: -55px; opacity: 0.85; }
.deco-bl { position: absolute; width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, #ad3125 0%, transparent 70%); left: -30px; bottom: -30px; opacity: 0.7; }
.notes-wrap { margin-top: 10px; text-align: center; width: ${notesW}; }
.notes-text { font-size: 11px; color: rgba(255,255,255,0.75); font-style: italic; line-height: 1.6; }

/* Badge+card group: absolutely positioned on the page, straddling the boundary */
.card-group { position: absolute; left: 50%; transform: translateX(-50%); top: calc(50% - 120px); z-index: 10; display: flex; flex-direction: column; align-items: center; }
.badge { display: block; width: ${cardW}; color: #fff; font-size: 14px; font-weight: 700; padding: 11px 14px; text-align: center; border-radius: 6px 6px 0 0; word-break: break-word; overflow: hidden; box-sizing: border-box; }
.badges { display: flex; gap: ${gap}; justify-content: center; }
.badges .badge { flex: 0 0 ${cardW}; width: ${cardW}; border-radius: 6px 6px 0 0; }
.cols { display: flex; gap: ${gap}; }
.card { width: ${cardW}; flex: 0 0 ${cardW}; background: #fff; border-radius: 0 0 12px 12px; padding: ${cardPad}; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
.price-label { text-align: center; font-size: ${labelSize}px; color: #ad3125; font-weight: 700; margin-bottom: 3px; }
.price-value { text-align: center; font-weight: 900; color: #0b3e64; margin-bottom: 10px; white-space: nowrap; }
.price-note { text-align: center; font-size: ${noteSize}px; color: #555; font-style: italic; margin-bottom: 10px; }
.divider { border: none; border-top: 1px solid #dde4f0; margin: 8px 0 12px; }
</style></head><body>
<div class="page">
  <div class="top">
    <div class="deco-tr"></div>
    <div class="title">ÜCRETLENDİRME</div>
  </div>
  <div class="dark-section">
    <div class="deco-left"></div>
    <div class="deco-br"></div>
    <div class="deco-bl"></div>
  </div>
  <div class="card-group">
    ${badgesHtml}
    ${cardsHtml}
    ${d.gen_note ? `<div class="notes-wrap"><div class="notes-text">${esc(d.gen_note)}</div></div>` : ""}
  </div>
</div>
</body></html>`;
}

function buildGreenPricingSlideHtml(d) {
  // Same structure as buildPricingSlideHtml but with green/navy color scheme
  const src = buildPricingSlideHtml(d);
  return src
    .replaceAll("#ad3125", "#4B6428")   // red → green
    .replaceAll("#0b3e64", "#1B2E5E")   // blue → navy
    .replaceAll("#081828", "linear-gradient(135deg, #2D5016 0%, #1B2E5E 100%)") // won't work on background shorthand
    // Handle background separately
    .replace("background: #081828", "background: linear-gradient(135deg, #2D5016 0%, #1B2E5E 100%)")
    .replaceAll("color: #0b3e64", "color: #1B2E5E")
    .replaceAll("#dde4f0", "#E0EAF4");
}

async function generatePricingSlide(data) {
  const html = data.theme === "green" ? buildGreenPricingSlideHtml(data) : buildPricingSlideHtml(data);
  const htmlPath = path.join(TMP_DIR, `pricing_slide_${Date.now()}.html`);
  fs.writeFileSync(htmlPath, html, "utf-8");
  const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: true, args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.goto("file:///" + htmlPath.replaceAll("\\", "/"), { waitUntil: "networkidle0" });
  const pdfBytes = await page.pdf({ width: "338.67mm", height: "190.5mm", printBackground: true, margin: { top:"0mm", bottom:"0mm", left:"0mm", right:"0mm" } });
  await browser.close();
  fs.unlinkSync(htmlPath);
  return Buffer.from(pdfBytes);
}

async function pricingSlideToPdf(pptxBuffer) {
  const dir = path.join(TMP_DIR, `pricing_${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const pptxPath = path.join(dir, "slide.pptx");
  fs.writeFileSync(pptxPath, pptxBuffer);
  execSync(`"${LIBREOFFICE}" --headless --convert-to pdf --outdir "${dir}" "${pptxPath}"`, { timeout: 90000 });
  const pdfPath = path.join(dir, "slide.pdf");
  if (!fs.existsSync(pdfPath)) throw new Error("LibreOffice did not produce a PDF");
  const pdfBytes = fs.readFileSync(pdfPath);
  fs.rmSync(dir, { recursive: true, force: true });
  return pdfBytes;
}

// ── PROGRAM PRESENTATIONS ────────────────────────────────────────

app.get("/presentations", authenticate, (req, res) => {
  res.json(db.prepare("SELECT * FROM program_presentations ORDER BY category, name").all());
});

app.post("/presentations", authenticate, requireAdmin, async (req, res) => {
  const { category, name, canva_link } = req.body || {};
  if (!name || !canva_link) return res.status(400).json({ error: "name and canva_link required" });
  // Resolve canva.link short URL → extract design ID
  let design_id = "";
  try {
    const r = await fetch(canva_link.trim(), { redirect: "follow", signal: AbortSignal.timeout(10000) });
    const match = r.url.match(/canva\.com\/design\/([A-Za-z0-9_-]+)/);
    if (match) design_id = match[1];
  } catch (e) { /* leave empty, user can fix manually */ }
  const row = db.prepare("INSERT INTO program_presentations (category, name, canva_link, design_id) VALUES (?,?,?,?)").run(category || "", name.trim(), canva_link.trim(), design_id);
  res.json(db.prepare("SELECT * FROM program_presentations WHERE id=?").get(row.lastInsertRowid));
});

app.put("/presentations/:id", authenticate, requireAdmin, (req, res) => {
  const { category, name, canva_link, design_id } = req.body || {};
  db.prepare("UPDATE program_presentations SET category=?, name=?, canva_link=?, design_id=? WHERE id=?").run(category || "", name || "", canva_link || "", design_id || "", req.params.id);
  res.json(db.prepare("SELECT * FROM program_presentations WHERE id=?").get(req.params.id));
});

app.delete("/presentations/:id", authenticate, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM program_presentations WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// POST /pricing/generate-program — renders pricing_Xprogram.html and merges into Canva presentation
app.post("/pricing/generate-program", authenticate, async (req, res) => {
  const { num_programs, party2_name, contract_date, notes, programs, design_id } = req.body || {};
  const n = Math.min(Math.max(parseInt(num_programs) || 1, 1), 3);
  const file = n === 1 ? "pricing_1program.html" : n === 2 ? "pricing_2programs.html" : "pricing_3programs.html";
  const p = programs || [];
  const replacements = {
    "@@party2_name@@":    party2_name   || "",
    "@@contract_date@@":  contract_date || "",
    "@@notes@@":          notes         || "",
    "@@program_name@@":   p[0]?.name    || "",
    "@@down_payment@@":   p[0]?.fee     || "",
    "@@success_bonus@@":  p[0]?.bonus   || "",
    "@@program2_name@@":  p[1]?.name    || "",
    "@@program2_fee@@":   p[1]?.fee     || "",
    "@@program2_bonus@@": p[1]?.bonus   || "",
    "@@program3_name@@":  p[2]?.name    || "",
    "@@program3_fee@@":   p[2]?.fee     || "",
    "@@program3_bonus@@": p[2]?.bonus   || "",
  };
  try {
    // Render the HTML template with Puppeteer
    let html = fs.readFileSync(path.join(__dirname, file), "utf-8");
    for (const [k, v] of Object.entries(replacements)) html = html.replaceAll(k, v);
    const htmlPath = path.join(TMP_DIR, `prog_pricing_${Date.now()}.html`);
    fs.writeFileSync(htmlPath, html, "utf-8");
    const browser = await puppeteer.launch({ executablePath: EDGE_PATH, headless: true, args: ["--no-sandbox","--disable-setuid-sandbox"] });
    const pg = await browser.newPage();
    await pg.goto("file:///" + htmlPath.replaceAll("\\", "/"), { waitUntil: "networkidle0" });
    const slidePdfBytes = Buffer.from(await pg.pdf({ width: "338.67mm", height: "190.5mm", printBackground: true, margin: { top:"0mm", bottom:"0mm", left:"0mm", right:"0mm" } }));
    await browser.close();
    fs.unlinkSync(htmlPath);

    // Try to merge into Canva presentation (second to last slide)
    let finalPdfBytes;
    const targetDesignId = (design_id || "").trim() || PRICING_DESIGN_ID;
    try {
      const token = await getValidCanvaToken();
      const canvaPdfBytes = await exportCanvaDesignAsPdf(targetDesignId, token);
      const canvaDoc = await PDFDocument.load(canvaPdfBytes);
      const slideIndex = canvaDoc.getPageCount() - 1;
      finalPdfBytes = await mergeCanvaPdfWithSlide(canvaPdfBytes, slidePdfBytes, slideIndex);
    } catch (canvaErr) {
      console.warn("[pricing/generate-program] Canva unavailable — returning slide only:", canvaErr.message);
      finalPdfBytes = slidePdfBytes;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="pricing_${Date.now()}.pdf"`);
    res.send(finalPdfBytes);
  } catch (e) {
    console.error("[pricing/generate-program]", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /pricing/generate
app.post("/pricing/generate", authenticate, async (req, res) => {
  const { num_options, opt, gen_note, design_id, theme } = req.body || {};
  const data = { num_options: num_options || 1, opt: opt || [], gen_note: gen_note || "", theme: theme || "blue" };
  const targetDesignId = (design_id || "").trim() || PRICING_DESIGN_ID;
  try {
    const slidePdfBytes = await generatePricingSlide(data);

    let finalPdfBytes;
    try {
      const token = await getValidCanvaToken();
      const canvaPdfBytes = await exportCanvaDesignAsPdf(targetDesignId, token);
      // Pricing page is always second to last — compute dynamically
      const canvaDoc = await PDFDocument.load(canvaPdfBytes);
      const slideIndex = canvaDoc.getPageCount() - 1; // 1-indexed: second to last
      finalPdfBytes = await mergeCanvaPdfWithSlide(canvaPdfBytes, slidePdfBytes, slideIndex);
    } catch (canvaErr) {
      console.warn("[pricing/generate] Canva unavailable — returning slide only:", canvaErr.message);
      finalPdfBytes = slidePdfBytes;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="pricing_${Date.now()}.pdf"`);
    res.send(finalPdfBytes);
  } catch (e) {
    console.error("[pricing/generate]", e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔐 Sun & Sun ERP Auth Server → http://localhost:${PORT}`);
});
