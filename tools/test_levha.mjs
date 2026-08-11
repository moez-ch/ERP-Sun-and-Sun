// Parse a vergi levhası with the live parser, then re-parse the SAME document
// with every coordinate scaled and rotated as a portrait issue would be.
// The two runs must agree: that is the whole point of anchoring on labels
// instead of pixel bands.
//
//   node tools/test_levha.mjs "<path to pdf>"
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";
import vm from "node:vm";

const path = process.argv[2];
if (!path) { console.error("usage: node tools/test_levha.mjs <pdf>"); process.exit(1); }

// pull parseVergiLevhasi out of server.js without booting the server
const src = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const start = src.indexOf("function parseVergiLevhasi(");
const end = src.indexOf("\nasync function extractVergiLevhasi", start);
if (start < 0 || end < 0) { console.error("could not locate parseVergiLevhasi in server.js"); process.exit(1); }
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src.slice(start, end) + "\nglobalThis.__p = parseVergiLevhasi;", ctx);
const parse = ctx.__p;

const data = new Uint8Array(fs.readFileSync(path));
const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 1 });
const tc = await page.getTextContent();
const items = tc.items
  .map(i => ({ str: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }))
  .filter(i => i.str.trim());
await doc.destroy();

const show = (label, r) => {
  console.log(`\n  ${label}`);
  for (const k of ["name", "office", "address", "tckn"]) {
    const v = r[k];
    console.log(`    ${k.padEnd(8)} ${v ? JSON.stringify(v) : "(empty)"}`);
  }
};

console.log(`page ${Math.round(vp.width)} x ${Math.round(vp.height)}, ${items.length} text items`);

const asIs = parse(items);
show("as-is", asIs);

// portrait: the same page issued at A4 portrait — every coordinate scaled by
// 595/842. This is the shape that broke the old fixed-band parser.
const k = 595 / 842;
const portrait = items.map(i => ({ str: i.str, x: Math.round(i.x * k), y: Math.round(i.y * k) }));
const asPortrait = parse(portrait);
show(`portrait (x${k.toFixed(3)})`, asPortrait);

// and a larger issue, to prove it is scale-free in the other direction
const big = items.map(i => ({ str: i.str, x: Math.round(i.x * 1.6), y: Math.round(i.y * 1.6) }));
show("scaled x1.6", parse(big));

let bad = 0;
for (const f of ["name", "office", "address", "tckn"]) {
  if (asIs[f] !== asPortrait[f]) { console.log(`\n  MISMATCH on ${f}: ${JSON.stringify(asIs[f])} vs ${JSON.stringify(asPortrait[f])}`); bad++; }
}
console.log(bad ? `\n  ${bad} field(s) differ between orientations` :
                  "\n  identical across orientation and scale");

// what the OLD fixed bands would have produced on the portrait version
const oldLeft = portrait.filter(i => i.x >= 185 && i.x < 485).map(i => i.str);
const oldRight = portrait.filter(i => i.x >= 538).map(i => i.str);
console.log(`\n  old bands on the portrait copy:`);
console.log(`    left(185..485)  ${oldLeft.length} items: ${JSON.stringify(oldLeft.slice(0, 6))}`);
console.log(`    right(>=538)    ${oldRight.length} items`);
