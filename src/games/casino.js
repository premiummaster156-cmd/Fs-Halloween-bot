const balancing = require("../config/game-balancing");
const { randomInt, chance, uuid, casinoPayout, DomainError, claimCooldownTx, applyCooldownReduction } = require("../utils/core");
const { ensurePlayerTx } = require("../services/economy");
const { transaction } = require("../database/pool");
const { trackActionTx } = require("../services/events");

function slotOutcome(game, effectiveRoll) {
  return game.outcomes.find((item) => effectiveRoll <= item.maxRoll) || game.outcomes[game.outcomes.length - 1];
}
function slotExpectedReturn(game, luck = 0) {
  let total = 0;
  for (let roll = 0; roll < 1000; roll += 1) {
    const result = slotOutcome(game, Math.max(0, roll - luck));
    total += result.multiplierHundredths / 100;
  }
  return total / 1000;
}
class CasinoGame {
  constructor(pool, economy, inventory) { this.pool = pool; this.economy = economy; this.inventory = inventory; }
  list() { return Object.entries(balancing.casino.games).map(([id, game]) => ({ id, ...game })); }

  async play(guildId, userId, gameId, bet) {
    const game = balancing.casino.games[gameId];
    const wager = Math.floor(Number(bet));
    if (!game) throw new DomainError("Choose Coin Flip, High Dice, or Slots.", "CASINO_GAME_INVALID");
    if (!Number.isSafeInteger(wager) || wager < balancing.casino.minBet) {
      throw new DomainError(
        "Bet must be at least " + balancing.casino.minBet.toLocaleString() + " FC per round.",
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

      const gear = this.inventory ? await this.inventory.getEffectsTx(client, guildId, userId) : {};
      const cooldownMs = applyCooldownReduction(balancing.casino.cooldownMs, gear.casinoCooldownReduction, 5000);
      await claimCooldownTx(client, guildId, userId, "casino", cooldownMs);
      const reference = uuid();
      await this.economy.mutateTx(client, guildId, userId, -wager, "casino_bet", reference + ":bet", { gameId });

      let won = false;
      let multiplier = 0;
      let outcome = "No win";
      let effectiveChance = null;
      let luckBonus = 0;
      if (gameId === "coinflip" || gameId === "dice") {
        const baseChance = game.winningChance;
        effectiveChance = Math.min(80, baseChance + (gear.casinoChance || 0));
        won = chance(effectiveChance);
        multiplier = won ? Math.max(1, Math.floor(game.multiplierHundredths * baseChance / effectiveChance)) : 0;
        outcome = gameId === "coinflip"
          ? (won ? "The coin landed in your favor." : "The coin missed your side.") + " Win chance: " + effectiveChance.toFixed(2) + "%."
          : (won ? "The dice came up high." : "The dice missed the high roll.") + " Win chance: " + effectiveChance.toFixed(2) + "%.";
      } else {
        luckBonus = Math.min(30, gear.slotLuck || 0);
        const roll = randomInt(0, 999);
        const adjustedRoll = Math.max(0, roll - luckBonus);
        const result = slotOutcome(game, adjustedRoll);
        const baseReturn = slotExpectedReturn(game, 0);
        const luckReturn = slotExpectedReturn(game, luckBonus);
        const returnScale = luckReturn > 0 ? baseReturn / luckReturn : 1;
        won = result.multiplierHundredths > 0;
        multiplier = won ? Math.max(1, Math.floor(result.multiplierHundredths * returnScale)) : 0;
        outcome = result.label + " (roll " + roll + "/999, gear-adjusted roll " + adjustedRoll + ")." +
          (luckBonus ? " Your gear shifted the roll by " + luckBonus + "." : "");
      }

      const payout = won ? casinoPayout(wager, multiplier) : 0;
      if (payout > 0) {
        await this.economy.mutateTx(client, guildId, userId, payout, "casino_payout", reference + ":payout", {
          gameId, wager, multiplier, theoreticalReturnRate: game.theoreticalReturnRate ?? balancing.casino.targetReturnRate
        });
      }
      await trackActionTx(client, guildId, userId, "casino_play", 1);
      if (payout > wager) await trackActionTx(client, guildId, userId, "wallet_earned", payout - wager);

      return {
        game, gameId, wager, won, payout, net: payout - wager, outcome,
        cooldownMs, effectiveChance, luckBonus,
        theoreticalReturnRate: game.theoreticalReturnRate ?? balancing.casino.targetReturnRate
      };
    });
  }
}
module.exports = { CasinoGame, slotExpectedReturn, slotOutcome };
