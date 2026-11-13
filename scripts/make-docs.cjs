// Renders docs/manual.html and docs/quick-start.html to US Letter PDFs. Requires the app served
// at http://127.0.0.1:8080/. Usage: node scripts/make-docs.cjs
const { chromium } = require("playwright");
const path = require("path");
const BASE = process.env.CC_BASE || "http://127.0.0.1:8080/";
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [src, out, title] of [["docs/manual.html", "docs/Case_Compass_User_Manual.pdf", "Case Compass User Manual"], ["docs/quick-start.html", "docs/Case_Compass_Quick_Start.pdf", "Case Compass Quick Start"]]) {
    await p.goto(BASE + src, { waitUntil: "networkidle" });
    await p.pdf({ path: path.join(__dirname, "..", out), format: "Letter", printBackground: true, displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:8px;color:#666;width:100%;padding:0 0.6in;display:flex;justify-content:space-between"><span>${title} · v3.0</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      margin: { top: "0.6in", bottom: "0.7in", left: "0.1in", right: "0.1in" } });
    console.log("wrote", out);
  }
  await b.close();
})();
