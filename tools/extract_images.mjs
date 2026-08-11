// Pull the embedded image XObjects out of page 1 at their NATIVE resolution
// and try to decode each as a barcode. A page render resamples the bitmap;
// the original is what the barcode reader actually wants.
//
//   node tools/extract_images.mjs <pdf> [outdir]
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { readBarcodes } from "zxing-wasm/reader";
import fs from "node:fs";
import path from "node:path";

const src = process.argv[2];
const outdir = process.argv[3] || ".";
const factory = {
  create: (w, h) => { const c = createCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); return { canvas: c, context: c.getContext("2d") }; },
  reset: (o, w, h) => { o.canvas.width = Math.max(1, Math.ceil(w)); o.canvas.height = Math.max(1, Math.ceil(h)); },
  destroy: (o) => { o.canvas.width = 0; o.canvas.height = 0; },
};

const data = new Uint8Array(fs.readFileSync(src));
const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, verbosity: 0, canvasFactory: factory }).promise;
const page = await doc.getPage(1);
const ops = await page.getOperatorList();

const names = [];
for (let i = 0; i < ops.fnArray.length; i++) {
  if (ops.fnArray[i] === pdfjsLib.OPS.paintImageXObject ||
      ops.fnArray[i] === pdfjsLib.OPS.paintJpegXObject) names.push(ops.argsArray[i][0]);
}
console.log(`page 1 paints ${names.length} image(s): ${JSON.stringify([...new Set(names)])}`);

const get = name => new Promise(res => {
  try { page.objs.get(name, res); } catch { res(null); }
});

for (const name of [...new Set(names)]) {
  const img = await get(name);
  if (!img) { console.log(`  ${name}: not resolvable`); continue; }
  const { width: w, height: h } = img;
  console.log(`\n  ${name}: ${w}x${h} kind=${img.kind}`);
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  const id = ctx.createImageData(w, h);
  const src8 = img.data;
  // kind 1 = grayscale 1bpp expanded, 2 = RGB 24bpp, 3 = RGBA
  for (let p = 0, q = 0; p < w * h; p++) {
    if (img.kind === 3) { id.data[q++] = src8[p * 4]; id.data[q++] = src8[p * 4 + 1]; id.data[q++] = src8[p * 4 + 2]; id.data[q++] = src8[p * 4 + 3]; }
    else if (img.kind === 2) { id.data[q++] = src8[p * 3]; id.data[q++] = src8[p * 3 + 1]; id.data[q++] = src8[p * 3 + 2]; id.data[q++] = 255; }
    else { const v = src8[p]; id.data[q++] = v; id.data[q++] = v; id.data[q++] = v; id.data[q++] = 255; }
  }
  ctx.putImageData(id, 0, 0);

  // pad with a white quiet zone before offering it to the reader
  const PAD = 40;
  const padded = createCanvas(w + PAD * 2, h + PAD * 2);
  const pc = padded.getContext("2d");
  pc.fillStyle = "#fff"; pc.fillRect(0, 0, padded.width, padded.height);
  pc.drawImage(c, PAD, PAD);

  const file = path.join(outdir, `img_${name.replace(/\W/g, "_")}.png`);
  fs.writeFileSync(file, padded.toBuffer("image/png"));

  const r = await readBarcodes(new Blob([padded.toBuffer("image/png")]), { tryHarder: true, tryRotate: true, tryInvert: true });
  console.log(`      -> ${path.basename(file)}  decode=${JSON.stringify(r.map(x => `${x.format}:${x.text}`))}`);
}
await doc.destroy();
