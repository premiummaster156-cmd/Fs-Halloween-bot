const crypto = require("node:crypto");

class DomainError extends Error {
  constructor(message, code = "DOMAIN_ERROR") {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
class CooldownError extends DomainError {
  constructor(remainingMs) {
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    super("This action is on cooldown. Try again in " + formatDuration(seconds) + ".", "COOLDOWN");
    this.remainingMs = remainingMs;
  }
}
function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const units = [];
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) units.push(hours + "h");
  if (minutes) units.push(minutes + "m");
  if (rest || units.length === 0) units.push(rest + "s");
  return units.join(" ");
}
function randomInt(minimum, maximum) {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
    throw new TypeError("randomInt requires safe integer bounds.");
  }
  return crypto.randomInt(minimum, maximum + 1);
}
function chance(percent) {
  return randomInt(1, 100) <= Math.max(0, Math.min(100, Math.floor(percent)));
}
function uuid() { return crypto.randomUUID(); }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function levelXpRequired(level) {
  const safeLevel = Math.max(1, Math.floor(level));
  return 100 + (safeLevel * safeLevel * 35);
}
function calculateWorkPay(job, jobLevel, randomPercent) {
  const level = Math.max(1, Math.floor(jobLevel || 1));
  const factor = clamp(Number(randomPercent), 0.82, 1.18);
  const base = (Number(job.payMin) + Number(job.payMax)) / 2;
  const range = (Number(job.payMax) - Number(job.payMin)) / 2;
  const variable = base + (((factor - 1) / 0.18) * range);
  return Math.max(1, Math.floor(variable * (1 + Math.min(level - 1, 20) * 0.035)));
}
function calculateCrimeChance(baseChance, playerLevel, difficulty, roleBonus) {
  const levelBonus = Math.max(0, Number(playerLevel) - 1) * 1.15;
  return Math.round(clamp(Number(baseChance) + levelBonus + Number(roleBonus || 0) - (Number(difficulty || 1) * 2), 8, 88));
}
function calculateHeistChance(baseChance, averageLevel, participants, difficulty, roleBonuses) {
  const levelBonus = Math.max(0, Number(averageLevel) - 1) * 1.25;
  const crewBonus = Math.max(0, Number(participants) - 2) * 4;
  return Math.round(clamp(Number(baseChance) + levelBonus + crewBonus + Math.min(15, Math.max(0, Number(roleBonuses || 0))) - (Number(difficulty) * 5), 10, 85));
}
function splitReward(total, participantIds) {
  const amount = Math.max(0, Math.floor(total));
  const ids = Array.from(new Set(participantIds)).sort();
  if (!ids.length) return [];
  const perPerson = Math.floor(amount / ids.length);
  let remainder = amount - perPerson * ids.length;
  return ids.map((userId) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { userId, amount: perPerson + extra };
  });
}
function casinoPayout(bet, multiplierHundredths) {
  return Math.floor(Math.floor(bet) * Math.floor(multiplierHundredths) / 100);
}
async function claimCooldownTx(client, guildId, userId, key, durationMs, now = new Date()) {
  const current = new Date(now);
  const next = new Date(current.getTime() + Math.max(0, durationMs));
  await client.query(
    "INSERT INTO cooldowns (guild_id, user_id, cooldown_key, next_at) VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id, user_id, cooldown_key) DO NOTHING",
    [guildId, userId, key, current]
  );
  const result = await client.query(
    "SELECT next_at FROM cooldowns WHERE guild_id = $1 AND user_id = $2 AND cooldown_key = $3 FOR UPDATE",
    [guildId, userId, key]
  );
  const previous = new Date(result.rows[0].next_at);
  if (previous.getTime() > current.getTime()) throw new CooldownError(previous.getTime() - current.getTime());
  await client.query(
    "UPDATE cooldowns SET next_at = $4, updated_at = NOW() WHERE guild_id = $1 AND user_id = $2 AND cooldown_key = $3",
    [guildId, userId, key, next]
  );
  return next;
}

module.exports = {
  DomainError, CooldownError, formatDuration, randomInt, chance, uuid, clamp,
  levelXpRequired, calculateWorkPay, calculateCrimeChance, calculateHeistChance,
  splitReward, casinoPayout, claimCooldownTx
};
