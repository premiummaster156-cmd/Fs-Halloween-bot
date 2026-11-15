"use strict";

const {
  COMBAT_ITEMS,
  STARTER_ITEM_IDS,
  CATEGORY_LABELS,
  getCombatItem,
  masteryProgress,
  buildCombatStats
} = require("../config/combat-content");
const { ensurePlayerTx } = require("./economy");
const { DomainError, uuid } = require("../utils/core");
const { transaction } = require("../database/pool");

const STARTER_LOADOUT = Object.freeze({
  weapon_id: "ashen_katana",
  style_id: "iron_fist",
  spirit_art_id: "ember_art",
  armor_id: "training_vest",
  accessory_one_id: "worn_charm",
  accessory_two_id: null,
  relic_id: null
});
const MASTERY_XP_CAP = 60025;
const MASTERY_TRACKS = Object.freeze([
  { type: "weapon", category: "weapon", key: "weaponId" },
  { type: "fighting_style", category: "fighting_style", key: "styleId" },
  { type: "spirit_art", category: "spirit_art", key: "spiritArtId" }
]);

class CombatService {
  constructor(pool, economy, transactionRunner = transaction) {
    this.pool = pool;
    this.economy = economy;
    this.transactionRunner = transactionRunner;
  }

  async ensureProfileTx(client, guildId, userId) {
    await ensurePlayerTx(client, guildId, userId);
    await client.query(
      "INSERT INTO combat_loadouts (guild_id, user_id, weapon_id, style_id, spirit_art_id, armor_id, accessory_one_id, accessory_two_id, relic_id) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (guild_id, user_id) DO NOTHING",
      [guildId, userId, STARTER_LOADOUT.weapon_id, STARTER_LOADOUT.style_id,
        STARTER_LOADOUT.spirit_art_id, STARTER_LOADOUT.armor_id,
        STARTER_LOADOUT.accessory_one_id, STARTER_LOADOUT.accessory_two_id, STARTER_LOADOUT.relic_id]
    );
    for (const itemId of STARTER_ITEM_IDS) {
      await client.query(
        "INSERT INTO combat_inventory (guild_id, user_id, item_id) VALUES ($1, $2, $3) ON CONFLICT (guild_id, user_id, item_id) DO NOTHING",
        [guildId, userId, itemId]
      );
    }
  }

  async getProfile(guildId, userId) {
    return this.transactionRunner(async (client) => {
      await this.ensureProfileTx(client, guildId, userId);
      const player = await client.query(
        "SELECT level, wallet FROM players WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId]
      );
      const loadoutResult = await client.query(
        "SELECT weapon_id, style_id, spirit_art_id, armor_id, accessory_one_id, accessory_two_id, relic_id " +
        "FROM combat_loadouts WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId]
      );
      const ownedResult = await client.query(
        "SELECT item_id, acquired_at FROM combat_inventory WHERE guild_id = $1 AND user_id = $2 ORDER BY acquired_at, item_id",
        [guildId, userId]
      );
      const masteryResult = await client.query(
        "SELECT track_type, track_id, mastery_xp FROM combat_mastery WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId]
      );
      const loadout = loadoutResult.rows[0] || { ...STARTER_LOADOUT };
      const masteryByTrack = Object.fromEntries(masteryResult.rows.map((row) => [
        row.track_type + ":" + row.track_id,
        Number(row.mastery_xp) || 0
      ]));
      const ownedIds = new Set(ownedResult.rows.map((row) => row.item_id));
      const stats = buildCombatStats(loadout, masteryByTrack);
      const equippedIds = new Set(Object.values(loadout).filter(Boolean));
      return {
        playerLevel: Number(player.rows[0]?.level) || 1,
        wallet: Number(player.rows[0]?.wallet) || 0,
        loadout,
        stats,
        masteryByTrack,
        ownedItems: Array.from(ownedIds).map(getCombatItem).filter(Boolean),
        shopItems: COMBAT_ITEMS.filter((item) => !ownedIds.has(item.id)),
        itemCatalog: COMBAT_ITEMS,
        equippedIds,
        mastery: {
          weapon: masteryProgress(masteryByTrack["weapon:" + stats.weaponId] || 0),
          fightingStyle: masteryProgress(masteryByTrack["fighting_style:" + stats.styleId] || 0),
          spiritArt: masteryProgress(masteryByTrack["spirit_art:" + stats.spiritArtId] || 0)
        }
      };
    });
  }

