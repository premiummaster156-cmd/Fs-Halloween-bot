const balancing = require("../config/game-balancing");
const { transaction } = require("../database/pool");
const { ensurePlayerTx } = require("./economy");
const { DomainError, uuid } = require("../utils/core");

function combineEffects(items) {
  const result = { crimeChance: 0, heistChance: 0, workPayBonus: 0, fineReduction: 0 };
  for (const item of items) {
    const effects = item.effects || {};
    result.crimeChance += Number(effects.crimeChance || 0);
    result.heistChance += Number(effects.heistChance || 0);
    result.workPayBonus += Number(effects.workPayBonus || 0);
    result.fineReduction += Number(effects.fineReduction || 0);
  }
  result.crimeChance = Math.min(15, result.crimeChance);
  result.heistChance = Math.min(15, result.heistChance);
  result.workPayBonus = Math.min(0.25, result.workPayBonus);
  result.fineReduction = Math.min(0.35, result.fineReduction);
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
        "SELECT item_id, quantity FROM inventory WHERE guild_id = $1 AND user_id = $2 AND quantity > 0 ORDER BY item_id",
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
        return { item: item || { id: row.item_id, name: row.item_id }, quantity: Number(row.quantity), equipped: equippedIds.has(row.item_id) };
      }),
      equipped: equipped.rows.map((row) => ({ slot: row.slot, item: balancing.items.find((entry) => entry.id === row.item_id) || { id: row.item_id, name: row.item_id } }))
    };
  }

  async getEffectsTx(client, guildId, userId) {
    const result = await client.query(
      "SELECT item_id FROM equipped_items WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId]
    );
    const items = result.rows.map((row) => balancing.items.find((item) => item.id === row.item_id)).filter(Boolean);
    return combineEffects(items);
  }

  async getEffects(guildId, userId) {
    const result = await this.pool.query(
      "SELECT item_id FROM equipped_items WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId]
    );
    return combineEffects(result.rows.map((row) => balancing.items.find((item) => item.id === row.item_id)).filter(Boolean));
  }
}

module.exports = { InventoryService, combineEffects };
