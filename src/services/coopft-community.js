"use strict";

const { randomUUID } = require("node:crypto");
const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, MessageFlags, PermissionFlagsBits, Routes
} = require("discord.js");
const { STAFF_RANKS, HR_ROLES, EMOJI_SPRITE, PUBLIC_CHANNELS, PRIVATE_CHANNELS } = require("../config/coopft-design");
const { coopftGuildId } = require("../config/server-personas");

const CLEANUP_CONFIRMATION = "DELETE_EDITABLE_ROLES";
const STAFF_MANAGER_KEYS = new Set(["owner", "co_owner", "high_rank_supervisor"]);
const HR_MANAGER_KEYS = new Set(["hr_director", "hr_manager"]);
const TICKET_TYPES = Object.freeze({
  support: { label: "General Support", icon: "cf_headset", fallback: "🎧" },
  bug: { label: "Bug Report", icon: "cf_gear", fallback: "⚙️" },
  custom_bot: { label: "Custom Bot Request", icon: "cf_key", fallback: "🔑" },
  suggestion: { label: "Suggestion", icon: "cf_spark", fallback: "✨" }
});

function safeChannelName(value) {
  return String(value || "member").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 75) || "member";
}

class CoopFTCommunityService {
  constructor(pool, options = {}) {
    this.pool = pool;
    this.guildId = options.guildId || coopftGuildId;
    this.roles = new Map();
    this.emojis = new Map();
  }

  async getSetting(guildId, key) {
    const result = await this.pool.query(
      "SELECT setting_value FROM coopft_community_settings WHERE guild_id=$1 AND setting_key=$2",
      [guildId, key]
    );
    return result.rows[0]?.setting_value ?? null;
  }

  async setSetting(guildId, key, value) {
    await this.pool.query(
      "INSERT INTO coopft_community_settings (guild_id,setting_key,setting_value) VALUES ($1,$2,$3::jsonb) " +
      "ON CONFLICT (guild_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()",
      [guildId, key, JSON.stringify(value)]
    );
  }

  async getResource(guildId, key) {
    return this.getSetting(guildId, "resource:" + key);
  }

  async saveResource(guildId, key, id) {
    await this.setSetting(guildId, "resource:" + key, id);
  }

  emoji(guildId, name, fallback = "✦") {
    const id = this.emojis.get(name);
    return id ? "<:" + name + ":" + id + ">" : fallback;
  }

  async ensureEmojis(guild) {
    const result = { created: 0, available: 0, failed: [] };
    // Rebuild from the current guild cache so deleted custom emojis never leave stale markup.
    this.emojis.clear();
    const found = new Map(guild.emojis.cache.map((emoji) => [emoji.name, emoji]));
    const glyphs = ["♛", "⬟", "★", "◆", "❀", "❧", "♨", "❄", "⚿", "▰", "▤", "◖", "⚙", "♢", "⚭", "✦"];
    const colors = [
      ["#64101d", "#e13d4b"], ["#313744", "#a7b4c5"], ["#9b6b1c", "#f3d17a"], ["#153d9a", "#35b5f5"],
      ["#542a93", "#b26af2"], ["#176b45", "#62c987"], ["#9b2c16", "#f47a3c"], ["#176d91", "#73ddf5"],
      ["#9c315c", "#f07db0"], ["#275b9a", "#6ea8e8"], ["#8a356b", "#d68dba"], ["#13566a", "#47cbd2"],
      ["#48515e", "#a7b4c5"], ["#7b2438", "#ed758b"], ["#8a5b24", "#e0b85f"], ["#6840a4", "#b68bea"]
    ];
    let canvasApi = null;
    try {
      canvasApi = require("@napi-rs/canvas");
    } catch (error) {
      result.failed.push("emoji renderer unavailable: " + error.message);
    }
    for (let index = 0; index < EMOJI_SPRITE.length; index += 1) {
      const name = EMOJI_SPRITE[index];
      const existing = found.get(name);
      if (existing) {
        this.emojis.set(name, existing.id);
        result.available += 1;
        continue;
      }
      if (!canvasApi || !guild.members.me?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
        result.failed.push(name + ": missing Manage Expressions permission or canvas support");
        continue;
      }
      try {
        const canvas = canvasApi.createCanvas(128, 128);
        const context = canvas.getContext("2d");
        const gradient = context.createLinearGradient(12, 12, 116, 116);
        gradient.addColorStop(0, colors[index][0]);
        gradient.addColorStop(1, colors[index][1]);
        context.clearRect(0, 0, 128, 128);
        context.beginPath();
        context.arc(64, 64, 59, 0, Math.PI * 2);
        context.fillStyle = gradient;
        context.fill();
        context.lineWidth = 5;
        context.strokeStyle = "rgba(255,255,255,0.9)";
        context.stroke();
        context.beginPath();
        context.arc(64, 64, 48, 0, Math.PI * 2);
        context.lineWidth = 2;
        context.strokeStyle = "rgba(255,255,255,0.45)";
        context.stroke();
        context.fillStyle = "#ffffff";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = "bold 68px Arial";
        context.shadowColor = "rgba(0,0,0,0.35)";
        context.shadowBlur = 5;
        context.fillText(glyphs[index], 64, 66);
        const created = await guild.emojis.create({
          attachment: canvas.toBuffer("image/png"),
          name,
          reason: "CoopFT branded interface emoji pack"
        });
        this.emojis.set(name, created.id);
        result.created += 1;
      } catch (error) {
        result.failed.push(name + ": " + error.message);
      }
    }
    const nextMap = Object.fromEntries([...this.emojis.entries()]);
    await this.setSetting(guild.id, "emoji_map", nextMap);
    return result;
  }

