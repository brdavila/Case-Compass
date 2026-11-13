// Reports & Export Center, Backup & Restore, Import & Migration, Settings, Trash, History.
import { h, icon, toast, confirmDialog, dialog, deliverFile, askPassphrase, pickFile, readFileText, alertDialog, passwordField, openPrintWindow } from "../ui/dom.js";
import { pageHead, tabs, callout, emptyState, recordList, navigate, reportCtx, viewCtx, relTime } from "../ui/shared.js";
import { recordPicker } from "../ui/forms.js";
import * as vault from "../core/vault.js";
import * as backup from "../core/backup.js";
import * as migrate from "../core/migrate.js";
import { TYPES, TYPE_ORDER, recordTitle } from "../core/schema.js";
import { fmtDate, fmtDateTimeISO, fmtBytes, todayLocal, addDays, startOfWeek, passphraseStrength, APP_VERSION, slug } from "../core/util.js";
import { REPORT_KINDS, defaultOptions, selectRecords, buildReportModel, buildWorkbookModel, buildTimelineCSV, buildTypeCSV } from "../reports/model.js";
import { buildDocx, DOCX_MIME } from "../reports/docx.js";
import { buildXlsx, XLSX_MIME } from "../reports/xlsx.js";
import { buildPdf, PDF_MIME } from "../reports/pdf.js";
import { buildPrintHTML } from "../reports/html.js";
import { createZip } from "../reports/zip.js";

export const REP_TABS = [["#/reports", "Create Report"], ["#/reports/backup", "Backup & Restore"], ["#/reports/import", "Import & Migration"], ["#/reports/settings", "Settings"]];

