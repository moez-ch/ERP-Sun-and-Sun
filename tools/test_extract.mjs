// Run the REAL extractVergiLevhasi from server.js end to end, so the whole
// chain is exercised: parse, barcode, text fallback, OCR fallback, tckn.
//
//   node tools/test_extract.mjs <pdf> [<pdf> ...]
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { readBarcodes } from "zxing-wasm/reader";
import { createWorker } from "tesseract.js";
import fs from "node:fs";
import vm from "node:vm";

const code = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const a = code.indexOf("const pdfCanvasFactory = {");
const b = code.indexOf("\n// POST /contracts/pdf-tax", a);
if (a < 0 || b < 0) { console.error("could not slice the extractor out of server.js"); process.exit(1); }

const ctx = { console, pdfjsLib, createCanvas, readBarcodes, createWorker, Blob };
vm.createContext(ctx);
vm.runInContext(code.slice(a, b) + "\nglobalThis.__x = extractVergiLevhasi;", ctx);
const extract = ctx.__x;

for (const p of process.argv.slice(2)) {
  const t0 = Date.now();
  const r = await extract(fs.readFileSync(p));
  console.log(`\n${p}   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  for (const [k, v] of Object.entries(r)) {
    console.log(`  ${k.padEnd(18)} ${v ? JSON.stringify(v) : "(empty)"}`);
  }
}
