"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PermissionFlagsBits } = require("discord.js");
const {
  STAFF_RANKS,
  APPLICATION_RANKS,
  OWNER_RANK_KEYS,
  EMOJI_SPRITE,
  ROLE_BRACKETS,
  ROLE_LAYOUT,
  MEMBER_ROLES,
  INTEREST_ROLES,
  PING_ROLES,
  PUBLIC_CHANNELS,
  PRIVATE_CHANNELS
} = require("../src/config/coopft-design");
const {
  COOPFT_DEFAULT_GUILD_ID,
  coopftGuildId,
  personaForGuild
} = require("../src/config/server-personas");

test("CoopFT has the official 17-rank hierarchy and Developer is a separate service role", () => {
  assert.equal(STAFF_RANKS.length, 17);
  assert.deepEqual(STAFF_RANKS.slice(0, 3).map((role) => role.key), ["owner", "co_owner", "monarch"]);
  assert.equal(STAFF_RANKS.some((role) => role.key === "developer"), false);
  assert.ok(MEMBER_ROLES.some((role) => role.key === "developer_member" && role.name === "Developer"));
  for (const role of STAFF_RANKS) {
    assert.ok(role.name);
    assert.ok(role.icon);
    assert.ok(role.emoji);
    assert.ok(Number.isInteger(role.primary));
    assert.ok(Number.isInteger(role.secondary));
    assert.ok(role.permissionSummary);
  }
});

test("public recruitment exposes only Junior Moderator, Moderator and Developer", () => {
  assert.deepEqual(APPLICATION_RANKS.map((role) => role.key), [
    "junior_moderator", "moderator", "developer"
  ]);
  assert.equal(APPLICATION_RANKS[0].roleKey, "junior_moderator");
  assert.equal(APPLICATION_RANKS[1].roleKey, "moderator");
  assert.equal(APPLICATION_RANKS[2].roleKey, "developer_member");
  assert.deepEqual([...OWNER_RANK_KEYS].sort(), ["co_owner", "monarch", "owner"]);
});

test("the 50-icon CoopFT emoji pack contains unique purpose-specific names", () => {
  assert.ok(EMOJI_SPRITE.length >= 50);
  assert.equal(new Set(EMOJI_SPRITE).size, EMOJI_SPRITE.length);
  for (const name of [
    "cf3d_owner_crest", "cf3d_high_rank", "cf3d_low_rank", "cf3d_mod_rank",
    "cf3d_bots", "cf3d_member", "cf3d_developer", "cf3d_announcement_ping",
    "cf3d_event_ping", "cf3d_role_select"
  ]) assert.ok(EMOJI_SPRITE.includes(name), name + " must be in the emoji pack");
});

test("role brackets follow the hierarchy and only the Bots divider has Administrator", () => {
  assert.deepEqual(ROLE_BRACKETS.map((role) => role.key), [
    "owner_rank", "high_rank", "low_rank", "mod_roles",
    "bots", "member_roles", "interest_roles", "ping_roles"
  ]);
  const adminBrackets = ROLE_BRACKETS.filter((role) =>
    (BigInt(role.permissions) & PermissionFlagsBits.Administrator) !== 0n
  );
  assert.deepEqual(adminBrackets.map((role) => role.key), ["bots"]);
  assert.equal(ROLE_LAYOUT.find((group) => group.bracket === "mod_roles").roles.includes("developer"), false);
  assert.ok(ROLE_LAYOUT.find((group) => group.bracket === "member_roles").roles.includes("developer_member"));
});

test("members can self-select interests and non-mentionable notification roles only", () => {
  assert.equal(INTEREST_ROLES.length, 8);
  assert.equal(PING_ROLES.length, 8);
  assert.ok(PING_ROLES.every((role) => role.mentionable === false));
  assert.equal(INTEREST_ROLES.some((role) => role.key === "developer_member"), false);
  assert.equal(PING_ROLES.some((role) => role.key === "developer_member"), false);
  assert.ok(MEMBER_ROLES.some((role) => role.key === "community_member"));
  assert.ok(MEMBER_ROLES.some((role) => role.key === "verified_member"));
});

test("CoopFT creates the public panels and private Owner-Rank and staff-guide channels", () => {
  const publicKeys = new Set(PUBLIC_CHANNELS.map((channel) => channel.key));
  const privateKeys = new Set(PRIVATE_CHANNELS.map((channel) => channel.key));
  for (const key of ["open_ticket", "applications", "role_selection", "custom_bot_requests"]) {
    assert.ok(publicKeys.has(key), "missing public channel " + key);
  }
  for (const key of ["application_review", "application_control", "staff_guide", "ticket_transcripts", "member_logs", "server_logs"]) {
    assert.ok(privateKeys.has(key), "missing private channel " + key);
  }
  assert.equal(publicKeys.has("role_guide"), false);
  assert.equal(publicKeys.has("staff_directory"), false);
});

test("commission ticket migration permits the custom_bot_request type", () => {
  const migrationPath = path.join(__dirname, "../src/database/migrations/0008_coopft_custom_bot_commission_ticket.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /'custom_bot_request'/);
  assert.match(sql, /coopft_tickets_ticket_type_check/);
});

test("legacy recruitment tracks are withdrawn without deleting historical application records", () => {
  const migrationPath = path.join(__dirname, "../src/database/migrations/0007_coopft_close_legacy_recruitment.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /status = 'withdrawn'/);
  assert.match(sql, /NOT IN \('junior_moderator', 'moderator', 'developer'\)/);
  assert.match(sql, /Historical application rows remain intact/);
});

test("CoopFT persona remains isolated to its fixed server ID", () => {
  assert.equal(COOPFT_DEFAULT_GUILD_ID, "1498271944456540210");
  assert.equal(coopftGuildId, "1498271944456540210");
  assert.equal(personaForGuild("1498271944456540210"), "coopft");
  assert.notEqual(personaForGuild("1498271944456540210"), "fukishokai");
});
