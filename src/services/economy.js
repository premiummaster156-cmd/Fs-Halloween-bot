const { transaction } = require("../database/pool");
const settings = require("../config/settings");
const balancing = require("../config/game-balancing");
const { DomainError, uuid, randomInt, claimCooldownTx, levelXpRequired, getRebirthMultiplier, applyCooldownReduction } = require("../utils/core");

const MULTIPLIED_EARNING_REASONS = new Set([
  "daily_reward", "job_work", "crime_success", "heist_reward", "chat_activity_reward"
]);

async function ensurePlayerTx(client, guildId, userId) {
  await client.query(
    "INSERT INTO players (guild_id, user_id, wallet) VALUES ($1, $2, $3) ON CONFLICT (guild_id, user_id) DO NOTHING",
    [guildId, userId, settings.startingWallet]
  );
}
async function getPlayer(pool, guildId, userId) {
  await pool.query(
    "INSERT INTO players (guild_id, user_id, wallet) VALUES ($1, $2, $3) ON CONFLICT (guild_id, user_id) DO NOTHING",
    [guildId, userId, settings.startingWallet]
  );
  const result = await pool.query("SELECT * FROM players WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
  return result.rows[0];
}
async function getLeaderboard(pool, guildId, metric = "wealth", limit = 10) {
  const columns = { wealth: "(wallet + bank)", level: "level", earned: "lifetime_earned" };
  const column = columns[metric] || columns.wealth;
  const result = await pool.query(
    "SELECT p.user_id, p.wallet, p.bank, p.level, p.xp, p.lifetime_earned, (" + column + ") AS score " +
    "FROM players p WHERE p.guild_id = $1 " +
    "AND NOT EXISTS (SELECT 1 FROM leaderboard_exclusions x WHERE x.guild_id = p.guild_id AND x.user_id = p.user_id) " +
    "ORDER BY score DESC, p.user_id ASC LIMIT $2",
    [guildId, Math.max(1, Math.min(25, limit))]
  );
  return result.rows;
}

class EconomyService {
  constructor(pool) { this.pool = pool; this.inventory = null; }
  transact(callback) { return transaction(callback); }
  ensurePlayerTx(client, guildId, userId) { return ensurePlayerTx(client, guildId, userId); }
  claimCooldownTx(client, guildId, userId, key, ms) { return claimCooldownTx(client, guildId, userId, key, ms); }

  async excludeFromLeaderboards(guildId, userId, actorId, reason) {
    const result = await this.pool.query(
      "INSERT INTO leaderboard_exclusions (guild_id, user_id, excluded_by, reason) VALUES ($1, $2, $3, $4) " +
      "ON CONFLICT (guild_id, user_id) DO UPDATE SET excluded_by = EXCLUDED.excluded_by, reason = EXCLUDED.reason, created_at = NOW() RETURNING user_id",
      [guildId, userId, actorId, reason]
    );
    return { excluded: result.rowCount > 0 };
  }

  async includeInLeaderboards(guildId, userId) {
    const result = await this.pool.query(
      "DELETE FROM leaderboard_exclusions WHERE guild_id = $1 AND user_id = $2 RETURNING user_id",
      [guildId, userId]
    );
    return { included: result.rowCount > 0 };
  }

  async getBalance(guildId, userId) {
    const player = await getPlayer(this.pool, guildId, userId);
    return { wallet: Number(player.wallet), bank: Number(player.bank), total: Number(player.wallet) + Number(player.bank) };
  }

  async mutateTx(client, guildId, userId, delta, reason, reference, metadata = {}) {
    const amount = Math.trunc(Number(delta));
    if (!Number.isSafeInteger(amount) || amount === 0) throw new DomainError("Amount must be a non-zero whole number.", "INVALID_AMOUNT");
    await ensurePlayerTx(client, guildId, userId);
    const result = await client.query("SELECT wallet, prestige FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
    const ref = reference || uuid();
    const existing = await client.query("SELECT id FROM economy_ledger WHERE guild_id = $1 AND user_id = $2 AND reference = $3", [guildId, userId, ref]);
    if (existing.rowCount) return { duplicate: true, balance: Number(result.rows[0].wallet), delta: 0 };
    const currentWallet = Number(result.rows[0].wallet);
    let appliedAmount = amount;
    if (amount > 0 && MULTIPLIED_EARNING_REASONS.has(reason)) {
      const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
      const multiplier = getRebirthMultiplier(result.rows[0].prestige) * (1 + (gear.moneyBonus || 0));
      appliedAmount = Math.min(balancing.economy.maxWallet - currentWallet, Math.floor(amount * multiplier));
      if (appliedAmount < 1) throw new DomainError("Your wallet is at its maximum balance.", "WALLET_FULL");
    }
    const next = currentWallet + appliedAmount;
    if (next < 0) throw new DomainError("You do not have enough FS Coins in your wallet.", "INSUFFICIENT_FUNDS");
    if (next > balancing.economy.maxWallet) throw new DomainError("That amount would exceed the wallet limit.", "WALLET_LIMIT");
    await client.query(
      "UPDATE players SET wallet = $3, lifetime_earned = lifetime_earned + $4, lifetime_spent = lifetime_spent + $5, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId, next, Math.max(0, appliedAmount), Math.max(0, -appliedAmount)]
    );
    await client.query(
      "INSERT INTO economy_ledger (guild_id, user_id, delta, reason, reference, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
      [guildId, userId, appliedAmount, reason, ref, JSON.stringify({ ...metadata, baseAmount: amount, appliedMultiplier: amount > 0 && appliedAmount !== amount ? appliedAmount / amount : 1 })]
    );
    return { duplicate: false, balance: next, delta: appliedAmount, baseDelta: amount };
  }

  async addXpTx(client, guildId, userId, amount, roleIds = [], activityBonus = 0) {
    const booster = await client.query(
      "SELECT setting_value FROM guild_settings WHERE guild_id = $1 AND setting_key = 'xpBoosterRoleId'",
      [guildId]
    );
    const hasBooster = booster.rowCount && roleIds.includes(booster.rows[0].setting_value);
    const result = await client.query("SELECT level, xp, prestige FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
    const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
    const multiplier = balancing.progression.xpMultiplier *
      (hasBooster ? balancing.progression.roleBoosterMultiplier : 1) *
      getRebirthMultiplier(result.rows[0]?.prestige || 0) *
      (1 + Math.min(0.75, (gear.xpBonus || 0) + (Number(activityBonus) || 0)));
    const gained = Math.max(0, Math.floor(amount * multiplier));
    if (!result.rowCount) return { gained, level: 1, levelsGained: 0 };
    let level = Number(result.rows[0].level);
    let xp = Number(result.rows[0].xp) + gained;
    let levelsGained = 0;
    while (level < 100 && xp >= levelXpRequired(level)) {
      xp -= levelXpRequired(level);
      level += 1;
      levelsGained += 1;
    }
    await client.query("UPDATE players SET level = $3, xp = $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [guildId, userId, level, xp]);
    return { gained, multiplier, level, levelsGained, xp, nextLevelXp: levelXpRequired(level) };
  }

  async getRebirthStatus(guildId, userId) {
    const player = await getPlayer(this.pool, guildId, userId);
    const rebirths = Number(player.prestige || 0);
    const walletRequired = Math.min(Number.MAX_SAFE_INTEGER,
      balancing.rebirth.firstWalletRequirement * Math.pow(balancing.rebirth.walletRequirementGrowth, rebirths));
    const levelRequired = Math.min(100,
      balancing.rebirth.firstLevelRequirement + rebirths * balancing.rebirth.levelRequirementGrowth);
    const claim = await this.pool.query(
      "SELECT event_id, quest_id, claimed_at FROM event_claims WHERE guild_id = $1 AND user_id = $2 " +
      "AND quest_id NOT LIKE 'weekly_messages:%' AND ($3::timestamptz IS NULL OR claimed_at > $3) " +
      "ORDER BY claimed_at DESC LIMIT 1",
      [guildId, userId, player.last_rebirth_at || null]
    );
    const wealth = Number(player.wallet) + Number(player.bank);
    return {
      wallet: Number(player.wallet), bank: Number(player.bank), wealth,
      level: Number(player.level), rebirths,
      multiplier: getRebirthMultiplier(rebirths),
      nextMultiplier: getRebirthMultiplier(rebirths + 1),
      walletRequired, levelRequired,
      questClaimed: claim.rowCount > 0,
      claimedQuest: claim.rows[0] || null,
      eligible: wealth >= walletRequired && Number(player.level) >= levelRequired && claim.rowCount > 0
    };
  }

  async rebirth(guildId, userId) {
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const playerResult = await client.query(
        "SELECT wallet, bank, level, prestige, last_rebirth_at FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      const player = playerResult.rows[0];
      const rebirths = Number(player.prestige || 0);
      const walletRequired = Math.min(Number.MAX_SAFE_INTEGER,
        balancing.rebirth.firstWalletRequirement * Math.pow(balancing.rebirth.walletRequirementGrowth, rebirths));
      const levelRequired = Math.min(100,
        balancing.rebirth.firstLevelRequirement + rebirths * balancing.rebirth.levelRequirementGrowth);
      const wealth = Number(player.wallet) + Number(player.bank);
      if (wealth < walletRequired) {
        throw new DomainError("You need " + walletRequired.toLocaleString() + " FC in total wallet and bank savings to rebirth.", "REBIRTH_FUNDS_REQUIRED");
      }
      if (Number(player.level) < levelRequired) {
        throw new DomainError("You need level " + levelRequired + " to rebirth.", "REBIRTH_LEVEL_REQUIRED");
      }
      const claim = await client.query(
        "SELECT quest_id FROM event_claims WHERE guild_id = $1 AND user_id = $2 " +
        "AND quest_id NOT LIKE 'weekly_messages:%' AND ($3::timestamptz IS NULL OR claimed_at > $3) " +
        "ORDER BY claimed_at DESC LIMIT 1",
        [guildId, userId, player.last_rebirth_at || null]
      );
      if (!claim.rowCount) {
        throw new DomainError("Complete at least one event quest and claim its reward since your last rebirth.", "REBIRTH_EVENT_REWARD_REQUIRED");
      }
      const newRebirths = rebirths + 1;
      const reset = await client.query(
        "UPDATE players SET wallet = $3, bank = 0, level = 1, xp = 0, job_id = NULL, job_level = 1, job_xp = 0, " +
        "reputation = 0, prestige = $4, last_rebirth_at = NOW(), updated_at = NOW() " +
        "WHERE guild_id = $1 AND user_id = $2 RETURNING wallet, level, prestige",
        [guildId, userId, balancing.rebirth.startingWallet, newRebirths]
      );
      await client.query("DELETE FROM cooldowns WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
      await client.query(
        "INSERT INTO economy_ledger (guild_id, user_id, delta, reason, reference, metadata) VALUES ($1, $2, $3, 'rebirth_reset', $4, $5::jsonb)",
        [guildId, userId, balancing.rebirth.startingWallet - Number(player.wallet), uuid(), JSON.stringify({
          previousWallet: Number(player.wallet), previousBank: Number(player.bank),
          previousLevel: Number(player.level), rebirths: newRebirths
        })]
      );
      return {
        rebirths: newRebirths,
        multiplier: getRebirthMultiplier(newRebirths),
        previousWealth: wealth,
        wallet: Number(reset.rows[0].wallet),
        level: Number(reset.rows[0].level),
        nextWalletRequired: Math.min(Number.MAX_SAFE_INTEGER,
          balancing.rebirth.firstWalletRequirement * Math.pow(balancing.rebirth.walletRequirementGrowth, newRebirths)),
        nextLevelRequired: Math.min(100,
          balancing.rebirth.firstLevelRequirement + newRebirths * balancing.rebirth.levelRequirementGrowth)
      };
    });
  }

  async transfer(guildId, fromUserId, toUserId, amount) {
    const value = Math.floor(Number(amount));
    if (!Number.isSafeInteger(value) || value < balancing.economy.transferMinimum || value > balancing.economy.transferMaximum) {
      throw new DomainError("Transfer must be between " + balancing.economy.transferMinimum + " and " + balancing.economy.transferMaximum + " FC.", "INVALID_TRANSFER");
    }
    if (fromUserId === toUserId) throw new DomainError("You cannot transfer money to yourself.", "SELF_TRANSFER");
    const reference = uuid();
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, fromUserId);
      await ensurePlayerTx(client, guildId, toUserId);
      await client.query("SELECT user_id FROM players WHERE guild_id = $1 AND user_id = ANY($2::text[]) ORDER BY user_id FOR UPDATE", [guildId, [fromUserId, toUserId]]);
      await this.mutateTx(client, guildId, fromUserId, -value, "member_transfer_out", reference + ":out", { to: toUserId });
      await this.mutateTx(client, guildId, toUserId, value, "member_transfer_in", reference + ":in", { from: fromUserId });
      return { amount: value };
    });
  }

  async daily(guildId, userId, roleIds = []) {
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
      const row = await client.query("SELECT level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      const cooldownMs = applyCooldownReduction(balancing.economy.dailyCooldownMs, gear.dailyCooldownReduction, 60 * 60 * 1000);
      await claimCooldownTx(client, guildId, userId, "daily", cooldownMs);
      const baseAmount = randomInt(balancing.economy.dailyMin, balancing.economy.dailyMax) + Number(row.rows[0].level) * 8;
      const earning = await this.mutateTx(client, guildId, userId, baseAmount, "daily_reward", uuid(), {});
      const progression = await this.addXpTx(client, guildId, userId, balancing.economy.dailyXp, roleIds);
      const events = require("./events");
      await events.trackActionTx(client, guildId, userId, "daily", 1);
      await events.trackActionTx(client, guildId, userId, "wallet_earned", earning.delta);
      return { amount: earning.delta, cooldownMs, progression };
    });
  }
}

module.exports = { EconomyService, ensurePlayerTx, getPlayer, getLeaderboard };
