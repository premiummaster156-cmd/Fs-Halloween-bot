const balancing = require("../config/game-balancing");
const { calculateWorkPay, randomInt, uuid, DomainError, claimCooldownTx, getRebirthMultiplier, applyCooldownReduction } = require("../utils/core");
const { ensurePlayerTx, getPlayer } = require("../services/economy");
const { transaction } = require("../database/pool");
const { trackActionTx } = require("../services/events");

class JobsGame {
  constructor(pool, economy, inventory) { this.pool = pool; this.economy = economy; this.inventory = inventory; }
  list() { return balancing.jobs.map((job) => ({ ...job })); }

  async view(guildId, userId) {
    const player = await getPlayer(this.pool, guildId, userId);
    return { player, job: balancing.jobs.find((item) => item.id === player.job_id) || null, jobs: this.list() };
  }

  async apply(guildId, userId, jobId) {
    const job = balancing.jobs.find((item) => item.id === jobId);
    if (!job) throw new DomainError("That job does not exist.", "JOB_NOT_FOUND");
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const result = await client.query("SELECT level, wallet, job_id FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      const player = result.rows[0];
      if (Number(player.level) < job.minLevel) throw new DomainError("You need level " + job.minLevel + " to apply for " + job.name + ".", "JOB_LEVEL_REQUIRED");
      if (Number(player.wallet) < job.minWallet) throw new DomainError("You need " + job.minWallet.toLocaleString() + " FC in your wallet to apply for " + job.name + ".", "JOB_FUNDS_REQUIRED");
      if (player.job_id === job.id) throw new DomainError("You already work as " + job.name + ".", "ALREADY_HAS_JOB");
      await client.query("UPDATE players SET job_id = $3, job_level = 1, job_xp = 0, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [guildId, userId, job.id]);
      return { job, previousJobId: player.job_id };
    });
  }

  async startShift(guildId, userId) {
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const result = await client.query("SELECT level, job_id, job_level, job_xp, prestige FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      const player = result.rows[0];
      const job = balancing.jobs.find((item) => item.id === player.job_id);
      if (!job) throw new DomainError("You do not have a job yet. Use /job to view careers and apply.", "NO_JOB");
      const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
      const cooldownMs = applyCooldownReduction(job.cooldownMs, gear.workCooldownReduction, 60 * 1000);
      // Shorten cooldowns created by older releases without restarting the timer.
      await client.query(
        "UPDATE cooldowns SET next_at = LEAST(next_at, updated_at + ($3::double precision * INTERVAL '1 millisecond')) WHERE guild_id = $1 AND user_id = $2 AND cooldown_key = 'work' AND next_at > updated_at + ($3::double precision * INTERVAL '1 millisecond')",
        [guildId, userId, cooldownMs]
      );
      await claimCooldownTx(client, guildId, userId, "work", cooldownMs);
      return { job, jobLevel: Number(player.job_level) };
    });
  }

  async completeShift(guildId, userId, expectedJobId, correctAnswers = 1, totalQuestions = 1, roleIds = []) {
    const correct = Math.max(0, Math.floor(Number(correctAnswers)));
    const total = Math.max(1, Math.floor(Number(totalQuestions)));
    if (correct < 1 || correct > total) throw new DomainError("Answer at least one work question correctly to earn a shift reward.", "NO_CORRECT_WORK_ANSWERS");
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const result = await client.query("SELECT level, job_id, job_level, job_xp, prestige FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      const player = result.rows[0];
      const job = balancing.jobs.find((item) => item.id === player.job_id);
      if (!job) throw new DomainError("You no longer have a job. Apply for a career before finishing this shift.", "NO_JOB");
      if (job.id !== expectedJobId) throw new DomainError("Your career changed while the shift challenge was open. Start a new shift for your current career.", "JOB_CHANGED_DURING_SHIFT");
      const factor = 1 + (randomInt(-18, 18) / 100);
      const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
      const basePay = calculateWorkPay(job, Number(player.job_level), factor);
      const preMultiplierPay = Math.max(1, Math.floor(basePay * (1 + (gear.workPayBonus || 0)) * correct / total));
      const earning = await this.economy.mutateTx(client, guildId, userId, preMultiplierPay, "job_work", uuid(), { jobId: job.id, jobLevel: Number(player.job_level) });
      const pay = earning.delta;
      const baseXpEarned = Math.max(1, Math.floor(job.xp * correct / total));
      const careerXpBonus = Math.min(0.75, (gear.xpBonus || 0) + (gear.workXpBonus || 0));
      const xpEarned = Math.max(1, Math.floor(baseXpEarned * getRebirthMultiplier(player.prestige) * (1 + careerXpBonus)));
      await client.query("UPDATE players SET work_count = work_count + 1, job_xp = job_xp + $3, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [guildId, userId, xpEarned]);
      const updated = await client.query("SELECT job_level, job_xp FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      let jobLevel = Number(updated.rows[0].job_level);
      let jobXp = Number(updated.rows[0].job_xp);
      let promoted = false;
      const threshold = 180 + (jobLevel * jobLevel * 55);
      if (jobLevel < 30 && jobXp >= threshold) {
        jobXp -= threshold;
        jobLevel += 1;
        promoted = true;
        await client.query("UPDATE players SET job_level = $3, job_xp = $4 WHERE guild_id = $1 AND user_id = $2", [guildId, userId, jobLevel, jobXp]);
      }
      const progression = await this.economy.addXpTx(client, guildId, userId, baseXpEarned, roleIds, gear.workXpBonus || 0);
      await trackActionTx(client, guildId, userId, "work", 1);
      await trackActionTx(client, guildId, userId, "wallet_earned", pay);
      return { job, pay, xpEarned, correctAnswers: correct, totalQuestions: total, promoted, jobLevel, progression };
    });
  }

  async work(guildId, userId) {
    const shift = await this.startShift(guildId, userId);
    return this.completeShift(guildId, userId, shift.job.id);
  }
}
module.exports = { JobsGame };
