// DOM helpers, icons, dialogs, toasts, and file delivery. No innerHTML with user data:
// all user-provided text is inserted as text nodes.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") el.innerHTML = v; // only used with static, trusted markup (icons)
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const frag = (...c) => { const f = document.createDocumentFragment(); append(f, c); return f; };
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ───── Icons (inline SVG, static markup) ─────
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-5h4v5"/>',
  doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M8 13h8M8 17h6"/>',
  family: '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M2.5 20c.6-3.6 2.8-6 5.5-6s4.9 2.4 5.5 6"/><path d="M14.5 20c.4-2.6 1.6-4.4 3.4-4.4 1.9 0 3.2 1.8 3.6 4.4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  report: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="10" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.7-1.5"/>',
  exit: '<path d="M14 4h5v16h-5"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  child: '<circle cx="12" cy="6.5" r="3"/><path d="M6 21v-5a6 6 0 0 1 12 0v5"/>',
  quote: '<path d="M7 7h4v4c0 3-1.5 5-4 6"/><path d="M14 7h4v4c0 3-1.5 5-4 6"/>',
  badge: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  paperclip: '<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M16 13h2M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1v-7.5z"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  scale: '<path d="M12 3v18M5 21h14"/><path d="M5 7h14"/><path d="m5 7-3 7a3.5 3.5 0 0 0 6 0zM19 7l-3 7a3.5 3.5 0 0 0 6 0z"/>',
  school: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/>',
  support: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
  device: '<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M11 18.5h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  backup: '<path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z"/><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
};
export function icon(name, cls = "") {
  const span = document.createElement("span");
  span.className = `i ${cls}`; span.setAttribute("aria-hidden", "true"); span.style.display = "inline-flex";
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.info}</svg>`;
  return span;
}
export const LOGO = '<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3cc8f5"/><stop offset="1" stop-color="#2f6ff0"/></linearGradient></defs><rect x="2" y="2" width="60" height="60" rx="14" fill="#0e141b" stroke="#3a4655" stroke-width="2"/><circle cx="32" cy="32" r="19" fill="none" stroke="url(#lg)" stroke-width="3"/><path d="M41 23 35.5 35.5 23 41l5.5-12.5z" fill="url(#lg)"/><circle cx="32" cy="32" r="2.6" fill="#0e141b"/></svg>';
export function logo(cls = "logo") { const s = document.createElement("span"); s.innerHTML = LOGO.replace('class="logo"', `class="${cls}"`); return s.firstChild; }

// ───── Toasts ─────
let toastHost;
export function toast(message, kind = "ok", ms = 3800) {
  if (!toastHost) { toastHost = h("div", { class: "toasts", role: "status", "aria-live": "polite" }); document.body.appendChild(toastHost); }
  const t = h("div", { class: `toast ${kind}` }, icon(kind === "err" ? "alert" : kind === "warn" ? "info" : "check"), h("div", null, message));
  toastHost.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ───── Dialogs (native <dialog>, focus-trapped by the browser) ─────
export function dialog({ title, body, actions = [], onClose, wide = false, dismissible = true }) {
  return new Promise((resolve) => {
    const d = h("dialog", { "aria-labelledby": "dlg-title", style: wide ? { width: "min(820px, calc(100vw - 24px))" } : null });
    let result; let settled = false;
    d.addEventListener("close", () => { d.remove(); if (settled) return; settled = true; onClose?.(result); resolve(result); });
    const close = (v) => { result = v; if (d.open) d.close(); };
    d.closeWith = close;
    const foot = h("div", { class: "dfoot" });
    for (const a of actions) {
      const b = h("button", { class: `btn ${a.kind || ""}`, type: "button" }, a.label);
      b.addEventListener("click", async () => {
        if (a.onClick) { const r = await a.onClick(b); if (r === false) return; close(r === undefined ? a.value : r); }
        else close(a.value);
      });
      foot.appendChild(b);
    }
    d.append(h("div", { class: "dhead" }, h("h2", { id: "dlg-title" }, title)), h("div", { class: "dbody" }, body), foot);
    d.addEventListener("cancel", (e) => { e.preventDefault(); if (dismissible) close(undefined); });
    document.body.appendChild(d);
    d.showModal();
    const first = d.querySelector("input:not([type=file]), textarea, select") || foot.querySelector(".btn.primary") || foot.querySelector(".btn");
    first?.focus();
  });
}

export function confirmDialog({ title, message, confirmText = "Continue", cancelText = "Cancel", danger = false, details }) {
  return dialog({
    title, body: h("div", null, ...(Array.isArray(message) ? message : [message]).map((m) => (m instanceof Node ? m : h("p", null, m))), details || null),
    actions: [{ label: cancelText, value: false }, { label: confirmText, value: true, kind: danger ? "danger" : "primary" }],
  }).then((v) => !!v);
}

export function alertDialog(title, message) {
  return dialog({ title, body: h("div", null, ...(Array.isArray(message) ? message : [message]).map((m) => (m instanceof Node ? m : h("p", null, m)))), actions: [{ label: "OK", value: true, kind: "primary" }] });
}

export function passwordField({ id, label, autocomplete = "current-password", help }) {
  const input = h("input", { type: "password", id, autocomplete, autocapitalize: "off", spellcheck: "false" });
  const toggle = h("button", { type: "button", class: "btn small ghost", "aria-controls": id, "aria-pressed": "false" }, "Show");
  toggle.addEventListener("click", () => { const show = input.type === "password"; input.type = show ? "text" : "password"; toggle.textContent = show ? "Hide" : "Show"; toggle.setAttribute("aria-pressed", String(show)); });
  return { el: h("div", { class: "field" }, h("label", { for: id }, label), h("div", { class: "pwwrap" }, input, toggle), help ? h("div", { class: "help" }, help) : null), input };
}

export function askPassphrase({ title, message, confirmText = "Continue", confirmTwice = false, label = "Passphrase", validate }) {
  const p1 = passwordField({ id: "dlg-pw1", label, autocomplete: confirmTwice ? "new-password" : "current-password" });
  const p2 = confirmTwice ? passwordField({ id: "dlg-pw2", label: `Confirm ${label.toLowerCase()}`, autocomplete: "new-password" }) : null;
  const err = h("div", { class: "err", role: "alert" });
  return dialog({
    title, body: h("div", { class: "form" }, message ? h("p", { class: "muted" }, message) : null, p1.el, p2?.el, err),
    actions: [{ label: "Cancel", value: null }, { label: confirmText, kind: "primary", onClick: async (btn) => {
      const v = p1.input.value;
      if (!v) { err.textContent = "Enter the passphrase."; return false; }
      if (p2 && v !== p2.input.value) { err.textContent = "The two entries do not match."; return false; }
      if (validate) { btn.disabled = true; btn.textContent = "Checking…"; const msg = await validate(v); btn.disabled = false; btn.textContent = confirmText; if (msg) { err.textContent = msg; return false; } }
      return v;
    } }],
  });
}

// ───── Files ─────
export function pickFile({ accept = "*/*", multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept, style: { display: "none" } });
    if (multiple) input.multiple = true;
    input.addEventListener("change", () => { resolve(multiple ? [...input.files] : input.files[0] || null); input.remove(); });
    document.body.appendChild(input); input.click();
  });
}

export function readFileText(file) { return file.text ? file.text() : new Response(file).text(); }

// Deliver a generated file. On iPhone/iPad, the Share option opens the Share Sheet (Save to Files, AirDrop).
export async function deliverFile(bytes, filename, mime, { encrypted = false, note } = {}) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
  let file = null;
  try { file = new File([blob], filename, { type: mime }); } catch { /* old browsers */ }
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const doDownload = () => {
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: filename, style: { display: "none" } });
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
    return true;
  };
  const body = h("div", null,
    h("p", null, h("b", null, filename), ` (${(blob.size / 1024).toFixed(1)} KB)`),
    encrypted
      ? h("div", { class: "callout ok" }, icon("lock"), h("p", null, "This file is encrypted. It can only be opened by Case Compass with the backup passphrase."))
      : h("div", { class: "callout warn" }, icon("alert"), h("p", null, "This file is NOT encrypted. Anyone who can open the file can read it. Store or share it carefully, and delete copies you no longer need.")),
    note ? h("p", { class: "muted small" }, note) : null,
    canShare ? h("p", { class: "muted small" }, "On iPhone or iPad, choose Share, then Save to Files to keep it in the Files app.") : null);
  const actions = [{ label: "Close", value: false }];
  if (canShare) actions.push({ label: "Share…", kind: "", onClick: async () => { try { await navigator.share({ files: [file], title: filename }); return "shared"; } catch (e) { if (e?.name === "AbortError") return false; return doDownload() && "downloaded"; } } });
  actions.push({ label: "Download", kind: "primary", onClick: () => doDownload() && "downloaded" });
  return dialog({ title: "Your file is ready", body, actions });
}

export function openPrintWindow(html) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  // Inline handlers are blocked by the Content-Security-Policy, so wire the buttons from here.
  const wire = () => {
    w.document.getElementById("pp-print")?.addEventListener("click", () => w.print());
    w.document.getElementById("pp-close")?.addEventListener("click", () => w.close());
  };
  if (w.document.readyState === "loading") w.addEventListener("DOMContentLoaded", wire); else wire();
  return true;
}

export function setTitle(t) { document.title = t ? `${t} · Case Compass` : "Case Compass"; }
