// Shared helpers with no DOM dependency (usable from Node for tests and sample generation).

export const APP_NAME = "Case Compass";
export const APP_VERSION = "3.0.0";
export const DATA_SCHEMA_VERSION = 3;
export const DEFAULT_TZ = "America/Denver";

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const nowISO = () => new Date().toISOString();

export function todayLocal(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ; } catch { return DEFAULT_TZ; }
}

// Parse a local YYYY-MM-DD date safely (no UTC shift).
export function parseLocalDate(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtDate(s, opts = {}) {
  const d = typeof s === "string" ? (s.length > 10 ? new Date(s) : parseLocalDate(s)) : s;
  if (!d || isNaN(d)) return "";
  const base = `${opts.long ? MONTHS_LONG[d.getMonth()] : MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return opts.weekday ? `${DAYS[d.getDay()]}, ${base}` : base;
}

export function fmtTime(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return "";
  let [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "p.m." : "a.m."; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

export function fmtDateTimeISO(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${fmtDate(d)} ${fmtTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`)}`;
}

export function monthLabel(ym) { const [y, m] = ym.split("-").map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; }

export function addDays(dateStr, n) {
  const d = parseLocalDate(dateStr); d.setDate(d.getDate() + n); return todayLocal(d);
}

export function daysBetween(a, b) {
  const da = parseLocalDate(a), db = parseLocalDate(b);
  if (!da || !db) return null;
  return Math.round((db - da) / 86400000);
}

export function ageFrom(dob, on = todayLocal()) {
  const d = parseLocalDate(dob), o = parseLocalDate(on);
  if (!d || !o) return null;
  let age = o.getFullYear() - d.getFullYear();
  if (o.getMonth() < d.getMonth() || (o.getMonth() === d.getMonth() && o.getDate() < d.getDate())) age--;
  return age;
}

export function startOfWeek(dateStr) { const d = parseLocalDate(dateStr); d.setDate(d.getDate() - d.getDay()); return todayLocal(d); }
export function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`; const end = todayLocal(new Date(y, m, 0));
  return { start, end };
}

export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60); }

export function bytesToB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(s);
}
export function b64ToBytes(b64) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const s = atob(b64); const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
export function hex(buf) { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""); }

export function fmtBytes(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}

export function csvEscape(v) {
  const s = v == null ? "" : String(v);
  // Neutralize spreadsheet formula injection for exported text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV(rows) { return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n"; }

export function parseCSV(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ""));
}

export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function plural(n, word, pluralWord) { return `${n} ${n === 1 ? word : pluralWord || word + "s"}`; }

export function truncate(s, n) { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

export function sortBy(arr, fn, dir = 1) {
  return [...arr].sort((a, b) => { const x = fn(a), y = fn(b); return x < y ? -dir : x > y ? dir : 0; });
}

// Passphrase strength estimate (no network, no dictionary download). Returns 0–4 and advice.
export function passphraseStrength(p) {
  const s = String(p || "");
  if (!s) return { score: 0, label: "Enter a passphrase", ok: false };
  let bits = 0;
  const sets = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9\s]/, /\s/];
  let pool = 0; const sizes = [26, 26, 10, 33, 1];
  sets.forEach((re, i) => { if (re.test(s)) pool += sizes[i]; });
  bits = s.length * Math.log2(Math.max(pool, 2));
  const words = s.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 3);
  if (words.length >= 4) bits = Math.max(bits, words.length * 12 + 10);
  if (/^(.)\1+$/.test(s) || /(password|123456|qwerty|letmein|admin)/i.test(s)) bits = Math.min(bits, 20);
  if (/(.{2,})\1{2,}/.test(s)) bits -= 15;
  const score = bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  const ok = s.length >= 12 && score >= 3;
  const label = ["Too weak", "Weak", "Fair", "Strong", "Very strong"][score];
  return { score, label, ok, bits: Math.round(bits) };
}
