"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags } = require("discord.js");
const { loadCoopFTCommands } = require("../src/commands/coopft");
const {
  STAFF_RANKS, APPLICATION_RANKS, EMOJI_SPRITE, CATEGORY_NAMES, PUBLIC_CHANNELS, PRIVATE_CHANNELS,
  INTEREST_ROLES, PING_ROLES, ROLE_IMAGE_ICONS, ROLE_LAYOUT,
  OWNER_PERMISSIONS, HIGH_RANK_SUPERVISOR_PERMISSIONS, ALL_PERMISSION_BITS
} = require("../src/config/coopft-design");
const {
  coopftGuildId, fukishokaiGuildId, personaForGuild, configuredGuildIds
} = require("../src/config/server-personas");
const {
  safeChannelName, ticketChannelName, closedTicketChannelName, TICKET_TYPES,
  CLEANUP_CONFIRMATION, CoopFTCommunityService, drawCoopFTEmoji
} = require("../src/services/coopft-community");
const { createCanvas } = require("@napi-rs/canvas");

test("generated role icon sprite crops all 16 image assets into 128px PNGs", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  for (const spec of ROLE_IMAGE_ICONS) {
    const buffer = await service.getRoleIconBuffer(spec.roleKey);
    assert.ok(Buffer.isBuffer(buffer), spec.roleKey + " must return an image buffer");
    const image = await require("@napi-rs/canvas").loadImage(buffer);
    assert.equal(image.width, 128, spec.roleKey);
    assert.equal(image.height, 128, spec.roleKey);
    assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
});

test("server-owner free-bot channel configuration creates the opt-in ping role", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  const role = { id: "free-bot-ping-role" };
  const channel = {
    id: "free-bot-channel",
    guildId: coopftGuildId,
    isTextBased: () => true,
    send: async () => ({ id: "panel-message" })
  };
  const saved = [];
  let ensuredSpec;
  service.ensureRole = async (_guild, spec) => {
    ensuredSpec = spec;
    return { role, created: true };
  };
  service.saveResource = async (_guildId, key, value) => saved.push([key, value]);
  service.getResource = async () => null;
  const result = await service.configureFreeBotReleaseChannel(
    { id: coopftGuildId, channels: { fetch: async () => null } },
    channel
  );
  assert.equal(result.channel, channel);
  assert.equal(result.role, role);
  assert.equal(ensuredSpec.key, "ping_free_bot_releases");
  assert.deepEqual(saved, [["channel:free_bot_releases", channel.id]]);
});

test("free-bot-submit forwards the guild member, source ZIP and promo image", async () => {
  const settings = require("../src/config/settings");
  const previousOwnerId = settings.ownerId;
  settings.ownerId = "123456789012345678";

  const guildMember = {
    id: "223456789012345678",
    roles: { cache: new Map([["developer-role", { id: "developer-role" }]]) }
  };
  const user = { id: guildMember.id };
  const source = { id: "source-zip", name: "my-bot.zip" };
  const image = { id: "promotion-image", name: "promo.png" };
  let forwardedSubmitter = null;
  let forwardedOptions = null;
  const commands = loadCoopFTCommands();
  const interaction = {
    guild: { id: coopftGuildId },
    guildId: coopftGuildId,
    user,
    member: guildMember,
    options: {
      getString: (name) => ({
        title: "My free bot",
        description: "A useful Discord bot with moderation, utilities and community features.",
        repository: null
      })[name] || null,
      getAttachment: (name) => name === "source" ? source : image
    },
    deferReply: async () => undefined,
    editReply: async (content) => content
  };
  const coopft = {
    isDeveloper: (member) => member === guildMember,
    submitFreeBotPromotion: async (_guild, submitter, options) => {
      forwardedSubmitter = submitter;
      forwardedOptions = options;
    }
  };

  try {
    await commands.get("free-bot-submit").execute(interaction, { coopft });
    assert.equal(forwardedSubmitter, guildMember);
    assert.notEqual(forwardedSubmitter, user);
    assert.equal(forwardedOptions.source, source);
    assert.equal(forwardedOptions.image, image);
  } finally {
    settings.ownerId = previousOwnerId;
  }
});

test("free-bot-submit accepts a GitHub repository instead of a ZIP attachment", async () => {
  const settings = require("../src/config/settings");
  const previousOwnerId = settings.ownerId;
  settings.ownerId = "123456789012345678";
  const guildMember = {
    id: "223456789012345678",
    roles: { cache: new Map([["developer-role", { id: "developer-role" }]]) }
  };
  const repositoryUrl = "https://github.com/example/utility-bot";
  const image = { id: "promotion-image" };
  let forwardedOptions = null;
  const interaction = {
    guild: { id: coopftGuildId },
    guildId: coopftGuildId,
    user: { id: guildMember.id },
    member: guildMember,
    options: {
      getString: (name) => ({
        title: "My GitHub bot",
        description: "A useful Discord bot with moderation, utilities and community features.",
        repository: repositoryUrl
      })[name] || null,
      getAttachment: (name) => name === "source" ? null : image
    },
    deferReply: async () => undefined,
    editReply: async (content) => content
  };
  const coopft = {
    isDeveloper: (member) => member === guildMember,
    submitFreeBotPromotion: async (_guild, _submitter, options) => { forwardedOptions = options; }
  };
  try {
    await loadCoopFTCommands().get("free-bot-submit").execute(interaction, { coopft });
    assert.equal(forwardedOptions.source, null);
    assert.equal(forwardedOptions.repositoryUrl, repositoryUrl);
    assert.equal(forwardedOptions.image, image);
  } finally {
    settings.ownerId = previousOwnerId;
  }
});

