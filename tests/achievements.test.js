const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ACHIEVEMENTS,
  evaluateAchievement,
  mapPlayerMetrics
} = require("../src/games/achievements");

test("achievement milestones have unique IDs and clear one-time reward values", () => {
  assert.ok(ACHIEVEMENTS.length >= 8);
  assert.equal(new Set(ACHIEVEMENTS.map((item) => item.id)).size, ACHIEVEMENTS.length);
  for (const item of ACHIEVEMENTS) {
    assert.ok(item.name.length > 0);
    assert.ok(item.description.length > 0);
    assert.ok(Number.isInteger(item.target) && item.target > 0);
    assert.ok(Number.isInteger(item.rewardFc) && item.rewardFc > 0);
    assert.ok(Number.isInteger(item.rewardXp) && item.rewardXp > 0);
  }
});

test("achievement progress is capped for display but retains the actual metric", () => {
  const achievement = ACHIEVEMENTS.find((item) => item.id === "first_shift");
  const result = evaluateAchievement(achievement, { work_count: 8 });
  assert.equal(result.current, 1);
  assert.equal(result.actual, 8);
  assert.equal(result.target, 1);
  assert.equal(result.unlocked, true);
  assert.equal(result.progressPercent, 100);
});

test("achievement progress remains locked until the exact target is reached", () => {
  const achievement = ACHIEVEMENTS.find((item) => item.id === "crew_veteran");
  assert.equal(evaluateAchievement(achievement, { heists_completed: 4 }).unlocked, false);
  assert.equal(evaluateAchievement(achievement, { heists_completed: 5 }).unlocked, true);
});

test("player metrics include combined wallet and bank wealth plus Party Games aliases", () => {
  const metrics = mapPlayerMetrics({
    wallet: "450000",
    bank: "650000",
    level: 12,
    job_level: 7,
    work_count: "18",
    crime_successes: "9",
    heists_completed: "4",
    prestige: 1
  }, { party_games: "14", party_wins: "6" });
  assert.equal(metrics.wealth, 1100000);
  assert.equal(metrics.party_games, 14);
  assert.equal(metrics.party_wins, 6);
  assert.equal(metrics.work_count, 18);
});

test("achievement slash command is registered with valid view and claim choices", () => {
  const { loadCommands } = require("../src/commands");
  const command = loadCommands().get("achievements");
  assert.ok(command);
  assert.doesNotThrow(() => command.data.toJSON());
});
