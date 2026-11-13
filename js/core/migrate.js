// Import adapters for earlier planner data and other files.
//
// The original planner source files were not available when this version was built, so the
// legacy adapter does not assume one exact structure. It recognizes common shapes (arrays of
// entries with date/description-like fields, grouped by collection names), shows a preview,
// preserves every original field verbatim in `data.legacy`, keeps original ids and creation
// dates, and fingerprints each item so the same data is never imported twice.

import * as vault from "./vault.js";
import * as cc from "./crypto.js";
import { b64ToBytes, parseCSV, nowISO } from "./util.js";
import { TYPES } from "./schema.js";

const COLLECTION_HINTS = [
  [/incident|event|journal|log(?!in)|entr(y|ies)|note/i, "incident"],
  [/comm|message|text|call|email|contact log/i, "communication"],
  [/parent|visit|custody|overnight|exchange|schedule/i, "parenting"],
  [/child|kid/i, "child"],
  [/police|officer|report/i, "police"],
  [/evidence|attachment|file|photo|document/i, "evidence"],
  [/task|todo|deadline|appointment|calendar|hearing|court date/i, "task"],
  [/attorney|lawyer|consult/i, "attorney"],
  [/expense|payment|support|cost|money/i, "expense"],
  [/residence|property|key|lease|house|home/i, "residence"],
];

const DATE_KEYS = ["date", "eventDate", "incidentDate", "occurredOn", "occurred", "when", "day", "dueDate", "due", "start", "startDate", "timestamp", "datetime", "dateTime"];
const TEXT_KEYS = ["description", "details", "detail", "notes", "note", "summary", "text", "content", "body", "narrative", "what", "message"];
const TITLE_KEYS = ["title", "subject", "name", "heading", "label", "summary"];

function pick(obj, keys) {
  for (const k of keys) {
    const hit = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase());
    if (hit && obj[hit] != null && obj[hit] !== "") return obj[hit];
  }
  return undefined;
}

