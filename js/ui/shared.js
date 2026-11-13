// Helpers shared by the views: navigation, unsaved-change guard, record items, tabs, page heads.
import { h, icon } from "./dom.js";
import * as vault from "../core/vault.js";
import { TYPES, recordDate, recordTime, recordTitle, isOpen, hasEvidence, childDisplayName, valueText } from "../core/schema.js";
import { fmtDate, fmtTime, daysBetween, truncate } from "../core/util.js";
import { PROTOCOLS } from "../../data/checklists-data.js";
import { GUIDES } from "../../data/guides-data.js";

// Navigate to a route. With replace, the history entry is replaced and the view is re-rendered even
// when the address does not change (for example, after unlocking on #/home).
export function navigate(hash, { replace = false } = {}) {
  if (replace) { history.replaceState(null, "", hash); window.dispatchEvent(new Event("cc-route")); }
  else if (location.hash === hash) window.dispatchEvent(new Event("cc-route"));
  else location.hash = hash;
}

// Unsaved-changes guard: a form registers a function returning true when it has unsaved input.
let guard = null;
export const setGuard = (fn) => { guard = fn; };
export const clearGuard = () => { guard = null; };
export const isGuarded = () => !!(guard && guard());

export function childName(id, initials = false) {
  const c = vault.getRecord(id);
  return c ? childDisplayName(c, initials) : "(removed child)";
}

export function reportCtx() {
  return {
    getRecord: (id) => vault.getRecord(id),
    childName,
    settings: vault.settings(),
    checklists: vault.getKV("checklists", {}),
    protocols: PROTOCOLS, guides: GUIDES, now: new Date(),
  };
}

export const viewCtx = { childName: (id) => childName(id), refOf: (id) => vault.getRecord(id)?.ref || "(removed)" };

export function pageHead(title, { crumbs, actions, sub } = {}) {
  return h("div", null,
    crumbs ? h("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, ...crumbs.flatMap((c, i) => [i ? h("span", { "aria-hidden": "true" }, "›") : null, c.href ? h("a", { href: c.href }, c.label) : h("span", null, c.label)])) : null,
    h("div", { class: "pagehead" }, h("div", null, h("h1", { tabindex: "-1", id: "page-title" }, title), sub ? h("p", { class: "muted", style: { margin: "4px 0 0" } }, sub) : null), actions ? h("div", { class: "row" }, ...actions) : null));
}

export function tabs(items, active) {
  return h("nav", { class: "tabs", "aria-label": "Section" }, ...items.map(([href, label]) => h("a", { class: "tab", href, "aria-current": href === active ? "page" : null }, label)));
}

export function callout(kind, ...content) {
  return h("div", { class: `callout ${kind}` }, icon(kind === "ok" ? "check" : kind === "info" ? "info" : "alert"), h("div", null, ...content.map((c) => (typeof c === "string" ? h("p", null, c) : c))));
}

export function emptyState(text, action) {
  return h("div", { class: "empty" }, icon("doc"), h("p", null, text), action || null);
}

export function typeIcon(type) { return TYPES[type]?.icon || "doc"; }

export function enteredLaterDays(r) {
  const n = daysBetween(recordDate(r), (r.createdAt || "").slice(0, 10));
  return TYPES[r.type]?.dateField && n != null && n > 1 ? n : 0;
}

const MAIN = { incident: "description", communication: "content", parenting: "activities", childStatement: "context", police: "summary", residence: "details", evidence: "notes", task: "description", attorney: "questions", expense: "category", child: "school" };

export function recordItem(r, { showType = true } = {}) {
  const t = TYPES[r.type];
  const d = recordDate(r), tm = recordTime(r);
  const later = enteredLaterDays(r);
  const ev = r.type === "evidence" ? 0 : (r.data?.attachments || []).length;
  const snippetField = t.fields.find((f) => f.key === MAIN[r.type]);
  const snippet = snippetField ? valueText(snippetField, r.data?.[MAIN[r.type]], viewCtx) : "";
  return h("li", null, h("a", { class: "item", href: `#/record/${r.id}` },
    h("span", { class: "ic" }, icon(typeIcon(r.type))),
    h("span", { class: "body" },
      h("span", { class: "title" }, recordTitle(r, viewCtx)),
      h("span", { class: "meta" },
        h("span", null, r.ref),
        showType ? h("span", null, t.short || t.label) : null,
        t.dateField ? h("span", null, `${fmtDate(d)}${tm ? " · " + fmtTime(tm) : ""}`) : null,
        isOpen(r) ? h("span", { class: "badge warn" }, r.type === "task" ? r.data?.status || "Open" : "Open") : null,
        r.type === "task" && r.data?.priority === "High" ? h("span", { class: "badge danger" }, "High") : null,
        ev ? h("span", { class: "badge" }, icon("paperclip"), String(ev)) : null,
        later ? h("span", { class: "badge", title: `Entered ${later} days after the event` }, `Entered ${later}d later`) : null,
        r.importedFrom ? h("span", { class: "badge" }, "Imported") : null),
      snippet ? h("span", { class: "snippet" }, truncate(snippet, 220)) : null)));
}

export function recordList(records, opts) {
  if (!records.length) return null;
  return h("ul", { class: "list" }, ...records.map((r) => recordItem(r, opts)));
}

export function evidenceBackedUp(r) {
  const log = vault.getKV("backupLog", []);
  const last = log.filter((x) => x.verified).pop();
  return !!(last && r.updatedAt <= last.at);
}

export function relTime(iso) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return "today"; if (days === 1) return "yesterday"; return `${days} days ago`;
}

export { isOpen, hasEvidence };
