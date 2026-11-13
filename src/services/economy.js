const { transaction } = require("../database/pool");
const settings = require("../config/settings");
const balancing = require("../config/game-balancing");
const { DomainError, uuid, randomInt, claimCooldownTx, levelXpRequired, getLevelEarningMultiplier, applyCooldownReduction } = require("../utils/core");
const { MAX_BASE_XP_PER_ACTION, MAX_SINGLE_XP_GAIN, MAX_EARNING_MULTIPLIER, MAX_SINGLE_MUTATION_FC, inspectEconomyMutation, inspectRewardBurst } = require("./economy-guard");

function getXpEventMultiplier(eventType) {
  return eventType === "xp_surge" ? 1.5 : 1;
}

const MULTIPLIED_EARNING_REASONS = new Set([
  "daily_reward",
  "job_work",
  "crime_success",
  "heist_reward",
  "chat_activity_reward",
  "achievement_reward",
  "boss_reward",
  "scavenge_reward",
  "delivery_contract_reward",
]);

const LIFETIME_EARNING_REASONS = new Set([
  "daily_reward",
  "job_work",
  "crime_success",
  "heist_reward",
  "casino_payout",
  "chat_activity_reward",
  "achievement_reward",
  "boss_reward",
  "scavenge_reward",
  "delivery_contract_reward"
]);
const LIFETIME_SPENDING_REASONS = new Set([
  "shop_purchase",
  "item_upgrade",
  "casino_bet",
  "crime_failed_fine",
  "heist_failed_fine"
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

function calculateCandyDrop(reason, gearBonus = 0, chanceRoll = Math.random(), amountRoll = Math.random(), level = 1) {
  const rule = balancing.candyDrops[reason];
  if (!rule) return null;
  const equippedBonus = Math.max(0, Math.min(0.20, Number(gearBonus) || 0));
  // Candy-drop progression keeps its original level-600 endpoint even though
  // the player level cap is now 1,000.
  const candyProgressionMaxLevel = Math.min(600, balancing.progression.maxLevel);
  const safeLevel = Math.max(1, Math.min(candyProgressionMaxLevel, Math.floor(Number(level) || 1)));
  const levelBonus = ((safeLevel - 1) / (candyProgressionMaxLevel - 1)) * 0.20;
  const dropChance = Math.min(0.60, Number(rule.chance) + equippedBonus + levelBonus);
  if (chanceRoll >= dropChance) return null;
  const amount = rule.min + Math.floor(amountRoll * (rule.max - rule.min + 1));
  return { amount, chance: dropChance, baseChance: Number(rule.chance), gearBonus: equippedBonus, levelBonus };
}

class EconomyService {
  constructor(pool) { this.pool = pool; this.inventory = null; this.security = null; this.client = null; }
  transact(callback) { return transaction(callback); }
  ensurePlayerTx(client, guildId, userId) { return ensurePlayerTx(client, guildId, userId); }
  claimCooldownTx(client, guildId, userId, key, ms) { return claimCooldownTx(client, guildId, userId, key, ms); }

  async reportEconomyIncident(guildId,userId,category,summary,details={}) {
    const guild=this.client?.guilds?.cache?.get(String(guildId));
    if(!guild||!this.security?.createIncident)return null;
    return this.security.createIncident(this.client,{guild,userId:String(userId),category,summary,details});
  }
  async ensureSnapshotTx(client,guildId,userId) {
    await client.query("INSERT INTO player_economy_snapshots (guild_id,user_id,wallet,bank,lifetime_earned,lifetime_spent,level,xp) "+
      "SELECT guild_id,user_id,wallet,bank,lifetime_earned,lifetime_spent,level,xp FROM players WHERE guild_id=$1 AND user_id=$2 "+
      "ON CONFLICT (guild_id,user_id) DO NOTHING",[guildId,userId]);
  }
  async assertSnapshotTx(client,guildId,userId,player) {
    await this.ensureSnapshotTx(client,guildId,userId);
    const result=await client.query("SELECT wallet,bank,lifetime_earned,lifetime_spent,level,xp FROM player_economy_snapshots "+
      "WHERE guild_id=$1 AND user_id=$2 FOR UPDATE",[guildId,userId]);
    const snapshot=result.rows?.[0];
    if(!snapshot)return;
    const fields=["wallet","bank","lifetime_earned","lifetime_spent","level","xp"];
    const changed=fields.filter((field)=>Number(snapshot[field])!==Number(player[field]));
    if(!changed.length)return;
    await this.reportEconomyIncident(guildId,userId,"economy_direct_balance_change",
      "A player economy value changed outside a verified bot transaction. The attempted action was blocked.",
      {actionType:"direct_balance_change",changedFields:changed.join(", "),riskScore:100})
      .catch((error)=>console.warn("[economy-guard] Could not persist integrity alert:",error.message));
    throw new DomainError("Your player data failed an economy integrity check. No currency was changed. Please contact a server administrator.","ECONOMY_INTEGRITY_MISMATCH");
  }
  async syncSnapshotTx(client,guildId,userId) {
    await client.query("INSERT INTO player_economy_snapshots (guild_id,user_id,wallet,bank,lifetime_earned,lifetime_spent,level,xp) "+
      "SELECT guild_id,user_id,wallet,bank,lifetime_earned,lifetime_spent,level,xp FROM players WHERE guild_id=$1 AND user_id=$2 "+
      "ON CONFLICT (guild_id,user_id) DO UPDATE SET wallet=EXCLUDED.wallet,bank=EXCLUDED.bank,lifetime_earned=EXCLUDED.lifetime_earned,"+
      "lifetime_spent=EXCLUDED.lifetime_spent,level=EXCLUDED.level,xp=EXCLUDED.xp,updated_at=NOW()",[guildId,userId]);
  }

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

  async getBankHistory(guildId, userId, limit = 5) {
    const [summary, recent] = await Promise.all([
      this.pool.query(
        "SELECT COUNT(*)::int AS transactions, " +
        "COALESCE(SUM(CASE WHEN reason = 'bank_deposit' THEN -delta ELSE 0 END), 0)::bigint AS deposited, " +
        "COALESCE(SUM(CASE WHEN reason = 'bank_withdrawal' THEN delta ELSE 0 END), 0)::bigint AS withdrawn " +
        "FROM economy_ledger WHERE guild_id = $1 AND user_id = $2 AND reason IN ('bank_deposit', 'bank_withdrawal')",
        [guildId, userId]
      ),
      this.pool.query(
        "SELECT reason, ABS(delta)::bigint AS amount, created_at FROM economy_ledger " +
        "WHERE guild_id = $1 AND user_id = $2 AND reason IN ('bank_deposit', 'bank_withdrawal') " +
        "ORDER BY created_at DESC LIMIT $3",
        [guildId, userId, Math.max(1, Math.min(10, Math.floor(Number(limit) || 5)))]
      )
    ]);
    const row = summary.rows[0] || {};
    return {
      transactions: Number(row.transactions) || 0,
      deposited: Number(row.deposited) || 0,
      withdrawn: Number(row.withdrawn) || 0,
      recent: recent.rows.map((item) => ({ ...item, amount: Number(item.amount) || 0 }))
    };
  }

  async mutateTx(client, guildId, userId, delta, reason, reference, metadata = {}) {
    const amount = Number(delta);
    const policy = inspectEconomyMutation({ userId, delta: amount, reason, metadata });
    if (!policy.allowed) {
      await this.reportEconomyIncident(guildId,userId,"economy_tampering",
        "A currency mutation was rejected by the economy integrity guard: " + policy.code + ".",
        { actionType:"invalid_economy_mutation",reason:String(reason || "missing"),amount,riskScore:100,reasonCode:policy.code })
        .catch((error) => console.warn("[economy-guard] Could not persist mutation alert:",error.message));
      throw new DomainError(policy.message,policy.code);
    }
    await ensurePlayerTx(client, guildId, userId);
    const result = await client.query("SELECT wallet, bank, lifetime_earned, lifetime_spent, job_id, level, xp FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
    if (!result.rowCount) throw new DomainError("Your player profile could not be found.","PLAYER_NOT_FOUND");
    await this.assertSnapshotTx(client,guildId,userId,result.rows[0]);
    const ref = reference || uuid();
    const existing = await client.query("SELECT id FROM economy_ledger WHERE guild_id = $1 AND user_id = $2 AND reference = $3", [guildId, userId, ref]);
    if (existing.rowCount) return { duplicate: true, balance: Number(result.rows[0].wallet), delta: 0, candyDrop: null };

    if (policy.policy.casino) {
      const wager = Math.trunc(Number(metadata.wager));
      const multiplier = Math.trunc(Number(metadata.multiplier));
      const expectedPayout = Math.floor(wager * multiplier / 100);
      const betReference = String(ref).replace(/:payout$/i, ":bet");
      const bet = await client.query(
        "SELECT delta FROM economy_ledger WHERE guild_id=$1 AND user_id=$2 AND reference=$3 AND reason='casino_bet'",
        [guildId,userId,betReference]
      );
      if (!/:payout$/i.test(String(ref)) || !bet.rowCount || Number(bet.rows[0].delta) !== -wager ||
          !Number.isSafeInteger(expectedPayout) || expectedPayout !== amount) {
        await this.reportEconomyIncident(guildId,userId,"economy_invalid_payout",
          "A casino payout failed verification against the recorded wager and payout formula.",
          { actionType:"invalid_casino_payout",wager,multiplier,amount,riskScore:100 })
          .catch((error) => console.warn("[economy-guard] Could not persist casino alert:",error.message));
        throw new DomainError("Casino payout verification failed. No payout was added.","ECONOMY_INVALID_PAYOUT");
      }
    }

    const currentWallet = Number(result.rows[0].wallet);
    const maxWallet = Number(balancing.economy.maxWallet);
    const career = balancing.careerEffects[result.rows[0].job_id] || {};
    let appliedAmount = amount;
    const dropEligible = amount > 0 && Boolean(balancing.candyDrops[reason]);
    const earningEligible = amount > 0 && MULTIPLIED_EARNING_REASONS.has(reason);
    const gear = (dropEligible || earningEligible) && this.inventory
      ? await this.inventory.getEffectsTx(client, guildId, userId)
      : {};
    let party = null;
    let partyMultiplier = 1;
    if (earningEligible) {
      const incomeBonus = Math.min(0.75, (gear.moneyBonus || 0) + (career.moneyBonus || 0));
      const levelMultiplier = getLevelEarningMultiplier(result.rows[0].level);
      const partyResult = await client.query(
        "SELECT name,multiplier FROM economy_events WHERE guild_id=$1 AND enabled=TRUE AND starts_at<=NOW() AND ends_at>NOW() ORDER BY created_at DESC LIMIT 1",
        [guildId]
      );
      party = partyResult.rows[0] || null;
      partyMultiplier = party ? Math.max(1, Math.min(10, Number(party.multiplier) || 1)) : 1;
      const multiplier = Math.max(1, Number(balancing.economy.earningMultiplier) || 1) *
        levelMultiplier * (1 + incomeBonus) * partyMultiplier;
      appliedAmount = Math.floor(amount * multiplier);
      if (!Number.isSafeInteger(appliedAmount) || appliedAmount < 1 || appliedAmount > MAX_SINGLE_MUTATION_FC || multiplier > MAX_EARNING_MULTIPLIER) {
        throw new DomainError("This reward is too large to process safely.", "INVALID_REWARD_AMOUNT");
      }
      const recent = await client.query(
        "SELECT COUNT(*)::int AS count, COALESCE(SUM(COALESCE(NULLIF(metadata->>'baseAmount','')::numeric,delta::numeric)),0)::numeric AS base_total " +
        "FROM economy_ledger WHERE guild_id=$1 AND user_id=$2 AND delta>0 AND reason=ANY($3::text[]) AND created_at>NOW()-INTERVAL '60 seconds'",
        [guildId,userId,Array.from(MULTIPLIED_EARNING_REASONS)]
      );
      const burst = inspectRewardBurst({
        recentCount:Number(recent.rows?.[0]?.count || 0),
        recentBase:Number(recent.rows?.[0]?.base_total || 0),
        currentBase:amount
      });
      if (burst.blocked) {
        await this.reportEconomyIncident(guildId,userId,"economy_reward_burst",
          "A burst of FC rewards exceeded the hard per-minute economy threshold. The latest reward was blocked.",
          { actionType:"reward_burst",recentRewards:burst.count,baseAmount:burst.baseTotal,riskScore:100 })
          .catch((error) => console.warn("[economy-guard] Could not persist burst alert:",error.message));
        throw new DomainError("Your recent reward activity exceeded the economy safety limit. Please contact an administrator.","ECONOMY_REWARD_BURST");
      }
      if (burst.alert) {
        this.reportEconomyIncident(guildId,userId,"economy_reward_burst",
          "Unusually frequent or high-value FC rewards were detected. No automatic punishment was applied.",
          { actionType:"reward_burst",recentRewards:burst.count,baseAmount:burst.baseTotal,riskScore:burst.score })
          .catch((error) => console.warn("[economy-guard] Could not persist burst alert:",error.message));
      }
    }

    // The wallet has a display/spending ceiling, not an income ceiling. Keep as
    // much as possible in the wallet and automatically bank the overflow so a
    // full wallet never causes a completed reward to fail.
    const currentBank = Number(result.rows[0].bank);
    let nextWallet = currentWallet, nextBank = currentBank, walletDelta = 0, bankDelta = 0;
    if (reason === "bank_deposit") {
      const deposit = -appliedAmount;
      if (deposit < 1 || currentWallet < deposit) throw new DomainError("Your wallet does not contain enough FC.", "INSUFFICIENT_FUNDS");
      if (currentBank + deposit > maxWallet) throw new DomainError("That deposit would exceed the bank limit.", "BANK_LIMIT");
      walletDelta = -deposit; bankDelta = deposit;
    } else if (reason === "bank_withdrawal") {
      const withdrawal = appliedAmount;
      if (currentBank < withdrawal) throw new DomainError("Your bank does not contain enough FC.", "INSUFFICIENT_FUNDS");
      if (currentWallet + withdrawal > maxWallet) throw new DomainError("That withdrawal would exceed the wallet limit.", "WALLET_LIMIT");
      walletDelta = withdrawal; bankDelta = -withdrawal;
    } else if (appliedAmount > 0) {
      nextWallet = Math.min(currentWallet,maxWallet);
      const recoveredOverflow = Math.max(0,currentWallet-maxWallet);
      walletDelta = Math.min(appliedAmount,Math.max(0,maxWallet-nextWallet));
      bankDelta = recoveredOverflow + appliedAmount - walletDelta;
    } else {
      walletDelta = appliedAmount;
    }
    nextWallet += walletDelta;
    nextBank += bankDelta;
    if (!Number.isSafeInteger(nextWallet) || !Number.isSafeInteger(nextBank) || nextWallet < 0 || nextBank < 0) {
      throw new DomainError("This currency change is outside the supported balance range.","ECONOMY_BALANCE_INVALID");
    }

    let candyDrop = appliedAmount > 0
      ? calculateCandyDrop(reason, gear.candyDropBonus || 0, Math.random(), Math.random(), Number(result.rows[0].level) || 1)
      : null;
    let adminAbuseEvent = null;
    if (dropEligible) {
      const eventResult = await client.query(
        "SELECT id,event_type,name FROM admin_abuse_events WHERE guild_id=$1 AND status='active' AND starts_at<=NOW() AND ends_at>NOW() ORDER BY created_at DESC LIMIT 1",
        [guildId]
      );
      adminAbuseEvent = eventResult.rows[0] || null;
      if (adminAbuseEvent?.event_type === "candy_storm") {
        const bonusCandy = randomInt(1, 2);
        candyDrop = { ...(candyDrop || {}), amount: Number(candyDrop?.amount || 0) + bonusCandy, eventBonus: bonusCandy };
      }
    }
    const lifetimeEarned = LIFETIME_EARNING_REASONS.has(reason) ? Math.max(0, appliedAmount) : 0;
    const lifetimeSpent = LIFETIME_SPENDING_REASONS.has(reason) ? Math.max(0, -appliedAmount) : 0;
    await client.query(
      "UPDATE players SET wallet = $3, bank = $4, lifetime_earned = lifetime_earned + $5, lifetime_spent = lifetime_spent + $6, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId, nextWallet, nextBank, lifetimeEarned, lifetimeSpent]
    );
    await client.query(
      "INSERT INTO economy_ledger (guild_id, user_id, delta, reason, reference, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
      [guildId, userId, appliedAmount, reason, ref, JSON.stringify({
        ...metadata,
        baseAmount: amount,
        appliedMultiplier: amount > 0 && appliedAmount !== amount ? appliedAmount / amount : 1,
        playerLevel: Number(result.rows[0].level) || 1,
        levelIncomeMultiplier: amount > 0 && earningEligible ? getLevelEarningMultiplier(result.rows[0].level) : 1,
        economyEventMultiplier: amount > 0 && earningEligible ? (partyMultiplier || 1) : 1,
        economyEventName: amount > 0 && earningEligible ? (party?.name || null) : null,
        walletCredit: walletDelta,
        bankedAmount: bankDelta,
        candyDrop: candyDrop ? candyDrop.amount : 0,
        adminAbuseEvent: adminAbuseEvent?.name || null,
        adminAbuseCandyBonus: candyDrop?.eventBonus || 0
      })]
    );
    if (candyDrop) {
      await client.query(
        "INSERT INTO event_wallets (guild_id, user_id, event_id, candy, points) VALUES ($1, $2, $3, $4, 0) " +
        "ON CONFLICT (guild_id, user_id, event_id) DO UPDATE SET candy = event_wallets.candy + EXCLUDED.candy, updated_at = NOW()",
        [guildId, userId, balancing.halloween.eventId, candyDrop.amount]
      );
    }
    await this.syncSnapshotTx(client,guildId,userId);
    return { duplicate: false, balance: nextWallet, delta: appliedAmount, walletDelta, bankDelta, baseDelta: amount, candyDrop };
  }

  async rollCandyDropTx(client, guildId, userId, reason) {
    const player = await client.query(
      "SELECT level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
      [guildId, userId]
    );
    if (!player.rowCount) return null;
    const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
    const drop = calculateCandyDrop(
      reason, gear.candyDropBonus || 0, Math.random(), Math.random(), Number(player.rows[0].level) || 1
    );
    if (!drop) return null;
    await client.query(
      "INSERT INTO event_wallets (guild_id, user_id, event_id, candy, points) VALUES ($1, $2, $3, $4, 0) " +
      "ON CONFLICT (guild_id, user_id, event_id) DO UPDATE SET candy = event_wallets.candy + EXCLUDED.candy, updated_at = NOW()",
      [guildId, userId, balancing.halloween.eventId, drop.amount]
    );
    return drop;
  }

  async addXpTx(client, guildId, userId, amount, roleIds = [], activityBonus = 0) {
    const baseXp = Number(amount);
    if (!Number.isSafeInteger(baseXp) || baseXp < 0 || baseXp > MAX_BASE_XP_PER_ACTION) {
      await this.reportEconomyIncident(guildId,userId,"economy_xp_manipulation",
        "An XP award fell outside the approved per-action range and was blocked.",
        { actionType:"invalid_xp_award",amount:Number(amount),riskScore:100 })
        .catch((error) => console.warn("[economy-guard] Could not persist XP alert:",error.message));
      throw new DomainError("That XP award is outside approved progression limits.","ECONOMY_XP_INVALID");
    }
    const booster = await client.query(
      "SELECT setting_value FROM guild_settings WHERE guild_id = $1 AND setting_key = 'xpBoosterRoleId'",
      [guildId]
    );
    const hasBooster = booster.rowCount && roleIds.includes(booster.rows[0].setting_value);
    const result = await client.query("SELECT wallet, bank, lifetime_earned, lifetime_spent, level, xp FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
    if (!result.rowCount) return { gained: 0, level: 1, levelsGained: 0 };
    await this.assertSnapshotTx(client,guildId,userId,result.rows[0]);
    const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
    const bonus = Math.max(0,Math.min(0.75,(gear.xpBonus || 0) + Math.max(0,Number(activityBonus) || 0)));
    const liveEventResult = await client.query(
      "SELECT event_type FROM admin_abuse_events WHERE guild_id=$1 AND status='active' AND starts_at<=NOW() AND ends_at>NOW() ORDER BY created_at DESC LIMIT 1",
      [guildId]
    );
    const eventMultiplier = getXpEventMultiplier(liveEventResult.rows?.[0]?.event_type);
    const multiplier = balancing.progression.xpMultiplier * eventMultiplier *
      (hasBooster ? balancing.progression.roleBoosterMultiplier : 1) * (1 + bonus);
    const gained = Math.max(0, Math.floor(baseXp * multiplier));
    if (!Number.isSafeInteger(gained) || gained > MAX_SINGLE_XP_GAIN) {
      await this.reportEconomyIncident(guildId,userId,"economy_xp_manipulation",
        "A calculated XP award exceeded the verified multiplier ceiling and was blocked.",
        { actionType:"invalid_xp_multiplier",baseXp,gained,riskScore:100 })
        .catch((error) => console.warn("[economy-guard] Could not persist XP alert:",error.message));
      throw new DomainError("The calculated XP award is outside approved progression limits.","ECONOMY_XP_INVALID");
    }
    let level = Number(result.rows[0].level);
    let xp = Number(result.rows[0].xp) + gained;
    let levelsGained = 0;
    while (level < balancing.progression.maxLevel && xp >= levelXpRequired(level)) {
      xp -= levelXpRequired(level);
      level += 1;
      levelsGained += 1;
    }
    if (level >= balancing.progression.maxLevel) xp = 0;
    await client.query("UPDATE players SET level = $3, xp = $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [guildId, userId, level, xp]);
    await this.syncSnapshotTx(client,guildId,userId);
    return { gained, multiplier, level, levelsGained, xp, nextLevelXp: levelXpRequired(level) };
  }

  async scavenge(guildId, userId, roleIds = []) {
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const player = await client.query("SELECT level FROM players WHERE guild_id=$1 AND user_id=$2 FOR UPDATE", [guildId,userId]);
      const gear = this.inventory ? await this.inventory.getEffectsTx(client,guildId,userId) : {};
      const cooldownMs = 30 * 60 * 1000;
      await claimCooldownTx(client,guildId,userId,"scavenge",cooldownMs);
      const baseAmount = randomInt(250,550) + Number(player.rows[0].level || 1) * 6;
      const earning = await this.mutateTx(client,guildId,userId,baseAmount,"scavenge_reward",uuid(),{source:"district_scavenge"});
      const progression = await this.addXpTx(client,guildId,userId,12,roleIds);
      const { trackActionTx } = require("./events");
      await trackActionTx(client,guildId,userId,"scavenge",1);
      await trackActionTx(client,guildId,userId,"wallet_earned",earning.delta);
      return { amount:earning.delta,cooldownMs,progression,candyDrop:earning.candyDrop||null };
    });
  }

  async deliveryContract(guildId, userId, roleIds = []) {
    return transaction(async (client) => {
      await ensurePlayerTx(client,guildId,userId);
      const player = await client.query("SELECT level FROM players WHERE guild_id=$1 AND user_id=$2 FOR UPDATE", [guildId,userId]);
      const cooldownMs = 3 * 60 * 60 * 1000;
      await claimCooldownTx(client,guildId,userId,"delivery_contract",cooldownMs);
      const baseAmount = randomInt(750,1400) + Number(player.rows[0].level || 1) * 10;
      const earning = await this.mutateTx(client,guildId,userId,baseAmount,"delivery_contract_reward",uuid(),{source:"courier_contract"});
      const progression = await this.addXpTx(client,guildId,userId,28,roleIds);
      const { trackActionTx } = require("./events");
      await trackActionTx(client,guildId,userId,"delivery_contract",1);
      await trackActionTx(client,guildId,userId,"wallet_earned",earning.delta);
      return { amount:earning.delta,cooldownMs,progression,candyDrop:earning.candyDrop||null };
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
      return { amount: earning.delta, cooldownMs, progression, candyDrop: earning.candyDrop || null };
    });
  }
}

module.exports = { EconomyService, ensurePlayerTx, getPlayer, getLeaderboard, calculateCandyDrop, getXpEventMultiplier };
