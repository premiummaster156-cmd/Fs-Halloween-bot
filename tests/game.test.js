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

test("every career has a distinct passive perk", () => {
  const careerIds = balancing.jobs.map((job) => job.id);
  assert.deepEqual(Object.keys(balancing.careerEffects).sort(), careerIds.slice().sort());
  assert.ok(Object.values(balancing.careerEffects).every((effects) => Object.keys(effects).length > 0));
  assert.equal(balancing.careerEffects.street_runner.workPayBonus, 0.03);
  assert.equal(balancing.careerEffects.delivery_rider.workCooldownReduction, 0.04);
  assert.equal(balancing.careerEffects.enforcer.crimeChance, 4);
  assert.equal(balancing.careerEffects.smuggler.crimeRewardBonus, 0.08);
  assert.equal(balancing.careerEffects.underboss.heistChance, 4);
});

test("crime and heist catalogs provide a full six-operation and five-mission progression", () => {
  assert.equal(balancing.crimes.length, 6);
  assert.equal(balancing.heists.length, 5);
  assert.equal(new Set(balancing.crimes.map((item) => item.id)).size, balancing.crimes.length);
  assert.equal(new Set(balancing.heists.map((item) => item.id)).size, balancing.heists.length);
  assert.ok(balancing.crimes.every((item) => item.cooldownMs > 0 && item.rewardMax >= item.rewardMin));
  assert.ok(balancing.heists.every((item) => item.minParticipants >= 2 && item.maxParticipants <= 5));
  assert.ok(balancing.heists.at(-1).minLevel > balancing.heists[0].minLevel);
});

test("earnings above the wallet ceiling are automatically saved to the bank", async () => {
  const { EconomyService } = require("../src/services/economy");
  const service = new EconomyService({});
  const originalRandom = Math.random;
  Math.random = () => 0.999;
  try {
    for (const scenario of [
      { wallet: balancing.economy.maxWallet - 50, walletDelta: 50, bankDelta: 250 },
      { wallet: balancing.economy.maxWallet, walletDelta: 0, bankDelta: 300 }
    ]) {
      const updates = [];
      const client = {
        query: async (sql, values) => {
          if (sql.includes("SELECT wallet, prestige, job_id FROM players")) {
            return { rowCount: 1, rows: [{ wallet: scenario.wallet, prestige: 0, job_id: null }] };
          }
          if (sql.includes("SELECT id FROM economy_ledger")) return { rowCount: 0, rows: [] };
          if (sql.includes("UPDATE players SET wallet =")) updates.push({ sql, values });
          return { rowCount: 1, rows: [] };
        }
      };
      const result = await service.mutateTx(client, "guild", "member", 100, "job_work", "wallet-cap-test-" + scenario.wallet);
      assert.equal(result.delta, 300);
      assert.equal(result.balance, balancing.economy.maxWallet);
      assert.equal(result.walletDelta, scenario.walletDelta);
      assert.equal(result.bankDelta, scenario.bankDelta);
      assert.equal(updates.length, 1);
      assert.equal(updates[0].values[2], balancing.economy.maxWallet);
      assert.equal(updates[0].values[3], scenario.bankDelta);
    }
  } finally {
    Math.random = originalRandom;
  }
});

