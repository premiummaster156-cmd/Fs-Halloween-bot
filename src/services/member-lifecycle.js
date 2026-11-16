"use strict";

const { EmbedBuilder, AuditLogEvent } = require("discord.js");
const settings = require("../config/settings");
const { coopftGuildId, fukishokaiGuildId } = require("../config/server-personas");

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days) return days + "d " + hours + "h " + minutes + "m";
  if (hours) return hours + "h " + minutes + "m";
  if (minutes) return minutes + "m";
  return totalSeconds + "s";
}

function serializeRoles(member) {
  const roles = member?.roles?.cache;
  if (!roles || typeof roles.values !== "function") return [];
  return [...roles.values()]
    .filter((role) => role && role.id !== member.guild.id)
    .sort((a, b) => (b.position || 0) - (a.position || 0))
    .map((role) => ({
      id: String(role.id),
      name: String(role.name || "Unknown role"),
      position: Number.isFinite(role.position) ? role.position : 0,
      color: role.hexColor || null
    }));
}

function safeDisplay(value) {
  return String(value || "Unknown").replace(/@/g, "@\u200b").slice(0, 180);
}

function timestampText(value) {
  const date = asDate(value);
  if (!date) return "Unknown";
  const unix = Math.floor(date.getTime() / 1000);
  return "<t:" + unix + ":F> (<t:" + unix + ":R>)";
}

function rolesText(roles) {
  if (!Array.isArray(roles) || !roles.length) return "No assigned roles (excluding @everyone), or no role snapshot was available.";
  const lines = roles.map((role) =>
    "• **" + safeDisplay(role.name) + "**"
  );
  let output = lines.join("\n");
  if (output.length > 1000) output = output.slice(0, 970) + "\n…and " + Math.max(0, lines.length - 1) + " more.";
  return output;
}

function auditValue(value) {
  if (value === undefined) return "not set";
  if (value === null) return "none";
  let rendered;
  try { rendered = typeof value === "string" ? value : JSON.stringify(value); }
  catch (_) { rendered = String(value); }
  return safeDisplay(rendered || "empty").slice(0, 180);
}

const AUDIT_FIELD_LABELS = Object.freeze({
  name: "Name",
  topic: "Channel topic",
  nsfw: "Age restriction",
  bitrate: "Voice bitrate",
  user_limit: "Voice user limit",
  rate_limit_per_user: "Slowmode",
  permission_overwrites: "Channel access rules",
  permissions: "Role permissions",
  color: "Role colour",
  hoist: "Displayed separately in the member list",
  mentionable: "Role mentions",
  position: "Role or channel order",
  parent_id: "Channel category",
  icon: "Role icon",
  unicode_emoji: "Role icon",
  available_tags: "Available thread tags",
  default_auto_archive_duration: "Thread archive time",
  default_thread_rate_limit_per_user: "Thread slowmode",
  flags: "Channel settings",
  archived: "Archived status",
  locked: "Locked status"
});

function friendlyAuditValue(key, value) {
  if (value === undefined) return "Not set";
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (key === "rate_limit_per_user" || key === "default_thread_rate_limit_per_user") return Number(value) === 0 ? "Disabled" : Number(value) + " seconds";
  if (key === "permissions") return "Role permission set updated";
  if (key === "permission_overwrites") return "Channel access permissions updated";
  if (key === "parent_id") return value ? "Assigned to a category" : "No category";
  if (key === "flags") return "Channel settings updated";
  if (key === "type") return readableChannelType(value);
  if (key === "bitrate") return Math.round(Number(value) / 1000) + " kbps";
  if (key === "color" && Number.isFinite(Number(value))) return "#" + Number(value).toString(16).padStart(6, "0").toUpperCase();
  if (Array.isArray(value)) {
    const names = value.map((item) => {
      if (typeof item === "string") return item;
      return item?.name || item?.role?.name || item?.tag || null;
    }).filter(Boolean);
    return names.length ? names.slice(0, 8).map((name) => safeDisplay(name)).join(", ") : "Updated";
  }
  if (typeof value === "object") {
    if (value.name) return safeDisplay(value.name);
    if (value.username) return safeDisplay(value.username);
    return "Updated";
  }
  return safeDisplay(value).slice(0, 180);
}

