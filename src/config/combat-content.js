"use strict";

const COMBAT_ITEMS = Object.freeze([
  // Weapons
  { id: "ashen_katana", name: "Ashen Katana", category: "weapon", slot: "weapon_id", rarity: "COMMON", minLevel: 1, price: 0, attack: 12, critChance: 0.02, description: "A balanced blade for new Rift challengers." },
  { id: "tempest_twinblades", name: "Tempest Twinblades", category: "weapon", slot: "weapon_id", rarity: "RARE", minLevel: 15, price: 22000, attack: 19, critChance: 0.06, description: "Twin blades built for quick, accurate strikes." },
  { id: "frostfang_saber", name: "Frostfang Saber", category: "weapon", slot: "weapon_id", rarity: "EPIC", minLevel: 30, price: 48000, attack: 27, critChance: 0.05, description: "A cold-forged saber with a precise cutting edge." },
  { id: "oni_breaker", name: "Oni Breaker", category: "weapon", slot: "weapon_id", rarity: "LEGENDARY", minLevel: 60, price: 98000, attack: 38, critChance: 0.03, description: "A heavy blade designed to break a boss's guard." },
  { id: "riftcleaver", name: "Riftcleaver", category: "weapon", slot: "weapon_id", rarity: "MYTHIC", minLevel: 100, price: 220000, attack: 52, critChance: 0.08, description: "A weapon tempered in the unstable heart of the Rift." },

  // Fighting styles
  { id: "iron_fist", name: "Iron Fist", category: "fighting_style", slot: "style_id", rarity: "COMMON", minLevel: 1, price: 0, attack: 6, defenseReduction: 0.02, description: "A dependable close-combat style with balanced offense and defense." },
  { id: "stormstep", name: "Stormstep", category: "fighting_style", slot: "style_id", rarity: "RARE", minLevel: 20, price: 36000, attack: 9, critChance: 0.03, description: "A fast style focused on footwork and decisive openings." },
  { id: "ember_flow", name: "Ember Flow", category: "fighting_style", slot: "style_id", rarity: "EPIC", minLevel: 35, price: 62000, attack: 8, damageBonus: 0.06, description: "A flowing style that keeps pressure on a single target." },
  { id: "warden_technique", name: "Warden Technique", category: "fighting_style", slot: "style_id", rarity: "LEGENDARY", minLevel: 60, price: 105000, attack: 5, defenseReduction: 0.08, maxHp: 90, description: "A defensive discipline developed by Rift guardians." },

  // Spirit Arts
  { id: "ember_art", name: "Ember Spirit Art", category: "spirit_art", slot: "spirit_art_id", rarity: "COMMON", minLevel: 1, price: 0, attack: 3, damageBonus: 0.04, description: "A small ember spirit reinforces every strike." },
  { id: "frost_art", name: "Frost Spirit Art", category: "spirit_art", slot: "spirit_art_id", rarity: "RARE", minLevel: 15, price: 28000, attack: 4, defenseReduction: 0.04, maxHp: 35, description: "Frost energy favors patience and survivability." },
  { id: "storm_art", name: "Storm Spirit Art", category: "spirit_art", slot: "spirit_art_id", rarity: "EPIC", minLevel: 35, price: 65000, attack: 5, critChance: 0.05, damageBonus: 0.03, description: "Storm energy sharpens critical strikes." },
  { id: "void_art", name: "Void Spirit Art", category: "spirit_art", slot: "spirit_art_id", rarity: "LEGENDARY", minLevel: 70, price: 125000, attack: 9, critChance: 0.03, damageBonus: 0.06, description: "Void energy amplifies attacks against powerful enemies." },

  // Armor
  { id: "training_vest", name: "Training Vest", category: "armor", slot: "armor_id", rarity: "COMMON", minLevel: 1, price: 0, defense: 5, maxHp: 70, description: "Basic protection for a first trip into the Rift." },
  { id: "ashen_mail", name: "Ashen Mail", category: "armor", slot: "armor_id", rarity: "RARE", minLevel: 12, price: 24000, defense: 10, maxHp: 145, description: "Light armor reinforced with heat-treated plates." },
  { id: "warden_plate", name: "Warden Plate", category: "armor", slot: "armor_id", rarity: "EPIC", minLevel: 40, price: 72000, defense: 19, maxHp: 250, defenseReduction: 0.03, description: "Heavy armor recovered from a Rift Warden forge." },
  { id: "dragon_scale", name: "Dragon Scale Armor", category: "armor", slot: "armor_id", rarity: "MYTHIC", minLevel: 85, price: 165000, defense: 28, maxHp: 390, defenseReduction: 0.05, description: "A rare suit layered with scales from an ancient dragon." },

  // Accessories (two slots)
  { id: "worn_charm", name: "Worn Charm", category: "accessory", slot: "accessory", rarity: "COMMON", minLevel: 1, price: 0, attack: 2, maxHp: 30, description: "A small charm with a modest protective effect." },
  { id: "focus_talisman", name: "Focus Talisman", category: "accessory", slot: "accessory", rarity: "RARE", minLevel: 20, price: 34000, attack: 3, critChance: 0.04, description: "A talisman that steadies aim and sharpens timing." },
  { id: "guardian_seal", name: "Guardian Seal", category: "accessory", slot: "accessory", rarity: "EPIC", minLevel: 35, price: 52000, defense: 5, maxHp: 95, defenseReduction: 0.02, description: "A seal that strengthens its wearer against boss strikes." },
  { id: "rift_heart", name: "Rift Heart", category: "accessory", slot: "accessory", rarity: "LEGENDARY", minLevel: 75, price: 140000, attack: 7, maxHp: 120, damageBonus: 0.03, description: "A contained Rift fragment that increases combat output." },

  // Relics
  { id: "mistwood_token", name: "Mistwood Token", category: "relic", slot: "relic_id", rarity: "RARE", minLevel: 25, price: 42000, maxHp: 80, defense: 3, description: "An old token that steadies its bearer in the Mistwood." },
  { id: "emberglass_core", name: "Emberglass Core", category: "relic", slot: "relic_id", rarity: "EPIC", minLevel: 55, price: 92000, attack: 10, damageBonus: 0.04, description: "A warm core that stores and releases focused energy." },
  { id: "hollow_crown", name: "Hollow Crown", category: "relic", slot: "relic_id", rarity: "LEGENDARY", minLevel: 90, price: 180000, attack: 12, maxHp: 170, defenseReduction: 0.04, description: "A relic recovered from the deepest Hollow Sea shrine." }
]);