  async purchase(guildId, userId, itemId) {
    const item = getCombatItem(itemId);
    if (!item) throw new DomainError("That combat item is not available.", "COMBAT_ITEM_INVALID");
    return this.transactionRunner(async (client) => {
      await this.ensureProfileTx(client, guildId, userId);
      const playerResult = await client.query(
        "SELECT level, wallet FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      const player = playerResult.rows[0];
      if (Number(player.level) < item.minLevel) {
        throw new DomainError("You need player level " + item.minLevel + " to unlock " + item.name + ".", "COMBAT_LEVEL_REQUIRED");
      }
      const existing = await client.query(
        "SELECT item_id FROM combat_inventory WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 FOR UPDATE",
        [guildId, userId, item.id]
      );
      if (existing.rowCount) {
        throw new DomainError("You already own " + item.name + ".", "COMBAT_ITEM_ALREADY_OWNED");
      }
      const price = Math.max(0, Math.floor(Number(item.price) || 0));
      if (Number(player.wallet) < price) {
        throw new DomainError("You need " + price.toLocaleString() + " FC to purchase " + item.name + ".", "COMBAT_NOT_ENOUGH_FC");
      }
      if (price > 0) {
        await this.economy.mutateTx(client, guildId, userId, -price, "combat_purchase", uuid(), {
          itemId: item.id, category: item.category
        });
      }
      await client.query(
        "INSERT INTO combat_inventory (guild_id, user_id, item_id) VALUES ($1, $2, $3)",
        [guildId, userId, item.id]
      );
      return { item, price, walletRemaining: Number(player.wallet) - price };
    });
  }

  async equip(guildId, userId, itemId, accessorySlot = null) {
    const item = getCombatItem(itemId);
    if (!item) throw new DomainError("That combat item is not available.", "COMBAT_ITEM_INVALID");
    return this.transactionRunner(async (client) => {
      await this.ensureProfileTx(client, guildId, userId);
      const activeBattle = await client.query(
        "SELECT id FROM boss_battles WHERE guild_id = $1 AND user_id = $2 AND status = 'active' LIMIT 1 FOR UPDATE",
        [guildId, userId]
      );
      if (activeBattle.rowCount) {
        throw new DomainError("Finish or retreat from your current Rift battle before changing your combat loadout.", "COMBAT_LOADOUT_LOCKED");
      }
      const owned = await client.query(
        "SELECT item_id FROM combat_inventory WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 FOR UPDATE",
        [guildId, userId, item.id]
      );
      if (!owned.rowCount) {
        throw new DomainError("You must own " + item.name + " before equipping it.", "COMBAT_ITEM_NOT_OWNED");
      }

      let column = item.slot;
      if (item.category === "accessory") {
        const validAccessorySlots = new Set(["accessory_one_id", "accessory_two_id"]);
        if (accessorySlot && !validAccessorySlots.has(accessorySlot)) {
          throw new DomainError("Choose a valid accessory slot.", "COMBAT_ACCESSORY_SLOT_INVALID");
        }
        const current = await client.query(
          "SELECT accessory_one_id, accessory_two_id FROM combat_loadouts WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
          [guildId, userId]
        );
        const row = current.rows[0];
        if (row.accessory_one_id === item.id || row.accessory_two_id === item.id) {
          throw new DomainError(item.name + " is already equipped.", "COMBAT_ITEM_ALREADY_EQUIPPED");
        }
        column = accessorySlot || (!row.accessory_one_id ? "accessory_one_id" : !row.accessory_two_id ? "accessory_two_id" : null);
        if (!column) {
          throw new DomainError("Both accessory slots are occupied. Choose which slot to replace.", "COMBAT_ACCESSORY_SLOTS_FULL");
        }
      }
      const allowedColumns = new Set(["weapon_id", "style_id", "spirit_art_id", "armor_id", "accessory_one_id", "accessory_two_id", "relic_id"]);
      if (!allowedColumns.has(column)) {
        throw new DomainError("That item cannot be equipped in a combat slot.", "COMBAT_SLOT_INVALID");
      }
      const current = await client.query(
        "SELECT " + column + " AS equipped_id FROM combat_loadouts WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      if (current.rows[0]?.equipped_id === item.id) {
        throw new DomainError(item.name + " is already equipped.", "COMBAT_ITEM_ALREADY_EQUIPPED");
      }
      const previousItem = current.rows[0]?.equipped_id || null;
      await client.query(
        "UPDATE combat_loadouts SET " + column + " = $3, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId, item.id]
      );
      return { item, slot: column, previousItem: getCombatItem(previousItem) };
    });
  }

  async awardMasteryTx(client, guildId, userId, combatSnapshot, amount = 10) {
    if (!combatSnapshot || typeof combatSnapshot !== "object") return [];
    const gained = Math.max(1, Math.min(100, Math.floor(Number(amount) || 1)));
    const results = [];
    for (const track of MASTERY_TRACKS) {
      const trackId = combatSnapshot[track.key];
      const item = getCombatItem(trackId);
      if (!item || item.category !== track.category) continue;
      const result = await client.query(
        "INSERT INTO combat_mastery (guild_id, user_id, track_type, track_id, mastery_xp) " +
        "VALUES ($1, $2, $3, $4, $5) " +
        "ON CONFLICT (guild_id, user_id, track_type, track_id) DO UPDATE SET " +
        "mastery_xp = LEAST($6, combat_mastery.mastery_xp + EXCLUDED.mastery_xp), updated_at = NOW() " +
        "RETURNING mastery_xp",
        [guildId, userId, track.type, item.id, gained, MASTERY_XP_CAP]
      );
      results.push({
        trackType: track.type,
        trackId: item.id,
        itemName: item.name,
        gained,
        mastery: masteryProgress(Number(result.rows[0].mastery_xp))
      });
    }
    return results;
  }

  async getMastery(guildId, userId) {
    const result = await this.pool.query(
      "SELECT track_type, track_id, mastery_xp FROM combat_mastery WHERE guild_id = $1 AND user_id = $2 ORDER BY track_type, track_id",
      [guildId, userId]
    );
    return result.rows.map((row) => {
      const item = getCombatItem(row.track_id);
      return {
        trackType: row.track_type,
        trackId: row.track_id,
        itemName: item?.name || row.track_id,
        categoryLabel: CATEGORY_LABELS[MASTERY_TRACKS.find((x) => x.type === row.track_type)?.category] || row.track_type,
        ...masteryProgress(Number(row.mastery_xp))
      };
    });
  }
}

module.exports = { CombatService, STARTER_LOADOUT, MASTERY_XP_CAP };
