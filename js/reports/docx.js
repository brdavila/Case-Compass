// Word (.docx, Office Open XML) generator. Renders the shared document model produced by
// reports/model.js into an editable, US Letter document with real headings, tables, and a
// page-numbered footer.
import { createZip, xmlEscape as x } from "./zip.js";

const TW = 20; // twips per point
const PAGE_W = 12240, PAGE_H = 15840, MARGIN = 1080; // 8.5x11in, 0.75in margins
const CONTENT_W = PAGE_W - 2 * MARGIN;

function run(text, { bold, italic, size, color } = {}) {
  const parts = String(text ?? "").split("\n");
  const rPr = `<w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}${size ? `<w:sz w:val="${size * 2}"/><w:szCs w:val="${size * 2}"/>` : ""}</w:rPr>`;
  return parts.map((p, i) => `${i ? `<w:r>${rPr}<w:br/></w:r>` : ""}<w:r>${rPr}<w:t xml:space="preserve">${x(p)}</w:t></w:r>`).join("");
}

function para(content, { style, align, spacingAfter, keepNext, shading } = {}) {
  const pPr = `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${keepNext ? "<w:keepNext/>" : ""}${shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>` : ""}${spacingAfter != null ? `<w:spacing w:after="${spacingAfter}"/>` : ""}${align ? `<w:jc w:val="${align}"/>` : ""}</w:pPr>`;
  return `<w:p>${pPr}${content}</w:p>`;
}

function cell(content, width, { header, fill } = {}) {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill || header ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill || "E7EEF5"}"/>` : ""}</w:tcPr>${content}</w:tc>`;
}

function table(cols, rows, { fontSize = 9, headerRow = true, borders = true } = {}) {
  const total = cols.reduce((s, c) => s + (c.w || 1), 0);
  const widths = cols.map((c) => Math.floor(((c.w || 1) / total) * CONTENT_W));
  const b = borders ? `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="B8C2CC"/>`).join("")}</w:tblBorders>` : "";
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`;
  const head = headerRow ? `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${cols.map((c, i) => cell(para(run(c.label, { bold: true, size: fontSize }), { spacingAfter: 0 }), widths[i], { header: true })).join("")}</w:tr>` : "";
  const body = rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((v, i) => cell(para(run(v, { size: fontSize, bold: cols[i]?.bold }), { spacingAfter: 0 }), widths[i], { fill: cols[i]?.fill })).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${CONTENT_W}" w:type="dxa"/>${b}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>${grid}${head}${body}</w:tbl>${para("", { spacingAfter: 80 })}`;
}

function renderBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    switch (b.t) {
      case "h1": out.push(para(run(b.text), { style: "Heading1", keepNext: true })); break;
      case "h2": out.push(para(run(b.text), { style: "Heading2", keepNext: true })); break;
      case "h3": out.push(para(run(b.text), { style: "Heading3", keepNext: true })); break;
      case "p": out.push(para(run(b.text, { bold: b.style === "bold", italic: b.style === "muted", color: b.style === "muted" ? "555F6B" : undefined, size: b.style === "small" ? 8.5 : undefined }))); break;
      case "notice": out.push(para(run(b.text, { size: 9, color: "333D47" }), { shading: "EEF3F7", spacingAfter: 160 })); break;
      case "kv": out.push(table([{ label: "", w: 1.1, bold: true, fill: "F3F6F9" }, { label: "", w: 3.4 }], b.rows, { headerRow: false, fontSize: b.fontSize || 9.5 })); break;
      case "table": out.push(table(b.cols, b.rows, { fontSize: b.fontSize || 8.5 })); break;
      case "bullets": b.items.forEach((it) => out.push(para(run(`•  ${it}`), { spacingAfter: 40 }))); break;
      case "checklist": b.items.forEach((it) => out.push(para(run(`${it.done ? "☑" : "☐"}  `, { size: 11 }) + run(it.text, { bold: false }) + (it.meta ? run(`\n${it.meta}`, { italic: true, size: 8.5, color: "555F6B" }) : ""), { spacingAfter: 60 }))); break;
      case "fields": b.rows.forEach((label) => out.push(para(run(`${label}: `, { bold: true }) + run("_".repeat(Math.max(10, 78 - label.length))), { spacingAfter: 120 }))); break;
      case "lines": out.push(para(run(b.label, { bold: true }), { spacingAfter: 40 })); for (let i = 0; i < (b.n || 4); i++) out.push(para(run("_".repeat(86)), { spacingAfter: 100 })); break;
      case "pagebreak": out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); break;
      case "spacer": out.push(para("")); break;
      default: break;
    }
  }
  return out.join("");
}

export function buildDocx(model) {
  const metaRows = model.metaRows || [];
  const body = [
    para(run(model.title), { style: "Title" }),
    model.subtitle ? para(run(model.subtitle, { color: "40505F" }), { style: "Subtitle" }) : "",
    metaRows.length ? table([{ label: "", w: 1.1, bold: true, fill: "F3F6F9" }, { label: "", w: 3.4 }], metaRows, { headerRow: false, fontSize: 9.5 }) : "",
    model.notice ? renderBlocks([{ t: "notice", text: model.notice }]) : "",
    renderBlocks(model.blocks || []),
  ].join("");

  const sectPr = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="540" w:footer="540" w:gutter="0"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}${sectPr}</w:body></w:document>`;

  const footerText = model.footer || "Generated with Case Compass – not a court document";
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="${CONTENT_W}"/></w:tabs></w:pPr>${run(footerText, { size: 8, color: "555F6B" })}<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:tab/><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> of </w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:color w:val="10324A"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="2A7FB8"/></w:pBdr><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="10324A"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1B5F8C"/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="22313F"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: styles },
    { name: "word/settings.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>` },
    { name: "word/footer1.xml", data: footer },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(model.title)}</dc:title><dc:creator>Case Compass</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Case Compass</Application></Properties>` },
  ];
  return createZip(files);
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
