const test = require("node:test");
const assert = require("node:assert/strict");
const balancing = require("../src/config/game-balancing");
const { WeeklyQuestService } = require("../src/services/weekly-quests");
const { trackWeeklyQuestActionTx } = require("../src/services/events");

test("weekly Candy quests offer a clear, achievable 120 Candy reward each week", () => {
  assert.equal(balancing.weeklyQuests.length, 5);
  assert.equal(balancing.weeklyQuests.reduce((sum, quest) => sum + quest.candy, 0), 120);
  assert.deepEqual(balancing.weeklyQuests.map((quest) => quest.action).sort(),
    ["casino_play", "crime_success", "daily", "heist_success", "work"].sort());
});

test("weekly quest action progress is capped at its goal", async () => {
  const writes = [];
  const client = {
    query: async (sql, values) => {
      writes.push({ sql, values });
      return { rowCount: 1, rows: [] };
    }
  };
  await trackWeeklyQuestActionTx(client, "guild-1", "member-1", "work", 9);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /weekly_quest_progress/);
  assert.match(writes[0].sql, /LEAST/);
  assert.equal(writes[0].values[3], "weekly_work");
  assert.equal(writes[0].values[4], 9);
  assert.equal(writes[0].values[5], 5);
});

test("weekly quest status exposes progress, ready claims and Candy wallet", async () => {
  const service = new WeeklyQuestService({
    query: async (sql) => {
      if (sql.includes("weekly_quest_progress")) return { rowCount: 2, rows: [
        { quest_id: "weekly_work", progress: "5" },
        { quest_id: "weekly_daily", progress: "2" }
      ] };
      if (sql.includes("weekly_quest_claims")) return { rowCount: 0, rows: [] };
      if (sql.includes("event_wallets")) return { rowCount: 1, rows: [{ candy: "88" }] };
      throw new Error("Unexpected query: " + sql);
    }
  });
  const status = await service.status("guild-1", "member-1");
  assert.equal(status.candyBalance, 88);
  assert.equal(status.totalWeeklyCandy, 120);
  assert.equal(status.quests.find((quest) => quest.id === "weekly_work").ready, true);
  assert.equal(status.quests.find((quest) => quest.id === "weekly_daily").progress, 2);
});
