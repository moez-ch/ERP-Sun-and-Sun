import { useState, useEffect, useCallback, useRef } from "react";
import snsLogo from "./sns_logo.png";
import * as XLSX from "xlsx";
import LoginPage from "./LoginPage.jsx";
import { TRANSLATIONS } from "./i18n.js";

// ─── CONSTANTS & UTILITIES ───────────────────────────────────────
const INDUSTRIES = ["Manufacturing", "Software/IT", "Food & Beverage", "Tourism & Hospitality", "Textile & Fashion", "Agriculture", "Healthcare", "Education", "Energy", "Construction", "Automotive", "Defense"];
const JOB_TITLES = ["CEO", "Founder", "Managing Director", "COO", "Export Manager", "Business Development", "CTO", "General Manager", "Owner", "VP Operations"];
const CITIES = ["İstanbul", "Ankara", "İzmir", "Bursa", "Konya", "Antalya", "Gaziantep", "Kayseri", "Trabzon", "Mersin"];
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];
const NEEDS = ["Turquality Consultancy", "KOSGEB Grants", "Export Development", "Digital Marketing", "EU Grants", "HR Consulting", "KVKK/GDPR Compliance", "Brand Strategy", "Investment Incentives", "TÜBİTAK Projects", "Lean Production", "Quality Management (ISO)"];

const DEFAULT_EMAIL_TEMPLATES = [
  {
    id: "t_interested",
    label: "İlgileniyoruz ✓",
    color: "#2e7d32",
    subject: "Finansman Desteği Hakkında",
    body: "Merhaba,\n\nPaylaştığınız finansman desteği ile ilgileniyoruz. Detayları görüşmek üzere sizinle iletişime geçmek isteriz.\n\nİyi çalışmalar,\n\nSaygılarımla,",
  },
  {
    id: "t_wrong_sector",
    label: "Sektör Dışı ✗",
    color: "#c62828",
    subject: "Finansman Desteği – Sektör Kapsamı Dışı",
    body: "Merhaba,\n\nPaylaştığınız finansman desteği için teşekkür ederiz. Ancak firmamızın faaliyet gösterdiği sektör bu program kapsamında yer almadığı için değerlendiremiyoruz.\n\nSaygılarımla",
  },
  {
    id: "t_not_interested",
    label: "İlgilenmiyoruz ✗",
    color: "#e65100",
    subject: "Finansman Desteği – Şu An İçin Uygun Değil",
    body: "Merhaba,\n\nPaylaştığınız finansman desteği için teşekkür ederiz, ancak şu an için ilgilenmiyoruz.\n\nİyi çalışmalar dileriz.\n\nSaygılarımla",
  },
];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randN(arr, n) {
  const s = new Set();
  while (s.size < Math.min(n, arr.length)) s.add(rand(arr));
  return [...s];
}
function randId() { return "LD-" + Math.random().toString(36).slice(2, 10).toUpperCase(); }

// ─── INDUSTRY → NEEDS MAP ────────────────────────────────────────
const INDUSTRY_NEEDS = {
  "Manufacturing":        ["Lean Production", "Quality Management (ISO)", "Export Development", "Investment Incentives", "KOSGEB Grants", "Turquality Consultancy"],
  "Software/IT":          ["TÜBİTAK Projects", "Digital Marketing", "KOSGEB Grants", "EU Grants", "KVKK/GDPR Compliance"],
  "Food & Beverage":      ["Export Development", "Turquality Consultancy", "KOSGEB Grants", "Quality Management (ISO)", "Investment Incentives"],
  "Tourism & Hospitality":["Digital Marketing", "Brand Strategy", "EU Grants", "HR Consulting"],
  "Textile & Fashion":    ["Export Development", "Turquality Consultancy", "Brand Strategy", "Quality Management (ISO)", "KOSGEB Grants"],
  "Agriculture":          ["KOSGEB Grants", "Export Development", "Investment Incentives", "EU Grants"],
  "Healthcare":           ["KVKK/GDPR Compliance", "Investment Incentives", "HR Consulting", "Quality Management (ISO)"],
  "Education":            ["EU Grants", "Digital Marketing", "HR Consulting", "TÜBİTAK Projects"],
  "Energy":               ["Investment Incentives", "EU Grants", "KOSGEB Grants", "TÜBİTAK Projects"],
  "Construction":         ["Investment Incentives", "KOSGEB Grants", "Quality Management (ISO)", "HR Consulting"],
  "Automotive":           ["Lean Production", "Quality Management (ISO)", "Export Development", "TÜBİTAK Projects", "Investment Incentives"],
  "Defense":              ["TÜBİTAK Projects", "Investment Incentives", "Export Development", "Quality Management (ISO)"],
};

// ─── XLS IMPORT — SOGREEN COLUMN MAP ────────────────────────────
// Col: 0=Company 1=Country 2=City 3=Address 4=Website 5=Sector
//      6=CompanyEmail 7=Mobile 8=WorkPhone 9=Person 10=Gender
//      11=PersonEmail 12=Phones 13=WorkPhone2
const SECTOR_MAP = {
  "yazılım": "Software/IT", "bilişim": "Software/IT", "teknoloji": "Software/IT", "it ": "Software/IT",
  "gıda": "Food & Beverage", "yiyecek": "Food & Beverage", "içecek": "Food & Beverage",
  "tekstil": "Textile & Fashion", "moda": "Textile & Fashion", "konfeksiyon": "Textile & Fashion", "hazır giyim": "Textile & Fashion",
  "turizm": "Tourism & Hospitality", "otel": "Tourism & Hospitality", "konaklama": "Tourism & Hospitality",
  "sağlık": "Healthcare", "hastane": "Healthcare", "medikal": "Healthcare",
  "eğitim": "Education", "okul": "Education", "üniversite": "Education",
  "enerji": "Energy", "elektrik": "Energy", "güneş": "Energy", "solar": "Energy",
  "inşaat": "Construction", "yapı": "Construction", "gayrimenkul": "Construction",
  "otomotiv": "Automotive", "araç": "Automotive", "taşıt": "Automotive",
  "savunma": "Defense", "silah": "Defense",
  "tarım": "Agriculture", "hayvancılık": "Agriculture", "tohum": "Agriculture",
  "imalat": "Manufacturing", "üretim": "Manufacturing", "makina": "Manufacturing", "metal": "Manufacturing", "demir": "Manufacturing",
};

