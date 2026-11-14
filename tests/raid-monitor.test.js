"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RaidMonitor,
  NEW_ACCOUNT_AGE_MS,
  evaluateJoinBurst,
  compareInviteSnapshots,
  sourceLabel,
  formatAccountAge
} = require("../src/services/raid-monitor");

function snapshot({
  inviteUses = 0,
  inviteCode = "abc123",
  inviterId = "invite-creator",
  inviterTag = "InviteCreator",
  vanityUses = 0,
  vanityCode = "fukishokai"
} = {}) {
  return {
    invitesAvailable: true,
    invites: new Map([[inviteCode, {
      code: inviteCode,
      uses: inviteUses,
      inviterId,
      inviterTag
    }]]),
    vanityAvailable: true,
    vanity: vanityCode ? { code: vanityCode, uses: vanityUses } : null
  };
}

function joinedMember(id, createdAt, guild = { id: "guild-1" }) {
  return {
    guild,
    user: {
      id,
      username: "member-" + id,
      tag: "member-" + id + "#0001",
      createdTimestamp: createdAt,
      bot: false
    }
  };
}

test("join burst triggers at five joins in 30 seconds", () => {
  const now = Date.now();
  const events = Array.from({ length: 5 }, (_, i) => ({
    joinedAt: now - i * 1000,
    accountAgeMs: 30 * 24 * 60 * 60 * 1000
  }));
  const result = evaluateJoinBurst(events, now);
  assert.equal(result.triggered, true);
  assert.equal(result.joinsIn30Seconds, 5);
  assert.equal(result.newAccountsIn60Seconds, 0);
});

test("three accounts created within seven days trigger a join alert in 60 seconds", () => {
  const now = Date.now();
  const events = [1, 2, 6].map((days, i) => ({
    joinedAt: now - i * 10_000,
    accountAgeMs: days * 24 * 60 * 60 * 1000
  }));
  const result = evaluateJoinBurst(events, now);
  assert.equal(result.triggered, true);
  assert.equal(result.newAccountsIn60Seconds, 3);
  assert.equal(NEW_ACCOUNT_AGE_MS, 7 * 24 * 60 * 60 * 1000);
});

test("ordinary slower joins do not trigger a raid alert", () => {
  const now = Date.now();
  const events = [
    { joinedAt: now - 5_000, accountAgeMs: 20 * 24 * 60 * 60 * 1000 },
    { joinedAt: now - 35_000, accountAgeMs: 3 * 24 * 60 * 60 * 1000 },
    { joinedAt: now - 80_000, accountAgeMs: 2 * 24 * 60 * 60 * 1000 }
  ];
  assert.equal(evaluateJoinBurst(events, now).triggered, false);
});

test("invite usage delta identifies invite code and its creator", () => {
  const source = compareInviteSnapshots(snapshot({ inviteUses: 2 }), snapshot({ inviteUses: 3 }));
  assert.equal(source.type, "invite");
  assert.equal(source.code, "abc123");
  assert.equal(source.inviterId, "invite-creator");
  assert.match(sourceLabel(source), /Invite abc123/);
  assert.match(sourceLabel(source), /invite-creator/);
});

test("vanity usage delta is explicitly identified as a vanity URL", () => {
  const source = compareInviteSnapshots(
    snapshot({ inviteUses: 2, vanityUses: 5 }),
    snapshot({ inviteUses: 2, vanityUses: 6 })
  );
  assert.equal(source.type, "vanity");
  assert.equal(source.code, "fukishokai");
  assert.match(sourceLabel(source), /Vanity URL discord\.gg\/fukishokai/);
  assert.match(sourceLabel(source), /no individual inviter/);
});

test("multiple invite sources changing together are marked ambiguous", () => {
  const source = compareInviteSnapshots(
    snapshot({ inviteUses: 2, vanityUses: 5 }),
    snapshot({ inviteUses: 3, vanityUses: 6 })
  );
  assert.equal(source.type, "unknown");
  assert.match(source.reason, /ambiguous/i);
});

test("missing usage metadata never guesses an inviter", () => {
  const current = snapshot({ inviteUses: 3 });
  current.invitesAvailable = false;
  const source = compareInviteSnapshots(snapshot({ inviteUses: 2 }), current);
  assert.equal(source.type, "unknown");
  assert.match(source.reason, /Manage Server/i);
});

test("first join without a startup baseline is labelled unknown", () => {
  const source = compareInviteSnapshots(null, snapshot());
  assert.equal(source.type, "unknown");
  assert.match(source.reason, /baseline/i);
});

test("three new-account joins send one alert with inviter/source evidence", async () => {
  const now = Date.now();
  let inviteUses = 10;
  let incident = null;
  const monitor = new RaidMonitor({
    security: {
      async createIncident(_client, input) {
        incident = input;
        return "incident-1";
      }
    },
    clock: () => now,
    snapshotFetcher: async () => snapshot({ inviteUses: ++inviteUses }),
    logger: { warn() {} }
  });
  monitor.snapshots.set("guild-1", snapshot({ inviteUses: 10 }));
  const client = {};
  const members = [
    joinedMember("new-1", now - 1 * 24 * 60 * 60 * 1000),
    joinedMember("new-2", now - 2 * 24 * 60 * 60 * 1000),
    joinedMember("new-3", now - 3 * 24 * 60 * 60 * 1000)
  ];
  await monitor.handleMemberJoin(members[0], client);
  await monitor.handleMemberJoin(members[1], client);
  const result = await monitor.handleMemberJoin(members[2], client);

  assert.equal(result.alerted, true);
  assert.equal(incident.category, "anti_raid");
  assert.equal(incident.userId, null);
  assert.equal(incident.details.newAccountsIn60Seconds, 3);
  assert.match(incident.details.inviteSourceSummary, /invite-creator/);
  assert.match(incident.details.recentJoiners, /new-1/);
  assert.match(incident.details.recentJoiners, /Invite abc123/);
});

test("unavailable invite snapshots produce explicit unknown source evidence", async () => {
  const now = Date.now();
  let incident = null;
  const unavailable = {
    invitesAvailable: false,
    invites: new Map(),
    vanityAvailable: false,
    vanity: null,
    reason: "The bot lacks Manage Server permission."
  };
  const monitor = new RaidMonitor({
    security: {
      async createIncident(_client, input) {
        incident = input;
        return "incident-2";
      }
    },
    clock: () => now,
    snapshotFetcher: async () => unavailable,
    logger: { warn() {} }
  });
  monitor.snapshots.set("guild-1", unavailable);
  const client = {};
  await monitor.handleMemberJoin(joinedMember("new-a", now - 1000), client);
  await monitor.handleMemberJoin(joinedMember("new-b", now - 2000), client);
  await monitor.handleMemberJoin(joinedMember("new-c", now - 3000), client);
  assert.ok(incident);
  assert.match(incident.details.inviteSourceSummary, /Unknown/);
  assert.match(incident.details.inviteSourceSummary, /Manage Server/);
});

test("account ages are rendered in compact readable units", () => {
  assert.equal(formatAccountAge(4 * 60 * 60 * 1000), "4h");
  assert.equal(formatAccountAge(2 * 24 * 60 * 60 * 1000), "2d");
});
