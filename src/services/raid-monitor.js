"use strict";

const { PermissionFlagsBits } = require("discord.js");

const JOIN_WINDOW_MS = 30_000;
const RECENT_JOIN_WINDOW_MS = 60_000;
const NEW_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_JOIN_BURST = 5;
const MIN_NEW_ACCOUNT_BURST = 3;
const ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_EVIDENCE_JOINERS = 12;

function emptySnapshot(reason) {
  return {
    invites: new Map(),
    invitesAvailable: false,
    vanity: null,
    vanityAvailable: false,
    reason: reason || "Invite usage counters are unavailable."
  };
}

function accountCreatedTimestamp(user) {
  const timestamp = Number(user?.createdTimestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  const dateTimestamp = user?.createdAt instanceof Date ? user.createdAt.getTime() : NaN;
  return Number.isFinite(dateTimestamp) && dateTimestamp > 0 ? dateTimestamp : null;
}

function formatAccountAge(ageMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "unknown";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return minutes + "m";
  const hours = Math.floor(ageMs / 3_600_000);
  if (hours < 24) return hours + "h";
  const days = Math.floor(ageMs / 86_400_000);
  if (days < 30) return days + "d";
  return Math.floor(days / 30) + "mo";
}

function evaluateJoinBurst(events = [], now = Date.now()) {
  const recent = events.filter((event) => now - event.joinedAt <= RECENT_JOIN_WINDOW_MS);
  const rapid = recent.filter((event) => now - event.joinedAt <= JOIN_WINDOW_MS);
  const newAccounts = recent.filter((event) =>
    Number.isFinite(event.accountAgeMs) && event.accountAgeMs <= NEW_ACCOUNT_AGE_MS
  );
  return {
    triggered: rapid.length >= MIN_JOIN_BURST || newAccounts.length >= MIN_NEW_ACCOUNT_BURST,
    joinsIn30Seconds: rapid.length,
    joinsIn60Seconds: recent.length,
    newAccountsIn60Seconds: newAccounts.length,
    recent
  };
}

function compareInviteSnapshots(previous, current) {
  if (!previous || !current) {
    return { type: "unknown", reason: "The invite baseline was not ready when this member joined." };
  }
  if (!previous.invitesAvailable || !current.invitesAvailable ||
      !previous.vanityAvailable || !current.vanityAvailable) {
    return {
      type: "unknown",
      reason: current.reason || previous.reason ||
        "Invite and vanity usage could not both be checked. Grant the bot Manage Server permission to identify sources."
    };
  }

  const changed = [];
  for (const [code, invite] of current.invites) {
    const prior = previous.invites.get(code);
    const oldUses = prior && Number.isFinite(prior.uses) ? prior.uses : 0;
    if (!Number.isFinite(invite.uses) || invite.uses <= oldUses) continue;
    changed.push({
      type: "invite",
      code,
      delta: invite.uses - oldUses,
      inviterId: invite.inviterId || null,
      inviterTag: invite.inviterTag || null
    });
  }

  const oldVanity = previous.vanity;
  const newVanity = current.vanity;
  if (newVanity?.code && Number.isFinite(newVanity.uses)) {
    const oldUses = oldVanity?.code === newVanity.code && Number.isFinite(oldVanity.uses)
      ? oldVanity.uses
      : 0;
    if (newVanity.uses > oldUses) {
      changed.push({
        type: "vanity",
        code: newVanity.code,
        delta: newVanity.uses - oldUses,
        inviterId: null,
        inviterTag: null
      });
    }
  }

  if (changed.length === 1) return changed[0];
  if (changed.length > 1) {
    return {
      type: "unknown",
      reason: "Multiple invite counters increased between checks; the exact source for this join is ambiguous."
    };
  }
  return {
    type: "unknown",
    reason: "No invite-use increase could be matched to this join. The source may be delayed, expired, or unavailable."
  };
}

function sourceLabel(source) {
  if (!source || source.type === "unknown") {
    return "Unknown — " + String(source?.reason || "Discord did not expose a matching invite counter.");
  }
  if (source.type === "vanity") {
    return "Vanity URL discord.gg/" + source.code + " (no individual inviter is provided for vanity links)";
  }
  const creator = source.inviterId
    ? (source.inviterTag || "unknown name") + " (ID " + source.inviterId + ")"
    : "creator unavailable from Discord";
  return "Invite " + source.code + " — created by " + creator;
}

function summarizeSources(events) {
  const grouped = new Map();
  for (const event of events) {
    const label = sourceLabel(event.source);
    grouped.set(label, (grouped.get(label) || 0) + 1);
  }
  return Array.from(grouped, ([label, count]) => count + " join(s): " + label).join("\n").slice(0, 900);
}

function summarizeJoiners(events) {
  return events.slice(-MAX_EVIDENCE_JOINERS).map((event) =>
    event.username + " (ID " + event.userId + ") — account age " +
    formatAccountAge(event.accountAgeMs) + (event.isBot ? " — bot account" : "") +
    " — " + sourceLabel(event.source)
  ).join("\n").slice(0, 1400);
}

class RaidMonitor {
  constructor(options = {}) {
    if (!options.security) throw new TypeError("RaidMonitor requires the SecurityService.");
    this.security = options.security;
    this.clock = typeof options.clock === "function" ? options.clock : Date.now;
    this.snapshotFetcher = typeof options.snapshotFetcher === "function"
      ? options.snapshotFetcher
      : (guild) => this.fetchInviteSnapshot(guild);
    this.snapshots = new Map();
    this.initializations = new Map();
    this.joinEvents = new Map();
    this.pendingSources = new Map();
    this.queues = new Map();
    this.lastAlertAt = new Map();
    this.warned = new Set();
    this.logger = options.logger || console;
  }

  warnOnce(key, message, error) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.logger.warn(message, error?.message || "");
  }

  async fetchInviteSnapshot(guild) {
    const canManageGuild = Boolean(guild.members?.me?.permissions?.has(PermissionFlagsBits.ManageGuild));
    if (!canManageGuild) {
      return emptySnapshot("The bot lacks Manage Server permission, so invite-use and vanity-use counters cannot be read.");
    }

    const snapshot = emptySnapshot();
    const [inviteResult, vanityResult] = await Promise.allSettled([
      guild.invites.fetch({ cache: false }),
      guild.fetchVanityData()
    ]);

    if (inviteResult.status === "fulfilled") {
      let metadataComplete = true;
      for (const invite of inviteResult.value.values()) {
        const uses = Number(invite.uses);
        if (!Number.isFinite(uses)) {
          metadataComplete = false;
          continue;
        }
        snapshot.invites.set(invite.code, {
          code: invite.code,
          uses,
          inviterId: invite.inviter?.id || null,
          inviterTag: invite.inviter?.tag || invite.inviter?.username || null
        });
      }
      snapshot.invitesAvailable = metadataComplete;
      if (!metadataComplete) snapshot.reason = "Discord returned invites without complete use-count metadata.";
    } else {
      this.warnOnce(guild.id + ":invites", "[raid-monitor] Could not fetch invite usage for guild " + guild.id + ".", inviteResult.reason);
      snapshot.reason = "Invite usage could not be fetched. Check Manage Server permission.";
    }

    if (vanityResult.status === "fulfilled") {
      const vanity = vanityResult.value;
      snapshot.vanity = vanity?.code && Number.isFinite(Number(vanity.uses))
        ? { code: vanity.code, uses: Number(vanity.uses) }
        : null;
      snapshot.vanityAvailable = true;
    } else if (!guild.vanityURLCode) {
      snapshot.vanityAvailable = true;
      snapshot.vanity = null;
    } else {
      this.warnOnce(guild.id + ":vanity", "[raid-monitor] Could not fetch vanity usage for guild " + guild.id + ".", vanityResult.reason);
      snapshot.reason = "Vanity usage could not be fetched. Check Manage Server permission.";
    }
    return snapshot;
  }

  async initializeGuild(guild) {
    if (!guild?.id) return null;
    if (this.initializations.has(guild.id)) return this.initializations.get(guild.id);
    const task = Promise.resolve()
      .then(() => this.snapshotFetcher(guild))
      .then((snapshot) => {
        this.snapshots.set(guild.id, snapshot);
        return snapshot;
      })
      .catch((error) => {
        this.warnOnce(guild.id + ":initial", "[raid-monitor] Could not establish invite baseline for guild " + guild.id + ".", error);
        const snapshot = emptySnapshot("The startup invite baseline could not be established.");
        this.snapshots.set(guild.id, snapshot);
        return snapshot;
      });
    this.initializations.set(guild.id, task);
    return task;
  }

  async resolveSource(guild) {
    const pending = this.pendingSources.get(guild.id) || [];
    if (pending.length) {
      const source = pending.shift();
      this.pendingSources.set(guild.id, pending);
      return source;
    }

    if (!this.snapshots.has(guild.id)) {
      await this.initializeGuild(guild);
      return { type: "unknown", reason: "The invite baseline was initialized after this join; the source cannot be matched retroactively." };
    }

    const previous = this.snapshots.get(guild.id);
    let current;
    try {
      current = await this.snapshotFetcher(guild);
    } catch (error) {
      this.warnOnce(guild.id + ":refresh", "[raid-monitor] Could not refresh invite usage for guild " + guild.id + ".", error);
      return { type: "unknown", reason: "The bot could not refresh invite usage after the join." };
    }
    this.snapshots.set(guild.id, current);

    const source = compareInviteSnapshots(previous, current);
    if (source.type !== "unknown" && source.delta > 1) {
      this.pendingSources.set(guild.id, Array.from(
        { length: Math.min(source.delta - 1, 20) },
        () => ({ ...source })
      ));
    }
    return source;
  }

  async handleMemberJoin(member, client) {
    const guild = member?.guild;
    if (!guild?.id || !member.user) return null;
    const previous = this.queues.get(guild.id) || Promise.resolve();
    const current = previous.then(() => this.processMemberJoin(member, client));
    this.queues.set(guild.id, current.catch(() => null));
    return current;
  }

  async processMemberJoin(member, client) {
    const guild = member.guild;
    const now = this.clock();
    const source = await this.resolveSource(guild);
    const createdAt = accountCreatedTimestamp(member.user);
    const accountAgeMs = createdAt === null ? null : Math.max(0, now - createdAt);
    const username = String(member.user.tag || member.user.username || member.user.globalName || member.user.id)
      .replace(/[\r\n<>]/g, "").slice(0, 80);
    const event = {
      userId: member.user.id,
      username,
      joinedAt: now,
      accountAgeMs,
      isBot: Boolean(member.user.bot),
      source
    };
    const recent = (this.joinEvents.get(guild.id) || [])
      .filter((entry) => now - entry.joinedAt <= RECENT_JOIN_WINDOW_MS);
    recent.push(event);
    this.joinEvents.set(guild.id, recent);

    const evaluation = evaluateJoinBurst(recent, now);
    if (!evaluation.triggered || now - (this.lastAlertAt.get(guild.id) || 0) < ALERT_COOLDOWN_MS) {
      return { event, evaluation, alerted: false };
    }

    this.lastAlertAt.set(guild.id, now);
    const summary = evaluation.newAccountsIn60Seconds >= MIN_NEW_ACCOUNT_BURST
      ? "A rapid member-join burst included " + evaluation.newAccountsIn60Seconds +
        " accounts created within the last 7 days. Review the detected invite sources below."
      : "A rapid member-join burst reached " + evaluation.joinsIn30Seconds +
        " joins in 30 seconds. Review the detected invite sources and account ages below.";
    const details = {
      joinsIn30Seconds: evaluation.joinsIn30Seconds,
      joinsIn60Seconds: evaluation.joinsIn60Seconds,
      newAccountsIn60Seconds: evaluation.newAccountsIn60Seconds,
      newAccountAgeDays: 7,
      joinWindowSeconds: 30,
      newAccountWindowSeconds: 60,
      inviteSourceSummary: summarizeSources(evaluation.recent),
      recentJoiners: summarizeJoiners(evaluation.recent)
    };
    const incidentId = await this.security.createIncident(client, {
      guild,
      userId: null,
      category: "anti_raid",
      summary,
      details
    });
    return { event, evaluation, alerted: Boolean(incidentId), incidentId };
  }
}

module.exports = {
  RaidMonitor,
  JOIN_WINDOW_MS,
  RECENT_JOIN_WINDOW_MS,
  NEW_ACCOUNT_AGE_MS,
  MIN_JOIN_BURST,
  MIN_NEW_ACCOUNT_BURST,
  accountCreatedTimestamp,
  formatAccountAge,
  evaluateJoinBurst,
  compareInviteSnapshots,
  sourceLabel,
  summarizeSources,
  summarizeJoiners
};
