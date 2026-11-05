const test = require("node:test");
const assert = require("node:assert/strict");
const balancing = require("../src/config/game-balancing");
const { renderMenu } = require("../src/commands/dashboard");

test("bank dashboard shows wallet, savings and recent money movement", async () => {
  const payload = await renderMenu("guild-1", "member-1", "bank", {
    economy: {
      getBalance: async () => ({ wallet: 12000, bank: 45000, total: 57000 }),
      getBankHistory: async () => ({
        transactions: 3, deposited: 50000, withdrawn: 5000,
        recent: [{ reason: "bank_deposit", amount: 5000, created_at: new Date("2026-11-05T12:00:00Z") }]
      })
    }
  });
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, "BANK  /  FINANCES");
  assert.ok(embed.fields.some((field) => field.name === "🏦 Bank savings" && field.value.includes("45,000 FC")));
  assert.ok(embed.fields.some((field) => field.name === "📈 Lifetime bank activity" && field.value.includes("50,000 FC")));
  assert.ok(embed.fields.some((field) => field.name === "🧾 Recent transactions" && field.value.includes("Deposited 5,000 FC")));
});

test("gear dashboard shows loadout capacity, upgrade progress and active bonuses", async () => {
  const item = balancing.items[0];
  const payload = await renderMenu("guild-1", "member-1", "gear", {
    inventory: {
      getInventory: async () => ({
        items: [{ item, quantity: 1, upgradeLevel: 2, equipped: true }],
        equipped: [{ slot: item.slot, item }]
      }),
      getEffects: async () => ({ crimeChance: 3, workPayBonus: 0.1 })
    }
  });
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, "GEAR  /  INVENTORY");
  assert.ok(embed.fields.some((field) => field.name === "🧩 Equipped loadout" && field.value.includes("1/12 slots active")));
  assert.ok(embed.fields.some((field) => field.name === "📊 Collection progress" && field.value.includes("1/12 equipment owned")));
  assert.ok(embed.fields.some((field) => field.name === "⚙️ Active bonuses"));
});

test("rebirth dashboard previews the next cycle and records completed resets", async () => {
  const status = {
    checks: { wealth: true, level: true, quests: true, career: true, careerLevel: true, workShifts: true, gearItems: true, candyItems: true, candyBalance: true, gearUpgrades: true },
    wealth: 40000, walletRequired: 30000, level: 10, levelRequired: 8,
    currentJob: balancing.jobs[0], currentJobLevel: 1, jobLevelRequired: 1,
    questClaimsCount: 1, questClaimsRequired: 1, workShiftsCompleted: 3, workShiftsRequired: 3,
    gearItemsRequired: 0, gearItemsCount: 0, candyItemsRequired: 0, candyItemsCount: 0,
    candyBalanceRequired: 0, candyBalance: 0, gearUpgradeLevelsRequired: 0, gearUpgradeLevels: 0,
    rebirths: 0, multiplier: 1, nextMultiplier: 2,
    nextWalletRequired: 45000, nextLevelRequired: 10, nextQuestClaimsRequired: 2, nextWorkShiftsRequired: 5
  };
  const payload = await renderMenu("guild-1", "member-1", "rebirth", {
    economy: {
      getRebirthStatus: async () => status,
      getRebirthHistory: async () => [{
        created_at: new Date("2026-11-05T12:00:00Z"),
        metadata: { rebirths: 1, previousWallet: 40000, previousBank: 5000, previousLevel: 20 }
      }]
    }
  });
  const embed = payload.embeds[0].toJSON();
  assert.ok(embed.fields.some((field) => field.name === "Next-run preview" && field.value.includes("45,000 FC")));
  assert.ok(embed.fields.some((field) => field.name === "Rebirth history" && field.value.includes("Rebirth 1")));
});