// ───── Report builder ─────
export function createReport(query = {}) {
  const o = defaultOptions(query.kind || "chronological");
  if (query.start || query.end) { o.range = { start: query.start || "", end: query.end || "" }; }
  let scope = query.start || query.end ? "custom" : (o.kind === "monthly" ? "month" : "all");
  o.month = todayLocal().slice(0, 7);
  const preview = h("div", { "aria-live": "polite" });
  const kindBox = h("div", { class: "grid two", role: "radiogroup", "aria-label": "Report type" });
  const scopeBox = h("div", { class: "stack" });
  const typeBox = h("div", { class: "chips", role: "group", "aria-label": "Categories" });

  const renderKinds = () => kindBox.replaceChildren(...REPORT_KINDS.map((k) => h("label", { class: "item", style: { cursor: "pointer", borderColor: o.kind === k.id ? "var(--accent)" : null } },
    h("input", { type: "radio", name: "kind", value: k.id, checked: o.kind === k.id, style: { width: "20px", height: "20px", accentColor: "var(--accent)", marginTop: "2px" }, onchange: () => { o.kind = k.id; o.childMode = k.id === "attorney" ? "minimal" : o.childMode; if (k.id === "monthly") scope = "month"; else if (scope === "month") scope = "all"; renderKinds(); renderScope(); update(); } }),
    h("span", { class: "body" }, h("span", { class: "title" }, k.label), h("span", { class: "snippet" }, k.desc)))));

  const renderScope = () => {
    const noScope = ["blank", "checklist"].includes(o.kind);
    if (noScope) { scopeBox.replaceChildren(h("p", { class: "muted" }, o.kind === "blank" ? "Blank forms contain no records." : "Checklists include all protocol progress and open tasks.")); return; }
    const opts = [["all", "All records"], ["week", "One week"], ["month", "One month"], ["custom", "Custom date range"], ["single", "One record"]];
    const sel = h("select", { id: "scope" }, ...opts.map(([v, l]) => h("option", { value: v }, l)));
    sel.value = scope;
    sel.addEventListener("change", () => { scope = sel.value; renderScope(); update(); });
    const extra = h("div", { class: "grid two" });
    if (scope === "week") { const d = h("input", { type: "date", id: "wk", value: o.range.start || startOfWeek(todayLocal()) }); const set = () => { o.range = { start: startOfWeek(d.value || todayLocal()), end: addDays(startOfWeek(d.value || todayLocal()), 6) }; update(); }; d.addEventListener("change", set); set(); extra.append(h("div", { class: "field" }, h("label", { for: "wk" }, "Any day in the week"), d)); }
    if (scope === "month") { const m = h("input", { type: "month", id: "mo", value: o.month }); const set = () => { o.month = m.value || todayLocal().slice(0, 7); const [y, mm] = o.month.split("-").map(Number); o.range = { start: `${o.month}-01`, end: todayLocal(new Date(y, mm, 0)) }; update(); }; m.addEventListener("change", set); set(); extra.append(h("div", { class: "field" }, h("label", { for: "mo" }, "Month"), m)); }
    if (scope === "custom") { const a = h("input", { type: "date", id: "rs", value: o.range.start }), b = h("input", { type: "date", id: "re", value: o.range.end }); a.addEventListener("change", () => { o.range.start = a.value; update(); }); b.addEventListener("change", () => { o.range.end = b.value; update(); }); extra.append(h("div", { class: "field" }, h("label", { for: "rs" }, "From"), a), h("div", { class: "field" }, h("label", { for: "re" }, "To"), b)); }
    if (scope === "all") o.range = { start: "", end: "" };
    if (scope === "single") { const lbl = h("span", { class: "muted" }, o.recordIds[0] ? vault.getRecord(o.recordIds[0])?.ref : "No record chosen"); extra.append(h("div", { class: "row" }, lbl, h("button", { type: "button", class: "btn small", onclick: async () => { const r = await recordPicker({ title: "Choose a record" }); if (r) { o.recordIds = [r.id]; lbl.textContent = `${r.ref} – ${recordTitle(r, viewCtx)}`; update(); } } }, "Choose record"))); } else o.recordIds = [];
    scopeBox.replaceChildren(h("div", { class: "field" }, h("label", { for: "scope" }, "Which records?"), sel), extra);
  };

  const renderTypes = () => typeBox.replaceChildren(...TYPE_ORDER.map((t) => { const on = o.types.includes(t); return h("button", { type: "button", class: "chip toggle", "aria-pressed": String(on), onclick: () => { o.types = on ? o.types.filter((x) => x !== t) : [...o.types, t]; renderTypes(); update(); } }, TYPES[t].plural); }));

  const priv = h("input", { type: "checkbox", id: "inc-priv" });
  priv.addEventListener("change", () => { o.includePrivate = priv.checked; update(); });
  const leg = h("input", { type: "checkbox", id: "inc-leg" });
  leg.addEventListener("change", () => { o.includeLegacy = leg.checked; update(); });
  const childSel = h("select", { id: "child-mode" }, h("option", { value: "full" }, "Show children's names and details"), h("option", { value: "minimal" }, "Initials only; leave out child details"), h("option", { value: "exclude" }, "Leave out child statements and child details"));
  childSel.addEventListener("change", () => { o.childMode = childSel.value; update(); });
  const titleIn = h("input", { type: "text", id: "rep-title", placeholder: "Optional custom title" });
  titleIn.addEventListener("input", () => { o.title = titleIn.value; });
  const catField = h("div", { class: "field" }, h("span", { class: "label" }, "Categories to include"), typeBox);

  function update() {
    childSel.value = o.childMode;
    catField.hidden = o.kind !== "category";
    if (["blank", "checklist"].includes(o.kind)) { preview.replaceChildren(callout("info", "Ready to generate.")); return; }
    const recs = selectRecords(vault.listRecords(), o);
    preview.replaceChildren(callout(recs.length ? "info" : "warn", h("p", null, h("b", null, `${recs.length} record${recs.length === 1 ? "" : "s"} will be included. `), recs.length ? `IDs: ${recs.slice(0, 40).map((r) => r.ref).join(", ")}${recs.length > 40 ? ", …" : ""}` : "Adjust the type, dates, or categories."),
      h("p", { class: "small" }, o.includePrivate ? "Private notes WILL be included." : "Private notes are excluded.")));
  }

  const gen = async (fmt) => {
    const all = vault.listRecords();
    const ctx = reportCtx();
    const base = `case-compass-${slug(o.title || o.kind)}-${todayLocal()}`;
    try {
      if (fmt === "print") {
        const html = buildPrintHTML(buildReportModel(all, o, ctx));
        if (!openPrintWindow(html)) { toast("Pop-ups are blocked. Downloading the print view instead.", "warn"); await deliverFile(new TextEncoder().encode(html), `${base}.html`, "text/html", { note: "Open the file and use your browser's Print command, then Save as PDF." }); }
      } else if (fmt === "pdf") await deliverFile(buildPdf(buildReportModel(all, o, ctx)), `${base}.pdf`, PDF_MIME);
      else if (fmt === "docx") await deliverFile(buildDocx(buildReportModel(all, o, ctx)), `${base}.docx`, DOCX_MIME, { note: "Opens in Microsoft Word, Pages, Google Docs, or LibreOffice." });
      else if (fmt === "xlsx") await deliverFile(buildXlsx(buildWorkbookModel(all, o, ctx)), `${base}.xlsx`, XLSX_MIME, { note: "Opens in Excel, Numbers, Google Sheets, or LibreOffice." });
      else if (fmt === "csv") {
        const types = o.kind === "category" && o.types.length ? o.types : null;
        if (types && types.length === 1) await deliverFile(new TextEncoder().encode(buildTypeCSV(all, types[0], o, ctx)), `${base}-${types[0]}.csv`, "text/csv");
        else await deliverFile(new TextEncoder().encode(buildTimelineCSV(all, o, ctx)), `${base}-timeline.csv`, "text/csv");
      }
      await vault.audit("export", { summary: `Report exported: ${REPORT_KINDS.find((k) => k.id === o.kind)?.label} (${fmt.toUpperCase()})${o.includePrivate ? ", private notes included" : ""}` });
    } catch (e) { alertDialog("The report could not be created", [e.message]); }
  };

  renderKinds(); renderScope(); renderTypes(); update();
  return h("div", null,
    pageHead("Reports", { sub: "Create Word, Excel, PDF, CSV, or printable reports from the records you choose." }),
    tabs(REP_TABS, "#/reports"),
    h("section", { class: "section" }, h("h2", null, "1. Choose a report"), kindBox),
    h("section", { class: "card section stack" }, h("h2", null, "2. Choose records"), scopeBox, catField),
    h("section", { class: "card section stack" }, h("h2", null, "3. Privacy options"),
      h("label", { class: "check", for: "inc-priv" }, priv, h("span", null, "Include private notes (off by default)")),
      h("div", { class: "field" }, h("label", { for: "child-mode" }, "Children's information"), childSel),
      h("label", { class: "check", for: "inc-leg" }, leg, h("span", null, "Include original imported data for imported records")),
      h("div", { class: "field" }, h("label", { for: "rep-title" }, "Title"), titleIn)),
    h("section", { class: "section" }, h("h2", null, "4. Create"), preview,
      h("div", { class: "actions", style: { marginTop: "10px" } },
        h("button", { class: "btn primary", type: "button", onclick: () => gen("pdf") }, icon("file"), "PDF"),
        h("button", { class: "btn", type: "button", onclick: () => gen("docx") }, icon("doc"), "Word (.docx)"),
        h("button", { class: "btn", type: "button", onclick: () => gen("xlsx") }, icon("list"), "Excel (.xlsx)"),
        h("button", { class: "btn", type: "button", onclick: () => gen("csv") }, icon("list"), "CSV"),
        h("button", { class: "btn", type: "button", onclick: () => gen("print") }, icon("download"), "Print / Save as PDF")),
      h("p", { class: "muted small", style: { marginTop: "10px" } }, "Exports are NOT encrypted. Reports are organized summaries of your own records. They are not court filings, are not issued by any court, and are not automatically admissible as evidence.")),
    h("section", { class: "card section" }, h("h2", null, "Complete case archive"),
      h("p", { class: "muted" }, "One unencrypted .zip containing a full PDF report, the Excel workbook, a timeline CSV, and every original evidence file. For an encrypted copy, use Backup instead."),
      h("button", { class: "btn", type: "button", onclick: caseArchive }, icon("download"), "Create case archive (.zip)")));
}

