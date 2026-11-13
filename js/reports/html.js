// Print-friendly HTML renderer for the shared document model (browser Print / Save as PDF).
import { escapeHTML as e } from "../core/util.js";

const CSS = `
@page { size: letter; margin: 0.7in 0.7in 0.75in; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.4 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a222b; margin: 0; background: #fff; }
main { max-width: 7.1in; margin: 0 auto; padding: 0.3in 0; }
h1.title { font-size: 20pt; color: #10324a; margin: 0 0 2pt; }
.subtitle { color: #55606b; margin: 0 0 10pt; }
h1 { font-size: 14pt; color: #10324a; border-bottom: 1.5pt solid #1b5f8c; padding-bottom: 2pt; margin: 18pt 0 6pt; break-after: avoid; }
h2 { font-size: 12pt; color: #1b5f8c; margin: 14pt 0 4pt; break-after: avoid; }
h3 { font-size: 10.5pt; margin: 12pt 0 4pt; break-after: avoid; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 10pt; font-size: 8.8pt; }
thead { display: table-header-group; }
th { background: #1b5f8c; color: #fff; text-align: left; padding: 3pt 4pt; font-weight: 600; }
td { border-bottom: 0.5pt solid #c4ccd4; padding: 3pt 4pt; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #f5f7f9; }
table.kv td:first-child { width: 28%; background: #f2f5f8; font-weight: 600; color: #4a5560; }
.notice { background: #eef3f7; border-left: 3pt solid #1b5f8c; padding: 6pt 8pt; font-size: 9pt; margin: 6pt 0 12pt; }
.muted { color: #55606b; font-style: italic; }
.check { display: flex; gap: 6pt; margin: 3pt 0; break-inside: avoid; }
.box { width: 10pt; height: 10pt; border: 1pt solid #1a222b; flex: none; margin-top: 2pt; text-align: center; line-height: 9pt; font-size: 9pt; }
.meta { color: #55606b; font-size: 8.5pt; font-style: italic; }
.field { display: flex; gap: 6pt; margin: 10pt 0; } .field b { white-space: nowrap; } .field span { flex: 1; border-bottom: 0.75pt solid #55606b; }
.rule { border-bottom: 0.6pt solid #77818b; height: 20pt; }
.pb { break-after: page; }
footer { margin-top: 18pt; border-top: 0.5pt solid #c4ccd4; padding-top: 4pt; color: #55606b; font-size: 8pt; }
.toolbar { position: sticky; top: 0; background: #0f1419; color: #fff; padding: 8px 12px; display: flex; gap: 8px; align-items: center; font: 14px system-ui; }
.toolbar button { font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #5ad1ff; background: #102a3a; color: #fff; }
@media print { .toolbar { display: none; } main { padding: 0; } }
`;

function blocks(list) {
  return list.map((b) => {
    switch (b.t) {
      case "h1": return `<h1>${e(b.text)}</h1>`;
      case "h2": return `<h2>${e(b.text)}</h2>`;
      case "h3": return `<h3>${e(b.text)}</h3>`;
      case "p": return `<p class="${b.style === "muted" ? "muted" : ""}">${b.style === "bold" ? `<b>${e(b.text)}</b>` : e(b.text)}</p>`;
      case "notice": return `<div class="notice">${e(b.text)}</div>`;
      case "kv": return `<table class="kv"><tbody>${b.rows.map(([k, v]) => `<tr><td>${e(k)}</td><td>${e(v)}</td></tr>`).join("")}</tbody></table>`;
      case "table": return `<table><thead><tr>${b.cols.map((c) => `<th>${e(c.label)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((v) => `<td>${e(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      case "bullets": return `<ul>${b.items.map((i) => `<li>${e(i)}</li>`).join("")}</ul>`;
      case "checklist": return b.items.map((i) => `<div class="check"><div class="box">${i.done ? "✓" : ""}</div><div>${e(i.text)}${i.meta ? `<div class="meta">${e(i.meta)}</div>` : ""}</div></div>`).join("");
      case "fields": return b.rows.map((l) => `<div class="field"><b>${e(l)}:</b><span></span></div>`).join("");
      case "lines": return `<p><b>${e(b.label)}</b></p>${'<div class="rule"></div>'.repeat(b.n || 4)}`;
      case "pagebreak": return `<div class="pb"></div>`;
      case "spacer": return `<div style="height:10pt"></div>`;
      default: return "";
    }
  }).join("\n");
}

export function buildPrintHTML(model, { toolbar = true } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(model.title)}</title><style>${CSS}</style></head><body>
${toolbar ? `<div class="toolbar"><button id="pp-print" type="button">Print / Save as PDF</button><button id="pp-close" type="button">Close</button><span>Choose “Save as PDF” in the print dialog to create a PDF.</span></div>` : ""}
<main><h1 class="title">${e(model.title)}</h1>${model.subtitle ? `<p class="subtitle">${e(model.subtitle)}</p>` : ""}
${model.metaRows?.length ? blocks([{ t: "kv", rows: model.metaRows }]) : ""}
${model.notice ? `<div class="notice">${e(model.notice)}</div>` : ""}
${blocks(model.blocks || [])}
<footer>${e(model.footer || "Generated with Case Compass – not a court document")}</footer></main></body></html>`;
}