function normDate(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") { const d = new Date(v > 1e12 ? v : v * 1000); return isNaN(d) ? "" : d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  const d = new Date(s); return isNaN(d) ? "" : d.toISOString().slice(0, 10);
}
function normTime(v) {
  if (!v) return "";
  const s = String(v); const m = s.match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
  if (!m) return "";
  let h = Number(m[1]); if (m[3]) { const pm = /p/i.test(m[3]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function guessTypeFromItem(item, collectionName) {
  const explicit = String(item.type || item.recordType || item.kind || item.category || "").toLowerCase();
  for (const [re, t] of COLLECTION_HINTS) if (re.test(explicit)) return t;
  for (const [re, t] of COLLECTION_HINTS) if (re.test(collectionName || "")) return t;
  return "incident";
}

// Find arrays of plain objects anywhere in the structure (depth-limited).
function findCollections(node, path = "", out = [], depth = 0) {
  if (depth > 4 || node == null) return out;
  if (Array.isArray(node)) {
    if (node.length && node.every((x) => x && typeof x === "object" && !Array.isArray(x))) out.push({ path: path || "(root)", items: node });
    return out;
  }
  if (typeof node === "object") for (const [k, v] of Object.entries(node)) findCollections(v, path ? `${path}.${k}` : k, out, depth + 1);
  return out;
}

export function looksEncryptedLegacy(obj) {
  if (!obj || typeof obj !== "object") return false;
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  return (keys.includes("ciphertext") || keys.includes("data") || keys.includes("ct")) && keys.includes("iv") && keys.includes("salt");
}

// Best-effort decryption of a legacy encrypted export that used PBKDF2 + AES-GCM with base64 fields.
export async function tryDecryptLegacy(obj, passphrase) {
  const salt = b64ToBytes(obj.salt || obj.Salt);
  const iv = b64ToBytes(obj.iv || obj.IV);
  const ct = b64ToBytes(obj.ciphertext || obj.data || obj.ct);
  const iterationsList = [obj.iterations, 600000, 310000, 250000, 210000, 200000, 150000, 100000].filter(Boolean);
  const hashes = [obj.hash, "SHA-256", "SHA-512"].filter(Boolean);
  for (const iterations of [...new Set(iterationsList)]) for (const hash of [...new Set(hashes)]) {
    try {
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
      return JSON.parse(new TextDecoder().decode(pt));
    } catch { /* try next parameter set */ }
  }
  throw new Error("LEGACY_DECRYPT_FAILED");
}

async function fingerprint(item) { return cc.sha256Hex(new TextEncoder().encode(JSON.stringify(item))); }

// Build an import plan (no writes). Returns { items:[{type, data, originalId, originalCreated, fingerprint, duplicate, source}], problems }
export async function planLegacyImport(obj, sourceName = "earlier planner") {
  const problems = [];
  const cols = findCollections(obj);
  if (!cols.length) return { items: [], problems: ["No lists of entries were found in this file. If it came from an earlier planner, export it as JSON and try again."] };
  const seen = new Set(vault.getKV("importFingerprints", []));
  const items = [];
  for (const col of cols) {
    for (const raw of col.items) {
      const type = guessTypeFromItem(raw, col.path);
      const date = normDate(pick(raw, DATE_KEYS));
      const time = normTime(pick(raw, ["time", "startTime", ...DATE_KEYS]));
      const text = pick(raw, TEXT_KEYS);
      const title = pick(raw, TITLE_KEYS);
      const data = { legacy: JSON.stringify(raw, null, 1) };
      const tdef = TYPES[type];
      if (tdef.dateField) data[tdef.dateField] = date;
      if (tdef.timeField && time) data[tdef.timeField] = time;
      if (type === "incident") { data.title = String(title || text || "Imported entry").slice(0, 120); data.description = String(text || title || ""); data.status = "Open"; }
      else if (type === "communication") { data.subject = String(title || "Imported communication").slice(0, 120); data.content = String(text || ""); data.method = pick(raw, ["method", "channel", "medium"]) || "Other"; data.status = "Open"; }
      else if (type === "parenting") { data.entryType = "Completed parenting time"; data.activities = String(text || title || ""); }
      else if (type === "child") { data.name = String(pick(raw, ["name", "firstName", "initials"]) || "Child"); data.dob = normDate(pick(raw, ["dob", "birthdate", "birthday", "dateOfBirth"])); data.school = pick(raw, ["school"]) || ""; }
      else if (type === "police") { data.agency = String(pick(raw, ["agency", "department"]) || "Unknown agency"); data.caseNumber = pick(raw, ["caseNumber", "case", "case_no"]) || ""; data.reportNumber = pick(raw, ["reportNumber", "report"]) || ""; data.summary = String(text || ""); data.status = "Open"; }
      else if (type === "task") { data.title = String(title || text || "Imported task").slice(0, 120); data.kind = "Personal action item"; data.description = String(text || ""); data.status = raw.done || raw.completed ? "Done" : "Not started"; if (!data.dueDate) data.dueDate = date || nowISO().slice(0, 10); }
      else if (type === "attorney") { data.name = String(pick(raw, ["name", "attorney"]) || "Attorney"); data.firm = pick(raw, ["firm"]) || ""; data.questions = String(text || ""); }
      else if (type === "expense") { data.description = String(title || text || "Imported expense").slice(0, 120); data.amount = Number(pick(raw, ["amount", "cost", "total"]) || 0); }
      else if (type === "residence") { data.entryType = "Other"; data.title = String(title || "Imported residence record").slice(0, 120); data.details = String(text || ""); data.status = "Open"; }
      else if (type === "evidence") { data.title = String(title || pick(raw, ["fileName", "filename"]) || "Imported evidence reference"); data.evidenceType = "External original (not stored here)"; data.storageLocation = String(pick(raw, ["location", "path", "url"]) || "Referenced in earlier planner; original not included in import"); data.notes = String(text || ""); }
      const fp = await fingerprint(raw);
      const missingRequired = (tdef.fields || []).filter((f) => f.required && (data[f.key] == null || data[f.key] === "")).map((f) => f.label);
      if (missingRequired.length) problems.push(`An entry in "${col.path}" is missing ${missingRequired.join(", ")}; it will be imported with blanks you can fill in.`);
      items.push({
        type, data, fingerprint: fp, duplicate: seen.has(fp), source: `${sourceName} › ${col.path}`,
        originalId: raw.id != null ? String(raw.id) : null,
        originalCreated: pick(raw, ["createdAt", "created", "entered", "dateEntered", "timestamp"]) || null,
      });
    }
  }
  return { items, problems: [...new Set(problems)].slice(0, 20) };
}

export async function applyImportPlan(plan, sourceLabel) {
  const toImport = plan.items.filter((x) => !x.duplicate);
  if (!toImport.length) return { imported: 0, skipped: plan.items.length };
  await vault.createRestorePoint(`Before importing from ${sourceLabel}`);
  const fps = new Set(vault.getKV("importFingerprints", []));
  let imported = 0; const problems = [];
  for (const it of toImport) {
    try {
      const createdIso = it.originalCreated && !isNaN(new Date(it.originalCreated)) ? new Date(it.originalCreated).toISOString() : undefined;
      await vault.saveRecord({
        type: it.type, data: it.data, createdAt: createdIso,
        ref: it.originalId && /^[A-Z]{2,4}-\d{1,6}$/.test(it.originalId) ? it.originalId : undefined,
        importedFrom: { source: it.source, originalId: it.originalId, originalCreated: it.originalCreated, importedAt: nowISO() },
      }, { action: "import", summary: `Imported from ${sourceLabel}` });
      fps.add(it.fingerprint); imported++;
    } catch (e) { problems.push(e.message); }
  }
  await vault.setKV("importFingerprints", [...fps]);
  await vault.audit("import", { summary: `Imported ${imported} records from ${sourceLabel}` });
  return { imported, skipped: plan.items.length - toImport.length, problems };
}

// CSV import into a chosen record type, mapping headers to field keys by name similarity.
export function planCSV(text, type) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { items: [], problems: ["The CSV file needs a header row and at least one data row."], mapping: {} };
  const header = rows[0].map((h) => h.trim());
  const fields = TYPES[type].fields;
  const mapping = {};
  header.forEach((h, i) => {
    const norm = h.toLowerCase().replace(/[^a-z]/g, "");
    const f = fields.find((x) => x.key.toLowerCase() === norm || x.label.toLowerCase().replace(/[^a-z]/g, "") === norm)
      || (/date/.test(norm) && fields.find((x) => x.type === "date"))
      || (/desc|detail|note|summary/.test(norm) && fields.find((x) => x.type === "textarea"));
    if (f && !Object.values(mapping).includes(f.key)) mapping[i] = f.key;
  });
  const items = rows.slice(1).map((r) => {
    const data = {}; const raw = {};
    header.forEach((h, i) => { raw[h] = r[i] ?? ""; const k = mapping[i]; if (!k) return; const f = fields.find((x) => x.key === k);
      let v = r[i] ?? ""; if (f.type === "date") v = normDate(v); else if (f.type === "time") v = normTime(v);
      else if (f.type === "people") v = v ? v.split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [];
      else if (f.type === "number" || f.type === "money") v = v === "" ? "" : Number(String(v).replace(/[$,]/g, ""));
      data[k] = v; });
    data.legacy = JSON.stringify(raw, null, 1);
    return { type, data, raw };
  });
  return { items, mapping: Object.fromEntries(Object.entries(mapping).map(([i, k]) => [header[i], k])), problems: header.filter((h, i) => !mapping[i]).map((h) => `Column "${h}" was not matched; it is kept in the record's original-data note.`) };
}

export async function planCSVImport(text, type, sourceName) {
  const p = planCSV(text, type);
  const seen = new Set(vault.getKV("importFingerprints", []));
  const items = [];
  for (const it of p.items) {
    const fp = await fingerprint({ type, ...it.raw });
    items.push({ type, data: it.data, fingerprint: fp, duplicate: seen.has(fp), source: sourceName, originalId: null, originalCreated: null });
  }
  return { items, problems: p.problems, mapping: p.mapping };
}

// Look for earlier planner data saved by a planner page on this same web address.
export function scanLocalStorage() {
  const found = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (/^case-compass/.test(key)) continue;
      const val = localStorage.getItem(key);
      if (!val || val.length < 20 || !/^[[{]/.test(val.trim())) continue;
      try {
        const obj = JSON.parse(val);
        const cols = findCollections(obj);
        const n = cols.reduce((s, c) => s + c.items.length, 0);
        if (n) found.push({ key, entries: n, obj });
      } catch { /* not JSON */ }
    }
  } catch { /* storage unavailable */ }
  return found;
}
