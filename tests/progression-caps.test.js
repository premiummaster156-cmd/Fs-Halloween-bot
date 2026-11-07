const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/utils/core");
const balancing = require("../src/config/game-balancing");
const { getRebirthRequirements, EconomyService } = require("../src/services/economy");

test("rebirth duplication increases by one full multiplier each time", () => {
  assert.deepEqual([0, 1, 2, 3, 20, 100].map(core.getRebirthMultiplier), [1, 2, 3, 4, 21, 101]);
});

test("progression caps are level 600 and rebirth 100", () => {
  assert.equal(balancing.progression.maxLevel, 600);
  assert.equal(balancing.progression.maxRebirths, 100);
  assert.equal(core.levelXpRequired(601), core.levelXpRequired(600));
  const status = getRebirthRequirements({
    wallet: 0, bank: 0, level: 600, prestige: 100,
    job_id: "crime_boss", job_level: 30, rebirth_work_count: 30
  }, 6, [], 10000);
  assert.equal(status.multiplier, 101);
  assert.equal(status.checks.maxRebirth, false);
  assert.equal(status.eligible, false);
});

test("large XP grants cannot raise a player above level 600", async () => {
  const service = new EconomyService({});
  const updates = [];
  const client = {
    query: async (sql) => {
      if (sql.includes("FROM guild_settings")) return { rowCount: 0, rows: [] };
      if (sql.includes("SELECT level, xp, prestige")) return {
        rowCount: 1, rows: [{ level: 599, xp: 0, prestige: 0 }]
      };
      if (sql.includes("UPDATE players SET level")) updates.push(sql);
      return { rowCount: 1, rows: [] };
    }
  };
  const result = await service.addXpTx(client, "guild", "member", 1000000);
  assert.equal(result.level, 600);
  assert.equal(result.xp, 0);
  assert.equal(result.levelsGained, 1);
  assert.equal(updates.length, 1);
});
