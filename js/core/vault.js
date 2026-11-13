// Encrypted vault: the only module that reads or writes private data.
// Every value written to IndexedDB is AES-GCM ciphertext except the vault header (KDF salt,
// iteration count, wrapped key) and minimal structural ids. Decrypted records live only in memory
// while unlocked and are cleared on lock.

import * as db from "./db.js";
import * as cc from "./crypto.js";
import { uuid, nowISO, APP_VERSION, DATA_SCHEMA_VERSION, bytesToB64 } from "./util.js";
import { TYPES } from "./schema.js";

const state = {
  key: null,
  records: new Map(),
  kv: new Map(),
  corrupt: [],
  listeners: new Set(),
};

export const DEFAULT_SETTINGS = {
  theme: "dark", idleMinutes: 5, lockOnHide: false, preparedBy: "", caseCaption: "",
  defaultTz: "America/Denver", quickExitUrl: "https://weather.gov/", orientationDismissed: false,
};

// ───────── events ─────────
export function onChange(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); }
function emit(kind, detail) { state.listeners.forEach((fn) => { try { fn(kind, detail); } catch (e) { console.error(e); } }); }

// ───────── header & lifecycle ─────────
export async function getHeader() { return db.get("meta", "vault"); }
export async function vaultExists() { return !!(await getHeader()); }
export const isUnlocked = () => !!state.key;
export const corruptItems = () => [...state.corrupt];

async function encItem(id, obj, aadPrefix, extra = {}) {
  const { iv, ct } = await cc.encryptJSON(state.key, obj, `${aadPrefix}:${id}`);
  return { id, iv, ct, ...extra };
}
async function decItem(item, aadPrefix) {
  return cc.decryptJSON(state.key, item.iv, item.ct, `${aadPrefix}:${item.id}`);
}

export async function createVault(passphrase, { iterations = cc.KDF_ITERATIONS } = {}) {
  if (await vaultExists()) throw new Error("VAULT_EXISTS");
  const salt = cc.randomBytes(16);
  const kek = await cc.deriveKEK(passphrase, salt, iterations);
  const dek = await cc.generateDEK();
  const wrapped = await cc.wrapDEK(dek, kek);
  const header = {
    id: "vault", format: "case-compass-vault", schema: DATA_SCHEMA_VERSION, appVersion: APP_VERSION,
    created: nowISO(), kdf: { name: "PBKDF2", hash: cc.KDF_HASH, iterations, salt: bytesToB64(salt) }, wrapped,
  };
  await db.put("meta", header);
  state.key = await cc.unwrapDEK(wrapped, kek, false);
  state.records.clear(); state.kv.clear(); state.corrupt = [];
  await setKV("settings", { ...DEFAULT_SETTINGS });
  await setKV("counters", {});
  await audit("vault-created", { summary: "Vault created" });
  emit("unlock");
  return true;
}

export async function unlock(passphrase) {
  const header = await getHeader();
  if (!header) throw new Error("NO_VAULT");
  const salt = Uint8Array.from(atob(header.kdf.salt), (c) => c.charCodeAt(0));
  const kek = await cc.deriveKEK(passphrase, salt, header.kdf.iterations);
  let key;
  try { key = await cc.unwrapDEK(header.wrapped, kek, false); }
  catch { throw new Error("WRONG_PASSPHRASE"); }
  state.key = key;
  await loadAll();
  emit("unlock");
  return true;
}

async function loadAll() {
  state.records.clear(); state.kv.clear(); state.corrupt = [];
  const [recs, kvs] = await Promise.all([db.getAll("records"), db.getAll("kv")]);
  for (const item of recs) {
    try { const r = await decItem(item, "record"); state.records.set(r.id, r); }
    catch { state.corrupt.push({ store: "records", id: item.id }); }
  }
  for (const item of kvs) {
    try { state.kv.set(item.id, await decItem(item, "kv")); }
    catch { state.corrupt.push({ store: "kv", id: item.id }); }
  }
}

export function lock() {
  state.key = null;
  state.records.clear(); state.kv.clear(); state.corrupt = [];
  emit("lock");
}

export async function verifyPassphrase(passphrase) {
  const header = await getHeader();
  const salt = Uint8Array.from(atob(header.kdf.salt), (c) => c.charCodeAt(0));
  try { await cc.unwrapDEK(header.wrapped, await cc.deriveKEK(passphrase, salt, header.kdf.iterations)); return true; }
  catch { return false; }
}

