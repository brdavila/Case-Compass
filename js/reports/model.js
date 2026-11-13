// Report builder: turns selected records into a document model (rendered as Word, PDF, or
// print HTML), a workbook model (Excel), or CSV. Pure functions: no DOM, no storage access.
//
// ctx = { childName(id, initialsOnly), getRecord(id), checklists, protocols, guides, settings, now }
import { TYPES, TYPE_ORDER, recordDate, recordTime, recordTitle as baseTitle, isOpen, valueText, ptCategory, ptHours, childDisplayName, childAge } from "../core/schema.js";
import { fmtDate, fmtTime, fmtDateTimeISO, daysBetween, monthLabel, toCSV, todayLocal, truncate } from "../core/util.js";

export const REPORT_KINDS = [
  { id: "chronological", label: "Chronological report", desc: "All selected records in date order with full details. Suited to court preparation." },
  { id: "monthly", label: "Monthly report", desc: "One month: summary counts, parenting time, communications, incidents, tasks, and evidence." },
  { id: "attorney", label: "Attorney preparation packet", desc: "Questions, key dates, timeline summary, parenting-time comparison, police contacts, and evidence index. Private notes and prior advice are excluded by default." },
  { id: "parenting", label: "Parenting-time record", desc: "Requested, scheduled, and completed parenting time with comparisons and related communications." },
  { id: "evidence", label: "Evidence index", desc: "Inventory of evidence items with sources, storage locations, SHA-256 fingerprints, and links." },
  { id: "checklist", label: "Action checklists", desc: "Protection & Security progress, guide checklists, and open tasks." },
  { id: "category", label: "Selected categories", desc: "Only the record types you choose, with full details." },
  { id: "blank", label: "Blank printable forms", desc: "Empty incident, communication, parenting-time, and child-statement logs for writing by hand." },
];

export const NOTICE = (date, sample) =>
  `${sample ? "SAMPLE ONLY – every name, date, and event in this document is fictional. " : ""}Prepared by the user from their own records with Case Compass on ${fmtDate(date, { long: true })}. This is an organizational summary. It is not a court filing, was not issued by any court, and is not automatically admissible as evidence. Entries reflect the author's records and do not establish that any statement or allegation is true.`;

// Child profile titles follow the children privacy option (full name, initials, or excluded).
const recordTitle = (r, c) => (r.type === "child" && c?.childName ? c.childName(r.id) : baseTitle(r, c));

const MAIN_TEXT = { incident: "description", communication: "content", parenting: "activities", childStatement: "statement", police: "summary", residence: "details", evidence: "notes", task: "description", attorney: "questions", expense: "category", child: "schedule" };

export function defaultOptions(kind = "chronological") {
  return { kind, range: { start: "", end: "" }, types: [], recordIds: [], includePrivate: false, childMode: kind === "attorney" ? "minimal" : "full", includeLegacy: false, title: "", sample: false, month: "" };
}

// ───────── selection & privacy ─────────
export function selectRecords(all, opts) {
  let recs = all.filter((r) => !r.deleted);
  if (opts.recordIds?.length) return recs.filter((r) => opts.recordIds.includes(r.id));
  const { start, end } = effectiveRange(opts);
  if (start || end) recs = recs.filter((r) => { if (r.type === "child") return true; const d = recordDate(r); return (!start || d >= start) && (!end || d <= end); });
  if (opts.kind === "category" && opts.types?.length) recs = recs.filter((r) => opts.types.includes(r.type));
  if (opts.childMode === "exclude") recs = recs.filter((r) => r.type !== "childStatement" && r.type !== "child");
  return recs.sort((a, b) => cmpChrono(a, b));
}

export function effectiveRange(opts) {
  if (opts.kind === "monthly" && opts.month) { const [y, m] = opts.month.split("-").map(Number); return { start: `${opts.month}-01`, end: todayLocal(new Date(y, m, 0)) }; }
  return opts.range || { start: "", end: "" };
}

function cmpChrono(a, b) {
  const da = recordDate(a) + " " + (recordTime(a) || "00:00"), db = recordDate(b) + " " + (recordTime(b) || "00:00");
  return da < db ? -1 : da > db ? 1 : (a.createdAt < b.createdAt ? -1 : 1);
}

export function visibleFields(type, opts) {
  return (TYPES[type]?.fields || []).filter((f) => {
    if (["evidence", "records", "file"].includes(f.type)) return false;
    if (f.sensitive && !opts.includePrivate) return false;
    if (f.child && opts.childMode !== "full" && !["children", "statement"].includes(f.key)) return false;
    if (type === "child" && f.key === "name" && opts.childMode !== "full") return false;
    if (opts.kind === "attorney" && f.key === "advice" && !opts.includePrivate) return false;
    return true;
  });
}