async function caseArchive() {
  const ok = await confirmDialog({ title: "Create an unencrypted archive?", message: ["The archive will contain your records and original evidence files without encryption. Private notes are excluded.", "Use an encrypted backup if you only need a safe copy."], confirmText: "Create archive" });
  if (!ok) return;
  const all = vault.listRecords(); const ctx = reportCtx();
  const o = defaultOptions("chronological");
  const files = [
    { name: "Case_Compass_Report.pdf", data: buildPdf(buildReportModel(all, o, ctx)) },
    { name: "Case_Compass_Workbook.xlsx", data: buildXlsx(buildWorkbookModel(all, o, ctx)) },
    { name: "Case_Compass_Timeline.csv", data: buildTimelineCSV(all, o, ctx) },
  ];
  for (const r of all.filter((x) => x.type === "evidence" && x.data?.file?.blobId)) {
    try { files.push({ name: `evidence/${r.ref}_${r.data.file.name.replace(/[^\w.\-]+/g, "_")}`, data: await vault.getBlob(r.data.file.blobId) }); } catch { /* missing blob noted in report */ }
  }
  files.push({ name: "README.txt", data: `Case Compass case archive created ${new Date().toISOString()}.\r\nUNENCRYPTED. Evidence files are the stored originals; compare SHA-256 values with the Evidence Inventory sheet.\r\n` });
  await deliverFile(createZip(files), `case-compass-archive-${todayLocal()}.zip`, "application/zip");
  vault.audit("export", { summary: `Unencrypted case archive created (${files.length} files)` });
}