test("server Owner submissions publish directly instead of DMing themselves for review", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  const ownerId = "1178306799674327136";
  const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const originalFetch = global.fetch;
  const published = [];
  const channel = {
    id: "release-channel",
    guildId: coopftGuildId,
    isTextBased: () => true,
    send: async (payload) => {
      published.push(payload);
      return { id: "owner-published-message", url: "https://discord.com/channels/" + coopftGuildId + "/release-channel/owner-published-message" };
    }
  };
  service.getResource = async () => channel.id;
  service.ensureFreeBotReleaseRole = async () => ({ id: "release-role" });
  const owner = {
    id: ownerId,
    roles: { cache: new Map() }
  };
  const guild = {
    id: coopftGuildId,
    ownerId,
    channels: { fetch: async () => channel },
    client: { users: { fetch: async () => { throw new Error("Owner must not receive a self-review DM"); } } }
  };
  global.fetch = async (url) => new Response(
    String(url).endsWith(".png") ? imageBytes : zipBytes,
    { headers: { "content-type": String(url).endsWith(".png") ? "image/png" : "application/zip" } }
  );
  let result;
  try {
    result = await service.submitFreeBotPromotion(guild, owner, {
      title: "Owner's Free Bot",
      description: "A useful community bot with moderation, automation and everyday server utilities.",
      ownerId,
      source: {
        name: "owners-bot.zip",
        size: zipBytes.length,
        url: "https://cdn.discordapp.com/owners-bot.zip"
      },
      image: {
        name: "promo.png",
        size: imageBytes.length,
        url: "https://cdn.discordapp.com/promo.png",
        contentType: "image/png"
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(result.published, true);
  assert.equal(result.channelId, channel.id);
  assert.equal(published.length, 1);
  assert.equal(published[0].embeds, undefined);
  assert.match(published[0].files[0].name, /^coopft-promo-\d+\.png$/);
  assert.equal(published[0].files[1].name, "owners-bot.zip");
});

test("Developer free-bot submissions send the source ZIP and promo image to the owner for review", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  service.roles.set("developer_member", { id: "developer-role" });
  service.getResource = async (_guildId, key) => {
    assert.equal(key, "channel:free_bot_releases");
    return "release-channel";
  };

  const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const uploads = new Map([
    ["https://cdn.discordapp.com/attachments/source.zip", zipBytes],
    ["https://cdn.discordapp.com/attachments/promo.png", imageBytes]
  ]);
  const originalFetch = global.fetch;
  let reviewPayload = null;
  const owner = { send: async (payload) => { reviewPayload = payload; } };
  const guild = {
    id: coopftGuildId,
    client: { users: { fetch: async (id) => {
      assert.equal(id, "123456789012345678");
      return owner;
    } } }
  };
  const developer = {
    id: "223456789012345678",
    roles: { cache: new Map([["developer-role", { id: "developer-role" }]]) }
  };

  global.fetch = async (url) => {
    const bytes = uploads.get(String(url));
    assert.ok(bytes, "only the supplied Discord attachments should be downloaded");
    return new Response(bytes, {
      headers: { "content-type": String(url).endsWith(".png") ? "image/png" : "application/zip" }
    });
  };
  try {
    await service.submitFreeBotPromotion(guild, developer, {
      title: "Useful Utility Bot",
      description: "A useful community bot with moderation, automation and everyday server utilities.",
      ownerId: "123456789012345678",
      source: {
        name: "utility-bot.zip",
        size: zipBytes.length,
        url: "https://cdn.discordapp.com/attachments/source.zip"
      },
      image: {
        name: "promo.png",
        size: imageBytes.length,
        url: "https://cdn.discordapp.com/attachments/promo.png",
        contentType: "image/png"
      }
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.ok(reviewPayload);
  assert.equal(reviewPayload.files.length, 2);
  assert.equal(reviewPayload.embeds, undefined, "owner review must be plain message text");
  assert.ok(reviewPayload.content.startsWith("**FREE BOT SUBMISSION**\n**Title:** Useful Utility Bot"));
  assert.ok(reviewPayload.content.includes("**Submitted by:** <@223456789012345678> (`223456789012345678`)"));
  assert.ok(reviewPayload.content.includes("A useful community bot with moderation, automation and everyday server utilities."));
  assert.equal(reviewPayload.files[0].name.endsWith(".png"), true, "promotional image is attached first");
  assert.equal(Buffer.compare(reviewPayload.files[0].attachment, imageBytes), 0);
  assert.equal(reviewPayload.files[1].name, "utility-bot.zip");
  assert.equal(Buffer.compare(reviewPayload.files[1].attachment, zipBytes), 0);
  assert.equal(reviewPayload.components.length, 1);
  assert.equal(reviewPayload.components[0].components.length, 2);
});

test("Developer GitHub repository submissions download a public repo ZIP for Owner review", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  service.roles.set("developer_member", { id: "developer-role" });
  service.getResource = async (_guildId, key) => {
    assert.equal(key, "channel:free_bot_releases");
    return "release-channel";
  };

  const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const originalFetch = global.fetch;
  const requests = [];
  let reviewPayload = null;
  const owner = { send: async (payload) => { reviewPayload = payload; } };
  const guild = {
    id: coopftGuildId,
    client: { users: { fetch: async (id) => {
      assert.equal(id, "123456789012345678");
      return owner;
    } } }
  };
  const developer = {
    id: "223456789012345678",
    roles: { cache: new Map([["developer-role", { id: "developer-role" }]]) }
  };

  global.fetch = async (url) => {
    const target = String(url);
    requests.push(target);
    if (target === "https://api.github.com/repos/example/utility-bot") {
      return new Response(JSON.stringify({
        private: false,
        disabled: false,
        default_branch: "main",
        full_name: "example/utility-bot"
      }), { headers: { "content-type": "application/json" } });
    }
    if (target === "https://api.github.com/repos/example/utility-bot/zipball/main") {
      return new Response(zipBytes, { headers: { "content-type": "application/zip" } });
    }
    if (target === "https://cdn.discordapp.com/attachments/promo.png") {
      return new Response(imageBytes, { headers: { "content-type": "image/png" } });
    }
    throw new Error("Unexpected fetch URL: " + target);
  };

  try {
    await service.submitFreeBotPromotion(guild, developer, {
      title: "Useful GitHub Bot",
      description: "A useful community bot with moderation, automation and everyday server utilities.",
      ownerId: "123456789012345678",
      repositoryUrl: "https://github.com/example/utility-bot",
      image: {
        name: "promo.png",
        size: imageBytes.length,
        url: "https://cdn.discordapp.com/attachments/promo.png",
        contentType: "image/png"
      }
    });
  } finally {
    global.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    "https://api.github.com/repos/example/utility-bot",
    "https://api.github.com/repos/example/utility-bot/zipball/main",
    "https://cdn.discordapp.com/attachments/promo.png"
  ]);
  assert.ok(reviewPayload);
  assert.equal(reviewPayload.files.length, 2);
  assert.equal(reviewPayload.files[0].name.endsWith(".png"), true);
  assert.equal(Buffer.compare(reviewPayload.files[0].attachment, imageBytes), 0);
  assert.equal(reviewPayload.files[1].name, "example-utility-bot.zip");
  assert.equal(Buffer.compare(reviewPayload.files[1].attachment, zipBytes), 0);
  assert.equal(reviewPayload.embeds, undefined);
  assert.ok(reviewPayload.content.includes("**GitHub repository:** https://github.com/example/utility-bot"));
});

test("GitHub source submissions reject non-root, non-HTTPS and non-GitHub URLs", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  service.roles.set("developer_member", { id: "developer-role" });
  const developer = {
    id: "223456789012345678",
    roles: { cache: new Map([["developer-role", { id: "developer-role" }]]) }
  };
  const guild = { id: coopftGuildId };
  for (const repositoryUrl of [
    "http://github.com/example/utility-bot",
    "https://evil.example/example/utility-bot",
    "https://github.com/example/utility-bot/tree/main"
  ]) {
    await assert.rejects(
      service.submitFreeBotPromotion(guild, developer, {
        title: "Useful GitHub Bot",
        description: "A useful community bot with moderation, automation and everyday server utilities.",
        ownerId: "123456789012345678",
        repositoryUrl,
        image: { name: "promo.png", size: 10, url: "https://cdn.discordapp.com/promo.png", contentType: "image/png" }
      }),
      /GitHub|github\.com|repository URL/
    );
  }
});

test("owner approval republishes the reviewed ZIP and image together", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const urls = new Map([
    ["https://cdn.discordapp.com/review/source.zip", zipBytes],
    ["https://cdn.discordapp.com/review/promo.png", imageBytes]
  ]);
  const originalFetch = global.fetch;
  const published = [];
  let reviewEdited = null;
  const channel = {
    id: "release-channel",
    guildId: coopftGuildId,
    isTextBased: () => true,
    send: async (payload) => {
      published.push(payload);
      return { id: "published-message", url: "https://discord.com/channels/" + coopftGuildId + "/release-channel/published-message" };
    }
  };
  const guild = { id: coopftGuildId, channels: { fetch: async () => channel } };
  service.getResource = async () => channel.id;
  service.ensureFreeBotReleaseRole = async () => ({ id: "release-role" });
  const message = {
    id: "review-message",
    content: [
      "**FREE BOT SUBMISSION**",
      "**Title:** Reviewed Utility Bot",
      "**Submitted by:** <@223456789012345678> (`223456789012345678`)",
      "**Description:**",
      "A useful community bot with moderation, automation and everyday server utilities."
    ].join("\n"),
    embeds: [],
    attachments: new Map([
      ["source", { name: "utility-bot.zip", url: "https://cdn.discordapp.com/review/source.zip" }],
      ["image", { name: "promo.png", url: "https://cdn.discordapp.com/review/promo.png" }]
    ]),
    edit: async (payload) => { reviewEdited = payload; }
  };
  const notified = [];
  const client = {
    guilds: { cache: { get: () => guild } },
    users: { fetch: async (id) => ({ send: async (content) => notified.push([id, content]) }) }
  };
  const interaction = {
    customId: "cf-freebot:approve",
    user: { id: "123456789012345678" },
    message,
    deferUpdate: async () => undefined,
    followUp: async (payload) => { throw new Error(payload.content); }
  };

  global.fetch = async (url) => {
    const bytes = urls.get(String(url));
    assert.ok(bytes, "only the reviewed Discord files should be downloaded");
    return new Response(bytes, {
      headers: { "content-type": String(url).endsWith(".png") ? "image/png" : "application/zip" }
    });
  };
  try {
    await service.handleFreeBotReviewButton(interaction, "123456789012345678", client);
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(published.length, 1);
  assert.equal(published[0].files.length, 2);
  assert.equal(published[0].files[0].name, "promo.png");
  assert.equal(Buffer.compare(published[0].files[0].attachment, imageBytes), 0);
  assert.equal(published[0].files[1].name, "utility-bot.zip");
  assert.equal(Buffer.compare(published[0].files[1].attachment, zipBytes), 0);
  assert.deepEqual(published[0].allowedMentions, { roles: ["release-role"], users: ["223456789012345678"] });
  assert.match(reviewEdited.content, /Approved and published/);
  assert.equal(notified.length, 1);
});

test("approved free-bot promotions publish the source ZIP and promo image with the opt-in ping", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  const role = { id: "release-role" };
  const sent = [];
  const channel = {
    id: "release-channel",
    guildId: coopftGuildId,
    isTextBased: () => true,
    send: async payload => {
      sent.push(payload);
      return { id: "published-message", url: "https://discord.com/channels/" + coopftGuildId + "/release-channel/published-message" };
    }
  };
  service.getResource = async (_guildId, key) => key === "channel:free_bot_releases" ? channel.id : null;
  service.ensureFreeBotReleaseRole = async () => role;
  const sourceBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const imageBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const result = await service.publishFreeBotPromotion(
    { id: coopftGuildId, channels: { fetch: async () => channel } },
    {
      title: "Free Utility Bot",
      description: "A useful bot for community servers.",
      sourceBuffer,
      sourceFileName: "utility-bot.zip",
      imageBuffer,
      imageFileName: "promo.png",
      sourceRepositoryUrl: "https://github.com/example/utility-bot",
      submitterId: "123456789012345678"
    }
  );
  assert.equal(result.channel, channel);
  assert.equal(result.role, role);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /^<@&release-role> \*\*FREE BOT RELEASE: Free Utility Bot\*\*/);
  assert.ok(sent[0].content.includes("A useful bot for community servers."));
  assert.ok(sent[0].content.includes("**Source ZIP:** **utility-bot.zip**"));
  assert.ok(sent[0].content.includes("**GitHub:** <https://github.com/example/utility-bot>"));
  assert.ok(sent[0].content.includes("**Shared by:** <@123456789012345678>"));
  assert.deepEqual(sent[0].allowedMentions, { roles: [role.id], users: ["123456789012345678"] });
  assert.equal(sent[0].embeds, undefined, "public source announcements must not use embeds");
  assert.equal(sent[0].flags, MessageFlags.SuppressEmbeds);
  assert.equal(sent[0].files[0].name, "promo.png", "promotional image is attached first for a native preview");
  assert.equal(Buffer.compare(sent[0].files[0].attachment, imageBuffer), 0);
  assert.equal(sent[0].files[1].name, "utility-bot.zip");
  assert.equal(Buffer.compare(sent[0].files[1].attachment, sourceBuffer), 0);
});

