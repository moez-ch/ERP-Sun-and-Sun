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
    sort_order  INTEGER NOT NULL DEFAULT 0
  )
`);
// Seed known companies if table is empty
const companyCount = db.prepare("SELECT COUNT(*) as c FROM contract_companies").get().c;
if (companyCount === 0) {
  const ins = db.prepare("INSERT INTO contract_companies (name,short,tax_office,tax_no,address,iban,sort_order) VALUES (?,?,?,?,?,?,?)");
  ins.run("Sun Proje Tercüme Danışmanlık Eğt. İth. İhr. ve San. Tic. Ltd. Şti.","Sun Proje","Doğanbey Vergi Dairesi","782 053 6086","Ümit Mah. 2545. Sok. No:11 Çankaya ANKARA","TR10 0010 0068 1460 8882 1500 1",1);
  ins.run("Analiz Kariyer Danışmanlık Eğt. Özel İstih. ve İns. Kay. Turz. Bil. Yaz. Tic. Ltd. Şti.","Analiz Kariyer","Doğanbey Vergi Dairesi","068 083 9717","Aşağı Öveçler Mah. 1324. Cad. 37/4 Çankaya ANKARA","TR18 0010 0068 1690 9836 9500 1",2);
  ins.run("Sun ve Sun Danışmanlık Bilişim San. ve Tic. A.Ş.","Sun ve Sun A.Ş.","","","","",3);
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
  res.json(db.prepare("SELECT * FROM contract_companies ORDER BY sort_order, id").all());
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
  const { name, short, tax_office, tax_no, address, iban } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Name required" });
  db.prepare("UPDATE contract_companies SET name=?,short=?,tax_office=?,tax_no=?,address=?,iban=? WHERE id=?").run(name.trim(), short||"", tax_office||"", tax_no||"", address||"", iban||"", req.params.id);
  res.json(db.prepare("SELECT * FROM contract_companies WHERE id=?").get(req.params.id));
});

// DELETE /contracts/companies/:id
app.delete("/contracts/companies/:id", authenticate, (req, res) => {
  db.prepare("DELETE FROM contract_companies WHERE id=?").run(req.params.id);
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

// DELETE /contracts/templates/:id
app.delete("/contracts/templates/:id", authenticate, (req, res) => {
  db.prepare("DELETE FROM contract_templates WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// POST /contracts/generate — fill template and return PDF
app.post("/contracts/generate", authenticate, async (req, res) => {
  const { templateId, data } = req.body || {};
  const row = db.prepare("SELECT * FROM contract_templates WHERE id=?").get(templateId);
  if (!row) return res.status(404).json({ error: "Template not found" });

  const tmpId   = Date.now() + "_" + Math.random().toString(36).slice(2);
  const pdfPath = path.join(TMP_DIR, tmpId + ".pdf");

  // ── HTML template path ────────────────────────────────────────────
  if (row.template_type === "html") {
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
      const loProfile1 = path.join(TMP_DIR, "lo_" + tmpId);
      fs.mkdirSync(loProfile1, { recursive: true });
      try {
        execSync(`"${LIBREOFFICE}" --headless --norestore --nofirststartwizard "-env:UserInstallation=file:///${loProfile1.replace(/\\/g, "/")}" --convert-to pdf --outdir "${TMP_DIR}" "${htmlPath}"`, { timeout: 60000 });
      } finally { try { fs.rmSync(loProfile1, { recursive: true, force: true }); } catch {} }
      fs.unlinkSync(htmlPath);
      if (!fs.existsSync(pdfPath)) throw new Error("PDF conversion failed");
      const pdfBuf = fs.readFileSync(pdfPath);
      fs.unlinkSync(pdfPath);
      db.prepare("INSERT INTO contracts (template_id, template_name, data, created_by, created_by_name) VALUES (?,?,?,?,?)")
        .run(templateId, row.name, JSON.stringify(data), req.user.id, req.user.name || req.user.email);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="sozlesme_${tmpId}.pdf"`);
      return res.send(pdfBuf);
    } catch (e) {
      console.error("[contracts/generate html]", e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── DOCX template path ────────────────────────────────────────────
  try {
    const zip = new PizZip(row.file);
    const xmlFiles = Object.keys(zip.files).filter(f => f.startsWith("word/") && f.endsWith(".xml") && !f.includes("theme") && !f.includes("settings"));

    // Build payment schedule table XML if needed
    const scheduleRows = (data.payment_schedule || []);
    const scheduleTableXml = scheduleRows.length > 0 ? buildScheduleTable(scheduleRows) : "";

    for (const fname of xmlFiles) {
      const xmlFile = zip.file(fname);
      if (!xmlFile) continue;
      let xml = xmlFile.asText();

      // Merge split text runs so @@var@@ isn't fragmented across <w:t> elements
      xml = mergeRuns(xml);

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

    // Convert to PDF with LibreOffice headless (isolated profile to avoid lock conflicts)
    const loProfile2 = path.join(TMP_DIR, "lo_" + tmpId);
    fs.mkdirSync(loProfile2, { recursive: true });
    try {
      execSync(`"${LIBREOFFICE}" --headless --norestore --nofirststartwizard "-env:UserInstallation=file:///${loProfile2.replace(/\\/g, "/")}" --convert-to pdf --outdir "${TMP_DIR}" "${docxPath}"`, { timeout: 60000 });
    } finally { try { fs.rmSync(loProfile2, { recursive: true, force: true }); } catch {} }

    if (!fs.existsSync(pdfPath)) throw new Error("PDF conversion failed");

    const pdfBuf = fs.readFileSync(pdfPath);
    fs.unlinkSync(docxPath);
    fs.unlinkSync(pdfPath);

    // Save contract record
    db.prepare("INSERT INTO contracts (template_id, template_name, data, created_by, created_by_name) VALUES (?,?,?,?,?)")
      .run(templateId, row.name, JSON.stringify(data), req.user.id, req.user.name || req.user.email);

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



app.listen(PORT, () => {
  console.log(`🔐 Sun & Sun ERP Auth Server → http://localhost:${PORT}`);
});
