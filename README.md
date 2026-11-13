# Case Compass

A privacy-first case management platform for documenting events, organizing evidence, tracking timelines, preparing reports, and accessing legal and personal safety resources.

**Document facts. Preserve evidence. Protect safety. Organize next steps.**

Case Compass is a static Progressive Web App. It runs entirely in the browser, works offline after the first visit, and encrypts every record on the device. There is no server, account, analytics, tracker, or upload. Resources focus on Colorado and Pueblo County.

> Case Compass is an organizational and educational tool. It is not legal advice, cannot guarantee any outcome, and is not a substitute for an attorney. In an emergency, call 911.

## Features

| Area | What it does |
|---|---|
| **Home** | Dashboard answering *What should I do today? What needs attention? What have I documented? Where do I find help?* Calendar & tasks (court dates require a source), attorney workspace. |
| **Document** | Unified timeline with filters (date, type, child, person, keyword, evidence status, open/resolved, parenting event, police contact); incidents, police & official contacts, residence & property, evidence library, expenses. |
| **Parenting** | Requested vs. scheduled vs. completed parenting time by date range and child; parenting-time journal; communication log; children and child statements (with no-coaching guidance). |
| **Resources** | 101-entry directory in nine sections (including all 24 parenting-class providers in the Colorado Judicial Branch directory, 17 listed for Pueblo County); Protection & Security protocols A–G (59 steps); court forms directory (67 official JDF forms in 12 situation groups); 8 guides and a downloads library. Available without unlocking. |
| **Reports** | PDF (US Letter), Word (.docx), Excel (.xlsx, 12 sheets), CSV, print view, calendar (.ics), unencrypted case archive (.zip). Scope by record, week, month, range, category, or all; privacy controls for private notes and children's information. |
| **Safety & data** | AES-256-GCM encryption, PBKDF2-SHA-256 (600,000 iterations), auto-lock, Quick Exit, revision history, encrypted audit log, encrypted drafts, Trash, restore points, verified encrypted backups, non-destructive restore/merge, earlier-planner and CSV import. |

## Run it

Case Compass needs a secure origin (HTTPS or `localhost`); opening `index.html` from a folder shows an explanation instead.

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

**Publish with GitHub Pages:** Settings › Pages › Deploy from a branch › `main` / `(root)`. Then on iPhone open the address in Safari and choose Share › Add to Home Screen. Full steps: [`docs/INSTALL.html`](docs/INSTALL.html).

## Documentation

- [User manual (PDF)](docs/Case_Compass_User_Manual.pdf) · [Quick start (2-page PDF)](docs/Case_Compass_Quick_Start.pdf) · [Installation](docs/INSTALL.html)
- [Technical validation report](docs/VALIDATION_REPORT.md) · [Feature inventory and gap analysis](docs/FEATURE_INVENTORY.md) · [Link check report](docs/link-check-report.md)
- [Sample export package (fictional data)](samples/README.md)

## Project structure

```
index.html, manifest.webmanifest, sw.js   App entry, PWA manifest, offline service worker (generated)
css/app.css                               Design system (dark default, light optional, mobile first)
js/boot.js                                Startup checks (file://, HTTPS, Web Crypto, storage) – never a blank screen
js/app.js                                 Shell, router, idle lock, Quick Exit
js/core/                                  crypto, IndexedDB, encrypted vault, schema, backup, migration, utilities
js/ui/                                    DOM helpers, dialogs, schema-driven forms
js/views/                                 Home, Document, Parenting, Resources, Reports, lock/welcome screens
js/reports/                               Report model + dependency-free DOCX, XLSX, PDF, ZIP, HTML, ICS writers
data/                                     Resource atlas, court forms, protocols, guides, link-check results
docs/                                     Manual, quick start, install guide, validation report, screenshots
samples/                                  Fictional sample exports (never loaded by the app)
scripts/                                  Link checker, sample/doc/screenshot/icon generators, packager
tests/                                    Unit tests (node --test) and end-to-end QA (Playwright)
```

No third-party runtime libraries are used; document generation is implemented in `js/reports/`.

## Development

```bash
node --test tests/unit/*.test.mjs        # unit tests
python3 -m http.server 8080 &            # serve
node tests/e2e/run.mjs                   # 25 end-to-end acceptance scenarios (Chromium)
node scripts/check-links.mjs             # verify every resource and form link
node scripts/make-samples.mjs            # regenerate fictional sample exports
node scripts/build-sw.mjs                # regenerate the offline cache list after changing files
bash scripts/package.sh                  # build dist/Case_Compass_v3_Complete.zip
```

After editing any app file, run `node scripts/build-sw.mjs` so installed copies receive the update.

## Privacy

Records, attachments, drafts, settings, and checklist progress are encrypted with a key derived from the user's passphrase and stored only in the browser's IndexedDB. The Content-Security-Policy restricts network connections to the app's own origin. The passphrase cannot be recovered; users are prompted to keep verified encrypted backups. See the security section of the [validation report](docs/VALIDATION_REPORT.md).
