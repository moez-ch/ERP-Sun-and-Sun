// Attendance Tracker — monthly sheet (puantaj). Esra's spec points 1–10 (steps 1–4):
//   people down the side (active Odoo employees + the company they are insured under, filterable),
//   every day of the month across with its weekday, and one code per person per day.
//   Mon–Sat = M (working day), Sunday = HT (weekly rest), public holiday = RT (locked), arife = ½RT,
//   İ = on leave, R = sick leave / medical report. The month starts pre-filled as if everyone worked their full schedule;
//   only cells someone changes are stored (server table attendance_sheet). Old tracker leave/holiday days show as İ / RT.
// Every label has an English and a Turkish version (the ERP's TR/EN switch).
import { useState, useEffect, useMemo, useRef } from "react";

const DOW_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const DOW_FULL_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// stored key -> what is shown in the cell
const CODE_LABEL = { M: "M", HT: "HT", RT: "RT", HRT: "½RT", I: "İ", U: "Üİ", R: "R", L: "L" };
const EDITABLE_CODES = ["M", "HT", "I", "U", "R", "L"];

// working hours: 08:30–18:30 on site = 10h incl. the 1h lunch (same rule as the old Table); a ½RT day expects 4.5h
const WORK_START = 510, WORK_END = 1110, WORK_DAY = 600, HALF_DAY = 270;
const t2m = s => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
function fmtTimeInput(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  const h = String(Math.min(parseInt(digits.slice(0, 2), 10), 23)).padStart(2, "0");
  const mm = digits.slice(2);
  if (mm.length < 2) return `${h}:${mm}`;
  return `${h}:${String(Math.min(parseInt(mm, 10), 59)).padStart(2, "0")}`;
}
const fmtHM = mins => { if (!mins) return "—"; const a = Math.abs(Math.round(mins)); return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`; };
const fmtSigned = mins => (mins == null || Math.round(mins) === 0 ? "—" : (mins > 0 ? "+" : "−") + fmtHM(mins));
// one day's clock times against the schedule; only working days (M, ½RT) or a worked rest day are evaluated
// "h:mm", "2.5" or "2,5" (hours) -> minutes; empty -> 0; anything else -> null
function parseHM(txt) {
  const t = String(txt || "").trim();
  if (!t) return 0;
  let m = /^(\d{1,3}):(\d{1,2})$/.exec(t);
  if (m) return +m[1] * 60 + Math.min(59, +m[2]);
  m = /^(\d{1,3})(?:[.,](\d+))?$/.exec(t);
  if (m) return Math.round(parseFloat(m[1] + "." + (m[2] || "0")) * 60);
  return null;
}
function dayClock(ent, code) {
  const r = { lateArr: 0, earlyArr: 0, earlyDep: 0, lateDep: 0, net: null, restWork: 0 };
  if (!ent || !["M", "HRT", "HT"].includes(code)) return r;
  const i = t2m(ent.in), o = t2m(ent.out);
  if (code === "HT") { if (i != null && o != null) { let w = o - i; if (w < 0) w += 1440; r.restWork = w; } return r; } // work on the rest day: all of it is overtime
  if (i != null) { if (i > WORK_START) r.lateArr = i - WORK_START; else r.earlyArr = WORK_START - i; }
  if (o != null && code !== "HRT") { if (o < WORK_END) r.earlyDep = WORK_END - o; else r.lateDep = o - WORK_END; }
  if (i != null && o != null) { let w = o - i; if (w < 0) w += 1440; r.net = w - (code === "HRT" ? HALF_DAY : WORK_DAY); }
  return r;
}

const dk = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("sns_token")}` });