// ───── Backup & restore ─────
export function backupView() {
  const log = vault.getKV("backupLog", []);
  const last = log[log.length - 1];
  const all = vault.listRecords({ includeDeleted: true });
  const since = last ? all.filter((r) => r.updatedAt > last.at).length : all.length;
  const result = h("div", { "aria-live": "polite" });

  const makeBackup = async () => {
    const choice = await dialog({ title: "Create encrypted backup", body: h("div", null, h("p", null, "Choose the passphrase that will protect this backup file. You will need it to restore."), h("p", { class: "muted small" }, "Using a separate backup passphrase lets you give a backup to someone you trust without sharing your vault passphrase.")), actions: [{ label: "Cancel", value: null }, { label: "Separate passphrase", value: "separate" }, { label: "Use my vault passphrase", kind: "primary", value: "vault" }] });
    if (!choice) return;
    const pass = choice === "vault"
      ? await askPassphrase({ title: "Confirm your vault passphrase", confirmText: "Create backup", validate: async (v) => (await vault.verifyPassphrase(v)) ? null : "That is not your vault passphrase." })
      : await askPassphrase({ title: "Set a backup passphrase", label: "Backup passphrase", confirmTwice: true, confirmText: "Create backup", validate: async (v) => (passphraseStrength(v).ok ? null : "Use at least 12 characters (several random words work well).") });
    if (!pass) return;
    result.replaceChildren(callout("info", "Encrypting and verifying your backup…"));
    try {
      const b = await backup.createBackup(pass);
      await backup.recordBackupMade(b);
      result.replaceChildren(callout("ok", h("p", null, h("b", null, "Backup created and verified. "), `${b.manifest.records} records, ${b.manifest.revisions} earlier versions, and ${b.manifest.blobs} attachments. Integrity fingerprint ${b.sha256.slice(0, 16)}…`)));
      await deliverFile(new TextEncoder().encode(b.text), `case-compass-backup-${todayLocal()}.ccbackup`, "application/octet-stream", { encrypted: true, note: "Store this file somewhere other than this device: iCloud Drive or Files on iPhone, a USB drive, or a trusted cloud folder." });
    } catch (e) { result.replaceChildren(callout("danger", `The backup could not be created: ${e.message}`)); }
  };

  const verifyFile = async () => {
    const file = await pickFile({ accept: ".ccbackup,application/json,.json" }); if (!file) return;
    const text = await readFileText(file);
    const pass = await askPassphrase({ title: "Backup passphrase", message: `Verify ${file.name}`, confirmText: "Verify" }); if (!pass) return;
    result.replaceChildren(callout("info", "Decrypting and checking every attachment…"));
    const v = await backup.verifyBackupText(text, pass);
    result.replaceChildren(callout(v.ok ? "ok" : "danger", h("p", null, h("b", null, v.ok ? "Backup verified. " : "Backup problem found. "), v.ok ? `Created ${fmtDateTimeISO(v.created)} · ${v.records} records · ${v.blobs} attachments all match their fingerprints.` : ""), ...v.problems.map((p) => h("p", null, p))));
  };

  const restore = async () => {
    const file = await pickFile({ accept: ".ccbackup,application/json,.json" }); if (!file) return;
    const text = await readFileText(file);
    const parsed = backup.parseBackupFile(text);
    if (parsed.kind !== "case-compass-backup") { alertDialog("Not a Case Compass backup", [parsed.error || "Use Import & Migration for files from earlier planners."]); return; }
    const pass = await askPassphrase({ title: "Backup passphrase", message: `Restore ${file.name}`, confirmText: "Decrypt" }); if (!pass) return;
    let payload, problems;
    try { ({ payload, problems } = await backup.decryptBackup(parsed.obj, pass)); }
    catch (e) { alertDialog("Could not open the backup", [e.message === "WRONG_PASSPHRASE" ? "The passphrase is not correct." : "The file appears to be damaged."]); return; }
    const v = await backup.verifyPayload(payload);
    const existingIds = new Set(vault.listRecords({ includeDeleted: true }).map((r) => r.id));
    const newCount = payload.records.filter((r) => !existingIds.has(r.id)).length;
    const ok = await confirmDialog({ title: "Merge this backup?", message: [`Backup from ${fmtDateTimeISO(payload.created)}: ${payload.records.length} records (${newCount} not in this vault), ${payload.blobs.length} attachments.`, "Nothing in your current vault will be overwritten. If the same record exists in both with different contents, the newer version becomes current and the other is kept in its version history.", "A restore point is created first, so you can undo this from Settings."], details: [...problems, ...v.problems].length ? callout("warn", ...[...problems, ...v.problems]) : null, confirmText: "Merge backup" });
    if (!ok) return;
    result.replaceChildren(callout("info", "Restoring…"));
    const rep = await backup.restorePayload(payload, { mode: "merge" });
    result.replaceChildren(callout(rep.problems.length ? "warn" : "ok", h("p", null, h("b", null, "Restore finished. "), `${rep.added} added, ${rep.updated} updated to a newer version, ${rep.skipped} already identical, ${rep.conflictsKept} conflicting versions kept in history, ${rep.blobsAdded} attachments added.`), ...rep.problems.map((p) => h("p", null, p))));
  };

  return h("div", null,
    pageHead("Backup & Restore", { sub: "Encrypted backups protect against a lost phone, a cleared browser, or a damaged device." }),
    tabs(REP_TABS, "#/reports/backup"),
    h("div", { class: `card section ${last ? (since ? "warn" : "ok") : "warn"}` }, h("h2", null, "Backup status"),
      h("p", null, last ? `Last verified backup: ${fmtDateTimeISO(last.at)} (${relTime(last.at)}) · ${last.records} records · ${last.blobs} attachments.` : "You have not made a backup yet."),
      h("p", { class: "muted" }, since ? `${since} record(s) were added or changed since then.` : last ? "No changes since your last backup." : "Your records exist only in this browser until you back up."),
      h("button", { class: "btn primary", type: "button", onclick: makeBackup }, icon("backup"), "Create encrypted backup")),
    result,
    h("div", { class: "grid two section" },
      h("div", { class: "card" }, h("h2", null, "Verify a backup file"), h("p", { class: "muted small" }, "Decrypts the file and checks every attachment against its SHA-256 fingerprint without changing your vault."), h("button", { class: "btn", type: "button", onclick: verifyFile }, icon("check"), "Verify a backup")),
      h("div", { class: "card" }, h("h2", null, "Restore or merge a backup"), h("p", { class: "muted small" }, "Adds records from a backup into this vault without overwriting anything. Use “Restore from an encrypted backup” on the welcome screen for a brand-new device."), h("button", { class: "btn", type: "button", onclick: restore }, icon("upload"), "Restore from backup"))),
    h("section", { class: "card section" }, h("h2", null, "Where to keep backups"),
      h("ul", null,
        h("li", null, h("b", null, "iPhone or iPad: "), "after Download, open the Files app; or choose Share › Save to Files and pick iCloud Drive or a USB drive."),
        h("li", null, h("b", null, "Computer: "), "the file goes to your Downloads folder. Copy it to a USB drive or a cloud folder only you control."),
        h("li", null, h("b", null, "Moving to a new device: "), "Case Compass does not sync between devices. Copy the backup file to the new device, open Case Compass there, and choose “Restore from an encrypted backup”."),
        h("li", null, "Keep at least one copy away from this device. A backup is only as safe as its passphrase."))),
    log.length ? h("details", { class: "disclose section" }, h("summary", null, `Backup history (${log.length})`), h("div", { class: "inner" }, h("ul", null, ...log.slice().reverse().map((b) => h("li", null, `${fmtDateTimeISO(b.at)} · ${b.records} records · ${b.blobs} attachments · ${b.verified ? "verified" : "not verified"}`))))) : null);
}

