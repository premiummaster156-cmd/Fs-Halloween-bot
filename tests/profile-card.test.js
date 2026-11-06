const test = require("node:test");
const assert = require("node:assert/strict");
const { createProfileCard, compact } = require("../src/utils/profile-card");

test("profile card renders a PNG banner with level and XP progress", async () => {
  const image = await createProfileCard({
    user: { username: "Cookie", globalName: "Cookie", displayAvatarURL: () => null },
    player: { level: 87, xp: 3100 },
    rank: 7
  });
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(image.length > 1000);
});

test("profile card abbreviates large values compactly", () => {
  assert.equal(compact(3100), "3.1K");
  assert.equal(compact(8800), "8.8K");
  assert.equal(compact(2500000), "2.5M");
});
