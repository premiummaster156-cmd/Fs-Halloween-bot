"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const settings = require("../src/config/settings");
const {
  SecurityService,
  getAutomaticEconomyRestriction,
  evaluateNukeBurst,
  evaluateRaidBurst
} = require("../src/services/security");

test("automatic economy restrictions remain limited to high-confidence signals", () => {
  assert.equal(getAutomaticEconomyRestriction("economy_direct_balance_change").minutes, 1440);
  assert.equal(getAutomaticEconomyRestriction("economy_invalid_payout").minutes, 60);
  assert.equal(getAutomaticEconomyRestriction("economy_reward_burst", { riskScore: 99 }), null);
  assert.equal(getAutomaticEconomyRestriction("economy_reward_burst", { riskScore: 100 }).minutes, 30);
  assert.equal(getAutomaticEconomyRestriction("economy_xp_manipulation", { riskScore: 100 }), null);
  assert.equal(getAutomaticEconomyRestriction("command_spam"), null);
});

test("anti-nuke thresholds require a destructive or mass-creation burst", () => {
  assert.equal(evaluateNukeBurst(["channel_delete", "channel_delete"]).triggered, false);
  assert.equal(evaluateNukeBurst(["channel_delete", "channel_delete", "role_delete"]).reason, "mass_asset_deletion");
  assert.equal(evaluateNukeBurst(["member_ban", "member_ban", "member_kick", "member_kick", "member_kick"]).reason, "mass_member_removal");
  assert.equal(evaluateNukeBurst(Array(8).fill("channel_create")).reason, "mass_asset_creation");
});

test("anti-raid thresholds distinguish ordinary joins from a coordinated burst", () => {
  const now = Date.now();
  const ordinary = Array.from({ length: 7 }, (_, i) => ({ joinedAt: now - i * 1000, accountAgeMs: 30 * 86400000 }));
  assert.equal(evaluateRaidBurst(ordinary, now).triggered, false);
  const youngBurst = Array.from({ length: 6 }, (_, i) => ({
    joinedAt: now - i * 1000,
    accountAgeMs: i < 4 ? 60 * 60 * 1000 : 30 * 86400000
  }));
  assert.equal(evaluateRaidBurst(youngBurst, now).triggered, true);
  assert.equal(evaluateRaidBurst(Array.from({ length: 8 }, (_, i) => ({
    joinedAt: now - i * 1000, accountAgeMs: 90 * 86400000
  })), now).triggered, true);
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
          username: id === "server-owner" ? "nico" : "brian",
          globalName: id === "server-owner" ? "Nico" : "Brian",
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
  assert.equal(sent.length, 1, "one routine private notice is delivered per throttle window");
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

test("anti-nuke owner mail includes contextual action options and no public channel delivery", async () => {
  const { service, client, guild, sent } = makeService();
  service.quarantineNuker = async () => ({ applied: true, roleIds: ["dangerous-role"] });
  await service.createIncident(client, {
    guild,
    userId: "suspected-actor",
    category: "anti_nuke",
    summary: "A burst of channel deletions was attributed to one member.",
    details: { detectionReason: "mass_asset_deletion", countInWindow: 3, windowSeconds: 20 }
  });

  assert.equal(sent.length, 1);
  const mail = sent[0].payload;
  assert.match(mail.embeds[0].data.description, /Dear Nico,/);
  assert.match(mail.embeds[0].data.title, /Potential server nuke/);
  assert.match(mail.embeds[0].data.fields.find((field) => field.name === "Automated response").value, /removed manageable high-risk roles/);
  const labels = mail.components[0].components.map((component) => component.data.label);
  assert.ok(labels.includes("Restore removed roles"));
  assert.ok(labels.includes("Ban attacker"));
  assert.ok(labels.includes("Kick attacker"));
  assert.deepEqual(mail.allowedMentions, { parse: [] });
});

test("anti-raid notices provide lockdown and release controls to owners", async () => {
  const { service, client, guild, sent } = makeService();
  await service.createIncident(client, {
    guild,
    category: "anti_raid",
    summary: "A rapid join burst crossed the anti-raid threshold.",
    details: { joinsInWindow: 8, youngAccounts: 5, windowSeconds: 20, lockdownApplied: true }
  });

  assert.equal(sent.length, 1);
  const mail = sent[0].payload;
  assert.match(mail.embeds[0].data.description, /Dear Nico,/);
  const labels = mail.components[0].components.map((component) => component.data.label);
  assert.ok(labels.includes("Enable 30m lockdown"));
  assert.ok(labels.includes("End lockdown"));
  assert.ok(labels.includes("Acknowledge"));
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

test("owner can use raid controls directly from a private DM", async () => {
  const writes = [];
  const service = new SecurityService({
    async query(sql, params) {
      writes.push({ sql, params });
      if (sql.includes("SELECT id, user_id FROM security_incidents")) {
        return { rowCount: 1, rows: [{ id: "44", user_id: null }] };
      }
      return { rowCount: 1, rows: [] };
    }
  }, { async get() { return null; } });
  const guild = { id: "guild-1", ownerId: "server-owner", members: {} };
  service.activateRaidLockdown = async () => ({ applied: true });
  let updated;
  const interaction = {
    customId: "security:44:guild-1:unknown:raid-lockdown",
    guildId: null,
    guild: null,
    user: { id: "server-owner" },
    message: { embeds: [] },
    reply: async () => { throw new Error("A valid owner action should update the DM notice."); },
    update: async (payload) => { updated = payload; }
  };
  const client = {
    guilds: {
      cache: { get: () => guild },
      async fetch() { return guild; }
    }
  };

  await service.handleAlertInteraction(interaction, client);
  assert.equal(writes.some((entry) => entry.sql.includes("UPDATE security_incidents")), true);
  assert.match(updated.embeds[0].data.description, /Very High for 30 minutes/);
  assert.deepEqual(updated.components, []);
});

test("verified role quarantine data is persisted for owner-approved restoration", async () => {
  let saved = null;
  const service = new SecurityService({
    async query(sql, params) {
      if (sql.includes("INSERT INTO security_quarantines")) {
        saved = params;
        return { rowCount: 1, rows: [{ id: "5" }] };
      }
      return { rowCount: 1, rows: [] };
    }
  }, { async get() { return null; } });
  service.isAboveBotRole = async () => false;
  const role = {
    id: "admin-role",
    editable: true,
    permissions: { has(permission) { return permission === require("discord.js").PermissionFlagsBits.Administrator; } }
  };
  const member = {
    roles: {
      cache: {
        filter(predicate) {
          return [
            { id: "guild-1", editable: false, permissions: { has() { return false; } } },
            role
          ].filter(predicate);
        }
      },
      async remove(ids) { assert.deepEqual(ids, ["admin-role"]); }
    }
  };
  const botMember = { permissions: { has(permission) { return permission === require("discord.js").PermissionFlagsBits.ManageRoles; } } };
  const guild = {
    id: "guild-1",
    members: { async fetch() { return member; }, me: botMember }
  };
  const result = await service.quarantineNuker(guild, "actor", "12");
  assert.equal(result.applied, true);
  assert.deepEqual(result.roleIds, ["admin-role"]);
  assert.equal(saved[2], "12");
  assert.deepEqual(JSON.parse(saved[3]), ["admin-role"]);
});
