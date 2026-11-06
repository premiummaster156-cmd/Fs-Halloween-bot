const test = require("node:test");
const assert = require("node:assert/strict");
const { buildActivityLogEmbed } = require("../src/utils/logging");

test("crime activity log is a readable report instead of serialized JSON", () => {
  const embed = buildActivityLogEmbed({
    action: "crime_attempt",
    actorId: "1132206944006967399",
    displayName: "Zeld",
    details: {
      crimeId: "vault_extraction",
      succeeded: true,
      reward: 149743,
      fine: 0,
      candy: 2,
      successChance: 88
    }
  }).toJSON();
  assert.equal(embed.title, "⚔️ OPERATION CLEARED");
  assert.match(embed.description, /Zeld/);
  assert.ok(embed.fields.some((field) => field.name === "Operation" && field.value === "Vault Extraction"));
  assert.ok(embed.fields.some((field) => field.name === "Payout" && field.value.includes("149,743 FC")));
  assert.ok(embed.fields.some((field) => field.name === "Candy" && field.value === "+2"));
  assert.doesNotMatch(embed.description, /crimeId|succeeded|successChance/);
});

test("work shift logs show career, answers, XP, pay and special ability", () => {
  const embed = buildActivityLogEmbed({
    action: "work_shift_completed",
    actorId: "1175411306967355555",
    displayName: "Tommy Gun",
    details: {
      careerId: "smuggler",
      correct: 3,
      total: 3,
      pay: 4181,
      xp: 76,
      candy: 0,
      triggeredAbilities: ["Echo"]
    }
  }).toJSON();
  assert.equal(embed.title, "🧠 WORK SHIFT COMPLETE");
  assert.ok(embed.fields.some((field) => field.name === "Career" && field.value === "Smuggler"));
  assert.ok(embed.fields.some((field) => field.name === "Answers" && field.value === "3/3"));
  assert.ok(embed.fields.some((field) => field.name === "Special ability" && field.value.includes("Echo")));
  assert.doesNotMatch(embed.description, /careerId|triggeredAbilities/);
});

test("activity logger leaves the raw structured event details for the audit table, not the Discord embed", () => {
  const details = { rebirths: 20, multiplier: 11, previousWealth: 9000000 };
  const embed = buildActivityLogEmbed({
    action: "player_rebirth", actorId: "member-1", displayName: "Player", details
  }).toJSON();
  assert.equal(embed.title, "♻️ REBIRTH ASCENDED");
  assert.ok(embed.fields.some((field) => field.name === "Permanent power" && field.value.includes("11×")));
  assert.doesNotMatch(embed.description, /previousWealth/);
});
