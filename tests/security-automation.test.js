"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const settings = require("../src/config/settings");
const {
  SecurityService,
  isSevereEconomyIncident,
  evaluateNukeBurst
} = require("../src/services/security");

test("only severe economy incidents qualify for owner notification and review actions", () => {
  assert.equal(isSevereEconomyIncident("economy_direct_balance_change"), false);
  assert.equal(isSevereEconomyIncident("economy_direct_balance_change", { mismatchCount: 1 }), false);
  assert.equal(isSevereEconomyIncident("economy_direct_balance_change", { mismatchCount: 2 }), true);
  assert.equal(isSevereEconomyIncident("economy_invalid_payout"), true);
  assert.equal(isSevereEconomyIncident("economy_reward_burst", { riskScore: 79 }), false);
  assert.equal(isSevereEconomyIncident("economy_reward_burst", { riskScore: 80 }), true);
  assert.equal(isSevereEconomyIncident("economy_tampering", { riskScore: 100 }), false);
  assert.equal(isSevereEconomyIncident("economy_tampering", { riskScore: 100, invalidAttempts: 2 }), false);
  assert.equal(isSevereEconomyIncident("economy_tampering", { riskScore: 100, invalidAttempts: 3 }), true);
  assert.equal(isSevereEconomyIncident("economy_xp_manipulation", { riskScore: 100 }), false);
  assert.equal(isSevereEconomyIncident("economy_xp_manipulation", { riskScore: 100, invalidAttempts: 3 }), true);
  assert.equal(isSevereEconomyIncident("command_spam", { riskScore: 100 }), false);
  assert.equal(isSevereEconomyIncident("anti_nuke", { riskScore: 100 }), false);
  assert.equal(isSevereEconomyIncident("anti_raid", { riskScore: 100 }), false);
});

test("anti-nuke thresholds require a destructive or mass-creation burst", () => {
  assert.equal(evaluateNukeBurst(["channel_delete", "channel_delete"]).triggered, false);
  assert.equal(evaluateNukeBurst(["channel_delete", "channel_delete", "role_delete"]).reason, "mass_asset_deletion");
  assert.equal(evaluateNukeBurst(["member_ban", "member_ban", "member_kick", "member_kick", "member_kick"]).reason, "mass_member_removal");
  assert.equal(evaluateNukeBurst(Array(8).fill("channel_create")).reason, "mass_asset_creation");
});

function makeService() {
  const sent = [];
  const restrictions = [];
  const queryCounts = { incidents: 0, throttle: 0 };
  const pool = {
    async query(sql, params) {
      if (sql.includes("INSERT INTO security_incidents")) {
        queryCounts.incidents += 1;
        return { rowCount: 1, rows: [{ id: String(queryCounts.incidents) }] };
      }
      if (sql.includes("INSERT INTO bot_user_restrictions")) {
        restrictions.push({ sql, params });
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("INSERT INTO security_priority_alert_state")) {
        return { rowCount: 1, rows: [{ last_notified_at: new Date() }] };
      }
      if (sql.includes("INSERT INTO security_alert_state")) {
        queryCounts.throttle += 1;
        return {
          rowCount: 1,
          rows: [{
            should_notify: queryCounts.throttle === 1,
            suppressed_count: queryCounts.throttle === 1 ? 0 : queryCounts.throttle - 1
          }]
        };
      }
      return { rowCount: 1, rows: [] };
    }
  };
  const service = new SecurityService(pool, {
    async get() { return null; }
  });
  service.isAboveBotRole = async () => false;
  const client = {
    users: {
      async fetch(id) {
        return {
          id,
          username: id === settings.kingIds[0] ? "hadeon" : (id === settings.kingIds[1] || id === "server-owner") ? "nico" : "brian",
          globalName: id === settings.kingIds[0] ? "Hadeon" : (id === settings.kingIds[1] || id === "server-owner") ? "Nico" : "Brian",
          async send(payload) { sent.push({ recipientId: id, payload }); }
        };
      }
    }
  };
  const guild = { id: "guild-1", name: "Fukishōkai", ownerId: "server-owner", members: {} };
  return { service, client, guild, sent, restrictions, queryCounts };
}

