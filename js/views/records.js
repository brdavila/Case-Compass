// Document area: unified timeline, record lists, record detail, new/edit.
import { h, icon, toast, confirmDialog, dialog, deliverFile, alertDialog } from "../ui/dom.js";
import { pageHead, tabs, callout, emptyState, recordList, navigate, viewCtx, childName, enteredLaterDays, evidenceBackedUp, reportCtx } from "../ui/shared.js";
import { renderRecordForm, recordPicker } from "../ui/forms.js";
import * as vault from "../core/vault.js";
import { TYPES, TYPE_ORDER, recordDate, recordTime, recordTitle, isOpen, hasEvidence, valueText } from "../core/schema.js";
import { fmtDate, fmtTime, fmtDateTimeISO, fmtBytes, monthLabel, todayLocal, addDays } from "../core/util.js";
import { buildReportModel, defaultOptions } from "../reports/model.js";
import { buildPdf, PDF_MIME } from "../reports/pdf.js";

export const DOC_TABS = [["#/document", "Timeline"], ["#/document/incident", "Incidents"], ["#/document/police", "Police & Official"], ["#/document/residence", "Residence & Property"], ["#/document/evidence", "Evidence"], ["#/document/expense", "Expenses"]];
export const PARENT_TABS = [["#/parenting", "Overview"], ["#/parenting/time", "Parenting Time"], ["#/parenting/communication", "Communications"], ["#/parenting/children", "Children"], ["#/parenting/statements", "Child Statements"]];

const filters = { start: "", end: "", types: [], child: "", person: "", q: "", evidence: "", status: "", ptType: "", police: "" };

function applyFilters(recs, f) {
  const q = f.q.trim().toLowerCase(), person = f.person.trim().toLowerCase();
  return recs.filter((r) => {
    if (r.type === "child") return false;
    const d = recordDate(r);
    if (f.start && d < f.start) return false;
    if (f.end && d > f.end) return false;
    if (f.types.length && !f.types.includes(r.type)) return false;
    if (f.child && !(r.data?.children || []).includes(f.child)) return false;
    if (person) { const ppl = ["people", "witnesses", "participants", "heardBy"].flatMap((k) => r.data?.[k] || []).join(" ").toLowerCase(); if (!ppl.includes(person) && !JSON.stringify(r.data).toLowerCase().includes(person)) return false; }
    if (q && !`${r.ref} ${recordTitle(r, viewCtx)} ${JSON.stringify(r.data)}`.toLowerCase().includes(q)) return false;
    if (f.evidence === "with" && !hasEvidence(r)) return false;
    if (f.evidence === "without" && hasEvidence(r)) return false;
    if (f.evidence === "notbacked" && !(r.type === "evidence" && !evidenceBackedUp(r))) return false;
    if (f.status === "open" && !isOpen(r)) return false;
    if (f.status === "resolved" && (isOpen(r) || !TYPES[r.type].statusField)) return false;
    if (f.ptType && !(r.type === "parenting" && r.data?.entryType === f.ptType)) return false;
    if (f.police === "yes" && !(r.type === "police" || (r.type === "incident" && r.data?.police && r.data.police !== "None"))) return false;
    return true;
  }).sort((a, b) => { const x = recordDate(a) + (recordTime(a) || ""), y = recordDate(b) + (recordTime(b) || ""); return x < y ? 1 : x > y ? -1 : (a.createdAt < b.createdAt ? 1 : -1); });
}

function groupedList(recs) {
  const out = []; let month = "";
  let ul = null;
  for (const r of recs) {
    const m = recordDate(r).slice(0, 7);
    if (m !== month) { month = m; out.push(h("h2", { class: "monthhead" }, m ? monthLabel(m) : "No date")); ul = h("ul", { class: "list" }); out.push(ul); }
    ul.append(recordList([r]).firstChild);
  }
  return out;
}

