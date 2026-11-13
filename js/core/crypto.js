// Client-side cryptography using the Web Crypto API (browser and Node 20+).
//
// Design:
//   passphrase --PBKDF2-SHA256 (600,000 iterations, 16-byte random salt)--> key-encryption key (KEK)
//   random 256-bit data-encryption key (DEK) is wrapped with the KEK using AES-GCM.
//   Every record, attachment, revision, draft and setting is encrypted with the DEK using
//   AES-256-GCM, a fresh 12-byte random IV per encryption, and the item's id as
//   additional authenticated data (so ciphertext cannot be swapped between items).
// The passphrase and the unwrapped DEK exist only in memory while the vault is unlocked.

import { bytesToB64, b64ToBytes, hex } from "./util.js";

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WEB_CRYPTO_UNAVAILABLE");
  return s;
};
const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 600000;
export const KDF_HASH = "SHA-256";

export function randomBytes(n) { return globalThis.crypto.getRandomValues(new Uint8Array(n)); }

export async function deriveKEK(passphrase, salt, iterations = KDF_ITERATIONS) {
  const base = await subtle().importKey("raw", enc.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: KDF_HASH },
    base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey", "encrypt", "decrypt"]);
}

export async function generateDEK() {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function wrapDEK(dek, kek) {
  const iv = randomBytes(12);
  const ct = await subtle().wrapKey("raw", dek, kek, { name: "AES-GCM", iv, additionalData: enc.encode("case-compass-dek") });
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

// Throws (OperationError) when the passphrase is wrong, because GCM authentication fails.
export async function unwrapDEK(wrapped, kek, extractable = false) {
  return subtle().unwrapKey("raw", b64ToBytes(wrapped.ct), kek,
    { name: "AES-GCM", iv: b64ToBytes(wrapped.iv), additionalData: enc.encode("case-compass-dek") },
    { name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
}

export async function encryptBytes(key, bytes, aad = "") {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, bytes);
  return { iv, ct: new Uint8Array(ct) };
}

export async function decryptBytes(key, iv, ct, aad = "") {
  const pt = await subtle().decrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, ct);
  return new Uint8Array(pt);
}

export async function encryptJSON(key, obj, aad = "") {
  return encryptBytes(key, enc.encode(JSON.stringify(obj)), aad);
}

export async function decryptJSON(key, iv, ct, aad = "") {
  return JSON.parse(dec.decode(await decryptBytes(key, iv, ct, aad)));
}

export async function sha256Hex(bytes) {
  return hex(await subtle().digest("SHA-256", bytes));
}

export function cryptoAvailable() {
  return !!(globalThis.crypto && globalThis.crypto.subtle && globalThis.crypto.getRandomValues);
}
