"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { AIMessageMonitor } = require("../src/services/ai-message-monitor");

function makePermissions(names) {
  return { toArray: () => names.slice() };
}

function makeMember(guild, user, role) {
  return {
    id: user.id,
    guild,
    user,
    displayName: "Display " + user.username,
    joinedAt: new Date("2026-10-01T12:00:00.000Z"),
    roles: {
      cache: new Map([
        [guild.id, { id: guild.id, name: "@everyone", position: 0, permissions: makePermissions([]) }],
        [role.id, role]
      ])
    },
    permissionsIn: () => makePermissions(["ViewChannel", "SendMessages", "ManageMessages"])
  };
}

function makeMessage({ reply = null, content = "Can you give me free FC please?" } = {}) {
  const ownerId = "bot-owner";
  const user = {
    id: "member-1",
    username: "player123",
    globalName: "Player One",
    bot: false,
    createdAt: new Date("2025-03-02T00:00:00.000Z")
  };
  const role = { id: "role-mod", name: "Moderator", position: 7, permissions: makePermissions(["ManageMessages", "KickMembers"]) };
  const guild = {
    id: "guild-1",
    name: "Fukishōkai",
    roles: { cache: new Map([[role.id, role]]) },
    members: {
      cache: new Map(),
      async fetch() { return null; }
    }
  };
  const channel = {
    id: "channel-1",
    name: "general",
    type: 0,
    guild,
    parentId: "category-1",
    parent: { name: "Community" },
    permissionOverwrites: { cache: new Map() },
    messages: { async fetch(id) { if (reply && id === reply.id) return reply; throw new Error("not found"); } }
  };
  const member = makeMember(guild, user, role);
  guild.members.cache.set(user.id, member);
  const message = {
    id: "message-1",
    guildId: guild.id,
    channelId: channel.id,
    guild,
    channel,
    member,
    author: user,
    content,
    type: 0,
    system: false,
    webhookId: null,
    createdAt: new Date("2026-11-13T12:00:00.000Z"),
    createdTimestamp: Date.parse("2026-11-13T12:00:00.000Z"),
    url: "https://discord.com/channels/guild-1/channel-1/message-1",
    attachments: { size: 0, values: () => [] },
    mentions: { users: { size: 0 } },
    reference: reply ? { messageId: reply.id } : null
  };
  return { message, guild, channel, member, user, role, ownerId };
}

test("AI Watch sends only high-confidence evidence reports to the configured bot owner", async () => {
  const fixture = makeMessage({
    reply: {
      id: "parent-1",
      guildId: "guild-1",
      channelId: "channel-1",
      author: {
        id: "other-member",
        username: "helper",
        globalName: "Helpful Member",
        bot: false,
        createdAt: new Date("2025-01-01T00:00:00.000Z")
      },
      member: null,
      channel: null,
      content: "You can earn FC with /work; please don't ask for free gifts.",
      url: "https://discord.com/channels/guild-1/channel-1/parent-1",
      createdAt: new Date("2026-11-13T11:59:00.000Z")
    }
  });
  const sent = [];
  const requests = [];
  const monitor = new AIMessageMonitor({
    apiKey: "test-key",
    model: "gpt-oss:20b",
    ownerId: fixture.ownerId,
    dailyLimit: 5,
    pool: { async query() { return { rowCount: 1, rows: [{ request_count: 1 }] }; } },
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return {
        ok: true,
        async json() {
          return {
            message: {
              content: JSON.stringify({
                violation: true,
                category: "fc_begging",
                confidence: 0.96,
                summary: "The member directly requested free FC.",
                evidence: "Can you give me free FC please?",
                recommended_review: "Review the message and surrounding conversation."
              })
            }
          };
        }
      };
    }
  });
  const client = {
    users: {
      async fetch(id) {
        assert.equal(id, fixture.ownerId, "the only DM recipient is the configured bot owner");
        return { async send(payload) { sent.push({ id, payload }); } };
      }
    }
  };

  await monitor.inspect(fixture.message, client);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.model, "gpt-oss:20b");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, fixture.ownerId);
  assert.equal(sent[0].payload.embeds, undefined, "AI reports are concise plain-text DMs");
  assert.match(sent[0].payload.content, /FUKISHŌKAI AI WATCH/);
  assert.match(sent[0].payload.content, /player123/);
  assert.match(sent[0].payload.content, /member-1/);
  assert.match(sent[0].payload.content, /Moderator \(position 7, ID role-mod\)/);
  assert.match(sent[0].payload.content, /Joined server: 2026-10-01/);
  assert.match(sent[0].payload.content, /Account created: 2025-03-02/);
  assert.match(sent[0].payload.content, /Channel: #general/);
  assert.match(sent[0].payload.content, /ManageMessages/);
  assert.match(sent[0].payload.content, /message-1/);
  assert.match(sent[0].payload.content, /parent-1/);
  assert.deepEqual(sent[0].payload.allowedMentions, { parse: [] });

  const modelPrompt = requests[0].body.messages[1].content;
  assert.match(modelPrompt, /repliedTo/);
  assert.match(modelPrompt, /Helpful Member/);
  assert.match(modelPrompt, /role-mod/);
});

test("AI Watch ignores low-confidence or non-violating model results", async () => {
  const fixture = makeMessage();
  let sent = 0;
  const monitor = new AIMessageMonitor({
    apiKey: "test-key",
    model: "gpt-oss:20b",
    ownerId: fixture.ownerId,
    pool: { async query() { return { rowCount: 1, rows: [] }; } },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          message: {
            content: JSON.stringify({
              violation: true,
              category: "fc_begging",
              confidence: 0.55,
              summary: "Possibly asking for FC.",
              evidence: "Ambiguous wording.",
              recommended_review: "Review manually."
            })
          }
        };
      }
    })
  });
  const client = { users: { async fetch() { return { async send() { sent += 1; } }; } } };
  await monitor.inspect(fixture.message, client);
  assert.equal(sent, 0);
});

test("AI Watch respects the persistent daily model-call cap", async () => {
  const fixture = makeMessage();
  let modelCalls = 0;
  const monitor = new AIMessageMonitor({
    apiKey: "test-key",
    model: "gpt-oss:20b",
    ownerId: fixture.ownerId,
    pool: { async query() { return { rowCount: 0, rows: [] }; } },
    fetchImpl: async () => { modelCalls += 1; throw new Error("The model must not be called when over budget."); }
  });
  const client = { users: { async fetch() { throw new Error("No report should be sent."); } } };
  await monitor.inspect(fixture.message, client);
  assert.equal(modelCalls, 0);
});

test("AI Watch candidate gate watches messages but sends only plausible rule-related content to the model", () => {
  const fixture = makeMessage({ content: "What command shows my wallet balance?" });
  const monitor = new AIMessageMonitor({ apiKey: "x", model: "gpt-oss:20b", ownerId: "owner", pool: {} });
  const history = monitor.rememberMessage(fixture.message);
  assert.equal(monitor.isCandidate(fixture.message, history), false);
  fixture.message.content = "Can a moderator send me free FC?";
  assert.equal(monitor.isCandidate(fixture.message, history), true);
  fixture.message.content = "Iltimos, menga bepul FC bering";
  assert.equal(monitor.isCandidate(fixture.message, history), true);
  fixture.message.content = "Дайте мне бесплатные монеты";
  assert.equal(monitor.isCandidate(fixture.message, history), true);
});
