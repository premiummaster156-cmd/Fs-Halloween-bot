const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const settings = require("../config/settings");
const { log } = require("../utils/logging");

const WINDOW_MS = 120000;
const ALERT_DEDUPE_MS = 600000;

function isSevereEconomyIncident(category, details = {}) {
  if (["economy_direct_balance_change", "economy_invalid_payout"].includes(category)) return true;
  if (["economy_tampering", "economy_xp_manipulation"].includes(category)) {
    return Number(details.invalidAttempts) >= 3;
  }
  return String(category || "").startsWith("economy_") && Number(details.riskScore) >= 80;
}

function evaluateNukeBurst(events = []) {
  const counts = events.reduce((total, event) => {
    const kind = typeof event === "string" ? event : event.kind;
    total[kind] = (total[kind] || 0) + 1;
    return total;
  }, {});
  const deletedAssets = (counts.channel_delete || 0) + (counts.role_delete || 0);
  const memberRemovals = (counts.member_ban || 0) + (counts.member_kick || 0);
  const createdAssets = (counts.channel_create || 0) + (counts.role_create || 0);
  if (deletedAssets >= 3) return { triggered: true, reason: "mass_asset_deletion", count: deletedAssets, counts };
  if (memberRemovals >= 5) return { triggered: true, reason: "mass_member_removal", count: memberRemovals, counts };
  if (createdAssets >= 8) return { triggered: true, reason: "mass_asset_creation", count: createdAssets, counts };
  return { triggered: false, reason: null, count: events.length, counts };
}

