const test = require("node:test");
const assert = require("node:assert/strict");
const { sendCandyDropNotification } = require("../src/utils/member-notifications");

test("Candy-drop notifications go to the admin-configured commands channel", async () => {
  const sent = [];
  const fetched = [];
  const channel = {
    isTextBased: () => true,
    send: async (payload) => { sent.push(payload); return payload; }
  };
  const client = { channels: { fetch: async (id) => { fetched.push(id); return channel; } } };
  const guildSettings = { get: async (_guildId, key) => {
    assert.equal(key, "memberCommandsChannelId");
    return "configured-channel";
  } };
  const result = await sendCandyDropNotification(client, guildSettings, "guild-1", "member-1", 2);
  assert.deepEqual(result, { sent: true, channelId: "configured-channel" });
  assert.deepEqual(fetched, ["configured-channel"]);
  assert.match(sent[0].content, /<@member-1> found \*\*2 Candy\*\*!/);
  assert.deepEqual(sent[0].allowedMentions, { users: ["member-1"] });
});

test("Candy-drop notifications skip a missing or non-text configured channel", async () => {
  const result = await sendCandyDropNotification(
    { channels: { fetch: async () => null } },
    { get: async () => "missing-channel" },
    "guild-1", "member-1", 1
  );
  assert.equal(result.sent, false);
  assert.equal(result.reason, "channel_unavailable");
});
