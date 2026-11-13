"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const settings = require("../src/config/settings");
const {
  SecurityService,
  getAutomaticEconomyRestriction,
  evaluateNukeBurst,
  evaluateInviteBurst
} = require("../src/services/security");

test("automatic economy restrictions remain limited to high-confidence signals", () => {
  assert.equal(getAutomaticEconomyRestriction("economy_direct_balance_change").minutes, 1440);
  assert.equal(getAutomaticEconomyRestriction("economy_invalid_payout").minutes, 60);
  assert.equal(getAutomaticEconomyRestriction("economy_reward_burst", { riskScore: 99 }), null);
  assert.equal(getAutomaticEconomyRestriction("economy_reward_burst", { riskScore: 100 }).minutes, 30);
  assert.equal(getAutomaticEconomyRestriction("economy_xp_manipulation", { riskScore: 100 }), null);
  assert.equal(getAutomaticEconomyRestriction("command_spam"), null);
  assert.equal(getAutomaticEconomyRestriction("anti_nuke"), null);
  assert.equal(getAutomaticEconomyRestriction("anti_raid"), null);
});

test("anti-nuke thresholds require a destructive or mass-creation burst", () => {
  assert.equal(evaluateNukeBurst(["channel_delete", "channel_delete"]).triggered, false);
  assert.equal(evaluateNukeBurst(["channel_delete", "channel_delete", "role_delete"]).reason, "mass_asset_deletion");
  assert.equal(evaluateNukeBurst(["member_ban", "member_ban", "member_kick", "member_kick", "member_kick"]).reason, "mass_member_removal");
  assert.equal(evaluateNukeBurst(Array(8).fill("channel_create")).reason, "mass_asset_creation");
});

test("invite-burst monitoring detects suspicious invite churn without claiming members joined", () => {
  const now = Date.now();
  const routine = Array.from({ length: 4 }, (_, i) => ({ at: now - i * 1000, kind: "invite_create" }));
  assert.equal(evaluateInviteBurst(routine, now).triggered, false);
  const createBurst = Array.from({ length: 5 }, (_, i) => ({ at: now - i * 1000, kind: "invite_create" }));
  assert.equal(evaluateInviteBurst(createBurst, now).triggered, true);
  const mixedBurst = Array.from({ length: 8 }, (_, i) => ({
    at: now - i * 1000,
    kind: i < 4 ? "invite_create" : "invite_delete"
  }));
  assert.equal(evaluateInviteBurst(mixedBurst, now).triggered, true);
  const stale = Array.from({ length: 6 }, (_, i) => ({ at: now - 60000 - i * 1000, kind: "invite_create" }));
  assert.equal(evaluateInviteBurst(stale, now).triggered, false);
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
      category: "economy_tampering",
      summary: "An invalid economy mutation was rejected.",
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

test("confirmed economy tampering applies a bot-only timed restriction", async () => {
  const { service, client, guild, restrictions } = makeService();
  await service.createIncident(client, {
    guild,
    userId: "tampered-player",
    category: "economy_direct_balance_change",
    summary: "An out-of-band economy edit was detected.",
    details: { changedFields: "wallet,level", riskScore: 100 }
  });

  assert.equal(restrictions.length, 1);
  assert.equal(restrictions[0].params[0], "guild-1");
  assert.equal(restrictions[0].params[1], "tampered-player");
  assert.ok(restrictions[0].params[2] instanceof Date);
  assert.equal(restrictions[0].params[4], "AUTO_SECURITY");
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
    summary: "An invite activity burst crossed the anti-raid threshold.",
    details: { invitesInWindow: 5, invitesCreated: 5, invitesDeleted: 0, windowSeconds: 30, verificationLevel: "Unchanged" }
  });

  const expectedRecipients = new Set([...settings.kingIds, settings.ownerId].filter(Boolean));
  assert.deepEqual(new Set(sent.map((entry) => entry.recipientId)), expectedRecipients);
  assert.equal(sent.length, expectedRecipients.size);
  assert.equal(restrictions.length, 0, "anti-raid detection must not apply a bot-access restriction");
  assert.equal(guildEditCalls, 0, "anti-raid detection must never change the server verification level");
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
      if (sql.includes("SELECT id, user_id, category FROM security_incidents")) {
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
      if (sql.includes("SELECT id, user_id, category FROM security_incidents")) {
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