function mapSector(raw) {
  if (!raw) return "";
  const lower = raw.toLowerCase();
  for (const [key, val] of Object.entries(SECTOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return "";
}

function mapXlsRow(row) {
  const company   = String(row[0] || "").replace(/^\n/, "").trim();
  const city      = String(row[2] || "").trim();
  const website   = String(row[4] || "").trim();
  const sector    = String(row[5] || "").trim();
  const compEmail = String(row[6] || "").trim();
  const mobile    = String(row[7] || "").trim();
  const workPhone = String(row[8] || "").trim();
  const person    = String(row[9] || "").trim();
  const personEmail = String(row[11] || "").trim();
  const phones2   = String(row[12] || "").trim();

  if (!company || company === "-" || company === "---" || company === "Firma Adı") return null;

  const nameParts = person.split(" ");
  const firstName = nameParts[0] || "";
  const lastName  = nameParts.slice(1).join(" ") || "";
  const industry  = mapSector(sector);
  const email     = personEmail || compEmail;
  const phone     = mobile || workPhone || phones2;

  // Normalize city (files store it as "KONYA" uppercase)
  const cityNorm  = city.split(/[,/]/)[0].trim().replace(/^\w/, c => c.toUpperCase()).toLowerCase().replace(/^\w/, c => c.toUpperCase());

  const lead = {
    id: randId(),
    firstName, lastName,
    title: "",
    company,
    industry,
    city: cityNorm,
    companySize: "",
    email,
    phone,
    linkedinUrl: "",
    website,
    needs: industry ? randN(INDUSTRY_NEEDS[industry], 2) : [],
    status: "",
    source: "XLS Import",
    notes: "",
    dateAdded: new Date().toISOString().split("T")[0],
    lastContact: null,
    tags: [],
  };
  lead.score = calcScore(lead);
  lead.tags  = calcTags(lead);
  return lead;
}

// ─── LEAD SCORING ────────────────────────────────────────────────
// Max 100 pts: Title (35) + Company Size (25) + Needs (25) + Source (15)
function calcScore(lead) {
  const titlePts  = { "CEO": 35, "Founder": 35, "Owner": 35, "Managing Director": 28, "COO": 28, "General Manager": 25, "CTO": 22, "VP Operations": 22, "Export Manager": 18, "Business Development": 15 };
  const sizePts   = { "500+": 25, "201-500": 20, "51-200": 15, "11-50": 10, "1-10": 5 };
  const sourcePts = { "LinkedIn Search": 15, "LinkedIn Post Engagement": 12, "LinkedIn Group": 10, "Manual Entry": 8 };
  const needsPts  = lead.needs.length >= 3 ? 25 : lead.needs.length === 2 ? 18 : 10;
  return Math.min(100, (titlePts[lead.title] || 10) + (sizePts[lead.companySize] || 10) + needsPts + (sourcePts[lead.source] || 8));
}

// ─── TAG LOGIC ───────────────────────────────────────────────────
function calcTags(lead) {
  const tags = [];
  if (["CEO", "Founder", "Owner", "Managing Director", "COO"].includes(lead.title)) tags.push("Decision Maker");
  if (["1-10", "11-50"].includes(lead.companySize)) tags.push("SME");
  if (["1-10"].includes(lead.companySize) && ["CEO", "Founder"].includes(lead.title)) tags.push("Startup");
  if (lead.needs.some((n) => ["Export Development", "Turquality Consultancy"].includes(n))) tags.push("Export-Ready");
  if (lead.score >= 80) tags.push("High-Priority");
  if (tags.length === 0) tags.push("Follow-Up");
  return tags;
}

// ─── PROXYCURL RESPONSE → LEAD ───────────────────────────────────
function mapProxycurlProfile(profile) {
  const currentExp = profile.experiences?.find((e) => !e.ends_at) || profile.experiences?.[0];
  const rawIndustry = profile.industry || "";
  const industry = Object.keys(INDUSTRY_NEEDS).find((k) => rawIndustry.toLowerCase().includes(k.toLowerCase())) || "";
  const lead = {
    id: randId(),
    firstName: profile.first_name || "",
    lastName:  profile.last_name  || "",
    title:     currentExp?.title  || profile.headline || "",
    company:   currentExp?.company || "",
    industry,
    city:      profile.city || "",
    companySize: "",
    email:     profile.personal_emails?.[0] || "",
    phone:     profile.personal_numbers?.[0] || "",
    linkedinUrl: profile.public_identifier ? `linkedin.com/in/${profile.public_identifier}` : (profile.linkedin_profile_url || ""),
    needs:     industry ? randN(INDUSTRY_NEEDS[industry], 2) : [],
    status:    "",
    source:    "LinkedIn Search",
    notes:     "",
    dateAdded: new Date().toISOString().split("T")[0],
    lastContact: null,
    tags:      [],
  };
  lead.score = calcScore(lead);
  lead.tags  = calcTags(lead);
  return lead;
}

// ─── LUSHA RESPONSE → LEAD ───────────────────────────────────────
// search: raw contact from /prospecting/contact/search
// enriched: contacts[].data object from /prospecting/contact/enrich (may be null)
function mapLushaProfile(search, enriched) {
  const e = enriched || {};
  const rawIndustry = e.company?.mainIndustry || search.companyMainIndustry || "";
  const industry = Object.keys(INDUSTRY_NEEDS).find((k) => rawIndustry.toLowerCase().includes(k.toLowerCase())) || "";

  const firstName = e.firstName || search.name?.split(" ")[0] || "";
  const lastName  = e.lastName  || search.name?.split(" ").slice(1).join(" ") || "";

  const emails = e.emailAddresses || [];
  const phones = e.phoneNumbers   || [];
  const email  = emails.find((m) => m.emailType === "work")?.email
              || emails[0]?.email || "";
  const phone  = phones.find((p) => p.phoneType === "mobile" || p.phoneType === "Mobile")?.number
              || phones.find((p) => p.phoneType === "direct" || p.phoneType === "Direct")?.number
              || phones[0]?.number || "";
  const linkedinUrl = e.socialLinks?.linkedin || "";

  // employees comes as a range string e.g. "1 - 10", map to our size buckets
  const empStr = e.company?.employees || "";
  const companySize = empStr.includes("10001") ? "500+"
    : empStr.includes("1001") ? "500+"
    : empStr.includes("201") || empStr.includes("500") ? "201-500"
    : empStr.includes("51") || empStr.includes("100") || empStr.includes("200") ? "51-200"
    : empStr.includes("11") || empStr.includes("50") ? "11-50"
    : empStr ? "1-10" : "";

  const lead = {
    id: randId(),
    firstName, lastName,
    title:       e.jobTitle    || search.jobTitle    || "",
    company:     e.companyName || search.companyName || "",
    industry,
    city:        e.location?.city || e.company?.location?.city || "",
    companySize,
    email,
    phone,
    linkedinUrl,
    logoUrl:     search.logoUrl || "",
    needs:       industry ? randN(INDUSTRY_NEEDS[industry], 2) : [],
    status:      "",
    source:      "Lusha",
    notes:       "",
    dateAdded:   new Date().toISOString().split("T")[0],
    lastContact: null,
    tags:        [],
  };
  lead.score = calcScore(lead);
  lead.tags  = calcTags(lead);
  return lead;
}

// ─── STATUS COLORS ───────────────────────────────────────────────
const STATUS_COLORS = {
  "New": { bg: "#E3F2FD", text: "#1565C0", dot: "#1976D2" },
  "Contacted": { bg: "#FFF3E0", text: "#E65100", dot: "#F57C00" },
  "Qualified": { bg: "#E8F5E9", text: "#2E7D32", dot: "#43A047" },
  "Proposal Sent": { bg: "#F3E5F5", text: "#6A1B9A", dot: "#8E24AA" },
  "Negotiation": { bg: "#FFF8E1", text: "#F57F17", dot: "#FBC02D" },
  "Won": { bg: "#E0F2F1", text: "#00695C", dot: "#00897B" },
  "Lost": { bg: "#FFEBEE", text: "#B71C1C", dot: "#E53935" },
};

// ─── ICONS (inline SVG components) ───────────────────────────────
const Icon = ({ d, size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const SearchIcon = (p) => <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" {...p} />;
const UserIcon = (p) => <Icon d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" {...p} />;
const BriefcaseIcon = (p) => <Icon d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" {...p} />;
const MailIcon = (p) => <Icon d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm16 2l-8 5-8-5" {...p} />;
const PhoneIcon = (p) => <Icon d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" {...p} />;
const FilterIcon = (p) => <Icon d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" {...p} />;
const PlusIcon = (p) => <Icon d="M12 5v14M5 12h14" {...p} />;
const XIcon = (p) => <Icon d="M18 6L6 18M6 6l12 12" {...p} />;
const ChevronDown = (p) => <Icon d="M6 9l6 6 6-6" {...p} />;
const BotIcon = (p) => <Icon d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 110 2h-1v1a7 7 0 01-7 7H10a7 7 0 01-7-7v-1H2a1 1 0 110-2h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zM9.5 14a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm5 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" {...p} />;
const InboxIcon = (p) => <Icon d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" {...p} />;
const GridIcon = (p) => <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" {...p} />;
const FileTextIcon = (p) => <Icon d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" {...p} />;
const BarChartIcon = (p) => <Icon d="M12 20V10M18 20V4M6 20v-4" {...p} />;
const SettingsIcon = (p) => <Icon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.2.65.77 1.1 1.51 1H21a2 2 0 010 4h-.09c-.74.1-1.31.55-1.51 1.01z" {...p} />;
const RefreshIcon = (p) => <Icon d="M23 4v6h-6M1 20v-6h6M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" {...p} />;
const PhoneCallIcon = (p) => <Icon d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" {...p} />;
const MicIcon = (p) => <Icon d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" {...p} />;
const LinkedInIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#0A66C2">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

// ─── MONDAY COLUMN TITLE TRANSLATION ─────────────────────────────
const MONDAY_COL_TITLE_EN = {
  "e-posta": "Email", "e posta": "Email", "eposta": "Email",
  "telefon": "Phone", "cep telefonu": "Phone", "gsm": "Phone", "tel": "Phone",
  "calisan sayisi": "Employee Count", "calisan": "Employees",
  "personel": "Staff", "kadro": "Headcount", "eleman": "Staff",
  "sektor": "Industry", "endustri": "Industry",
  "cinsiyet": "Gender", "unvan": "Title", "hitap": "Salutation",
  "mail konulari": "Email Topics",
  "ortak mail": "Shared Email", "ortak e-posta": "Shared Email",
  "isim": "First Name", "ad": "First Name",
  "soyisim": "Last Name", "soyad": "Last Name",
  "sirket": "Company", "firma": "Company",
  "sehir": "City", "ulke": "Country",
  "pozisyon": "Position", "pozisyon/unvan": "Position",
  "web sitesi": "Website",
  "not": "Notes", "notlar": "Notes",
  "durum": "Status", "kaynak": "Source", "linkedin": "LinkedIn",
};
function normForColTitle(s) {
  return (s || "").toLowerCase()
    .replace(/[İI]/g, "i").replace(/ı/g, "i").replace(/[Şş]/g, "s")
    .replace(/[Çç]/g, "c").replace(/[Öö]/g, "o").replace(/[Üü]/g, "u").replace(/[Ğğ]/g, "g")
    .trim();
}
function mondayColTitle(col, lang) {
  const title = col?.title || "";
  if (lang !== "en") return title;
  return MONDAY_COL_TITLE_EN[normForColTitle(title)] || title;
}

// ─── MONDAY DEDUPLICATION ─────────────────────────────────────────
function deduplicateMondayItems(items, columns, signals = { name: true, email: true, phone: true }) {
  if (!items || items.length === 0) return { deduped: [], mergedCount: 0, mergeLog: [] };

  const emailColId  = (columns.find(c => c.type === "email") || columns.find(c => /e[\s-]?posta|e-?mail/i.test(c.title)))?.id;
  const phoneColId  = (columns.find(c => c.type === "phone" || /\btelefon\b|phone|tel\b|gsm\b|cep\b/i.test(c.title)))?.id;
  const colTitleById = Object.fromEntries(columns.map(c => [c.id, c.title]));

  const normName  = s => (s || "").trim().replace(/[İI]/g, "i").replace(/ı/g, "i").replace(/[Şş]/g, "s").toLowerCase().replace(/\s+/g, " ");
  const normPhone = s => (s || "").replace(/[\s\-().+]/g, "");
  const normEmail = s => (s || "").toLowerCase().trim();

  const parent = {};
  const find = id => { if (parent[id] === undefined) parent[id] = id; if (parent[id] !== id) parent[id] = find(parent[id]); return parent[id]; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const byName = {}, byEmail = {}, byPhone = {};
  for (const item of items) {
    if (signals.name) {
      const name = normName(item.name || "");
      if (name && name !== "item") { if (!byName[name]) byName[name] = []; byName[name].push(item.id); }
    }
    if (signals.email && emailColId) {
      const email = normEmail(item.column_values.find(cv => cv.id === emailColId)?.text || "");
      if (email) { if (!byEmail[email]) byEmail[email] = []; byEmail[email].push(item.id); }
    }
    if (signals.phone && phoneColId) {
      const phone = normPhone(item.column_values.find(cv => cv.id === phoneColId)?.text || "");
      if (phone && phone.length >= 7) { if (!byPhone[phone]) byPhone[phone] = []; byPhone[phone].push(item.id); }
    }
  }

  if (signals.name)  for (const ids of Object.values(byName))  for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  if (signals.email) for (const ids of Object.values(byEmail)) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  if (signals.phone) for (const ids of Object.values(byPhone)) for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);

  const groups = {};
  for (const item of items) { const root = find(item.id); if (!groups[root]) groups[root] = []; groups[root].push(item); }

  let mergedCount = 0;
  const mergeLog = [];
  const result = [];

  for (const group of Object.values(groups)) {
    if (group.length === 1) { result.push(group[0]); continue; }
    mergedCount += group.length - 1;

    const primary = [...group].sort((a, b) =>
      b.column_values.filter(cv => cv.text?.trim()).length - a.column_values.filter(cv => cv.text?.trim()).length
    )[0];

    const filledFields = [];
    const mergedCVs = primary.column_values.map(cv => {
      if (cv.text?.trim()) return cv;
      for (const item of group) {
        if (item === primary) continue;
        const other = item.column_values.find(o => o.id === cv.id);
        if (other?.text?.trim()) {
          filledFields.push(colTitleById[cv.id] || cv.id);
          return { ...cv, text: other.text, value: other.value };
        }
      }
      return cv;
    });

    // Determine which signals caused the grouping
    const matchedBy = [];
    const names = group.map(i => normName(i.name || "")).filter(n => n && n !== "item");
    if (names.length > 1 && new Set(names).size < names.length) matchedBy.push("name");
    if (emailColId) {
      const emails = group.map(i => normEmail(i.column_values.find(cv => cv.id === emailColId)?.text || "")).filter(Boolean);
      if (emails.length > 1 && new Set(emails).size < emails.length) matchedBy.push("email");
    }
    if (phoneColId) {
      const phones = group.map(i => normPhone(i.column_values.find(cv => cv.id === phoneColId)?.text || "")).filter(p => p.length >= 7);
      if (phones.length > 1 && new Set(phones).size < phones.length) matchedBy.push("phone");
    }

    // Snapshot each original for display
    const originals = group.map(i => ({
      id: i.id,
      name: i.name,
      email: emailColId ? (i.column_values.find(cv => cv.id === emailColId)?.text || "") : "",
      phone: phoneColId ? (i.column_values.find(cv => cv.id === phoneColId)?.text || "") : "",
      isPrimary: i.id === primary.id,
    }));

    mergeLog.push({ name: primary.name, total: group.length, matchedBy, filledFields, originals });
    result.push({ ...primary, column_values: mergedCVs, _mergedFrom: group.map(i => i.id) });
  }

  const order = Object.fromEntries(items.map((item, idx) => [item.id, idx]));
  result.sort((a, b) => (order[a.id] ?? 0) - (order[b.id] ?? 0));
  return { deduped: result, mergedCount, mergeLog };
}

// ─── MAIN APP ────────────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("sns_token");
    if (!token) { setAuthLoading(false); return; }
    fetch("/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user) setAuthUser(data.user);
        else { localStorage.removeItem("sns_token"); localStorage.removeItem("sns_user"); }
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogin = (user) => setAuthUser(user);
  const handleLogout = () => {
    localStorage.removeItem("sns_token");
    localStorage.removeItem("sns_user");
    setAuthUser(null);
  };

  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: "#0A3E62", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, fontFamily: "sans-serif" }}>Loading...</div>
    </div>
  );
  if (!authUser) return <LoginPage onLogin={handleLogin} />;
  return <Dashboard authUser={authUser} onLogout={handleLogout} />;
}

function EmailHistory({ colors, token, lang }) {
  const t = (key, ...args) => { const v = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.tr[key]; return typeof v === "function" ? v(...args) : (v ?? key); };
  const [filters, setFilters] = useState({ search: "", date_from: "", date_to: "", status: "", subject: "" });
  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset]   = useState(0);
  const LIMIT = 100;

  const fetchHistory = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off });
      if (filters.search)    params.set("search",    filters.search);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to)   params.set("date_to",   filters.date_to);
      if (filters.status)    params.set("status",    filters.status);
      if (filters.subject)   params.set("subject",   filters.subject);
      const res = await fetch(`/email/sends?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setOffset(off);
    } catch {}
    finally { setLoading(false); }
  }, [filters, token]);

  useEffect(() => { fetchHistory(0); }, []);

  const exportExcel = () => {
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      [t("history_xlsDate")]:      r.sent_at,
      [t("history_xlsEmail")]:     r.recipient_email,
      [t("history_xlsName")]:      r.recipient_name || "",
      [t("history_xlsSubject")]:   r.subject || "",
      [t("history_xlsStatus")]:    r.status,
      [t("history_xlsSignature")]: r.signature_key || "",
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t("history_xlsSheet"));
    XLSX.writeFile(wb, `email_gecmisi_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const inputStyle = { padding: "7px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none" };

  return (
    <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{t("history_title")}</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => fetchHistory(0)} style={{ ...inputStyle, cursor: "pointer", fontWeight: 600 }}>{t("history_refresh")}</button>
          <button onClick={exportExcel} disabled={!rows.length} style={{ ...inputStyle, cursor: rows.length ? "pointer" : "not-allowed", fontWeight: 600, color: colors.primary, opacity: rows.length ? 1 : 0.4 }}>{t("history_download")}</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <input placeholder={t("history_searchPlaceholder")} value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} style={{ ...inputStyle, minWidth: 180 }} />
        <input placeholder={t("history_subjectPlaceholder")} value={filters.subject} onChange={e => setFilters(p => ({ ...p, subject: e.target.value }))} style={{ ...inputStyle, minWidth: 160 }} />
        <input type="date" value={filters.date_from} onChange={e => setFilters(p => ({ ...p, date_from: e.target.value }))} style={inputStyle} />
        <input type="date" value={filters.date_to}   onChange={e => setFilters(p => ({ ...p, date_to:   e.target.value }))} style={inputStyle} />
        <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="">{t("history_allStatuses")}</option>
          <option value="sent">{t("history_sent")}</option>
          <option value="failed">{t("history_failed")}</option>
        </select>
        <button onClick={() => fetchHistory(0)} style={{ ...inputStyle, cursor: "pointer", background: colors.primary, color: "#fff", fontWeight: 600, border: "none" }}>{t("history_filter")}</button>
        <button onClick={() => { setFilters({ search: "", date_from: "", date_to: "", status: "", subject: "" }); setTimeout(() => fetchHistory(0), 0); }}
          style={{ ...inputStyle, cursor: "pointer" }}>{t("history_clearBtn")}</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 32, color: colors.textMuted }}>{t("history_loading")}</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: colors.textMuted, fontSize: 13 }}>{t("history_noRecords")}</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8 }}>{t("history_showing", total, rows.length)}</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                  {[t("history_colDate"), t("history_colRecipient"), t("history_colEmail"), t("history_colSubject"), t("history_colStatus"), t("history_colSignature")].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: "8px 10px", color: colors.textMuted, whiteSpace: "nowrap" }}>{r.sent_at?.slice(0, 16).replace("T", " ")}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 500, whiteSpace: "nowrap" }}>{r.recipient_name || "—"}</td>
                    <td style={{ padding: "8px 10px", color: colors.textMuted }}>{r.recipient_email}</td>
                    <td style={{ padding: "8px 10px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.subject}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: r.status === "sent" ? "rgba(67,160,71,0.15)" : "rgba(220,53,69,0.15)", color: r.status === "sent" ? "#81c784" : "#e57373" }}>
                        {r.status === "sent" ? t("history_sent") : t("history_failed")}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", color: colors.textMuted, fontSize: 11 }}>{r.signature_key || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > LIMIT && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
              <button disabled={offset === 0} onClick={() => fetchHistory(offset - LIMIT)} style={{ ...inputStyle, cursor: "pointer" }}>{t("history_prev")}</button>
              <span style={{ padding: "7px 10px", fontSize: 12, color: colors.textMuted }}>{Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}</span>
              <button disabled={offset + LIMIT >= total} onClick={() => fetchHistory(offset + LIMIT)} style={{ ...inputStyle, cursor: "pointer" }}>{t("history_next")}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Dashboard({ authUser, onLogout: handleLogout }) {
  // ── LEADS STATE ─────────────────────────────────────────────────
  const [leads, setLeads] = useState(() => {
    try {
      const saved = localStorage.getItem("sns_leads");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [view, setView] = useState("dashboard"); // dashboard | leads | agent | pipeline | detail
  const [selectedLead, setSelectedLead] = useState(null);
  const [search, setSearch] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterCity, setFilterCity] = useState("All");
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentLog, setAgentLog] = useState([]);
  const [agentConfig, setAgentConfig] = useState({
    titles: "CEO, Founder, Managing Director, Export Manager",
    industries: "Manufacturing, Software/IT, Food & Beverage, Tourism",
    cities: "İstanbul, Ankara, İzmir, Bursa",
    companySize: "11-50, 51-200, 201-500",
    maxLeads: 25,
  });
  const [settings, setSettings] = useState(() => {
    const defaults = {
      lushaApiKey: "",
      snovClientId: "",
      snovClientSecret: "",
      vapiApiKey: "",
      vapiPhoneNumberId: "",
      vapiVoiceProvider: "openai",
      vapiVoice: "alloy",
      vapiFirstMessage: "Merhaba, Sun&Sun Danışmanlık firmasından arıyorum. Birkaç dakikanız var mı?",
      vapiPrompt: `Sen Sun&Sun Danışmanlık firması adına arama yapan profesyonel bir iş geliştirme uzmanısın. Görevin, potansiyel müşterilerle kısa ve nazik bir konuşma yaparak hizmetlerimize ilgi duyup duymadıklarını anlamak.

Sun&Sun hizmetleri: Turquality danışmanlığı, KOSGEB hibeleri, ihracat geliştirme, AB hibeleri, TÜBİTAK projeleri, dijital pazarlama ve kalite yönetimi (ISO).

Kurallar:
- Kibar, samimi ve profesyonel ol
- 2-3 dakikadan uzun süre konuşma
- Eğer ilgilenirlerse bir toplantı öner
- Eğer ilgilenmiyorlarsa nazikçe konuşmayı bitir
- Türkçe konuş, ama gerekirse İngilizceye geç`,
      twilioAccountSid: "",
      twilioAuthToken: "",
      twilioFromNumber: "",
      minCompanySize: "11",
      priorityIndustries: "Manufacturing, Software, Food",
      decisionMakerBoost: "+20 points",
      emailNotifications: "info@sunandsun.com.tr",
      notifyNewLeads: "Enabled",
      dailySummary: "09:00 AM",
      sendgridApiKey: "",
      sendgridFromEmail: "info@sunandsun.com.tr",
      sendgridFromName: "Sun & Sun International",
      mondayApiKey: "",
      mondayBoardId: "8368915",
      mondayCompaniesBoardId: "",
    };
    try {
      const saved = localStorage.getItem("sns_settings");
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch { return defaults; }
  });

  // ── EMAIL CAMPAIGN STATE ────────────────────────────────────────
  // ── MONDAY STATE ───────────────────────────────────────────────
  const [mondayItems, setMondayItems] = useState([]);
  const [mondayMergedCount, setMondayMergedCount] = useState(0);
  const [mondayMergeLog, setMondayMergeLog] = useState([]);
  const [mondayMergeModal, setMondayMergeModal] = useState(false);
  const [mondayRawItems, setMondayRawItems] = useState([]);
  const [mondayMergeSignals, setMondayMergeSignals] = useState({ name: true, email: true, phone: true });
  const [mondayBoardType, setMondayBoardType] = useState("contacts"); // "contacts" | "companies"
  const [mondayColumns, setMondayColumns] = useState([]);
  const [mondayBoardName, setMondayBoardName] = useState("");
  const [mondayLoading, setMondayLoading] = useState(false);
  const [mondayError, setMondayError] = useState("");
  const [mondayTestEmail, setMondayTestEmail] = useState(null);
  const [mondaySelected, setMondaySelected] = useState(new Set());
  const [mondayBulkModal, setMondayBulkModal] = useState(false);
  const [selectedSignature, setSelectedSignature] = useState("merve");
  const [newTemplateModal, setNewTemplateModal] = useState(false);
  const [newTemplateDraft, setNewTemplateDraft] = useState({ label: "", subject: "", body: "" });
  const [showOnlyWithEmail, setShowOnlyWithEmail] = useState(false);
  const [mondayBulkDraft, setMondayBulkDraft] = useState({ subject: "", body: "" });
  const [mondayBulkSending, setMondayBulkSending] = useState(false);
  const [mondayCampaigns, setMondayCampaigns] = useState([]);
  const [mondayAttachments, setMondayAttachments] = useState([]);
  const [mondayEmailVerification, setMondayEmailVerification] = useState({});
  const [mondayVerifying, setMondayVerifying] = useState(false);
  const [mondayBounces, setMondayBounces] = useState(new Set());
  const [bounceSyncing, setBounceSyncing] = useState(false);
  const [mondayErrorPanelOpen, setMondayErrorPanelOpen] = useState(false);
  const [bounceLastSync, setBounceLastSync] = useState(null);
  const [mondayMailKonulari, setMondayMailKonulari] = useState("");
  const [mondayOrtakMail, setMondayOrtakMail] = useState("");
  const [mondayTags, setMondayTags] = useState([]);
  const [mondayFilters, setMondayFilters] = useState({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // ── Contracts state ───────────────────────────────────────────
  const [contractTemplates, setContractTemplates] = useState([]);
  const [contractCompanies, setContractCompanies] = useState([]);
  const [contractView, setContractView] = useState("form"); // "form" | "templates"
  const [contractTemplate, setContractTemplate] = useState(null);
  const [contractData, setContractData] = useState({
    party1_id: "", party2_name: "", party2_tax_office: "", party2_tax_no: "",
    party2_address: "", party3_name: "", program_name: "", down_payment: "",
    success_bonus: "", contract_date: new Date().toLocaleDateString("tr-TR"),
    payment_schedule: [],
  });
  const [contractGenerating, setContractGenerating] = useState(false);
  const [contractOcrLoading, setContractOcrLoading] = useState(false);
  const [contractUploadName, setContractUploadName] = useState("");
  const [contractUploadFile, setContractUploadFile] = useState(null);
  const [contractUploading, setContractUploading] = useState(false);

  // ── Settings — companies state ────────────────────────────────
  const [settingsCompanies, setSettingsCompanies] = useState([]);
  const [settingsEditingId, setSettingsEditingId] = useState(null);
  const [settingsEditDraft, setSettingsEditDraft] = useState({});
  const [settingsAddDraft, setSettingsAddDraft] = useState({ name:"", short:"", tax_office:"", tax_no:"", address:"", iban:"" });
  const [settingsShowAdd, setSettingsShowAdd] = useState(false);
  const [settingsOcrLoading, setSettingsOcrLoading] = useState(false);

  const fetchSettingsCompanies = async () => {
    const token = localStorage.getItem("sns_token");
    fetch("/contracts/companies", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setSettingsCompanies).catch(() => {});
  };

  const settingsRunOcr = async (file, setDraft) => {
    setSettingsOcrLoading(true);
    try {
      const token = localStorage.getItem("sns_token");
      const fd = new FormData();
      fd.append("image", file);
      const r = await fetch("/contracts/ocr", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await r.json();
      if (d.ok && d.fields) {
        setDraft(prev => ({ ...prev, name: d.fields.party2_name || prev.name, tax_office: d.fields.party2_tax_office || prev.tax_office, tax_no: d.fields.party2_tax_no || prev.tax_no, address: d.fields.party2_address || prev.address }));
        alert(t("contract_ocrDone"));
      } else { alert(t("contract_ocrError", d.error || "Unknown")); }
    } catch { alert(t("contract_ocrUnavailable")); }
    finally { setSettingsOcrLoading(false); }
  };

  const settingsSaveEdit = async (id) => {
    const token = localStorage.getItem("sns_token");
    const r = await fetch(`/contracts/companies/${id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(settingsEditDraft) });
    const d = await r.json();
    setSettingsCompanies(prev => prev.map(c => c.id === id ? d : c));
    setSettingsEditingId(null);
  };

  const settingsAddCompany = async () => {
    if (!settingsAddDraft.name.trim()) return;
    const token = localStorage.getItem("sns_token");
    const r = await fetch("/contracts/companies", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(settingsAddDraft) });
    const d = await r.json();
    setSettingsCompanies(prev => [...prev, d]);
    setSettingsAddDraft({ name:"", short:"", tax_office:"", tax_no:"", address:"", iban:"" });
    setSettingsShowAdd(false);
  };

  const settingsDeleteCompany = async (id) => {
    if (!confirm(t("settings_companyDeleteConfirm"))) return;
    const token = localStorage.getItem("sns_token");
    await fetch(`/contracts/companies/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setSettingsCompanies(prev => prev.filter(c => c.id !== id));
  };

  const fetchMondayCampaigns = async () => {
    try {
      const token = localStorage.getItem("sns_token");
      const r = await fetch("/email/campaigns", { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setMondayCampaigns(await r.json());
    } catch {}
  };

  const fetchMondayBoard = async (boardType = mondayBoardType) => {
    const boardId = boardType === "companies" ? settings.mondayCompaniesBoardId : settings.mondayBoardId;
    if (!settings.mondayApiKey || !boardId) {
      setMondayError(boardType === "companies"
        ? "Add your Companies Board ID in Settings first."
        : "Add your Monday.com API key and Board ID in Settings first.");
      return;
    }
    setMondayBoardType(boardType);
    setMondayLoading(true);
    setMondayError("");
    try {
      const token = localStorage.getItem("sns_token");
      const r = await fetch("/monday/board", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey: settings.mondayApiKey, boardId }),
      });
      const data = await r.json();
      if (data.errors) { setMondayError(data.errors[0]?.message || "Monday API error"); return; }
      const board = data?.data?.boards?.[0];
      if (!board) { setMondayError("Board not found. Check your Board ID."); return; }
      setMondayBoardName(board.name);
      setMondayColumns(board.columns || []);
      const rawItems = board.items_page?.items || [];
      setMondayRawItems(rawItems);
      setMondayItems(rawItems);
      setMondayMergedCount(0);
      setMondayMergeLog([]);
      // verify email domains in background
      const emailColDef = (board.columns || []).find(c => c.type === "email") || (board.columns || []).find(c => /e[\s-]?posta|e-?mail/i.test(c.title));
      if (emailColDef) {
        const emails = items.map(i => {
          const cv = i.column_values.find(v => v.id === emailColDef.id);
          return cv?.text || "";
        }).filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
        if (emails.length > 0) {
          setMondayVerifying(true);
          const token = localStorage.getItem("sns_token");
          fetch("/email/verify-domains", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ emails }),
          }).then(r => r.json()).then(data => setMondayEmailVerification(data)).finally(() => setMondayVerifying(false));
        }
      }
      // fetch bounced emails in background
      fetch("/email/bounces", {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(rows => {
        setMondayBounces(new Set(rows.map(r => r.email.toLowerCase())));
      }).catch(() => {});
      // Extract tags directly from board items (id+name from tag column values)
      const tagColIds = (board.columns || [])
        .filter(c => c.type === "tag" || /mail.konular|ortak.mail/i.test(c.title))
        .map(c => c.id);
      const tagMap = {};
      rawItems.forEach(item => {
        tagColIds.forEach(colId => {
          const cv = item.column_values.find(c => c.id === colId);
          if (!cv || !cv.value || !cv.text) return;
          try {
            const ids = (JSON.parse(cv.value).tag_ids || []);
            const names = cv.text.split(",").map(s => s.trim()).filter(Boolean);
            ids.forEach((id, i) => { if (names[i]) tagMap[id] = names[i]; });
          } catch {}
        });
      });
      setMondayTags(Object.entries(tagMap).map(([id, name]) => ({ id: Number(id), name })));
    } catch (e) {
      setMondayError(e.message);
    } finally {
      setMondayLoading(false);
    }
  };

  const runDedup = () => {
    const { deduped, mergedCount, mergeLog } = deduplicateMondayItems(mondayRawItems, mondayColumns, mondayMergeSignals);
    setMondayItems(deduped);
    setMondayMergedCount(mergedCount);
    setMondayMergeLog(mergeLog);
    setMondayMergeModal(true);
  };

  const syncBounces = async () => {
    if (!settings.sendgridApiKey) { alert("SendGrid API key is missing. Add it in Settings."); return; }
    setBounceSyncing(true);
    try {
      const token = localStorage.getItem("sns_token");
      const res = await fetch("/email/bounces/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey: settings.sendgridApiKey }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Sync failed"); return; }
      setMondayBounces(new Set(data.bounces.map(b => b.email.toLowerCase())));
      setBounceLastSync(data.synced);
    } catch (e) {
      alert("Bounce sync failed: " + e.message);
    } finally {
      setBounceSyncing(false);
    }
  };

  // ── EMAIL CAMPAIGN STATE ────────────────────────────────────────
  const [emailCampaigns, setEmailCampaigns] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sns_email_campaigns") || "[]"); } catch { return []; }
  });
  const [emailDraft, setEmailDraft] = useState({ subject: "", body: "" });
  const [emailFilter, setEmailFilter] = useState({ statuses: [], industries: [], hasEmail: true });
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [templateMgrOpen, setTemplateMgrOpen] = useState(false);
  const [templateEdit, setTemplateEdit] = useState(null);

  // ── INBOX / ML STATE ────────────────────────────────────────────
  const [inboxText, setInboxText]       = useState("");
  const [inboxResult, setInboxResult]   = useState(null);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxLabeling, setInboxLabeling] = useState(false);
  const [mlStatus, setMlStatus]         = useState(null);
  const [mlTraining, setMlTraining]     = useState(false);
  const [mlTrainResult, setMlTrainResult] = useState(null);
  const [activeCall, setActiveCall] = useState(null); // { callId, lead, status, startTime }
  const [showCallModal, setShowCallModal] = useState(false);
  const callPollRef = useRef(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importFileName, setImportFileName] = useState("");
  const [importStats, setImportStats] = useState(null);
  const [newLead, setNewLead] = useState({ firstName: "", lastName: "", title: "", company: "", industry: "", city: "", companySize: "", email: "", phone: "", linkedinUrl: "", source: "", notes: "" });
  const logRef = useRef(null);

  // ── USER MANAGEMENT STATE (admin only) ──────────────────────────
  const [umUsers, setUmUsers] = useState([]);
  const [umLoading, setUmLoading] = useState(false);
  const [umError, setUmError] = useState("");
  const [umSuccess, setUmSuccess] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "user" });
  const [pwModal, setPwModal] = useState(null); // { id, name } or null
  const [newPw, setNewPw] = useState("");
  const [newPwError, setNewPwError] = useState("");

  const umFetch = useCallback(() => {
    const token = localStorage.getItem("sns_token");
    if (!token) return;
    setUmLoading(true);
    setUmError("");
    fetch("/auth/users", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => setUmUsers(data))
      .catch(() => setUmError("Failed to load users."))
      .finally(() => setUmLoading(false));
  }, []);

  // Load users when admin enters settings
  useEffect(() => {
    if (view === "settings" && authUser?.role === "admin") { umFetch(); fetchSettingsCompanies(); }
    if (view === "monday") fetchMondayCampaigns();
    if (view === "contracts") {
      const token = localStorage.getItem("sns_token");
      fetch("/contracts/templates", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(setContractTemplates).catch(() => {});
      fetch("/contracts/companies", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(setContractCompanies).catch(() => {});
    }
  }, [view, authUser, umFetch]);

  const umAddUser = async () => {
    setUmError(""); setUmSuccess("");
    const { name, email, password, role } = newUser;
    if (!name.trim() || !email.trim() || !password.trim())
      return setUmError("Name, email and password are required.");
    const token = localStorage.getItem("sns_token");
    const r = await fetch("/auth/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
    });
    const data = await r.json();
    if (!r.ok) return setUmError(data.error || "Failed to add user.");
    setUmSuccess(`${name} added successfully.`);
    setNewUser({ name: "", email: "", password: "", role: "user" });
    setShowAddUser(false);
    umFetch();
  };

  const umDeleteUser = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setUmError(""); setUmSuccess("");
    const token = localStorage.getItem("sns_token");
    const r = await fetch(`/auth/users/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    if (!r.ok) return setUmError(data.error || "Failed to delete user.");
    setUmSuccess(`${name} deleted.`);
    umFetch();
  };

  const umChangePw = async () => {
    setNewPwError("");
    if (!newPw || newPw.length < 6) return setNewPwError("Password must be at least 6 characters.");
    const token = localStorage.getItem("sns_token");
    const r = await fetch(`/auth/users/${pwModal.id}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: newPw }),
    });
    const data = await r.json();
    if (!r.ok) return setNewPwError(data.error || "Failed to change password.");
    setUmSuccess(`Password updated for ${pwModal.name}.`);
    setPwModal(null); setNewPw("");
  };

  // Persist settings (API keys etc.) to localStorage
  useEffect(() => {
    localStorage.setItem("sns_settings", JSON.stringify(settings));
  }, [settings]);

  // Persist leads to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("sns_leads", JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem("sns_email_campaigns", JSON.stringify(emailCampaigns));
  }, [emailCampaigns]);

  const fetchEmailTemplates = useCallback(async () => {
    const token = localStorage.getItem("sns_token");
    try {
      const res = await fetch("/email/templates", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEmailTemplates(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchEmailTemplates(); }, [fetchEmailTemplates]);

  const fetchMlStatus = useCallback(async () => {
    const token = localStorage.getItem("sns_token");
    try {
      const res = await fetch("/ml/status", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setMlStatus(await res.json());
    } catch { setMlStatus(null); }
  }, []);

  useEffect(() => { fetchMlStatus(); }, [fetchMlStatus]);

  // ─── VAPI COLD CALL ──────────────────────────────────────────────
  const initiateCall = async (lead) => {
    if (!settings.vapiApiKey) {
      alert("Add your Vapi API key in Settings first.");
      return;
    }
    if (!lead.phone) {
      alert("This lead has no phone number.");
      return;
    }
    if (!settings.vapiPhoneNumberId) {
      alert("Add your Vapi Phone Number ID in Settings first.");
      return;
    }

    const callEntry = { callId: null, startTime: new Date().toISOString(), status: "dialing", transcript: "", outcome: "", duration: null };
    setActiveCall({ ...callEntry, lead });
    setShowCallModal(true);

    try {
      const res = await fetch("/api/vapi/call/phone", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${settings.vapiApiKey.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumberId: settings.vapiPhoneNumberId.trim(),
          customer: { number: lead.phone.trim() },
          assistant: {
            model: {
              provider: "openai",
              model: "gpt-4o",
              messages: [{ role: "system", content: settings.vapiPrompt }],
            },
            voice: { provider: settings.vapiVoiceProvider || "openai", voiceId: settings.vapiVoice || "alloy" },
            firstMessage: settings.vapiFirstMessage,
            endCallFunctionEnabled: true,
            recordingEnabled: true,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const callId = data.id;
      setActiveCall((prev) => ({ ...prev, callId, status: "ringing" }));

      // Poll for call status every 5 seconds
      callPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/vapi/call/${callId}`, {
            headers: { "Authorization": `Bearer ${settings.vapiApiKey.trim()}` },
          });
          const callData = await statusRes.json();
          const status = callData.status; // queued | ringing | in-progress | forwarding | ended
          const transcript = callData.transcript || "";
          const endedReason = callData.endedReason || "";

          setActiveCall((prev) => ({ ...prev, status, transcript, endedReason }));

          if (status === "ended") {
            clearInterval(callPollRef.current);
            const duration = callData.endedAt && callData.startedAt
              ? Math.round((new Date(callData.endedAt) - new Date(callData.startedAt)) / 1000)
              : null;

            const outcome = endedReason === "customer-ended-call" ? "Completed"
              : endedReason === "assistant-ended-call" ? "Completed"
              : endedReason === "voicemail" ? "Voicemail"
              : endedReason === "no-answer" ? "No Answer"
              : endedReason || "Ended";

            const historyEntry = {
              callId,
              date: new Date().toLocaleDateString(),
              time: new Date(callData.startedAt || Date.now()).toLocaleTimeString(),
              duration: duration ? `${duration}s` : "—",
              status: outcome,
              transcript,
              endedReason,
            };

            setActiveCall((prev) => ({ ...prev, status: "ended", duration, outcome, transcript }));
            updateLead(lead.id, {
              lastContact: new Date().toISOString().split("T")[0],
              callHistory: [historyEntry, ...(lead.callHistory || [])],
              notes: transcript
                ? `[Call ${historyEntry.date}] ${transcript.slice(0, 300)}${transcript.length > 300 ? "..." : ""}\n\n${lead.notes || ""}`
                : lead.notes,
            });
            if (selectedLead?.id === lead.id) {
              setSelectedLead((prev) => ({
                ...prev,
                lastContact: new Date().toISOString().split("T")[0],
                callHistory: [historyEntry, ...(prev.callHistory || [])],
              }));
            }
          }
        } catch (_) { /* silent poll error */ }
      }, 5000);
    } catch (err) {
      setActiveCall((prev) => ({ ...prev, status: "error", errorMessage: err.message }));
    }
  };

  const endActiveCall = () => {
    if (callPollRef.current) clearInterval(callPollRef.current);
    setShowCallModal(false);
    setActiveCall(null);
  };

  // ─── TWILIO COLD CALL ─────────────────────────────────────────────
  const initiateTwilioCall = async (lead) => {
    if (!settings.twilioAccountSid || !settings.twilioAuthToken) {
      alert("Add your Twilio Account SID and Auth Token in Settings first.");
      return;
    }
    if (!settings.twilioFromNumber) {
      alert("Add your Twilio phone number in Settings first.");
      return;
    }
    if (!lead.phone) {
      alert("This lead has no phone number.");
      return;
    }

    const callEntry = { callId: null, startTime: new Date().toISOString(), status: "dialing", transcript: "", outcome: "", duration: null };
    setActiveCall({ ...callEntry, lead });
    setShowCallModal(true);

    const twiml = `<Response><Say voice="alice" language="tr-TR">${(settings.vapiFirstMessage || "Merhaba, Sun and Sun Danışmanlık firmasından arıyorum. Birkaç dakikanız var mı?").replace(/&/g, "&amp;")}</Say><Pause length="2"/><Say voice="alice" language="tr-TR">Eğer hizmetlerimiz hakkında bilgi almak isterseniz, lütfen bizi geri arayın. Teşekkürler, iyi günler.</Say></Response>`;

    const body = new URLSearchParams({
      To: lead.phone.trim(),
      From: settings.twilioFromNumber.trim(),
      Twiml: twiml,
    });

    const auth = btoa(`${settings.twilioAccountSid.trim()}:${settings.twilioAuthToken.trim()}`);

    try {
      const res = await fetch(`/api/twilio/2010-04-01/Accounts/${settings.twilioAccountSid.trim()}/Calls.json`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const callSid = data.sid;
      setActiveCall((prev) => ({ ...prev, callId: callSid, status: "ringing" }));

      // Poll for call status every 5 seconds
      callPollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/twilio/2010-04-01/Accounts/${settings.twilioAccountSid.trim()}/Calls/${callSid}.json`, {
            headers: { "Authorization": `Basic ${auth}` },
          });
          const callData = await statusRes.json();
          const status = callData.status; // queued | ringing | in-progress | canceled | completed | busy | no-answer | failed

          const mappedStatus = status === "completed" ? "ended"
            : status === "in-progress" ? "in-progress"
            : status === "ringing" ? "ringing"
            : status === "queued" ? "ringing"
            : status === "failed" || status === "canceled" ? "ended"
            : status;

          setActiveCall((prev) => ({ ...prev, status: mappedStatus }));

          if (["completed", "failed", "canceled", "busy", "no-answer"].includes(status)) {
            clearInterval(callPollRef.current);

            const startedAt = callData.start_time ? new Date(callData.start_time) : null;
            const endedAt = callData.end_time ? new Date(callData.end_time) : null;
            const duration = startedAt && endedAt ? Math.round((endedAt - startedAt) / 1000) : (parseInt(callData.duration) || null);

            const outcome = status === "completed" ? "Completed"
              : status === "busy" ? "Busy"
              : status === "no-answer" ? "No Answer"
              : status === "failed" ? "Failed"
              : "Ended";

            const historyEntry = {
              callId: callSid,
              date: new Date().toLocaleDateString(),
              time: new Date().toLocaleTimeString(),
              duration: duration ? `${duration}s` : "—",
              status: outcome,
              transcript: "",
              provider: "twilio",
            };

            setActiveCall((prev) => ({ ...prev, status: "ended", duration, outcome }));
            updateLead(lead.id, {
              lastContact: new Date().toISOString().split("T")[0],
              callHistory: [historyEntry, ...(lead.callHistory || [])],
            });
            if (selectedLead?.id === lead.id) {
              setSelectedLead((prev) => ({
                ...prev,
                lastContact: new Date().toISOString().split("T")[0],
                callHistory: [historyEntry, ...(prev.callHistory || [])],
              }));
            }
          }
        } catch (_) { /* silent poll error */ }
      }, 5000);
    } catch (err) {
      setActiveCall((prev) => ({ ...prev, status: "error", errorMessage: err.message }));
    }
  };

  const submitNewLead = () => {
    const lead = {
      ...newLead,
      id: randId(),
      needs: (INDUSTRY_NEEDS[newLead.industry] || NEEDS).slice(0, 2),
      status: "",
      dateAdded: new Date().toISOString().split("T")[0],
      lastContact: null,
      tags: [],
    };
    lead.score = calcScore(lead);
    lead.tags  = calcTags(lead);
    setLeads((p) => [lead, ...p]);
    setShowAddModal(false);
    setNewLead({ firstName: "", lastName: "", title: "", company: "", industry: "", city: "", companySize: "", email: "", phone: "", linkedinUrl: "", source: "", notes: "" });
  };

  const handleXlsFile = (file) => {
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const leads = rows.slice(1).map(mapXlsRow).filter(Boolean);
      const withContact = leads.filter(l => l.email || l.phone);
      const withWebsite = leads.filter(l => l.website && !l.email);
      setImportStats({ total: leads.length, withContact: withContact.length, withWebsite: withWebsite.length });
      setImportPreview(leads);
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = () => {
    const existing = new Set(leads.map(l => `${l.firstName}${l.lastName}${l.company}`.toLowerCase()));
    const newLeads = importPreview.filter(l => {
      const key = `${l.firstName}${l.lastName}${l.company}`.toLowerCase();
      return !existing.has(key);
    });
    setLeads(prev => [...newLeads, ...prev]);
    setShowImportModal(false);
    setImportPreview([]);
    setImportStats(null);
    setImportFileName("");
  };

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  // Agent — Lusha Prospecting API
  const runAgent = useCallback(async () => {
    if (agentRunning) return;
    setAgentRunning(true);
    const log = (msg, type = "system") =>
      setAgentLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);

    setAgentLog([{ time: new Date().toLocaleTimeString(), msg: "🤖 Agent initialized. Connecting to Lusha API...", type: "system" }]);

    if (!settings.lushaApiKey) {
      log("❌ No API key found. Add your Lusha API key in Settings.", "error");
      setAgentRunning(false); return;
    }

    const apiKey = settings.lushaApiKey.replace(/[^\x20-\x7E]/g, "").trim();
    const normalize  = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/İ/g, "I").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c");
    const titles     = agentConfig.titles.split(",").map((t) => t.trim()).filter(Boolean);
    const cities     = agentConfig.cities.split(",").map((c) => normalize(c.trim())).filter(Boolean);
    const existingUrls = new Set(leads.map((l) => l.linkedinUrl || `${l.firstName}${l.lastName}${l.company}`.toLowerCase()).filter(Boolean));
    let totalAdded = 0;
    let page = 0;

    log(`🔍 Searching: ${titles.slice(0, 3).join(", ")} | Cities: ${cities.slice(0, 3).join(", ")}`, "search");

    while (totalAdded < agentConfig.maxLeads) {
      log(`📄 Fetching page ${page + 1}...`, "filter");
      try {
        const body = {
          filters: {
            contacts: {
              include: {
                jobTitles: titles,
                locations: [{ country: "Turkey" }],
              },
            },
          },
          pages: { page, size: Math.min(25, Math.max(10, agentConfig.maxLeads - totalAdded)) },
        };

        // Step 1: Search
        const res = await fetch("/api/lusha/prospecting/contact/search", {
          method: "POST",
          headers: { "api_key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          log(`❌ Search error ${res.status}: ${err.message || res.statusText}`, "error");
          break;
        }

        const data = await res.json();
        console.log("Lusha search response:", JSON.stringify(data, null, 2));
        const searchContacts = data.data || data.contacts || data.results || [];
        log(`📊 ${searchContacts.length} contacts found on page ${page + 1} (total: ${data.totalResults ?? "?"})`, "search");

        if (searchContacts.length === 0) { log("✅ No more results.", "system"); break; }

        // Step 2: Enrich — pass requestId + contactIds to get email/phone/LinkedIn
        const toEnrich = searchContacts.slice(0, agentConfig.maxLeads - totalAdded);
        const enrichRes = await fetch("/api/lusha/prospecting/contact/enrich", {
          method: "POST",
          headers: { "api_key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: data.requestId,
            contactIds: toEnrich.map((c) => c.contactId),
          }),
        });

        const enrichData = await enrichRes.json();
        console.log("Lusha enrich response:", JSON.stringify(enrichData, null, 2));

        if (!enrichRes.ok) {
          log(`⚠️ Enrich failed (${enrichRes.status}: ${enrichData?.message || "unknown"}) — saving basic info only`, "filter");
        }

        // Build a lookup map from contactId → enriched data
        const enrichedMap = {};
        for (const ec of (enrichData.contacts || [])) {
          if (ec.isSuccess) enrichedMap[ec.id] = ec.data;
        }

        for (const contact of toEnrich) {
          if (totalAdded >= agentConfig.maxLeads) break;
          const enriched = enrichedMap[contact.contactId] || null;
          const lead = mapLushaProfile(contact, enriched);

          // Deduplicate by LinkedIn URL if available, otherwise by name+company
          const dedupKey = lead.linkedinUrl || `${lead.firstName}${lead.lastName}${lead.company}`.toLowerCase();
          if (existingUrls.has(dedupKey)) { log(`⏭️ Duplicate skipped: ${lead.firstName} ${lead.lastName}`, "filter"); continue; }
          existingUrls.add(dedupKey);

          setLeads((prev) => [lead, ...prev]);
          const contactInfo = lead.email || lead.phone || lead.linkedinUrl || "no contact info";
          log(`📥 Added: ${lead.firstName} ${lead.lastName} — ${lead.title} at ${lead.company} (${contactInfo})`, "lead");
          totalAdded++;
        }

        if (searchContacts.length < body.pages.size) break;
        page++;
      } catch (err) {
        log(`❌ Request failed: ${err.message}`, "error"); break;
      }
    }

    log(`✅ Done. ${totalAdded} new leads added. Lead scoring applied.`, "success");
    log("🤖 Agent idle. Ready for next run.", "system");
    setAgentRunning(false);
  }, [agentRunning, agentConfig, settings, leads]);

  const runSnovAgent = useCallback(async () => {
    if (agentRunning) return;
    setAgentRunning(true);
    const log = (msg, type = "system") =>
      setAgentLog((prev) => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);

    setAgentLog([{ time: new Date().toLocaleTimeString(), msg: "🤖 Snov.io Agent initialized...", type: "system" }]);

    if (!settings.snovClientId || !settings.snovClientSecret) {
      log("❌ Snov.io credentials missing. Add Client ID and Client Secret in Settings.", "error");
      setAgentRunning(false); return;
    }

    // Step 1: Get OAuth access token
    log("🔑 Authenticating with Snov.io...", "system");
    let accessToken = "";
    try {
      const tokenRes = await fetch("/api/snov/v1/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: settings.snovClientId.trim(),
          client_secret: settings.snovClientSecret.trim(),
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        log(`❌ Auth failed: ${tokenData?.message || tokenRes.statusText}`, "error");
        setAgentRunning(false); return;
      }
      accessToken = tokenData.access_token;
      log("✅ Authenticated.", "system");
    } catch (err) {
      log(`❌ Auth error: ${err.message}`, "error");
      setAgentRunning(false); return;
    }

    const titles = agentConfig.titles.split(",").map((t) => t.trim()).filter(Boolean);

    // Step 2: Find leads with website but no email → enrich via Snov.io domain search
    const toEnrich = leads.filter((l) => l.website && !l.email).slice(0, agentConfig.maxLeads);
    log(`🔍 Found ${toEnrich.length} leads with website but no email. Enriching...`, "search");

    let enriched = 0;
    for (const lead of toEnrich) {
      try {
        const domain = lead.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
        log(`🌐 Searching domain: ${domain}`, "filter");

        const res = await fetch("/api/snov/v2/domain-search/prospects/start", {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ domain, positions: titles }),
        });
        const data = await res.json();
        console.log("Snov domain search:", JSON.stringify(data, null, 2));

        const prospects = data.data?.prospects || data.prospects || [];
        if (prospects.length === 0) { log(`⏭️ No prospects found for ${domain}`, "filter"); continue; }

        const prospect = prospects[0];
        const email = prospect.email || prospect.emails?.[0]?.email || "";
        const phone = prospect.phones?.[0]?.phone || "";
        const linkedinUrl = prospect.linkedinUrl || prospect.linkedin || "";

        if (email || phone) {
          setLeads((prev) => prev.map((l) =>
            l.id === lead.id ? { ...l, email: email || l.email, phone: phone || l.phone, linkedinUrl: linkedinUrl || l.linkedinUrl, firstName: l.firstName || prospect.firstName || "", lastName: l.lastName || prospect.lastName || "" } : l
          ));
          log(`📥 Enriched: ${lead.company} → ${email || phone}`, "lead");
          enriched++;
        } else {
          log(`⚠️ No contact info found for ${domain}`, "filter");
        }
      } catch (err) {
        log(`❌ Error enriching ${lead.company}: ${err.message}`, "error");
      }
    }

    log(`✅ Done. ${enriched} leads enriched with Snov.io.`, "success");
    log("🤖 Agent idle.", "system");
    setAgentRunning(false);
  }, [agentRunning, agentConfig, settings, leads]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [agentLog]);

  // Filtered leads
  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [l.firstName, l.lastName, l.company, l.title, l.city, l.industry, ...l.needs, ...l.tags].some((s) => s.toLowerCase().includes(q));
    const matchIndustry = filterIndustry === "All" || l.industry === filterIndustry;
    const matchStatus = filterStatus === "All" || l.status === filterStatus;
    const matchCity = filterCity === "All" || l.city === filterCity;
    return matchSearch && matchIndustry && matchStatus && matchCity;
  });

  // Stats
  const wonCount  = leads.filter((l) => l.status === "Won").length;
  const lostCount = leads.filter((l) => l.status === "Lost").length;
  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === "New").length,
    qualified: leads.filter((l) => l.status === "Qualified").length,
    won: wonCount,
    lost: lostCount,
    avgScore: leads.length ? Math.round(leads.reduce((a, l) => a + l.score, 0) / leads.length) : 0,
    winRate: (wonCount + lostCount) > 0 ? Math.round(wonCount / (wonCount + lostCount) * 100) : null,
    byIndustry: INDUSTRIES.map((ind) => ({ name: ind, count: leads.filter((l) => l.industry === ind).length })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count),
    byStatus: LEAD_STATUSES.map((s) => ({ name: s, count: leads.filter((l) => l.status === s).length })),
    byCity: CITIES.map((c) => ({ name: c, count: leads.filter((l) => l.city === c).length })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 6),
    topNeeds: NEEDS.map((n) => ({ name: n, count: leads.filter((l) => l.needs.includes(n)).length })).sort((a, b) => b.count - a.count).slice(0, 6),
    // Score distribution
    hot:  leads.filter((l) => l.score >= 80).length,
    warm: leads.filter((l) => l.score >= 60 && l.score < 80).length,
    cold: leads.filter((l) => l.score < 60).length,
    // Hot leads (top 5 by score, not Won/Lost)
    hotLeads: [...leads].filter((l) => l.status !== "Won" && l.status !== "Lost").sort((a, b) => b.score - a.score).slice(0, 5),
    // Recent leads (last 5 added)
    recentLeads: [...leads].slice(0, 5),
    // Lead source breakdown
    bySource: ["XLS Import", "AI Agent", "Manual"].map((src) => ({ name: src, count: leads.filter((l) => l.source === src).length })),
    // Call stats
    totalCalls: leads.reduce((a, l) => a + (l.callHistory?.length || 0), 0),
    completedCalls: leads.reduce((a, l) => a + (l.callHistory?.filter((c) => c.status === "Completed").length || 0), 0),
    mostCalledLead: [...leads].sort((a, b) => (b.callHistory?.length || 0) - (a.callHistory?.length || 0))[0],
    // Funnel counts
    funnel: ["New","Contacted","Qualified","Proposal Sent","Negotiation","Won"].map((s) => ({
      name: s, count: leads.filter((l) => l.status === s).length,
    })),
  };

  const maxInd = Math.max(...stats.byIndustry.map((x) => x.count), 1);
  const maxCity = Math.max(...stats.byCity.map((x) => x.count), 1);
  const maxNeed = Math.max(...stats.topNeeds.map((x) => x.count), 1);
  const maxSource = Math.max(...stats.bySource.map((x) => x.count), 1);
  const funnelMax = Math.max(...stats.funnel.map((x) => x.count), 1);

  // Update lead
  const updateLead = (id, updates) => setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));

  // ─── STYLES ──────────────────────────────────────────────────
  const font = "'DM Sans', 'Segoe UI', sans-serif";
  const mono = "'JetBrains Mono', 'Fira Code', monospace";
  const colors = {
    bg: "#0B0F19", surface: "#131825", surfaceHover: "#1A2035",
    border: "#1E2A42", borderLight: "#2A3A5C",
    primary: "#3B82F6", primaryDark: "#2563EB", primaryLight: "#60A5FA",
    accent: "#F59E0B", accentLight: "#FBBF24",
    text: "#E2E8F0", textMuted: "#94A3B8", textDim: "#64748B",
    success: "#10B981", danger: "#EF4444", warning: "#F59E0B",
  };

  const isAdmin = authUser?.role === "admin";

  const [lang, setLang] = useState(() => localStorage.getItem("sns_lang") || "tr");
  useEffect(() => { localStorage.setItem("sns_lang", lang); }, [lang]);
  const t = (key, ...args) => {
    const dict = TRANSLATIONS[lang] ?? TRANSLATIONS.en;
    const val = dict[key] ?? TRANSLATIONS.en[key] ?? key;
    return typeof val === "function" ? val(...args) : val;
  };

  const sidebarItems = [
    { id: "dashboard", label: t("nav_dashboard"), icon: <BarChartIcon size={18} /> },
    { id: "leads", label: t("nav_leads"), icon: <UserIcon size={18} /> },
    { id: "pipeline", label: t("nav_pipeline"), icon: <BriefcaseIcon size={18} /> },
    { id: "calls", label: t("nav_coldCalls"), icon: <PhoneCallIcon size={18} />, badge: stats.totalCalls || null },
    { id: "email", label: t("nav_email"), icon: <MailIcon size={18} /> },
    { id: "monday", label: t("nav_monday"), icon: <GridIcon size={18} /> },
    { id: "contracts", label: t("nav_contracts"), icon: <FileTextIcon size={18} /> },
    ...(isAdmin ? [
      { id: "inbox", label: t("nav_inbox"), icon: <InboxIcon size={18} /> },
      { id: "agent", label: t("nav_agent"), icon: <BotIcon size={18} /> },
    ] : []),
    { id: "settings", label: t("nav_settings"), icon: <SettingsIcon size={18} /> },
  ];

  // ─── RENDER ──────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: font, background: colors.bg, color: colors.text, overflow: "hidden" }}>
      {/* SIDEBAR */}
      <div style={{ width: 220, background: colors.surface, borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px", borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
              <img src={snsLogo} alt="Sun&Sun Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Sun&Sun</div>
              <div style={{ fontSize: 10, color: colors.textMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>Lead Agent ERP</div>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setView(item.id); setSelectedLead(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: font, marginBottom: 2, transition: "all .15s",
                background: view === item.id ? `${colors.primary}18` : "transparent",
                color: view === item.id ? colors.primaryLight : colors.textMuted,
              }}
            >
              {item.icon}
              {item.label}
              {item.id === "agent" && agentRunning && (
                <span style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: colors.success, animation: "pulse 1s infinite" }} />
              )}
              {item.badge && item.id !== "agent" && (
                <span style={{ marginLeft: "auto", minWidth: 18, height: 18, borderRadius: 9, background: colors.primary, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{item.badge}</span>
              )}
            </button>
          ))}
        </nav>
        {/* User + Logout */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${colors.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: colors.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {authUser.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{authUser.name}</div>
              <div style={{ fontSize: 10, color: colors.textDim, textTransform: "capitalize" }}>{authUser.role}</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 8 }}>{t("nav_leadsInDb", leads.length)}</div>
          {/* Language toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["tr", "en"].map(l => (
              <button key={l} onClick={() => setLang(l)}
                style={{ flex: 1, padding: "5px 0", border: `1px solid ${lang === l ? colors.primary : colors.border}`, borderRadius: 5, background: lang === l ? `${colors.primary}22` : "transparent", color: lang === l ? colors.primaryLight : colors.textDim, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: font, textTransform: "uppercase", letterSpacing: 0.5, transition: "all .15s" }}>
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={handleLogout}
            style={{ width: "100%", padding: "7px 10px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textDim, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: font, textAlign: "left", transition: "all .15s" }}
            onMouseEnter={(e) => { e.target.style.borderColor = colors.danger; e.target.style.color = colors.danger; }}
            onMouseLeave={(e) => { e.target.style.borderColor = colors.border; e.target.style.color = colors.textDim; }}
          >
            ↩ {t("nav_logout")}
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          input, textarea, select { font-family: ${font}; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-track { background: ${colors.bg}; }
          ::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 3px; }
        `}</style>

        {/* ══════════ DASHBOARD ══════════ */}
        {view === "dashboard" && (
          <div style={{ animation: "slideIn .3s ease" }}>
            {/* Header + Quick Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("dash_title")}</h1>
                <p style={{ color: colors.textMuted, fontSize: 13 }}>{t("dash_subtitle")}</p>
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowAddModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>
                    <PlusIcon size={14} /> {t("dash_addLead")}
                  </button>
                  <button onClick={() => setShowImportModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>
                    {t("dash_importXls")}
                  </button>
                  <button onClick={() => setView("agent")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `linear-gradient(135deg, #7C3AED, #4F46E5)`, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>
                    <BotIcon size={14} /> {t("dash_runAgent")}
                  </button>
                </div>
              )}
            </div>

            {/* Row 1 — Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
              {[
                { label: t("dash_totalLeads"), value: stats.total, color: colors.primary, sub: t("dash_new", stats.new) },
                { label: t("dash_qualified"), value: stats.qualified, color: colors.success, sub: t("dash_pctOfPipeline", stats.total ? Math.round(stats.qualified / stats.total * 100) : 0) },
                { label: t("dash_wonDeals"), value: stats.won, color: colors.accent, sub: t("dash_closedSuccessfully") },
                { label: t("dash_avgScore"), value: stats.avgScore, color: colors.primaryLight, sub: t("dash_leadQuality") },
              ].map((s, i) => (
                <div key={i} style={{ background: colors.surface, borderRadius: 12, padding: "18px 20px", border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 11, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: colors.textDim }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Row 2 — Win rate + Score distribution + Call stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              {/* Win Rate */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <div style={{ fontSize: 11, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>{t("dash_winRate")}</div>
                {stats.winRate !== null ? (
                  <>
                    <div style={{ fontSize: 42, fontWeight: 800, color: stats.winRate >= 50 ? colors.success : colors.warning, lineHeight: 1 }}>{stats.winRate}%</div>
                    <div style={{ fontSize: 11, color: colors.textDim }}>{t("dash_wonLost", stats.won, stats.lost)}</div>
                    <div style={{ width: "100%", height: 6, background: colors.border, borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ width: `${stats.winRate}%`, height: "100%", background: stats.winRate >= 50 ? colors.success : colors.warning, borderRadius: 3, transition: "width .5s" }} />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: colors.textDim }}>{t("dash_noWonLost")}</div>
                )}
              </div>
              {/* Score Distribution */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{t("dash_scoreDist")}</div>
                {[
                  { label: t("dash_hot"), count: stats.hot, color: colors.success },
                  { label: t("dash_warm"), count: stats.warm, color: colors.accent },
                  { label: t("dash_cold"), count: stats.cold, color: colors.danger },
                ].map((band) => (
                  <div key={band.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: band.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: colors.textMuted, width: 80 }}>{band.label}</span>
                    <div style={{ flex: 1, height: 6, background: colors.border, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${stats.total ? (band.count / stats.total) * 100 : 0}%`, height: "100%", background: band.color, borderRadius: 3, transition: "width .5s" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, width: 24, textAlign: "right" }}>{band.count}</span>
                  </div>
                ))}
              </div>
              {/* Call Stats */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{t("dash_callActivity")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: t("dash_totalCalls"), value: stats.totalCalls, color: colors.primaryLight },
                    { label: t("dash_completed"), value: stats.completedCalls, color: colors.success },
                    { label: t("dash_failedOther"), value: stats.totalCalls - stats.completedCalls, color: colors.danger },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${colors.border}` }}>
                      <span style={{ fontSize: 12, color: colors.textMuted }}>{row.label}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                  {stats.mostCalledLead && stats.totalCalls > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{t("dash_mostCalled")}</div>
                      <div
                        onClick={() => { setSelectedLead(stats.mostCalledLead); setView("leads"); }}
                        style={{ fontSize: 12, color: colors.primaryLight, cursor: "pointer", fontWeight: 500 }}
                      >
                        {stats.mostCalledLead.firstName} {stats.mostCalledLead.lastName} ({t("dash_nCalls", stats.mostCalledLead.callHistory?.length || 0)})
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3 — Conversion Funnel */}
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{t("dash_funnel")}</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
                {stats.funnel.map((stage, i) => {
                  const pct = funnelMax ? (stage.count / funnelMax) * 100 : 0;
                  const opacity = 1 - i * 0.1;
                  return (
                    <div key={stage.name} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: colors.text }}>{stage.count}</div>
                      <div style={{ width: "100%", height: `${Math.max(pct, 4)}%`, minHeight: 4, background: `rgba(59,130,246,${opacity})`, borderRadius: "4px 4px 0 0", transition: "height .5s" }} />
                      <div style={{ fontSize: 9, color: colors.textDim, textAlign: "center", lineHeight: 1.2 }}>{stage.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Row 4 — Pipeline + Top Needs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{t("dash_pipelineBreakdown")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stats.byStatus.filter(s => s.count > 0).map((s) => (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[s.name]?.dot || "#666", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: colors.textMuted, width: 100 }}>{s.name}</span>
                      <div style={{ flex: 1, height: 6, background: colors.border, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${(s.count / stats.total) * 100}%`, height: "100%", background: STATUS_COLORS[s.name]?.dot || "#666", borderRadius: 3, transition: "width .5s" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: colors.text, width: 24, textAlign: "right" }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{t("dash_topNeeds")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stats.topNeeds.map((n) => (
                    <div key={n.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: colors.textMuted, width: 160, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name}</span>
                      <div style={{ flex: 1, height: 6, background: colors.border, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${(n.count / maxNeed) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent})`, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, width: 24, textAlign: "right" }}>{n.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 5 — Industry + City + Source */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{t("dash_byIndustry")}</div>
                {stats.byIndustry.slice(0, 6).map((ind) => (
                  <div key={ind.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: colors.textMuted, width: 110, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ind.name}</span>
                    <div style={{ flex: 1, height: 6, background: colors.border, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${(ind.count / maxInd) * 100}%`, height: "100%", background: colors.primaryLight, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, width: 20, textAlign: "right" }}>{ind.count}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{t("dash_byCity")}</div>
                {stats.byCity.map((c) => (
                  <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: colors.textMuted, width: 70, flexShrink: 0 }}>{c.name}</span>
                    <div style={{ flex: 1, height: 6, background: colors.border, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${(c.count / maxCity) * 100}%`, height: "100%", background: colors.accent, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, width: 20, textAlign: "right" }}>{c.count}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{t("dash_leadSource")}</div>
                {stats.bySource.map((src) => (
                  <div key={src.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: colors.textMuted, width: 80, flexShrink: 0 }}>{src.name}</span>
                    <div style={{ flex: 1, height: 6, background: colors.border, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${(src.count / maxSource) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${colors.accent}, ${colors.primaryLight})`, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, width: 24, textAlign: "right" }}>{src.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 6 — Hot Leads + Recent Leads */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Hot Leads */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  🔥 {t("dash_hotLeads")}
                  <span style={{ fontSize: 10, color: colors.textDim, fontWeight: 400 }}>{t("dash_hotLeadsSub")}</span>
                </div>
                {stats.hotLeads.length === 0 ? (
                  <div style={{ fontSize: 12, color: colors.textDim }}>{t("dash_noHotLeads")}</div>
                ) : stats.hotLeads.map((lead) => (
                  <div key={lead.id} onClick={() => { setSelectedLead(lead); setView("leads"); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${colors.border}`, cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "0.75"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${colors.primary}40, ${colors.accent}40)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {lead.firstName[0]}{lead.lastName[0]}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.firstName} {lead.lastName}</div>
                      <div style={{ fontSize: 11, color: colors.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.title} · {lead.company}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: colors.success }}>{lead.score}</div>
                      <div style={{ fontSize: 9, color: colors.textDim }}>{t("dash_score")}</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Recent Leads */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  🕐 {t("dash_recentlyAdded")}
                </div>
                {stats.recentLeads.length === 0 ? (
                  <div style={{ fontSize: 12, color: colors.textDim }}>{t("dash_noLeads")}</div>
                ) : stats.recentLeads.map((lead) => (
                  <div key={lead.id} onClick={() => { setSelectedLead(lead); setView("leads"); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${colors.border}`, cursor: "pointer" }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = "0.75"}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${colors.primary}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {lead.firstName[0]}{lead.lastName[0]}
                    </div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.firstName} {lead.lastName}</div>
                      <div style={{ fontSize: 11, color: colors.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lead.company} · {lead.industry}</div>
                    </div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: STATUS_COLORS[lead.status]?.bg || colors.border, color: STATUS_COLORS[lead.status]?.text || colors.textDim, fontWeight: 600, flexShrink: 0 }}>
                      {lead.status || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 7 — Monday.com Board Summary */}
            {settings.mondayApiKey && settings.mondayBoardId && (() => {
              const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
              const emailCol  = mondayColumns.find(c => c.type === "email" || /e[\s-]?posta|e-?mail/i.test(c.title));
              const phoneCol  = mondayColumns.find(c => c.type === "phone" || /\btelefon\b|phone|tel\b|gsm\b|cep\b/i.test(c.title));
              const withEmail = mondayItems.filter(i => { const cv = emailCol && i.column_values.find(v => v.id === emailCol.id); return cv && isValidEmail(cv.text || ""); }).length;
              const withPhone = mondayItems.filter(i => { const cv = phoneCol && i.column_values.find(v => v.id === phoneCol.id); return cv && (cv.text || "").trim(); }).length;
              const withBoth  = mondayItems.filter(i => {
                const ecv = emailCol && i.column_values.find(v => v.id === emailCol.id);
                const pcv = phoneCol && i.column_values.find(v => v.id === phoneCol.id);
                return ecv && isValidEmail(ecv.text || "") && pcv && (pcv.text || "").trim();
              }).length;

              return (
                <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                      Monday.com {mondayBoardName ? `— ${mondayBoardName}` : ""}
                      {mondayItems.length > 0 && (
                        <button onClick={() => mondayMergedCount > 0 ? setMondayMergeModal(true) : runDedup()}
                          style={{ fontSize: 10, fontWeight: 600, borderRadius: 10, padding: "2px 7px", cursor: "pointer",
                            background: mondayMergedCount > 0 ? "#fff3cd" : "transparent",
                            color: mondayMergedCount > 0 ? "#856404" : colors.textMuted,
                            border: `1px solid ${mondayMergedCount > 0 ? "#ffc107" : colors.border}` }}>
                          {mondayMergedCount > 0 ? `${mondayMergedCount} duplicate${mondayMergedCount !== 1 ? "s" : ""} merged ↗` : "Find Duplicates"}
                        </button>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {mondayLoading && <span style={{ fontSize: 11, color: colors.textMuted }}>Fetching…</span>}
                      <button onClick={() => { setView("monday"); }}
                        style={{ fontSize: 11, fontWeight: 600, color: colors.primaryLight, background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                        → Open Board
                      </button>
                      <button onClick={fetchMondayBoard} disabled={mondayLoading}
                        style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: colors.primary, border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", opacity: mondayLoading ? 0.6 : 1 }}>
                        ↻ Refresh
                      </button>
                    </div>
                  </div>
                  {mondayItems.length === 0 && !mondayLoading ? (
                    <div style={{ fontSize: 12, color: colors.textMuted, textAlign: "center", padding: "12px 0" }}>No board data yet — fetching…</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                      {[
                        { label: "Total Contacts", value: mondayItems.length, color: colors.primary },
                        { label: emailCol ? `With Email (${mondayColTitle(emailCol, lang)})` : "With Email", value: withEmail, color: colors.success },
                        { label: phoneCol ? `With Phone (${mondayColTitle(phoneCol, lang)})` : "With Phone", value: withPhone, color: colors.accent },
                        { label: "Email + Phone", value: withBoth, color: colors.primaryLight },
                      ].map((s, i) => (
                        <div key={i} style={{ background: colors.bg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${colors.border}` }}>
                          <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</div>
                          <div style={{ fontSize: 26, fontWeight: 700, color: s.color, marginBottom: 4 }}>{mondayLoading ? "…" : s.value}</div>
                          <div style={{ height: 4, background: colors.border, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${mondayItems.length ? (s.value / mondayItems.length) * 100 : 0}%`, height: "100%", background: s.color, borderRadius: 2, transition: "width .5s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ══════════ LEADS TABLE ══════════ */}
        {view === "leads" && !selectedLead && (
          <div style={{ animation: "slideIn .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("leads_title")}</h1>
                <p style={{ color: colors.textMuted, fontSize: 13 }}>{t("leads_shown", filtered.length, leads.length)}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {isAdmin && (
                  <button onClick={() => setShowImportModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: colors.surface, color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>
                    {t("leads_importXls")}
                  </button>
                )}
                <button onClick={() => setShowAddModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: colors.primary, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>
                  <PlusIcon size={16} /> {t("leads_addLead")}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("leads_searchPlaceholder")}
                  style={{ width: "100%", padding: "8px 12px 8px 32px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", position: "relative" }}
                />
                <span style={{ position: "absolute", left: 10, top: 10 }}><SearchIcon size={14} color={colors.textDim} /></span>
              </div>
              {[
                { label: t("leads_filterIndustry"), value: filterIndustry, set: setFilterIndustry, options: ["All", ...INDUSTRIES] },
                { label: t("leads_filterStatus"), value: filterStatus, set: setFilterStatus, options: ["All", ...LEAD_STATUSES] },
                { label: t("leads_filterCity"), value: filterCity, set: setFilterCity, options: ["All", ...CITIES] },
              ].map((f) => (
                <select key={f.label} value={f.value} onChange={(e) => f.set(e.target.value)}
                  style={{ padding: "8px 12px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none", cursor: "pointer" }}>
                  {f.options.map((o) => <option key={o} value={o}>{f.label}: {o}</option>)}
                </select>
              ))}
            </div>

            {/* Table */}
            <div style={{ background: colors.surface, borderRadius: 12, border: `1px solid ${colors.border}`, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: colors.surfaceHover }}>
                    {[t("leads_colHash"), t("leads_colName"), t("leads_colCompany"), t("leads_colTitle"), t("leads_colIndustry"), t("leads_colCity"), t("leads_colScore"), t("leads_colStatus"), t("leads_colNeeds"), t("leads_colContact")].map((h) => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: colors.textMuted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `1px solid ${colors.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 50).map((lead, i) => (
                    <tr key={lead.id} onClick={() => setSelectedLead(lead)} style={{ cursor: "pointer", borderBottom: `1px solid ${colors.border}`, transition: "background .15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "10px 12px", color: colors.textDim, fontFamily: mono, fontSize: 11 }}>{i + 1}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{lead.firstName} {lead.lastName}</td>
                      <td style={{ padding: "10px 12px", color: colors.textMuted }}>{lead.company}</td>
                      <td style={{ padding: "10px 12px", color: colors.textMuted }}>{lead.title}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: `${colors.primary}18`, color: colors.primaryLight }}>{lead.industry}</span>
                      </td>
                      <td style={{ padding: "10px 12px", color: colors.textMuted }}>{lead.city}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontWeight: 700, color: lead.score >= 80 ? colors.success : lead.score >= 60 ? colors.accent : colors.danger }}>{lead.score}</span>
                      </td>
                      <td style={{ padding: "6px 12px" }} onClick={(e) => e.stopPropagation()}>
                        <select
                          value={lead.status}
                          onChange={(e) => updateLead(lead.id, { status: e.target.value })}
                          style={{
                            padding: "4px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", outline: "none", border: `1px solid ${colors.borderLight}`,
                            background: STATUS_COLORS[lead.status]?.bg || colors.surface,
                            color: STATUS_COLORS[lead.status]?.text || colors.textDim,
                          }}
                        >
                          <option value="">{t("leads_select")}</option>
                          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "10px 12px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: colors.textDim, fontSize: 11 }}>
                        {lead.needs.join(", ")}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 11, minWidth: 180 }}>
                        {lead.email || lead.phone || lead.linkedinUrl ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {lead.email && <span style={{ color: colors.primaryLight }}>{lead.email}</span>}
                            {lead.phone && <span style={{ color: colors.textMuted }}>{lead.phone}</span>}
                            {!lead.email && !lead.phone && lead.linkedinUrl && (
                              <span style={{ color: colors.textMuted }}>{lead.linkedinUrl}</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: colors.textDim, fontFamily: mono }}>null</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════ LEAD DETAIL ══════════ */}
        {view === "leads" && selectedLead && (
          <div style={{ animation: "slideIn .3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <button onClick={() => setSelectedLead(null)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textMuted, cursor: "pointer", fontSize: 12, fontFamily: font }}>
                {t("detail_back")}
              </button>
              <button
                onClick={() => settings.twilioAccountSid ? initiateTwilioCall(selectedLead) : initiateCall(selectedLead)}
                disabled={!selectedLead.phone}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: selectedLead.phone ? colors.success : colors.border, border: "none", borderRadius: 8, color: selectedLead.phone ? "#fff" : colors.textDim, cursor: selectedLead.phone ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: font, transition: "all .15s" }}
              >
                <PhoneCallIcon size={14} /> {t("detail_coldCall", settings.twilioAccountSid ? "Twilio" : "Vapi")}
              </button>
              {isAdmin && (
                <button
                  onClick={() => { if (window.confirm(t("detail_deleteConfirm", `${selectedLead.firstName} ${selectedLead.lastName}`))) { setLeads((prev) => prev.filter((l) => l.id !== selectedLead.id)); setSelectedLead(null); } }}
                  style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "transparent", border: `1px solid ${colors.danger}60`, borderRadius: 8, color: colors.danger, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font, transition: "all .15s" }}
                >
                  {t("detail_deleteLead")}
                </button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Left: Info */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: `linear-gradient(135deg, ${colors.primary}40, ${colors.accent}40)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700 }}>
                    {selectedLead.firstName[0]}{selectedLead.lastName[0]}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>{selectedLead.firstName} {selectedLead.lastName}</h2>
                    <p style={{ color: colors.textMuted, fontSize: 13 }}>{selectedLead.title} at {selectedLead.company}</p>
                  </div>
                </div>
                {[
                  { icon: <MailIcon size={14} />, label: t("detail_email"), value: selectedLead.email },
                  { icon: <PhoneIcon size={14} />, label: t("detail_phone"), value: selectedLead.phone },
                  { icon: <LinkedInIcon size={14} />, label: t("detail_linkedin"), value: selectedLead.linkedinUrl },
                  { icon: <BriefcaseIcon size={14} />, label: t("detail_industry"), value: selectedLead.industry },
                  { icon: <UserIcon size={14} />, label: t("detail_companySize"), value: selectedLead.companySize + " " + t("detail_employees") },
                  { icon: <FilterIcon size={14} />, label: t("detail_source"), value: selectedLead.source },
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{ color: colors.textDim }}>{f.icon}</span>
                    <span style={{ fontSize: 12, color: colors.textMuted, width: 90 }}>{f.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{f.value}</span>
                  </div>
                ))}
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>{t("detail_tags")}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {selectedLead.tags.map((t) => (
                      <span key={t} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, background: `${colors.accent}20`, color: colors.accentLight }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Right: Needs + Status + Notes */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{t("detail_clientNeeds")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedLead.needs.map((n) => (
                      <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: `${colors.success}12`, borderRadius: 6, fontSize: 12, color: colors.success }}>
                        <span>✓</span> {n}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{t("detail_statusScore")}</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                    <select value={selectedLead.status} onChange={(e) => { updateLead(selectedLead.id, { status: e.target.value }); setSelectedLead((p) => ({ ...p, status: e.target.value })); }}
                      style={{ padding: "6px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none" }}>
                      <option value="">{t("leads_select")}</option>
                      {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span style={{ fontSize: 24, fontWeight: 700, color: selectedLead.score >= 80 ? colors.success : colors.accent }}>{selectedLead.score}</span>
                    <span style={{ fontSize: 11, color: colors.textDim }}>{t("detail_leadScore")}</span>
                  </div>
                  <div style={{ fontSize: 11, color: colors.textDim }}>{t("detail_added")} {selectedLead.dateAdded} · {t("detail_lastContact")} {selectedLead.lastContact ?? t("detail_never")}</div>
                </div>
                <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{t("detail_notes")}</div>
                  <textarea
                    value={selectedLead.notes} placeholder={t("detail_notesPlaceholder")}
                    onChange={(e) => { updateLead(selectedLead.id, { notes: e.target.value }); setSelectedLead((p) => ({ ...p, notes: e.target.value })); }}
                    style={{ width: "100%", minHeight: 100, padding: 12, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none", resize: "vertical", fontFamily: font }}
                  />
                </div>
                {/* Call History */}
                {selectedLead.callHistory?.length > 0 && (
                  <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <PhoneCallIcon size={14} color={colors.success} /> {t("detail_callHistory")}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {selectedLead.callHistory.map((c, i) => (
                        <div key={i} style={{ padding: 12, background: colors.bg, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{c.date} {c.time}</span>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: colors.textDim }}>{c.duration}</span>
                              <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: c.status === "Completed" ? `${colors.success}20` : `${colors.warning}20`, color: c.status === "Completed" ? colors.success : colors.warning }}>{c.status}</span>
                            </div>
                          </div>
                          {c.transcript && (
                            <details style={{ marginTop: 4 }}>
                              <summary style={{ fontSize: 11, color: colors.textMuted, cursor: "pointer" }}>{t("detail_viewTranscript")}</summary>
                              <p style={{ fontSize: 11, color: colors.textDim, marginTop: 6, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{c.transcript}</p>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ COLD CALLS ══════════ */}
        {view === "calls" && (
          <div style={{ animation: "slideIn .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("calls_title")}</h1>
                <p style={{ color: colors.textMuted, fontSize: 13 }}>{t("calls_subtitle")}</p>
              </div>
              {!settings.twilioAccountSid && !settings.vapiApiKey && (
                <div style={{ padding: "10px 16px", background: `${colors.warning}15`, border: `1px solid ${colors.warning}40`, borderRadius: 10, fontSize: 12, color: colors.warning, maxWidth: 340 }}>
                  {isAdmin ? (
                    <>{t("calls_setupAdmin")} <button onClick={() => setView("settings")} style={{ background: "none", border: "none", color: colors.accent, cursor: "pointer", fontWeight: 600, padding: 0, fontSize: 12 }}>{t("nav_settings")}</button></>
                  ) : (
                    <>{t("calls_setupUser")}</>
                  )}
                </div>
              )}
              {settings.twilioAccountSid && (
                <div style={{ padding: "6px 12px", background: `${colors.success}15`, border: `1px solid ${colors.success}40`, borderRadius: 8, fontSize: 11, color: colors.success }}>
                  {t("calls_twilioConnected")}
                </div>
              )}
            </div>

            {/* Stats row */}
            {(() => {
              const allCalls = leads.flatMap((l) => (l.callHistory || []).map((c) => ({ ...c, lead: l })));
              const completed = allCalls.filter((c) => c.status === "Completed").length;
              const noAnswer = allCalls.filter((c) => c.status === "No Answer").length;
              const voicemail = allCalls.filter((c) => c.status === "Voicemail").length;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
                  {[
                    { label: t("calls_totalCalls"), value: allCalls.length, color: colors.primary },
                    { label: t("calls_completed"), value: completed, color: colors.success },
                    { label: t("calls_noAnswer"), value: noAnswer, color: colors.warning },
                    { label: t("calls_voicemail"), value: voicemail, color: colors.textMuted },
                  ].map((s) => (
                    <div key={s.label} style={{ background: colors.surface, borderRadius: 12, padding: "16px 20px", border: `1px solid ${colors.border}` }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Leads eligible for calling */}
            <div style={{ background: colors.surface, borderRadius: 12, border: `1px solid ${colors.border}`, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${colors.border}`, fontSize: 13, fontWeight: 600 }}>
                {t("calls_leadsWithPhone", leads.filter((l) => l.phone).length)}
              </div>
              <div style={{ overflowY: "auto", maxHeight: 480 }}>
                {leads.filter((l) => l.phone).length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: colors.textDim, fontSize: 13 }}>{t("calls_noLeadsWithPhone")}</div>
                ) : (
                  leads.filter((l) => l.phone).map((lead) => (
                    <div key={lead.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: `1px solid ${colors.border}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${colors.primary}40, ${colors.accent}40)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                        {lead.firstName[0]}{lead.lastName[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{lead.firstName} {lead.lastName}</div>
                        <div style={{ fontSize: 11, color: colors.textMuted }}>{lead.title} · {lead.company}</div>
                      </div>
                      <div style={{ fontSize: 12, color: colors.textDim, fontFamily: mono }}>{lead.phone}</div>
                      <div style={{ fontSize: 11, color: colors.textMuted, width: 80, textAlign: "center" }}>
                        {lead.callHistory?.length ? t("calls_nCalls", lead.callHistory.length) : t("calls_notCalled")}
                      </div>
                      {lead.callHistory?.length > 0 && (
                        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: lead.callHistory[0].status === "Completed" ? `${colors.success}20` : `${colors.warning}20`, color: lead.callHistory[0].status === "Completed" ? colors.success : colors.warning }}>
                          {lead.callHistory[0].status}
                        </span>
                      )}
                      <button
                        onClick={() => settings.twilioAccountSid ? initiateTwilioCall(lead) : initiateCall(lead)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: colors.success, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font, flexShrink: 0 }}
                      >
                        <PhoneCallIcon size={13} /> {t("calls_call")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ PIPELINE ══════════ */}
        {view === "pipeline" && (
          <div style={{ animation: "slideIn .3s ease" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("pipeline_title")}</h1>
            <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>{t("pipeline_subtitle")}</p>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16 }}>
              {LEAD_STATUSES.map((status) => {
                const sLeads = leads.filter((l) => l.status === status);
                const sc = STATUS_COLORS[status];
                return (
                  <div key={status} style={{ minWidth: 220, maxWidth: 220, flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "0 4px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{status}</span>
                      <span style={{ fontSize: 11, color: colors.textDim, marginLeft: "auto" }}>{sLeads.length}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {sLeads.slice(0, 8).map((lead) => (
                        <div key={lead.id} onClick={() => { setSelectedLead(lead); setView("leads"); }}
                          style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, cursor: "pointer", transition: "all .15s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = sc.dot)}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = colors.border)}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{lead.firstName} {lead.lastName}</div>
                          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6 }}>{lead.title}</div>
                          <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 6 }}>{lead.company}</div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {lead.needs.slice(0, 2).map((n) => (
                              <span key={n} style={{ padding: "1px 6px", borderRadius: 4, fontSize: 9, background: `${colors.primary}15`, color: colors.primaryLight }}>{n}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                      {sLeads.length > 8 && <div style={{ fontSize: 11, color: colors.textDim, textAlign: "center", padding: 8 }}>{t("pipeline_more", sLeads.length - 8)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════ AI AGENT ══════════ */}
        {view === "inbox" && (() => {
          const token = localStorage.getItem("sns_token");

          const classify = async () => {
            if (!inboxText.trim()) return;
            setInboxLoading(true); setInboxResult(null);
            try {
              const r = await fetch("/ml/classify", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: inboxText }) });
              setInboxResult(await r.json());
            } catch { setInboxResult({ error: "ML service offline. Start it with: cd ml_service && python app.py" }); }
            setInboxLoading(false);
          };

          const labelEmail = async (label) => {
            if (!inboxText.trim()) return;
            setInboxLabeling(true);
            await fetch("/ml/label", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ text: inboxText, label }) });
            await fetchMlStatus();
            setInboxLabeling(false);
            setInboxText(""); setInboxResult(null);
            alert(t("inbox_labeled", label));
          };

          const retrain = async () => {
            setMlTraining(true); setMlTrainResult(null);
            const r = await fetch("/ml/train", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
            const data = await r.json();
            setMlTrainResult(data);
            if (data.success) await fetchMlStatus();
            setMlTraining(false);
          };

          const confidencePct = inboxResult?.confidence ? Math.round(inboxResult.confidence * 100) : null;
          const isPositive = inboxResult?.label === "positive";

          return (
            <div style={{ padding: "28px 32px", maxWidth: 860 }}>
              <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("inbox_title")}</h1>
                <p style={{ color: colors.textMuted, fontSize: 13 }}>{t("inbox_subtitle")}</p>
              </div>

              {/* Model status banner */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 18, border: `1px solid ${colors.border}`, marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: mlStatus ? (mlStatus.model_type === "fine-tuned" ? "#43a047" : "#f9a825") : "#888", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {mlStatus ? (mlStatus.model_type === "fine-tuned" ? "Fine-tuned BERTurk" : "Zero-shot XLM-RoBERTa") : t("inbox_offline")}
                    </div>
                    {mlStatus && (
                      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                        {mlStatus.positive_total} positive · {mlStatus.negative_total} negative · {mlStatus.total_labeled} labeled via ERP
                      </div>
                    )}
                  </div>
                </div>
                {mlStatus && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {mlStatus.can_train ? (
                      <button onClick={retrain} disabled={mlTraining}
                        style={{ padding: "7px 16px", background: colors.primary, border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 600, cursor: mlTraining ? "not-allowed" : "pointer", fontFamily: font, opacity: mlTraining ? 0.7 : 1 }}>
                        {mlTraining ? t("inbox_training") : t("inbox_retrain")}
                      </button>
                    ) : (
                      <div style={{ fontSize: 11, color: colors.textDim }}>
                        {t("inbox_needMore", Math.max(0, 10 - mlStatus.positive_total), Math.max(0, 10 - mlStatus.negative_total))}
                      </div>
                    )}
                    <button onClick={fetchMlStatus} style={{ padding: "7px 12px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 7, color: colors.textMuted, fontSize: 12, cursor: "pointer", fontFamily: font }}>↻</button>
                  </div>
                )}
              </div>

              {mlTrainResult && (
                <div style={{ borderRadius: 8, padding: "12px 16px", marginBottom: 20, background: mlTrainResult.success ? "rgba(67,160,71,0.1)" : "rgba(220,53,69,0.1)", border: `1px solid ${mlTrainResult.success ? "rgba(67,160,71,0.3)" : "rgba(220,53,69,0.3)"}`, fontSize: 13 }}>
                  {mlTrainResult.success ? `✓ Model retrained on ${mlTrainResult.samples} samples (${mlTrainResult.positive} positive, ${mlTrainResult.negative} negative). Reload page to use the updated model.` : `✗ ${mlTrainResult.error}`}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
                {/* Paste & classify */}
                <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{t("inbox_pasteLabel")}</div>
                  <textarea
                    value={inboxText}
                    onChange={(e) => { setInboxText(e.target.value); setInboxResult(null); }}
                    placeholder={t("inbox_emailPlaceholder")}
                    rows={14}
                    style={{ width: "100%", padding: "10px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }}
                  />

                  {/* Result */}
                  {inboxResult && !inboxResult.error && (
                    <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 8, background: isPositive ? "rgba(46,125,50,0.1)" : "rgba(198,40,40,0.1)", border: `1px solid ${isPositive ? "rgba(46,125,50,0.3)" : "rgba(198,40,40,0.3)"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: isPositive ? "#66bb6a" : "#ef5350" }}>
                          {isPositive ? t("inbox_positive") : t("inbox_negative")}
                        </div>
                        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 3 }}>
                          {t("inbox_confidence")} {confidencePct}% · {t("inbox_modelLabel")} {inboxResult.model_type}
                        </div>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: isPositive ? "#66bb6a" : "#ef5350" }}>{confidencePct}%</div>
                    </div>
                  )}
                  {inboxResult?.error && (
                    <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: 8, background: "rgba(220,53,69,0.08)", border: "1px solid rgba(220,53,69,0.25)", fontSize: 12, color: "#e57373" }}>
                      ✗ {inboxResult.error}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <button onClick={classify} disabled={inboxLoading || !inboxText.trim()}
                      style={{ flex: 1, padding: "10px", background: inboxLoading || !inboxText.trim() ? colors.border : colors.primary, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: inboxLoading || !inboxText.trim() ? "not-allowed" : "pointer", fontFamily: font }}>
                      {inboxLoading ? t("inbox_classifying") : t("inbox_classify")}
                    </button>
                  </div>
                </div>

                {/* Label panel */}
                <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t("inbox_labelTrain")}</h3>
                  <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 20, lineHeight: 1.6 }}>
                    {t("inbox_labelDesc")}
                  </p>

                  <button onClick={() => labelEmail("positive")} disabled={inboxLabeling || !inboxText.trim()}
                    style={{ width: "100%", marginBottom: 10, padding: "11px", background: "rgba(46,125,50,0.12)", border: "1px solid rgba(46,125,50,0.4)", borderRadius: 8, color: "#66bb6a", fontSize: 13, fontWeight: 600, cursor: inboxLabeling || !inboxText.trim() ? "not-allowed" : "pointer", fontFamily: font }}>
                    {t("inbox_savePositive")}
                  </button>
                  <button onClick={() => labelEmail("negative")} disabled={inboxLabeling || !inboxText.trim()}
                    style={{ width: "100%", padding: "11px", background: "rgba(198,40,40,0.1)", border: "1px solid rgba(198,40,40,0.3)", borderRadius: 8, color: "#ef5350", fontSize: 13, fontWeight: 600, cursor: inboxLabeling || !inboxText.trim() ? "not-allowed" : "pointer", fontFamily: font }}>
                    {t("inbox_saveNegative")}
                  </button>

                  <div style={{ marginTop: 24, padding: 14, background: colors.bg, borderRadius: 8, fontSize: 11, color: colors.textDim, lineHeight: 1.7 }}>
                    <strong style={{ color: colors.textMuted }}>{t("inbox_trainingFolders")}</strong><br />
                    You can also drop <code>.txt</code> files directly into:<br />
                    <code style={{ color: colors.primaryLight }}>ml_service/data/positive/</code><br />
                    <code style={{ color: "#ef5350" }}>ml_service/data/negative/</code>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {view === "agent" && !isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12 }}>
            <div style={{ fontSize: 36 }}>🔒</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{t("agent_adminRequired")}</div>
            <div style={{ fontSize: 13, color: colors.textMuted }}>{t("agent_adminDesc")}</div>
          </div>
        )}
        {view === "agent" && isAdmin && (
          <div style={{ animation: "slideIn .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("agent_title")}</h1>
                <p style={{ color: colors.textMuted, fontSize: 13 }}>{t("agent_subtitle")}</p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={runSnovAgent} disabled={agentRunning}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", border: "none", borderRadius: 10, cursor: agentRunning ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, fontFamily: font, transition: "all .2s", background: agentRunning ? colors.surfaceHover : `linear-gradient(135deg, #7C3AED, #4F46E5)`, color: agentRunning ? colors.textDim : "#fff", boxShadow: agentRunning ? "none" : "0 4px 15px #7C3AED50" }}>
                  {agentRunning ? <><RefreshIcon size={16} /> {t("agent_running")}</> : <><BotIcon size={16} /> {t("agent_runSnov")}</>}
                </button>
                <button onClick={runAgent} disabled={agentRunning}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", border: "none", borderRadius: 10, cursor: agentRunning ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, fontFamily: font, transition: "all .2s", background: agentRunning ? colors.surfaceHover : `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, color: agentRunning ? colors.textDim : "#fff", boxShadow: agentRunning ? "none" : `0 4px 15px ${colors.primary}50` }}>
                  {agentRunning ? <><RefreshIcon size={16} /> {t("agent_running")}</> : <><BotIcon size={16} /> {t("agent_runLusha")}</>}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Config Panel */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{t("agent_config")}</h3>
                {[
                  { key: "titles", label: t("agent_jobTitles"), placeholder: "CEO, Founder, Export Manager..." },
                  { key: "industries", label: t("agent_industries"), placeholder: "Manufacturing, Software..." },
                  { key: "cities", label: t("agent_cities"), placeholder: "İstanbul, Ankara, İzmir..." },
                  { key: "companySize", label: t("agent_companySize"), placeholder: "11-50, 51-200..." },
                ].map((field) => (
                  <div key={field.key} style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{field.label}</label>
                    <input
                      value={agentConfig[field.key]}
                      onChange={(e) => setAgentConfig((p) => ({ ...p, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none" }}
                    />
                  </div>
                ))}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("agent_maxLeads")}</label>
                  <input
                    type="number" value={agentConfig.maxLeads}
                    onChange={(e) => setAgentConfig((p) => ({ ...p, maxLeads: Math.max(1, parseInt(e.target.value) || 1) }))}
                    style={{ width: 100, padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none" }}
                  />
                </div>
                <div style={{ marginTop: 16, padding: 12, background: `${colors.warning}10`, borderRadius: 8, border: `1px solid ${colors.warning}30` }}>
                  <div style={{ fontSize: 11, color: colors.warning, fontWeight: 600, marginBottom: 4 }}>{t("agent_notice")}</div>
                  <div style={{ fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
                    {t("agent_noticeDesc")}
                  </div>
                </div>
              </div>

              {/* Agent Log */}
              <div style={{ background: colors.surface, borderRadius: 12, border: `1px solid ${colors.border}`, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>{t("agent_log")}</h3>
                  {agentRunning && <span style={{ fontSize: 11, color: colors.success, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.success, animation: "pulse 1s infinite" }} /> {t("agent_live")}</span>}
                </div>
                <div ref={logRef} style={{ flex: 1, padding: 16, overflowY: "auto", maxHeight: 420, fontFamily: mono, fontSize: 11, lineHeight: 1.8 }}>
                  {agentLog.length === 0 && (
                    <div style={{ color: colors.textDim, textAlign: "center", paddingTop: 60 }}>
                      <BotIcon size={40} color={colors.textDim} />
                      <p style={{ marginTop: 12 }}>{t("agent_idle")}</p>
                    </div>
                  )}
                  {agentLog.map((log, i) => (
                    <div key={i} style={{ marginBottom: 4, color: log.type === "success" ? colors.success : log.type === "lead" ? colors.primaryLight : log.type === "search" ? colors.accent : log.type === "filter" ? "#A78BFA" : colors.textMuted }}>
                      <span style={{ color: colors.textDim }}>[{log.time}]</span> {log.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ SETTINGS ══════════ */}
        {/* ══════════ EMAIL CAMPAIGNS ══════════ */}
        {view === "email" && (() => {
          // Compute recipients based on filter
          const emailRecipients = leads.filter((l) => {
            if (emailFilter.hasEmail && !l.email) return false;
            if (emailFilter.statuses.length > 0 && !emailFilter.statuses.includes(l.status)) return false;
            if (emailFilter.industries.length > 0 && !emailFilter.industries.includes(l.industry)) return false;
            return true;
          });

          const sendCampaign = async () => {
            if (!settings.sendgridApiKey) { alert("Add your SendGrid API key in Settings → SendGrid Configuration first."); return; }
            if (!emailDraft.subject.trim()) { alert("Subject is required."); return; }
            if (!emailDraft.body.trim()) { alert("Email body is required."); return; }
            if (emailRecipients.length === 0) { alert("No recipients match the current filter."); return; }
            if (!window.confirm(`Send to ${emailRecipients.length} recipient(s)?`)) return;

            setEmailSending(true);
            setEmailResult(null);
            const token = localStorage.getItem("sns_token");
            try {
              const res = await fetch("/email/send", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  apiKey: settings.sendgridApiKey,
                  fromEmail: authUser.email,
                  fromName: authUser.name || settings.sendgridFromName,
                  subject: emailDraft.subject,
                  htmlBody: emailDraft.body.replace(/\n/g, "<br>"),
                  recipients: emailRecipients.map((l) => ({ email: l.email, name: `${l.firstName} ${l.lastName}`.trim() })),
                  signatureKey: selectedSignature,
                }),
              });
              const data = await res.json();
              setEmailResult(data);
              if (data.sent > 0) {
                const campaign = {
                  id: Date.now(),
                  date: new Date().toISOString(),
                  subject: emailDraft.subject,
                  recipients: emailRecipients.length,
                  sent: data.sent,
                  failed: data.failed,
                };
                setEmailCampaigns((p) => [campaign, ...p]);
              }
            } catch (e) {
              setEmailResult({ sent: 0, failed: emailRecipients.length, errors: [e.message] });
            } finally {
              setEmailSending(false);
            }
          };

          return (
            <div style={{ animation: "slideIn .3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <div>
                  <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("email_title")}</h1>
                  <p style={{ color: colors.textMuted, fontSize: 13 }}>{t("email_subtitle")}</p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, marginBottom: 24 }}>
                {/* COMPOSE */}
                <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{t("email_compose")}</h3>
                    <button onClick={() => { setTemplateMgrOpen((p) => !p); setTemplateEdit(null); }}
                      style={{ fontSize: 11, color: colors.primary, background: "none", border: `1px solid ${colors.primary}40`, borderRadius: 5, padding: "3px 10px", cursor: "pointer", fontFamily: font }}>
                      {templateMgrOpen ? t("email_closeTemplates") : t("email_manageTemplates")}
                    </button>
                  </div>

                  {/* Quick Reply Templates */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{t("email_quickReply")}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {emailTemplates.map((t) => (
                        <button key={t.id} onClick={() => setEmailDraft({ subject: t.subject, body: t.body })}
                          title={t.subject}
                          style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${t.color}`, background: `${t.color}18`, color: t.color, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Template Manager */}
                  {templateMgrOpen && (
                    <div style={{ background: colors.bg, borderRadius: 8, padding: 16, marginBottom: 20, border: `1px solid ${colors.border}` }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{t("email_templates")}</div>
                      {emailTemplates.map((tmpl, i) => (
                        <div key={tmpl.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 10px", background: colors.surface, borderRadius: 6 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: tmpl.color, flexShrink: 0 }} />
                          <div style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tmpl.label}</div>
                          <button onClick={() => setTemplateEdit({ ...tmpl, _index: i })}
                            style={{ padding: "3px 10px", fontSize: 11, background: "none", border: `1px solid ${colors.border}`, borderRadius: 4, color: colors.textMuted, cursor: "pointer", fontFamily: font }}>
                            {t("email_edit")}
                          </button>
                          <button onClick={async () => {
                            if (!window.confirm(`Delete "${tmpl.label}"?`)) return;
                            const token = localStorage.getItem("sns_token");
                            await fetch(`/email/templates/${tmpl.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                            await fetchEmailTemplates();
                          }}
                            style={{ padding: "3px 10px", fontSize: 11, background: "none", border: "1px solid rgba(220,53,69,0.4)", borderRadius: 4, color: "#e57373", cursor: "pointer", fontFamily: font }}>
                            ✕
                          </button>
                        </div>
                      ))}
                      <button onClick={() => setTemplateEdit({ id: null, label: "", color: "#088FC4", subject: "", body: "", _index: -1 })}
                        style={{ marginTop: 4, padding: "6px 14px", background: `${colors.primary}20`, border: `1px dashed ${colors.primary}`, borderRadius: 6, color: colors.primary, fontSize: 12, cursor: "pointer", fontFamily: font }}>
                        {t("email_addTemplate")}
                      </button>
                    </div>
                  )}

                  {/* Template Edit Modal */}
                  {templateEdit && (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ background: colors.surface, borderRadius: 12, padding: 28, width: 540, maxWidth: "92vw", border: `1px solid ${colors.border}` }}>
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>{templateEdit._index === -1 ? "New Template" : "Edit Template"}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 12, marginBottom: 14 }}>
                          <div>
                            <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Label</div>
                            <input value={templateEdit.label} onChange={(e) => setTemplateEdit((p) => ({ ...p, label: e.target.value }))}
                              placeholder="e.g. İlgileniyoruz ✓"
                              style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Color</div>
                            <input type="color" value={templateEdit.color} onChange={(e) => setTemplateEdit((p) => ({ ...p, color: e.target.value }))}
                              style={{ width: "100%", height: 36, padding: 2, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, cursor: "pointer" }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Subject</div>
                          <input value={templateEdit.subject} onChange={(e) => setTemplateEdit((p) => ({ ...p, subject: e.target.value }))}
                            placeholder="Email subject line"
                            style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div style={{ marginBottom: 22 }}>
                          <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Body</div>
                          <textarea value={templateEdit.body} onChange={(e) => setTemplateEdit((p) => ({ ...p, body: e.target.value }))} rows={9}
                            style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                          <button onClick={() => setTemplateEdit(null)}
                            style={{ padding: "8px 18px", background: "none", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 13, cursor: "pointer", fontFamily: font }}>
                            {t("email_cancel")}
                          </button>
                          <button onClick={async () => {
                            if (!templateEdit.label.trim() || !templateEdit.subject.trim()) return alert("Label and subject are required.");
                            const token = localStorage.getItem("sns_token");
                            const body = { label: templateEdit.label, color: templateEdit.color, subject: templateEdit.subject, body: templateEdit.body };
                            if (templateEdit._index === -1) {
                              await fetch("/email/templates", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
                            } else {
                              await fetch(`/email/templates/${templateEdit.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
                            }
                            await fetchEmailTemplates();
                            setTemplateEdit(null);
                          }}
                            style={{ padding: "8px 20px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
                            {t("email_saveTemplate")}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{t("email_subjectField")}</div>
                    <input
                      value={emailDraft.subject}
                      onChange={(e) => setEmailDraft((p) => ({ ...p, subject: e.target.value }))}
                      placeholder="e.g. Turquality Programı Hakkında Bilgi"
                      style={{ width: "100%", padding: "10px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{t("email_bodyField")}</div>
                    <textarea
                      value={emailDraft.body}
                      onChange={(e) => setEmailDraft((p) => ({ ...p, body: e.target.value }))}
                      placeholder={t("email_bodyPlaceholderLead")}
                      rows={14}
                      style={{ width: "100%", padding: "10px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }}
                    />
                    <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>{t("email_signatureNote")}</div>
                  </div>
                  <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: colors.textMuted, whiteSpace: "nowrap" }}>İmza:</span>
                    <select value={selectedSignature} onChange={e => setSelectedSignature(e.target.value)}
                      style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", cursor: "pointer" }}>
                      <option value="merve">Merve Çöloğlu — merve.cologlu@sundanismanlik.net</option>
                      <option value="sura">Şura Kurtoğlu — sura.kurtoglu@sundanismanlik.net</option>
                      <option value="ahmet">Ahmet Sungur — ahmet.sungur@sundanismanlik.net</option>
                      <option value="esra">Esra Serin — esra.serin@sundanismanlik.net</option>
                      <option value="melek">Melek Çıtak — melek.citak@sundanismanlik.net</option>
                    </select>
                  </div>

                  {/* Result banner */}
                  {emailResult && (
                    <div style={{ borderRadius: 8, padding: "12px 16px", marginBottom: 16, background: emailResult.failed === 0 ? "rgba(67,160,71,0.1)" : "rgba(220,53,69,0.1)", border: `1px solid ${emailResult.failed === 0 ? "rgba(67,160,71,0.25)" : "rgba(220,53,69,0.25)"}`, fontSize: 13 }}>
                      {emailResult.sent > 0 && <div style={{ color: "#81c784" }}>{t("email_sent", emailResult.sent)}</div>}
                      {emailResult.failed > 0 && <div style={{ color: "#e57373" }}>{t("email_failed", emailResult.failed, emailResult.errors?.[0])}</div>}
                    </div>
                  )}

                  <button
                    onClick={sendCampaign}
                    disabled={emailSending}
                    style={{ padding: "11px 24px", background: emailSending ? colors.border : colors.primary, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: emailSending ? "not-allowed" : "pointer", fontFamily: font }}
                  >
                    {emailSending ? t("email_sending") : t("email_sendTo", emailRecipients.length)}
                  </button>
                </div>

                {/* FILTERS */}
                <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>{t("email_recipients")}</h3>

                  {/* Has email toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${colors.border}` }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{t("email_hasEmail")}</div>
                      <div style={{ fontSize: 11, color: colors.textDim }}>{t("email_hasEmailSub")}</div>
                    </div>
                    <button
                      onClick={() => setEmailFilter((p) => ({ ...p, hasEmail: !p.hasEmail }))}
                      style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: emailFilter.hasEmail ? colors.primary : colors.border, position: "relative", transition: "background .2s" }}
                    >
                      <div style={{ position: "absolute", top: 3, left: emailFilter.hasEmail ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                    </button>
                  </div>

                  {/* Status filter */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{t("email_filterByStatus")}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {LEAD_STATUSES.map((s) => {
                        const active = emailFilter.statuses.includes(s);
                        return (
                          <button key={s} onClick={() => setEmailFilter((p) => ({ ...p, statuses: active ? p.statuses.filter((x) => x !== s) : [...p.statuses, s] }))}
                            style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${active ? colors.primary : colors.border}`, background: active ? `${colors.primary}20` : "transparent", color: active ? colors.primary : colors.textMuted, fontSize: 11, cursor: "pointer", fontFamily: font }}>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    {emailFilter.statuses.length > 0 && <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4 }}>{t("email_allStatuses")}</div>}
                  </div>

                  {/* Industry filter */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{t("email_filterByIndustry")}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {INDUSTRIES.map((ind) => {
                        const active = emailFilter.industries.includes(ind);
                        return (
                          <button key={ind} onClick={() => setEmailFilter((p) => ({ ...p, industries: active ? p.industries.filter((x) => x !== ind) : [...p.industries, ind] }))}
                            style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${active ? colors.accent : colors.border}`, background: active ? `${colors.accent}20` : "transparent", color: active ? colors.accent : colors.textMuted, fontSize: 11, cursor: "pointer", fontFamily: font }}>
                            {ind}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Count */}
                  <div style={{ background: colors.bg, borderRadius: 8, padding: 14, textAlign: "center" }}>
                    <div style={{ fontSize: 32, fontWeight: 700, color: colors.primary }}>{emailRecipients.length}</div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>{t("email_leadsSelected")}</div>
                    <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>{t("email_withEmail", emailRecipients.filter((l) => l.email).length)}</div>
                  </div>

                  {/* Clear filters */}
                  {(emailFilter.statuses.length > 0 || emailFilter.industries.length > 0) && (
                    <button onClick={() => setEmailFilter({ statuses: [], industries: [], hasEmail: emailFilter.hasEmail })}
                      style={{ width: "100%", marginTop: 12, padding: "8px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 11, cursor: "pointer", fontFamily: font }}>
                      {t("email_clearFilters")}
                    </button>
                  )}
                </div>
              </div>

              {/* SEND HISTORY */}
              <EmailHistory colors={colors} token={localStorage.getItem("sns_token")} lang={settings.lang || "tr"} />
            </div>
          );
        })()}

        {/* ══ MONDAY.COM VIEW ══ */}
        {view === "monday" && (() => {
          const emailCol = mondayColumns.find(c => c.type === "email") || mondayColumns.find(c => /e[\s-]?posta|e-?mail/i.test(c.title));
          const genderCol = mondayColumns.find(c => /cinsiyet|gender|unvan|hitap|bay|bayan/i.test(c.title));
          const mailKonulariCol = mondayColumns.find(c => /mail.konular/i.test(c.title));
          const ortakMailCol = mondayColumns.find(c => /ortak.mail/i.test(c.title));
          console.log("[Monday cols] mailKonulariCol:", mailKonulariCol, "| ortakMailCol:", ortakMailCol);
          // Special column detection (must be before visibleCols)
          const phoneCol    = mondayColumns.find(c => c.type === "phone" || /\btelefon\b|phone|tel\b|gsm\b|cep\b/i.test(c.title));
          const empCol      = mondayColumns.find(c => /çalışan sayısı|çalışan|calisan|employee|personel|kadro|eleman|staff/iu.test(c.title));

          const reservedIds = new Set([emailCol?.id, mailKonulariCol?.id].filter(Boolean));
          const otherCols = mondayColumns.filter(c => !["name","checkbox","button"].includes(c.type) && !reservedIds.has(c.id) && c.id !== phoneCol?.id && c.id !== empCol?.id).slice(0, 2);
          const visibleCols = [
            ...(emailCol ? [emailCol] : []),
            ...(phoneCol ? [phoneCol] : []),
            ...(empCol ? [empCol] : []),
            ...(mailKonulariCol ? [mailKonulariCol] : []),
            ...otherCols,
          ];
          const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
          const isEmailOk = (email) => email && isValidEmail(email) && mondayEmailVerification[email] !== false && !mondayBounces.has(email.toLowerCase());
          const hasValidName = (item) => item.name && item.name.trim() && item.name.toLowerCase() !== "item";
          const industryCol = mondayColumns.find(c => /sektör|sektor|industry|endüstri|endustri/i.test(c.title));
          const normTR     = s => [...s.trim()].map(c => ({'İ':'i','I':'i','ı':'i','Ş':'s','ş':'s'}[c] ?? c.toLowerCase())).join('');
          const nameCol    = mondayColumns.find(c => ["isim","ad","name"].includes(normTR(c.title)));
          const surnameCol = mondayColumns.find(c => ["soyisim","soyad","surname"].includes(normTR(c.title)));

          const EMP_RANGES = [
            { label: "1–10",    min: 1,   max: 10  },
            { label: "11–50",   min: 11,  max: 50  },
            { label: "51–200",  min: 51,  max: 200 },
            { label: "201–500", min: 201, max: 500 },
            { label: "500+",    min: 501, max: Infinity },
          ];

          // Build ordered filter definitions
          const specialIds = new Set([emailCol?.id, phoneCol?.id, empCol?.id, industryCol?.id, ortakMailCol?.id, genderCol?.id, nameCol?.id, surnameCol?.id].filter(Boolean));
          const filterDefs = [];
          filterDefs.push({ id: "_name", title: "Name", type: "presence" });
          if (emailCol)    filterDefs.push({ id: emailCol.id,    title: mondayColTitle(emailCol, lang),    type: "presence" });
          if (phoneCol)    filterDefs.push({ id: phoneCol.id,    title: mondayColTitle(phoneCol, lang),    type: "presence" });
          if (genderCol)   filterDefs.push({ id: genderCol.id,   title: mondayColTitle(genderCol, lang),   type: "presence" });
          if (empCol) {
            filterDefs.push({ id: empCol.id, title: mondayColTitle(empCol, lang), type: "numeric_range" });
          }
          if (industryCol) {
            const vals = new Set();
            mondayItems.forEach(i => { const cv = i.column_values.find(v => v.id === industryCol.id); const val = (cv?.text||"").trim(); if (val) vals.add(val); });
            if (vals.size > 0) filterDefs.push({ id: industryCol.id, title: mondayColTitle(industryCol, lang), type: "value_select", options: [...vals].sort() });
          }
          if (mondayBoardType === "companies" && ortakMailCol) {
            const vals = new Set();
            mondayItems.forEach(i => { const cv = i.column_values.find(v => v.id === ortakMailCol.id); const val = (cv?.text||"").trim(); if (val) vals.add(val); });
            filterDefs.push({ id: ortakMailCol.id, title: mondayColTitle(ortakMailCol, lang), type: "value_select", options: [...vals].sort() });
          }
          mondayColumns.filter(c =>
            !["checkbox","button","name","email","phone","text"].includes(c.type) && !specialIds.has(c.id)
          ).forEach(col => {
            const vals = new Set();
            mondayItems.forEach(i => { const cv = i.column_values.find(v => v.id === col.id); const val = (cv?.text||"").trim(); if (val) vals.add(val); });
            if (vals.size > 0 && vals.size <= 50) filterDefs.push({ id: col.id, title: mondayColTitle(col, lang), type: "value_select", options: [...vals].sort() });
          });

          const hasActiveFilters = Object.entries(mondayFilters).some(([, f]) => {
            if (!f) return false;
            if (f.type === "presence")      return f.presence && f.presence !== "any";
            if (f.type === "numeric_range") return (f.presence && f.presence !== "any") || (f.ranges && f.ranges.size > 0);
            if (f.type === "value_select")  return f.values && f.values.size > 0;
            return false;
          });

          const visibleItems = mondayItems.filter(i => {
            const colMap = {};
            i.column_values.forEach(cv => { colMap[cv.id] = cv.text; });
            if (showOnlyWithEmail) {
              const email = emailCol ? (colMap[emailCol.id] || "") : "";
              if (!isEmailOk(email)) return false;
            }
            for (const [fid, f] of Object.entries(mondayFilters)) {
              if (!f) continue;
              if (f.type === "presence") {
                if (!f.presence || f.presence === "any") continue;
                const val = fid === "_name" ? (i.name || "").trim() : (colMap[fid] || "").trim();
                if (f.presence === "has"   && !val) return false;
                if (f.presence === "empty" &&  val) return false;
              } else if (f.type === "numeric_range") {
                const val = (colMap[fid] || "").trim();
                if (f.presence && f.presence !== "any") {
                  if (f.presence === "has"   && !val) return false;
                  if (f.presence === "empty" &&  val) return false;
                }
                if (f.ranges && f.ranges.size > 0 && val) {
                  const num = parseFloat(val.replace(/[^\d.]/g, ""));
                  if (!isNaN(num)) {
                    const inRange = [...f.ranges].some(label => { const r = EMP_RANGES.find(x => x.label === label); return r && num >= r.min && num <= r.max; });
                    if (!inRange) return false;
                  }
                }
              } else if (f.type === "value_select") {
                if (!f.values || f.values.size === 0) continue;
                const val = (colMap[fid] || "").trim();
                const matchesEmpty = !val && f.values.has("__empty__");
                const matchesVal   = val  && f.values.has(val);
                const matches = matchesEmpty || matchesVal;
                if (f.exclude ? matches : !matches) return false;
              }
            }
            return true;
          });
          const allIds = visibleItems.map(i => i.id);
          const allChecked = allIds.length > 0 && allIds.every(id => mondaySelected.has(id));
          const selectedItems = mondayItems.filter(i => mondaySelected.has(i.id));

          const buildSalutation = (name, colMap) => {
            if (mondayBoardType === "companies") return "Merhaba,";
            const rawName = (name || "").trim();
            const firstName = rawName.split(/\s+/)[0];
            const isPlaceholder = !firstName || firstName.toLowerCase() === "item";
            const genderVal = genderCol ? (colMap[genderCol.id] || "").toLowerCase().trim() : "";
            if (isPlaceholder) return "Merhaba,";
            if (/bey|erkek|bay|male|mr/i.test(genderVal)) return `Merhaba ${firstName} Bey,`;
            if (/han[ıi]m|kad[ıi]n|bayan|female|ms|mrs/i.test(genderVal)) return `Merhaba ${firstName} Hanım,`;
            return `Merhaba ${firstName},`;
          };

          const selectedWithEmail = selectedItems.filter(i => {
            const colMap = {};
            i.column_values.forEach(cv => { colMap[cv.id] = cv.text; });
            const email = emailCol ? (colMap[emailCol.id] || "") : "";
            return isEmailOk(email);
          });
          const selectedInvalidEmail = selectedItems.filter(i => {
            const colMap = {};
            i.column_values.forEach(cv => { colMap[cv.id] = cv.text; });
            const email = emailCol ? (colMap[emailCol.id] || "") : "";
            return !email || !isValidEmail(email) || mondayEmailVerification[email] === false || mondayBounces.has(email.toLowerCase());
          });
          return (
            <div style={{ animation: "slideIn .3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                      {t("monday_title", mondayBoardName)}
                    </h2>
                    <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${colors.border}`, fontSize: 11, fontWeight: 700 }}>
                      {[{ key: "contacts", label: "Contacts" }, { key: "companies", label: "Companies" }].map(({ key, label }) => (
                        <button key={key} onClick={() => { if (mondayBoardType !== key) fetchMondayBoard(key); }}
                          style={{ padding: "4px 12px", cursor: "pointer", border: "none", transition: "all .15s",
                            background: mondayBoardType === key ? colors.primary : "transparent",
                            color: mondayBoardType === key ? "#fff" : colors.textMuted }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {mondayItems.length > 0 && (
                    <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                      {t("monday_items", mondayItems.length, mondaySelected.size)}
                      <button onClick={() => mondayMergedCount > 0 ? setMondayMergeModal(true) : runDedup()}
                        style={{ fontSize: 10, fontWeight: 600, borderRadius: 10, padding: "2px 7px", cursor: "pointer",
                          background: mondayMergedCount > 0 ? "#fff3cd" : "transparent",
                          color: mondayMergedCount > 0 ? "#856404" : colors.textMuted,
                          border: `1px solid ${mondayMergedCount > 0 ? "#ffc107" : colors.border}` }}>
                        {mondayMergedCount > 0 ? `${mondayMergedCount} duplicate${mondayMergedCount !== 1 ? "s" : ""} merged ↗` : "Find Duplicates"}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {mondaySelected.size > 0 && (
                    <button
                      onClick={() => { if (!mondayBulkDraft.subject) setMondayBulkDraft({ subject: t("monday_defaultSubject"), body: t("monday_defaultBody") }); setMondayBulkModal(true); }}
                      style={{ padding: "8px 18px", background: colors.success || "#2e7d32", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >
                      {t("monday_sendBulk", mondaySelected.size)}
                    </button>
                  )}
                  <button
                    onClick={syncBounces}
                    disabled={bounceSyncing}
                    title={bounceLastSync !== null ? `Last sync: ${bounceLastSync} suppression(s) found` : "Pull bounces, invalids and spam reports from SendGrid"}
                    style={{ padding: "8px 18px", background: "rgba(229,115,115,0.15)", border: "1px solid rgba(229,115,115,0.4)", borderRadius: 8, color: "#e57373", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: bounceSyncing ? 0.6 : 1 }}
                  >
                    {bounceSyncing ? "Syncing…" : bounceLastSync !== null ? `↻ Bounces (${mondayBounces.size})` : "↻ Check Bounces"}
                  </button>
                  <button
                    onClick={fetchMondayBoard}
                    disabled={mondayLoading}
                    style={{ padding: "8px 18px", background: colors.primary, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: mondayLoading ? 0.6 : 1 }}
                  >
                    {mondayLoading ? t("monday_loading") : mondayItems.length ? t("monday_refresh") : t("monday_fetchBoard")}
                  </button>
                </div>
              </div>

              {mondayError && (
                <div style={{ background: "rgba(220,53,69,0.1)", border: "1px solid rgba(220,53,69,0.3)", borderRadius: 8, padding: "12px 16px", color: "#e57373", fontSize: 13, marginBottom: 16 }}>
                  {mondayError}
                  {mondayError.includes("Settings") && (
                    <button onClick={() => setView("settings")} style={{ marginLeft: 10, background: "none", border: "none", color: colors.accent, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0 }}>{t("monday_goSettings")}</button>
                  )}
                </div>
              )}

              {!mondayItems.length && !mondayLoading && !mondayError && (
                <div style={{ textAlign: "center", padding: "60px 20px", color: colors.textMuted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{t("monday_noData")}</div>
                  <div style={{ fontSize: 12 }}>{t("monday_noDataSub")}</div>
                </div>
              )}

              {/* ── New Template Modal ── */}
              {newTemplateModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ background: colors.surface, borderRadius: 12, padding: 28, width: 500, maxWidth: "92vw", border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Yeni Şablon Oluştur</div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 5 }}>Şablon Adı</div>
                      <input value={newTemplateDraft.label} onChange={e => setNewTemplateDraft(p => ({ ...p, label: e.target.value }))}
                        placeholder={t("monday_composePlaceholder")}
                        style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 5 }}>Konu</div>
                      <input value={newTemplateDraft.subject} onChange={e => setNewTemplateDraft(p => ({ ...p, subject: e.target.value }))}
                        placeholder="E-posta konusu"
                        style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ marginBottom: 22 }}>
                      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 5 }}>İçerik</div>
                      <textarea value={newTemplateDraft.body} onChange={e => setNewTemplateDraft(p => ({ ...p, body: e.target.value }))} rows={8}
                        style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                      <button onClick={() => { setNewTemplateModal(false); setNewTemplateDraft({ label: "", subject: "", body: "" }); }}
                        style={{ padding: "8px 18px", background: "none", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 13, cursor: "pointer" }}>
                        İptal
                      </button>
                      <button onClick={async () => {
                        if (!newTemplateDraft.label.trim() || !newTemplateDraft.subject.trim()) { alert("Ad ve konu zorunludur."); return; }
                        const token = localStorage.getItem("sns_token");
                        await fetch("/email/templates", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ label: newTemplateDraft.label, color: "#088FC4", subject: newTemplateDraft.subject, body: newTemplateDraft.body }) });
                        await fetchEmailTemplates();
                        setNewTemplateModal(false);
                        setNewTemplateDraft({ label: "", subject: "", body: "" });
                      }}
                        style={{ padding: "8px 18px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Kaydet
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Compose Panel ── */}
              {mondayItems.length > 0 && (
                <div style={{ background: colors.surface, borderRadius: 12, padding: 16, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t("monday_compose")}</div>
                    <button onClick={() => { setNewTemplateDraft({ label: "", subject: "", body: "" }); setNewTemplateModal(true); }}
                      style={{ padding: "5px 12px", background: `${colors.primary}20`, border: `1px dashed ${colors.primary}`, borderRadius: 6, color: colors.primary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      + Şablon Oluştur
                    </button>
                  </div>
                  {emailTemplates.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: colors.textMuted, whiteSpace: "nowrap" }}>Şablon:</span>
                        <select defaultValue="" onChange={e => { const tpl = emailTemplates.find(t => String(t.id) === e.target.value); if (tpl) setMondayBulkDraft(p => ({ ...p, subject: tpl.subject, body: tpl.body })); e.target.value = ""; }}
                          style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", cursor: "pointer", flex: 1 }}>
                          <option value="">— Şablon seç —</option>
                          {emailTemplates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.label}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 52 }}>
                        {emailTemplates.map(tpl => (
                          <span key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10, fontSize: 11, color: colors.textMuted }}>
                            {tpl.label}
                            <button onClick={async () => {
                              if (!window.confirm(`"${tpl.label}" şablonu silinsin mi?`)) return;
                              const token = localStorage.getItem("sns_token");
                              await fetch(`/email/templates/${tpl.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                              fetchEmailTemplates();
                            }} style={{ background: "none", border: "none", color: "#e57373", cursor: "pointer", fontSize: 12, padding: "0 0 0 2px", lineHeight: 1 }}>✕</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ marginBottom: 10 }}>
                    <input
                      value={mondayBulkDraft.subject}
                      placeholder={t("monday_subjectPlaceholder")}
                      onChange={e => setMondayBulkDraft(p => ({ ...p, subject: e.target.value }))}
                      style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <textarea
                      value={mondayBulkDraft.body}
                      placeholder={t("monday_bodyPlaceholder")}
                      onChange={e => setMondayBulkDraft(p => ({ ...p, body: e.target.value }))}
                      style={{ width: "100%", minHeight: 100, padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: colors.textMuted, whiteSpace: "nowrap" }}>İmza:</span>
                    <select value={selectedSignature} onChange={e => setSelectedSignature(e.target.value)}
                      style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", cursor: "pointer" }}>
                      <option value="merve">Merve Çöloğlu — merve.cologlu@sundanismanlik.net</option>
                      <option value="sura">Şura Kurtoğlu — sura.kurtoglu@sundanismanlik.net</option>
                      <option value="ahmet">Ahmet Sungur — ahmet.sungur@sundanismanlik.net</option>
                      <option value="esra">Esra Serin — esra.serin@sundanismanlik.net</option>
                      <option value="melek">Melek Çıtak — melek.citak@sundanismanlik.net</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 6, color: colors.primaryLight, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {t("monday_attachFile")}
                      <input type="file" multiple style={{ display: "none" }} onChange={e => {
                        const files = Array.from(e.target.files);
                        files.forEach(file => {
                          const reader = new FileReader();
                          reader.onload = ev => setMondayAttachments(prev => [...prev, { name: file.name, type: file.type, content: ev.target.result.split(",")[1] }]);
                          reader.readAsDataURL(file);
                        });
                        e.target.value = "";
                      }} />
                    </label>
                    {mondayAttachments.map((a, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, fontSize: 11, color: colors.textMuted }}>
                        {a.name}
                        <button onClick={() => setMondayAttachments(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#e57373", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>

                  {/* ── Tag fields ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                    {[
                      { label: "mail Konuları", col: mailKonulariCol, val: mondayMailKonulari, set: setMondayMailKonulari, required: true },
                      { label: "ortak mail", col: ortakMailCol, val: mondayOrtakMail, set: setMondayOrtakMail, required: false },
                    ].map(({ label, col, val, set, required }) => (
                      <div key={label}>
                        <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>
                          {label} {col ? <span style={{ color: colors.success, fontSize: 10 }}>✓</span> : <span style={{ color: required ? "#e57373" : colors.textDim, fontSize: 10 }}>{required ? t("monday_colNotFound") : t("monday_optionalCol")}</span>}
                        </div>
                        <select
                          value={val}
                          onChange={e => set(e.target.value)}
                          style={{ width: "100%", padding: "7px 10px", background: colors.bg, border: `1px solid ${col ? colors.border : required ? "rgba(220,53,69,0.3)" : colors.border}`, borderRadius: 6, color: val ? colors.text : colors.textDim, fontSize: 12, outline: "none", boxSizing: "border-box" }}
                        >
                          <option value="">{t("monday_selectTag")}</option>
                          {mondayTags.map(tag => (
                            <option key={tag.id} value={tag.id}>{tag.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Error Panel ── */}
              {mondayItems.length > 0 && (() => {
                // true if item has any filled column other than the email column
                const hasOtherInfo = (item) => item.column_values.some(cv =>
                  cv.text && cv.text.trim() && (!emailCol || cv.id !== emailCol.id)
                );

                const classify = (i) => {
                  const colMap = {};
                  i.column_values.forEach(cv => { colMap[cv.id] = cv.text; });
                  const email = emailCol ? (colMap[emailCol.id] || "") : "";
                  if (!email) return { reason: t("monday_noEmail"), email };
                  if (!isValidEmail(email)) return { reason: t("monday_badFormat"), email };
                  if (mondayEmailVerification[email] === false) return { reason: t("monday_noMx"), email };
                  if (mondayBounces.has(email.toLowerCase())) return { reason: t("monday_bounced"), email };
                  return null;
                };

                // split into: clear-email-only (has other info) vs delete-whole-item (empty shell)
                const toDelete = [];
                const toClear = [];
                mondayItems.forEach(i => {
                  const c = classify(i);
                  if (!c) return;
                  if (hasOtherInfo(i)) {
                    toClear.push({ item: i, email: c.email, reason: c.reason });
                  } else {
                    toDelete.push({ item: i, email: c.email, reason: c.reason });
                  }
                });

                if (!toDelete.length && !toClear.length) return null;

                const clearEmails = async (entries) => {
                  if (!emailCol) { alert(t("monday_noEmailColAlert")); return; }
                  if (!window.confirm(t("monday_clearEmailConfirm", entries.length))) return;
                  try {
                    const token = localStorage.getItem("sns_token");
                    const updates = entries.map(({ item }) => ({ itemId: item.id, columnId: emailCol.id, colType: emailCol.type, value: "" }));
                    const res = await fetch("/monday/update-columns", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ apiKey: settings.mondayApiKey, boardId: settings.mondayBoardId, updates }),
                    });
                    const data = await res.json();
                    if (!res.ok) { alert(t("monday_serverError", data.error || res.status)); return; }
                    const failed = (data.results || []).filter(r => !r.ok);
                    const succeededIds = new Set((data.results || []).filter(r => r.ok).map(r => r.itemId));
                    if (failed.length > 0) {
                      alert(`${t("monday_clearEmailFailed", failed.length)}\n${failed.map(f => `ID ${f.itemId}: ${JSON.stringify(f.errors?.[0]?.message || f.error)}`).join("\n")}`);
                    }
                    if (succeededIds.size > 0) {
                      setMondayItems(prev => prev.map(i => {
                        if (!succeededIds.has(i.id)) return i;
                        return { ...i, column_values: i.column_values.map(cv => cv.id === emailCol.id ? { ...cv, text: "" } : cv) };
                      }));
                    }
                  } catch (e) { alert(t("monday_error", e.message)); }
                };

                const deleteItems = async (entries) => {
                  if (!window.confirm(t("monday_deleteEmptyConfirm", entries.length))) return;
                  try {
                    const token = localStorage.getItem("sns_token");
                    const res = await fetch("/monday/delete-items", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ apiKey: settings.mondayApiKey, itemIds: entries.map(({ item }) => item.id) }),
                    });
                    const data = await res.json();
                    if (!res.ok) { alert(t("monday_serverError", data.error || res.status)); return; }
                    const deletedIds = new Set(entries.map(({ item }) => item.id));
                    setMondayItems(prev => prev.filter(i => !deletedIds.has(i.id)));
                  } catch (e) { alert(t("monday_error", e.message)); }
                };

                const totalIssues = toClear.length + toDelete.length;
                return (
                  <div style={{ marginBottom: 14, background: "rgba(220,53,69,0.06)", border: "1px solid rgba(220,53,69,0.2)", borderRadius: 10, overflow: "hidden" }}>
                    {/* Collapsed header — always visible */}
                    <div
                      onClick={() => setMondayErrorPanelOpen(p => !p)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", cursor: "pointer", userSelect: "none" }}
                    >
                      <span style={{ color: "#e57373", fontWeight: 700, fontSize: 12 }}>
                        ⚠ {totalIssues} {t("monday_invalidEmailPanel", totalIssues)}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {mondayErrorPanelOpen && toClear.length > 0 && (
                          <button onClick={e => { e.stopPropagation(); clearEmails(toClear); }}
                            style={{ background: "rgba(220,53,69,0.15)", border: "1px solid rgba(220,53,69,0.35)", borderRadius: 5, color: "#e57373", fontSize: 11, fontWeight: 600, padding: "3px 10px", cursor: "pointer" }}>
                            {t("monday_clearEmailBtn", toClear.length)}
                          </button>
                        )}
                        {mondayErrorPanelOpen && toDelete.length > 0 && (
                          <button onClick={e => { e.stopPropagation(); deleteItems(toDelete); }}
                            style={{ background: "rgba(220,53,69,0.15)", border: "1px solid rgba(220,53,69,0.35)", borderRadius: 5, color: "#e57373", fontSize: 11, fontWeight: 600, padding: "3px 10px", cursor: "pointer" }}>
                            {t("monday_deleteAllBtn", toDelete.length)}
                          </button>
                        )}
                        <span style={{ color: "#e57373", fontSize: 11 }}>{mondayErrorPanelOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {/* Expandable content */}
                    {mondayErrorPanelOpen && (
                      <div style={{ borderTop: "1px solid rgba(220,53,69,0.2)", padding: "10px 14px", fontSize: 12 }}>
                        {toClear.length > 0 && (
                          <div style={{ marginBottom: toDelete.length > 0 ? 10 : 0 }}>
                            <div style={{ color: "#e57373", fontWeight: 600, marginBottom: 4 }}>{t("monday_invalidEmailPanel", toClear.length)}</div>
                            <div style={{ color: colors.textMuted, lineHeight: 1.8 }}>
                              {toClear.map(({ item, email }) => (
                                <span key={item.id} style={{ marginRight: 10 }}>{item.name}{email ? ` (${email})` : ""}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {toDelete.length > 0 && (
                          <div>
                            <div style={{ color: "#e57373", fontWeight: 600, marginBottom: 4 }}>{t("monday_emptyRecordPanel", toDelete.length)}</div>
                            <div style={{ color: colors.textMuted, lineHeight: 1.8 }}>
                              {toDelete.map(({ item }) => (
                                <span key={item.id} style={{ marginRight: 10 }}>{item.name || t("monday_unnamed")}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {mondayItems.length > 0 && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: showFilterPanel ? 0 : 8, flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.textMuted, cursor: "pointer", userSelect: "none" }}>
                      <input type="checkbox" checked={showOnlyWithEmail} onChange={e => setShowOnlyWithEmail(e.target.checked)} />
                      {t("monday_showEmailOnly")}
                    </label>
                    <span style={{ fontSize: 11, color: colors.textMuted }}>({visibleItems.length} / {mondayItems.length})</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      {hasActiveFilters && (
                        <button
                          onClick={() => setMondayFilters({})}
                          style={{ padding: "4px 10px", background: "rgba(229,115,115,0.15)", border: "1px solid rgba(229,115,115,0.4)", borderRadius: 6, color: "#e57373", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                        >
                          {t("monday_clearFiltersBtn")}
                        </button>
                      )}
                      {filterDefs.length > 0 && (
                        <button
                          onClick={() => setShowFilterPanel(p => !p)}
                          style={{ padding: "4px 12px", background: showFilterPanel ? colors.primary : `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 6, color: showFilterPanel ? "#fff" : colors.primaryLight, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                        >
                          {showFilterPanel ? "▲" : "▼"} {t("monday_filterBtn")}{hasActiveFilters ? " ●" : ""}
                        </button>
                      )}
                    </div>
                  </div>

                  {showFilterPanel && filterDefs.length > 0 && (
                    <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                      {filterDefs.map(def => {
                        const f = mondayFilters[def.id] || {};
                        const setF = (patch) => setMondayFilters(prev => ({ ...prev, [def.id]: { ...f, ...patch, type: def.type } }));
                        const isActive = (def.type === "presence" && f.presence && f.presence !== "any") ||
                          (def.type === "numeric_range" && ((f.presence && f.presence !== "any") || (f.ranges && f.ranges.size > 0))) ||
                          (def.type === "value_select" && f.values && f.values.size > 0);

                        const cardStyle = {
                          background: isActive ? `${colors.primary}18` : colors.surface,
                          border: `1px solid ${isActive ? colors.primary + "55" : colors.border}`,
                          borderRadius: 10, padding: "10px 12px", minWidth: 0,
                          transition: "border-color .15s, background .15s",
                        };
                        const titleStyle = { fontSize: 10, fontWeight: 700, color: isActive ? colors.primary : colors.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" };

                        // Segmented pill control for presence
                        const PresencePills = ({ value, onChange }) => (
                          <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: `1px solid ${colors.border}` }}>
                            {[["any","Any"],["has","Has"],["empty","Empty"]].map(([opt, label]) => (
                              <button key={opt} onClick={() => onChange(opt)}
                                style={{ flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 600, cursor: "pointer", border: "none", borderRight: opt !== "empty" ? `1px solid ${colors.border}` : "none",
                                  background: value === opt ? colors.primary : "transparent",
                                  color: value === opt ? "#fff" : colors.textMuted,
                                  transition: "background .15s, color .15s" }}>
                                {label}
                              </button>
                            ))}
                          </div>
                        );

                        if (def.type === "presence") {
                          return (
                            <div key={def.id} style={{ ...cardStyle, minWidth: 150 }}>
                              <div style={titleStyle}>{def.title}</div>
                              <PresencePills value={f.presence || "any"} onChange={v => setF({ presence: v })} />
                            </div>
                          );
                        }

                        if (def.type === "numeric_range") {
                          const ranges = f.ranges || new Set();
                          return (
                            <div key={def.id} style={{ ...cardStyle, minWidth: 160 }}>
                              <div style={titleStyle}>{def.title}</div>
                              <PresencePills value={f.presence || "any"} onChange={v => setF({ presence: v })} />
                              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, margin: "10px 0 6px", textTransform: "uppercase", letterSpacing: "0.07em" }}>Range</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                {EMP_RANGES.map(r => {
                                  const on = ranges.has(r.label);
                                  return (
                                    <button key={r.label} onClick={() => { const next = new Set(ranges); on ? next.delete(r.label) : next.add(r.label); setF({ ranges: next }); }}
                                      style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? colors.primary : colors.border}`,
                                        background: on ? colors.primary : "transparent", color: on ? "#fff" : colors.textMuted, transition: "all .15s" }}>
                                      {r.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        // value_select — pill checkboxes
                        const vals = def.options || [];
                        const sel  = f.values || new Set();
                        const excl = !!f.exclude;
                        const toggle = (v) => { const next = new Set(sel); sel.has(v) ? next.delete(v) : next.add(v); setF({ values: next }); };
                        const emptyOn = sel.has("__empty__");
                        return (
                          <div key={def.id} style={{ ...cardStyle, minWidth: 140, borderColor: excl && sel.size > 0 ? "rgba(229,115,115,0.5)" : undefined, background: excl && sel.size > 0 ? "rgba(229,115,115,0.06)" : undefined }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                              <div style={titleStyle}>{def.title}</div>
                              <button onClick={() => setF({ exclude: !excl })}
                                style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, cursor: "pointer", transition: "all .15s",
                                  background: excl ? "rgba(229,115,115,0.15)" : "transparent",
                                  color: excl ? "#e57373" : colors.textMuted,
                                  border: `1px solid ${excl ? "rgba(229,115,115,0.4)" : colors.border}` }}>
                                Exclude
                              </button>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              <button onClick={() => toggle("__empty__")}
                                style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", fontStyle: "italic",
                                  border: `1px solid ${emptyOn ? "#f59e0b" : colors.border}`,
                                  background: emptyOn ? "#fef3c7" : "transparent",
                                  color: emptyOn ? "#92400e" : colors.textMuted, transition: "all .15s" }}>
                                No tag
                              </button>
                              {vals.map(val => {
                                const on = sel.has(val);
                                return (
                                  <button key={val} onClick={() => toggle(val)}
                                    style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? colors.primary : colors.border}`,
                                      background: on ? colors.primary : "transparent", color: on ? "#fff" : colors.textMuted,
                                      maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "all .15s" }}
                                    title={val}>
                                    {val}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: 10 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 1, background: colors.surface }}>
                      <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                        <th style={{ padding: "8px 12px", width: 36 }}>
                          <input type="checkbox" checked={allChecked} onChange={() => setMondaySelected(allChecked ? new Set() : new Set(allIds))} />
                        </th>
                        <th style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 600, whiteSpace: "nowrap" }}>{t("monday_colName")}</th>
                        {visibleCols.map(c => (
                          <th key={c.id} style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 600, whiteSpace: "nowrap" }}>{mondayColTitle(c, lang)}</th>
                        ))}
                        <th style={{ padding: "8px 12px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map(item => {
                        const colMap = {};
                        item.column_values.forEach(cv => { colMap[cv.id] = cv.text; });
                        const emailVal = emailCol ? colMap[emailCol.id] : "";
                        const emailBad = emailVal && !isValidEmail(emailVal);
                        const checked = mondaySelected.has(item.id);
                        return (
                          <tr key={item.id} style={{ borderBottom: `1px solid ${colors.border}`, background: emailBad ? "rgba(220,53,69,0.06)" : checked ? `${colors.primary}0d` : "transparent" }}>
                            <td style={{ padding: "10px 12px" }}>
                              <input type="checkbox" checked={checked} onChange={() => setMondaySelected(prev => { const s = new Set(prev); s.has(item.id) ? s.delete(item.id) : s.add(item.id); return s; })} />
                            </td>
                            <td style={{ padding: "10px 12px", fontWeight: 600, color: colors.text, whiteSpace: "nowrap" }}>{item.name}</td>
                            {visibleCols.map(c => {
                              const val = colMap[c.id] || "—";
                              const isEmailType = emailCol && c.id === emailCol.id;
                              const isMailKonulari = mailKonulariCol && c.id === mailKonulariCol.id;
                              const invalid = isEmailType && colMap[c.id] && !isValidEmail(colMap[c.id]);
                              if (isMailKonulari) {
                                const tags = colMap[c.id] ? colMap[c.id].split(/[,،]\s*/).map(s => s.trim()).filter(Boolean) : [];
                                return (
                                  <td key={c.id} style={{ padding: "10px 12px", maxWidth: 220 }}>
                                    {tags.length > 0 ? (
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                        {tags.map((tag, ti) => (
                                          <span key={ti} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: `${colors.accent}22`, color: colors.accent, fontWeight: 600, whiteSpace: "nowrap" }}>{tag}</span>
                                        ))}
                                      </div>
                                    ) : <span style={{ color: colors.textDim, fontSize: 11 }}>—</span>}
                                  </td>
                                );
                              }
                              return (
                                <td key={c.id} style={{ padding: "10px 12px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  <span style={{ color: invalid ? "#e57373" : colors.textMuted }}>{val}</span>
                                  {invalid && <span style={{ marginLeft: 6, fontSize: 10, color: "#e57373", fontWeight: 600 }}>{t("monday_invalidEmail")}</span>}
                                </td>
                              );
                            })}
                            <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                              <button
                                onClick={() => setMondayTestEmail({ name: item.name, email: emailVal })}
                                style={{ padding: "5px 12px", background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 6, color: colors.primaryLight, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                              >
                                {t("monday_sendEmail")}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* Merge Log Modal */}
              {mondayMergeModal && (() => {
                const applySignals = (next) => {
                  setMondayMergeSignals(next);
                  const { deduped, mergedCount, mergeLog } = deduplicateMondayItems(mondayRawItems, mondayColumns, next);
                  setMondayItems(deduped);
                  setMondayMergedCount(mergedCount);
                  setMondayMergeLog(mergeLog);
                };
                const toggleSignal = (key) => applySignals({ ...mondayMergeSignals, [key]: !mondayMergeSignals[key] });
                const unmergeOne = (entry) => {
                  const mergedItem = mondayItems.find(i => i._mergedFrom && entry.originals.every(o => i._mergedFrom.includes(o.id)));
                  if (!mergedItem) return;
                  const originals = entry.originals.map(o => mondayRawItems.find(r => r.id === o.id)).filter(Boolean);
                  setMondayItems(prev => {
                    const idx = prev.findIndex(i => i.id === mergedItem.id);
                    const next = [...prev];
                    next.splice(idx, 1, ...originals);
                    return next;
                  });
                  setMondayMergeLog(prev => prev.filter(e => e !== entry));
                  setMondayMergedCount(prev => prev - (entry.total - 1));
                };
                const unmergeAll = () => {
                  setMondayItems(mondayRawItems);
                  setMondayMergedCount(0);
                  setMondayMergeLog([]);
                };
                return (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setMondayMergeModal(false)}>
                  <div style={{ background: colors.surface, borderRadius: 14, padding: 28, width: 680, maxWidth: "95vw", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Duplicate Contacts — Merge Report</h3>
                        <p style={{ fontSize: 12, color: colors.textMuted, margin: "4px 0 0" }}>
                          {mondayMergeLog.length} group{mondayMergeLog.length !== 1 ? "s" : ""} merged — {mondayMergedCount} record{mondayMergedCount !== 1 ? "s" : ""} removed
                        </p>
                      </div>
                      <button onClick={() => setMondayMergeModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: colors.textMuted, lineHeight: 1 }}>×</button>
                    </div>
                    {/* Signal toggles */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 14px", background: colors.bg, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                      <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 600, marginRight: 4 }}>Merge by:</span>
                      {[
                        { key: "name",  label: "Name",  on: { bg: "#e8f4ff", text: "#1565c0", border: "#90caf9" } },
                        { key: "email", label: "Email", on: { bg: "#e8f5e9", text: "#2e7d32", border: "#a5d6a7" } },
                        { key: "phone", label: "Phone", on: { bg: "#fce4ec", text: "#880e4f", border: "#f48fb1" } },
                      ].map(({ key, label, on }) => {
                        const active = mondayMergeSignals[key];
                        return (
                          <button key={key} onClick={() => toggleSignal(key)}
                            style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, cursor: "pointer", transition: "all .15s",
                              background: active ? on.bg : "transparent",
                              color: active ? on.text : colors.textMuted,
                              border: `1px solid ${active ? on.border : colors.border}` }}>
                            {label}
                          </button>
                        );
                      })}
                      <div style={{ flex: 1 }} />
                      {mondayMergeLog.length > 0 && (
                        <button onClick={() => { unmergeAll(); setMondayMergeModal(false); }}
                          style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", background: "rgba(229,115,115,0.12)", border: "1px solid rgba(229,115,115,0.4)", borderRadius: 7, color: "#e57373", cursor: "pointer" }}>
                          Unmerge All
                        </button>
                      )}
                    </div>
                    {mondayMergeLog.length === 0 ? (
                      <p style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", padding: "20px 0" }}>No duplicates found.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {mondayMergeLog.map((entry, i) => {
                          const signalColors = { name: { bg: "#e8f4ff", text: "#1565c0", border: "#90caf9" }, email: { bg: "#e8f5e9", text: "#2e7d32", border: "#a5d6a7" }, phone: { bg: "#fce4ec", text: "#880e4f", border: "#f48fb1" } };
                          return (
                            <div key={i} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden" }}>
                              {/* Group header */}
                              <div style={{ background: colors.bg, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontWeight: 700, fontSize: 13 }}>{entry.name}</span>
                                  <span style={{ fontSize: 11, color: colors.textMuted }}>{entry.total} records → 1</span>
                                </div>
                                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                                  {entry.matchedBy.map(sig => (
                                    <span key={sig} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: signalColors[sig]?.bg, color: signalColors[sig]?.text, border: `1px solid ${signalColors[sig]?.border}` }}>
                                      matched by {sig}
                                    </span>
                                  ))}
                                  <button onClick={() => unmergeOne(entry)}
                                    style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", background: "rgba(229,115,115,0.1)", border: "1px solid rgba(229,115,115,0.35)", borderRadius: 7, color: "#e57373", cursor: "pointer" }}>
                                    Unmerge
                                  </button>
                                </div>
                              </div>
                              {/* Originals table */}
                              <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                  <thead>
                                    <tr style={{ background: colors.surface }}>
                                      <th style={{ padding: "6px 14px", textAlign: "left", color: colors.textMuted, fontWeight: 600, borderBottom: `1px solid ${colors.border}` }}>Name</th>
                                      <th style={{ padding: "6px 14px", textAlign: "left", color: colors.textMuted, fontWeight: 600, borderBottom: `1px solid ${colors.border}` }}>Email</th>
                                      <th style={{ padding: "6px 14px", textAlign: "left", color: colors.textMuted, fontWeight: 600, borderBottom: `1px solid ${colors.border}` }}>Phone</th>
                                      <th style={{ padding: "6px 14px", textAlign: "left", color: colors.textMuted, fontWeight: 600, borderBottom: `1px solid ${colors.border}` }}>Role</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {entry.originals.map((orig, j) => (
                                      <tr key={j} style={{ background: orig.isPrimary ? "#f0fdf4" : "transparent", borderBottom: `1px solid ${colors.border}` }}>
                                        <td style={{ padding: "7px 14px", fontWeight: orig.isPrimary ? 600 : 400 }}>{orig.name || "—"}</td>
                                        <td style={{ padding: "7px 14px", color: orig.email ? colors.text : colors.textMuted }}>{orig.email || <span style={{ fontStyle: "italic" }}>empty</span>}</td>
                                        <td style={{ padding: "7px 14px", color: orig.phone ? colors.text : colors.textMuted }}>{orig.phone || <span style={{ fontStyle: "italic" }}>empty</span>}</td>
                                        <td style={{ padding: "7px 14px" }}>
                                          {orig.isPrimary
                                            ? <span style={{ fontSize: 10, fontWeight: 700, background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7", borderRadius: 8, padding: "2px 7px" }}>★ kept</span>
                                            : <span style={{ fontSize: 10, fontWeight: 600, background: "#fce4ec", color: "#880e4f", border: "1px solid #f48fb1", borderRadius: 8, padding: "2px 7px" }}>merged in</span>
                                          }
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {/* Filled fields note */}
                              {entry.filledFields.length > 0 && (
                                <div style={{ padding: "7px 14px", background: "#fffde7", borderTop: `1px solid ${colors.border}`, fontSize: 11, color: "#6d4c00" }}>
                                  Fields filled from duplicate: <strong>{entry.filledFields.map(f => MONDAY_COL_TITLE_EN[normForColTitle(f)] || f).join(", ")}</strong>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* Bulk Email Modal */}
              {mondayBulkModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => !mondayBulkSending && setMondayBulkModal(false)}>
                  <div style={{ background: colors.surface, borderRadius: 12, padding: 28, width: 500, border: `1px solid ${colors.border}` }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("monday_bulkTitle")}</h3>
                    <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
                      {t("monday_willSend", selectedWithEmail.length)}
                    </p>
                    {(selectedItems.length - selectedWithEmail.length - selectedInvalidEmail.length) > 0 && (
                      <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>
                        {t("monday_willSkipNoEmail", selectedItems.length - selectedWithEmail.length - selectedInvalidEmail.length)}
                      </p>
                    )}
                    {selectedInvalidEmail.length > 0 && (
                      <p style={{ fontSize: 11, color: "#e57373", marginBottom: 4 }}>
                        {t("monday_willSkipInvalid", selectedInvalidEmail.length, selectedInvalidEmail.map(i => i.name).join(", "))}
                      </p>
                    )}
                    {genderCol ? (
                      <p style={{ fontSize: 11, color: "#81c784", marginBottom: 16 }}>{t("monday_genderFound", mondayColTitle(genderCol, lang))}</p>
                    ) : (
                      <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>{t("monday_genderNotFound")}</p>
                    )}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{t("monday_subject")}</div>
                      <input
                        value={mondayBulkDraft.subject}
                        placeholder={t("monday_subjectPlaceholder")}
                        onChange={e => setMondayBulkDraft(p => ({ ...p, subject: e.target.value }))}
                        style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{t("monday_body")}</div>
                      <textarea
                        value={mondayBulkDraft.body}
                        placeholder={t("monday_bodyPlaceholder")}
                        onChange={e => setMondayBulkDraft(p => ({ ...p, body: e.target.value }))}
                        style={{ width: "100%", minHeight: 140, padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        disabled={mondayBulkSending || !mondayBulkDraft.subject || selectedWithEmail.length === 0}
                        onClick={async () => {
                          if (!settings.sendgridApiKey) { alert("Add your SendGrid API key in Settings first."); return; }
                          setMondayBulkSending(true);
                          try {
                            const token = localStorage.getItem("sns_token");
                            const recipients = selectedWithEmail.map(item => {
                              const colMap = {};
                              item.column_values.forEach(cv => { colMap[cv.id] = cv.text; });
                              const salutation = buildSalutation(item.name, colMap);
                              const personalizedBody = `${salutation}<br><br>${mondayBulkDraft.body.replace(/\n/g, "<br>")}`;
                              return { email: colMap[emailCol.id], name: item.name, htmlBody: personalizedBody };
                            });
                            const r = await fetch("/email/send", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({
                                apiKey: settings.sendgridApiKey,
                                fromEmail: authUser.email,
                                fromName: authUser.name || settings.sendgridFromName,
                                subject: mondayBulkDraft.subject,
                                body: mondayBulkDraft.body,
                                recipients,
                                signatureKey: selectedSignature,
                                attachments: mondayAttachments,
                              }),
                            });
                            const d = await r.json();
                            if (!r.ok) { alert("Hata: " + (d.error || `HTTP ${r.status}`)); return; }
                            await fetch("/email/campaigns", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ subject: mondayBulkDraft.subject, recipients: selectedWithEmail.length, sent: d.sent ?? 0, failed: d.failed ?? 0, source: "monday" }),
                            });
                            fetchMondayCampaigns();
                            // Only update Monday for items whose email was actually sent
                            const sentEmailSet = new Set((d.sentEmails || []).map(e => e.toLowerCase()));
                            const actuallySent = selectedWithEmail.filter(item => {
                              const colMap = {};
                              item.column_values.forEach(cv => { colMap[cv.id] = cv.text; });
                              const email = (emailCol ? colMap[emailCol.id] : "") || "";
                              return sentEmailSet.has(email.toLowerCase());
                            });
                            // Post activity note to each Monday item that received the email
                            const now = new Date().toLocaleString("tr-TR");
                            const updates = actuallySent.map(item => {
                              const colMap = {};
                              item.column_values.forEach(cv => { colMap[cv.id] = cv.text; });
                              const salutation = buildSalutation(item.name, colMap);
                              const plainBody = `${salutation}\n\n${mondayBulkDraft.body}`;
                              return {
                                itemId: item.id,
                                body: `📧 E-posta gönderildi — ${now}\nGönderen: ${authUser.email}\nKonu: ${mondayBulkDraft.subject}\n\n${plainBody}`,
                              };
                            });
                            if (updates.length > 0) {
                              fetch("/monday/add-updates", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ apiKey: settings.mondayApiKey, updates }),
                              });
                            }

                            // Update mail Konuları and ortak mail tag columns — only for sent items
                            const tagColsToUpdate = [
                              { col: mailKonulariCol, tagId: mondayMailKonulari ? parseInt(mondayMailKonulari) : null },
                              { col: ortakMailCol,    tagId: mondayOrtakMail    ? parseInt(mondayOrtakMail)    : null },
                            ].filter(x => x.col && x.tagId);

                            if (tagColsToUpdate.length > 0) {
                              const colUpdates = [];
                              for (const item of actuallySent) {
                                const colValueMap = {};
                                item.column_values.forEach(cv => { colValueMap[cv.id] = cv.value; });
                                for (const { col, tagId } of tagColsToUpdate) {
                                  let existingIds = [];
                                  try { existingIds = JSON.parse(colValueMap[col.id] || "{}").tag_ids || []; } catch {}
                                  const mergedIds = [...new Set([...existingIds, tagId])];
                                  colUpdates.push({ itemId: item.id, columnId: col.id, colType: "tag", value: mergedIds });
                                }
                              }
                              console.log("[colUpdates]", colUpdates);

                              if (colUpdates.length > 0) {
                                const colRes = await fetch("/monday/update-columns", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ apiKey: settings.mondayApiKey, boardId: settings.mondayBoardId, updates: colUpdates }),
                                });
                                const colData = await colRes.json();
                                const colFailed = (colData.results || []).filter(r => !r.ok);
                                if (colFailed.length > 0) {
                                  alert(`Monday sütun güncellemesi başarısız:\n${colFailed.map(f => `${f.itemId}: ${JSON.stringify(f.errors)}`).join("\n")}`);
                                } else {
                                  // Update local state so next send appends correctly
                                  const updateMap = {};
                                  colUpdates.forEach(u => {
                                    if (!updateMap[u.itemId]) updateMap[u.itemId] = {};
                                    updateMap[u.itemId][u.columnId] = JSON.stringify({ tag_ids: u.value });
                                  });
                                  setMondayItems(prev => prev.map(item => {
                                    if (!updateMap[item.id]) return item;
                                    return {
                                      ...item,
                                      column_values: item.column_values.map(cv =>
                                        updateMap[item.id][cv.id] !== undefined
                                          ? { ...cv, value: updateMap[item.id][cv.id] }
                                          : cv
                                      ),
                                    };
                                  }));
                                }
                              }
                            }

                            alert(`Gönderildi: ${d.sent ?? 0}  Başarısız: ${d.failed ?? 0}${d.errors?.length ? "\n" + d.errors.join("\n") : ""}`);
                            setMondayBulkModal(false);
                            setMondaySelected(new Set());
                            setMondayMailKonulari("");
                            setMondayOrtakMail("");
                            setMondayBulkDraft({ subject: t("monday_defaultSubject"), body: t("monday_defaultBody") });
                          } catch (e) { alert("Error: " + e.message); }
                          finally { setMondayBulkSending(false); }
                        }}
                        style={{ flex: 1, padding: "9px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: mondayBulkSending ? 0.6 : 1 }}
                      >
                        {mondayBulkSending ? t("monday_sending") : t("monday_sendToN", selectedWithEmail.length)}
                      </button>
                      <button onClick={() => !mondayBulkSending && setMondayBulkModal(false)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 13, cursor: "pointer" }}>{t("monday_cancel")}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Campaign History */}
              {mondayCampaigns.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t("monday_campaignHistory")}</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                        {[t("monday_colDate"), t("monday_colSubject"), t("monday_colRecipients"), t("monday_colSent"), t("monday_colFailed"), t("monday_colRate")].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mondayCampaigns.map(c => {
                        const rate = c.recipients > 0 ? Math.round((c.sent / c.recipients) * 100) : 0;
                        return (
                          <tr key={c.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                            <td style={{ padding: "10px 12px", color: colors.textMuted, whiteSpace: "nowrap" }}>{new Date(c.sent_at).toLocaleString("tr-TR")}</td>
                            <td style={{ padding: "10px 12px", color: colors.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</td>
                            <td style={{ padding: "10px 12px", color: colors.textMuted }}>{c.recipients}</td>
                            <td style={{ padding: "10px 12px", color: "#81c784" }}>{c.sent}</td>
                            <td style={{ padding: "10px 12px", color: c.failed > 0 ? "#e57373" : colors.textMuted }}>{c.failed}</td>
                            <td style={{ padding: "10px 12px", color: rate === 100 ? "#81c784" : colors.text }}>{rate}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Test Email Modal */}
              {mondayTestEmail && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setMondayTestEmail(null)}>
                  <div style={{ background: colors.surface, borderRadius: 12, padding: 28, width: 460, border: `1px solid ${colors.border}` }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t("monday_testTitle")}</h3>
                    <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 20 }}>{t("monday_testTo", mondayTestEmail.name)}</p>
                    {[
                      { label: t("monday_testRecipientEmail"), key: "email", placeholder: "email@example.com" },
                      { label: t("monday_testSubject"), key: "subject", placeholder: t("monday_subjectPlaceholder") },
                    ].map(f => (
                      <div key={f.key} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{f.label}</div>
                        <input
                          value={mondayTestEmail[f.key] || ""}
                          placeholder={f.placeholder}
                          onChange={e => setMondayTestEmail(p => ({ ...p, [f.key]: e.target.value }))}
                          style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                    ))}
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{t("monday_testBody")}</div>
                      <textarea
                        value={mondayTestEmail.body || ""}
                        placeholder={t("monday_bodyPlaceholder")}
                        onChange={e => setMondayTestEmail(p => ({ ...p, body: e.target.value }))}
                        style={{ width: "100%", minHeight: 120, padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={async () => {
                          if (!settings.sendgridApiKey) { alert("Add your SendGrid API key in Settings first."); return; }
                          if (!mondayTestEmail.email) { alert("Recipient email is required."); return; }
                          try {
                            const token = localStorage.getItem("sns_token");
                            const r = await fetch("/email/send", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({
                                apiKey: settings.sendgridApiKey,
                                fromEmail: authUser.email,
                                fromName: authUser.name || settings.sendgridFromName,
                                subject: mondayTestEmail.subject || "(no subject)",
                                body: mondayTestEmail.body || "",
                                recipients: [{ email: mondayTestEmail.email, name: mondayTestEmail.name }],
                              }),
                            });
                            const d = await r.json();
                            if (d.sent > 0) { alert(`Email sent to ${mondayTestEmail.email}`); setMondayTestEmail(null); }
                            else alert("Send failed: " + (d.errors?.[0] || "unknown error"));
                          } catch (e) { alert("Error: " + e.message); }
                        }}
                        style={{ flex: 1, padding: "9px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                      >
                        {t("monday_testSend")}
                      </button>
                      <button onClick={() => setMondayTestEmail(null)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 13, cursor: "pointer" }}>{t("monday_testCancel")}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ══ CONTRACTS VIEW ══ */}
        {view === "contracts" && (() => {
          const selectedCompany = contractCompanies.find(c => String(c.id) === String(contractData.party1_id));
          const dataWithCompany = selectedCompany ? {
            ...contractData,
            party1_name: selectedCompany.name,
            party1_tax_office: selectedCompany.tax_office,
            party1_tax_no: selectedCompany.tax_no,
            party1_address: selectedCompany.address,
            iban: selectedCompany.iban,
          } : contractData;

          const handleOcr = async (file) => {
            setContractOcrLoading(true);
            try {
              const token = localStorage.getItem("sns_token");
              const fd = new FormData();
              fd.append("image", file);
              const r = await fetch("/contracts/ocr", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
              const d = await r.json();
              if (d.ok && d.fields) {
                setContractData(prev => ({ ...prev, ...d.fields }));
                alert(t("contract_ocrDone"));
              } else { alert(t("contract_ocrError", d.error || "Unknown")); }
            } catch (e) { alert(t("contract_ocrError", e.message)); }
            finally { setContractOcrLoading(false); }
          };

          const handleGenerate = async () => {
            if (!contractTemplate) { alert("Lütfen bir sözleşme şablonu seçin."); return; }
            if (!contractData.party1_id) { alert("Lütfen 1. Taraf şirketini seçin."); return; }
            setContractGenerating(true);
            try {
              const token = localStorage.getItem("sns_token");
              const r = await fetch("/contracts/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ templateId: contractTemplate.id, data: dataWithCompany }),
              });
              if (!r.ok) { const e = await r.json(); alert("Hata: " + e.error); return; }
              const blob = await r.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `sozlesme_${contractTemplate.name}_${new Date().toLocaleDateString("tr-TR").replace(/\./g,"-")}.pdf`;
              a.click(); URL.revokeObjectURL(url);
            } catch (e) { alert("Hata: " + e.message); }
            finally { setContractGenerating(false); }
          };

          const handleUpload = async () => {
            if (!contractUploadFile) { alert("Dosya seçin."); return; }
            setContractUploading(true);
            try {
              const token = localStorage.getItem("sns_token");
              const fd = new FormData();
              fd.append("file", contractUploadFile);
              fd.append("name", contractUploadName || contractUploadFile.name.replace(/\.docx$/i,""));
              const r = await fetch("/contracts/templates", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
              const d = await r.json();
              if (!r.ok) { alert("Hata: " + d.error); return; }
              alert(t("contract_uploadedMsg", d.variables.join(", ")));
              setContractUploadFile(null); setContractUploadName("");
              const r2 = await fetch("/contracts/templates", { headers: { Authorization: `Bearer ${token}` } });
              setContractTemplates(await r2.json());
            } catch(e) { alert("Hata: " + e.message); }
            finally { setContractUploading(false); }
          };

          const deleteTemplate = async (id) => {
            if (!confirm(t("contract_deleteConfirm"))) return;
            const token = localStorage.getItem("sns_token");
            await fetch(`/contracts/templates/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
            setContractTemplates(prev => prev.filter(t => t.id !== id));
            if (contractTemplate?.id === id) setContractTemplate(null);
          };

          const field = (label, key, opts = {}) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4, fontWeight: 600 }}>{label}</div>
              {opts.textarea ? (
                <textarea value={contractData[key] || ""} onChange={e => setContractData(p => ({ ...p, [key]: e.target.value }))}
                  rows={2} placeholder={opts.placeholder || ""}
                  style={{ width: "100%", padding: "8px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
              ) : (
                <input value={contractData[key] || ""} onChange={e => setContractData(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={opts.placeholder || ""}
                  style={{ width: "100%", padding: "8px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              )}
            </div>
          );

          return (
            <div style={{ animation: "slideIn .3s ease", maxWidth: 780 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{t("contract_title")}</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setContractView(contractView === "form" ? "templates" : "form")}
                    style={{ padding: "7px 14px", background: contractView === "templates" ? colors.primary : `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 7, color: contractView === "templates" ? "#fff" : colors.primaryLight, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {contractView === "form" ? t("contract_manageTemplates") : t("contract_backToForm")}
                  </button>
                </div>
              </div>

              {contractView === "templates" ? (
                <div>
                  {/* Upload new template */}
                  <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 18, marginBottom: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t("contract_uploadTitle")}</div>
                    <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
                      {t("contract_uploadHint", "@@variable_name@@")}<br/>
                      e.g. <code style={{ background: colors.bg, padding: "1px 5px", borderRadius: 3 }}>@@party2_name@@</code>, <code style={{ background: colors.bg, padding: "1px 5px", borderRadius: 3 }}>@@program_name@@</code>, <code style={{ background: colors.bg, padding: "1px 5px", borderRadius: 3 }}>@@iban@@</code>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{t("contract_templateName")}</div>
                        <input value={contractUploadName} onChange={e => setContractUploadName(e.target.value)}
                          placeholder="Örn: Yıllık Danışmanlık"
                          style={{ width: "100%", padding: "8px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{t("contract_fileDocx")}</div>
                        <input type="file" accept=".docx" onChange={e => setContractUploadFile(e.target.files[0])}
                          style={{ width: "100%", padding: "6px 8px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                      </div>
                      <button onClick={handleUpload} disabled={contractUploading || !contractUploadFile}
                        style={{ padding: "8px 18px", background: colors.primary, border: "none", borderRadius: 7, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: contractUploading ? 0.6 : 1, whiteSpace: "nowrap" }}>
                        {contractUploading ? t("contract_uploading") : t("contract_upload")}
                      </button>
                    </div>
                  </div>

                  {/* Template list */}
                  <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${colors.border}`, fontSize: 13, fontWeight: 700 }}>{t("contract_loadedTemplates", contractTemplates.length)}</div>
                    {contractTemplates.length === 0 ? (
                      <div style={{ padding: 30, textAlign: "center", color: colors.textMuted, fontSize: 13 }}>{t("contract_noTemplates")}</div>
                    ) : contractTemplates.map(tpl => (
                      <div key={tpl.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${colors.border}` }}>
                        <FileTextIcon size={16} color={colors.primary} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{tpl.name}</div>
                          <div style={{ fontSize: 11, color: colors.textMuted }}>
                            {t("contract_variables")}: {tpl.variables.length > 0 ? tpl.variables.map(v => `@@${v}@@`).join(", ") : "—"} · {new Date(tpl.created_at).toLocaleDateString("tr-TR")}
                          </div>
                        </div>
                        <button onClick={() => { setContractTemplate(tpl); setContractView("form"); }}
                          style={{ padding: "5px 12px", background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 6, color: colors.primaryLight, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          {t("contract_select")}
                        </button>
                        <button onClick={() => deleteTemplate(tpl.id)}
                          style={{ padding: "5px 10px", background: "rgba(229,115,115,0.12)", border: "1px solid rgba(229,115,115,0.3)", borderRadius: 6, color: "#e57373", fontSize: 12, cursor: "pointer" }}>
                          {t("contract_delete")}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  {/* Left column */}
                  <div>
                    {/* Template selector */}
                    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("contract_sectionTemplate")}</div>
                      <select value={contractTemplate?.id || ""} onChange={e => setContractTemplate(contractTemplates.find(t => String(t.id) === e.target.value) || null)}
                        style={{ width: "100%", padding: "8px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none" }}>
                        <option value="">{ t("contract_selectTemplate")}</option>
                        {contractTemplates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                      </select>
                      {contractTemplate && (
                        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
                          Değişkenler: {contractTemplate.variables.map(v => `@@${v}@@`).join(", ") || "yok"}
                        </div>
                      )}
                    </div>

                    {/* Party 1 */}
                    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("contract_sectionParty1")}</div>
                      <select value={contractData.party1_id} onChange={e => setContractData(p => ({ ...p, party1_id: e.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none" }}>
                        <option value="">{t("contract_selectCompany")}</option>
                        {contractCompanies.map(c => <option key={c.id} value={c.id}>{c.short}</option>)}
                      </select>
                      {selectedCompany && (
                        <div style={{ marginTop: 10, padding: 10, background: colors.bg, borderRadius: 6, fontSize: 12, color: colors.textMuted, lineHeight: 1.8 }}>
                          <div>{selectedCompany.name}</div>
                          <div>{selectedCompany.tax_office} / {selectedCompany.tax_no}</div>
                          <div>{selectedCompany.address}</div>
                          <div style={{ color: colors.primary, fontWeight: 600 }}>IBAN: {selectedCompany.iban}</div>
                        </div>
                      )}
                    </div>

                    {/* Contract details */}
                    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("contract_sectionDetails")}</div>
                      {field(t("contract_programName"), "program_name", { placeholder: "e.g. SoGreen" })}
                      {field(t("contract_downPayment"), "down_payment", { placeholder: "e.g. 50.000" })}
                      {field(t("contract_successBonus"), "success_bonus", { placeholder: "e.g. 5" })}
                      {field(t("contract_contractDate"), "contract_date", { placeholder: t("contract_datePlaceholder") })}
                    </div>
                  </div>

                  {/* Right column */}
                  <div>
                    {/* Party 2 */}
                    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("contract_sectionParty2")}</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "5px 10px", background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 6 }}>
                          <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleOcr(e.target.files[0]); }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: colors.primaryLight }}>{contractOcrLoading ? t("contract_ocrLoading") : t("contract_ocrBtn")}</span>
                        </label>
                      </div>
                      {field(t("contract_party2Name"), "party2_name", { placeholder: t("contract_party2NamePh") })}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4, fontWeight: 600 }}>{t("contract_taxOffice")}</div>
                          <input value={contractData.party2_tax_office || ""} onChange={e => setContractData(p => ({ ...p, party2_tax_office: e.target.value }))}
                            placeholder="Örn: Çankaya"
                            style={{ width: "100%", padding: "8px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4, fontWeight: 600 }}>{t("contract_taxNo")}</div>
                          <input value={contractData.party2_tax_no || ""} onChange={e => setContractData(p => ({ ...p, party2_tax_no: e.target.value }))}
                            placeholder="10 digits"
                            style={{ width: "100%", padding: "8px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                        </div>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        {field(t("contract_address"), "party2_address", { placeholder: "...", textarea: true })}
                      </div>
                    </div>

                    {/* Party 3 (optional) */}
                    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("contract_sectionParty3")}</div>
                      {field(t("contract_party3Name"), "party3_name", { placeholder: "..." })}
                    </div>

                    {/* Payment schedule */}
                    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t("contract_sectionSchedule")}</div>
                        <button onClick={() => setContractData(p => ({ ...p, payment_schedule: [...p.payment_schedule, { date: "", amount: "" }] }))}
                          style={{ padding: "4px 10px", background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 5, color: colors.primaryLight, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          {t("contract_addRow")}
                        </button>
                      </div>
                      {contractData.payment_schedule.length === 0 ? (
                        <div style={{ fontSize: 12, color: colors.textMuted, textAlign: "center", padding: "10px 0" }}>{t("contract_scheduleEmpty")}</div>
                      ) : contractData.payment_schedule.map((row, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                          <input value={row.date} onChange={e => setContractData(p => { const s = [...p.payment_schedule]; s[i] = { ...s[i], date: e.target.value }; return { ...p, payment_schedule: s }; })}
                            placeholder={t("contract_datePh")}
                            style={{ flex: 1, padding: "7px 8px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 5, color: colors.text, fontSize: 12, outline: "none" }} />
                          <input value={row.amount} onChange={e => setContractData(p => { const s = [...p.payment_schedule]; s[i] = { ...s[i], amount: e.target.value }; return { ...p, payment_schedule: s }; })}
                            placeholder={t("contract_amountPh")}
                            style={{ flex: 1, padding: "7px 8px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 5, color: colors.text, fontSize: 12, outline: "none" }} />
                          <button onClick={() => setContractData(p => ({ ...p, payment_schedule: p.payment_schedule.filter((_, j) => j !== i) }))}
                            style={{ padding: "5px 8px", background: "rgba(229,115,115,0.12)", border: "1px solid rgba(229,115,115,0.3)", borderRadius: 5, color: "#e57373", fontSize: 12, cursor: "pointer" }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Generate button — full width */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <button onClick={handleGenerate} disabled={contractGenerating || !contractTemplate || !contractData.party1_id}
                      style={{ width: "100%", padding: "13px", background: colors.primary, border: "none", borderRadius: 8, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: (contractGenerating || !contractTemplate || !contractData.party1_id) ? 0.6 : 1 }}>
                      {contractGenerating ? t("contract_generating") : t("contract_generate")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {view === "settings" && !isAdmin && (
          <div style={{ animation: "slideIn .3s ease", maxWidth: 600 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("settings_title")}</h1>
            <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 24 }}>{t("settings_subtitle_user")}</p>
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("settings_sendgrid")}</h3>
              <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>{t("settings_sendgridSub_user")}</p>
              {[
                { label: t("settings_apiKey"), key: "sendgridApiKey", type: "password", placeholder: "SG.xxxxxxxxxxxxxxxxxxxx" },
                { label: t("settings_fromName"), key: "sendgridFromName", placeholder: "Your Name" },
              ].map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{f.label}</span>
                  <input
                    value={settings[f.key] || ""}
                    type={f.type || "text"}
                    placeholder={f.placeholder || ""}
                    onChange={(e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", textAlign: "right", width: 280 }}
                  />
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
                <span style={{ fontSize: 12, color: colors.textMuted }}>{t("settings_fromEmail")}</span>
                <span style={{ fontSize: 12, color: colors.text }}>{authUser?.email}</span>
              </div>
            </div>
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("settings_monday")}</h3>
              <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>{t("settings_mondaySub_user")}</p>
              {[
                { label: t("settings_apiKey"), key: "mondayApiKey", type: "password", placeholder: "eyJhbGci..." },
                { label: mondayBoardType === "companies" ? "Companies Board ID" : "Contacts Board ID", key: mondayBoardType === "companies" ? "mondayCompaniesBoardId" : "mondayBoardId", placeholder: "1234567890" },
              ].map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{f.label}</span>
                  <input
                    value={settings[f.key] || ""}
                    type={f.type || "text"}
                    placeholder={f.placeholder || ""}
                    onChange={(e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", textAlign: "right", width: 280 }}
                  />
                </div>
              ))}
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8, fontStyle: "italic" }}>
                Switch between Contacts / Companies in the Monday tab to configure each board ID.
              </div>
            </div>

          </div>
        )}
        {view === "settings" && isAdmin && (
          <div style={{ animation: "slideIn .3s ease", maxWidth: 600 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t("settings_title")}</h1>
            <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 24 }}>{t("settings_subtitle_admin")}</p>
            {/* SendGrid Email */}
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("settings_sendgrid")} <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>(bulk email campaigns)</span></h3>
              <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>{t("settings_sendgridSub_admin")}</p>
              {[
                { label: t("settings_apiKey"), key: "sendgridApiKey", type: "password", placeholder: "SG.xxxxxxxxxxxxxxxxxxxx" },
                { label: t("settings_fromEmail"), key: "sendgridFromEmail", placeholder: "info@sunandsun.com.tr" },
                { label: t("settings_fromName"), key: "sendgridFromName", placeholder: "Sun & Sun International" },
              ].map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{f.label}</span>
                  <input
                    value={settings[f.key] || ""}
                    type={f.type || "text"}
                    placeholder={f.placeholder || ""}
                    onChange={(e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", textAlign: "right", width: 280 }}
                  />
                </div>
              ))}
            </div>

            {/* Monday.com */}
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("settings_mondayIntegration")}</h3>
              <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>{t("settings_mondaySub_admin")}</p>
              {[
                { label: t("settings_apiKey"), key: "mondayApiKey", type: "password", placeholder: "eyJhbGci..." },
                { label: mondayBoardType === "companies" ? "Companies Board ID" : "Contacts Board ID", key: mondayBoardType === "companies" ? "mondayCompaniesBoardId" : "mondayBoardId", placeholder: "1234567890" },
              ].map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{f.label}</span>
                  <input
                    value={settings[f.key] || ""}
                    type={f.type || "text"}
                    placeholder={f.placeholder || ""}
                    onChange={(e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", textAlign: "right", width: 280 }}
                  />
                </div>
              ))}
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8, fontStyle: "italic" }}>
                Switch between Contacts / Companies in the Monday tab to configure each board ID.
              </div>
            </div>

            {/* Sun Group Companies */}
            {(() => {
              const companies   = settingsCompanies;
              const editingId   = settingsEditingId;
              const editDraft   = settingsEditDraft;
              const addDraft    = settingsAddDraft;
              const showAdd     = settingsShowAdd;
              const ocrLoading  = settingsOcrLoading;
              const runOcr      = settingsRunOcr;
              const saveEdit    = settingsSaveEdit;
              const addCompany  = settingsAddCompany;
              const deleteCompany = settingsDeleteCompany;
              const companyFields = [
                { key: "name",       label: t("settings_companyFullName"), full: true },
                { key: "short",      label: t("settings_companyShort") },
                { key: "tax_office", label: t("settings_companyTaxOffice") },
                { key: "tax_no",     label: t("settings_companyTaxNo") },
                { key: "address",    label: t("settings_companyAddress"),  full: true },
                { key: "iban",       label: t("settings_companyIban") },
              ];
              return (
                <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 18, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{t("settings_companies")} <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>{t("settings_companiesSub")}</span></h3>
                    <button onClick={() => setSettingsShowAdd(p => !p)} style={{ padding: "5px 12px", background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 6, color: colors.primaryLight, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {showAdd ? t("settings_cancelAdd") : t("settings_addCompany")}
                    </button>
                  </div>

                  {showAdd && (
                    <div style={{ background: colors.bg, borderRadius: 8, padding: 14, marginBottom: 14, border: `1px solid ${colors.border}` }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "5px 10px", background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 6, marginBottom: 12 }}>
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) runOcr(e.target.files[0], setSettingsAddDraft); }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: colors.primaryLight }}>{ocrLoading ? t("contract_ocrLoading") : t("contract_ocrBtn")}</span>
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                        {companyFields.map(f => (
                          <div key={f.key} style={{ gridColumn: f.full ? "1/-1" : "auto" }}>
                            <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 3 }}>{f.label}</div>
                            <input value={addDraft[f.key]} onChange={e => setSettingsAddDraft(p => ({ ...p, [f.key]: e.target.value }))}
                              style={{ width: "100%", padding: "7px 9px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 5, color: colors.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                          </div>
                        ))}
                      </div>
                      <button onClick={addCompany} style={{ padding: "7px 16px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("settings_save")}</button>
                    </div>
                  )}

                  {companies.map(c => (
                    <div key={c.id} style={{ borderBottom: `1px solid ${colors.border}`, padding: "12px 0" }}>
                      {editingId === c.id ? (
                        <div>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "5px 10px", background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 6, marginBottom: 10 }}>
                            <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) runOcr(e.target.files[0], setSettingsEditDraft); }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: colors.primaryLight }}>{ocrLoading ? t("contract_ocrLoading") : t("contract_ocrBtn")}</span>
                          </label>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            {companyFields.map(f => (
                              <div key={f.key} style={{ gridColumn: f.full ? "1/-1" : "auto" }}>
                                <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 3 }}>{f.label}</div>
                                <input value={editDraft[f.key] || ""} onChange={e => setSettingsEditDraft(p => ({ ...p, [f.key]: e.target.value }))}
                                  style={{ width: "100%", padding: "7px 9px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 5, color: colors.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEdit(c.id)} style={{ padding: "6px 14px", background: colors.primary, border: "none", borderRadius: 5, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("settings_save")}</button>
                            <button onClick={() => setSettingsEditingId(null)} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 5, color: colors.textMuted, fontSize: 12, cursor: "pointer" }}>{t("settings_cancelAdd")}</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.short || c.name}</div>
                            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{c.name}</div>
                            <div style={{ fontSize: 11, color: colors.textMuted }}>{c.tax_office} {c.tax_no ? `/ ${c.tax_no}` : ""}</div>
                            {c.iban && <div style={{ fontSize: 11, color: colors.primary, fontWeight: 600 }}>IBAN: {c.iban}</div>}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button onClick={() => { setSettingsEditingId(c.id); setSettingsEditDraft({ ...c }); }} style={{ padding: "5px 10px", background: `${colors.primary}22`, border: `1px solid ${colors.primary}44`, borderRadius: 5, color: colors.primaryLight, fontSize: 11, cursor: "pointer" }}>{t("settings_edit")}</button>
                            <button onClick={() => deleteCompany(c.id)} style={{ padding: "5px 8px", background: "rgba(229,115,115,0.12)", border: "1px solid rgba(229,115,115,0.3)", borderRadius: 5, color: "#e57373", fontSize: 11, cursor: "pointer" }}>{t("settings_companyDelete")}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Twilio Cold Calling (Test Mode) */}
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("settings_twilio")} <span style={{ fontSize: 11, color: colors.success, fontWeight: 400 }}>{t("settings_twilioRecommended")}</span></h3>
              <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>{t("settings_twilioSub")}</p>
              {[
                { label: t("settings_accountSid"), key: "twilioAccountSid", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
                { label: t("settings_authToken"), key: "twilioAuthToken", type: "password", placeholder: "Your Twilio Auth Token" },
                { label: t("settings_fromNumber"), key: "twilioFromNumber", placeholder: "+1xxxxxxxxxx (your Twilio number)" },
              ].map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{f.label}</span>
                  <input
                    value={settings[f.key] || ""}
                    type={f.type || "text"}
                    placeholder={f.placeholder || ""}
                    onChange={(e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", textAlign: "right", width: 280 }}
                  />
                </div>
              ))}
              <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 12 }}>{t("settings_twilioNote")}</p>
            </div>

            {/* Vapi Cold Calling — custom section with textarea for prompt */}
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t("settings_vapi")} <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>{t("settings_vapiUpgradeNeeded")}</span></h3>
              <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>{t("settings_vapiSub")}</p>
              {[
                { label: t("settings_apiKey"), key: "vapiApiKey", type: "password", placeholder: "vapi_..." },
                { label: t("settings_phoneNumberId"), key: "vapiPhoneNumberId", placeholder: "From Vapi dashboard → Phone Numbers" },
                { label: t("settings_firstMessage"), key: "vapiFirstMessage", placeholder: "Hello, I'm calling from Sun&Sun..." },
              ].map((f) => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{f.label}</span>
                  <input
                    value={settings[f.key] || ""}
                    type={f.type || "text"}
                    placeholder={f.placeholder || ""}
                    onChange={(e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", textAlign: "right", width: 280 }}
                  />
                </div>
              ))}
              {/* Voice provider + voice picker */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                <div>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{t("settings_voiceProvider")}</span>
                  <span style={{ fontSize: 10, color: colors.success, marginLeft: 8 }}>
                    {settings.vapiVoiceProvider === "openai" ? "✓ Free with Vapi credits" : settings.vapiVoiceProvider === "11labs" ? "Requires ElevenLabs account" : ""}
                  </span>
                </div>
                <select
                  value={settings.vapiVoiceProvider || "openai"}
                  onChange={(e) => setSettings((p) => ({ ...p, vapiVoiceProvider: e.target.value, vapiVoice: e.target.value === "openai" ? "alloy" : "" }))}
                  style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", width: 180 }}
                >
                  <option value="openai">OpenAI TTS (recommended)</option>
                  <option value="11labs">ElevenLabs (most human)</option>
                  <option value="deepgram">Deepgram Aura (fast)</option>
                  <option value="azure">Azure Neural</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                <div>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{t("settings_voice")}</span>
                  {settings.vapiVoiceProvider === "openai" && (
                    <span style={{ fontSize: 10, color: colors.textDim, marginLeft: 8 }}>alloy · echo · fable · onyx · nova · shimmer</span>
                  )}
                </div>
                {settings.vapiVoiceProvider === "openai" ? (
                  <select
                    value={settings.vapiVoice || "alloy"}
                    onChange={(e) => setSettings((p) => ({ ...p, vapiVoice: e.target.value }))}
                    style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", width: 180 }}
                  >
                    <option value="alloy">alloy (neutral)</option>
                    <option value="echo">echo (male, clear)</option>
                    <option value="fable">fable (expressive)</option>
                    <option value="onyx">onyx (deep male)</option>
                    <option value="nova">nova (female, warm)</option>
                    <option value="shimmer">shimmer (female, soft)</option>
                  </select>
                ) : (
                  <input
                    value={settings.vapiVoice || ""}
                    placeholder={settings.vapiVoiceProvider === "11labs" ? "e.g. elliot, rachel" : settings.vapiVoiceProvider === "deepgram" ? "e.g. aura-asteria-en" : "voice ID"}
                    onChange={(e) => setSettings((p) => ({ ...p, vapiVoice: e.target.value }))}
                    style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", textAlign: "right", width: 280 }}
                  />
                )}
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>{t("settings_vapiPromptLabel")}</div>
                <textarea
                  value={settings.vapiPrompt || ""}
                  onChange={(e) => setSettings((p) => ({ ...p, vapiPrompt: e.target.value }))}
                  style={{ width: "100%", minHeight: 140, padding: 12, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }}
                />
              </div>
            </div>

            {[
              { titleKey: "settings_lusha", fields: [
                { label: t("settings_apiProvider"), value: "Lusha (lusha.com)", disabled: true },
                { label: t("settings_apiKey"), key: "lushaApiKey", type: "password" },
              ]},
              { titleKey: "settings_snov", fields: [
                { label: t("settings_apiProvider"), value: "Snov.io (snov.io)", disabled: true },
                { label: t("settings_clientId"), key: "snovClientId" },
                { label: t("settings_clientSecret"), key: "snovClientSecret", type: "password" },
              ]},
              { titleKey: "settings_scoring", fields: [
                { label: t("settings_minCompanySize"), key: "minCompanySize" },
                { label: t("settings_priorityIndustries"), key: "priorityIndustries" },
                { label: t("settings_decisionMakerBoost"), key: "decisionMakerBoost" },
              ]},
              { titleKey: "settings_notifications", fields: [
                { label: t("settings_emailNotifications"), key: "emailNotifications" },
                { label: t("settings_notifyNewLeads"), key: "notifyNewLeads" },
                { label: t("settings_dailySummary"), key: "dailySummary" },
              ]},
            ].map((section) => (
              <div key={section.titleKey} style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{t(section.titleKey)}</h3>
                {section.fields.map((f) => (
                  <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>{f.label}</span>
                    <input
                      value={f.disabled ? f.value : (settings[f.key] || "")}
                      type={f.type || "text"}
                      disabled={f.disabled}
                      placeholder={f.placeholder || ""}
                      onChange={f.disabled ? undefined : (e) => setSettings((p) => ({ ...p, [f.key]: e.target.value }))}
                      style={{ padding: "6px 10px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", textAlign: "right", width: 220 }}
                    />
                  </div>
                ))}
              </div>
            ))}

            {/* ══ ADMIN: USER MANAGEMENT ══ */}
            {authUser?.role === "admin" && (
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{t("settings_userMgmt")}</h3>
                    <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>{t("settings_userMgmtSub")}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={umFetch} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 11, cursor: "pointer" }}>{t("settings_refresh")}</button>
                    <button onClick={() => { setShowAddUser(true); setUmError(""); setUmSuccess(""); }} style={{ padding: "6px 14px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{t("settings_addUser")}</button>
                  </div>
                </div>

                {umError && <div style={{ background: "rgba(220,53,69,0.1)", border: "1px solid rgba(220,53,69,0.25)", borderRadius: 6, padding: "8px 12px", color: "#e57373", fontSize: 12, marginBottom: 12 }}>⚠ {umError}</div>}
                {umSuccess && <div style={{ background: "rgba(67,160,71,0.1)", border: "1px solid rgba(67,160,71,0.25)", borderRadius: 6, padding: "8px 12px", color: "#81c784", fontSize: 12, marginBottom: 12 }}>✓ {umSuccess}</div>}

                {showAddUser && (
                  <div style={{ background: colors.bg, borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: colors.text }}>{t("settings_newUser")}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      {[
                        { label: t("settings_fullName"), key: "name", placeholder: "Ahmet Yılmaz" },
                        { label: t("settings_email"), key: "email", placeholder: "ahmet@sunandsun.com.tr" },
                        { label: t("settings_password"), key: "password", placeholder: t("modal_passwordPlaceholder"), type: "password" },
                      ].map((f) => (
                        <div key={f.key}>
                          <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{f.label}</div>
                          <input
                            type={f.type || "text"}
                            value={newUser[f.key]}
                            placeholder={f.placeholder}
                            onChange={(e) => setNewUser((p) => ({ ...p, [f.key]: e.target.value }))}
                            style={{ width: "100%", padding: "7px 10px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none", boxSizing: "border-box" }}
                          />
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{t("settings_role")}</div>
                        <select
                          value={newUser.role}
                          onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
                          style={{ width: "100%", padding: "7px 10px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none" }}
                        >
                          <option value="user">{t("settings_user")}</option>
                          <option value="admin">{t("settings_admin")}</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={umAddUser} style={{ padding: "7px 16px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t("settings_save")}</button>
                      <button onClick={() => { setShowAddUser(false); setNewUser({ name: "", email: "", password: "", role: "user" }); }} style={{ padding: "7px 14px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 12, cursor: "pointer" }}>{t("settings_cancel")}</button>
                    </div>
                  </div>
                )}

                {umLoading ? (
                  <div style={{ textAlign: "center", padding: 24, color: colors.textMuted, fontSize: 13 }}>{t("settings_loading")}</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                          {[t("settings_colFullName"), t("settings_colEmail"), t("settings_colRole"), t("settings_colLastLogin"), ""].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {umUsers.map((u) => (
                          <tr key={u.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                            <td style={{ padding: "10px 10px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: colors.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                                  {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <span style={{ fontWeight: 500 }}>{u.name}</span>
                                {u.id === authUser.id && <span style={{ fontSize: 9, background: "rgba(8,143,196,0.15)", color: colors.primary, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{t("settings_you")}</span>}
                              </div>
                            </td>
                            <td style={{ padding: "10px 10px", color: colors.textMuted }}>{u.email}</td>
                            <td style={{ padding: "10px 10px" }}>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: u.role === "admin" ? "rgba(8,143,196,0.15)" : "rgba(255,255,255,0.06)", color: u.role === "admin" ? colors.primary : colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                {u.role === "admin" ? t("settings_admin") : t("settings_user")}
                              </span>
                            </td>
                            <td style={{ padding: "10px 10px", color: colors.textMuted, fontSize: 11 }}>
                              {u.last_login ? new Date(u.last_login).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td style={{ padding: "10px 10px" }}>
                              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                <button
                                  onClick={() => { setPwModal({ id: u.id, name: u.name }); setNewPw(""); setNewPwError(""); }}
                                  style={{ padding: "4px 10px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 5, color: colors.textMuted, fontSize: 11, cursor: "pointer" }}
                                >
                                  {t("settings_changePassword")}
                                </button>
                                {u.id !== authUser.id && (
                                  <button
                                    onClick={() => umDeleteUser(u.id, u.name)}
                                    style={{ padding: "4px 10px", background: "transparent", border: "1px solid rgba(220,53,69,0.3)", borderRadius: 5, color: "#e57373", fontSize: 11, cursor: "pointer" }}
                                  >
                                    {t("settings_deleteUser")}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {umUsers.length === 0 && !umLoading && (
                          <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: colors.textMuted, fontSize: 12 }}>{t("settings_noUsers")}</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      {pwModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setPwModal(null)}>
          <div style={{ background: colors.surface, borderRadius: 12, padding: 28, width: 360, border: `1px solid ${colors.border}` }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t("modal_changePassword")}</h3>
            <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 20 }}>{pwModal.name}</p>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>{t("modal_newPassword")}</div>
              <input
                type="password"
                value={newPw}
                placeholder={t("modal_passwordPlaceholder")}
                onChange={(e) => setNewPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && umChangePw()}
                autoFocus
                style={{ width: "100%", padding: "9px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
              {newPwError && <div style={{ fontSize: 11, color: "#e57373", marginTop: 6 }}>⚠ {newPwError}</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={umChangePw} style={{ flex: 1, padding: "9px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{t("modal_save")}</button>
              <button onClick={() => setPwModal(null)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 13, cursor: "pointer" }}>{t("modal_cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ IMPORT XLS MODAL ══════════ */}
      {showImportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowImportModal(false)}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: 32, width: 560, border: `1px solid ${colors.border}`, animation: "slideIn .2s ease" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("modal_importTitle")}</h2>
              <button onClick={() => setShowImportModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted }}><XIcon size={20} /></button>
            </div>

            {!importStats ? (
              <div>
                <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>{t("modal_importDesc")}</p>
                <label style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  padding: "40px 20px", border: `2px dashed ${colors.borderLight}`, borderRadius: 12,
                  cursor: "pointer", color: colors.textMuted, fontSize: 13, gap: 8,
                }}>
                  <span style={{ fontSize: 32 }}>📂</span>
                  <span>{t("modal_selectFile")}</span>
                  <span style={{ fontSize: 11, color: colors.textDim }}>Afyonkarahisar.xls, Konya.xls, Bursa.xls, etc.</span>
                  <input type="file" accept=".xls,.xlsx" style={{ display: "none" }} onChange={e => handleXlsFile(e.target.files[0])} />
                </label>
              </div>
            ) : (
              <div>
                <div style={{ padding: 16, background: colors.bg, borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 12, color: colors.text }}>{importFileName}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {[
                      { label: t("modal_totalLeads"), value: importStats.total, color: colors.primary },
                      { label: t("modal_withContact"), value: importStats.withContact, color: colors.success },
                      { label: t("modal_withWebsite"), value: importStats.withWebsite, color: colors.accent },
                    ].map(s => (
                      <div key={s.label} style={{ background: colors.surface, borderRadius: 8, padding: 12, border: `1px solid ${colors.border}` }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 16 }}>{t("modal_preview")}</div>
                <div style={{ background: colors.bg, borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
                  {importPreview.slice(0, 5).map((l, i) => (
                    <div key={i} style={{ padding: "8px 12px", borderBottom: `1px solid ${colors.border}`, fontSize: 12, display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontWeight: 600, flex: 1 }}>{l.company}</span>
                      <span style={{ color: colors.textMuted, width: 80 }}>{l.city}</span>
                      <span style={{ color: colors.primaryLight, width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.email || l.phone || t("modal_noContact")}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => { setImportStats(null); setImportPreview([]); setImportFileName(""); }}
                    style={{ padding: "8px 20px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textMuted, cursor: "pointer", fontSize: 13, fontFamily: font }}>
                    {t("modal_changeFile")}
                  </button>
                  <button onClick={confirmImport}
                    style={{ padding: "8px 20px", background: colors.primary, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>
                    {t("modal_importN", importStats.total)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ ADD LEAD MODAL ══════════ */}
      {showAddModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowAddModal(false)}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: 32, width: 560, maxHeight: "90vh", overflowY: "auto", border: `1px solid ${colors.border}`, animation: "slideIn .2s ease" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t("modal_addLeadTitle")}</h2>
              <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted }}><XIcon size={20} /></button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { label: t("modal_firstName"), key: "firstName", placeholder: "Ahmet" },
                { label: t("modal_lastName"),  key: "lastName",  placeholder: "Yılmaz" },
                { label: t("modal_email"),     key: "email",     placeholder: "ahmet@company.com" },
                { label: t("modal_phone"),     key: "phone",     placeholder: "+90 5XX XXX XXXX" },
                { label: t("modal_company"),   key: "company",   placeholder: "Tekno Makina A.Ş." },
                { label: t("modal_linkedin"),  key: "linkedinUrl", placeholder: "linkedin.com/in/..." },
              ].map((f) => (
                <div key={f.key}>
                  <label style={{ display: "block", fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</label>
                  <input value={newLead[f.key]} onChange={(e) => setNewLead((p) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", fontFamily: font }} />
                </div>
              ))}

              {[
                { label: t("modal_jobTitle"),    key: "title",       options: JOB_TITLES },
                { label: t("modal_industry"),    key: "industry",    options: INDUSTRIES },
                { label: t("modal_city"),        key: "city",        options: CITIES },
                { label: t("modal_companySize"), key: "companySize", options: COMPANY_SIZES },
                { label: t("modal_source"),      key: "source",      options: ["LinkedIn Search", "LinkedIn Post Engagement", "LinkedIn Group", "Manual Entry"] },
              ].map((f) => (
                <div key={f.key}>
                  <label style={{ display: "block", fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</label>
                  <select value={newLead[f.key]} onChange={(e) => setNewLead((p) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: newLead[f.key] ? colors.text : colors.textDim, fontSize: 13, outline: "none", fontFamily: font }}>
                    <option value="">{t("leads_select")}</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("modal_notes")}</label>
              <textarea value={newLead.notes} onChange={(e) => setNewLead((p) => ({ ...p, notes: e.target.value }))} placeholder={t("modal_notesPlaceholder")}
                style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", minHeight: 70, fontFamily: font }} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAddModal(false)} style={{ padding: "8px 20px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textMuted, cursor: "pointer", fontSize: 13, fontFamily: font }}>{t("modal_cancel")}</button>
              <button onClick={submitNewLead} disabled={!newLead.firstName || !newLead.lastName || !newLead.company}
                style={{ padding: "8px 20px", background: !newLead.firstName || !newLead.lastName || !newLead.company ? colors.surfaceHover : colors.primary, border: "none", borderRadius: 8, color: !newLead.firstName || !newLead.lastName || !newLead.company ? colors.textDim : "#fff", cursor: !newLead.firstName || !newLead.lastName || !newLead.company ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>
                {t("modal_addLead")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ══════════ CALL STATUS MODAL ══════════ */}
      {showCallModal && activeCall && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div style={{ background: colors.surface, borderRadius: 20, padding: 32, width: 480, border: `1px solid ${colors.border}`, animation: "slideIn .2s ease" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: activeCall.status === "ended" ? `${colors.success}20` : activeCall.status === "error" ? `${colors.danger}20` : `${colors.primary}20`,
                animation: ["ringing", "in-progress", "dialing"].includes(activeCall.status) ? "pulse 1.5s infinite" : "none",
              }}>
                <PhoneCallIcon size={24} color={activeCall.status === "ended" ? colors.success : activeCall.status === "error" ? colors.danger : colors.primary} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {activeCall.lead.firstName} {activeCall.lead.lastName}
                </div>
                <div style={{ fontSize: 12, color: colors.textMuted }}>{activeCall.lead.title} · {activeCall.lead.company}</div>
              </div>
            </div>

            {/* Status */}
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 20,
                background: activeCall.status === "ended" ? `${colors.success}20` : activeCall.status === "error" ? `${colors.danger}20` : `${colors.primary}20`,
                color: activeCall.status === "ended" ? colors.success : activeCall.status === "error" ? colors.danger : colors.primaryLight,
                fontSize: 13, fontWeight: 600,
              }}>
                {activeCall.status === "dialing" && "📞 Dialing..."}
                {activeCall.status === "ringing" && "🔔 Ringing..."}
                {activeCall.status === "in-progress" && "🎙️ In progress..."}
                {activeCall.status === "ended" && `✅ Call ended${activeCall.outcome ? ` · ${activeCall.outcome}` : ""}`}
                {activeCall.status === "error" && `❌ Error: ${activeCall.errorMessage}`}
              </div>
            </div>

            {/* Live info */}
            <div style={{ background: colors.bg, borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 12, color: colors.textMuted }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{t("call_number")}</span>
                <span style={{ fontFamily: mono, color: colors.text }}>{activeCall.lead.phone}</span>
              </div>
              {activeCall.duration != null && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span>{t("call_duration")}</span>
                  <span style={{ color: colors.text }}>{activeCall.duration}s</span>
                </div>
              )}
            </div>

            {/* Transcript */}
            {activeCall.transcript && (
              <div style={{ background: colors.bg, borderRadius: 10, padding: 14, marginBottom: 20, maxHeight: 160, overflowY: "auto" }}>
                <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("call_transcript")}</div>
                <p style={{ fontSize: 12, color: colors.text, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{activeCall.transcript}</p>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              {activeCall.status !== "ended" && activeCall.status !== "error" && (
                <div style={{ fontSize: 12, color: colors.textDim, alignSelf: "center", marginRight: "auto" }}>{t("call_checking")}</div>
              )}
              <button
                onClick={endActiveCall}
                style={{ padding: "8px 20px", background: activeCall.status === "ended" || activeCall.status === "error" ? colors.primary : colors.danger, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}
              >
                {activeCall.status === "ended" || activeCall.status === "error" ? t("call_close") : t("call_dismiss")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}