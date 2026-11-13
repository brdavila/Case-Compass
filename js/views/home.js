// Home: dashboard, calendar & tasks, attorney workspace.
import { h, icon, toast, dialog, deliverFile } from "../ui/dom.js";
import { pageHead, tabs, callout, emptyState, recordList, viewCtx, relTime, evidenceBackedUp } from "../ui/shared.js";
import * as vault from "../core/vault.js";
import * as backup from "../core/backup.js";
import { TYPES, recordDate, isOpen } from "../core/schema.js";
import { fmtDate, fmtTime, todayLocal, addDays, monthLabel, parseLocalDate } from "../core/util.js";
import { parentingStats } from "../reports/model.js";
import { buildICS } from "../reports/ics.js";
import { PROTOCOLS } from "../../data/checklists-data.js";

export const HOME_TABS = [["#/home", "Today"], ["#/home/calendar", "Calendar & Tasks"], ["#/home/attorneys", "Attorney Workspace"]];

function orientation() {
  const s = vault.settings();
  if (s.orientationDismissed) return null;
  const card = h("section", { class: "card accent section" },
    h("h2", null, "Welcome to Case Compass"),
    h("p", { class: "muted" }, "A quick orientation. You can come back to these steps any time in Resources › Guides."),
    h("ol", null,
      h("li", null, h("b", null, "Document"), " events soon after they happen, in factual language. Each record shows the event date and the date you entered it."),
      h("li", null, h("b", null, "Attach evidence"), " (photos, screenshots, PDFs). Originals are stored unchanged and fingerprinted."),
      h("li", null, h("b", null, "Track"), " parenting time, communications, appointments, and deadlines from official papers."),
      h("li", null, h("b", null, "Back up"), " regularly with an encrypted backup stored somewhere other than this device."),
      h("li", null, h("b", null, "Use Quick Exit"), " (top right) to lock the app and open a neutral website. It cannot erase browser history.")),
    h("div", { class: "row" },
      h("a", { class: "btn primary", href: "#/resources/guides/start-here" }, "Open the Start Here checklist"),
      h("button", { class: "btn", type: "button", onclick: async () => { await vault.updateSettings({ orientationDismissed: true }); card.remove(); } }, "Dismiss")));
  return card;
}

