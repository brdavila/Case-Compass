#!/usr/bin/env node
// End-to-end QA for Case Compass: the 25 acceptance scenarios from the build specification.
// Drives the real app in Chromium (preinstalled Playwright), validates exported files with
// python-docx / openpyxl / pypdf, and writes tests/results/e2e-results.json.
//
// Usage: (serve the repo root on port 8080, e.g. `python3 -m http.server 8080`) then
//        node tests/e2e/run.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = process.env.CC_BASE || "http://127.0.0.1:8080/";
const OUT = path.join(ROOT, "tests/results");
const DL = mkdtempSync(path.join(os.tmpdir(), "cc-dl-"));
mkdirSync(OUT, { recursive: true });
const PASS = "river lantern quiet maple 47";
const results = [];
const allRequests = new Set();
let browser;

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const assert = (c, msg) => { if (!c) throw new Error(`Assertion failed: ${msg}`); };
const py = (code, ...args) => execFileSync("python3", ["-I", "-c", code, ...args], { encoding: "utf8" }).trim();

async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
  ctx.on("request", (r) => allRequests.add(r.url()));
  return ctx;
}
async function open(ctx, hash = "") {
  const p = await ctx.newPage();
  p.errors = [];
  p.on("pageerror", (e) => p.errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") p.errors.push(m.text()); });
  await p.goto(BASE + hash);
  await p.waitForLoadState("domcontentloaded");
  await p.waitForTimeout(400);
  return p;
}
async function createVault(p) {
  await p.waitForSelector("#new-pass");
  await p.fill("#new-pass", PASS); await p.fill("#new-pass2", PASS); await p.check("#ack");
  await p.click("form button[type=submit]");
  await p.waitForFunction(() => location.hash.startsWith("#/home") && document.querySelector("h1")?.textContent === "Home", null, { timeout: 30000 });
}
async function unlock(p, pass = PASS) {
  await p.waitForSelector("#unlock-pass");
  await p.fill("#unlock-pass", pass);
  await p.click("form button[type=submit]");
}
async function go(p, hash) { await p.evaluate((h) => { location.hash = h; }, hash); await p.waitForTimeout(350); }
async function h1(p) { return p.evaluate(() => document.querySelector("main h1, h1")?.textContent || ""); }
async function save(p) {
  await p.click("form .formbar button[type=submit]");
  await p.waitForFunction(() => location.hash.startsWith("#/record/"), null, { timeout: 15000 });
  await p.waitForTimeout(300);
  return p.evaluate(() => location.hash.split("/")[2]);
}
async function addPerson(p, key, name) { await p.fill(`#f-${key}`, name); await p.click(`[data-key="${key}"] button:has-text("Add")`); }
async function download(p, clickSelector, label = "Download") {
  await p.click(clickSelector);
  await p.waitForSelector(`dialog[open] button:has-text("${label}")`);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click(`dialog[open] button:has-text("${label}")`)]);
  const file = path.join(DL, dl.suggestedFilename());
  await dl.saveAs(file);
  return file;
}
// Runs fn(vault, arg) inside the page against the app's own vault module instance. Playwright passes
// the function through the DevTools protocol, so no eval() is needed (the app's CSP forbids eval).
async function vaultEval(p, fn, arg) {
  const src = fn.toString();
  return p.evaluate(`(async () => { const vault = await import("/js/core/vault.js"); return (${src})(vault, ${JSON.stringify(arg ?? null)}); })()`);
}

async function test(id, name, fn) {
  const t0 = Date.now();
  try { const detail = await fn(); results.push({ id, name, status: "passed", ms: Date.now() - t0, detail: detail || "" }); console.log(`PASS ${String(id).padStart(2)} ${name}${detail ? ` – ${detail}` : ""}`); }
  catch (e) { results.push({ id, name, status: "failed", ms: Date.now() - t0, detail: e.message.split("\n")[0] }); console.log(`FAIL ${String(id).padStart(2)} ${name} – ${e.message.split("\n").slice(0, 3).join(" | ")}`); }
}