function auditChangesText(entry) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  if (!changes.length) return "";
  const lines = [];
  for (const change of changes.slice(0, 10)) {
    const key = String(change.key || "change");
    if (key === "$add" || key === "$remove") {
      const value = change.new ?? change.old;
      const names = Array.isArray(value)
        ? value.map((item) => item?.name || item?.role?.name).filter(Boolean)
        : [];
      lines.push("• **" + (key === "$add" ? "Roles added" : "Roles removed") + "**: " +
        (names.length ? names.map((name) => safeDisplay(name)).join(", ") : "Role assignment changed"));
      continue;
    }
    const label = AUDIT_FIELD_LABELS[key] ||
      key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    const oldValue = friendlyAuditValue(key, change.old);
    const newValue = friendlyAuditValue(key, change.new);
    lines.push("• **" + safeDisplay(label) + "**: " + oldValue + " → " + newValue);
  }
  return lines.join("\n").slice(0, 1000);
}

function readableChannelType(value) {
  const types = {
    0: "Text channel", 2: "Voice channel", 4: "Category",
    5: "Announcement channel", 13: "Stage channel", 15: "Forum channel", 16: "Media channel"
  };
  return types[Number(value)] || "Channel";
}

function auditSummary(actionKey, entry) {
  const summaries = {
    channel_created: "A new channel was added to the server.",
    channel_updated: "The channel's settings or permissions were changed.",
    channel_deleted: "A channel was deleted from the server.",
    server_settings_updated: "A server-wide setting was changed.",
    role_created: "A new server role was created.",
    role_updated: "A role's name, colour, display settings or permissions were changed.",
    role_deleted: "A server role was deleted. Members no longer have permissions from that role.",
    member_kicked: "A member was removed from the server by staff.",
    member_pruned: "Inactive members were removed from the server.",
    member_updated: "A member's server profile or settings were updated.",
    member_banned: "A member was banned from the server.",
    member_unbanned: "A previous server ban was removed.",
    invite_created: "A new server invite was created.",
    invite_deleted: "A server invite was deleted.",
    webhook_created: "A new webhook was added to the server.",
    webhook_updated: "A webhook's settings were changed.",
    webhook_deleted: "A webhook was deleted from the server.",
    message_deleted_by_moderator: "A moderator deleted a member's message.",
    messages_bulk_deleted: "A moderator removed a batch of messages."
  };
  const summary = summaries[actionKey] || "A server action was recorded.";
  if (actionKey === "channel_deleted" && entry?.target?.type !== undefined) {
    return summary + " Type: " + readableChannelType(entry.target.type) + ".";
  }
  return summary;
}

const SERVER_AUDIT_ACTIONS = new Map([
  [AuditLogEvent.ChannelCreate, { key: "channel_created", label: "CHANNEL CREATED", destination: "server", color: 0x32956B }],
  [AuditLogEvent.ChannelUpdate, { key: "channel_updated", label: "CHANNEL UPDATED", destination: "server", color: 0xC18A37 }],
  [AuditLogEvent.ChannelDelete, { key: "channel_deleted", label: "CHANNEL DELETED", destination: "server", color: 0xB84A55 }],
  [AuditLogEvent.GuildUpdate, { key: "server_settings_updated", label: "SERVER SETTINGS UPDATED", destination: "server", color: 0xC18A37 }],
  [AuditLogEvent.RoleCreate, { key: "role_created", label: "ROLE CREATED", destination: "server", color: 0x32956B }],
  [AuditLogEvent.RoleUpdate, { key: "role_updated", label: "ROLE UPDATED", destination: "server", color: 0xC18A37 }],
  [AuditLogEvent.RoleDelete, { key: "role_deleted", label: "ROLE DELETED", destination: "server", color: 0xB84A55 }],
  [AuditLogEvent.MemberKick, { key: "member_kicked", label: "MEMBER KICKED", destination: "member", color: 0xB84A55 }],
  [AuditLogEvent.MemberPrune, { key: "member_pruned", label: "MEMBERS PRUNED", destination: "member", color: 0xB84A55 }],
  [AuditLogEvent.MemberUpdate, { key: "member_updated", label: "MEMBER UPDATED", destination: "member", color: 0xC18A37 }],
  [AuditLogEvent.MemberBanAdd, { key: "member_banned", label: "MEMBER BANNED", destination: "member", color: 0xB84A55 }],
  [AuditLogEvent.MemberBanRemove, { key: "member_unbanned", label: "MEMBER UNBANNED", destination: "member", color: 0x32956B }],
  [AuditLogEvent.InviteCreate, { key: "invite_created", label: "INVITE CREATED", destination: "server", color: 0x32956B }],
  [AuditLogEvent.InviteDelete, { key: "invite_deleted", label: "INVITE DELETED", destination: "server", color: 0xB84A55 }],
  [AuditLogEvent.WebhookCreate, { key: "webhook_created", label: "WEBHOOK CREATED", destination: "server", color: 0xC18A37 }],
  [AuditLogEvent.WebhookUpdate, { key: "webhook_updated", label: "WEBHOOK UPDATED", destination: "server", color: 0xC18A37 }],
  [AuditLogEvent.WebhookDelete, { key: "webhook_deleted", label: "WEBHOOK DELETED", destination: "server", color: 0xB84A55 }],
  [AuditLogEvent.MessageDelete, { key: "message_deleted_by_moderator", label: "MESSAGE DELETED BY MODERATOR", destination: "member", color: 0xB84A55 }],
  [AuditLogEvent.MessageBulkDelete, { key: "messages_bulk_deleted", label: "MESSAGES BULK DELETED", destination: "member", color: 0xB84A55 }]
]);

