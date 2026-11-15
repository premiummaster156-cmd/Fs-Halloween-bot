"use strict";

const COOPFT_DEFAULT_GUILD_ID = "1498271944456540210";
const configuredCoopFTGuildId = String(process.env.COOPFT_GUILD_ID || "").trim();
if (configuredCoopFTGuildId && configuredCoopFTGuildId !== COOPFT_DEFAULT_GUILD_ID) {
  throw new Error(
    "COOPFT_GUILD_ID is safety-locked to the verified CoopFT server " +
    COOPFT_DEFAULT_GUILD_ID + ". Refusing to route CoopFT features to another server."
  );
}
const coopftGuildId = COOPFT_DEFAULT_GUILD_ID;

const rawFukishokaiGuildId = String(process.env.FUKISHOKAI_GUILD_ID || process.env.GUILD_ID || "").trim();
if (rawFukishokaiGuildId && rawFukishokaiGuildId === COOPFT_DEFAULT_GUILD_ID) {
  throw new Error(
    "FUKISHOKAI_GUILD_ID/GUILD_ID cannot equal the CoopFT server ID. " +
    "Refusing ambiguous server routing."
  );
}
const fukishokaiGuildId = rawFukishokaiGuildId;

function personaForGuild(guildId) {
  if (!guildId) return null;
  if (guildId === coopftGuildId) return "coopft";
  if (fukishokaiGuildId && guildId === fukishokaiGuildId) return "fukishokai";
  return null;
}

function configuredGuildIds() {
  return [...new Set([coopftGuildId, fukishokaiGuildId].filter(Boolean))];
}

module.exports = {
  COOPFT_DEFAULT_GUILD_ID,
  coopftGuildId,
  fukishokaiGuildId,
  personaForGuild,
  configuredGuildIds,
  isCoopFTGuild: (guildId) => personaForGuild(guildId) === "coopft",
  isFukishokaiGuild: (guildId) => personaForGuild(guildId) === "fukishokai"
};