test("owner free-bot releases attach the source ZIP to the fixed CoopFT release channel", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  const sent = [];
  const channel = {
    id: "release-channel",
    guildId: coopftGuildId,
    isTextBased: () => true,
    send: async payload => {
      sent.push(payload);
      return { id: "release-message", channelId: "release-channel" };
    }
  };
  service.ensureFreeBotReleaseRole = async () => ({ id: "release-role" });
  service.getResource = async (guildId, key) => {
    assert.equal(guildId, coopftGuildId);
    assert.equal(key, "channel:free_bot_releases");
    return channel.id;
  };
  const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const result = await service.publishFreeBotRelease(
    { id: coopftGuildId, channels: { fetch: async id => id === channel.id ? channel : null } },
    { buffer, fileName: "example-bot.zip", title: "Example Bot", description: "Ready to customise." }
  );
  assert.equal(result.channel, channel);
  assert.equal(result.message.id, "release-message");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].content.includes("<@&release-role>"), true);
  assert.equal(sent[0].content.includes("**Example Bot**"), true);
  assert.equal(sent[0].content.includes("Ready to customise."), true);
  assert.equal(sent[0].files[0].name, "example-bot.zip");
  assert.equal(Buffer.compare(sent[0].files[0].attachment, buffer), 0);
  assert.deepEqual(sent[0].allowedMentions, { roles: ["release-role"] });
});

