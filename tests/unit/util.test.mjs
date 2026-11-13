import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCSV, toCSV, passphraseStrength, ageFrom, fmtDate, startOfWeek } from "../../js/core/util.js";

test("CSV round-trips quotes, commas, and newlines", () => {
  const rows = [["a", "b,c", 'say "hi"'], ["line\nbreak", "", "x"]];
  assert.deepEqual(parseCSV(toCSV(rows)), rows);
});
test("weak passphrases are rejected and long multi-word ones accepted", () => {
  assert.equal(passphraseStrength("password123").ok, false);
  assert.equal(passphraseStrength("short").ok, false);
  assert.equal(passphraseStrength("river lantern quiet maple 47").ok, true);
});
test("ages and dates are computed without time-zone drift", () => {
  assert.equal(ageFrom("2018-04-12", "2026-04-11"), 7);
  assert.equal(ageFrom("2018-04-12", "2026-04-12"), 8);
  assert.equal(fmtDate("2026-10-03"), "Oct 3, 2026");
  assert.equal(startOfWeek("2026-11-13"), "2026-11-08");
});