function mkCtx(ctx, opts) {
  return {
    ...ctx,
    childName: (id) => opts.childMode === "exclude" ? "(child)" : ctx.childName(id, opts.childMode === "minimal"),
    refOf: (id) => ctx.getRecord(id)?.ref || "(removed)",
  };
}

function enteredLater(r) {
  const d = recordDate(r); const entered = (r.createdAt || "").slice(0, 10);
  const n = daysBetween(d, entered);
  return n != null && n > 1 ? n : 0;
}

function recordBlock(r, opts, c) {
  const t = TYPES[r.type];
  const rows = [
    ["Record ID", r.ref],
    ["Record type", t.label],
  ];
  if (t.dateField) {
    const d = r.data?.[t.dateField]; const tm = t.timeField ? r.data?.[t.timeField] : "";
    rows.push(["Event date", `${fmtDate(d, { weekday: true }) || "Not recorded"}${tm ? ` at ${fmtTime(tm)}` : ""}${r.data?.tz ? ` (${r.data.tz})` : ""}`]);
  }
  const later = enteredLater(r);
  rows.push(["Entered in Case Compass", `${fmtDateTimeISO(r.createdAt)}${later ? ` (${later} days after the event date)` : ""}`]);
  if ((r.version || 1) > 1) rows.push(["Last edited", `${fmtDateTimeISO(r.updatedAt)} (version ${r.version}; earlier versions retained)`]);
  for (const f of visibleFields(r.type, opts)) {
    if (f.key === t.dateField || f.key === t.timeField || f.key === "tz") continue;
    const v = valueText(f, r.data?.[f.key], c);
    if (v) rows.push([f.label, v]);
  }
  if (r.type === "evidence" && r.data?.file) {
    const f = r.data.file;
    rows.push(["Stored original", `${f.name} (${f.type}, ${f.size} bytes) added ${fmtDateTimeISO(f.addedAt)}`]);
    rows.push(["SHA-256", f.sha256]);
  }
  if (r.type === "child") { const age = childAge(r); if (age != null && opts.childMode !== "exclude") rows.push(["Age", String(age)]); }
  const links = [...new Set([...(r.data?.related || []), ...(r.data?.derivedFrom || [])])].map((id) => c.getRecord(id)).filter((x) => x && !x.deleted);
  if (links.length) rows.push(["Linked records", links.map((x) => `${x.ref} – ${recordTitle(x, c)}`).join("\n")]);
  const ev = (r.data?.attachments || []).map((id) => c.getRecord(id)).filter((x) => x && !x.deleted);
  if (ev.length) rows.push(["Evidence", ev.map((x) => `${x.ref} – ${x.data?.title || ""}${x.data?.file?.sha256 ? ` (SHA-256 ${x.data.file.sha256.slice(0, 16)}…)` : ""}`).join("\n")]);
  if (r.importedFrom) rows.push(["Imported from", `${r.importedFrom.source || "earlier data"}${r.importedFrom.originalId ? `, original id ${r.importedFrom.originalId}` : ""}`]);
  if (opts.includeLegacy && r.data?.legacy) rows.push(["Original imported data", r.data.legacy]);
  return [{ t: "h3", text: `${r.ref} — ${recordTitle(r, c)}` }, { t: "kv", rows }];
}

// ───────── statistics ─────────
export function parentingStats(records, { start, end, childId } = {}) {
  const pts = records.filter((r) => r.type === "parenting" && !r.deleted)
    .filter((r) => (!start || recordDate(r) >= start) && (!end || recordDate(r) <= end))
    .filter((r) => !childId || (r.data?.children || []).includes(childId));
  const s = { requested: 0, scheduled: 0, completed: 0, denied: 0, cancelledByMe: 0, cancelledByOther: 0, missed: 0, unanswered: 0, overnights: 0, hours: 0, activities: 0, total: pts.length };
  for (const r of pts) {
    const cat = ptCategory(r); const type = r.data?.entryType || "";
    if (/Requested/.test(type)) s.requested++;
    if (cat === "unanswered") s.unanswered++;
    if (/Scheduled/.test(type)) s.scheduled++;
    if (cat === "completed") { s.completed++; s.hours += ptHours(r); }
    if (cat === "denied") s.denied++;
    if (cat === "missed") s.missed++;
    if (cat === "cancelled") { if (/by me/.test(r.data?.outcome || "")) s.cancelledByMe++; else s.cancelledByOther++; }
    if (cat === "activity") s.activities++;
    s.overnights += Number(r.data?.overnights || 0) || 0;
  }
  s.hours = Math.round(s.hours * 10) / 10;
  return s;
}

