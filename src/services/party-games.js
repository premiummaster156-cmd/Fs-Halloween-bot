const { claimCooldownTx } = require("../utils/core");

const DAILY_FORTUNE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

class PartyGameService {
  constructor(pool, economy) {
    this.pool = pool;
    this.economy = economy;
  }

  async record(guildId, userId, { points = 0, won = false } = {}) {
    const safePoints = Math.max(0, Math.min(1000, Math.floor(Number(points) || 0)));
    await this.pool.query(
      "INSERT INTO party_game_stats (guild_id, user_id, points, games, wins, current_streak, best_streak, last_played_at) " +
      "VALUES ($1, $2, $3, 1, $4, $5, $5, NOW()) " +
      "ON CONFLICT (guild_id, user_id) DO UPDATE SET " +
      "points = party_game_stats.points + EXCLUDED.points, " +
      "games = party_game_stats.games + 1, " +
      "wins = party_game_stats.wins + EXCLUDED.wins, " +
      "current_streak = CASE WHEN $5 = 1 THEN party_game_stats.current_streak + 1 ELSE 0 END, " +
      "best_streak = GREATEST(party_game_stats.best_streak, CASE WHEN $5 = 1 THEN party_game_stats.current_streak + 1 ELSE 0 END), " +
      "last_played_at = NOW()",
      [guildId, userId, safePoints, won ? 1 : 0, won ? 1 : 0]
    );
  }

  async getStats(guildId, userId) {
    const result = await this.pool.query(
      "SELECT user_id, points, games, wins, current_streak, best_streak, last_played_at " +
      "FROM party_game_stats WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId]
    );
    return result.rows[0] || {
      user_id: userId,
      points: 0,
      games: 0,
      wins: 0,
      current_streak: 0,
      best_streak: 0,
      last_played_at: null
    };
  }

  async leaderboard(guildId, limit = 10) {
    const result = await this.pool.query(
      "SELECT user_id, points, games, wins, current_streak, best_streak " +
      "FROM party_game_stats WHERE guild_id = $1 " +
      "ORDER BY points DESC, wins DESC, best_streak DESC, last_played_at ASC LIMIT $2",
      [guildId, Math.max(1, Math.min(25, Math.floor(Number(limit) || 10)))]
    );
    return result.rows;
  }

  async claimDailyFortune(guildId, userId) {
    return this.economy.transact((client) =>
      claimCooldownTx(client, guildId, userId, "daily_fortune", DAILY_FORTUNE_COOLDOWN_MS)
    );
  }
}

module.exports = { PartyGameService, DAILY_FORTUNE_COOLDOWN_MS };
