// Throw every barcode format zxing knows at a PNG, and report what sticks.
//   node tools/decode_png.mjs <png>
import { readBarcodes } from "zxing-wasm/reader";
import fs from "node:fs";

const p = process.argv[2];
const png = fs.readFileSync(p);

const r1 = await readBarcodes(new Blob([png]), { tryHarder: true });
console.log(`all formats, tryHarder : ${JSON.stringify(r1.map(r => `${r.format}:${r.text}`))}`);

const r2 = await readBarcodes(new Blob([png]), { tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true });
console.log(`+rotate/invert/downscale: ${JSON.stringify(r2.map(r => `${r.format}:${r.text}`))}`);

for (const f of ["Code128", "Code39", "Code93", "ITF", "Codabar", "DataBar", "EAN-13", "UPC-A"]) {
  const r = await readBarcodes(new Blob([png]), { tryHarder: true, tryRotate: true, formats: [f] });
  if (r.length) console.log(`  ${f.padEnd(9)} -> ${JSON.stringify(r.map(x => x.text))}`);
}
