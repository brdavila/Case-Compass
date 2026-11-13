// Welcome (create vault), lock screen, and restore-from-backup for a clean installation.
import { h, icon, logo, toast, confirmDialog, passwordField, pickFile, readFileText, alertDialog } from "../ui/dom.js";
import { callout, navigate } from "../ui/shared.js";
import * as vault from "../core/vault.js";
import * as backup from "../core/backup.js";
import { passphraseStrength, APP_VERSION, fmtDateTimeISO } from "../core/util.js";

function quickExitBtn() {
  return h("button", { class: "btn small", type: "button", onclick: () => { let dest = "https://weather.gov/"; try { dest = localStorage.getItem("case-compass-exit") || dest; } catch { /* */ } location.replace(dest); } }, icon("exit"), "Quick Exit");
}

function gateWrap(...content) {
  return h("div", { class: "gate" },
    h("div", { class: "panel" },
      h("div", { class: "row", style: { justifyContent: "flex-end", marginBottom: "8px" } }, quickExitBtn()),
      logo("logo-lg"), ...content,
      h("p", { class: "faint small", style: { textAlign: "center", marginTop: "18px" } }, `Case Compass ${APP_VERSION} · Your records stay encrypted on this device.`)));
}

function strengthMeter(input) {
  const bar = h("span"), label = h("span", { class: "small muted", "aria-live": "polite" });
  const update = () => { const s = passphraseStrength(input.value); bar.style.width = `${(s.score / 4) * 100}%`; bar.style.background = ["var(--danger)", "var(--danger)", "var(--warn)", "var(--ok)", "var(--ok)"][s.score]; label.textContent = input.value ? `${s.label}${s.ok ? "" : " – use at least 12 characters; four or more random words work well"}` : ""; };
  input.addEventListener("input", update);
  return h("div", { class: "stack" }, h("div", { class: "meter" }, bar), label);
}

export function welcome({ onCreated }) {
  const p1 = passwordField({ id: "new-pass", label: "Create a passphrase", autocomplete: "new-password", help: "Example style: four or more unrelated words, like “river lantern quiet maple 47”. Do not reuse a password from another account." });
  const p2 = passwordField({ id: "new-pass2", label: "Type it again", autocomplete: "new-password" });
  const ack = h("input", { type: "checkbox", id: "ack" });
  const err = h("div", { class: "err", role: "alert" });
  const btn = h("button", { class: "btn primary block", type: "submit" }, icon("lock"), "Create my private vault");
  const form = h("form", { class: "form", novalidate: true },
    p1.el, strengthMeter(p1.input), p2.el,
    h("label", { class: "check", for: "ack" }, ack, h("span", null, "I understand that my passphrase cannot be recovered. If I lose it, my records cannot be opened. I will keep encrypted backups.")),
    err, btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err.textContent = "";
    const s = passphraseStrength(p1.input.value);
    if (!s.ok) { err.textContent = "Please choose a stronger passphrase: at least 12 characters (several random words work well)."; p1.input.focus(); return; }
    if (p1.input.value !== p2.input.value) { err.textContent = "The two passphrases do not match."; p2.input.focus(); return; }
    if (!ack.checked) { err.textContent = "Please confirm that you understand the passphrase cannot be recovered."; ack.focus(); return; }
    btn.disabled = true; btn.textContent = "Creating encrypted vault…";
    try { await vault.createVault(p1.input.value); p1.input.value = p2.input.value = ""; onCreated(); }
    catch (ex) { btn.disabled = false; btn.textContent = "Create my private vault"; err.textContent = `The vault could not be created: ${ex.message}`; }
  });
  return gateWrap(
    h("h1", null, "Case Compass"),
    h("p", { class: "tag" }, "Document facts. Preserve evidence. Protect safety. Organize next steps."),
    h("div", { class: "card" },
      h("h2", null, "Set up your private vault"),
      h("p", { class: "muted" }, "Everything you record is encrypted on this device with your passphrase. Nothing is uploaded, and there are no accounts, analytics, or trackers."),
      form),
    h("div", { class: "links" },
      h("a", { class: "btn block", href: "#/restore" }, icon("upload"), "Restore from an encrypted backup"),
      h("a", { class: "btn block ghost", href: "#/resources" }, icon("compass"), "Browse resources without a vault")),
    h("div", { style: { marginTop: "14px" } }, callout("info", "This app is an organizational and educational tool, not legal advice. In an emergency, call 911.")));
}