class MemberLifecycleService {
  constructor(pool, options = {}) {
    this.pool = pool;
    this.guildSettings = options.guildSettings || null;
    this.coopftCommunity = options.coopftCommunity || null;
    this.coopftGuildId = options.coopftGuildId || coopftGuildId;
    this.fukishokaiGuildId = options.fukishokaiGuildId || fukishokaiGuildId;
  }

  supportsGuild(guildId) {
    return Boolean(guildId && [this.coopftGuildId, this.fukishokaiGuildId].filter(Boolean).includes(guildId));
  }

  async writeAudit(guildId, actorId, action, targetId, details) {
    await this.pool.query(
      "INSERT INTO audit_logs (guild_id,actor_id,action,target_id,details) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [guildId, actorId || "system", action, targetId || null, JSON.stringify(details || {})]
    );
  }

  async recordRoleSnapshot(member, actorId = "system", source = "join") {
    if (!member?.guild || !this.supportsGuild(member.guild.id)) return null;
    const details = {
      source,
      roles: serializeRoles(member),
      joinedAt: asDate(member.joinedAt)?.toISOString() || null,
      accountCreatedAt: asDate(member.user?.createdAt || member.user?.createdTimestamp)?.toISOString() || null,
      capturedAt: new Date().toISOString()
    };
    await this.writeAudit(member.guild.id, actorId, "member_roles_snapshot", member.id, details);
    return details;
  }

  async latestRoleSnapshot(guildId, memberId) {
    const result = await this.pool.query(
      "SELECT details,created_at FROM audit_logs " +
      "WHERE guild_id=$1 AND target_id=$2 AND action='member_roles_snapshot' " +
      "ORDER BY created_at DESC,id DESC LIMIT 1",
      [guildId, memberId]
    );
    const details = result.rows[0]?.details || null;
    if (!details) return null;
    if (typeof details === "string") {
      try { return JSON.parse(details); } catch (_) { return null; }
    }
    return details;
  }

  async resolveMemberLogChannel(guild) {
    if (guild.id === this.coopftGuildId && this.coopftCommunity) {
      const id = await this.coopftCommunity.getResource(guild.id, "channel:member_logs").catch(() => null);
      if (id) return guild.channels.fetch(id).catch(() => null);
    }
    const id = this.guildSettings
      ? await this.guildSettings.get(guild.id, "logChannelId").catch(() => null)
      : null;
    if (!id) return null;
    return guild.channels.fetch(id).catch(() => null);
  }

  async sendMemberLog(guild, embed) {
    const channel = await this.resolveMemberLogChannel(guild);
    if (!channel || channel.guildId !== guild.id || !channel.isTextBased?.() || typeof channel.send !== "function") {
      console.warn("[member-lifecycle] No usable private member-log channel configured for guild " + guild.id + ".");
      return false;
    }
    try {
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    } catch (error) {
      console.warn("[member-lifecycle] Member log send failed:", error.message);
      return false;
    }
  }

