const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONFIRMATION,
  RESET_TABLES,
  PRESERVED_TABLES,
  parseConfirmation,
  runReset
} = require("../scripts/reset-player-data");

function makeFakePool({ failOnDelete = null } = {}) {
  const calls = [];
  const counts = Object.fromEntries(RESET_TABLES.map((table, index) => [table, index + 1]));
  const client = {
    async query(sql) {
      calls.push({ sql });
      if (sql.startsWith("SELECT current_database")) {
        return { rows: [{ database: "test_neon", schema: "public" }] };
      }
      if (sql.includes("FROM pg_catalog.pg_tables")) {
        return { rows: RESET_TABLES.map((tablename) => ({ tablename })) };
      }
      if (sql.startsWith("SELECT COUNT(*)")) {
        const match = sql.match(/public\."([a-z0-9_]+)"/);
        return { rows: [{ count: String(counts[match[1]] || 0) }] };
      }
      if (sql.startsWith("DELETE FROM")) {
        const match = sql.match(/public\."([a-z0-9_]+)"/);
        if (match[1] === failOnDelete) throw new Error("simulated deletion failure");
        return { rowCount: counts[match[1]] || 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push({ sql: "RELEASE" }); }
  };
  return {
    calls,
    pool: { async connect() { return client; } }
  };
}

test("reset is limited to gameplay/player tables and preserves admin configuration", () => {
  assert.ok(RESET_TABLES.includes("players"));
  assert.ok(RESET_TABLES.includes("economy_ledger"));
  assert.ok(RESET_TABLES.includes("inventory"));
  assert.ok(RESET_TABLES.includes("event_wallets"));
  assert.ok(RESET_TABLES.includes("boss_battles"));
  assert.ok(RESET_TABLES.includes("party_game_stats"));
  assert.ok(RESET_TABLES.includes("server_booster_status"));
  assert.ok(PRESERVED_TABLES.includes("guild_settings"));
  assert.ok(PRESERVED_TABLES.includes("halloween_events"));
  assert.ok(PRESERVED_TABLES.includes("custom_commands"));
  assert.ok(PRESERVED_TABLES.includes("audit_logs"));
  assert.ok(PRESERVED_TABLES.includes("security_incidents"));
  assert.ok(PRESERVED_TABLES.includes("bot_user_restrictions"));
  assert.ok(PRESERVED_TABLES.includes("leaderboard_exclusions"));
  assert.equal(RESET_TABLES.some((table) => PRESERVED_TABLES.includes(table)), false);
});

test("confirmation phrase is mandatory for destructive mode", () => {
  assert.equal(parseConfirmation([]), false);
  assert.equal(parseConfirmation(["--confirm", CONFIRMATION]), true);
  assert.throws(() => parseConfirmation(["--confirm"]), /Invalid arguments/);
  assert.throws(() => parseConfirmation(["--confirm", "yes"]), /Invalid arguments/);
});

test("default run previews counts and never deletes data", async () => {
  const fake = makeFakePool();
  const output = [];
  const result = await runReset({
    dbPool: fake.pool,
    logger: { log: (...parts) => output.push(parts.join(" ")) }
  });
  assert.equal(result.performed, false);
  assert.ok(fake.calls.some((call) => call.sql.startsWith("SELECT COUNT(*)")));
  assert.equal(fake.calls.some((call) => call.sql.startsWith("DELETE FROM")), false);
  assert.match(output.join("\n"), /DRY RUN/);
});

test("confirmed run locks and clears only the listed data tables in one transaction", async () => {
  const fake = makeFakePool();
  const result = await runReset({
    dbPool: fake.pool,
    confirm: true,
    logger: { log() {}, error() {} }
  });
  const statements = fake.calls.map((call) => call.sql);
  assert.equal(result.performed, true);
  assert.equal(statements[0], "BEGIN");
  const lockIndex = statements.findIndex((sql) => sql.startsWith("LOCK TABLE"));
  const firstDeleteIndex = statements.findIndex((sql) => sql.startsWith("DELETE FROM"));
  const commitIndex = statements.indexOf("COMMIT");
  assert.ok(lockIndex > 0);
  assert.ok(firstDeleteIndex > lockIndex);
  assert.ok(commitIndex > firstDeleteIndex);
  const deletedTables = statements.filter((sql) => sql.startsWith("DELETE FROM"))
    .map((sql) => sql.match(/public\."([a-z0-9_]+)"/)[1]);
  assert.deepEqual(deletedTables, RESET_TABLES);
  assert.equal(statements.includes("ROLLBACK"), false);
});

test("a failed deletion rolls the entire reset back", async () => {
  const fake = makeFakePool({ failOnDelete: "players" });
  await assert.rejects(
    runReset({ dbPool: fake.pool, confirm: true, logger: { log() {}, error() {} } }),
    /simulated deletion failure/
  );
  const statements = fake.calls.map((call) => call.sql);
  assert.ok(statements.includes("ROLLBACK"));
  assert.equal(statements.includes("COMMIT"), false);
});