  async ensureRole(guild, spec) {
    const resourceKey = "role:" + spec.key;
    const savedId = await this.getResource(guild.id, resourceKey);
    let role = savedId ? await guild.roles.fetch(savedId).catch(() => null) : null;
    if (!role) role = guild.roles.cache.find((item) => item.name === "CF • " + spec.name && !item.managed) || null;
    let created = false;
    if (!role) {
      try {
        role = await guild.roles.create({
          name: "CF • " + spec.name,
          color: spec.primary,
          permissions: [],
          hoist: true,
          mentionable: false,
          reason: "CoopFT automatic server setup"
        });
      } catch (error) {
        if (!String(error.message).toLowerCase().includes("unicode") && error.code !== 50035) throw error;
        role = await guild.roles.create({
          name: "CF • " + spec.name,
          color: spec.primary,
          permissions: [],
          hoist: true,
          mentionable: false,
          reason: "CoopFT automatic server setup"
        });
      }
      created = true;
    }
    await this.saveResource(guild.id, resourceKey, role.id);

    // Gradient colours require the server's ENHANCED_ROLE_COLORS feature.
    try {
      await guild.client.rest.patch(Routes.guildRole(guild.id, role.id), {
        body: { colors: { primary_color: spec.primary, secondary_color: spec.secondary, tertiary_color: null } },
        reason: "CoopFT staff role visual style"
      });
    } catch (error) {
      if (![400, 403, 50013, 50035].includes(error.status) && error.code !== 50013) {
        console.warn("[coopft] Gradient style skipped for " + spec.name + ":", error.message);
      }
    }
    // Role icons require ROLE_ICONS. The embed keeps an icon even when unsupported.
    try {
      await guild.client.rest.patch(Routes.guildRole(guild.id, role.id), {
        body: { unicode_emoji: spec.icon },
        reason: "CoopFT staff role icon"
      });
    } catch (_) {}
    return { role, created };
  }

  async cleanupEditableRoles(guild) {
    const alreadyDone = await this.getSetting(guild.id, "role_cleanup_complete");
    if (alreadyDone) return { deleted: 0, candidates: [], alreadyDone: true };

    const keepIds = new Set(String(process.env.COOPFT_KEEP_ROLE_IDS || "")
      .split(",").map((value) => value.trim()).filter(Boolean));
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      return { deleted: 0, candidates: [], blocked: "Manage Roles permission is missing." };
    }

    const candidates = [...guild.roles.cache.values()]
      .filter((role) =>
        role.id !== guild.id &&
        !role.managed &&
        role.editable &&
        !keepIds.has(role.id) &&
        !role.name.startsWith("CF • ")
      )
      .sort((a, b) => a.position - b.position);

