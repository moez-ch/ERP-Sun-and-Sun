// Excel Generator backend (Excel Tools -> "Excel Generator").
// Pick filters + columns in the UI, get an .xlsx built from live Odoo data. READ-ONLY: only fields_get / search_read / read.
// Admin only (the ERP's Odoo service account sees everything, so who may export is decided here, not by Odoo rules).
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

const ROW_LIMIT = 50000;
const SKIP_TYPES = new Set(["binary", "one2many", "html", "properties", "properties_definition", "json", "reference"]);
const SOURCES = {
  companies:         { model: "res.partner",     label: "Companies",         hint: "Firms in the contact database" },
  contacts:          { model: "res.partner",     label: "Contacts (people)", hint: "People attached to a company" },
};
const VIRTUAL = [
  { name: "@contacts",   label: "Contact person(s)" },
  { name: "@phone",      label: "Phone number" },
  { name: "@phone_type", label: "Phone type" },
  { name: "@company",    label: "Company" },
  { name: "@notice",     label: "Do-not-call notice" },
];
// standing call-list rules (day855 / day457)
const EXCL_EXACT = new Set(["2020 Öncesi Referanslar", "2020 Sonrası Referanslar", "Referans (Yasaklı)"]);
const NUMF = ["x_mobile_3", "x_mobile_2", "x_mobile_1", "phone", "x_contact_phone"];
const DNC_FIELDS = ["x_aranmak_istemiyor", "x_arama_durumu", "x_aranmasin_kesin"];

const fold = (s) => (s || "").toLowerCase().replace(/ş/g, "s").replace(/ı/g, "i").replace(/İ/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").trim();
function digits10(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("0090")) d = d.slice(4);
  if (d.startsWith("90") && d.length > 10) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}
const isMobile = (v) => { const d = digits10(v); return d.length === 10 && d[0] === "5"; };
function numbers(rec) {
  const mob = [], land = [], seen = new Set();
  for (const f of NUMF) {
    const raw = rec[f];
    const v = typeof raw === "string" ? raw.trim() : "";
    const d = digits10(v);
    if (!v || d.length < 7 || seen.has(d)) continue;
    seen.add(d);
    (isMobile(v) ? mob : land).push(v);
  }
  return [mob, land];
}