test("routine incidents are grouped and sent privately without mentions", async () => {
  const { service, client, guild, sent, queryCounts } = makeService();
  for (let i = 1; i <= 8; i += 1) {
    await service.createIncident(client, {
      guild,
      userId: "player-" + i,
      category: "command_spam",
      summary: "Repeated commands were rate-limited.",
      details: { reasonCode: "ECONOMY_DIRECTION_INVALID", riskScore: 100 }
    });
  }

  assert.equal(queryCounts.incidents, 8, "all incidents remain in the audit database");
  assert.equal(queryCounts.throttle, 8, "persistent per-guild notification throttle is checked");
  const settings = require("../src/config/settings");
  const expectedRecipients = new Set([guild.ownerId, settings.ownerId, ...settings.kingIds].filter(Boolean));
  assert.equal(sent.length, expectedRecipients.size, "one routine private notice is delivered to each protected owner per throttle window");
  assert.deepEqual(new Set(sent.map((entry) => entry.recipientId)), expectedRecipients);
  assert.deepEqual(sent[0].payload.allowedMentions, { parse: [] });
  const description = sent[0].payload.embeds[0].data.description;
  assert.match(description, /Dear Nico,/);
  assert.match(description, /Fukishōkai/);
  assert.equal(sent[0].payload.components.length, 1);
});

test("severe economy alerts are plain-text DMs and offer only owner-approved bot controls", async () => {
  const { service, client, guild, sent, restrictions } = makeService();
  await service.createIncident(client, {
    guild,
    userId: "tampered-player",
    category: "economy_invalid_payout",
    summary: "A casino payout failed verification against its recorded wager.",
    details: { actionType: "invalid_casino_payout", wager: 1000, amount: 9000, riskScore: 100 }
  });

  assert.equal(restrictions.length, 0, "no economy punishment is automatic");
  assert.ok(sent.length > 0);
  const payload = sent[0].payload;
  assert.equal(payload.embeds, undefined, "economy alerts must not use embeds");
  assert.match(payload.content, /casino payout failed verification/);
  assert.match(payload.content, /Context:/);
  assert.match(payload.content, /Suggested review:/);
  assert.match(payload.content, /Member:/);
  const actionLabels = payload.components[0].components.map(component => component.data.label);
  assert.deepEqual(actionLabels, ["Exclude leaderboard", "Pause bot · 1h", "Block bot access", "Dismiss"]);
});

test("isolated malformed economy operations are ignored; repeated attempts trigger one severe owner alert", async () => {
  const { service, client, guild, sent, queryCounts } = makeService();
  const payload = {
    guild,
    userId: "player-invalid-attempts",
    category: "economy_tampering",
    summary: "A currency mutation was rejected by the economy integrity guard.",
    details: { actionType: "invalid_economy_mutation", reasonCode: "ECONOMY_DIRECTION_INVALID", amount: -100, riskScore: 100 }
  };
  await service.createIncident(client, payload);
  await service.createIncident(client, payload);
  assert.equal(queryCounts.incidents, 0, "one or two malformed calls are not severe owner alerts");
  assert.equal(sent.length, 0);
  await service.createIncident(client, payload);
  assert.equal(queryCounts.incidents, 1, "the third attempt within five minutes becomes a severe incident");
  assert.ok(sent.length > 0);
  assert.equal(sent[0].payload.embeds, undefined);
  assert.match(sent[0].payload.content, /Rejected attempts: 3/);
  assert.ok(sent[0].payload.components?.length, "severe confirmed pattern offers owner-approved review controls");
});

