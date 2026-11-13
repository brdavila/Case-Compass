// Self-contained PDF generator (US Letter). Lays out the shared document model with wrapped
// text, key/value tables, data tables whose header row repeats on each page, checkboxes, ruled
// lines for blank forms, a running header, and "Page X of Y" footers. Uses the PDF standard
// Helvetica fonts with WinAnsi encoding, so no font files need to be embedded.
import { WIDTHS } from "./helvetica-metrics.js";

const PW = 612, PH = 792, M = 54, CW = PW - 2 * M;
const TOP = M + 4, BOTTOM = PH - M - 18;
const F = { R: "Helvetica", B: "Helvetica-Bold", I: "Helvetica-Oblique" };
const FID = { R: "F1", B: "F2", I: "F3" };
const C = { ink: [0.10, 0.13, 0.17], muted: [0.36, 0.40, 0.45], brand: [0.06, 0.20, 0.29], accent: [0.11, 0.37, 0.55], rule: [0.75, 0.79, 0.83], head: [0.11, 0.37, 0.55], zebra: [0.96, 0.97, 0.98], notice: [0.93, 0.95, 0.97], label: [0.95, 0.96, 0.975] };

const SPECIAL = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
const TRANSLIT = { "→": "->", "←": "<-", "✓": "x", "✔": "x", "☐": "[ ]", "☑": "[x]", "≥": ">=", "≤": "<=", " ": " ", "‑": "-", "−": "-", "​": "" };

// Convert a JS string into WinAnsi byte codes.
function toCodes(s) {
  const out = [];
  for (const ch of String(s ?? "")) {
    if (TRANSLIT[ch] != null) { for (const c of TRANSLIT[ch]) out.push(c.charCodeAt(0)); continue; }
    const cp = ch.codePointAt(0);
    if (cp === 9) { out.push(32, 32); continue; }
    if (cp >= 32 && cp < 127) out.push(cp);
    else if (cp >= 0xa0 && cp <= 0xff) out.push(cp);
    else if (SPECIAL[cp]) out.push(SPECIAL[cp]);
    else if (cp >= 0x300 && cp < 0x370) continue; // combining marks
    else out.push(63); // '?'
  }
  return out;
}

function width(codes, font, size) {
  const w = WIDTHS[F[font]]; let t = 0;
  for (const c of codes) t += w[c] || 556;
  return (t * size) / 1000;
}
const textWidth = (s, font, size) => width(toCodes(s), font, size);

// Word-wrap into lines that fit maxW.
function wrap(text, font, size, maxW) {
  const lines = [];
  for (const para of String(text ?? "").split(/\r?\n/)) {
    const words = para.split(/ +/);
    let line = "";
    for (let word of words) {
      const cand = line ? `${line} ${word}` : word;
      if (textWidth(cand, font, size) <= maxW) { line = cand; continue; }
      if (line) { lines.push(line); line = ""; }
      while (textWidth(word, font, size) > maxW) {
        let i = word.length;
        while (i > 1 && textWidth(word.slice(0, i), font, size) > maxW) i--;
        lines.push(word.slice(0, i)); word = word.slice(i);
      }
      line = word;
    }
    lines.push(line);
  }
  return lines;
}

const hexStr = (codes) => "<" + codes.map((c) => c.toString(16).padStart(2, "0")).join("") + ">";
const num = (n) => (Math.round(n * 100) / 100).toString();
const rgb = (c) => c.map(num).join(" ");

