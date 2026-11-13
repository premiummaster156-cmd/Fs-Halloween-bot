const test = require("node:test");
const assert = require("node:assert/strict");
const balancing = require("../src/config/game-balancing");
const { getLevelEarningMultiplier } = require("../src/utils/core");

test("FC reward multiplier rises by 0.5% per player level above level 1", () => {
  assert.equal(getLevelEarningMultiplier(1), 1);
  assert.equal(Number(getLevelEarningMultiplier(2).toFixed(3)), 1.005);
  assert.equal(Number(getLevelEarningMultiplier(100).toFixed(3)), 1.495);
  assert.equal(Number(getLevelEarningMultiplier(600).toFixed(3)), 3.995);
  assert.equal(Number(getLevelEarningMultiplier(1000).toFixed(3)), 5.995);
  assert.equal(Number(getLevelEarningMultiplier(9999).toFixed(3)), 5.995);
});

test("career catalogue contains the original seven plus fifteen unique careers", () => {
  assert.equal(balancing.jobs.length, 22);
  assert.equal(new Set(balancing.jobs.map((job) => job.id)).size, 22);
  assert.ok(balancing.jobs.every((job) => balancing.careerEffects[job.id]));
});
