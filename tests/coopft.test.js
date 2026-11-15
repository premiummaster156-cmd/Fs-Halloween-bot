"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits, PermissionsBitField } = require("discord.js");
const { loadCoopFTCommands } = require("../src/commands/coopft");
const {
  STAFF_RANKS, HR_ROLES, APPLICATION_ROLES, EMOJI_SPRITE, PUBLIC_CHANNELS, PRIVATE_CHANNELS,
  OWNER_PERMISSIONS, HIGH_RANK_SUPERVISOR_PERMISSIONS, ALL_PERMISSION_BITS
} = require("../src/config/coopft-design");
const {
  coopftGuildId, fukishokaiGuildId, personaForGuild, configuredGuildIds
} = require("../src/config/server-personas");
const { safeChannelName, TICKET_TYPES, CLEANUP_CONFIRMATION, CoopFTCommunityService, drawCoopFTEmoji } = require("../src/services/coopft-community");
const { createCanvas } = require("@napi-rs/canvas");

test("server personas are isolated and CoopFT uses the configured server ID", () => {
  assert.equal(coopftGuildId, "1498271944456540210");
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
    assert.equal(typeof role.permissions, "bigint", role.name + " has an explicit permission bitfield");
    assert.ok(role.permissionSummary, role.name + " has a human-readable permission summary");
    if (STAFF_RANKS.includes(role) || HR_ROLES.includes(role)) {
      assert.notEqual(role.permissions, 0n, role.name + " must have useful non-zero permissions");
    } else {
      assert.equal(role.permissions, 0n, role.name + " remains a permission-neutral specialist assignment");
    }
  }
});

test("CoopFT leadership permissions match the explicitly requested hierarchy", () => {
  const owner = STAFF_RANKS.find((role) => role.key === "owner");
  const coOwner = STAFF_RANKS.find((role) => role.key === "co_owner");
  const supervisor = STAFF_RANKS.find((role) => role.key === "high_rank_supervisor");
  const reserved = PermissionFlagsBits.Administrator |
    PermissionFlagsBits.ManageGuild |
    PermissionFlagsBits.ManageChannels;

  assert.equal(OWNER_PERMISSIONS, ALL_PERMISSION_BITS);
  assert.equal(owner.permissions, ALL_PERMISSION_BITS);
  assert.equal(coOwner.permissions, ALL_PERMISSION_BITS);
  assert.equal(HIGH_RANK_SUPERVISOR_PERMISSIONS, ALL_PERMISSION_BITS & ~reserved);
  assert.equal(supervisor.permissions, ALL_PERMISSION_BITS & ~reserved);
  assert.equal(supervisor.permissions & reserved, 0n);

  for (const role of STAFF_RANKS.filter((item) =>
    !["owner", "co_owner", "high_rank_supervisor"].includes(item.key)
  )) {
    assert.notEqual(role.permissions, 0n, role.name + " receives a limited operational permission set");
    assert.equal(role.permissions & reserved, 0n, role.name + " cannot gain administrator/server/channel management");
  }
  for (const role of HR_ROLES) {
    assert.notEqual(role.permissions, 0n, role.name + " receives recruitment permissions");
    assert.equal(role.permissions & reserved, 0n, role.name + " cannot gain administrator/server/channel management");
    assert.equal(role.permissions & PermissionFlagsBits.ManageRoles, 0n, role.name + " cannot manage server roles");
  }
  for (const role of APPLICATION_ROLES) {
    assert.equal(role.permissions, 0n, role.name + " remains a permission-neutral specialist assignment");
  }
});

test("CoopFT has a distinct 3D custom emoji pack, role guide, applications and voice channels", () => {
  assert.equal(EMOJI_SPRITE.length, 28);
  assert.equal(new Set(EMOJI_SPRITE).size, 28);
  assert.ok(EMOJI_SPRITE.includes("cf3d_community"));
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

test("all 28 CoopFT vector fallbacks render to transparent PNG images", () => {
  for (const [index, name] of EMOJI_SPRITE.entries()) {
    const canvas = createCanvas(128, 128);
    drawCoopFTEmoji(canvas.getContext("2d"), name, index);
    const png = canvas.toBuffer("image/png");
    assert.ok(png.length > 100, name + " should produce a PNG image");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", name + " should have a PNG signature");
  }
});

test("the generated 3D emoji artwork sprite contains 28 separate transparent icon tiles", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { loadImage } = require("@napi-rs/canvas");
  const encoded = fs.readFileSync(path.resolve(__dirname, "../assets/coopft-emojis.png.b64"), "utf8").trim();
  const image = await loadImage(Buffer.from(encoded, "base64"));
  assert.equal(image.width, 128);
  assert.equal(image.height, 224);
  for (let index = 0; index < EMOJI_SPRITE.length; index += 1) {
    const canvas = createCanvas(128, 128);
    const context = canvas.getContext("2d");
    context.drawImage(image, (index % 4) * 32, Math.floor(index / 4) * 32, 32, 32, 0, 0, 128, 128);
    const pixels = context.getImageData(0, 0, 128, 128).data;
    let transparent = false;
    let visible = false;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (pixels[offset] === 0) transparent = true;
      if (pixels[offset] > 0) visible = true;
      if (transparent && visible) break;
    }
    assert.ok(transparent && visible, EMOJI_SPRITE[index] + " should be an isolated transparent image tile");
  }
});

