const test = require("node:test");
const assert = require("node:assert/strict");
const balancing = require("../src/config/game-balancing");
const { InventoryService } = require("../src/services/inventory");
const { renderAdmin } = require("../src/commands/dashboard");

function makeInventoryHarness() {
  const inventory = new Map();
  const equipped = new Map();
  const calls = [];
  const client = {
    query: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.includes("SELECT quantity, upgrade_level FROM inventory")) {
        const key = values[1] + ":" + values[2];
        const record = inventory.get(key);
        return {
          rowCount: record ? 1 : 0,
          rows: record ? [{ quantity: record.quantity, upgrade_level: record.upgradeLevel }] : []
        };
      }
      if (sql.includes("INSERT INTO inventory")) {
        const key = values[1] + ":" + values[2];
        const record = inventory.get(key) || { quantity: 0, upgradeLevel: 0 };
        record.quantity = Math.max(record.quantity, 1);
        inventory.set(key, record);
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("SELECT item_id FROM equipped_items")) {
        const previousItemId = equipped.get(values[1] + ":" + values[2]);
        return { rowCount: previousItemId ? 1 : 0, rows: previousItemId ? [{ item_id: previousItemId }] : [] };
      }
      if (sql.includes("INSERT INTO equipped_items")) {
        equipped.set(values[1] + ":" + values[2], values[3]);
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
  const transactionRunner = async (callback) => callback(client);
  return {
    inventory,
    equipped,
    calls,
    service: new InventoryService({}, {}, transactionRunner)
  };
}

test("administrators can grant any of the five Mythic items to any selected member and auto-equip it", async () => {
  const harness = makeInventoryHarness();
  const specialItems = balancing.items.filter((item) => item.boosterOnly).sort((a, b) => a.boostNumber - b.boostNumber);
  assert.equal(specialItems.length, 5);

  for (const userId of ["admin-self", "another-member"]) {
    for (const item of specialItems) {
      const result = await harness.service.grantBoosterItem("guild-1", userId, item.id);
      assert.equal(result.item.id, item.id);
      assert.equal(result.alreadyOwned, false);
      assert.equal(result.autoEquipped, true);
      assert.equal(harness.inventory.get(userId + ":" + item.id).quantity, 1);
      assert.equal(harness.equipped.get(userId + ":" + item.slot), item.id);
    }
  }
});

test("re-granting an owned Mythic item does not duplicate it or erase upgrades", async () => {
  const harness = makeInventoryHarness();
  const item = balancing.items.find((entry) => entry.boosterOnly && entry.boostNumber === 5);
  harness.inventory.set("member-1:" + item.id, { quantity: 1, upgradeLevel: 4 });
  const result = await harness.service.grantBoosterItem("guild-1", "member-1", item.id);

  assert.equal(result.alreadyOwned, true);
  assert.equal(result.upgradeLevel, 4);
  assert.equal(harness.inventory.get("member-1:" + item.id).quantity, 1);
  assert.equal(harness.inventory.get("member-1:" + item.id).upgradeLevel, 4);
  assert.equal(harness.equipped.get("member-1:" + item.slot), item.id);
});

test("administrators cannot use the Mythic grant service to create normal shop items", async () => {
  const harness = makeInventoryHarness();
  const normalItem = balancing.items.find((item) => !item.boosterOnly);
  await assert.rejects(
    harness.service.grantBoosterItem("guild-1", "member-1", normalItem.id),
    (error) => error.code === "INVALID_BOOSTER_ITEM"
  );
});

test("admin panel provides member selection before showing all five Mythic grant options", async () => {
  const { renderAdmin } = require("../src/commands/dashboard");
  const fakeServices = {
    inventory: {
      getInventory: async () => ({ items: [], equipped: [] })
    }
  };
  const chooseMember = await renderAdmin("guild-1", "admin-1", "special-items", fakeServices);
  assert.equal(chooseMember.embeds[0].toJSON().title, "MYTHIC ITEM GRANTS");
  const memberSelect = chooseMember.components
    .flatMap((component) => component.toJSON().components)
    .find((component) => component.custom_id === "admin:admin-1:special-item-target");
  assert.ok(memberSelect);

  const chooseItem = await renderAdmin("guild-1", "admin-1", "special-items", fakeServices, "member-2");
  assert.equal(chooseItem.embeds[0].toJSON().title, "GRANT MYTHIC ITEM");
  const itemMenu = chooseItem.components
    .flatMap((component) => component.toJSON().components)
    .find((component) => component.custom_id === "admin:admin-1:special-item-grant:member-2");
  assert.ok(itemMenu);
  assert.deepEqual(itemMenu.options.map((option) => option.value),
    balancing.items.filter((item) => item.boosterOnly).sort((a, b) => a.boostNumber - b.boostNumber).map((item) => item.id));
});
