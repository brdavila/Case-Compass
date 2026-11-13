// Record type definitions. Forms, detail views, the timeline, search, and every report format
// are generated from these definitions, so a field added here appears everywhere consistently.
//
// Field types: text, textarea, date, time, tz, select, multiselect, people, children, number,
// money, records (links to other records), evidence (attach files / link evidence), file (single
// original file, evidence only), email, tel, checkbox.
// `sensitive: true` fields are excluded from reports unless the user explicitly includes them.
// `child: true` fields contain child-specific details that can be minimized in reports.

import { DEFAULT_TZ, fmtDate, fmtTime, ageFrom } from "./util.js";

const STATUS = { key: "status", label: "Status", type: "select", options: ["Open", "Resolved"], default: "Open", help: "Open means something still needs attention." };
const RELATED = { key: "related", label: "Related records", type: "records", help: "Link incidents, messages, evidence, or tasks that belong together. Links work both ways." };
const PRIVATE = { key: "privateNotes", label: "Private notes", type: "textarea", sensitive: true, help: "Excluded from reports unless you choose to include private notes." };
const TZ = { key: "tz", label: "Time zone", type: "tz", default: DEFAULT_TZ };
const ATTACH = { key: "attachments", label: "Evidence and attachments", type: "evidence", help: "Attach photos, screenshots, PDFs, audio, or video. Each file is stored once in the Evidence Library, with its SHA-256 fingerprint, and can be linked to other records." };