export async function changePassphrase(oldPass, newPass) {
  const header = await getHeader();
  const salt = Uint8Array.from(atob(header.kdf.salt), (c) => c.charCodeAt(0));
  let dek;
  try { dek = await cc.unwrapDEK(header.wrapped, await cc.deriveKEK(oldPass, salt, header.kdf.iterations), true); }
  catch { throw new Error("WRONG_PASSPHRASE"); }
  const newSalt = cc.randomBytes(16);
  const kek2 = await cc.deriveKEK(newPass, newSalt, cc.KDF_ITERATIONS);
  const wrapped = await cc.wrapDEK(dek, kek2);
  await db.put("meta", { ...header, kdf: { ...header.kdf, iterations: cc.KDF_ITERATIONS, salt: bytesToB64(newSalt) }, wrapped, passphraseChanged: nowISO() });
  await audit("passphrase-changed", { summary: "Passphrase changed" });
}

export async function destroyVault() {
  lock();
  await db.deleteDatabase();
}

// ───────── key-value (settings, counters, checklist state, backup log) ─────────
export function getKV(name, fallback = null) {
  return state.kv.has(name) ? structuredClone(state.kv.get(name)) : structuredClone(fallback);
}
export async function setKV(name, value) {
  requireKey();
  await db.put("kv", await encItem(name, value, "kv"));
  state.kv.set(name, structuredClone(value));
  emit("kv", name);
}
export function settings() { return { ...DEFAULT_SETTINGS, ...(getKV("settings", {}) || {}) }; }
export async function updateSettings(patch) { await setKV("settings", { ...settings(), ...patch }); }

function requireKey() { if (!state.key) throw new Error("VAULT_LOCKED"); }

// ───────── records ─────────
export function listRecords({ type, includeDeleted = false } = {}) {
  const out = [];
  for (const r of state.records.values()) {
    if (!includeDeleted && r.deleted) continue;
    if (type && (Array.isArray(type) ? !type.includes(r.type) : r.type !== type)) continue;
    out.push(r);
  }
  return out;
}
export function getRecord(id) { return state.records.get(id) || null; }
export function findByRef(ref) { for (const r of state.records.values()) if (r.ref === ref) return r; return null; }
export function recordCount() { return listRecords().length; }

function allRefs() { return new Set([...state.records.values()].map((r) => r.ref)); }

function nextRef(type, counters) {
  const prefix = TYPES[type]?.prefix || "REC";
  const refs = allRefs();
  let n = counters[prefix] || 0, ref;
  do { n++; ref = `${prefix}-${String(n).padStart(4, "0")}`; } while (refs.has(ref));
  counters[prefix] = n;
  return ref;
}

// Save (create or update). Updating writes the previous version to revision history first, in
// the same transaction, so an edit can never erase an earlier version.
export async function saveRecord(input, { summary, action } = {}) {
  requireKey();
  const now = nowISO();
  const existing = input.id ? state.records.get(input.id) : null;
  const ops = [];
  let rec;
  let counters = null;
  if (existing) {
    rec = { ...existing, data: structuredClone(input.data), updatedAt: now, version: (existing.version || 1) + 1 };
    if ("deleted" in input) rec.deleted = input.deleted;
    const revId = uuid();
    ops.push({ store: "revisions", value: await encItem(revId, { id: revId, recordId: existing.id, savedAt: now, snapshot: existing }, "revision", { recordId: existing.id }) });
  } else {
    counters = getKV("counters", {});
    rec = {
      id: input.id || uuid(), ref: input.ref && !allRefs().has(input.ref) ? input.ref : nextRef(input.type, counters),
      type: input.type, createdAt: input.createdAt || now, updatedAt: now, version: 1,
      data: structuredClone(input.data || {}), deleted: false,
      ...(input.importedFrom ? { importedFrom: input.importedFrom } : {}),
    };
    ops.push({ store: "kv", value: await encItem("counters", counters, "kv") });
  }
  ops.push({ store: "records", value: await encItem(rec.id, rec, "record") });
  const auditEntry = makeAudit(action || (existing ? "update" : "create"), { recordId: rec.id, ref: rec.ref, type: rec.type, summary: summary || "" });
  ops.push({ store: "audit", value: await encItem(auditEntry.id, auditEntry, "audit") });
  try { await db.batch(ops); }
  catch (e) { if (db.isQuotaError(e)) throw new Error("STORAGE_FULL"); throw e; }
  state.records.set(rec.id, rec);
  if (counters) state.kv.set("counters", counters);
  emit("records", rec.id);
  return rec;
}

export async function deleteRecord(id) {
  const r = getRecord(id); if (!r) return;
  return saveRecord({ ...r, deleted: true, data: r.data }, { action: "delete", summary: "Moved to Trash" });
}
export async function restoreRecord(id) {
  const r = getRecord(id); if (!r) return;
  return saveRecord({ ...r, deleted: false, data: r.data }, { action: "restore", summary: "Restored from Trash" });
}

