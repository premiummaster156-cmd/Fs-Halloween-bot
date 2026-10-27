const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/utils/core");
const balancing = require("../src/config/game-balancing");

test("level requirements grow with level", () => {
  assert.ok(core.levelXpRequired(10) > core.levelXpRequired(5));
  assert.ok(core.levelXpRequired(5) > core.levelXpRequired(1));
});

test("career pay has bounded randomness and grows by job level", () => {
  const job = { payMin: 100, payMax: 200 };
  assert.ok(core.calculateWorkPay(job, 1, 0.82) < core.calculateWorkPay(job, 10, 1.18));
  assert.ok(core.calculateWorkPay(job, 1, 0.82) > 0);
});

test("crime chance remains bounded", () => {
  assert.equal(core.calculateCrimeChance(1, 1, 20, 0), 8);
  assert.equal(core.calculateCrimeChance(100, 500, 1, 100), 88);
});

test("heists reward crew and preparation but cannot become guaranteed", () => {
  const easy = core.calculateHeistChance(25, 1, 2, 3, 0);
  const prepared = core.calculateHeistChance(25, 15, 5, 1, 15);
  assert.ok(prepared > easy);
  assert.ok(prepared <= 85);
});

test("splitReward distributes the exact total without order advantages", () => {
  const shares = core.splitReward(1001, ["c", "a", "b"]);
  assert.equal(shares.reduce((sum, item) => sum + item.amount, 0), 1001);
  assert.deepEqual(shares.map((item) => item.userId), ["a", "b", "c"]);
});

test("casino payout uses integer calculations", () => {
  assert.equal(core.casinoPayout(101, 200), 202);
  assert.equal(core.casinoPayout(101, 130), 131);
});

test("economy balance, job, heist, and quest data is internally valid", () => {
  assert.ok(balancing.jobs.length >= 5);
  assert.equal(new Set(balancing.jobs.map((item) => item.id)).size, balancing.jobs.length);
  for (const job of balancing.jobs) {
    assert.ok(job.payMax >= job.payMin);
    assert.ok(job.cooldownMs > 0);
  }
  for (const mission of balancing.heists) {
    assert.ok(mission.minParticipants >= 2);
    assert.ok(mission.maxParticipants >= mission.minParticipants);
    assert.ok(mission.baseChance > 0 && mission.baseChance < 100);
  }
  assert.equal(new Set(balancing.halloween.quests.map((item) => item.id)).size, balancing.halloween.quests.length);
});


test("weekly activity starts on Monday UTC regardless of weekday", () => {
  const { getWeekStart } = require("../src/services/activity");
  assert.equal(getWeekStart("2026-10-27T09:00:00.000Z"), "2026-10-26");
  assert.equal(getWeekStart("2026-10-25T23:59:59.000Z"), "2026-10-19");
  assert.equal(getWeekStart("2026-10-26T00:00:00.000Z"), "2026-10-26");
});
