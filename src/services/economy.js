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

function getRebirthRequirements(player, claimedQuestCount = 0, inventoryRows = [], candyBalance = 0) {
  const rebirths = Math.max(0, Number(player.prestige) || 0);
  const wealth = Number(player.wallet || 0) + Number(player.bank || 0);
  const walletRequired = Math.min(Number.MAX_SAFE_INTEGER,
    Math.ceil(balancing.rebirth.firstWalletRequirement * Math.pow(balancing.rebirth.walletRequirementGrowth, rebirths)));
  const levelRequired = Math.min(100,
    balancing.rebirth.firstLevelRequirement + rebirths * balancing.rebirth.levelRequirementGrowth);
  const questClaimsRequired = Math.min(
    balancing.halloween.quests.length,
    balancing.rebirth.firstQuestClaimsRequirement + rebirths * balancing.rebirth.questClaimsGrowth
  );
  const jobLevelRequired = Math.min(30,
    balancing.rebirth.firstJobLevelRequirement + Math.floor(rebirths / balancing.rebirth.jobLevelGrowthEvery));
  const workShiftsRequired = Math.min(Number.MAX_SAFE_INTEGER,
    balancing.rebirth.firstWorkShiftsRequirement + rebirths * balancing.rebirth.workShiftsGrowth);

  // Equipment and Candy-shop milestones start only when preparing for rebirth #4.
  const itemMilestone = rebirths >= balancing.rebirth.itemRequirementsStartAt;
  const itemSteps = itemMilestone ? rebirths - balancing.rebirth.itemRequirementsStartAt : 0;
  const gearItemsRequired = itemMilestone
    ? Math.min(balancing.items.filter((item) => item.type === "equipment").length,
      balancing.rebirth.firstGearItemsRequirement + itemSteps * balancing.rebirth.gearItemsGrowth)
    : 0;
  const candyItemsRequired = itemMilestone
    ? Math.min(balancing.halloween.shop.length,
      balancing.rebirth.firstCandyItemsRequirement + itemSteps * balancing.rebirth.candyItemsGrowth)
    : 0;
  const candyBalanceRequired = itemMilestone
    ? balancing.rebirth.firstCandyBalanceRequirement + itemSteps * balancing.rebirth.candyBalanceGrowth
    : 0;
  const gearUpgradeLevelsRequired = rebirths >= balancing.rebirth.gearUpgradeRequirementsStartAt
    ? balancing.rebirth.firstGearUpgradeLevelsRequirement +
      (rebirths - balancing.rebirth.gearUpgradeRequirementsStartAt) * balancing.rebirth.gearUpgradeLevelsGrowth
    : 0;

  const currentJob = balancing.jobs.find((job) => job.id === player.job_id) || null;
  const claimed = Math.max(0, Number(claimedQuestCount) || 0);
  const currentJobLevel = Number(player.job_level || 1);
  const workShiftsCompleted = Number(player.rebirth_work_count || 0);
  const rows = Array.isArray(inventoryRows) ? inventoryRows : [];
  const ownedGearIds = new Set(rows
    .filter((row) => Number(row.quantity ?? 1) > 0)
    .map((row) => row.item_id || row.itemId)
    .filter((id) => balancing.items.some((item) => item.id === id && item.type === "equipment")));
  const ownedCandyItemIds = new Set(rows
    .filter((row) => Number(row.quantity ?? 1) > 0)
    .map((row) => row.item_id || row.itemId)
    .filter((id) => balancing.halloween.shop.some((item) => item.id === id)));
  const gearUpgradeLevels = rows.reduce((sum, row) => {
    const id = row.item_id || row.itemId;
    return sum + (balancing.items.some((item) => item.id === id && item.type === "equipment")
      ? Math.max(0, Number(row.upgrade_level ?? row.upgradeLevel) || 0) : 0);
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
    gearUpgrades: gearUpgradeLevels >= gearUpgradeLevelsRequired
  };
  return {
    rebirths, wealth, wallet: Number(player.wallet || 0), bank: Number(player.bank || 0),
    level: Number(player.level || 1),
    multiplier: getRebirthMultiplier(rebirths),
    nextMultiplier: getRebirthMultiplier(rebirths + 1),
    walletRequired, levelRequired,
    questClaimsCount: claimed, questClaimsRequired,
    currentJob, currentJobLevel, jobLevelRequired,
    workShiftsCompleted, workShiftsRequired,
    gearItemsCount: ownedGearIds.size, gearItemsRequired,
    candyItemsCount: ownedCandyItemIds.size, candyItemsRequired,
    candyBalance: candy, candyBalanceRequired,
    gearUpgradeLevels, gearUpgradeLevelsRequired,
    checks, eligible: Object.values(checks).every(Boolean)
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

  async mutateTx(client, guildId, userId, delta, reason, reference, metadata = {}) {
    const amount = Math.trunc(Number(delta));
    if (!Number.isSafeInteger(amount) || amount === 0) throw new DomainError("Amount must be a non-zero whole number.", "INVALID_AMOUNT");
    await ensurePlayerTx(client, guildId, userId);
    const result = await client.query("SELECT wallet, prestige FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
    const ref = reference || uuid();
    const existing = await client.query("SELECT id FROM economy_ledger WHERE guild_id = $1 AND user_id = $2 AND reference = $3", [guildId, userId, ref]);
    if (existing.rowCount) return { duplicate: true, balance: Number(result.rows[0].wallet), delta: 0, candyDrop: null };

    const currentWallet = Number(result.rows[0].wallet);
    let appliedAmount = amount;
    const dropEligible = amount > 0 && Boolean(balancing.candyDrops[reason]);
    const earningEligible = amount > 0 && MULTIPLIED_EARNING_REASONS.has(reason);
    const gear = (dropEligible || earningEligible) && this.inventory
      ? await this.inventory.getEffectsTx(client, guildId, userId)
      : {};
    if (earningEligible) {
      const multiplier = getRebirthMultiplier(result.rows[0].prestige) * (1 + (gear.moneyBonus || 0));
      appliedAmount = Math.min(balancing.economy.maxWallet - currentWallet, Math.floor(amount * multiplier));
      if (appliedAmount < 1) throw new DomainError("Your wallet is at its maximum balance.", "WALLET_FULL");
    }
    const next = currentWallet + appliedAmount;
    if (next < 0) throw new DomainError("You do not have enough FS Coins in your wallet.", "INSUFFICIENT_FUNDS");
    if (next > balancing.economy.maxWallet) throw new DomainError("That amount would exceed the wallet limit.", "WALLET_LIMIT");

    const candyDrop = appliedAmount > 0
      ? calculateCandyDrop(reason, gear.candyDropBonus || 0)
      : null;
    await client.query(
      "UPDATE players SET wallet = $3, lifetime_earned = lifetime_earned + $4, lifetime_spent = lifetime_spent + $5, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId, next, Math.max(0, appliedAmount), Math.max(0, -appliedAmount)]
    );
    await client.query(
      "INSERT INTO economy_ledger (guild_id, user_id, delta, reason, reference, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
      [guildId, userId, appliedAmount, reason, ref, JSON.stringify({
        ...metadata,
        baseAmount: amount,
        appliedMultiplier: amount > 0 && appliedAmount !== amount ? appliedAmount / amount : 1,
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
    return { duplicate: false, balance: next, delta: appliedAmount, baseDelta: amount, candyDrop };
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
    if (level >= 100) xp = 0;
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
    return getRebirthRequirements(
      player,
      claims.rows[0]?.claimed_count || 0,
      inventory.rows,
      candy.rows[0]?.candy || 0
    );
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
        ["gearUpgrades", "Reach a combined " + requirements.gearUpgradeLevelsRequired + " gear upgrade levels. You currently have " + requirements.gearUpgradeLevels + ".", "REBIRTH_GEAR_UPGRADE_REQUIRED"]
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
      return { amount: earning.delta, cooldownMs, progression, candyDrop: earning.candyDrop || null };
    });
  }
}

module.exports = { EconomyService, ensurePlayerTx, getPlayer, getLeaderboard, getRebirthRequirements, calculateCandyDrop };
