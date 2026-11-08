const test = require("node:test");
const assert = require("node:assert/strict");
const { PRESETS, validateAdminAbuseStart } = require("../src/services/admin-abuse");

test("Admin Abuse exposes distinct gameplay presets rather than an FC-only party", () => {
  assert.deepEqual(Object.keys(PRESETS), ["blood_moon", "candy_storm", "rift_surge", "lucky_block_rain"]);
  assert.match(PRESETS.blood_moon.description, /crime success/i);
  assert.match(PRESETS.candy_storm.description, /Candy/i);
  assert.match(PRESETS.rift_surge.description, /Rift Arena/i);
  assert.equal(PRESETS.lucky_block_rain.claimable, true);
});

test("Admin Abuse duration is bounded and event types are validated", () => {
  assert.equal(validateAdminAbuseStart("blood_moon", 15).duration, 15);
  assert.equal(validateAdminAbuseStart("lucky_block_rain", 60).duration, 60);
  assert.throws(() => validateAdminAbuseStart("unknown", 15), /valid Admin Abuse event/);
  assert.throws(() => validateAdminAbuseStart("blood_moon", 1), /between 2 and 60/);
  assert.throws(() => validateAdminAbuseStart("blood_moon", 61), /between 2 and 60/);
});