test("a single external database mismatch is not an owner alert; repeated mismatches are", async () => {
  const { service, client, guild, sent, queryCounts } = makeService();
  const incident = {
    guild,
    userId: "player-db-mismatch",
    category: "economy_direct_balance_change",
    summary: "A player economy snapshot differs from the verified ledger.",
    details: { changedFields: "wallet", riskScore: 100 }
  };
  await service.createIncident(client, incident);
  assert.equal(queryCounts.incidents, 0, "a single mismatch is not enough to notify");
  assert.equal(sent.length, 0);
  await service.createIncident(client, incident);
  assert.equal(queryCounts.incidents, 1, "a repeated mismatch inside ten minutes is escalated");
  assert.ok(sent.length > 0);
  assert.match(sent[0].payload.content, /mismatch/i);
});

test("soft economy reward-burst signals are stored but do not DM owners", async () => {
  const { service, client, guild, sent, queryCounts } = makeService();
  await service.createIncident(client, {
    guild,
    userId: "player-soft",
    category: "economy_reward_burst",
    summary: "A soft reward-burst signal was observed.",
    details: { actionType: "reward_burst", recentRewards: 10, baseAmount: 23, riskScore: 20 }
  });
  assert.equal(queryCounts.incidents, 0, "soft signals are below the severity threshold and are ignored");
  assert.equal(queryCounts.throttle, 0, "soft signals do not consume the owner notification throttle");
  assert.equal(sent.length, 0, "soft activity must not create noisy owner DMs");
});

