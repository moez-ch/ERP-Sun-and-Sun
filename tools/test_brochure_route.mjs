// Mount ONLY the brochure handler, lifted verbatim out of server.js, on a bare
// express app. Booting the whole ERP locally needs its secrets; the route's
// behaviour does not.
//
//   node tools/test_brochure_route.mjs
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BROCHURE_DIR = path.join(ROOT, "public", "brochures");

const hits = [];
const db = { prepare: () => ({ run: (...a) => hits.push(a) }) };

const app = express();
app.get("/brochure/:key", (req, res) => {
  const key = String(req.params.key || "").toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(key)) return res.status(404).send("Not found");
  const file = path.join(BROCHURE_DIR, `${key}.pdf`);
  if (!file.startsWith(BROCHURE_DIR) || !fs.existsSync(file)) {
    return res.status(404).send("Not found");
  }
  try {
    db.prepare().run(key, String(req.query.r || "").slice(0, 60),
                     String(req.get("user-agent") || "").slice(0, 200));
  } catch (e) { console.warn("[brochure] hit not logged:", e.message); }
  res.type("application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${key}.pdf"`);
  res.setHeader("Cache-Control", "public, max-age=3600");
  fs.createReadStream(file).pipe(res);
});

const srv = app.listen(4321, async () => {
  const cases = [
    ["/brochure/icmpd?r=camp3", 200],
    ["/brochure/ICMPD", 200],              // key is lower-cased
    ["/brochure/nope", 404],
    ["/brochure/..%2f..%2fserver", 404],
    ["/brochure/icmpd.pdf", 404],
    ["/brochure/" + "a".repeat(41), 404],
  ];
  let fail = 0;
  for (const [url, want] of cases) {
    const r = await fetch("http://127.0.0.1:4321" + url);
    const buf = Buffer.from(await r.arrayBuffer());
    const ok = r.status === want;
    if (!ok) fail++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${String(r.status).padEnd(3)} ` +
                `(want ${want})  ${url}`);
    if (r.status === 200) {
      console.log(`         type=${r.headers.get("content-type")} ` +
                  `disp=${r.headers.get("content-disposition")} ` +
                  `bytes=${buf.length} magic=${JSON.stringify(buf.slice(0, 5).toString())}`);
      if (buf.slice(0, 5).toString() !== "%PDF-") { console.log("         NOT A PDF"); fail++; }
    }
  }
  console.log(`\n  hits logged: ${hits.length} -> ${JSON.stringify(hits[0] || null)}`);
  console.log(fail ? `\n  ${fail} FAILURE(S)` : "\n  all cases pass");
  srv.close();
  process.exit(fail ? 1 : 0);
});
