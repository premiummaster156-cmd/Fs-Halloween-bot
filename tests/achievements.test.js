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


test("the private dashboard exposes achievement progress and a claim control", async () => {
  const { renderMenu } = require("../src/commands/dashboard");
  const entries = [
    {
      id: "first_shift", name: "First Shift", description: "Complete your first shift.",
      current: 1, actual: 1, target: 1, progressPercent: 100, unlocked: true,
      claimed: false, rewardFc: 150, rewardXp: 25
    },
    {
      id: "steady_worker", name: "Steady Worker", description: "Complete ten shifts.",
      current: 3, actual: 3, target: 10, progressPercent: 30, unlocked: false,
      claimed: false, rewardFc: 250, rewardXp: 35
    }
  ];
  const payload = await renderMenu("guild-1", "member-1", "achievements", {
    achievements: { status: async () => entries }
  });
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, "ACHIEVEMENT BOOK");
  assert.ok(embed.description.includes("Collected: 0/2"));
  assert.ok(embed.description.includes("Ready to claim: 1"));
  const controls = payload.components.flatMap((component) => component.toJSON().components);
  const claimMenu = controls.find((component) => component.custom_id === "dash:member-1:achievement-claim");
  assert.ok(claimMenu);
  assert.deepEqual(claimMenu.options.map((option) => option.value), ["first_shift"]);
});
