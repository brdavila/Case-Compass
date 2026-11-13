// iCalendar (.ics) export so appointments can be added to the device calendar, which provides
// real reminders even when Case Compass is closed. The user controls what text is exported.

function esc(s) { return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function fold(line) { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); }
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

// events: [{ uid, title, date:"YYYY-MM-DD", time:"HH:MM"|"", durationMin, location, description, tz, alarmMinutes }]
export function buildICS(events) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Case Compass//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const ev of events) {
    const d = ev.date.replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:${ev.uid}@case-compass.local`, `DTSTAMP:${stamp()}`);
    if (ev.time) {
      const t = ev.time.replace(":", "") + "00";
      const tz = ev.tz || "America/Denver";
      lines.push(`DTSTART;TZID=${tz}:${d}T${t}`);
      const [h, m] = ev.time.split(":").map(Number);
      const end = new Date(2000, 0, 1, h, m + (ev.durationMin || 60));
      lines.push(`DTEND;TZID=${tz}:${d}T${String(end.getHours()).padStart(2, "0")}${String(end.getMinutes()).padStart(2, "0")}00`);
    } else {
      const next = new Date(+ev.date.slice(0, 4), +ev.date.slice(5, 7) - 1, +ev.date.slice(8, 10) + 1);
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, "0")}${String(next.getDate()).padStart(2, "0")}`);
    }
    lines.push(`SUMMARY:${esc(ev.title)}`);
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
    if (ev.alarmMinutes) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(ev.title)}`, `TRIGGER:-PT${ev.alarmMinutes}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
