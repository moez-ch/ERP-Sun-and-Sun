import express from "express";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";

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

const templateCount = db.prepare("SELECT COUNT(*) AS n FROM email_templates").get().n;
if (templateCount === 0) {
  const insertTpl = db.prepare("INSERT INTO email_templates (label, color, subject, body) VALUES (?, ?, ?, ?)");
  insertTpl.run("İlgileniyoruz ✓", "#2e7d32", "Finansman Desteği Hakkında",
    "Merhaba,\n\nPaylaştığınız finansman desteği ile ilgileniyoruz. Detayları görüşmek üzere sizinle iletişime geçmek isteriz.\n\nİyi çalışmalar,\n\nSaygılarımla,");
  insertTpl.run("Sektör Dışı ✗", "#c62828", "Finansman Desteği – Sektör Kapsamı Dışı",
    "Merhaba,\n\nPaylaştığınız finansman desteği için teşekkür ederiz. Ancak firmamızın faaliyet gösterdiği sektör bu program kapsamında yer almadığı için değerlendiremiyoruz.\n\nSaygılarımla");
  insertTpl.run("İlgilenmiyoruz ✗", "#e65100", "Finansman Desteği – Şu An İçin Uygun Değil",
    "Merhaba,\n\nPaylaştığınız finansman desteği için teşekkür ederiz, ancak şu an için ilgilenmiyoruz.\n\nİyi çalışmalar dileriz.\n\nSaygılarımla");
  insertTpl.run("Hibe Duyurusu 📢", "#6a1b9a", "Faizsiz 7.500.000 TL Finansman Desteği – Sınırlı Başvuru",
    `Merhaba [İsim],

Sanayi firmalarına yönelik faizsiz 7.500.000 TL'ye kadar kredi fırsatı sunan bir finansman desteği sınırlı başvuru ile çağrıya çıktı. Önümüzdeki dönemde artan enerji maliyetleri, karbon regülasyonları ve rekabet baskısı nedeniyle firmaların üretim süreçlerini daha verimli, sürdürülebilir ve maliyet avantajı sağlayacak şekilde dönüştürmesi kaçınılmaz bir hale gelmişken bu destek söz konusu dönüşümü düşük maliyetle gerçekleştirmek isteyen firmalar için önemli bir fırsat sunmaktadır.

Bu programın en önemli farkı:
🚫Faiz yok, kar payı yok
⏳İlk 6 ay geri ödeme yok
✅Toplam 30 ay vade ile sadece anapara ödemesi
Yani mevcut finansman koşullarına kıyasla ciddi bir maliyet avantajı sağlıyor.

Program kapsamında firmalar;
- Yeni makine, ekipman ve yazılım yatırımları,
- Yenilenebilir enerji yatırımları (GES vb.),
- Kalite, marka ve patent gibi belge alımları
- Makine kurulumuna yönelik tadilat, montaj ve altyapı işleri,
- Sınırlı deneme üretimi için hammadde giderleri,
- Sarf malzemesi giderleri,
- Eğitim, danışmanlık, denetim, görünürlük hizmetleri,
gibi birçok kalemi bu finansman kapsamında karşılayabilmektedir.

❗ KDV giderleri de destek kapsamına dahildir.

Başvurular 8 Mayıs tarihinde sona eriyor. Dilerseniz programın ayrıntılarını ve firmanızın uygunluğunu hızlıca analiz edip, bu destekten en verimli şekilde nasıl yararlanabileceğinizi birlikte değerlendirebiliriz. Bu maili yanıtlayarak ya da aşağıda yer alan telefon numaramdan bana ulaşabilirsiniz.

Saygılarımla

Merve ÇÖLOĞLU
Müşteri İletişim Sorumlusu
0541 634 95 76`);
}

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
const SIGNATURE_HTML = `
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
        <div style="font-weight:bold;font-size:14px;color:#c0392b;margin-bottom:2px;">Merve Çöloğlu</div>
        <div style="color:#555;font-size:12px;padding-bottom:7px;border-bottom:1px solid #ddd;margin-bottom:7px;">Müşteri İletişim Sorumlusu</div>
        <div style="margin-bottom:4px;">&#128222;&nbsp;<a href="tel:+905416349576" style="color:#333;text-decoration:none;">541 634 9576</a></div>
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

// POST /email/send — send bulk email via SendGrid (admin)
// recipients may include per-recipient htmlBody for personalization
app.post("/email/send", authenticate, async (req, res) => {
  const { apiKey, fromEmail, fromName, subject, htmlBody, body, recipients, attachments } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: "SendGrid API key is required" });
  const defaultBody = htmlBody || body || "";
  if (!fromEmail || !subject || !defaultBody) return res.status(400).json({ error: "fromEmail, subject and body are required" });
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: "No recipients provided" });

  console.log(`📧 /email/send — ${recipients.length} recipients, subject: "${subject}"`);
  recipients.forEach((r, i) => console.log(`  [${i}] email=${r.email} name=${r.name} hasBody=${!!r.htmlBody}`));

  const CHUNK = 1000;
  let totalSent = 0;
  let totalFailed = 0;
  const errors = [];

  // Group recipients by their individual body (for personalization); fall back to defaultBody
  const groups = new Map();
  for (const r of recipients) {
    const key = r.htmlBody || defaultBody;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  for (const [groupBody, groupRecipients] of groups) {
    for (let i = 0; i < groupRecipients.length; i += CHUNK) {
      const chunk = groupRecipients.slice(i, i + CHUNK);
      const payload = {
        personalizations: chunk.map((r) => ({ to: [{ email: r.email, name: r.name || "" }] })),
        from: { email: fromEmail, name: fromName || "Sun & Sun" },
        subject,
        content: [{ type: "text/html", value: `<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#222;max-width:600px;">${groupBody}</div>${SIGNATURE_HTML}` }],
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
        if (sgRes.ok || sgRes.status === 202) {
          totalSent += chunk.length;
        } else {
          const errBody = await sgRes.json().catch(() => ({}));
          console.log(`  SendGrid error:`, JSON.stringify(errBody));
          totalFailed += chunk.length;
          errors.push(errBody?.errors?.[0]?.message || `HTTP ${sgRes.status}`);
        }
      } catch (e) {
        totalFailed += chunk.length;
        errors.push(e.message);
      }
    }
  }

  res.json({ sent: totalSent, failed: totalFailed, errors });
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

// ── MONDAY.COM ───────────────────────────────────────────────────────────────

// POST /monday/board — fetch items from a Monday.com board
app.post("/monday/board", authenticate, async (req, res) => {
  const { apiKey, boardId } = req.body || {};
  if (!apiKey || !boardId) return res.status(400).json({ error: "apiKey and boardId are required" });

  const query = `query {
    boards(ids: [${parseInt(boardId)}]) {
      name
      columns { id title type }
      items_page(limit: 500) {
        items {
          id
          name
          column_values { id text value column { title type } }
        }
      }
    }
  }`;

  try {
    const r = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": apiKey,
        "API-Version": "2024-01",
      },
      body: JSON.stringify({ query }),
    });
    const data = await r.json();
    res.json(data);
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
      if (colType === "tag") {
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
      results.push({ itemId, columnId, ok: !data.errors, errors: data.errors });
    } catch (e) {
      results.push({ itemId, columnId, ok: false, error: e.message });
    }
  }
  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`🔐 Sun & Sun ERP Auth Server → http://localhost:${PORT}`);
});
