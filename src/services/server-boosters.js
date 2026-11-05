const balancing = require("../config/game-balancing");

class ServerBoosterService {
  constructor(pool) {
    this.pool = pool;
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
        Object.prototype.hasOwnProperty.call(tags, "premium_subscriber") ||
        candidate.name === "Server Booster";
    });
    return role?.id || null;
  }

  async syncMember(member, guild = member?.guild) {
    const userId = this.getMemberId(member);
    const guildId = guild?.id || member?.guild?.id;
    if (!userId || !guildId) return { synced: false, reason: "missing_member_or_guild" };

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

    // Unknown member payloads must not overwrite a previously verified active status.
    if (!hasPremiumSince && !premiumRoleId) {
      return { synced: false, reason: "boost_status_unavailable" };
    }

    const active = Boolean(premiumSince) || hasPremiumRole;
    const guildBoostCountRaw = guild?.premiumSubscriptionCount ?? guild?.premium_subscription_count;
    const guildBoostCount = Math.max(0, Math.floor(Number(guildBoostCountRaw) || 0));
    const startedAt = premiumSince
      ? (premiumSince instanceof Date ? premiumSince.toISOString() : new Date(premiumSince).toISOString())
      : null;

    if (active) {
      await this.pool.query(
        "INSERT INTO server_booster_status (guild_id, user_id, is_active, server_boost_count, boost_started_at) " +
        "VALUES ($1, $2, TRUE, $3, $4) " +
        "ON CONFLICT (guild_id, user_id) DO UPDATE SET is_active = TRUE, server_boost_count = EXCLUDED.server_boost_count, " +
        "boost_started_at = COALESCE(server_booster_status.boost_started_at, EXCLUDED.boost_started_at), updated_at = NOW()",
        [guildId, userId, guildBoostCount, startedAt]
      );
    } else {
      await this.pool.query(
        "UPDATE server_booster_status SET is_active = FALSE, server_boost_count = $3, boost_started_at = NULL, updated_at = NOW() " +
        "WHERE guild_id = $1 AND user_id = $2 AND is_active = TRUE",
        [guildId, userId, guildBoostCount]
      );
    }

    const granted = active ? await this.syncGuild(guildId, guildBoostCount) : [];
    return { synced: true, active, serverBoostCount: guildBoostCount, granted };
  }

  async syncGuild(guildId, boostCount) {
    const count = Math.max(0, Math.floor(Number(boostCount) || 0));
    await this.pool.query(
      "UPDATE server_booster_status SET server_boost_count = $2, updated_at = NOW() " +
      "WHERE guild_id = $1 AND is_active = TRUE AND server_boost_count IS DISTINCT FROM $2",
      [guildId, count]
    );

    const granted = [];
    const rewards = balancing.items.filter((item) => item.boosterOnly && count >= item.requiredServerBoosts);
    for (const item of rewards) {
      const result = await this.pool.query(
        "INSERT INTO inventory (guild_id, user_id, item_id, quantity) " +
        "SELECT guild_id, user_id, $3, 1 FROM server_booster_status " +
        "WHERE guild_id = $1 AND is_active = TRUE " +
        "ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET " +
        "quantity = GREATEST(inventory.quantity, 1), updated_at = NOW() " +
        "WHERE inventory.quantity < 1 RETURNING user_id",
        [guildId, item.requiredServerBoosts, item.id]
      );
      for (const row of result.rows || []) granted.push({ userId: row.user_id, item });
    }
    return granted;
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
        "SELECT is_active, server_boost_count, boost_started_at FROM server_booster_status WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId]
      ),
      this.pool.query(
        "SELECT item_id FROM inventory WHERE guild_id = $1 AND user_id = $2 AND quantity > 0 AND item_id = ANY($3::text[])",
        [guildId, userId, balancing.items.filter((item) => item.boosterOnly).map((item) => item.id)]
      )
    ]);
    const row = status.rows[0] || {};
    const ownedIds = new Set(owned.rows.map((entry) => entry.item_id));
    return {
      active: Boolean(row.is_active),
      serverBoostCount: Number(row.server_boost_count) || 0,
      boostStartedAt: row.boost_started_at || null,
      unlockedItems: balancing.items.filter((item) => item.boosterOnly && ownedIds.has(item.id))
    };
  }
}

module.exports = { ServerBoosterService };
