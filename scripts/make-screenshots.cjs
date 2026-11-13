// Captures interface screenshots for the user manual using a throwaway browser profile seeded
// with the FICTIONAL sample data. Requires the app served at http://127.0.0.1:8080/.
// Usage: node scripts/make-screenshots.cjs
const { chromium, devices } = require("playwright");
const path = require("path"); const fs = require("fs");
const OUT = path.join(__dirname, "../docs/screenshots");
const BASE = process.env.CC_BASE || "http://127.0.0.1:8080/";
const PASS = "sample screenshot vault 2026 only";
fs.mkdirSync(OUT, { recursive: true });

async function setup(ctx) {
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForSelector("#new-pass");
  return p;
}
async function create(p) {
  await p.fill("#new-pass", PASS); await p.fill("#new-pass2", PASS); await p.check("#ack");
  await p.click("form button[type=submit]");
  await p.waitForFunction(() => document.querySelector("h1")?.textContent === "Home", null, { timeout: 30000 });
}
async function seed(p) {
  await p.evaluate(async () => {
    const vault = await import("/js/core/vault.js");
    const { sampleRecords } = await import("/scripts/sample-data.mjs");
    const recs = sampleRecords();
    const c = document.createElement("canvas"); c.width = 640; c.height = 420;
    const g = c.getContext("2d"); g.fillStyle = "#e9edf1"; g.fillRect(0, 0, 640, 420); g.fillStyle = "#33414f"; g.font = "bold 30px sans-serif"; g.fillText("SAMPLE PHOTO (fictional)", 120, 200); g.font = "20px sans-serif"; g.fillText("Visitor sign-in sheet – demonstration only", 120, 240);
    const bytes = new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/png"))).arrayBuffer());
    const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const counters = {};
    for (const r of recs) {
      if (r.type === "evidence") { await vault.putBlob(bytes, r.data.file.blobId); r.data.file = { ...r.data.file, sha256: sha, size: bytes.byteLength, type: "image/png", name: "sample-photo.png" }; }
      await vault.putRecordRaw(r);
      const [pre, n] = r.ref.split("-"); counters[pre] = Math.max(counters[pre] || 0, Number(n));
    }
    await vault.setKV("counters", counters);
    await vault.setKV("checklists", { A1: { done: true, date: "2026-10-02" }, A2: { done: true, date: "2026-10-02" }, B1: { done: true, date: "2026-10-03" }, B2: { done: true, date: "2026-10-03" }, B4: { done: true, date: "2026-10-04" }, F1: { done: true, date: "2026-10-09" } });
    await vault.updateSettings({ preparedBy: "Sample Parent (fictional)" });
    vault.notify("records");
  });
}
async function shot(p, hash, name, opts = {}) {
  await p.evaluate((h) => { location.hash = h; }, hash);
  await p.waitForTimeout(600);
  if (opts.before) await opts.before(p);
  await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: !!opts.full });
  console.log("saved", name);
}

(async () => {
  const b = await chromium.launch();
  // Mobile (iPhone 13)
  // iPhone 13-sized viewport at 2x. (Headless software rendering times out on full-screen gradients
  // with isMobile emulation or 3x density; the responsive layout depends only on the width.)
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, userAgent: devices["iPhone 13"].userAgent });
  const p = await setup(m);
  await p.screenshot({ path: path.join(OUT, "m01-welcome.png") }); console.log("saved m01-welcome");
  await create(p); await seed(p);
  await shot(p, "#/home?x=1", "m02-home");
  await shot(p, "#/new/incident", "m03-new-incident");
  await shot(p, "#/document", "m04-timeline");
  const incId = await p.evaluate(async () => (await import("/js/core/vault.js")).findByRef("INC-0001").id);
  await shot(p, `#/record/${incId}`, "m05-record-detail");
  await shot(p, "#/parenting", "m06-parenting", { before: async (pg) => { await pg.selectOption("#pt-preset", "all"); await pg.evaluate(() => window.scrollTo(0, 260)); await pg.waitForTimeout(200); } });
  await shot(p, "#/resources", "m07-resources");
  await shot(p, "#/resources/protection/B", "m08-protocol", { before: async (pg) => { await pg.click("summary:has-text('Change passwords')"); await pg.waitForTimeout(200); } });
  await shot(p, "#/resources/forms", "m09-forms", { before: async (pg) => { await pg.evaluate(() => window.scrollTo(0, 420)); } });
  await shot(p, "#/reports", "m10-reports");
  await shot(p, "#/reports/backup", "m11-backup");
  await p.click('button[aria-label="Lock now"]'); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, "m12-locked.png") }); console.log("saved m12-locked");
  await m.close();
  // Desktop
  const d = await b.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
  const q = await setup(d); await create(q); await seed(q);
  await q.evaluate(async () => (await import("/js/core/vault.js")).updateSettings({ orientationDismissed: true }));
  await shot(q, "#/home?x=2", "d01-home");
  await shot(q, "#/document", "d02-timeline");
  const evId = await q.evaluate(async () => (await import("/js/core/vault.js")).findByRef("EV-0002").id);
  await shot(q, `#/record/${evId}`, "d03-evidence", { before: async (pg) => { await pg.click("text=Show preview"); await pg.waitForTimeout(300); } });
  await shot(q, "#/home/calendar?month=2026-11", "d04-calendar");
  await shot(q, "#/reports?kind=attorney", "d05-attorney-packet");
  await d.close(); await b.close();
})();