test("free-bot releases reject non-ZIP or oversized archives before sending", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  let fetched = false;
  service.getResource = async () => "release-channel";
  const channel = { id: "release-channel", guildId: coopftGuildId, isTextBased: () => true, send: async () => { fetched = true; } };
  const guild = { id: coopftGuildId, channels: { fetch: async () => channel } };
  await assert.rejects(
    service.publishFreeBotRelease(guild, { buffer: Buffer.from("not zip"), fileName: "source.tar.gz" }),
    /valid ZIP files/
  );
  await assert.rejects(
    service.publishFreeBotRelease(guild, { buffer: Buffer.alloc(20 * 1024 * 1024 + 1), fileName: "large.zip" }),
    /ZIP files/
  );
  assert.equal(fetched, false);
});

test("generated role icon assets become CoopFT custom onboarding emojis", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  const created = [];
  service.getRoleIconBuffer = async key => Buffer.from("PNG:" + key);
  const guild = {
    id: coopftGuildId,
    members: { me: { permissions: { has: permission => permission === PermissionFlagsBits.CreateGuildExpressions } } },
    emojis: {
      cache: new Map(),
      create: async payload => {
        created.push(payload);
        return { id: "emoji-" + payload.name, name: payload.name };
      }
    }
  };
  const result = await service.ensureRoleImageEmojis(guild);
  assert.equal(result.created, 16);
  assert.equal(result.failed.length, 0);
  assert.equal(created.length, 16);
  for (const spec of ROLE_IMAGE_ICONS) {
    assert.equal(service.emojis.get(spec.emoji), "emoji-" + spec.emoji);
  }
});

test("role icon uploader uses generated PNG data when the guild supports ROLE_ICONS", async () => {
  const service = new CoopFTCommunityService({ query: async () => ({ rows: [] }) });
  service.getRoleIconBuffer = async () => Buffer.from("generated-png");
  const requests = [];
  const guild = {
    id: coopftGuildId,
    features: ["ROLE_ICONS"],
    client: { rest: { patch: async (route, payload) => requests.push({ route, payload }) } }
  };
  const result = await service.applyManagedRoleIcon(
    guild,
    { id: "role-id", editable: true },
    { key: "interest_gaming", name: "Gaming", icon: "🎮" }
  );
  assert.equal(result, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].payload.body.icon, "data:image/png;base64," + Buffer.from("generated-png").toString("base64"));
  assert.equal(requests[0].payload.body.unicode_emoji, undefined);
});

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
    "coopft-channel-decorate", "coopft-channels-sync", "coopft-panel", "coopft-roles-sync", "coopft-setup", "coopft-ticket-config",
    "event-cancel", "event-create", "event-list", "kick", "lock", "member-note-remove",
    "nickname", "note", "notes", "poll", "purge", "reset-nickname", "role-add",
    "role-remove", "slowmode", "suggestion", "suggestion-review", "ticket-add",
    "ticket-claim", "ticket-close", "ticket-cooldown", "ticket-info", "ticket-list", "ticket-priority",
    "ticket-remove", "ticket-rename", "timeout", "unban", "unlock", "untimeout",
    "warn", "warnings"
  ];
  expected.push("autorole", "onboarding-setup", "welcome-config", "coopft-public-access", "free-bot-channel", "free-bot-submit", "staff-directory");
  assert.deepEqual([...commands.keys()].sort(), expected.sort());
  for (const command of commands.values()) assert.doesNotThrow(() => command.data.toJSON());
  const autorole = commands.get("autorole").data.toJSON();
  assert.deepEqual(autorole.options.map(option => option.name), [
    "action", ...Array.from({ length: 20 }, (_, index) => "role_" + String(index + 1).padStart(2, "0"))
  ]);
  assert.equal(autorole.options[1].required, false);
  assert.equal(commands.get("onboarding-setup").data.toJSON().options.length, 0);
  const welcomeConfig = commands.get("welcome-config").data.toJSON();
  assert.deepEqual(welcomeConfig.options.map(option => option.name), ["action", "channel"]);
  const freeBotChannel = commands.get("free-bot-channel").data.toJSON();
  assert.deepEqual(freeBotChannel.options.map(option => option.name), ["channel"]);
  assert.deepEqual(freeBotChannel.options[0].channel_types, [0, 5]);
  const freeBotSubmit = commands.get("free-bot-submit").data.toJSON();
  assert.deepEqual(freeBotSubmit.options.map(option => option.name), ["title", "description", "image", "source", "repository"]);
  assert.equal(freeBotSubmit.options[0].required, true);
  assert.equal(freeBotSubmit.options[1].required, true);
  assert.equal(freeBotSubmit.options[2].required, true);
  assert.equal(freeBotSubmit.options[2].type, 11);
  assert.equal(freeBotSubmit.options[3].required, false);
  assert.equal(freeBotSubmit.options[3].type, 11);
  assert.equal(freeBotSubmit.options[4].required, false);
  assert.equal(freeBotSubmit.options[4].type, 3);
  for (const command of commands.values()) {
    const options = command.data.toJSON().options || [];
    let sawOptional = false;
    for (const option of options) {
      if (option.required === false) sawOptional = true;
      else if (sawOptional) assert.fail(command.data.name + " places a required option after an optional option: " + option.name);
    }
  }
  const cooldown = commands.get("ticket-cooldown").data.toJSON();
  assert.deepEqual(cooldown.options.map((option) => option.name), ["member", "ticket_type", "reason"]);
  assert.deepEqual(cooldown.options[1].choices.map((choice) => choice.value), [
    "custom_bot_request", "partnership", "member_report", "staff_report", "bot_exploit"
  ]);
  for (const configCommand of ["coopft-setup", "coopft-roles-sync", "coopft-channels-sync", "coopft-channel-decorate", "coopft-panel", "coopft-ticket-config"]) {
    assert.equal(commands.has(configCommand), true, configCommand + " must be available");
  }
  for (const removed of ["ping", "help", "serverinfo", "botinfo", "avatar", "application-status", "application-withdraw", "application-queue", "staff", "menu", "profile", "leaderboard"]) {
    assert.equal(commands.has(removed), false, removed + " is intentionally not exposed");
  }
});

