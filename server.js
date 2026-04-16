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
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }));
app.use(express.json());

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

// POST /email/send — send bulk email via SendGrid (admin)
app.post("/email/send", authenticate, requireAdmin, async (req, res) => {
  const { apiKey, fromEmail, fromName, subject, htmlBody, recipients } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: "SendGrid API key is required" });
  if (!fromEmail || !subject || !htmlBody) return res.status(400).json({ error: "fromEmail, subject and htmlBody are required" });
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: "No recipients provided" });

  // SendGrid allows up to 1000 personalizations per request
  const CHUNK = 1000;
  let totalSent = 0;
  let totalFailed = 0;
  const errors = [];

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    const payload = {
      personalizations: chunk.map((r) => ({ to: [{ email: r.email, name: r.name || "" }] })),
      from: { email: fromEmail, name: fromName || "Sun & Sun" },
      subject,
      content: [{ type: "text/html", value: htmlBody }],
    };
    try {
      const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (sgRes.ok || sgRes.status === 202) {
        totalSent += chunk.length;
      } else {
        const errBody = await sgRes.json().catch(() => ({}));
        totalFailed += chunk.length;
        errors.push(errBody?.errors?.[0]?.message || `HTTP ${sgRes.status}`);
      }
    } catch (e) {
      totalFailed += chunk.length;
      errors.push(e.message);
    }
  }

  res.json({ sent: totalSent, failed: totalFailed, errors });
});

app.listen(PORT, () => {
  console.log(`🔐 Sun & Sun ERP Auth Server → http://localhost:${PORT}`);
});
