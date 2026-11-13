// Case Compass – application shell, router, idle lock, and Quick Exit.
import { h, icon, logo, toast, confirmDialog, clear, setTitle } from "./ui/dom.js";
import { isGuarded, clearGuard, navigate } from "./ui/shared.js";
import * as vault from "./core/vault.js";
import { openDB } from "./core/db.js";
import { APP_VERSION } from "./core/util.js";
import * as gate from "./views/gate.js";
import * as home from "./views/home.js";
import * as records from "./views/records.js";
import * as parenting from "./views/parenting.js";
import * as resources from "./views/resources.js";
import * as reports from "./views/reports.js";

window.__ccStarted = true;
clearTimeout(window.__ccBootTimer);

const root = document.getElementById("root");
const NAV = [
  ["home", "#/home", "Home", "home"],
  ["document", "#/document", "Document", "doc"],
  ["parenting", "#/parenting", "Parenting", "family"],
  ["resources", "#/resources", "Resources", "compass"],
  ["reports", "#/reports", "Reports", "report"],
];
const PUBLIC = /^#\/(resources|unlock|welcome|restore)/;

// ───── theme (stored locally so it applies before unlock; not sensitive) ─────
export function applyTheme(theme) {
  const t = theme || safeLS("get", "case-compass-theme") || "dark";
  document.documentElement.dataset.theme = t;
  safeLS("set", "case-compass-theme", t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === "light" ? "#eef1f5" : "#0a0d11";
}
export function safeLS(op, key, val) {
  try { if (op === "get") return localStorage.getItem(key); if (op === "set") localStorage.setItem(key, val); if (op === "del") localStorage.removeItem(key); } catch { /* storage blocked */ }
  return null;
}

// ───── Quick Exit ─────
export function quickExit() {
  try { vault.lock(); } catch { /* ignore */ }
  clearGuard();
  const dest = safeLS("get", "case-compass-exit") || "https://weather.gov/";
  document.body.replaceChildren();
  location.replace(dest);
}
let escCount = 0, escTimer;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || document.querySelector("dialog[open]")) return;
  escCount++; clearTimeout(escTimer); escTimer = setTimeout(() => { escCount = 0; }, 900);
  if (escCount >= 3) quickExit();
});

// ───── idle lock ─────
let lastActive = Date.now(), hiddenAt = null;
["pointerdown", "keydown", "touchstart", "input", "wheel"].forEach((ev) => document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true }));
function idleLimitMs() { return Math.max(1, Number(vault.settings().idleMinutes) || 5) * 60000; }
setInterval(() => { if (vault.isUnlocked() && Date.now() - lastActive > idleLimitMs()) lockNow("Locked after inactivity."); }, 10000);
document.addEventListener("visibilitychange", () => {
  if (!vault.isUnlocked()) return;
  if (document.hidden) { hiddenAt = Date.now(); if (vault.settings().lockOnHide) lockNow("Locked when the app was hidden."); }
  else if (hiddenAt && Date.now() - hiddenAt > idleLimitMs()) lockNow("Locked after inactivity.");
});

export function lockNow(reason) {
  if (!vault.isUnlocked()) return;
  clearGuard();
  vault.lock();
  if (reason) toast(reason, "warn");
  if (!PUBLIC.test(location.hash)) navigate("#/unlock", { replace: true }); else render();
}