// ───── Import & migration ─────
export function importView() {
  const out = h("div", { "aria-live": "polite" });
  const showPlan = (plan, label) => {
    const fresh = plan.items.filter((x) => !x.duplicate);
    const byType = Object.entries(fresh.reduce((m, x) => { m[x.type] = (m[x.type] || 0) + 1; return m; }, {}));
    out.replaceChildren(h("div", { class: "card section stack" },
      h("h2", null, "Import preview"),
      h("p", null, `${plan.items.length} entries found in ${label}. ${plan.items.length - fresh.length} were imported before and will be skipped.`),
      byType.length ? h("ul", null, ...byType.map(([t, n]) => h("li", null, `${n} × ${TYPES[t].label}`))) : null,
      plan.mapping ? h("p", { class: "muted small" }, `Column mapping: ${Object.entries(plan.mapping).map(([a, b]) => `${a} → ${b}`).join(", ") || "none"}`) : null,
      ...(plan.problems || []).map((p) => callout("warn", p)),
      callout("info", "Every original field is kept with each imported record (“Original imported data”), along with original ids and creation dates when present. A restore point is created first."),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", disabled: !fresh.length, onclick: async (e) => { e.target.disabled = true; const r = await migrate.applyImportPlan(plan, label); out.replaceChildren(callout(r.problems?.length ? "warn" : "ok", h("p", null, h("b", null, "Import complete. "), `${r.imported} records imported, ${r.skipped} skipped as duplicates.`), ...(r.problems || []).map((p) => h("p", null, p)))); } }, `Import ${fresh.length} records`),
        h("button", { class: "btn", type: "button", onclick: () => out.replaceChildren() }, "Cancel")),
      fresh.length ? h("details", { class: "disclose" }, h("summary", null, "Show entries"), h("div", { class: "inner" }, h("ul", { class: "small" }, ...fresh.slice(0, 200).map((x) => h("li", null, `${TYPES[x.type].label}: ${x.data[TYPES[x.type].titleField] || x.data[TYPES[x.type].dateField] || "(untitled)"}`))))) : null));
  };

  const importJSON = async () => {
    const file = await pickFile({ accept: ".json,application/json,.txt,.ccbackup" }); if (!file) return;
    const text = await readFileText(file);
    const parsed = backup.parseBackupFile(text);
    if (parsed.kind === "case-compass-backup") { toast("This is a Case Compass backup. Use Backup & Restore to merge it.", "warn"); navigate("#/reports/backup"); return; }
    if (parsed.kind === "invalid") { alertDialog("Unreadable file", ["This file is not valid JSON. If it came from an earlier planner, use that planner's export or backup option to create a JSON file."]); return; }
    let obj = parsed.obj;
    if (migrate.looksEncryptedLegacy(obj)) {
      const pass = await askPassphrase({ title: "Encrypted planner file", message: "This file appears to be encrypted by an earlier planner. Enter the passphrase that planner used.", confirmText: "Decrypt" });
      if (!pass) return;
      try { obj = await migrate.tryDecryptLegacy(obj, pass); }
      catch { alertDialog("Could not decrypt", ["The passphrase did not work, or the earlier planner used an encryption format Case Compass cannot read. Open the file in the earlier planner and export it unencrypted (JSON), then import that file here. Delete the unencrypted file afterward."]); return; }
    }
    showPlan(await migrate.planLegacyImport(obj, file.name), file.name);
  };

  const csvType = h("select", { id: "csv-type" }, ...TYPE_ORDER.map((t) => h("option", { value: t }, TYPES[t].label)));
  const importCSV = async () => {
    const file = await pickFile({ accept: ".csv,text/csv" }); if (!file) return;
    showPlan(await migrate.planCSVImport(await readFileText(file), csvType.value, file.name), file.name);
  };
  const scan = async () => {
    const found = migrate.scanLocalStorage();
    if (!found.length) { out.replaceChildren(callout("info", "No earlier planner data was found in this browser for this web address. Earlier planners opened from a different address or file store their data separately; export it there instead.")); return; }
    out.replaceChildren(h("div", { class: "card section" }, h("h2", null, "Earlier data found in this browser"), h("ul", { class: "list" }, ...found.map((f) => h("li", null, h("button", { class: "item", type: "button", onclick: async () => showPlan(await migrate.planLegacyImport(f.obj, `browser storage “${f.key}”`), `browser storage “${f.key}”`) }, h("span", { class: "body" }, h("span", { class: "title" }, f.key), h("span", { class: "meta" }, `${f.entries} entries`))))))));
  };

  return h("div", null,
    pageHead("Import & Migration", { sub: "Bring records from an earlier planner or a spreadsheet into your vault." }),
    tabs(REP_TABS, "#/reports/import"),
    callout("info", "Imports never overwrite existing records. Each import is previewed first, duplicates are detected and skipped, and a restore point is created so the import can be undone."),
    h("div", { class: "grid three section" },
      h("div", { class: "card" }, h("h2", null, "Earlier planner file"), h("p", { class: "muted small" }, "JSON exports or backups from earlier family-law planners. Encrypted planner files ask for that planner's passphrase."), h("button", { class: "btn primary", type: "button", onclick: importJSON }, icon("upload"), "Choose file")),
      h("div", { class: "card" }, h("h2", null, "Spreadsheet (CSV)"), h("p", { class: "muted small" }, "Save a spreadsheet as CSV. Choose what kind of record each row is; columns are matched by name."), h("div", { class: "field" }, h("label", { for: "csv-type" }, "Rows are"), csvType), h("button", { class: "btn", type: "button", onclick: importCSV, style: { marginTop: "8px" } }, icon("upload"), "Choose CSV")),
      h("div", { class: "card" }, h("h2", null, "This browser"), h("p", { class: "muted small" }, "Look for data an earlier planner saved in this browser at this same web address."), h("button", { class: "btn", type: "button", onclick: scan }, icon("search"), "Scan this browser"))),
    out);
}

