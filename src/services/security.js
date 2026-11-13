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
    if (userId && !["anti_nuke", "anti_raid"].includes(input.category) &&
        await this.isAboveBotRole(guild, userId)) return null;
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
      await this.pool.query(
        "UPDATE security_incidents SET details = details || $2::jsonb WHERE id=$1",
        [incidentId, JSON.stringify({
          quarantineApplied: detailsInput.quarantineApplied,
          quarantinedRoleCount: detailsInput.quarantinedRoleCount,
          quarantineError: detailsInput.quarantineError || null
        })]
      ).catch((error) => log("warn", "Could not append anti-nuke containment result to incident", {
        guildId: guild.id, incidentId, message: error.message
      }));
    }

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

  async quarantineNuker(guild, userId, incidentId) {
    try {
      if (await this.isAboveBotRole(guild, userId)) return { applied: false, roleIds: [] };
      const [member, botMember] = await Promise.all([
        guild.members.fetch(userId),
        guild.members.me ? Promise.resolve(guild.members.me) : guild.members.fetchMe()
      ]);
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return { applied: false, roleIds: [], error: "The bot is missing Manage Roles." };
      }
      const dangerousPermissions = [
        PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ManageMessages
      ];
      const roleIds = member.roles.cache
        .filter((role) => role.id !== guild.id && role.editable &&
          dangerousPermissions.some((permission) => role.permissions.has(permission)))
        .map((role) => role.id);
      if (!roleIds.length) return { applied: false, roleIds: [], error: "No removable privileged roles were found." };
      const saved = await this.pool.query(
        "INSERT INTO security_quarantines (guild_id, user_id, incident_id, role_ids, status, reason) " +
        "VALUES ($1, $2, $3, $4::jsonb, 'pending', $5) RETURNING id",
        [guild.id, userId, incidentId, JSON.stringify(roleIds), "Automated anti-nuke containment"]
      );
      await member.roles.remove(roleIds, "Fukishōkai anti-nuke containment · incident #" + incidentId);
      await this.pool.query("UPDATE security_quarantines SET status='active' WHERE id=$1", [saved.rows[0].id]);
      this.clearHierarchyCache();
      return { applied: true, roleIds };
    } catch (error) {
      log("error", "Anti-nuke role quarantine failed", { guildId: guild.id, userId, incidentId, message: error.message });
      return { applied: false, roleIds: [], error: String(error.message || error).slice(0, 180) };
    }
  }

  async restoreQuarantineRoles(guild, userId, incidentId, actorId) {
    const saved = await this.pool.query(
      "SELECT id, role_ids FROM security_quarantines WHERE guild_id=$1 AND user_id=$2 AND incident_id=$3 AND status='active' ORDER BY created_at DESC LIMIT 1",
      [guild.id, userId, incidentId]
    );
    if (!saved.rowCount) throw new Error("No active role quarantine was found for this incident.");
    const member = await guild.members.fetch(userId);
    const ids = Array.isArray(saved.rows[0].role_ids) ? saved.rows[0].role_ids : JSON.parse(saved.rows[0].role_ids || "[]");
    const restorable = ids.filter((id) => {
      const role = guild.roles.cache.get(id);
      return role && role.editable;
    });
    if (restorable.length) await member.roles.add(restorable, "Owner-approved role restoration for incident #" + incidentId);
    await this.pool.query(
      "UPDATE security_quarantines SET status='restored', restored_by=$2, restored_at=NOW() WHERE id=$1",
      [saved.rows[0].id, actorId]
    );
    this.clearHierarchyCache();
    return { restored: restorable.length, missing: ids.length - restorable.length };
  }

  async activateRaidLockdown(guild, durationMs = 30 * 60 * 1000, actorId = "AUTO_SECURITY", reason = "Anti-raid protection") {
    const botMember = guild.members.me || await guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
      throw new Error("The bot requires Manage Server permission to change the verification level.");
    }
    const current = await this.pool.query(
      "SELECT previous_verification_level, lockdown_until FROM guild_security_state WHERE guild_id=$1",
      [guild.id]
    );
    const active = current.rowCount && current.rows[0].lockdown_until &&
      new Date(current.rows[0].lockdown_until).getTime() > Date.now();
    const previousLevel = active
      ? Number(current.rows[0].previous_verification_level)
      : Number(guild.verificationLevel || 0);
    await guild.edit({ verificationLevel: 4 }, reason + " · actor " + actorId);
    const until = new Date(Date.now() + durationMs);
    await this.pool.query(
      "INSERT INTO guild_security_state (guild_id, previous_verification_level, lockdown_until, lockdown_reason) " +
      "VALUES ($1, $2, $3, $4) ON CONFLICT (guild_id) DO UPDATE SET " +
      "previous_verification_level = CASE WHEN guild_security_state.lockdown_until IS NOT NULL " +
      "AND guild_security_state.lockdown_until > NOW() THEN guild_security_state.previous_verification_level " +
      "ELSE EXCLUDED.previous_verification_level END, lockdown_until=EXCLUDED.lockdown_until, " +
      "lockdown_reason=EXCLUDED.lockdown_reason, updated_at=NOW()",
      [guild.id, previousLevel, until, reason]
    );
    return { applied: true, previousLevel, until };
  }

  async releaseRaidLockdown(guild, actorId = "AUTO_SECURITY", reason = "Raid lockdown released") {
    const current = await this.pool.query(
      "SELECT previous_verification_level, lockdown_until FROM guild_security_state WHERE guild_id=$1",
      [guild.id]
    );
    if (!current.rowCount || !current.rows[0].lockdown_until) {
      return { released: false, message: "No active automatic lockdown was recorded." };
    }
    const previousLevel = Number(current.rows[0].previous_verification_level || 0);
    if (Number(guild.verificationLevel) === 4) {
      await guild.edit({ verificationLevel: previousLevel }, reason + " · actor " + actorId);
    }
    await this.pool.query(
      "UPDATE guild_security_state SET previous_verification_level=NULL, lockdown_until=NULL, lockdown_reason=NULL, updated_at=NOW() WHERE guild_id=$1",
      [guild.id]
    );
    return { released: true, previousLevel };
  }

  async recordMemberJoin(client, member) {
    const guild = member.guild;
    if (!guild?.id || !member.user) return null;
    const now = Date.now();
    const joins = (this.raidJoins.get(guild.id) || []).filter((entry) => now - entry.joinedAt <= 20000);
    joins.push({
      joinedAt: now,
      accountAgeMs: Math.max(0, now - Number(member.user.createdTimestamp || now))
    });
    this.raidJoins.set(guild.id, joins);
    const evaluation = evaluateRaidBurst(joins, now);
    if (!evaluation.triggered || now - (this.raidAlertedAt.get(guild.id) || 0) < ALERT_DEDUPE_MS) return null;
    this.raidAlertedAt.set(guild.id, now);
    let lockdown = null;
    try {
      lockdown = await this.activateRaidLockdown(
        guild, 15 * 60 * 1000, "AUTO_SECURITY", "Automated anti-raid join burst"
      );
    } catch (error) {
      log("error", "Could not activate automatic raid lockdown", { guildId: guild.id, message: error.message });
    }
    return this.createIncident(client, {
      guild,
      category: "anti_raid",
      summary: "A rapid join burst crossed the configured anti-raid threshold.",
      details: {
        joinsInWindow: evaluation.joins,
        youngAccounts: evaluation.youngAccounts,
        accountAgeThreshold: "7 days",
        windowSeconds: evaluation.windowSeconds,
        lockdownApplied: Boolean(lockdown?.applied),
        verificationLevel: lockdown?.applied ? "Very High" : "Unchanged"
      }
    });
  }

  async processExpiredRaidLockdowns(client) {
    const due = await this.pool.query(
      "SELECT guild_id, previous_verification_level FROM guild_security_state WHERE lockdown_until IS NOT NULL AND lockdown_until <= NOW()"
    );
    for (const row of due.rows || []) {
      try {
        const guild = client.guilds.cache.get(row.guild_id) || await client.guilds.fetch(row.guild_id);
        if (Number(guild.verificationLevel) === 4) {
          await guild.edit(
            { verificationLevel: Number(row.previous_verification_level || 0) },
            "Fukishōkai automatic raid lockdown expired"
          );
        }
        await this.pool.query(
          "UPDATE guild_security_state SET previous_verification_level=NULL, lockdown_until=NULL, lockdown_reason=NULL, updated_at=NOW() WHERE guild_id=$1",
          [row.guild_id]
        );
      } catch (error) {
        log("warn", "Could not restore expired raid verification level", {
          guildId: row.guild_id, message: error.message
        });
      }
    }
  }

  startMaintenance(client) {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    this.processExpiredRaidLockdowns(client)
      .catch((error) => log("warn", "Security maintenance failed", { message: error.message }));
    this.maintenanceTimer = setInterval(() => {
      this.processExpiredRaidLockdowns(client)
        .catch((error) => log("warn", "Security maintenance failed", { message: error.message }));
    }, 60000);
    if (typeof this.maintenanceTimer.unref === "function") this.maintenanceTimer.unref();
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
    if (!actorId || actorId === client.user?.id || await this.isAboveBotRole(guild, actorId)) return null;
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
    if (!actorId || actorId === client.user?.id || await this.isAboveBotRole(guild, actorId)) return null;
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
      "SELECT id, user_id FROM security_incidents WHERE id=$1 AND guild_id=$2",
      [incidentId, guildId]
    );
    if (!incident.rowCount) {
      return interaction.reply({ content: "This security incident could not be found.", flags: MessageFlags.Ephemeral });
    }
    const category = incident.rows[0].category || "security";
    let resultText = "The incident was acknowledged. No further action was taken.";

    if (action === "raid-lockdown") {
      await this.activateRaidLockdown(guild, 30 * 60 * 1000, interaction.user.id, "Owner-approved raid lockdown");
      resultText = "Server verification was raised to Very High for 30 minutes. The previous setting is saved for restoration.";
    } else if (action === "raid-release") {
      const released = await this.releaseRaidLockdown(guild, interaction.user.id, "Owner-approved raid lockdown release");
      resultText = released.released
        ? "The raid lockdown was ended. The previous verification level was restored unless a server administrator had changed it manually."
        : released.message;
    } else if (action === "restore-roles") {
      if (!targetId || incident.rows[0].user_id !== targetId) {
        return interaction.reply({ content: "This incident has no matching quarantined member.", flags: MessageFlags.Ephemeral });
      }
      const restored = await this.restoreQuarantineRoles(guild, targetId, incidentId, interaction.user.id);
      resultText = "Role restoration completed: " + restored.restored + " role(s) restored; " +
        restored.missing + " role(s) no longer exist or are no longer manageable.";
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
      action === "raid-lockdown" ? "raid_lockdown_enabled" :
      action === "raid-release" ? "raid_lockdown_released" :
      action === "restore-roles" ? "roles_restored" :
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

module.exports = { SecurityService, getAutomaticEconomyRestriction, evaluateNukeBurst, evaluateRaidBurst };
