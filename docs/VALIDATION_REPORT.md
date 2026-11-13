# Technical validation report – Case Compass 3.0

Run date: November 13, 2026 · Commit: see repository history for this file

## 1. Summary

| Area | Result |
|---|---|
| End-to-end acceptance scenarios (specification §22) | **25 of 25 passed** (`tests/e2e/run.mjs`, results in `tests/results/e2e-results.json`) |
| Unit tests (crypto, reports, utilities) | **19 of 19 passed** (`node --test tests/unit/*.test.mjs`) |
| Link verification (resources and court forms) | **170 checked: 165 live, 5 not verifiable automatically, 0 broken** (`docs/link-check-report.md`) |
| Exported files opened by independent software | Word: python-docx 1.2.0 and LibreOffice 24.2. Excel: openpyxl 3.1.5 and LibreOffice. PDF: pypdf 6.17.0 and Poppler |
| Original project files reviewed | **None available** – see §6 and `docs/FEATURE_INVENTORY.md` |

Test environment: Linux container, Chromium 153 (Playwright), Node 22, Python 3.13, app served by `python3 -m http.server` on `127.0.0.1` (a secure context). Mobile tests used Playwright's iPhone SE device profile (375×667). No physical iPhone was available; see §5.

## 2. Tests performed

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | First launch on an empty installation | Pass | Welcome screen; no vault header in IndexedDB |
| 2 | Vault creation and unlock | Pass | PBKDF2-SHA-256 600,000 iterations; wrapped AES-256 key; lock and unlock |
| 3 | Incorrect passphrase handling | Pass | Clear error; vault stays locked; correct passphrase then unlocks |
| 4 | Create, edit, reopen every record type | Pass | 11 types created through the UI and reopened; edit produced version 2 with version 1 in history; court date refused without a source |
| 5 | Upload and retrieve evidence | Pass | SHA-256 of stored, retrieved, and downloaded bytes identical to the original; preview and integrity check |
| 6 | Link evidence to several records | Pass | One file linked to an incident and a communication; one blob stored |
| 7 | Search and filter | Pass | Keyword, type, evidence status, and date range return the expected records |
| 8 | Checklist progress persists | Pass | Completion, date, and notes survive reload (hidden while locked) |
| 9 | Calendar events | Pass | Task shown on its day; marked Done with completion date |
| 10 | Word export | Pass | python-docx reads 18 tables; record IDs and text match; private notes excluded; LibreOffice converts it |
| 11 | Excel export | Pass | 12 sheets; frozen header and AutoFilter on every data sheet; Incidents row (ID, date, title) matches the source record; LibreOffice converts it |
| 12 | Print and save a PDF | Pass | Native PDF: US Letter with "Page X of Y"; browser print view opened and saved as PDF |
| 13 | Encrypted backup | Pass | Self-verified before download; no plaintext record content in the file |
| 14 | Restore in a clean environment | Pass | Fresh browser profile: identical record count, attachment hash, checklist progress |
| 15 | Migrate an older planner backup | Pass | Representative legacy JSON: 4 entries imported with original ID `INC-0042`, original dates and creation date, raw data kept; re-import detected all 4 as duplicates |
| 16 | Recover from interrupted edits | Pass | Encrypted draft restored after reload; leaving a dirty form asks first; draft not stored in plaintext |
| 17 | Unavailable storage or encryption | Pass | Missing Web Crypto, plain HTTP on a non-local address, blocked IndexedDB, and `file://` each show an explanation; nothing is stored without encryption |
| 18 | Small iPhone screen | Pass | iPhone SE: 9 key screens without horizontal overflow; bottom navigation targets ≥ 44 px |
| 19 | Desktop | Pass | 1440 px: sidebar shown, bottom bar hidden, no overflow |
| 20 | Offline after installation | Pass | Service worker controls the page; with the network disabled the app reloads, unlocks, browses, and saves |
| 21 | Every internal navigation destination | Pass | Crawler visited 72 internal destinations; each rendered a heading and no error |
| 22 | Missing local resources detected | Pass | All bundled files found; a simulated missing file reported by name |
| 23 | Clear errors instead of blank screens | Pass | Missing record and a failed app file both produce readable messages |
| 24 | No sample data | Pass | Fresh vault has 0 records and empty states |
| 25 | No external transmission | Pass | 61 requests observed across all tests, all same-origin; CSP `connect-src 'self'` |

Accuracy checks of exports against source data: Word text contains each record ID and description; the Excel Incidents row equals the stored record's ID, date, and title; the restored vault equals the source vault; imported legacy records keep original values. Unit tests confirm private notes and earlier advice are excluded by default, child information is minimized or excluded when chosen, and sample labels appear only in sample mode.

### Defects found by testing and fixed before delivery
1. Navigating to the same address (for example after creating the vault on `#/home`) did not re-render. Fixed with an explicit route event.
2. When the startup check found no Web Crypto, the main module still rendered over the warning. The app now halts whenever the startup check blocks it.
3. On a first visit, service-worker activation reloaded the page, which could erase a passphrase being typed. The app now reloads only when the user chooses "Update now".
4. Child profile titles ignored the "initials only" report option. Fixed in the report model.
5. A full-screen radial gradient could not be rendered by headless Chromium at high pixel density; replaced with a lighter linear gradient.
6. Parenting statistics did not count scheduled entries that were later cancelled; fixed, and the label now says "including later-cancelled".

