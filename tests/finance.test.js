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

test("rebirth history returns saved reset metadata in newest-first order", async () => {
  const pool = {
    query: async (_sql, values) => ({
      rowCount: 1,
      rows: [{ created_at: new Date("2026-11-05T12:00:00Z"), metadata: { rebirths: 2, previousWallet: 40000, previousBank: 5000 } }]
    })
  };
  const economy = new EconomyService(pool);
  const history = await economy.getRebirthHistory("guild-1", "member-1", 5);
  assert.equal(history[0].metadata.rebirths, 2);
  assert.equal(history[0].metadata.previousBank, 5000);
});

test("bank moves and incoming transfers do not inflate lifetime earned or spent totals", async () => {
  const economy = new EconomyService({});
  const updates = [];
  const client = {};
  client.query = async (sql, values) => {
    if (sql.includes("SELECT wallet, prestige, job_id FROM players")) {
      return { rowCount: 1, rows: [{ wallet: 100, prestige: 0, job_id: null }] };
    }
    if (sql.includes("SELECT id FROM economy_ledger")) return { rowCount: 0, rows: [] };
    if (sql.includes("UPDATE players SET wallet =")) updates.push(values);
    return { rowCount: 1, rows: [] };
  };
  const originalRandom = Math.random;
  Math.random = () => 0.999;
  try {
    await economy.mutateTx(client, "guild", "member", -50, "bank_deposit", "bank-deposit");
    await economy.mutateTx(client, "guild", "member", 50, "bank_withdrawal", "bank-withdrawal");
    await economy.mutateTx(client, "guild", "member", 50, "member_transfer_in", "transfer-in");
    await economy.mutateTx(client, "guild", "member", -50, "member_transfer_out", "transfer-out");
  } finally {
    Math.random = originalRandom;
  }
  assert.deepEqual(updates.map((values) => values.slice(3)), [
    [0, 0], [0, 0], [0, 0], [0, 50]
  ]);
});
