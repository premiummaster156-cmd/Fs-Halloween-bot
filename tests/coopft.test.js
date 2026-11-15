"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCoopFTCommands } = require("../src/commands/coopft");
const {
  STAFF_RANKS, HR_ROLES, EMOJI_SPRITE, PUBLIC_CHANNELS, PRIVATE_CHANNELS
} = require("../src/config/coopft-design");
const {
  coopftGuildId, fukishokaiGuildId, personaForGuild, configuredGuildIds
} = require("../src/config/server-personas");
const { safeChannelName, TICKET_TYPES, CLEANUP_CONFIRMATION } = require("../src/services/coopft-community");

test("server personas are isolated and CoopFT uses the configured server ID", () => {
  assert.equal(coopftGuildId, process.env.COOPFT_GUILD_ID || "1498271944456540210");
  assert.equal(personaForGuild(coopftGuildId), "coopft");
  assert.equal(personaForGuild("999999999999999999"), null);
  assert.ok(configuredGuildIds().includes(coopftGuildId));
  if (fukishokaiGuildId) {
    assert.notEqual(fukishokaiGuildId, coopftGuildId);
    assert.equal(personaForGuild(fukishokaiGuildId), "fukishokai");
  }
});

test("CoopFT registers only its community commands", () => {
  const commands = loadCoopFTCommands();
  assert.deepEqual([...commands.keys()].sort(), ["coopft-setup", "staff", "staff-manage", "ticket"]);
  for (const command of commands.values()) assert.doesNotThrow(() => command.data.toJSON());
  assert.equal(commands.has("menu"), false);
  assert.equal(commands.has("profile"), false);
  assert.equal(commands.has("leaderboard"), false);
});

test("the staff hierarchy has ten ranks and five separate HR roles", () => {
  assert.equal(STAFF_RANKS.length, 10);
  assert.equal(HR_ROLES.length, 5);
  const allKeys = [...STAFF_RANKS, ...HR_ROLES].map((role) => role.key);
  const allNames = [...STAFF_RANKS, ...HR_ROLES].map((role) => role.name);
  assert.equal(new Set(allKeys).size, 15);
  assert.equal(new Set(allNames).size, 15);
  for (const role of [...STAFF_RANKS, ...HR_ROLES]) {
    assert.match(role.key, /^[a-z_]+$/);
    assert.ok(Number.isInteger(role.primary));
    assert.ok(Number.isInteger(role.secondary));
    assert.ok(role.icon);
    assert.ok(role.emoji);
    assert.equal(Object.hasOwn(role, "permissions"), false);
  }
});

test("CoopFT has sixteen distinct inline embed emojis and all required channel groups", () => {
  assert.equal(EMOJI_SPRITE.length, 16);
  assert.equal(new Set(EMOJI_SPRITE).size, 16);
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "open_ticket"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "help_study"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "your_creation"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "staff_team"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "staff_bot_updates"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "ticket_transcripts"));
});

test("ticket types are distinct and channel names are safely normalized", () => {
  assert.deepEqual(Object.keys(TICKET_TYPES).sort(), ["bug", "custom_bot", "suggestion", "support"]);
  assert.equal(safeChannelName("Tommy Gun / Staff"), "tommy-gun-staff");
  assert.equal(safeChannelName("@everyone!!!"), "everyone");
  assert.equal(safeChannelName(""), "member");
});

test("editable-role cleanup requires the exact one-time confirmation phrase", () => {
  assert.equal(CLEANUP_CONFIRMATION, "DELETE_EDITABLE_ROLES");
});
