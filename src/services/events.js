const balancing = require("../config/game-balancing");
const settings = require("../config/settings");
const { DomainError } = require("../utils/core");
const { ensurePlayerTx } = require("./economy");

async function activeEventTx(client, guildId) {
  const result = await client.query(
    "SELECT * FROM halloween_events WHERE guild_id = $1 AND event_id = $2 AND enabled = TRUE AND starts_at <= NOW() AND ends_at > NOW() LIMIT 1",
    [guildId, balancing.halloween.eventId]
  );
  return result.rows[0] || null;
}

async function trackActionTx(client, guildId, userId, action, amount = 1) {
  const event = await activeEventTx(client, guildId);
  if (!event) return;
  const quests = balancing.halloween.quests.filter((quest) => quest.action === action);
  for (const quest of quests) {
    await client.query(
      "INSERT INTO event_quest_progress (guild_id, user_id, event_id, quest_id, progress) VALUES ($1, $2, $3, $4, LEAST($5, $6)) ON CONFLICT (guild_id, user_id, event_id, quest_id) DO UPDATE SET progress = LEAST(event_quest_progress.progress + EXCLUDED.progress, $6), updated_at = NOW()",
      [guildId, userId, event.event_id, quest.id, Math.max(0, Math.floor(amount)), quest.goal, quest.goal]
    );
  }
}

class HalloweenGame {
  constructor(pool) { this.pool = pool; }

  async startEvent(guildId, actorId, roleId, endsAt) {
    const end = new Date(endsAt || settings.halloweenEndsAt);
    if (Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) {
      throw new DomainError("Event end date must be a valid future date.", "EVENT_END_INVALID");
    }
    await this.pool.query(
      "INSERT INTO halloween_events (guild_id, event_id, starts_at, ends_at, role_id, enabled, created_by) VALUES ($1, $2, NOW(), $3, $4, TRUE, $5) ON CONFLICT (guild_id, event_id) DO UPDATE SET starts_at = NOW(), ends_at = EXCLUDED.ends_at, role_id = EXCLUDED.role_id, enabled = TRUE, created_by = EXCLUDED.created_by, updated_at = NOW()",
      [guildId, balancing.halloween.eventId, end, roleId || settings.defaultEventRoleId || null, actorId]
    );
    return { eventId: balancing.halloween.eventId, endsAt: end, roleId: roleId || settings.defaultEventRoleId || null };
  }

  async stopEvent(guildId, actorId) {
    const result = await this.pool.query(
      "UPDATE halloween_events SET enabled = FALSE, updated_at = NOW() WHERE guild_id = $1 AND event_id = $2 RETURNING event_id",
      [guildId, balancing.halloween.eventId]
    );
    if (!result.rowCount) throw new DomainError("No Halloween event is configured for this server.", "EVENT_NOT_CONFIGURED");
    return { eventId: result.rows[0].event_id, actorId };
  }

  async getEvent(guildId) {
    const result = await this.pool.query(
      "SELECT * FROM halloween_events WHERE guild_id = $1 AND event_id = $2 LIMIT 1",
      [guildId, balancing.halloween.eventId]
    );
    return result.rows[0] || null;
  }

  async status(guildId, userId) {
    const event = await this.getEvent(guildId);
    if (!event) return { active: false, event: null, quests: balancing.halloween.quests, progress: [], claims: [], wallet: { candy: 0, points: 0 } };
    const active = Boolean(event.enabled) && new Date(event.starts_at).getTime() <= Date.now() && new Date(event.ends_at).getTime() > Date.now();
    const progress = await this.pool.query(
      "SELECT quest_id, progress FROM event_quest_progress WHERE guild_id = $1 AND user_id = $2 AND event_id = $3",
      [guildId, userId, event.event_id]
    );
    const claims = await this.pool.query(
      "SELECT quest_id FROM event_claims WHERE guild_id = $1 AND user_id = $2 AND event_id = $3",
      [guildId, userId, event.event_id]
    );
    const wallet = await this.pool.query(
      "SELECT candy, points FROM event_wallets WHERE guild_id = $1 AND user_id = $2 AND event_id = $3",
      [guildId, userId, event.event_id]
    );
    return {
      active, event, quests: balancing.halloween.quests, progress: progress.rows,
      claims: claims.rows.map((row) => row.quest_id),
      wallet: wallet.rows[0] || { candy: 0, points: 0 }
    };
  }

