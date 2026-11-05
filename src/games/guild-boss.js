const { transaction } = require("../database/pool");
const { ensurePlayerTx } = require("../services/economy");
const { getWeekStart } = require("../services/activity");
const { randomInt, uuid, DomainError, claimCooldownTx } = require("../utils/core");

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BOSS_MAX_HP = 22000;
const ATTACK_COOLDOWN_MS = 8 * 60 * 60 * 1000;
const ATTACK_REWARD_FC = 35;
const ATTACK_REWARD_XP = 10;
const CLEAR_REWARD_FC = 700;
const CLEAR_REWARD_XP = 80;

const BOSSES = [
  { id: "iron_wraith", name: "The Iron Wraith", description: "An armoured spectre haunting the old railway." },
  { id: "hollow_king", name: "The Hollow King", description: "A forgotten ruler gathering strength beneath the city." },
  { id: "storm_beast", name: "The Storm Beast", description: "A creature that appears when the lights flicker." },
  { id: "clockwork_titan", name: "The Clockwork Titan", description: "A colossal machine that has started moving again." }
];

function getBossWeekStart(value = new Date()) {
  return getWeekStart(value);
}

function bossForPeriod(periodStart) {
  const timestamp = Date.parse(String(periodStart) + "T00:00:00.000Z");
  if (!Number.isFinite(timestamp)) throw new TypeError("A valid boss period date is required.");
  const weekNumber = Math.floor(timestamp / WEEK_MS);
  const index = ((weekNumber % BOSSES.length) + BOSSES.length) % BOSSES.length;
  return BOSSES[index];
}

function calculateBossDamage(level, roll = 170) {
  const safeLevel = Math.max(1, Math.min(40, Math.floor(Number(level) || 1)));
  const numericRoll = Number.isFinite(Number(roll)) ? Math.floor(Number(roll)) : 170;
  const safeRoll = Math.max(140, Math.min(200, numericRoll));
  return safeRoll + safeLevel * 4;
}

async function ensureBossTx(client, guildId, periodStart) {
  const boss = bossForPeriod(periodStart);
  await client.query(
    "INSERT INTO guild_bosses (guild_id, period_start, boss_id, boss_name, description, max_hp, hp, status) " +
    "VALUES ($1, $2, $3, $4, $5, $6, $6, 'active') ON CONFLICT (guild_id, period_start) DO NOTHING",
    [guildId, periodStart, boss.id, boss.name, boss.description, BOSS_MAX_HP]
  );
  const result = await client.query(
    "SELECT * FROM guild_bosses WHERE guild_id = $1 AND period_start = $2 FOR UPDATE",
    [guildId, periodStart]
  );
  return result.rows[0];
}

class GuildBossGame {
  constructor(pool, economy) {
    this.pool = pool;
    this.economy = economy;
  }

  async status(guildId, userId) {
    const periodStart = getBossWeekStart();
    const boss = await transaction((client) => ensureBossTx(client, guildId, periodStart));
    const [personal, leaders] = await Promise.all([
      this.pool.query(
        "SELECT damage, attacks FROM guild_boss_contributions WHERE guild_id = $1 AND period_start = $2 AND user_id = $3",
        [guildId, periodStart, userId]
      ),
      this.leaderboard(guildId, 5, periodStart)
    ]);
    const contribution = personal.rows[0] || { damage: 0, attacks: 0 };
    return {
      boss,
      periodStart,
      contribution: { damage: Number(contribution.damage), attacks: Number(contribution.attacks) },
      leaders
    };
  }

