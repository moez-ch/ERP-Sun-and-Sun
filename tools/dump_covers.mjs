// Prints the slide-1 thumbnail URL of every Price Quote presentation.
// Used to inventory cover art styles / titles. Read-only except for the
// Canva token refresh (same behaviour as the app).
//
//   cd ~/ERP-Sun-and-Sun && node tools/dump_covers.mjs
//
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(path.join(root, "erp_auth.db"));

const cfg = Object.fromEntries(db.prepare("SELECT key, value FROM canva_config").all().map(r => [r.key, r.value]));
if (!cfg.access_token) {
  console.error("Canva not connected — authorize via Settings -> Canva first.");
  process.exit(1);
}

let token = cfg.access_token;
if (Date.now() > parseInt(cfg.token_expires_at || "0") - 60000) {
  const resp = await fetch("https://api.canva.com/rest/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cfg.refresh_token,
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) {
    console.error("Token refresh failed:", JSON.stringify(data));
    process.exit(1);
  }
  token = data.access_token;
  const set = db.prepare("INSERT OR REPLACE INTO canva_config (key, value) VALUES (?, ?)");
  set.run("access_token", data.access_token);
  set.run("token_expires_at", String(Date.now() + (data.expires_in || 3600) * 1000));
  if (data.refresh_token) set.run("refresh_token", data.refresh_token);
  console.error("(canva token refreshed)");
}

const rows = db.prepare("SELECT id, name, theme, design_id FROM program_presentations WHERE design_id <> ? ORDER BY id").all("");
console.error(`fetching ${rows.length} covers...\n`);

for (const r of rows) {
  let thumb = "NO-THUMB";
  try {
    const resp = await fetch(`https://api.canva.com/rest/v1/designs/${r.design_id}/pages?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      thumb = data.items?.[0]?.thumbnail?.url || "NO-THUMB";
    } else {
      thumb = `HTTP-${resp.status}`;
    }
  } catch (e) {
    thumb = "ERROR " + e.message;
  }
  console.log([r.id, r.theme || "blue", r.name, thumb].join("\t"));
}
