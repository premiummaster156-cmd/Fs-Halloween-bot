const test = require("node:test");
const assert = require("node:assert/strict");
const { formatMemberActivityLog } = require("../src/commands/dashboard");

test("member activity logs render readable game cards instead of raw JSON", () => {
  const embed = formatMemberActivityLog("work_shift_completed", "Zeld", "1132206944006967399", {
    careerId: "crime_boss",
    correct: 2,
    total: 3,
    pay: 57762,
    xp: 393,
    candy: 2
  });
  assert.match(embed.data.title, /WORK SHIFT COMPLETE/);
  assert.match(embed.data.description, /Zeld/);
  assert.deepEqual(embed.data.fields.map((field) => field.name), ["Career", "Answers", "Pay", "XP", "Candy"]);
  assert.equal(embed.data.fields[2].value, "57,762 FC");
  assert.equal(embed.data.fields[4].value, "+2");
  assert.doesNotMatch(JSON.stringify(embed.data), /"careerId"|"correct"|"total"/);
});

test("crime activity log displays success, reward and success chance as readable values", () => {
  const embed = formatMemberActivityLog("crime_attempt", "Zeld", "1132206944006967399", {
    crimeId: "vault_extraction", succeeded: true, reward: 149743, fine: 0, candy: 0, successChance: 88
  });
  assert.deepEqual(embed.data.fields.map((field) => field.name), ["Operation", "Result", "Reward", "Candy", "Success chance"]);
  assert.equal(embed.data.fields[0].value, "Vault Extraction");
  assert.equal(embed.data.fields[1].value, "SUCCESS");
  assert.equal(embed.data.fields[2].value, "149,743 FC");
});
