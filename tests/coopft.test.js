"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits, PermissionsBitField, ChannelType } = require("discord.js");
const { loadCoopFTCommands } = require("../src/commands/coopft");
const {
  STAFF_RANKS, APPLICATION_RANKS, EMOJI_SPRITE, CATEGORY_NAMES, PUBLIC_CHANNELS, PRIVATE_CHANNELS,
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

test("CoopFT exposes focused setup, sync, panel and operational commands", () => {
  const commands = loadCoopFTCommands();
  const expected = [
    "announce", "ban", "case", "channel-rename", "channel-topic", "clear-warnings",
    "coopft-channels-sync", "coopft-panel", "coopft-roles-sync", "coopft-setup", "coopft-ticket-config",
    "event-cancel", "event-create", "event-list", "kick", "lock", "member-note-remove",
    "nickname", "note", "notes", "poll", "purge", "reset-nickname", "role-add",
    "role-remove", "slowmode", "suggestion", "suggestion-review", "ticket-add",
    "ticket-claim", "ticket-close", "ticket-info", "ticket-list", "ticket-priority",
    "ticket-remove", "ticket-rename", "timeout", "unban", "unlock", "untimeout",
    "warn", "warnings"
  ];
  assert.deepEqual([...commands.keys()].sort(), expected.sort());
  for (const command of commands.values()) assert.doesNotThrow(() => command.data.toJSON());
  for (const configCommand of ["coopft-setup", "coopft-roles-sync", "coopft-channels-sync", "coopft-panel", "coopft-ticket-config"]) {
    assert.equal(commands.has(configCommand), true, configCommand + " must be available");
  }
  for (const removed of ["ping", "help", "serverinfo", "botinfo", "avatar", "application-status", "application-withdraw", "application-queue", "staff", "menu", "profile", "leaderboard"]) {
    assert.equal(commands.has(removed), false, removed + " is intentionally not exposed");
  }
});

test("CoopFT applications contain two moderation tracks and one specialist Developer track", () => {
  assert.equal(STAFF_RANKS.length, 17);
  assert.equal(APPLICATION_RANKS.length, 3);
  assert.deepEqual(APPLICATION_RANKS.map((role) => role.key), [
    "junior_moderator", "moderator", "developer"
  ]);
  for (const role of APPLICATION_RANKS.filter((item) => item.category === "staff")) {
    assert.ok(STAFF_RANKS.some((staffRole) => staffRole.key === role.key), role.name + " must be an actual staff rank");
    assert.notEqual(role.permissions, 0n, role.name + " must use its staff permission profile");
  }
  const developer = APPLICATION_RANKS.find((role) => role.key === "developer");
  assert.equal(developer.roleKey, "developer_member");
  assert.equal(developer.permissions, 0n, "Developer is a specialist role with no moderation permissions");
  for (const key of ["owner", "co_owner", "monarch", "high_rank_supervisor", "apex", "right_wing", "left_wing", "halo", "overseer"]) {
    assert.equal(APPLICATION_RANKS.some((role) => role.key === key), false, key + " is an appointment-only leadership rank");
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
});


test("CoopFT staff hierarchy follows the supplied four-section reference", () => {
  assert.deepEqual(STAFF_RANKS.map((role) => role.name), [
    "Owner", "Co-Owner", "Monarch",
    "High Rank Supervisor", "Apex", "Right Wing", "Left Wing", "Halo", "Overseer",
    "Staff Supervisor", "Supreme Council", "Senate", "Head Moderator",
    "Council", "Senior Moderator", "Moderator", "Junior Moderator"
  ]);
});

test("CoopFT category and channel names use distinctive emoji-free typography", () => {
  assert.deepEqual(Object.keys(CATEGORY_NAMES).sort(), [
    "community", "services", "staff_hq", "start_here", "tickets"
  ]);
  for (const name of Object.values(CATEGORY_NAMES)) {
    assert.match(name, /^╭────〔 [A-Z ]+ 〕────╮$/u);
    assert.ok(name.length <= 100);
    assert.equal(/\p{Extended_Pictographic}/u.test(name), false, name + " must not contain emoji");
  }
  for (const channel of [...PUBLIC_CHANNELS, ...PRIVATE_CHANNELS]) {
    assert.match(channel.name, /^[^\p{L}\p{N}\s]+・[a-z0-9-]+$/u, channel.key);
    assert.ok(channel.name.length <= 100, channel.key + " must fit Discord's channel-name limit");
    assert.equal(/\p{Extended_Pictographic}/u.test(channel.name), false, channel.key + " must not contain emoji");
  }
});

test("CoopFT emoji pack and channel layout use the current organized design", () => {
  assert.equal(EMOJI_SPRITE.length, 50);
  assert.equal(new Set(EMOJI_SPRITE).size, 50);
  assert.ok(EMOJI_SPRITE.includes("cf3d_community"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "open_ticket"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "role_selection"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "applications"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "suggestions"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "announcement_stage" && channel.channelType === "stage"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "community_voice" && channel.channelType === "voice"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "event_voice" && channel.channelType === "voice"));
  assert.ok(PUBLIC_CHANNELS.some((channel) => channel.key === "announcements" && channel.channelType === "announcement"));
  assert.equal(PUBLIC_CHANNELS.some((channel) => channel.key === "help_study"), false);
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "application_review"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "staff_directory"));
  assert.equal(PRIVATE_CHANNELS.some((channel) => channel.key === "staff_team"), false);
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "staff_bot_updates"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "ticket_transcripts"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "member_logs"));
  assert.ok(PRIVATE_CHANNELS.some((channel) => channel.key === "server_logs"));
});