function statsRows(s) {
  return [
    ["Requests for parenting time", String(s.requested)], ["Requests with no response", String(s.unanswered)],
    ["Scheduled parenting time entries (including later-cancelled)", String(s.scheduled)], ["Completed parenting time entries", String(s.completed)],
    ["Hours of completed time (where start and end were recorded)", String(s.hours)], ["Overnights", String(s.overnights)],
    ["Denied or disputed", String(s.denied)], ["Cancelled by me", String(s.cancelledByMe)], ["Cancelled by the other parent", String(s.cancelledByOther)],
    ["Missed opportunities", String(s.missed)], ["Activities, school, medical, and other involvement", String(s.activities)],
  ];
}

function countsByType(recs) {
  return TYPE_ORDER.map((t) => [TYPES[t].plural, recs.filter((r) => r.type === t).length]).filter(([, n]) => n > 0).map(([k, n]) => [k, String(n)]);
}

function summaryTable(recs, c) {
  return {
    t: "table", fontSize: 8.2,
    cols: [{ label: "Date", w: 1.05 }, { label: "ID", w: 0.9 }, { label: "Type", w: 1.3 }, { label: "Title", w: 2.2 }, { label: "Summary", w: 3.5 }],
    rows: recs.filter((r) => r.type !== "child").map((r) => [fmtDate(recordDate(r)), r.ref, TYPES[r.type].short || TYPES[r.type].label, recordTitle(r, c), truncate(String(valueText(TYPES[r.type].fields.find((f) => f.key === MAIN_TEXT[r.type]) || { type: "text" }, r.data?.[MAIN_TEXT[r.type]], c) || ""), 260)]),
  };
}

function evidenceTable(recs, c, all) {
  const ev = recs.filter((r) => r.type === "evidence");
  return {
    t: "table", fontSize: 7.8,
    cols: [{ label: "ID", w: 0.8 }, { label: "Description", w: 2 }, { label: "Type", w: 0.9 }, { label: "Created / received", w: 1 }, { label: "Added", w: 1 }, { label: "Source", w: 1.3 }, { label: "Original stored", w: 1.3 }, { label: "SHA-256 (first 16)", w: 1.3 }, { label: "Linked to", w: 1.1 }],
    rows: ev.map((r) => [r.ref, r.data?.title || "", r.data?.evidenceType || "", fmtDate(r.data?.dateCreated), fmtDate(r.createdAt), r.data?.source || "", r.data?.storageLocation || "", r.data?.file?.sha256 ? r.data.file.sha256.slice(0, 16) : "(external)",
      all.filter((o) => !o.deleted && ((o.data?.attachments || []).includes(r.id) || (o.data?.related || []).includes(r.id) || (r.data?.related || []).includes(o.id))).map((o) => o.ref).join(", ")]),
  };
}

function taskTable(tasks) {
  return {
    t: "table", fontSize: 8.2,
    cols: [{ label: "Date", w: 1 }, { label: "ID", w: 0.8 }, { label: "Task", w: 2.2 }, { label: "Kind", w: 1.2 }, { label: "Priority", w: 0.7 }, { label: "Status", w: 0.9 }, { label: "Source of date", w: 2 }],
    rows: tasks.map((r) => [`${fmtDate(r.data?.dueDate)}${r.data?.dueTime ? " " + fmtTime(r.data.dueTime) : ""}`, r.ref, r.data?.title || "", r.data?.kind || "", r.data?.priority || "", r.data?.status || "", r.data?.deadlineSource || ""]),
  };
}

function metaRows(opts, ctx, recs, extra = []) {
  const { start, end } = effectiveRange(opts);
  const rows = [];
  if (ctx.settings?.caseCaption) rows.push(["Matter", ctx.settings.caseCaption]);
  if (ctx.settings?.preparedBy) rows.push(["Prepared by", ctx.settings.preparedBy]);
  rows.push(["Date range", start || end ? `${start ? fmtDate(start, { long: true }) : "Earliest record"} – ${end ? fmtDate(end, { long: true }) : "Latest record"}` : "All dates"]);
  rows.push(["Generated", fmtDateTimeISO((ctx.now || new Date()).toISOString())]);
  rows.push(["Records included", String(recs.length)]);
  rows.push(["Privacy options", [opts.includePrivate ? "Private notes INCLUDED" : "Private notes excluded", { full: "Children's names shown", minimal: "Children shown by initials; child details minimized", exclude: "Child statements and child details excluded" }[opts.childMode]].join("; ")]);
  return [...rows, ...extra];
}

