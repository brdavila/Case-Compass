// Schema-driven record form with validation, linking, attachments, and encrypted draft autosave.
import { h, icon, dialog, toast, alertDialog } from "./dom.js";
import { navigate, setGuard, clearGuard, callout, childName, viewCtx } from "./shared.js";
import * as vault from "../core/vault.js";
import { TYPES, recordTitle, recordDate } from "../core/schema.js";
import { todayLocal, deviceTimeZone, debounce, fmtBytes, fmtDate, fmtDateTimeISO, nowISO } from "../core/util.js";
import { sha256Hex } from "../core/crypto.js";

const TZS = ["America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Chicago", "America/New_York", "America/Anchorage", "Pacific/Honolulu", "UTC"];

function initialData(t, prefill) {
  const d = {};
  const s = vault.settings();
  for (const f of t.fields) {
    if (f.defaultToday) d[f.key] = todayLocal();
    if (f.type === "tz") d[f.key] = s.defaultTz || deviceTimeZone();
    if (f.default != null && d[f.key] == null) d[f.key] = f.default;
  }
  return { ...d, ...prefill };
}

function peopleSuggestions() {
  const set = new Set();
  for (const r of vault.listRecords()) for (const f of TYPES[r.type]?.fields || []) if (f.type === "people") for (const p of r.data?.[f.key] || []) set.add(p);
  return [...set].sort();
}

export function recordPicker({ title = "Link a record", only, exclude = [] } = {}) {
  const input = h("input", { type: "search", placeholder: "Search by ID, title, or text", "aria-label": "Search records" });
  const list = h("ul", { class: "list", style: { marginTop: "10px" } });
  let picked = null;
  const all = vault.listRecords({ type: only }).filter((r) => !exclude.includes(r.id)).sort((a, b) => (recordDate(a) < recordDate(b) ? 1 : -1));
  const render = () => {
    const q = input.value.trim().toLowerCase();
    list.replaceChildren(...all.filter((r) => !q || `${r.ref} ${recordTitle(r, viewCtx)} ${JSON.stringify(r.data)}`.toLowerCase().includes(q)).slice(0, 60).map((r) =>
      h("li", null, h("button", { type: "button", class: "item", onclick: () => { picked = r; dlgDone(); } },
        h("span", { class: "body" }, h("span", { class: "title" }, recordTitle(r, viewCtx)), h("span", { class: "meta" }, h("span", null, r.ref), h("span", null, TYPES[r.type].short), h("span", null, fmtDate(recordDate(r)))))))));
    if (!list.children.length) list.append(h("li", { class: "muted" }, "No matching records."));
  };
  let dlgDone = () => {};
  input.addEventListener("input", render);
  render();
  return new Promise((resolve) => {
    const p = dialog({ title, body: h("div", null, input, list), actions: [{ label: "Cancel", value: null }], wide: true });
    dlgDone = () => { const d = document.querySelector("dialog[open]"); d?.closeWith ? d.closeWith(null) : d?.close(); };
    p.then(() => resolve(picked));
  });
}

