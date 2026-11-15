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
    "• **" + safeDisplay(role.name) + "** (" + String(role.id || "unknown") + ")"
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

function auditChangesText(entry) {
  const changes = Array.isArray(entry?.changes) ? entry.changes : [];
  if (!changes.length) return "No field-level changes were provided.";
  return changes.slice(0, 8).map((change) =>
    "• **" + safeDisplay(change.key || "Change") + "**: " +
    auditValue(change.old) + " → " + auditValue(change.new)
  ).join("\n").slice(0, 1000);
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

  buildJoinLogEmbed(member, snapshot, joinedAt) {
    const createdAt = asDate(snapshot?.accountCreatedAt || member.user?.createdAt || member.user?.createdTimestamp);
    const joined = asDate(joinedAt);
    return new EmbedBuilder()
      .setColor(0x32956B)
      .setTitle("MEMBER JOINED")
      .setDescription("<@" + member.id + "> • **" + safeDisplay(member.user?.tag || member.user?.username || member.displayName) + "**")
      .addFields(
        { name: "User ID", value: member.id, inline: true },
        { name: "Account created", value: timestampText(createdAt), inline: true },
        { name: "Account age", value: createdAt ? formatDuration(Date.now() - createdAt.getTime()) : "Unknown", inline: true },
        { name: "Joined server", value: timestampText(joined), inline: false },
        { name: "Roles at join", value: rolesText(snapshot?.roles), inline: false }
      )
      .setFooter({ text: "Member lifecycle • Join snapshot stored in audit history" })
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
      .setTitle("MEMBER LEFT")
      .setDescription("**" + safeDisplay(member.user?.tag || member.user?.username || member.displayName) + "** • <@" + member.id + ">")
      .addFields(
        { name: "User ID", value: member.id, inline: true },
        { name: "Account age", value: createdAt ? formatDuration(left.getTime() - createdAt.getTime()) : "Unknown", inline: true },
        { name: "Time in server", value: tenureMs === null ? "Join date unavailable" : formatDuration(tenureMs), inline: true },
        { name: "Joined server", value: timestampText(joinedAt), inline: false },
        { name: "Left server", value: timestampText(left), inline: false },
        { name: "Previous roles", value: rolesText(details.roles), inline: false }
      )
      .setFooter({ text: "Member lifecycle • Previous role snapshot retrieved from audit history" })
      .setTimestamp(left);
  }

  async handleJoin(member) {
    if (!member?.guild || !this.supportsGuild(member.guild.id)) return false;
    const snapshot = await this.recordRoleSnapshot(member, member.id, "join");
    const joinedAt = asDate(member.joinedAt)?.toISOString() || new Date().toISOString();
    await this.writeAudit(member.guild.id, member.id, "member_joined", member.id, {
      joinedAt,
      accountCreatedAt: snapshot?.accountCreatedAt || null,
      roles: snapshot?.roles || []
    });
    await this.sendMemberLog(member.guild, this.buildJoinLogEmbed(member, snapshot, joinedAt));
    const welcomeChannel = await this.resolveWelcomeChannel(member.guild);
    if (welcomeChannel?.guildId === member.guild.id && welcomeChannel.isTextBased?.() && typeof welcomeChannel.send === "function") {
      const createdAt = asDate(snapshot?.accountCreatedAt);
      const welcome = new EmbedBuilder()
        .setColor(0x32956B)
        .setTitle("WELCOME TO " + safeDisplay(member.guild.name).toUpperCase())
        .setDescription("A warm welcome to <@" + member.id + ">! Take a moment to read the rules and introduce yourself.")
        .addFields(
          { name: "Member", value: "<@" + member.id + ">", inline: true },
          { name: "Account age", value: createdAt ? formatDuration(Date.now() - createdAt.getTime()) : "Unknown", inline: true },
          { name: "Member count", value: String(member.guild.memberCount || "—"), inline: true }
        )
        .setFooter({ text: "We are glad you are here." })
        .setTimestamp();
      const avatarUrl = member.user?.displayAvatarURL?.({ size: 128 });
      if (avatarUrl) welcome.setThumbnail(avatarUrl);
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
    const snapshot = await this.recordRoleSnapshot(member, actorId || "unknown", "audit_role_update");
    if (actorId && actorId !== botUserId) {
      const changes = auditChangesText(entry);
      await this.writeAudit(guild.id, actorId, "member_roles_changed", memberId, {
        roles: snapshot?.roles || [],
        changes
      });
      const embed = new EmbedBuilder()
        .setColor(0xC18A37)
        .setTitle("MEMBER ROLES UPDATED")
        .setDescription("<@" + memberId + "> • changed by <@" + actorId + ">")
        .addFields(
          { name: "Member ID", value: memberId, inline: true },
          { name: "Changed by", value: actorId, inline: true },
          { name: "Changes", value: changes, inline: false }
        )
        .setFooter({ text: "The new role state has been saved for future leave logs." })
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
    const reason = String(entry.reason || "No reason supplied").slice(0, 900);
    const changes = auditChangesText(entry);
    const extra = entry.extra ? auditValue(entry.extra) : null;
    const auditDetails = {
      action: action.key,
      targetName: String(targetName).slice(0, 180),
      actorId,
      reason,
      changes,
      extra
    };
    await this.writeAudit(guild.id, actorId || "unknown", "server_audit_" + action.key, targetId, auditDetails);
    const embed = new EmbedBuilder()
      .setColor(action.color)
      .setTitle(action.label)
      .setDescription("**Target:** " + safeDisplay(targetName) + (targetId ? " (" + targetId + ")" : ""))
      .addFields(
        { name: "Executor", value: actorId ? "<@" + actorId + "> (" + actorId + ")" : "Unknown", inline: false },
        { name: "Reason", value: reason || "No reason supplied", inline: false },
        { name: "Changes", value: changes, inline: false },
        ...(extra ? [{ name: "Additional details", value: extra.slice(0, 1024), inline: false }] : [])
      )
      .setFooter({ text: "Server audit • Informational only; no automatic moderation action" })
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