export function lockScreen({ onUnlocked }) {
  const pw = passwordField({ id: "unlock-pass", label: "Passphrase", autocomplete: "current-password" });
  const err = h("div", { class: "err", role: "alert" });
  const btn = h("button", { class: "btn primary block", type: "submit" }, icon("unlock"), "Unlock");
  let fails = 0;
  const form = h("form", { class: "form", novalidate: true }, pw.el, err, btn);
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err.textContent = "";
    if (!pw.input.value) { err.textContent = "Enter your passphrase."; return; }
    btn.disabled = true; btn.textContent = "Unlocking…";
    try {
      await vault.unlock(pw.input.value);
      pw.input.value = "";
      const bad = vault.corruptItems();
      if (bad.length) toast(`${bad.length} stored item(s) could not be read. See Reports › Settings › Data health.`, "warn", 8000);
      onUnlocked();
    } catch (ex) {
      fails++;
      const delay = Math.min(fails * 800, 5000);
      err.textContent = ex.message === "WRONG_PASSPHRASE" ? `That passphrase did not unlock the vault.${fails >= 3 ? " Check Caps Lock and keyboard language." : ""}` : `Could not unlock: ${ex.message}`;
      pw.input.select();
      setTimeout(() => { btn.disabled = false; btn.textContent = "Unlock"; }, delay);
    }
  });
  setTimeout(() => pw.input.focus(), 50);
  const forgot = h("details", { class: "disclose", style: { marginTop: "12px" } }, h("summary", null, "Forgot your passphrase?"),
    h("div", { class: "inner" },
      h("p", null, "Case Compass cannot recover or reset your passphrase; that is what keeps your records private. Your options are:"),
      h("ul", null, h("li", null, "Keep trying variations you may have used."), h("li", null, "If you have an encrypted backup and remember the backup passphrase, you can erase this vault and restore the backup.")),
      h("button", { class: "btn danger small", type: "button", onclick: async () => {
        const ok = await confirmDialog({ title: "Erase this vault?", message: ["This permanently deletes every record and attachment stored in this browser. It cannot be undone.", "Only continue if you have a backup you can restore, or if you intend to start over."], confirmText: "Erase permanently", danger: true });
        if (!ok) return;
        const typed = prompt("Type ERASE to confirm.");
        if (typed !== "ERASE") { toast("Nothing was erased.", "warn"); return; }
        await vault.destroyVault(); toast("Vault erased."); location.hash = "#/welcome"; location.reload();
      } }, icon("trash"), "Erase vault and start over")));
  return gateWrap(
    h("h1", null, "Case Compass"),
    h("p", { class: "tag" }, "Your vault is locked."),
    h("div", { class: "card" }, form),
    forgot,
    h("div", { class: "links" }, h("a", { class: "btn block ghost", href: "#/resources" }, icon("compass"), "Browse resources without unlocking")));
}

export async function restoreClean() {
  const exists = await vault.vaultExists();
  const status = h("div", { "aria-live": "polite" });
  const fileBtn = h("button", { class: "btn primary block", type: "button" }, icon("upload"), "Choose backup file (.ccbackup)");
  fileBtn.addEventListener("click", async () => {
    const file = await pickFile({ accept: ".ccbackup,application/json,.json" });
    if (!file) return;
    const text = await readFileText(file);
    const parsed = backup.parseBackupFile(text);
    if (parsed.kind !== "case-compass-backup") { alertDialog("Not a Case Compass backup", [parsed.error || "This file is not a Case Compass encrypted backup. Earlier planner files can be imported after you create a vault (Reports › Import)."]); return; }
    const pw = passwordField({ id: "rb-pass", label: "Backup passphrase" });
    const vp1 = passwordField({ id: "rb-v1", label: "New vault passphrase (can be the same)", autocomplete: "new-password" });
    const err = h("div", { class: "err", role: "alert" });
    const go = h("button", { class: "btn primary block", type: "submit" }, "Decrypt, verify, and restore");
    const f = h("form", { class: "form", novalidate: true }, h("p", null, `File: ${file.name} · created ${fmtDateTimeISO(parsed.obj.created)}`), pw.el, vp1.el, h("p", { class: "muted small" }, "Leave the new vault passphrase empty to use the backup passphrase for the vault."), err, go);
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); err.textContent = "";
      go.disabled = true; go.textContent = "Decrypting and verifying…";
      try {
        const { payload, problems } = await backup.decryptBackup(parsed.obj, pw.input.value);
        const v = await backup.verifyPayload(payload);
        const vaultPass = vp1.input.value || pw.input.value;
        if (vp1.input.value && !passphraseStrength(vaultPass).ok) throw new Error("WEAK");
        if (exists) throw new Error("VAULT_EXISTS");
        await vault.createVault(vaultPass);
        const report = await backup.restorePayload(payload, { mode: "clean" });
        status.replaceChildren(callout(v.ok && !problems.length ? "ok" : "warn", h("p", null, h("b", null, "Restore complete. "), `${report.added} records, ${report.blobsAdded} attachments, and ${report.revisionsAdded} earlier versions restored.`), ...[...problems, ...v.problems, ...report.problems].map((p) => h("p", null, p))));
        toast("Backup restored.");
        setTimeout(() => navigate("#/home", { replace: true }), 1500);
      } catch (ex) {
        go.disabled = false; go.textContent = "Decrypt, verify, and restore";
        err.textContent = ex.message === "WRONG_PASSPHRASE" ? "That backup passphrase is not correct." : ex.message === "BACKUP_DAMAGED" ? "The backup file appears to be damaged or incomplete." : ex.message === "WEAK" ? "Choose a stronger new vault passphrase (at least 12 characters)." : ex.message === "VAULT_EXISTS" ? "A vault already exists in this browser. Unlock it and use Reports › Backup › Restore to merge." : `Restore failed: ${ex.message}`;
      }
    });
    status.replaceChildren(h("div", { class: "card" }, f));
    pw.input.focus();
  });
  return gateWrap(
    h("h1", null, "Restore a backup"),
    h("p", { class: "tag" }, "Restore an encrypted Case Compass backup into this browser."),
    exists ? callout("warn", "A vault already exists here. To merge a backup into it, unlock it and use Reports › Backup & Restore.") : null,
    h("div", { class: "card stack" }, h("p", { class: "muted" }, "The backup is decrypted and every attachment is checked against its SHA-256 fingerprint before anything is saved."), fileBtn),
    status,
    h("div", { class: "links" }, h("a", { class: "btn block ghost", href: exists ? "#/unlock" : "#/welcome" }, icon("back"), "Back")));
}
