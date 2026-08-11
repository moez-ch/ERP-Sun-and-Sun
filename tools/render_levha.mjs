// Render page 1 of a PDF to PNG so a human (or I) can look at what is actually
// printed, rather than at what the text layer happens to expose.
//
//   node tools/render_levha.mjs "<pdf>" "<out.png>" [scale]
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";

const [, , src, out, scaleArg] = process.argv;
if (!src || !out) { console.error("usage: node tools/render_levha.mjs <pdf> <out.png> [scale]"); process.exit(1); }
const scale = Number(scaleArg) || 2;

const factory = {
  create: (w, h) => { const c = createCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); return { canvas: c, context: c.getContext("2d") }; },
  reset: (o, w, h) => { o.canvas.width = Math.max(1, Math.ceil(w)); o.canvas.height = Math.max(1, Math.ceil(h)); },
  destroy: (o) => { o.canvas.width = 0; o.canvas.height = 0; },
};

const data = new Uint8Array(fs.readFileSync(src));
const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, verbosity: 0, canvasFactory: factory }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale });
const { canvas, context } = factory.create(vp.width, vp.height);
context.fillStyle = "#fff";
context.fillRect(0, 0, vp.width, vp.height);
await page.render({ canvasContext: context, viewport: vp, canvasFactory: factory }).promise;
fs.writeFileSync(out, canvas.toBuffer("image/png"));
console.log(`wrote ${out} (${Math.round(vp.width)}x${Math.round(vp.height)}, rotate=${page.rotate})`);
await doc.destroy();