test("manual setup uploads all 28 3D CoopFT emblems as separate Discord-sized PNGs", async () => {
  const { PermissionFlagsBits } = require("discord.js");
  const { loadImage } = require("@napi-rs/canvas");
  const uploads = [];
  const pool = { query: async () => ({ rows: [] }) };
  const service = new CoopFTCommunityService(pool, { guildId: coopftGuildId });
  const guild = {
    id: coopftGuildId,
    emojis: {
      cache: { map: () => [] },
      create: async (options) => {
        uploads.push(options);
        return { id: "emoji-" + options.name, name: options.name };
      }
    },
    members: {
      me: {
        permissions: {
          has: (permission) => permission === PermissionFlagsBits.CreateGuildExpressions
        }
      }
    }
  };

  const result = await service.ensureEmojis(guild);
  assert.equal(result.created, 28);
  assert.equal(result.available, 0);
  assert.deepEqual(result.failed, []);
  assert.equal(uploads.length, 28);
  assert.deepEqual(uploads.map((item) => item.name), EMOJI_SPRITE);

  const uniqueImages = new Set();
  for (const upload of uploads) {
    assert.ok(Buffer.isBuffer(upload.attachment));
    assert.ok(upload.attachment.length < 256 * 1024, upload.name + " must fit Discord's 256 KiB limit");
    assert.equal(upload.attachment.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const image = await loadImage(upload.attachment);
    assert.equal(image.width, 128);
    assert.equal(image.height, 128);
    uniqueImages.add(upload.attachment.toString("base64"));
  }
  assert.equal(uniqueImages.size, 28);
  for (const name of EMOJI_SPRITE) {
    assert.equal(service.emojis.get(name), "emoji-" + name);
  }
});

test("CoopFT setup refuses to configure elevated roles unless the bot has Administrator", async () => {
  const service = new CoopFTCommunityService(
    { query: async () => ({ rows: [] }) },
    { guildId: coopftGuildId }
  );
  const guild = {
    id: coopftGuildId,
    members: {
      me: {
        id: "bot-1",
        permissions: {
          has: (permission) => permission !== PermissionFlagsBits.Administrator
        }
      }
    }
  };
  await assert.rejects(
    service.bootstrap(guild),
    /Administrator is required because Owner and Co-Owner must receive the Administrator permission/
  );
});

test("CoopFT resource mutations refuse to touch the Fukishokai server", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  let fetches = 0;
  const fukishokaiGuild = {
    id: "111111111111111111",
    members: {
      me: {
        id: "bot-1",
        permissions: { has: () => true }
      },
      fetchMe: async () => {
        fetches += 1;
        return { id: "bot-1", permissions: { has: () => true } };
      }
    },
    roles: { fetch: async () => { fetches += 1; return []; } },
    channels: { fetch: async () => { fetches += 1; return []; } },
    emojis: { fetch: async () => { fetches += 1; return []; } }
  };
  await assert.rejects(service.bootstrap(fukishokaiGuild), /verified CoopFT server/);
  await assert.rejects(service.ensureRole(fukishokaiGuild, STAFF_RANKS[0]), /verified CoopFT server/);
  await assert.rejects(service.ensureCategory(fukishokaiGuild, "unsafe", "unsafe"), /verified CoopFT server/);
  await assert.rejects(service.ensureChannel(fukishokaiGuild, { key: "unsafe", name: "unsafe" }, {}), /verified CoopFT server/);
  assert.equal(fetches, 0, "no Discord resource request may be made in Fukishokai");
});

test("ensureRole reapplies the restricted High Rank Supervisor permission set", async () => {
  const highRankSpec = STAFF_RANKS.find((role) => role.key === "high_rank_supervisor");
  const role = {
    id: "high-rank-role",
    name: "CF • High Rank Supervisor",
    color: highRankSpec.primary,
    hoist: true,
    mentionable: false,
    editable: true,
    permissions: { bitfield: ALL_PERMISSION_BITS },
    edit: async (changes) => {
      role.permissions = { bitfield: new PermissionsBitField(changes.permissions).bitfield };
      return role;
    }
  };
  const service = new CoopFTCommunityService({
    query: async (_sql, params) => ({
      rows: params[1] === "resource:role:high_rank_supervisor"
        ? [{ setting_value: role.id }]
        : []
    })
  }, { guildId: coopftGuildId });
  const guild = {
    id: coopftGuildId,
    features: [],
    roles: {
      cache: new Map([[role.id, role]]),
      fetch: async () => role
    }
  };

  await service.ensureRole(guild, highRankSpec);
  assert.equal(role.permissions.bitfield, HIGH_RANK_SUPERVISOR_PERMISSIONS);
  assert.equal(
    role.permissions.bitfield & (
      PermissionFlagsBits.Administrator |
      PermissionFlagsBits.ManageGuild |
      PermissionFlagsBits.ManageChannels
    ),
    0n
  );
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
  }, { guildId: coopftGuildId });
  const guild = {
    id: coopftGuildId,
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
  assert.equal(
    new PermissionsBitField(calls[0].changes.permissions).bitfield,
    OWNER_PERMISSIONS,
    "Owner must be repaired to the full Administrator permission set"
  );
  assert.equal(calls[0].changes.hoist, true);
  assert.equal(calls[0].changes.mentionable, false);
  assert.deepEqual(calls.filter((call) => call.kind === "patch").map((call) => call.options.body), [
    { colors: { primary_color: STAFF_RANKS[0].primary, secondary_color: STAFF_RANKS[0].secondary, tertiary_color: null } },
    { unicode_emoji: STAFF_RANKS[0].icon }
  ]);
});
