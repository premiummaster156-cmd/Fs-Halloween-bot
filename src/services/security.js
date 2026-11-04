const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const settings = require("../config/settings");
const { log } = require("../utils/logging");

const WINDOW_MS = 120000;
const ALERT_DEDUPE_MS = 600000;

class SecurityService {
  constructor(pool, guildSettings) {
    this.pool = pool;
    this.guildSettings = guildSettings;
    this.cooldownAttempts = new Map();
    this.commandAttempts = new Map();
    this.componentAttempts = new Map();
    this.unauthorizedAttempts = new Map();
    this.destructiveAttempts = new Map();
    this.alertedAt = new Map();
  }

  isOwner(userId, guildOwnerId) {
    return Boolean(userId && (userId === guildOwnerId || (settings.ownerId && userId === settings.ownerId)));
  }

  pushWindow(map, key, now, windowMs) {
    const recent = (map.get(key) || []).filter((time) => now - time < windowMs);
    recent.push(now);
    map.set(key, recent);
    if (map.size > 5000) {
      for (const [id, values] of map) {
        if (!values.length || now - values[values.length - 1] > WINDOW_MS * 2) map.delete(id);
      }
    }
    return recent;
  }

  async getRestriction(guildId, userId) {
    const result = await this.pool.query(
      "SELECT expires_at, reason FROM bot_user_restrictions WHERE guild_id = $1 AND user_id = $2",
      [guildId, userId]
    );
    if (!result.rowCount) return null;
    const restriction = result.rows[0];
    if (restriction.expires_at && new Date(restriction.expires_at).getTime() <= Date.now()) {
      await this.pool.query("DELETE FROM bot_user_restrictions WHERE guild_id = $1 AND user_id = $2", [guildId, userId]);
      return null;
    }
    return restriction;
  }

  async checkAccess(interaction) {
    if (this.isOwner(interaction.user.id, interaction.guild?.ownerId)) return { allowed: true };
    const restriction = await this.getRestriction(interaction.guildId, interaction.user.id);
    return restriction ? { allowed: false, reason: restriction.reason, expiresAt: restriction.expires_at } : { allowed: true };
  }

