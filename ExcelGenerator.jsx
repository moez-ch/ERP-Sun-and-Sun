// Excel Tools -> Excel Generator: pick a source, filters and columns, download an .xlsx built from live Odoo data.
// Backend: excel_gen.js (/excelgen/*, admin only). Texts follow the TR / EN language button (lang prop).
import { useState, useEffect, useMemo } from "react";

const OPS = {
  char: [["contains", "contains", "içerir"], ["notcontains", "does not contain", "içermez"], ["eq", "equals", "eşittir"], ["ne", "is not", "eşit değildir"], ["set", "is filled in", "dolu"], ["notset", "is empty", "boş"]],
  selection: [["in", "is any of", "şunlardan biri"], ["notin", "is none of", "şunlardan hiçbiri"], ["set", "is filled in", "dolu"], ["notset", "is empty", "boş"]],
  boolean: [["true", "is ticked", "işaretli"], ["false", "is not ticked", "işaretli değil"]],
  number: [["eq", "equals", "eşittir"], ["ne", "not equal", "eşit değildir"], ["gt", "greater than", "büyüktür"], ["ge", "at least", "en az"], ["lt", "less than", "küçüktür"], ["le", "at most", "en çok"], ["set", "is filled in", "dolu"], ["notset", "is empty", "boş"]],
  date: [["on", "on", "tarihinde"], ["after", "on or after", "tarihinde veya sonra"], ["before", "on or before", "tarihinde veya önce"], ["between", "between", "arasında"], ["set", "is filled in", "dolu"], ["notset", "is empty", "boş"]],
};
const GROUP = { char: "char", text: "char", many2one: "char", many2many: "char", selection: "selection", boolean: "boolean", integer: "number", float: "number", monetary: "number", date: "date", datetime: "date" };
const grp = (t) => GROUP[t] || "char";
// names/hints the server sends in English; shown in Turkish when the TR button is on
const SRC_TR = {
  companies: ["Firmalar", "Kişi veritabanındaki firmalar"], contacts: ["Kişiler (yetkililer)", "Bir firmaya bağlı kişiler"],
  "crm.lead": ["Pipeline kartları", "Fırsatlar / program takip kartları"], "project.task": ["Görevler", "Yapılacaklar ve proje görevleri"],
  "hr.employee": ["Çalışanlar", "Personel kayıtları"], "hr.leave": ["İzinler", "İzin talepleri"],
  "fleet.vehicle": ["Araçlar", "Şirket araçları"], "mailing.contact": ["Toplu e-posta kişileri", "Toplu e-posta liste kayıtları"],
};
const VIRT_TR = { "@contacts": "Yetkili kişi(ler)", "@phone": "Telefon numarası", "@phone_type": "Telefon türü", "@company": "Firma", "@notice": "Aranmama uyarısı" };
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("sns_token")}` });

async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: hdr(), body: JSON.stringify(body) } : { headers: hdr() });
  if (!r.ok) { let e = r.statusText; try { e = (await r.json()).error || e; } catch { /* keep status text */ } throw new Error(e); }
  return r;
}

export default function ExcelGeneratorView({ colors, font, lang, onBack }) {
  const tr = (en, t) => (lang === "tr" ? t : en);
  const STEPS = [tr("Source", "Kaynak"), tr("Filters", "Filtreler"), tr("Columns", "Sütunlar"), tr("Download", "İndir")];
  const EMPTY = { base: "", filters: [], columns: [], filename: "", sheet1: "", sheet2: "", rules: { excl_refs: false, excl_closed: false, dnc: "include" }, phone: "any" };
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(0);
  const [S, setS] = useState(EMPTY);
  const [pv, setPv] = useState(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null);
  const [q, setQ] = useState("");
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  useEffect(() => { api("/excelgen/meta").then((r) => r.json()).then(setMeta).catch((e) => setErr(e.message)); }, []);
  const fields = useMemo(() => (meta && S.base ? meta.fields[S.base] || [] : []), [meta, S.base]);
  const fmap = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, f])), [fields]);
  const isPartner = S.base === "companies" || S.base === "contacts";
  const set = (patch) => setS((s) => ({ ...s, ...patch }));
  const spec = () => ({ ...S, lang, filters: S.filters.filter((f) => f.field) });
  const srcName = (k, v) => (lang === "tr" && SRC_TR[k] ? SRC_TR[k][0] : v.label);
  const srcHint = (k, v) => (lang === "tr" && SRC_TR[k] ? SRC_TR[k][1] : v.hint);
  const virtLabel = (v) => (lang === "tr" ? VIRT_TR[v.name] || v.label : v.label);

  const c = colors;
  const card = { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 22, marginBottom: 18 };
  const input = { width: "100%", padding: "9px 11px", border: `1px solid ${c.border}`, borderRadius: 8, background: c.bg, color: c.text, fontFamily: font, fontSize: 13 };
  const btn = { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", color: c.text, fontFamily: font, fontSize: 13 };
  const primary = { ...btn, background: c.primary, borderColor: c.primary, color: "#fff", fontWeight: 600 };
  const muted = { color: c.textMuted, fontSize: 12 };
  const danger = c.danger || "#EF4444", ok = c.success || "#10B981";
  const empty = { padding: 28, textAlign: "center", border: `2px dashed ${c.border}`, borderRadius: 12, ...muted };

  const go = (n) => { if (n > 0 && !S.base) return; setStep(n); setPv(null); setNote(null); };
  const pickSource = (k) => { if (S.base !== k) setS({ ...EMPTY, base: k }); };

  async function preview(s = spec()) {
    if (!s.columns.length) { setPv({ empty: true }); return; }
    setBusy(tr("Reading Odoo…", "Odoo okunuyor…")); setNote(null);
    try { setPv(await (await api("/excelgen/preview", s)).json()); }
    catch (e) { setNote({ bad: true, text: e.message }); }
    setBusy("");
  }
  useEffect(() => { if (step === 3) preview(); /* eslint-disable-next-line */ }, [step, lang]);

  async function generate() {
    if (!S.columns.length) { setNote({ bad: true, text: tr("Choose at least one column first.", "Önce en az bir sütun seçin.") }); return; }
    setBusy(tr("Building the file…", "Dosya hazırlanıyor…")); setNote(null);
    try {
      const r = await api("/excelgen/generate", spec());
      const st = JSON.parse(r.headers.get("X-Stats") || "{}");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (S.filename || tr("export", "liste")).replace(/[^\w-]+/g, "_") + ".xlsx";
      a.click();
      setNote({ text: tr(`Downloaded: ${st.rows} rows${st.side_rows ? ` + ${st.side_rows} on the second sheet` : ""}. This export was logged.`,
                         `İndirildi: ${st.rows} satır${st.side_rows ? ` + ikinci sayfada ${st.side_rows}` : ""}. Bu dışa aktarma kayda alındı.`) });
    } catch (e) { setNote({ bad: true, text: e.message }); }
    setBusy("");
  }

  async function savePreset() {
    const n = window.prompt(tr("Name this setup:", "Bu ayara bir ad verin:")); if (!n) return;
    const r = await (await api("/excelgen/preset", { name: n, spec: S })).json();
    setMeta((m) => ({ ...m, presets: r.presets }));
  }

  // ---------- pieces
  const Title = ({ h, p }) => (<><h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", fontFamily: font }}>{h}</h2><p style={{ ...muted, fontSize: 13, margin: "0 0 22px" }}>{p}</p></>);
  const Nav = ({ back, next, nextLabel, disabled }) => (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
      {back !== undefined ? <button style={btn} onClick={() => go(back)}>← {tr("Back", "Geri")}</button> : <span />}
      {next !== undefined && <button style={{ ...primary, opacity: disabled ? 0.5 : 1 }} disabled={disabled} onClick={() => go(next)}>{nextLabel}</button>}
    </div>
  );

  function FilterRow({ f, i }) {
    const fd = f.field ? fmap[f.field] : null, g = fd ? grp(fd.type) : "char";
    const upd = (p) => set({ filters: S.filters.map((x, j) => (j === i ? { ...x, ...p } : x)) });
    const noValue = ["set", "notset", "true", "false"].includes(f.op);
    let val = null;
    if (fd && !noValue) {
      if (g === "selection") val = (
        <select multiple style={{ ...input, height: 110 }} value={f.value || []} onChange={(e) => upd({ value: [...e.target.selectedOptions].map((o) => o.value) })}>
          {fd.selection.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}
        </select>);
      else if (g === "date" && f.op === "between") val = (<>
        <input type="date" style={input} value={(f.value || [])[0] || ""} onChange={(e) => upd({ value: [e.target.value, (f.value || [])[1] || ""] })} />
        <input type="date" style={{ ...input, marginTop: 8 }} value={(f.value || [])[1] || ""} onChange={(e) => upd({ value: [(f.value || [])[0] || "", e.target.value] })} /></>);
      else val = <input type={g === "date" ? "date" : g === "number" ? "number" : "text"} style={input} value={Array.isArray(f.value) ? "" : f.value ?? ""} onChange={(e) => upd({ value: e.target.value })} />;
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,1.3fr) minmax(130px,1fr) minmax(160px,1.5fr) 40px", gap: 12, alignItems: "start", padding: "12px 0", borderBottom: `1px solid ${c.border}` }}>
        <select style={input} value={f.field} onChange={(e) => { const nf = fmap[e.target.value]; const ng = nf ? grp(nf.type) : "char"; upd({ field: e.target.value, op: OPS[ng][0][0], value: ng === "selection" ? [] : "" }); }}>
          <option value="">{tr("Choose a field…", "Alan seçin…")}</option>{fields.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}
        </select>
        <select style={input} value={f.op} onChange={(e) => upd({ op: e.target.value, value: g === "selection" ? [] : "" })}>
          {OPS[g].map((o) => <option key={o[0]} value={o[0]}>{tr(o[1], o[2])}</option>)}
        </select>
        <div>{val}</div>
        <button style={{ ...btn, border: "none", background: "none", color: danger, fontSize: 20, padding: 4 }} title={tr("Remove", "Kaldır")} onClick={() => set({ filters: S.filters.filter((_, j) => j !== i) })}>×</button>
      </div>
    );
  }

  const used = new Set(S.columns.map((x) => x.key));
  const avail = useMemo(() => {
    const virt = isPartner ? meta?.virtual.filter((v) => S.base === "companies" || v.name !== "@contacts").map((v) => ({ key: v.name, label: virtLabel(v), virt: true })) : [];
    const ql = q.toLowerCase().trim();
    return [...(virt || []), ...fields.map((f) => ({ key: f.name, label: f.label }))].filter((x) => !used.has(x.key) && (!ql || x.label.toLowerCase().includes(ql) || x.key.toLowerCase().includes(ql))).slice(0, 400);
  }, [meta, fields, q, S.columns, S.base, lang]); // eslint-disable-line
  const moveCol = (i, d) => { const a = [...S.columns]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ columns: a }); };

  // ---------- render
  if (err) return <div style={card}><button style={btn} onClick={onBack}>← {tr("Back", "Geri")}</button><p style={{ color: danger, marginTop: 14 }}>{err}</p></div>;
  if (!meta) return <div style={{ ...muted, padding: 30 }}>{tr("Loading Odoo fields…", "Odoo alanları yükleniyor…")}</div>;

  const rulesOpen = S.rules.excl_refs || S.rules.excl_closed || S.rules.dnc !== "include" || S.phone !== "any";
  const stat = (n, l) => (<div key={l} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "12px 20px" }}><div style={{ fontSize: 24, fontWeight: 700 }}>{n}</div><div style={muted}>{l}</div></div>);
  const colWord = tr(`column${S.columns.length === 1 ? "" : "s"} in your Excel`, "sütun Excel'inizde");

  return (
    <div style={{ animation: "slideIn .3s ease", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <button style={btn} onClick={onBack}>← {tr("Back", "Geri")}</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, fontFamily: font, margin: 0 }}>📊 {tr("Excel Generator", "Excel Oluşturucu")}</h1>
        <div style={{ display: "flex", gap: 6, marginLeft: 18 }}>
          {STEPS.map((n, i) => (
            <button key={i} onClick={() => go(i)} style={{ ...btn, border: "none", borderRadius: 999, padding: "6px 14px", background: i === step ? c.surfaceHover : "none", color: i === step ? c.primaryLight || c.primary : c.textMuted, fontWeight: i === step ? 600 : 400 }}>
              <span style={{ display: "inline-flex", width: 20, height: 20, borderRadius: "50%", alignItems: "center", justifyContent: "center", fontSize: 11, marginRight: 7, background: i < step ? ok : i === step ? c.primary : c.border, color: i <= step ? "#fff" : c.textMuted }}>{i < step ? "✓" : i + 1}</span>{n}
            </button>))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <select style={{ ...input, width: 200 }} value="" onChange={(e) => { const p = meta.presets[e.target.value]; if (p) { setS(JSON.parse(JSON.stringify(p))); setStep(1); } }}>
            <option value="">{tr("Saved setups", "Kayıtlı ayarlar")}</option>{Object.keys(meta.presets).map((n) => <option key={n}>{n}</option>)}
          </select>
          <button style={btn} disabled={!S.base} onClick={savePreset}>{tr("Save setup", "Ayarı kaydet")}</button>
        </div>
      </div>

      {step === 0 && (<>
        <Title h={tr("What do you want a list of?", "Neyin listesini istiyorsunuz?")} p={tr("Pick the kind of record. Every row of your Excel will be one of these.", "Kayıt türünü seçin. Excel'inizin her satırı bunlardan biri olacak.")} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${vw >= 1250 ? 4 : vw >= 750 ? 2 : 1}, 1fr)`, gap: 16 }}>
          {Object.entries(meta.sources).map(([k, v]) => (
            <button key={k} onClick={() => pickSource(k)} style={{ ...card, marginBottom: 0, textAlign: "left", cursor: "pointer", fontFamily: font, color: c.text, border: `2px solid ${S.base === k ? c.primary : c.border}`, background: S.base === k ? c.surfaceHover : c.surface }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{srcName(k, v)}</div><div style={muted}>{srcHint(k, v)}</div>
            </button>))}
        </div>
        <Nav next={1} nextLabel={tr("Next: filters →", "Sonraki: filtreler →")} disabled={!S.base} />
      </>)}

      {step === 1 && (<>
        <Title h={tr("Which ones do you want?", "Hangilerini istiyorsunuz?")} p={tr("Add conditions to narrow the list down. With no conditions you get everything.", "Listeyi daraltmak için koşul ekleyin. Koşul yoksa hepsi gelir.")} />
        <div style={card}>
          {S.filters.length ? S.filters.map((f, i) => <div key={i}>{FilterRow({ f, i })}</div>)
            : <div style={empty}>{tr("No conditions — all records will be included.", "Koşul yok — tüm kayıtlar dahil edilecek.")}</div>}
          <button style={{ ...btn, marginTop: 16 }} onClick={() => set({ filters: [...S.filters, { field: "", op: "contains", value: "" }] })}>+ {tr("Add a condition", "Koşul ekle")}</button>
        </div>
        {isPartner && (
          <details style={card} open={rulesOpen}>
            <summary style={{ cursor: "pointer", color: c.primary, fontWeight: 600 }}>{tr("Ready-made rules for call lists (optional)", "Arama listeleri için hazır kurallar (isteğe bağlı)")}</summary>
            <p style={{ ...muted, margin: "10px 0 6px" }}>{tr("Only needed when the list is for the call centre. Leave everything off for an ordinary export.", "Yalnızca liste çağrı merkezi içinse gerekir. Sıradan bir dışa aktarma için hepsini kapalı bırakın.")}</p>
            <label style={{ display: "flex", gap: 10, margin: "12px 0", alignItems: "flex-start" }}><input type="checkbox" checked={S.rules.excl_refs} onChange={(e) => set({ rules: { ...S.rules, excl_refs: e.target.checked } })} /><span>{tr("Leave out reference sources", "Referans kaynaklarını çıkar")}<br /><span style={muted}>{tr("2020 references, TKYB, Referans (Yasaklı)", "2020 Öncesi/Sonrası Referanslar, TKYB, Referans (Yasaklı)")}</span></span></label>
            <label style={{ display: "flex", gap: 10, margin: "12px 0" }}><input type="checkbox" checked={S.rules.excl_closed} onChange={(e) => set({ rules: { ...S.rules, excl_closed: e.target.checked } })} /><span>{tr("Leave out closed / inactive companies", "Kapanmış / pasif firmaları çıkar")}</span></label>
            <div style={{ ...muted, margin: "10px 0 6px" }}>{tr("Do-not-call companies", "Aranmayacak firmalar")}</div>
            <select style={input} value={S.rules.dnc} onChange={(e) => set({ rules: { ...S.rules, dnc: e.target.value } })}>
              <option value="include">{tr("Treat like everyone else", "Diğerleri gibi davran")}</option><option value="exclude">{tr("Leave them out", "Çıkar")}</option><option value="sheet2">{tr("Put them on a second sheet", "İkinci sayfaya koy")}</option></select>
            {S.base === "companies" && (<>
              <div style={{ ...muted, margin: "14px 0 6px" }}>{tr("Phone numbers", "Telefon numaraları")}</div>
              <select style={input} value={S.phone} onChange={(e) => set({ phone: e.target.value })}>
                <option value="any">{tr("No phone rule", "Telefon kuralı yok")}</option>
                <option value="has_any">{tr("Only those with a phone number", "Yalnızca telefon numarası olanlar")}</option>
                <option value="contact_mobile">{tr("A contact person has a mobile (one row per person)", "Bir yetkilinin cep numarası var (kişi başına satır)")}</option>
                <option value="company_mobile">{tr("No contact mobile, but the company has a mobile", "Yetkili cebi yok, ama firmanın cep numarası var")}</option>
                <option value="landline">{tr("Only landline numbers", "Yalnızca sabit hat")}</option></select></>)}
          </details>)}
        <Nav back={0} next={2} nextLabel={tr("Next: columns →", "Sonraki: sütunlar →")} />
      </>)}

      {step === 2 && (<>
        <Title h={tr("Which columns do you want?", "Hangi sütunları istiyorsunuz?")} p={tr("Click a field on the left to add it. On the right, rename a header by typing in it and reorder with the arrows.", "Eklemek için soldaki bir alana tıklayın. Sağda başlığı yazarak yeniden adlandırın, okları kullanarak sıralayın.")} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 22 }}>
          <div><input style={{ ...input, marginBottom: 10 }} placeholder={tr("Search fields…", "Alan ara…")} value={q} onChange={(e) => setQ(e.target.value)} />
            <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, height: "max(320px, calc(100vh - 330px))", overflow: "auto", background: c.surface }}>
              {avail.length ? avail.map((x) => (
                <div key={x.key} onClick={() => set({ columns: [...S.columns, { key: x.key, label: x.label }] })} style={{ padding: "9px 14px", borderBottom: `1px solid ${c.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = c.surfaceHover)} onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                  {x.label}{x.virt && <span style={{ background: c.accent + "33", color: c.accent, borderRadius: 6, padding: "0 7px", fontSize: 11 }}>{tr("built-in", "hazır")}</span>}<span style={{ marginLeft: "auto", ...muted }}>+ {tr("add", "ekle")}</span>
                </div>)) : <div style={{ padding: 20, ...muted }}>{tr("No field matches.", "Eşleşen alan yok.")}</div>}
            </div></div>
          <div><div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, padding: "9px 0" }}>{S.columns.length} {colWord}</div>
            <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, height: "max(320px, calc(100vh - 330px))", overflow: "auto", background: c.surface }}>
              {S.columns.length ? S.columns.map((x, i) => (
                <div key={x.key} style={{ padding: "6px 10px", borderBottom: `1px solid ${c.border}`, display: "flex", gap: 4, alignItems: "center" }}>
                  <input style={{ ...input, border: "1px solid transparent", background: "none" }} value={x.label} onChange={(e) => set({ columns: S.columns.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
                  <button style={{ ...btn, border: "none", background: "none", padding: "2px 8px" }} onClick={() => moveCol(i, -1)}>↑</button>
                  <button style={{ ...btn, border: "none", background: "none", padding: "2px 8px" }} onClick={() => moveCol(i, 1)}>↓</button>
                  <button style={{ ...btn, border: "none", background: "none", color: danger, fontSize: 18, padding: "2px 8px" }} onClick={() => set({ columns: S.columns.filter((_, j) => j !== i) })}>×</button>
                </div>)) : <div style={{ padding: 20, ...muted }}>{tr("Nothing yet — click a field on the left.", "Henüz yok — soldaki bir alana tıklayın.")}</div>}
            </div></div>
        </div>
        <Nav back={1} next={3} nextLabel={tr("Next: download →", "Sonraki: indir →")} />
      </>)}

      {step === 3 && (<>
        <Title h={tr("Download", "İndir")} p={tr("Check the preview, name the file, and download it.", "Önizlemeyi kontrol edin, dosyaya ad verin ve indirin.")} />
        {note && <div style={{ padding: "11px 16px", borderRadius: 10, marginBottom: 16, background: (note.bad ? danger : ok) + "22", color: note.bad ? danger : ok }}>{note.text}</div>}
        <div style={{ ...card, display: "grid", gridTemplateColumns: S.rules.dnc === "sheet2" ? "2fr 1fr 1fr" : "2fr 1fr", gap: 16 }}>
          <div><div style={{ ...muted, marginBottom: 6 }}>{tr("File name", "Dosya adı")}</div><input style={input} placeholder={tr("export", "liste")} value={S.filename} onChange={(e) => set({ filename: e.target.value })} /></div>
          <div><div style={{ ...muted, marginBottom: 6 }}>{tr("Sheet name", "Sayfa adı")}</div><input style={input} placeholder={tr("List", "Liste")} value={S.sheet1} onChange={(e) => set({ sheet1: e.target.value })} /></div>
          {S.rules.dnc === "sheet2" && <div><div style={{ ...muted, marginBottom: 6 }}>{tr("Second sheet name", "İkinci sayfa adı")}</div><input style={input} placeholder={tr("Do not call - review", "Aranmayacaklar - inceleme")} value={S.sheet2} onChange={(e) => set({ sheet2: e.target.value })} /></div>}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}>
          <button style={{ ...primary, opacity: busy ? 0.5 : 1 }} disabled={!!busy} onClick={generate}>⬇ {tr("Download Excel", "Excel'i indir")}</button>
          <button style={btn} disabled={!!busy} onClick={() => preview()}>{tr("Refresh preview", "Önizlemeyi yenile")}</button><span style={muted}>{busy}</span>
        </div>
        {pv?.empty && <div style={empty}>{tr("You have not chosen any columns yet. Go back one step.", "Henüz sütun seçmediniz. Bir adım geri gidin.")}</div>}
        {pv?.stats && (<>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
            {[stat(pv.stats.rows, tr("rows in the file", "dosyadaki satır")), stat(pv.stats.matched, tr("records found", "bulunan kayıt")),
              pv.stats.side_rows ? stat(pv.stats.side_rows, tr("rows on sheet 2", "2. sayfadaki satır")) : null,
              pv.stats.excluded.closed + pv.stats.excluded.reference ? stat(pv.stats.excluded.closed + pv.stats.excluded.reference, tr("left out by rules", "kurallarla çıkarılan")) : null]}
          </div>
          {pv.stats.truncated && <div style={{ color: danger, marginBottom: 12 }}>{tr(`Only the first ${pv.stats.limit} records are used. Add a condition to narrow the list.`, `Yalnızca ilk ${pv.stats.limit} kayıt kullanılıyor. Listeyi daraltmak için koşul ekleyin.`)}</div>}
          {pv.rows.length ? <PvTable c={c} head={pv.headers} rows={pv.rows} title={tr(`First ${pv.rows.length} rows`, `İlk ${pv.rows.length} satır`)} /> : <div style={empty}>{tr("No records match your conditions.", "Koşullarınıza uyan kayıt yok.")}</div>}
          {pv.side.length > 0 && <div style={{ marginTop: 20 }}><PvTable c={c} head={[...pv.headers, tr("Notice", "Uyarı")]} rows={pv.side} title={tr(`Second sheet (${pv.stats.side_rows} rows), first ${pv.side.length}`, `İkinci sayfa (${pv.stats.side_rows} satır), ilk ${pv.side.length}`)} /></div>}
        </>)}
        <Nav back={2} />
      </>)}
    </div>
  );
}

function PvTable({ c, head, rows, title }) {
  return (<>
    <div style={{ color: c.textMuted, fontSize: 12, marginBottom: 8 }}>{title}:</div>
    <div style={{ overflow: "auto", maxHeight: "max(300px, calc(100vh - 520px))", border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ position: "sticky", top: 0, background: c.surfaceHover, color: c.text, textAlign: "left", padding: "9px 14px", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} title={String(v ?? "")} style={{ padding: "8px 14px", borderBottom: `1px solid ${c.border}`, whiteSpace: "nowrap", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", color: c.text }}>{String(v ?? "")}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </>);
}
