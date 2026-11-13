// Resources: atlas directory, Protection & Security Center, court forms, guides, downloads library.
// Available without unlocking the vault; checklist progress saves only when unlocked.
import { h, icon, toast, pickFile, readFileText, dialog } from "../ui/dom.js";
import { pageHead, tabs, callout, emptyState, navigate } from "../ui/shared.js";
import { recordPicker } from "../ui/forms.js";
import * as vault from "../core/vault.js";
import { fmtDate, parseCSV, todayLocal, uuid } from "../core/util.js";
import { SECTIONS, RESOURCES, RESOURCES_COMPILED } from "../../data/resources-data.js";
import { FORM_GROUPS, FORMS_CHECKED } from "../../data/forms-data.js";
import { PROTOCOLS, PROTOCOL_INTRO } from "../../data/checklists-data.js";
import { GUIDES, LIBRARY, SOURCE_GAPS } from "../../data/guides-data.js";
import { LINK_STATUS, LINK_CHECK_DATE } from "../../data/link-status.js";

export const RES_TABS = [["#/resources", "Directory"], ["#/resources/protection", "Protection & Security"], ["#/resources/forms", "Court Forms"], ["#/resources/library", "Guides & Downloads"]];
const STATUS_LABEL = { official: ["Official source", "ok"], "court-listed": ["Court-listed provider", "ok"], provider: ["Provider website", "accent"], "needs-check": ["Verify details", "warn"], retired: ["Retired", "danger"] };

function linkBadge(url) {
  if (!url) return null;
  const s = LINK_STATUS[url];
  if (!s) return h("span", { class: "badge" }, "Link not yet checked");
  if (s.rateLimited) return h("span", { class: "badge ok", title: "The site answered but asked automated checkers to slow down (HTTP 429)." }, `Site responded ${fmtDate(LINK_CHECK_DATE)}`);
  if (s.redirectOnly) return h("span", { class: "badge ok", title: `The address answered with a redirect to ${s.finalUrl}` }, `Link checked ${fmtDate(LINK_CHECK_DATE)} (redirects)`);
  if (s.ok) return h("span", { class: "badge ok", title: s.finalUrl ? `Redirects to ${s.finalUrl}` : "" }, `Link checked ${fmtDate(LINK_CHECK_DATE)}`);
  if (s.blocked) return h("span", { class: "badge warn", title: "The site blocks automated checks; open it in your browser to confirm." }, "Automated check blocked");
  return h("span", { class: "badge danger" }, `Link problem (${s.status || "no response"})`);
}

function extLink(url, label = "Open website") {
  return h("a", { class: "btn small ext", href: url, target: "_blank", rel: "noopener noreferrer" }, icon("globe"), label);
}

function customResources() { return vault.isUnlocked() ? vault.getKV("customResources", []) : []; }

function resourceCard(r) {
  const [label, cls] = STATUS_LABEL[r.sourceStatus] || ["Source", ""];
  const replaced = r.replacedBy ? RESOURCES.find((x) => x.id === r.replacedBy) : null;
  const phones = r.phone ? String(r.phone).split(/;|(?<=\d)\s+or\s+/) : [];
  const kv = [["Purpose", r.purpose], ["Phone", r.phone ? h("span", null, ...phones.map((p, i) => [i ? " · " : "", /^[\d\s().+-]{3,}$/.test(p.replace(/\(.*?\)/g, "").replace(/ext\..*/, "").trim()) ? h("a", { href: `tel:${p.replace(/\(.*?\)/g, "").replace(/ext\..*/, "").replace(/[^\d+]/g, "")}` }, p.trim()) : p.trim()])) : null], ["Location", r.location], ["Format", r.format], ["Cost", r.cost], ["Pueblo County", r.puebloAcceptance], ["Limits", r.eligibility], ["Next step", r.nextStep]].filter(([, v]) => v);
  return h("article", { class: `card res ${r.sourceStatus === "retired" ? "retired" : ""}`, id: `res-${r.id}` },
    h("div", { class: "head" }, h("h3", null, r.name), h("span", { class: `badge ${cls}` }, label)),
    h("p", { class: "muted small", style: { margin: "6px 0 0" } }, r.description),
    h("div", { class: "kv" }, ...kv.flatMap(([k, v]) => [h("b", null, k), h("span", null, v)])),
    replaced ? callout("warn", h("p", null, "Replaced by ", h("a", { href: `#/resources?q=${encodeURIComponent(replaced.name)}` }, replaced.name))) : null,
    h("div", { class: "row" }, r.url ? extLink(r.url) : null, linkBadge(r.url), r.url ? h("span", { class: "faint small" }, "Requires internet") : null, r.custom ? h("span", { class: "badge" }, "Imported by you") : null));
}

