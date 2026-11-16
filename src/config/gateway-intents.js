"use strict";

const { GatewayIntentBits } = require("discord.js");

// GuildMembers is approved and used for member-join detection plus CoopFT's live, role-based staff directory reconciliation.
// GuildMessages and GuildModeration are non-privileged event intents used by
// existing activity/boost tracking and audit-log monitoring. Do not add
// GuildPresences or MessageContent without a separate approved use case.
const REQUIRED_GATEWAY_INTENTS = Object.freeze([
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildMembers
]);

function getGatewayIntents() {
  return [...REQUIRED_GATEWAY_INTENTS];
}

module.exports = { getGatewayIntents };