// ───────── document model ─────────
export function buildReportModel(all, opts, ctx) {
  const c = mkCtx(ctx, opts);
  const now = ctx.now || new Date();
  const recs = selectRecords(all, opts);
  const kindLabel = REPORT_KINDS.find((k) => k.id === opts.kind)?.label || "Report";
  const sampleTag = opts.sample ? "SAMPLE (fictional) – " : "";
  const model = { title: `${sampleTag}${opts.title || kindLabel}`, subtitle: "Case Compass", notice: NOTICE(now, opts.sample), blocks: [], footer: `${opts.sample ? "SAMPLE – fictional data. " : ""}Generated with Case Compass ${fmtDate(now)} – not a court document` };
  const B = model.blocks;

  if (opts.kind === "blank") {
    model.title = `${sampleTag}Blank record-keeping forms`;
    model.notice = "Blank forms for your own record-keeping. These are not official court forms. Write facts you personally know, and note the date you wrote each entry.";
    model.metaRows = [["Printed", fmtDate(now, { long: true })]];
    B.push({ t: "h1", text: "Incident record" }, { t: "fields", rows: ["Date of event", "Time and time zone", "Date written", "Location", "People involved", "Witnesses"] },
      { t: "lines", label: "What happened? (what you personally saw or heard)", n: 8 }, { t: "lines", label: "Exact statements (only words you are sure of)", n: 3 }, { t: "lines", label: "Evidence available and where originals are kept", n: 2 }, { t: "lines", label: "What happened afterward / follow-up", n: 3 }, { t: "pagebreak" });
    B.push({ t: "h1", text: "Communication log" }, { t: "table", fontSize: 8.5, cols: [{ label: "Date / time", w: 1.1 }, { label: "Method", w: 0.9 }, { label: "Who started", w: 0.9 }, { label: "Subject / request", w: 2 }, { label: "Response", w: 1.6 }, { label: "Follow-up", w: 1.2 }], rows: Array.from({ length: 14 }, () => ["\n\n", "", "", "", "", ""]) }, { t: "pagebreak" });
    B.push({ t: "h1", text: "Parenting-time log" }, { t: "table", fontSize: 8.5, cols: [{ label: "Date", w: 0.9 }, { label: "Type (requested / scheduled / completed / exchange)", w: 1.6 }, { label: "Start – end", w: 1.1 }, { label: "Overnights", w: 0.7 }, { label: "Outcome / reason given", w: 2.1 }, { label: "Notes", w: 1.4 }], rows: Array.from({ length: 14 }, () => ["\n\n", "", "", "", "", ""]) }, { t: "pagebreak" });
    B.push({ t: "h1", text: "Child statement record" }, { t: "p", text: "Record only statements the child made on their own, in their exact words. Do not question or coach the child.", style: "muted" },
      { t: "fields", rows: ["Child", "Date and time", "Who heard it"] }, { t: "lines", label: "Exact words", n: 4 }, { t: "lines", label: "Context (what was happening just before)", n: 3 }, { t: "lines", label: "How you responded", n: 2 });
    return model;
  }

  if (opts.kind === "checklist") {
    model.metaRows = [["Generated", fmtDateTimeISO(now.toISOString())], ...(ctx.settings?.preparedBy ? [["Prepared by", ctx.settings.preparedBy]] : [])];
    const st = ctx.checklists || {};
    for (const p of ctx.protocols || []) {
      const done = p.items.filter((i) => st[i.id]?.done).length;
      B.push({ t: "h1", text: `Protocol ${p.id}: ${p.title} (${done} of ${p.items.length} complete)` });
      B.push({ t: "checklist", items: p.items.map((i) => ({ text: `${i.id}. ${i.title}`, done: !!st[i.id]?.done, meta: [st[i.id]?.date ? `Completed ${fmtDate(st[i.id].date)}` : "", opts.includePrivate && st[i.id]?.notes ? `Notes: ${st[i.id].notes}` : ""].filter(Boolean).join(" · ") })) });
    }
    for (const g of (ctx.guides || []).filter((g) => g.sections.some((s) => s.checklist))) {
      B.push({ t: "h1", text: g.title });
      for (const s of g.sections.filter((s) => s.checklist)) {
        B.push({ t: "h3", text: s.heading }, { t: "checklist", items: s.checklist.map((i) => ({ text: i.text, done: !!st[i.id]?.done, meta: st[i.id]?.date ? `Completed ${fmtDate(st[i.id].date)}` : "" })) });
      }
    }
    const open = all.filter((r) => r.type === "task" && !r.deleted && isOpen(r)).sort((a, b) => (a.data.dueDate < b.data.dueDate ? -1 : 1));
    B.push({ t: "h1", text: "Open tasks" }, open.length ? taskTable(open) : { t: "p", text: "No open tasks.", style: "muted" });
    return model;
  }

  model.metaRows = metaRows(opts, ctx, recs);

  if (opts.kind === "attorney") {
    model.title = `${sampleTag}${opts.title || "Attorney Consultation Preparation Packet"}`;
    B.push({ t: "p", text: "This packet organizes the author's records for a consultation. It intentionally leaves out private notes, earlier attorneys' advice, and detailed child information unless the author chose to include them." , style: "muted" });
    const attys = recs.filter((r) => r.type === "attorney");
    B.push({ t: "h1", text: "1. Consultation details and questions" });
    if (attys.length) for (const a of attys) {
      B.push({ t: "h3", text: `${a.data.name}${a.data.firm ? `, ${a.data.firm}` : ""}${a.data.consultDate ? ` – ${fmtDate(a.data.consultDate)}` : ""}` });
      const qs = String(a.data.questions || "").split(/\n+/).map((s) => s.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);
      if (qs.length) B.push({ t: "p", text: "Questions to ask", style: "bold" }, { t: "bullets", items: qs });
      if (a.data.documentsRequested) B.push({ t: "kv", rows: [["Documents requested", a.data.documentsRequested]] });
    } else B.push({ t: "p", text: "No attorney consultation records were selected.", style: "muted" });
    const kids = all.filter((r) => r.type === "child" && !r.deleted);
    if (kids.length && opts.childMode !== "exclude") {
      B.push({ t: "h1", text: "2. Children" }, { t: "table", cols: [{ label: "Child", w: 1.5 }, { label: "Age", w: 0.6 }, ...(opts.childMode === "full" ? [{ label: "School / grade", w: 2 }] : [])], rows: kids.map((k) => [c.childName(k.id), String(childAge(k) ?? ""), ...(opts.childMode === "full" ? [`${k.data.school || ""}${k.data.grade ? `, grade ${k.data.grade}` : ""}`] : [])]) });
    }
    const court = all.filter((r) => r.type === "task" && !r.deleted && /Filing deadline|Court hearing|Attorney consultation|Parenting class/.test(r.data?.kind || "")).sort((a, b) => (a.data.dueDate < b.data.dueDate ? -1 : 1));
    B.push({ t: "h1", text: "3. Key dates and deadlines" }, court.length ? taskTable(court) : { t: "p", text: "No court dates or deadlines recorded.", style: "muted" });
    B.push({ t: "h1", text: "4. Timeline summary" }, summaryTable(recs.filter((r) => !["attorney", "task"].includes(r.type)), c));
    const { start, end } = effectiveRange(opts);
    B.push({ t: "h1", text: "5. Parenting-time comparison" }, { t: "kv", rows: statsRows(parentingStats(all, { start, end })) });
    const pol = recs.filter((r) => r.type === "police");
    if (pol.length) B.push({ t: "h1", text: "6. Police and official contacts" }, { t: "table", cols: [{ label: "Date", w: 1 }, { label: "ID", w: 0.8 }, { label: "Agency", w: 1.6 }, { label: "Type", w: 1.1 }, { label: "Case no.", w: 1 }, { label: "Report no.", w: 1 }, { label: "Records", w: 1 }], rows: pol.map((r) => [fmtDate(r.data.date), r.ref, r.data.agency || "", r.data.contactType || "", r.data.caseNumber || "", r.data.reportNumber || "", r.data.recordsStatus || ""]) });
    B.push({ t: "h1", text: `${pol.length ? 7 : 6}. Evidence index` }, evidenceTable(recs, c, all));
    return model;
  }

  if (opts.kind === "evidence") {
    B.push({ t: "h1", text: "Evidence inventory" }, { t: "p", text: "SHA-256 fingerprints identify each stored original exactly. Annotated or modified copies are listed as separate items linked to their originals.", style: "muted" }, evidenceTable(recs, c, all));
    for (const r of recs.filter((x) => x.type === "evidence")) B.push(...recordBlock(r, opts, c));
    return model;
  }

  if (opts.kind === "parenting") {
    const { start, end } = effectiveRange(opts);
    const kids = all.filter((r) => r.type === "child" && !r.deleted);
    B.push({ t: "h1", text: "Comparison: requested, scheduled, and completed" }, { t: "kv", rows: statsRows(parentingStats(all, { start, end })) });
    if (kids.length > 1 && opts.childMode !== "exclude") for (const k of kids) B.push({ t: "h3", text: `By child: ${c.childName(k.id)}` }, { t: "kv", rows: statsRows(parentingStats(all, { start, end, childId: k.id })).slice(0, 6) });
    const pts = recs.filter((r) => r.type === "parenting");
    B.push({ t: "h1", text: "Parenting-time entries" }, { t: "table", fontSize: 7.9, cols: [{ label: "Date", w: 0.9 }, { label: "ID", w: 0.7 }, { label: "Type", w: 1.3 }, { label: "Children", w: 1 }, { label: "Time", w: 1 }, { label: "Nights", w: 0.5 }, { label: "Outcome", w: 1.1 }, { label: "Reason / notes", w: 2.3 }],
      rows: pts.map((r) => [fmtDate(r.data.date), r.ref, r.data.entryType || "", valueText({ type: "children" }, r.data.children, c), [fmtTime(r.data.startTime), fmtTime(r.data.endTime)].filter(Boolean).join(" – "), String(r.data.overnights || ""), r.data.outcome || "", [r.data.reason, r.data.activities].filter(Boolean).join(" | ")]) });
    const comms = recs.filter((r) => r.type === "communication" && r.data?.request && r.data.request !== "None");
    B.push({ t: "h1", text: "Parenting-related communications" }, comms.length ? { t: "table", fontSize: 7.9, cols: [{ label: "Date", w: 0.9 }, { label: "ID", w: 0.7 }, { label: "Method", w: 0.9 }, { label: "Request", w: 1.5 }, { label: "Details", w: 2 }, { label: "Response", w: 1.3 }], rows: comms.map((r) => [fmtDate(r.data.date), r.ref, r.data.method || "", r.data.request || "", r.data.requestDetails || r.data.subject || "", r.data.responseStatus || ""]) } : { t: "p", text: "None in this range.", style: "muted" });
    for (const r of pts) B.push(...recordBlock(r, opts, c));
    return model;
  }

  if (opts.kind === "monthly") {
    const { start, end } = effectiveRange(opts);
    model.title = `${sampleTag}${opts.title || `Monthly Report – ${opts.month ? monthLabel(opts.month) : ""}`}`;
    B.push({ t: "h1", text: "Summary" }, { t: "kv", rows: countsByType(recs).length ? countsByType(recs) : [["Records", "None in this month"]] });
    B.push({ t: "h2", text: "Parenting time" }, { t: "kv", rows: statsRows(parentingStats(all, { start, end })) });
    const tasks = all.filter((r) => r.type === "task" && !r.deleted && r.data.dueDate >= start && r.data.dueDate <= end);
    B.push({ t: "h1", text: "Timeline" }, summaryTable(recs, c));
    const order = ["incident", "communication", "parenting", "childStatement", "police", "residence", "expense"];
    for (const t of order) { const rs = recs.filter((r) => r.type === t); if (!rs.length) continue; B.push({ t: "h1", text: TYPES[t].plural }); rs.forEach((r) => B.push(...recordBlock(r, opts, c))); }
    B.push({ t: "h1", text: "Tasks and appointments this month" }, tasks.length ? taskTable(tasks) : { t: "p", text: "None.", style: "muted" });
    if (recs.some((r) => r.type === "evidence")) B.push({ t: "h1", text: "Evidence added or dated this month" }, evidenceTable(recs, c, all));
    return model;
  }

  // chronological, category, single selection
  if (opts.recordIds?.length === 1 && recs[0]) model.title = `${sampleTag}${opts.title || `${recs[0].ref} – ${recordTitle(recs[0], c)}`}`;
  B.push({ t: "h1", text: "Summary" }, { t: "kv", rows: countsByType(recs).length ? countsByType(recs) : [["Records", "None selected"]] });
  if (recs.length > 1) B.push({ t: "h1", text: "Timeline overview" }, summaryTable(recs, c));
  B.push({ t: "h1", text: "Records in date order" });
  let month = "";
  for (const r of recs) {
    const m = recordDate(r).slice(0, 7);
    if (m && m !== month && recs.length > 1) { month = m; B.push({ t: "h2", text: monthLabel(m) }); }
    B.push(...recordBlock(r, opts, c));
  }
  const ev = recs.filter((r) => r.type === "evidence");
  if (ev.length) B.push({ t: "h1", text: "Evidence referenced" }, evidenceTable(recs, c, all));
  const open = recs.filter((r) => isOpen(r) && r.type !== "task");
  if (open.length) B.push({ t: "h1", text: "Open follow-ups" }, { t: "table", cols: [{ label: "ID", w: 0.8 }, { label: "Title", w: 2.4 }, { label: "Follow-up", w: 3 }], rows: open.map((r) => [r.ref, recordTitle(r, c), r.data?.followUp || ""]) });
  return model;
}