export function timeline(query = {}) {
  if (query.type) filters.types = [query.type];
  if (query.evidence) filters.evidence = query.evidence;
  const all = vault.listRecords();
  const results = h("div", { "aria-live": "polite" });
  const count = h("p", { class: "muted small" });
  const render = () => {
    const recs = applyFilters(all, filters);
    count.textContent = `${recs.length} of ${all.filter((r) => r.type !== "child").length} records`;
    results.replaceChildren(...(recs.length ? groupedList(recs) : [emptyState(all.length ? "No records match these filters." : "Nothing documented yet. Start with a quick entry.", h("a", { class: "btn primary", href: "#/new" }, icon("plus"), "New record"))]));
  };
  const inp = (key, attrs) => { const el = h("input", { ...attrs, value: filters[key] }); el.addEventListener("input", () => { filters[key] = el.value; render(); }); return el; };
  const sel = (key, options, label) => { const el = h("select", { "aria-label": label }, ...options.map(([v, l]) => h("option", { value: v }, l))); el.value = filters[key]; el.addEventListener("change", () => { filters[key] = el.value; render(); }); return el; };
  const typeChips = h("div", { class: "chips", role: "group", "aria-label": "Record types" }, ...TYPE_ORDER.filter((t) => t !== "child").map((t) => {
    const b = h("button", { type: "button", class: "chip toggle", "aria-pressed": String(filters.types.includes(t)) }, TYPES[t].plural);
    b.addEventListener("click", () => { filters.types = filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t]; b.setAttribute("aria-pressed", String(filters.types.includes(t))); render(); });
    return b;
  }));
  const kids = vault.listRecords({ type: "child" });
  const panel = h("details", { class: "disclose", open: window.innerWidth >= 900 ? true : null },
    h("summary", null, icon("filter"), "Filters"),
    h("div", { class: "inner stack" },
      h("div", { class: "grid two" },
        h("div", { class: "field" }, h("label", { for: "f-from" }, "From"), inp("start", { id: "f-from", type: "date" })),
        h("div", { class: "field" }, h("label", { for: "f-to" }, "To"), inp("end", { id: "f-to", type: "date" }))),
      h("div", { class: "field" }, h("span", { class: "label" }, "Record type"), typeChips),
      h("div", { class: "grid two" },
        h("div", { class: "field" }, h("label", { for: "f-child" }, "Child"), (() => { const s = sel("child", [["", "Any child"], ...kids.map((k) => [k.id, childName(k.id)])], "Child"); s.id = "f-child"; return s; })()),
        h("div", { class: "field" }, h("label", { for: "f-person" }, "Person"), inp("person", { id: "f-person", type: "search", placeholder: "Name of a person involved" })),
        h("div", { class: "field" }, h("label", { for: "f-ev" }, "Evidence"), (() => { const s = sel("evidence", [["", "Any"], ["with", "Has evidence"], ["without", "No evidence"], ["notbacked", "Evidence not in a verified backup"]], "Evidence"); s.id = "f-ev"; return s; })()),
        h("div", { class: "field" }, h("label", { for: "f-st" }, "Status"), (() => { const s = sel("status", [["", "Any"], ["open", "Open"], ["resolved", "Resolved"]], "Status"); s.id = "f-st"; return s; })()),
        h("div", { class: "field" }, h("label", { for: "f-pt" }, "Parenting-time event"), (() => { const s = sel("ptType", [["", "Any"], ...TYPES.parenting.fields[0].options.map((o) => [o, o])], "Parenting-time event"); s.id = "f-pt"; return s; })()),
        h("div", { class: "field" }, h("label", { for: "f-pol" }, "Police contact"), (() => { const s = sel("police", [["", "Any"], ["yes", "Involves police or official contact"]], "Police contact"); s.id = "f-pol"; return s; })())),
      h("button", { type: "button", class: "btn small", onclick: () => { Object.assign(filters, { start: "", end: "", types: [], child: "", person: "", q: "", evidence: "", status: "", ptType: "", police: "" }); navigate("#/document?r=" + Date.now(), { replace: true }); } }, "Clear filters")));
  const search = inp("q", { type: "search", placeholder: "Search all records (keyword or ID)", "aria-label": "Search records" });
  render();
  return h("div", null,
    pageHead("Document", { sub: "One timeline of everything you have recorded, newest first.", actions: [h("a", { class: "btn primary", href: "#/new" }, icon("plus"), "New record")] }),
    tabs(DOC_TABS, "#/document"),
    h("div", { class: "stack" }, search, panel, count, results));
}

