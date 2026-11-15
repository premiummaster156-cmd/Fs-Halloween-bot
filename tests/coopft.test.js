"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCoopFTCommands } = require("../src/commands/coopft");
const {
  STAFF_RANKS, HR_ROLES, APPLICATION_ROLES, EMOJI_SPRITE, PUBLIC_CHANNELS, PRIVATE_CHANNELS
} = require("../src/config/coopft-design");
const {
  coopftGuildId, fukishokaiGuildId, personaForGuild, configuredGuildIds
} = require("../src/config/server-personas");
const { safeChannelName, TICKET_TYPES, CLEANUP_CONFIRMATION, CoopFTCommunityService } = require("../src/services/coopft-community");

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
  assert.deepEqual([...commands.keys()].sort(), ["applications-admin", "coopft-setup", "hr-manage", "staff", "staff-manage", "ticket"]);
  for (const command of commands.values()) assert.doesNotThrow(() => command.data.toJSON());
  assert.equal(commands.has("menu"), false);
  assert.equal(commands.has("profile"), false);
  assert.equal(commands.has("leaderboard"), false);
});

test("the CoopFT staff, HR and specialist application roles are distinct", () => {
  assert.equal(STAFF_RANKS.length, 10);
  assert.equal(HR_ROLES.length, 5);
  assert.equal(APPLICATION_ROLES.length, 5);
  const allRoles = [...STAFF_RANKS, ...HR_ROLES, ...APPLICATION_ROLES];
  const allKeys = allRoles.map((role) => role.key);
  const allNames = allRoles.map((role) => role.name);
  assert.equal(new Set(allKeys).size, 20);
  assert.equal(new Set(allNames).size, 20);
  for (const role of allRoles) {
    assert.match(role.key, /^[a-z_]+$/);
    assert.ok(Number.isInteger(role.primary));
    assert.ok(Number.isInteger(role.secondary));
    assert.ok(role.icon);
    assert.ok(role.emoji);
    assert.equal(Object.hasOwn(role, "permissions"), false);
  }
});

test("CoopFT has a distinct custom emoji pack, role guide, applications and voice channels", () => {
  assert.equal(EMOJI_SPRITE.length, 27);
  assert.equal(new Set(EMOJI_SPRITE).size, 27);
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "open_ticket"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "role_guide"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "applications"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "suggestions"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "announcement_stage" && channel.channelType === "stage"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "community_voice" && channel.channelType === "voice"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "event_voice" && channel.channelType === "voice"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "announcements" && channel.channelType === "announcement"));
  assert.equal(PUBLIC_CHANNELS.some((channel) => channel.key === "help_study"), false);
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "application_review"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "staff_team"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "staff_bot_updates"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "ticket_transcripts"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "member_logs"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "server_logs"));
});

test("each specialist application modal contains four required questions and one optional question", () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) }, { guildId: "guild-1" });
  for (const role of APPLICATION_ROLES) {
    const modal = service.createApplicationModal(role).toJSON();
    assert.equal(modal.custom_id, "cf-application:submit:" + role.key);
    assert.equal(modal.components.length, 5);
    assert.equal(modal.components.slice(0, 4).every((row) => row.components[0].required), true);
    assert.equal(modal.components[4].components[0].required, false);
  }
});