// ───────── workbook model (Excel) ─────────
function typeSheet(name, type, recs, opts, c) {
  const fields = visibleFields(type, opts).filter((f) => TYPES[type].columns.includes(f.key));
  const extra = type === "evidence" ? [{ header: "File name", width: 24 }, { header: "File type", width: 14 }, { header: "Size (bytes)", width: 12, type: "number" }, { header: "SHA-256", width: 66 }] : [];
  const cols = [{ header: "Record ID", width: 11 }, { header: "Entered", width: 12, type: "date" }, ...fields.map((f) => ({ header: f.label, width: f.type === "textarea" ? 48 : f.type === "date" ? 12 : f.type === "time" ? 9 : 20, type: f.type === "date" ? "date" : f.type === "money" ? "money" : f.type === "number" ? "number" : f.type === "textarea" ? "wrap" : "text" })), ...extra, { header: "Linked records", width: 22 }, { header: "Evidence", width: 18 }];
  const rows = recs.filter((r) => r.type === type).map((r) => {
    const vals = fields.map((f) => (f.type === "date" ? r.data?.[f.key] || "" : f.type === "money" || f.type === "number" ? r.data?.[f.key] ?? "" : valueText(f, r.data?.[f.key], c)));
    const ex = type === "evidence" ? [r.data?.file?.name || "", r.data?.file?.type || "", r.data?.file?.size ?? "", r.data?.file?.sha256 || ""] : [];
    return [r.ref, (r.createdAt || "").slice(0, 10), ...vals, ...ex, (r.data?.related || []).map((id) => c.refOf(id)).join(", "), (r.data?.attachments || []).map((id) => c.refOf(id)).join(", ")];
  });
  return { name, columns: cols, rows };
}

