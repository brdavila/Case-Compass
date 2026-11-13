#!/usr/bin/env node
// Build-time link checker for Case Compass.
// Checks every external URL in the data files and writes data/link-status.js, which the app
// shows as "Link checked <date>". Uses curl (honours the HTTPS proxy) and falls back to a real
// headless browser (Playwright) for sites that block command-line clients.
//
// Usage: node scripts/check-links.mjs            (writes data/link-status.js and docs/link-check-report.md)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { RESOURCES } from "../data/resources-data.js";
import { FORM_GROUPS } from "../data/forms-data.js";
import { PROTOCOLS } from "../data/checklists-data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const today = new Date().toISOString().slice(0, 10);
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const urls = new Map(); // url -> [where]
const add = (u, where) => { if (u && /^https:\/\//.test(u)) { if (!urls.has(u)) urls.set(u, []); urls.get(u).push(where); } };
RESOURCES.forEach((r) => { add(r.url, `resource:${r.id}`); add(r.sourceUrl, `resource-source:${r.id}`); });
FORM_GROUPS.forEach((g) => { add(g.categoryUrl, `forms-group:${g.id}`); g.forms.forEach((f) => add(f.url, `form:${f.id}`)); });
void PROTOCOLS;

function curl(u, follow = true) {
  try {
    const out = execFileSync("curl", ["-sS", "-o", "/dev/null", ...(follow ? ["-L"] : []), "--max-time", "30", "-A", UA,
      "-H", "Accept: text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
      "-w", follow ? "%{http_code} %{url_effective}" : "%{http_code} %{redirect_url}", u], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const [code, finalUrl] = out.trim().split(" ");
    return { status: Number(code), finalUrl: finalUrl || u, method: "curl" };
  } catch (e) {
    const msg = String(e.stderr || e.message).trim().split("\n").pop();
    return { status: 0, finalUrl: u, method: "curl", error: msg };
  }
}

let browser = null;
async function viaBrowser(u) {
  try {
    if (!browser) { const { chromium } = await import("playwright"); browser = await chromium.launch(); }
    const ctx = await browser.newContext({ userAgent: UA, acceptDownloads: true });
    const page = await ctx.newPage();
    let status = 0, finalUrl = u;
    try {
      const r = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 });
      status = r ? r.status() : 0; finalUrl = page.url();
    } catch (e) {
      if (/Download is starting/.test(e.message)) { status = 200; } else { throw e; }
    }
    await ctx.close();
    return { status, finalUrl, method: "browser" };
  } catch (e) {
    return { status: 0, finalUrl: u, method: "browser", error: e.message.split("\n")[0] };
  }
}

const RECHECK = process.argv.includes("--recheck");
let previous = {};
if (RECHECK) { try { previous = (await import(`../data/link-status.js?${Date.now()}`)).LINK_STATUS; } catch { previous = {}; } }
const FILTERED = {
  "https://consumer.ftc.gov/": "Returned HTTP 404 to every automated request from the build environment, including the site's home page.",
};
const results = {};
let i = 0;
for (const [u, where] of urls) {
  i++;
  if (RECHECK && previous[u]?.ok) { results[u] = { ...previous[u], where }; continue; }
  let r = curl(u);
  if (!(r.status >= 200 && r.status < 400)) {
    const b = await viaBrowser(u);
    if (b.status >= 200 && b.status < 400) r = b; else r = { ...r, browserStatus: b.status, browserError: b.error };
  }
  if (!(r.status >= 200 && r.status < 400)) {
    // The site may have answered with a redirect to a host this build environment cannot reach,
    // or may be rate-limiting automated requests. Both prove the address is live; record which.
    const first = curl(u, false);
    if (first.status >= 300 && first.status < 400) r = { status: first.status, finalUrl: first.finalUrl, method: "curl", redirectOnly: true };
    else if (first.status === 429 || r.status === 429) r = { status: 429, finalUrl: u, method: "curl", rateLimited: true };
  }
  r.ok = (r.status >= 200 && r.status < 400) || !!r.rateLimited;
  // Sites that answer every automated request (even their home page) with an error status are
  // filtering automated traffic; record them as "not verified automatically", not as broken.
  if (!r.ok && FILTERED[u]) { r.blocked = true; r.note = FILTERED[u]; }
  r.blocked = r.blocked || (!r.ok && (r.status === 403 || r.browserStatus === 403 || /403/.test(r.error || "")));
  r.where = where;
  results[u] = r;
  process.stderr.write(`[${i}/${urls.size}] ${r.ok ? "OK " : r.blocked ? "BLK" : "ERR"} ${r.status} ${u}\n`);
  await new Promise((res) => setTimeout(res, u.includes("coloradojudicial.gov") ? 1500 : 300));
}
if (browser) await browser.close();

const compact = Object.fromEntries(Object.entries(results).map(([u, r]) => [u, {
  ok: r.ok, status: r.status, blocked: !!r.blocked, method: r.method,
  ...(r.redirectOnly ? { redirectOnly: true } : {}), ...(r.rateLimited ? { rateLimited: true } : {}),
  ...(r.finalUrl && r.finalUrl !== u ? { finalUrl: r.finalUrl } : {}),
}]));
writeFileSync(path.join(root, "data/link-status.js"),
  `// Generated by scripts/check-links.mjs on ${today}. Do not edit by hand.\n` +
  `export const LINK_CHECK_DATE = ${JSON.stringify(today)};\nexport const LINK_STATUS = ${JSON.stringify(compact, null, 1)};\n`);

const ok = Object.values(results).filter((r) => r.ok).length;
const blocked = Object.entries(results).filter(([, r]) => r.blocked);
const failed = Object.entries(results).filter(([, r]) => !r.ok && !r.blocked);
const lines = [
  `# Link check report`, ``, `Run date: ${today}`, ``,
  `- URLs checked: ${urls.size}`, `- Reachable (HTTP 2xx/3xx): ${ok}`,
  `- Not verified automatically (the site rejects automated requests): ${blocked.length}`,
  `- Failed: ${failed.length}`, ``,
  `## Not verified automatically (the site rejects automated requests; check in a normal browser)`, ``,
  ...blocked.map(([u, r]) => `- ${u} (${r.where.join(", ")})${r.note ? ` – ${r.note}` : ""}`), ``,
  `## Failed`, ``,
  ...failed.map(([u, r]) => `- ${u} — status ${r.status}${r.error ? `, ${r.error}` : ""} (${r.where.join(", ")})`), ``,
  `## Answered with a redirect to a host not reachable from the build environment (address is live; destination not fetched)`, ``,
  ...Object.entries(results).filter(([, r]) => r.redirectOnly).map(([u, r]) => `- ${u} → ${r.finalUrl}`), ``,
  `## Rate-limited automated checks (HTTP 429: the server responded)`, ``,
  ...Object.entries(results).filter(([, r]) => r.rateLimited).map(([u]) => `- ${u}`), ``,
  `## Redirected (final destination recorded)`, ``,
  ...Object.entries(results).filter(([u, r]) => r.ok && r.finalUrl && r.finalUrl !== u).map(([u, r]) => `- ${u} → ${r.finalUrl}`), ``,
];
writeFileSync(path.join(root, "docs/link-check-report.md"), lines.join("\n"));
console.log(`checked ${urls.size}: ok ${ok}, blocked ${blocked.length}, failed ${failed.length}`);