export const TYPES = {
  incident: {
    label: "Incident", short: "Incident", plural: "Incidents", prefix: "INC", area: "document", icon: "alert",
    dateField: "date", timeField: "time", titleField: "title", statusField: "status",
    intro: "Record what happened in factual, specific language. Describe what you saw and heard, not conclusions about anyone.",
    fields: [
      { key: "title", label: "Short title", type: "text", required: true, placeholder: "e.g., Scheduled exchange did not take place" },
      { key: "date", label: "Date it happened", type: "date", required: true, defaultToday: true },
      { key: "time", label: "Time", type: "time" }, TZ,
      { key: "location", label: "Location", type: "text" },
      { key: "category", label: "Category", type: "select", options: ["Parenting time or exchange", "Communication", "Residence or property", "Safety concern", "Child well-being", "School", "Medical", "Police involvement", "Technology or accounts", "Financial", "Other"] },
      { key: "people", label: "People involved", type: "people" },
      { key: "witnesses", label: "Witnesses", type: "people" },
      { key: "description", label: "What happened?", type: "textarea", required: true, rows: 6, help: "Describe events in order. Include dates, times, and specific actions." },
      { key: "observation", label: "How do you know?", type: "select", options: ["I personally saw or heard this", "Someone told me (secondhand)", "Both: some personal, some secondhand"] },
      { key: "observed", label: "What did you personally observe?", type: "textarea", rows: 3 },
      { key: "statements", label: "Exact statements (only if you remember the exact words)", type: "textarea", rows: 3, help: "Put exact words in quotation marks and say who said them. If you are not sure of the exact words, summarize instead." },
      { key: "evidenceNotes", label: "What evidence is available?", type: "textarea", rows: 2, help: "Physical or digital evidence, and where each original is kept." },
      ATTACH,
      { key: "police", label: "Police involvement", type: "select", options: ["None", "Police were called", "Police responded", "Report filed later"], default: "None" },
      { key: "policeRef", label: "Agency and report number (exactly as given)", type: "text", showIf: (d) => d.police && d.police !== "None" },
      { key: "afterward", label: "What happened afterward? Actions taken", type: "textarea", rows: 3 },
      { key: "followUp", label: "Follow-up needed", type: "textarea", rows: 2 },
      STATUS, RELATED, PRIVATE,
    ],
    columns: ["date", "time", "title", "category", "location", "people", "witnesses", "description", "observation", "police", "policeRef", "followUp", "status"],
  },
  communication: {
    label: "Communication", short: "Communication", plural: "Communications", prefix: "COM", area: "parenting", icon: "chat",
    dateField: "date", timeField: "time", titleField: "subject", statusField: "status",
    intro: "Log calls, texts, Messenger, email, and in-person conversations. Unanswered messages matter too.",
    fields: [
      { key: "date", label: "Date", type: "date", required: true, defaultToday: true },
      { key: "time", label: "Time", type: "time" }, TZ,
      { key: "method", label: "Method", type: "select", required: true, options: ["Phone call", "Text message", "Messenger", "Email", "In person", "Video call", "Voicemail", "Co-parenting app", "Letter", "Other"] },
      { key: "initiator", label: "Who started it?", type: "select", options: ["I did", "The other parent", "Someone else"] },
      { key: "participants", label: "Participants", type: "people" },
      { key: "subject", label: "Subject", type: "text", required: true, placeholder: "e.g., Request for weekend parenting time" },
      { key: "contentType", label: "Content recorded as", type: "select", options: ["Exact words", "Factual summary"], default: "Factual summary" },
      { key: "content", label: "Exact words or factual summary", type: "textarea", rows: 5 },
      { key: "request", label: "Parenting-related request", type: "select", options: ["None", "Request for parenting time", "Schedule change", "Exchange logistics", "Information about a child", "Other"], default: "None" },
      { key: "requestDetails", label: "Request details", type: "text", showIf: (d) => d.request && d.request !== "None" },
      { key: "responseStatus", label: "Response", type: "select", options: ["Response received", "Waiting for response", "No response (unanswered)", "Declined", "Partially agreed", "Agreed"], },
      { key: "response", label: "Response details", type: "textarea", rows: 3 },
      { key: "outcome", label: "Outcome", type: "textarea", rows: 2 },
      ATTACH,
      { key: "followUp", label: "Follow-up needed", type: "textarea", rows: 2 },
      STATUS, RELATED, PRIVATE,
    ],
    columns: ["date", "time", "method", "initiator", "participants", "subject", "contentType", "content", "request", "requestDetails", "responseStatus", "response", "outcome", "status"],
  },
  parenting: {
    label: "Parenting-Time Entry", short: "Parenting time", plural: "Parenting Time", prefix: "PT", area: "parenting", icon: "calendar",
    dateField: "date", timeField: "startTime", titleField: "entryType",
    intro: "Record successful and unsuccessful parenting time accurately, including requests, exchanges, and activities.",
    fields: [
      { key: "entryType", label: "Type of entry", type: "select", required: true, options: ["Completed parenting time", "Overnight stay", "Scheduled parenting time", "Requested parenting time", "Exchange", "Cancellation", "Denied or disputed request", "Missed opportunity", "Positive activity", "School involvement", "Medical appointment", "Extracurricular activity", "Parent-child communication"] },
      { key: "children", label: "Children", type: "children", child: true },
      { key: "date", label: "Date (or start date)", type: "date", required: true, defaultToday: true },
      { key: "startTime", label: "Start time", type: "time" },
      { key: "endDate", label: "End date", type: "date" },
      { key: "endTime", label: "End time", type: "time" }, TZ,
      { key: "overnights", label: "Overnights", type: "number", min: 0, help: "Number of nights the children stayed with you during this entry." },
      { key: "requestedOn", label: "Date requested", type: "date", showIf: (d) => /Requested|Denied|Cancellation/.test(d.entryType || "") },
      { key: "outcome", label: "Outcome", type: "select", options: ["Completed as planned", "Partially completed", "Cancelled by me", "Cancelled by other parent", "Denied", "Disputed", "No response", "Pending", "Not applicable"] },
      { key: "reason", label: "Reason provided (quote if possible)", type: "textarea", rows: 2 },
      { key: "location", label: "Location or exchange point", type: "text" },
      { key: "activities", label: "Activities and notes", type: "textarea", rows: 3, help: "School, medical, extracurricular, or everyday parenting activities." },
      ATTACH, RELATED, PRIVATE,
    ],
    columns: ["date", "startTime", "endDate", "endTime", "entryType", "children", "overnights", "requestedOn", "outcome", "reason", "location", "activities"],
  },
  child: {
    label: "Child", short: "Child", plural: "Children", prefix: "CH", area: "parenting", icon: "child",
    dateField: null, titleField: "name", noTimeline: true,
    intro: "One record per child. Use neutral language and include only what you need.",
    fields: [
      { key: "name", label: "Name or initials", type: "text", required: true, help: "Initials are fine; reports can show initials only." },
      { key: "dob", label: "Date of birth", type: "date", child: true },
      { key: "school", label: "School", type: "text", child: true },
      { key: "grade", label: "Grade", type: "text", child: true },
      { key: "schedule", label: "Regular schedule", type: "textarea", rows: 3, child: true, help: "School hours, activities, routines." },
      { key: "activities", label: "Activities", type: "textarea", rows: 2, child: true },
      { key: "providers", label: "Doctors, dentist, counselors", type: "textarea", rows: 2, child: true },
      { key: "careNotes", label: "Care information (allergies, medications, needs)", type: "textarea", rows: 2, child: true, sensitive: true },
      PRIVATE,
    ],
    columns: ["name", "dob", "school", "grade", "schedule", "activities", "providers"],
  },
  childStatement: {
    label: "Child Statement", short: "Child statement", plural: "Child Statements", prefix: "CS", area: "parenting", icon: "quote",
    dateField: "date", timeField: "time", titleField: "statement",
    intro: "Record only statements a child made spontaneously, in their exact words. Never question, coach, or ask a child to gather information.",
    fields: [
      { key: "children", label: "Child", type: "children", required: true, child: true },
      { key: "date", label: "Date", type: "date", required: true, defaultToday: true },
      { key: "time", label: "Time", type: "time" }, TZ,
      { key: "statement", label: "Exact words the child said", type: "textarea", required: true, rows: 3, child: true },
      { key: "spontaneous", label: "How did it come up?", type: "select", options: ["The child raised it on their own", "In response to a general, open question (e.g., 'How was your day?')", "Other"] },
      { key: "context", label: "Context (what was happening just before)", type: "textarea", rows: 2, child: true },
      { key: "heardBy", label: "Who heard it", type: "people" },
      { key: "response", label: "How you responded", type: "textarea", rows: 2 },
      RELATED, PRIVATE,
    ],
    columns: ["date", "time", "children", "statement", "spontaneous", "context", "heardBy", "response"],
  },
  police: {
    label: "Police / Official Contact", short: "Police/official", plural: "Police & Official Contacts", prefix: "POL", area: "document", icon: "badge",
    dateField: "date", timeField: "time", titleField: "agency", statusField: "status",
    intro: "Enter case and report numbers exactly as given. A report records that a contact happened; it does not by itself establish facts or lead to charges.",
    fields: [
      { key: "agency", label: "Agency or office", type: "text", required: true, list: ["Pueblo Police Department", "Pueblo County Sheriff's Office", "Colorado State Patrol", "Pueblo County District Attorney", "Pueblo Combined Court", "Other"] },
      { key: "contactType", label: "Type of contact", type: "select", options: ["Report filed", "Officer responded", "Phone call", "Records request", "Follow-up contact", "Court or DA contact", "Other"] },
      { key: "date", label: "Date", type: "date", required: true, defaultToday: true },
      { key: "time", label: "Time", type: "time" }, TZ,
      { key: "officer", label: "Officer or staff name and badge", type: "text" },
      { key: "caseNumber", label: "Case number (exactly as given)", type: "text" },
      { key: "reportNumber", label: "Report number (exactly as given)", type: "text" },
      { key: "summary", label: "Summary of the contact", type: "textarea", rows: 4 },
      { key: "recordsStatus", label: "Records request status", type: "select", options: ["Not requested", "Requested", "Received", "Denied", "Pending"], default: "Not requested" },
      { key: "recordsRequested", label: "Date records requested", type: "date", showIf: (d) => d.recordsStatus && d.recordsStatus !== "Not requested" },
      { key: "documentsReceived", label: "Documents received", type: "textarea", rows: 2 },
      { key: "followUpDate", label: "Follow-up date", type: "date" },
      { key: "followUp", label: "Follow-up notes", type: "textarea", rows: 2 },
      ATTACH, STATUS, RELATED, PRIVATE,
    ],
    columns: ["date", "time", "agency", "contactType", "officer", "caseNumber", "reportNumber", "summary", "recordsStatus", "recordsRequested", "documentsReceived", "followUpDate", "status"],
  },
  residence: {
    label: "Residence / Property Record", short: "Residence", plural: "Residence & Property", prefix: "RES", area: "document", icon: "home",
    dateField: "date", timeField: "time", titleField: "title", statusField: "status",
    intro: "Document access, keys, belongings, notices, and lease or ownership information.",
    warning: "Get legal advice before changing locks, excluding anyone, restricting entry, or taking any eviction-related action. Occupancy rights, leases, ownership, and court orders affect what is lawful.",
    fields: [
      { key: "entryType", label: "Type", type: "select", required: true, options: ["Access or entry", "Keys or codes", "Belongings", "Written notice", "Lease or ownership information", "Related incident", "Other"] },
      { key: "title", label: "Short title", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true, defaultToday: true },
      { key: "time", label: "Time", type: "time" }, TZ,
      { key: "details", label: "Details", type: "textarea", rows: 4 },
      { key: "people", label: "People involved", type: "people" },
      { key: "documents", label: "Lease, deed, or notice information", type: "textarea", rows: 2 },
      ATTACH, STATUS, RELATED, PRIVATE,
    ],
    columns: ["date", "time", "entryType", "title", "details", "people", "documents", "status"],
  },
  evidence: {
    label: "Evidence Item", short: "Evidence", plural: "Evidence", prefix: "EV", area: "document", icon: "file",
    dateField: "dateCreated", titleField: "title",
    intro: "Each original file is stored exactly as added, encrypted, with a SHA-256 fingerprint. Commentary is stored separately from the original.",
    fields: [
      { key: "title", label: "Description", type: "text", required: true },
      { key: "evidenceType", label: "Type", type: "select", options: ["Photo", "Screenshot", "PDF", "Document", "Exported conversation", "Email", "Audio", "Video", "Other", "External original (not stored here)"] },
      { key: "file", label: "Original file", type: "file" },
      { key: "source", label: "Original source", type: "text", help: "Who or where it came from." },
      { key: "sourceDevice", label: "Source device or account", type: "text" },
      { key: "dateCreated", label: "Date created or received", type: "date" },
      { key: "storageLocation", label: "Where the original is stored", type: "text", help: "For example: 'In this app (encrypted)', 'iPhone camera roll', 'USB drive in safe'." },
      { key: "backupStatus", label: "Backup status", type: "select", options: ["Not backed up", "Included in a verified encrypted backup", "Copy stored elsewhere"], default: "Not backed up" },
      { key: "handling", label: "Handling and transfer notes", type: "textarea", rows: 2, help: "Each time the original was copied, exported, or given to someone." },
      { key: "derivedFrom", label: "Modified copy of (original evidence item)", type: "records", only: "evidence", help: "If this is a cropped, annotated, or compressed copy, link the original here." },
      RELATED,
      { key: "notes", label: "Commentary (kept separate from the original)", type: "textarea", rows: 3 },
    ],
    columns: ["dateCreated", "title", "evidenceType", "fileName", "fileType", "fileSize", "sha256", "source", "sourceDevice", "storageLocation", "backupStatus", "handling", "notes"],
  },
  task: {
    label: "Task or Appointment", short: "Task", plural: "Tasks & Calendar", prefix: "TSK", area: "home", icon: "check",
    dateField: "dueDate", timeField: "dueTime", titleField: "title", statusField: "status",
    intro: "Court deadlines must come from an official notice, order, or verified rule. Record the source so you can check it later.",
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "kind", label: "Kind", type: "select", required: true, options: ["Appointment", "Attorney consultation", "Filing deadline", "Court hearing", "Parenting class", "Therapy appointment", "Document request", "Police follow-up", "Account security task", "Personal action item"] },
      { key: "dueDate", label: "Date", type: "date", required: true },
      { key: "dueTime", label: "Time", type: "time" }, TZ,
      { key: "location", label: "Location", type: "text" },
      { key: "priority", label: "Priority", type: "select", options: ["High", "Medium", "Low"], default: "Medium" },
      { key: "status", label: "Status", type: "select", options: ["Not started", "In progress", "Waiting", "Done", "Cancelled"], default: "Not started" },
      { key: "completedDate", label: "Completion date", type: "date", showIf: (d) => d.status === "Done" },
      { key: "deadlineSource", label: "Source of this date", type: "text", requiredIf: (d) => /Filing deadline|Court hearing/.test(d.kind || ""), help: "Required for court dates and filing deadlines, e.g., 'Notice of hearing dated Oct 3, 2026'." },
      { key: "description", label: "Description", type: "textarea", rows: 3 },
      RELATED, PRIVATE,
    ],
    columns: ["dueDate", "dueTime", "title", "kind", "location", "priority", "status", "completedDate", "deadlineSource", "description"],
  },
  attorney: {
    label: "Attorney Consultation", short: "Attorney", plural: "Attorney Workspace", prefix: "ATT", area: "home", icon: "briefcase",
    dateField: "consultDate", timeField: "consultTime", titleField: "name",
    intro: "Prepare for consultations and record what you were told. Your notes are your understanding, not legal advice.",
    fields: [
      { key: "name", label: "Attorney name", type: "text", required: true },
      { key: "firm", label: "Firm", type: "text" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Address", type: "text" },
      { key: "consultDate", label: "Consultation date", type: "date" },
      { key: "consultTime", label: "Time", type: "time" },
      { key: "fees", label: "Fee information", type: "textarea", rows: 2, help: "Consultation fee, retainer, hourly rate, payment plans." },
      { key: "questions", label: "Questions to ask", type: "textarea", rows: 5 },
      { key: "documentsRequested", label: "Documents requested", type: "textarea", rows: 2 },
      { key: "advice", label: "Advice as I understood it", type: "textarea", rows: 4 },
      { key: "followUp", label: "Follow-up actions", type: "textarea", rows: 2 },
      { key: "representation", label: "Representation status", type: "select", options: ["Researching", "Consultation scheduled", "Consulted", "Retained", "Limited-scope help", "Not retained"] },
      RELATED, PRIVATE,
    ],
    columns: ["consultDate", "name", "firm", "phone", "email", "fees", "questions", "documentsRequested", "advice", "followUp", "representation"],
  },
  expense: {
    label: "Expense or Financial Record", short: "Expense", plural: "Expenses", prefix: "EXP", area: "document", icon: "wallet",
    dateField: "date", titleField: "description",
    intro: "Track child-related expenses, support payments, and case costs.",
    fields: [
      { key: "date", label: "Date", type: "date", required: true, defaultToday: true },
      { key: "amount", label: "Amount (USD)", type: "money", required: true },
      { key: "category", label: "Category", type: "select", options: ["Child expenses", "Child support paid", "Child support received", "Medical", "School", "Childcare", "Activities", "Legal fees", "Court fees", "Parenting class", "Other"] },
      { key: "description", label: "Description", type: "text", required: true },
      { key: "paidTo", label: "Paid to", type: "text" },
      { key: "paidBy", label: "Paid by", type: "select", options: ["Me", "Other parent", "Shared", "Other"] },
      { key: "children", label: "Children", type: "children", child: true },
      ATTACH, RELATED, PRIVATE,
    ],
    columns: ["date", "amount", "category", "description", "paidTo", "paidBy", "children"],
  },
};

