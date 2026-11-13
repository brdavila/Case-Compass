// Parenting: overview with date-range comparisons, children, child detail.
import { h, icon } from "../ui/dom.js";
import { pageHead, tabs, callout, emptyState, recordList, childName } from "../ui/shared.js";
import { PARENT_TABS } from "./records.js";
import * as vault from "../core/vault.js";
import { recordDate, recordTime, childAge, ptCategory } from "../core/schema.js";
import { todayLocal, addDays, fmtDate } from "../core/util.js";
import { parentingStats } from "../reports/model.js";

const state = { preset: "30", start: "", end: "", child: "" };

function rangeFor(preset) {
  const t = todayLocal();
  if (preset === "30") return { start: addDays(t, -30), end: t };
  if (preset === "90") return { start: addDays(t, -90), end: t };
  if (preset === "month") return { start: `${t.slice(0, 7)}-01`, end: t };
  if (preset === "year") return { start: `${t.slice(0, 4)}-01-01`, end: t };
  if (preset === "all") return { start: "", end: "" };
  return { start: state.start, end: state.end };
}

export function overview() {
  const all = vault.listRecords();
  const kids = vault.listRecords({ type: "child" });
  const out = h("div", { "aria-live": "polite" });
  const custom = h("div", { class: "grid two", hidden: state.preset !== "custom" });
  const from = h("input", { type: "date", id: "pt-from", value: state.start }), to = h("input", { type: "date", id: "pt-to", value: state.end });
  custom.append(h("div", { class: "field" }, h("label", { for: "pt-from" }, "From"), from), h("div", { class: "field" }, h("label", { for: "pt-to" }, "To"), to));
  const preset = h("select", { id: "pt-preset" }, ...[["30", "Last 30 days"], ["90", "Last 90 days"], ["month", "This month"], ["year", "This year"], ["all", "All dates"], ["custom", "Custom range"]].map(([v, l]) => h("option", { value: v }, l)));
  preset.value = state.preset;
  const childSel = h("select", { id: "pt-child" }, h("option", { value: "" }, "All children"), ...kids.map((k) => h("option", { value: k.id }, childName(k.id))));
  childSel.value = state.child;

  const render = () => {
    const { start, end } = rangeFor(state.preset);
    const s = parentingStats(all, { start, end, childId: state.child || undefined });
    const max = Math.max(1, s.requested, s.scheduled, s.completed, s.denied, s.cancelledByOther + s.cancelledByMe);
    const bar = (l, v, cls) => h("div", { class: "bar" }, h("span", null, l), h("span", { class: "track" }, h("span", { class: `fill ${cls}`, style: { width: `${(v / max) * 100}%` } })), h("span", { class: "v" }, String(v)));
    const entries = all.filter((r) => r.type === "parenting" && (!start || recordDate(r) >= start) && (!end || recordDate(r) <= end) && (!state.child || (r.data.children || []).includes(state.child))).sort((a, b) => (recordDate(a) + recordTime(a) < recordDate(b) + recordTime(b) ? 1 : -1));
    const reqComms = all.filter((r) => r.type === "communication" && r.data?.request && r.data.request !== "None" && (!start || r.data.date >= start) && (!end || r.data.date <= end));
    const unansweredComms = reqComms.filter((r) => /No response|Waiting/.test(r.data.responseStatus || ""));
    out.replaceChildren(
      h("div", { class: "grid four" },
        stat(s.requested, "Requested"), stat(s.scheduled, "Scheduled"), stat(s.completed, "Completed"), stat(s.overnights, "Overnights"),
        stat(s.denied, "Denied or disputed"), stat(s.cancelledByOther, "Cancelled by other parent"), stat(s.cancelledByMe, "Cancelled by me"), stat(s.unanswered + unansweredComms.length, "Requests without a response")),
      h("div", { class: "card section" }, h("h2", null, "Requested vs. scheduled vs. completed"),
        h("div", { class: "bars" }, bar("Requested", s.requested, "alt"), bar("Scheduled", s.scheduled, ""), bar("Completed", s.completed, "ok"), bar("Denied / disputed", s.denied, "danger"), bar("Cancelled", s.cancelledByMe + s.cancelledByOther, "")),
        h("p", { class: "muted small", style: { marginTop: "8px" } }, `${s.hours} hours of completed time where start and end times were recorded · ${s.activities} school, medical, activity, or communication entries · ${reqComms.length} parenting-related messages logged.`),
        h("p", { class: "muted small" }, "These counts summarize your own entries. They show both successful and unsuccessful parenting time, and they are not a legal measure of parenting time.")),
      h("section", { class: "section" }, h("div", { class: "row between" }, h("h2", null, `Entries in this range (${entries.length})`), h("a", { class: "btn small", href: `#/reports?kind=parenting&start=${start}&end=${end}` }, icon("report"), "Parenting-time report")),
        entries.length ? recordList(entries.slice(0, 50)) : emptyState("No parenting-time entries in this range.", h("a", { class: "btn primary", href: "#/new/parenting" }, icon("plus"), "Record parenting time"))));
  };
  preset.addEventListener("change", () => { state.preset = preset.value; custom.hidden = state.preset !== "custom"; render(); });
  from.addEventListener("change", () => { state.start = from.value; render(); });
  to.addEventListener("change", () => { state.end = to.value; render(); });
  childSel.addEventListener("change", () => { state.child = childSel.value; render(); });
  render();
  return h("div", null,
    pageHead("Parenting", { sub: "Children, parenting time, and communications.", actions: [h("a", { class: "btn primary", href: "#/new/parenting" }, icon("plus"), "Record parenting time")] }),
    tabs(PARENT_TABS, "#/parenting"),
    h("div", { class: "actions section" },
      h("a", { class: "action", href: "#/new/parenting?entryType=Requested%20parenting%20time" }, icon("calendar"), "Log a request"),
      h("a", { class: "action", href: "#/new/parenting?entryType=Completed%20parenting%20time" }, icon("check"), "Log completed time"),
      h("a", { class: "action", href: "#/new/communication" }, icon("chat"), "Log communication"),
      h("a", { class: "action", href: "#/new/childStatement" }, icon("quote"), "Child statement")),
    h("div", { class: "card stack" }, h("div", { class: "grid two" }, h("div", { class: "field" }, h("label", { for: "pt-preset" }, "Date range"), preset), h("div", { class: "field" }, h("label", { for: "pt-child" }, "Child"), childSel)), custom),
    h("div", { class: "section" }, out),
    callout("info", h("p", null, "Equal parenting time can be your stated goal. Colorado courts decide parenting time based on the children's best interests. ", h("a", { href: "#/resources/guides/parenting-time-checklist" }, "Parenting-time preparation checklist"))));
}

