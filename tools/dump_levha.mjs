// Dump the text geometry of a vergi levhası PDF so the parser can be built
// against what the file actually contains rather than against remembered
// coordinates.
//
//   node tools/dump_levha.mjs "<path to pdf>"
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: node tools/dump_levha.mjs <pdf>"); process.exit(1); }

const data = new Uint8Array(fs.readFileSync(path));
const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 1 });
console.log(`page size: ${Math.round(vp.width)} x ${Math.round(vp.height)}`);

const tc = await page.getTextContent();
const items = tc.items
  .map(i => ({ str: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }))
  .filter(i => i.str.trim());

console.log(`${items.length} text items\n`);
console.log("     x     y   text");
console.log("  ".padEnd(40, "-"));
for (const i of [...items].sort((a, b) => (b.y - a.y) || (a.x - b.x))) {
  console.log(`  ${String(i.x).padStart(4)} ${String(i.y).padStart(5)}   ${JSON.stringify(i.str)}`);
}

// what the current bands would capture
const inLeft = items.filter(i => i.x >= 185 && i.x < 485);
const inRight = items.filter(i => i.x >= 538);
console.log(`\ncurrent bands: left(185..485)=${inLeft.length} items, right(>=538)=${inRight.length} items`);
console.log(`x range in this file: ${Math.min(...items.map(i => i.x))} .. ${Math.max(...items.map(i => i.x))}`);
await doc.destroy();