// ───── Settings ─────
export async function settingsView() {
  const s = vault.settings();
  const field = (id, label, el, help) => h("div", { class: "field" }, h("label", { for: id }, label), el, help ? h("div", { class: "help" }, help) : null);
  const saveSetting = async (patch, msg = "Setting saved") => { await vault.updateSettings(patch); toast(msg); };
  const prepared = h("input", { id: "s-prep", type: "text", value: s.preparedBy }); prepared.addEventListener("change", () => saveSetting({ preparedBy: prepared.value }));
  const caption = h("input", { id: "s-cap", type: "text", value: s.caseCaption, placeholder: "e.g., Parenting matter – Pueblo County" }); caption.addEventListener("change", () => saveSetting({ caseCaption: caption.value }));
  const theme = h("select", { id: "s-theme" }, h("option", { value: "dark" }, "Dark (default)"), h("option", { value: "light" }, "Light"), h("option", { value: "system" }, "Match device")); theme.value = s.theme === "system" || s.theme === "light" ? s.theme : "dark";
  theme.addEventListener("change", async () => { document.documentElement.dataset.theme = theme.value; try { localStorage.setItem("case-compass-theme", theme.value); } catch { /* */ } await saveSetting({ theme: theme.value }); });
  const tz = h("select", { id: "s-tz" }, ...["America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Chicago", "America/New_York", "America/Anchorage", "Pacific/Honolulu", "UTC"].map((z) => h("option", { value: z }, z))); tz.value = s.defaultTz; tz.addEventListener("change", () => saveSetting({ defaultTz: tz.value }));
  const idle = h("select", { id: "s-idle" }, ...[1, 2, 5, 10, 15, 30].map((m) => h("option", { value: String(m) }, `${m} minute${m > 1 ? "s" : ""}`))); idle.value = String(s.idleMinutes); idle.addEventListener("change", () => saveSetting({ idleMinutes: Number(idle.value) }));
  const hide = h("input", { type: "checkbox", id: "s-hide", checked: !!s.lockOnHide }); hide.addEventListener("change", () => saveSetting({ lockOnHide: hide.checked }));
  const exits = [["https://weather.gov/", "National Weather Service"], ["https://www.google.com/", "Google search"], ["https://en.wikipedia.org/wiki/Main_Page", "Wikipedia"], ["https://www.usps.com/", "USPS"]];
  const exit = h("select", { id: "s-exit" }, ...exits.map(([u, l]) => h("option", { value: u }, l))); exit.value = s.quickExitUrl;
  exit.addEventListener("change", async () => { try { localStorage.setItem("case-compass-exit", exit.value); } catch { /* */ } await saveSetting({ quickExitUrl: exit.value }); });

  const est = await vault.storageEstimate();
  const rps = await vault.listRestorePoints();
  const drafts = await vault.listDrafts();
  const corrupt = vault.corruptItems();
  const trashCount = vault.listRecords({ includeDeleted: true }).filter((r) => r.deleted).length;

  return h("div", null,
    pageHead("Settings", { sub: "Security, appearance, report details, storage, and data tools." }),
    tabs(REP_TABS, "#/reports/settings"),
    h("section", { class: "card section form" }, h("h2", null, "Security"),
      field("s-idle", "Lock automatically after inactivity", idle),
      h("label", { class: "check", for: "s-hide" }, hide, h("span", null, "Lock immediately when Case Compass is hidden or you switch apps")),
      field("s-exit", "Quick Exit opens", exit, "Quick Exit locks the vault and replaces this page with the site above. It cannot erase browser history, downloaded files, or monitoring software on the device. Press Esc three times on a keyboard for the same effect."),
      h("button", { class: "btn", type: "button", onclick: changePass }, icon("key"), "Change passphrase")),
    h("section", { class: "card section form" }, h("h2", null, "Reports"), field("s-prep", "Prepared by (shown on reports)", prepared), field("s-cap", "Matter description (shown on reports)", caption, "Do not enter a case number unless you want it on every report.")),
    h("section", { class: "card section form" }, h("h2", null, "Appearance and time"), field("s-theme", "Theme", theme), field("s-tz", "Default time zone for new records", tz)),
    h("section", { class: "card section" }, h("h2", null, "Storage on this device"),
      h("p", null, est.usage != null ? `Using about ${fmtBytes(est.usage)}${est.quota ? ` of ${fmtBytes(est.quota)} available to this site` : ""}.` : "Storage use is not reported by this browser."),
      h("p", { class: "muted small" }, est.persisted ? "Persistent storage is on: the browser should not clear this data automatically." : "Persistent storage is off. Some browsers may clear site data when space is low; regular backups protect you."),
      !est.persisted ? h("button", { class: "btn small", type: "button", onclick: async () => { const ok = await vault.requestPersistence(); toast(ok ? "Persistent storage granted." : "The browser did not grant persistent storage. Installing to the Home Screen can help.", ok ? "ok" : "warn"); } }, "Ask the browser to keep data") : null),
    h("section", { class: "card section" }, h("h2", null, "Data tools"),
      h("div", { class: "linkrow" },
        h("a", { class: "btn small", href: "#/reports/trash" }, icon("trash"), `Trash (${trashCount})`),
        h("a", { class: "btn small", href: "#/reports/history" }, icon("history"), "Change history")),
      h("h3", { style: { marginTop: "14px" } }, "Restore points"),
      h("p", { class: "muted small" }, "Created automatically before imports, restores, and rollbacks."),
      rps.length ? h("ul", { class: "list" }, ...rps.map((rp) => h("li", { class: "item" }, h("span", { class: "body" }, h("span", { class: "title" }, rp.label), h("span", { class: "meta" }, `${fmtDateTimeISO(rp.created)} · ${rp.count} records`)), h("button", { class: "btn small", type: "button", onclick: async () => { const ok = await confirmDialog({ title: "Roll back to this restore point?", message: ["Records will return to how they were at that time. A new restore point is made first, so this can be undone. Attachments are never deleted."], confirmText: "Roll back" }); if (!ok) return; await vault.rollbackTo(rp.id); toast("Rolled back."); navigate(`#/reports/settings?t=${Date.now()}`, { replace: true }); } }, "Roll back")))) : h("p", { class: "muted" }, "None yet."),
      h("h3", { style: { marginTop: "14px" } }, "Saved drafts"),
      drafts.length ? h("ul", { class: "list" }, ...drafts.map((d) => h("li", { class: "item" }, h("span", { class: "body" }, h("span", { class: "title" }, d.key.replace(/^form:/, "").replace(/:new$/, " (new)").replace(/:/, " · ")), h("span", { class: "meta" }, `Saved ${fmtDateTimeISO(d.payload?.at)}`)), h("button", { class: "btn small", type: "button", onclick: async (e) => { await vault.clearDraft(d.key); e.target.closest("li").remove(); toast("Draft discarded"); } }, "Discard")))) : h("p", { class: "muted" }, "No unsaved drafts."),
      h("h3", { style: { marginTop: "14px" } }, "Data health"),
      corrupt.length ? callout("warn", `${corrupt.length} stored item(s) could not be decrypted (${corrupt.map((c) => c.store).join(", ")}). This can happen after an interrupted write. They are left untouched. Restoring a recent backup can recover them.`) : h("p", { class: "muted" }, "All stored records decrypted successfully.")),
    h("section", { class: "card section" }, h("h2", null, "About"),
      h("p", null, `Case Compass ${APP_VERSION}. Runs entirely in this browser. No accounts, analytics, trackers, or uploads. Records are encrypted with AES-256-GCM using a key derived from your passphrase (PBKDF2-SHA-256, 600,000 iterations).`),
      h("p", { class: "muted small" }, "Case Compass is an organizational and educational tool. It does not give legal advice, cannot guarantee any outcome, and is not a substitute for an attorney. No security measure is absolute."),
      h("div", { class: "linkrow" }, h("button", { class: "btn small", type: "button", onclick: checkUpdate }, "Check for app update"), h("a", { class: "btn small", href: "docs/INSTALL.html", target: "_blank", rel: "noopener" }, "Installation guide"))),
    h("section", { class: "card danger section" }, h("h2", null, "Delete this vault"),
      h("p", null, "Permanently erases every record, attachment, draft, and setting in this browser. Make and verify a backup first if you may need the records later."),
      h("button", { class: "btn danger", type: "button", onclick: deleteVault }, icon("trash"), "Delete vault")));
}

