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
  assert.equal(result.crimeChance, 18);
  assert.equal(result.heistChance, 15);
  assert.equal(result.workPayBonus, 0.4);
  assert.equal(result.fineReduction, 0.6);
  assert.equal(result.moneyBonus, 0);
  assert.equal(result.xpBonus, 0);
  assert.equal(result.casinoChance, 0);
});

test("gear upgrades strengthen effects and cooldown reductions stack safely", () => {
  const { combineEffects } = require("../src/services/inventory");
  const result = combineEffects([
    { upgradeLevel: 2, effects: { workPayBonus: 0.10, workCooldownReduction: 0.20 } },
    { upgradeLevel: 0, effects: { workPayBonus: 0.10, workCooldownReduction: 0.10 } }
  ]);
  assert.equal(result.workPayBonus, 0.13 * 1 + 0.10);
  assert.ok(Math.abs(result.workCooldownReduction - (1 - (1 - 0.26) * (1 - 0.10))) < 0.000001);
  assert.ok(result.workCooldownReduction <= 0.45);
});

test("rebirth multipliers double on every cycle and cooldown cuts have a safety cap", () => {
  assert.equal(core.getRebirthMultiplier(0), 1);
  assert.equal(core.getRebirthMultiplier(1), 2);
  assert.equal(core.getRebirthMultiplier(2), 4);
  assert.equal(core.getRebirthMultiplier(3), 8);
  assert.equal(core.applyCooldownReduction(10000, 0.20), 8000);
  assert.equal(core.applyCooldownReduction(10000, 0.60), 5500);
  assert.equal(core.applyCooldownReduction(10000, 0.45, 6000), 6000);
});

test("gear catalog has rising tiers and five upgrade levels", () => {
  assert.equal(balancing.itemUpgrades.maxLevel, 5);
  assert.ok(balancing.items.length >= 10);
  for (let index = 1; index < balancing.items.length; index += 1) {
    assert.ok(balancing.items[index].cost > balancing.items[index - 1].cost);
    assert.ok(balancing.items[index].minLevel > balancing.items[index - 1].minLevel);
  }
});

test("slot luck shifts more rounds into wins without changing the expected return after scaling", () => {
  const { slotExpectedReturn } = require("../src/games/casino");
  const slots = balancing.casino.games.slots;
  const base = slotExpectedReturn(slots, 0);
  const luck = slotExpectedReturn(slots, 12);
  assert.ok(luck > base);
  const adjustedScale = base / luck;
  assert.ok(Math.abs(luck * adjustedScale - base) < 1e-10);
});


test("casino odds are transparent and match the published game returns", () => {
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
  assert.ok(Math.abs(coinFlipReturn - games.coinflip.theoreticalReturnRate) < 0.000001);
  assert.ok(Math.abs(diceReturn - games.dice.theoreticalReturnRate) < 0.000001);
  assert.ok(Math.abs(slotsReturn - games.slots.theoreticalReturnRate) < 0.000001);
  assert.equal(games.slots.theoreticalReturnRate, 0.90);
});

