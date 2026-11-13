const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const settings = require("../config/settings");
const { log } = require("../utils/logging");

const WINDOW_MS = 120000;
const ALERT_DEDUPE_MS = 600000;

function getAutomaticEconomyRestriction(category, details = {}) {
  if (category === "economy_direct_balance_change") {
    return { minutes: 24 * 60, label: "24-hour Fukishōkai access lock", reason: "Verified player economy data changed outside a bot transaction" };
  }
  if (category === "economy_invalid_payout") {
    return { minutes: 60, label: "1-hour Fukishōkai access lock", reason: "A casino payout failed verification against its recorded wager" };
  }
  if (category === "economy_reward_burst" && Number(details.riskScore) >= 100) {
    return { minutes: 30, label: "30-minute Fukishōkai access lock", reason: "Reward activity exceeded the hard per-minute economy threshold" };
  }
  return null;
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

function evaluateRaidBurst(joins = [], now = Date.now()) {
  const recent = joins.filter((join) => now - Number(join.joinedAt || 0) <= 20000);
  const youngAccounts = recent.filter((join) => Number(join.accountAgeMs) < 7 * 24 * 60 * 60 * 1000).length;
  return { triggered: recent.length >= 8 || (recent.length >= 6 && youngAccounts >= 4), joins: recent.length, youngAccounts, windowSeconds: 20 };
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
    this.raidJoins = new Map();
    this.raidAlertedAt = new Map();
    this.maintenanceTimer = null;
  }

  isOwner(userId, guildOwnerId) {
    return Boolean(userId && (userId === guildOwnerId || (settings.ownerId && userId === settings.ownerId)));
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
    if (userId && await this.isAboveBotRole(guild, userId)) return null;
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

    const automaticPolicy = userId ? getAutomaticEconomyRestriction(input.category, input.details || {}) : null;
    let automaticAction = null;
    if (automaticPolicy) {
      const expiresAt = new Date(Date.now() + automaticPolicy.minutes * 60 * 1000);
      try {
        await this.pool.query(
          "INSERT INTO bot_user_restrictions (guild_id, user_id, expires_at, reason, created_by) VALUES ($1, $2, $3, $4, $5) " +
          "ON CONFLICT (guild_id, user_id) DO UPDATE SET " +
          "expires_at = CASE WHEN bot_user_restrictions.expires_at IS NULL THEN NULL " +
          "WHEN bot_user_restrictions.expires_at > EXCLUDED.expires_at THEN bot_user_restrictions.expires_at ELSE EXCLUDED.expires_at END, " +
          "reason = CASE WHEN bot_user_restrictions.expires_at IS NULL THEN bot_user_restrictions.reason ELSE EXCLUDED.reason END, " +
          "created_by = CASE WHEN bot_user_restrictions.expires_at IS NULL THEN bot_user_restrictions.created_by ELSE EXCLUDED.created_by END, " +
          "updated_at = NOW()",
          [guild.id, userId, expiresAt, automaticPolicy.reason + " (incident #" + incidentId + ")", "AUTO_SECURITY"]
        );
        automaticAction = automaticPolicy;
      } catch (error) {
        log("error", "Could not apply automatic economy restriction", { guildId: guild.id, userId, incidentId, message: error.message });
      }
    }

    const detailsInput = { ...(input.details || {}) };
    let quarantine = null;
    if (input.category === "anti_nuke" && userId) {
      quarantine = await this.quarantineNuker(guild, userId, incidentId);
      detailsInput.quarantineApplied = Boolean(quarantine?.applied);
      detailsInput.quarantinedRoleCount = Number(quarantine?.roleIds?.length || 0);
      if (quarantine?.error) detailsInput.quarantineError = quarantine.error;
    }

    // Urgent raid/nuke detections are sent immediately. Routine notices are
    // grouped per guild and limited by PostgreSQL across restarts and instances.
    let suppressedCount = 0;
    if (!["anti_nuke", "anti_raid"].includes(input.category)) {
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
      anti_raid: "Possible coordinated join raid",
      economy_tampering: "Rejected economy manipulation",
      economy_direct_balance_change: "Out-of-band balance or level edit",
      economy_invalid_payout: "Invalid casino payout",
      economy_reward_burst: "Unusual reward burst",
      economy_xp_manipulation: "Invalid XP award"
    };
    const detailLabels = {
      count: "Attempts observed", attemptsInWindow: "Attempts observed", countInWindow: "Actions observed",
      windowSeconds: "Time window", command: "Command used", actionType: "Server activity",
      auditReason: "Audit-log reason", riskScore: "Risk score", reasonCode: "Guard code",
      baseAmount: "Base reward", recentRewards: "Recent rewards", changedFields: "Changed fields",
      wager: "Wager", multiplier: "Payout multiplier", amount: "Attempted amount",
      detectionReason: "Detection reason", actionCounts: "Action counts",
      joinsInWindow: "New members joined", youngAccounts: "Accounts younger than seven days",
      accountAgeThreshold: "New-account threshold", lockdownApplied: "Automatic join lockdown",
      verificationLevel: "Verification level", quarantinedRoleCount: "Privileged roles removed",
      quarantineError: "Containment limitation"
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
    if (input.category === "anti_raid") {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":unknown:raid-lockdown").setLabel("Enable 30m lockdown").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":unknown:raid-release").setLabel("End lockdown").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":unknown:ignore").setLabel("Acknowledge").setStyle(ButtonStyle.Secondary)
      ));
    } else if (input.category === "anti_nuke" && userId) {
      const row = new ActionRowBuilder();
      if (quarantine?.applied) row.addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":restore-roles").setLabel("Restore removed roles").setStyle(ButtonStyle.Success)
      );
      row.addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":ban").setLabel("Ban attacker").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":kick").setLabel("Kick attacker").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":ignore").setLabel("Acknowledge").setStyle(ButtonStyle.Secondary)
      );
      components.push(row);
    } else if (userId && automaticAction) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":unblock").setLabel("Restore bot access").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":ignore").setLabel("Mark reviewed").setStyle(ButtonStyle.Secondary)
      ));
    } else if (userId) {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":pause").setLabel("Pause bot access · 10m").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":block").setLabel("Block bot access").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":timeout").setLabel("Timeout 10m").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":" + actionId + ":ignore").setLabel("Acknowledge").setStyle(ButtonStyle.Secondary)
      ));
    } else {
      components.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guild.id + ":unknown:ignore").setLabel("Acknowledge").setStyle(ButtonStyle.Secondary)
      ));
    }

    const softSignal = input.category === "economy_reward_burst" && Number(detailsInput.riskScore) < 100;
    const enforcement = input.category === "anti_nuke"
      ? (quarantine?.applied
        ? "Automated containment removed manageable high-risk roles from the suspected actor. The removed roles are saved and can be restored below. No ban or kick was applied automatically."
        : "The anti-nuke threshold was crossed, but the bot could not safely remove the actor's privileged roles. Review the actions below.")
      : input.category === "anti_raid"
        ? (detailsInput.lockdownApplied
          ? "Automated containment raised server verification to Very High for 15 minutes. The previous setting is saved for automatic restoration."
          : "The join burst was detected, but automatic verification lockdown could not be applied. The controls below can retry or end a lockdown.")
        : automaticAction
          ? "Automated enforcement: " + automaticAction.label + ". This affects Fukishōkai bot access only."
          : input.category.startsWith("economy_") && !softSignal
            ? "The invalid economy operation was rejected before player data could be changed."
            : softSignal ? "Monitoring only: no account restriction was applied." : "No automatic account restriction was applied.";
    const grouped = suppressedCount ? " " + suppressedCount + " additional security incident(s) were grouped into this notice." : "";
    const severity = ["anti_nuke", "anti_raid", "economy_direct_balance_change", "economy_invalid_payout"].includes(input.category) ? "High" : "Review";
    const recipients = Array.from(new Set([guild.ownerId, settings.ownerId].filter(Boolean)));
    let delivered = 0;
    for (const recipientId of recipients) {
      try {
        const recipient = await client.users.fetch(recipientId);
        const displayName = String(recipient.globalName || recipient.username || "Administrator").replace(/[\r\n<>]/g, "").slice(0, 64);
        const embed = new EmbedBuilder()
          .setColor(input.category.startsWith("anti_") ? settings.brand.danger : settings.brand.warning)
          .setAuthor({ name: "Fukishōkai Security Operations" })
          .setTitle(labels[input.category] || "Security Incident Notification")
          .setDescription(
            "Dear " + displayName + ",\n\n" +
            "This is an official security notification regarding **" + String(guild.name || "your Discord server").slice(0, 90) + "**. " +
            String(input.summary || "Security activity requires your attention.") + "\n\n" +
            "The automated security service has recorded the incident and taken the action described below. Please review the context and select an appropriate response."
          )
          .addFields(
            { name: "Server", value: String(guild.name || "Unknown server").slice(0, 100), inline: true },
            { name: "Severity", value: severity, inline: true },
            { name: "Incident", value: "#" + incidentId, inline: true },
            { name: "Incident context", value: details || "No additional event details were recorded." },
            { name: "Automated response", value: (enforcement + grouped).slice(0, 1000) }
          )
          .setFooter({ text: "Fukishōkai Security Operations · Confidential owner notice" })
          .setTimestamp(new Date());
        await recipient.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
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
    if (!actorId || actorId === client.user?.id) return;
    if (await this.isAboveBotRole(guild, actorId)) return;
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
    if (interaction.guildId !== guildId || !await this.hasAdminAccess(interaction.guild, interaction.user.id)) {
      return interaction.reply({ content: "Only the server owner, bot owner, or configured Admin Role can manage security alerts.", flags: MessageFlags.Ephemeral });
    }
    const incident = await this.pool.query(
      "SELECT id, user_id FROM security_incidents WHERE id = $1 AND guild_id = $2",
      [incidentId, guildId]
    );
    if (!incident.rowCount) return interaction.reply({ content: "This security incident could not be found.", flags: MessageFlags.Ephemeral });

    if (action === "pause" || action === "block" || action === "timeout") {
      if (!targetId || incident.rows[0].user_id !== targetId) {
        return interaction.reply({ content: "This alert has no valid target to restrict.", flags: MessageFlags.Ephemeral });
      }
      if (await this.isAboveBotRole(interaction.guild, targetId)) {
        return interaction.reply({
          content: "No action was taken. This member's highest role is above the bot's highest role, so they are excluded from bot security enforcement.",
          flags: MessageFlags.Ephemeral
        });
      }
      if (action === "timeout") {
        const member = await interaction.guild.members.fetch(targetId);
        const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers) || !member.moderatable) {
          return interaction.reply({
            content: "Discord did not allow the bot to timeout this member. Check Moderate Members permission and role hierarchy.",
            flags: MessageFlags.Ephemeral
          });
        }
        await member.timeout(10 * 60 * 1000, "Owner-approved response to security incident #" + incidentId);
      } else {
        const expires = action === "pause" ? new Date(Date.now() + 600000) : null;
        await this.pool.query(
          "INSERT INTO bot_user_restrictions (guild_id, user_id, expires_at, reason, created_by) VALUES ($1, $2, $3, $4, $5) " +
          "ON CONFLICT (guild_id, user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason, created_by = EXCLUDED.created_by, updated_at = NOW()",
          [guildId, targetId, expires, "Security restriction from incident #" + incidentId, interaction.user.id]
        );
      }
    } else if (action === "unblock") {
      if (!targetId) return interaction.reply({ content: "This alert has no valid target to unblock.", flags: MessageFlags.Ephemeral });
      await this.pool.query("DELETE FROM bot_user_restrictions WHERE guild_id = $1 AND user_id = $2", [guildId, targetId]);
    } else if (action !== "ignore") {
      return interaction.reply({ content: "Unknown security action.", flags: MessageFlags.Ephemeral });
    }

    const status = action === "ignore" ? "ignored" : action === "pause" ? "restricted_10m" : action === "block" ? "blocked_from_bot" : action === "timeout" ? "timed_out_10m" : "bot_access_restored";
    const ownerIsAboveBot = await this.isAboveBotRole(interaction.guild, interaction.user.id);
    await this.pool.query(
      "UPDATE security_incidents SET status = $2, updated_by = $3, updated_at = NOW() WHERE id = $1",
      [incidentId, status, ownerIsAboveBot ? null : interaction.user.id]
    );
    if (!ownerIsAboveBot) {
      await this.pool.query(
        "INSERT INTO audit_logs (guild_id, actor_id, action, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)",
        [guildId, interaction.user.id, "security_alert_" + status, targetId, JSON.stringify({ incidentId })]
      ).catch((error) => log("warn", "Could not audit security action", { message: error.message }));
    }

    const text = {
      ignored: "Alert #" + incidentId + " marked as reviewed. No action was taken.",
      restricted_10m: "<@" + targetId + "> cannot use the bot for 10 minutes. No server timeout was applied.",
      blocked_from_bot: "<@" + targetId + "> is blocked from this bot until an owner removes the restriction. No server timeout was applied.",
      bot_access_restored: "Bot access restored for <@" + targetId + ">.",
      timed_out_10m: "<@" + targetId + "> was timed out for 10 minutes by an owner-approved security action."
    };
    const followUpControls = (action === "pause" || action === "block") && targetId
      ? [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guildId + ":" + targetId + ":unblock")
            .setLabel("Restore bot access").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("security:" + incidentId + ":" + guildId + ":" + targetId + ":ignore")
            .setLabel("Mark alert reviewed").setStyle(ButtonStyle.Secondary)
        )]
      : [];
    return interaction.update({ content: text[status], embeds: interaction.message.embeds, components: followUpControls });
  }
}

module.exports = { SecurityService, getAutomaticEconomyRestriction };
