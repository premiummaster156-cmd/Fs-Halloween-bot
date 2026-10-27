const balancing = require("../config/game-balancing");
const { randomInt, chance, uuid, casinoPayout, DomainError, claimCooldownTx } = require("../utils/core");
const { ensurePlayerTx } = require("../services/economy");
const { transaction } = require("../database/pool");
const { trackActionTx } = require("../services/events");

class CasinoGame {
  constructor(pool, economy) { this.pool = pool; this.economy = economy; }
  list() { return Object.entries(balancing.casino.games).map(([id, game]) => ({ id, ...game })); }

  async play(guildId, userId, gameId, bet) {
    const game = balancing.casino.games[gameId];
    const wager = Math.floor(Number(bet));
    if (!game) throw new DomainError("Choose coinflip, dice, or slots.", "CASINO_GAME_INVALID");
    if (!Number.isSafeInteger(wager) || wager < balancing.casino.minBet || wager > balancing.casino.maxBet) {
      throw new DomainError("Bet must be between " + balancing.casino.minBet.toLocaleString() + " and " + balancing.casino.maxBet.toLocaleString() + " FC.", "CASINO_BET_INVALID");
    }
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const player = await client.query("SELECT level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      if (Number(player.rows[0].level) < game.minLevel) throw new DomainError("You need level " + game.minLevel + " to play " + game.name + ".", "CASINO_LEVEL_REQUIRED");
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
      if (payout > 0) await this.economy.mutateTx(client, guildId, userId, payout, "casino_payout", reference + ":payout", { gameId, wager, multiplier });
      await trackActionTx(client, guildId, userId, "casino_play", 1);
      if (payout > wager) await trackActionTx(client, guildId, userId, "wallet_earned", payout - wager);
      return { game, gameId, wager, won, payout, net: payout - wager, outcome };
    });
  }
}
module.exports = { CasinoGame };