const STARTER_ITEM_IDS = Object.freeze([
  "ashen_katana",
  "iron_fist",
  "ember_art",
  "training_vest",
  "worn_charm"
]);

const CATEGORY_LABELS = Object.freeze({
  weapon: "Weapon",
  fighting_style: "Fighting Style",
  spirit_art: "Spirit Art",
  armor: "Armor",
  accessory: "Accessory",
  relic: "Relic"
});

const ITEM_BY_ID = new Map(COMBAT_ITEMS.map((item) => [item.id, item]));

function getCombatItem(itemId) {
  return ITEM_BY_ID.get(String(itemId)) || null;
}

function masteryXpForLevel(level) {
  const safeLevel = Math.max(1, Math.min(50, Math.floor(Number(level) || 1)));
  return (safeLevel - 1) * (safeLevel - 1) * 25;
}

function masteryLevelForXp(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  return Math.min(50, Math.floor(Math.sqrt(safeXp / 25)) + 1);
}

function masteryProgress(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  const level = masteryLevelForXp(safeXp);
  if (level >= 50) return { level, xp: safeXp, currentLevelXp: masteryXpForLevel(level), nextLevelXp: null, progress: 1 };
  const currentLevelXp = masteryXpForLevel(level);
  const nextLevelXp = masteryXpForLevel(level + 1);
  return {
    level,
    xp: safeXp,
    currentLevelXp,
    nextLevelXp,
    progress: Math.max(0, Math.min(1, (safeXp - currentLevelXp) / (nextLevelXp - currentLevelXp)))
  };
}

