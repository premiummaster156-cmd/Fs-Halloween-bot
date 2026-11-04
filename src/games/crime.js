const balancing = require("../config/game-balancing");
const { calculateCrimeChance, randomInt, chance, uuid, DomainError, claimCooldownTx, applyCooldownReduction } = require("../utils/core");
const { ensurePlayerTx } = require("../services/economy");
const { transaction } = require("../database/pool");
const { trackActionTx } = require("../services/events");

class CrimeGame {
  constructor(pool, economy, inventory) { this.pool = pool; this.economy = economy; this.inventory = inventory; }
  list() { return balancing.crimes.map((crime) => ({ ...crime })); }

  async attempt(guildId, userId, crimeId, roleIds = []) {
    const crime = balancing.crimes.find((item) => item.id === crimeId);
    if (!crime) throw new DomainError("Choose a valid crime.", "CRIME_NOT_FOUND");
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const result = await client.query("SELECT level, job_id, reputation, wallet FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      const player = result.rows[0];
      if (Number(player.level) < crime.minLevel) throw new DomainError("You need level " + crime.minLevel + " to attempt " + crime.name + ".", "CRIME_LEVEL_REQUIRED");
      const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
      const cooldownMs = applyCooldownReduction(crime.cooldownMs, gear.crimeCooldownReduction, 60 * 1000);
      await claimCooldownTx(client, guildId, userId, "crime:" + crime.id, cooldownMs);
      const careerBonus = ["enforcer", "smuggler", "underboss", "crime_boss"].includes(player.job_id) ? 4 : 0;
      const reputation = Math.max(-4, Math.min(4, Math.floor(Number(player.reputation) / 10)));
      const successChance = calculateCrimeChance(crime.baseChance, Number(player.level), crime.difficulty, careerBonus + reputation + (gear.crimeChance || 0));
      const succeeded = chance(successChance);
      const reference = uuid();
      let reward = 0;
      let fine = 0;
      let candyDrop = null;
      if (succeeded) {
        const baseReward = Math.floor(randomInt(crime.rewardMin, crime.rewardMax) * (1 + Math.min(0.3, Number(player.level) * 0.004)));
        const earning = await this.economy.mutateTx(client, guildId, userId, Math.floor(baseReward * (1 + (gear.crimeRewardBonus || 0))), "crime_success", reference, { crimeId, successChance });
        reward = earning.delta;
        candyDrop = earning.candyDrop || null;
        await client.query("UPDATE players SET crime_successes = crime_successes + 1, reputation = LEAST(100, reputation + 1), updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
        await this.economy.addXpTx(client, guildId, userId, crime.xp, roleIds);
        await trackActionTx(client, guildId, userId, "crime_success", 1);
        await trackActionTx(client, guildId, userId, "wallet_earned", reward);
      } else {
        const rawFine = randomInt(crime.fineMin, crime.fineMax);
        fine = Math.min(Number(player.wallet), Math.floor(rawFine * (1 - (gear.fineReduction || 0))));
        if (fine > 0) await this.economy.mutateTx(client, guildId, userId, -fine, "crime_failed_fine", reference, { crimeId, successChance });
        await client.query("UPDATE players SET reputation = GREATEST(-100, reputation - 2), updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
      }
      return { crime, succeeded, successChance, reward, fine, candyDrop };
    });
  }
}
module.exports = { CrimeGame };
