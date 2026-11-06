const { transaction } = require("../database/pool");
const { ensurePlayerTx, getPlayer } = require("../services/economy");
const { DomainError } = require("../utils/core");

const ACHIEVEMENTS = [
  { id: "first_shift", name: "First Shift", description: "Complete your first work shift.", metric: "work_count", target: 1, rewardFc: 150, rewardXp: 25 },
  { id: "steady_worker", name: "Steady Worker", description: "Complete 3 work shifts.", metric: "work_count", target: 3, rewardFc: 250, rewardXp: 35 },
  { id: "career_pro", name: "Career Professional", description: "Reach job level 3 in your current career.", metric: "job_level", target: 3, rewardFc: 450, rewardXp: 60 },
  { id: "operation_specialist", name: "Operation Specialist", description: "Complete 3 successful operations.", metric: "crime_successes", target: 3, rewardFc: 450, rewardXp: 60 },
  { id: "crew_veteran", name: "Crew Veteran", description: "Complete 3 successful heists.", metric: "heists_completed", target: 3, rewardFc: 600, rewardXp: 75 },
  { id: "level_ten", name: "Rising Star", description: "Reach player level 5.", metric: "level", target: 5, rewardFc: 350, rewardXp: 50 },
  { id: "millionaire", name: "Wealth Builder", description: "Hold 50,000 FC across your wallet and bank.", metric: "wealth", target: 50000, rewardFc: 1000, rewardXp: 100 },
  { id: "reborn", name: "A New Beginning", description: "Complete your first rebirth.", metric: "prestige", target: 1, rewardFc: 700, rewardXp: 100 },
  { id: "party_regular", name: "Party Regular", description: "Play 3 Party Games.", metric: "party_games", target: 3, rewardFc: 300, rewardXp: 40 },
  { id: "party_champion", name: "Crowd Favourite", description: "Win 5 Party Games.", metric: "party_wins", target: 5, rewardFc: 650, rewardXp: 85 }
];

function getMetricValue(achievement, metrics) {
  return Math.max(0, Number(metrics[achievement.metric]) || 0);
}

function evaluateAchievement(achievement, metrics) {
  const current = getMetricValue(achievement, metrics);
  const target = Math.max(1, Number(achievement.target) || 1);
  return {
    ...achievement,
    current: Math.min(current, target),
    actual: current,
    target,
    unlocked: current >= target,
    progressPercent: Math.min(100, Math.floor((current / target) * 100))
  };
}

function mapPlayerMetrics(player, partyStats = {}) {
  return {
    work_count: Number(player.work_count) || 0,
    job_level: Number(player.job_level) || 0,
    crime_successes: Number(player.crime_successes) || 0,
    heists_completed: Number(player.heists_completed) || 0,
    level: Number(player.level) || 1,
    wealth: Number(player.wallet || 0) + Number(player.bank || 0),
    prestige: Number(player.prestige) || 0,
    party_games: Number(partyStats.games ?? partyStats.party_games) || 0,
    party_wins: Number(partyStats.wins ?? partyStats.party_wins) || 0
  };
}

class AchievementsGame {
  constructor(pool, economy) {
    this.pool = pool;
    this.economy = economy;
  }

  async status(guildId, userId) {
    const player = await getPlayer(this.pool, guildId, userId);
    const [partyResult, claimsResult] = await Promise.all([
      this.pool.query(
        "SELECT games, wins FROM party_game_stats WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId]
      ),
      this.pool.query(
        "SELECT achievement_id FROM achievement_claims WHERE guild_id = $1 AND user_id = $2",
        [guildId, userId]
      )
    ]);
    const metrics = mapPlayerMetrics(player, partyResult.rows[0] || {});
    const claimed = new Set(claimsResult.rows.map((row) => row.achievement_id));
    return ACHIEVEMENTS.map((achievement) => ({
      ...evaluateAchievement(achievement, metrics),
      claimed: claimed.has(achievement.id)
    }));
  }

  async claim(guildId, userId, achievementId, roleIds = []) {
    const achievement = ACHIEVEMENTS.find((item) => item.id === achievementId);
    if (!achievement) throw new DomainError("Choose an achievement from the list.", "ACHIEVEMENT_NOT_FOUND");

    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const result = await client.query(
        "SELECT p.level, p.wallet, p.bank, p.job_level, p.work_count, p.crime_successes, " +
        "p.heists_completed, p.prestige, COALESCE(s.games, 0)::bigint AS party_games, " +
        "COALESCE(s.wins, 0)::bigint AS party_wins " +
        "FROM players p LEFT JOIN party_game_stats s ON s.guild_id = p.guild_id AND s.user_id = p.user_id " +
        "WHERE p.guild_id = $1 AND p.user_id = $2 FOR UPDATE OF p",
        [guildId, userId]
      );
      const metrics = mapPlayerMetrics(result.rows[0], result.rows[0]);
      const progress = evaluateAchievement(achievement, metrics);
      if (!progress.unlocked) {
        throw new DomainError(
          "Not unlocked yet: " + progress.actual.toLocaleString() + "/" + progress.target.toLocaleString() + " " + achievement.metric + ".",
          "ACHIEVEMENT_LOCKED"
        );
      }

      const inserted = await client.query(
        "INSERT INTO achievement_claims (guild_id, user_id, achievement_id) VALUES ($1, $2, $3) " +
        "ON CONFLICT DO NOTHING RETURNING achievement_id",
        [guildId, userId, achievementId]
      );
      if (!inserted.rowCount) {
        throw new DomainError("You already claimed this achievement reward.", "ACHIEVEMENT_ALREADY_CLAIMED");
      }

      const earning = await this.economy.mutateTx(
        client, guildId, userId, achievement.rewardFc, "achievement_reward",
        "achievement:" + achievementId,
        { achievementId }
      );
      const progression = await this.economy.addXpTx(client, guildId, userId, achievement.rewardXp, roleIds);
      return {
        achievement,
        rewardFc: earning.delta,
        rewardXp: progression.gained,
        level: progression.level,
        candyDrop: earning.candyDrop || null
      };
    });
  }
}

module.exports = {
  AchievementsGame,
  ACHIEVEMENTS,
  getMetricValue,
  evaluateAchievement,
  mapPlayerMetrics
};
