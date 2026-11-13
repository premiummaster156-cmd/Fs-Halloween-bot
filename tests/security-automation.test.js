"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SecurityService, getAutomaticEconomyRestriction } = require("../src/services/security");

test("automatic restrictions are limited to high-confidence economy manipulation", () => {
  assert.equal(getAutomaticEconomyRestriction("economy_direct_balance_change").minutes, 1440);
  assert.equal(getAutomaticEconomyRestriction("economy_invalid_payout").minutes, 60);
  assert.equal(getAutomaticEconomyRestriction("economy_reward_burst", { riskScore: 99 }), null);
  assert.equal(getAutomaticEconomyRestriction("economy_reward_burst", { riskScore: 100 }).minutes, 30);
  assert.equal(getAutomaticEconomyRestriction("economy_xp_manipulation", { riskScore: 100 }), null);
  assert.equal(getAutomaticEconomyRestriction("command_spam"), null);
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
  const channel = {
    guildId: "guild-1",
    isTextBased: () => true,
    async send(payload) { sent.push(payload); }
  };
  const service = new SecurityService(pool, {
    async get(_guildId, key) { return key === "logChannelId" ? "log-channel" : null; }
  });
  // Isolate alert delivery from Discord member-cache/role-hierarchy behavior.
  service.isAboveBotRole = async () => false;
  const client = { channels: { async fetch() { return channel; } } };
  const guild = { id: "guild-1", ownerId: "server-owner", members: {} };
  return { service, client, guild, sent, restrictions, queryCounts };
}

test("eight incidents in one guild are grouped into one non-mentioning alert", async () => {
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
  assert.equal(queryCounts.throttle, 8, "the persistent guild throttle is checked for each incident");
  assert.equal(sent.length, 1, "only one channel notification is delivered in the throttle window");
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
  assert.equal(sent[0].content.includes("<@server-owner>"), false);
  assert.equal(sent[0].content.includes("<@player-1>"), false);
});

test("verified economy tampering applies a bot-only timed restriction", async () => {
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
  assert.match(restrictions[0].sql, /bot_user_restrictions\.expires_at IS NULL/);
});