test("public access repair grants view and message history without exposing private CoopFT channels", async () => {
  const resources = new Map();
  const channels = new Map();
  const edits = [];
  for (const key of ["start_here", "community", "services"]) {
    const id = "category-" + key;
    resources.set("resource:category:" + key, id);
    channels.set(id, {
      id,
      guildId: coopftGuildId,
      permissionOverwrites: {
        edit: async (principalId, permissions, reason) => edits.push({ channelId: id, principalId, permissions, reason })
      }
    });
  }
  for (const spec of PUBLIC_CHANNELS) {
    const id = "public-" + spec.key;
    resources.set("resource:channel:" + spec.key, id);
    channels.set(id, {
      id,
      guildId: coopftGuildId,
      permissionOverwrites: {
        edit: async (principalId, permissions, reason) => edits.push({ channelId: id, principalId, permissions, reason })
      }
    });
  }
  const everyone = { id: coopftGuildId };
  const communityRole = { id: "community-member-role" };
  const bot = {
    permissions: { has: permission => permission === PermissionFlagsBits.ManageChannels },
    roles: { highest: { position: 50 } }
  };
  const guild = {
    id: coopftGuildId,
    roles: { everyone },
    members: { me: bot },
    channels: { fetch: async id => channels.get(id) || null }
  };
  const pool = {
    query: async (_sql, params) => ({
      rows: resources.has(params[1]) ? [{ setting_value: resources.get(params[1]) }] : []
    })
  };
  const service = new CoopFTCommunityService(pool, { guildId: coopftGuildId });
  service.roles.set("community_member", communityRole);

  const result = await service.repairPublicChannelAccess(guild);
  assert.equal(result.categoriesUpdated, 3);
  assert.equal(result.channelsUpdated, PUBLIC_CHANNELS.length);
  assert.equal(result.missing.length, 0);
  assert.equal(edits.length, (3 + PUBLIC_CHANNELS.length) * 2);
  assert.ok(edits.every(edit => edit.permissions.ViewChannel === true));
  assert.ok(edits.every(edit => edit.permissions.ReadMessageHistory === true));
  assert.deepEqual(new Set(edits.map(edit => edit.principalId)), new Set([coopftGuildId, communityRole.id]));
  assert.equal([...resources.keys()].some(key => key.includes("staff_hq") || key.includes("application_review") || key.includes("ticket_transcripts")), false);
});

test("autorole and onboarding configuration commands reject non-owners", async () => {
  const commands = loadCoopFTCommands();
  const interaction = {
    guild: { id: "guild-1", ownerId: "server-owner" },
    guildId: "guild-1",
    user: { id: "not-the-owner" },
    options: { getString: () => "status" }
  };
  await assert.rejects(commands.get("autorole").execute(interaction, {}), /Only the actual server owner/);
  await assert.rejects(commands.get("onboarding-setup").execute(interaction, {}), /Only the actual server owner/);
  await assert.rejects(commands.get("welcome-config").execute(interaction, {}), /Only the actual server owner/);
});

