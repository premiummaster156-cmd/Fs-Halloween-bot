"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MemberLifecycleService, formatDuration, serializeRoles, auditChangesText } = require("../src/services/member-lifecycle");

test("member tenure formatting is readable at day, hour and minute scales", () => {
  assert.equal(formatDuration(2 * 86400000 + 3 * 3600000 + 4 * 60000), "2d 3h 4m");
  assert.equal(formatDuration(65 * 60000), "1h 5m");
  assert.equal(formatDuration(12000), "12s");
  assert.equal(formatDuration(-1000), "0s");
});

test("role snapshots exclude @everyone and preserve role names and IDs", () => {
  const member = {
    guild: { id: "guild-1" },
    roles: {
      cache: new Map([
        ["guild-1", { id: "guild-1", name: "@everyone", position: 0 }],
        ["role-low", { id: "role-low", name: "Member", position: 1 }],
        ["role-high", { id: "role-high", name: "Moderator", position: 5 }]
      ])
    }
  };
  assert.deepEqual(serializeRoles(member).map((role) => [role.id, role.name]), [
    ["role-high", "Moderator"],
    ["role-low", "Member"]
  ]);
});

test("join stores a role snapshot in the existing audit log table without a new migration", async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  const service = new MemberLifecycleService(pool, { fukishokaiGuildId: "guild-1", coopftGuildId: "" });
  const member = {
    id: "user-1",
    guild: { id: "guild-1" },
    user: { createdAt: new Date("2025-01-01T00:00:00.000Z") },
    joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    roles: { cache: new Map([["role-1", { id: "role-1", name: "Member", position: 1 }]]) }
  };

  const result = await service.recordRoleSnapshot(member, "user-1", "join");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO audit_logs/);
  assert.deepEqual(JSON.parse(calls[0].params[4]), result);
  assert.equal(result.source, "join");
  assert.equal(result.roles[0].id, "role-1");
  assert.equal(result.joinedAt, "2026-01-01T00:00:00.000Z");
});

test("leave logs use the latest saved role snapshot and calculate server tenure", async () => {
  const sentPayloads = [];
  const inserted = [];
  const snapshot = {
    source: "audit_role_update",
    roles: [{ id: "role-7", name: "Senior Moderator", position: 7 }],
    joinedAt: "2026-11-13T10:00:00.000Z",
    accountCreatedAt: "2024-01-01T00:00:00.000Z"
  };
  const pool = {
    query: async (sql, params) => {
      if (sql.includes("SELECT details,created_at FROM audit_logs")) return { rows: [{ details: snapshot }] };
      inserted.push({ sql, params });
      return { rows: [] };
    }
  };
  const channel = {
    guildId: "guild-1",
    isTextBased: () => true,
    send: async (payload) => sentPayloads.push(payload)
  };
  const guild = {
    id: "guild-1",
    name: "Test Guild",
    channels: { fetch: async () => channel }
  };
  const service = new MemberLifecycleService(pool, {
    fukishokaiGuildId: "guild-1",
    coopftGuildId: "",
    guildSettings: { get: async () => "member-log-channel" }
  });
  const member = {
    id: "user-1",
    guild,
    user: { tag: "member#0001", createdAt: new Date(snapshot.accountCreatedAt) },
    joinedAt: null,
    roles: { cache: new Map() }
  };

  assert.equal(await service.handleLeave(member), true);
  assert.equal(sentPayloads.length, 1);
  const embed = sentPayloads[0].embeds[0].toJSON();
  assert.match(embed.title, /MEMBER LEFT/);
  const fields = Object.fromEntries(embed.fields.map((field) => [field.name, field.value]));
  assert.match(fields["Previous roles"], /Senior Moderator/);
  assert.match(fields["Joined server"], /<t:1794564000:F>/);
  assert.match(fields["Time in server"], /2d/);
  assert.equal(inserted.length, 1);
  assert.match(inserted[0].sql, /INSERT INTO audit_logs/);
  const details = JSON.parse(inserted[0].params[4]);
  assert.equal(details.roles[0].id, "role-7");
  assert.equal(details.joinedAt, snapshot.joinedAt);
});


test("server audit changes are rendered as readable before-and-after details", () => {
  const rendered = auditChangesText({
    changes: [
      { key: "name", old: "old-channel", new: "new-channel" },
      { key: "topic", old: null, new: "Community updates" }
    ]
  });
  assert.match(rendered, /old-channel/);
  assert.match(rendered, /new-channel/);
  assert.match(rendered, /Community updates/);
});