export function dashboard() {
  const all = vault.listRecords();
  const today = todayLocal();
  const tasks = all.filter((r) => r.type === "task");
  const openTasks = tasks.filter(isOpen).sort((a, b) => (a.data.dueDate + (a.data.dueTime || "") < b.data.dueDate + (b.data.dueTime || "") ? -1 : 1));
  const overdue = openTasks.filter((t) => t.data.dueDate < today);
  const upcoming = openTasks.filter((t) => t.data.dueDate >= today && t.data.dueDate <= addDays(today, 30));
  const dueToday = openTasks.filter((t) => t.data.dueDate === today);
  const recent = [...all].filter((r) => r.type !== "child").sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 5);
  const openFollowUps = all.filter((r) => r.type !== "task" && isOpen(r));
  const last = backup.lastBackup();
  const evidence = all.filter((r) => r.type === "evidence");
  const pendingEvidence = evidence.filter((r) => !evidenceBackedUp(r));
  const changedSinceBackup = last ? all.filter((r) => r.updatedAt > last.at).length : all.length;
  const cl = vault.getKV("checklists", {});
  const totalItems = PROTOCOLS.reduce((s, p) => s + p.items.length, 0);
  const doneItems = PROTOCOLS.reduce((s, p) => s + p.items.filter((i) => cl[i.id]?.done).length, 0);
  const st30 = parentingStats(all, { start: addDays(today, -30), end: today });

  const needs = [];
  if (overdue.length) needs.push(h("li", null, h("a", { class: "item", href: "#/home/calendar" }, h("span", { class: "ic" }, icon("alert")), h("span", { class: "body" }, h("span", { class: "title" }, `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`), h("span", { class: "meta" }, overdue.slice(0, 3).map((t) => t.data.title).join(" · "))))));
  if (!last && all.length) needs.push(h("li", null, h("a", { class: "item", href: "#/reports/backup" }, h("span", { class: "ic" }, icon("backup")), h("span", { class: "body" }, h("span", { class: "title" }, "No encrypted backup yet"), h("span", { class: "meta" }, "Make a backup and store it somewhere other than this device.")))));
  else if (last && changedSinceBackup) needs.push(h("li", null, h("a", { class: "item", href: "#/reports/backup" }, h("span", { class: "ic" }, icon("backup")), h("span", { class: "body" }, h("span", { class: "title" }, `${changedSinceBackup} record${changedSinceBackup > 1 ? "s" : ""} changed since your last backup`), h("span", { class: "meta" }, `Last verified backup ${relTime(last.at)}`)))));
  if (pendingEvidence.length) needs.push(h("li", null, h("a", { class: "item", href: "#/document?evidence=notbacked" }, h("span", { class: "ic" }, icon("paperclip")), h("span", { class: "body" }, h("span", { class: "title" }, `${pendingEvidence.length} evidence item${pendingEvidence.length > 1 ? "s" : ""} not yet in a verified backup`), h("span", { class: "meta" }, "Back up to protect attachments.")))));
  if (openFollowUps.length) needs.push(h("li", null, h("a", { class: "item", href: "#/document" }, h("span", { class: "ic" }, icon("list")), h("span", { class: "body" }, h("span", { class: "title" }, `${openFollowUps.length} open follow-up${openFollowUps.length > 1 ? "s" : ""}`), h("span", { class: "meta" }, openFollowUps.slice(0, 3).map((r) => r.ref).join(", "))))));

  return h("div", null,
    pageHead("Home", { sub: fmtDate(today, { weekday: true, long: true }) }),
    tabs(HOME_TABS, "#/home"),
    orientation(),
    dueToday.length ? callout("info", h("p", null, h("b", null, "Today: "), dueToday.map((t) => `${t.data.title}${t.data.dueTime ? ` at ${fmtTime(t.data.dueTime)}` : ""}`).join(" · "))) : null,
    h("section", { class: "section" }, h("h2", null, "What should I do today?"),
      h("div", { class: "actions" },
        h("a", { class: "action", href: "#/new/incident" }, icon("alert"), "Record an Incident"),
        h("a", { class: "action", href: "#/new/communication" }, icon("chat"), "Log Communication"),
        h("a", { class: "action", href: "#/new/parenting" }, icon("calendar"), "Record Parenting Time"),
        h("a", { class: "action", href: "#/new/evidence" }, icon("paperclip"), "Add Evidence")),
      h("div", { class: "linkrow", style: { marginTop: "10px" } },
        h("a", { class: "btn small", href: "#/resources/protection" }, icon("shield"), "View Checklists"),
        h("a", { class: "btn small", href: "#/resources/forms" }, icon("doc"), "Find Court Forms"),
        h("a", { class: "btn small", href: "#/reports" }, icon("report"), "Generate Report"))),
    h("section", { class: "section" }, h("h2", null, "What needs attention?"),
      needs.length ? h("ul", { class: "list" }, ...needs) : h("p", { class: "muted" }, "Nothing urgent. Everything is up to date."),
      h("h3", { style: { marginTop: "14px" } }, "Next appointments and deadlines"),
      upcoming.length ? recordList(upcoming.slice(0, 5), { showType: false }) : h("p", { class: "muted" }, "No appointments or deadlines in the next 30 days. ", h("a", { href: "#/new/task" }, "Add one"))),
    h("section", { class: "section" }, h("h2", null, "What have I documented?"),
      h("div", { class: "grid four" },
        stat(all.filter((r) => r.type === "incident").length, "Incidents", "#/document/incident"),
        stat(all.filter((r) => r.type === "communication").length, "Communications", "#/parenting/communication"),
        stat(all.filter((r) => r.type === "parenting").length, "Parenting entries", "#/parenting/time"),
        stat(evidence.length, "Evidence items", "#/document/evidence")),
      h("div", { class: "grid two", style: { marginTop: "12px" } },
        h("div", { class: "card" }, h("h3", null, "Parenting time – last 30 days"),
          h("div", { class: "bars" }, bar("Requested", st30.requested, st30, "alt"), bar("Scheduled", st30.scheduled, st30, ""), bar("Completed", st30.completed, st30, "ok"), bar("Denied / disputed", st30.denied, st30, "danger")),
          h("p", { class: "muted small", style: { marginTop: "8px" } }, `${st30.overnights} overnight${st30.overnights === 1 ? "" : "s"} · `, h("a", { href: "#/parenting" }, "Open comparison"))),
        h("div", { class: "card" }, h("h3", null, "Security checklists"),
          h("div", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(totalItems), "aria-valuenow": String(doneItems), "aria-label": "Security checklist progress" }, h("span", { style: { width: `${totalItems ? (doneItems / totalItems) * 100 : 0}%` } })),
          h("p", { class: "muted small", style: { marginTop: "8px" } }, `${doneItems} of ${totalItems} steps complete · `, h("a", { href: "#/resources/protection" }, "Continue")),
          h("h3", { style: { marginTop: "10px" } }, "Backup status"),
          h("p", { class: last ? "" : "muted" }, last ? `Last verified encrypted backup: ${fmtDate(last.at)} (${relTime(last.at)})` : "No backup yet."),
          h("a", { class: "btn small", href: "#/reports/backup" }, icon("backup"), "Back up now"))),
      h("h3", { style: { marginTop: "16px" } }, "Recently saved"),
      recent.length ? recordList(recent) : emptyState("No records yet. Your vault starts empty; nothing is pre-filled.")),
    h("section", { class: "section" }, h("h2", null, "Where do I find help?"),
      h("div", { class: "grid three" },
        helpCard("Emergency", "Call 911. Pueblo domestic violence hotline (24 hours): 719-545-8195. Crisis line: call or text 988.", "#/resources?section=crisis"),
        helpCard("Court & legal help", "Pueblo Combined Court Self-Help Center, Colorado Legal Services, court forms.", "#/resources?section=courts"),
        helpCard("Protection & Security", "Step-by-step checklists for safety, accounts, devices, home, and finances.", "#/resources/protection"))));
}