test("onboarding setup replaces only the legacy interests question with three CoopFT questions", async () => {
  const commands = loadCoopFTCommands();
  const everyone = { id: "guild-1" };
  const channels = Array.from({ length: 10 }, (_, index) => {
    const name = ["rules", "announcements", "general", "introductions", "help", "media", "showcase", "your-creation", "events", "gaming"][index];
    const sendable = new Set(["general", "introductions"]);
    return {
      id: "channel-" + index,
      guildId: "guild-1",
      name,
      type: ChannelType.GuildText,
      nsfw: false,
      rawPosition: index,
      permissionOverwrites: {
        edit: async (_id, permissions) => {
          if (permissions.SendMessages === true) sendable.add(name);
        }
      },
      permissionsFor: () => ({
        has: permission => permission === PermissionFlagsBits.ViewChannel ||
          (permission === PermissionFlagsBits.SendMessages && sendable.has(name))
      })
    };
  });
  const makePrompt = (id, title, optionTitle) => ({
    id,
    type: 0,
    title,
    singleSelect: true,
    required: false,
    inOnboarding: true,
    options: new Map([[id + "-option", {
      id: id + "-option",
      title: optionTitle,
      description: "Keep this option",
      emoji: null,
      channels: new Map(),
      roles: new Map()
    }]])
  });
  const existingPrompts = [
    makePrompt("region", "Which region are you in?", "Asia"),
    makePrompt("old-interests", "What are ur interests?", "Gaming"),
    makePrompt("level", "What is your member level?", "Regular")
  ];
  let saved;
  const bot = {
    permissions: { has: () => true },
    roles: { highest: { position: 20 } }
  };
  const guild = {
    id: "guild-1",
    ownerId: "owner-1",
    features: ["COMMUNITY"],
    roles: {
      everyone,
      fetch: async () => null
    },
    members: { me: bot },
    channels: {
      fetch: async () => new Map([
        ...channels.map(channel => [channel.id, channel]),
        ["unavailable-channel", null]
      ])
    },
    fetch: async function () { return this; },
    fetchOnboarding: async () => ({ prompts: new Map(existingPrompts.map(prompt => [prompt.id, prompt])) }),
    editOnboarding: async payload => { saved = payload; }
  };
  const interaction = {
    guild,
    guildId: guild.id,
    user: { id: guild.ownerId },
    options: { getString: () => undefined },
    reply: async payload => payload
  };
  const roleSpecs = [...INTEREST_ROLES, ...PING_ROLES];
  const configuredRoles = new Map(roleSpecs.map((spec, index) => [
    spec.key, { id: "configured-role-" + index, name: spec.name }
  ]));
  const generatedEmojis = new Map(ROLE_IMAGE_ICONS.map(spec => [spec.emoji, "generated-emoji-" + spec.roleKey]));
  const coopft = { roles: configuredRoles, emojis: generatedEmojis, getResource: async () => null };

  await commands.get("onboarding-setup").execute(interaction, { coopft });

  assert.equal(saved.enabled, true);
  assert.equal(saved.mode, 0);
  assert.equal(saved.defaultChannels.length, 7);
  assert.deepEqual(saved.prompts.map(prompt => prompt.title), [
    "Which region are you in?",
    "What is your member level?",
    "What topics are you interested in?",
    "Which updates would you like to receive?",
    "Which spaces should we add to your channel list?"
  ]);
  assert.equal(saved.prompts.length, 5);
  assert.equal(saved.prompts.some(prompt => prompt.title === "What are ur interests?"), false);
  assert.equal(saved.prompts[0].options[0].title, "Asia");
  assert.equal(saved.prompts[1].options[0].title, "Regular");
  assert.equal(saved.prompts[2].options.length, INTEREST_ROLES.length);
  assert.equal(saved.prompts[3].options.length, PING_ROLES.length);
  assert.match(saved.prompts[2].options[0].emoji, /^<:cf3d_roleimg_gaming:generated-emoji-interest_gaming>$/);
  assert.match(saved.prompts[3].options[0].emoji, /^<:cf3d_roleimg_announcements:generated-emoji-ping_announcements>$/);
  assert.equal(saved.prompts[4].options.length, 3);
  for (const prompt of saved.prompts.slice(2)) {
    assert.equal(prompt.singleSelect, false);
    assert.equal(prompt.required, false);
    assert.equal(prompt.inOnboarding, true);
    assert.equal(typeof prompt.id, "string");
    for (const option of prompt.options) {
      assert.equal(typeof option.id, "string");
      assert.ok(option.emoji);
      assert.ok(option.roles.every(id => typeof id === "string"));
      assert.ok(option.channels.every(id => typeof id === "string"));
    }
  }
  assert.doesNotThrow(() => JSON.stringify(saved));
});

