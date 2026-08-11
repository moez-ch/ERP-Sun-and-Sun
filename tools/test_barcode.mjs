// The vergi kimlik no is not always in the PDF's text layer — GİB draws it as
// a Code128 barcode. This runs just that step, at several render scales, so a
// failure can be told apart from a parsing failure.
//
//   node tools/test_barcode.mjs "<path to pdf>"
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { readBarcodes } from "zxing-wasm/reader";
import fs from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: node tools/test_barcode.mjs <pdf>"); process.exit(1); }

const factory = {
  create: (w, h) => { const c = createCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); return { canvas: c, context: c.getContext("2d") }; },
  reset: (o, w, h) => { o.canvas.width = Math.max(1, Math.ceil(w)); o.canvas.height = Math.max(1, Math.ceil(h)); },
  destroy: (o) => { o.canvas.width = 0; o.canvas.height = 0; },
};

const data = new Uint8Array(fs.readFileSync(path));
const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, verbosity: 0, canvasFactory: factory }).promise;
const page = await doc.getPage(1);

const tc = await page.getTextContent();
const text = tc.items.map(i => i.str).join(" ");
console.log(`text layer 10-digit matches: ${JSON.stringify(text.match(/\b\d{10}\b/g) || [])}`);
console.log(`text layer 11-digit matches: ${JSON.stringify(text.match(/\b\d{11}\b/g) || [])}`);

console.log(`page.rotate = ${page.rotate}`);
for (const rotation of [0, 90, 180, 270]) {
  for (const scale of [3.5, 5]) {
    const vp = page.getViewport({ scale, rotation });
    const { canvas, context } = factory.create(vp.width, vp.height);
    context.fillStyle = "#fff"; context.fillRect(0, 0, vp.width, vp.height);
    await page.render({ canvasContext: context, viewport: vp, canvasFactory: factory }).promise;
    const png = canvas.toBuffer("image/png");
    let all = [];
    try {
      all = await readBarcodes(new Blob([png]), { tryHarder: true, formats: ["Code128"] });
    } catch (e) { console.log(`  rot ${rotation} scale ${scale}: threw ${e.message}`); continue; }
    console.log(`  rot ${String(rotation).padStart(3)} scale ${scale}  ` +
                `Code128=${JSON.stringify(all.map(r => r.text))}`);
  }
}
await doc.destroy();