class Layout {
  constructor(model) {
    this.model = model; this.pages = []; this.y = 0; this.tableHeader = null;
    this.newPage();
  }
  newPage() {
    this.page = { ops: [] }; this.pages.push(this.page);
    this.y = TOP + (this.pages.length > 1 ? 20 : 0);
    if (this.tableHeader) this.tableHeader();
  }
  ensure(h) { if (this.y + h > BOTTOM) { this.newPage(); return true; } return false; }
  text(x, yTop, s, font = "R", size = 10, color = C.ink) {
    const codes = toCodes(s); if (!codes.length) return;
    this.page.ops.push(`BT /${FID[font]} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(PH - yTop - size * 0.8)} Td ${hexStr(codes)} Tj ET`);
  }
  rect(x, yTop, w, h, fill, stroke) {
    const y = PH - yTop - h;
    if (fill) this.page.ops.push(`${rgb(fill)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
    if (stroke) this.page.ops.push(`${rgb(stroke)} RG 0.6 w ${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`);
  }
  line(x1, y1, x2, y2, color = C.rule, w = 0.6) {
    this.page.ops.push(`${rgb(color)} RG ${num(w)} w ${num(x1)} ${num(PH - y1)} m ${num(x2)} ${num(PH - y2)} l S`);
  }
  paragraph(s, { font = "R", size = 10, color = C.ink, indent = 0, after = 6, lh = 1.32 } = {}) {
    const lines = wrap(s, font, size, CW - indent);
    for (const ln of lines) { this.ensure(size * lh); this.text(M + indent, this.y, ln, font, size, color); this.y += size * lh; }
    this.y += after;
  }
  heading(s, level) {
    const size = level === 1 ? 15 : level === 2 ? 12.5 : 10.5;
    const before = level === 1 ? 14 : level === 2 ? 10 : 8;
    this.ensure(before + size + 46);
    this.y += before;
    const lines = wrap(s, "B", size, CW);
    for (const ln of lines) { this.text(M, this.y, ln, "B", size, level === 1 ? C.brand : level === 2 ? C.accent : C.ink); this.y += size * 1.25; }
    if (level === 1) { this.line(M, this.y + 1, M + CW, this.y + 1, C.accent, 1); this.y += 6; } else this.y += 3;
  }
  notice(s) {
    const size = 8.8, pad = 7, lines = wrap(s, "R", size, CW - 2 * pad), h = lines.length * size * 1.3 + 2 * pad;
    this.ensure(h + 8);
    this.rect(M, this.y, CW, h, C.notice);
    this.rect(M, this.y, 3, h, C.accent);
    let yy = this.y + pad; for (const ln of lines) { this.text(M + pad + 2, yy, ln, "R", size, C.ink); yy += size * 1.3; }
    this.y += h + 10;
  }
  kv(rows, size = 9.4) {
    const lw = 150, pad = 4, vw = CW - lw;
    for (const [k, v] of rows) {
      const kl = wrap(k, "B", size, lw - 2 * pad), vl = wrap(v || "—", "R", size, vw - 2 * pad);
      const lineH = size * 1.3;
      let remaining = vl, first = true;
      while (first || remaining.length) {
        const avail = Math.floor((BOTTOM - this.y - 2 * pad) / lineH);
        if (avail < 2) { this.newPage(); continue; }
        const chunk = remaining.slice(0, Math.max(avail, 1)); remaining = remaining.slice(chunk.length);
        const rows2 = Math.max(first ? kl.length : 1, chunk.length);
        const h = rows2 * lineH + 2 * pad;
        this.rect(M, this.y, lw, h, C.label);
        this.line(M, this.y + h, M + CW, this.y + h, C.rule, 0.5);
        if (first) kl.forEach((ln, i) => this.text(M + pad, this.y + pad + i * lineH, ln, "B", size, C.muted));
        chunk.forEach((ln, i) => this.text(M + lw + pad, this.y + pad + i * lineH, ln, "R", size, C.ink));
        this.y += h; first = false;
        if (remaining.length) this.newPage();
      }
    }
    this.y += 8;
  }
  table(cols, rows, size = 8.4) {
    const total = cols.reduce((s, c) => s + (c.w || 1), 0);
    const widths = cols.map((c) => ((c.w || 1) / total) * CW);
    const pad = 3.5, lineH = size * 1.28;
    const drawHeader = () => {
      const hl = cols.map((c, i) => wrap(c.label, "B", size, widths[i] - 2 * pad));
      const h = Math.max(...hl.map((l) => l.length)) * lineH + 2 * pad;
      this.rect(M, this.y, CW, h, C.head);
      let xx = M; hl.forEach((lines, i) => { lines.forEach((ln, j) => this.text(xx + pad, this.y + pad + j * lineH, ln, "B", size, [1, 1, 1])); xx += widths[i]; });
      this.y += h;
    };
    this.ensure(60);
    drawHeader();
    this.tableHeader = drawHeader;
    rows.forEach((r, ri) => {
      let cells = r.map((v, i) => wrap(v == null || v === "" ? "" : String(v), cols[i]?.bold ? "B" : "R", size, widths[i] - 2 * pad));
      while (cells.some((c) => c.length)) {
        const avail = Math.floor((BOTTOM - this.y - 2 * pad) / lineH);
        if (avail < 2) { this.newPage(); continue; }
        const n = Math.min(avail, Math.max(...cells.map((c) => c.length)));
        const h = n * lineH + 2 * pad;
        if (ri % 2 === 1) this.rect(M, this.y, CW, h, C.zebra);
        let xx = M;
        cells.forEach((lines, i) => { lines.slice(0, n).forEach((ln, j) => this.text(xx + pad, this.y + pad + j * lineH, ln, cols[i]?.bold ? "B" : "R", size, C.ink)); xx += widths[i]; });
        this.line(M, this.y + h, M + CW, this.y + h, C.rule, 0.4);
        this.y += h;
        cells = cells.map((c) => c.slice(n));
        if (cells.some((c) => c.length)) this.newPage();
      }
    });
    this.tableHeader = null;
    this.y += 10;
  }
  checkbox(x, yTop, done) {
    this.rect(x, yTop, 9, 9, null, C.ink);
    if (done) { this.line(x + 1.8, yTop + 4.8, x + 3.8, yTop + 7.2, C.ink, 1.2); this.line(x + 3.8, yTop + 7.2, x + 7.6, yTop + 1.8, C.ink, 1.2); }
  }
  checklist(items) {
    for (const it of items) {
      const lines = wrap(it.text, "R", 9.8, CW - 18), meta = it.meta ? wrap(it.meta, "I", 8.2, CW - 18) : [];
      const h = lines.length * 12.8 + meta.length * 10.5 + 5;
      this.ensure(h);
      this.checkbox(M, this.y + 1, it.done);
      lines.forEach((ln, i) => this.text(M + 16, this.y + i * 12.8, ln, "R", 9.8));
      meta.forEach((ln, i) => this.text(M + 16, this.y + lines.length * 12.8 + i * 10.5, ln, "I", 8.2, C.muted));
      this.y += h;
    }
    this.y += 6;
  }
  fields(labels) {
    for (const label of labels) {
      this.ensure(24);
      this.text(M, this.y + 6, `${label}:`, "B", 9.6);
      const lx = M + textWidth(`${label}:`, "B", 9.6) + 6;
      this.line(lx, this.y + 16, M + CW, this.y + 16, C.muted, 0.6);
      this.y += 24;
    }
    this.y += 4;
  }
  ruled(label, n) {
    this.ensure(18 + 22 * Math.min(n, 3));
    this.text(M, this.y, label, "B", 9.8); this.y += 16;
    for (let i = 0; i < n; i++) { this.ensure(22); this.line(M, this.y + 16, M + CW, this.y + 16, C.muted, 0.5); this.y += 22; }
    this.y += 6;
  }
  bullets(items) {
    for (const it of items) {
      const lines = wrap(it, "R", 9.8, CW - 14);
      this.ensure(lines.length * 12.8);
      this.text(M + 2, this.y, "•", "R", 9.8);
      lines.forEach((ln, i) => this.text(M + 14, this.y + i * 12.8, ln, "R", 9.8));
      this.y += lines.length * 12.8 + 2;
    }
    this.y += 5;
  }
}

function render(model) {
  const L = new Layout(model);
  L.paragraph(model.title, { font: "B", size: 20, color: C.brand, after: 2, lh: 1.2 });
  if (model.subtitle) L.paragraph(model.subtitle, { size: 11.5, color: C.muted, after: 10 });
  if (model.metaRows?.length) L.kv(model.metaRows, 9.2);
  if (model.notice) L.notice(model.notice);
  for (const b of model.blocks || []) {
    switch (b.t) {
      case "h1": L.heading(b.text, 1); break;
      case "h2": L.heading(b.text, 2); break;
      case "h3": L.heading(b.text, 3); break;
      case "p": L.paragraph(b.text, b.style === "muted" ? { font: "I", color: C.muted, size: 9.2 } : b.style === "bold" ? { font: "B" } : b.style === "small" ? { size: 8.4 } : {}); break;
      case "notice": L.notice(b.text); break;
      case "kv": L.kv(b.rows, b.fontSize); break;
      case "table": L.table(b.cols, b.rows, b.fontSize); break;
      case "bullets": L.bullets(b.items); break;
      case "checklist": L.checklist(b.items); break;
      case "fields": L.fields(b.rows); break;
      case "lines": L.ruled(b.label, b.n || 4); break;
      case "pagebreak": L.newPage(); break;
      case "spacer": L.y += 10; break;
      default: break;
    }
  }
  // Running header and footer.
  const n = L.pages.length;
  const footer = model.footer || "Generated with Case Compass – not a court document";
  L.pages.forEach((p, i) => {
    L.page = p;
    if (i > 0) { L.text(M, M - 14, model.title, "R", 8, C.muted); L.line(M, M + 2, M + CW, M + 2, C.rule, 0.5); }
    L.line(M, PH - M + 2, M + CW, PH - M + 2, C.rule, 0.5);
    L.text(M, PH - M + 8, footer, "R", 7.6, C.muted);
    const pg = `Page ${i + 1} of ${n}`;
    L.text(M + CW - textWidth(pg, "R", 7.6), PH - M + 8, pg, "R", 7.6, C.muted);
  });
  return L.pages;
}

function pdfDate(d = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
function utf16Hex(s) {
  let h = "FEFF";
  for (const ch of String(s)) { const cp = ch.codePointAt(0); if (cp > 0xffff) { const v = cp - 0x10000; h += ((0xd800 + (v >> 10)).toString(16) + (0xdc00 + (v & 0x3ff)).toString(16)).toUpperCase(); } else h += cp.toString(16).padStart(4, "0").toUpperCase(); }
  return `<${h}>`;
}

export function buildPdf(model) {
  const pages = render(model);
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const catalog = add(null), pagesObj = add(null);
  const fR = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  const fB = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  const fI = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>`);
  const info = add(`<< /Title ${utf16Hex(model.title)} /Producer (Case Compass) /Creator (Case Compass) /CreationDate (${pdfDate()}) >>`);
  const kids = [];
  for (const p of pages) {
    const content = p.ops.join("\n");
    const cs = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${fR} 0 R /F2 ${fB} 0 R /F3 ${fI} 0 R >> >> /Contents ${cs} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

export const PDF_MIME = "application/pdf";
export { wrap as _wrap, textWidth as _textWidth };