  async attack(guildId, userId) {
    const periodStart = getBossWeekStart();
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const playerResult = await client.query(
        "SELECT level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      const level = Number(playerResult.rows[0].level);
      if (level < 3) {
        throw new DomainError("Reach player level 3 before joining the weekly boss fight.", "BOSS_LEVEL_REQUIRED");
      }

      const boss = await ensureBossTx(client, guildId, periodStart);
      if (boss.status === "defeated" || Number(boss.hp) <= 0) {
        throw new DomainError("Your server has already defeated this week's boss. Check /boss claim for your reward.", "BOSS_ALREADY_DEFEATED");
      }

      await claimCooldownTx(client, guildId, userId, "guild_boss_attack", ATTACK_COOLDOWN_MS);
      const damage = calculateBossDamage(level, randomInt(140, 200));
      const update = await client.query(
        "UPDATE guild_bosses SET hp = GREATEST(0, hp - $3), " +
        "status = CASE WHEN hp <= $3 THEN 'defeated' ELSE 'active' END, updated_at = NOW() " +
        "WHERE guild_id = $1 AND period_start = $2 RETURNING hp, status",
        [guildId, periodStart, damage]
      );
      await client.query(
        "INSERT INTO guild_boss_contributions (guild_id, period_start, user_id, damage, attacks) " +
        "VALUES ($1, $2, $3, $4, 1) ON CONFLICT (guild_id, period_start, user_id) DO UPDATE SET " +
        "damage = guild_boss_contributions.damage + EXCLUDED.damage, " +
        "attacks = guild_boss_contributions.attacks + 1, updated_at = NOW()",
        [guildId, periodStart, userId, damage]
      );

      const earning = await this.economy.mutateTx(
        client, guildId, userId, ATTACK_REWARD_FC, "guild_boss_attack",
        "guild-boss-attack:" + periodStart + ":" + userId + ":" + uuid(),
        { periodStart, damage }
      );
      const progression = await this.economy.addXpTx(client, guildId, userId, ATTACK_REWARD_XP);
      return {
        periodStart,
        bossName: boss.boss_name,
        damage,
        hp: Number(update.rows[0].hp),
        maxHp: Number(boss.max_hp),
        defeated: update.rows[0].status === "defeated",
        rewardFc: earning.delta,
        rewardXp: progression.gained
      };
    });
  }

  async leaderboard(guildId, limit = 10, periodStart = getBossWeekStart()) {
    const result = await this.pool.query(
      "SELECT user_id, damage, attacks FROM guild_boss_contributions " +
      "WHERE guild_id = $1 AND period_start = $2 " +
      "ORDER BY damage DESC, attacks DESC, user_id ASC LIMIT $3",
      [guildId, periodStart, Math.max(1, Math.min(25, Math.floor(Number(limit) || 10)))]
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      damage: Number(row.damage),
      attacks: Number(row.attacks)
    }));
  }

  async claimRewards(guildId, userId) {
    return transaction(async (client) => {
      const eligible = await client.query(
        "SELECT b.period_start, b.boss_name, c.damage, " +
        "(SELECT COUNT(*)::int + 1 FROM guild_boss_contributions higher " +
        " WHERE higher.guild_id = c.guild_id AND higher.period_start = c.period_start AND higher.damage > c.damage) AS rank " +
        "FROM guild_bosses b JOIN guild_boss_contributions c " +
        "ON c.guild_id = b.guild_id AND c.period_start = b.period_start " +
        "WHERE b.guild_id = $1 AND c.user_id = $2 AND b.status = 'defeated' " +
        "AND NOT EXISTS (SELECT 1 FROM guild_boss_claims claimed " +
        " WHERE claimed.guild_id = b.guild_id AND claimed.period_start = b.period_start AND claimed.user_id = c.user_id) " +
        "ORDER BY b.period_start ASC LIMIT 20 FOR UPDATE OF b",
        [guildId, userId]
      );
      if (!eligible.rowCount) {
        throw new DomainError("No unclaimed boss-clear reward is available yet. Rewards unlock when your server defeats a weekly boss and you have contributed damage.", "BOSS_NO_REWARD");
      }

      let totalFc = 0;
      let totalXp = 0;
      const claimed = [];
      for (const row of eligible.rows) {
        const inserted = await client.query(
          "INSERT INTO guild_boss_claims (guild_id, period_start, user_id) VALUES ($1, $2, $3) " +
          "ON CONFLICT DO NOTHING RETURNING period_start",
          [guildId, row.period_start, userId]
        );
        if (!inserted.rowCount) continue;

        const rank = Number(row.rank);
        const rankBonus = rank === 1 ? 300 : rank === 2 ? 200 : rank === 3 ? 100 : 0;
        const fc = CLEAR_REWARD_FC + rankBonus;
        const xp = CLEAR_REWARD_XP + (rank <= 3 ? 20 : 0);
        const period = row.period_start instanceof Date
          ? row.period_start.toISOString().slice(0, 10)
          : String(row.period_start).slice(0, 10);
        await this.economy.mutateTx(
          client, guildId, userId, fc, "guild_boss_clear",
          "guild-boss-clear:" + period + ":" + userId,
          { periodStart: period, rank, damage: Number(row.damage) }
        );
        const progression = await this.economy.addXpTx(client, guildId, userId, xp);
        totalFc += fc;
        totalXp += progression.gained;
        claimed.push({ bossName: row.boss_name, rank, fc, xp: progression.gained });
      }

      if (!claimed.length) {
        throw new DomainError("Those boss rewards have already been claimed.", "BOSS_REWARD_ALREADY_CLAIMED");
      }
      return { claimed, totalFc, totalXp };
    });
  }
}

module.exports = {
  GuildBossGame,
  BOSSES,
  BOSS_MAX_HP,
  ATTACK_COOLDOWN_MS,
  ATTACK_REWARD_FC,
  ATTACK_REWARD_XP,
  CLEAR_REWARD_FC,
  CLEAR_REWARD_XP,
  getBossWeekStart,
  bossForPeriod,
  calculateBossDamage
};
