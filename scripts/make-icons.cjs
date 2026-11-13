// Renders PNG icons from icons/icon.svg with the preinstalled Chromium. Usage: node scripts/make-icons.cjs
const { chromium } = require("playwright");
const fs = require("fs"); const path = require("path");
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, "../icons/icon.svg"), "utf8");
  const b = await chromium.launch(); const p = await b.newPage();
  const shots = [["apple-touch-icon.png", 180, false], ["icon-192.png", 192, false], ["icon-512.png", 512, false], ["icon-maskable-512.png", 512, true]];
  for (const [name, size, maskable] of shots) {
    await p.setViewportSize({ width: size, height: size });
    const inner = maskable ? Math.round(size * 0.72) : size;
    await p.setContent(`<html><body style="margin:0;background:${maskable ? "#0e141b" : "transparent"};display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</body></html>`);
    await p.screenshot({ path: path.join(__dirname, "../icons", name), omitBackground: !maskable && name !== "apple-touch-icon.png" });
  }
  await b.close(); console.log("icons written");
})();
