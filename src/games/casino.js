const balancing = require("../config/game-balancing");
const { randomInt, chance, uuid, casinoPayout, DomainError, claimCooldownTx } = require("../utils/core");
const { ensurePlayerTx } = require("../services/economy");
const { transaction } = require("../database/pool");
const { trackActionTx } = require("../services/events");

class CasinoGame {
  constructor(pool, economy) { this.pool = pool; this.economy = economy; }
  list() { return Object.entries(balancing.casino.games).map(([id, game]) => ({ id, ...game })); }

  async getDailyUsage(guildId, userId) {
    const result = await this.pool.query(
      "SELECT COALESCE(SUM(-delta), 0)::bigint AS wagered FROM economy_ledger " +
      "WHERE guild_id = $1 AND user_id = $2 AND reason = 'casino_bet' " +
      "AND created_at >= NOW() - INTERVAL '24 hours'",
      [guildId, userId]
    );
    const wagered = Number(result.rows[0]?.wagered || 0);
    const limit = balancing.casino.dailyWagerLimit;
    return { wagered, limit, remaining: Math.max(0, limit - wagered) };
  }

  async play(guildId, userId, gameId, bet) {
    const game = balancing.casino.games[gameId];
    const wager = Math.floor(Number(bet));
    if (!game) throw new DomainError("Choose Coin Flip, High Dice, or Slots.", "CASINO_GAME_INVALID");
    if (!Number.isSafeInteger(wager) || wager < balancing.casino.minBet || wager > balancing.casino.maxBet) {
      throw new DomainError(
        "Bet must be between " + balancing.casino.minBet.toLocaleString() + " and " + balancing.casino.maxBet.toLocaleString() + " FC per round.",
        "CASINO_BET_INVALID"
      );
    }

    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const player = await client.query(
        "SELECT level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      if (Number(player.rows[0].level) < game.minLevel) {
        throw new DomainError("You need level " + game.minLevel + " to play " + game.name + ".", "CASINO_LEVEL_REQUIRED");
      }

      // Locking the player row above serializes this member's wagers, preventing
      // simultaneous button/modal submissions from exceeding the rolling limit.
      const usageResult = await client.query(
        "SELECT COALESCE(SUM(-delta), 0)::bigint AS wagered FROM economy_ledger " +
        "WHERE guild_id = $1 AND user_id = $2 AND reason = 'casino_bet' " +
        "AND created_at >= NOW() - INTERVAL '24 hours'",
        [guildId, userId]
      );
      const wagered = Number(usageResult.rows[0].wagered || 0);
      const remaining = Math.max(0, balancing.casino.dailyWagerLimit - wagered);
      if (remaining <= 0) {
        throw new DomainError(
          "You've reached your " + balancing.casino.dailyWagerLimit.toLocaleString() +
          " FC casino wager limit for the last 24 hours. Your limit will recover as earlier wagers pass the 24-hour window.",
          "CASINO_DAILY_LIMIT"
        );
      }
      if (wager > remaining) {
        throw new DomainError(
          "You have " + remaining.toLocaleString() + " FC of casino wagers left in your rolling 24-hour limit. Lower your bet to continue.",
          "CASINO_DAILY_LIMIT"
        );
      }

      await claimCooldownTx(client, guildId, userId, "casino", balancing.casino.cooldownMs);
      const reference = uuid();
      await this.economy.mutateTx(client, guildId, userId, -wager, "casino_bet", reference + ":bet", { gameId });

      let won = false;
      let multiplier = 0;
      let outcome = "No win";
      if (gameId === "coinflip") {
        won = chance(game.winningChance);
        multiplier = won ? game.multiplierHundredths : 0;
        outcome = won ? "The coin landed in your favor." : "The coin missed your side.";
      } else if (gameId === "dice") {
        const roll = randomInt(1, 6);
        won = roll >= 5;
        multiplier = won ? game.multiplierHundredths : 0;
        outcome = "You rolled " + roll + ". " + (won ? "That's a win." : "You needed a 5 or 6.");
      } else {
        const roll = randomInt(0, 999);
        const result = game.outcomes.find((item) => roll <= item.maxRoll) || game.outcomes[game.outcomes.length - 1];
        won = result.multiplierHundredths > 0;
        multiplier = result.multiplierHundredths;
        outcome = result.label + " (roll " + roll + "/999).";
      }

      const payout = won ? casinoPayout(wager, multiplier) : 0;
      if (payout > 0) {
        await this.economy.mutateTx(client, guildId, userId, payout, "casino_payout", reference + ":payout", {
          gameId, wager, multiplier, theoreticalReturnRate: balancing.casino.targetReturnRate
        });
      }
      await trackActionTx(client, guildId, userId, "casino_play", 1);
      if (payout > wager) await trackActionTx(client, guildId, userId, "wallet_earned", payout - wager);

      const totalWagered = wagered + wager;
      return {
        game, gameId, wager, won, payout, net: payout - wager, outcome,
        dailyWagered: totalWagered,
        dailyWagerLimit: balancing.casino.dailyWagerLimit,
        dailyWagerRemaining: Math.max(0, balancing.casino.dailyWagerLimit - totalWagered),
        cooldownMs: balancing.casino.cooldownMs
      };
    });
  }
}
module.exports = { CasinoGame };
