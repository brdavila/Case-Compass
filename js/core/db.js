// Minimal promise-based IndexedDB wrapper. Only ciphertext and non-sensitive metadata are stored.

const DB_NAME = "case-compass";
const DB_VERSION = 1;
export const STORES = ["meta", "records", "revisions", "blobs", "audit", "drafts", "kv", "restorePoints"];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("INDEXEDDB_UNAVAILABLE")); return; }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          const store = db.createObjectStore(s, { keyPath: "id" });
          if (s === "revisions") store.createIndex("recordId", "recordId");
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error("INDEXEDDB_OPEN_FAILED"));
    req.onblocked = () => reject(new Error("INDEXEDDB_BLOCKED"));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export async function get(store, id) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).get(id));
}

export async function getAll(store) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAll());
}

export async function getAllByIndex(store, index, value) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).index(index).getAll(value));
}

export async function put(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("TRANSACTION_ABORTED"));
  });
}

export async function del(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

// Atomic multi-store write: ops = [{store, value}] or [{store, delete: id}].
export async function batch(ops) {
  const db = await openDB();
  const stores = [...new Set(ops.map((o) => o.store))];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    for (const o of ops) {
      const s = tx.objectStore(o.store);
      if ("delete" in o) s.delete(o.delete); else s.put(o.value);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("TRANSACTION_ABORTED"));
  });
}

export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, "readwrite");
    STORES.forEach((s) => tx.objectStore(s).clear());
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDatabase() {
  if (dbPromise) { try { (await dbPromise).close(); } catch { /* ignore */ } dbPromise = null; }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(); req.onerror = () => reject(req.error); req.onblocked = () => resolve();
  });
}

export function isQuotaError(e) {
  return e && (e.name === "QuotaExceededError" || e.code === 22 || /quota/i.test(e.message || ""));
}