export function directory(query = {}) {
  const st = { q: query.q || "", section: query.section || "", pueblo: false, online: false, free: false };
  const input = h("input", { type: "search", placeholder: "Search resources (e.g., fee waiver, parenting class, AirTag)", "aria-label": "Search resources", value: st.q });
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Sections" });
  const results = h("div", { "aria-live": "polite" });
  const count = h("p", { class: "muted small" });
  const toggles = [["pueblo", "Pueblo-listed classes"], ["online", "Online"], ["free", "Free"]];
  const renderChips = () => chips.replaceChildren(
    h("button", { type: "button", class: "chip toggle", "aria-pressed": String(!st.section), onclick: () => { st.section = ""; renderChips(); render(); } }, "All"),
    ...SECTIONS.map((s) => h("button", { type: "button", class: "chip toggle", "aria-pressed": String(st.section === s.id), onclick: () => { st.section = st.section === s.id ? "" : s.id; renderChips(); render(); } }, s.title)),
    ...toggles.map(([k, l]) => h("button", { type: "button", class: "chip toggle", "aria-pressed": String(st[k]), onclick: () => { st[k] = !st[k]; renderChips(); render(); } }, l)));
  const render = () => {
    const q = st.q.toLowerCase().trim();
    const list = [...RESOURCES, ...customResources()].filter((r) => {
      if (st.section && r.section !== st.section) return false;
      if (st.pueblo && !(r.tags || []).includes("pueblo-listed")) return false;
      if (st.online && !/online/i.test(`${r.format || ""} ${(r.tags || []).join(" ")}`)) return false;
      if (st.free && !/free/i.test(`${r.cost || ""} ${(r.tags || []).join(" ")}`)) return false;
      return !q || `${r.name} ${r.description} ${r.purpose || ""} ${(r.tags || []).join(" ")} ${r.phone || ""} ${r.location || ""}`.toLowerCase().includes(q);
    });
    count.textContent = `${list.length} resource${list.length === 1 ? "" : "s"}`;
    const bySection = SECTIONS.map((s) => [s, list.filter((r) => r.section === s.id)]).filter(([, l]) => l.length);
    const custom = list.filter((r) => !SECTIONS.some((s) => s.id === r.section));
    results.replaceChildren(...(list.length ? [...bySection.map(([s, l]) => h("section", { class: "section" }, h("h2", null, `${s.title} (${l.length})`), h("div", { class: "grid two" }, ...l.map(resourceCard)))), custom.length ? h("section", { class: "section" }, h("h2", null, "Imported resources"), h("div", { class: "grid two" }, ...custom.map(resourceCard))) : null] : [emptyState("No resources match. Try a different word.")]));
  };
  input.addEventListener("input", () => { st.q = input.value; render(); });
  renderChips(); render();
  return h("div", null,
    pageHead("Resources", { sub: "Verified Colorado and Pueblo County legal, safety, family, and technical resources." }),
    tabs(RES_TABS, "#/resources"),
    !vault.isUnlocked() ? callout("info", "You are browsing without unlocking. Resources never require your private records.") : null,
    h("div", { class: "stack" }, input, chips, count),
    results,
    h("section", { class: "section card" }, h("h2", null, "About this directory"),
      h("p", { class: "muted small" }, `Compiled ${fmtDate(RESOURCES_COMPILED, { long: true })} from official sources and providers' own websites. Every link was checked on ${fmtDate(LINK_CHECK_DATE, { long: true })}; some sites block automated checks and are marked. Phone numbers are listed only where confirmed on an official or provider page. Parenting-class details come from the Colorado Judicial Branch directory. Services, prices, and hours change; confirm before relying on them.`),
      vault.isUnlocked() ? h("button", { class: "btn small", type: "button", onclick: importResources }, icon("upload"), "Import resources from CSV") : null));
}

