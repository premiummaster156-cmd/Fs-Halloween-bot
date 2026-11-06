const test = require("node:test");
const assert = require("node:assert/strict");
const balancing = require("../src/config/game-balancing");
const {
  ServerBoosterService,
  isActiveBooster,
  applyBoosterEventReward,
  GUILD_BOOST_MESSAGE_TYPE
} = require("../src/services/server-boosters");
const { InventoryService, getUpgradeCost } = require("../src/services/inventory");

function makeBoosterPool(options = {}) {
  const events = new Set();
  const inventory = new Set();
  const equipped = new Set();
  const state = { personalBoostCount: 0, active: false, serverBoostCount: 0 };
  const pool = {
    state, events, inventory, equipped,
    query: async (sql, values = []) => {
      if (sql.includes("INSERT INTO server_boost_events")) {
        const key = values[0] + ":" + values[2];
        if (events.has(key)) return { rowCount: 0, rows: [] };
        events.add(key);
        return { rowCount: 1, rows: [{ message_id: values[2] }] };
      }
      if (sql.includes("INSERT INTO server_booster_status") && sql.includes("personal_boost_count = server_booster_status.personal_boost_count + 1")) {
        state.active = true;
        state.serverBoostCount = Number(values[2]) || 0;
        state.personalBoostCount += 1;
        return { rowCount: 1, rows: [{ personal_boost_count: state.personalBoostCount }] };
      }
      if (sql.includes("INSERT INTO server_booster_status") && sql.includes("personal_boost_count")) {
        state.active = true;
        state.serverBoostCount = Number(values[2]) || 0;
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("SELECT personal_boost_count FROM server_booster_status")) {
        return { rowCount: 1, rows: [{ personal_boost_count: state.personalBoostCount }] };
      }
      if (sql.includes("UPDATE server_booster_status SET personal_boost_count = 1")) {
        if (state.personalBoostCount !== 0) return { rowCount: 0, rows: [] };
        state.personalBoostCount = 1;
        return { rowCount: 1, rows: [{ personal_boost_count: 1 }] };
      }
      if (sql.includes("INSERT INTO server_booster_status")) {
        state.active = true;
        state.serverBoostCount = Number(values[2]) || 0;
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("UPDATE server_boost_events SET boost_number")) {
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("INSERT INTO inventory")) {
        inventory.add(values[2]);
        return { rowCount: 1, rows: [{ user_id: values[1] }] };
      }
      if (sql.includes("INSERT INTO equipped_items")) {
        equipped.add(values[3]);
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("UPDATE server_booster_status SET is_active = FALSE")) {
        state.active = false;
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("UPDATE server_booster_status SET server_boost_count")) {
        state.serverBoostCount = Number(values[1]) || 0;
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("SELECT is_active, server_boost_count, personal_boost_count")) {
        return { rowCount: 1, rows: [{
          is_active: state.active,
          server_boost_count: state.serverBoostCount,
          personal_boost_count: state.personalBoostCount
        }] };
      }
      if (sql.includes("SELECT item_id FROM inventory")) {
        return { rowCount: inventory.size, rows: [...inventory].map((item_id) => ({ item_id })) };
      }
      if (sql.includes("SELECT is_active FROM server_booster_status")) {
        return { rowCount: 1, rows: [{ is_active: state.active }] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
  const transactionRunner = async (callback) => callback(pool);
  return { pool, service: new ServerBoosterService(pool, transactionRunner, options) };
}

test("active boosters receive 15% extra Halloween Candy and event points", () => {
  assert.equal(applyBoosterEventReward(75, true), 86);
  assert.equal(applyBoosterEventReward(10, true), 11);
  assert.equal(applyBoosterEventReward(75, false), 75);
  assert.equal(applyBoosterEventReward(-10, true), 0);
});

test("booster status is read from the server-scoped member record", async () => {
  const queryable = {
    query: async (sql, values) => {
      assert.match(sql, /WHERE guild_id = \$1 AND user_id = \$2/);
      assert.deepEqual(values, ["guild-1", "member-1"]);
      return { rowCount: 1, rows: [{ is_active: true }] };
    }
  };
  assert.equal(await isActiveBooster(queryable, "guild-1", "member-1"), true);
});

test("each personal Discord boost message awards the matching special item automatically", async () => {
  const { pool, service } = makeBoosterPool();
  const expected = balancing.items.filter((item) => item.boosterOnly).sort((a, b) => a.boostNumber - b.boostNumber);
  assert.equal(expected.length, 5);

  for (let boostNumber = 1; boostNumber <= 5; boostNumber += 1) {
    const result = await service.recordBoostMessage({
      type: GUILD_BOOST_MESSAGE_TYPE,
      id: "boost-message-" + boostNumber,
      guildId: "guild-1",
      author: { id: "member-1" },
      guild: { id: "guild-1", premiumSubscriptionCount: boostNumber }
    });
    assert.equal(result.recorded, true);
    assert.equal(result.personalBoostCount, boostNumber);
    assert.equal(result.item.id, expected[boostNumber - 1].id);
    assert.equal(result.granted, true);
    assert.equal(result.autoEquipped, true);
    assert.ok(pool.inventory.has(expected[boostNumber - 1].id));
    assert.ok(pool.equipped.has(expected[boostNumber - 1].id));
  }
});

test("the sixth personal boost does not invent a sixth item and duplicate messages never double grant", async () => {
  const { pool, service } = makeBoosterPool();
  const message = {
    type: GUILD_BOOST_MESSAGE_TYPE,
    id: "same-message",
    guildId: "guild-1",
    author: { id: "member-1" },
    guild: { id: "guild-1", premiumSubscriptionCount: 2 }
  };
  const first = await service.recordBoostMessage(message);
  const duplicate = await service.recordBoostMessage(message);
  assert.equal(first.item.id, "booster_crimson_katana");
  assert.equal(duplicate.duplicate, true);
  assert.equal(pool.state.personalBoostCount, 1);
  assert.equal(pool.inventory.size, 1);

  for (let i = 2; i <= 5; i += 1) {
    await service.recordBoostMessage({ ...message, id: "message-" + i });
  }
  const sixth = await service.recordBoostMessage({ ...message, id: "message-6" });
  assert.equal(sixth.personalBoostCount, 6);
  assert.equal(sixth.item, null);
  assert.equal(sixth.collectionComplete, true);
  assert.equal(pool.inventory.size, 5);
});

test("existing active boosters are backfilled with the first special item exactly once", async () => {
  const { pool, service } = makeBoosterPool();
  const member = { id: "member-1", premiumSince: new Date("2025-11-05T10:00:00Z") };
  const guild = { id: "guild-1", premiumSubscriptionCount: 25 };
  const first = await service.syncMember(member, guild);
  assert.equal(first.active, true);
  assert.equal(first.serverBoostCount, 25);
  assert.equal(first.reward.item.id, "booster_crimson_katana");
  assert.equal(first.reward.personalBoostCount, 1);
  assert.deepEqual(first.granted.map((item) => item.id), ["booster_crimson_katana"]);
  assert.equal(pool.state.personalBoostCount, 1);
  assert.ok(pool.inventory.has("booster_crimson_katana"));
  assert.ok(pool.equipped.has("booster_crimson_katana"));

  service.memberSyncAt.clear();
  const second = await service.syncMember(member, guild);
  assert.equal(second.reward, null);
  assert.equal(pool.state.personalBoostCount, 1);
  assert.equal(pool.inventory.size, 1);
});

test("the configured Booster Role ID activates existing members and backfills only item one", async () => {
  const { pool, service } = makeBoosterPool({ boosterRoleId: "1376299577581240410" });
  const member = {
    id: "member-1",
    roles: { cache: new Map([["1376299577581240410", { id: "1376299577581240410" }]]) }
  };
  const result = await service.syncMember(member, { id: "guild-1", premiumSubscriptionCount: 25 });
  assert.equal(result.active, true);
  assert.equal(result.reward.item.id, "booster_crimson_katana");
  assert.equal(pool.state.personalBoostCount, 1);
  assert.ok(pool.inventory.has("booster_crimson_katana"));
});

test("members who stop boosting lose passive status but keep their earned special items", async () => {
  const { pool, service } = makeBoosterPool();
  await service.recordBoostMessage({
    type: GUILD_BOOST_MESSAGE_TYPE,
    id: "boost-message-1",
    guildId: "guild-1",
    author: { id: "member-1" },
    guild: { id: "guild-1", premiumSubscriptionCount: 1 }
  });
  const before = pool.inventory.size;
  const result = await service.syncMember(
    { id: "member-1", premiumSince: null },
    { id: "guild-1", premiumSubscriptionCount: 0 }
  );
  assert.equal(result.active, false);
  assert.equal(pool.state.active, false);
  assert.equal(pool.inventory.size, before);
  assert.ok(pool.inventory.has("booster_crimson_katana"));
});

test("booster-only equipment is hidden from the FC shop and cannot be purchased", async () => {
  const inventory = new InventoryService({}, {});
  const listedIds = inventory.listShop().map((item) => item.id);
  for (const item of balancing.items.filter((entry) => entry.boosterOnly)) {
    assert.ok(!listedIds.includes(item.id));
    await assert.rejects(
      inventory.buy("guild-1", "member-1", item.id),
      (error) => error.code === "ITEM_NOT_IN_SHOP"
    );
  }
});

test("all five special items can be upgraded using normal FC upgrade prices", () => {
  const special = balancing.items.filter((item) => item.boosterOnly);
  assert.equal(special.length, 5);
  for (const item of special) {
    assert.ok(item.cost > 0, item.name + " must have a non-zero upgrade price base");
    assert.equal(item.type, "equipment");
    assert.ok(item.boostNumber >= 1 && item.boostNumber <= 5);
    assert.ok(getUpgradeCost(item, 1) > 0);
    assert.equal(item.rebirthEligible, false);
    assert.ok(Object.keys(item.effects).length >= 4);
  }
});

test("booster status reports personal progress and the next item, not just server totals", async () => {
  const { service } = makeBoosterPool();
  const first = await service.recordBoostMessage({
    type: GUILD_BOOST_MESSAGE_TYPE,
    id: "boost-message-1",
    guildId: "guild-1",
    author: { id: "member-1" },
    guild: { id: "guild-1", premiumSubscriptionCount: 9 }
  });
  assert.equal(first.personalBoostCount, 1);
  const status = await service.getStatus("guild-1", "member-1");
  assert.equal(status.personalBoostCount, 1);
  assert.equal(status.serverBoostCount, 9);
  assert.equal(status.nextItem.id, "booster_phantom_mask");
  assert.deepEqual(status.unlockedItems.map((item) => item.id), ["booster_crimson_katana"]);
});

test("active boosters receive the existing passive effects through gear aggregation", async () => {
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
});
