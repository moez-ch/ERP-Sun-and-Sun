// Downloads the slide-1 thumbnail of every Price Quote presentation into
// tools/cover_shots/ so the cover art style / title / subtitle can be
// catalogued. Read-only except for the Canva token refresh.
//
//   cd ~/ERP-Sun-and-Sun && node tools/dump_covers.mjs
//   git add tools/cover_shots && git commit -m "cover shots" && git push
//
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(path.join(root, "erp_auth.db"));
const SHOTS = path.join(root, "tools", "cover_shots");
fs.mkdirSync(SHOTS, { recursive: true });

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
console.log(`fetching ${rows.length} covers -> ${SHOTS}\n`);

const index = [];
for (const r of rows) {
  let status = "ok";
  try {
    const resp = await fetch(`https://api.canva.com/rest/v1/designs/${r.design_id}/pages?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      status = `HTTP-${resp.status}`;
    } else {
      const data = await resp.json();
      const url = data.items?.[0]?.thumbnail?.url;
      if (!url) {
        status = "NO-THUMB";
      } else {
        const img = await fetch(url);
        if (!img.ok) {
          status = `IMG-HTTP-${img.status}`;
        } else {
          const buf = Buffer.from(await img.arrayBuffer());
          fs.writeFileSync(path.join(SHOTS, `${String(r.id).padStart(2, "0")}.png`), buf);
        }
      }
    }
  } catch (e) {
    status = "ERROR " + e.message;
  }
  index.push({ id: r.id, name: r.name, design_id: r.design_id, status });
  console.log(`${String(r.id).padStart(2, " ")}  ${status === "ok" ? "saved " : status.padEnd(6)}  ${r.name}`);
}
fs.writeFileSync(path.join(SHOTS, "index.json"), JSON.stringify(index, null, 2), "utf-8");
console.log(`\ndone -> ${SHOTS}`);