export function typeList(type, area) {
  const t = TYPES[type];
  if (!t) return emptyState("Unknown section.");
  const tabsDef = area === "parenting" ? PARENT_TABS : DOC_TABS;
  const activeTab = area === "parenting" ? { parenting: "#/parenting/time", communication: "#/parenting/communication", childStatement: "#/parenting/statements" }[type] : `#/document/${type}`;
  const recs = vault.listRecords({ type }).sort((a, b) => (recordDate(a) + recordTime(a) < recordDate(b) + recordTime(b) ? 1 : -1));
  const q = h("input", { type: "search", placeholder: `Search ${t.plural.toLowerCase()}`, "aria-label": `Search ${t.plural}` });
  const box = h("div");
  const render = () => { const s = q.value.trim().toLowerCase(); const f = recs.filter((r) => !s || `${r.ref} ${JSON.stringify(r.data)}`.toLowerCase().includes(s)); box.replaceChildren(...(f.length ? groupedList(f) : [emptyState(recs.length ? "No matches." : `No ${t.plural.toLowerCase()} recorded yet.`, h("a", { class: "btn primary", href: `#/new/${type}` }, icon("plus"), `New ${t.label.toLowerCase()}`))])); };
  q.addEventListener("input", render); render();
  return h("div", null,
    pageHead(t.plural, { actions: [h("a", { class: "btn primary", href: `#/new/${type}` }, icon("plus"), `New ${t.label.toLowerCase()}`)] }),
    tabs(tabsDef, activeTab),
    type === "residence" ? callout("warn", t.warning) : null,
    type === "evidence" ? callout("info", "Originals are stored exactly as added and fingerprinted with SHA-256. One evidence item can be linked to many records without storing the file twice.") : null,
    type === "childStatement" ? callout("warn", h("p", null, "Record only what a child says on their own. Do not question or coach children. ", h("a", { href: "#/resources/guides/child-statements" }, "Guidance"))) : null,
    h("div", { class: "stack", style: { marginTop: "12px" } }, recs.length > 5 ? q : null, box));
}

export function chooser() {
  const groups = [
    ["Most common", ["incident", "communication", "parenting", "evidence"]],
    ["Children", ["child", "childStatement"]],
    ["Official and property", ["police", "residence", "expense"]],
    ["Planning", ["task", "attorney"]],
  ];
  return h("div", null,
    pageHead("New record", { sub: "Choose what you want to record." }),
    ...groups.map(([label, types]) => h("section", { class: "section" }, h("h2", null, label),
      h("ul", { class: "list" }, ...types.map((t) => h("li", null, h("a", { class: "item", href: `#/new/${t}` }, h("span", { class: "ic" }, icon(TYPES[t].icon)), h("span", { class: "body" }, h("span", { class: "title" }, TYPES[t].label), h("span", { class: "snippet" }, TYPES[t].intro)))))))));
}

export async function newRecord(type, query = {}) {
  const t = TYPES[type];
  if (!t) return emptyState("Unknown record type.");
  const prefill = {};
  if (query.link) prefill.related = [query.link];
  if (query.attach) prefill.attachments = [query.attach];
  if (query.child) prefill.children = [query.child];
  if (query.date && t.dateField) prefill[t.dateField] = query.date;
  if (query.kind) prefill.kind = query.kind;
  if (query.entryType) prefill.entryType = query.entryType;
  if (query.title) prefill[t.titleField] = query.title;
  return h("div", null, pageHead(`New ${t.label.toLowerCase()}`, { crumbs: [{ label: "New record", href: "#/new" }, { label: t.label }] }), await renderRecordForm({ type, prefill }));
}

export async function editRecord(id) {
  const r = vault.getRecord(id);
  if (!r) return emptyState("This record was not found.");
  const t = TYPES[r.type];
  return h("div", null, pageHead(`Edit ${r.ref}`, { crumbs: [{ label: t.plural }, { label: r.ref, href: `#/record/${id}` }, { label: "Edit" }], sub: "Saving creates a new version. Earlier versions are kept in the record's history." }), await renderRecordForm({ type: r.type, record: r }));
}