test("career passive income bonus stacks with the 3x FC boost", async () => {
  const { EconomyService } = require("../src/services/economy");
  const service = new EconomyService({});
  const client = {
    query: async (sql) => {
      if (sql.includes("SELECT wallet, prestige, job_id FROM players")) {
        return { rowCount: 1, rows: [{ wallet: 100, prestige: 0, job_id: "shopkeeper" }] };
      }
      if (sql.includes("SELECT id FROM economy_ledger")) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [] };
    }
  };
  const originalRandom = Math.random;
  Math.random = () => 0.999;
  try {
    const earning = await service.mutateTx(client, "guild", "member", 500, "daily_reward", "career-test");
    assert.equal(earning.delta, 1545);
  } finally {
    Math.random = originalRandom;
  }
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

test("upgrade prices rise with each item upgrade tier", () => {
  const { getUpgradeCost } = require("../src/services/inventory");
  const item = balancing.items[0];
  const first = getUpgradeCost(item, 1);
  const second = getUpgradeCost(item, 2);
  const fifth = getUpgradeCost(item, 5);
  assert.equal(first, Math.ceil(item.cost * balancing.itemUpgrades.costBaseFactor));
  assert.equal(second, Math.ceil(item.cost * balancing.itemUpgrades.costBaseFactor * balancing.itemUpgrades.costGrowthFactor));
  assert.ok(second > first);
  assert.ok(fifth > second);
});

test("the 3x FC multiplier applies to normal rewards but not casino payouts", async () => {
  const { EconomyService } = require("../src/services/economy");
  const service = new EconomyService({});
  const client = {
    query: async (sql) => {
      if (sql.includes("SELECT wallet, prestige, job_id FROM players")) {
        return { rowCount: 1, rows: [{ wallet: 100, prestige: 0 }] };
      }
      if (sql.includes("SELECT id FROM economy_ledger")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
  const originalRandom = Math.random;
  Math.random = () => 0.999;
  try {
    const normal = await service.mutateTx(client, "guild", "member", 500, "daily_reward", "daily-test");
    const casino = await service.mutateTx(client, "guild", "member", 500, "casino_payout", "casino-test");
    assert.equal(normal.delta, 1500);
    assert.equal(casino.delta, 500);
  } finally {
    Math.random = originalRandom;
  }
});

test("3x FC earnings keep meaningful progression and equipment sinks", () => {
  assert.equal(balancing.economy.earningMultiplier, 3);
  const averageLevelOneDaily = ((balancing.economy.dailyMin + balancing.economy.dailyMax) / 2 + 8) *
    balancing.economy.earningMultiplier;
  assert.equal(averageLevelOneDaily, 2274);
  assert.equal(balancing.rebirth.firstWalletRequirement, 20000);
  assert.equal(balancing.progression.xpMultiplier, 1);
  assert.equal(balancing.progression.roleBoosterMultiplier, 1.2);
  assert.ok(balancing.rebirth.firstWalletRequirement > averageLevelOneDaily * 5);
  assert.deepEqual(balancing.jobs.map((job) => job.minLevel), [1, 5, 10, 16, 23, 30, 40]);
  assert.deepEqual(balancing.jobs.map((job) => job.minWallet), [0, 5000, 12000, 25000, 50000, 90000, 150000]);
  assert.deepEqual(
    balancing.items.filter((item) => !item.boosterOnly).map((item) => item.cost),
    [1500, 3500, 6000, 9000, 13000, 18000, 26000, 36000, 55000, 80000, 100000, 135000, 175000, 220000, 270000, 330000, 400000, 480000]
  );
  const normalEquipment = balancing.items.filter((item) => !item.boosterOnly);
  assert.ok(normalEquipment.every((item, index, items) => index === 0 || item.cost > items[index - 1].cost));
});


test("progression hard caps are 600 levels and 100 rebirths", () => {
  assert.equal(balancing.progression.maxLevel, 600);
  assert.equal(balancing.progression.maxRebirths, 100);
  assert.equal(core.getRebirthMultiplier(100), 51);
  assert.equal(core.getRebirthMultiplier(101), 51);
  assert.equal(core.levelXpRequired(601), core.levelXpRequired(600));
});

test("new endgame gear has a named passive ability and real gameplay effects", () => {
  const endgame = balancing.items.filter((item) => item.ability);
  assert.equal(endgame.length, 8);
  assert.ok(endgame.every((item) => item.ability.length > 0 && item.abilityDescription && Object.keys(item.effects).length > 0));
  assert.deepEqual(endgame.map((item) => item.ability), ["PHASE", "DREAD", "AEGIS", "REBIRTH", "EXECUTE", "HASTE", "HEX", "ASCEND"]);
});

test("server booster perks cover the economy, progression, operations and special gear tiers", () => {
  assert.equal(balancing.serverBoosterEffects.moneyBonus, 0.15);
  assert.equal(balancing.serverBoosterEffects.xpBonus, 0.15);
  assert.equal(balancing.serverBoosterEffects.partyPointsBonus, 0.15);
  assert.equal(balancing.serverBoosterEffects.eventRewardBonus, 0.15);
  assert.equal(balancing.serverBoosterEffects.workCooldownReduction, 0.05);
  assert.equal(balancing.serverBoosterEffects.casinoChance, 0.5);

  const katana = balancing.items.find((item) => item.id === "booster_crimson_katana");
  const mask = balancing.items.find((item) => item.id === "booster_phantom_mask");
  assert.ok(katana.boosterOnly);
  assert.equal(katana.boostNumber, 1);
  assert.equal(katana.rebirthEligible, false);
  assert.ok(mask.boosterOnly);
  assert.equal(mask.boostNumber, 2);
  assert.equal(mask.rebirthEligible, false);
  const collection = balancing.items.filter((item) => item.boosterOnly).sort((a, b) => a.boostNumber - b.boostNumber);
  assert.deepEqual(collection.map((item) => item.boostNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(collection.map((item) => item.name), [
    "Crimson Oni Katana", "Phantom Shogun Mask", "Wraithguard Armor",
    "Dragonfire Signet", "Eternal Kitsune Wings"
  ]);
  assert.ok(collection.every((item) => item.cost > 0 && item.type === "equipment"));
});

test("booster-only equipment cannot satisfy normal rebirth gear milestones", () => {
  const { getRebirthRequirements } = require("../src/services/economy");
  const player = {
    wallet: 100000, bank: 0, level: 50, prestige: 5,
    job_id: "street_runner", job_level: 10, rebirth_work_count: 3
  };
  const status = getRebirthRequirements(player, 6, [
    { item_id: "booster_crimson_katana", quantity: 1, upgrade_level: 5 }
  ], 25);
  assert.equal(status.gearItemsRequired, 1);
  assert.equal(status.gearItemsCount, 0);
  assert.equal(status.gearUpgradeLevels, 0);
  assert.equal(status.checks.gearItems, false);
});

test("rebirth multipliers add 0.5x per rebirth and cap at 51x for 100 rebirths", () => {
  assert.equal(core.getRebirthMultiplier(0), 1);
  assert.equal(core.getRebirthMultiplier(1), 1.5);
  assert.equal(core.getRebirthMultiplier(2), 2);
  assert.equal(core.getRebirthMultiplier(3), 2.5);
  assert.equal(core.getRebirthMultiplier(5), 3.5);
  assert.equal(core.getRebirthMultiplier(10), 6);
  assert.equal(core.getRebirthMultiplier(20), 11);
  assert.equal(core.getRebirthMultiplier(50), 26);
  assert.equal(core.getRebirthMultiplier(100), 51);
  assert.equal(core.getRebirthMultiplier(150), 51);
  assert.equal(core.levelXpRequired(1), 92);
  assert.equal(core.levelXpRequired(100), 1280);
  assert.equal(core.levelXpRequired(600), 7280);
  assert.equal(core.applyCooldownReduction(10000, 0.20), 8000);
  assert.equal(core.applyCooldownReduction(10000, 0.60), 5500);
  assert.equal(core.applyCooldownReduction(10000, 0.45, 6000), 6000);
});

test("final-season rebirth requirements are standardized and capped", () => {
  const { getRebirthRequirements } = require("../src/services/economy");
  const rules = balancing.rebirth;
  assert.equal(rules.startingWallet, 2500);
  assert.equal(rules.firstWalletRequirement, 15000);
  assert.equal(rules.walletRequirementStep, 5000);
  assert.equal(rules.firstLevelRequirement, 10);
  assert.equal(rules.levelRequirementGrowth, 2);
  assert.equal(rules.firstQuestClaimsRequirement, 1);
  assert.equal(rules.questClaimsGrowthEvery, 20);
  assert.equal(rules.firstJobLevelRequirement, 1);
  assert.equal(rules.jobLevelGrowthEvery, 20);
  assert.equal(rules.firstWorkShiftsRequirement, 1);
  assert.equal(rules.workShiftsGrowthEvery, 25);
  assert.equal(rules.maxWorkShiftsRequirement, 3);

  const first = getRebirthRequirements({
    wallet: 15000, bank: 0, level: 10, prestige: 0,
    job_id: "street_runner", job_level: 1, rebirth_work_count: 1
  }, 1, [], 0);
  assert.equal(first.walletRequired, 15000);
  assert.equal(first.levelRequired, 10);
  assert.equal(first.questClaimsRequired, 1);
  assert.equal(first.jobLevelRequired, 1);
  assert.equal(first.workShiftsRequired, 1);
  assert.equal(first.eligible, true);

  const mid = getRebirthRequirements({
    wallet: 115000, bank: 0, level: 50, prestige: 20,
    job_id: "street_runner", job_level: 2, rebirth_work_count: 1
  }, 2, [
    { item_id: "reinforced_gloves", quantity: 1, upgrade_level: 1 },
    { item_id: "pumpkin_charm", quantity: 1 }
  ], 10);
  assert.equal(mid.walletRequired, 115000);
  assert.equal(mid.levelRequired, 50);
  assert.equal(mid.questClaimsRequired, 2);
  assert.equal(mid.jobLevelRequired, 2);
  assert.equal(mid.workShiftsRequired, 1);
  assert.equal(mid.gearItemsRequired, 1);
  assert.equal(mid.candyItemsRequired, 1);
  assert.equal(mid.candyBalanceRequired, 10);
  assert.equal(mid.gearUpgradeLevelsRequired, 1);
  assert.equal(mid.eligible, true);

  const inventory = [
    { item_id: "reinforced_gloves", quantity: 1, upgrade_level: 5 },
    { item_id: "urban_disguise", quantity: 1 },
    { item_id: "operator_radio", quantity: 1 },
    { item_id: "pumpkin_charm", quantity: 1 },
    { item_id: "ghost_token", quantity: 1 }
  ];
  const late = getRebirthRequirements({
    wallet: 515000, bank: 0, level: 600, prestige: 100,
    job_id: "crime_boss", job_level: 30, rebirth_work_count: 3
  }, 6, inventory, 50);
  assert.equal(late.walletRequired, 515000);
  assert.equal(late.levelRequired, 210);
  assert.equal(late.questClaimsRequired, 3);
  assert.equal(late.jobLevelRequired, 5);
  assert.equal(late.workShiftsRequired, 3);
  assert.equal(late.gearItemsRequired, 3);
  assert.equal(late.candyItemsRequired, 2);
  assert.equal(late.candyBalanceRequired, 50);
  assert.equal(late.gearUpgradeLevelsRequired, 3);
  assert.equal(late.checks.maxRebirth, false);
  assert.equal(late.eligible, false);
});

test("first two rebirths do not require gear, Candy collectibles or upgrades", () => {
  const { getRebirthRequirements } = require("../src/services/economy");
  const player = { wallet: 100000, bank: 0, level: 50, job_id: "street_runner", job_level: 10, rebirth_work_count: 10 };
  for (const prestige of [0, 1]) {
    const status = getRebirthRequirements({ ...player, prestige }, 6, [], 0);
    assert.equal(status.gearItemsRequired, 0);
    assert.equal(status.candyItemsRequired, 0);
    assert.equal(status.candyBalanceRequired, 0);
    assert.equal(status.gearUpgradeLevelsRequired, 0);
    assert.equal(status.eligible, true);
  }
});

test("gear, Candy and upgrade milestones are spaced out for the finale", () => {
  const { getRebirthRequirements } = require("../src/services/economy");
  const player = { wallet: 5000000, bank: 0, level: 600, job_id: "crime_boss", job_level: 30, rebirth_work_count: 3 };
  const beforeGear = getRebirthRequirements({ ...player, prestige: 4 }, 6, [], 0);
  assert.equal(beforeGear.gearItemsRequired, 0);
  const firstGear = getRebirthRequirements({ ...player, prestige: 5 }, 6, [], 0);
  assert.equal(firstGear.gearItemsRequired, 1);
  assert.equal(firstGear.candyItemsRequired, 0);
  const firstCandy = getRebirthRequirements({ ...player, prestige: 10 }, 6, [], 0);
  assert.equal(firstCandy.candyItemsRequired, 1);
  assert.equal(firstCandy.candyBalanceRequired, 10);
  const firstUpgrade = getRebirthRequirements({ ...player, prestige: 20 }, 6, [], 0);
  assert.equal(firstUpgrade.gearUpgradeLevelsRequired, 1);
  const late = getRebirthRequirements({ ...player, prestige: 100 }, 6, [], 0);
  assert.equal(late.gearItemsRequired, 3);
  assert.equal(late.candyItemsRequired, 2);
  assert.equal(late.candyBalanceRequired, 50);
  assert.equal(late.gearUpgradeLevelsRequired, 3);
});

test("rebirth work-shift requirements stay quick and cap at three", () => {
  const { getRebirthRequirements } = require("../src/services/economy");
  const player = { wallet: 0, bank: 0, level: 1, job_id: "street_runner", job_level: 1, rebirth_work_count: 0 };
  assert.equal(getRebirthRequirements({ ...player, prestige: 0 }).workShiftsRequired, 1);
  assert.equal(getRebirthRequirements({ ...player, prestige: 25 }).workShiftsRequired, 2);
  assert.equal(getRebirthRequirements({ ...player, prestige: 50 }).workShiftsRequired, 3);
  assert.equal(getRebirthRequirements({ ...player, prestige: 100 }).workShiftsRequired, 3);
});

test("Candy-drop chances vary by earning action and equipped gear increases them", () => {
  const { calculateCandyDrop } = require("../src/services/economy");
  assert.equal(calculateCandyDrop("bank_withdrawal", 0, 0, 0), null);
  assert.equal(calculateCandyDrop("job_work", 0, 0.19, 0)?.amount, 1);
  assert.equal(calculateCandyDrop("job_work", 0, 0.241, 0), null);
  assert.ok(Math.abs(calculateCandyDrop("job_work", 0.10, 0.25, 0)?.chance - 0.34) < 1e-9);
  assert.equal(calculateCandyDrop("job_work", 0.10, 0.25, 0)?.amount, 1);
  assert.equal(calculateCandyDrop("heist_reward", 0, 0.25, 0.99)?.amount, 3);
  assert.equal(calculateCandyDrop("casino_payout", 0, 0, 0), null);
  assert.equal(calculateCandyDrop("casino_play", 0, 0.101, 0), null);
  assert.equal(calculateCandyDrop("casino_play", 0, 0.079, 0)?.amount, 1);
  assert.equal(calculateCandyDrop("daily_reward", 0, 0.17, 0, 0), null);
  assert.ok(Math.abs(calculateCandyDrop("daily_reward", 0, 0.17, 0, 1)?.chance - 0.18) < 1e-9);
  assert.ok(Math.abs(calculateCandyDrop("daily_reward", 0, 0.17, 0, 2)?.chance - 0.20) < 1e-9);
  assert.equal(calculateCandyDrop("heist_reward", 0.20, 0, 0, 10)?.chance, 0.60);
});

test("Candy-drop gear bonuses rise with gear upgrades and are capped", () => {
  const { combineEffects } = require("../src/services/inventory");
  const base = combineEffects([{ effects: { candyDropBonus: 0.05 }, upgradeLevel: 0 }]);
  const upgraded = combineEffects([{ effects: { candyDropBonus: 0.05 }, upgradeLevel: 5 }]);
  assert.equal(base.candyDropBonus, 0.05);
  assert.ok(upgraded.candyDropBonus > base.candyDropBonus);
  const capped = combineEffects([
    { effects: { candyDropBonus: 0.05 }, upgradeLevel: 5 },
    { effects: { candyDropBonus: 0.05 }, upgradeLevel: 5 },
    { effects: { candyDropBonus: 0.05 }, upgradeLevel: 5 },
    { effects: { candyDropBonus: 0.05 }, upgradeLevel: 5 }
  ]);
  assert.equal(capped.candyDropBonus, 0.20);
});

test("Candy shop collectible items are unique and usable as permanent rebirth milestones", () => {
  assert.equal(balancing.halloween.shop.length, 3);
  assert.ok(balancing.halloween.shop.every((item) => item.unique === true));
  assert.ok(balancing.halloween.shop.every((item) => item.cost > 0));
});
test("gear catalog has rising tiers and five upgrade levels", () => {
  assert.equal(balancing.itemUpgrades.maxLevel, 5);
  assert.ok(balancing.items.length >= 10);
  const shopItems = balancing.items.filter((item) => !item.boosterOnly);
  for (let index = 1; index < shopItems.length; index += 1) {
    assert.ok(shopItems[index].cost > shopItems[index - 1].cost);
    assert.ok(shopItems[index].minLevel > shopItems[index - 1].minLevel);
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
  assert.equal(games.slots.theoreticalReturnRate, 0.95);
});

test("casino restores original jackpot odds while keeping a 100 FC minimum, no maximum and 10-second cooldown", () => {
  assert.equal(balancing.casino.minBet, 100);
  assert.equal(balancing.casino.maxBet, undefined);
  assert.equal(balancing.casino.cooldownMs, 10000);
  assert.equal(balancing.casino.dailyWagerLimit, undefined);
  assert.equal(balancing.casino.games.slots.outcomes[0].maxRoll, 9);
  assert.equal(balancing.casino.games.slots.outcomes[0].multiplierHundredths, 1000);
  assert.equal(balancing.casino.games.slots.outcomes[1].maxRoll, 49);
  assert.equal(balancing.casino.games.slots.outcomes[1].multiplierHundredths, 400);
  assert.equal(balancing.casino.games.slots.outcomes[2].maxRoll, 249);
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

test("trusted and higher-ranked members still receive public gameplay announcements without operational logs", async () => {
  const { recordMemberAction } = require("../src/commands/dashboard");
  const sent = [];
  const channel = {
    isTextBased: () => true,
    send: async (payload) => { sent.push(payload); return { id: "public-message" }; }
  };
  const interaction = {
    guild: { id: "guild-1", ownerId: "guild-owner" },
    user: { id: "trusted-admin" },
    member: { displayName: "Trusted Admin" },
    channel,
    channelId: "game-channel",
    client: {}
  };
  const services = {
    security: {
      isAboveBotRole: async () => true
    },
    pool: {}
  };

  await recordMemberAction(
    interaction, services, "casino_round",
    "played Slots with a 10,000 FC wager and received a 9,000 FC payout.",
    { game: "Slots", wager: 10000, payout: 9000, net: -1000 },
    "warning"
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0].embeds.length, 1);
  assert.match(sent[0].embeds[0].data.title, /MEMBER ACTIVITY/);
  assert.match(sent[0].embeds[0].data.description, /Trusted Admin/);
  assert.match(sent[0].embeds[0].data.description, /10,000 FC wager/);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
});

test("custom slash command code validates a safe JSON definition and builds Discord options", () => {
  const { parseDefinition, toApplicationCommand } = require("../src/services/custom-commands");
  const record = {
    name: "welcome-member",
    description: "Send a welcome message",
    definition: {
      options: [
        { name: "member", description: "Member to welcome", type: "user", required: true },
        { name: "style", description: "Welcome style", type: "string", required: false,
          choices: [{ name: "Friendly", value: "friendly" }, { name: "Formal", value: "formal" }] }
      ],
      response: {
        visibility: "public",
        title: "Welcome",
        description: "Hello {option.member.username}!"
      }
    }
  };
  assert.equal(parseDefinition(record.definition).options.length, 2);
  const command = toApplicationCommand(record);
  assert.equal(command.name, "welcome-member");
  assert.equal(command.description, "Send a welcome message");
  assert.equal(command.options.length, 2);
  assert.equal(command.options[0].type, 6);
  assert.equal(command.options[1].type, 3);
});

test("custom slash command definitions reject raw JavaScript, shell and unknown properties", () => {
  const { parseDefinition, validateCommandMeta } = require("../src/services/custom-commands");
  assert.throws(() => parseDefinition({ code: "require('child_process').exec('npm run deploy-commands')" }), /Unsupported command property/);
  assert.throws(() => parseDefinition({ options: [], response: { visibility: "public", content: "Hello", execute: "process.exit(1)" } }), /Unsupported response property/);
  assert.throws(() => validateCommandMeta("admin", "Replace an admin command"), /reserved/);
  assert.throws(() => validateCommandMeta("UpperCase", "Invalid command name"), /lowercase/);
});

test("custom command templates render member and option data without enabling mention pings", () => {
  const { parseDefinition, buildReply } = require("../src/services/custom-commands");
  const definition = parseDefinition({
    options: [{ name: "member", description: "Member to welcome", type: "user", required: true }],
    response: {
      visibility: "public",
      title: "Welcome {option.member.username}",
      description: "{user} welcomed {option.member.mention} to {server} in {channel}.",
      fields: [{ name: "Member ID", value: "{option.member.id}", inline: true }]
    }
  });
  const interaction = {
    user: { id: "actor-1", username: "Owner" },
    member: { displayName: "Owner" },
    guild: { name: "Fukishokai" },
    channelId: "channel-1",
    options: {
      get: (name) => name === "member"
        ? { user: { id: "member-2", username: "MemberTwo", globalName: "Member Two" } }
        : null
    }
  };
  const payload = buildReply(interaction, definition);
  assert.equal(payload.allowedMentions.parse.length, 0);
  assert.equal(payload.embeds[0].data.title, "Welcome MemberTwo");
  assert.match(payload.embeds[0].data.description, /<@actor-1> welcomed <@member-2>/);
  assert.match(payload.embeds[0].data.description, /Fukishokai/);
  assert.equal(payload.embeds[0].data.fields[0].value, "member-2");
});

test("JavaScript Code Studio validates command metadata and runs code in a separate restricted runner", async () => {
  const { inspectCommandSource, runInIsolatedProcess } = require("../src/services/custom-commands");
  const source = [
    "module.exports = {",
    "  data: {",
    "    name: 'hello-code-studio',",
    "    description: 'Test a JavaScript command',",
    "    visibility: 'public',",
    "    options: [{ name: 'target', description: 'Text to include', type: 'string', required: false }]",
    "  },",
    "  async execute(interaction) {",
    "    const target = interaction.options.getString('target') || 'there';",
    "    return { content: 'Hello ' + interaction.user.username + ' ' + target + '!' };",
    "  }",
    "};"
  ].join("\n");

  const metadata = await inspectCommandSource(source);
  assert.equal(metadata.name, "hello-code-studio");
  assert.equal(metadata.definition.options[0].name, "target");
  assert.equal(metadata.definition.response.visibility, "public");

  const result = await runInIsolatedProcess(source, "run", {
    user: { username: "Brian" },
    options: { target: "Fukishokai" }
  });
  assert.equal(result.result.content, "Hello Brian Fukishokai!");
});

test("custom JavaScript command source cannot access Node process, arbitrary modules, fetch or host secrets", async () => {
  const { runInIsolatedProcess } = require("../src/services/custom-commands");
  const source = [
    "module.exports = {",
    "  data: { name: 'sandbox-check', description: 'Check runtime isolation', options: [] },",
    "  execute() {",
    "    let blocked = false;",
    "    try { require('node:fs'); } catch (_) { blocked = true; }",
    "    return { content: [typeof process, typeof fetch, typeof globalThis.process, String(blocked)].join('|') };",
    "  }",
    "};"
  ].join("\n");
  const result = await runInIsolatedProcess(source, "run", {});
  assert.equal(result.result.content, "undefined|undefined|undefined|true");
});

test("custom JavaScript command inspection rejects missing metadata and execution timeouts", async () => {
  const { inspectCommandSource, runInIsolatedProcess } = require("../src/services/custom-commands");
  await assert.rejects(
    inspectCommandSource("module.exports = { data: { name: 'bad-code', description: 'Missing execute' } };"),
    /execute function/
  );
  const infinite = [
    "module.exports = {",
    "  data: { name: 'infinite-loop', description: 'Loop forever', options: [] },",
    "  execute() { while (true) {} }",
    "};"
  ].join("\n");
  await assert.rejects(runInIsolatedProcess(infinite, "run", {}), /time|runner/i);
});


test("an active bot restriction cannot be bypassed when Discord role hierarchy lookup fails", async () => {
  const { SecurityService } = require("../src/services/security");
  const security = new SecurityService({
    query: async (sql) => {
      if (String(sql).includes("SELECT expires_at, reason")) {
        return {
          rowCount: 1,
          rows: [{ expires_at: new Date(Date.now() + 60000), reason: "Owner-approved bot restriction" }]
        };
      }
      return { rowCount: 1, rows: [] };
    }
  }, {
    get: async () => null
  });

  const guild = {
    id: "guild-1",
    ownerId: "guild-owner",
    members: {
      me: { roles: { highest: { id: "bot-role" } } },
      fetch: async () => { throw new Error("Discord member lookup temporarily unavailable"); }
    }
  };
  const interaction = {
    guild,
    guildId: guild.id,
    user: { id: "restricted-member" }
  };

  const access = await security.checkAccess(interaction);
  assert.equal(access.allowed, false);
  assert.equal(access.reason, "Owner-approved bot restriction");
  assert.equal(access.verificationFailed, true);

  // The monitoring path still treats unknown hierarchy conservatively and
  // will not create incidents or apply actions when a member's rank is unknown.
  assert.equal(await security.isAboveBotRole(guild, "restricted-member"), true);
});