  async claimQuest(guildId, userId, questId) {
    const quest = balancing.halloween.quests.find((item) => item.id === questId);
    if (!quest) throw new DomainError("Choose a valid Halloween quest.", "EVENT_QUEST_INVALID");
    const { transaction } = require("../database/pool");
    return transaction(async (client) => {
      const event = await activeEventTx(client, guildId);
      if (!event) throw new DomainError("The Halloween event is not active in this server.", "EVENT_INACTIVE");
      await ensurePlayerTx(client, guildId, userId);
      const progress = await client.query(
        "SELECT progress FROM event_quest_progress WHERE guild_id = $1 AND user_id = $2 AND event_id = $3 AND quest_id = $4 FOR UPDATE",
        [guildId, userId, event.event_id, questId]
      );
      const current = progress.rowCount ? Number(progress.rows[0].progress) : 0;
      if (current < quest.goal) throw new DomainError("Quest progress: " + current + "/" + quest.goal + ". Finish the task before claiming.", "EVENT_QUEST_INCOMPLETE");
      const claim = await client.query(
        "INSERT INTO event_claims (guild_id, user_id, event_id, quest_id, candy, points) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING quest_id",
        [guildId, userId, event.event_id, questId, quest.candy, quest.points]
      );
      if (!claim.rowCount) throw new DomainError("You already claimed this quest.", "EVENT_QUEST_CLAIMED");
      await client.query(
        "INSERT INTO event_wallets (guild_id, user_id, event_id, candy, points) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (guild_id, user_id, event_id) DO UPDATE SET candy = event_wallets.candy + EXCLUDED.candy, points = event_wallets.points + EXCLUDED.points, updated_at = NOW()",
        [guildId, userId, event.event_id, quest.candy, quest.points]
      );
      const count = await client.query(
        "SELECT COUNT(*)::int AS claimed FROM event_claims WHERE guild_id = $1 AND user_id = $2 AND event_id = $3",
        [guildId, userId, event.event_id]
      );
      return {
        quest, claimedCount: count.rows[0].claimed,
        eligibleForRole: count.rows[0].claimed >= balancing.halloween.finalRoleQuestCount,
        roleId: event.role_id
      };
    });
  }

  async buyItem(guildId, userId, itemId) {
    const item = balancing.halloween.shop.find((entry) => entry.id === itemId);
    if (!item) throw new DomainError("That item is not in the Halloween shop.", "EVENT_ITEM_INVALID");
    const { transaction } = require("../database/pool");
    return transaction(async (client) => {
      const event = await activeEventTx(client, guildId);
      if (!event) throw new DomainError("The Halloween event is not active in this server.", "EVENT_INACTIVE");
      const wallet = await client.query(
        "SELECT candy FROM event_wallets WHERE guild_id = $1 AND user_id = $2 AND event_id = $3 FOR UPDATE",
        [guildId, userId, event.event_id]
      );
      const candy = wallet.rowCount ? Number(wallet.rows[0].candy) : 0;
      if (candy < item.cost) throw new DomainError("You need " + item.cost + " Candy to buy this item.", "EVENT_NOT_ENOUGH_CANDY");
      await client.query(
        "UPDATE event_wallets SET candy = candy - $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2 AND event_id = $3",
        [guildId, userId, event.event_id, item.cost]
      );
      await client.query(
        "INSERT INTO inventory (guild_id, user_id, item_id, quantity) VALUES ($1, $2, $3, 1) ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET quantity = inventory.quantity + 1, updated_at = NOW()",
        [guildId, userId, item.id]
      );
      return { item, remainingCandy: candy - item.cost };
    });
  }
}

module.exports = { HalloweenGame, activeEventTx, trackActionTx };