// Permanent deletion (from Trash only). Removes revisions; removes the attachment blob only when
// no other evidence record references it.
export async function purgeRecord(id) {
  requireKey();
  const r = getRecord(id); if (!r) return;
  const revs = await db.getAllByIndex("revisions", "recordId", id);
  const ops = revs.map((x) => ({ store: "revisions", delete: x.id }));
  ops.push({ store: "records", delete: id });
  const blobId = r.type === "evidence" ? r.data?.file?.blobId : null;
  if (blobId && !listRecords({ includeDeleted: true }).some((o) => o.id !== id && o.data?.file?.blobId === blobId)) {
    ops.push({ store: "blobs", delete: blobId });
  }
  const a = makeAudit("purge", { recordId: id, ref: r.ref, type: r.type, summary: "Permanently deleted" });
  ops.push({ store: "audit", value: await encItem(a.id, a, "audit") });
  await db.batch(ops);
  state.records.delete(id);
  emit("records", id);
}

export async function listRevisions(recordId) {
  requireKey();
  const items = await db.getAllByIndex("revisions", "recordId", recordId);
  const out = [];
  for (const it of items) { try { out.push(await decItem(it, "revision")); } catch { out.push({ id: it.id, corrupt: true }); } }
  return out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

// Records that link to `id` (related, attachments, derivedFrom). Links are stored on one side and
// resolved in both directions here, so linking never duplicates a file or rewrites the other record.
export function backlinks(id) {
  const out = [];
  for (const r of state.records.values()) {
    if (r.deleted || r.id === id) continue;
    const d = r.data || {};
    if ([...(d.related || []), ...(d.attachments || []), ...(d.derivedFrom || [])].includes(id)) out.push(r);
  }
  return out;
}

export function linkedIds(r) {
  const d = r?.data || {};
  return [...new Set([...(d.related || []), ...(d.attachments || []), ...(d.derivedFrom || [])])];
}

// ───────── attachments (encrypted blobs) ─────────
export async function putBlob(bytes, id = uuid()) {
  requireKey();
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const { iv, ct } = await cc.encryptBytes(state.key, u8, `blob:${id}`);
  try { await db.put("blobs", { id, iv, ct, size: u8.byteLength }); }
  catch (e) { if (db.isQuotaError(e)) throw new Error("STORAGE_FULL"); throw e; }
  return id;
}
export async function getBlob(id) {
  requireKey();
  const item = await db.get("blobs", id);
  if (!item) throw new Error("BLOB_MISSING");
  return cc.decryptBytes(state.key, item.iv, item.ct, `blob:${id}`);
}
export async function hasBlob(id) { return !!(await db.get("blobs", id)); }

// Add an original file as a new evidence record. The bytes are stored unchanged.
export async function addEvidenceFile(file, extra = {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await cc.sha256Hex(bytes);
  const dup = listRecords({ type: "evidence" }).find((r) => r.data?.file?.sha256 === sha256);
  const blobId = dup ? dup.data.file.blobId : await putBlob(bytes);
  const rec = await saveRecord({
    type: "evidence",
    data: {
      title: extra.title || file.name, evidenceType: extra.evidenceType || guessEvidenceType(file),
      file: { blobId, name: file.name, type: file.type || "application/octet-stream", size: bytes.byteLength, sha256, lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null, addedAt: nowISO() },
      dateCreated: extra.dateCreated || (file.lastModified ? new Date(file.lastModified).toISOString().slice(0, 10) : ""),
      storageLocation: "In Case Compass (encrypted)", backupStatus: "Not backed up",
      source: extra.source || "", related: extra.related || [], notes: extra.notes || "",
    },
  }, { summary: `File added: ${file.name} (SHA-256 ${sha256.slice(0, 12)}…)` });
  return { rec, duplicateOf: dup || null };
}

export function guessEvidenceType(file) {
  const t = file.type || "";
  if (t.startsWith("image/")) return /screenshot|screen shot/i.test(file.name) ? "Screenshot" : "Photo";
  if (t === "application/pdf") return "PDF";
  if (t.startsWith("audio/")) return "Audio";
  if (t.startsWith("video/")) return "Video";
  if (/message\/rfc822|\.eml$/i.test(t + file.name)) return "Email";
  return "Document";
}

export async function verifyEvidence(rec) {
  const f = rec.data?.file; if (!f?.blobId) return { ok: false, reason: "No stored file" };
  const bytes = await getBlob(f.blobId);
  const now = await cc.sha256Hex(bytes);
  return { ok: now === f.sha256, expected: f.sha256, actual: now, size: bytes.byteLength };
}

// ───────── drafts (encrypted autosave for interrupted edits) ─────────
export async function saveDraft(key, payload) {
  if (!state.key) return;
  await db.put("drafts", await encItem(key, { key, savedAt: nowISO(), payload }, "draft"));
}
export async function getDraft(key) {
  if (!state.key) return null;
  const item = await db.get("drafts", key); if (!item) return null;
  try { return await decItem(item, "draft"); } catch { return null; }
}
export async function clearDraft(key) { await db.del("drafts", key); }
export async function listDrafts() {
  if (!state.key) return [];
  const items = await db.getAll("drafts"); const out = [];
  for (const it of items) { try { out.push(await decItem(it, "draft")); } catch { /* skip */ } }
  return out;
}

// ───────── audit history ─────────
function makeAudit(action, detail = {}) { return { id: uuid(), at: nowISO(), action, ...detail }; }
export async function audit(action, detail = {}) {
  if (!state.key) return;
  const a = makeAudit(action, detail);
  await db.put("audit", await encItem(a.id, a, "audit"));
}
export async function listAudit() {
  requireKey();
  const items = await db.getAll("audit"); const out = [];
  for (const it of items) { try { out.push(await decItem(it, "audit")); } catch { /* skip */ } }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

// ───────── restore points (record + settings snapshots before risky operations) ─────────
export async function createRestorePoint(label) {
  requireKey();
  const id = uuid();
  const snapshot = { label, created: nowISO(), records: listRecords({ includeDeleted: true }), kv: Object.fromEntries(state.kv) };
  await db.put("restorePoints", await encItem(id, snapshot, "restore", { created: snapshot.created }));
  const all = (await db.getAll("restorePoints")).sort((a, b) => (a.created < b.created ? 1 : -1));
  for (const old of all.slice(8)) await db.del("restorePoints", old.id);
  return id;
}
export async function listRestorePoints() {
  requireKey();
  const items = await db.getAll("restorePoints"); const out = [];
  for (const it of items) {
    try { const s = await decItem(it, "restore"); out.push({ id: it.id, label: s.label, created: s.created, count: s.records.length }); }
    catch { out.push({ id: it.id, created: it.created, label: "(unreadable)", count: 0 }); }
  }
  return out.sort((a, b) => (a.created < b.created ? 1 : -1));
}
export async function rollbackTo(id) {
  requireKey();
  const item = await db.get("restorePoints", id); if (!item) throw new Error("NOT_FOUND");
  const snap = await decItem(item, "restore");
  await createRestorePoint("Before rolling back to an earlier restore point");
  const ops = [];
  for (const r of state.records.values()) ops.push({ store: "records", delete: r.id });
  for (const r of snap.records) ops.push({ store: "records", value: await encItem(r.id, r, "record") });
  for (const [k, v] of Object.entries(snap.kv)) ops.push({ store: "kv", value: await encItem(k, v, "kv") });
  const a = makeAudit("rollback", { summary: `Rolled back to restore point from ${snap.created}` });
  ops.push({ store: "audit", value: await encItem(a.id, a, "audit") });
  await db.batch(ops);
  await loadAll();
  emit("records");
}

// ───────── raw import/export primitives (used by backup & migration) ─────────
export async function exportEverything({ includeBlobs = true } = {}) {
  requireKey();
  const records = listRecords({ includeDeleted: true });
  const revisions = []; for (const it of await db.getAll("revisions")) { try { revisions.push(await decItem(it, "revision")); } catch { /* skip */ } }
  const auditLog = await listAudit();
  const kv = Object.fromEntries(state.kv);
  const blobs = [];
  if (includeBlobs) {
    const ids = new Set(records.map((r) => r.data?.file?.blobId).filter(Boolean));
    for (const id of ids) { try { blobs.push({ id, bytes: await getBlob(id) }); } catch { blobs.push({ id, missing: true }); } }
  }
  return { records, revisions, audit: auditLog, kv, blobs };
}

export async function putRecordRaw(rec) {
  requireKey();
  await db.put("records", await encItem(rec.id, rec, "record"));
  state.records.set(rec.id, rec);
}
export async function putRevisionRaw(rev) {
  requireKey();
  await db.put("revisions", await encItem(rev.id, rev, "revision", { recordId: rev.recordId }));
}
export async function putAuditRaw(a) { requireKey(); await db.put("audit", await encItem(a.id, a, "audit")); }
export function notify(kind) { emit(kind || "records"); }

export async function storageEstimate() {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.();
    return { usage: est?.usage ?? null, quota: est?.quota ?? null, persisted: !!persisted };
  } catch { return { usage: null, quota: null, persisted: false }; }
}
export async function requestPersistence() {
  try { return !!(await navigator.storage?.persist?.()); } catch { return false; }
}
