// Condition a barcode crop the way a reader wants it: hard black/white, tall,
// generous quiet zone. Then decode.
//   node tools/decode_stretch.mjs <png>
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readBarcodes } from "zxing-wasm/reader";
import fs from "node:fs";

const img = await loadImage(process.argv[2]);
const src = createCanvas(img.width, img.height);
src.getContext("2d").drawImage(img, 0, 0);
const sd = src.getContext("2d").getImageData(0, 0, img.width, img.height);

// one clean scan row, hard-thresholded, then replicated into a tall band
const row = Math.floor(img.height / 2);
const bw = [];
for (let x = 0; x < img.width; x++) {
  const i = (row * img.width + x) * 4;
  const lum = 0.299 * sd.data[i] + 0.587 * sd.data[i + 1] + 0.114 * sd.data[i + 2];
  bw.push(lum < 128 ? 0 : 255);
}

for (const H of [200, 400]) {
  for (const PAD of [40, 120]) {
    const c = createCanvas(img.width + PAD * 2, H + PAD * 2);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    const id = ctx.createImageData(img.width, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < img.width; x++) {
      const q = (y * img.width + x) * 4, v = bw[x];
      id.data[q] = v; id.data[q + 1] = v; id.data[q + 2] = v; id.data[q + 3] = 255;
    }
    const tmp = createCanvas(img.width, H);
    tmp.getContext("2d").putImageData(id, 0, 0);
    ctx.drawImage(tmp, PAD, PAD);
    const png = c.toBuffer("image/png");
    if (H === 400 && PAD === 120) fs.writeFileSync(process.argv[2].replace(/\.png$/, "_cond.png"), png);
    const r = await readBarcodes(new Blob([png]), { tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true });
    console.log(`  H=${H} pad=${PAD}: ${JSON.stringify(r.map(x => `${x.format}:${x.text}`))}`);
  }
}
