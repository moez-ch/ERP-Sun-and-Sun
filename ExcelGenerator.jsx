// Excel Tools -> Excel Generator: pick a source, filters and columns, download an .xlsx built from live Odoo data.
// Backend: excel_gen.js (/excelgen/*, admin only).
import { useState, useEffect, useMemo } from "react";

const OPS = {
  char: [["contains", "contains"], ["notcontains", "does not contain"], ["eq", "equals"], ["ne", "is not"], ["set", "is filled in"], ["notset", "is empty"]],
  selection: [["in", "is any of"], ["notin", "is none of"], ["set", "is filled in"], ["notset", "is empty"]],
  boolean: [["true", "is ticked"], ["false", "is not ticked"]],
  number: [["eq", "equals"], ["ne", "not equal"], ["gt", "greater than"], ["ge", "at least"], ["lt", "less than"], ["le", "at most"], ["set", "is filled in"], ["notset", "is empty"]],
  date: [["on", "on"], ["after", "on or after"], ["before", "on or before"], ["between", "between"], ["set", "is filled in"], ["notset", "is empty"]],
};
const GROUP = { char: "char", text: "char", many2one: "char", many2many: "char", selection: "selection", boolean: "boolean", integer: "number", float: "number", monetary: "number", date: "date", datetime: "date" };
const grp = (t) => GROUP[t] || "char";
const STEPS = ["Source", "Filters", "Columns", "Download"];
const EMPTY = { base: "", filters: [], columns: [], filename: "export", sheet1: "Sheet1", sheet2: "Do not call - review", rules: { excl_refs: false, excl_closed: false, dnc: "include" }, phone: "any" };
const hdr = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("sns_token")}` });

async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: hdr(), body: JSON.stringify(body) } : { headers: hdr() });
  if (!r.ok) { let e = r.statusText; try { e = (await r.json()).error || e; } catch { /* keep status text */ } throw new Error(e); }
  return r;
}

export default function ExcelGeneratorView({ colors, font, onBack }) {
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
  const spec = () => ({ ...S, filters: S.filters.filter((f) => f.field) });

  const c = colors;
  const card = { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 22, marginBottom: 18 };
  const input = { width: "100%", padding: "9px 11px", border: `1px solid ${c.border}`, borderRadius: 8, background: c.bg, color: c.text, fontFamily: font, fontSize: 13 };
  const btn = { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", color: c.text, fontFamily: font, fontSize: 13 };
  const primary = { ...btn, background: c.primary, borderColor: c.primary, color: "#fff", fontWeight: 600 };
  const muted = { color: c.textMuted, fontSize: 12 };
  const danger = c.danger || "#EF4444", ok = c.success || "#10B981";

  const go = (n) => { if (n > 0 && !S.base) return; setStep(n); setPv(null); setNote(null); };
  const pickSource = (k) => { if (S.base !== k) setS({ ...EMPTY, base: k }); };

  async function preview(s = spec()) {
    if (!s.columns.length) { setPv({ empty: true }); return; }
    setBusy("Reading Odoo…"); setNote(null);
    try { setPv(await (await api("/excelgen/preview", s)).json()); }
    catch (e) { setNote({ bad: true, text: e.message }); }
    setBusy("");
  }
  useEffect(() => { if (step === 3) preview(); /* eslint-disable-next-line */ }, [step]);

  async function generate() {
    if (!S.columns.length) { setNote({ bad: true, text: "Choose at least one column first." }); return; }
    setBusy("Building the file…"); setNote(null);
    try {
      const r = await api("/excelgen/generate", spec());
      const st = JSON.parse(r.headers.get("X-Stats") || "{}");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (S.filename || "export").replace(/[^\w-]+/g, "_") + ".xlsx";
      a.click();
      setNote({ text: `Downloaded: ${st.rows} rows${st.side_rows ? ` + ${st.side_rows} on the second sheet` : ""}. This export was logged.` });
    } catch (e) { setNote({ bad: true, text: e.message }); }
    setBusy("");
  }

  async function savePreset() {
    const n = window.prompt("Name this setup:"); if (!n) return;
    setMeta((m) => ({ ...m }));
    const r = await (await api("/excelgen/preset", { name: n, spec: S })).json();
    setMeta((m) => ({ ...m, presets: r.presets }));
  }

  // ---------- pieces
  const Title = ({ h, p }) => (<><h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", fontFamily: font }}>{h}</h2><p style={{ ...muted, fontSize: 13, margin: "0 0 22px" }}>{p}</p></>);
  const Nav = ({ back, next, nextLabel, disabled }) => (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
      {back !== undefined ? <button style={btn} onClick={() => go(back)}>← Back</button> : <span />}
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
          <option value="">Choose a field…</option>{fields.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}
        </select>
        <select style={input} value={f.op} onChange={(e) => upd({ op: e.target.value, value: g === "selection" ? [] : "" })}>
          {OPS[g].map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
        </select>
        <div>{val}</div>
        <button style={{ ...btn, border: "none", background: "none", color: danger, fontSize: 20, padding: 4 }} title="Remove" onClick={() => set({ filters: S.filters.filter((_, j) => j !== i) })}>×</button>
      </div>
    );
  }

  const used = new Set(S.columns.map((x) => x.key));
  const avail = useMemo(() => {
    const virt = isPartner ? meta?.virtual.filter((v) => S.base === "companies" || v.name !== "@contacts").map((v) => ({ key: v.name, label: v.label, virt: true })) : [];
    const ql = q.toLowerCase().trim();
    return [...(virt || []), ...fields.map((f) => ({ key: f.name, label: f.label }))].filter((x) => !used.has(x.key) && (!ql || x.label.toLowerCase().includes(ql) || x.key.toLowerCase().includes(ql))).slice(0, 400);
  }, [meta, fields, q, S.columns, S.base]); // eslint-disable-line
  const moveCol = (i, d) => { const a = [...S.columns]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ columns: a }); };

  // ---------- render
  if (err) return <div style={card}><button style={btn} onClick={onBack}>← Back</button><p style={{ color: danger, marginTop: 14 }}>{err}</p></div>;
  if (!meta) return <div style={{ ...muted, padding: 30 }}>Loading Odoo fields…</div>;

  const rulesOpen = S.rules.excl_refs || S.rules.excl_closed || S.rules.dnc !== "include" || S.phone !== "any";
  const stat = (n, l) => (<div key={l} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "12px 20px" }}><div style={{ fontSize: 24, fontWeight: 700 }}>{n}</div><div style={muted}>{l}</div></div>);

  return (
    <div style={{ animation: "slideIn .3s ease", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <button style={btn} onClick={onBack}>← Back</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, fontFamily: font, margin: 0 }}>📊 Excel Generator</h1>
        <div style={{ display: "flex", gap: 6, marginLeft: 18 }}>
          {STEPS.map((n, i) => (
            <button key={n} onClick={() => go(i)} style={{ ...btn, border: "none", borderRadius: 999, padding: "6px 14px", background: i === step ? c.surfaceHover : "none", color: i === step ? c.primaryLight || c.primary : c.textMuted, fontWeight: i === step ? 600 : 400 }}>
              <span style={{ display: "inline-flex", width: 20, height: 20, borderRadius: "50%", alignItems: "center", justifyContent: "center", fontSize: 11, marginRight: 7, background: i < step ? ok : i === step ? c.primary : c.border, color: i <= step ? "#fff" : c.textMuted }}>{i < step ? "✓" : i + 1}</span>{n}
            </button>))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <select style={{ ...input, width: 200 }} value="" onChange={(e) => { const p = meta.presets[e.target.value]; if (p) { setS(JSON.parse(JSON.stringify(p))); setStep(1); } }}>
            <option value="">Saved setups</option>{Object.keys(meta.presets).map((n) => <option key={n}>{n}</option>)}
          </select>
          <button style={btn} disabled={!S.base} onClick={savePreset}>Save setup</button>
        </div>
      </div>

      {step === 0 && (<>
        <Title h="What do you want a list of?" p="Pick the kind of record. Every row of your Excel will be one of these." />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${vw >= 1250 ? 4 : vw >= 750 ? 2 : 1}, 1fr)`, gap: 16 }}>
          {Object.entries(meta.sources).map(([k, v]) => (
            <button key={k} onClick={() => pickSource(k)} style={{ ...card, marginBottom: 0, textAlign: "left", cursor: "pointer", fontFamily: font, color: c.text, border: `2px solid ${S.base === k ? c.primary : c.border}`, background: S.base === k ? c.surfaceHover : c.surface }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{v.label}</div><div style={muted}>{v.hint}</div>
            </button>))}
        </div>
        <Nav next={1} nextLabel="Next: filters →" disabled={!S.base} />
      </>)}

      {step === 1 && (<>
        <Title h="Which ones do you want?" p="Add conditions to narrow the list down. With no conditions you get everything." />
        <div style={card}>
          {S.filters.length ? S.filters.map((f, i) => <div key={i}>{FilterRow({ f, i })}</div>)
            : <div style={{ padding: 28, textAlign: "center", border: `2px dashed ${c.border}`, borderRadius: 12, ...muted }}>No conditions — all records will be included.</div>}
          <button style={{ ...btn, marginTop: 16 }} onClick={() => set({ filters: [...S.filters, { field: "", op: "contains", value: "" }] })}>+ Add a condition</button>
        </div>
        {isPartner && (
          <details style={card} open={rulesOpen}>
            <summary style={{ cursor: "pointer", color: c.primary, fontWeight: 600 }}>Ready-made rules for call lists (optional)</summary>
            <p style={{ ...muted, margin: "10px 0 6px" }}>Only needed when the list is for the call centre. Leave everything off for an ordinary export.</p>
            <label style={{ display: "flex", gap: 10, margin: "12px 0", alignItems: "flex-start" }}><input type="checkbox" checked={S.rules.excl_refs} onChange={(e) => set({ rules: { ...S.rules, excl_refs: e.target.checked } })} /><span>Leave out reference sources<br /><span style={muted}>2020 references, TKYB, Referans (Yasaklı)</span></span></label>
            <label style={{ display: "flex", gap: 10, margin: "12px 0" }}><input type="checkbox" checked={S.rules.excl_closed} onChange={(e) => set({ rules: { ...S.rules, excl_closed: e.target.checked } })} /><span>Leave out closed / inactive companies</span></label>
            <div style={{ ...muted, margin: "10px 0 6px" }}>Do-not-call companies</div>
            <select style={input} value={S.rules.dnc} onChange={(e) => set({ rules: { ...S.rules, dnc: e.target.value } })}>
              <option value="include">Treat like everyone else</option><option value="exclude">Leave them out</option><option value="sheet2">Put them on a second sheet</option></select>
            {S.base === "companies" && (<>
              <div style={{ ...muted, margin: "14px 0 6px" }}>Phone numbers</div>
              <select style={input} value={S.phone} onChange={(e) => set({ phone: e.target.value })}>
                <option value="any">No phone rule</option><option value="has_any">Only those with a phone number</option>
                <option value="contact_mobile">A contact person has a mobile (one row per person)</option>
                <option value="company_mobile">No contact mobile, but the company has a mobile</option><option value="landline">Only landline numbers</option></select></>)}
          </details>)}
        <Nav back={0} next={2} nextLabel="Next: columns →" />
      </>)}

      {step === 2 && (<>
        <Title h="Which columns do you want?" p="Click a field on the left to add it. On the right, rename a header by typing in it and reorder with the arrows." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 22 }}>
          <div><input style={{ ...input, marginBottom: 10 }} placeholder="Search fields…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, height: "max(320px, calc(100vh - 330px))", overflow: "auto", background: c.surface }}>
              {avail.length ? avail.map((x) => (
                <div key={x.key} onClick={() => set({ columns: [...S.columns, { key: x.key, label: x.label }] })} style={{ padding: "9px 14px", borderBottom: `1px solid ${c.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = c.surfaceHover)} onMouseLeave={(e) => (e.currentTarget.style.background = "none")}>
                  {x.label}{x.virt && <span style={{ background: c.accent + "33", color: c.accent, borderRadius: 6, padding: "0 7px", fontSize: 11 }}>built-in</span>}<span style={{ marginLeft: "auto", ...muted }}>+ add</span>
                </div>)) : <div style={{ padding: 20, ...muted }}>No field matches.</div>}
            </div></div>
          <div><div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, padding: "9px 0" }}>{S.columns.length} column{S.columns.length === 1 ? "" : "s"} in your Excel</div>
            <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, height: "max(320px, calc(100vh - 330px))", overflow: "auto", background: c.surface }}>
              {S.columns.length ? S.columns.map((x, i) => (
                <div key={x.key} style={{ padding: "6px 10px", borderBottom: `1px solid ${c.border}`, display: "flex", gap: 4, alignItems: "center" }}>
                  <input style={{ ...input, border: "1px solid transparent", background: "none" }} value={x.label} onChange={(e) => set({ columns: S.columns.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
                  <button style={{ ...btn, border: "none", background: "none", padding: "2px 8px" }} onClick={() => moveCol(i, -1)}>↑</button>
                  <button style={{ ...btn, border: "none", background: "none", padding: "2px 8px" }} onClick={() => moveCol(i, 1)}>↓</button>
                  <button style={{ ...btn, border: "none", background: "none", color: danger, fontSize: 18, padding: "2px 8px" }} onClick={() => set({ columns: S.columns.filter((_, j) => j !== i) })}>×</button>
                </div>)) : <div style={{ padding: 20, ...muted }}>Nothing yet — click a field on the left.</div>}
            </div></div>
        </div>
        <Nav back={1} next={3} nextLabel="Next: download →" />
      </>)}

      {step === 3 && (<>
        <Title h="Download" p="Check the preview, name the file, and download it." />
        {note && <div style={{ padding: "11px 16px", borderRadius: 10, marginBottom: 16, background: (note.bad ? danger : ok) + "22", color: note.bad ? danger : ok }}>{note.text}</div>}
        <div style={{ ...card, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <div><div style={{ ...muted, marginBottom: 6 }}>File name</div><input style={input} value={S.filename} onChange={(e) => set({ filename: e.target.value })} /></div>
          <div><div style={{ ...muted, marginBottom: 6 }}>Sheet name</div><input style={input} value={S.sheet1} onChange={(e) => set({ sheet1: e.target.value })} /></div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}>
          <button style={{ ...primary, opacity: busy ? 0.5 : 1 }} disabled={!!busy} onClick={generate}>⬇ Download Excel</button>
          <button style={btn} disabled={!!busy} onClick={() => preview()}>Refresh preview</button><span style={muted}>{busy}</span>
        </div>
        {pv?.empty && <div style={{ padding: 28, textAlign: "center", border: `2px dashed ${c.border}`, borderRadius: 12, ...muted }}>You have not chosen any columns yet. Go back one step.</div>}
        {pv?.stats && (<>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
            {[stat(pv.stats.rows, "rows in the file"), stat(pv.stats.matched, "records found"),
              pv.stats.side_rows ? stat(pv.stats.side_rows, "rows on sheet 2") : null,
              pv.stats.excluded.closed + pv.stats.excluded.reference ? stat(pv.stats.excluded.closed + pv.stats.excluded.reference, "left out by rules") : null]}
          </div>
          {pv.stats.truncated && <div style={{ color: danger, marginBottom: 12 }}>Only the first {pv.stats.limit} records are used. Add a condition to narrow the list.</div>}
          {pv.rows.length ? <PvTable c={c} head={pv.headers} rows={pv.rows} title={`First ${pv.rows.length} rows`} /> : <div style={{ padding: 28, textAlign: "center", border: `2px dashed ${c.border}`, borderRadius: 12, ...muted }}>No records match your conditions.</div>}
          {pv.side.length > 0 && <div style={{ marginTop: 20 }}><PvTable c={c} head={[...pv.headers, "Notice"]} rows={pv.side} title={`Second sheet (${pv.stats.side_rows} rows), first ${pv.side.length}`} /></div>}
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
