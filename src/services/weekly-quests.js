const balancing = require("../config/game-balancing");
const { transaction } = require("../database/pool");
const { ensurePlayerTx } = require("./economy");
const { getWeekStart } = require("./events");

class WeeklyQuestService {
  constructor(pool, transactionRunner = transaction) {
    this.pool = pool;
    this.transactionRunner = transactionRunner;
  }

  async status(guildId, userId) {
    const weekStart = getWeekStart();
    const [progress, claims, wallet] = await Promise.all([
      this.pool.query(
        "SELECT quest_id, progress FROM weekly_quest_progress WHERE guild_id = $1 AND user_id = $2 AND week_start = $3",
        [guildId, userId, weekStart]
      ),
      this.pool.query(
        "SELECT quest_id FROM weekly_quest_claims WHERE guild_id = $1 AND user_id = $2 AND week_start = $3",
        [guildId, userId, weekStart]
      ),
      this.pool.query(
        "SELECT candy FROM event_wallets WHERE guild_id = $1 AND user_id = $2 AND event_id = $3",
        [guildId, userId, balancing.halloween.eventId]
      )
    ]);
    const progressById = new Map(progress.rows.map((row) => [row.quest_id, Number(row.progress) || 0]));
    const claimed = new Set(claims.rows.map((row) => row.quest_id));
    const quests = balancing.weeklyQuests.map((quest) => {
      const current = Math.min(quest.goal, progressById.get(quest.id) || 0);
      return {
        ...quest,
        progress: current,
        completed: current >= quest.goal,
        claimed: claimed.has(quest.id),
        ready: current >= quest.goal && !claimed.has(quest.id)
      };
    });
    return {
      weekStart,
      candyBalance: Number(wallet.rows[0]?.candy) || 0,
      quests,
      claimedCount: quests.filter((quest) => quest.claimed).length,
      readyCount: quests.filter((quest) => quest.ready).length,
      totalWeeklyCandy: balancing.weeklyQuests.reduce((sum, quest) => sum + quest.candy, 0)
    };
  }

  async claim(guildId, userId, questId) {
    const quest = balancing.weeklyQuests.find((item) => item.id === questId);
    if (!quest) throw new Error("Choose a valid weekly quest.");
    const weekStart = getWeekStart();
    return this.transactionRunner(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const progress = await client.query(
        "SELECT progress FROM weekly_quest_progress WHERE guild_id = $1 AND user_id = $2 AND week_start = $3 AND quest_id = $4 FOR UPDATE",
        [guildId, userId, weekStart, questId]
      );
      const current = Number(progress.rows[0]?.progress) || 0;
      if (current < quest.goal) {
        const error = new Error("Weekly quest progress: " + current + "/" + quest.goal + ".");
        error.code = "WEEKLY_QUEST_INCOMPLETE";
        throw error;
      }
      const inserted = await client.query(
        "INSERT INTO weekly_quest_claims (guild_id, user_id, week_start, quest_id, candy) " +
        "VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING quest_id",
        [guildId, userId, weekStart, quest.id, quest.candy]
      );
      if (!inserted.rowCount) {
        const error = new Error("You already claimed this weekly quest.");
        error.code = "WEEKLY_QUEST_CLAIMED";
        throw error;
      }
      const wallet = await client.query(
        "INSERT INTO event_wallets (guild_id, user_id, event_id, candy, points) VALUES ($1, $2, $3, $4, 0) " +
        "ON CONFLICT (guild_id, user_id, event_id) DO UPDATE SET candy = event_wallets.candy + EXCLUDED.candy, updated_at = NOW() " +
        "RETURNING candy",
        [guildId, userId, balancing.halloween.eventId, quest.candy]
      );
      return {
        quest,
        weekStart,
        candy: quest.candy,
        candyBalance: Number(wallet.rows[0]?.candy) || 0
      };
    });
  }
}

module.exports = { WeeklyQuestService };