function evaluateInviteBurst(events = [], now = Date.now()) {
  const recent = events.filter((event) => now - Number(event.at || 0) <= 30000);
  const created = recent.filter((event) => event.kind === "invite_create").length;
  const deleted = recent.filter((event) => event.kind === "invite_delete").length;
  const triggered = created >= 5 || (recent.length >= 8 && created >= 3 && deleted >= 2);
  return { triggered, total: recent.length, created, deleted, windowSeconds: 30 };
}

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
    this.hierarchyCache = new Map();
    this.nukeEvents = new Map();
    this.processedAuditIds = new Map();
    this.nukeAlertedAt = new Map();
    this.inviteActivity = new Map();
    this.raidAlertedAt = new Map();
    this.economyViolationAttempts = new Map();
  }

  isKing(userId) {
    return Boolean(userId && Array.isArray(settings.kingIds) && settings.kingIds.includes(String(userId)));
  }

  isOwner(userId, guildOwnerId) {
    // Kings are the bot's highest-trust identities; OWNER_ID remains below them.
    return Boolean(userId && (
      this.isKing(userId) ||
      userId === guildOwnerId ||
      (settings.ownerId && userId === settings.ownerId)
    ));
  }

  isProtectedKingTarget(userId) {
    return this.isKing(userId);
  }

  async hasAdminAccess(guild, userId) {
    if (!guild || !userId) return false;
    if (this.isOwner(userId, guild.ownerId)) return true;
    try {
      const adminRoleId = await this.guildSettings.get(guild.id, "adminRoleId");
      if (!adminRoleId) return false;
      const member = await guild.members.fetch(userId);
      return member.roles.cache.has(adminRoleId);
    } catch (_) {
      // Fail closed: inability to verify the configured admin role never grants admin access.
      return false;
    }
  }

  async getHierarchyExemptionStatus(guild, userId) {
    if (!guild || !userId) return false;
    if (this.isOwner(userId, guild.ownerId)) return true;

    const cacheKey = guild.id + ":" + userId;
    const cached = this.hierarchyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.exempt;

    try {
      const adminRoleId = await this.guildSettings.get(guild.id, "adminRoleId");
      const [member, botMember] = await Promise.all([
        guild.members.fetch(userId),
        guild.members.me ? Promise.resolve(guild.members.me) : guild.members.fetchMe()
      ]);
      const hasTrustedAdminRole = Boolean(adminRoleId && member.roles.cache.has(adminRoleId));
      const higherThanBot = member.roles.highest.comparePositionTo(botMember.roles.highest) > 0;
      const exempt = hasTrustedAdminRole || higherThanBot;
      this.hierarchyCache.set(cacheKey, { exempt, expiresAt: Date.now() + 20000 });
      if (this.hierarchyCache.size > 5000) {
        for (const [key, item] of this.hierarchyCache) {
          if (item.expiresAt <= Date.now()) this.hierarchyCache.delete(key);
        }
      }
      return exempt;
    } catch (_) {
      // Unknown hierarchy is not treated as proof of an exemption.
      return null;
    }
  }

  async isAboveBotRole(guild, userId) {
    // For monitoring and enforcement, an unknown hierarchy is treated as exempt:
    // never punish or operationally escalate someone when their rank cannot be verified.
    return (await this.getHierarchyExemptionStatus(guild, userId)) !== false;
  }

  clearHierarchyCache() {
    this.hierarchyCache.clear();
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
    const hierarchy = await this.getHierarchyExemptionStatus(interaction.guild, interaction.user.id);
    if (hierarchy === true) return { allowed: true };

    const restriction = await this.getRestriction(interaction.guildId, interaction.user.id);
    if (!restriction) return { allowed: true };

    // Do not let a failed role lookup silently bypass a bot restriction.
    // Unverifiable members are denied only while an active bot restriction exists.
    return {
      allowed: false,
      reason: restriction.reason,
      expiresAt: restriction.expires_at,
      verificationFailed: hierarchy === null
    };
  }

  async createIncident(client, input) {
    const guild = input.guild;
    if (!guild?.id) return null;
    const userId = input.userId || null;
    const isAlertOnly = ["anti_nuke", "anti_raid"].includes(input.category);
    const isEconomyAlert = String(input.category || "").startsWith("economy_");
    if (userId && !isAlertOnly && await this.isAboveBotRole(guild, userId)) return null;
    const now = Date.now();
    if (userId && ["economy_tampering", "economy_xp_manipulation"].includes(input.category)) {
      const attemptKey = guild.id + ":" + userId;
      const attempts = this.pushWindow(this.economyViolationAttempts, attemptKey, now, 5 * 60 * 1000);
      if (attempts.length < 3) return null;
      input = { ...input, details: { ...(input.details || {}), invalidAttempts: attempts.length } };
    }
    const severeEconomyAlert = isEconomyAlert && isSevereEconomyIncident(input.category, input.details || {});
    // Soft economy signals and isolated malformed operations never notify owners.
    if (isEconomyAlert && !severeEconomyAlert) return null;
    const dedupeKey = guild.id + ":" + (userId || "unknown") + ":" + input.category;
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

    const detailsInput = { ...(input.details || {}) };

    // Urgent raid/nuke detections are sent immediately. Routine notices are
    // grouped per guild and limited by PostgreSQL across restarts and instances.
    let suppressedCount = 0;
    if (["anti_nuke", "anti_raid"].includes(input.category)) {
      try {
        const priority = await this.pool.query(
          "INSERT INTO security_priority_alert_state (guild_id, category, last_notified_at) VALUES ($1, $2, NOW()) " +
          "ON CONFLICT (guild_id, category) DO UPDATE SET last_notified_at=NOW() " +
          "WHERE security_priority_alert_state.last_notified_at <= NOW() - INTERVAL '10 minutes' " +
          "RETURNING last_notified_at",
          [guild.id, input.category]
        );
        if (!priority.rowCount) return incidentId;
      } catch (error) {
        log("error", "Could not apply persistent priority-alert throttle", { guildId: guild.id, incidentId, message: error.message });
        return incidentId;
      }
    } else {
      try {
        const throttled = await this.pool.query(
          "INSERT INTO security_alert_state (guild_id, last_notified_at, suppressed_count, last_suppressed_count) " +
          "VALUES ($1, NOW(), 0, 0) ON CONFLICT (guild_id) DO UPDATE SET " +
          "last_suppressed_count = CASE WHEN security_alert_state.last_notified_at <= NOW() - INTERVAL '15 minutes' " +
          "THEN security_alert_state.suppressed_count ELSE security_alert_state.last_suppressed_count END, " +
          "suppressed_count = CASE WHEN security_alert_state.last_notified_at <= NOW() - INTERVAL '15 minutes' " +
          "THEN 0 ELSE security_alert_state.suppressed_count + 1 END, " +
          "last_notified_at = CASE WHEN security_alert_state.last_notified_at <= NOW() - INTERVAL '15 minutes' " +
          "THEN NOW() ELSE security_alert_state.last_notified_at END " +
          "RETURNING (last_notified_at = NOW()) AS should_notify, last_suppressed_count AS suppressed_count",
          [guild.id]
        );
        const state = throttled.rows?.[0];
        if (!state || state.should_notify === false) return incidentId;
        suppressedCount = Math.max(0, Number(state.suppressed_count) || 0);
      } catch (error) {
        log("error", "Could not apply persistent security notification throttle", { guildId: guild.id, incidentId, message: error.message });
        return incidentId;
      }
    }

    const labels = {
      command_spam: "Repeated command use",
      component_spam: "Rapid dashboard use",
      repeated_cooldown_bypass: "Repeated cooldown attempts",
      unauthorized_admin_access: "Unauthorized admin access",
      unauthorized_control_access: "Unauthorized dashboard access",
      rapid_destructive_actions: "Rapid server changes",
      anti_nuke: "Potential server nuke",
      anti_raid: "Unusual invite activity / possible raid preparation",
      economy_tampering: "Rejected economy manipulation",
      economy_direct_balance_change: "Out-of-band balance or level edit",
      economy_invalid_payout: "Invalid casino payout",
      economy_reward_burst: "Unusual reward burst",
      economy_xp_manipulation: "Invalid XP award"
    };
    const detailLabels = {
      count: "Attempts observed", attemptsInWindow: "Attempts observed", countInWindow: "Actions observed", invalidAttempts: "Rejected attempts",
      windowSeconds: "Time window", command: "Command used", actionType: "Server activity",
      auditReason: "Audit-log reason", riskScore: "Risk score", reasonCode: "Guard code",
      baseAmount: "Base reward", recentRewards: "Recent rewards", changedFields: "Changed fields",
      wager: "Wager", multiplier: "Payout multiplier", amount: "Attempted amount",
      detectionReason: "Detection reason", actionCounts: "Action counts",
      invitesInWindow: "Invite changes observed", invitesCreated: "Invites created",
      invitesDeleted: "Invites deleted", actorId: "Associated inviter ID",
      verificationLevel: "Current verification level"
    };
    const details = Object.entries(detailsInput)
      .filter(([key]) => !["customId", "latestTargetId", "removedRoleIds"].includes(key))
      .map(([key, value]) => {
        const label = detailLabels[key];
        if (!label) return null;
        return label + ": " + String(typeof value === "string" ? value : JSON.stringify(value)).slice(0, 250);
      }).filter(Boolean).join("\n").slice(0, 1200);

    const actionId = userId || "unknown";
    const components = [];
    if (!isAlertOnly && severeEconomyAlert && userId && !this.isProtectedKingTarget(userId)) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":exclude-leaderboard").setLabel("Exclude leaderboard").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":pause-1h").setLabel("Pause bot · 1h").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":block").setLabel("Block bot access").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":ignore").setLabel("Dismiss").setStyle(ButtonStyle.Secondary)
      ));
    } else if (!isAlertOnly && userId) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":pause").setLabel("Pause bot access · 10m").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":block").setLabel("Block bot access").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":timeout").setLabel("Timeout 10m").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":ignore").setLabel("Acknowledge").setStyle(ButtonStyle.Secondary)
      ));
    } else if (!isAlertOnly) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":unknown:ignore").setLabel("Acknowledge").setStyle(ButtonStyle.Secondary)
      ));
    }

    const enforcement = isAlertOnly
      ? "Alert only. No moderation, account restriction, role, permission, channel or server-setting action is taken."
      : "No punishment or bot-access restriction is applied automatically. Owner actions below require an explicit click.";
    const grouped = suppressedCount ? " " + suppressedCount + " additional security incident(s) were grouped into this notice." : "";
    const severity = ["anti_nuke", "anti_raid", "economy_direct_balance_change", "economy_invalid_payout"].includes(input.category) ? "High" : "Review";
    // Anti-nuke and anti-raid are sent only to the two Kings and configured bot owner.
    // Other security notices retain their existing server-owner recipient as well.
    const recipients = Array.from(new Set((isAlertOnly
      ? [...(Array.isArray(settings.kingIds) ? settings.kingIds : []), settings.ownerId]
      : [guild.ownerId, settings.ownerId, ...(Array.isArray(settings.kingIds) ? settings.kingIds : [])]
    ).filter(Boolean)));
    let delivered = 0;
    for (const recipientId of recipients) {
      try {
        const recipient = await client.users.fetch(recipientId);
        const displayName = String(recipient.globalName || recipient.username || "Administrator").replace(/[\r\n<>]/g, "").slice(0, 64);
        const embed = new EmbedBuilder()
          .setColor(input.category.startsWith("anti_") ? settings.brand.danger : settings.brand.warning)
          .setAuthor({ name: "Fukishōkai Security Operations" })
          .setTitle(labels[input.category] || "Security Incident Notification");
        if (isEconomyAlert) {
          const suggestionByCategory = {
            economy_direct_balance_change: "Compare the player snapshot with the economy ledger and confirm the external change.",
            economy_invalid_payout: "Check the recorded wager, payout formula and casino ledger reference.",
            economy_reward_burst: "Review the last 60 seconds of reward entries and verify their sources.",
            economy_tampering: "Review the rejected mutation, integrity rule and recent ledger entries.",
            economy_xp_manipulation: "Compare the XP snapshot, level changes and recent award records."
          };
          embed.setDescription(String(input.summary || "A severe economy integrity signal was detected.").slice(0, 500))
            .addFields(
              { name: "Member", value: userId ? "<@" + userId + "> (" + userId + ")" : "Unknown", inline: false },
              { name: "Context", value: (details || "No additional evidence recorded.").slice(0, 900), inline: false },
              { name: "Suggested manual review", value: suggestionByCategory[input.category] || "Review the member's recent economy ledger before deciding.", inline: false },
              { name: "Available bot actions", value: severeEconomyAlert && userId && !this.isProtectedKingTarget(userId)
                ? "Optional actions below apply only after an authorized owner/admin clicks. No automatic punishment is applied."
                : "Review only. No automatic punishment is applied.", inline: false }
            )
            .setFooter({ text: "Fukishōkai Economy Integrity · Incident #" + incidentId });
        } else {
          embed.setDescription(
            "Dear " + displayName + ",\n\n" +
            "This is an official security notification regarding **" + String(guild.name || "your Discord server").slice(0, 90) + "**. " +
            String(input.summary || "Security activity requires your attention.") + "\n\n" +
            (isAlertOnly
              ? "This is an alert-only notification. Fukishōkai has not taken any action and will not automatically moderate members or change server settings."
              : "The automated security service has recorded the incident and taken the action described below. Please review the context.")
          )
          .addFields(
            { name: "Server", value: String(guild.name || "Unknown server").slice(0, 100), inline: true },
            { name: "Severity", value: severity, inline: true },
            { name: "Incident", value: "#" + incidentId, inline: true },
            { name: "Incident context", value: details || "No additional event details were recorded." },
            { name: isAlertOnly ? "Action taken" : "Automated response", value: (enforcement + grouped).slice(0, 1000) }
          )
          .setFooter({ text: "Fukishōkai Security Operations · Confidential owner notice" })
          .setTimestamp(new Date());
        }
        const payload = { embeds: [embed], allowedMentions: { parse: [] } };
        if (!isAlertOnly && components.length) payload.components = components;
        await recipient.send(payload);
        delivered += 1;
      } catch (error) {
        log("warn", "Could not deliver private security notice", {
          guildId: guild.id, recipientId, incidentId, message: error.message
        });
      }
    }
    if (!delivered) log("warn", "Security incident was recorded, but no owner DM could be delivered", {
      guildId: guild.id, incidentId, category: input.category
    });
    return incidentId;
  }

  async checkCommandRate(interaction) {
    if (await this.isAboveBotRole(interaction.guild, interaction.user.id)) return { allowed: true };
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
    if (await this.isAboveBotRole(interaction.guild, interaction.user.id)) return { allowed: true };
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
    if (await this.isAboveBotRole(interaction.guild, interaction.user.id)) return;
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
        details: { attemptsInWindow: attempts.length, windowSeconds: 120, command: interaction.commandName || null }
      });
    }
  }

  async recordUnauthorizedControlAttempt(interaction, controlId) {
    if (await this.isAboveBotRole(interaction.guild, interaction.user.id)) return;
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
    if (await this.isAboveBotRole(interaction.guild, interaction.user.id)) return;
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
    if (!guild || !targetId) return null;
    await new Promise((resolve) => setTimeout(resolve, 900));
    let entry;
    try {
      const logs = await guild.fetchAuditLogs({ type: auditType, limit: 10 });
      entry = logs.entries.find((item) =>
        item.target?.id === targetId && Date.now() - item.createdTimestamp < 15000 &&
        !this.processedAuditIds.has(item.id)
      );
    } catch (error) {
      log("warn", "Could not attribute anti-nuke event. Grant View Audit Log to the bot for attribution.", {
        guildId: guild.id, kind, targetId, message: error.message
      });
      return null;
    }
    if (!entry) return null;
    this.processedAuditIds.set(entry.id, Date.now());
    for (const [id, at] of this.processedAuditIds) {
      if (Date.now() - at > 5 * 60 * 1000) this.processedAuditIds.delete(id);
    }
    const actorId = entry.executor?.id;
    if (!actorId || actorId === client.user?.id) return null;
    const key = guild.id + ":" + actorId;
    const recent = (this.nukeEvents.get(key) || []).filter((item) => Date.now() - item.at <= 20000);
    recent.push({ at: Date.now(), kind, targetId, auditId: entry.id });
    this.nukeEvents.set(key, recent);
    const evaluation = evaluateNukeBurst(recent);
    if (!evaluation.triggered || Date.now() - (this.nukeAlertedAt.get(key) || 0) < ALERT_DEDUPE_MS) return null;
    this.nukeAlertedAt.set(key, Date.now());
    return this.createIncident(client, {
      guild,
      userId: actorId,
      category: "anti_nuke",
      summary: "A member performed a burst of destructive server actions consistent with a nuke attempt.",
      details: {
        detectionReason: evaluation.reason,
        countInWindow: evaluation.count,
        windowSeconds: 20,
        actionType: kind,
        actionCounts: JSON.stringify(evaluation.counts),
        auditReason: entry.reason || "No audit-log reason provided"
      }
    });
  }

  async recordPrivilegeEscalation(client, guild, targetId, kind, auditType, permissionNames = []) {
    if (!guild || !targetId) return null;
    await new Promise((resolve) => setTimeout(resolve, 800));
    let entry;
    try {
      const logs = await guild.fetchAuditLogs({ type: auditType, limit: 10 });
      entry = logs.entries.find((item) =>
        item.target?.id === targetId && Date.now() - item.createdTimestamp < 15000 &&
        !this.processedAuditIds.has(item.id)
      );
    } catch (error) {
      log("warn", "Could not attribute a high-impact permission change.", {
        guildId: guild.id, targetId, kind, message: error.message
      });
      return null;
    }
    if (!entry) return null;
    this.processedAuditIds.set(entry.id, Date.now());
    const actorId = entry.executor?.id;
    if (!actorId || actorId === client.user?.id) return null;
    return this.createIncident(client, {
      guild,
      userId: actorId,
      category: "anti_nuke",
      summary: "A member granted high-impact permissions to a role or channel access rule.",
      details: {
        detectionReason: "privilege_escalation",
        countInWindow: 1,
        windowSeconds: 15,
        actionType: kind,
        changedFields: permissionNames.join(", "),
        auditReason: entry.reason || "No audit-log reason provided"
      }
    });
  }

  async handleAlertInteraction(interaction, client) {
    const parts = interaction.customId.split(":");
    const incidentId = parts[1], guildId = parts[2];
    const targetId = parts[3] === "unknown" ? null : parts[3];
    const action = parts[4];
    const guild = interaction.guild || client.guilds.cache.get(guildId) ||
      await client.guilds.fetch(guildId).catch(() => null);
    if (!guild || (interaction.guildId && interaction.guildId !== guildId) ||
        !await this.hasAdminAccess(guild, interaction.user.id)) {
      return interaction.reply({
        content: "Only the server owner, bot owner, or configured Admin Role can manage these private security actions.",
        flags: MessageFlags.Ephemeral
      });
    }
    const incident = await this.pool.query(
      "SELECT id, user_id, category, details FROM security_incidents WHERE id=$1 AND guild_id=$2",
      [incidentId, guildId]
    );
    if (!incident.rowCount) {
      return interaction.reply({ content: "This security incident could not be found.", flags: MessageFlags.Ephemeral });
    }
    const category = incident.rows[0].category || "security";
    if (["anti_nuke", "anti_raid"].includes(category)) {
      return interaction.reply({
        content: "This Fukishōkai security incident is alert-only. No moderation or server-setting actions are available from security alerts.",
        flags: MessageFlags.Ephemeral
      });
    }
    let resultText = "The incident was acknowledged. No further action was taken.";

    if (category.startsWith("economy_") && ["exclude-leaderboard", "pause-1h", "block"].includes(action)) {
      if (!category.startsWith("economy_") || !targetId || incident.rows[0].user_id !== targetId ||
          !isSevereEconomyIncident(category, incident.rows[0].details || {})) {
        return interaction.reply({ content: "This action is available only for a severe, verified economy incident with a matching member.", flags: MessageFlags.Ephemeral });
      }
      if (this.isProtectedKingTarget(targetId)) {
        return interaction.reply({ content: "Fukishōkai King accounts cannot be targeted by economy controls.", flags: MessageFlags.Ephemeral });
      }
      if (action === "exclude-leaderboard") {
        await this.pool.query(
          "INSERT INTO leaderboard_exclusions (guild_id, user_id, excluded_by, reason) VALUES ($1, $2, $3, $4) " +
          "ON CONFLICT (guild_id, user_id) DO UPDATE SET excluded_by=EXCLUDED.excluded_by, reason=EXCLUDED.reason, created_at=NOW()",
          [guildId, targetId, interaction.user.id, "Confirmed economy integrity review · incident #" + incidentId + " (" + category + ")"]
        );
        resultText = "The member was excluded from Fukishōkai leaderboards. Their wallet, bank, levels and inventory were not changed.";
      } else {
        const expires = action === "pause-1h" ? new Date(Date.now() + 60 * 60 * 1000) : null;
        await this.pool.query(
          "INSERT INTO bot_user_restrictions (guild_id, user_id, expires_at, reason, created_by) VALUES ($1, $2, $3, $4, $5) " +
          "ON CONFLICT (guild_id, user_id) DO UPDATE SET expires_at=EXCLUDED.expires_at, reason=EXCLUDED.reason, created_by=EXCLUDED.created_by, updated_at=NOW()",
          [guildId, targetId, expires, "Owner-approved economy integrity control · incident #" + incidentId, interaction.user.id]
        );
        resultText = action === "pause-1h"
          ? "Fukishōkai bot access was paused for one hour. This does not affect Discord server permissions."
          : "Fukishōkai bot access was blocked until an owner removes the restriction. This does not affect Discord server permissions.";
      }
    } else if (action === "ban" || action === "kick" || action === "timeout") {
      if (!targetId || incident.rows[0].user_id !== targetId) {
        return interaction.reply({ content: "This incident has no matching target.", flags: MessageFlags.Ephemeral });
      }
      if (await this.isAboveBotRole(guild, targetId)) {
        return interaction.reply({ content: "No action was taken because the target is exempt by owner/trusted-role or role hierarchy.", flags: MessageFlags.Ephemeral });
      }
      const [member, botMember] = await Promise.all([
        guild.members.fetch(targetId),
        guild.members.me ? Promise.resolve(guild.members.me) : guild.members.fetchMe()
      ]);
      if (action === "ban") {
        if (!botMember.permissions.has(PermissionFlagsBits.BanMembers) || !member.bannable) {
          throw new Error("The bot cannot ban this member. Check Ban Members permission and role hierarchy.");
        }
        await member.ban({
          reason: "Owner-approved response to Fukishōkai security incident #" + incidentId,
          deleteMessageSeconds: 0
        });
        resultText = "The suspected actor was banned from the server following your approval.";
      } else if (action === "kick") {
        if (!botMember.permissions.has(PermissionFlagsBits.KickMembers) || !member.kickable) {
          throw new Error("The bot cannot kick this member. Check Kick Members permission and role hierarchy.");
        }
        await member.kick("Owner-approved response to Fukishōkai security incident #" + incidentId);
        resultText = "The suspected actor was kicked from the server following your approval.";
      } else {
        if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers) || !member.moderatable) {
          throw new Error("The bot cannot timeout this member. Check Moderate Members permission and role hierarchy.");
        }
        await member.timeout(10 * 60 * 1000, "Owner-approved response to Fukishōkai security incident #" + incidentId);
        resultText = "The suspected actor was timed out for 10 minutes following your approval.";
      }
    } else if (action === "pause" || action === "block" || action === "unblock") {
      if (!targetId || incident.rows[0].user_id !== targetId) {
        return interaction.reply({ content: "This alert has no valid target for a bot-access restriction.", flags: MessageFlags.Ephemeral });
      }
      if (action === "unblock") {
        await this.pool.query("DELETE FROM bot_user_restrictions WHERE guild_id=$1 AND user_id=$2", [guildId, targetId]);
        resultText = "Fukishōkai bot access has been restored for the selected member.";
      } else {
        const expires = action === "pause" ? new Date(Date.now() + 600000) : null;
        await this.pool.query(
          "INSERT INTO bot_user_restrictions (guild_id, user_id, expires_at, reason, created_by) VALUES ($1, $2, $3, $4, $5) " +
          "ON CONFLICT (guild_id, user_id) DO UPDATE SET expires_at=EXCLUDED.expires_at, reason=EXCLUDED.reason, created_by=EXCLUDED.created_by, updated_at=NOW()",
          [guildId, targetId, expires, "Owner-approved security restriction from incident #" + incidentId, interaction.user.id]
        );
        resultText = action === "pause"
          ? "Fukishōkai access was paused for 10 minutes."
          : "Fukishōkai access was blocked until an owner restores it.";
      }
    } else if (action !== "ignore") {
      return interaction.reply({ content: "Unknown security action.", flags: MessageFlags.Ephemeral });
    }

    const status = action === "ignore" ? "acknowledged" :
      action === "exclude-leaderboard" ? "excluded_from_leaderboards" :
      action === "pause-1h" ? "bot_access_paused_1h" :
      action === "block" ? "bot_access_blocked" :
      action === "ban" ? "actor_banned" : action === "kick" ? "actor_kicked" :
      action === "timeout" ? "actor_timed_out" :
      action === "pause" ? "restricted_10m" : action === "block" ? "blocked_from_bot" : "bot_access_restored";
    await this.pool.query(
      "UPDATE security_incidents SET status=$2, updated_by=$3, updated_at=NOW() WHERE id=$1",
      [incidentId, status, interaction.user.id]
    );
    await this.pool.query(
      "INSERT INTO audit_logs (guild_id, actor_id, action, target_id, details) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [guildId, interaction.user.id, "security_alert_" + status, targetId, JSON.stringify({ incidentId, category })]
    ).catch((error) => log("warn", "Could not audit owner security action", { message: error.message }));
    const embed = interaction.message?.embeds?.[0]
      ? EmbedBuilder.from(interaction.message.embeds[0]).addFields({ name: "Action taken", value: resultText.slice(0, 1000) })
      : new EmbedBuilder().setTitle("Security action completed").setDescription(resultText);
    return interaction.update({ embeds: [embed], components: [] });
  }
}

module.exports = { SecurityService, isSevereEconomyIncident, evaluateNukeBurst, evaluateInviteBurst };
