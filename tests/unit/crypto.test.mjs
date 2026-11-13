import { test } from "node:test";
import assert from "node:assert/strict";
import * as cc from "../../js/core/crypto.js";

test("passphrase-derived key wraps and unwraps the data key", async () => {
  const salt = cc.randomBytes(16);
  const kek = await cc.deriveKEK("correct horse battery staple", salt, 1000);
  const dek = await cc.generateDEK();
  const wrapped = await cc.wrapDEK(dek, kek);
  const back = await cc.unwrapDEK(wrapped, kek);
  const { iv, ct } = await cc.encryptJSON(back, { hello: "world" }, "record:1");
  assert.deepEqual(await cc.decryptJSON(back, iv, ct, "record:1"), { hello: "world" });
});

test("a wrong passphrase cannot unwrap the data key", async () => {
  const salt = cc.randomBytes(16);
  const wrapped = await cc.wrapDEK(await cc.generateDEK(), await cc.deriveKEK("right passphrase here", salt, 1000));
  await assert.rejects(cc.unwrapDEK(wrapped, await cc.deriveKEK("wrong passphrase here", salt, 1000)));
});

test("ciphertext is bound to its record id (AAD) and tampering is detected", async () => {
  const key = await cc.generateDEK();
  const { iv, ct } = await cc.encryptJSON(key, { a: 1 }, "record:A");
  await assert.rejects(cc.decryptJSON(key, iv, ct, "record:B"), "swapped id must fail");
  const t = new Uint8Array(ct); t[0] ^= 1;
  await assert.rejects(cc.decryptJSON(key, iv, t, "record:A"), "tampered byte must fail");
});

test("each encryption uses a fresh IV", async () => {
  const key = await cc.generateDEK();
  const a = await cc.encryptJSON(key, { a: 1 }), b = await cc.encryptJSON(key, { a: 1 });
  assert.notDeepEqual(Array.from(a.iv), Array.from(b.iv));
  assert.notDeepEqual(Array.from(a.ct), Array.from(b.ct));
});

test("SHA-256 matches the known test vector", async () => {
  assert.equal(await cc.sha256Hex(new TextEncoder().encode("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
