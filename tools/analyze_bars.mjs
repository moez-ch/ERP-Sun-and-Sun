// Threshold a barcode crop and print the run lengths of its bars and spaces.
// A real Code128 has runs that quantise cleanly to 1..4 modules; a decorative
// barcode does not.
//   node tools/analyze_bars.mjs <png>
import { createCanvas, loadImage } from "@napi-rs/canvas";

const img = await loadImage(process.argv[2]);
const c = createCanvas(img.width, img.height);
const ctx = c.getContext("2d");
ctx.drawImage(img, 0, 0);
const { data } = ctx.getImageData(0, 0, img.width, img.height);

// scan the row through the middle of the bars
const row = Math.floor(img.height / 2);
const dark = [];
for (let x = 0; x < img.width; x++) {
  const i = (row * img.width + x) * 4;
  const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  dark.push(lum < 128);
}

const runs = [];
let cur = dark[0], len = 0;
for (const d of dark) { if (d === cur) len++; else { runs.push({ dark: cur, len }); cur = d; len = 1; } }
runs.push({ dark: cur, len });

// drop the leading/trailing white quiet zones
while (runs.length && !runs[0].dark) runs.shift();
while (runs.length && !runs[runs.length - 1].dark) runs.pop();

console.log(`image ${img.width}x${img.height}, scanned row ${row}`);
console.log(`${runs.length} runs (bars+spaces)`);
const lens = runs.map(r => r.len);
const unit = Math.min(...lens);
console.log(`narrowest run = ${unit}px`);
console.log(`\n  run  dark  px    modules(px/${unit})`);
for (const [i, r] of runs.entries()) {
  const m = r.len / unit;
  const off = Math.abs(m - Math.round(m));
  console.log(`  ${String(i).padStart(3)}  ${r.dark ? "bar " : "spc "} ${String(r.len).padStart(4)}   ` +
              `${m.toFixed(2)}${off > 0.25 ? "   <- not a clean multiple" : ""}`);
}
const modules = lens.map(l => l / unit);
const messy = modules.filter(m => Math.abs(m - Math.round(m)) > 0.25).length;
const total = modules.reduce((a, b) => a + Math.round(b), 0);
console.log(`\ntotal modules ~= ${total}`);
console.log(messy ? `${messy} run(s) do not quantise -> not a standard linear barcode`
                  : `all runs quantise cleanly`);
// Code128 total modules = 11*(symbols) + 2 (stop bar), symbols = 1 start + n data + 1 check + 1 stop
console.log(`Code128 would need 11*k+13 modules: ${[...Array(12).keys()].map(k => 11 * (k + 3) + 2).join(", ")}`);