function stat(n, label, href) { return h("a", { class: "stat", href, style: { textDecoration: "none", color: "inherit" } }, h("div", { class: "n" }, String(n)), h("div", { class: "l" }, label)); }
function bar(label, v, st, cls) { const max = Math.max(1, st.requested, st.scheduled, st.completed, st.denied); return h("div", { class: "bar" }, h("span", null, label), h("span", { class: "track" }, h("span", { class: `fill ${cls}`, style: { width: `${(v / max) * 100}%` } })), h("span", { class: "v" }, String(v))); }
function helpCard(title, text, href) { return h("a", { class: "card", href, style: { textDecoration: "none", color: "inherit" } }, h("h3", null, title), h("p", { class: "muted small", style: { margin: 0 } }, text)); }

// ───── Calendar & tasks ─────
let calMonth = null, calSelected = null;
export function calendar(query = {}) {
  const today = todayLocal();
  calMonth = query.month || calMonth || today.slice(0, 7);
  calSelected = calSelected || today;
  const all = vault.listRecords();
  const tasks = all.filter((r) => r.type === "task");
  const pts = all.filter((r) => r.type === "parenting" && /Scheduled|Requested/.test(r.data?.entryType || ""));
  const grid = h("div", { class: "cal", role: "grid", "aria-label": `Calendar for ${monthLabel(calMonth)}` });
  const dayList = h("div", { class: "stack", "aria-live": "polite" });
  const head = h("h2", { style: { margin: 0 } }, monthLabel(calMonth));
  const renderDay = () => {
    const items = [...tasks.filter((t) => t.data.dueDate === calSelected), ...pts.filter((p) => p.data.date === calSelected)];
    dayList.replaceChildren(h("h3", null, fmtDate(calSelected, { weekday: true, long: true })), items.length ? recordList(items) : h("p", { class: "muted" }, "Nothing scheduled."), h("a", { class: "btn small", href: `#/new/task?date=${calSelected}` }, icon("plus"), "Add task on this day"));
  };
  const renderGrid = () => {
    head.textContent = monthLabel(calMonth);
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1); const start = new Date(first); start.setDate(1 - first.getDay());
    grid.replaceChildren(...["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => h("div", { class: "dow", role: "columnheader" }, d)));
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = todayLocal(d);
      const dayTasks = tasks.filter((t) => t.data.dueDate === ds && isOpen(t));
      const dayPts = pts.filter((p) => p.data.date === ds);
      const b = h("button", { type: "button", class: `${d.getMonth() !== m - 1 ? "out" : ""} ${ds === today ? "today" : ""}`, "aria-pressed": String(ds === calSelected), "aria-label": `${fmtDate(ds, { long: true })}${dayTasks.length ? `, ${dayTasks.length} open task(s)` : ""}${dayPts.length ? `, ${dayPts.length} parenting entry(ies)` : ""}` },
        h("span", null, String(d.getDate())), h("span", { class: "dots" }, ...dayTasks.slice(0, 3).map((t) => h("span", { class: `dot ${t.data.priority === "High" ? "hi" : ""}` })), ...dayPts.slice(0, 2).map(() => h("span", { class: "dot pt" }))));
      b.addEventListener("click", () => { calSelected = ds; renderGrid(); renderDay(); });
      grid.append(b);
    }
  };
  const shift = (n) => { const [y, m] = calMonth.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; renderGrid(); };
  renderGrid(); renderDay();

  const open = tasks.filter(isOpen).sort((a, b) => (a.data.dueDate < b.data.dueDate ? -1 : 1));
  const done = tasks.filter((t) => !isOpen(t)).sort((a, b) => (a.data.dueDate < b.data.dueDate ? 1 : -1));
  const overdue = open.filter((t) => t.data.dueDate < today), soon = open.filter((t) => t.data.dueDate >= today && t.data.dueDate <= addDays(today, 30)), later = open.filter((t) => t.data.dueDate > addDays(today, 30));

  return h("div", null,
    pageHead("Calendar & Tasks", { actions: [h("a", { class: "btn primary", href: "#/new/task" }, icon("plus"), "New task"), h("button", { class: "btn", type: "button", onclick: () => exportICS(open) }, icon("calendar"), "Add to device calendar")] }),
    tabs(HOME_TABS, "#/home/calendar"),
    callout("info", h("p", null, h("b", null, "About reminders: "), "Case Compass shows due items when it is open, but it cannot send notifications while it is closed. To get alerts, use “Add to device calendar” to copy appointments into your phone's calendar app. Court deadlines must come from official papers; the app never calculates them.")),
    h("div", { class: "grid two section" },
      h("div", { class: "card" }, h("div", { class: "row between", style: { marginBottom: "10px" } }, h("button", { class: "iconbtn", type: "button", "aria-label": "Previous month", onclick: () => shift(-1) }, icon("back")), head, h("button", { class: "iconbtn", type: "button", "aria-label": "Next month", onclick: () => shift(1), style: { transform: "scaleX(-1)" } }, icon("back"))), grid,
        h("p", { class: "small muted", style: { marginTop: "8px" } }, h("span", { class: "badge" }, "● task"), " ", h("span", { class: "badge danger" }, "● high priority"), " ", h("span", { class: "badge ok" }, "● parenting time"))),
      h("div", { class: "card" }, dayList)),
    overdue.length ? h("section", { class: "section" }, h("h2", null, `Overdue (${overdue.length})`), recordList(overdue)) : null,
    h("section", { class: "section" }, h("h2", null, `Next 30 days (${soon.length})`), soon.length ? recordList(soon) : h("p", { class: "muted" }, "Nothing due in the next 30 days.")),
    later.length ? h("section", { class: "section" }, h("h2", null, `Later (${later.length})`), recordList(later)) : null,
    done.length ? h("details", { class: "disclose section" }, h("summary", null, `Completed or cancelled (${done.length})`), h("div", { class: "inner" }, recordList(done))) : null);
}