export function buildWorkbookModel(all, opts, ctx) {
  const c = mkCtx(ctx, opts);
  const now = ctx.now || new Date();
  const recs = selectRecords(all, { ...opts, kind: opts.kind === "attorney" ? "chronological" : opts.kind });
  const allLive = all.filter((r) => !r.deleted);
  const sheets = [];
  const overviewRows = [
    ["Title", `${opts.sample ? "SAMPLE (fictional) – " : ""}${opts.title || "Case Compass workbook"}`],
    ...metaRows(opts, ctx, recs).map(([k, v]) => [k, v]),
    ["Notice", NOTICE(now, opts.sample)],
    ...countsByType(recs).map(([k, v]) => [`Count: ${k}`, v]),
  ];
  sheets.push({ name: "Overview", columns: [{ header: "Item", width: 30, type: "label" }, { header: "Value", width: 100, type: "wrap" }], rows: overviewRows, filter: false });
  sheets.push({
    name: "Chronological Timeline",
    columns: [{ header: "Event date", width: 12, type: "date" }, { header: "Time", width: 9 }, { header: "Record ID", width: 11 }, { header: "Type", width: 18 }, { header: "Title", width: 40 }, { header: "Summary", width: 70, type: "wrap" }, { header: "Status", width: 11 }, { header: "Entered", width: 12, type: "date" }, { header: "Days entered after event", width: 12, type: "number" }],
    rows: recs.filter((r) => r.type !== "child").map((r) => [recordDate(r), fmtTime(recordTime(r)), r.ref, TYPES[r.type].short || TYPES[r.type].label, recordTitle(r, c), truncate(valueText(TYPES[r.type].fields.find((f) => f.key === MAIN_TEXT[r.type]) || { type: "text" }, r.data?.[MAIN_TEXT[r.type]], c), 2000), TYPES[r.type].statusField ? r.data?.[TYPES[r.type].statusField] || "" : "", (r.createdAt || "").slice(0, 10), enteredLater(r) || 0]),
  });
  sheets.push(typeSheet("Incidents", "incident", recs, opts, c));
  sheets.push(typeSheet("Communications", "communication", recs, opts, c));
  sheets.push(typeSheet("Parenting Time", "parenting", recs, opts, c));
  const kids = opts.childMode === "exclude" ? [] : allLive.filter((r) => r.type === "child");
  const act = recs.filter((r) => (r.type === "parenting" && ptCategory(r) === "activity") || r.type === "childStatement");
  sheets.push({
    name: "Children and Activities",
    columns: [{ header: "Record ID", width: 11 }, { header: "Date", width: 12, type: "date" }, { header: "Child", width: 18 }, { header: "Kind", width: 22 }, { header: "Details", width: 70, type: "wrap" }, { header: "School / location", width: 24 }],
    rows: [
      ...kids.map((k) => [k.ref, "", c.childName(k.id), `Child profile${childAge(k) != null ? ` (age ${childAge(k)})` : ""}`, opts.childMode === "full" ? [k.data.schedule, k.data.activities].filter(Boolean).join(" | ") : "", opts.childMode === "full" ? [k.data.school, k.data.grade && `grade ${k.data.grade}`].filter(Boolean).join(", ") : ""]),
      ...act.map((r) => [r.ref, recordDate(r), valueText({ type: "children" }, r.data?.children, c), r.type === "childStatement" ? "Child statement (exact words)" : r.data?.entryType, r.type === "childStatement" ? r.data?.statement : r.data?.activities || "", r.data?.location || ""]),
    ],
  });
  sheets.push(typeSheet("Evidence Inventory", "evidence", recs, opts, c));
  sheets.push(typeSheet("Police Contacts", "police", recs, opts, c));
  const deadlines = allLive.filter((r) => r.type === "task" && /Filing deadline|Court hearing/.test(r.data?.kind || ""));
  sheets.push({ name: "Court Deadlines", columns: [{ header: "Date", width: 12, type: "date" }, { header: "Time", width: 9 }, { header: "Record ID", width: 11 }, { header: "Title", width: 40 }, { header: "Kind", width: 16 }, { header: "Source of date", width: 40, type: "wrap" }, { header: "Status", width: 12 }, { header: "Location", width: 24 }],
    rows: deadlines.map((r) => [r.data.dueDate, fmtTime(r.data.dueTime), r.ref, r.data.title, r.data.kind, r.data.deadlineSource || "", r.data.status || "", r.data.location || ""]) });
  sheets.push(typeSheet("Task Tracker", "task", allLive.filter((r) => selectRecords([r], opts).length || r.type === "task"), opts, c));
  sheets.push(typeSheet("Expenses", "expense", recs, opts, c));
  const st = ctx.checklists || {};
  sheets.push({ name: "Security Checklist", columns: [{ header: "Protocol", width: 30 }, { header: "Item", width: 7 }, { header: "What to do", width: 60, type: "wrap" }, { header: "Status", width: 11 }, { header: "Date completed", width: 14, type: "date" }, ...(opts.includePrivate ? [{ header: "Notes", width: 40, type: "wrap" }] : [])],
    rows: (ctx.protocols || []).flatMap((p) => p.items.map((i) => [`${p.id}. ${p.title}`, i.id, i.title, st[i.id]?.done ? "Done" : "Not done", st[i.id]?.date || "", ...(opts.includePrivate ? [st[i.id]?.notes || ""] : [])])) });
  return { title: opts.title || "Case Compass workbook", sheets };
}