function stat(n, l) { return h("div", { class: "stat" }, h("div", { class: "n" }, String(n)), h("div", { class: "l" }, l)); }

export function children() {
  const kids = vault.listRecords({ type: "child" });
  return h("div", null,
    pageHead("Children", { actions: [h("a", { class: "btn primary", href: "#/new/child" }, icon("plus"), "Add a child")] }),
    tabs(PARENT_TABS, "#/parenting/children"),
    callout("info", "Keep one record per child. Use neutral language and include only what you need. Reports can show initials only."),
    kids.length ? h("div", { class: "grid two section" }, ...kids.map((k) => {
      const age = childAge(k);
      const n = vault.listRecords().filter((r) => (r.data?.children || []).includes(k.id)).length;
      return h("a", { class: "card", href: `#/parenting/children/${k.id}`, style: { textDecoration: "none", color: "inherit" } },
        h("div", { class: "row" }, h("span", { class: "item ic", style: { padding: 0, border: 0 } }, icon("child")), h("h2", { style: { margin: 0 } }, childName(k.id))),
        h("p", { class: "muted", style: { margin: "6px 0 0" } }, [age != null ? `Age ${age}` : null, k.data.school, k.data.grade && `Grade ${k.data.grade}`].filter(Boolean).join(" · ") || "Profile"),
        h("p", { class: "small faint", style: { margin: "4px 0 0" } }, `${n} linked record${n === 1 ? "" : "s"}`));
    })) : emptyState("No children added yet.", h("a", { class: "btn primary", href: "#/new/child" }, icon("plus"), "Add a child")));
}

export function childDetail(id) {
  const k = vault.getRecord(id);
  if (!k || k.type !== "child") return emptyState("This child record was not found.");
  const related = vault.listRecords().filter((r) => (r.data?.children || []).includes(id)).sort((a, b) => (recordDate(a) < recordDate(b) ? 1 : -1));
  const today = todayLocal();
  const s = parentingStats(vault.listRecords(), { start: addDays(today, -90), end: today, childId: id });
  const age = childAge(k);
  return h("div", null,
    pageHead(childName(id), { crumbs: [{ label: "Children", href: "#/parenting/children" }, { label: childName(id) }], actions: [h("a", { class: "btn", href: `#/edit/${id}` }, icon("edit"), "Edit profile"), h("a", { class: "btn primary", href: `#/new/childStatement?child=${id}` }, icon("quote"), "Record a statement")] }),
    h("div", { class: "grid two" },
      h("div", { class: "card" }, h("h2", null, "Profile"), h("dl", { class: "dl" },
        ...[["Age", age != null ? String(age) : ""], ["Date of birth", fmtDate(k.data.dob)], ["School", k.data.school], ["Grade", k.data.grade], ["Schedule", k.data.schedule], ["Activities", k.data.activities], ["Providers", k.data.providers]].filter(([, v]) => v).flatMap(([a, b]) => [h("dt", null, a), h("dd", null, b)])),
        h("a", { class: "btn small", href: `#/record/${id}` }, "Full record and history")),
      h("div", { class: "card" }, h("h2", null, "Last 90 days"), h("dl", { class: "dl" }, ...[["Requested", s.requested], ["Scheduled", s.scheduled], ["Completed", s.completed], ["Overnights", s.overnights], ["Denied or disputed", s.denied]].flatMap(([a, b]) => [h("dt", null, a), h("dd", null, String(b))])),
        h("div", { class: "row", style: { marginTop: "8px" } }, h("a", { class: "btn small", href: `#/new/parenting?child=${id}` }, icon("plus"), "Parenting time"), h("a", { class: "btn small", href: `#/new/expense?child=${id}` }, icon("plus"), "Expense")))),
    h("section", { class: "section" }, h("h2", null, `Records about ${childName(id)} (${related.length})`), related.length ? recordList(related) : h("p", { class: "muted" }, "No linked records yet.")));
}