test("onboarding setup refuses to delete other questions when three CoopFT questions exceed the limit", async () => {
  const commands = loadCoopFTCommands();
  const existingPrompts = ["Region", "What are ur interests?", "Level", "Platform"].map((title, index) => ({
    id: "prompt-" + index,
    title,
    type: 0,
    singleSelect: true,
    required: false,
    inOnboarding: true,
    options: new Map()
  }));
  const everyone = { id: "guild-1" };
  const channels = Array.from({ length: 10 }, (_, index) => {
    const name = ["rules", "announcements", "general", "introductions", "help", "media", "showcase", "your-creation", "events", "gaming"][index];
    const sendable = new Set(["general", "introductions"]);
    return {
      id: "channel-" + index,
      guildId: "guild-1",
      name,
      type: ChannelType.GuildText,
      nsfw: false,
      rawPosition: index,
      permissionOverwrites: { edit: async (_id, permissions) => { if (permissions.SendMessages) sendable.add(name); } },
      permissionsFor: () => ({
        has: permission => permission === PermissionFlagsBits.ViewChannel ||
          (permission === PermissionFlagsBits.SendMessages && sendable.has(name))
      })
    };
  });
  const roleSpecs = [...INTEREST_ROLES, ...PING_ROLES];
  const configuredRoles = new Map(roleSpecs.map((spec, index) => [
    spec.key, { id: "configured-role-" + index, name: spec.name }
  ]));
  let editCalled = false;
  const bot = { permissions: { has: () => true }, roles: { highest: { position: 20 } } };
  const guild = {
    id: "guild-1",
    ownerId: "owner-1",
    features: ["COMMUNITY"],
    roles: { everyone, fetch: async () => null },
    members: { me: bot },
    channels: { fetch: async () => new Map(channels.map(channel => [channel.id, channel])) },
    fetch: async function () { return this; },
    fetchOnboarding: async () => ({ prompts: new Map(existingPrompts.map(prompt => [prompt.id, prompt])) }),
    editOnboarding: async () => { editCalled = true; }
  };
  const interaction = {
    guild,
    guildId: guild.id,
    user: { id: guild.ownerId },
    options: { getString: () => undefined },
    reply: async payload => payload
  };
  const coopft = { roles: configuredRoles, getResource: async () => null };
  await assert.rejects(
    commands.get("onboarding-setup").execute(interaction, { coopft }),
    /adding the 3 CoopFT questions would make 6/
  );
  assert.equal(editCalled, false, "existing onboarding must remain untouched when all five slots cannot fit");
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


test("CoopFT staff hierarchy follows the updated four-section directory", () => {
  assert.deepEqual(STAFF_RANKS.map((role) => role.name), [
    "Owner", "Co-Owner", "Monarch",
    "High Rank Lead", "Team Lead", "Right Wing", "Left Wing", "Support Lead", "Overseer",
    "Staff Manager", "Head Council", "Senior Council", "Council",
    "Head Moderator", "Senior Moderator", "Moderator", "Junior Moderator"
  ]);
  const groups = new Map(ROLE_LAYOUT.map((group) => [group.bracket, group.roles]));
  assert.deepEqual(groups.get("low_rank"), [
    "staff_supervisor", "senate", "supreme_council", "council"
  ]);
  assert.deepEqual(groups.get("mod_roles"), [
    "head_moderator", "senior_moderator", "moderator", "junior_moderator"
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

test("startup role loading renames and recolours only six approved CoopFT staff roles, recovering stale saved IDs", async () => {
  const changes = [];
  const oldNames = new Map([
    ["high_rank_supervisor", "High Rank Supervisor"],
    ["apex", "Apex"],
    ["halo", "Halo"],
    ["staff_supervisor", "Staff Supervisor"],
    ["supreme_council", "Supreme Council"],
    ["senate", "Senate"]
  ]);
  const roleSpecs = STAFF_RANKS.filter((spec) => oldNames.has(spec.key));
  const roleMap = new Map();
  for (const spec of roleSpecs) {
    const role = {
      id: "role-" + spec.key,
      name: oldNames.get(spec.key),
      color: 0,
      managed: false,
      editable: true,
      position: 10,
      edit: async (payload) => {
        Object.assign(role, payload);
        changes.push({ key: spec.key, payload });
        return role;
      }
    };
    roleMap.set(role.id, role);
  }
  const unrelated = {
    id: "stale-role-id",
    name: "Unrelated role",
    color: 0,
    managed: false,
    editable: true,
    edit: async () => { throw new Error("The unrelated role must never be edited"); }
  };
  roleMap.set(unrelated.id, unrelated);
  const roleCache = new Map(roleMap);
  roleCache.find = (predicate) => [...roleCache.values()].find(predicate);
  const saved = new Map([["resource:role:apex", unrelated.id]]);
  const writes = [];
  const pool = {
    async query(sql, params) {
      if (sql.includes("SELECT setting_key,setting_value")) {
        return {
          rows: [...saved.entries()].map(([setting_key, setting_value]) => ({ setting_key, setting_value }))
        };
      }
      if (sql.includes("INSERT INTO coopft_community_settings")) {
        saved.set(params[1], JSON.parse(params[2]));
        writes.push({ key: params[1], value: JSON.parse(params[2]) });
        return { rows: [] };
      }
      return { rows: [] };
    }
  };
  const service = new CoopFTCommunityService(pool, { guildId: coopftGuildId });
  const guild = {
    id: coopftGuildId,
    roles: {
      cache: roleCache,
      fetch: async (id) => roleMap.get(id) || null
    }
  };

  const result = await service.loadManagedRoles(guild);
  assert.equal(result.staffRoleSync.updated.length, 6);
  assert.equal(result.staffRoleSync.blocked.length, 0);
  assert.equal(result.staffRoleSync.missing.length, 0);
  assert.equal(result.staffRoleSync.failed.length, 0);
  for (const spec of roleSpecs) {
    const role = roleMap.get("role-" + spec.key);
    assert.equal(role.name, spec.name, spec.key + " should be renamed on startup");
    assert.equal(role.color, spec.primary, spec.key + " should receive its configured colour");
  }
  assert.equal(changes.length, 6);
  assert.equal(changes.some((item) => item.key === "apex" && item.payload.name === "Unrelated role"), false);
  assert.equal(saved.get("resource:role:apex"), "role-apex");
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
  for (const section of ["OWNER RANK", "LEADERSHIP", "OPERATIONS", "MOD ROLES", "Developers"]) {
    assert.ok(headingText.includes(section), section + " section must be present");
  }
  assert.ok(data.fields.every((field) => field.value.includes("VACANT")));

  const operations = data.fields.find((field) => field.name.includes("OPERATIONS"));
  const operationsOrder = ["Staff Manager", "Head Council", "Senior Council", "Council"]
    .map((name) => operations.value.indexOf("**" + name + "**"));
  assert.ok(operationsOrder.every((position) => position >= 0), "all four Operations roles must be listed");
  assert.deepEqual(
    operationsOrder,
    [...operationsOrder].sort((a, b) => a - b),
    "Operations directory must list roles from highest to lowest"
  );
});

test("staff directory automatically includes the standalone Manager role", async () => {
  const service = new CoopFTCommunityService({
    query: async () => ({ rows: [], rowCount: 1 })
  }, { guildId: coopftGuildId });
  service.memberRosterLoaded = true;
  const managerRole = { id: "123456789012345678", name: "Manager" };
  const embed = await service.buildStaffDirectoryEmbed({
    id: coopftGuildId,
    roles: { cache: new Map([[managerRole.id, managerRole]]) },
    members: { cache: new Map() }
  });
  const data = embed.toJSON();
  const management = data.fields.find((field) => field.name.includes("MANAGEMENT"));
  assert.ok(management, "the Manager category should be added");
  assert.ok(management.value.includes("<@&" + managerRole.id + ">"));
  assert.ok(management.value.includes("VACANT"));
});

test("staff-directory management command is registered with the configurable actions", () => {
  const command = loadCoopFTCommands().get("staff-directory");
  assert.ok(command, "staff-directory slash command should be registered");
  const definition = command.data.toJSON();
  const action = definition.options.find((option) => option.name === "action");
  assert.deepEqual(
    action.choices.map((choice) => choice.value),
    ["refresh", "add_category", "remove_category", "edit_category", "add_role", "remove_role", "set_title", "set_description"]
  );
  for (const optionName of ["category", "role", "name", "emoji", "text"]) {
    assert.ok(definition.options.some((option) => option.name === optionName), optionName + " option should be available");
  }
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

test("manual setup uploads every configured CoopFT emblem as a separate Discord-sized PNG", async () => {
  const { PermissionFlagsBits, MessageFlags } = require("discord.js");
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
  assert.equal(result.created, EMOJI_SPRITE.length + ROLE_IMAGE_ICONS.length);
  assert.equal(result.available, 0);
  assert.deepEqual(result.failed, []);
  assert.equal(uploads.length, EMOJI_SPRITE.length + ROLE_IMAGE_ICONS.length);
  assert.deepEqual(uploads.slice(0, EMOJI_SPRITE.length).map((item) => item.name), EMOJI_SPRITE);
  assert.deepEqual(
    uploads.slice(EMOJI_SPRITE.length).map((item) => item.name),
    ROLE_IMAGE_ICONS.map((item) => item.emoji)
  );

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
  assert.equal(uniqueImages.size, uploads.length);
  for (const upload of uploads) {
    assert.equal(service.emojis.get(upload.name), "emoji-" + upload.name);
  }
});

test("channel decoration updates only default plain names and preserves custom names", async () => {
  const settings = new Map([
    ["resource:channel:staff_guide", "guide-id"],
    ["resource:channel:staff_chat", "custom-chat-id"],
    ["resource:category:staff_hq", "staff-category-id"]
  ]);
  const renamed = [];
  const guide = {
    id: "guide-id",
    name: "staff-guide",
    setName: async (name, reason) => {
      renamed.push({ id: "guide-id", name, reason });
      guide.name = name;
    },
    permissionOverwrites: { set: async () => { throw new Error("Permissions must not be changed"); } }
  };
  const customChat = {
    id: "custom-chat-id",
    name: "team-lounge",
    setName: async () => { throw new Error("Custom names must be preserved"); }
  };
  const staffCategory = {
    id: "staff-category-id",
    name: "STAFF OPERATIONS",
    setName: async (name, reason) => {
      renamed.push({ id: "staff-category-id", name, reason });
      staffCategory.name = name;
    }
  };
  const pool = {
    async query(sql, params) {
      if (sql.includes("SELECT setting_value")) {
        return { rows: settings.has(params[1]) ? [{ setting_value: settings.get(params[1]) }] : [] };
      }
      throw new Error("Unexpected SQL in channel decoration test");
    }
  };
  const service = new CoopFTCommunityService(pool, { guildId: coopftGuildId });
  const channels = new Map([
    ["guide-id", guide],
    ["custom-chat-id", customChat],
    ["staff-category-id", staffCategory]
  ]);
  const result = await service.decorateManagedChannelNames({
    id: coopftGuildId,
    channels: { fetch: async (id) => channels.get(id) || null }
  });
  assert.equal(guide.name, "▤・staff-guide");
  assert.equal(staffCategory.name, "╭────〔 STAFF OPERATIONS 〕────╮");
  assert.equal(customChat.name, "team-lounge");
  assert.deepEqual(renamed.map((item) => item.id), ["guide-id", "staff-category-id"]);
  assert.equal(result.renamed.length, 2);
  assert.ok(result.preservedCustomNames.some((item) => item.key === "staff_chat"));
  assert.ok(result.alreadyDecorated.length >= 0);
  assert.equal(result.missing.length > 0, true);
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

test("saved application-review embeds lose legacy images and footer metadata", async () => {
  const edits = [];
  const message = {
    embeds: [{
      title: "Previous application",
      description: "Application details",
      footer: { text: "Old footer" },
      image: { url: "https://example.com/banner.png" },
      thumbnail: { url: "https://example.com/avatar.png" },
      author: { name: "Old author", icon_url: "https://example.com/icon.png" }
    }],
    createdAt: new Date("2026-11-15T10:00:00.000Z"),
    edit: async (payload) => edits.push(payload)
  };
  const pool = {
    async query(sql) {
      if (sql.includes("SELECT id,review_message_id")) {
        return { rows: [{ id: "application-1", review_message_id: "review-message-1" }] };
      }
      if (sql.includes("SELECT id,role_key,review_message_id")) {
        return { rows: [] };
      }
      throw new Error("Unexpected SQL in application review sanitation test.");
    }
  };
  const service = new CoopFTCommunityService(pool, { guildId: coopftGuildId });
  const channel = { messages: { fetch: async () => message } };
  const result = await service.sanitizeApplicationReviewEmbeds({ id: coopftGuildId }, channel);
  assert.deepEqual(result, { updated: 1, missing: 0 });
  const cleaned = edits[0].embeds[0].toJSON();
  assert.equal(cleaned.image, undefined);
  assert.equal(cleaned.thumbnail, undefined);
  assert.equal(cleaned.footer, undefined);
  assert.equal(cleaned.author.icon_url, undefined);
  assert.ok(cleaned.timestamp);
  assert.equal(edits[0].components, undefined);
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

test("newly opened and closed tickets keep consistent channel-name decorations", () => {
  assert.equal(ticketChannelName("bot", "Brian"), "⌘・bot-brian");
  assert.equal(ticketChannelName("server", "Brian"), "◈・server-brian");
  assert.equal(ticketChannelName("development", "Brian"), "⌘・commission-brian");
  assert.equal(closedTicketChannelName("⌘・bot-brian"), "⌑・closed-brian");
  assert.equal(closedTicketChannelName("◈・server-brian"), "⌑・closed-brian");
  assert.ok(ticketChannelName("development", "A".repeat(120)).length <= 100);
  assert.ok(closedTicketChannelName("⌘・commission-" + "a".repeat(120)).length <= 100);
});

test("community rules use real Discord mentions for suggestions and ticket intake", () => {
  const service = new CoopFTCommunityService(
    { query: async () => ({ rows: [] }) },
    { guildId: coopftGuildId }
  );
  const embed = service.buildCommunityRulesEmbed(
    { id: coopftGuildId },
    {
      suggestions: { id: "111111111111111111" },
      open_ticket: { id: "222222222222222222" }
    }
  ).toJSON();
  const community = embed.fields.find((field) => field.name.includes("COMMUNITY"));
  const support = embed.fields.find((field) => field.name.includes("SUPPORT"));
  assert.match(community.value, /<#111111111111111111>/);
  assert.match(support.value, /<#222222222222222222>/);
  assert.equal(embed.image, undefined);
  assert.equal(embed.thumbnail, undefined);
  assert.equal(embed.footer, undefined);
  assert.ok(embed.timestamp);
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
