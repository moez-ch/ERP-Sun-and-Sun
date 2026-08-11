// Crop a fractional region of page 1 at high scale, to inspect how crisply
// something (a barcode) actually rasterises.
//
//   node tools/crop_levha.mjs <pdf> <out.png> <scale> <x0> <y0> <x1> <y1>
//   fractions of page width/height, 0..1
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import fs from "node:fs";

const [, , src, out, sc, ...box] = process.argv;
const scale = Number(sc) || 6;
const [x0, y0, x1, y1] = box.map(Number);

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
context.fillStyle = "#fff"; context.fillRect(0, 0, vp.width, vp.height);
await page.render({ canvasContext: context, viewport: vp, canvasFactory: factory }).promise;

const cx = Math.round(x0 * vp.width), cy = Math.round(y0 * vp.height);
const cw = Math.round((x1 - x0) * vp.width), ch = Math.round((y1 - y0) * vp.height);
// a barcode needs a white quiet zone around it or no reader will look at it
const PAD = Number(process.env.PAD || 60);
const crop = createCanvas(cw + PAD * 2, ch + PAD * 2);
const cc = crop.getContext("2d");
cc.fillStyle = "#fff"; cc.fillRect(0, 0, crop.width, crop.height);
cc.drawImage(canvas, cx, cy, cw, ch, PAD, PAD, cw, ch);
fs.writeFileSync(out, crop.toBuffer("image/png"));
console.log(`wrote ${out} — ${cw}x${ch} from a ${Math.round(vp.width)}x${Math.round(vp.height)} render`);
await doc.destroy();
