const balancing = require("../config/game-balancing");
const { transaction } = require("../database/pool");
const { ensurePlayerTx } = require("./economy");
const { DomainError, uuid } = require("../utils/core");

function combineEffects(items) {
  const result = {
    crimeChance: 0, heistChance: 0, workPayBonus: 0, workXpBonus: 0,
    moneyBonus: 0, xpBonus: 0, crimeRewardBonus: 0, fineReduction: 0,
    casinoChance: 0, slotLuck: 0,
    workCooldownReduction: 0, crimeCooldownReduction: 0, heistCooldownReduction: 0,
    dailyCooldownReduction: 0, casinoCooldownReduction: 0
  };
  const cooldownRemainders = {
    workCooldownReduction: 1, crimeCooldownReduction: 1, heistCooldownReduction: 1,
    dailyCooldownReduction: 1, casinoCooldownReduction: 1
  };
  for (const item of items) {
    const effects = item.effects || {};
    const upgradeLevel = Math.max(0, Math.min(balancing.itemUpgrades.maxLevel, Number(item.upgradeLevel ?? item.upgrade_level) || 0));
    const factor = 1 + upgradeLevel * balancing.itemUpgrades.effectPerLevel;
    for (const key of ["crimeChance", "heistChance", "workPayBonus", "workXpBonus", "moneyBonus", "xpBonus", "crimeRewardBonus", "fineReduction", "casinoChance", "slotLuck"]) {
      result[key] += Number(effects[key] || 0) * factor;
    }
    for (const key of Object.keys(cooldownRemainders)) {
      const reduction = Math.max(0, Math.min(0.45, Number(effects[key] || 0) * factor));
      cooldownRemainders[key] *= 1 - reduction;
    }
  }
  result.crimeChance = Math.min(20, result.crimeChance);
  result.heistChance = Math.min(15, result.heistChance);
  result.workPayBonus = Math.min(0.60, result.workPayBonus);
  result.workXpBonus = Math.min(0.60, result.workXpBonus);
  result.moneyBonus = Math.min(0.50, result.moneyBonus);
  result.xpBonus = Math.min(0.50, result.xpBonus);
  result.crimeRewardBonus = Math.min(0.30, result.crimeRewardBonus);
  result.fineReduction = Math.min(0.60, result.fineReduction);
  result.casinoChance = Math.min(5, result.casinoChance);
  result.slotLuck = Math.min(30, Math.floor(result.slotLuck));
  for (const key of Object.keys(cooldownRemainders)) {
    result[key] = Math.min(0.45, 1 - cooldownRemainders[key]);
  }
  return result;
}

class InventoryService {
  constructor(pool, economy) {
    this.pool = pool;
    this.economy = economy;
  }

  listShop() {
    return balancing.items.map((item) => ({ ...item }));
  }

