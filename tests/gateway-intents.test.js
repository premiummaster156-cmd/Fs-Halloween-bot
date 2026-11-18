"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { GatewayIntentBits } = require("discord.js");
const { getGatewayIntents } = require("../src/config/gateway-intents");

test("Gateway requests only required event intents and the approved GuildMembers intent", () => {
  const intents = getGatewayIntents();

  assert.deepEqual(intents, [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]);

  assert.equal(intents.includes(GatewayIntentBits.GuildPresences), false);
  assert.equal(intents.includes(GatewayIntentBits.MessageContent), false);
});

test("Gateway intent configuration returns a fresh array", () => {
  const first = getGatewayIntents();
  first.pop();

  assert.equal(getGatewayIntents().includes(GatewayIntentBits.GuildMembers), true);
  assert.equal(getGatewayIntents().length, 4);
});
