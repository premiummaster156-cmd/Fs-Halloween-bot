const { transaction } = require("../database/pool");
const settings = require("../config/settings");
const balancing = require("../config/game-balancing");
const { DomainError, uuid, randomInt, claimCooldownTx, levelXpRequired } = require("../utils/core");

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
    "SELECT user_id, wallet, bank, level, xp, lifetime_earned, (" + column + ") AS score FROM players WHERE guild_id = $1 ORDER BY score DESC, user_id ASC LIMIT $2",
    [guildId, Math.max(1, Math.min(25, limit))]
  );
  return result.rows;
}

class EconomyService {
  constructor(pool) { this.pool = pool; }
  transact(callback) { return transaction(callback); }
  ensurePlayerTx(client, guildId, userId) { return ensurePlayerTx(client, guildId, userId); }
  claimCooldownTx(client, guildId, userId, key, ms) { return claimCooldownTx(client, guildId, userId, key, ms); }

  async getBalance(guildId, userId) {
    const player = await getPlayer(this.pool, guildId, userId);
    return { wallet: Number(player.wallet), bank: Number(player.bank), total: Number(player.wallet) + Number(player.bank) };
  }

  async mutateTx(client, guildId, userId, delta, reason, reference, metadata = {}) {
    const amount = Math.trunc(Number(delta));
    if (!Number.isSafeInteger(amount) || amount === 0) throw new DomainError("Amount must be a non-zero whole number.", "INVALID_AMOUNT");
    await ensurePlayerTx(client, guildId, userId);
    const result = await client.query("SELECT wallet FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
    const ref = reference || uuid();
    const existing = await client.query("SELECT id FROM economy_ledger WHERE guild_id = $1 AND user_id = $2 AND reference = $3", [guildId, userId, ref]);
    if (existing.rowCount) return { duplicate: true, balance: Number(result.rows[0].wallet) };
    const next = Number(result.rows[0].wallet) + amount;
    if (next < 0) throw new DomainError("You do not have enough Fuk Coins in your wallet.", "INSUFFICIENT_FUNDS");
    if (next > balancing.economy.maxWallet) throw new DomainError("That amount would exceed the wallet limit.", "WALLET_LIMIT");
    await client.query(
      "UPDATE players SET wallet = $3, lifetime_earned = lifetime_earned + $4, lifetime_spent = lifetime_spent + $5, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId, next, Math.max(0, amount), Math.max(0, -amount)]
    );
    await client.query(
      "INSERT INTO economy_ledger (guild_id, user_id, delta, reason, reference, metadata) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
      [guildId, userId, amount, reason, ref, JSON.stringify(metadata)]
    );
    return { duplicate: false, balance: next, delta: amount };
  }

  async addXpTx(client, guildId, userId, amount) {
    const gained = Math.max(0, Math.floor(amount));
    const result = await client.query("SELECT level, xp FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
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
    return { gained, level, levelsGained, xp, nextLevelXp: levelXpRequired(level) };
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

  async daily(guildId, userId) {
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      await claimCooldownTx(client, guildId, userId, "daily", balancing.economy.dailyCooldownMs);
      const row = await client.query("SELECT level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      const amount = randomInt(balancing.economy.dailyMin, balancing.economy.dailyMax) + Number(row.rows[0].level) * 8;
      await this.mutateTx(client, guildId, userId, amount, "daily_reward", uuid(), {});
      const progression = await this.addXpTx(client, guildId, userId, balancing.economy.dailyXp);
      const events = require("./events");
      await events.trackActionTx(client, guildId, userId, "daily", 1);
      await events.trackActionTx(client, guildId, userId, "wallet_earned", amount);
      return { amount, progression };
    });
  }
}

module.exports = { EconomyService, ensurePlayerTx, getPlayer, getLeaderboard };