test("each staff application modal contains four required questions and one optional question", () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) }, { guildId: coopftGuildId });
  for (const role of APPLICATION_RANKS) {
    const modal = service.createApplicationModal(role).toJSON();
    assert.equal(modal.custom_id, "cf-application:submit:" + role.key);
    assert.equal(modal.components.length, 5);
    assert.equal(modal.components.every((row) => row.components[0].required), role.category === "developer");
    if (role.category !== "developer") {
      assert.equal(modal.components.slice(0, 4).every((row) => row.components[0].required), true);
      assert.equal(modal.components[4].components[0].required, false);
    }
    for (const row of modal.components) {
      assert.ok(row.components[0].label.length <= 45, "Discord modal labels must not exceed 45 characters");
    }
  }
});

test("private application review exposes only the four requested decisions", () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) }, { guildId: coopftGuildId });
  const rows = service.buildApplicationReviewComponents("application-id").map((row) => row.toJSON());
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.flatMap((row) => row.components.map((component) => component.label)), [
    "Accept", "Accept with reason", "Deny", "Deny with reason"
  ]);
  assert.deepEqual(rows.flatMap((row) => row.components.map((component) => component.custom_id)), [
    "cf-application:accept:application-id",
    "cf-application:accept-reason:application-id",
    "cf-application:deny:application-id",
    "cf-application:deny-reason:application-id"
  ]);
});

test("CoopFT staff directory is text-only with section headings and timestamp", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) }, { guildId: coopftGuildId });
  service.memberRosterLoaded = true;
  const embed = await service.buildStaffDirectoryEmbed({
    id: coopftGuildId,
    members: { cache: new Map() }
  });
  const data = embed.toJSON();
  assert.equal(data.title, "COOPFT  |  STAFF DIRECTORY");
  assert.equal(data.image, undefined);
  assert.equal(data.thumbnail, undefined);
  assert.equal(data.footer, undefined);
  assert.ok(data.timestamp);
  assert.match(data.description, /Current CoopFT staff by assigned role/);
  const headingText = data.fields.map((field) => field.name).join("\n");
  for (const section of ["OWNER RANK", "HIGH RANK", "LOW RANK", "MOD ROLES", "Developers"]) {
    assert.ok(headingText.includes(section), section + " section must be present");
  }
  assert.ok(data.fields.every((field) => field.value.includes("VACANT")));
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

