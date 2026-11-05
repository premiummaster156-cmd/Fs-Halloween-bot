const balancing = require("../config/game-balancing");
const { transaction } = require("../database/pool");

const GUILD_BOOST_MESSAGE_TYPE = 8; // discord.js MessageType.GuildBoost

async function isActiveBooster(queryable, guildId, userId) {
  const result = await queryable.query(
    "SELECT is_active FROM server_booster_status WHERE guild_id = $1 AND user_id = $2",
    [guildId, userId]
  );
  return Boolean(result.rows[0]?.is_active);
}

function applyBoosterEventReward(baseAmount, isActive) {
  const amount = Math.max(0, Math.floor(Number(baseAmount) || 0));
  const multiplier = 1 + (isActive ? Number(balancing.serverBoosterEffects.eventRewardBonus) || 0 : 0);
  return Math.floor(amount * multiplier);
}

class ServerBoosterService {
  constructor(pool, transactionRunner = transaction) {
    this.pool = pool;
    this.transactionRunner = transactionRunner;
    this.memberSyncAt = new Map();
    this.memberSyncCooldownMs = 30 * 1000;
  }

  getMemberId(member) {
    return member?.id || member?.user?.id || null;
  }

  getPremiumRoleId(guild) {
    const roles = guild?.roles?.cache;
    if (!roles) return null;
    const role = roles.find((candidate) => {
      const tags = candidate.tags || {};
      return Object.prototype.hasOwnProperty.call(tags, "premiumSubscriber") ||
        Object.prototype.hasOwnProperty.call(tags, "premium_subscriber");
    });
    return role?.id || null;
  }

  async syncMember(member, guild = member?.guild) {
    const userId = this.getMemberId(member);
    const guildId = guild?.id || member?.guild?.id;
    if (!userId || !guildId) return { synced: false, reason: "missing_member_or_guild" };

    const syncKey = guildId + ":" + userId;
    const now = Date.now();
    const lastSyncAt = this.memberSyncAt.get(syncKey) || 0;
    if (now - lastSyncAt < this.memberSyncCooldownMs) {
      return { synced: false, reason: "recently_synced" };
    }
    if (this.memberSyncAt.size > 10000) {
      const staleBefore = now - this.memberSyncCooldownMs * 4;
      for (const [key, syncedAt] of this.memberSyncAt) {
        if (syncedAt < staleBefore) this.memberSyncAt.delete(key);
      }
    }

    const hasPremiumSince = member && (
      "premiumSince" in Object(member) ||
      Object.prototype.hasOwnProperty.call(member, "premium_since")
    );
    const premiumSince = member?.premiumSince ?? member?.premium_since;
    const premiumRoleId = this.getPremiumRoleId(guild);
    const memberRoleIds = member?.roles?.cache
      ? Array.from(member.roles.cache.keys())
      : Array.isArray(member?.roles) ? member.roles : [];
    const hasPremiumRole = Boolean(premiumRoleId && memberRoleIds.includes(premiumRoleId));

    if (!hasPremiumSince && !premiumRoleId) {
      return { synced: false, reason: "boost_status_unavailable" };
    }

    const active = Boolean(premiumSince) || hasPremiumRole;
    const guildBoostCountRaw = guild?.premiumSubscriptionCount ?? guild?.premium_subscription_count;
    const guildBoostCount = Math.max(0, Math.floor(Number(guildBoostCountRaw) || 0));
    const parsedPremiumSince = premiumSince
      ? (premiumSince instanceof Date ? premiumSince : new Date(premiumSince))
      : null;
    const startedAt = parsedPremiumSince && Number.isFinite(parsedPremiumSince.getTime())
      ? parsedPremiumSince.toISOString()
      : null;

    if (active) {
      await this.pool.query(
        "INSERT INTO server_booster_status (guild_id, user_id, is_active, server_boost_count, boost_started_at) " +
        "VALUES ($1, $2, TRUE, $3, $4) " +
        "ON CONFLICT (guild_id, user_id) DO UPDATE SET is_active = TRUE, server_boost_count = EXCLUDED.server_boost_count, " +
        "boost_started_at = COALESCE(server_booster_status.boost_started_at, EXCLUDED.boost_started_at), updated_at = NOW()",
        [guildId, userId, guildBoostCount, startedAt]
      );
      await this.syncGuild(guildId, guildBoostCount);
    } else {
      await this.pool.query(
        "UPDATE server_booster_status SET is_active = FALSE, server_boost_count = $3, boost_started_at = NULL, updated_at = NOW() " +
        "WHERE guild_id = $1 AND user_id = $2 AND is_active = TRUE",
        [guildId, userId, guildBoostCount]
      );
    }

    this.memberSyncAt.set(syncKey, now);
    return { synced: true, active, serverBoostCount: guildBoostCount, granted: [] };
  }