  async resolveServerLogChannel(guild) {
    if (guild.id === this.coopftGuildId && this.coopftCommunity) {
      const id = await this.coopftCommunity.getResource(guild.id, "channel:server_logs").catch(() => null);
      if (id) return guild.channels.fetch(id).catch(() => null);
    }
    const id = this.guildSettings
      ? await this.guildSettings.get(guild.id, "logChannelId").catch(() => null)
      : null;
    if (!id) return null;
    return guild.channels.fetch(id).catch(() => null);
  }

  async sendServerLog(guild, embed) {
    const channel = await this.resolveServerLogChannel(guild);
    if (!channel || channel.guildId !== guild.id || !channel.isTextBased?.() || typeof channel.send !== "function") {
      console.warn("[member-lifecycle] No usable private server-log channel configured for guild " + guild.id + ".");
      return false;
    }
    try {
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    } catch (error) {
      console.warn("[member-lifecycle] Server log send failed:", error.message);
      return false;
    }
  }

  async resolveWelcomeChannel(guild) {
    const saved = await this.pool.query(
      "SELECT channel_id,enabled FROM guild_welcome_settings WHERE guild_id=$1",
      [guild.id]
    ).catch(() => ({ rows: [] }));
    if (saved.rows[0]) {
      if (!saved.rows[0].enabled) return null;
      if (saved.rows[0].channel_id) {
        const channel = await guild.channels.fetch(saved.rows[0].channel_id).catch(() => null);
        if (channel?.guildId === guild.id && channel.isTextBased?.()) return channel;
      }
    }
    if (guild.id === this.coopftGuildId && this.coopftCommunity) {
      const id = await this.coopftCommunity.getResource(guild.id, "channel:welcome").catch(() => null);
      if (id) {
        const channel = await guild.channels.fetch(id).catch(() => null);
        if (channel) return channel;
      }
    }
    const configured = settings.welcomeChannelId;
    if (configured) {
      const channel = await guild.channels.fetch(configured).catch(() => null);
      if (channel?.guildId === guild.id) return channel;
    }
    return guild.systemChannel || null;
  }

