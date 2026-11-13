// Encrypted backup, verification, and restore (clean install or non-destructive merge).
//
// Backup file (.ccbackup) is JSON:
//   { format:"case-compass-backup", version:1, created, encryption:{kdf,hash,iterations,salt,cipher,iv},
//     ciphertextSha256, ciphertext }
// The ciphertext holds every record (including Trash), revision history, audit log, settings,
// checklist progress, and attachments (each with its SHA-256 for integrity checking).

import * as cc from "./crypto.js";
import * as vault from "./vault.js";
import { bytesToB64, b64ToBytes, nowISO, APP_VERSION, DATA_SCHEMA_VERSION } from "./util.js";

export const BACKUP_FORMAT = "case-compass-backup";

export async function createBackup(passphrase) {
  const all = await vault.exportEverything({ includeBlobs: true });
  const blobs = [];
  for (const b of all.blobs) {
    if (b.missing) { blobs.push({ id: b.id, missing: true }); continue; }
    blobs.push({ id: b.id, sha256: await cc.sha256Hex(b.bytes), size: b.bytes.byteLength, b64: bytesToB64(b.bytes) });
  }
  const payload = {
    app: "Case Compass", appVersion: APP_VERSION, schema: DATA_SCHEMA_VERSION, created: nowISO(),
    records: all.records, revisions: all.revisions, audit: all.audit, kv: all.kv, blobs,
    manifest: { records: all.records.length, revisions: all.revisions.length, blobs: blobs.length },
  };
  const salt = cc.randomBytes(16);
  const key = await deriveBackupKey(passphrase, salt, cc.KDF_ITERATIONS);
  const { iv, ct } = await cc.encryptBytes(key, new TextEncoder().encode(JSON.stringify(payload)), BACKUP_FORMAT);
  const file = {
    format: BACKUP_FORMAT, version: 1, created: payload.created,
    encryption: { kdf: "PBKDF2", hash: "SHA-256", iterations: cc.KDF_ITERATIONS, salt: bytesToB64(salt), cipher: "AES-256-GCM", iv: bytesToB64(iv) },
    ciphertextSha256: await cc.sha256Hex(ct),
    ciphertext: bytesToB64(ct),
  };
  const text = JSON.stringify(file);
  // Verify before handing the file to the user: decrypt it again and check every attachment hash.
  const check = await verifyBackupText(text, passphrase);
  if (!check.ok) throw new Error("BACKUP_SELF_CHECK_FAILED: " + check.problems.join("; "));
  return { text, manifest: payload.manifest, created: payload.created, sha256: file.ciphertextSha256, verified: true };
}

async function deriveBackupKey(passphrase, salt, iterations) {
  // A backup key is derived separately from the vault key (its own salt), usable for encrypt/decrypt.
  const base = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return globalThis.crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function parseBackupFile(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { kind: "invalid", error: "This file is not valid JSON." }; }
  if (obj && obj.format === BACKUP_FORMAT) {
    if (obj.version !== 1) return { kind: "unsupported", error: `Backup version ${obj.version} is newer than this app supports.` };
    return { kind: "case-compass-backup", obj };
  }
  return { kind: "other", obj };
}

export async function decryptBackup(obj, passphrase) {
  const e = obj.encryption || {};
  const ct = b64ToBytes(obj.ciphertext || "");
  const problems = [];
  if (obj.ciphertextSha256 && (await cc.sha256Hex(ct)) !== obj.ciphertextSha256) problems.push("The file's integrity hash does not match. It may be incomplete or damaged.");
  const key = await deriveBackupKey(passphrase, b64ToBytes(e.salt), e.iterations);
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(await cc.decryptBytes(key, b64ToBytes(e.iv), ct, BACKUP_FORMAT))); }
  catch { throw new Error(problems.length ? "BACKUP_DAMAGED" : "WRONG_PASSPHRASE"); }
  return { payload, problems };
}

export async function verifyPayload(payload) {
  const problems = [];
  if (!Array.isArray(payload.records)) problems.push("Records are missing.");
  const ids = new Set();
  for (const r of payload.records || []) {
    if (!r.id || !r.type || !r.data) problems.push(`A record is incomplete (${r.ref || r.id || "no id"}).`);
    if (ids.has(r.id)) problems.push(`Duplicate record id ${r.id}.`);
    ids.add(r.id);
  }
  let blobsOk = 0;
  for (const b of payload.blobs || []) {
    if (b.missing) { problems.push(`Attachment ${b.id} was missing when the backup was made.`); continue; }
    const bytes = b64ToBytes(b.b64);
    if ((await cc.sha256Hex(bytes)) !== b.sha256) problems.push(`Attachment ${b.id} failed its integrity check.`);
    else blobsOk++;
  }
  const m = payload.manifest || {};
  if (m.records != null && m.records !== (payload.records || []).length) problems.push("Record count does not match the backup manifest.");
  return { ok: problems.length === 0, problems, records: (payload.records || []).length, blobs: blobsOk, revisions: (payload.revisions || []).length, created: payload.created };
}

