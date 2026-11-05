const test = require("node:test");
const assert = require("node:assert/strict");
const { CasinoGame } = require("../src/games/casino");

test("casino statistics report lifetime rounds, wins, wagering and net result", async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return {
        rowCount: 1,
        rows: [{ rounds: "18", wins: "9", wagered: "9000", payout: "8550", net: "-450" }]
      };
    }
  };
  const game = new CasinoGame(pool, {}, {});
  const stats = await game.stats("guild-1", "member-1");
  assert.deepEqual(stats, { rounds: 18, wins: 9, wagered: 9000, payout: 8550, net: -450 });
  assert.deepEqual(calls[0].values, ["guild-1", "member-1"]);
  assert.match(calls[0].sql, /casino_bet/);
  assert.match(calls[0].sql, /casino_payout/);
});

test("casino history groups each wager and payout into one recent round", async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return {
        rowCount: 1,
        rows: [{
          round_id: "round-1", game_id: "slots", wager: "500", payout: "2000",
          net: "1500", played_at: new Date("2026-11-05T12:00:00.000Z")
        }]
      };
    }
  };
  const game = new CasinoGame(pool, {}, {});
  const history = await game.history("guild-1", "member-1", 5);
  assert.equal(history.length, 1);
  assert.equal(history[0].game_id, "slots");
  assert.equal(history[0].wager, 500);
  assert.equal(history[0].payout, 2000);
  assert.equal(history[0].net, 1500);
  assert.deepEqual(calls[0].values, ["guild-1", "member-1", 5]);
  assert.match(calls[0].sql, /split_part\(reference/);
  assert.match(calls[0].sql, /GROUP BY/);
});
