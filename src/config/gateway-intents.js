"use strict";

const { GatewayIntentBits } = require("discord.js");

// GuildMembers supports CoopFT-only welcome/autorole handling and its live staff directory.
// GuildMessages supports Fukishōkai economy activity and boost rewards.
// GuildModeration supports CoopFT staff audit-log reconciliation only.
// DirectMessages is used only for owner-submitted source ZIP publishing; DMs are a
// Message Content exception. Do not add GuildPresences or MessageContent.
const REQUIRED_GATEWAY_INTENTS = Object.freeze([
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.DirectMessages
]);

function getGatewayIntents() {
  return [...REQUIRED_GATEWAY_INTENTS];
}

module.exports = { getGatewayIntents };
