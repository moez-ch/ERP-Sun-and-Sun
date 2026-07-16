// Exports a presentation's Canva deck and prints a one-line summary of each
// page, so we can see where the built-in pricing / closing pages sit.
//
//   cd ~/ERP-Sun-and-Sun && node tools/inspect_deck.mjs <design_id>
//   (defaults to the Su Verimliliği deck if no id given)
//
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(path.join(root, "erp_auth.db"));
const designId = process.argv[2] || "DAHPXI5Gxws"; // Su Verimliliği Mavi Belge

const cfg = Object.fromEntries(db.prepare("SELECT key, value FROM canva_config").all().map(r => [r.key, r.value]));
let token = cfg.access_token;
if (!token) { console.error("Canva not connected."); process.exit(1); }
if (Date.now() > parseInt(cfg.token_expires_at || "0") - 60000) {
  const resp = await fetch("https://api.canva.com/rest/v1/oauth/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token, client_id: cfg.client_id, client_secret: cfg.client_secret }) });
  const d = await resp.json();
  if (!d.access_token) { console.error("refresh failed:", JSON.stringify(d)); process.exit(1); }
  token = d.access_token;
  const set = db.prepare("INSERT OR REPLACE INTO canva_config (key,value) VALUES (?,?)");
  set.run("access_token", d.access_token); set.run("token_expires_at", String(Date.now() + (d.expires_in || 3600) * 1000));
  if (d.refresh_token) set.run("refresh_token", d.refresh_token);
}

// create + poll export
const cr = await fetch("https://api.canva.com/rest/v1/exports", { method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ design_id: designId, format: { type: "pdf", export_quality: "regular" } }) });
if (!cr.ok) { console.error("export request failed:", cr.status); process.exit(1); }
const jobId = (await cr.json()).job?.id;
let url;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const p = await (await fetch(`https://api.canva.com/rest/v1/exports/${jobId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (p.job?.status === "success") { url = p.job.urls?.[0]; break; }
  if (p.job?.status === "failed") { console.error("export job failed"); process.exit(1); }
}
if (!url) { console.error("export timed out"); process.exit(1); }

const pdfBuf = Buffer.from(await (await fetch(url)).arrayBuffer());
const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuf), useSystemFonts: true, verbosity: 0 }).promise;
console.log(`design ${designId} — ${doc.numPages} pages\n`);
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const tc = await page.getTextContent();
  const text = tc.items.map(it => it.str).join(" ").replace(/\s+/g, " ").trim().slice(0, 90);
  console.log(`  p${String(i).padStart(2)}:  ${text || "(no text — image/graphic page)"}`);
}