async function exportICS(open) {
  const upcoming = open.filter((t) => t.data.dueDate >= todayLocal());
  if (!upcoming.length) { toast("No upcoming open tasks to export.", "warn"); return; }
  const generic = h("input", { type: "checkbox", id: "ics-generic", checked: true });
  const alarm = h("select", { id: "ics-alarm" }, ...[["0", "No alert"], ["60", "1 hour before"], ["1440", "1 day before"], ["2880", "2 days before"]].map(([v, l]) => h("option", { value: v }, l)));
  alarm.value = "1440";
  const ok = await dialog({ title: "Add to device calendar", body: h("div", { class: "form" },
    h("p", null, `${upcoming.length} upcoming item(s) will be saved as a calendar file (.ics) that your calendar app can import.`),
    h("label", { class: "check", for: "ics-generic" }, generic, h("span", null, "Use generic titles (for example “Appointment”) so the calendar does not reveal details. Recommended if others can see your calendar.")),
    h("div", { class: "field" }, h("label", { for: "ics-alarm" }, "Alert"), alarm),
    callout("warn", "The calendar file and your calendar app are outside the encrypted vault.")),
    actions: [{ label: "Cancel", value: false }, { label: "Create calendar file", kind: "primary", value: true }] });
  if (!ok) return;
  const ics = buildICS(upcoming.map((t) => ({ uid: t.id, title: generic.checked ? (t.data.kind === "Court hearing" ? "Appointment" : t.data.kind || "Appointment") : t.data.title, date: t.data.dueDate, time: t.data.dueTime, tz: t.data.tz, location: generic.checked ? "" : t.data.location, description: generic.checked ? "" : t.data.description, alarmMinutes: Number(alarm.value) || 0 })));
  await deliverFile(new TextEncoder().encode(ics), `case-compass-calendar-${todayLocal()}.ics`, "text/calendar", { note: "Open the file on your phone or computer to add the events to your calendar." });
  vault.audit("export", { summary: `Calendar file exported (${upcoming.length} events)` });
}

