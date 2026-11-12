const test = require("node:test");
const assert = require("node:assert/strict");
const { EconomyService } = require("../src/services/economy");

test("bank history reports deposits and withdrawals without mixing them into other ledger activity", async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("COUNT(*)::int AS transactions")) {
        return { rowCount: 1, rows: [{ transactions: "4", deposited: "12000", withdrawn: "3000" }] };
      }
      return {
        rowCount: 2,
        rows: [
          { reason: "bank_deposit", amount: "5000", created_at: new Date("2026-11-05T12:00:00Z") },
          { reason: "bank_withdrawal", amount: "1000", created_at: new Date("2026-11-04T12:00:00Z") }
        ]
      };
    }
  };
  const economy = new EconomyService(pool);
  const history = await economy.getBankHistory("guild-1", "member-1", 5);
  assert.deepEqual({
    transactions: history.transactions,
    deposited: history.deposited,
    withdrawn: history.withdrawn
  }, { transactions: 4, deposited: 12000, withdrawn: 3000 });
  assert.equal(history.recent[0].amount, 5000);
  assert.deepEqual(calls[0].values, ["guild-1", "member-1"]);
  assert.deepEqual(calls[1].values, ["guild-1", "member-1", 5]);
});

test("bank moves and player trades are ledger-backed without becoming lifetime earnings or spending", async () => {
  const economy = new EconomyService({});
  const player = { wallet: 100, bank: 0, lifetime_earned: 0, lifetime_spent: 0, job_id: null, level: 1, xp: 0 };
  const snapshot = { ...player };
  const ledger = [];
  const client = { query: async (sql, values = []) => {
    if (sql.includes("INSERT INTO players")) return { rowCount: 1, rows: [] };
    if (sql.includes("SELECT wallet, bank, lifetime_earned, lifetime_spent, job_id, level, xp FROM players")) {
      return { rowCount: 1, rows: [{ ...player }] };
    }
    if (sql.includes("FROM player_economy_snapshots") && sql.includes("FOR UPDATE")) {
      return { rowCount: 1, rows: [{ ...snapshot }] };
    }
    if (sql.includes("SELECT id FROM economy_ledger")) return { rowCount: 0, rows: [] };
    if (sql.includes("SELECT COUNT(*)::int AS count")) return { rowCount: 1, rows: [{ count: 0, base_total: 0 }] };
    if (sql.includes("UPDATE players SET wallet = $3, bank = $4")) {
      player.wallet = Number(values[2]);
      player.bank = Number(values[3]);
      player.lifetime_earned += Number(values[4]);
      player.lifetime_spent += Number(values[5]);
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("INSERT INTO economy_ledger")) {
      ledger.push({ delta: Number(values[2]), reason: values[3], reference: values[4] });
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("INSERT INTO player_economy_snapshots") && sql.includes("ON CONFLICT")) {
      Object.assign(snapshot, player);
      return { rowCount: 1, rows: [] };
    }
    return { rowCount: 1, rows: [] };
  } };
  const originalRandom = Math.random;
  Math.random = () => 0.999;
  try {
    await economy.mutateTx(client, "guild", "member", -50, "bank_deposit", "bank-deposit");
    await economy.mutateTx(client, "guild", "member", 50, "bank_withdrawal", "bank-withdrawal");
    await economy.mutateTx(client, "guild", "member", 50, "player_trade_in", "trade-in", { tradeId: "trade-1" });
    await economy.mutateTx(client, "guild", "member", -50, "player_trade_out", "trade-out", { tradeId: "trade-2" });
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(player.wallet, 100);
  assert.equal(player.bank, 0);
  assert.equal(player.lifetime_earned, 0);
  assert.equal(player.lifetime_spent, 0);
  assert.deepEqual(ledger.map((row) => row.reason), ["bank_deposit", "bank_withdrawal", "player_trade_in", "player_trade_out"]);
  assert.equal(ledger[2].delta, 50);
  assert.equal(ledger[3].delta, -50);
});
