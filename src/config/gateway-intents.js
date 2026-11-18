"use strict";

const { GatewayIntentBits } = require("discord.js");

// GuildMembers is approved and used for member-join detection plus CoopFT's live, role-based staff directory reconciliation.
// GuildMessages and GuildModeration are non-privileged event intents used by
// existing activity/boost tracking and audit-log monitoring. DirectMessages is
// used only for owner-submitted source ZIP publishing; DMs are a Message Content
// exception. Do not add GuildPresences or MessageContent.
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
