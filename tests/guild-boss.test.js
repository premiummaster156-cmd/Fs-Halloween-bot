const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BOSSES,
  BOSS_MAX_HP,
  ATTACK_COOLDOWN_MS,
  ATTACK_REWARD_FC,
  ATTACK_REWARD_XP,
  CLEAR_REWARD_FC,
  CLEAR_REWARD_XP,
  getBossWeekStart,
  bossForPeriod,
  calculateBossDamage
} = require("../src/games/guild-boss");

test("weekly boss periods begin on Monday UTC", () => {
  assert.equal(getBossWeekStart("2026-11-05T12:30:00.000Z"), "2026-11-02");
  assert.equal(getBossWeekStart("2026-11-01T23:59:59.000Z"), "2026-10-26");
  assert.equal(getBossWeekStart("2026-11-02T00:00:00.000Z"), "2026-11-02");
});

test("boss selection is stable for a week and rotates through all boss themes", () => {
  const period = "2026-11-02";
  assert.deepEqual(bossForPeriod(period), bossForPeriod(period));
  const names = [];
  const start = new Date(period + "T00:00:00.000Z");
  for (let index = 0; index < BOSSES.length; index += 1) {
    const date = new Date(start.getTime() + index * 7 * 24 * 60 * 60 * 1000);
    names.push(bossForPeriod(date.toISOString().slice(0, 10)).id);
  }
  assert.equal(new Set(names).size, BOSSES.length);
});

test("boss damage scales modestly with level and stays inside documented bounds", () => {
  assert.equal(calculateBossDamage(1, 140), 144);
  assert.equal(calculateBossDamage(40, 200), 360);
  assert.equal(calculateBossDamage(99, 500), 360);
  assert.equal(calculateBossDamage(-10, 0), 144);
  assert.ok(calculateBossDamage(10, 180) > calculateBossDamage(1, 180));
});

test("weekly boss rewards and cooldown are intentionally capped", () => {
  assert.equal(BOSS_MAX_HP, 22000);
  assert.equal(ATTACK_COOLDOWN_MS, 8 * 60 * 60 * 1000);
  assert.equal(ATTACK_REWARD_FC, 35);
  assert.equal(ATTACK_REWARD_XP, 10);
  assert.equal(CLEAR_REWARD_FC, 700);
  assert.equal(CLEAR_REWARD_XP, 80);
});

test("player-friendly gameplay slash commands are registered and serialize", () => {
  const { loadCommands } = require("../src/commands");
  const commands = loadCommands();
  for (const name of [
    "daily", "profile", "job", "work", "crime",
    "casino", "leaderboard", "boss", "guide"
  ]) {
    assert.ok(commands.has(name), "Missing /" + name);
    assert.doesNotThrow(() => commands.get(name).data.toJSON(), "Invalid /" + name + " command definition");
  }
});
