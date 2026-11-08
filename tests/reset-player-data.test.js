const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONFIRMATION, RESET_TABLES, PRESERVED_TABLES, parseConfirmation,
  resolveProtectedUsers, buildDeletePlans, runReset
} = require("../scripts/reset-player-data");

const schemaColumns = {
  players: ["guild_id", "user_id", "wallet", "job_id"],
  economy_ledger: ["guild_id", "user_id", "delta"],
  inventory: ["guild_id", "user_id", "item_id", "quantity"],
  equipped_items: ["guild_id", "user_id", "slot"],
  heists: ["guild_id", "leader_id", "id"],
  heist_participants: ["guild_id", "user_id", "heist_id"],
  guild_settings: ["guild_id", "setting_key", "setting_value"]
};

function makeRest() {
  const guilds = { g1: { owner_id: "server-owner" }, g2: { owner_id: "server-owner-2" } };
  const members = {
    "g1:role-admin": ["admin-role"], "g1:regular": [],
    "g2:role-admin-2": ["admin-role-2"], "g2:regular-2": []
  };
  return {
    async get(route) {
      const parts = route.split("/");
      if (parts.length === 3) {
        if (!guilds[parts[2]]) throw new Error("unknown guild");
        return guilds[parts[2]];
      }
      if (parts.length === 5) {
        const key = parts[2] + ":" + parts[4];
        if (!Object.hasOwn(members, key)) {
          const error = new Error("Unknown Member");
          error.code = 10007;
          throw error;
        }
        return { roles: members[key] };
      }
      throw new Error("Unexpected route " + route);
    }
  };
}
function makeFakePool({ failOnDelete = null } = {}) {
  const calls = [];
  const identityRows = [
    { guild_id: "g1", user_id: "bot-owner" },
    { guild_id: "g1", user_id: "server-owner" },
    { guild_id: "g1", user_id: "role-admin" },
    { guild_id: "g1", user_id: "regular" },
    { guild_id: "g2", user_id: "server-owner-2" },
    { guild_id: "g2", user_id: "role-admin-2" },
    { guild_id: "g2", user_id: "regular-2" }
  ];
  const client = {
    async query(sql) {
      calls.push({ sql });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK" ||
          sql.startsWith("SET LOCAL") || sql.startsWith("LOCK TABLE") ||
          sql.startsWith("CREATE TEMP TABLE") || sql.startsWith("INSERT INTO pg_temp.reset_protected_users")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.startsWith("SELECT current_database")) return { rows: [{ database: "test_neon", schema: "public" }] };
      if (sql.includes("FROM pg_catalog.pg_tables") && sql.includes("tablename = ANY")) {
        return { rows: RESET_TABLES.map((tablename) => ({ tablename })) };
      }
      if (sql.includes("FROM pg_catalog.pg_tables") && sql.includes("tablename = $1")) {
        return { rowCount: 1, rows: [{ "?column?": 1 }] };
      }
      if (sql.includes("FROM information_schema.columns")) {
        return { rows: Object.entries(schemaColumns).flatMap(([table_name, names]) =>
          names.map((column_name) => ({ table_name, column_name }))) };
      }
      if (sql.includes("FROM public.guild_settings")) {
        return { rows: [
          { guild_id: "g1", setting_value: "admin-role" },
          { guild_id: "g2", setting_value: "admin-role-2" }
        ] };
      }
      if (sql.includes(" AS guild_id") && sql.includes(" AS user_id")) return { rows: identityRows };
      if (sql.startsWith("SELECT COUNT(*)")) return { rows: [{ count: "3" }] };
      if (sql.startsWith("DELETE FROM")) {
        const table = sql.match(/public\."([a-z0-9_]+)"/)?.[1];
        if (table === failOnDelete) throw new Error("simulated deletion failure");
        return { rowCount: 3 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push({ sql: "RELEASE" }); }
  };
  return { calls, client, pool: { async connect() { return client; } } };
}

test("reset whitelist covers player, job, inventory and game-progress tables", () => {
  for (const table of [
    "players", "economy_ledger", "inventory", "equipped_items", "cooldowns",
    "event_wallets", "event_claims", "weekly_activity", "daily_chat_rewards",
    "party_game_stats", "achievement_claims", "boss_battles", "heists", "heist_participants"
  ]) assert.ok(RESET_TABLES.includes(table), "missing reset table: " + table);
  for (const table of [
    "guild_settings", "halloween_events", "custom_commands", "audit_logs",
    "security_incidents", "bot_user_restrictions", "leaderboard_exclusions",
    "application_migrations", "server_booster_status", "server_boost_events"
  ]) assert.ok(PRESERVED_TABLES.includes(table), "missing preserved table: " + table);
  assert.equal(RESET_TABLES.some((table) => PRESERVED_TABLES.includes(table)), false);
});

test("confirmation phrase is mandatory for destructive mode", () => {
  assert.equal(parseConfirmation([]), false);
  assert.equal(parseConfirmation(["--confirm", CONFIRMATION]), true);
  assert.throws(() => parseConfirmation(["--confirm"]), /Invalid arguments/);
  assert.throws(() => parseConfirmation(["--confirm", "yes"]), /Invalid arguments/);
});

test("bot owner, each guild owner and configured Admin Role members are protected", async () => {
  const fake = makeFakePool();
  const identities = [
    { guild_id: "g1", user_id: "bot-owner" }, { guild_id: "g1", user_id: "server-owner" },
    { guild_id: "g1", user_id: "role-admin" }, { guild_id: "g1", user_id: "regular" },
    { guild_id: "g2", user_id: "server-owner-2" }, { guild_id: "g2", user_id: "role-admin-2" },
    { guild_id: "g2", user_id: "regular-2" }
  ];
  const protection = await resolveProtectedUsers(fake.client, identities, {
    rest: makeRest(), botOwnerId: "bot-owner", fallbackAdminRoleId: null
  });
  const keys = new Set(protection.users.map((x) => x.guild_id + ":" + x.user_id));
  assert.deepEqual(Array.from(keys).sort(), [
    "g1:bot-owner", "g1:role-admin", "g1:server-owner",
    "g2:role-admin-2", "g2:server-owner-2"
  ]);
});

test("delete plans are scoped by guild and preserve protected heist participants", async () => {
  const fake = makeFakePool();
  const tables = ["players", "inventory", "equipped_items", "heists", "heist_participants"];
  const { plans } = await buildDeletePlans(fake.client, tables);
  const byTable = new Map(plans.map((plan) => [plan.table, plan]));
  for (const table of ["players", "inventory", "equipped_items", "heist_participants"]) {
    assert.match(byTable.get(table).deleteSql, /reset_protected_users/);
    assert.match(byTable.get(table).deleteSql, /NOT EXISTS/);
  }
  assert.match(byTable.get("heists").deleteSql, /reset_protected_users/);
});

test("default run previews eligible rows and never deletes", async () => {
  const fake = makeFakePool();
  const output = [];
  const result = await runReset({
    dbPool: fake.pool, rest: makeRest(), botOwnerId: "bot-owner",
    fallbackAdminRoleId: null,
    logger: { log: (...parts) => output.push(parts.join(" ")), error() {} }
  });
  assert.equal(result.performed, false);
  assert.equal(result.protectedUsers.length, 5);
  assert.ok(fake.calls.some((call) => call.sql.startsWith("SELECT COUNT(*)")));
  assert.equal(fake.calls.some((call) => call.sql.startsWith("DELETE FROM")), false);
  assert.match(output.join("\n"), /DRY RUN/);
  assert.match(output.join("\n"), /Protected accounts: 5/);
});

test("confirmed run locks and deletes only unprotected rows", async () => {
  const fake = makeFakePool();
  const result = await runReset({
    dbPool: fake.pool, rest: makeRest(), botOwnerId: "bot-owner",
    fallbackAdminRoleId: null, confirm: true,
    logger: { log() {}, error() {} }
  });
  const statements = fake.calls.map((call) => call.sql);
  assert.equal(result.performed, true);
  assert.equal(statements[0], "BEGIN");
  const lockIndex = statements.findIndex((sql) => sql.startsWith("LOCK TABLE"));
  const firstDeleteIndex = statements.findIndex((sql) => sql.startsWith("DELETE FROM"));
  const commitIndex = statements.indexOf("COMMIT");
  assert.equal(lockIndex, -1, "reset must not request ACCESS EXCLUSIVE locks that block behind normal bot activity");
  assert.ok(firstDeleteIndex > 0);
  assert.ok(commitIndex > firstDeleteIndex);
  assert.equal(statements.some((sql) => sql.includes("lock_timeout")), false);
  const deletes = statements.filter((sql) => sql.startsWith("DELETE FROM"));
  assert.ok(deletes.length > 0);
  for (const sql of deletes) {
    assert.match(sql, /reset_protected_users/);
    assert.match(sql, /NOT EXISTS/);
  }
  assert.equal(deletes.some((sql) => /DELETE FROM public\."server_booster_status"/.test(sql)), false);
  assert.equal(deletes.some((sql) => /DELETE FROM public\."server_boost_events"/.test(sql)), false);
  assert.equal(statements.includes("ROLLBACK"), false);
});

test("a failed deletion rolls back the entire reset", async () => {
  const fake = makeFakePool({ failOnDelete: "players" });
  await assert.rejects(
    runReset({
      dbPool: fake.pool, rest: makeRest(), botOwnerId: "bot-owner",
      confirm: true, logger: { log() {}, error() {} }
    }),
    /simulated deletion failure/
  );
  const statements = fake.calls.map((call) => call.sql);
  assert.ok(statements.includes("ROLLBACK"));
  assert.equal(statements.includes("COMMIT"), false);
});

test("failure to verify Discord ownership aborts before deletion", async () => {
  const fake = makeFakePool();
  const failingRest = {
    async get(route) {
      if (route === "/guilds/g1") return { owner_id: "server-owner" };
      if (route === "/guilds/g2") throw new Error("permission denied");
      return { roles: [] };
    }
  };
  await assert.rejects(
    runReset({
      dbPool: fake.pool, rest: failingRest, botOwnerId: "bot-owner",
      confirm: true, logger: { log() {}, error() {} }
    }),
    /Could not verify server owner/
  );
  const statements = fake.calls.map((call) => call.sql);
  assert.equal(statements.some((sql) => sql.startsWith("DELETE FROM")), false);
  assert.ok(statements.includes("ROLLBACK"));
});
