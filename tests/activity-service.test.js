const test = require("node:test");
const assert = require("node:assert/strict");
const { ActivityService, MESSAGE_COUNT_COOLDOWN_SECONDS } = require("../src/services/activity");

function makeMessage() {
  return {
    guildId: "guild-1",
    user: { id: "member-1", bot: false },
    channelId: "channel-1"
  };
}

test("rapid repeat messages are excluded atomically before player or reward writes", async () => {
  const queries = [];
  const transactionFn = async (callback) => callback({
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes("INSERT INTO weekly_activity")) return { rowCount: 0, rows: [] };
      throw new Error("No query after a cooldown rejection should run");
    }
  });
  const economy = {
    mutateTx: async () => { throw new Error("No FC reward should be issued"); },
    addXpTx: async () => { throw new Error("No XP reward should be issued"); }
  };
  const service = new ActivityService({}, economy, transactionFn);

  const result = await service.trackMessage(makeMessage(), []);

  assert.deepEqual(result, {
    counted: false,
    reason: "cooldown",
    reward: 0,
    xpReward: 0,
    weekStart: result.weekStart
  });
  assert.equal(queries.length, 1);
  assert.equal(queries[0].params.length, 4);
  assert.equal(queries[0].params[3], MESSAGE_COUNT_COOLDOWN_SECONDS);
  assert.match(queries[0].sql, /last_counted_at <= NOW\(\) - \(\$4 \* INTERVAL '1 second'\)/);
  assert.equal(MESSAGE_COUNT_COOLDOWN_SECONDS, 5);
});

test("eligible activity keeps the existing daily FC and XP caps", async () => {
  const queries = [];
  const economyCalls = [];
  const transactionFn = async (callback) => callback({
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes("INSERT INTO weekly_activity")) return { rowCount: 1, rows: [{ messages: 12 }] };
      if (sql.includes("SELECT earned, xp_earned FROM daily_chat_rewards")) {
        return { rowCount: 1, rows: [{ earned: 249, xp_earned: 98 }] };
      }
      return { rowCount: 1, rows: [] };
    }
  });
  const economy = {
    mutateTx: async (...args) => {
      economyCalls.push("fc");
      return { delta: args[3], candyDrop: null };
    },
    addXpTx: async (...args) => {
      economyCalls.push("xp");
      return { gained: args[3] };
    }
  };
  const service = new ActivityService({}, economy, transactionFn);

  const result = await service.trackMessage(makeMessage(), []);

  assert.equal(result.counted, true);
  assert.equal(result.messages, 12);
  assert.ok(result.reward >= 0 && result.reward <= 1, "daily FC cap must remain 250");
  assert.equal(result.rewardCapRemaining, 0);
  assert.equal(result.xpReward, 2, "daily XP cap must remain 100");
  assert.equal(result.xpCapRemaining, 0);
  assert.deepEqual(economyCalls, ["fc", "xp"]);
  assert.ok(queries.some((entry) => entry.sql.includes("UPDATE daily_chat_rewards SET earned")));
  assert.ok(queries.some((entry) => entry.sql.includes("UPDATE daily_chat_rewards SET xp_earned")));
});

test("bot and webhook messages are never counted or rewarded", async () => {
  let transactionCalls = 0;
  const service = new ActivityService({}, {}, async (callback) => {
    transactionCalls += 1;
    return callback({ query: async () => ({ rowCount: 0, rows: [] }) });
  });
  const botMessage = { ...makeMessage(), author: { id: "bot", bot: true } };
  const webhookMessage = { ...makeMessage(), webhookId: "hook-1" };

  assert.equal((await service.trackMessage(botMessage)).reason, "ignored");
  assert.equal((await service.trackMessage(webhookMessage)).reason, "ignored");
  assert.equal(transactionCalls, 0);
});
