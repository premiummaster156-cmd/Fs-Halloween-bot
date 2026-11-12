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
  assert.equal(embed.title, "GEAR  /  YOUR ITEMS");
  assert.ok(embed.fields.some((field) => field.name === "⚙️ NORMAL EQUIPMENT" && field.value.includes(item.name)));
  assert.ok(embed.fields.some((field) => field.name === "🧩 EQUIPPED LOADOUT" && field.value.includes(item.name)));
  assert.ok(embed.fields.some((field) => field.name === "⚡ BOOSTER REWARD PROGRESS"));
  assert.ok(embed.fields.some((field) => field.name === "⚙️ ACTIVE BONUSES"));
});