export async function verifyBackupText(text, passphrase) {
  const p = parseBackupFile(text);
  if (p.kind !== "case-compass-backup") return { ok: false, problems: [p.error || "Not a Case Compass backup."] };
  try {
    const { payload, problems } = await decryptBackup(p.obj, passphrase);
    const v = await verifyPayload(payload);
    return { ...v, ok: v.ok && problems.length === 0, problems: [...problems, ...v.problems] };
  } catch (e) {
    return { ok: false, problems: [e.message === "WRONG_PASSPHRASE" ? "Incorrect backup passphrase." : "The backup could not be decrypted; it may be damaged."], error: e.message };
  }
}

// Restore into the currently unlocked vault.
// mode "merge": never overwrites; conflicting versions are kept (newer as current, the other in revision history).
// A restore point is created first so the merge itself can be undone.
export async function restorePayload(payload, { mode = "merge" } = {}) {
  const report = { added: 0, updated: 0, skipped: 0, conflictsKept: 0, blobsAdded: 0, revisionsAdded: 0, problems: [] };
  await vault.createRestorePoint(`Before restoring backup created ${payload.created || "unknown date"}`);

  for (const b of payload.blobs || []) {
    if (b.missing) continue;
    try {
      if (!(await vault.hasBlob(b.id))) { await vault.putBlob(b64ToBytes(b.b64), b.id); report.blobsAdded++; }
    } catch (e) { report.problems.push(`Attachment ${b.id}: ${e.message}`); }
  }
  for (const rev of payload.revisions || []) {
    try { await vault.putRevisionRaw(rev); report.revisionsAdded++; } catch (e) { report.problems.push(`Revision ${rev.id}: ${e.message}`); }
  }
  for (const r of payload.records || []) {
    try {
      const cur = vault.getRecord(r.id);
      if (!cur) { await vault.putRecordRaw(r); report.added++; continue; }
      if (cur.updatedAt === r.updatedAt && (cur.version || 1) === (r.version || 1)) { report.skipped++; continue; }
      const [newer, older] = (r.updatedAt > cur.updatedAt) ? [r, cur] : [cur, r];
      await vault.putRevisionRaw({ id: globalThis.crypto.randomUUID(), recordId: r.id, savedAt: nowISO(), snapshot: older, note: "Kept during backup restore (conflicting version)" });
      if (newer !== cur) { await vault.putRecordRaw({ ...newer, version: Math.max(cur.version || 1, r.version || 1) + 1 }); report.updated++; }
      report.conflictsKept++;
    } catch (e) { report.problems.push(`Record ${r.ref || r.id}: ${e.message}`); }
  }
  for (const a of payload.audit || []) { try { await vault.putAuditRaw(a); } catch { /* audit is best-effort */ } }

  // Settings: keep current settings in merge mode; restore everything in a clean install.
  const kv = payload.kv || {};
  if (mode === "clean") {
    for (const [k, v] of Object.entries(kv)) await vault.setKV(k, v);
  } else {
    const counters = vault.getKV("counters", {});
    for (const [p, n] of Object.entries(kv.counters || {})) counters[p] = Math.max(counters[p] || 0, n);
    await vault.setKV("counters", counters);
    const cl = vault.getKV("checklists", {});
    for (const [id, st] of Object.entries(kv.checklists || {})) if (!cl[id] || (!cl[id].done && st.done)) cl[id] = st;
    await vault.setKV("checklists", cl);
    const log = vault.getKV("backupLog", []);
    await vault.setKV("backupLog", [...log, ...(kv.backupLog || []).filter((x) => !log.some((y) => y.at === x.at))]);
  }
  await vault.audit("restore-backup", { summary: `Backup restored (${mode}): ${report.added} added, ${report.updated} updated, ${report.skipped} unchanged` });
  vault.notify("records");
  return report;
}

export async function recordBackupMade(info) {
  const log = vault.getKV("backupLog", []);
  log.push({ at: info.created, records: info.manifest.records, blobs: info.manifest.blobs, sha256: info.sha256, verified: !!info.verified });
  await vault.setKV("backupLog", log.slice(-50));
  await vault.audit("backup", { summary: `Encrypted backup created and verified (${info.manifest.records} records, ${info.manifest.blobs} attachments)` });
}

export function lastBackup() {
  const log = vault.getKV("backupLog", []);
  return log.length ? log[log.length - 1] : null;
}