test("authorized owner can exclude a member after reviewing a severe economy incident", async () => {
  const writes = [];
  const targetId = "player-under-review";
  const kingId = settings.kingIds[0];
  const security = new SecurityService({
    async query(sql, params) {
      writes.push({ sql, params });
      if (sql.includes("SELECT id, user_id, category, details FROM security_incidents")) {
        return { rowCount: 1, rows: [{ id: "501", user_id: targetId, category: "economy_direct_balance_change", details: { riskScore: 100, mismatchCount: 2 } }] };
      }
      return { rowCount: 1, rows: [] };
    }
  }, { async get() { return null; } });
  security.hasAdminAccess = async () => true;
  const guild = { id: "guild-1", ownerId: settings.kingIds[1], members: {} };
  let updated = null;
  const interaction = {
    customId: "security:501:guild-1:" + targetId + ":exclude-leaderboard",
    guildId: null,
    guild: null,
    user: { id: kingId },
    async reply(payload) { throw new Error("Valid owner action should update the DM text: " + payload.content); },
    async update(payload) { updated = payload; },
    message: { content: "Fukishōkai economy alert", embeds: [] }
  };
  const client = { guilds: { cache: new Map([[guild.id, guild]]), async fetch() { return guild; } } };
  await security.handleAlertInteraction(interaction, client);
  const exclusion = writes.find(entry => entry.sql.includes("INSERT INTO leaderboard_exclusions"));
  assert.ok(exclusion, "leaderboard exclusion is applied only after the King clicks the action");
  assert.deepEqual(exclusion.params.slice(0, 3), ["guild-1", targetId, kingId]);
  assert.match(exclusion.params[3], /incident #501/);
  assert.ok(writes.some(entry => entry.sql.includes("UPDATE security_incidents")));
  assert.equal(updated.embeds.length, 0);
  assert.match(updated.content, /excluded from Fukishōkai leaderboards/);
});

test("authorized owner can apply a one-hour bot-only pause from a severe economy alert", async () => {
  const writes = [];
  const targetId = "player-to-pause";
  const security = new SecurityService({
    async query(sql, params) {
      writes.push({ sql, params });
      if (sql.includes("SELECT id, user_id, category, details FROM security_incidents")) {
        return { rowCount: 1, rows: [{ id: "503", user_id: targetId, category: "economy_reward_burst", details: { riskScore: 88 } }] };
      }
      return { rowCount: 1, rows: [] };
    }
  }, { async get() { return null; } });
  security.hasAdminAccess = async () => true;
  const guild = { id: "guild-1", ownerId: settings.kingIds[1], members: {} };
  const before = Date.now();
  let updated = null;
  const interaction = {
    customId: "security:503:guild-1:" + targetId + ":pause-1h",
    guildId: null,
    guild: null,
    user: { id: settings.kingIds[0] },
    async reply(payload) { throw new Error("Valid action should update the alert: " + payload.content); },
    async update(payload) { updated = payload; }
  };
  const client = { guilds: { cache: new Map([[guild.id, guild]]), async fetch() { return guild; } } };
  await security.handleAlertInteraction(interaction, client);
  const restriction = writes.find(entry => entry.sql.includes("INSERT INTO bot_user_restrictions"));
  assert.ok(restriction, "pause is applied only after the authorized owner clicks");
  assert.equal(restriction.params[0], guild.id);
  assert.equal(restriction.params[1], targetId);
  assert.ok(restriction.params[2] instanceof Date);
  assert.ok(restriction.params[2].getTime() >= before + 59 * 60 * 1000);
  assert.ok(restriction.params[2].getTime() <= Date.now() + 60 * 60 * 1000 + 1000);
  assert.equal(restriction.params[4], settings.kingIds[0]);
  assert.equal(updated.embeds.length, 0);
  assert.match(updated.content, /paused for one hour/i);
});

test("economy controls cannot target a protected King account", async () => {
  const kingId = settings.kingIds[0];
  const writes = [];
  const security = new SecurityService({
    async query(sql, params) {
      writes.push({ sql, params });
      if (sql.includes("SELECT id, user_id, category, details FROM security_incidents")) {
        return { rowCount: 1, rows: [{ id: "502", user_id: kingId, category: "economy_direct_balance_change", details: { riskScore: 100, mismatchCount: 2 } }] };
      }
      return { rowCount: 1, rows: [] };
    }
  }, { async get() { return null; } });
  security.hasAdminAccess = async () => true;
  let reply = null;
  const guild = { id: "guild-1", ownerId: settings.kingIds[1], members: {} };
  const interaction = {
    customId: "security:502:guild-1:" + kingId + ":block",
    guildId: null,
    guild: null,
    user: { id: settings.kingIds[1] },
    async reply(payload) { reply = payload; },
    async update() { throw new Error("Protected King must not receive an action"); }
  };
  const client = { guilds: { cache: new Map([[guild.id, guild]]), async fetch() { return guild; } } };
  await security.handleAlertInteraction(interaction, client);
  assert.match(reply.content, /King accounts cannot be targeted/);
  assert.equal(writes.length, 1, "no restriction or leaderboard write occurs");
});

test("anti-nuke alerts DM only Kings and bot owner, with no action controls or automatic actions", async () => {
  const { service, client, guild, sent, restrictions } = makeService();
  await service.createIncident(client, {
    guild,
    userId: "suspected-actor",
    category: "anti_nuke",
    summary: "A burst of channel deletions was attributed to one member.",
    details: { detectionReason: "mass_asset_deletion", countInWindow: 3, windowSeconds: 20 }
  });

  const expectedRecipients = new Set([...settings.kingIds, settings.ownerId].filter(Boolean));
  assert.deepEqual(new Set(sent.map((entry) => entry.recipientId)), expectedRecipients);
  assert.equal(sent.length, expectedRecipients.size);
  assert.equal(sent.some((entry) => entry.recipientId === guild.ownerId && !settings.kingIds.includes(guild.ownerId)), false,
    "the server owner is not added separately unless they are one of the configured Kings");
  assert.equal(restrictions.length, 0, "anti-nuke detection must not apply a bot-access restriction");
  for (const entry of sent) {
    const mail = entry.payload;
    assert.match(mail.embeds[0].data.title, /Potential server nuke/);
    assert.match(mail.embeds[0].data.description, /alert-only notification/i);
    const action = mail.embeds[0].data.fields.find((field) => field.name === "Action taken").value;
    assert.match(action, /No moderation/i);
    assert.equal(Object.hasOwn(mail, "components"), false, "anti-nuke DMs must not contain buttons or controls");
    assert.deepEqual(mail.allowedMentions, { parse: [] });
  }
});

test("anti-raid alerts DM only Kings and bot owner, with no action controls or lockdown", async () => {
  const { service, client, guild, sent, restrictions } = makeService();
  let guildEditCalls = 0;
  guild.edit = async () => { guildEditCalls += 1; };
  await service.createIncident(client, {
    guild,
    category: "anti_raid",
    summary: "A rapid join burst included three newly created accounts.",
    details: {
      joinsIn30Seconds: 5,
      joinsIn60Seconds: 5,
      newAccountsIn60Seconds: 3,
      newAccountAgeDays: 7,
      joinWindowSeconds: 30,
      newAccountWindowSeconds: 60,
      inviteSourceSummary: "3 joins: Invite abc123 — created by Example (ID inviter-1)",
      recentJoiners: "new-user-1 — account age 1d — Invite abc123"
    }
  });

  const expectedRecipients = new Set([...settings.kingIds, settings.ownerId].filter(Boolean));
  assert.deepEqual(new Set(sent.map((entry) => entry.recipientId)), expectedRecipients);
  assert.equal(sent.length, expectedRecipients.size);
  assert.equal(restrictions.length, 0, "anti-raid detection must not apply a bot-access restriction");
  assert.equal(guildEditCalls, 0, "anti-raid detection must never change the server verification level");
  assert.match(sent[0].payload.embeds[0].data.fields.find((field) => field.name === "Incident context").value, /Invite abc123/);
  assert.match(sent[0].payload.embeds[0].data.description, /three newly created accounts/);
  for (const entry of sent) {
    const mail = entry.payload;
    assert.match(mail.embeds[0].data.description, /alert-only notification/i);
    const action = mail.embeds[0].data.fields.find((field) => field.name === "Action taken").value;
    assert.match(action, /No moderation/i);
    assert.equal(Object.hasOwn(mail, "components"), false, "anti-raid DMs must not contain buttons or controls");
  }
});

test("a high-impact role permission grant is escalated as an anti-nuke incident", async () => {
  const service = new SecurityService({}, { async get() { return null; } });
  service.isAboveBotRole = async () => false;
  let recorded = null;
  service.createIncident = async (_client, input) => { recorded = input; return "incident-1"; };
  const entry = {
    id: "audit-1",
    target: { id: "role-1" },
    executor: { id: "actor-1" },
    createdTimestamp: Date.now(),
    reason: "unexpected privilege grant"
  };
  const guild = {
    id: "guild-1",
    async fetchAuditLogs() { return { entries: [entry] }; }
  };
  const client = { user: { id: "bot-user" } };

  await service.recordPrivilegeEscalation(
    client, guild, "role-1", "role_permission_escalation",
    require("discord.js").AuditLogEvent.RoleUpdate,
    ["Administrator", "Manage Roles"]
  );

  assert.equal(recorded.category, "anti_nuke");
  assert.equal(recorded.userId, "actor-1");
  assert.equal(recorded.details.detectionReason, "privilege_escalation");
  assert.equal(recorded.details.changedFields, "Administrator, Manage Roles");
});

test("administrator DM tools cannot target Fukishokai Kings", async () => {
  const { AdminMessagingService } = require("../src/services/admin-messaging");
  const settings = require("../src/config/settings");
  const messaging = new AdminMessagingService();
  let fetchCalls = 0;
  const sent = [];
  const regularMember = { user: { bot: false }, async send() { sent.push("regular-member"); } };
  const guild = {
    members: {
      cache: new Map([["regular-member", regularMember]]),
      async fetch() { fetchCalls += 1; return regularMember; }
    }
  };
  await assert.rejects(() => messaging.sendToMember(guild, settings.kingIds[0], "An administrator message"), /King protection/);
  assert.equal(fetchCalls, 0, "a protected account is rejected before Discord member lookup");
  const result = await messaging.sendToAll(guild, "Server announcement", [...settings.kingIds, "regular-member"]);
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.skipped, 2);
  assert.equal(result.attempted, 1);
  assert.deepEqual(sent, ["regular-member"]);
});
test("security DMs are sent to both Fukishokai Kings", async () => {
  const { service, client, guild, sent } = makeService();
  await service.createIncident(client, { guild, category: "anti_nuke", userId: null, summary: "A test alert.", details: {} });
  const ids = new Set(sent.map((entry) => entry.recipientId));
  const settings = require("../src/config/settings");
  for (const kingId of settings.kingIds) assert.equal(ids.has(kingId), true);
});

