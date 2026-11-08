const { transaction } = require("../database/pool");
const settings = require("../config/settings");
const balancing = require("../config/game-balancing");
const { DomainError, uuid, randomInt, claimCooldownTx, levelXpRequired, getRebirthMultiplier, getLevelEarningMultiplier, applyCooldownReduction } = require("../utils/core");

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

function calculateCandyDrop(reason, gearBonus = 0, chanceRoll = Math.random(), amountRoll = Math.random(), rebirths = 0) {
  const rule = balancing.candyDrops[reason];
  if (!rule) return null;
  const equippedBonus = Math.max(0, Math.min(0.20, Number(gearBonus) || 0));
  const rebirthBonus = Math.min(0.20, Math.max(0, Math.floor(Number(rebirths) || 0)) * 0.02);
  const dropChance = Math.min(0.60, Number(rule.chance) + equippedBonus + rebirthBonus);
  if (chanceRoll >= dropChance) return null;
  const amount = rule.min + Math.floor(amountRoll * (rule.max - rule.min + 1));
  return { amount, chance: dropChance, baseChance: Number(rule.chance), gearBonus: equippedBonus, rebirthBonus };
}

function getRebirthRequirements(player, claimedQuestCount = 0, inventoryRows = [], candyBalance = 0) {
  const rules = balancing.rebirth;
  const rebirths = Math.max(0, Math.min(balancing.progression.maxRebirths, Math.floor(Number(player.prestige) || 0)));
  const wealth = Number(player.wallet || 0) + Number(player.bank || 0);
  const walletRequired = Math.ceil(rules.firstWalletRequirement + rebirths * rules.walletRequirementStep);
  const levelRequired = Math.min(balancing.progression.maxLevel, Math.ceil(rules.firstLevelRequirement + rebirths * rules.levelRequirementGrowth));
  const questClaimsRequired = Math.min(rules.maxQuestClaimsRequirement, rules.firstQuestClaimsRequirement + Math.floor(rebirths / rules.questClaimsGrowthEvery));
  const jobLevelRequired = Math.min(rules.maxJobLevelRequirement, rules.firstJobLevelRequirement + Math.floor(rebirths / rules.jobLevelGrowthEvery));
  const workShiftsRequired = Math.min(rules.maxWorkShiftsRequirement, rules.firstWorkShiftsRequirement + Math.floor(rebirths / rules.workShiftsGrowthEvery));
  const gearMilestone = rebirths >= rules.itemRequirementsStartAt;
  const gearItemsRequired = gearMilestone
    ? Math.min(rules.maxGearItemsRequirement, rules.firstGearItemsRequirement + Math.floor((rebirths - rules.itemRequirementsStartAt) / rules.gearItemsGrowthEvery)) : 0;
  const candyItemMilestone = rebirths >= rules.candyItemRequirementsStartAt;
  const candyItemsRequired = candyItemMilestone
    ? Math.min(rules.maxCandyItemsRequirement, rules.firstCandyItemsRequirement + Math.floor((rebirths - rules.candyItemRequirementsStartAt) / rules.candyItemsGrowthEvery)) : 0;
  const candyBalanceMilestone = rebirths >= rules.candyBalanceRequirementsStartAt;
  const candyBalanceRequired = candyBalanceMilestone
    ? Math.min(rules.maxCandyBalanceRequirement, rules.firstCandyBalanceRequirement + Math.floor((rebirths - rules.candyBalanceRequirementsStartAt) / rules.candyBalanceGrowthEvery) * rules.candyBalanceGrowth) : 0;
  const upgradeMilestone = rebirths >= rules.gearUpgradeRequirementsStartAt;
  const gearUpgradeLevelsRequired = upgradeMilestone
    ? Math.min(rules.maxGearUpgradeLevelsRequirement, rules.firstGearUpgradeLevelsRequirement + Math.floor((rebirths - rules.gearUpgradeRequirementsStartAt) / rules.gearUpgradeLevelsGrowthEvery)) : 0;
  const currentJob = balancing.jobs.find((job) => job.id === player.job_id) || null;
  const claimed = Math.max(0, Number(claimedQuestCount) || 0);
  const currentJobLevel = Number(player.job_level || 1);
  const workShiftsCompleted = Number(player.rebirth_work_count || 0);
  const rows = Array.isArray(inventoryRows) ? inventoryRows : [];
  const gearIds = new Set(balancing.items.filter((item) => item.type === "equipment" && item.rebirthEligible !== false && !item.boosterOnly).map((item) => item.id));
  const candyIds = new Set(balancing.halloween.shop.map((item) => item.id));
  const ownedGearIds = new Set(rows.filter((row) => Number(row.quantity ?? 1) > 0).map((row) => row.item_id || row.itemId).filter((id) => gearIds.has(id)));
  const ownedCandyItemIds = new Set(rows.filter((row) => Number(row.quantity ?? 1) > 0).map((row) => row.item_id || row.itemId).filter((id) => candyIds.has(id)));
  const gearUpgradeLevels = rows.reduce((sum, row) => {
    const id = row.item_id || row.itemId;
    return sum + (gearIds.has(id) ? Math.max(0, Number(row.upgrade_level ?? row.upgradeLevel) || 0) : 0);
  }, 0);
  const candy = Math.max(0, Number(candyBalance) || 0);
  const checks = {
    wealth: wealth >= walletRequired,
    level: Number(player.level || 1) >= levelRequired,
    quests: claimed >= questClaimsRequired,
    career: Boolean(currentJob),
    careerLevel: Boolean(currentJob) && currentJobLevel >= jobLevelRequired,
    workShifts: workShiftsCompleted >= workShiftsRequired,
    gearItems: ownedGearIds.size >= gearItemsRequired,
    candyItems: ownedCandyItemIds.size >= candyItemsRequired,
    candyBalance: candy >= candyBalanceRequired,
    gearUpgrades: gearUpgradeLevels >= gearUpgradeLevelsRequired,
    maxRebirth: rebirths < balancing.progression.maxRebirths
  };
  return {
    rebirths, wealth, wallet: Number(player.wallet || 0), bank: Number(player.bank || 0),
    level: Number(player.level || 1), multiplier: getRebirthMultiplier(rebirths), nextMultiplier: getRebirthMultiplier(rebirths + 1),
    walletRequired, levelRequired, questClaimsCount: claimed, questClaimsRequired,
    currentJob, currentJobLevel, jobLevelRequired, workShiftsCompleted, workShiftsRequired,
    gearItemsCount: ownedGearIds.size, gearItemsRequired, candyItemsCount: ownedCandyItemIds.size, candyItemsRequired,
    candyBalance: candy, candyBalanceRequired, gearUpgradeLevels, gearUpgradeLevelsRequired,
    checks, eligible: Object.values(checks).every(Boolean), maxRebirths: balancing.progression.maxRebirths
  };
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

  async getRebirthHistory(guildId, userId, limit = 5) {
    const result = await this.pool.query(
      "SELECT created_at, metadata FROM economy_ledger WHERE guild_id = $1 AND user_id = $2 " +
      "AND reason = 'rebirth_reset' ORDER BY created_at DESC LIMIT $3",
      [guildId, userId, Math.max(1, Math.min(10, Math.floor(Number(limit) || 5)))]
    );
    return result.rows;
  }

  async mutateTx(client, guildId, userId, delta, reason, reference, metadata = {}) {
    const amount = Math.trunc(Number(delta));
    if (!Number.isSafeInteger(amount) || amount === 0) throw new DomainError("Amount must be a non-zero whole number.", "INVALID_AMOUNT");
    await ensurePlayerTx(client, guildId, userId);
    const result = await client.query("SELECT wallet, prestige, job_id, level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
    const ref = reference || uuid();
    const existing = await client.query("SELECT id FROM economy_ledger WHERE guild_id = $1 AND user_id = $2 AND reference = $3", [guildId, userId, ref]);
    if (existing.rowCount) return { duplicate: true, balance: Number(result.rows[0].wallet), delta: 0, candyDrop: null };

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
        getRebirthMultiplier(result.rows[0].prestige) * levelMultiplier * (1 + incomeBonus) * partyMultiplier;
      appliedAmount = Math.floor(amount * multiplier);
      if (!Number.isSafeInteger(appliedAmount) || appliedAmount < 1) {
        throw new DomainError("This reward is too large to process safely.", "INVALID_REWARD_AMOUNT");
      }
    }

    // The wallet has a display/spending ceiling, not an income ceiling. Keep as
    // much as possible in the wallet and automatically bank the overflow so a
    // full wallet never causes a completed reward to fail.
    const normalizedWallet = appliedAmount > 0 ? Math.min(currentWallet, maxWallet) : currentWallet;
    const recoveredWalletOverflow = appliedAmount > 0 ? Math.max(0, currentWallet - maxWallet) : 0;
    const walletDelta = appliedAmount > 0
      ? Math.min(appliedAmount, Math.max(0, maxWallet - normalizedWallet))
      : appliedAmount;
    const bankDelta = appliedAmount > 0
      ? recoveredWalletOverflow + appliedAmount - walletDelta
      : 0;
    const next = normalizedWallet + walletDelta;
    if (next < 0) throw new DomainError("You do not have enough FS Coins in your wallet.", "INSUFFICIENT_FUNDS");

    const candyDrop = appliedAmount > 0
      ? calculateCandyDrop(reason, gear.candyDropBonus || 0, Math.random(), Math.random(), Number(result.rows[0].prestige) || 0)
      : null;
    const lifetimeEarned = LIFETIME_EARNING_REASONS.has(reason) ? Math.max(0, appliedAmount) : 0;
    const lifetimeSpent = LIFETIME_SPENDING_REASONS.has(reason) ? Math.max(0, -appliedAmount) : 0;
    await client.query(
      "UPDATE players SET wallet = $3, bank = bank + $4, lifetime_earned = lifetime_earned + $5, lifetime_spent = lifetime_spent + $6, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId, next, bankDelta, lifetimeEarned, lifetimeSpent]
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
        candyDrop: candyDrop ? candyDrop.amount : 0
      })]
    );
    if (candyDrop) {
      await client.query(
        "INSERT INTO event_wallets (guild_id, user_id, event_id, candy, points) VALUES ($1, $2, $3, $4, 0) " +
        "ON CONFLICT (guild_id, user_id, event_id) DO UPDATE SET candy = event_wallets.candy + EXCLUDED.candy, updated_at = NOW()",
        [guildId, userId, balancing.halloween.eventId, candyDrop.amount]
      );
    }
    return { duplicate: false, balance: next, delta: appliedAmount, walletDelta, bankDelta, baseDelta: amount, candyDrop };
  }

  async rollCandyDropTx(client, guildId, userId, reason) {
    const player = await client.query(
      "SELECT prestige FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
      [guildId, userId]
    );
    if (!player.rowCount) return null;
    const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
    const drop = calculateCandyDrop(
      reason, gear.candyDropBonus || 0, Math.random(), Math.random(), Number(player.rows[0].prestige) || 0
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
    while (level < balancing.progression.maxLevel && xp >= levelXpRequired(level)) {
      xp -= levelXpRequired(level);
      level += 1;
      levelsGained += 1;
    }
    if (level >= balancing.progression.maxLevel) xp = 0;
    await client.query("UPDATE players SET level = $3, xp = $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2", [guildId, userId, level, xp]);
    return { gained, multiplier, level, levelsGained, xp, nextLevelXp: levelXpRequired(level) };
  }

  async getRebirthStatus(guildId, userId) {
    const [player, claims, inventory, candy] = await Promise.all([
      getPlayer(this.pool, guildId, userId),
      this.pool.query(
        "SELECT COUNT(*)::int AS claimed_count FROM event_claims WHERE guild_id = $1 AND user_id = $2 " +
        "AND quest_id NOT LIKE 'weekly_messages:%'",
        [guildId, userId]
      ),
      this.pool.query(
        "SELECT item_id, quantity, upgrade_level FROM inventory WHERE guild_id = $1 AND user_id = $2 AND quantity > 0",
        [guildId, userId]
      ),
      this.pool.query(
        "SELECT candy FROM event_wallets WHERE guild_id = $1 AND user_id = $2 AND event_id = $3",
        [guildId, userId, balancing.halloween.eventId]
      )
    ]);
    const status = getRebirthRequirements(
      player,
      claims.rows[0]?.claimed_count || 0,
      inventory.rows,
      candy.rows[0]?.candy || 0
    );
    const next = getRebirthRequirements(
      { wallet: 0, bank: 0, level: 1, prestige: status.rebirths + 1, job_id: null, job_level: 1, rebirth_work_count: 0 },
      0, [], 0
    );
    return {
      ...status,
      nextWalletRequired: next.walletRequired,
      nextLevelRequired: next.levelRequired,
      nextQuestClaimsRequired: next.questClaimsRequired,
      nextJobLevelRequired: next.jobLevelRequired,
      nextWorkShiftsRequired: next.workShiftsRequired,
      nextGearItemsRequired: next.gearItemsRequired,
      nextCandyItemsRequired: next.candyItemsRequired,
      nextCandyBalanceRequired: next.candyBalanceRequired,
      nextGearUpgradeLevelsRequired: next.gearUpgradeLevelsRequired
    };
  }

  async rebirth(guildId, userId) {
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const playerResult = await client.query(
        "SELECT wallet, bank, level, prestige, job_id, job_level, rebirth_work_count " +
        "FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      const player = playerResult.rows[0];
      const [claims, inventory, candy] = await Promise.all([
        client.query(
          "SELECT COUNT(*)::int AS claimed_count FROM event_claims WHERE guild_id = $1 AND user_id = $2 " +
          "AND quest_id NOT LIKE 'weekly_messages:%'",
          [guildId, userId]
        ),
        client.query(
          "SELECT item_id, quantity, upgrade_level FROM inventory WHERE guild_id = $1 AND user_id = $2 AND quantity > 0",
          [guildId, userId]
        ),
        client.query(
          "SELECT candy FROM event_wallets WHERE guild_id = $1 AND user_id = $2 AND event_id = $3 FOR UPDATE",
          [guildId, userId, balancing.halloween.eventId]
        )
      ]);
      if (Number(player.prestige) >= balancing.progression.maxRebirths) {
        throw new DomainError("You have reached the maximum of " + balancing.progression.maxRebirths + " rebirths.", "MAX_REBIRTHS_REACHED");
      }
      const requirements = getRebirthRequirements(
        player,
        claims.rows[0]?.claimed_count || 0,
        inventory.rows,
        candy.rows[0]?.candy || 0
      );

      const failures = [
        ["wealth", "You need " + requirements.walletRequired.toLocaleString() + " FC in combined wallet and bank savings.", "REBIRTH_FUNDS_REQUIRED"],
        ["level", "You need player level " + requirements.levelRequired + ".", "REBIRTH_LEVEL_REQUIRED"],
        ["quests", "You need " + requirements.questClaimsRequired + " claimed normal event quest rewards.", "REBIRTH_EVENT_REWARDS_REQUIRED"],
        ["career", "Apply for a career before rebirthing.", "REBIRTH_JOB_REQUIRED"],
        ["careerLevel", "Your career must reach job level " + requirements.jobLevelRequired + ".", "REBIRTH_JOB_LEVEL_REQUIRED"],
        ["workShifts", "Complete " + requirements.workShiftsRequired + " work shifts in this run.", "REBIRTH_WORK_REQUIRED"],
        ["gearItems", "Own " + requirements.gearItemsRequired + " different equipment items. You currently own " + requirements.gearItemsCount + ".", "REBIRTH_GEAR_REQUIRED"],
        ["candyItems", "Collect " + requirements.candyItemsRequired + " different Candy-shop collectibles. You currently own " + requirements.candyItemsCount + ".", "REBIRTH_CANDY_ITEMS_REQUIRED"],
        ["candyBalance", "Keep at least " + requirements.candyBalanceRequired + " unspent Candy. Your balance is " + requirements.candyBalance + ".", "REBIRTH_CANDY_REQUIRED"],
        ["gearUpgrades", "Reach a combined " + requirements.gearUpgradeLevelsRequired + " gear upgrade levels. You currently have " + requirements.gearUpgradeLevels + ".", "REBIRTH_GEAR_UPGRADE_REQUIRED"],
        ["maxRebirth", "You have reached the maximum of " + balancing.progression.maxRebirths + " rebirths.", "MAX_REBIRTHS_REACHED"]
      ];
      for (const [key, message, code] of failures) {
        if (!requirements.checks[key]) throw new DomainError(message, code);
      }

      const newRebirths = requirements.rebirths + 1;
      const reset = await client.query(
        "UPDATE players SET wallet = $3, bank = 0, level = 1, xp = 0, job_id = NULL, job_level = 1, job_xp = 0, " +
        "rebirth_work_count = 0, reputation = 0, prestige = $4, last_rebirth_at = NOW(), updated_at = NOW() " +
        "WHERE guild_id = $1 AND user_id = $2 RETURNING wallet, level, prestige",
        [guildId, userId, balancing.rebirth.startingWallet, newRebirths]
      );
      await client.query("DELETE FROM cooldowns WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
      await client.query(
        "INSERT INTO economy_ledger (guild_id, user_id, delta, reason, reference, metadata) VALUES ($1, $2, $3, 'rebirth_reset', $4, $5::jsonb)",
        [guildId, userId, balancing.rebirth.startingWallet - Number(player.wallet), uuid(), JSON.stringify({
          previousWallet: Number(player.wallet), previousBank: Number(player.bank),
          previousLevel: Number(player.level), previousJobId: player.job_id,
          previousJobLevel: Number(player.job_level), rebirths: newRebirths,
          workShiftsCompleted: requirements.workShiftsCompleted,
          questClaimsCount: requirements.questClaimsCount,
          gearItemsCount: requirements.gearItemsCount,
          candyItemsCount: requirements.candyItemsCount,
          candyBalance: requirements.candyBalance,
          gearUpgradeLevels: requirements.gearUpgradeLevels
        })]
      );
      const next = getRebirthRequirements(
        { wallet: 0, bank: 0, level: 1, prestige: newRebirths, job_id: null, job_level: 1, rebirth_work_count: 0 },
        0, [], 0
      );
      return {
        rebirths: newRebirths,
        multiplier: getRebirthMultiplier(newRebirths),
        previousWealth: requirements.wealth,
        wallet: Number(reset.rows[0].wallet),
        level: Number(reset.rows[0].level),
        nextWalletRequired: next.walletRequired,
        nextLevelRequired: next.levelRequired,
        nextQuestClaimsRequired: next.questClaimsRequired,
        nextJobLevelRequired: next.jobLevelRequired,
        nextWorkShiftsRequired: next.workShiftsRequired,
        nextGearItemsRequired: next.gearItemsRequired,
        nextCandyItemsRequired: next.candyItemsRequired,
        nextCandyBalanceRequired: next.candyBalanceRequired,
        nextGearUpgradeLevelsRequired: next.gearUpgradeLevelsRequired
      };
    });
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

module.exports = { EconomyService, ensurePlayerTx, getPlayer, getLeaderboard, getRebirthRequirements, calculateCandyDrop };