function buildCombatStats(loadout, masteryByTrack = {}) {
  const selected = [
    loadout.weapon_id,
    loadout.style_id,
    loadout.spirit_art_id,
    loadout.armor_id,
    loadout.accessory_one_id,
    loadout.accessory_two_id,
    loadout.relic_id
  ].filter(Boolean).map(getCombatItem).filter(Boolean);

  const weapon = getCombatItem(loadout.weapon_id);
  const style = getCombatItem(loadout.style_id);
  const spiritArt = getCombatItem(loadout.spirit_art_id);
  const weaponMastery = masteryProgress(masteryByTrack["weapon:" + (weapon?.id || "")] || 0);
  const styleMastery = masteryProgress(masteryByTrack["fighting_style:" + (style?.id || "")] || 0);
  const artMastery = masteryProgress(masteryByTrack["spirit_art:" + (spiritArt?.id || "")] || 0);

  const sum = (key) => selected.reduce((total, item) => total + Number(item[key] || 0), 0);
  const attackBonus = sum("attack") +
    Math.floor(weaponMastery.level / 5) +
    Math.floor(styleMastery.level / 10) * 2;
  const defense = sum("defense");
  const maxHpBonus = sum("maxHp");
  const damageReduction = Math.min(0.35,
    sum("defenseReduction") + Math.floor(styleMastery.level / 10) * 0.005
  );
  const critChance = Math.min(0.35,
    sum("critChance") + Math.floor(weaponMastery.level / 10) * 0.005
  );
  const damageBonus = Math.min(0.35,
    sum("damageBonus") + Math.floor(artMastery.level / 10) * 0.01
  );

  return {
    weaponId: weapon?.id || "ashen_katana",
    styleId: style?.id || "iron_fist",
    spiritArtId: spiritArt?.id || "ember_art",
    armorId: getCombatItem(loadout.armor_id)?.id || "training_vest",
    relicId: getCombatItem(loadout.relic_id)?.id || null,
    accessoryIds: [loadout.accessory_one_id, loadout.accessory_two_id].filter(Boolean),
    attackBonus,
    defense,
    maxHpBonus,
    damageReduction,
    critChance,
    damageBonus,
    weaponMastery,
    styleMastery,
    artMastery
  };
}

function calculateAttackDamage(level, stats, randomDamage) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const raw = Math.max(1, Math.floor(Number(randomDamage) || 1));
  let damage = Math.floor((raw + Number(stats?.attackBonus || 0)) * (1 + Number(stats?.damageBonus || 0)));
  const isCritical = Number(stats?.critChance || 0) > 0 && Math.random() < Number(stats.critChance);
  if (isCritical) damage = Math.floor(damage * 1.5);
  return { damage: Math.max(1, damage), critical: isCritical, level: safeLevel };
}

function calculateIncomingDamage(rawDamage, stats) {
  const damage = Math.max(1, Math.floor(Number(rawDamage) || 1));
  const reduction = Math.max(0, Math.min(0.35, Number(stats?.damageReduction || 0)));
  const defense = Math.max(0, Number(stats?.defense || 0));
  return Math.max(1, Math.floor(damage * (1 - reduction) - defense));
}

module.exports = {
  COMBAT_ITEMS,
  STARTER_ITEM_IDS,
  CATEGORY_LABELS,
  getCombatItem,
  masteryXpForLevel,
  masteryLevelForXp,
  masteryProgress,
  buildCombatStats,
  calculateAttackDamage,
  calculateIncomingDamage
};
