// Prove the vergi-kimlik-no cell is located correctly and that OCR reads the
// digits out of it. Writes the crop next to the PDF so the region can be eyeballed.
//
//   node tools/test_ocr.mjs "<pdf>" [out.png]
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";
import fs from "node:fs";
import vm from "node:vm";

const src = process.argv[2];
const out = process.argv[3] || "vkn_crop.png";

const code = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const a = code.indexOf("function parseVergiLevhasi(");
const b = code.indexOf("\nasync function extractVergiLevhasi", a);
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(code.slice(a, b) + "\nglobalThis.__p = parseVergiLevhasi;", ctx);
const parse = ctx.__p;

const factory = {
  create: (w, h) => { const c = createCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); return { canvas: c, context: c.getContext("2d") }; },
  reset: (o, w, h) => { o.canvas.width = Math.max(1, Math.ceil(w)); o.canvas.height = Math.max(1, Math.ceil(h)); },
  destroy: (o) => { o.canvas.width = 0; o.canvas.height = 0; },
};

const data = new Uint8Array(fs.readFileSync(src));
const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, verbosity: 0, canvasFactory: factory }).promise;
const page = await doc.getPage(1);
const tc = await page.getTextContent();
const items = tc.items.map(i => ({ str: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) })).filter(i => i.str.trim());
const parsed = parse(items);
console.log(`name   ${JSON.stringify(parsed.name)}`);
console.log(`office ${JSON.stringify(parsed.office)}`);
console.log(`vknBox ${JSON.stringify(parsed.vknBox)}`);
if (!parsed.vknBox) { console.log("no box — nothing to OCR"); process.exit(0); }

const SCALE = 5;
const vp = page.getViewport({ scale: SCALE });
const { canvas, context } = factory.create(vp.width, vp.height);
context.fillStyle = "#fff"; context.fillRect(0, 0, vp.width, vp.height);
await page.render({ canvasContext: context, viewport: vp, canvasFactory: factory }).promise;

const { x0, y0, x1, y1 } = parsed.vknBox;
const p0 = vp.convertToViewportPoint(x0, y0), p1 = vp.convertToViewportPoint(x1, y1);
let cx = Math.max(0, Math.min(p0[0], p1[0])), cy = Math.max(0, Math.min(p0[1], p1[1]));
let cw = Math.min(vp.width - cx, Math.abs(p1[0] - p0[0]));
let ch = Math.min(vp.height - cy, Math.abs(p1[1] - p0[1]));
console.log(`crop ${Math.round(cw)}x${Math.round(ch)} at ${Math.round(cx)},${Math.round(cy)} of ${Math.round(vp.width)}x${Math.round(vp.height)}`);

const PAD = 40;
const crop = createCanvas(cw + PAD * 2, ch + PAD * 2);
const cc = crop.getContext("2d");
cc.fillStyle = "#fff"; cc.fillRect(0, 0, crop.width, crop.height);
cc.drawImage(canvas, cx, cy, cw, ch, PAD, PAD, cw, ch);
fs.writeFileSync(out, crop.toBuffer("image/png"));
console.log(`wrote ${out}`);

const worker = await createWorker("eng");
await worker.setParameters({ tessedit_char_whitelist: "0123456789" });
const { data: r } = await worker.recognize(crop.toBuffer("image/png"));
await worker.terminate();
console.log(`OCR raw: ${JSON.stringify(r.text.trim())}`);
const hits = (r.text.match(/\d{10,11}/g) || []);
console.log(`10-11 digit runs: ${JSON.stringify(hits)}`);
await doc.destroy();