    const snapshot = candidates.map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      permissions: role.permissions.bitfield.toString(),
      hoist: role.hoist,
      mentionable: role.mentionable,
      position: role.position,
      cachedMemberCount: role.members?.size ?? null
    }));
    await this.setSetting(guild.id, "role_cleanup_preview", snapshot);

    // A restart never deletes roles by itself. Review the preview and provide the
    // exact environment confirmation after backing up role assignments.
    if (process.env.COOPFT_ROLE_CLEANUP_CONFIRM !== CLEANUP_CONFIRMATION) {
      return { deleted: 0, candidates: snapshot, awaitingConfirmation: true };
    }

    await this.setSetting(guild.id, "role_cleanup_snapshot", snapshot);
    let deleted = 0;
    const failures = [];
    for (const role of candidates) {
      try {
        await role.delete("One-time CoopFT role cleanup explicitly confirmed by server operator");
        deleted += 1;
      } catch (error) {
        failures.push(role.name + ": " + error.message);
      }
    }
    await this.setSetting(guild.id, "role_cleanup_complete", {
      completedAt: new Date().toISOString(),
      deleted,
      skippedOrFailed: failures
    });
    return { deleted, candidates: snapshot, failures, completed: true };
  }

  async ensureCategory(guild, key, name, permissionOverwrites) {
    const resourceKey = "category:" + key;
    const savedId = await this.getResource(guild.id, resourceKey);
    let category = savedId ? await guild.channels.fetch(savedId).catch(() => null) : null;
    if (!category) {
      category = guild.channels.cache.find((channel) =>
        channel.type === ChannelType.GuildCategory &&
        channel.name === name &&
        channel.topic === "coopft-managed:v1:" + key
      ) || null;
    }
    let created = false;
    if (!category) {
      category = await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: permissionOverwrites || [],
        reason: "CoopFT automatic server layout"
      });
      created = true;
    } else {
      if (category.name !== name) await category.setName(name, "Repair CoopFT managed category name");
      if (permissionOverwrites) {
        await category.permissionOverwrites.set(permissionOverwrites, "CoopFT managed category permissions");
      }
    }
    await this.saveResource(guild.id, resourceKey, category.id);
    return { channel: category, created };
  }

  async ensureChannel(guild, spec, parent) {
    const resourceKey = "channel:" + spec.key;
    const savedId = await this.getResource(guild.id, resourceKey);
    let channel = savedId ? await guild.channels.fetch(savedId).catch(() => null) : null;
    if (!channel) {
      channel = guild.channels.cache.find((item) =>
        item.type === ChannelType.GuildText &&
        item.parentId === parent.id &&
        item.topic === "coopft-managed:v1:" + spec.key
      ) || null;
    }
    let created = false;
    if (!channel) {
      channel = await guild.channels.create({
        name: spec.name,
        type: ChannelType.GuildText,
        parent: parent.id,
        topic: "coopft-managed:v1:" + spec.key,
        permissionOverwrites: [...parent.permissionOverwrites.cache.values()].map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield,
          deny: overwrite.deny.bitfield
        })),
        reason: "CoopFT automatic server layout"
      });
      created = true;
    } else {
      // Keep managed child channels aligned with their category after restart
      // and repair manual renames/moves only for channels this bot owns.
      if (channel.name !== spec.name) await channel.setName(spec.name, "Repair CoopFT managed channel name");
      if (channel.parentId !== parent.id) await channel.setParent(parent.id, { lockPermissions: false, reason: "Repair CoopFT managed channel category" });
      await channel.permissionOverwrites.set(
        [...parent.permissionOverwrites.cache.values()].map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield,
          deny: overwrite.deny.bitfield
        })),
        "CoopFT managed channel permission synchronization"
      );
      if (channel.topic !== "coopft-managed:v1:" + spec.key) {
        await channel.setTopic("coopft-managed:v1:" + spec.key, "Repair CoopFT managed channel marker");
      }
    }
    await this.saveResource(guild.id, resourceKey, channel.id);
    return { channel, created };
  }

  async staffPermissionOverwrites(guild) {
    const botMember = guild.members.me || await guild.members.fetchMe();
    const allowedRoles = [...this.roles.values()].map((role) => role.id);
    const supportRoles = allowedRoles.map((id) => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }));
    return [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      },
      ...supportRoles
    ];
  }

  async bootstrap(guild, options = {}) {
    if (!guild || guild.id !== this.guildId) throw new Error("CoopFT setup can only run in the configured CoopFT server.");
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!me) throw new Error("The bot's server member could not be fetched.");
    const required = [
      PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory
    ];
    const missing = required.filter((permission) => !me.permissions.has(permission));
    if (missing.length) throw new Error("CoopFT setup requires Manage Roles, Manage Channels, View Channel, Send Messages, Embed Links and Read Message History. Missing: " + missing.join(", "));

    // Startup guild fetches can return a Guild before its child managers are warm.
    // Populate only guild-level resource caches; never enumerate the member roster.
    await Promise.all([
      guild.roles.fetch(),
      guild.channels.fetch(),
      guild.emojis.fetch()
    ]);
    const emojiResult = await this.ensureEmojis(guild);
    const counts = { createdRoles: 0, createdChannels: 0, createdEmojis: emojiResult.created };
    const createChannel = async (spec, parent) => {
      const result = await this.ensureChannel(guild, spec, parent);
      if (result.created) counts.createdChannels += 1;
      return result.channel;
    };

    const startCategory = (await this.ensureCategory(guild, "start_here", "✦ START HERE")).channel;
    const communityCategory = (await this.ensureCategory(guild, "community", "✦ COMMUNITY")).channel;
    const servicesCategory = (await this.ensureCategory(guild, "services", "✦ COOPFT SERVICES")).channel;
    const publicByKey = {};
    for (const spec of PUBLIC_CHANNELS) {
      const parent = ["welcome", "rules", "announcements", "introductions"].includes(spec.key)
        ? startCategory
        : ["general", "media", "showcase", "help_study", "your_creation"].includes(spec.key)
          ? communityCategory : servicesCategory;
      publicByKey[spec.key] = await createChannel(spec, parent);
    }
    publicByKey.staff_directory = await createChannel({ key: "staff_directory", name: "staff-directory" }, servicesCategory);

    const cleanup = await this.cleanupEditableRoles(guild);
    this.roles.clear();
    for (const spec of [...STAFF_RANKS, ...HR_ROLES]) {
      const result = await this.ensureRole(guild, spec);
      this.roles.set(spec.key, result.role);
      if (result.created) counts.createdRoles += 1;
    }

    const staffOverwrites = await this.staffPermissionOverwrites(guild);
    const staffCategory = (await this.ensureCategory(guild, "staff_hq", "✦ STAFF HQ", staffOverwrites)).channel;
    const privateByKey = {};
    for (const spec of PRIVATE_CHANNELS) {
      const result = await this.ensureChannel(guild, spec, staffCategory);
      privateByKey[spec.key] = result.channel;
      if (result.created) counts.createdChannels += 1;
    }

    const ticketOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
    ];
    await this.ensureCategory(guild, "tickets", "✦ PRIVATE TICKETS", ticketOverwrites);

    await this.updateStaffDirectory(guild);
    await this.ensureTicketPanel(guild, publicByKey.open_ticket);
    await this.ensureBrandMessages(guild, publicByKey);
    if (cleanup.awaitingConfirmation) {
      const previewAnnounced = await this.getSetting(guild.id, "role_cleanup_preview_announced");
      if (!previewAnnounced) {
        const names = cleanup.candidates.map((role) => role.name).slice(0, 35);
        const remainder = Math.max(0, cleanup.candidates.length - names.length);
        await this.postStaffUpdate(
          guild,
          this.emoji(guild.id, "cf_shield", "🛡️") + " **One-time role cleanup preview**\\n" +
          cleanup.candidates.length + " ordinary roles are editable by the bot. No roles were deleted.\\n" +
          (names.length ? names.map((name) => "• " + name).join("\\n") : "No eligible roles found.") +
          (remainder ? "\\n… and " + remainder + " more." : "") +
          "\\n\\nReview role assignments and backups before setting COOPFT_ROLE_CLEANUP_CONFIRM=DELETE_EDITABLE_ROLES. Managed roles and roles above the bot remain untouched."
        );
        await this.setSetting(guild.id, "role_cleanup_preview_announced", true);
      }
    }
    if (cleanup.completed) {
      await this.postStaffUpdate(
        guild,
        this.emoji(guild.id, "cf_shield", "🛡️") + " One-time cleanup completed. Deleted " + cleanup.deleted +
        " editable roles. Unmanageable/managed roles were left in place."
      );
    }
    if (options.manual) await this.postStaffUpdate(guild, "Setup repaired by <@" + options.actorId + ">.");

    await me.setNickname("CoopFT • Assistant", "Per-server CoopFT identity").catch((error) =>
      console.warn("[coopft] Could not set CoopFT nickname:", error.message)
    );

    if (cleanup.awaitingConfirmation) {
      console.warn("[coopft] Role cleanup is preview-only. " + cleanup.candidates.length + " editable roles are eligible; no roles were deleted. Review the snapshot and confirm with COOPFT_ROLE_CLEANUP_CONFIRM.");
    }
    if (cleanup.failures?.length) console.warn("[coopft] Some roles could not be deleted:", cleanup.failures.join("; "));
    if (emojiResult.failed.length) console.warn("[coopft] Emoji fallbacks will be used for:", emojiResult.failed.join("; "));
    return { ...counts, cleanup, emojiResult };
  }

  async ensureBrandMessages(guild, publicChannels) {
    const entries = [
      {
        key: "rules",
        channel: publicChannels.rules,
        embed: new EmbedBuilder().setColor(0x8E1D34)
          .setTitle(this.emoji(guild.id, "cf_shield", "🛡️") + "  CoopFT • Community Guidelines")
          .setDescription([
            "Welcome to **CoopFT**. Keep the space useful, respectful and comfortable for everyone.",
            "",
            this.emoji(guild.id, "cf_star", "✦") + "  Be respectful. No harassment, discrimination or targeted abuse.",
            this.emoji(guild.id, "cf_leaf", "✦") + "  Keep discussions constructive and channels on topic.",
            this.emoji(guild.id, "cf_ticket", "✦") + "  Use **#open-a-ticket** for private support, bugs, suggestions and custom bot requests.",
            this.emoji(guild.id, "cf_spark", "✦") + "  Do not share private information, tokens or passwords.",
            this.emoji(guild.id, "cf_bell", "✦") + "  Use the ticket process if you need staff assistance."
          ].join("\n"))
          .setFooter({ text: "CoopFT • Community standards" })
      },
      {
        key: "welcome",
        channel: publicChannels.welcome,
        embed: new EmbedBuilder().setColor(0x235A9A)
          .setTitle(this.emoji(guild.id, "cf_spark", "✨") + "  Welcome to CoopFT")
          .setDescription("A place to learn, build, share your creations and get help with projects. Start with **#rules**, introduce yourself, and open a ticket whenever you need private support.")
          .setFooter({ text: "CoopFT • Build something great" })
      },
      {
        key: "bot_updates",
        channel: publicChannels.bot_updates,
        embed: new EmbedBuilder().setColor(0x263F66)
          .setTitle(this.emoji(guild.id, "cf_bell", "🔔") + "  CoopFT Bot Updates")
          .setDescription("Important CoopFT bot releases, maintenance notices and feature changes appear here.")
          .setFooter({ text: "CoopFT • System notices" })
      }
    ];
    for (const entry of entries) {
      const savedId = await this.getResource(guild.id, "message:" + entry.key);
      let message = savedId ? await entry.channel.messages.fetch(savedId).catch(() => null) : null;
      if (message) await message.edit({ embeds: [entry.embed] });
      else {
        message = await entry.channel.send({ embeds: [entry.embed] });
        await this.saveResource(guild.id, "message:" + entry.key, message.id);
      }
    }
  }

  async ensureTicketPanel(guild, channel) {
    const savedId = await this.getResource(guild.id, "message:ticket_panel");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const embed = new EmbedBuilder()
      .setColor(0x354F86)
      .setTitle(this.emoji(guild.id, "cf_ticket", "🎟️") + "  CoopFT Support Centre")
      .setDescription("Choose the kind of help you need. Every ticket creates a private channel visible only to you, CoopFT staff and the bot. Please do not open duplicate tickets.")
      .addFields(
        { name: this.emoji(guild.id, "cf_headset", "🎧") + "  General support", value: "Questions or help using CoopFT services.", inline: true },
        { name: this.emoji(guild.id, "cf_gear", "⚙️") + "  Bug report", value: "Something is broken or behaving incorrectly.", inline: true },
        { name: this.emoji(guild.id, "cf_key", "🔑") + "  Custom bot request", value: "Request a bot or automation idea.", inline: true },
        { name: this.emoji(guild.id, "cf_spark", "✨") + "  Suggestion", value: "Suggest a feature or improvement.", inline: true }
      )
      .setFooter({ text: "CoopFT • Private ticket system" });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cf-ticket:open:support").setLabel("Support").setStyle(ButtonStyle.Primary).setEmoji("🎧"),
      new ButtonBuilder().setCustomId("cf-ticket:open:bug").setLabel("Report bug").setStyle(ButtonStyle.Danger).setEmoji("⚙️"),
      new ButtonBuilder().setCustomId("cf-ticket:open:custom_bot").setLabel("Custom bot").setStyle(ButtonStyle.Secondary).setEmoji("🔑"),
      new ButtonBuilder().setCustomId("cf-ticket:open:suggestion").setLabel("Suggestion").setStyle(ButtonStyle.Success).setEmoji("✨")
    );
    if (message) await message.edit({ embeds: [embed], components: [row] });
    else {
      message = await channel.send({ embeds: [embed], components: [row] });
      await this.saveResource(guild.id, "message:ticket_panel", message.id);
    }
  }

  async getTicketCategory(guild) {
    const id = await this.getResource(guild.id, "category:tickets");
    return id ? guild.channels.fetch(id).catch(() => null) : null;
  }

  async openTicket(guild, member, ticketType) {
    if (!TICKET_TYPES[ticketType]) throw new Error("Unknown ticket type.");
    const existing = await this.pool.query(
      "SELECT id,channel_id FROM coopft_tickets WHERE guild_id=$1 AND opener_id=$2 AND status='open' ORDER BY created_at DESC LIMIT 1",
      [guild.id, member.id]
    );
    if (existing.rowCount) {
      const channel = await guild.channels.fetch(existing.rows[0].channel_id).catch(() => null);
      if (channel) return { channel, existing: true };
      await this.pool.query("UPDATE coopft_tickets SET status='closed',closed_at=NOW() WHERE guild_id=$1 AND channel_id=$2", [guild.id, existing.rows[0].channel_id]);
    }

    const category = await this.getTicketCategory(guild);
    if (!category) throw new Error("The ticket category is not set up. Ask an administrator to run /coopft-setup.");
    const me = guild.members.me || await guild.members.fetchMe();
    const staffRoles = [...STAFF_RANKS, ...HR_ROLES].map((spec) => this.roles.get(spec.key)).filter(Boolean);
    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
      ...staffRoles.map((role) => ({
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]
      }))
    ];
    const channel = await guild.channels.create({
      name: "ticket-" + safeChannelName(member.user.username),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
      topic: "CoopFT private ticket • opener " + member.id,
      reason: "CoopFT ticket opened by " + member.user.tag
    });
    const ticketId = randomUUID();
    try {
      await this.pool.query(
        "INSERT INTO coopft_tickets (id,guild_id,channel_id,opener_id,ticket_type) VALUES ($1,$2,$3,$4,$5)",
        [ticketId, guild.id, channel.id, member.id, ticketType]
      );
    } catch (error) {
      await channel.delete("Ticket record creation failed").catch(() => {});
      if (error.code === "23505") {
        const raced = await this.pool.query(
          "SELECT channel_id FROM coopft_tickets WHERE guild_id=$1 AND opener_id=$2 AND status='open' ORDER BY created_at DESC LIMIT 1",
          [guild.id, member.id]
        );
        if (raced.rowCount) {
          const existingChannel = await guild.channels.fetch(raced.rows[0].channel_id).catch(() => null);
          if (existingChannel) return { channel: existingChannel, existing: true };
        }
      }
      throw error;
    }

    const info = TICKET_TYPES[ticketType];
    const embed = new EmbedBuilder().setColor(0x314D7A)
      .setTitle(this.emoji(guild.id, info.icon, info.fallback) + "  " + info.label)
      .setDescription("Welcome, <@" + member.id + ">. Describe your request with useful detail. A staff member will join shortly.")
      .addFields(
        { name: "Ticket owner", value: "<@" + member.id + ">", inline: true },
        { name: "Status", value: this.emoji(guild.id, "cf_spark", "🟢") + " Open", inline: true }
      )
      .setFooter({ text: "CoopFT • Ticket " + ticketId.slice(0, 8) });
    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cf-ticket:claim:" + ticketId).setLabel("Claim").setStyle(ButtonStyle.Primary).setEmoji("🛡️"),
      new ButtonBuilder().setCustomId("cf-ticket:close:" + ticketId).setLabel("Close ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
    );
    await channel.send({
      content: "<@" + member.id + ">",
      embeds: [embed],
      components: [controls],
      allowedMentions: { users: [member.id] }
    });
    return { channel, existing: false };
  }

  isStaff(member) {
    if (!member?.roles?.cache) return false;
    const ids = new Set([...STAFF_RANKS, ...HR_ROLES].map((spec) => this.roles.get(spec.key)?.id).filter(Boolean));
    return member.roles.cache.some((role) => ids.has(role.id));
  }

  canManageStaff(member, guild) {
    if (!member || !guild) return false;
    if (member.id === guild.ownerId) return true;
    if (!member.roles?.cache) return false;
    return [...STAFF_MANAGER_KEYS, ...HR_MANAGER_KEYS].some((key) => {
      const role = this.roles.get(key);
      return role && member.roles.cache.has(role.id);
    });
  }

  getStaffRankKey(member) {
    return STAFF_RANKS.find((spec) => {
      const role = this.roles.get(spec.key);
      return role && member?.roles?.cache?.has(role.id);
    })?.key || null;
  }

  assertStaffChangeAuthority(actor, target, guild, currentRankKey, nextRankKey = null) {
    if (actor?.id === guild.ownerId) return;
    if (!actor || !target || actor.id === target.id) {
      throw new Error("Ask another authorized CoopFT manager to make this staff change.");
    }

    const actorRankKey = this.getStaffRankKey(actor);
    const actorRankIndex = actorRankKey ? STAFF_RANKS.findIndex((item) => item.key === actorRankKey) : -1;
    const isStaffManager = [...STAFF_MANAGER_KEYS].some((key) => {
      const role = this.roles.get(key);
      return role && actor.roles?.cache?.has(role.id);
    });
    const isHrManager = [...HR_MANAGER_KEYS].some((key) => {
      const role = this.roles.get(key);
      return role && actor.roles?.cache?.has(role.id);
    });
    const currentIndex = currentRankKey ? STAFF_RANKS.findIndex((item) => item.key === currentRankKey) : -1;
    const nextIndex = nextRankKey ? STAFF_RANKS.findIndex((item) => item.key === nextRankKey) : -1;

    if (isStaffManager && actorRankIndex >= 0) {
      if (currentIndex >= 0 && currentIndex <= actorRankIndex) {
        throw new Error("You cannot change someone at your own rank or above it.");
      }
      if (nextIndex >= 0 && nextIndex <= actorRankIndex) {
        throw new Error("You can only appoint staff below your own rank.");
      }
      return;
    }

    if (isHrManager) {
      const hrManagedFrom = STAFF_RANKS.findIndex((item) => item.key === "head_moderator");
      if ((currentIndex >= 0 && currentIndex < hrManagedFrom) ||
          (nextIndex >= 0 && nextIndex < hrManagedFrom)) {
        throw new Error("HR can manage Head Moderator and lower ranks only. Higher ranks require a senior staff manager or the server owner.");
      }
      return;
    }

    throw new Error("You do not have authority to make this staff change.");
  }

  async assignStaff(interaction, member, rankKey, action = "hire") {
    if (interaction.guildId !== this.guildId) throw new Error("This staff system is only available in CoopFT.");
    if (!this.canManageStaff(interaction.member, interaction.guild)) {
      throw new Error("You do not have HR or senior staff authority to change staff ranks.");
    }

    const rank = STAFF_RANKS.find((item) => item.key === rankKey);
    if (!rank) throw new Error("Unknown staff rank.");
    const previous = await this.pool.query(
      "SELECT rank_key,active FROM coopft_staff_members WHERE guild_id=$1 AND member_id=$2",
      [interaction.guildId, member.id]
    );
    const currentRankKey = previous.rows[0]?.active
      ? previous.rows[0].rank_key
      : this.getStaffRankKey(member);
    const currentIndex = currentRankKey ? STAFF_RANKS.findIndex((item) => item.key === currentRankKey) : -1;
    const nextIndex = STAFF_RANKS.findIndex((item) => item.key === rankKey);

    if (action === "hire" && currentIndex >= 0) {
      throw new Error("This member is already on the staff team. Use promote or demote instead.");
    }
    if (action === "promote" && (currentIndex < 0 || nextIndex >= currentIndex)) {
      throw new Error("A promotion must move an existing staff member to a higher rank.");
    }
    if (action === "demote" && (currentIndex < 0 || nextIndex <= currentIndex)) {
      throw new Error("A demotion must move an existing staff member to a lower rank.");
    }
    this.assertStaffChangeAuthority(
      interaction.member,
      member,
      interaction.guild,
      currentRankKey,
      rankKey
    );

    const role = this.roles.get(rankKey) || await this.ensureRole(interaction.guild, rank).then((value) => value.role);
    const roleIds = new Set(STAFF_RANKS.map((item) => this.roles.get(item.key)?.id).filter(Boolean));
    for (const oldRole of member.roles.cache.filter((item) => roleIds.has(item.id) && item.id !== role.id).values()) {
      await member.roles.remove(oldRole, "CoopFT staff rank change");
    }
    if (!member.roles.cache.has(role.id)) await member.roles.add(role, "CoopFT staff " + action);
    await this.pool.query(
      "INSERT INTO coopft_staff_members (guild_id,member_id,rank_key,active,updated_by) VALUES ($1,$2,$3,TRUE,$4) " +
      "ON CONFLICT (guild_id,member_id) DO UPDATE SET rank_key=EXCLUDED.rank_key,active=TRUE,updated_at=NOW(),updated_by=EXCLUDED.updated_by",
      [interaction.guildId, member.id, rankKey, interaction.user.id]
    );
    await this.recordStaffAudit(interaction.guildId, interaction.user.id, member.id, action, {
      from: currentRankKey,
      to: rankKey
    });
    await this.updateStaffDirectory(interaction.guild);
    const actionText = action === "hire" ? "hired" : action === "promote" ? "promoted" : "demoted";
    await this.postStaffUpdate(
      interaction.guild,
      this.emoji(interaction.guildId, "cf_star", "✦") + " <@" + member.id + "> was " +
      actionText + " to **" + rank.name + "** by <@" + interaction.user.id + ">."
    );
    return { rankName: rank.name, previousRank: currentRankKey };
  }

  async removeStaff(interaction, member) {
    if (interaction.guildId !== this.guildId) throw new Error("This staff system is only available in CoopFT.");
    if (!this.canManageStaff(interaction.member, interaction.guild)) {
      throw new Error("You do not have HR or senior staff authority to change staff ranks.");
    }
    const previous = await this.pool.query(
      "SELECT rank_key,active FROM coopft_staff_members WHERE guild_id=$1 AND member_id=$2",
      [interaction.guildId, member.id]
    );
    const currentRankKey = previous.rows[0]?.active
      ? previous.rows[0].rank_key
      : this.getStaffRankKey(member);
    if (!currentRankKey) throw new Error("This member does not have an active staff rank.");
    this.assertStaffChangeAuthority(interaction.member, member, interaction.guild, currentRankKey, null);

    for (const spec of STAFF_RANKS) {
      const role = this.roles.get(spec.key);
      if (role && member.roles.cache.has(role.id)) await member.roles.remove(role, "CoopFT staff removal");
    }
    await this.pool.query(
      "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by=$3 WHERE guild_id=$1 AND member_id=$2",
      [interaction.guildId, member.id, interaction.user.id]
    );
    await this.recordStaffAudit(interaction.guildId, interaction.user.id, member.id, "remove", { from: currentRankKey });
    await this.updateStaffDirectory(interaction.guild);
    await this.postStaffUpdate(interaction.guild, this.emoji(interaction.guildId, "cf_bell", "🔔") + " <@" + member.id + "> was removed from the staff team by <@" + interaction.user.id + ">.");
  }

  async recordStaffAudit(guildId, actorId, memberId, action, details) {
    await this.pool.query(
      "INSERT INTO coopft_staff_audit (guild_id,actor_id,member_id,action,details) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [guildId, actorId, memberId || null, action, JSON.stringify(details || {})]
    );
  }

  async syncStaffMember(guild, member, actor) {
    if (!guild || guild.id !== this.guildId || !member || !this.roles.size) return;
    const newRankKey = this.getStaffRankKey(member);
    const previous = await this.pool.query(
      "SELECT rank_key,active FROM coopft_staff_members WHERE guild_id=$1 AND member_id=$2",
      [guild.id, member.id]
    );
    const oldRankKey = previous.rows[0]?.active ? previous.rows[0].rank_key : null;

    // Removing a staff role only removes bot-managed access, so it is safe to
    // reconcile even when the executor cannot be identified.
    if (!newRankKey && previous.rows[0]?.active) {
      await this.pool.query(
        "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by='discord-audit-sync' WHERE guild_id=$1 AND member_id=$2",
        [guild.id, member.id]
      );
      await this.recordStaffAudit(guild.id, actor?.id || "unknown", member.id, "staff_role_removed", { from: oldRankKey });
      await this.updateStaffDirectory(guild);
      await this.postStaffUpdate(guild, this.emoji(guild.id, "cf_bell", "🔔") + " <@" + member.id + "> no longer has an active staff rank.");
      return;
    }

    if (!newRankKey || newRankKey === oldRankKey) return;
    if (!actor || !this.canManageStaff(actor, guild)) {
      const unauthorizedRole = this.roles.get(newRankKey);
      if (unauthorizedRole && member.roles.cache.has(unauthorizedRole.id)) {
        await member.roles.remove(unauthorizedRole, "Revert unauthorized CoopFT staff role assignment").catch(() => {});
      }
      await this.postStaffUpdate(
        guild,
        this.emoji(guild.id, "cf_shield", "🛡️") + " An unauthorized staff-rank change for <@" +
        member.id + "> was rejected. Ask the server owner or HR to use /staff-manage."
      );
      return;
    }

    try {
      this.assertStaffChangeAuthority(actor, member, guild, oldRankKey, newRankKey);
    } catch (error) {
      const unauthorizedRole = this.roles.get(newRankKey);
      if (unauthorizedRole && member.roles.cache.has(unauthorizedRole.id)) {
        await member.roles.remove(unauthorizedRole, "Revert unauthorized CoopFT staff rank escalation").catch(() => {});
      }
      await this.postStaffUpdate(guild, this.emoji(guild.id, "cf_shield", "🛡️") + " A staff-rank change for <@" +
        member.id + "> was reverted: " + error.message);
      return;
    }

    await this.pool.query(
      "INSERT INTO coopft_staff_members (guild_id,member_id,rank_key,active,updated_by) VALUES ($1,$2,$3,TRUE,$4) " +
      "ON CONFLICT (guild_id,member_id) DO UPDATE SET rank_key=EXCLUDED.rank_key,active=TRUE,updated_at=NOW(),updated_by=EXCLUDED.updated_by",
      [guild.id, member.id, newRankKey, actor.id]
    );
    await this.recordStaffAudit(guild.id, actor.id, member.id, oldRankKey ? "staff_rank_changed" : "staff_added", {
      from: oldRankKey,
      to: newRankKey
    });
    await this.updateStaffDirectory(guild);
    const rank = STAFF_RANKS.find((spec) => spec.key === newRankKey);
    await this.postStaffUpdate(guild, this.emoji(guild.id, "cf_star", "✦") + " <@" + member.id + "> is now **" + rank.name + "**.");
  }

  async handleMemberLeave(member) {
    if (!member || member.guild.id !== this.guildId) return;
    const result = await this.pool.query(
      "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by='member-left' WHERE guild_id=$1 AND member_id=$2 AND active=TRUE RETURNING rank_key",
      [this.guildId, member.id]
    );
    if (!result.rowCount) return;
    await this.recordStaffAudit(this.guildId, "member-left", member.id, "staff_left_server", { rank: result.rows[0].rank_key });
    await this.updateStaffDirectory(member.guild);
    await this.postStaffUpdate(member.guild, this.emoji(this.guildId, "cf_bell", "🔔") + " A staff member left the server; their active directory entry was removed.");
  }

  async buildStaffDirectoryEmbed(guild) {
    const result = await this.pool.query(
      "SELECT member_id,rank_key FROM coopft_staff_members WHERE guild_id=$1 AND active=TRUE",
      [guild.id]
    );
    const ordered = result.rows.sort((a, b) =>
      STAFF_RANKS.findIndex((item) => item.key === a.rank_key) - STAFF_RANKS.findIndex((item) => item.key === b.rank_key)
    );
    const grouped = new Map(STAFF_RANKS.map((rank) => [rank.key, []]));
    for (const record of ordered) {
      const group = grouped.get(record.rank_key);
      if (!group) continue;
      let member = guild.members.cache.get(record.member_id);
      if (!member) member = await guild.members.fetch(record.member_id).catch(() => null);
      if (!member) {
        await this.pool.query(
          "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by='directory-reconcile' WHERE guild_id=$1 AND member_id=$2",
          [guild.id, record.member_id]
        );
        continue;
      }
      group.push("<@" + record.member_id + ">");
    }
    const embed = new EmbedBuilder()
      .setColor(0x8C1D32)
      .setTitle(this.emoji(guild.id, "cf_crown", "♛") + "  COOPFT • STAFF TEAM")
      .setDescription("The current staff structure of CoopFT. Ranks are maintained by the HR team and synchronized with staff role changes.")
      .setFooter({ text: "Maintained by CoopFT HR • " + ordered.length + " active staff" })
      .setTimestamp();
    for (const rank of STAFF_RANKS) {
      const people = grouped.get(rank.key);
      embed.addFields({
        name: this.emoji(guild.id, rank.emoji, rank.icon) + "  " + rank.name.toUpperCase(),
        value: people.length ? people.join(", ").slice(0, 1024) : "Vacant",
        inline: false
      });
    }
    return embed;
  }

  async updateStaffDirectory(guild) {
    const embed = await this.buildStaffDirectoryEmbed(guild);
    for (const key of ["staff_team", "staff_directory"]) {
      const channelId = await this.getResource(guild.id, "channel:" + key);
      const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
      if (!channel?.isTextBased?.()) continue;
      const messageId = await this.getResource(guild.id, "message:directory:" + key);
      let message = messageId ? await channel.messages.fetch(messageId).catch(() => null) : null;
      if (message) await message.edit({ embeds: [embed], allowedMentions: { parse: [] } });
      else {
        message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        await this.saveResource(guild.id, "message:directory:" + key, message.id);
      }
    }
  }

  async postStaffUpdate(guild, description) {
    const channelId = await this.getResource(guild.id, "channel:staff_bot_updates");
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased?.()) return;
    const embed = new EmbedBuilder()
      .setColor(0x7B2438)
      .setTitle(this.emoji(guild.id, "cf_bell", "🔔") + "  Staff system update")
      .setDescription(String(description || "A staff system change occurred.").slice(0, 4000))
      .setTimestamp()
      .setFooter({ text: "CoopFT • Staff activity" });
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  }

  async handleButton(interaction) {
    if (!interaction.customId?.startsWith("cf-ticket:")) return false;
    if (interaction.guildId !== this.guildId) {
      await interaction.reply({ content: "This ticket system is only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const [, action, value] = interaction.customId.split(":");
    if (action === "open") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await this.openTicket(interaction.guild, interaction.member, value);
      await interaction.editReply({ content: result.existing ? "You already have an open ticket: <#" + result.channel.id + ">." : "Your private ticket is ready: <#" + result.channel.id + ">." });
      return true;
    }
    const ticketResult = await this.pool.query(
      "SELECT * FROM coopft_tickets WHERE guild_id=$1 AND id=$2 AND status='open'",
      [interaction.guildId, value]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) {
      await interaction.reply({ content: "That ticket is already closed or no longer exists.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const staff = this.isStaff(interaction.member);
    if (action === "claim") {
      if (!staff) {
        await interaction.reply({ content: "Only CoopFT staff can claim tickets.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const claimed = await this.pool.query(
        "UPDATE coopft_tickets SET claimed_by=$3 WHERE guild_id=$1 AND id=$2 AND status='open' AND (claimed_by IS NULL OR claimed_by=$3) RETURNING id",
        [interaction.guildId, value, interaction.user.id]
      );
      if (!claimed.rowCount) {
        await interaction.reply({ content: "Another staff member has already claimed this ticket. Please coordinate in the ticket before taking over.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.reply({ content: "You claimed this ticket.", flags: MessageFlags.Ephemeral });
      await interaction.channel.send({ content: this.emoji(interaction.guildId, "cf_shield", "🛡️") + " This ticket is now being handled by <@" + interaction.user.id + ">.", allowedMentions: { users: [interaction.user.id] } });
      return true;
    }
    if (action === "close") {
      if (!staff && interaction.user.id !== ticket.opener_id) {
        await interaction.reply({ content: "Only the ticket owner or CoopFT staff can close this ticket.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.closeTicket(interaction.guild, interaction.channel, ticket, interaction.user.id);
      await interaction.editReply({ content: "Ticket closed. The conversation transcript was sent to the private transcript archive." });
      return true;
    }
    await interaction.reply({ content: "Unknown ticket action.", flags: MessageFlags.Ephemeral });
    return true;
  }

  async closeTicket(guild, channel, ticket, closedBy) {
    const transcriptChannelId = await this.getResource(guild.id, "channel:ticket_transcripts");
    const transcriptChannel = transcriptChannelId ? await guild.channels.fetch(transcriptChannelId).catch(() => null) : null;
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const transcript = messages
      ? [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp).map((message) => {
          const attachments = [...message.attachments.values()].map((file) => file.url).join(" ");
          return ("[" + new Date(message.createdTimestamp).toISOString() + "] " + message.author.tag + ": " +
            (message.content || "[no text]") + (attachments ? " | Attachments: " + attachments : "")).replace(/\r?\n/g, " ").slice(0, 2000);
        }).join("\n")
      : "Transcript could not be fetched. Ticket " + ticket.id;

    await this.pool.query(
      "UPDATE coopft_tickets SET status='closed',closed_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='open'",
      [guild.id, ticket.id]
    );
    if (transcriptChannel?.isTextBased?.()) {
      const buffer = Buffer.from(
        "CoopFT ticket transcript\nTicket ID: " + ticket.id +
        "\nOpened by: " + ticket.opener_id + "\nClosed by: " + closedBy +
        "\nType: " + ticket.ticket_type + "\n\n" + transcript,
        "utf8"
      );
      await transcriptChannel.send({
        content: this.emoji(guild.id, "cf_scroll", "📜") + " Transcript for **" + channel.name + "** • opened by <@" + ticket.opener_id + "> • closed by <@" + closedBy + ">",
        files: [new AttachmentBuilder(buffer.subarray(0, 1500000), { name: "coopft-ticket-" + ticket.id.slice(0, 8) + ".txt" })],
        allowedMentions: { parse: [] }
      });
    }
    await channel.permissionOverwrites.edit(ticket.opener_id, { SendMessages: false, AddReactions: false }).catch(() => {});
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0x687386).setTitle(this.emoji(guild.id, "cf_shield", "🔒") + "  Ticket closed")
        .setDescription("Closed by <@" + closedBy + ">. A transcript has been archived.")
        .setTimestamp()],
      allowedMentions: { parse: [] }
    }).catch(() => {});
    await channel.setName("closed-" + safeChannelName(channel.name).slice(0, 65)).catch(() => {});
  }
}

module.exports = { CoopFTCommunityService, CLEANUP_CONFIRMATION, TICKET_TYPES, safeChannelName };