// ───────── CSV ─────────
export function buildTimelineCSV(all, opts, ctx) {
  const c = mkCtx(ctx, opts);
  const recs = selectRecords(all, opts).filter((r) => r.type !== "child");
  const rows = [["Record ID", "Type", "Event date", "Event time", "Time zone", "Entered (UTC)", "Last edited (UTC)", "Version", "Title", "Status", "Summary", "Linked records", "Evidence"]];
  for (const r of recs) {
    const t = TYPES[r.type];
    rows.push([r.ref, t.label, recordDate(r), recordTime(r), r.data?.tz || "", r.createdAt, r.updatedAt, r.version || 1, recordTitle(r, c), t.statusField ? r.data?.[t.statusField] || "" : "",
      valueText(t.fields.find((f) => f.key === MAIN_TEXT[r.type]) || { type: "text" }, r.data?.[MAIN_TEXT[r.type]], c),
      (r.data?.related || []).map((id) => c.refOf(id)).join("; "), (r.data?.attachments || []).map((id) => c.refOf(id)).join("; ")]);
  }
  return toCSV(rows);
}

export function buildTypeCSV(all, type, opts, ctx) {
  const c = mkCtx(ctx, opts);
  const sheet = typeSheet(TYPES[type].plural, type, selectRecords(all, opts), opts, c);
  return toCSV([sheet.columns.map((x) => x.header), ...sheet.rows]);
}