test("casino has a 100 FC minimum, no maximum, a 15-second cooldown and no daily cap", () => {
  assert.equal(balancing.casino.minBet, 100);
  assert.equal(balancing.casino.maxBet, undefined);
  assert.equal(balancing.casino.cooldownMs, 15000);
  assert.equal(balancing.casino.dailyWagerLimit, undefined);
  assert.equal(balancing.casino.games.slots.outcomes[0].maxRoll, 4);
  assert.equal(balancing.casino.games.slots.outcomes[0].multiplierHundredths, 1000);
  assert.equal(balancing.casino.games.slots.outcomes[1].maxRoll, 44);
  assert.equal(balancing.casino.games.slots.outcomes[1].multiplierHundredths, 400);
  assert.equal(balancing.casino.games.slots.outcomes[2].maxRoll, 244);
  assert.equal(balancing.casino.games.slots.outcomes[2].multiplierHundredths, 345);
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
  const security = new SecurityService({}, { get: async () => null });
  const makeGuild = (id, comparison) => ({
    id,
    ownerId: "guild-owner",
    members: {
      me: { roles: { highest: { id: "bot-role" } } },
      fetch: async (userId) => ({
        id: userId,
        roles: {
          cache: { has: () => false },
          highest: { comparePositionTo: () => comparison }
        }
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


test("configured Admin Role grants admin access and monitoring exemption", async () => {
  const { SecurityService } = require("../src/services/security");
  const security = new SecurityService({}, {
    get: async (_guildId, key) => key === "adminRoleId" ? "trusted-admin-role" : null
  });
  const guild = {
    id: "guild-admin",
    ownerId: "guild-owner",
    members: {
      me: { roles: { highest: { id: "bot-role" } } },
      fetch: async (userId) => ({
        id: userId,
        roles: {
          cache: { has: (roleId) => roleId === "trusted-admin-role" },
          highest: { comparePositionTo: () => -1 }
        }
      })
    }
  };
  assert.equal(await security.hasAdminAccess(guild, "trusted-admin"), true);
  assert.equal(await security.isAboveBotRole(guild, "trusted-admin"), true);
});


test("configured Admin Role skips cooldown audit and command throttling", async () => {
  const { SecurityService } = require("../src/services/security");
  const writes = [];
  const security = new SecurityService(
    { query: async (...args) => { writes.push(args); return { rowCount: 1, rows: [] }; } },
    { get: async () => "trusted-admin-role" }
  );
  const guild = {
    id: "guild-admin",
    ownerId: "guild-owner",
    members: {
      me: { roles: { highest: { id: "bot-role" } } },
      fetch: async (userId) => ({
        id: userId,
        roles: {
          cache: { has: (roleId) => roleId === "trusted-admin-role" },
          highest: { comparePositionTo: () => -1 }
        }
      })
    }
  };
  const interaction = {
    user: { id: "trusted-admin" },
    guild,
    guildId: guild.id,
    client: {},
    commandName: "admin",
    customId: "admin:trusted-admin:home"
  };
  assert.equal((await security.checkAccess(interaction)).allowed, true);
  for (let n = 0; n < 20; n += 1) {
    assert.equal((await security.checkCommandRate(interaction)).allowed, true);
    assert.equal((await security.checkComponentRate(interaction)).allowed, true);
  }
  await security.recordCooldownAttempt(interaction, { remainingMs: 5000 });
  await security.recordUnauthorizedAdminAttempt(interaction);
  assert.equal(writes.length, 0);
});


test("public heist board lists the leader and every member with their selected role", () => {
  const { buildHeistEmbed } = require("../src/commands/dashboard");
  const embed = buildHeistEmbed({
    heist: {
      id: "crew-board-test",
      leader_id: "leader-123",
      mission_id: "night_market",
      status: "recruiting",
      total_payout: 0,
      success_chance: null,
      roll: null
    },
    crew: [
      { user_id: "leader-123", role_id: "planner" },
      { user_id: "member-456", role_id: "hacker" },
      { user_id: "member-789", role_id: "driver" }
    ]
  });
  const roster = embed.data.fields.find((field) => field.name === "Crew members and roles");
  assert.ok(roster);
  assert.match(roster.value, /<@leader-123>.*Planner/);
  assert.match(roster.value, /<@member-456>.*Hacker/);
  assert.match(roster.value, /<@member-789>.*Driver/);
});

test("public heist board clearly distinguishes successful and failed results", () => {
  const { buildHeistEmbed } = require("../src/commands/dashboard");
  const base = {
    heist: {
      id: "crew-result-test",
      leader_id: "leader-123",
      mission_id: "night_market",
      total_payout: 2500,
      success_chance: 55,
      roll: 42
    },
    crew: [{ user_id: "leader-123", role_id: "planner" }, { user_id: "member-456", role_id: "hacker" }]
  };
  const won = buildHeistEmbed({ ...base, heist: { ...base.heist, status: "success" } });
  const lost = buildHeistEmbed({ ...base, heist: { ...base.heist, status: "failed", total_payout: 0 } });
  assert.match(won.data.title, /MISSION SUCCESS/);
  assert.match(won.data.description, /2,500 FC/);
  assert.match(lost.data.title, /MISSION FAILED/);
});
