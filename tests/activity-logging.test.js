const test = require("node:test");
const assert = require("node:assert/strict");
const { formatLegacyActivityLog, sendLog } = require("../src/utils/logging");

const sample = 'Member activity: work_shift_completed · b. (1230807277594738719) · {"careerId":"enforcer","correct":3,"total":3,"pay":4543,"xp":115,"candy":0}';

test("legacy raw member activity payloads are converted into readable embeds", () => {
  const embed = formatLegacyActivityLog(sample);
  assert.ok(embed);
  assert.match(embed.data.title, /WORK SHIFT COMPLETE/);
  assert.match(embed.data.description, /b\./);
  assert.deepEqual(embed.data.fields.map((field) => field.name), ["Career", "Quiz result", "Pay", "XP", "Candy"]);
  assert.equal(embed.data.fields[0].value, "Enforcer");
  assert.equal(embed.data.fields[1].value, "3 / 3 correct");
  assert.equal(embed.data.fields[2].value, "4,543 FC");
  assert.equal(embed.data.fields[3].value, "+115 XP");
  assert.equal(embed.data.fields[4].value, "+0 🍬");
  assert.doesNotMatch(JSON.stringify(embed.data), /"careerId"|"correct"|"total"/);
});

test("legacy casino payloads display wager, payout and net as separate readable values", () => {
  const embed = formatLegacyActivityLog('Member activity: casino_round · b. (1230807277594738719) · {"game":"Coin Flip","wager":599,"payout":0,"net":-599}');
  assert.deepEqual(embed.data.fields.map((field) => field.name), ["Game", "Wager", "Payout", "Net result"]);
  assert.equal(embed.data.fields[1].value, "599 FC");
  assert.equal(embed.data.fields[2].value, "0 FC");
  assert.equal(embed.data.fields[3].value, "-599 FC");
});

test("sendLog publishes legacy activity as an embed and never as raw JSON text", async () => {
  const sent = [];
  const channel = { guildId: "guild-1", isTextBased: () => true, send: async (payload) => sent.push(payload) };
  const client = {
    services: { guildSettings: { get: async () => "logs-1" } },
    channels: { fetch: async () => channel }
  };
  await sendLog(client, "guild-1", sample);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].embeds.length, 1);
  assert.equal(sent[0].content, undefined);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
});

test("unrecognized log messages retain the normal text fallback", async () => {
  const sent = [];
  const channel = { guildId: "guild-1", isTextBased: () => true, send: async (payload) => sent.push(payload) };
  const client = {
    services: { guildSettings: { get: async () => "logs-1" } },
    channels: { fetch: async () => channel }
  };
  await sendLog(client, "guild-1", "A normal admin log message.");
  assert.equal(sent[0].content, "A normal admin log message.");
  assert.equal(sent[0].embeds, undefined);
});
