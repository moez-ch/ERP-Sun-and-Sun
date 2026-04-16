import { useState, useEffect, useCallback, useRef } from "react";
import snsLogo from "./sns_logo.png";
import * as XLSX from "xlsx";
import LoginPage from "./LoginPage.jsx";

// ─── CONSTANTS & UTILITIES ───────────────────────────────────────
const INDUSTRIES = ["Manufacturing", "Software/IT", "Food & Beverage", "Tourism & Hospitality", "Textile & Fashion", "Agriculture", "Healthcare", "Education", "Energy", "Construction", "Automotive", "Defense"];
const JOB_TITLES = ["CEO", "Founder", "Managing Director", "COO", "Export Manager", "Business Development", "CTO", "General Manager", "Owner", "VP Operations"];
const CITIES = ["İstanbul", "Ankara", "İzmir", "Bursa", "Konya", "Antalya", "Gaziantep", "Kayseri", "Trabzon", "Mersin"];
const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];
const NEEDS = ["Turquality Consultancy", "KOSGEB Grants", "Export Development", "Digital Marketing", "EU Grants", "HR Consulting", "KVKK/GDPR Compliance", "Brand Strategy", "Investment Incentives", "TÜBİTAK Projects", "Lean Production", "Quality Management (ISO)"];
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
  const [settings, setSettings] = useState({
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
  });

  // ── EMAIL CAMPAIGN STATE ────────────────────────────────────────
  const [emailCampaigns, setEmailCampaigns] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sns_email_campaigns") || "[]"); } catch { return []; }
  });
  const [emailDraft, setEmailDraft] = useState({ subject: "", body: "" });
  const [emailFilter, setEmailFilter] = useState({ statuses: [], industries: [], hasEmail: true });
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState(null); // { sent, failed, errors }
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
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
    if (view === "settings" && authUser?.role === "admin") umFetch();
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

  // Persist leads to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("sns_leads", JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    localStorage.setItem("sns_email_campaigns", JSON.stringify(emailCampaigns));
  }, [emailCampaigns]);

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

  const sidebarItems = [
    { id: "dashboard", label: "Dashboard", icon: <BarChartIcon size={18} /> },
    { id: "leads", label: "Leads", icon: <UserIcon size={18} /> },
    { id: "pipeline", label: "Pipeline", icon: <BriefcaseIcon size={18} /> },
    { id: "calls", label: "Cold Calls", icon: <PhoneCallIcon size={18} />, badge: stats.totalCalls || null },
    ...(isAdmin ? [
      { id: "email", label: "Email", icon: <MailIcon size={18} /> },
      { id: "agent", label: "AI Agent", icon: <BotIcon size={18} /> },
      { id: "settings", label: "Settings", icon: <SettingsIcon size={18} /> },
    ] : []),
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
          <div style={{ fontSize: 10, color: colors.textDim, marginBottom: 8 }}>{leads.length} leads in database</div>
          <button
            onClick={handleLogout}
            style={{ width: "100%", padding: "7px 10px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textDim, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: font, textAlign: "left", transition: "all .15s" }}
            onMouseEnter={(e) => { e.target.style.borderColor = colors.danger; e.target.style.color = colors.danger; }}
            onMouseLeave={(e) => { e.target.style.borderColor = colors.border; e.target.style.color = colors.textDim; }}
          >
            ↩ Çıkış Yap
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
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
                <p style={{ color: colors.textMuted, fontSize: 13 }}>Overview of your lead pipeline and agent activity</p>
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowAddModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>
                    <PlusIcon size={14} /> Add Lead
                  </button>
                  <button onClick={() => setShowImportModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>
                    ↑ Import XLS
                  </button>
                  <button onClick={() => setView("agent")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: `linear-gradient(135deg, #7C3AED, #4F46E5)`, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font }}>
                    <BotIcon size={14} /> Run AI Agent
                  </button>
                </div>
              )}
            </div>

            {/* Row 1 — Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
              {[
                { label: "Total Leads", value: stats.total, color: colors.primary, sub: `${stats.new} new` },
                { label: "Qualified", value: stats.qualified, color: colors.success, sub: `${stats.total ? Math.round(stats.qualified / stats.total * 100) : 0}% of pipeline` },
                { label: "Won Deals", value: stats.won, color: colors.accent, sub: "closed successfully" },
                { label: "Avg Score", value: stats.avgScore, color: colors.primaryLight, sub: "lead quality" },
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
                <div style={{ fontSize: 11, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>Win Rate</div>
                {stats.winRate !== null ? (
                  <>
                    <div style={{ fontSize: 42, fontWeight: 800, color: stats.winRate >= 50 ? colors.success : colors.warning, lineHeight: 1 }}>{stats.winRate}%</div>
                    <div style={{ fontSize: 11, color: colors.textDim }}>{stats.won} won · {stats.lost} lost</div>
                    <div style={{ width: "100%", height: 6, background: colors.border, borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ width: `${stats.winRate}%`, height: "100%", background: stats.winRate >= 50 ? colors.success : colors.warning, borderRadius: 3, transition: "width .5s" }} />
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: colors.textDim }}>No Won/Lost leads yet</div>
                )}
              </div>
              {/* Score Distribution */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Score Distribution</div>
                {[
                  { label: "Hot (80+)", count: stats.hot, color: colors.success },
                  { label: "Warm (60–79)", count: stats.warm, color: colors.accent },
                  { label: "Cold (<60)", count: stats.cold, color: colors.danger },
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
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Call Activity</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Total Calls", value: stats.totalCalls, color: colors.primaryLight },
                    { label: "Completed", value: stats.completedCalls, color: colors.success },
                    { label: "Failed / Other", value: stats.totalCalls - stats.completedCalls, color: colors.danger },
                  ].map((row) => (
                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${colors.border}` }}>
                      <span style={{ fontSize: 12, color: colors.textMuted }}>{row.label}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: row.color }}>{row.value}</span>
                    </div>
                  ))}
                  {stats.mostCalledLead && stats.totalCalls > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 10, color: colors.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Most Called</div>
                      <div
                        onClick={() => { setSelectedLead(stats.mostCalledLead); setView("leads"); }}
                        style={{ fontSize: 12, color: colors.primaryLight, cursor: "pointer", fontWeight: 500 }}
                      >
                        {stats.mostCalledLead.firstName} {stats.mostCalledLead.lastName} ({stats.mostCalledLead.callHistory?.length || 0} calls)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 3 — Conversion Funnel */}
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Conversion Funnel</div>
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
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Pipeline Breakdown</div>
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
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Top Client Needs</div>
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
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Leads by Industry</div>
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
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Leads by City</div>
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
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Lead Source</div>
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
                  🔥 Hot Leads
                  <span style={{ fontSize: 10, color: colors.textDim, fontWeight: 400 }}>score 80+ · not closed</span>
                </div>
                {stats.hotLeads.length === 0 ? (
                  <div style={{ fontSize: 12, color: colors.textDim }}>No hot leads yet.</div>
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
                      <div style={{ fontSize: 9, color: colors.textDim }}>score</div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Recent Leads */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  🕐 Recently Added
                </div>
                {stats.recentLeads.length === 0 ? (
                  <div style={{ fontSize: 12, color: colors.textDim }}>No leads yet.</div>
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
          </div>
        )}

        {/* ══════════ LEADS TABLE ══════════ */}
        {view === "leads" && !selectedLead && (
          <div style={{ animation: "slideIn .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Leads</h1>
                <p style={{ color: colors.textMuted, fontSize: 13 }}>{filtered.length} of {leads.length} leads shown</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {isAdmin && (
                  <button onClick={() => setShowImportModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: colors.surface, color: colors.textMuted, border: `1px solid ${colors.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>
                    ↑ Import XLS
                  </button>
                )}
                <button onClick={() => setShowAddModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", background: colors.primary, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>
                  <PlusIcon size={16} /> Add Lead
                </button>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search leads by name, company, need..."
                  style={{ width: "100%", padding: "8px 12px 8px 32px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", position: "relative" }}
                />
                <span style={{ position: "absolute", left: 10, top: 10 }}><SearchIcon size={14} color={colors.textDim} /></span>
              </div>
              {[
                { label: "Industry", value: filterIndustry, set: setFilterIndustry, options: ["All", ...INDUSTRIES] },
                { label: "Status", value: filterStatus, set: setFilterStatus, options: ["All", ...LEAD_STATUSES] },
                { label: "City", value: filterCity, set: setFilterCity, options: ["All", ...CITIES] },
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
                    {["#", "Name", "Company", "Title", "Industry", "City", "Score", "Status", "Needs", "Contact"].map((h) => (
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
                          <option value="">— Select —</option>
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
                ← Back to Leads
              </button>
              <button
                onClick={() => settings.twilioAccountSid ? initiateTwilioCall(selectedLead) : initiateCall(selectedLead)}
                disabled={!selectedLead.phone}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: selectedLead.phone ? colors.success : colors.border, border: "none", borderRadius: 8, color: selectedLead.phone ? "#fff" : colors.textDim, cursor: selectedLead.phone ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: font, transition: "all .15s" }}
              >
                <PhoneCallIcon size={14} /> Cold Call {settings.twilioAccountSid ? "(Twilio)" : "(Vapi)"}
              </button>
              {isAdmin && (
                <button
                  onClick={() => { if (window.confirm(`Delete "${selectedLead.firstName} ${selectedLead.lastName}"? This cannot be undone.`)) { setLeads((prev) => prev.filter((l) => l.id !== selectedLead.id)); setSelectedLead(null); } }}
                  style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "transparent", border: `1px solid ${colors.danger}60`, borderRadius: 8, color: colors.danger, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: font, transition: "all .15s" }}
                >
                  🗑 Delete Lead
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
                  { icon: <MailIcon size={14} />, label: "Email", value: selectedLead.email },
                  { icon: <PhoneIcon size={14} />, label: "Phone", value: selectedLead.phone },
                  { icon: <LinkedInIcon size={14} />, label: "LinkedIn", value: selectedLead.linkedinUrl },
                  { icon: <BriefcaseIcon size={14} />, label: "Industry", value: selectedLead.industry },
                  { icon: <UserIcon size={14} />, label: "Company Size", value: selectedLead.companySize + " employees" },
                  { icon: <FilterIcon size={14} />, label: "Source", value: selectedLead.source },
                ].map((f, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
                    <span style={{ color: colors.textDim }}>{f.icon}</span>
                    <span style={{ fontSize: 12, color: colors.textMuted, width: 90 }}>{f.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{f.value}</span>
                  </div>
                ))}
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8 }}>Tags</div>
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
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Client Needs</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedLead.needs.map((n) => (
                      <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: `${colors.success}12`, borderRadius: 6, fontSize: 12, color: colors.success }}>
                        <span>✓</span> {n}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Status & Score</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                    <select value={selectedLead.status} onChange={(e) => { updateLead(selectedLead.id, { status: e.target.value }); setSelectedLead((p) => ({ ...p, status: e.target.value })); }}
                      style={{ padding: "6px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none" }}>
                      <option value="">— Select —</option>
                      {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span style={{ fontSize: 24, fontWeight: 700, color: selectedLead.score >= 80 ? colors.success : colors.accent }}>{selectedLead.score}</span>
                    <span style={{ fontSize: 11, color: colors.textDim }}>/ 100 lead score</span>
                  </div>
                  <div style={{ fontSize: 11, color: colors.textDim }}>Added: {selectedLead.dateAdded} · Last contact: {selectedLead.lastContact ?? "Never"}</div>
                </div>
                <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Notes</div>
                  <textarea
                    value={selectedLead.notes} placeholder="Add notes about this lead..."
                    onChange={(e) => { updateLead(selectedLead.id, { notes: e.target.value }); setSelectedLead((p) => ({ ...p, notes: e.target.value })); }}
                    style={{ width: "100%", minHeight: 100, padding: 12, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none", resize: "vertical", fontFamily: font }}
                  />
                </div>
                {/* Call History */}
                {selectedLead.callHistory?.length > 0 && (
                  <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <PhoneCallIcon size={14} color={colors.success} /> Call History
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
                              <summary style={{ fontSize: 11, color: colors.textMuted, cursor: "pointer" }}>View transcript</summary>
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
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Cold Calls</h1>
                <p style={{ color: colors.textMuted, fontSize: 13 }}>AI-powered outbound calling via Vapi — all call history across leads</p>
              </div>
              {!settings.twilioAccountSid && !settings.vapiApiKey && (
                <div style={{ padding: "10px 16px", background: `${colors.warning}15`, border: `1px solid ${colors.warning}40`, borderRadius: 10, fontSize: 12, color: colors.warning, maxWidth: 340 }}>
                  {isAdmin ? (
                    <>Add your <strong>Twilio</strong> or Vapi credentials in <button onClick={() => setView("settings")} style={{ background: "none", border: "none", color: colors.accent, cursor: "pointer", fontWeight: 600, padding: 0, fontSize: 12 }}>Settings</button> to enable calling.</>
                  ) : (
                    <>Ask an admin to configure Twilio or Vapi credentials to enable calling.</>
                  )}
                </div>
              )}
              {settings.twilioAccountSid && (
                <div style={{ padding: "6px 12px", background: `${colors.success}15`, border: `1px solid ${colors.success}40`, borderRadius: 8, fontSize: 11, color: colors.success }}>
                  ✓ Twilio connected
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
                    { label: "Total Calls", value: allCalls.length, color: colors.primary },
                    { label: "Completed", value: completed, color: colors.success },
                    { label: "No Answer", value: noAnswer, color: colors.warning },
                    { label: "Voicemail", value: voicemail, color: colors.textMuted },
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
                Leads with Phone Numbers ({leads.filter((l) => l.phone).length})
              </div>
              <div style={{ overflowY: "auto", maxHeight: 480 }}>
                {leads.filter((l) => l.phone).length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: colors.textDim, fontSize: 13 }}>No leads with phone numbers yet.</div>
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
                        {lead.callHistory?.length ? `${lead.callHistory.length} call${lead.callHistory.length > 1 ? "s" : ""}` : "Not called"}
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
                        <PhoneCallIcon size={13} /> Call
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
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Pipeline</h1>
            <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>Drag-free Kanban view of your leads by status</p>
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
                      {sLeads.length > 8 && <div style={{ fontSize: 11, color: colors.textDim, textAlign: "center", padding: 8 }}>+{sLeads.length - 8} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════ AI AGENT ══════════ */}
        {view === "agent" && !isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12 }}>
            <div style={{ fontSize: 36 }}>🔒</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Admin Access Required</div>
            <div style={{ fontSize: 13, color: colors.textMuted }}>The AI Agent is restricted to admin accounts.</div>
          </div>
        )}
        {view === "agent" && isAdmin && (
          <div style={{ animation: "slideIn .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>AI Scraping Agent</h1>
                <p style={{ color: colors.textMuted, fontSize: 13 }}>Configure and run the LinkedIn lead scraping agent</p>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={runSnovAgent} disabled={agentRunning}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", border: "none", borderRadius: 10, cursor: agentRunning ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, fontFamily: font, transition: "all .2s", background: agentRunning ? colors.surfaceHover : `linear-gradient(135deg, #7C3AED, #4F46E5)`, color: agentRunning ? colors.textDim : "#fff", boxShadow: agentRunning ? "none" : "0 4px 15px #7C3AED50" }}>
                  {agentRunning ? <><RefreshIcon size={16} /> Running...</> : <><BotIcon size={16} /> Run Snov.io</>}
                </button>
                <button onClick={runAgent} disabled={agentRunning}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", border: "none", borderRadius: 10, cursor: agentRunning ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700, fontFamily: font, transition: "all .2s", background: agentRunning ? colors.surfaceHover : `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, color: agentRunning ? colors.textDim : "#fff", boxShadow: agentRunning ? "none" : `0 4px 15px ${colors.primary}50` }}>
                  {agentRunning ? <><RefreshIcon size={16} /> Running...</> : <><BotIcon size={16} /> Run Lusha</>}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {/* Config Panel */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Search Configuration</h3>
                {[
                  { key: "titles", label: "Job Titles", placeholder: "CEO, Founder, Export Manager..." },
                  { key: "industries", label: "Industries", placeholder: "Manufacturing, Software..." },
                  { key: "cities", label: "Cities", placeholder: "İstanbul, Ankara, İzmir..." },
                  { key: "companySize", label: "Company Size", placeholder: "11-50, 51-200..." },
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
                  <label style={{ display: "block", fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Max Leads per Run</label>
                  <input
                    type="number" value={agentConfig.maxLeads}
                    onChange={(e) => setAgentConfig((p) => ({ ...p, maxLeads: Math.max(1, parseInt(e.target.value) || 1) }))}
                    style={{ width: 100, padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none" }}
                  />
                </div>
                <div style={{ marginTop: 16, padding: 12, background: `${colors.warning}10`, borderRadius: 8, border: `1px solid ${colors.warning}30` }}>
                  <div style={{ fontSize: 11, color: colors.warning, fontWeight: 600, marginBottom: 4 }}>⚠️ Important Notice</div>
                  <div style={{ fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
                    This agent uses Lusha's Prospecting API to find leads. Each contact revealed costs credits from your Lusha plan. Check your usage at lusha.com/dashboard.
                  </div>
                </div>
              </div>

              {/* Agent Log */}
              <div style={{ background: colors.surface, borderRadius: 12, border: `1px solid ${colors.border}`, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>Agent Log</h3>
                  {agentRunning && <span style={{ fontSize: 11, color: colors.success, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.success, animation: "pulse 1s infinite" }} /> Live</span>}
                </div>
                <div ref={logRef} style={{ flex: 1, padding: 16, overflowY: "auto", maxHeight: 420, fontFamily: mono, fontSize: 11, lineHeight: 1.8 }}>
                  {agentLog.length === 0 && (
                    <div style={{ color: colors.textDim, textAlign: "center", paddingTop: 60 }}>
                      <BotIcon size={40} color={colors.textDim} />
                      <p style={{ marginTop: 12 }}>Agent is idle. Click "Run Agent" to start scraping.</p>
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
                  fromEmail: settings.sendgridFromEmail,
                  fromName: settings.sendgridFromName,
                  subject: emailDraft.subject,
                  htmlBody: emailDraft.body.replace(/\n/g, "<br>"),
                  recipients: emailRecipients.map((l) => ({ email: l.email, name: `${l.firstName} ${l.lastName}`.trim() })),
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
                  <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Email Campaigns</h1>
                  <p style={{ color: colors.textMuted, fontSize: 13 }}>Send bulk emails to your leads via SendGrid</p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, marginBottom: 24 }}>
                {/* COMPOSE */}
                <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>Compose</h3>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Subject</div>
                    <input
                      value={emailDraft.subject}
                      onChange={(e) => setEmailDraft((p) => ({ ...p, subject: e.target.value }))}
                      placeholder="e.g. Turquality Programı Hakkında Bilgi"
                      style={{ width: "100%", padding: "10px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Body</div>
                    <textarea
                      value={emailDraft.body}
                      onChange={(e) => setEmailDraft((p) => ({ ...p, body: e.target.value }))}
                      placeholder={"Sayın [İsim],\n\nSun & Sun Danışmanlık olarak size ulaşıyoruz..."}
                      rows={14}
                      style={{ width: "100%", padding: "10px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }}
                    />
                    <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>Plain text. Line breaks are converted to &lt;br&gt; automatically.</div>
                  </div>

                  {/* Result banner */}
                  {emailResult && (
                    <div style={{ borderRadius: 8, padding: "12px 16px", marginBottom: 16, background: emailResult.failed === 0 ? "rgba(67,160,71,0.1)" : "rgba(220,53,69,0.1)", border: `1px solid ${emailResult.failed === 0 ? "rgba(67,160,71,0.25)" : "rgba(220,53,69,0.25)"}`, fontSize: 13 }}>
                      {emailResult.sent > 0 && <div style={{ color: "#81c784" }}>✓ {emailResult.sent} email(s) sent successfully</div>}
                      {emailResult.failed > 0 && <div style={{ color: "#e57373" }}>✗ {emailResult.failed} failed{emailResult.errors?.length ? `: ${emailResult.errors[0]}` : ""}</div>}
                    </div>
                  )}

                  <button
                    onClick={sendCampaign}
                    disabled={emailSending}
                    style={{ padding: "11px 24px", background: emailSending ? colors.border : colors.primary, border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, cursor: emailSending ? "not-allowed" : "pointer", fontFamily: font }}
                  >
                    {emailSending ? "Sending..." : `Send to ${emailRecipients.length} Lead${emailRecipients.length !== 1 ? "s" : ""} →`}
                  </button>
                </div>

                {/* FILTERS */}
                <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>Recipients</h3>

                  {/* Has email toggle */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${colors.border}` }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>Has email address</div>
                      <div style={{ fontSize: 11, color: colors.textDim }}>Only leads with an email</div>
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
                    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Filter by Status</div>
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
                    {emailFilter.statuses.length > 0 && <div style={{ fontSize: 10, color: colors.textDim, marginTop: 4 }}>All statuses if none selected</div>}
                  </div>

                  {/* Industry filter */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Filter by Industry</div>
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
                    <div style={{ fontSize: 12, color: colors.textMuted }}>leads selected</div>
                    <div style={{ fontSize: 11, color: colors.textDim, marginTop: 4 }}>{emailRecipients.filter((l) => l.email).length} with email address</div>
                  </div>

                  {/* Clear filters */}
                  {(emailFilter.statuses.length > 0 || emailFilter.industries.length > 0) && (
                    <button onClick={() => setEmailFilter({ statuses: [], industries: [], hasEmail: emailFilter.hasEmail })}
                      style={{ width: "100%", marginTop: 12, padding: "8px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 11, cursor: "pointer", fontFamily: font }}>
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>

              {/* CAMPAIGN HISTORY */}
              <div style={{ background: colors.surface, borderRadius: 12, padding: 24, border: `1px solid ${colors.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>Campaign History</h3>
                  {emailCampaigns.length > 0 && (
                    <button onClick={() => { if (window.confirm("Clear all campaign history?")) setEmailCampaigns([]); }}
                      style={{ padding: "4px 12px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 11, cursor: "pointer" }}>
                      Clear
                    </button>
                  )}
                </div>
                {emailCampaigns.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: colors.textDim, fontSize: 13 }}>No campaigns sent yet</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                        {["Date", "Subject", "Recipients", "Sent", "Failed", "Rate"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {emailCampaigns.map((c) => (
                        <tr key={c.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <td style={{ padding: "10px 10px", color: colors.textMuted }}>{new Date(c.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                          <td style={{ padding: "10px 10px", fontWeight: 500, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subject}</td>
                          <td style={{ padding: "10px 10px", color: colors.textMuted }}>{c.recipients}</td>
                          <td style={{ padding: "10px 10px", color: colors.success }}>{c.sent}</td>
                          <td style={{ padding: "10px 10px", color: c.failed > 0 ? "#e57373" : colors.textDim }}>{c.failed}</td>
                          <td style={{ padding: "10px 10px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: c.sent / c.recipients >= 0.9 ? "rgba(67,160,71,0.15)" : "rgba(255,167,38,0.15)", color: c.sent / c.recipients >= 0.9 ? colors.success : colors.accent }}>
                              {Math.round((c.sent / c.recipients) * 100)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })()}

        {view === "settings" && !isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 12 }}>
            <div style={{ fontSize: 36 }}>🔒</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Admin Access Required</div>
            <div style={{ fontSize: 13, color: colors.textMuted }}>Settings are restricted to admin accounts.</div>
          </div>
        )}
        {view === "settings" && isAdmin && (
          <div style={{ animation: "slideIn .3s ease", maxWidth: 600 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Settings</h1>
            <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 24 }}>Configure your ERP and agent settings</p>
            {/* SendGrid Email */}
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>SendGrid Email <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>(bulk email campaigns)</span></h3>
              <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>Sign up at sendgrid.com → Settings → API Keys → Create API Key (Full Access). Domain must be verified first.</p>
              {[
                { label: "API Key", key: "sendgridApiKey", type: "password", placeholder: "SG.xxxxxxxxxxxxxxxxxxxx" },
                { label: "From Email", key: "sendgridFromEmail", placeholder: "info@sunandsun.com.tr" },
                { label: "From Name", key: "sendgridFromName", placeholder: "Sun & Sun International" },
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

            {/* Twilio Cold Calling (Test Mode) */}
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Twilio Cold Calling <span style={{ fontSize: 11, color: colors.success, fontWeight: 400 }}>✓ Recommended for testing</span></h3>
              <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>Use your Twilio free trial to test calls. Find these in your <strong>Twilio Console → Account Info</strong>.</p>
              {[
                { label: "Account SID", key: "twilioAccountSid", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
                { label: "Auth Token", key: "twilioAuthToken", type: "password", placeholder: "Your Twilio Auth Token" },
                { label: "From Number", key: "twilioFromNumber", placeholder: "+1xxxxxxxxxx (your Twilio number)" },
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
              <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 12 }}>⚠️ Free trial only calls <strong>verified numbers</strong>. Verify your test number at <strong>Twilio Console → Verified Caller IDs</strong>.</p>
            </div>

            {/* Vapi Cold Calling — custom section with textarea for prompt */}
            <div style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Vapi Cold Calling <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>(human-like voice — upgrade required)</span></h3>
              <p style={{ fontSize: 11, color: colors.textMuted, marginBottom: 16 }}>Sign up free at vapi.ai — upgrade needed to use phone numbers.</p>
              {[
                { label: "API Key", key: "vapiApiKey", type: "password", placeholder: "vapi_..." },
                { label: "Phone Number ID", key: "vapiPhoneNumberId", placeholder: "From Vapi dashboard → Phone Numbers" },
                { label: "First Message (what AI says first)", key: "vapiFirstMessage", placeholder: "Hello, I'm calling from Sun&Sun..." },
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
                  <span style={{ fontSize: 12, color: colors.textMuted }}>Voice Provider</span>
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
                  <span style={{ fontSize: 12, color: colors.textMuted }}>Voice</span>
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
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>AI System Prompt (the script / personality)</div>
                <textarea
                  value={settings.vapiPrompt || ""}
                  onChange={(e) => setSettings((p) => ({ ...p, vapiPrompt: e.target.value }))}
                  style={{ width: "100%", minHeight: 140, padding: 12, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 12, outline: "none", resize: "vertical", fontFamily: font, boxSizing: "border-box" }}
                />
              </div>
            </div>

            {[
              { title: "Lusha Configuration", fields: [
                { label: "API Provider", value: "Lusha (lusha.com)", disabled: true },
                { label: "API Key", key: "lushaApiKey", type: "password" },
              ]},
              { title: "Snov.io Configuration", fields: [
                { label: "API Provider", value: "Snov.io (snov.io)", disabled: true },
                { label: "Client ID (API User ID)", key: "snovClientId" },
                { label: "Client Secret", key: "snovClientSecret", type: "password" },
              ]},
              { title: "Lead Scoring Rules", fields: [
                { label: "Min. Company Size", key: "minCompanySize" },
                { label: "Priority Industries", key: "priorityIndustries" },
                { label: "Boost for Decision Makers", key: "decisionMakerBoost" },
              ]},
              { title: "Notification Settings", fields: [
                { label: "Email Notifications", key: "emailNotifications" },
                { label: "Notify on New Leads", key: "notifyNewLeads" },
                { label: "Daily Summary", key: "dailySummary" },
              ]},
            ].map((section) => (
              <div key={section.title} style={{ background: colors.surface, borderRadius: 12, padding: 20, border: `1px solid ${colors.border}`, marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{section.title}</h3>
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
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>User Management</h3>
                    <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>Manage users who have access to the ERP</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={umFetch} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 11, cursor: "pointer" }}>↻ Refresh</button>
                    <button onClick={() => { setShowAddUser(true); setUmError(""); setUmSuccess(""); }} style={{ padding: "6px 14px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>+ Add User</button>
                  </div>
                </div>

                {umError && <div style={{ background: "rgba(220,53,69,0.1)", border: "1px solid rgba(220,53,69,0.25)", borderRadius: 6, padding: "8px 12px", color: "#e57373", fontSize: 12, marginBottom: 12 }}>⚠ {umError}</div>}
                {umSuccess && <div style={{ background: "rgba(67,160,71,0.1)", border: "1px solid rgba(67,160,71,0.25)", borderRadius: 6, padding: "8px 12px", color: "#81c784", fontSize: 12, marginBottom: 12 }}>✓ {umSuccess}</div>}

                {showAddUser && (
                  <div style={{ background: colors.bg, borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: colors.text }}>New User</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      {[
                        { label: "Full Name", key: "name", placeholder: "Ahmet Yılmaz" },
                        { label: "Email", key: "email", placeholder: "ahmet@sunandsun.com.tr" },
                        { label: "Password", key: "password", placeholder: "At least 6 characters", type: "password" },
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
                        <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>Role</div>
                        <select
                          value={newUser.role}
                          onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
                          style={{ width: "100%", padding: "7px 10px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 12, outline: "none" }}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={umAddUser} style={{ padding: "7px 16px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
                      <button onClick={() => { setShowAddUser(false); setNewUser({ name: "", email: "", password: "", role: "user" }); }} style={{ padding: "7px 14px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {umLoading ? (
                  <div style={{ textAlign: "center", padding: 24, color: colors.textMuted, fontSize: 13 }}>Loading...</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                          {["Full Name", "Email", "Role", "Last Login", ""].map((h) => (
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
                                {u.id === authUser.id && <span style={{ fontSize: 9, background: "rgba(8,143,196,0.15)", color: colors.primary, borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>YOU</span>}
                              </div>
                            </td>
                            <td style={{ padding: "10px 10px", color: colors.textMuted }}>{u.email}</td>
                            <td style={{ padding: "10px 10px" }}>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: u.role === "admin" ? "rgba(8,143,196,0.15)" : "rgba(255,255,255,0.06)", color: u.role === "admin" ? colors.primary : colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                {u.role === "admin" ? "Admin" : "User"}
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
                                  Password
                                </button>
                                {u.id !== authUser.id && (
                                  <button
                                    onClick={() => umDeleteUser(u.id, u.name)}
                                    style={{ padding: "4px 10px", background: "transparent", border: "1px solid rgba(220,53,69,0.3)", borderRadius: 5, color: "#e57373", fontSize: 11, cursor: "pointer" }}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {umUsers.length === 0 && !umLoading && (
                          <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: colors.textMuted, fontSize: 12 }}>No users found</td></tr>
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
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Change Password</h3>
            <p style={{ fontSize: 12, color: colors.textMuted, marginBottom: 20 }}>{pwModal.name}</p>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>New Password</div>
              <input
                type="password"
                value={newPw}
                placeholder="At least 6 characters"
                onChange={(e) => setNewPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && umChangePw()}
                autoFocus
                style={{ width: "100%", padding: "9px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
              />
              {newPwError && <div style={{ fontSize: 11, color: "#e57373", marginTop: 6 }}>⚠ {newPwError}</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={umChangePw} style={{ flex: 1, padding: "9px", background: colors.primary, border: "none", borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Save</button>
              <button onClick={() => setPwModal(null)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textMuted, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ IMPORT XLS MODAL ══════════ */}
      {showImportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowImportModal(false)}>
          <div style={{ background: colors.surface, borderRadius: 16, padding: 32, width: 560, border: `1px solid ${colors.border}`, animation: "slideIn .2s ease" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Import XLS File</h2>
              <button onClick={() => setShowImportModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted }}><XIcon size={20} /></button>
            </div>

            {!importStats ? (
              <div>
                <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>Select a SoGreen Ofisyol .xls file to import leads. Duplicates will be skipped automatically.</p>
                <label style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  padding: "40px 20px", border: `2px dashed ${colors.borderLight}`, borderRadius: 12,
                  cursor: "pointer", color: colors.textMuted, fontSize: 13, gap: 8,
                }}>
                  <span style={{ fontSize: 32 }}>📂</span>
                  <span>Click to select .xls file</span>
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
                      { label: "Total Leads", value: importStats.total, color: colors.primary },
                      { label: "Have Contact Info", value: importStats.withContact, color: colors.success },
                      { label: "Need Snov.io Enrich", value: importStats.withWebsite, color: colors.accent },
                    ].map(s => (
                      <div key={s.label} style={{ background: colors.surface, borderRadius: 8, padding: 12, border: `1px solid ${colors.border}` }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 16 }}>Preview (first 5 rows):</div>
                <div style={{ background: colors.bg, borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
                  {importPreview.slice(0, 5).map((l, i) => (
                    <div key={i} style={{ padding: "8px 12px", borderBottom: `1px solid ${colors.border}`, fontSize: 12, display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontWeight: 600, flex: 1 }}>{l.company}</span>
                      <span style={{ color: colors.textMuted, width: 80 }}>{l.city}</span>
                      <span style={{ color: colors.primaryLight, width: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.email || l.phone || "no contact"}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button onClick={() => { setImportStats(null); setImportPreview([]); setImportFileName(""); }}
                    style={{ padding: "8px 20px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textMuted, cursor: "pointer", fontSize: 13, fontFamily: font }}>
                    Change File
                  </button>
                  <button onClick={confirmImport}
                    style={{ padding: "8px 20px", background: colors.primary, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>
                    Import {importStats.total.toLocaleString()} Leads
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
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Add New Lead</h2>
              <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted }}><XIcon size={20} /></button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { label: "First Name", key: "firstName", placeholder: "Ahmet" },
                { label: "Last Name",  key: "lastName",  placeholder: "Yılmaz" },
                { label: "Email",      key: "email",     placeholder: "ahmet@company.com" },
                { label: "Phone",      key: "phone",     placeholder: "+90 5XX XXX XXXX" },
                { label: "Company",    key: "company",   placeholder: "Tekno Makina A.Ş." },
                { label: "LinkedIn URL", key: "linkedinUrl", placeholder: "linkedin.com/in/..." },
              ].map((f) => (
                <div key={f.key}>
                  <label style={{ display: "block", fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</label>
                  <input value={newLead[f.key]} onChange={(e) => setNewLead((p) => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", fontFamily: font }} />
                </div>
              ))}

              {[
                { label: "Job Title", key: "title", options: JOB_TITLES },
                { label: "Industry",  key: "industry", options: INDUSTRIES },
                { label: "City",      key: "city", options: CITIES },
                { label: "Company Size", key: "companySize", options: COMPANY_SIZES },
                { label: "Source",    key: "source", options: ["LinkedIn Search", "LinkedIn Post Engagement", "LinkedIn Group", "Manual Entry"] },
              ].map((f) => (
                <div key={f.key}>
                  <label style={{ display: "block", fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{f.label}</label>
                  <select value={newLead[f.key]} onChange={(e) => setNewLead((p) => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: newLead[f.key] ? colors.text : colors.textDim, fontSize: 13, outline: "none", fontFamily: font }}>
                    <option value="">— Select —</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={{ display: "block", fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Notes</label>
              <textarea value={newLead.notes} onChange={(e) => setNewLead((p) => ({ ...p, notes: e.target.value }))} placeholder="Any initial notes about this lead..."
                style={{ width: "100%", padding: "8px 12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text, fontSize: 13, outline: "none", resize: "vertical", minHeight: 70, fontFamily: font }} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAddModal(false)} style={{ padding: "8px 20px", background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.textMuted, cursor: "pointer", fontSize: 13, fontFamily: font }}>Cancel</button>
              <button onClick={submitNewLead} disabled={!newLead.firstName || !newLead.lastName || !newLead.company}
                style={{ padding: "8px 20px", background: !newLead.firstName || !newLead.lastName || !newLead.company ? colors.surfaceHover : colors.primary, border: "none", borderRadius: 8, color: !newLead.firstName || !newLead.lastName || !newLead.company ? colors.textDim : "#fff", cursor: !newLead.firstName || !newLead.lastName || !newLead.company ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}>
                Add Lead
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
                <span>Number</span>
                <span style={{ fontFamily: mono, color: colors.text }}>{activeCall.lead.phone}</span>
              </div>
              {activeCall.duration != null && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span>Duration</span>
                  <span style={{ color: colors.text }}>{activeCall.duration}s</span>
                </div>
              )}
            </div>

            {/* Transcript */}
            {activeCall.transcript && (
              <div style={{ background: colors.bg, borderRadius: 10, padding: 14, marginBottom: 20, maxHeight: 160, overflowY: "auto" }}>
                <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Transcript</div>
                <p style={{ fontSize: 12, color: colors.text, lineHeight: 1.6, whiteSpace: "pre-wrap", margin: 0 }}>{activeCall.transcript}</p>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              {activeCall.status !== "ended" && activeCall.status !== "error" && (
                <div style={{ fontSize: 12, color: colors.textDim, alignSelf: "center", marginRight: "auto" }}>Checking status every 5s...</div>
              )}
              <button
                onClick={endActiveCall}
                style={{ padding: "8px 20px", background: activeCall.status === "ended" || activeCall.status === "error" ? colors.primary : colors.danger, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: font }}
              >
                {activeCall.status === "ended" || activeCall.status === "error" ? "Close" : "Dismiss"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}