test("legacy anti-nuke action buttons are rejected without taking any action", async () => {
  const kingId = settings.kingIds[0];
  const writes = [];
  const security = new SecurityService({
    async query(sql, params) {
      writes.push({ sql, params });
      if (sql.includes("SELECT id, user_id, category, details FROM security_incidents")) {
        return { rowCount: 1, rows: [{ id: "72", user_id: kingId, category: "anti_nuke" }] };
      }
      return { rowCount: 1, rows: [] };
    }
  }, { async get() { return null; } });
  security.hasAdminAccess = async () => true;
  let reply = null;
  let updateCalled = false;
  const guild = {
    id: "guild-1", ownerId: settings.kingIds[1],
    members: { async fetch() { throw new Error("No member lookup should occur"); } },
    async edit() { throw new Error("No server setting may be changed"); }
  };
  const interaction = {
    customId: "security:72:guild-1:" + kingId + ":timeout",
    guildId: "guild-1",
    guild,
    user: { id: settings.ownerId || "configured-bot-owner" },
    async reply(payload) { reply = payload; },
    async update() { updateCalled = true; }
  };
  await security.handleAlertInteraction(interaction, { guilds: { cache: new Map() } });
  assert.match(reply.content, /alert-only/i);
  assert.equal(updateCalled, false);
  assert.equal(writes.length, 1, "the incident is read, with no moderation, lockdown or audit write");
});