export function registerExcelGen(app, { authenticate, requireAdmin, odooExec, dataDir }) {
  const PRESETS = path.join(dataDir, "excel_gen_presets.json");
  const LOGF = path.join(dataDir, "excel_gen_log.jsonl");
  const fieldCache = {};
  let closedCache = null;

  async function fieldsOf(model) {
    if (fieldCache[model]) return fieldCache[model];
    const fg = await odooExec(model, "fields_get", [], { attributes: ["string", "type", "selection", "relation", "store"] });
    if (!fg) throw new Error("Odoo connection is not configured");
    const out = {};
    for (const [name, f] of Object.entries(fg)) {
      if (!f.store || SKIP_TYPES.has(f.type) || /^(message_|activity_|website_message|__|image_|avatar_)/.test(name) || name === "id" || name === "display_name") continue;
      out[name] = { name, label: f.string || name, type: f.type, selection: f.selection || [], relation: f.relation || "" };
    }
    return (fieldCache[model] = out);
  }

  async function closedMarkers(FP) {
    if (closedCache) return closedCache;
    const sel = await odooExec("ir.model.fields.selection", "search_read", [[["field_id.model", "=", "res.partner"]]], { fields: ["field_id", "value", "name"] });
    const byId = {};
    for (const s of sel) {
      const f = fold(s.name);
      if (["faaliyet yok", "pasif", "aranmayacak", "kapal", "kapand", "closed", "no activity"].some((k) => f.includes(k)))
        (byId[s.field_id[0]] ||= new Set()).add(s.value);
    }
    const ids = Object.keys(byId).map(Number);
    const names = ids.length ? await odooExec("ir.model.fields", "read", [ids, ["name"]]) : [];
    const out = {};
    for (const n of names) if (!DNC_FIELDS.includes(n.name) && FP[n.name]) out[n.name] = byId[n.id];
    return (closedCache = out);
  }

  // ---- filters -> Odoo domain
  function oneFilter(flt, FL) {
    const fld = FL[flt.field];
    if (!fld) return null;
    const n = fld.name, t = fld.type, op = flt.op, val = flt.value;
    if (op === "set") return [[n, "!=", false]];
    if (op === "notset") return [[n, "=", false]];
    if (t === "boolean") return [[n, "=", op !== "false"]];
    if (val === null || val === undefined || val === "" || (Array.isArray(val) && !val.length)) return null;
    if (["char", "text", "many2one", "many2many"].includes(t)) {
      if (op === "contains") return [[n, "ilike", val]];
      if (op === "notcontains") return t === "many2many" ? ["!", [n, "ilike", val]] : [[n, "not ilike", val]];
      if (op === "eq") return [[n, "=", val]];
      if (op === "ne") return [[n, "!=", val]];
    }
    if (t === "selection") return [[n, op === "in" ? "in" : "not in", Array.isArray(val) ? val : [val]]];
    if (["integer", "float", "monetary"].includes(t)) {
      const m = { eq: "=", ne: "!=", gt: ">", ge: ">=", lt: "<", le: "<=" };
      const num = Number(val);
      return Number.isFinite(num) ? [[n, m[op] || "=", t === "integer" ? Math.trunc(num) : num]] : null;
    }
    if (t === "date" || t === "datetime") {
      const dt = (d, end) => (t === "date" ? d : d + (end ? " 23:59:59" : " 00:00:00"));
      if (op === "between") { const [a, b] = Array.isArray(val) ? val : [val, val]; return a && b ? [[n, ">=", dt(a)], [n, "<=", dt(b, true)]] : null; }
      if (op === "after") return [[n, ">=", dt(val)]];
      if (op === "before") return [[n, "<=", dt(val, true)]];
      return t === "date" ? [[n, "=", val]] : [[n, ">=", dt(val)], [n, "<=", dt(val, true)]];
    }
    return null;
  }
  function buildDomain(spec, FL) {
    const base = spec.base || "companies";
    const dom = base === "companies" ? [["is_company", "=", true]] : base === "contacts" ? [["is_company", "=", false], ["parent_id", "!=", false]] : [];
    for (const flt of spec.filters || []) { const d = oneFilter(flt, FL); if (d) dom.push(...d); }
    return dom;
  }

  function plain(v, f) {
    if (v === false || v === null || v === undefined) return "";
    if (f?.type === "many2one") return Array.isArray(v) && v.length > 1 ? v[1] : "";
    if (f?.type === "selection") { const m = f.selection.find((s) => s[0] === v); return m ? m[1] : v; }
    if (f?.type === "boolean") return v ? "Yes" : "";
    if (f?.type === "datetime" && typeof v === "string") return v.slice(0, 16);
    return v;
  }
  async function readChunks(model, ids, fields) {
    const out = {};
    for (let i = 0; i < ids.length; i += 500)
      for (const r of await odooExec(model, "read", [ids.slice(i, i + 500), fields])) out[r.id] = r;
    return out;
  }
  async function m2mNames(FL, cols, recs) {
    const names = {};
    for (const c of cols) {
      const f = FL[c.key];
      if (f?.type !== "many2many") continue;
      const ids = [...new Set(recs.flatMap((r) => r[c.key] || []))];
      if (ids.length) names[c.key] = Object.fromEntries((await readChunks(f.relation, ids, ["display_name"]).then(Object.values)).map((y) => [y.id, y.display_name]));
    }
    return names;
  }

  async function runGeneric(spec, model) {
    const FL = await fieldsOf(model);
    const cols = (spec.columns || []).filter((c) => FL[c.key]);
    let recs = await odooExec(model, "search_read", [buildDomain(spec, FL)], { fields: cols.length ? cols.map((c) => c.key) : ["id"], limit: ROW_LIMIT + 1 });
    const truncated = recs.length > ROW_LIMIT;
    recs = recs.slice(0, ROW_LIMIT);
    const names = await m2mNames(FL, cols, recs);
    const rows = recs.map((r) => cols.map((c) => FL[c.key].type === "many2many"
      ? (r[c.key] || []).map((i) => names[c.key]?.[i] ?? String(i)).join(", ") : plain(r[c.key], FL[c.key])));
    return { cols, main: rows, side: [], stats: { matched: recs.length, rows: rows.length, side_rows: 0, excluded: { closed: 0, reference: 0 }, no_phone: 0, truncated, limit: ROW_LIMIT } };
  }

  async function run(spec) {
    const base = spec.base || "companies";
    const src = SOURCES[base];
    if (!src) throw new Error("Unknown source");
    if (src.model !== "res.partner") return runGeneric(spec, src.model);
    const F = await fieldsOf("res.partner");
    const closed = await closedMarkers(F);
    const rules = spec.rules || {}, phoneMode = spec.phone || "any", dncMode = rules.dnc || "include";
    const cols = (spec.columns || []).filter((c) => c.key.startsWith("@") || F[c.key]);
    const want = new Set(["name", "x_kaynak", "child_ids", "parent_id", ...NUMF, ...DNC_FIELDS, ...Object.keys(closed), ...cols.filter((c) => !c.key.startsWith("@")).map((c) => c.key)]);
    const wantL = [...want].filter((f) => F[f] || ["name", "child_ids", "parent_id"].includes(f));
    let recs = await odooExec("res.partner", "search_read", [buildDomain(spec, F)], { fields: wantL, limit: ROW_LIMIT + 1 });
    const truncated = recs.length > ROW_LIMIT;
    recs = recs.slice(0, ROW_LIMIT);

    let parents = {};
    if (base === "contacts") {
      const pids = [...new Set(recs.filter((r) => r.parent_id).map((r) => r.parent_id[0]))];
      parents = await readChunks("res.partner", pids, wantL.filter((f) => f !== "parent_id"));
    }
    const ctx = (r) => (base === "contacts" && r.parent_id ? parents[r.parent_id[0]] || r : r);
    const kaynak = (c) => {
      let v = c.x_kaynak;
      if (Array.isArray(v)) v = v[1] || "";
      const fk = F.x_kaynak;
      if (fk?.type === "selection") { const m = fk.selection.find((s) => s[0] === v); if (m) v = m[1]; }
      return v || "";
    };
    const isClosed = (c) => Object.entries(closed).some(([f, vals]) => vals.has(c[f]));
    const flagged = (c) => !!(c.x_aranmak_istemiyor || ["aranmayacak", "inceleme_bekliyor"].includes(c.x_arama_durumu) || ["evet", "inceleme"].includes(c.x_aranmasin_kesin));

    const excl = { closed: 0, reference: 0 };
    const kept = [];
    for (const r of recs) {
      const c = ctx(r);
      if (rules.excl_closed && isClosed(c)) { excl.closed++; continue; }
      const k = kaynak(c);
      if (rules.excl_refs && (EXCL_EXACT.has(k) || fold(k).includes("tkyb"))) { excl.reference++; continue; }
      kept.push(r);
    }
    const kids = base === "companies" ? await readChunks("res.partner", kept.flatMap((c) => c.child_ids), ["name", ...NUMF]) : {};

    const needNotes = dncMode === "sheet2" || cols.some((c) => c.key === "@notice");
    const notes = {};
    const flagIds = kept.map(ctx).filter(flagged).map((c) => c.id);
    if (flagIds.length && needNotes) {
      try {
        for (const u of await odooExec("x_arama_uyari", "search_read", [[["x_partner_id", "in", flagIds]]], { fields: ["x_partner_id", "x_ifade", "x_not_metin"], order: "id desc", limit: 5000 }))
          (notes[u.x_partner_id[0]] ||= []).push(u);
      } catch { /* notice model optional */ }
    }
    const DURUM = { aranmayacak: "Do not call", inceleme_bekliyor: "Under review" };
    const notice = (c) => {
      const bits = [];
      if (c.x_aranmak_istemiyor) bits.push("Wants no calls");
      if (DURUM[c.x_arama_durumu]) bits.push(DURUM[c.x_arama_durumu]);
      if (["evet", "inceleme"].includes(c.x_aranmasin_kesin)) bits.push("Do-not-call: " + c.x_aranmasin_kesin);
      const n = notes[c.id]?.[0];
      if (n) bits.push("Note: " + ((n.x_ifade || "") + (n.x_not_metin ? " - " + n.x_not_metin.slice(0, 160).replace(/\n/g, " ") : "")).replace(/^[ -]+|[ -]+$/g, ""));
      return bits.join(" | ");
    };
    const m2m = await m2mNames(F, cols, kept);

    const cell = (r, key, ex) => {
      if (key === "@contacts") return ex.contact;
      if (key === "@phone") return ex.phone;
      if (key === "@phone_type") return ex.ptype;
      if (key === "@company") return base === "contacts" && r.parent_id ? r.parent_id[1] : r.name;
      if (key === "@notice") return notice(ctx(r));
      const f = F[key];
      return f.type === "many2many" ? (r[key] || []).map((i) => m2m[key]?.[i] ?? String(i)).join(", ") : plain(r[key], f);
    };

    const main = [], side = [];
    let noPhone = 0;
    for (const r of kept) {
      let cat = "", opts;
      if (base === "contacts") {
        const [mob, land] = numbers(r);
        if (mob.length) { cat = "contact_mobile"; opts = [{ contact: r.name, phone: mob.join(" / "), ptype: "Contact mobile" }]; }
        else if (land.length) { cat = "landline"; opts = [{ contact: r.name, phone: land.join(" / "), ptype: "Landline" }]; }
        else opts = [];
      } else {
        const people = r.child_ids.map((i) => kids[i]).filter(Boolean);
        const prow = [];
        for (const p of people) { const [mob] = numbers(p); if (mob.length) prow.push({ contact: p.name, phone: mob.join(" / "), ptype: "Contact mobile" }); }
        const names = people.map((p) => p.name).filter(Boolean).join(" / ");
        if (prow.length) { cat = "contact_mobile"; opts = prow; }
        else {
          const [cm, cl] = numbers(r);
          if (cm.length) { cat = "company_mobile"; opts = [{ contact: names, phone: cm.join(" / "), ptype: "Company mobile" }]; }
          else {
            const lands = [...cl], seen = new Set(cl.map(digits10));
            for (const p of people) for (const x of numbers(p)[1]) if (!seen.has(digits10(x))) { seen.add(digits10(x)); lands.push(x); }
            if (lands.length) { cat = "landline"; opts = [{ contact: names, phone: lands.join(" / "), ptype: "Landline" }]; }
            else opts = [];
          }
        }
        if (!opts.length) opts = [{ contact: names, phone: "", ptype: "" }];
      }
      if (!opts.length) opts = [{ contact: r.name, phone: "", ptype: "" }];
      if (phoneMode === "has_any" && !cat) { noPhone++; continue; }
      if (["contact_mobile", "company_mobile", "landline"].includes(phoneMode) && cat !== phoneMode) continue;
      if (!cat) noPhone++;
      const fl = flagged(ctx(r));
      if (fl && dncMode === "exclude") continue;
      const toSide = fl && dncMode === "sheet2";
      for (const ex of opts) {
        const row = cols.map((c) => cell(r, c.key, ex));
        if (toSide) row.push(notice(ctx(r)));
        (toSide ? side : main).push(row);
      }
    }
    return { cols, main, side, stats: { matched: recs.length, rows: main.length, side_rows: side.length, excluded: excl, no_phone: noPhone, truncated, limit: ROW_LIMIT } };
  }

  function sheetFrom(head, rows) {
    const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
    ws["!cols"] = head.map((h, i) => ({ wch: Math.min(60, Math.max(String(h).length, 8, ...rows.slice(0, 300).map((r) => String(r[i] ?? "").length)) + 3) }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    return ws;
  }
  const safeName = (s, d) => String(s || d).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || d;
  const presets = () => { try { return JSON.parse(fs.readFileSync(PRESETS, "utf8")); } catch { return {}; } };

  const guard = [authenticate, requireAdmin];
  const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.warn("[excel-gen]", e.message); res.status(500).json({ error: e.message }); } };

  app.get("/excelgen/meta", ...guard, wrap(async (_req, res) => {
    const fields = {};
    for (const [k, v] of Object.entries(SOURCES))
      fields[k] = Object.values(await fieldsOf(v.model)).sort((a, b) => a.label.localeCompare(b.label, "tr"));
    res.json({ sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, { label: v.label, hint: v.hint }])), fields, virtual: VIRTUAL, presets: presets(), limit: ROW_LIMIT });
  }));
  app.post("/excelgen/preview", ...guard, wrap(async (req, res) => {
    const { cols, main, side, stats } = await run(req.body || {});
    res.json({ headers: cols.map((c) => c.label || c.key), rows: main.slice(0, 25), side: side.slice(0, 10), stats });
  }));
  app.post("/excelgen/generate", ...guard, wrap(async (req, res) => {
    const spec = req.body || {};
    const { cols, main, side, stats } = await run(spec);
    const head = cols.map((c) => c.label || c.key);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFrom(head, main), safeName(spec.sheet1, "List"));
    if (spec.rules?.dnc === "sheet2") XLSX.utils.book_append_sheet(wb, sheetFrom([...head, "Notice"], side), safeName(spec.sheet2, "Do not call - review"));
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    try { fs.appendFileSync(LOGF, JSON.stringify({ at: new Date().toISOString(), by: req.user?.email || req.user?.name, spec, stats }) + "\n"); } catch { /* log is best effort */ }
    const fname = String(spec.filename || "export").replace(/[^\w-]+/g, "_") + ".xlsx";
    res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fname}"`, "X-Stats": JSON.stringify(stats), "Access-Control-Expose-Headers": "X-Stats" });
    res.send(buf);
  }));
  app.post("/excelgen/preset", ...guard, wrap(async (req, res) => {
    const p = presets();
    if (req.body?.delete) delete p[req.body.name]; else p[req.body.name] = req.body.spec;
    fs.writeFileSync(PRESETS, JSON.stringify(p, null, 1));
    res.json({ presets: p });
  }));
}