export async function renderRecordForm({ type, record = null, prefill = {} }) {
  const t = TYPES[type];
  const draftKey = `form:${type}:${record?.id || "new"}`;
  let data = record ? structuredClone(record.data) : initialData(t, prefill);
  const pending = []; // files queued as new evidence
  let evFile = null; // original file for an evidence record
  let dirty = false;
  const controls = {};
  const wraps = {};
  const errs = {};
  const markDirty = () => { dirty = true; saveDraftSoon(); };

  const saveDraftSoon = debounce(() => { if (vault.isUnlocked()) vault.saveDraft(draftKey, { data: collect(), at: nowISO() }).catch(() => {}); }, 1000);

  function collect() {
    const out = { ...data };
    for (const [k, c] of Object.entries(controls)) out[k] = c.get();
    return out;
  }
  function refreshVisibility() {
    const cur = collect();
    for (const f of t.fields) if (f.showIf && wraps[f.key]) wraps[f.key].hidden = !f.showIf(cur);
  }

  const form = h("form", { class: "form", novalidate: true, autocomplete: "off" });
  const errSummary = h("div", { class: "errsummary", role: "alert", tabindex: "-1", hidden: true });
  form.append(errSummary);

  if (t.intro) form.append(callout("info", t.intro));
  if (t.warning) form.append(callout("warn", h("p", null, h("b", null, "Legal review first. "), t.warning), h("p", null, h("a", { href: "#/resources/guides/documenting" }, "Documentation guide"), " · ", h("a", { href: "#/resources?q=eviction" }, "Housing and eviction resources"))));
  if (type === "childStatement") form.append(callout("warn", h("p", null, "Do not question, coach, or repeatedly ask a child about the other parent or the case, and never ask a child to gather information. "), h("a", { href: "#/resources/guides/child-statements" }, "Read the guidance")));

  // Draft recovery
  const draft = await vault.getDraft(draftKey).catch(() => null);
  if (draft && (!record || draft.payload?.at > record.updatedAt)) {
    const box = callout("info", h("p", null, `A draft saved ${fmtDateTimeISO(draft.payload.at)} was found.`),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn small primary", onclick: () => { data = { ...data, ...draft.payload.data }; for (const [k, c] of Object.entries(controls)) c.set(data[k]); refreshVisibility(); dirty = true; box.remove(); toast("Draft restored"); } }, "Restore draft"),
        h("button", { type: "button", class: "btn small", onclick: async () => { await vault.clearDraft(draftKey); box.remove(); } }, "Discard draft")));
    form.append(box);
  }

  const people = peopleSuggestions();
  const dlId = `people-${Math.random().toString(36).slice(2)}`;
  form.append(h("datalist", { id: dlId }, ...people.map((p) => h("option", { value: p }))));

  for (const f of t.fields) {
    const id = `f-${f.key}`;
    const required = f.required;
    const label = h("label", { for: id }, f.label, required ? h("span", { class: "req", "aria-hidden": "true" }, " *") : null, required ? h("span", { class: "sr-only" }, " (required)") : null);
    const help = f.help ? h("div", { class: "help", id: `${id}-help` }, f.help) : null;
    const err = h("div", { class: "err", id: `${id}-err`, role: "alert" }); errs[f.key] = err;
    let control;
    const v = data[f.key];
    switch (f.type) {
      case "textarea": {
        const el = h("textarea", { id, rows: f.rows || 3, "aria-describedby": f.help ? `${id}-help` : null }); el.value = v || "";
        el.addEventListener("input", markDirty);
        control = { el, get: () => el.value, set: (x) => { el.value = x || ""; } }; break;
      }
      case "select": case "tz": {
        const opts = f.type === "tz" ? [...new Set([deviceTimeZone(), ...TZS])] : f.options;
        const el = h("select", { id }, h("option", { value: "" }, "— Select —"), ...opts.map((o) => h("option", { value: o }, o)));
        el.value = v || "";
        el.addEventListener("change", () => { markDirty(); refreshVisibility(); });
        control = { el, get: () => el.value, set: (x) => { el.value = x || ""; } }; break;
      }
      case "date": case "time": case "number": case "money": case "email": case "tel": case "text": {
        const typ = f.type === "money" ? "number" : f.type;
        const el = h("input", { id, type: typ, inputmode: f.type === "money" ? "decimal" : null, step: f.type === "money" ? "0.01" : null, min: f.min ?? null, placeholder: f.placeholder || null, list: f.list ? `${id}-list` : null });
        el.value = v ?? "";
        el.addEventListener("input", () => { markDirty(); if (f.showIf || t.fields.some((x) => x.requiredIf)) refreshVisibility(); });
        control = { el: f.list ? h("div", null, el, h("datalist", { id: `${id}-list` }, ...f.list.map((o) => h("option", { value: o })))) : el, get: () => (f.type === "number" || f.type === "money" ? (el.value === "" ? "" : Number(el.value)) : el.value), set: (x) => { el.value = x ?? ""; } }; break;
      }
      case "people": {
        let vals = Array.isArray(v) ? [...v] : [];
        const chips = h("div", { class: "chips" });
        const input = h("input", { id, type: "text", list: dlId, placeholder: "Type a name, then Add", autocomplete: "off" });
        const render = () => chips.replaceChildren(...vals.map((p, i) => h("span", { class: "chip" }, h("span", null, p), h("button", { type: "button", "aria-label": `Remove ${p}`, onclick: () => { vals.splice(i, 1); render(); markDirty(); } }, "×"))));
        const add = () => { const s = input.value.replace(/,$/, "").trim(); if (s && !vals.includes(s)) { vals.push(s); render(); markDirty(); } input.value = ""; };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } });
        input.addEventListener("change", () => { if (people.includes(input.value)) add(); });
        render();
        control = { el: h("div", { class: "stack" }, chips, h("div", { class: "inline" }, input, h("button", { type: "button", class: "btn", style: { flex: "none" }, onclick: add }, "Add"))), get: () => { if (input.value.trim()) add(); return vals; }, set: (x) => { vals = Array.isArray(x) ? [...x] : []; render(); } };
        break;
      }
      case "children": {
        const kids = vault.listRecords({ type: "child" });
        let vals = Array.isArray(v) ? [...v] : [];
        const box = h("div", { class: "chips", role: "group", "aria-label": f.label });
        const render = () => box.replaceChildren(...(kids.length ? kids.map((k) => { const on = vals.includes(k.id); return h("button", { type: "button", class: "chip toggle", "aria-pressed": String(on), onclick: () => { vals = on ? vals.filter((x) => x !== k.id) : [...vals, k.id]; render(); markDirty(); } }, childName(k.id)); }) : [h("span", { class: "muted small" }, "No children added yet. ", h("a", { href: "#/new/child" }, "Add a child"))]));
        render();
        control = { el: box, get: () => vals, set: (x) => { vals = Array.isArray(x) ? [...x] : []; render(); } };
        break;
      }
      case "records": case "evidence": {
        let vals = Array.isArray(v) ? [...v] : [];
        const chips = h("div", { class: "chips" });
        const pendList = h("ul", { class: "list" });
        const render = () => {
          chips.replaceChildren(...vals.map((rid, i) => { const r = vault.getRecord(rid); return h("span", { class: "chip" }, h("span", null, r ? `${r.ref} · ${recordTitle(r, viewCtx)}` : "(removed record)"), h("button", { type: "button", "aria-label": "Remove link", onclick: () => { vals.splice(i, 1); render(); markDirty(); } }, "×")); }));
          if (f.type === "evidence") pendList.replaceChildren(...pending.map((p, i) => h("li", { class: "item" }, h("span", { class: "ic" }, icon("paperclip")), h("span", { class: "body" }, h("span", { class: "title" }, p.name), h("span", { class: "meta" }, `${fmtBytes(p.size)} · will be saved as a new evidence item`)), h("button", { type: "button", class: "btn small", onclick: () => { pending.splice(i, 1); render(); } }, "Remove"))));
        };
        const linkBtn = h("button", { type: "button", class: "btn small", onclick: async () => {
          const r = await recordPicker({ title: f.type === "evidence" ? "Link existing evidence" : "Link a record", only: f.type === "evidence" ? "evidence" : f.only, exclude: [record?.id, ...vals].filter(Boolean) });
          if (r) { vals.push(r.id); render(); markDirty(); }
        } }, icon("link"), f.type === "evidence" ? "Link existing evidence" : "Link a record");
        const fileInput = h("input", { type: "file", multiple: true, id, class: "sr-only" });
        fileInput.addEventListener("change", () => { for (const file of fileInput.files) pending.push(file); fileInput.value = ""; render(); markDirty(); });
        const addBtn = f.type === "evidence" ? h("label", { class: "btn small", for: id }, icon("paperclip"), "Add photos or files") : null;
        render();
        control = { el: h("div", { class: "stack" }, chips, f.type === "evidence" ? pendList : null, h("div", { class: "row" }, addBtn, f.type === "evidence" ? fileInput : null, linkBtn)), get: () => vals, set: (x) => { vals = Array.isArray(x) ? [...x] : []; render(); } };
        break;
      }
      case "file": {
        if (record?.data?.file) {
          const fi = record.data.file;
          control = { el: h("div", { class: "card tight" }, h("p", null, h("b", null, fi.name), ` · ${fi.type} · ${fmtBytes(fi.size)}`), h("p", { class: "mono" }, `SHA-256 ${fi.sha256}`), h("p", { class: "muted small" }, "Originals cannot be replaced or edited. To add a different version, create a new evidence item and link it here.")), get: () => record.data.file, set: () => {} };
        } else {
          const info = h("div", { class: "help", "aria-live": "polite" });
          const el = h("input", { id, type: "file" });
          el.addEventListener("change", async () => {
            evFile = el.files[0] || null; markDirty();
            if (evFile) { info.textContent = "Calculating SHA-256…"; const sha = await sha256Hex(new Uint8Array(await evFile.arrayBuffer())); info.textContent = `${evFile.name} · ${fmtBytes(evFile.size)} · SHA-256 ${sha}`; if (!controls.title.get()) controls.title.set(evFile.name); }
            else info.textContent = "";
          });
          control = { el: h("div", null, el, info), get: () => data.file || null, set: () => {} };
        }
        break;
      }
      default: {
        const el = h("input", { id, type: "text" }); el.value = v ?? ""; el.addEventListener("input", markDirty);
        control = { el, get: () => el.value, set: (x) => { el.value = x ?? ""; } };
      }
    }
    controls[f.key] = control;
    const wrap = h("div", { class: "field", "data-key": f.key }, f.type === "people" || f.type === "children" || f.type === "records" || f.type === "evidence" ? h("div", { class: "label", id: `${id}-label` }, f.label, required ? h("span", { class: "req" }, " *") : null) : label, help, control.el, err);
    wraps[f.key] = wrap;
    form.append(wrap);
  }
  refreshVisibility();

  const saveBtn = h("button", { type: "submit", class: "btn primary" }, icon("check"), record ? "Save changes" : `Save ${t.label.toLowerCase()}`);
  const cancelBtn = h("button", { type: "button", class: "btn", onclick: () => history.length > 1 ? history.back() : navigate("#/home") }, "Cancel");
  form.append(h("div", { class: "formbar" }, cancelBtn, saveBtn));

  setGuard(() => dirty);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cur = collect();
    const problems = [];
    for (const f of t.fields) {
      errs[f.key].textContent = ""; wraps[f.key].classList.remove("invalid");
      if (wraps[f.key].hidden) continue;
      const val = cur[f.key];
      const empty = val == null || val === "" || (Array.isArray(val) && !val.length);
      const req = f.required || (f.requiredIf && f.requiredIf(cur));
      if (req && empty && !(f.type === "file")) { problems.push(f); errs[f.key].textContent = `${f.label} is required.`; wraps[f.key].classList.add("invalid"); }
      if (f.type === "money" && val !== "" && isNaN(Number(val))) { problems.push(f); errs[f.key].textContent = "Enter an amount, for example 45.00."; wraps[f.key].classList.add("invalid"); }
    }
    if (type === "parenting" && cur.endDate && cur.date && cur.endDate < cur.date) { problems.push(t.fields.find((x) => x.key === "endDate")); errs.endDate.textContent = "End date is before the start date."; wraps.endDate.classList.add("invalid"); }
    if (problems.length) {
      errSummary.hidden = false;
      errSummary.replaceChildren(h("b", null, "Please fix the following:"), h("ul", null, ...problems.map((p) => h("li", null, h("a", { href: `#f-${p.key}`, onclick: (ev) => { ev.preventDefault(); document.getElementById(`f-${p.key}`)?.focus(); } }, p.label)))));
      errSummary.focus();
      return;
    }
    errSummary.hidden = true;
    saveBtn.disabled = true; saveBtn.textContent = "Saving…";
    try {
      if (type === "evidence" && evFile) {
        const bytes = new Uint8Array(await evFile.arrayBuffer());
        const sha256 = await sha256Hex(bytes);
        const blobId = await vault.putBlob(bytes);
        cur.file = { blobId, name: evFile.name, type: evFile.type || "application/octet-stream", size: bytes.byteLength, sha256, lastModified: evFile.lastModified ? new Date(evFile.lastModified).toISOString() : null, addedAt: nowISO() };
        if (!cur.dateCreated && evFile.lastModified) cur.dateCreated = new Date(evFile.lastModified).toISOString().slice(0, 10);
        if (!cur.storageLocation) cur.storageLocation = "In Case Compass (encrypted)";
      }
      if (pending.length) {
        const added = [];
        for (const file of pending) { const { rec } = await vault.addEvidenceFile(file); added.push(rec.id); }
        cur.attachments = [...(cur.attachments || []), ...added];
        pending.length = 0;
      }
      const saved = await vault.saveRecord({ id: record?.id, type, data: cur });
      await vault.clearDraft(draftKey).catch(() => {});
      dirty = false; clearGuard();
      toast(`Saved ${saved.ref}`);
      navigate(`#/record/${saved.id}`, { replace: !record });
    } catch (err) {
      saveBtn.disabled = false; saveBtn.textContent = record ? "Save changes" : `Save ${t.label.toLowerCase()}`;
      if (err.message === "STORAGE_FULL") alertDialog("Storage is full", ["This device does not have enough browser storage for this save. Your text is kept as a draft.", "Free space by making a backup and removing large evidence files you no longer need, or ask the browser to allow more storage (Reports › Settings › Storage)."]);
      else alertDialog("The record was not saved", [`Something went wrong: ${err.message}. Your text is kept as a draft, so you can try again.`]);
    }
  });

  return form;
}

export { TZS };
