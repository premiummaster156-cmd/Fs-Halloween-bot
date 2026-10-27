const balancing = require("../config/game-balancing");
const { calculateCrimeChance, randomInt, chance, uuid, DomainError, claimCooldownTx } = require("../utils/core");
const { ensurePlayerTx } = require("../services/economy");
const { transaction } = require("../database/pool");
const { trackActionTx } = require("../services/events");

class CrimeGame {
  constructor(pool, economy) { this.pool = pool; this.economy = economy; }
  list() { return balancing.crimes.map((crime) => ({ ...crime })); }

  async attempt(guildId, userId, crimeId) {
    const crime = balancing.crimes.find((item) => item.id === crimeId);
    if (!crime) throw new DomainError("Choose a valid crime.", "CRIME_NOT_FOUND");
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const result = await client.query("SELECT level, job_id, reputation, wallet FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      const player = result.rows[0];
      if (Number(player.level) < crime.minLevel) throw new DomainError("You need level " + crime.minLevel + " to attempt " + crime.name + ".", "CRIME_LEVEL_REQUIRED");
      await claimCooldownTx(client, guildId, userId, "crime:" + crime.id, crime.cooldownMs);
      const careerBonus = ["enforcer", "smuggler", "underboss", "crime_boss"].includes(player.job_id) ? 4 : 0;
      const reputation = Math.max(-4, Math.min(4, Math.floor(Number(player.reputation) / 10)));
      const successChance = calculateCrimeChance(crime.baseChance, Number(player.level), crime.difficulty, careerBonus + reputation);
      const succeeded = chance(successChance);
      const reference = uuid();
      let reward = 0;
      let fine = 0;
      if (succeeded) {
        reward = Math.floor(randomInt(crime.rewardMin, crime.rewardMax) * (1 + Math.min(0.3, Number(player.level) * 0.004)));
        await this.economy.mutateTx(client, guildId, userId, reward, "crime_success", reference, { crimeId, successChance });
        await client.query("UPDATE players SET crime_successes = crime_successes + 1, reputation = LEAST(100, reputation + 1), updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
        await this.economy.addXpTx(client, guildId, userId, crime.xp);
        await trackActionTx(client, guildId, userId, "crime_success", 1);
        await trackActionTx(client, guildId, userId, "wallet_earned", reward);
      } else {
        fine = Math.min(Number(player.wallet), randomInt(crime.fineMin, crime.fineMax));
        if (fine > 0) await this.economy.mutateTx(client, guildId, userId, -fine, "crime_failed_fine", reference, { crimeId, successChance });
        await client.query("UPDATE players SET reputation = GREATEST(-100, reputation - 2), updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
      }
      return { crime, succeeded, successChance, reward, fine };
    });
  }
}
module.exports = { CrimeGame };
