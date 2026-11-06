const test = require("node:test");
const assert = require("node:assert/strict");
const { createProfileCard, compact } = require("../src/utils/profile-card");

test("profile card renders a PNG banner with level and XP progress", async () => {
  const image = await createProfileCard({
    user: { username: "Cookie", globalName: "Cookie", displayAvatarURL: () => null },
    player: {
      wallet: 4500, bank: 1500, level: 87, xp: 3100, prestige: 2,
      job_level: 7, lifetime_earned: 2500000, crime_successes: 35,
      heists_completed: 9, reputation: 42
    },
    rank: 7,
    stats: {
      career: "Crime Boss", candy: 88, partyWins: 12,
      partyGames: 20, partyPoints: 430, rebirthMultiplier: 1.2
    }
  });
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(image.length > 1000);
});

test("profile card abbreviates large values compactly", () => {
  assert.equal(compact(3100), "3.1K");
  assert.equal(compact(8800), "8.8K");
  assert.equal(compact(2500000), "2.5M");
});