export default function AttendanceSheet({ colors, font, lang, year, month, isAdmin }) {
  const tr = (en, t) => (lang === "tr" ? t : en);
  const [sheet, setSheet] = useState({ employees: [], cells: {}, legacy: {}, hourly: {}, recName: {}, leaves: {}, holidays: [], fromOdoo: true, odooError: "", leavesError: "", month: {}, carryIn: {}, prevYm: "" });
  const [showHourly, setShowHourly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState("__all__");
  const [search, setSearch] = useState("");
  const [showHolidays, setShowHolidays] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`/attendance/sheet?year=${year}&month=${month + 1}${reload ? "&refresh=1" : ""}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setSheet({ employees: d.employees || [], cells: d.cells || {}, legacy: d.legacy || {}, hourly: d.hourly || {}, recName: d.recName || {},
        leaves: d.leaves || {}, holidays: d.holidays || [], fromOdoo: !!d.fromOdoo, odooError: d.odooError || "", leavesError: d.leavesError || "",
        month: d.month || {}, carryIn: d.carryIn || {}, prevYm: d.prevYm || "" }))
      .catch(() => setSheet(s => ({ ...s, employees: [], cells: {} })))
      .finally(() => setLoading(false));
  }, [year, month, reload]);

  const nDays = new Date(year, month + 1, 0).getDate();
  const days = useMemo(() => Array.from({ length: nDays }, (_, i) => {
    const d = new Date(year, month, i + 1);
    return { day: i + 1, key: dk(year, month, i + 1), dow: d.getDay() };
  }), [year, month, nDays]);
  const holidayMap = useMemo(() => Object.fromEntries(sheet.holidays.map(h => [h.date, h])), [sheet.holidays]);

  // what a day is when nobody touched it: Sunday = HT, holiday = RT (Mon–Sat), arife = ½RT,
  // full-day leave/holiday from the old tracker = İ / RT, otherwise M
  const autoCode = (empKey, day) => {
    const h = holidayMap[day.key];
    if (day.dow === 0) return "HT";
    if (h && !h.half) return "RT";
    if (h && h.half) return "HRT";
    const lv = sheet.leaves[empKey]?.[day.key];   // approved full-day leave in Odoo Time Off -> L (Rapor -> R)
    if (lv?.code) return lv.code;
    const lg = sheet.legacy[empKey]?.[day.key];
    if (lg) return lg;
    return "M";
  };
  const cellOf = (empKey, day) => sheet.cells[empKey]?.[day.key] || null;
  const codeOf = (empKey, day) => {
    const h = holidayMap[day.key];
    if (h && !h.half && day.dow !== 0) return "RT"; // public holidays are locked
    return cellOf(empKey, day)?.code || autoCode(empKey, day);
  };

  function setCode(emp, day, code) {
    // choosing the automatic value again clears the override
    const stored = code === autoCode(emp.key, day) ? "" : code;
    setSheet(s => {
      const empCells = { ...(s.cells[emp.key] || {}) };
      empCells[day.key] = { ...(empCells[day.key] || { multinet: null, travel: null }), code: stored };
      return { ...s, cells: { ...s.cells, [emp.key]: empCells } };
    });
    fetch(`/attendance/sheet/${encodeURIComponent(emp.key)}/${day.key}`, {
      method: "PUT", headers: authHeaders(), body: JSON.stringify({ code: stored, emp_name: emp.name }),
    }).then(r => { if (!r.ok) throw new Error(r.status); schedulePush(emp); })
      .catch(() => window.alert(tr("Could not save — please reload the page.", "Kaydedilemedi — lütfen sayfayı yenileyin.")));
  }

  // ── Multinet / Travel (step 2) ──
  // Multinet ticked = meal allowance that day; Travel ticked = double allowance (Travel always includes Multinet).
  // Neither = 0, Multinet only = 1 unit, Multinet + Travel = 2 units. No money is shown here, only days / units.
  // Automatic (nothing stored): Multinet on for full M days only (no Multinet for a half-day ½RT day); Travel off.
  const autoMultinet = code => code === "M";
  const flagsOf = (empKey, day) => {
    const c = cellOf(empKey, day) || {};
    const code = codeOf(empKey, day);
    const travel = c.travel == null ? false : !!c.travel;
    const multinet = travel || (c.multinet == null ? autoMultinet(code) : !!c.multinet);
    return { multinet, travel, manual: c.multinet != null || c.travel != null };
  };
  function setFlags(emp, day, multinet, travel) {
    if (travel) multinet = true;
    const code = codeOf(emp.key, day);
    const body = { multinet: multinet === autoMultinet(code) ? null : multinet, travel: travel ? true : null, emp_name: emp.name };
    setSheet(s => {
      const empCells = { ...(s.cells[emp.key] || {}) };
      empCells[day.key] = { ...(empCells[day.key] || { code: "" }), multinet: body.multinet == null ? null : (body.multinet ? 1 : 0), travel: body.travel ? 1 : null };
      return { ...s, cells: { ...s.cells, [emp.key]: empCells } };
    });
    fetch(`/attendance/sheet/${encodeURIComponent(emp.key)}/${day.key}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) })
      .then(r => { if (!r.ok) throw new Error(r.status); schedulePush(emp); })
      .catch(() => window.alert(tr("Could not save — please reload the page.", "Kaydedilemedi — lütfen sayfayı yenileyin.")));
  }
  // per-person totals for the summary on the right (a ½RT day counts half M, half RT)
  const summaryOf = empKey => {
    const t = { M: 0, HT: 0, RT: 0, I: 0, U: 0, R: 0, L: 0, multinet: 0, travel: 0, units: 0, lateArr: 0, earlyArr: 0, earlyDep: 0, lateDep: 0, net: 0, hourLeave: 0, restWork: 0 };
    days.forEach(d => {
      const code = codeOf(empKey, d);
      if (code === "HRT") { t.M += 0.5; t.RT += 0.5; } else if (code in t) t[code] += 1;
      const f = flagsOf(empKey, d);
      if (f.multinet) { t.multinet += 1; t.units += f.travel ? 2 : 1; }
      if (f.travel) t.travel += 1;
      const c = dayClock(sheet.hourly[empKey]?.[d.key], code);
      t.lateArr += c.lateArr; t.earlyArr += c.earlyArr; t.earlyDep += c.earlyDep; t.lateDep += c.lateDep;
      if (c.net != null) t.net += c.net;
      t.restWork += c.restWork;
      t.hourLeave += (sheet.leaves[empKey]?.[d.key]?.hours || 0) * 60;
    });
    // step 4: overtime = work on rest days + overtime added by hand; each of the three discretionary amounts also
    // gets whatever the previous month carried over into this one
    const mo = sheet.month[empKey] || {}, ci = sheet.carryIn[empKey] || {};
    t.addOT = mo.added_ot || 0;
    t.overtime = t.restWork + t.addOT;
    t.own = { net: t.net, hourLeave: t.hourLeave, overtime: t.overtime };
    t.carried = { net: ci.net || 0, hourLeave: ci.hourLeave || 0, overtime: ci.overtime || 0 };
    t.net += t.carried.net; t.hourLeave += t.carried.hourLeave; t.overtime += t.carried.overtime;
    t.dec = { net: mo.net_dec || "", hourLeave: mo.leave_dec || "", overtime: mo.ot_dec || "" };
    return t;
  };
  function saveMonth(emp, body, apply) {
    const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
    setSheet(s => ({ ...s, month: { ...s.month, [emp.key]: apply({ ...(s.month[emp.key] || {}) }) } }));
    fetch(`/attendance/month/${encodeURIComponent(emp.key)}/${ym}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body) })
      .then(r => { if (!r.ok) throw new Error(r.status); schedulePush(emp); })
      .catch(() => window.alert(tr("Could not save — please reload the page.", "Kaydedilemedi — lütfen sayfayı yenileyin.")));
  }
  // clicking the active button again clears the decision; "carry" freezes the amount shown (own + already carried in)
  function setDecision(emp, item, decision, amount) {
    const col = { net: "net_dec", hourLeave: "leave_dec", overtime: "ot_dec" }[item];
    saveMonth(emp, { item, decision, amount: Math.round(amount || 0) }, m => ({ ...m, [col]: decision }));
  }
  function setAddedOt(emp, txt) {
    const v = parseHM(txt);
    if (v == null) { window.alert(tr("Enter hours as h:mm (e.g. 2:30) or a number of hours (e.g. 2,5).", "Saati s:dk (ör. 2:30) veya saat sayısı (ör. 2,5) olarak girin.")); return; }
    saveMonth(emp, { added_ot: v }, m => ({ ...m, added_ot: v }));
  }
  const fmtN = n => (Number.isInteger(n) ? String(n) : String(n).replace(".", lang === "tr" ? "," : "."));

  // ── Odoo link ── every day goes to Odoo work entries and the month's totals to "Aylık Puantaj" (Bordro > Raporlama).
  // A change is sent ~30 s later (several quick changes = one send); the month button sends everyone at once.
  const rowFor = emp => ({ emp_key: emp.key, name: emp.name, company: emp.company || "",
    days: days.map(d => ({ date: d.key, code: codeOf(emp.key, d) })), summary: summaryOf(emp.key) });
  const rowForRef = useRef(rowFor);
  rowForRef.current = rowFor;
  const pushTimers = useRef({});
  const [odooStatus, setOdooStatus] = useState("");
  const sendToOdoo = async emps => {
    const rows = emps.filter(e => /^o:/.test(e.key)).map(e => rowForRef.current(e));
    if (!rows.length) return null;
    const r = await fetch("/attendance/sheet/push", { method: "POST", headers: authHeaders(), body: JSON.stringify({ year, month: month + 1, rows }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  };
  function schedulePush(emp) {
    if (!/^o:/.test(emp.key)) return;
    clearTimeout(pushTimers.current[emp.key]);
    setOdooStatus(tr("Odoo: waiting to send…", "Odoo: gönderilmeyi bekliyor…"));
    pushTimers.current[emp.key] = setTimeout(async () => {
      delete pushTimers.current[emp.key];
      try {
        await sendToOdoo([emp]);
        setOdooStatus(`${tr("Odoo: sent", "Odoo: gönderildi")} ${new Date().toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`);
      } catch (e) { setOdooStatus(`${tr("Odoo: not sent", "Odoo: gönderilemedi")} (${e.message})`); }
    }, 30000);
  }
  async function syncMonth() {
    if (!window.confirm(tr("Send this whole month (every person, every day + the totals) to Odoo? Days already the same are left alone; days on a payslip or with Odoo leave are skipped.",
      "Bu ayın tamamı (herkes, her gün + toplamlar) Odoo'ya gönderilsin mi? Aynı olan günlere dokunulmaz; bordroya girmiş veya Odoo izni olan günler atlanır."))) return;
    setOdooStatus(tr("Odoo: sending the month…", "Odoo: ay gönderiliyor…"));
    try {
      const j = await sendToOdoo(sheet.employees);
      setOdooStatus(`${tr("Odoo: sent", "Odoo: gönderildi")} ${new Date().toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`);
      window.alert(tr(`Odoo updated: ${j.yazildi || 0} days written, ${j.ayni || 0} already the same, ${j.atlandi_bordro || 0} on a payslip, ${j.atlandi_izin || 0} with Odoo leave (skipped); ${j.puantaj || 0} monthly records.`,
        `Odoo güncellendi: ${j.yazildi || 0} gün yazıldı, ${j.ayni || 0} gün zaten aynı, ${j.atlandi_bordro || 0} gün bordroda, ${j.atlandi_izin || 0} gün Odoo izinli (atlandı); ${j.puantaj || 0} aylık kayıt.`)
        + (j.surum_yok ? "\n" + tr(`${j.surum_yok} days skipped: no employment record in Odoo.`, `${j.surum_yok} gün atlandı: Odoo'da sözleşme kaydı yok.`) : ""));
    } catch (e) {
      setOdooStatus(`${tr("Odoo: not sent", "Odoo: gönderilemedi")} (${e.message})`);
      window.alert(tr("Odoo sync failed: ", "Odoo aktarımı başarısız: ") + e.message);
    }
  }
  // [key, header, tooltip, width, format]
  const SUMMARY_COLS = [
    ["M", "M", tr("Working days", "Çalışma günü"), 36, "n"], ["HT", "HT", tr("Weekly rest", "Hafta tatili"), 36, "n"],
    ["RT", "RT", tr("Public holiday", "Resmi tatil"), 36, "n"], ["L", "L", tr("Leave (from the leave system)", "İzin (izin sisteminden)"), 36, "n"],
    ["I", "İ", tr("Paid leave", "Ücretli izin"), 36, "n"], ["U", "Üİ", tr("Unpaid leave", "Ücretsiz izin"), 36, "n"], ["R", "R", tr("Sick leave / report", "Raporlu"), 36, "n"],
    ["multinet", "🍽", tr("Days with Multinet", "Multinet'li gün"), 36, "n"], ["travel", "✈", tr("Travel days (double)", "Seyahat günü (çift)"), 36, "n"],
    ["units", "Σ🍽", tr("Multinet units (travel counts twice)", "Multinet birimi (seyahat iki sayılır)"), 40, "n"],
    ["lateArr", tr("Late in", "Geç gir."), tr("Late arrivals (after 08:30), total h:mm", "Geç girişler (08:30 sonrası), toplam s:dk"), 50, "t"],
    ["earlyArr", tr("Early in", "Erk. gir."), tr("Early arrivals (before 08:30), total h:mm", "Erken girişler (08:30 öncesi), toplam s:dk"), 50, "t"],
    ["earlyDep", tr("Early out", "Erk. çık."), tr("Early departures (before 18:30), total h:mm", "Erken çıkışlar (18:30 öncesi), toplam s:dk"), 50, "t"],
    ["lateDep", tr("Late out", "Geç çık."), tr("Late departures (after 18:30), total h:mm", "Geç çıkışlar (18:30 sonrası), toplam s:dk"), 50, "t"],
    ["net", tr("Total status", "Toplam durum"), tr("Total status: time on site minus the expected 10h per working day (days with both times entered), plus anything carried over from last month. ✓ = include in this month's calculation, → = carry over to next month", "Toplam durum: işyerinde geçen süre eksi çalışma günü başına beklenen 10 saat (iki saati de girilmiş günler), artı geçen aydan devreden. ✓ = bu ayın hesabına dahil et, → = sonraki aya devret"), 74, "d"],
    ["hourLeave", tr("Hourly leave", "Saatlik izin"), tr("Hourly leave from the leave system (h:mm), plus anything carried over. ✓ = include in this month's calculation, → = carry over to next month", "İzin sisteminden saatlik izin (s:dk), artı devreden. ✓ = bu ayın hesabına dahil et, → = sonraki aya devret"), 74, "d"],
    ["addOT", tr("Add overtime", "Ek mesai ekle"), tr("Extra work added by hand for this month (h:mm or hours) — admins only", "Bu ay için elle eklenen ek çalışma (s:dk veya saat) — yalnızca yöneticiler"), 62, "in"],
    ["overtime", tr("Overtime", "Fazla mesai"), tr("Overtime: work on rest days (HT) + added overtime, plus anything carried over. ✓ = include in this month's calculation, → = carry over to next month", "Fazla mesai: hafta tatilinde (HT) çalışma + eklenen ek mesai, artı devreden. ✓ = bu ayın hesabına dahil et, → = sonraki aya devret"), 74, "d"],
  ];
  const sumRight = i => SUMMARY_COLS.slice(i + 1).reduce((a, c) => a + c[3], 0);
  const fmtSum = (v, kind) => (kind === "n" ? fmtN(v) : kind === "s" ? fmtSigned(v) : fmtHM(v));
  const MONTH_NAMES = lang === "tr" ? ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
    : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const prevLabel = sheet.prevYm ? `${MONTH_NAMES[+sheet.prevYm.slice(5, 7) - 1]} ${sheet.prevYm.slice(0, 4)}` : "";

  const companies = useMemo(() => {
    const m = new Map();
    sheet.employees.forEach(e => m.set(e.company || "", (m.get(e.company || "") || 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr"));
  }, [sheet.employees]);
  const shown = sheet.employees.filter(e =>
    (company === "__all__" || (e.company || "") === company) &&
    (!search.trim() || e.name.toLocaleLowerCase("tr").includes(search.trim().toLocaleLowerCase("tr"))));

  const codeStyle = code => ({
    M:   { bg: `${colors.success}22`, fg: colors.success },
    HT:  { bg: `${colors.textDim}22`, fg: colors.textMuted },
    RT:  { bg: `${colors.primary}33`, fg: colors.primaryLight || colors.primary },
    HRT: { bg: `${colors.primary}18`, fg: colors.primaryLight || colors.primary },
    I:   { bg: `${colors.warning}26`, fg: colors.warning },
    R:   { bg: `${colors.danger || "#e57373"}26`, fg: colors.danger || "#e57373" },
    L:   { bg: "#9c6ade26", fg: "#9c6ade" },
    U:   { bg: "#d9773326", fg: "#d97733" },
  }[code] || { bg: "transparent", fg: colors.text });

  const DOW = lang === "tr" ? DOW_TR : DOW_EN;
  const DOW_FULL = lang === "tr" ? DOW_FULL_TR : DOW_FULL_EN;
  const th = { background: "#1a1a1a", color: colors.accent, padding: "5px 4px", fontSize: 10, fontWeight: 700, fontFamily: font, borderRight: `1px solid ${colors.border}`, textAlign: "center", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2 };
  const td = { borderRight: `1px solid ${colors.border}`, borderBottom: `1px solid ${colors.border}`, padding: 0, textAlign: "center" };
  const stickyName = { position: "sticky", left: 0, zIndex: 1, background: colors.surface, minWidth: 170, maxWidth: 170, textAlign: "left", padding: "4px 8px", fontSize: 12, fontFamily: font, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const stickyComp = { position: "sticky", left: 170, zIndex: 1, background: colors.surface, minWidth: 130, maxWidth: 130, textAlign: "left", padding: "4px 8px", fontSize: 10, fontFamily: font, color: colors.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

  const legend = [
    ["M", tr("Working day", "Çalışma günü")], ["HT", tr("Weekly rest (Sunday)", "Hafta tatili (Pazar)")],
    ["RT", tr("Public holiday", "Resmi tatil")], ["HRT", tr("Half-day public holiday (eve)", "Yarım gün resmi tatil (arife)")],
    ["I", tr("Paid leave", "Ücretli izin")], ["U", tr("Unpaid leave", "Ücretsiz izin")], ["R", tr("Sick leave / medical report", "Raporlu")], ["L", tr("Leave (from the leave system)", "İzin (izin sisteminden)")],
  ];

  return (
    <div style={{ fontFamily: font }}>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <select value={company} onChange={e => setCompany(e.target.value)}
          style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "6px 10px", color: colors.text, fontSize: 12, fontFamily: font, maxWidth: 360 }}>
          <option value="__all__">{tr("All companies", "Tüm şirketler")} ({sheet.employees.length})</option>
          {companies.map(([c, n]) => <option key={c || "_none"} value={c}>{c || tr("No company set", "Şirket girilmemiş")} ({n})</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tr("Search name…", "İsim ara…")}
          style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "6px 10px", color: colors.text, fontSize: 12, fontFamily: font, width: 160 }} />
        <button onClick={() => setReload(r => r + 1)} title={tr("Reload employees from Odoo", "Çalışanları Odoo'dan yenile")}
          style={{ background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, padding: "6px 10px", color: colors.textMuted, fontSize: 12, cursor: "pointer", fontFamily: font }}>
          ↻ {tr("Refresh", "Yenile")}
        </button>
        <button onClick={() => setShowHourly(true)}
          style={{ background: colors.primary, border: `1px solid ${colors.primary}`, borderRadius: 6, padding: "6px 10px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
          ⏱ {tr("Log hourly attendance", "Saatlik mesai gir")}
        </button>
        {isAdmin && (
          <button onClick={syncMonth} title={tr("Send every person's days and totals for this month to Odoo", "Bu ayın herkese ait günlerini ve toplamlarını Odoo'ya gönder")}
            style={{ background: "transparent", border: `1px solid ${colors.border}`, borderRadius: 6, padding: "6px 10px", color: colors.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            ⇄ {tr("Sync month to Odoo", "Ayı Odoo'ya aktar")}
          </button>
        )}
        {odooStatus && <span style={{ fontSize: 11, color: colors.textDim }}>{odooStatus}</span>}
        <button onClick={() => setShowHolidays(s => !s)}
          style={{ background: showHolidays ? `${colors.primary}20` : "transparent", border: `1px solid ${showHolidays ? colors.primary : colors.border}`, borderRadius: 6, padding: "6px 10px", color: showHolidays ? colors.primaryLight : colors.textMuted, fontSize: 12, cursor: "pointer", fontFamily: font }}>
          🗓 {tr("Public holidays", "Resmi tatiller")}
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {legend.map(([c, label]) => { const s = codeStyle(c); return (
            <span key={c} style={{ fontSize: 10, color: colors.textMuted, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <b style={{ background: s.bg, color: s.fg, borderRadius: 4, padding: "1px 5px" }}>{CODE_LABEL[c]}</b>{label}
            </span>); })}
        </div>
      </div>

      {!sheet.fromOdoo && !loading && (
        <div style={{ fontSize: 11, color: colors.warning, marginBottom: 8 }}>
          {tr("Odoo could not be reached — showing the tracker's own employee list, without companies.", "Odoo'ya ulaşılamadı — şirketsiz, takip listesindeki çalışanlar gösteriliyor.")}
          {sheet.odooError ? ` (${sheet.odooError})` : ""}
        </div>
      )}

      {sheet.leavesError && !loading && (
        <div style={{ fontSize: 11, color: colors.warning, marginBottom: 8 }}>
          {tr("Leave could not be read from Odoo: ", "İzinler Odoo'dan okunamadı: ")}{sheet.leavesError}
        </div>
      )}
      {!loading && Object.keys(sheet.carryIn).length > 0 && (
        <div style={{ background: `${colors.warning}14`, border: `1px solid ${colors.warning}55`, borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontSize: 11, color: colors.text }}>
          <b style={{ color: colors.warning }}>↪ {tr(`Carried over from ${prevLabel}:`, `${prevLabel} ayından devreden:`)}</b>{" "}
          {sheet.employees.filter(e => sheet.carryIn[e.key]).map(e => {
            const c = sheet.carryIn[e.key];
            const parts = [c.net ? `${tr("total status", "toplam durum")} ${fmtSigned(c.net)}` : "", c.hourLeave ? `${tr("hourly leave", "saatlik izin")} ${fmtHM(c.hourLeave)}` : "",
              c.overtime ? `${tr("overtime", "fazla mesai")} ${fmtHM(c.overtime)}` : ""].filter(Boolean).join(", ");
            return <span key={e.key} style={{ marginRight: 12 }}>{e.name}: {parts}</span>;
          })}
        </div>
      )}
      {showHourly && (
        <HourlyLog colors={colors} font={font} lang={lang} employees={shown} days={days} recName={sheet.recName} hourly={sheet.hourly}
          codeOf={codeOf} leaves={sheet.leaves} onClose={() => setShowHourly(false)}
          onSaved={(empKey, dateKey, ent) => { setSheet(s => ({ ...s, hourly: { ...s.hourly, [empKey]: { ...(s.hourly[empKey] || {}), [dateKey]: ent } } }));
            const e = sheet.employees.find(x => x.key === empKey); if (e) schedulePush(e); }} />
      )}

      {showHolidays && <HolidayPanel colors={colors} font={font} lang={lang} year={year} isAdmin={isAdmin} onChanged={() => setReload(r => r + 1)} />}

      {loading ? (
        <div style={{ padding: 30, textAlign: "center", color: colors.textDim, fontSize: 12 }}>{tr("Loading…", "Yükleniyor…")}</div>
      ) : (
        <div style={{ overflow: "auto", maxHeight: "70vh", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12 }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ ...th, ...{ left: 0, zIndex: 4, textAlign: "left", minWidth: 170 } }}>{tr("Employee", "Ad Soyad")}</th>
                <th style={{ ...th, ...{ left: 170, zIndex: 4, textAlign: "left", minWidth: 130 } }}>{tr("Insured company", "Sigortalı şirket")}</th>
                {days.map(d => {
                  const h = holidayMap[d.key];
                  return (
                    <th key={d.key} title={`${d.day} ${DOW_FULL[d.dow]}${h ? " — " + (lang === "tr" ? h.name_tr : (h.name_en || h.name_tr)) : ""}`}
                      style={{ ...th, minWidth: 38, color: d.dow === 0 ? colors.textDim : h ? (colors.primaryLight || colors.primary) : colors.accent }}>
                      <div style={{ fontSize: 12 }}>{d.day}</div>
                      <div style={{ fontWeight: 400 }}>{DOW[d.dow]}</div>
                    </th>
                  );
                })}
                {SUMMARY_COLS.map(([k, head, label, w], i) => (
                  <th key={k} title={label}
                    style={{ ...th, minWidth: w, maxWidth: w, right: sumRight(i), zIndex: 4, background: "#26262c", whiteSpace: "normal", lineHeight: 1.15, borderLeft: i === 0 ? `2px solid ${colors.accent}` : undefined }}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(emp => (
                <tr key={emp.key}>
                  <td style={{ ...td, ...stickyName }} title={emp.name}>{emp.name}</td>
                  <td style={{ ...td, ...stickyComp }} title={emp.company}>{emp.company || "—"}</td>
                  {days.map(d => {
                    const code = codeOf(emp.key, d);
                    const s = codeStyle(code);
                    const manual = !!cellOf(emp.key, d)?.code && !(holidayMap[d.key] && !holidayMap[d.key].half && d.dow !== 0);
                    const locked = code === "RT" && !!holidayMap[d.key] && !holidayMap[d.key].half;
                    const opts = code === "HRT" ? ["HRT", ...EDITABLE_CODES] : EDITABLE_CODES;
                    return (
                      <td key={d.key} style={{ ...td, background: s.bg, position: "relative" }}
                        title={[sheet.leaves[emp.key]?.[d.key]?.type, sheet.leaves[emp.key]?.[d.key]?.hours ? `${tr("Hourly leave", "Saatlik izin")}: ${fmtHM(sheet.leaves[emp.key][d.key].hours * 60)}` : "",
                          sheet.hourly[emp.key]?.[d.key]?.in || sheet.hourly[emp.key]?.[d.key]?.out ? `${sheet.hourly[emp.key][d.key].in || "—"} – ${sheet.hourly[emp.key][d.key].out || "—"}` : ""].filter(Boolean).join(" · ") || undefined}>
                        {sheet.leaves[emp.key]?.[d.key]?.hours ? <span style={{ position: "absolute", top: 1, right: 2, fontSize: 8, color: "#9c6ade" }}>⏱</span> : null}
                        {locked ? (
                          <span title={tr("Public holiday — change it in the holiday list", "Resmi tatil — tatil listesinden değiştirilir")}
                            style={{ display: "block", padding: "6px 0", fontSize: 11, fontWeight: 700, color: s.fg, cursor: "not-allowed" }}>{CODE_LABEL[code]}</span>
                        ) : (
                          <select value={code} onChange={e => setCode(emp, d, e.target.value)}
                            title={manual ? tr("Changed by hand", "Elle değiştirildi") : tr("Automatic", "Otomatik")}
                            style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", background: "transparent", border: "none", outline: manual ? `1px dashed ${s.fg}` : "none", outlineOffset: -3,
                              width: "100%", padding: "6px 0", textAlign: "center", textAlignLast: "center", fontSize: 11, fontWeight: 700, color: s.fg, cursor: "pointer", fontFamily: font }}>
                            {opts.map(c => <option key={c} value={c} style={{ color: "#000" }}>{CODE_LABEL[c]}</option>)}
                          </select>
                        )}
                        {(() => { const f = flagsOf(emp.key, d); return (
                          <div style={{ display: "flex", justifyContent: "center", gap: 1, paddingBottom: 3, outline: f.manual ? `1px dashed ${colors.textDim}` : "none", outlineOffset: -1 }}>
                            <input type="checkbox" checked={f.multinet} onChange={e => setFlags(emp, d, e.target.checked, e.target.checked ? f.travel : false)}
                              title={tr("Multinet (meal allowance)", "Multinet (yemek)")} style={{ width: 12, height: 12, margin: 0, cursor: "pointer", accentColor: colors.success }} />
                            <input type="checkbox" checked={f.travel} onChange={e => setFlags(emp, d, f.multinet || e.target.checked, e.target.checked)}
                              title={tr("Travel (double meal allowance)", "Seyahat (çift yemek)")} style={{ width: 12, height: 12, margin: 0, cursor: "pointer", accentColor: colors.accent }} />
                          </div>); })()}
                      </td>
                    );
                  })}
                  {(() => { const t = summaryOf(emp.key); return SUMMARY_COLS.map(([k, head, label, w, kind], i) => {
                    const base = { ...td, position: "sticky", right: sumRight(i), zIndex: 1, minWidth: w, maxWidth: w, background: colors.surface, whiteSpace: "nowrap",
                      fontSize: 11, fontWeight: 700, color: colors.text, borderLeft: i === 0 ? `2px solid ${colors.accent}` : undefined };
                    if (kind === "in") return (
                      <td key={k} title={label} style={base}>
                        {isAdmin ? (
                          <input key={`${emp.key}-${t.addOT}`} defaultValue={t.addOT ? fmtHM(t.addOT) : ""} placeholder="0:00"
                            onBlur={e => { const v = parseHM(e.target.value); if (v !== t.addOT) setAddedOt(emp, e.target.value); }}
                            style={{ width: w - 10, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 4, padding: "2px 3px", color: colors.text, fontSize: 11, textAlign: "center", fontFamily: font }} />
                        ) : fmtHM(t.addOT)}
                      </td>);
                    if (kind === "d") {
                      const signed = k === "net";
                      const val = t[k], dec = t.dec[k], car = t.carried[k];
                      const valColor = signed ? (val > 0 ? colors.success : val < 0 ? (colors.danger || "#e57373") : colors.textDim) : colors.text;
                      const btn = (code, sym, tip) => {
                        const on = dec === code;
                        return (
                          <button key={code} disabled={!isAdmin} title={tip} onClick={() => setDecision(emp, k, on ? "" : code, val)}
                            style={{ border: `1px solid ${on ? (code === "carry" ? colors.warning : colors.success) : colors.border}`, background: on ? (code === "carry" ? `${colors.warning}33` : `${colors.success}33`) : "transparent",
                              color: on ? (code === "carry" ? colors.warning : colors.success) : colors.textDim, borderRadius: 4, fontSize: 10, lineHeight: "12px", padding: "1px 5px", cursor: isAdmin ? "pointer" : "default", fontFamily: font }}>
                            {sym}
                          </button>);
                      };
                      return (
                        <td key={k} title={`${label}${car ? `\n${tr("Carried over from", "Devreden:")} ${prevLabel}: ${signed ? fmtSigned(car) : fmtHM(car)}` : ""}`} style={{ ...base, padding: "2px 2px" }}>
                          <div style={{ color: valColor, fontWeight: 800 }}>{signed ? fmtSigned(val) : fmtHM(val)}</div>
                          {car ? <div style={{ fontSize: 9, fontWeight: 400, color: colors.warning }}>↪ {signed ? fmtSigned(car) : fmtHM(car)}</div> : null}
                          <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 1 }}>
                            {btn("include", "✓", tr("Include in this month's calculation", "Bu ayın hesabına dahil et"))}
                            {btn("carry", "→", tr("Carry over to next month", "Sonraki aya devret"))}
                          </div>
                        </td>);
                    }
                    return (
                      <td key={k} title={label}
                        style={{ ...base, fontWeight: k === "units" ? 800 : 700, color: k === "units" ? colors.accent : colors.text }}>
                        {fmtSum(t[k], kind)}
                      </td>);
                  }); })()}
                </tr>
              ))}
              {!shown.length && (
                <tr><td colSpan={days.length + 2 + SUMMARY_COLS.length} style={{ ...td, padding: 20, color: colors.textDim, fontSize: 12 }}>{tr("No employees to show.", "Gösterilecek çalışan yok.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 10, color: colors.textDim, marginTop: 6 }}>
        {tr("Under each day: first box = Multinet (meal allowance), second box = Travel (double allowance; also ticks Multinet). Multinet is ticked automatically on full working days (M) only, not on half days (½RT). ",
            "Her günün altında: ilk kutu = Multinet (yemek), ikinci kutu = Seyahat (çift yemek; Multinet'i de işaretler). Multinet yalnızca tam çalışma günlerinde (M) otomatik işaretlidir, yarım günde (½RT) değil. ")}
        {tr("Right: M / HT / RT / L / İ / R day counts, 🍽 days with Multinet, ✈ travel days, Σ🍽 Multinet units (a travel day counts twice), late/early arrivals and departures, total status and hourly leave (h:mm). L and hourly leave (⏱) come from approved leave in Odoo. ",
            "Sağda: M / HT / RT / L / İ / R gün sayıları, 🍽 Multinet'li gün, ✈ seyahat günü, Σ🍽 Multinet birimi (seyahat günü iki sayılır), geç/erken giriş ve çıkışlar, toplam durum ve saatlik izin (s:dk). L ve saatlik izin (⏱) Odoo'daki onaylı izinlerden gelir. ")}
        {tr("Linked to Odoo: each change is sent about 30 seconds later — every day becomes an Odoo work entry (M = Attendance, ½RT = half Attendance + half holiday, RT = holiday, İ = Paid Time Off, Üİ = Unpaid, R = Sick; L comes from Odoo itself) and the totals go to Bordro > Raporlama > Aylık Puantaj. ",
            "Odoo'ya bağlı: her değişiklik yaklaşık 30 saniye sonra gönderilir — her gün Odoo iş girişi olur (M = Attendance, ½RT = yarım Attendance + yarım tatil, RT = tatil, İ = Ücretli izin, Üİ = Ücretsiz, R = Rapor; L zaten Odoo'dan gelir) ve toplamlar Bordro > Raporlama > Aylık Puantaj'a yazılır. ")}
        {tr("Total status, Hourly leave and Overtime: ✓ includes the amount in this month's calculation, → carries it over to next month, where it shows as ↪ and is added to that month's amount (admins only). Work on a Sunday (HT) counts as overtime. ",
            "Toplam durum, Saatlik izin ve Fazla mesai: ✓ tutarı bu ayın hesabına dahil eder, → sonraki aya devreder; orada ↪ olarak görünür ve o ayın tutarına eklenir (yalnızca yöneticiler). Pazar (HT) günü çalışma fazla mesai sayılır. ")}
        {tr("Cells with a dashed frame were changed by hand; choosing the automatic value again resets them. Public holidays are locked.",
            "Kesik çerçeveli hücreler elle değiştirildi; otomatik değeri tekrar seçmek sıfırlar. Resmi tatiller kilitlidir.")}
      </div>
    </div>
  );
}

// "Log hourly attendance": enter the timesheet in/out times of one person for the month. Stored in the old tracker's
// records (attendance_records, same as the Table tab), so the existing Odoo sync keeps working.
function HourlyLog({ colors, font, lang, employees, days, recName, hourly, codeOf, leaves, onClose, onSaved }) {
  const tr = (en, t) => (lang === "tr" ? t : en);
  const DOWS = lang === "tr" ? DOW_TR : DOW_EN;
  const [empKey, setEmpKey] = useState(employees[0]?.key || "");
  const [draft, setDraft] = useState({});
  useEffect(() => { setDraft({}); }, [empKey]);
  const emp = employees.find(e => e.key === empKey);
  const base = d => hourly[empKey]?.[d.key] || { in: "", out: "", type: "", leaveStart: "", leaveEnd: "", halfWith: "", lunchBreak: false };
  const val = (d, f) => (draft[d.key] && f in draft[d.key] ? draft[d.key][f] : base(d)[f]);
  const commit = d => {
    const dr = draft[d.key];
    if (!dr) return;
    const ent = { ...base(d), ...dr };
    if (ent.in === base(d).in && ent.out === base(d).out) return;
    const name = recName[empKey] || emp?.name;
    fetch(`/attendance/records/${encodeURIComponent(name)}/${d.key}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(ent) })
      .then(r => { if (!r.ok) throw new Error(r.status); onSaved(empKey, d.key, ent); })
      .catch(() => window.alert(tr("Could not save — please try again.", "Kaydedilemedi — lütfen tekrar deneyin.")));
  };
  const inp = { width: 62, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 4, padding: "3px 5px", color: colors.text, fontSize: 12, fontFamily: font, textAlign: "center" };
  const cellSt = { padding: "4px 8px", borderBottom: `1px solid ${colors.border}`, fontSize: 12, color: colors.text, whiteSpace: "nowrap" };
  const tot = { lateArr: 0, earlyArr: 0, earlyDep: 0, lateDep: 0, net: 0 };
  const netColor = n => (n > 0 ? colors.success : n < 0 ? (colors.danger || "#e57373") : colors.textDim);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflow: "auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 16, width: "min(900px, 100%)", fontFamily: font }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <b style={{ fontSize: 15, color: colors.text }}>⏱ {tr("Log hourly attendance", "Saatlik mesai gir")}</b>
          <select value={empKey} onChange={e => setEmpKey(e.target.value)}
            style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "5px 8px", color: colors.text, fontSize: 12, fontFamily: font }}>
            {employees.map(e => <option key={e.key} value={e.key}>{e.name}</option>)}
          </select>
          <span style={{ fontSize: 11, color: colors.textDim }}>{tr("Schedule 08:30–18:30 (10h incl. lunch). Type 0830 for 08:30; saved when you leave the box.", "Mesai 08:30–18:30 (öğle dahil 10 saat). 08:30 için 0830 yazın; kutudan çıkınca kaydedilir.")}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: colors.textMuted, fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ maxHeight: "65vh", overflow: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              {[tr("Date", "Tarih"), tr("Day", "Gün"), tr("Code", "Kod"), tr("In", "Giriş"), tr("Out", "Çıkış"), tr("Late in", "Geç giriş"), tr("Early in", "Erken giriş"),
                tr("Early out", "Erken çıkış"), tr("Late out", "Geç çıkış"), tr("Status", "Durum"), tr("Hourly leave", "Saatlik izin")].map(h =>
                <th key={h} style={{ ...cellSt, position: "sticky", top: 0, background: "#1a1a1a", color: colors.accent, fontSize: 11 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {days.map(d => {
                const code = codeOf(empKey, d);
                const c = dayClock({ in: val(d, "in"), out: val(d, "out") }, code);
                tot.lateArr += c.lateArr; tot.earlyArr += c.earlyArr; tot.earlyDep += c.earlyDep; tot.lateDep += c.lateDep; if (c.net != null) tot.net += c.net;
                const lvH = leaves[empKey]?.[d.key]?.hours;
                return (
                  <tr key={d.key} style={{ opacity: ["M", "HRT"].includes(code) ? 1 : 0.6 }}>
                    <td style={cellSt}>{String(d.day).padStart(2, "0")}</td>
                    <td style={cellSt}>{DOWS[d.dow]}</td>
                    <td style={{ ...cellSt, fontWeight: 700 }}>{CODE_LABEL[code]}</td>
                    {["in", "out"].map(f => (
                      <td key={f} style={cellSt}>
                        <input value={val(d, f)} placeholder="--:--" style={inp}
                          onChange={e => setDraft(p => ({ ...p, [d.key]: { ...(p[d.key] || {}), [f]: fmtTimeInput(e.target.value) } }))}
                          onBlur={() => commit(d)} />
                      </td>
                    ))}
                    <td style={cellSt}>{fmtHM(c.lateArr)}</td>
                    <td style={cellSt}>{fmtHM(c.earlyArr)}</td>
                    <td style={cellSt}>{fmtHM(c.earlyDep)}</td>
                    <td style={cellSt}>{fmtHM(c.lateDep)}</td>
                    <td style={{ ...cellSt, fontWeight: 700, color: netColor(c.net ?? c.restWork) }}
                      title={c.restWork ? tr("Work on the rest day — counted as overtime", "Hafta tatilinde çalışma — fazla mesai sayılır") : undefined}>
                      {c.restWork ? `+${fmtHM(c.restWork)} ${tr("OT", "FM")}` : fmtSigned(c.net)}
                    </td>
                    <td style={{ ...cellSt, color: "#9c6ade" }}>{lvH ? fmtHM(lvH * 60) : "—"}</td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={5} style={{ ...cellSt, fontWeight: 700 }}>{tr("Month total", "Ay toplamı")}</td>
                <td style={{ ...cellSt, fontWeight: 700 }}>{fmtHM(tot.lateArr)}</td>
                <td style={{ ...cellSt, fontWeight: 700 }}>{fmtHM(tot.earlyArr)}</td>
                <td style={{ ...cellSt, fontWeight: 700 }}>{fmtHM(tot.earlyDep)}</td>
                <td style={{ ...cellSt, fontWeight: 700 }}>{fmtHM(tot.lateDep)}</td>
                <td style={{ ...cellSt, fontWeight: 800, color: netColor(tot.net) }}>{fmtSigned(tot.net)}</td>
                <td style={cellSt}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HolidayPanel({ colors, font, lang, year, isAdmin, onChanged }) {
  const tr = (en, t) => (lang === "tr" ? t : en);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ date: "", name_tr: "", name_en: "", half: false });
  const load = () => fetch(`/attendance/holidays?year=${year}`, { headers: authHeaders() }).then(r => r.json()).then(d => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([]));
  useEffect(() => { load(); }, [year]);
  const save = async () => {
    if (!form.date || !form.name_tr.trim()) return;
    const r = await fetch(`/attendance/holidays/${form.date}`, { method: "PUT", headers: authHeaders(), body: JSON.stringify(form) });
    if (!r.ok) { window.alert(tr("Could not save.", "Kaydedilemedi.")); return; }
    setForm({ date: "", name_tr: "", name_en: "", half: false }); load(); onChanged();
  };
  const del = async date => {
    if (!window.confirm(tr(`Delete the holiday on ${date}?`, `${date} tarihindeki tatil silinsin mi?`))) return;
    await fetch(`/attendance/holidays/${date}`, { method: "DELETE", headers: authHeaders() }); load(); onChanged();
  };
  const inp = { background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, padding: "5px 8px", color: colors.text, fontSize: 12, fontFamily: font };
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14, marginBottom: 10, fontFamily: font }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: colors.text, marginBottom: 8 }}>{tr(`Public holidays ${year}`, `${year} resmi tatilleri`)}</div>
      <table style={{ borderCollapse: "collapse", fontSize: 12, color: colors.text, marginBottom: 10 }}>
        <tbody>
          {rows.map(h => (
            <tr key={h.date}>
              <td style={{ padding: "3px 10px 3px 0", whiteSpace: "nowrap" }}>{h.date.slice(8, 10)}.{h.date.slice(5, 7)}.{h.date.slice(0, 4)}</td>
              <td style={{ padding: "3px 10px 3px 0" }}>{lang === "tr" ? h.name_tr : (h.name_en || h.name_tr)}</td>
              <td style={{ padding: "3px 10px 3px 0", color: colors.textDim }}>{h.half ? tr("half day", "yarım gün") : ""}</td>
              {isAdmin && <td><button onClick={() => del(h.date)} style={{ background: "none", border: "none", color: colors.textDim, cursor: "pointer" }}>×</button></td>}
            </tr>
          ))}
          {!rows.length && <tr><td style={{ color: colors.textDim }}>{tr("No holidays entered for this year.", "Bu yıl için tatil girilmemiş.")}</td></tr>}
        </tbody>
      </table>
      {isAdmin && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inp} />
          <input value={form.name_tr} onChange={e => setForm({ ...form, name_tr: e.target.value })} placeholder={tr("Name (Turkish)", "Ad (Türkçe)")} style={{ ...inp, width: 200 }} />
          <input value={form.name_en} onChange={e => setForm({ ...form, name_en: e.target.value })} placeholder={tr("Name (English)", "Ad (İngilizce)")} style={{ ...inp, width: 200 }} />
          <label style={{ fontSize: 12, color: colors.text }}><input type="checkbox" checked={form.half} onChange={e => setForm({ ...form, half: e.target.checked })} /> {tr("Half day (eve)", "Yarım gün (arife)")}</label>
          <button onClick={save} style={{ background: colors.primary, border: "none", borderRadius: 6, padding: "6px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: font }}>{tr("Add / update", "Ekle / güncelle")}</button>
        </div>
      )}
    </div>
  );
}
