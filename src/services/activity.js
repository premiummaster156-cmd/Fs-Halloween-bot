const { transaction } = require("../database/pool");
const balancing = require("../config/game-balancing");
const { randomInt, uuid } = require("../utils/core");
const { ensurePlayerTx } = require("./economy");

function getWeekStart(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("getWeekStart requires a valid date.");
  date.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function getUtcDay(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

class ActivityService {
  constructor(pool, economy) {
    this.pool = pool;
    this.economy = economy;
  }

  weekStart(value = new Date()) {
    return getWeekStart(value);
  }

  async trackMessage(message) {
    if (!message || !message.guildId || !message.author || message.author.bot || message.webhookId) {
      return { counted: false, reason: "ignored" };
    }
    const guildId = message.guildId;
    const userId = message.author.id;
    const weekStart = getWeekStart();
    const rewardDay = getUtcDay();

    return transaction(async (client) => {
      const counted = await client.query(
        "INSERT INTO weekly_activity (guild_id, user_id, week_start, messages, last_counted_at) VALUES ($1, $2, $3, 1, NOW()) " +
        "ON CONFLICT (guild_id, user_id, week_start) DO UPDATE SET messages = weekly_activity.messages + 1, last_counted_at = NOW(), updated_at = NOW() " +
        "WHERE weekly_activity.last_counted_at <= NOW() - ($4::double precision * INTERVAL '1 millisecond') RETURNING messages",
        [guildId, userId, weekStart, balancing.chat.countCooldownMs]
      );
      if (!counted.rowCount) return { counted: false, reason: "rate_limited" };

      await ensurePlayerTx(client, guildId, userId);
      await client.query(
        "INSERT INTO daily_chat_rewards (guild_id, user_id, reward_day, earned) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING",
        [guildId, userId, rewardDay]
      );
      const daily = await client.query(
        "SELECT earned FROM daily_chat_rewards WHERE guild_id = $1 AND user_id = $2 AND reward_day = $3 FOR UPDATE",
        [guildId, userId, rewardDay]
      );
      const earnedToday = Number(daily.rows[0].earned);
      const remaining = Math.max(0, balancing.chat.dailyRewardCap - earnedToday);
      const reward = Math.min(remaining, randomInt(balancing.chat.rewardMin, balancing.chat.rewardMax));

      if (reward > 0) {
        await this.economy.mutateTx(client, guildId, userId, reward, "chat_activity_reward", uuid(), {
          weekStart,
          channelId: message.channelId
        });
        await client.query(
          "UPDATE daily_chat_rewards SET earned = earned + $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2 AND reward_day = $3",
          [guildId, userId, rewardDay, reward]
        );
        await client.query(
          "UPDATE weekly_activity SET chat_earned = chat_earned + $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2 AND week_start = $3",
          [guildId, userId, weekStart, reward]
        );
      }

      return {
        counted: true,
        messages: Number(counted.rows[0].messages),
        reward,
        rewardCapRemaining: Math.max(0, remaining - reward),
        weekStart
      };
    });
  }

  async getWeekly(guildId, userId) {
    const weekStart = getWeekStart();
    const result = await this.pool.query(
      "SELECT messages, chat_earned FROM weekly_activity WHERE guild_id = $1 AND user_id = $2 AND week_start = $3",
      [guildId, userId, weekStart]
    );
    const row = result.rows[0] || { messages: 0, chat_earned: 0 };
    return {
      weekStart,
      messages: Number(row.messages),
      chatEarned: Number(row.chat_earned),
      goal: balancing.halloween.weeklyMessageGoal
    };
  }

  async leaderboard(guildId, limit = 10) {
    const weekStart = getWeekStart();
    const result = await this.pool.query(
      "SELECT user_id, messages, chat_earned FROM weekly_activity WHERE guild_id = $1 AND week_start = $2 ORDER BY messages DESC, user_id ASC LIMIT $3",
      [guildId, weekStart, Math.max(1, Math.min(25, limit))]
    );
    return { weekStart, rows: result.rows };
  }
}

module.exports = { ActivityService, getWeekStart, getUtcDay };