  async assignAutoroles(member) {
    if (!member?.guild || !this.supportsGuild(member.guild.id)) return [];
    const saved = await this.pool.query(
      "SELECT role_ids FROM guild_autoroles WHERE guild_id=$1 AND enabled=TRUE",
      [member.guild.id]
    );
    const ids = Array.isArray(saved.rows[0]?.role_ids) ? saved.rows[0].role_ids.map(String) : [];
    if (!ids.length) return [];
    const botMember = member.guild.members.me || await member.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions?.has?.(require("discord.js").PermissionFlagsBits.ManageRoles)) {
      console.warn("[member-lifecycle] Autoroles are configured but the bot is missing Manage Roles in guild " + member.guild.id + ".");
      return [];
    }
    const roles = [];
    for (const id of [...new Set(ids)]) {
      const role = member.guild.roles.cache.get(id) || await member.guild.roles.fetch(id).catch(() => null);
      if (!role || role.id === member.guild.id || role.managed ||
          role.position >= botMember.roles.highest.position ||
          member.roles.cache.has(role.id)) continue;
      roles.push(role);
    }
    if (!roles.length) return [];
    await member.roles.add(roles, "Configured automatic join roles");
    return roles;
  }

  buildJoinLogEmbed(member, snapshot, joinedAt) {
    const createdAt = asDate(snapshot?.accountCreatedAt || member.user?.createdAt || member.user?.createdTimestamp);
    const joined = asDate(joinedAt);
    return new EmbedBuilder()
      .setColor(0x32956B)
      .setTitle((member.guild.id === this.coopftGuildId && this.coopftCommunity ? this.coopftCommunity.emoji(member.guild.id, "cf3d_member", "👋") : "👋") + "  MEMBER JOINED")
      .setDescription("<@" + member.id + "> • **" + safeDisplay(member.user?.tag || member.user?.username || member.displayName) + "**")
      .addFields(
        { name: "User ID", value: member.id, inline: true },
        { name: "Account created", value: timestampText(createdAt), inline: true },
        { name: "Account age", value: createdAt ? formatDuration(Date.now() - createdAt.getTime()) : "Unknown", inline: true },
        { name: "Joined server", value: timestampText(joined), inline: false },
        { name: "Roles at join", value: rolesText(snapshot?.roles), inline: false }
      )
      .setTimestamp();
  }

  buildLeaveLogEmbed(member, snapshot, leftAt = new Date()) {
    const details = snapshot || {};
    const joinedAt = asDate(details.joinedAt || member.joinedAt);
    const createdAt = asDate(details.accountCreatedAt || member.user?.createdAt || member.user?.createdTimestamp);
    const left = asDate(leftAt) || new Date();
    const tenureMs = joinedAt ? Math.max(0, left.getTime() - joinedAt.getTime()) : null;
    return new EmbedBuilder()
      .setColor(0xB84A55)
      .setTitle((member.guild.id === this.coopftGuildId && this.coopftCommunity ? this.coopftCommunity.emoji(member.guild.id, "cf3d_member", "👋") : "👋") + "  MEMBER LEFT")
      .setDescription("**" + safeDisplay(member.user?.tag || member.user?.username || member.displayName) + "** • <@" + member.id + ">")
      .addFields(
        { name: "User ID", value: member.id, inline: true },
        { name: "Account age", value: createdAt ? formatDuration(left.getTime() - createdAt.getTime()) : "Unknown", inline: true },
        { name: "Time in server", value: tenureMs === null ? "Join date unavailable" : formatDuration(tenureMs), inline: true },
        { name: "Joined server", value: timestampText(joinedAt), inline: false },
        { name: "Left server", value: timestampText(left), inline: false },
        { name: "Previous roles", value: rolesText(details.roles), inline: false }
      )
      .setTimestamp(left);
  }

  async handleJoin(member) {
    if (!member?.guild || !this.supportsGuild(member.guild.id)) return false;
    const autoRoles = await this.assignAutoroles(member).catch((error) => {
      console.warn("[member-lifecycle] Autorole assignment failed:", error.message);
      return [];
    });
    const snapshot = await this.recordRoleSnapshot(member, member.id, "join");
    const joinedAt = asDate(member.joinedAt)?.toISOString() || new Date().toISOString();
    await this.writeAudit(member.guild.id, member.id, "member_joined", member.id, {
      joinedAt,
      accountCreatedAt: snapshot?.accountCreatedAt || null,
      roles: snapshot?.roles || [],
      autorolesAssigned: autoRoles.map((role) => ({ id: role.id, name: role.name }))
    });
    await this.sendMemberLog(member.guild, this.buildJoinLogEmbed(member, snapshot, joinedAt));
    const welcomeChannel = await this.resolveWelcomeChannel(member.guild);
    if (welcomeChannel?.guildId === member.guild.id && welcomeChannel.isTextBased?.() && typeof welcomeChannel.send === "function") {
      const createdAt = asDate(snapshot?.accountCreatedAt);
      const publicChannels = [...(member.guild.channels.cache?.values?.() || [])]
        .filter((channel) => channel?.isTextBased?.() && channel.guildId === member.guild.id &&
          channel.permissionsFor?.(member)?.has?.(require("discord.js").PermissionFlagsBits.ViewChannel))
        .sort((a, b) => (a.rawPosition || a.position || 0) - (b.rawPosition || b.position || 0));
      const findChannel = (names) => publicChannels.find((channel) =>
        names.includes(String(channel.name || "").toLowerCase().replace(/[^a-z0-9-]/g, ""))
      );
      const rulesChannel = findChannel(["rules", "server-rules", "read-me-first"]);
      const introChannel = findChannel(["introductions", "introduction", "introduce-yourself", "introduce-yourself-here"]);
      const startChannel = findChannel(["start-here", "getting-started", "welcome"]);
      const nextSteps = [
        rulesChannel ? "Read <#" + rulesChannel.id + ">" : null,
        introChannel ? "Introduce yourself in <#" + introChannel.id + ">" : null,
        startChannel && startChannel.id !== welcomeChannel.id ? "Explore <#" + startChannel.id + ">" : null
      ].filter(Boolean);
      const welcome = new EmbedBuilder()
        .setColor(0x32956B)
        .setAuthor({
          name: "A NEW MEMBER HAS ARRIVED",
          iconURL: member.guild.iconURL?.({ size: 128 }) || undefined
        })
        .setTitle("Welcome to " + safeDisplay(member.guild.name))
        .setDescription("We're glad you're here, <@" + member.id + ">! Make yourself at home and meet the community.")
        .addFields(
          { name: "Member", value: "<@" + member.id + ">", inline: true },
          { name: "Member number", value: "#" + String(member.guild.memberCount || "—"), inline: true },
          { name: "Account created", value: createdAt ? "<t:" + Math.floor(createdAt.getTime() / 1000) + ":R>" : "Unknown", inline: true },
          {
            name: "Getting started",
            value: nextSteps.length ? nextSteps.join("\n") : "Take a look around the public channels and check the server guidelines.",
            inline: false
          },
          {
            name: "Roles assigned",
            value: autoRoles.length ? autoRoles.map((role) => "<@&" + role.id + ">").join(", ") : "No automatic roles are configured.",
            inline: false
          }
        )
        .setTimestamp();
      const avatar = member.displayAvatarURL?.({ size: 256 });
      if (avatar) welcome.setThumbnail(avatar);
      await welcomeChannel.send({
        embeds: [welcome],
        allowedMentions: { users: [member.id] }
      }).catch((error) => console.warn("[member-lifecycle] Welcome message failed:", error.message));
    }
    return true;
  }

  async handleRoleUpdate(guild, memberId, actorId, entry = null, botUserId = null) {
    if (!guild || !this.supportsGuild(guild.id) || !memberId) return false;
    const member = await guild.members.fetch(memberId).catch(() => null);
    if (!member) return false;
    const previous = await this.latestRoleSnapshot(guild.id, memberId);
    const currentRoles = serializeRoles(member);
    const previousRoles = Array.isArray(previous?.roles) ? previous.roles : [];
    const previousIds = new Set(previousRoles.map((role) => String(role.id)));
    const currentIds = new Set(currentRoles.map((role) => String(role.id)));
    const added = previous ? currentRoles.filter((role) => !previousIds.has(String(role.id))) : [];
    const removed = previous ? previousRoles.filter((role) => !currentIds.has(String(role.id))) : [];
    const snapshot = {
      source: "audit_role_update",
      roles: currentRoles,
      joinedAt: previous?.joinedAt || asDate(member.joinedAt)?.toISOString() || null,
      accountCreatedAt: previous?.accountCreatedAt ||
        asDate(member.user?.createdAt || member.user?.createdTimestamp)?.toISOString() || null,
      capturedAt: new Date().toISOString()
    };
    await this.writeAudit(guild.id, actorId || "unknown", "member_roles_snapshot", memberId, snapshot);
    if (actorId && actorId !== botUserId) {
      const addedText = added.length ? added.map((role) => "**" + safeDisplay(role.name) + "**").join(", ") : "None";
      const removedText = removed.length ? removed.map((role) => "**" + safeDisplay(role.name) + "**").join(", ") : "None";
      const details = { added: added.map((role) => role.name), removed: removed.map((role) => role.name), roles: currentRoles.map((role) => role.name) };
      await this.writeAudit(guild.id, actorId, "member_roles_changed", memberId, details);
      const embed = new EmbedBuilder()
        .setColor(0xC18A37)
        .setTitle((guild.id === this.coopftGuildId && this.coopftCommunity ? this.coopftCommunity.emoji(guild.id, "cf3d_role_select", "🎭") : "🎭") + "  MEMBER ROLES UPDATED")
        .setDescription(previous ? "The role assignments for <@" + memberId + "> were changed." : "The role assignments for <@" + memberId + "> changed. A previous role snapshot was not available, so only the current role list can be confirmed.")
        .addFields(
          { name: "Member", value: "<@" + memberId + ">", inline: true },
          { name: "Changed by", value: "<@" + actorId + ">", inline: true },
          { name: "Roles added", value: addedText, inline: false },
          { name: "Roles removed", value: removedText, inline: false },
          ...(!previous ? [{ name: "Current roles", value: rolesText(currentRoles), inline: false }] : [])
        )
        .setTimestamp();
      await this.sendServerLog(guild, embed);
    }
    return true;
  }

  async handleServerAuditEntry(guild, entry, botUserId = null) {
    if (!guild || !this.supportsGuild(guild.id)) return false;
    const action = SERVER_AUDIT_ACTIONS.get(entry?.action);
    if (!action) return false;
    const actorId = entry.executorId || entry.executor?.id || null;
    if (actorId && actorId === botUserId) return false;
    const targetId = entry.targetId || entry.target?.id || null;
    const targetName = entry.target?.name || entry.target?.username || targetId || "Unknown";
    const reason = String(entry.reason || "").trim().slice(0, 800);
    const changes = auditChangesText(entry);
    const targetKind = action.key.startsWith("channel") ? "Channel" :
      action.key.startsWith("role") ? "Role" :
      action.key.startsWith("webhook") ? "Webhook" :
      action.key.startsWith("invite") ? "Invite" :
      action.key.startsWith("server_") ? "Server" :
      action.key.startsWith("message") ? "Messages" : "Member";
    const targetLabel = targetKind === "Channel" ? "#" + safeDisplay(targetName) :
      targetKind === "Role" ? "@" + safeDisplay(targetName) : safeDisplay(targetName);
    const summary = auditSummary(action.key, entry);
    const actorLabel = actorId
      ? "<@" + actorId + ">" + (entry.executor?.tag || entry.executor?.username ? " • " + safeDisplay(entry.executor.tag || entry.executor.username) : "")
      : "Discord did not provide an executor for this entry.";
    const auditDetails = {
      action: action.key,
      targetKind,
      targetName: String(targetName).slice(0, 180),
      actorId,
      reason: reason || null,
      summary,
      changes: changes || null
    };
    await this.writeAudit(guild.id, actorId || "unknown", "server_audit_" + action.key, targetId, auditDetails);
    const embed = new EmbedBuilder()
      .setColor(action.color)
      .setTitle((guild.id === this.coopftGuildId && this.coopftCommunity
        ? this.coopftCommunity.emoji(guild.id, action.key.startsWith("channel") ? "cf3d_gear" : action.key.startsWith("role") ? "cf3d_role_select" : action.key.startsWith("member") ? "cf3d_member" : "cf3d_bell", "✦") + "  "
        : "✦  ") + action.label)
      .setDescription(summary + "\n\n**" + targetKind + ":** " + targetLabel)
      .addFields(
        { name: "Performed by", value: actorLabel, inline: false },
        ...(changes ? [{ name: "What changed", value: changes, inline: false }] : []),
        { name: "Reason", value: reason || "No reason was recorded in the Discord audit entry.", inline: false }
      )
      .setTimestamp(asDate(entry.createdAt) || new Date());
    if (action.destination === "member") await this.sendMemberLog(guild, embed);
    else await this.sendServerLog(guild, embed);
    return true;
  }

  async handleLeave(member) {
    if (!member?.guild || !this.supportsGuild(member.guild.id)) return false;
    const leftAt = new Date();
    const snapshot = await this.latestRoleSnapshot(member.guild.id, member.id);
    const joinedAt = snapshot?.joinedAt || asDate(member.joinedAt)?.toISOString() || null;
    const details = {
      roles: Array.isArray(snapshot?.roles) ? snapshot.roles : serializeRoles(member),
      joinedAt,
      accountCreatedAt: snapshot?.accountCreatedAt ||
        asDate(member.user?.createdAt || member.user?.createdTimestamp)?.toISOString() || null,
      leftAt: leftAt.toISOString(),
      tenureMs: joinedAt ? Math.max(0, leftAt.getTime() - new Date(joinedAt).getTime()) : null
    };
    const embed = this.buildLeaveLogEmbed(member, details, leftAt);
    await this.writeAudit(member.guild.id, "system", "member_left", member.id, details);
    await this.sendMemberLog(member.guild, embed);
    return true;
  }
}

module.exports = {
  MemberLifecycleService,
  formatDuration,
  serializeRoles,
  rolesText,
  timestampText,
  auditChangesText,
  SERVER_AUDIT_ACTIONS
};
