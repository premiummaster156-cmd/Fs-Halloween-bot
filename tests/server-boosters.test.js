const test = require("node:test");
const assert = require("node:assert/strict");
const balancing = require("../src/config/game-balancing");
const { ServerBoosterService, isActiveBooster } = require("../src/services/server-boosters");
const { InventoryService } = require("../src/services/inventory");

test("booster status is read from the server-scoped member record", async () => {
  const calls = [];
  const queryable = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rowCount: 1, rows: [{ is_active: true }] };
    }
  };
  assert.equal(await isActiveBooster(queryable, "guild-1", "member-1"), true);
  assert.deepEqual(calls[0].values, ["guild-1", "member-1"]);
});

test("syncMember detects an active Discord booster and grants eligible tiers", async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO inventory")) return { rowCount: 1, rows: [{ user_id: "member-1" }] };
      return { rowCount: 1, rows: [] };
    }
  };
  const service = new ServerBoosterService(pool);
  const member = { id: "member-1", premiumSince: new Date("2026-11-05T10:00:00Z") };
  const result = await service.syncMember(member, { id: "guild-1", premiumSubscriptionCount: 2 });
  assert.equal(result.active, true);
  assert.equal(result.serverBoostCount, 2);
  assert.deepEqual(result.granted.map((entry) => entry.item.id), [
    "booster_crimson_katana",
    "booster_phantom_mask"
  ]);
  assert.equal(calls[0].values[0], "guild-1");
  assert.equal(calls[0].values[1], "member-1");
});

test("one server boost awards the Crimson Oni Katana to active boosters only", async () => {
  const calls = [];
  const pool = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("INSERT INTO inventory")) {
        return { rowCount: 1, rows: [{ user_id: "member-1" }] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
  const service = new ServerBoosterService(pool);
  const granted = await service.syncGuild("guild-1", 1);
  assert.equal(granted.length, 1);
  assert.equal(granted[0].userId, "member-1");
  assert.equal(granted[0].item.id, "booster_crimson_katana");
  assert.ok(calls.some((call) => call.sql.includes("SET server_boost_count")));
  assert.ok(calls.some((call) => call.values?.includes("booster_crimson_katana")));
  assert.ok(!calls.some((call) => call.values?.includes("booster_phantom_mask")));
});

test("two server boosts unlock both exclusive items for active boosters", async () => {
  const grantedRows = [];
  const pool = {
    query: async (sql, values) => {
      if (sql.includes("INSERT INTO inventory")) {
        grantedRows.push(values[1]);
        return { rowCount: 1, rows: [{ user_id: "member-1" }] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
  const service = new ServerBoosterService(pool);
  const granted = await service.syncGuild("guild-1", 2);
  assert.deepEqual(granted.map((entry) => entry.item.id), [
    "booster_crimson_katana",
    "booster_phantom_mask"
  ]);
  assert.deepEqual(grantedRows, ["booster_crimson_katana", "booster_phantom_mask"]);
});

test("booster-only equipment is absent from the FC shop and cannot be purchased", async () => {
  const inventory = new InventoryService({}, {});
  const listedIds = inventory.listShop().map((item) => item.id);
  assert.ok(!listedIds.includes("booster_crimson_katana"));
  assert.ok(!listedIds.includes("booster_phantom_mask"));
  await assert.rejects(
    inventory.buy("guild-1", "member-1", "booster_crimson_katana"),
    (error) => error.code === "ITEM_NOT_IN_SHOP"
  );
});

test("active boosters receive the passive effects in equipment aggregation", async () => {
  const pool = {
    query: async (sql) => {
      if (sql.includes("SELECT e.item_id")) return { rowCount: 0, rows: [] };
      if (sql.includes("SELECT is_active")) return { rowCount: 1, rows: [{ is_active: true }] };
      throw new Error("Unexpected query");
    }
  };
  const inventory = new InventoryService(pool, {});
  const effects = await inventory.getEffects("guild-1", "member-1");
  assert.equal(effects.moneyBonus, balancing.serverBoosterEffects.moneyBonus);
  assert.equal(effects.xpBonus, balancing.serverBoosterEffects.xpBonus);
  assert.equal(effects.workPayBonus, balancing.serverBoosterEffects.workPayBonus);
  assert.equal(effects.candyDropBonus, balancing.serverBoosterEffects.candyDropBonus);
  assert.equal(effects.partyPointsBonus, 0);
});
