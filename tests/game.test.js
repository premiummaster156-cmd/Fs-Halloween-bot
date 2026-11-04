const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/utils/core");
const balancing = require("../src/config/game-balancing");

test("level requirements grow with level", () => {
  assert.ok(core.levelXpRequired(10) > core.levelXpRequired(5));
  assert.ok(core.levelXpRequired(5) > core.levelXpRequired(1));
});

test("career pay has bounded randomness and grows by job level", () => {
  const job = { payMin: 100, payMax: 200 };
  assert.ok(core.calculateWorkPay(job, 1, 0.82) < core.calculateWorkPay(job, 10, 1.18));
  assert.ok(core.calculateWorkPay(job, 1, 0.82) > 0);
});

test("crime chance remains bounded", () => {
  assert.equal(core.calculateCrimeChance(1, 1, 20, 0), 8);
  assert.equal(core.calculateCrimeChance(100, 500, 1, 100), 88);
});

test("heists reward crew and preparation but cannot become guaranteed", () => {
  const easy = core.calculateHeistChance(25, 1, 2, 3, 0);
  const prepared = core.calculateHeistChance(25, 15, 5, 1, 15);
  assert.ok(prepared > easy);
  assert.ok(prepared <= 85);
});

test("splitReward distributes the exact total without order advantages", () => {
  const shares = core.splitReward(1001, ["c", "a", "b"]);
  assert.equal(shares.reduce((sum, item) => sum + item.amount, 0), 1001);
  assert.deepEqual(shares.map((item) => item.userId), ["a", "b", "c"]);
});

test("casino payout uses integer calculations", () => {
  assert.equal(core.casinoPayout(101, 200), 202);
  assert.equal(core.casinoPayout(101, 130), 131);
});

test("economy balance, job, heist, and quest data is internally valid", () => {
  assert.ok(balancing.jobs.length >= 5);
  assert.equal(new Set(balancing.jobs.map((item) => item.id)).size, balancing.jobs.length);
  for (const job of balancing.jobs) {
    assert.ok(job.payMax >= job.payMin);
    assert.ok(job.cooldownMs > 0);
  }
  for (const mission of balancing.heists) {
    assert.ok(mission.minParticipants >= 2);
    assert.ok(mission.maxParticipants >= mission.minParticipants);
    assert.ok(mission.baseChance > 0 && mission.baseChance < 100);
  }
  assert.equal(new Set(balancing.halloween.quests.map((item) => item.id)).size, balancing.halloween.quests.length);
});


test("weekly activity starts on Monday UTC regardless of weekday", () => {
  const { getWeekStart } = require("../src/services/activity");
  assert.equal(getWeekStart("2026-10-27T09:00:00.000Z"), "2026-10-26");
  assert.equal(getWeekStart("2026-10-25T23:59:59.000Z"), "2026-10-19");
  assert.equal(getWeekStart("2026-10-26T00:00:00.000Z"), "2026-10-26");
});


test("equipment effects are combined and capped", () => {
  const { combineEffects } = require("../src/services/inventory");
  const result = combineEffects([
    { effects: { crimeChance: 9, heistChance: 8, workPayBonus: 0.2, fineReduction: 0.3 } },
    { effects: { crimeChance: 9, heistChance: 9, workPayBonus: 0.2, fineReduction: 0.3 } }
  ]);
  assert.deepEqual(result, { crimeChance: 15, heistChance: 15, workPayBonus: 0.25, fineReduction: 0.35 });
});


test("casino odds are transparent and have a consistent 5% theoretical house edge", () => {
  const rules = balancing.casino;
  const games = rules.games;
  const coinFlipReturn = (games.coinflip.winningChance / 100) * (games.coinflip.multiplierHundredths / 100);
  const diceReturn = (2 / 6) * (games.dice.multiplierHundredths / 100);
  let start = 0;
  let slotsReturn = 0;
  for (const outcome of games.slots.outcomes) {
    const rolls = outcome.maxRoll - start + 1;
    slotsReturn += (rolls / 1000) * (outcome.multiplierHundredths / 100);
    start = outcome.maxRoll + 1;
  }
  assert.ok(Math.abs(coinFlipReturn - rules.targetReturnRate) < 0.000001);
  assert.ok(Math.abs(diceReturn - rules.targetReturnRate) < 0.000001);
  assert.ok(Math.abs(slotsReturn - rules.targetReturnRate) < 0.000001);
});

test("casino exposure is capped equally for every player", () => {
  assert.equal(balancing.casino.minBet, 100);
  assert.equal(balancing.casino.maxBet, 1000);
  assert.equal(balancing.casino.dailyWagerLimit, 5000);
  assert.ok(balancing.casino.cooldownMs >= 30000);
  assert.ok(balancing.casino.games.slots.outcomes[0].maxRoll === 9);
  assert.equal(balancing.casino.games.slots.outcomes[0].multiplierHundredths, 1000);
});