// A tiny valid PNG used as evidence.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function main() {
  browser = await chromium.launch();
  const ctx = await newCtx();
  let p = await open(ctx);
  const ids = {};

  await test(1, "First launch on an empty installation", async () => {
    await p.waitForSelector("#new-pass");
    const hasVault = await p.evaluate(async () => { const db = await import("/js/core/db.js"); return !!(await db.get("meta", "vault")); });
    assert(!hasVault, "no vault header on first launch");
    assert((await p.textContent("h1")).includes("Case Compass"), "welcome heading");
    return "welcome screen shown; no vault, no records";
  });

  await test(2, "Vault creation and unlock", async () => {
    await createVault(p);
    await p.click('button[aria-label="Lock now"]');
    await p.waitForSelector("#unlock-pass");
    await unlock(p);
    await p.waitForFunction(() => document.querySelector("h1")?.textContent === "Home", null, { timeout: 30000 });
    const header = await p.evaluate(async () => { const db = await import("/js/core/db.js"); const h = await db.get("meta", "vault"); return { iter: h.kdf.iterations, hasWrapped: !!h.wrapped.ct, keys: Object.keys(h) }; });
    assert(header.iter === 600000 && header.hasWrapped, "PBKDF2 600k and wrapped key stored");
    return `PBKDF2-SHA256 ${header.iter} iterations, wrapped AES-256 key`;
  });

  await test(3, "Incorrect passphrase handling", async () => {
    await p.click('button[aria-label="Lock now"]');
    await unlock(p, "wrong passphrase entirely");
    await p.waitForFunction(() => /did not unlock/.test(document.querySelector(".err")?.textContent || ""), null, { timeout: 30000 });
    const stillLocked = await p.isVisible("#unlock-pass");
    assert(stillLocked, "remains locked");
    await p.waitForTimeout(1000);
    await unlock(p);
    await p.waitForFunction(() => document.querySelector("h1")?.textContent === "Home", null, { timeout: 30000 });
    return "clear error shown, vault stayed locked, correct passphrase then unlocked";
  });

  await test(24, "Correct behavior with no sample data", async () => {
    const n = await vaultEval(p, (vault) => vault.listRecords({ includeDeleted: true }).length);
    assert(n === 0, `expected 0 records, found ${n}`);
    await go(p, "#/document");
    assert(await p.isVisible("text=Nothing documented yet"), "empty timeline message");
    return "0 records; empty states shown";
  });

  await test(4, "Create, edit, and reopen every record type", async () => {
    // child first (needed by other types)
    await go(p, "#/new/child"); await p.fill("#f-name", "Test Child A"); await p.fill("#f-dob", "2018-04-12"); ids.child = await save(p);
    await go(p, "#/new/incident"); await p.fill("#f-title", "Exchange did not occur"); await p.fill("#f-date", "2026-10-17"); await p.fill("#f-time", "10:00"); await p.fill("#f-description", "I waited from 9:52 to 10:45. UNIQUE-INCIDENT-TEXT"); await addPerson(p, "people", "Other Parent"); await p.selectOption("#f-category", "Parenting time or exchange"); await p.fill("#f-privateNotes", "PRIVATE-NOTE-SHOULD-NOT-EXPORT"); ids.incident = await save(p);
    await go(p, "#/new/communication"); await p.fill("#f-date", "2026-10-03"); await p.selectOption("#f-method", "Text message"); await p.fill("#f-subject", "Weekend request"); await p.selectOption("#f-request", "Request for parenting time"); await p.selectOption("#f-responseStatus", "No response (unanswered)"); ids.communication = await save(p);
    await go(p, "#/new/parenting"); await p.selectOption("#f-entryType", "Completed parenting time"); await p.click('[data-key="children"] button.chip'); await p.fill("#f-date", "2026-10-11"); await p.fill("#f-startTime", "09:00"); await p.fill("#f-endDate", "2026-10-12"); await p.fill("#f-endTime", "17:00"); await p.fill("#f-overnights", "1"); await p.selectOption("#f-outcome", "Completed as planned"); ids.parenting = await save(p);
    await go(p, "#/new/childStatement"); await p.click('[data-key="children"] button.chip'); await p.fill("#f-statement", "I liked the park."); ids.childStatement = await save(p);
    await go(p, "#/new/police"); await p.fill("#f-agency", "Pueblo Police Department"); await p.fill("#f-date", "2026-10-20"); await p.fill("#f-caseNumber", "TEST-123"); ids.police = await save(p);
    await go(p, "#/new/residence"); await p.selectOption("#f-entryType", "Keys or codes"); await p.fill("#f-title", "Garage code changed"); ids.residence = await save(p);
    await go(p, "#/new/evidence"); await p.fill("#f-title", "Reference to phone screenshot"); await p.selectOption("#f-evidenceType", "External original (not stored here)"); ids.evidenceRef = await save(p);
    await go(p, "#/new/task"); await p.fill("#f-title", "Hearing"); await p.selectOption("#f-kind", "Court hearing"); await p.fill("#f-dueDate", "2026-12-03");
    await p.click("form .formbar button[type=submit]"); await p.waitForTimeout(300);
    assert(await p.isVisible("text=Source of this date is required."), "deadline source required for court dates");
    await p.fill("#f-deadlineSource", "Notice of hearing dated Oct 2, 2026"); ids.task = await save(p);
    await go(p, "#/new/attorney"); await p.fill("#f-name", "Test Attorney"); await p.fill("#f-questions", "Q1?\nQ2?"); ids.attorney = await save(p);
    await go(p, "#/new/expense"); await p.fill("#f-amount", "45"); await p.fill("#f-description", "Parenting class fee"); ids.expense = await save(p);
    // reopen each
    for (const [k, id] of Object.entries(ids)) { await go(p, `#/record/${id}`); const t = await h1(p); assert(t && !/not found/i.test(t), `reopen ${k}`); }
    // edit and verify revision history
    await go(p, `#/edit/${ids.incident}`); await p.fill("#f-title", "Scheduled exchange did not occur"); await save(p);
    assert(await p.isVisible("text=version 2"), "version 2 shown");
    await p.click("text=Show version history");
    await p.waitForSelector("text=Version 1");
    return `${Object.keys(ids).length} record types created and reopened; edit kept version 1 in history`;
  });

  await test(5, "Upload and retrieve evidence attachments", async () => {
    await go(p, "#/new/evidence"); await p.fill("#f-title", "Exchange sign-in photo");
    await p.setInputFiles("#f-file", { name: "photo.png", mimeType: "image/png", buffer: PNG });
    await p.waitForSelector("text=SHA-256");
    ids.evidence = await save(p);
    const stored = await vaultEval(p, async (vault, id) => { const r = vault.getRecord(id); const b = await vault.getBlob(r.data.file.blobId); return { sha: r.data.file.sha256, bytes: Array.from(b) }; }, ids.evidence);
    assert(stored.sha === sha(PNG), "stored SHA-256 matches original");
    assert(sha(Buffer.from(stored.bytes)) === sha(PNG), "retrieved bytes identical to original");
    await p.click("text=Verify integrity"); await p.waitForSelector("text=Integrity verified");
    await p.click("text=Show preview"); await p.waitForSelector(".preview img");
    const f = await download(p, 'button:has-text("Download original")');
    assert(sha(readFileSync(f)) === sha(PNG), "downloaded original identical");
    return `SHA-256 ${sha(PNG).slice(0, 16)}… verified after storage, preview, and download`;
  });

  await test(6, "Link evidence to more than one record", async () => {
    for (const target of [ids.incident, ids.communication]) {
      await go(p, `#/record/${target}`);
      await p.click('section button:has-text("Link")');
      await p.fill('dialog[open] input[type=search]', "Exchange sign-in photo");
      await p.click('dialog[open] button.item');
      await p.waitForTimeout(500);
    }
    await go(p, `#/record/${ids.evidence}`);
    const linkedText = await p.textContent("main");
    const incRef = await vaultEval(p, (v, a) => [v.getRecord(a[0]).ref, v.getRecord(a[1]).ref], [ids.incident, ids.communication]);
    assert(linkedText.includes(incRef[0]) && linkedText.includes(incRef[1]), "evidence shows both linked records");
    const blobCount = await p.evaluate(async () => { const db = await import("/js/core/db.js"); return (await db.getAll("blobs")).length; });
    assert(blobCount === 1, `one stored file (found ${blobCount})`);
    return `linked to ${incRef.join(" and ")}; file stored once`;
  });

  await test(7, "Search and filter records", async () => {
    await go(p, "#/document");
    await p.fill('input[aria-label="Search records"]', "UNIQUE-INCIDENT-TEXT");
    await p.waitForTimeout(200);
    let items = await p.$$eval("main ul.list > li", (l) => l.length);
    assert(items === 1, `keyword search returns 1 (got ${items})`);
    await p.fill('input[aria-label="Search records"]', "");
    if (!(await p.isVisible("#f-from"))) await p.click("summary:has-text('Filters')");
    await p.click('button.chip:has-text("Police & Official Contacts")');
    items = await p.$$eval("main ul.list > li", (l) => l.length);
    assert(items === 1, `type filter returns 1 police record (got ${items})`);
    await p.click('button.chip:has-text("Police & Official Contacts")');
    await p.selectOption("#f-ev", "with");
    items = await p.$$eval("main ul.list > li", (l) => l.length);
    assert(items >= 3, `evidence filter returns records with evidence (got ${items})`);
    await p.selectOption("#f-ev", ""); await p.fill("#f-from", "2026-10-15"); await p.fill("#f-to", "2026-10-18");
    items = await p.$$eval("main ul.list > li", (l) => l.length);
    assert(items === 1, `date range 10/15–10/18 returns the incident only (got ${items})`);
    await p.click("text=Clear filters");
    return "keyword, type, evidence status, and date-range filters return the expected records";
  });

  await test(8, "Complete checklist items and preserve progress", async () => {
    await go(p, "#/resources/protection/B");
    await p.click("summary:has-text('Create a private email address')");
    await p.check("#cl-B1");
    await p.fill("#cln-B1", "Done from trusted laptop");
    await p.locator("#cln-B1").blur();
    await p.waitForTimeout(500);
    await p.reload(); await p.waitForTimeout(500);
    // Resources are public, so after a reload the page stays readable but locked: progress is not shown.
    assert(!(await p.isChecked("#cl-B1").catch(() => false)), "progress hidden while locked");
    await go(p, "#/unlock"); await unlock(p);
    await p.waitForFunction(() => document.querySelector("h1")?.textContent === "Home", null, { timeout: 30000 });
    await go(p, "#/resources/protection/B");
    await p.click("summary:has-text('Create a private email address')");
    assert(await p.isChecked("#cl-B1"), "B1 still checked after reload");
    assert((await p.inputValue("#cln-B1")) === "Done from trusted laptop", "notes kept");
    assert((await p.inputValue("#cld-B1")).length === 10, "completion date set");
    return "B1 completion, date, and notes persisted across reload (encrypted)";
  });

  await test(9, "Create and update calendar events", async () => {
    await go(p, "#/new/task?date=2026-11-20"); await p.fill("#f-title", "Parenting class session"); await p.selectOption("#f-kind", "Parenting class"); const tid = await save(p);
    await go(p, "#/home/calendar?month=2026-11");
    await p.click('button[aria-label^="November 20, 2026"]');
    assert(await p.isVisible("main >> text=Parenting class session"), "task listed on its day");
    await go(p, `#/edit/${tid}`); await p.selectOption("#f-status", "Done"); await p.fill("#f-completedDate", "2026-11-20"); await save(p);
    await go(p, "#/home/calendar?month=2026-11");
    const openList = await p.textContent("main");
    assert(openList.includes("Completed or cancelled"), "completed section exists");
    return "task created on calendar day, then marked Done with completion date";
  });

  let docxFile, xlsxFile, pdfFile;
  await test(10, "Export actual Word documents", async () => {
    await go(p, "#/reports");
    docxFile = await download(p, 'button:has-text("Word (.docx)")');
    const out = py(`import docx,sys\nd=docx.Document(sys.argv[1])\nt='\\n'.join(p.text for p in d.paragraphs)+'\\n'.join(c.text for tb in d.tables for r in tb.rows for c in r.cells)\nprint(len(d.tables), 'INC-0001' in t, 'UNIQUE-INCIDENT-TEXT' in t, 'PRIVATE-NOTE-SHOULD-NOT-EXPORT' in t)`, docxFile);
    const [tables, hasRef, hasText, hasPrivate] = out.split(" ");
    assert(Number(tables) > 3 && hasRef === "True" && hasText === "True", `docx content (${out})`);
    assert(hasPrivate === "False", "private notes excluded by default");
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", DL, docxFile], { stdio: "ignore", timeout: 120000 });
    return `opened by python-docx (${tables} tables) and LibreOffice; record IDs and text match; private notes excluded`;
  });

  await test(11, "Export actual Excel workbooks", async () => {
    xlsxFile = await download(p, 'button:has-text("Excel (.xlsx)")');
    const out = JSON.parse(py(`import openpyxl,sys,json\nwb=openpyxl.load_workbook(sys.argv[1])\nr={ws.title:[ws.max_row,ws.freeze_panes,ws.auto_filter.ref] for ws in wb.worksheets}\nws=wb['Incidents']\nhdr=[c.value for c in ws[1]]\nrow=[c.value for c in ws[2]]\nr['_inc']=[hdr.index('Record ID'), row[hdr.index('Record ID')], str(row[hdr.index('Date it happened')])[:10], row[hdr.index('Short title')]]\nprint(json.dumps(r))`, xlsxFile));
    const names = Object.keys(out).filter((k) => k !== "_inc");
    assert(names.length === 12, `12 sheets (${names.length})`);
    for (const n of names.filter((n) => n !== "Overview")) { assert(out[n][1] === "A2", `${n} frozen`); assert(out[n][2], `${n} filter`); }
    const src = await vaultEval(p, (v, id) => ({ ref: v.getRecord(id).ref, date: v.getRecord(id).data.date, title: v.getRecord(id).data.title }), ids.incident);
    assert(out._inc[1] === src.ref && out._inc[2] === src.date && out._inc[3] === src.title, `incident row matches source ${JSON.stringify(out._inc)}`);
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", DL, xlsxFile], { stdio: "ignore", timeout: 120000 });
    return `12 sheets with frozen, filterable headers; Incidents row matches source (${src.ref}, ${src.date}); opens in LibreOffice`;
  });

  await test(12, "Print and save a PDF", async () => {
    pdfFile = await download(p, 'button:has-text("PDF")');
    const info = py(`import pypdf,sys\nr=pypdf.PdfReader(sys.argv[1])\nt=''.join(pg.extract_text() for pg in r.pages)\nprint(len(r.pages), r.pages[0].mediabox[2], r.pages[0].mediabox[3], 'INC-0001' in t, 'Page 1 of' in t)`, pdfFile).split(" ");
    assert(info[1] === "612" && info[2] === "792", "US Letter");
    assert(info[3] === "True" && info[4] === "True", "content and page numbers");
    const [popup] = await Promise.all([p.waitForEvent("popup"), p.click('button:has-text("Print / Save as PDF")')]);
    await popup.waitForLoadState();
    assert(await popup.isVisible("#pp-print"), "print view has Print button");
    const printPdf = path.join(DL, "print-view.pdf");
    await popup.pdf({ path: printPdf, format: "Letter" });
    const pages2 = py(`import pypdf,sys\nprint(len(pypdf.PdfReader(sys.argv[1]).pages))`, printPdf);
    await popup.close();
    return `native PDF: ${info[0]} US Letter pages with page numbers; browser print view saved as ${pages2}-page PDF`;
  });

  let backupFile;
  await test(13, "Export an encrypted backup", async () => {
    await go(p, "#/reports/backup");
    await p.click('button:has-text("Create encrypted backup")');
    await p.click('dialog[open] button:has-text("Use my vault passphrase")');
    await p.fill("#dlg-pw1", PASS);
    await p.click('dialog[open] button:has-text("Create backup")');
    await p.waitForSelector('dialog[open] button:has-text("Download")', { timeout: 60000 });
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click('dialog[open] button:has-text("Download")')]);
    backupFile = path.join(DL, dl.suggestedFilename()); await dl.saveAs(backupFile);
    const text = readFileSync(backupFile, "utf8");
    assert(text.includes('"format":"case-compass-backup"'), "format marker");
    assert(!text.includes("UNIQUE-INCIDENT-TEXT") && !text.includes("Exchange did not occur"), "no plaintext record content");
    assert(await p.isVisible("text=Backup created and verified"), "self-verified");
    return `${(text.length / 1024).toFixed(1)} KB, AES-256-GCM, verified before download; no plaintext found`;
  });

  await test(14, "Restore the backup in a clean environment", async () => {
    const ctx2 = await newCtx();
    const q = await open(ctx2, "#/restore");
    await q.waitForSelector('button:has-text("Choose backup file")');
    const [chooser] = await Promise.all([q.waitForEvent("filechooser"), q.click('button:has-text("Choose backup file")')]);
    await chooser.setFiles(backupFile);
    await q.fill("#rb-pass", PASS);
    await q.click('button:has-text("Decrypt, verify, and restore")');
    await q.waitForSelector("text=Restore complete", { timeout: 60000 });
    await q.waitForFunction(() => document.querySelector("h1")?.textContent === "Home", null, { timeout: 15000 });
    const check = await vaultEval(q, async (v, id) => { const r = v.getRecord(id); const b = await v.getBlob(r.data.file.blobId); return { n: v.listRecords().length, sha: r.data.file.sha256, bytes: Array.from(b), checklist: v.getKV("checklists", {}).B1?.done }; }, ids.evidence);
    const srcN = await vaultEval(p, (v) => v.listRecords().length);
    assert(check.n === srcN, `record count ${check.n} = ${srcN}`);
    assert(sha(Buffer.from(check.bytes)) === sha(PNG) && check.sha === sha(PNG), "attachment intact");
    assert(check.checklist === true, "checklist progress restored");
    await ctx2.close();
    return `${check.n} records, attachment hash, and checklist progress identical in a fresh browser profile`;
  });

  await test(15, "Migrate an older planner backup", async () => {
    const legacy = { app: "Family Law Planner", version: "2.1", exportedAt: "2026-06-01T12:00:00Z",
      incidents: [{ id: "INC-0042", date: "05/03/2026", time: "6:30 PM", title: "Late pickup", description: "Pickup occurred 40 minutes late.", createdAt: "2026-05-03T19:00:00Z" }, { id: 7, eventDate: "2026-05-10", details: "Phone call not answered." }],
      communications: [{ date: "2026-05-04", method: "Text", subject: "Schedule", text: "Asked about Saturday." }],
      tasks: [{ title: "Call self-help center", due: "2026-06-10", done: false }] };
    const file = path.join(DL, "legacy-planner.json"); writeFileSync(file, JSON.stringify(legacy));
    await go(p, "#/reports/import");
    const [ch] = await Promise.all([p.waitForEvent("filechooser"), p.click('button:has-text("Choose file")')]);
    await ch.setFiles(file);
    await p.waitForSelector("text=Import preview");
    await p.click('button:has-text("Import 4 records")');
    await p.waitForSelector("text=Import complete");
    const imp = await vaultEval(p, (v) => v.listRecords().filter((r) => r.importedFrom).map((r) => ({ ref: r.ref, type: r.type, date: r.data.date || r.data.dueDate, created: r.createdAt, legacy: !!r.data.legacy, orig: r.importedFrom.originalId })));
    assert(imp.length === 4, `4 imported (${imp.length})`);
    const kept = imp.find((x) => x.ref === "INC-0042");
    assert(kept && kept.date === "2026-05-03" && kept.created.startsWith("2026-05-03"), "original ID, date, and creation date preserved");
    assert(imp.every((x) => x.legacy), "original data preserved");
    await go(p, "#/reports/import");
    const [ch2] = await Promise.all([p.waitForEvent("filechooser"), p.click('button:has-text("Choose file")')]);
    await ch2.setFiles(file);
    await p.waitForSelector("text=Import preview");
    assert(await p.isVisible("text=4 were imported before and will be skipped"), "duplicate import prevented");
    return "4 legacy entries imported (original id INC-0042, dates, and raw data kept); re-import detected as duplicates";
  });

  await test(16, "Recover from interrupted edits", async () => {
    await go(p, "#/new/incident");
    await p.fill("#f-title", "Draft that must survive");
    await p.fill("#f-description", "Typed before the browser closed.");
    await p.waitForTimeout(1600);
    await p.reload(); // simulate crash / accidental close
    await unlock(p);
    await p.waitForTimeout(800);
    await go(p, "#/new/incident");
    await p.waitForSelector("text=Restore draft");
    await p.click("text=Restore draft");
    assert((await p.inputValue("#f-title")) === "Draft that must survive", "title restored");
    assert((await p.inputValue("#f-description")).includes("Typed before"), "description restored");
    // back-navigation guard
    await p.fill("#f-title", "Draft that must survive (edited)");
    await p.evaluate(() => { location.hash = "#/home"; });
    await p.waitForSelector('dialog[open] >> text=Leave this page?');
    await p.click('dialog[open] button:has-text("Stay here")');
    assert((await p.evaluate(() => location.hash)) === "#/new/incident", "stayed on form");
    const draftCipher = await p.evaluate(async () => { const db = await import("/js/core/db.js"); const d = await db.getAll("drafts"); return JSON.stringify(d.map((x) => ({ ...x, ct: Array.from(x.ct || []).length }))); });
    assert(!draftCipher.includes("Draft that must survive"), "draft stored encrypted");
    await p.evaluate(() => { location.hash = "#/home"; });
    await p.waitForSelector('dialog[open] >> text=Leave this page?');
    await p.click('dialog[open] button:has-text("Leave page")');
    await p.waitForFunction(() => location.hash === "#/home");
    return "encrypted draft restored after reload; leaving with unsaved text asks first";
  });

  await test(17, "Handle unavailable storage or encryption", async () => {
    // (a) Web Crypto unavailable
    const ctx3 = await newCtx();
    await ctx3.addInitScript(() => { Object.defineProperty(Crypto.prototype, "subtle", { get() { return undefined; } }); });
    const a = await open(ctx3); await a.waitForTimeout(500);
    assert(await a.isVisible("text=Secure storage is not available"), "no-crypto message");
    await ctx3.close();
    // (b) Plain HTTP on a non-local address is not a secure context
    const insecure = process.env.CC_INSECURE_BASE;
    if (insecure) {
      const ctxI = await browser.newContext();
      const ai = await ctxI.newPage(); await ai.goto(insecure); await ai.waitForTimeout(600);
      assert(await ai.isVisible("text=Secure storage is not available"), "insecure-origin message");
      await ctxI.close();
    }
    const ctx4 = await newCtx();
    await ctx4.addInitScript(() => { const orig = indexedDB.open.bind(indexedDB); indexedDB.open = () => { throw new DOMException("blocked", "SecurityError"); }; void orig; });
    const b = await open(ctx4); await b.waitForTimeout(800);
    assert(await b.isVisible("text=Storage is blocked"), "storage blocked message");
    await ctx4.close();
    const ctx5 = await newCtx();
    const c = await ctx5.newPage();
    await c.goto("file://" + path.join(ROOT, "index.html")); await c.waitForTimeout(500);
    assert(await c.isVisible("text=Open Case Compass from a web address"), "file:// message");
    await ctx5.close();
    return `missing Web Crypto${process.env.CC_INSECURE_BASE ? ", plain-HTTP non-local address" : ""}, blocked IndexedDB, and file:// each show an explanation (never a plaintext fallback)`;
  });

  await test(18, "Open on a small iPhone screen", async () => {
    const ctx6 = await newCtx({ ...devices["iPhone SE"] });
    const m = await open(ctx6);
    await createVault(m);
    const routes = ["#/home", "#/document", "#/parenting", "#/resources", "#/resources/forms", "#/reports", "#/reports/backup", "#/new/incident", "#/home/calendar"];
    const issues = [];
    for (const r of routes) {
      await go(m, r);
      const o = await m.evaluate(() => ({ over: document.documentElement.scrollWidth > window.innerWidth + 1, nav: getComputedStyle(document.querySelector(".bottomnav")).display, small: [...document.querySelectorAll(".bottomnav a")].filter((a) => a.getBoundingClientRect().height < 44).length }));
      if (o.over) issues.push(`${r} overflow`); if (o.nav === "none") issues.push(`${r} no bottom nav`); if (o.small) issues.push(`${r} small nav targets`);
    }
    assert(!issues.length, issues.join(", "));
    await ctx6.close();
    return `iPhone SE (375×667): ${routes.length} screens without horizontal overflow; bottom navigation with ≥44px targets`;
  });

  await test(19, "Open on desktop", async () => {
    await p.setViewportSize({ width: 1440, height: 900 });
    await go(p, "#/home");
    const d = await p.evaluate(() => ({ side: getComputedStyle(document.querySelector(".sidebar")).display, bottom: getComputedStyle(document.querySelector(".bottomnav")).display, over: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    assert(d.side !== "none" && d.bottom === "none" && !d.over, JSON.stringify(d));
    await p.setViewportSize({ width: 1280, height: 900 });
    return "sidebar navigation shown; bottom bar hidden; no overflow at 1440px";
  });

  await test(20, "Work offline after initial installation", async () => {
    const ctx7 = await newCtx();
    const o = await open(ctx7);
    await o.evaluate(async () => { await navigator.serviceWorker.ready; });
    await o.reload(); await o.waitForTimeout(800);
    const controlled = await o.evaluate(() => !!navigator.serviceWorker.controller);
    assert(controlled, "service worker controls the page");
    await createVault(o);
    await ctx7.setOffline(true);
    await o.reload(); await o.waitForTimeout(1200);
    await unlock(o);
    await o.waitForFunction(() => document.querySelector("h1")?.textContent === "Home", null, { timeout: 30000 });
    await go(o, "#/resources/forms");
    assert((await h1(o)) === "Court Forms", "resources offline");
    await go(o, "#/new/incident"); await o.fill("#f-title", "Offline entry"); await o.fill("#f-description", "Recorded with no connection"); await save(o);
    await ctx7.close();
    return "reloaded with network disabled; unlocked, browsed, and saved a record offline";
  });

  await test(21, "Open every internal navigation destination", async () => {
    const seen = new Set(); const queue = ["#/home", "#/document", "#/parenting", "#/resources", "#/reports"]; const bad = [];
    while (queue.length && seen.size < 120) {
      const r = queue.shift(); if (seen.has(r)) continue; seen.add(r);
      await go(p, r);
      const state = await p.evaluate(() => ({ h: document.querySelector("main h1")?.textContent || "", err: !!document.querySelector("main .card.danger h1")?.textContent?.includes("could not be shown"), links: [...document.querySelectorAll('main a[href^="#/"], nav a[href^="#/"]')].map((a) => a.getAttribute("href")) }));
      if (!state.h || state.err) bad.push(r);
      for (const l of state.links) if (!seen.has(l) && !/#\/(edit|record)\/|#\/(unlock|welcome|restore)/.test(l) && !l.includes("?t=")) queue.push(l);
    }
    assert(!bad.length, `failed: ${bad.join(", ")}`);
    assert(seen.size >= 25, `only ${seen.size} destinations reached`);
    return `${seen.size} internal destinations rendered with a heading and no error`;
  });

  await test(22, "Detect missing local resources", async () => {
    await go(p, "#/resources/library");
    await p.click('button:has-text("Check bundled files")');
    await p.waitForSelector("text=bundled files are present", { timeout: 15000 });
    await p.route("**/docs/Case_Compass_Quick_Start.pdf", (r) => r.fulfill({ status: 404, body: "" }));
    await go(p, "#/resources"); await go(p, "#/resources/library");
    await p.click('button:has-text("Check bundled files")');
    await p.waitForSelector("text=missing or could not be reached", { timeout: 15000 });
    await p.unroute("**/docs/Case_Compass_Quick_Start.pdf");
    return "all bundled files found; a simulated missing file is reported by name";
  });

  await test(23, "Display clear errors instead of blank screens", async () => {
    await go(p, "#/record/does-not-exist");
    assert(await p.isVisible("text=This record was not found"), "not-found message");
    const ctx8 = await newCtx();
    await ctx8.route("**/js/views/home.js", (r) => r.fulfill({ status: 500, body: "" }));
    const e = await open(ctx8); await e.waitForTimeout(1500);
    const txt = await e.textContent("body");
    assert(/could not start|did not start|Loading/.test(txt), "startup failure explained");
    await e.waitForSelector("text=/did not start|could not start/", { timeout: 20000 });
    await ctx8.close();
    return "missing record and failed app file both produce readable messages";
  });

  await test(25, "Sensitive data is not transmitted externally", async () => {
    const external = [...allRequests].filter((u) => !u.startsWith(BASE) && !u.startsWith("blob:") && !u.startsWith("data:") && !u.startsWith("file:") && !u.startsWith("about:"));
    assert(!external.length, `external requests: ${external.slice(0, 5).join(", ")}`);
    const csp = readFileSync(path.join(ROOT, "index.html"), "utf8").match(/connect-src ([^;]+)/)[1].trim();
    assert(csp === "'self'", "CSP connect-src 'self'");
    return `${allRequests.size} requests observed across all tests, all same-origin; CSP connect-src 'self' blocks outbound connections`;
  });

  await ctx.close();
  await browser.close();
  results.sort((a, b) => a.id - b.id);
  const summary = { run: new Date().toISOString(), base: BASE, passed: results.filter((r) => r.status === "passed").length, failed: results.filter((r) => r.status === "failed").length, results };
  writeFileSync(path.join(OUT, "e2e-results.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} passed, ${summary.failed} failed`);
  process.exit(summary.failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
