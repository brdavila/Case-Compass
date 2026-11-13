# Changelog

## 3.0.0 – 2026-11-13

First release under the name **Case Compass** (formerly a court planner project).

- Encrypted offline vault (AES-256-GCM, PBKDF2-SHA-256 600,000 iterations), auto-lock, Quick Exit.
- Record types: incidents, communications, parenting time, children, child statements, police/official contacts, residence/property, evidence, expenses, tasks, attorney consultations.
- Unified timeline with filters; two-way record linking; evidence stored once with SHA-256 fingerprints.
- Parenting-time comparisons (requested vs. scheduled vs. completed) by date range and child.
- Calendar and tasks (court dates require a source); `.ics` export; attorney workspace and packet.
- Resource directory (101 entries, links checked 2026-11-13), Protection & Security protocols A–G, court forms directory, guides, downloads library.
- Reports: PDF, Word, Excel (12 sheets), CSV, print view, case archive; privacy controls.
- Verified encrypted backups; clean restore and non-destructive merge; restore points; Trash; revision history; encrypted audit log; encrypted drafts.
- Import from earlier planner JSON, CSV, and same-origin browser storage.
- PWA: installable, offline after first visit, update prompt.
- Documentation: user manual, quick start, install guide, validation report, feature inventory, fictional sample exports.