async function changePass() {
  const oldP = passwordField({ id: "cp-old", label: "Current passphrase" });
  const n1 = passwordField({ id: "cp-new", label: "New passphrase", autocomplete: "new-password" });
  const n2 = passwordField({ id: "cp-new2", label: "Confirm new passphrase", autocomplete: "new-password" });
  const err = h("div", { class: "err", role: "alert" });
  await dialog({ title: "Change passphrase", body: h("div", { class: "form" }, oldP.el, n1.el, n2.el, err, h("p", { class: "muted small" }, "Existing backups keep the passphrase they were made with.")), actions: [{ label: "Cancel", value: null }, { label: "Change passphrase", kind: "primary", onClick: async (b) => {
    if (n1.input.value !== n2.input.value) { err.textContent = "The new passphrases do not match."; return false; }
    if (!passphraseStrength(n1.input.value).ok) { err.textContent = "Choose a stronger passphrase (at least 12 characters)."; return false; }
    b.disabled = true; b.textContent = "Changing…";
    try { await vault.changePassphrase(oldP.input.value, n1.input.value); toast("Passphrase changed."); return true; }
    catch (e) { b.disabled = false; b.textContent = "Change passphrase"; err.textContent = e.message === "WRONG_PASSPHRASE" ? "The current passphrase is not correct." : e.message; return false; }
  } }] });
}