test("priority anti-raid alerts are suppressed by a persistent database throttle", async () => {
  let savedIncident = false;
  const service = new SecurityService({
    async query(sql) {
      if (sql.includes("INSERT INTO security_incidents")) {
        savedIncident = true;
        return { rowCount: 1, rows: [{ id: "99" }] };
      }
      if (sql.includes("INSERT INTO security_priority_alert_state")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    }
  }, { async get() { return null; } });
  service.isAboveBotRole = async () => false;
  const sent = [];
  const client = { users: { async fetch() { return { username: "Nico", async send(payload) { sent.push(payload); } }; } } };
  const guild = { id: "guild-1", name: "Fukishōkai", ownerId: "server-owner" };

  await service.createIncident(client, {
    guild,
    category: "anti_raid",
    summary: "A join burst was detected.",
    details: { joinsInWindow: 8, youngAccounts: 4 }
  });
  assert.equal(savedIncident, true, "the incident remains stored even when the repeat DM is suppressed");
  assert.equal(sent.length, 0, "a recently notified server does not receive another priority DM");
});

test("legacy anti-raid lockdown buttons are rejected without changing server settings", async () => {
  const writes = [];
  const service = new SecurityService({
    async query(sql, params) {
      writes.push({ sql, params });
      if (sql.includes("SELECT id, user_id, category, details FROM security_incidents")) {
        return { rowCount: 1, rows: [{ id: "44", user_id: null, category: "anti_raid" }] };
      }
      return { rowCount: 1, rows: [] };
    }
  }, { async get() { return null; } });
  const guild = {
    id: "guild-1", ownerId: settings.kingIds[1],
    async edit() { throw new Error("Raid alerts must never edit the server."); }
  };
  let reply = null;
  let updateCalled = false;
  const interaction = {
    customId: "security:44:guild-1:unknown:raid-lockdown",
    guildId: null,
    guild: null,
    user: { id: settings.kingIds[1] },
    reply: async (payload) => { reply = payload; },
    update: async () => { updateCalled = true; }
  };
  const client = { guilds: { cache: { get: () => guild }, async fetch() { return guild; } } };
  service.hasAdminAccess = async () => true;
  await service.handleAlertInteraction(interaction, client);
  assert.match(reply.content, /alert-only/i);
  assert.equal(updateCalled, false);
  assert.equal(writes.length, 1, "legacy lockdown buttons must not edit the server or incident status");
});