  async createIncident(client, input) {
    const guild = input.guild;
    if (!guild?.id) return null;
    const userId = input.userId || null;
    const dedupeKey = guild.id + ":" + (userId || "unknown") + ":" + input.category;
    const now = Date.now();
    if (now - (this.alertedAt.get(dedupeKey) || 0) < ALERT_DEDUPE_MS) return null;
    this.alertedAt.set(dedupeKey, now);

    let incidentId;
    try {
      const result = await this.pool.query(
        "INSERT INTO security_incidents (guild_id, user_id, category, summary, details) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id",
        [guild.id, userId, input.category, input.summary, JSON.stringify(input.details || {})]
      );
      incidentId = String(result.rows[0].id);
    } catch (error) {
      log("error", "Could not persist security incident", { guildId: guild.id, message: error.message });
      return null;
    }

    const owners = Array.from(new Set([guild.ownerId, settings.ownerId].filter(Boolean)));
    const mention = owners.map((id) => "<@" + id + ">").join(" ");
    const details = Object.entries(input.details || {}).map(([key, value]) =>
      key + ": " + (typeof value === "string" ? value : JSON.stringify(value))
    ).join("\n").slice(0, 1300);

    const components = [];
    if (userId) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + userId + ":pause").setLabel("Pause bot access · 10m").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + userId + ":block").setLabel("Block bot access").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + userId + ":unblock").setLabel("Remove bot block").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + userId + ":ignore").setLabel("Ignore alert").setStyle(ButtonStyle.Secondary)
      ));
    } else {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":unknown:ignore").setLabel("Acknowledge / ignore").setStyle(ButtonStyle.Secondary)
      ));
    }

    try {
      const channelId = await this.guildSettings.get(guild.id, "logChannelId");
      const channel = channelId ? await client.channels.fetch(channelId) : null;
      if (!channel || !channel.isTextBased() || channel.guildId !== guild.id) {
        log("warn", "Security incident created without a usable log channel", { guildId: guild.id, incidentId });
        return incidentId;
      }
      await channel.send({
        content: (mention ? mention + "\n" : "") + "**SECURITY ALERT · #" + incidentId + "**\n" +
          input.summary + "\nCategory: " + input.category.replace(/_/g, " ") + "\nMember: " +
          (userId ? "<@" + userId + "> (" + userId + ")" : "Unknown") +
          (details ? "\n" + details : "") +
          "\n\nNo punishment has been applied automatically. Review and choose an action below.",
        components,
        allowedMentions: { users: owners }
      });
    } catch (error) {
      log("error", "Could not deliver security alert", { guildId: guild.id, incidentId, message: error.message });
    }
    return incidentId;
  }

  async checkCommandRate(interaction) {
    if (this.isOwner(interaction.user.id, interaction.guild?.ownerId)) return { allowed: true };
    const now = Date.now();
    const key = interaction.guildId + ":" + interaction.user.id;
    const attempts = this.pushWindow(this.commandAttempts, key, now, 10000);
    if (attempts.length <= 8) return { allowed: true };
    if (attempts.length === 9 || attempts.length % 5 === 0) {
      this.createIncident(interaction.client, {
        guild: interaction.guild, userId: interaction.user.id, category: "command_spam",
        summary: "Repeated slash-command requests were rate-limited.",
        details: { count: attempts.length, windowSeconds: 10, command: interaction.commandName }
      }).catch((error) => log("warn", "Could not create command-spam incident", { message: error.message }));
    }
    return { allowed: false, retryAfterMs: Math.max(1000, 10000 - (now - attempts[0])) };
  }

  async checkComponentRate(interaction) {
    if (this.isOwner(interaction.user.id, interaction.guild?.ownerId)) return { allowed: true };
    const now = Date.now();
    const key = interaction.guildId + ":" + interaction.user.id;
    const attempts = this.pushWindow(this.componentAttempts, key, now, 10000);
    if (attempts.length <= 24) return { allowed: true };
    if (attempts.length === 25 || attempts.length % 8 === 0) {
      this.createIncident(interaction.client, {
        guild: interaction.guild, userId: interaction.user.id, category: "component_spam",
        summary: "Repeated dashboard interactions were rate-limited.",
        details: { count: attempts.length, windowSeconds: 10 }
      }).catch((error) => log("warn", "Could not create component-spam incident", { message: error.message }));
    }
    return { allowed: false, retryAfterMs: Math.max(1000, 10000 - (now - attempts[0])) };
  }

  async recordCooldownAttempt(interaction, error) {
    if (this.isOwner(interaction.user.id, interaction.guild?.ownerId)) return;
    const key = interaction.guildId + ":" + interaction.user.id;
    const attempts = this.pushWindow(this.cooldownAttempts, key, Date.now(), WINDOW_MS);
    await this.pool.query(
      "INSERT INTO audit_logs (guild_id, actor_id, action, target_id, details) VALUES ($1, $2, 'cooldown_blocked_attempt', $2, $3::jsonb)",
      [interaction.guildId, interaction.user.id, JSON.stringify({
        command: interaction.commandName || null,
        customId: interaction.customId || null,
        remainingMs: error.remainingMs || null,
        countInWindow: attempts.length
      })]
    ).catch((dbError) => log("warn", "Could not store cooldown attempt", { message: dbError.message }));
    if (attempts.length >= 5 && (attempts.length === 5 || attempts.length % 5 === 0)) {
      await this.createIncident(interaction.client, {
        guild: interaction.guild, userId: interaction.user.id, category: "repeated_cooldown_bypass",
        summary: "Repeated attempts were made while a gameplay cooldown was still active.",
        details: { attemptsInWindow: attempts.length, windowSeconds: 120, command: interaction.commandName || null, customId: interaction.customId || null }
      });
    }
  }

  async recordUnauthorizedControlAttempt(interaction, controlId) {
    if (this.isOwner(interaction.user.id, interaction.guild?.ownerId)) return;
    const key = interaction.guildId + ":" + interaction.user.id + ":control";
    const attempts = this.pushWindow(this.unauthorizedAttempts, key, Date.now(), 300000);
    await this.pool.query(
      "INSERT INTO audit_logs (guild_id, actor_id, action, target_id, details) VALUES ($1, $2, 'unauthorized_dashboard_control', $2, $3::jsonb)",
      [interaction.guildId, interaction.user.id, JSON.stringify({ countInWindow: attempts.length, controlId: String(controlId || "").slice(0, 100) })]
    ).catch((error) => log("warn", "Could not store unauthorized dashboard attempt", { message: error.message }));
    if (attempts.length >= 3 && attempts.length % 3 === 0) {
      this.createIncident(interaction.client, {
        guild: interaction.guild, userId: interaction.user.id, category: "unauthorized_control_access",
        summary: "A member repeatedly tried to use dashboard controls that do not belong to them.",
        details: { attemptsInWindow: attempts.length, windowSeconds: 300 }
      }).catch((error) => log("warn", "Could not create unauthorized-control incident", { message: error.message }));
    }
  }

  async recordUnauthorizedAdminAttempt(interaction) {
    if (this.isOwner(interaction.user.id, interaction.guild?.ownerId)) return;
    const key = interaction.guildId + ":" + interaction.user.id + ":admin";
    const attempts = this.pushWindow(this.commandAttempts, key, Date.now(), 300000);
    await this.pool.query(
      "INSERT INTO audit_logs (guild_id, actor_id, action, target_id, details) VALUES ($1, $2, 'unauthorized_admin_panel_attempt', $2, $3::jsonb)",
      [interaction.guildId, interaction.user.id, JSON.stringify({ countInWindow: attempts.length })]
    ).catch((error) => log("warn", "Could not store unauthorized admin attempt", { message: error.message }));
    if (attempts.length >= 3 && attempts.length % 3 === 0) {
      this.createIncident(interaction.client, {
        guild: interaction.guild, userId: interaction.user.id, category: "unauthorized_admin_access",
        summary: "A member repeatedly tried to access the owner-only administration console.",
        details: { attemptsInWindow: attempts.length, windowSeconds: 300 }
      }).catch((error) => log("warn", "Could not create unauthorized-admin incident", { message: error.message }));
    }
  }

  async recordDestructiveChange(client, guild, targetId, kind, auditType) {
    if (!guild || !targetId) return;
    await new Promise((resolve) => setTimeout(resolve, 900));
    let entry;
    try {
      const logs = await guild.fetchAuditLogs({ type: auditType, limit: 5 });
      entry = logs.entries.find((item) => item.target?.id === targetId && Date.now() - item.createdTimestamp < 20000);
    } catch (error) {
      log("warn", "Could not attribute destructive action. Grant View Audit Log to the bot for attribution.", {
        guildId: guild.id, kind, targetId, message: error.message
      });
      return;
    }
    const actorId = entry?.executor?.id;
    if (!actorId || actorId === client.user?.id || this.isOwner(actorId, guild.ownerId)) return;
    const key = guild.id + ":" + actorId;
    const attempts = this.pushWindow(this.destructiveAttempts, key, Date.now(), 20000);
    const threshold = kind === "member_ban" ? 5 : 3;
    if (attempts.length !== threshold) return;
    await this.createIncident(client, {
      guild, userId: actorId, category: "rapid_destructive_actions",
      summary: "Several destructive server actions were detected in a short period.",
      details: {
        actionType: kind, countInWindow: attempts.length, windowSeconds: 20,
        latestTargetId: targetId, auditReason: entry.reason || "No audit-log reason provided"
      }
    });
  }

  async handleAlertInteraction(interaction) {
    const parts = interaction.customId.split(":");
    const incidentId = parts[1], guildId = parts[2];
    const targetId = parts[3] === "unknown" ? null : parts[3];
    const action = parts[4];
    if (interaction.guildId !== guildId || !this.isOwner(interaction.user.id, interaction.guild?.ownerId)) {
      return interaction.reply({ content: "Only the server owner or configured bot owner can manage security alerts.", flags: MessageFlags.Ephemeral });
    }
    const incident = await this.pool.query(
      "SELECT id, user_id FROM security_incidents WHERE id = $1 AND guild_id = $2",
      [incidentId, guildId]
    );
    if (!incident.rowCount) return interaction.reply({ content: "This security incident could not be found.", flags: MessageFlags.Ephemeral });

    if (action === "pause" || action === "block") {
      if (!targetId || incident.rows[0].user_id !== targetId) {
        return interaction.reply({ content: "This alert has no valid target to restrict.", flags: MessageFlags.Ephemeral });
      }
      const expires = action === "pause" ? new Date(Date.now() + 600000) : null;
      await this.pool.query(
        "INSERT INTO bot_user_restrictions (guild_id, user_id, expires_at, reason, created_by) VALUES ($1, $2, $3, $4, $5) " +
        "ON CONFLICT (guild_id, user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, updated_at = NOW()",
        [guildId, targetId, expires, "Security restriction from incident #" + incidentId, interaction.user.id]
      );
    } else if (action === "unblock") {
      if (!targetId) return interaction.reply({ content: "This alert has no valid target to unblock.", flags: MessageFlags.Ephemeral });
      await this.pool.query("DELETE FROM bot_user_restrictions WHERE guild_id = $1 AND user_id = $2", [guildId, targetId]);
    } else if (action !== "ignore") {
      return interaction.reply({ content: "Unknown security action.", flags: MessageFlags.Ephemeral });
    }

    const status = action === "ignore" ? "ignored" : action === "pause" ? "restricted_10m" : action === "block" ? "blocked_from_bot" : "bot_access_restored";
    await this.pool.query(
      "UPDATE security_incidents SET status = $2, updated_by = $3, updated_at = NOW() WHERE id = $1",
      [incidentId, status, interaction.user.id]
    );
    await this.pool.query(
      "INSERT INTO audit_logs (guild_id, actor_id, action, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)",
      [guildId, interaction.user.id, "security_alert_" + status, targetId, JSON.stringify({ incidentId })]
    ).catch((error) => log("warn", "Could not audit security action", { message: error.message }));

    const text = {
      ignored: "Alert #" + incidentId + " marked as reviewed. No action was taken.",
      restricted_10m: "<@" + targetId + "> cannot use the bot for 10 minutes. No server timeout was applied.",
      blocked_from_bot: "<@" + targetId + "> is blocked from this bot until an owner removes the restriction. No server timeout was applied.",
      bot_access_restored: "Bot access restored for <@" + targetId + ">."
    };
    return interaction.update({ content: text[status], embeds: interaction.message.embeds, components: [] });
  }
}

module.exports = { SecurityService };