  async recordBoostMessage(message) {
    if (Number(message?.type) !== GUILD_BOOST_MESSAGE_TYPE) {
      return { recorded: false, reason: "not_a_personal_boost_message" };
    }
    const guildId = message.guildId || message.guild?.id;
    const userId = message.author?.id;
    const messageId = message.id;
    if (!guildId || !userId || !messageId) {
      return { recorded: false, reason: "missing_boost_message_identity" };
    }
    const guildBoostCount = Math.max(0, Math.floor(Number(
      message.guild?.premiumSubscriptionCount ?? message.guild?.premium_subscription_count
    ) || 0));

    return this.transactionRunner(async (client) => {
      const event = await client.query(
        "INSERT INTO server_boost_events (guild_id, user_id, message_id) VALUES ($1, $2, $3) " +
        "ON CONFLICT (guild_id, message_id) DO NOTHING RETURNING message_id",
        [guildId, userId, messageId]
      );
      if (!event.rowCount) return { recorded: false, duplicate: true };

      const progress = await client.query(
        "INSERT INTO server_booster_status " +
        "(guild_id, user_id, is_active, server_boost_count, personal_boost_count, boost_started_at) " +
        "VALUES ($1, $2, TRUE, $3, 1, NOW()) " +
        "ON CONFLICT (guild_id, user_id) DO UPDATE SET " +
        "is_active = TRUE, server_boost_count = EXCLUDED.server_boost_count, " +
        "personal_boost_count = server_booster_status.personal_boost_count + 1, " +
        "boost_started_at = COALESCE(server_booster_status.boost_started_at, EXCLUDED.boost_started_at), " +
        "updated_at = NOW() RETURNING personal_boost_count",
        [guildId, userId, guildBoostCount]
      );
      const personalBoostCount = Number(progress.rows[0]?.personal_boost_count) || 1;
      await client.query(
        "UPDATE server_boost_events SET boost_number = $3 WHERE guild_id = $1 AND message_id = $2",
        [guildId, messageId, personalBoostCount]
      );

      const item = balancing.items.find((entry) =>
        entry.boosterOnly && Number(entry.boostNumber) === personalBoostCount
      );
      if (!item) {
        return { recorded: true, personalBoostCount, item: null, granted: false, collectionComplete: true };
      }

      await client.query(
        "INSERT INTO inventory (guild_id, user_id, item_id, quantity) VALUES ($1, $2, $3, 1) " +
        "ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = GREATEST(inventory.quantity, 1), updated_at = NOW()",
        [guildId, userId, item.id]
      );
      await client.query(
        "INSERT INTO equipped_items (guild_id, user_id, slot, item_id) VALUES ($1, $2, $3, $4) " +
        "ON CONFLICT (guild_id, user_id, slot) DO UPDATE SET item_id = EXCLUDED.item_id, equipped_at = NOW()",
        [guildId, userId, item.slot, item.id]
      );
      return { recorded: true, personalBoostCount, item, granted: true, autoEquipped: true };
    });
  }

  async syncGuild(guildId, boostCount) {
    const count = Math.max(0, Math.floor(Number(boostCount) || 0));
    await this.pool.query(
      "UPDATE server_booster_status SET server_boost_count = $2, updated_at = NOW() " +
      "WHERE guild_id = $1 AND is_active = TRUE AND server_boost_count IS DISTINCT FROM $2",
      [guildId, count]
    );
    return { serverBoostCount: count };
  }

  async markInactive(guildId, userId) {
    await this.pool.query(
      "UPDATE server_booster_status SET is_active = FALSE, boost_started_at = NULL, updated_at = NOW() " +
      "WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId]
    );
  }

  async getStatus(guildId, userId) {
    const [status, owned] = await Promise.all([
      this.pool.query(
        "SELECT is_active, server_boost_count, personal_boost_count, boost_started_at " +
        "FROM server_booster_status WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId]
      ),
      this.pool.query(
        "SELECT item_id FROM inventory WHERE guild_id = $1 AND user_id = $2 AND quantity > 0 AND item_id = ANY($3::text[])",
        [guildId, userId, balancing.items.filter((item) => item.boosterOnly).map((item) => item.id)]
      )
    ]);
    const row = status.rows[0] || {};
    const ownedIds = new Set(owned.rows.map((entry) => entry.item_id));
    const personalBoostCount = Number(row.personal_boost_count) || 0;
    const nextItem = balancing.items.find((item) =>
      item.boosterOnly && Number(item.boostNumber) === personalBoostCount + 1
    );
    return {
      active: Boolean(row.is_active),
      serverBoostCount: Number(row.server_boost_count) || 0,
      personalBoostCount,
      boostStartedAt: row.boost_started_at || null,
      nextItem: nextItem || null,
      collectionComplete: personalBoostCount >= balancing.items.filter((item) => item.boosterOnly).length,
      unlockedItems: balancing.items.filter((item) => item.boosterOnly && ownedIds.has(item.id))
    };
  }
}

module.exports = {
  ServerBoosterService,
  isActiveBooster,
  applyBoosterEventReward,
  GUILD_BOOST_MESSAGE_TYPE
};