// ───── shell ─────
function shell(active) {
  const unlocked = vault.isUnlocked();
  const topLevel = /^#\/(home|document|parenting|resources|reports)?$/.test(location.hash.split("?")[0]) || !location.hash;
  const back = !topLevel ? h("button", { class: "iconbtn", type: "button", "aria-label": "Back", onclick: () => (history.length > 1 ? history.back() : navigate("#/home")) }, icon("back")) : null;
  const top = h("header", { class: "topbar" },
    back,
    h("a", { class: "brand", href: unlocked ? "#/home" : "#/unlock", "aria-label": "Case Compass home" }, logo(), h("span", null, "Case Compass")),
    h("span", { class: "spacer" }),
    unlocked
      ? h("button", { class: "iconbtn", type: "button", "aria-label": "Lock now", title: "Lock now", onclick: () => lockNow("Vault locked.") }, icon("lock"), h("span", { class: "hide-sm" }, ""))
      : h("a", { class: "iconbtn", href: "#/unlock", "aria-label": "Unlock", title: "Unlock" }, icon("unlock")),
    h("button", { class: "iconbtn quickexit", type: "button", title: "Quick Exit: locks Case Compass and opens a neutral website", onclick: quickExit }, icon("exit"), "Exit"));
  const navItems = (cls) => NAV.map(([key, href, label, ic]) => h("a", { class: cls, href: unlocked || key === "resources" ? href : "#/unlock", "aria-current": key === active ? "page" : null }, icon(ic), h("span", null, label)));
  const side = h("nav", { class: "sidebar", "aria-label": "Main" }, ...navItems("navitem"), h("div", { class: "side-foot" }, unlocked ? "Vault unlocked · auto-locks when idle" : "Vault locked", h("br"), `Version ${APP_VERSION}`));
  const bottom = h("nav", { class: "bottomnav", "aria-label": "Main" }, ...navItems("navitem"));
  const main = h("main", { id: "view", tabindex: "-1" });
  root.replaceChildren(top, h("div", { class: "layout" }, side, main), bottom);
  return main;
}

// ───── routing ─────
function parse() {
  const raw = location.hash || "#/home";
  const [path, qs] = raw.slice(1).split("?");
  const parts = path.split("/").filter(Boolean);
  return { raw, parts, query: Object.fromEntries(new URLSearchParams(qs || "")) };
}

function resolve({ parts, query }) {
  const [a, b, c] = parts;
  switch (a) {
    case "home": return ["home", b === "calendar" ? () => home.calendar(query) : b === "attorneys" ? () => home.attorneys() : () => home.dashboard()];
    case "document": return ["document", b ? () => records.typeList(b, "document") : () => records.timeline(query)];
    case "parenting": return ["parenting", b === "time" ? () => records.typeList("parenting", "parenting") : b === "communication" ? () => records.typeList("communication", "parenting") : b === "statements" ? () => records.typeList("childStatement", "parenting") : b === "children" ? (c ? () => parenting.childDetail(c) : () => parenting.children()) : () => parenting.overview(query)];
    case "new": return [areaOf(b), b ? () => records.newRecord(b, query) : () => records.chooser()];
    case "record": return [null, () => records.recordDetail(b)];
    case "edit": return [null, () => records.editRecord(b)];
    case "resources": return ["resources", b === "protection" ? (c ? () => resources.protocolDetail(c) : () => resources.protection()) : b === "forms" ? () => resources.forms(query) : b === "library" ? () => resources.library() : b === "guides" ? () => resources.guide(c) : () => resources.directory(query)];
    case "reports": return ["reports", b === "backup" ? () => reports.backupView() : b === "import" ? () => reports.importView() : b === "settings" ? () => reports.settingsView() : b === "trash" ? () => reports.trashView() : b === "history" ? () => reports.historyView() : () => reports.createReport(query)];
    default: return ["home", () => home.dashboard()];
  }
}
function areaOf(type) { return { incident: "document", police: "document", residence: "document", evidence: "document", expense: "document", parenting: "parenting", communication: "parenting", child: "parenting", childStatement: "parenting", task: "home", attorney: "home" }[type] || "document"; }

let lastHash = location.hash;
let rendering = 0;
async function render() {
  const token = ++rendering;
  const route = parse();
  const exists = await vault.vaultExists().catch(() => false);
  if (!vault.isUnlocked()) {
    if (route.parts[0] === "restore") { root.replaceChildren(await gate.restoreClean()); return; }
    if (!PUBLIC.test(route.raw) || route.parts[0] === "unlock" || route.parts[0] === "welcome") {
      root.replaceChildren(exists ? gate.lockScreen({ onUnlocked }) : gate.welcome({ onCreated }));
      setTitle(exists ? "Locked" : "Welcome");
      return;
    }
  } else if (["unlock", "welcome", "restore"].includes(route.parts[0])) { navigate("#/home", { replace: true }); return; }
  const [active, view] = resolve(route);
  const main = shell(active);
  try {
    const node = await view();
    if (token !== rendering) return;
    clear(main).append(node);
    const title = main.querySelector("h1");
    setTitle(title?.textContent);
    if (!route.query.keepScroll) window.scrollTo(0, 0);
    (main.querySelector("#page-title") || main).focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    clear(main).append(h("div", { class: "card danger" }, h("h1", null, "This page could not be shown"), h("p", null, "Your records are safe. Something went wrong while displaying this page."), h("pre", { class: "mono" }, String(e?.message || e)), h("div", { class: "row" }, h("a", { class: "btn primary", href: "#/home" }, "Go to Home"), h("button", { class: "btn", type: "button", onclick: () => location.reload() }, "Reload"))));
  }
}

