"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  STAFF_RANKS, HR_ROLES, APPLICATION_ROLES, EMOJI_SPRITE, PUBLIC_CHANNELS, PRIVATE_CHANNELS
} = require("../src/config/coopft-design");
const {
  COOPFT_DEFAULT_GUILD_ID, coopftGuildId, personaForGuild
} = require("../src/config/server-personas");

test("CoopFT has ten distinct staff ranks and five HR roles", () => {
  assert.equal(STAFF_RANKS.length, 10);
  assert.equal(HR_ROLES.length, 5);
  assert.equal(new Set([...STAFF_RANKS, ...HR_ROLES].map((role) => role.key)).size, 15);
  for (const role of [...STAFF_RANKS, ...HR_ROLES]) {
    assert.ok(role.name);
    assert.ok(role.icon);
    assert.ok(role.emoji);
    assert.ok(Number.isInteger(role.primary));
    assert.ok(Number.isInteger(role.secondary));
    assert.notEqual(role.primary, role.secondary);
  }
});

test("CoopFT illustrated emoji registry contains 28 unique role and community emblems", () => {
  assert.equal(EMOJI_SPRITE.length, 28);
  assert.equal(new Set(EMOJI_SPRITE).size, 28);
  assert.ok(EMOJI_SPRITE.includes("cf_gem"));
  assert.ok(EMOJI_SPRITE.includes("cf_rules"));
  assert.ok(EMOJI_SPRITE.includes("cf_applications"));
  assert.ok(EMOJI_SPRITE.includes("cf_announce"));
  assert.ok(EMOJI_SPRITE.includes("cf_community"));
  for (const role of [...STAFF_RANKS, ...HR_ROLES, ...APPLICATION_ROLES]) {
    assert.ok(EMOJI_SPRITE.includes(role.emoji), role.key + " should have its custom emblem");
  }
});

test("CoopFT setup provisions announcement, voice, application and role-guide channels", () => {
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "open_ticket"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "announcements" && channel.channelType === "announcement"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "announcement_stage" && channel.channelType === "stage"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "community_voice" && channel.channelType === "voice"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "event_voice" && channel.channelType === "voice"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "applications"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "role_guide" && channel.name === "role-explanations"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "suggestions"));
  assert.equal(PUBLIC_CHANNELS.some((channel) => channel.key === "help_study"), false);
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "staff_bot_updates"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "ticket_transcripts"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "application_review"));
});

test("CoopFT persona is isolated to the configured server ID", () => {
  assert.equal(COOPFT_DEFAULT_GUILD_ID, "1498271944456540210");
  assert.equal(coopftGuildId, "1498271944456540210");
  assert.equal(personaForGuild("1498271944456540210"), "coopft");
  assert.notEqual(personaForGuild("1498271944456540210"), "fukishokai");
});