test("application availability defaults to open and can be switched per position", async () => {
  const values = new Map();
  const pool = {
    async query(sql, params) {
      if (sql.includes("SELECT setting_value")) {
        return { rows: values.has(params[1]) ? [{ setting_value: values.get(params[1]) }] : [] };
      }
      if (sql.includes("INSERT INTO coopft_community_settings")) {
        values.set(params[1], JSON.parse(params[2]));
        return { rows: [] };
      }
      throw new Error("Unexpected SQL in application availability test.");
    }
  };
  const service = new CoopFTCommunityService(pool, { guildId: "guild-1" });
  assert.equal(await service.isApplicationOpen("guild-1", "referee"), true);
  await service.setApplicationOpen({ id: "guild-1", channels: { fetch: async () => null } }, "referee", false);
  assert.equal(await service.isApplicationOpen("guild-1", "referee"), false);
  await service.setApplicationOpen({ id: "guild-1", channels: { fetch: async () => null } }, "referee", true);
  assert.equal(await service.isApplicationOpen("guild-1", "referee"), true);
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


test("HR managers have limited delegation authority and cannot grant senior HR roles", () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) }, { guildId: "guild-1" });
  for (const spec of HR_ROLES) service.roles.set(spec.key, { id: spec.key });
  for (const spec of STAFF_RANKS) service.roles.set(spec.key, { id: spec.key });

  const guild = { ownerId: "server-owner" };
  const target = { id: "target" };
  const actorWith = (id, roles) => ({ id, roles: { cache: new Set(roles) } });

  const senior = actorWith("senior", ["high_rank_supervisor"]);
  assert.doesNotThrow(() => service.assertHRRoleChangeAuthority(senior, target, guild, null, "hr_director"));

  const director = actorWith("director", ["hr_director"]);
  assert.doesNotThrow(() => service.assertHRRoleChangeAuthority(director, target, guild, "hr_recruiter", "hr_manager"));
  assert.throws(
    () => service.assertHRRoleChangeAuthority(director, target, guild, null, "hr_director"),
    /cannot appoint/
  );

  const manager = actorWith("manager", ["hr_manager"]);
  assert.doesNotThrow(() => service.assertHRRoleChangeAuthority(manager, target, guild, "hr_trainee", "hr_recruiter"));
  assert.throws(
    () => service.assertHRRoleChangeAuthority(manager, target, guild, null, "hr_manager"),
    /HR Managers can manage/
  );
  assert.throws(
    () => service.assertHRRoleChangeAuthority(manager, target, guild, "hr_recruiter", "hr_director"),
    /HR Managers can manage/
  );
});


test("no one, including the server owner, can change their own HR role", () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) }, { guildId: "guild-1" });
  const owner = { id: "server-owner", roles: { cache: new Set() } };
  const guild = { ownerId: "server-owner" };
  assert.throws(
    () => service.assertHRRoleChangeAuthority(owner, owner, guild, null, "hr_director"),
    /another authorized CoopFT manager/
  );
});

test("ensureRole repairs managed role properties and applies optional native gradient/icon styling", async () => {
  const calls = [];
  const role = {
    id: "managed-role-1",
    name: "Old role name",
    color: 0,
    hoist: false,
    mentionable: true,
    editable: true,
    permissions: { bitfield: 8n },
    edit: async (changes) => {
      calls.push({ kind: "edit", changes });
      Object.assign(role, changes);
      return role;
    }
  };
  const service = new CoopFTCommunityService({
    query: async (sql, params) => ({
      rows: sql.includes("SELECT setting_value") && params[1] === "resource:role:owner"
        ? [{ setting_value: role.id }]
        : []
    })
  }, { guildId: "guild-1" });
  const guild = {
    id: "guild-1",
    features: ["ENHANCED_ROLE_COLORS", "ROLE_ICONS"],
    roles: {
      cache: new Map([[role.id, role]]),
      fetch: async () => role
    },
    client: {
      rest: {
        patch: async (route, options) => calls.push({ kind: "patch", route, options })
      }
    }
  };

  const result = await service.ensureRole(guild, STAFF_RANKS[0]);
  assert.equal(result.role, role);
  assert.equal(calls[0].kind, "edit");
  assert.equal(calls[0].changes.name, "CF • Owner");
  assert.equal(calls[0].changes.color, STAFF_RANKS[0].primary);
  assert.deepEqual(calls[0].changes.permissions, []);
  assert.equal(calls[0].changes.hoist, true);
  assert.equal(calls[0].changes.mentionable, false);
  assert.deepEqual(calls.filter((call) => call.kind === "patch").map((call) => call.options.body), [
    { colors: { primary_color: STAFF_RANKS[0].primary, secondary_color: STAFF_RANKS[0].secondary, tertiary_color: null } },
    { unicode_emoji: STAFF_RANKS[0].icon }
  ]);
});
