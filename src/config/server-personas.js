"use strict";

const COOPFT_DEFAULT_GUILD_ID = "1498271944456540210";
const coopftGuildId = String(process.env.COOPFT_GUILD_ID || COOPFT_DEFAULT_GUILD_ID).trim();
const rawFukishokaiGuildId = String(process.env.FUKISHOKAI_GUILD_ID || process.env.GUILD_ID || "").trim();
const fukishokaiGuildId = rawFukishokaiGuildId === coopftGuildId ? "" : rawFukishokaiGuildId;

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