// ───── Attorney workspace ─────
export function attorneys() {
  const list = vault.listRecords({ type: "attorney" }).sort((a, b) => ((a.data.consultDate || "") < (b.data.consultDate || "") ? 1 : -1));
  return h("div", null,
    pageHead("Attorney Workspace", { sub: "Prepare questions, track consultations, and record follow-ups.", actions: [h("a", { class: "btn primary", href: "#/new/attorney" }, icon("plus"), "New consultation")] }),
    tabs(HOME_TABS, "#/home/attorneys"),
    h("div", { class: "grid two section" },
      h("div", { class: "card accent" }, h("h2", null, "Attorney preparation packet"), h("p", { class: "muted" }, "Questions, key dates, a timeline summary, parenting-time comparison, police contacts, and an evidence index. Private notes, earlier advice, and detailed child information are left out unless you choose to include them."), h("a", { class: "btn primary", href: "#/reports?kind=attorney" }, icon("report"), "Create packet")),
      h("div", { class: "card" }, h("h2", null, "Finding an attorney"), h("ul", null, h("li", null, h("a", { href: "#/resources?q=Colorado%20Legal%20Services" }, "Colorado Legal Services (free if eligible)")), h("li", null, h("a", { href: "#/resources?q=Find%20a%20Lawyer" }, "Colorado Bar Association – Find a Lawyer")), h("li", null, h("a", { href: "#/resources?q=low-cost" }, "Free or low-cost legal services list"))), h("p", { class: "muted small" }, "Notes you keep here are your understanding of what you were told, not legal advice."))),
    h("section", { class: "section" }, h("h2", null, "Consultations"), list.length ? recordList(list, { showType: false }) : emptyState("No consultations recorded yet.", h("a", { class: "btn primary", href: "#/new/attorney" }, icon("plus"), "Add an attorney or consultation"))));
}