function onUnlocked() { applyTheme(vault.settings().theme); lastActive = Date.now(); const target = sessionStorage.getItem("cc-after-unlock"); sessionStorage.removeItem("cc-after-unlock"); navigate(target && !/unlock|welcome/.test(target) ? target : "#/home", { replace: true }); }
function onCreated() { applyTheme("dark"); vault.requestPersistence(); lastActive = Date.now(); navigate("#/home", { replace: true }); }

window.addEventListener("hashchange", async () => {
  if (location.hash === lastHash) return;
  if (isGuarded()) {
    const target = location.hash;
    history.replaceState(null, "", lastHash);
    const leave = await confirmDialog({ title: "Leave this page?", message: ["You have changes that are not saved as a record yet. Your text is kept as an encrypted draft, so you can return to it later."], confirmText: "Leave page", cancelText: "Stay here" });
    if (!leave) return;
    clearGuard();
    history.replaceState(null, "", target);
  }
  if (!vault.isUnlocked() && !PUBLIC.test(location.hash) && !/^#\/(unlock|welcome|restore)/.test(location.hash)) sessionStorage.setItem("cc-after-unlock", location.hash);
  lastHash = location.hash;
  render();
});
window.addEventListener("cc-route", () => { lastHash = location.hash; render(); });
window.addEventListener("beforeunload", (e) => { if (isGuarded()) { e.preventDefault(); e.returnValue = ""; } });
window.addEventListener("unhandledrejection", (e) => { console.error(e.reason); toast(`Something went wrong: ${e.reason?.message || e.reason}`, "err", 6000); });
window.addEventListener("error", (e) => { if (e.message) toast(`Something went wrong: ${e.message}`, "err", 6000); });

// ───── service worker (offline app files only; never caches records) ─────
export let swRegistration = null;
let userAcceptedUpdate = false;
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker?.register("sw.js").then((reg) => {
    swRegistration = reg;
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          toast(h("span", null, "An updated version of Case Compass is ready. ", h("button", { class: "btn small", type: "button", onclick: () => { userAcceptedUpdate = true; nw.postMessage("skipWaiting"); } }, "Update now")), "ok", 15000);
        }
      });
    });
  }).catch((e) => console.warn("Service worker not registered:", e));
  // Reload only when the user chose "Update now". The first install also fires controllerchange
  // (clients.claim), and reloading then would wipe whatever the person was typing.
  let reloaded = false;
  navigator.serviceWorker?.addEventListener("controllerchange", () => { if (!userAcceptedUpdate || reloaded || isGuarded()) return; reloaded = true; location.reload(); });
}

// ───── start ─────
(async function start() {
  // boot.js already showed an explanation (no HTTPS, no Web Crypto, no storage): never run without encryption.
  if (window.__ccBlocked) return;
  if (!(window.isSecureContext && window.crypto?.subtle)) { window.__ccShowFatal?.("Secure storage is not available", ["This browser is not providing the encryption features Case Compass requires, so nothing will be stored."]); return; }
  applyTheme();
  try { await openDB(); }
  catch (e) {
    window.__ccShowFatal?.("Storage is blocked", ["Case Compass could not open its encrypted storage in this browser. This usually happens in private browsing, or when the browser is set to block site data.", "Nothing was saved, and nothing was stored without encryption. Open Case Compass in a normal browser window to continue."], e?.message);
    return;
  }
  if (!location.hash) history.replaceState(null, "", "#/home");
  lastHash = location.hash;
  render();
})();

export { render };