test("only the server owner or configured bot owner qualifies for bot control", () => {
  const { SecurityService } = require("../src/services/security");
  const security = new SecurityService({}, {});
  assert.equal(security.isOwner("guild-owner", "guild-owner"), true);
  assert.equal(security.isOwner("regular-admin", "guild-owner"), false);
  assert.equal(security.isOwner("ordinary-member", "guild-owner"), false);
});

test("repeated cooldown blocks create a security alert but do not auto-punish", async () => {
  const { SecurityService } = require("../src/services/security");
  const writes = [];
  const pool = {
    query: async (...args) => { writes.push(args); return { rowCount: 1, rows: [] }; }
  };
  const security = new SecurityService(pool, {});
  security.isAboveBotRole = async () => false;
  const incidents = [];
  security.createIncident = async (_client, details) => { incidents.push(details); };
  const interaction = {
    user: { id: "member-1" },
    guild: { id: "guild-1", ownerId: "guild-owner" },
    guildId: "guild-1",
    client: {},
    commandName: "menu",
    customId: "dash:member-1:daily"
  };
  for (let index = 0; index < 4; index += 1) {
    await security.recordCooldownAttempt(interaction, { remainingMs: 5000 });
  }
  assert.equal(incidents.length, 0);
  await security.recordCooldownAttempt(interaction, { remainingMs: 5000 });
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].category, "repeated_cooldown_bypass");
  assert.equal(writes.length, 5);
});

test("slash command burst is rate-limited without granting Administrator access", async () => {
  const { SecurityService } = require("../src/services/security");
  const security = new SecurityService({}, {});
  security.isAboveBotRole = async () => false;
  const incidents = [];
  security.createIncident = (_client, details) => { incidents.push(details); return Promise.resolve(); };
  const interaction = {
    user: { id: "regular-admin" },
    guild: { id: "guild-1", ownerId: "guild-owner" },
    guildId: "guild-1",
    client: {},
    commandName: "menu",
    memberPermissions: { has: () => true }
  };
  for (let index = 0; index < 8; index += 1) {
    assert.equal((await security.checkCommandRate(interaction)).allowed, true);
  }
  assert.equal((await security.checkCommandRate(interaction)).allowed, false);
  assert.equal(security.isOwner(interaction.user.id, interaction.guild.ownerId), false);
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].category, "command_spam");
});


test("members with a higher role than the bot are excluded from security monitoring", async () => {
  const { SecurityService } = require("../src/services/security");
  const security = new SecurityService({}, {});
  const makeGuild = (id, comparison) => ({
    id,
    ownerId: "guild-owner",
    members: {
      me: { roles: { highest: { id: "bot-role" } } },
      fetch: async (userId) => ({
        id: userId,
        roles: { highest: { comparePositionTo: () => comparison } }
      })
    }
  });

  assert.equal(await security.isAboveBotRole(makeGuild("g-high", 1), "staff-member"), true);
  assert.equal(await security.isAboveBotRole(makeGuild("g-low", -1), "regular-member"), false);
  assert.equal(await security.isAboveBotRole(makeGuild("g-owner", -1), "guild-owner"), true);
});

test("higher-ranked members are not rate-limited, cooldown-logged or escalated", async () => {
  const { SecurityService } = require("../src/services/security");
  const writes = [];
  const pool = { query: async (...args) => { writes.push(args); return { rowCount: 1, rows: [] }; } };
  const security = new SecurityService(pool, {});
  security.isAboveBotRole = async () => true;
  const incidents = [];
  security.createIncident = async (_client, input) => { incidents.push(input); };

  const interaction = {
    user: { id: "senior-staff" },
    guild: { id: "guild-1", ownerId: "guild-owner" },
    guildId: "guild-1",
    client: {},
    commandName: "menu",
    customId: "dash:senior-staff:daily"
  };

  for (let index = 0; index < 15; index += 1) {
    assert.equal((await security.checkCommandRate(interaction)).allowed, true);
    assert.equal((await security.checkComponentRate(interaction)).allowed, true);
  }
  await security.recordCooldownAttempt(interaction, { remainingMs: 5000 });
  await security.recordUnauthorizedAdminAttempt(interaction);
  await security.recordUnauthorizedControlAttempt(interaction, interaction.customId);

  assert.equal(writes.length, 0);
  assert.equal(incidents.length, 0);
});

test("security alert refuses bot restrictions or timeouts against a higher-ranked member", async () => {
  const { SecurityService } = require("../src/services/security");
  const writes = [];
  const pool = {
    query: async (sql, params) => {
      writes.push({ sql, params });
      if (String(sql).includes("SELECT id, user_id FROM security_incidents")) {
        return { rowCount: 1, rows: [{ id: "12", user_id: "senior-staff" }] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
  const security = new SecurityService(pool, {});
  security.isAboveBotRole = async (_guild, userId) => userId === "senior-staff";

  let reply;
  const interaction = {
    customId: "security:12:guild-1:senior-staff:timeout",
    guildId: "guild-1",
    user: { id: "guild-owner" },
    guild: { id: "guild-1", ownerId: "guild-owner" },
    reply: async (value) => { reply = value; }
  };

  await security.handleAlertInteraction(interaction);
  assert.match(reply.content, /No action was taken/);
  assert.equal(writes.length, 1);
});