async function importResources() {
  const file = await pickFile({ accept: ".csv,text/csv" });
  if (!file) return;
  const rows = parseCSV(await readFileText(file));
  if (rows.length < 2) { toast("The CSV needs a header row and at least one resource.", "err"); return; }
  const head = rows[0].map((x) => x.trim().toLowerCase());
  const col = (names) => head.findIndex((x) => names.some((n) => x.includes(n)));
  const ci = { name: col(["name", "resource", "title"]), category: col(["category", "section", "type"]), description: col(["description", "details", "notes"]), url: col(["url", "website", "link"]), phone: col(["phone", "tel"]), location: col(["location", "address"]), cost: col(["cost", "fee", "price"]) };
  if (ci.name < 0) { toast("A column named Name is required.", "err"); return; }
  const items = rows.slice(1).map((r) => ({ id: `custom-${uuid()}`, custom: true, section: "custom", name: r[ci.name] || "Untitled", description: [r[ci.category] ? `Category: ${r[ci.category]}.` : "", ci.description >= 0 ? r[ci.description] : ""].join(" ").trim(), url: ci.url >= 0 && /^https:\/\//.test(r[ci.url] || "") ? r[ci.url] : "", phone: ci.phone >= 0 ? r[ci.phone] : "", location: ci.location >= 0 ? r[ci.location] : "", cost: ci.cost >= 0 ? r[ci.cost] : "", sourceStatus: "needs-check", tags: ["imported"] })).filter((x) => x.name);
  const existing = vault.getKV("customResources", []);
  const names = new Set(existing.map((x) => x.name.toLowerCase()));
  const fresh = items.filter((x) => !names.has(x.name.toLowerCase()));
  await vault.setKV("customResources", [...existing, ...fresh]);
  toast(`${fresh.length} resource(s) imported${items.length - fresh.length ? `, ${items.length - fresh.length} duplicate(s) skipped` : ""}. Only https links are kept.`);
  navigate(`#/resources?t=${Date.now()}`, { replace: true });
}

// ───── Protection & Security ─────
function clState() { return vault.isUnlocked() ? vault.getKV("checklists", {}) : {}; }

export function protection() {
  const st = clState();
  return h("div", null,
    pageHead("Protection & Security", { sub: "Independent, step-by-step protocols. Each step explains what to do, why, and how." }),
    tabs(RES_TABS, "#/resources/protection"),
    !vault.isUnlocked() ? callout("info", h("p", null, "You can read every protocol now. ", h("a", { href: "#/unlock" }, "Unlock"), " to save your progress.")) : null,
    h("div", { class: "card warn section" }, h("h2", null, "Before you change anything"), h("ul", null, ...PROTOCOL_INTRO.map((p) => h("li", null, p)))),
    h("div", { class: "grid two section" }, ...PROTOCOLS.map((p) => {
      const done = p.items.filter((i) => st[i.id]?.done).length;
      return h("a", { class: "card", href: `#/resources/protection/${p.id}`, style: { textDecoration: "none", color: "inherit" } },
        h("div", { class: "row between" }, h("h2", { style: { margin: 0 } }, `${p.id}. ${p.title}`), h("span", { class: `badge ${done === p.items.length ? "ok" : ""}` }, `${done}/${p.items.length}`)),
        h("p", { class: "muted small", style: { margin: "6px 0 10px" } }, p.summary),
        h("div", { class: "progress", "aria-hidden": "true" }, h("span", { style: { width: `${(done / p.items.length) * 100}%` } })));
    })),
    h("p", { class: "muted small" }, "These steps are general safety and organization information, not legal advice. Talk with an advocate or attorney about your specific situation."));
}

export function protocolDetail(pid) {
  const p = PROTOCOLS.find((x) => x.id === pid);
  if (!p) return emptyState("Protocol not found.");
  const unlocked = vault.isUnlocked();
  const st = clState();
  const progress = h("span", { class: "badge" });
  const updateProgress = () => { const s = clState(); progress.textContent = `${p.items.filter((i) => s[i.id]?.done).length} of ${p.items.length} complete`; };
  updateProgress();
  const save = async (id, patch) => { if (!unlocked) return; const s = vault.getKV("checklists", {}); s[id] = { ...(s[id] || {}), ...patch }; await vault.setKV("checklists", s); updateProgress(); };
  const items = p.items.map((it) => {
    const s = st[it.id] || {};
    const cb = h("input", { type: "checkbox", id: `cl-${it.id}`, checked: !!s.done, disabled: !unlocked });
    const date = h("input", { type: "date", id: `cld-${it.id}`, value: s.date || "", disabled: !unlocked });
    const notes = h("textarea", { id: `cln-${it.id}`, rows: 2, disabled: !unlocked }); notes.value = s.notes || "";
    const evList = h("div", { class: "chips" });
    const renderEv = () => { const ids = (clState()[it.id]?.evidence) || []; evList.replaceChildren(...ids.map((eid) => { const r = vault.getRecord(eid); return r ? h("a", { class: "chip", href: `#/record/${eid}` }, h("span", null, `${r.ref} · ${r.data.title || ""}`)) : null; })); };
    renderEv();
    cb.addEventListener("change", async () => { if (cb.checked && !date.value) date.value = todayLocal(); await save(it.id, { done: cb.checked, date: cb.checked ? date.value : "" }); toast(cb.checked ? `${it.id} marked complete` : `${it.id} marked not complete`); });
    date.addEventListener("change", () => save(it.id, { date: date.value }));
    notes.addEventListener("change", () => save(it.id, { notes: notes.value }));
    const res = (it.resources || []).map((rid) => RESOURCES.find((r) => r.id === rid)).filter(Boolean);
    return h("details", { class: "disclose", id: `item-${it.id}` },
      h("summary", null, h("span", { class: `badge ${s.done ? "ok" : ""}` }, s.done ? "Done" : it.id), h("span", null, it.title)),
      h("div", { class: "inner stack" },
        h("div", null, h("h4", null, "Why it matters"), h("p", null, it.why)),
        h("div", null, h("h4", null, "How to do it"), h("ol", null, ...it.how.map((x) => h("li", null, x)))),
        it.caution ? callout("warn", h("p", null, h("b", null, "Safety and legal considerations: "), it.caution)) : null,
        res.length ? h("div", null, h("h4", null, "Resources"), h("div", { class: "linkrow" }, ...res.map((r) => r.url ? h("a", { class: "btn small ext", href: r.url, target: "_blank", rel: "noopener noreferrer" }, r.name) : h("a", { class: "btn small", href: `#/resources?q=${encodeURIComponent(r.name)}` }, r.name)))) : null,
        h("fieldset", null, h("legend", null, "My progress"),
          h("label", { class: "check", for: `cl-${it.id}` }, cb, h("span", null, "Completed")),
          h("div", { class: "field" }, h("label", { for: `cld-${it.id}` }, "Date completed"), date),
          h("div", { class: "field" }, h("label", { for: `cln-${it.id}` }, "Notes (private)"), notes),
          h("div", { class: "field" }, h("span", { class: "label" }, "Related evidence"), evList, unlocked ? h("button", { class: "btn small", type: "button", onclick: async () => { const r = await recordPicker({ title: "Link evidence to this step", only: "evidence" }); if (!r) return; const cur = clState()[it.id]?.evidence || []; await save(it.id, { evidence: [...new Set([...cur, r.id])] }); renderEv(); } }, icon("link"), "Link evidence") : null),
          !unlocked ? h("p", { class: "muted small" }, "Unlock the vault to save progress.") : null)));
  });
  return h("div", null,
    pageHead(`Protocol ${p.id}: ${p.title}`, { crumbs: [{ label: "Protection & Security", href: "#/resources/protection" }, { label: `Protocol ${p.id}` }], sub: p.summary }),
    h("div", { class: "row", style: { marginBottom: "12px" } }, progress, h("a", { class: "btn small", href: "#/reports?kind=checklist" }, icon("report"), "Print checklists")),
    h("div", { class: "stack" }, ...items),
    h("div", { class: "row section" }, ...PROTOCOLS.filter((x) => x.id !== p.id).map((x) => h("a", { class: "btn small", href: `#/resources/protection/${x.id}` }, `${x.id}. ${x.title}`))));
}

// ───── Court forms ─────
export function forms(query = {}) {
  const input = h("input", { type: "search", placeholder: "Search forms (e.g., JDF 1406, fee waiver, parenting plan)", "aria-label": "Search court forms", value: query.q || "" });
  const box = h("div", { "aria-live": "polite" });
  const render = () => {
    const q = input.value.toLowerCase().replace(/\s+/g, " ").trim();
    const groups = FORM_GROUPS.map((g) => ({ ...g, forms: g.forms.filter((f) => !q || `${g.title} ${g.use} ${f.id} ${f.id.replace(/\s/g, "")} ${f.title}`.toLowerCase().includes(q)) })).filter((g) => g.forms.length || (!q || `${g.title} ${g.use}`.toLowerCase().includes(q)));
    box.replaceChildren(...groups.map((g) => h("section", { class: "card section" },
      h("h2", null, g.title),
      h("p", null, h("b", null, "When it may apply: "), g.use),
      h("p", { class: "muted" }, h("b", null, "Not for: "), g.notFor),
      h("ul", { class: "list" }, ...g.forms.map((f) => h("li", null, h("a", { class: "item", href: f.url, target: "_blank", rel: "noopener noreferrer" },
        h("span", { class: "ic" }, icon(f.kind === "instructions" ? "book" : "doc")),
        h("span", { class: "body" }, h("span", { class: "title" }, `${f.id} – ${f.title}`),
          h("span", { class: "meta" }, h("span", { class: `badge ${f.kind === "instructions" ? "accent" : "ok"}` }, f.kind === "instructions" ? "Official instructions" : "Official court form"), h("span", null, f.fileType), linkBadge(f.url)),
          f.note ? h("span", { class: "snippet" }, f.note) : null))))),
      h("div", { class: "row", style: { marginTop: "10px" } }, extLink(g.categoryUrl, "All forms in this category"), linkBadge(g.categoryUrl)))));
    if (!groups.length) box.replaceChildren(emptyState("No forms match."));
  };
  input.addEventListener("input", render); render();
  return h("div", null,
    pageHead("Court Forms", { sub: "Official Colorado Judicial Branch forms, grouped by situation." }),
    tabs(RES_TABS, "#/resources/forms"),
    callout("info", h("p", null, `Forms and links come from the Colorado Judicial Branch self-help directory (checked ${fmtDate(FORMS_CHECKED, { long: true })}). Courts revise forms; always download the current version. Case Compass does not fill out or file forms, and it never creates documents that look like they were issued by a court.`)),
    callout("warn", h("p", null, h("b", null, "Not every form applies to every situation. "), "First decide whether you are starting a new case, changing an existing order, or enforcing one. The ", h("a", { href: "#/resources?q=Self-Help" }, "Pueblo Self-Help Center"), " can help you choose; an attorney can advise you.")),
    h("div", { class: "stack section" }, input),
    box,
    h("section", { class: "card section" }, h("h2", null, "Informational checklists (Case Compass, not court forms)"),
      h("p", { class: "muted small" }, "These help you prepare. They are not official forms and are never filed with a court."),
      h("div", { class: "linkrow" }, h("a", { class: "btn small", href: "#/resources/guides/parenting-time-checklist" }, "Parenting-time preparation"), h("a", { class: "btn small", href: "#/resources/protection/G" }, "Legal and evidence organization"), h("a", { class: "btn small", href: "#/reports?kind=blank" }, "Blank record-keeping logs"))));
}

// ───── Guides & library ─────
export function guide(id) {
  const g = GUIDES.find((x) => x.id === id);
  if (!g) return emptyState("Guide not found.", h("a", { class: "btn", href: "#/resources/library" }, "All guides"));
  const unlocked = vault.isUnlocked();
  const sections = g.sections.map((s) => h("section", { class: "card section" }, h("h2", null, s.heading),
    ...(s.paragraphs || []).map((p) => h("p", null, p)),
    s.bullets ? h("ul", null, ...s.bullets.map((b) => h("li", null, b))) : null,
    s.checklist ? h("div", null, ...s.checklist.map((c) => {
      const st = clState()[c.id] || {};
      const cb = h("input", { type: "checkbox", id: `g-${c.id}`, checked: !!st.done, disabled: !unlocked });
      cb.addEventListener("change", async () => { const all = vault.getKV("checklists", {}); all[c.id] = { ...(all[c.id] || {}), done: cb.checked, date: cb.checked ? todayLocal() : "" }; await vault.setKV("checklists", all); });
      return h("label", { class: "check", for: `g-${c.id}` }, cb, h("span", null, c.text));
    }), !unlocked ? h("p", { class: "muted small" }, h("a", { href: "#/unlock" }, "Unlock"), " to save checklist progress.") : null) : null));
  return h("div", null, pageHead(g.title, { crumbs: [{ label: "Guides & Downloads", href: "#/resources/library" }, { label: g.title }], sub: g.summary }), ...sections,
    h("div", { class: "row section" }, h("button", { class: "btn small", type: "button", onclick: () => window.print() }, icon("download"), "Print this guide")));
}

export function library() {
  const status = h("div", { "aria-live": "polite" });
  const checkBtn = h("button", { class: "btn small", type: "button", onclick: async () => {
    status.textContent = "Checking bundled files…";
    const files = LIBRARY.filter((x) => x.path);
    const res = await Promise.all(files.map(async (x) => { try { const r = await fetch(x.path, { method: "HEAD", cache: "no-store" }); return [x, r.ok]; } catch { return [x, false]; } }));
    const missing = res.filter(([, ok]) => !ok);
    status.replaceChildren(missing.length ? callout("warn", h("p", null, `${missing.length} bundled file(s) are missing or could not be reached:`), h("ul", null, ...missing.map(([x]) => h("li", null, `${x.title} (${x.path})`)))) : callout("ok", `All ${files.length} bundled files are present.`));
  } }, icon("check"), "Check bundled files");
  return h("div", null,
    pageHead("Guides & Downloads", { sub: "Native guides, interactive checklists, printable files, and samples." }),
    tabs(RES_TABS, "#/resources/library"),
    h("ul", { class: "list" }, ...LIBRARY.map((x) => h("li", null, h("a", { class: "item", href: x.route || x.path, target: x.path ? "_blank" : null, rel: x.path ? "noopener" : null },
      h("span", { class: "ic" }, icon(x.type.includes("PDF") ? "file" : x.type.includes("checklist") ? "check" : x.type.includes("directory") ? "list" : "book")),
      h("span", { class: "body" }, h("span", { class: "title" }, x.title), h("span", { class: "meta" }, h("span", { class: "badge" }, x.type), h("span", null, `Version ${x.version}`), h("span", null, x.offline ? "Works offline" : "Requires internet"))))))),
    h("div", { class: "row section" }, checkBtn), status,
    h("details", { class: "disclose section" }, h("summary", null, "About the original project files"),
      h("div", { class: "inner" },
        h("p", null, "The earlier project's packets, spreadsheets, and planner files were not available when this version was built, so they could not be reviewed or bundled here. Their purposes are covered by the native guides, checklists, directories, and sample reports above, rebuilt from current official sources."),
        h("p", { class: "muted small" }, "Files not available for review:"),
        h("ul", { class: "small muted" }, ...SOURCE_GAPS.map((f) => h("li", null, f))),
        h("p", { class: "muted small" }, "Earlier planner data can be imported with Reports › Import & Migration. A resource spreadsheet saved as CSV can be imported from the Directory."))));
}
