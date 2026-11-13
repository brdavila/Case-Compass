import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleRecords, sampleCtx } from "../../scripts/sample-data.mjs";
import { buildReportModel, buildWorkbookModel, buildTimelineCSV, defaultOptions, selectRecords, parentingStats } from "../../js/reports/model.js";
import { buildDocx } from "../../js/reports/docx.js";
import { buildXlsx } from "../../js/reports/xlsx.js";
import { buildPdf } from "../../js/reports/pdf.js";
import { createZip, crc32 } from "../../js/reports/zip.js";
import { buildICS } from "../../js/reports/ics.js";

const recs = sampleRecords();
const ctx = sampleCtx(recs, { protocols: [], guides: [] });
const text = (m) => JSON.stringify(m);

test("CRC-32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("ZIP output has local headers and an end-of-central-directory record", () => {
  const z = createZip([{ name: "a.txt", data: "hello" }]);
  assert.deepEqual([...z.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...z.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
});

test("date-range selection includes only records in range", () => {
  const sel = selectRecords(recs, { ...defaultOptions("chronological"), range: { start: "2026-10-15", end: "2026-10-20" } });
  assert.ok(sel.length > 0);
  for (const r of sel) if (r.type !== "child") assert.ok(r.data.date || r.data.dateCreated || r.data.dueDate);
  assert.ok(sel.some((r) => r.ref === "INC-0001"));
  assert.ok(!sel.some((r) => r.ref === "COM-0001"), "Oct 3 communication excluded");
});

test("private notes and prior advice are excluded by default and included on request", () => {
  const def = text(buildReportModel(recs, defaultOptions("chronological"), ctx));
  assert.ok(!def.includes("PRIVATE NOTE (fictional)"));
  const inc = text(buildReportModel(recs, { ...defaultOptions("chronological"), includePrivate: true }, ctx));
  assert.ok(inc.includes("PRIVATE NOTE (fictional)"));
  const att = text(buildReportModel(recs, defaultOptions("attorney"), ctx));
  assert.ok(!att.includes("PRIVATE (fictional prior advice)"));
});

test("child minimization shows initials and exclusion removes child statements", () => {
  const min = text(buildReportModel(recs, { ...defaultOptions("chronological"), childMode: "minimal" }, ctx));
  assert.ok(!min.includes("Avery Example (fictional)") && min.includes("A.E."));
  const ex = text(buildReportModel(recs, { ...defaultOptions("chronological"), childMode: "exclude" }, ctx));
  assert.ok(!ex.includes("pumpkin patch. Can we go"));
});

test("reports never contain sample labels unless sample mode is chosen", () => {
  const real = buildReportModel(recs, defaultOptions("chronological"), ctx);
  assert.ok(!real.title.startsWith("SAMPLE"));
  const s = buildReportModel(recs, { ...defaultOptions("chronological"), sample: true }, ctx);
  assert.ok(s.title.startsWith("SAMPLE") && s.notice.startsWith("SAMPLE ONLY"));
});

test("parenting statistics count requested, scheduled, completed, and overnights", () => {
  const s = parentingStats(recs, { start: "2026-10-01", end: "2026-10-31" });
  assert.equal(s.requested, 1); assert.equal(s.scheduled, 1); assert.equal(s.completed, 2);
  assert.equal(s.overnights, 2); assert.equal(s.cancelledByOther, 1); assert.equal(s.hours, 64);
});

test("Word, Excel, and PDF builders produce valid containers", () => {
  const m = buildReportModel(recs, { ...defaultOptions("monthly"), month: "2026-10" }, ctx);
  const docx = buildDocx(m); assert.equal(String.fromCharCode(docx[0], docx[1]), "PK");
  const xlsx = buildXlsx(buildWorkbookModel(recs, defaultOptions("chronological"), ctx)); assert.equal(String.fromCharCode(xlsx[0], xlsx[1]), "PK");
  const pdf = buildPdf(m); const s = new TextDecoder("latin1").decode(pdf);
  assert.ok(s.startsWith("%PDF-1.4") && s.trimEnd().endsWith("%%EOF") && s.includes("/MediaBox [0 0 612 792]"));
});

test("the workbook has the 12 required sheets", () => {
  const wb = buildWorkbookModel(recs, defaultOptions("chronological"), ctx);
  assert.deepEqual(wb.sheets.map((s) => s.name), ["Overview", "Chronological Timeline", "Incidents", "Communications", "Parenting Time", "Children and Activities", "Evidence Inventory", "Police Contacts", "Court Deadlines", "Task Tracker", "Expenses", "Security Checklist"]);
});

test("CSV export neutralizes spreadsheet formulas", () => {
  const evil = [{ ...recs.find((r) => r.type === "incident"), id: "x", ref: "INC-0099", data: { ...recs.find((r) => r.type === "incident").data, description: "=HYPERLINK(\"http://example.com\")" } }];
  const csv = buildTimelineCSV(evil, defaultOptions("chronological"), sampleCtx(evil));
  assert.ok(csv.includes("'=HYPERLINK"));
});

test("calendar export produces valid iCalendar text", () => {
  const ics = buildICS([{ uid: "u1", title: "Appointment", date: "2026-11-20", time: "14:00", tz: "America/Denver", alarmMinutes: 60 }]);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR") && ics.includes("DTSTART;TZID=America/Denver:20261120T140000") && ics.includes("TRIGGER:-PT60M"));
});