async function checkUpdate() {
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (!reg) { toast("Offline support is not active on this address.", "warn"); return; } await reg.update(); toast(reg.waiting || reg.installing ? "An update is downloading. You will be offered a reload." : "You have the latest version."); }
  catch (e) { toast(`Could not check: ${e.message}`, "err"); }
}

async function deleteVault() {
  const ok = await confirmDialog({ title: "Delete this vault permanently?", message: ["Every record and attachment in this browser will be erased. This cannot be undone."], confirmText: "Continue", danger: true });
  if (!ok) return;
  const typed = await askPassphrase({ title: "Confirm with your passphrase", message: "Enter your vault passphrase to erase the vault.", confirmText: "Erase everything", validate: async (v) => ((await vault.verifyPassphrase(v)) ? null : "That is not your vault passphrase.") });
  if (!typed) return;
  await vault.destroyVault();
  location.hash = "#/welcome"; location.reload();
}

export function trashView() {
  const items = vault.listRecords({ includeDeleted: true }).filter((r) => r.deleted);
  return h("div", null,
    pageHead("Trash", { crumbs: [{ label: "Settings", href: "#/reports/settings" }, { label: "Trash" }], sub: "Records here are hidden from timelines and reports. Restore them, or delete them permanently." }),
    items.length ? h("ul", { class: "list" }, ...items.map((r) => h("li", { class: "item" }, h("span", { class: "body" }, h("span", { class: "title" }, `${r.ref} · ${recordTitle(r, viewCtx)}`), h("span", { class: "meta" }, `${TYPES[r.type].label} · moved to Trash ${fmtDateTimeISO(r.updatedAt)}`)),
      h("div", { class: "row" },
        h("button", { class: "btn small", type: "button", onclick: async () => { await vault.restoreRecord(r.id); toast(`${r.ref} restored`); navigate(`#/reports/trash?t=${Date.now()}`, { replace: true }); } }, "Restore"),
        h("button", { class: "btn small danger", type: "button", onclick: async () => { const ok = await confirmDialog({ title: `Permanently delete ${r.ref}?`, message: ["The record and its version history will be erased. Attachment files used by no other evidence item are erased too. This cannot be undone."], confirmText: "Delete permanently", danger: true }); if (!ok) return; await vault.purgeRecord(r.id); toast(`${r.ref} permanently deleted`); navigate(`#/reports/trash?t=${Date.now()}`, { replace: true }); } }, "Delete permanently"))))) : emptyState("Trash is empty."));
}

export async function historyView() {
  const log = await vault.listAudit();
  const label = { create: "Created", update: "Edited", delete: "Moved to Trash", restore: "Restored", purge: "Permanently deleted", import: "Imported", export: "Exported", "export-original": "Original exported", backup: "Backup", "restore-backup": "Backup restored", rollback: "Rolled back", "vault-created": "Vault created", "passphrase-changed": "Passphrase changed" };
  return h("div", null,
    pageHead("Change history", { crumbs: [{ label: "Settings", href: "#/reports/settings" }, { label: "History" }], sub: "An encrypted log of every change, export, import, and backup. Earlier versions of each record are kept in that record's History." }),
    log.length ? h("ul", { class: "list" }, ...log.slice(0, 500).map((a) => h("li", { class: "item" }, h("span", { class: "body" }, h("span", { class: "title" }, `${label[a.action] || a.action}${a.ref ? ` · ${a.ref}` : ""}`), h("span", { class: "meta" }, h("span", null, fmtDateTimeISO(a.at)), a.summary ? h("span", null, a.summary) : null)), a.recordId && vault.getRecord(a.recordId) ? h("a", { class: "btn small", href: `#/record/${a.recordId}` }, "Open") : null))) : emptyState("No history yet."));
}
