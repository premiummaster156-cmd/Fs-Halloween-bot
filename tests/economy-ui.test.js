const test = require("node:test");
const assert = require("node:assert/strict");
const balancing = require("../src/config/game-balancing");
const { renderMenu } = require("../src/commands/dashboard");

test("career dashboard explains each career perk and current promotion progress", async () => {
  const player = { job_id: "street_runner", job_level: 1, job_xp: 50 };
  const payload = await renderMenu("guild-1", "member-1", "career", {
    jobs: {
      view: async () => ({
        player,
        job: balancing.jobs.find((job) => job.id === player.job_id),
        jobs: balancing.jobs
      })
    }
  });
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, "CAREER DESK");
  assert.ok(embed.fields.some((field) => field.name === "Active career perk" && field.value.includes("Work pay +3%")));
  assert.ok(embed.fields.some((field) => field.name === "Career paths" && field.value.includes("Heist success +4 points")));
  assert.ok(embed.fields.some((field) => field.name === "Promotion progress" && field.value.includes("50/235 job XP")));
});

test("casino dashboard shows lifetime performance and recent round receipts", async () => {
  const payload = await renderMenu("guild-1", "member-1", "casino", {
    casino: {
      stats: async () => ({ rounds: 12, wins: 6, wagered: 6000, payout: 5700, net: -300 }),
      history: async () => [{
        round_id: "round-1", game_id: "slots", wager: 500, payout: 2000, net: 1500,
        played_at: new Date("2026-11-05T12:00:00.000Z")
      }]
    }
  });
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.title, "CASINO  /  GAME TABLE");
  assert.ok(embed.fields.some((field) => field.name === "📊 Your casino record" && field.value.includes("50% win rate")));
  assert.ok(embed.fields.some((field) => field.name === "FC performance" && field.value.includes("-300 FC")));
  assert.ok(embed.fields.some((field) => field.name === "Recent rounds" && field.value.includes("Slots")));
});

test("Gear clearly separates Mythic booster items from normal gear and shows automatic reward progress", async () => {
  const special = balancing.items.find((item) => item.id === "booster_crimson_katana");
  const normal = balancing.items.find((item) => !item.boosterOnly && item.type === "equipment");
  const next = balancing.items.find((item) => item.id === "booster_phantom_mask");
  const payload = await renderMenu("guild-1", "member-1", "gear", {
    inventory: {
      getInventory: async () => ({
        items: [
          { item: special, quantity: 1, upgradeLevel: 1, equipped: true },
          { item: normal, quantity: 1, upgradeLevel: 0, equipped: false }
        ],
        equipped: [{ slot: special.slot, item: special }]
      }),
      getEffects: async () => ({ crimeChance: 5, workPayBonus: 0.08 })
    },
    serverBoosters: {
      getStatus: async () => ({
        active: true,
        serverBoostCount: 12,
        personalBoostCount: 1,
        nextItem: next,
        collectionComplete: false,
        unlockedItems: [special]
      })
    }
  });
  const embed = payload.embeds[0].toJSON();
  const specialField = embed.fields.find((field) => field.name.includes("MYTHIC"));
  const normalField = embed.fields.find((field) => field.name.includes("NORMAL EQUIPMENT"));
  const progressField = embed.fields.find((field) => field.name.includes("BOOSTER REWARD PROGRESS"));
  assert.ok(specialField && specialField.value.includes("Crimson Oni Katana"));
  assert.ok(specialField.value.includes("AUTO-EQUIPPED"));
  assert.ok(normalField && normalField.value.includes(normal.name));
  assert.ok(progressField && progressField.value.includes("1/5 MYTHIC rewards"));
  assert.ok(progressField.value.includes("Phantom Shogun Mask"));
  assert.ok(embed.description.includes("MYTHIC"));
  const componentRows = payload.components.map((component) => component.toJSON());
  assert.ok(componentRows.some((row) => row.components.some((button) => button.custom_id?.includes("upgrade-item"))));
});
