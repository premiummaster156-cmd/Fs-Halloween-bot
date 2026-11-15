"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COMBAT_ITEMS,
  STARTER_ITEM_IDS,
  getCombatItem,
  masteryXpForLevel,
  masteryLevelForXp,
  masteryProgress,
  buildCombatStats,
  calculateAttackDamage,
  calculateIncomingDamage
} = require("../src/config/combat-content");

test("combat catalog has unique IDs and valid category, rarity, level and price fields", () => {
  const ids = COMBAT_ITEMS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of COMBAT_ITEMS) {
    assert.ok(item.name);
    assert.ok(["weapon", "fighting_style", "spirit_art", "armor", "accessory", "relic"].includes(item.category));
    assert.ok(["COMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"].includes(item.rarity));
    assert.ok(Number.isInteger(item.minLevel) && item.minLevel >= 1);
    assert.ok(Number.isInteger(item.price) && item.price >= 0);
  }
});

test("starter combat build is supported by the catalog and can be granted idempotently", () => {
  assert.deepEqual(STARTER_ITEM_IDS, [
    "ashen_katana", "iron_fist", "ember_art", "training_vest", "worn_charm"
  ]);
  for (const id of STARTER_ITEM_IDS) assert.ok(getCombatItem(id));
});

test("combat stat calculation combines weapon, style, Spirit Art, armor and accessories", () => {
  const stats = buildCombatStats({
    weapon_id: "ashen_katana",
    style_id: "iron_fist",
    spirit_art_id: "ember_art",
    armor_id: "training_vest",
    accessory_one_id: "worn_charm",
    accessory_two_id: null
  });
  assert.equal(stats.attackBonus, 23);
  assert.equal(stats.defense, 5);
  assert.equal(stats.maxHpBonus, 100);
  assert.equal(stats.damageReduction, 0.02);
  assert.equal(stats.critChance, 0.02);
  assert.equal(stats.damageBonus, 0.04);
});

test("mastery reaches the correct level thresholds and caps at level 50", () => {
  assert.equal(masteryLevelForXp(0), 1);
  assert.equal(masteryLevelForXp(masteryXpForLevel(5)), 5);
  assert.equal(masteryLevelForXp(masteryXpForLevel(20)), 20);
  assert.equal(masteryLevelForXp(99999999), 50);
  assert.equal(masteryProgress(masteryXpForLevel(50)).level, 50);
  assert.equal(masteryProgress(masteryXpForLevel(50)).progress, 1);
});

test("combat damage applies attack, damage bonus and critical modifiers", () => {
  const regular = calculateAttackDamage(10, {
    attackBonus: 23,
    damageBonus: 0.04,
    critChance: 0
  }, 100);
  assert.equal(regular.damage, 127);
  assert.equal(regular.critical, false);

  const critical = calculateAttackDamage(10, {
    attackBonus: 0,
    damageBonus: 0,
    critChance: 1
  }, 100);
  assert.equal(critical.damage, 150);
  assert.equal(critical.critical, true);
});

test("incoming boss damage respects bounded reduction and flat defense", () => {
  assert.equal(calculateIncomingDamage(100, { damageReduction: 0.1, defense: 10 }), 80);
  assert.equal(calculateIncomingDamage(100, { damageReduction: 1, defense: 999 }), 1);
  assert.equal(calculateIncomingDamage(100, { damageReduction: -1, defense: 0 }), 100);
});
