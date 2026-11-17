// Attendance Tracker — monthly sheet (puantaj). Esra's spec, part 1 (points 1–4):
//   people down the side (active Odoo employees + the company they are insured under, filterable),
//   every day of the month across with its weekday, and one code per person per day.
//   Mon–Sat = M (working day), Sunday = HT (weekly rest), public holiday = RT (locked), arife = ½RT,
//   İ = on leave, R = sick leave / medical report. The month starts pre-filled as if everyone worked their full schedule;
//   only cells someone changes are stored (server table attendance_sheet). Old tracker leave/holiday days show as İ / RT.
// Every label has an English and a Turkish version (the ERP's TR/EN switch).
import { useState, useEffect, useMemo } from "react";

const DOW_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const DOW_FULL_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// stored key -> what is shown in the cell
const CODE_LABEL = { M: "M", HT: "HT", RT: "RT", HRT: "½RT", I: "İ", R: "R" };
const EDITABLE_CODES = ["M", "HT", "I", "R"];

const dk = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("sns_token")}` });

export default function AttendanceSheet({ colors, font, lang, year, month, isAdmin }) {
  const tr = (en, t) => (lang === "tr" ? t : en);
  const [sheet, setSheet] = useState({ employees: [], cells: {}, legacy: {}, holidays: [], fromOdoo: true, odooError: "" });
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState("__all__");
  const [search, setSearch] = useState("");
  const [showHolidays, setShowHolidays] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`/attendance/sheet?year=${year}&month=${month + 1}${reload ? "&refresh=1" : ""}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setSheet({ employees: d.employees || [], cells: d.cells || {}, legacy: d.legacy || {}, holidays: d.holidays || [], fromOdoo: !!d.fromOdoo, odooError: d.odooError || "" }))
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
    }).then(r => { if (!r.ok) throw new Error(r.status); })
      .catch(() => window.alert(tr("Could not save — please reload the page.", "Kaydedilemedi — lütfen sayfayı yenileyin.")));
  }

  // ── Multinet / Travel (step 2) ──
  // Multinet ticked = meal allowance that day; Travel ticked = double allowance (Travel always includes Multinet).
  // Neither = 0, Multinet only = 1 unit, Multinet + Travel = 2 units. No money is shown here, only days / units.
  // Automatic (nothing stored): Multinet on for M and ½RT days, off otherwise; Travel off.
  const autoMultinet = code => code === "M" || code === "HRT";
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
      .then(r => { if (!r.ok) throw new Error(r.status); })
      .catch(() => window.alert(tr("Could not save — please reload the page.", "Kaydedilemedi — lütfen sayfayı yenileyin.")));
  }
  // per-person totals for the summary on the right (a ½RT day counts half M, half RT)
  const summaryOf = empKey => {
    const t = { M: 0, HT: 0, RT: 0, I: 0, R: 0, multinet: 0, travel: 0, units: 0 };
    days.forEach(d => {
      const code = codeOf(empKey, d);
      if (code === "HRT") { t.M += 0.5; t.RT += 0.5; } else if (code in t) t[code] += 1;
      const f = flagsOf(empKey, d);
      if (f.multinet) { t.multinet += 1; t.units += f.travel ? 2 : 1; }
      if (f.travel) t.travel += 1;
    });
    return t;
  };
  const fmtN = n => (Number.isInteger(n) ? String(n) : String(n).replace(".", lang === "tr" ? "," : "."));
  const SUMMARY_COLS = [
    ["M", tr("Working days", "Çalışma günü")], ["HT", tr("Weekly rest", "Hafta tatili")], ["RT", tr("Public holiday", "Resmi tatil")],
    ["I", tr("On leave", "İzinli")], ["R", tr("Sick leave / report", "Raporlu")],
    ["multinet", tr("Days with Multinet", "Multinet'li gün")], ["travel", tr("Travel days (double)", "Seyahat günü (çift)")],
    ["units", tr("Multinet units (travel counts twice)", "Multinet birimi (seyahat iki sayılır)")],
  ];
  const SUM_W = 40;
  const SUMMARY_HEAD = { M: "M", HT: "HT", RT: "RT", I: "İ", R: "R", multinet: "🍽", travel: "✈", units: "Σ🍽" };

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
    ["I", tr("On leave", "İzinli")], ["R", tr("Sick leave / medical report", "Raporlu")],
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
                {SUMMARY_COLS.map(([k, label], i) => (
                  <th key={k} title={label}
                    style={{ ...th, minWidth: SUM_W, maxWidth: SUM_W, right: (SUMMARY_COLS.length - 1 - i) * SUM_W, zIndex: 4, background: "#26262c", borderLeft: i === 0 ? `2px solid ${colors.accent}` : undefined }}>
                    {SUMMARY_HEAD[k]}
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
                      <td key={d.key} style={{ ...td, background: s.bg }}>
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
                  {(() => { const t = summaryOf(emp.key); return SUMMARY_COLS.map(([k, label], i) => (
                    <td key={k} title={label}
                      style={{ ...td, position: "sticky", right: (SUMMARY_COLS.length - 1 - i) * SUM_W, zIndex: 1, minWidth: SUM_W, maxWidth: SUM_W, background: colors.surface,
                        fontSize: 11, fontWeight: k === "units" ? 800 : 700, color: k === "units" ? colors.accent : colors.text, borderLeft: i === 0 ? `2px solid ${colors.accent}` : undefined }}>
                      {fmtN(t[k])}
                    </td>)); })()}
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
        {tr("Under each day: first box = Multinet (meal allowance), second box = Travel (double allowance; also ticks Multinet). Multinet is ticked automatically on M and ½RT days. ",
            "Her günün altında: ilk kutu = Multinet (yemek), ikinci kutu = Seyahat (çift yemek; Multinet'i de işaretler). Multinet, M ve ½RT günlerinde otomatik işaretlidir. ")}
        {tr("Right: M / HT / RT / İ / R day counts, 🍽 days with Multinet, ✈ travel days, Σ🍽 Multinet units (a travel day counts twice). ",
            "Sağda: M / HT / RT / İ / R gün sayıları, 🍽 Multinet'li gün, ✈ seyahat günü, Σ🍽 Multinet birimi (seyahat günü iki sayılır). ")}
        {tr("Cells with a dashed frame were changed by hand; choosing the automatic value again resets them. Public holidays are locked.",
            "Kesik çerçeveli hücreler elle değiştirildi; otomatik değeri tekrar seçmek sıfırlar. Resmi tatiller kilitlidir.")}
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