export const TYPE_ORDER = ["incident", "communication", "parenting", "childStatement", "police", "residence", "evidence", "expense", "task", "attorney", "child"];

export function fieldDef(type, key) {
  return TYPES[type]?.fields.find((f) => f.key === key);
}

export function recordDate(r) {
  const t = TYPES[r.type];
  return (t?.dateField && r.data?.[t.dateField]) || (r.createdAt || "").slice(0, 10);
}
export function recordTime(r) {
  const t = TYPES[r.type];
  return (t?.timeField && r.data?.[t.timeField]) || "";
}

export function recordTitle(r, ctx = {}) {
  const t = TYPES[r.type]; const d = r.data || {};
  if (!t) return r.ref || r.id;
  if (r.type === "parenting") {
    const kids = (d.children || []).map((id) => ctx.childName?.(id)).filter(Boolean).join(", ");
    return `${d.entryType || "Parenting time"}${kids ? ` – ${kids}` : ""}`;
  }
  if (r.type === "childStatement") { const st = String(d.statement || "").replace(/^["“”']+|["“”']+$/g, ""); return `Statement: “${st.slice(0, 60)}${st.length > 60 ? "…" : ""}”`; }
  if (r.type === "police") return `${d.agency || "Official contact"}${d.contactType ? ` – ${d.contactType}` : ""}`;
  if (r.type === "communication") return `${d.method || "Communication"}: ${d.subject || ""}`;
  if (r.type === "expense") return `${d.description || "Expense"}${d.amount != null && d.amount !== "" ? ` – $${Number(d.amount).toFixed(2)}` : ""}`;
  if (r.type === "attorney") return `${d.name || "Attorney"}${d.firm ? ` (${d.firm})` : ""}`;
  return d[t.titleField] || t.label;
}

export function isOpen(r) {
  const t = TYPES[r.type]; const d = r.data || {};
  if (r.type === "task") return !["Done", "Cancelled"].includes(d.status || "Not started");
  if (t?.statusField) return (d[t.statusField] || "Open") === "Open";
  return false;
}

export function hasEvidence(r) {
  if (r.type === "evidence") return true;
  return (r.data?.attachments || []).length > 0;
}

// Render a field value as plain text for detail views, CSV, and reports.
export function valueText(field, value, ctx = {}) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return "";
  switch (field.type) {
    case "date": return fmtDate(value);
    case "time": return fmtTime(value);
    case "money": return isNaN(Number(value)) ? String(value) : `$${Number(value).toFixed(2)}`;
    case "people": case "multiselect": return [].concat(value).join(", ");
    case "children": return [].concat(value).map((id) => ctx.childName?.(id) || "(child)").join(", ");
    case "records": case "evidence": return [].concat(value).map((id) => ctx.refOf?.(id) || id).join(", ");
    case "file": return value?.name || "";
    case "checkbox": return value ? "Yes" : "No";
    default: return String(value);
  }
}

export function childDisplayName(child, initialsOnly = false) {
  const name = child?.data?.name || "Child";
  if (!initialsOnly) return name;
  return name.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + ".").join("");
}

export function childAge(child) { return ageFrom(child?.data?.dob); }

// Parenting-time classification used by the overview and reports.
export function ptCategory(r) {
  const d = r.data || {}; const t = d.entryType || ""; const o = d.outcome || "";
  if (/Denied/.test(t) || /Denied|Disputed/.test(o)) return "denied";
  if (/Cancellation/.test(t) || /Cancelled/.test(o)) return "cancelled";
  if (/Missed/.test(t)) return "missed";
  if (/Requested/.test(t)) return o === "No response" ? "unanswered" : "requested";
  if (/Scheduled/.test(t)) return "scheduled";
  if (/Completed|Overnight/.test(t) || /Completed as planned|Partially/.test(o)) return "completed";
  return "activity";
}

export function ptHours(r) {
  const d = r.data || {};
  if (!d.date || !d.startTime || !d.endTime) return 0;
  const start = new Date(`${d.date}T${d.startTime}`);
  const end = new Date(`${d.endDate || d.date}T${d.endTime}`);
  const h = (end - start) / 3600000;
  return h > 0 && h < 24 * 31 ? h : 0;
}