test("the generated 3D emoji artwork sprite contains the original 28 transparent icon tiles", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { loadImage } = require("@napi-rs/canvas");
  const encoded = fs.readFileSync(path.resolve(__dirname, "../assets/coopft-emojis.png.b64"), "utf8").trim();
  const image = await loadImage(Buffer.from(encoded, "base64"));
  assert.equal(image.width, 128);
  assert.equal(image.height, 224);
  for (let index = 0; index < 28; index += 1) {
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

test("manual setup uploads all 50 CoopFT emblems as separate Discord-sized PNGs", async () => {
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
  assert.equal(result.created, 50);
  assert.equal(result.available, 0);
  assert.deepEqual(result.failed, []);
  assert.equal(uploads.length, 50);
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
  assert.equal(uniqueImages.size, 50);
  for (const name of EMOJI_SPRITE) {
    assert.equal(service.emojis.get(name), "emoji-" + name);
  }
});

test("Owner-controlled ticket configuration saves category and transcript destinations", async () => {
  const settings = new Map();
  const pool = {
    async query(sql, params) {
      if (sql.includes("SELECT setting_value")) {
        return { rows: settings.has(params[1]) ? [{ setting_value: settings.get(params[1]) }] : [] };
      }
      if (sql.includes("INSERT INTO coopft_community_settings")) {
        settings.set(params[1], JSON.parse(params[2]));
        return { rows: [] };
      }
      throw new Error("Unexpected SQL in ticket configuration test.");
    }
  };
  const service = new CoopFTCommunityService(pool, { guildId: coopftGuildId });
  const category = { id: "ticket-category", type: ChannelType.GuildCategory };
  const transcripts = { id: "ticket-archive", type: ChannelType.GuildText, isTextBased: () => true };
  const saved = await service.configureTicketing(
    { id: coopftGuildId },
    { category, transcriptChannel: transcripts }
  );
  assert.equal(saved.categoryId, "ticket-category");
  assert.equal(saved.transcriptChannelId, "ticket-archive");
  assert.equal(settings.get("resource:category:tickets"), "ticket-category");
  assert.equal(settings.get("resource:channel:ticket_transcripts"), "ticket-archive");
  await assert.rejects(
    service.configureTicketing({ id: coopftGuildId }, { category: { id: "not-a-category", type: ChannelType.GuildText } }),
    /must be a category channel/
  );
  await assert.rejects(
    service.configureTicketing({ id: coopftGuildId }, {}),
    /Select a ticket category/
  );
});

test("legacy role retirement deletes only exact saved CoopFT roles", async () => {
  const values = new Map([
    ["resource:role:hr_director", "legacy-hr"],
    ["resource:role:hr_manager", "renamed-hr"],
    ["resource:role:war_manager", "managed-war"]
  ]);
  const deleted = [];
  const roles = new Map([
    ["legacy-hr", { id: "legacy-hr", name: "CF • HR Director", managed: false, editable: true,
      delete: async () => deleted.push("legacy-hr") }],
    ["renamed-hr", { id: "renamed-hr", name: "Community Lead", managed: false, editable: true,
      delete: async () => deleted.push("renamed-hr") }],
    ["managed-war", { id: "managed-war", name: "CF • War Manager", managed: true, editable: false,
      delete: async () => deleted.push("managed-war") }]
  ]);
  const pool = {
    async query(sql, params) {
      if (sql.includes("SELECT setting_value")) {
        return { rows: values.has(params[1]) ? [{ setting_value: values.get(params[1]) }] : [] };
      }
      if (sql.includes("DELETE FROM coopft_community_settings")) {
        values.delete(params[1]);
        return { rows: [] };
      }
      throw new Error("Unexpected SQL in legacy role retirement test.");
    }
  };
  const service = new CoopFTCommunityService(pool, { guildId: coopftGuildId });
  const result = await service.retireLegacyManagedRoles({
    id: coopftGuildId,
    roles: { fetch: async (id) => roles.get(id) || null }
  });
  assert.deepEqual(deleted, ["legacy-hr"]);
  assert.deepEqual(result.retired, ["CF • HR Director"]);
  assert.equal(result.preserved.length, 2);
  assert.equal(values.has("resource:role:hr_director"), false);
  assert.equal(values.has("resource:role:hr_manager"), true);
  assert.equal(values.has("resource:role:war_manager"), true);
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
  await assert.rejects(service.getSetting(fukishokaiGuild.id, "resource:unsafe"), /verified CoopFT server/);
  await assert.rejects(service.setSetting(fukishokaiGuild.id, "resource:unsafe", "channel-id"), /verified CoopFT server/);
  assert.throws(
    () => new CoopFTCommunityService({ query: async () => ({ rows: [] }) }, { guildId: fukishokaiGuild.id }),
    /can only be bound to server/
  );
  assert.equal(fetches, 0, "no Discord resource request may be made in Fukishokai");
});

test("ensureRole preserves custom permissions unless explicit sync is requested", async () => {
  const highRankSpec = STAFF_RANKS.find((role) => role.key === "high_rank_supervisor");
  const originalPermissionBits = ALL_PERMISSION_BITS;
  const role = {
    id: "high-rank-role",
    name: "My custom High Rank Supervisor",
    color: 0x123456,
    hoist: false,
    mentionable: true,
    editable: true,
    permissions: { bitfield: originalPermissionBits },
    edit: async (changes) => {
      if (changes.permissions) {
        role.permissions = { bitfield: new PermissionsBitField(changes.permissions).bitfield };
      }
      const { permissions, ...ordinaryChanges } = changes;
      Object.assign(role, ordinaryChanges);
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
  assert.equal(role.name, "My custom High Rank Supervisor");
  assert.equal(role.color, 0x123456);
  assert.equal(role.hoist, false);
  assert.equal(role.mentionable, true);
  assert.equal(role.permissions.bitfield, originalPermissionBits);

  await service.ensureRole(guild, highRankSpec, { force: true });
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
  assert.deepEqual(Object.keys(TICKET_TYPES).sort(), [
    "bot_account", "bot_bug", "bot_exploit", "bot_gameplay", "bot_suggestion",
    "custom_bot_request", "member_report", "partnership", "server_bug",
    "server_suggestion", "server_support", "staff_report"
  ]);
  assert.equal(TICKET_TYPES.custom_bot_request.section, "development");
  assert.equal(TICKET_TYPES.custom_bot_request.questions.length > 0, true);
  assert.equal(safeChannelName("Tommy Gun / Staff"), "tommy-gun-staff");
  assert.equal(safeChannelName("@everyone!!!"), "everyone");
  assert.equal(safeChannelName(""), "member");
});

test("editable-role cleanup requires the exact one-time confirmation phrase", () => {
  assert.equal(CLEANUP_CONFIRMATION, "DELETE_EDITABLE_ROLES");
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

  const result = await service.ensureRole(guild, STAFF_RANKS[0], { force: true });
  assert.equal(result.role, role);
  assert.equal(calls[0].kind, "edit");
  assert.equal(calls[0].changes.name, "Owner");
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