async function evidencePreview(r) {
  const f = r.data?.file;
  if (!f) return r.data?.evidenceType === "External original (not stored here)" ? callout("info", "The original is stored outside Case Compass. See “Where the original is stored”.") : null;
  const box = h("div", { class: "stack" });
  const status = h("p", { class: "small", "aria-live": "polite" });
  let url = null;
  const getUrl = async () => { if (url) return url; const bytes = await vault.getBlob(f.blobId); url = URL.createObjectURL(new Blob([bytes], { type: f.type })); return url; };
  const show = h("button", { class: "btn small", type: "button" }, icon("eye"), "Show preview");
  show.addEventListener("click", async () => {
    try {
      const u = await getUrl();
      let el;
      if (/^image\//.test(f.type)) el = h("img", { src: u, alt: `Preview of ${f.name}` });
      else if (/^video\//.test(f.type)) el = h("video", { src: u, controls: true });
      else if (/^audio\//.test(f.type)) el = h("audio", { src: u, controls: true, style: { width: "100%" } });
      else if (/^text\//.test(f.type) || /json|csv/.test(f.type)) { const t = await (await fetch(u)).text(); el = h("pre", { class: "mono", style: { whiteSpace: "pre-wrap", padding: "10px" } }, t.slice(0, 20000)); }
      else el = h("p", { class: "muted", style: { padding: "10px" } }, "Preview is not available for this file type. Use Open or Download original.");
      show.replaceWith(h("div", { class: "preview" }, el));
    } catch (e) { status.textContent = `Could not open the file: ${e.message}`; }
  });
  box.append(
    h("div", { class: "row" },
      show,
      h("button", { class: "btn small", type: "button", onclick: async () => { const u = await getUrl(); const w = window.open(u, "_blank"); if (!w) { const a = h("a", { href: u, target: "_blank", rel: "noopener" }); a.click(); } } }, icon("globe"), "Open"),
      h("button", { class: "btn small", type: "button", onclick: async () => { const bytes = await vault.getBlob(f.blobId); await deliverFile(bytes, f.name, f.type, { note: "This is the original file exactly as it was added." }); await vault.audit("export-original", { recordId: r.id, ref: r.ref, summary: `Original file exported: ${f.name}` }); } }, icon("download"), "Download original"),
      h("button", { class: "btn small", type: "button", onclick: async () => { status.textContent = "Checking…"; try { const res = await vault.verifyEvidence(r); status.replaceChildren(res.ok ? h("span", { class: "badge ok" }, "Integrity verified") : h("span", { class: "badge danger" }, "Integrity check FAILED"), ` SHA-256 now ${res.actual.slice(0, 24)}…`); } catch (e) { status.textContent = `Could not verify: ${e.message}`; } } }, icon("check"), "Verify integrity")),
    status,
    h("p", { class: "muted small" }, "Previews never change the stored original."));
  return box;
}

export async function recordDetail(id) {
  const r = vault.getRecord(id);
  if (!r) return emptyState("This record was not found. It may have been permanently deleted.", h("a", { class: "btn", href: "#/document" }, "Back to timeline"));
  const t = TYPES[r.type];
  const later = enteredLaterDays(r);
  const dl = h("dl", { class: "dl" });
  const add = (k, v) => { if (v == null || v === "") return; dl.append(h("dt", null, k), h("dd", null, v)); };
  add("Record ID", r.ref);
  if (t.dateField) add("Event date", `${fmtDate(r.data?.[t.dateField], { weekday: true }) || "Not recorded"}${t.timeField && r.data?.[t.timeField] ? ` at ${fmtTime(r.data[t.timeField])}` : ""}${r.data?.tz ? ` (${r.data.tz})` : ""}`);
  add("Entered", `${fmtDateTimeISO(r.createdAt)}${later ? ` — ${later} days after the event date` : ""}`);
  if ((r.version || 1) > 1) add("Last edited", `${fmtDateTimeISO(r.updatedAt)} · version ${r.version}`);
  if (r.importedFrom) add("Imported from", `${r.importedFrom.source}${r.importedFrom.originalId ? ` (original id ${r.importedFrom.originalId})` : ""}`);
  for (const f of t.fields) {
    if (["records", "evidence", "file"].includes(f.type) || f.key === t.dateField || f.key === t.timeField || f.key === "tz") continue;
    if (f.showIf && !f.showIf(r.data || {})) continue;
    add(f.label + (f.sensitive ? " (private)" : ""), valueText(f, r.data?.[f.key], viewCtx));
  }
  if (r.type === "evidence" && r.data?.file) { const fi = r.data.file; add("Stored original", `${fi.name} · ${fi.type} · ${fmtBytes(fi.size)} · added ${fmtDateTimeISO(fi.addedAt)}`); add("SHA-256", h("span", { class: "mono" }, fi.sha256)); add("Included in verified backup", evidenceBackedUp(r) ? "Yes" : "Not yet"); }
  if (r.data?.legacy) dl.append(h("dt", null, "Original imported data"), h("dd", null, h("details", null, h("summary", null, "Show"), h("pre", { class: "mono", style: { whiteSpace: "pre-wrap" } }, r.data.legacy))));

  const forward = vault.linkedIds(r).map((x) => vault.getRecord(x)).filter((x) => x && !x.deleted);
  const back = vault.backlinks(r.id);
  const linked = [...new Map([...forward, ...back].map((x) => [x.id, x])).values()];

  const revBox = h("div", { class: "stack" }, h("button", { class: "btn small", type: "button", onclick: async (e) => {
    const revs = await vault.listRevisions(r.id);
    e.target.replaceWith(revs.length ? h("ul", { class: "list" }, ...revs.map((rv) => h("li", null, h("details", { class: "disclose" }, h("summary", null, `Version ${rv.snapshot?.version || "?"} · saved before ${fmtDateTimeISO(rv.savedAt)}${rv.note ? ` · ${rv.note}` : ""}`),
      h("div", { class: "inner" }, h("dl", { class: "dl" }, ...t.fields.filter((f) => !["file"].includes(f.type)).flatMap((f) => { const v = valueText(f, rv.snapshot?.data?.[f.key], viewCtx); return v ? [h("dt", null, f.label), h("dd", null, v)] : []; }))))))) : h("p", { class: "muted" }, "No earlier versions. This record has not been edited."));
  } }, icon("history"), "Show version history"));

  const actions = h("div", { class: "row" },
    h("a", { class: "btn primary", href: `#/edit/${r.id}` }, icon("edit"), "Edit"),
    h("button", { class: "btn", type: "button", onclick: async () => {
      const other = await recordPicker({ title: `Link ${r.ref} to…`, exclude: [r.id, ...linked.map((x) => x.id)] });
      if (!other) return;
      const key = other.type === "evidence" && r.type !== "evidence" ? "attachments" : "related";
      const cur = vault.getRecord(r.id);
      await vault.saveRecord({ ...cur, data: { ...cur.data, [key]: [...new Set([...(cur.data[key] || []), other.id])] } }, { summary: `Linked to ${other.ref}` });
      toast(`Linked ${r.ref} and ${other.ref}`); navigate(`#/record/${r.id}?keepScroll=1&t=${Date.now()}`, { replace: true });
    } }, icon("link"), "Link"),
    r.type !== "evidence" ? h("a", { class: "btn", href: `#/new/evidence?link=${r.id}` }, icon("paperclip"), "Add evidence") : h("a", { class: "btn", href: `#/new/evidence?link=${r.id}` }, icon("paperclip"), "Add modified copy"),
    h("a", { class: "btn", href: `#/new/task?link=${r.id}&title=${encodeURIComponent("Follow up: " + recordTitle(r, viewCtx).slice(0, 60))}` }, icon("check"), "Follow-up task"),
    h("button", { class: "btn", type: "button", onclick: async () => {
      const opts = { ...defaultOptions("chronological"), recordIds: [r.id] };
      const pdf = buildPdf(buildReportModel(vault.listRecords(), opts, reportCtx()));
      await deliverFile(pdf, `${r.ref}.pdf`, PDF_MIME, { note: "Private notes are excluded. Use Reports for more options." });
      vault.audit("export", { recordId: r.id, ref: r.ref, summary: "Exported single record (PDF)" });
    } }, icon("download"), "Export PDF"),
    h("button", { class: "btn danger", type: "button", onclick: async () => {
      const ok = await confirmDialog({ title: `Move ${r.ref} to Trash?`, message: ["The record will be hidden from timelines and reports. You can restore it from Reports › Settings › Trash."], confirmText: "Move to Trash", danger: true });
      if (!ok) return; await vault.deleteRecord(r.id); toast(`${r.ref} moved to Trash`); navigate("#/document");
    } }, icon("trash"), "Move to Trash"));

  const preview = r.type === "evidence" ? await evidencePreview(r) : null;
  const statusBadge = isOpen(r) ? h("span", { class: "badge warn" }, r.type === "task" ? r.data?.status : "Open") : t.statusField ? h("span", { class: "badge ok" }, r.type === "task" ? r.data?.status || "" : r.data?.[t.statusField] || "") : null;
  return h("div", null,
    pageHead(recordTitle(r, viewCtx), { crumbs: [{ label: t.plural, href: t.area === "parenting" ? (r.type === "child" ? "#/parenting/children" : r.type === "communication" ? "#/parenting/communication" : r.type === "childStatement" ? "#/parenting/statements" : "#/parenting/time") : t.area === "home" ? (r.type === "task" ? "#/home/calendar" : "#/home/attorneys") : `#/document/${r.type}` }, { label: r.ref }], sub: `${t.label}` }),
    h("div", { class: "row", style: { marginBottom: "12px" } }, h("span", { class: "badge accent" }, r.ref), statusBadge, later ? h("span", { class: "badge" }, `Documented ${later} days after the event`) : null),
    t.warning ? callout("warn", t.warning) : null,
    preview ? h("section", { class: "card section" }, h("h2", null, "Original file"), preview) : null,
    h("section", { class: "card section" }, dl),
    h("section", { class: "section" }, h("h2", null, `Linked records (${linked.length})`), linked.length ? recordList(linked) : h("p", { class: "muted" }, "No linked records yet. Use Link to connect related incidents, messages, evidence, or tasks.")),
    r.type === "child" ? h("section", { class: "section" }, h("a", { class: "btn", href: `#/parenting/children/${r.id}` }, "Open child overview")) : null,
    h("section", { class: "section noprint" }, actions),
    h("section", { class: "section" }, h("h2", null, "History"), revBox));
}
