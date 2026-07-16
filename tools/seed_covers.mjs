// Populates cover_color / cover_title / cover_subtitle for each Price Quote
// presentation, transcribed from the existing Canva covers, and syncs `theme`
// so the pricing slide colour matches the deck.
//
//   cd ~/ERP-Sun-and-Sun && node tools/seed_covers.mjs           # apply
//   cd ~/ERP-Sun-and-Sun && node tools/seed_covers.mjs --dry     # preview only
//
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new Database(path.join(root, "erp_auth.db"));
const dry = process.argv.includes("--dry");

// id: [colorway, title, subtitle]   (\n = line break on the slide)
const COVERS = {
  2:  ["red",   "DDX DİJİTAL DÖNÜŞÜM\nOLGUNLUK DEĞERLENDİRME\nANALİZİ VE YOL HARİTASI", "Fiyat Teklifi"],
  3:  ["red",   "GİRİŞİMCİ DESTEK\nPROGRAMI", "Fiyat Teklifi"],
  4:  ["red",   "GİRİŞİMCİ DESTEK PROGRAMI\nİŞ GELİŞTİRME DESTEĞİ", "Fiyat Teklifi"],
  5:  ["red",   "KAPASİTE GELİŞTİRME\nDESTEK PROGRAMI", "Fiyat Teklifi"],
  6:  ["red",   "KÜRESEL REKABETÇİLİK\nDESTEK PROGRAMI", "Fiyat Teklifi"],
  7:  ["red",   "AR-GE DESTEKLERİ", "Fiyat Teklifi"],
  8:  ["green", "1832 SANAYİDE YEŞİL\nDÖNÜŞÜM ÇAĞRISI", "Fiyat Teklifi"],
  9:  ["red",   "TÜBİTAK - 1507\nKOBİ AR-GE BAŞLANGIÇ\nDESTEK PROGRAMI", "Fiyat Teklifi"],
  10: ["red",   "BİLİŞİM SEKTÖRÜ\nTİCARET BAKANLIĞI", "Fiyat Teklifi"],
  11: ["red",   "İmalat Sektörü\nTicaret Bakanlığı Destekleri", "Fiyat Teklifi"],
  12: ["red",   "KÜRESEL\nTEDARİK ZİNCİRİ", "Fiyat Teklifi"],
  13: ["red",   "MARKALAŞMA\n& TURQUALITY", "Fiyat Teklifi"],
  14: ["green", "SOGREEN Sosyal Kapsayıcı Yeşil Geçiş\nGeri Ödemeli Finansman Desteği", "Fiyat Teklifi"],
  15: ["green", "SOGREEN Sosyal Kapsayıcı Yeşil Geçiş\nGeri Ödemeli Finansman Desteği",
                "TÜBİTAK 1831 Yeşil İnovasyon Teknoloji Mentörlük Çağrısı\nYeni Yatırım Teşvik Sistemi Stratejik Hamle & Öncelikli Yatırımlar\nFiyat Teklifi"],
  16: ["green", "SOGREEN Sosyal Kapsayıcı Yeşil Geçiş\nGeri Ödemeli Finansman Desteği",
                "TÜBİTAK 1831 Yeşil İnovasyon Teknoloji Mentörlük Çağrısı\nFiyat Teklifi"],
  17: ["red",   "Yeni Yatırım\nTeşvik Sistemi", "Türkiye Yüzyılı\nHamlesi Fiyat Teklifi"],
  18: ["red",   "Yeni Yatırım\nTeşvik Sistemi", "Sunumu"],
  19: ["red",   "Yurt Dışı Pazar\nAraştırması Raporu", "Fiyat Teklifi"],
  20: ["red",   "Yurt Dışı Pazar\nAraştırması Raporu", "Fiyat Teklifi"],
  21: ["red",   "DATA ANALYTICS", "Fiyat Teklifi"],
  22: ["red",   "Dış Ticaret Ofisiniz", "Fiyat Teklifi"],
  23: ["red",   "DIŞ TİCARET\nSİSTEM KURULUMU", "Fiyat Teklifi"],
  24: ["red",   "ULUSLARARASI\nİŞ GELİŞTİRME", "Fiyat Teklifi"],
  26: ["green", "SÜRDÜRÜLEBİLİRLİK\nDANIŞMANLIĞI", "Kurumsal Karbon Ayak izi"],
  27: ["green", "SÜRDÜRÜLEBİLİRLİK\nDANIŞMANLIĞI", "Fiyat Teklifi"],
  28: ["green", "SÜRDÜRÜLEBİLİRLİK\nDANIŞMANLIĞI", "1831 - Yeşil İnovasyon Teknoloji Mentörlük\nProgramı Bilgilendirme ve Fiyat Teklifi"],
  29: ["red",   "Vergi, SGK Yapılandırma ve\nTeşvik Süreçleri Danışmanlığı", "Fiyat Teklifi"],
  30: ["red",   "AR-GE MERKEZİ YÜRÜTME\nTEKNİK DESTEK DANIŞMANLIĞI", "Fiyat Teklifi"],
  31: ["red",   "Ar-Ge ve Tasarım Merkezi\nKurulumu", "Fiyat Teklifi"],
  33: ["red",   "TEKNOKENT PROJESİ", "Fiyat Teklifi"],
  34: ["blue",  "SÜRDÜRÜLEBİLİRLİK DANIŞMANLIĞI\nSU VERİMLİLİĞİ YÖNETMELİĞİ", "Mavi / Yeşil / Turkuaz Belge\nBaşvuru ve Süreç Yönetimi"],
  35: ["red",   "ICMPD ENHANCER PRO\nKobi ve Kooperatif Programları", "Fiyat Teklifi"],
};

const upd = db.prepare("UPDATE program_presentations SET cover_color=?, cover_title=?, cover_subtitle=?, theme=? WHERE id=?");
let n = 0;
for (const [id, [color, title, subtitle]] of Object.entries(COVERS)) {
  const row = db.prepare("SELECT id, name FROM program_presentations WHERE id=?").get(id);
  if (!row) { console.log(`SKIP ${id} — no such presentation`); continue; }
  // pricing slide only has blue/green variants; blue covers use the blue slide
  const theme = color === "green" ? "green" : "blue";
  if (!dry) upd.run(color, title, subtitle, theme, id);
  console.log(`${String(id).padStart(2)}  ${color.padEnd(5)} ${theme.padEnd(5)}  ${title.split("\n")[0]}  |  ${row.name}`);
  n++;
}
console.log(`\n${dry ? "would update" : "updated"} ${n} presentations`);

const missing = db.prepare("SELECT id, name FROM program_presentations WHERE cover_title = ?").all("");
if (missing.length) {
  console.log("\nNo generated cover (keeps its Canva cover + name stamp):");
  for (const m of missing) console.log(`  ${m.id}  ${m.name}`);
}