  async buy(guildId, userId, itemId) {
    const item = balancing.items.find((entry) => entry.id === itemId);
    if (!item) throw new DomainError("That item is not in the shop.", "ITEM_NOT_FOUND");
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const playerResult = await client.query(
        "SELECT level, wallet FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      const player = playerResult.rows[0];
      if (Number(player.level) < item.minLevel) {
        throw new DomainError("You need level " + item.minLevel + " to buy " + item.name + ".", "ITEM_LEVEL_REQUIRED");
      }
      if (Number(player.wallet) < item.cost) {
        throw new DomainError("You need " + item.cost.toLocaleString() + " FC in your wallet.", "ITEM_NOT_ENOUGH_MONEY");
      }
      await this.economy.mutateTx(client, guildId, userId, -item.cost, "shop_purchase", uuid(), { itemId: item.id });
      await client.query(
        "INSERT INTO inventory (guild_id, user_id, item_id, quantity) VALUES ($1, $2, $3, 1) ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = inventory.quantity + 1, updated_at = NOW()",
        [guildId, userId, item.id]
      );
      return { item, walletRemaining: Number(player.wallet) - item.cost };
    });
  }

  async equip(guildId, userId, itemId) {
    const item = balancing.items.find((entry) => entry.id === itemId && entry.type === "equipment");
    if (!item) throw new DomainError("That item cannot be equipped.", "ITEM_NOT_EQUIPPABLE");
    return transaction(async (client) => {
      const inventory = await client.query(
        "SELECT quantity FROM inventory WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 FOR UPDATE",
        [guildId, userId, item.id]
      );
      if (!inventory.rowCount || Number(inventory.rows[0].quantity) < 1) {
        throw new DomainError("You need to own this item before equipping it.", "ITEM_NOT_OWNED");
      }
      const previous = await client.query(
        "SELECT item_id FROM equipped_items WHERE guild_id = $1 AND user_id = $2 AND slot = $3 FOR UPDATE",
        [guildId, userId, item.slot]
      );
      const previousItemId = previous.rowCount ? previous.rows[0].item_id : null;
      if (previousItemId === item.id) throw new DomainError("That item is already equipped.", "ITEM_ALREADY_EQUIPPED");
      await client.query(
        "INSERT INTO equipped_items (guild_id, user_id, slot, item_id) VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, user_id, slot) DO UPDATE SET item_id = EXCLUDED.item_id, equipped_at = NOW()",
        [guildId, userId, item.slot, item.id]
      );
      return { item, previousItem: balancing.items.find((entry) => entry.id === previousItemId) || null };
    });
  }

  async upgrade(guildId, userId, itemId) {
    const item = balancing.items.find((entry) => entry.id === itemId && entry.type === "equipment");
    if (!item) throw new DomainError("That item cannot be upgraded.", "ITEM_NOT_UPGRADABLE");
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const playerResult = await client.query(
        "SELECT level, wallet FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      const owned = await client.query(
        "SELECT quantity, upgrade_level FROM inventory WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 FOR UPDATE",
        [guildId, userId, item.id]
      );
      if (!owned.rowCount || Number(owned.rows[0].quantity) < 1) {
        throw new DomainError("You must own this item before upgrading it.", "ITEM_NOT_OWNED");
      }
      const currentLevel = Number(owned.rows[0].upgrade_level || 0);
      const nextLevel = currentLevel + 1;
      if (nextLevel > balancing.itemUpgrades.maxLevel) {
        throw new DomainError("This item is already at its maximum upgrade level.", "ITEM_MAX_UPGRADE");
      }
      const requiredLevel = item.minLevel + nextLevel * balancing.itemUpgrades.levelRequirementPerUpgrade;
      if (Number(playerResult.rows[0].level) < requiredLevel) {
        throw new DomainError("You need level " + requiredLevel + " to upgrade " + item.name + " to level " + nextLevel + ".", "ITEM_UPGRADE_LEVEL_REQUIRED");
      }
      const costFactor = balancing.itemUpgrades.costBaseFactor + nextLevel * balancing.itemUpgrades.costPerLevelFactor;
      const cost = Math.ceil(item.cost * costFactor);
      if (Number(playerResult.rows[0].wallet) < cost) {
        throw new DomainError("You need " + cost.toLocaleString() + " FC in your wallet for this upgrade.", "ITEM_UPGRADE_FUNDS_REQUIRED");
      }
      await this.economy.mutateTx(client, guildId, userId, -cost, "item_upgrade", uuid(), {
        itemId: item.id, previousLevel: currentLevel, upgradeLevel: nextLevel
      });
      await client.query(
        "UPDATE inventory SET upgrade_level = $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2 AND item_id = $3",
        [guildId, userId, item.id, nextLevel]
      );
      return { item, previousLevel: currentLevel, upgradeLevel: nextLevel, cost, walletRemaining: Number(playerResult.rows[0].wallet) - cost };
    });
  }

  async unequip(guildId, userId, slot) {
    const result = await this.pool.query(
      "DELETE FROM equipped_items WHERE guild_id = $1 AND user_id = $2 AND slot = $3 RETURNING item_id",
      [guildId, userId, slot]
    );
    if (!result.rowCount) throw new DomainError("You have nothing equipped in that slot.", "SLOT_EMPTY");
    return { item: balancing.items.find((entry) => entry.id === result.rows[0].item_id) || { id: result.rows[0].item_id }, slot };
  }

  async getInventory(guildId, userId) {
    const [owned, equipped] = await Promise.all([
      this.pool.query(
        "SELECT item_id, quantity, upgrade_level FROM inventory WHERE guild_id = $1 AND user_id = $2 AND quantity > 0 ORDER BY item_id",
        [guildId, userId]
      ),
      this.pool.query(
        "SELECT slot, item_id FROM equipped_items WHERE guild_id = $1 AND user_id = $2 ORDER BY slot",
        [guildId, userId]
      )
    ]);
    const equippedIds = new Set(equipped.rows.map((row) => row.item_id));
    return {
      items: owned.rows.map((row) => {
        const item = balancing.items.find((entry) => entry.id === row.item_id);
        return { item: item || { id: row.item_id, name: row.item_id }, quantity: Number(row.quantity), upgradeLevel: Number(row.upgrade_level || 0), equipped: equippedIds.has(row.item_id) };
      }),
      equipped: equipped.rows.map((row) => ({ slot: row.slot, item: balancing.items.find((entry) => entry.id === row.item_id) || { id: row.item_id, name: row.item_id } }))
    };
  }

  async getEffectsTx(client, guildId, userId) {
    const result = await client.query(
      "SELECT e.item_id, i.upgrade_level FROM equipped_items e JOIN inventory i ON i.guild_id = e.guild_id AND i.user_id = e.user_id AND i.item_id = e.item_id WHERE e.guild_id = $1 AND e.user_id = $2",
      [guildId, userId]
    );
    const items = result.rows.map((row) => {
      const item = balancing.items.find((entry) => entry.id === row.item_id);
      return item ? { ...item, upgradeLevel: Number(row.upgrade_level || 0) } : null;
    }).filter(Boolean);
    return combineEffects(items);
  }

  async getEffects(guildId, userId) {
    const result = await this.pool.query(
      "SELECT e.item_id, i.upgrade_level FROM equipped_items e JOIN inventory i ON i.guild_id = e.guild_id AND i.user_id = e.user_id AND i.item_id = e.item_id WHERE e.guild_id = $1 AND e.user_id = $2",
      [guildId, userId]
    );
    return combineEffects(result.rows.map((row) => {
      const item = balancing.items.find((entry) => entry.id === row.item_id);
      return item ? { ...item, upgradeLevel: Number(row.upgrade_level || 0) } : null;
    }).filter(Boolean));
  }
}

module.exports = { InventoryService, combineEffects };