## 3. Security architecture

- **Key derivation:** passphrase → PBKDF2-SHA-256, 600,000 iterations, 16-byte random salt → key-encryption key.
- **Data key:** a random AES-256 key, wrapped with AES-GCM by the key-encryption key. Only the wrapped key, salt, and iteration count are stored. A wrong passphrase fails GCM authentication. Changing the passphrase re-wraps the data key without re-encrypting records.
- **Encryption at rest:** every record, revision, attachment, draft, setting, checklist state, audit entry, and restore point is encrypted with AES-256-GCM, a fresh 12-byte IV per write, and the item's ID as additional authenticated data (ciphertext cannot be swapped between items). IndexedDB holds only ciphertext plus structural IDs.
- **In memory:** the unwrapped key is non-extractable and is discarded on lock (manual, idle timeout, optional lock-when-hidden, Quick Exit).
- **Backups:** a separate key derived from the backup passphrase (its own salt); SHA-256 of the ciphertext and of every attachment; decrypted and verified before the file is offered.
- **Network:** Content-Security-Policy `default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`. No eval, no inline scripts, no third-party code, analytics, fonts, or CDNs. The service worker caches only the app's own files and ignores other origins. External resource links open as normal navigations with `rel="noopener noreferrer"` and `referrer: no-referrer`.
- **Exports:** reports, CSV, calendar files, and archives are plaintext by design and are labeled "NOT encrypted"; CSV cells are neutralized against spreadsheet formula injection.
- **Limits (also stated to users):** no protection against monitoring software on an unlocked device; downloaded files persist on the device; Quick Exit cannot erase history; the passphrase cannot be recovered; no security measure is absolute.

## 4. Migration results

The original earlier-planner files were not available, so their exact data format could not be confirmed. The import adapter accepts JSON with lists of entries at any depth, infers record types from collection names or type fields, normalizes common date and time formats, maps common field names, keeps every original field verbatim, preserves original IDs (as record IDs when they match the `ABC-0001` pattern) and creation dates, fingerprints each entry to prevent duplicate imports, previews before writing, and creates a restore point. Encrypted earlier files are attempted with common PBKDF2/AES-GCM parameters; when that fails, the user is told how to export unencrypted JSON. CSV import maps columns by name. Tested with a representative legacy file (scenario 15). **Action needed:** run one real earlier-planner export through the importer to confirm the mapping.

## 5. Browser compatibility

| Browser | Status |
|---|---|
| Chromium/Chrome/Edge (desktop) | Tested automatically (Chromium 153) |
| iPhone/iPad Safari 16.4+ and Home Screen app | Designed for and emulated by viewport; **not tested on a physical device**. Uses only APIs supported by iOS 16.4+ (Web Crypto, IndexedDB, `<dialog>`, service workers, Web Share with files, `structuredClone`). |
| Firefox, Safari (macOS), Android Chrome | Expected to work (standard APIs); not tested in this run |

iOS notes shown to users: Home Screen apps and Safari tabs keep separate storage; Safari may clear storage for sites used only in a tab after about seven days without a visit; deleting the Home Screen icon deletes its data.

## 6. Known limitations

1. **Original source files unavailable.** The earlier atlas entries, packets, and planner formats were not reviewed or migrated (see the feature inventory).
2. **No background reminders.** The app cannot notify while closed; `.ics` export to the device calendar is provided.
3. **No cross-device sync** by design; transfer is by encrypted backup.
4. **Five links could not be verified automatically** because those sites reject automated requests: Pueblo County DA victim rights, Pueblo County victim compensation, WomensLaw Colorado, FTC consumer site, and TransUnion credit freeze. They are labeled in the app; confirm in a normal browser.
5. **Physical iPhone testing** was not possible in the build environment.
6. **Large attachments:** backups embed attachments as base64 in one file; very large evidence collections (hundreds of MB) may exceed memory on older phones. Keep large originals elsewhere and add reference records.
7. **Encrypted legacy files** in an unknown format cannot be decrypted; the user must export unencrypted JSON from the earlier planner.
8. Some resource details (for example, the Pueblo Protection Order Clinic brochure) are undated and marked "verify details".

## 7. Items requiring future maintenance

| Item | How |
|---|---|
| Resource details and links (services, prices, hours change) | `node scripts/check-links.mjs` at least quarterly; update `data/resources-data.js` |
| Parenting-class providers | Re-read the Colorado Judicial Branch directory; update the provider list |
| Court form file URLs (revised by the court) | Re-run the form crawl or follow each group's category link; update `data/forms-data.js` |
| Colorado Crisis Services → 988 Colorado transition | Already reflected; old entry kept as retired |
| App updates | After any file change run `node scripts/build-sw.mjs`, then redeploy |
| Original materials | Add to the repository and follow the steps in the feature inventory §1 |
| Browser APIs | Re-test on current iOS Safari after major iOS releases |
