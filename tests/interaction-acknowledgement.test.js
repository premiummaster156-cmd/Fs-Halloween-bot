const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const { respondPrivate } = require("../src/ui");

test("private denial edits an interaction that was already deferred privately", async () => {
  const calls = [];
  const interaction = {
    deferred: true,
    ephemeral: true,
    editReply: async (payload) => { calls.push(["editReply", payload]); return payload; },
    followUp: async () => { throw new Error("should not send a second response"); }
  };

  await respondPrivate(interaction, { kind: "error", title: "Denied", description: "Private details" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "editReply");
  assert.match(calls[0][1].embeds[0].data.description, /Private details/);
});

test("private denial removes a public deferred placeholder before following up privately", async () => {
  const calls = [];
  const interaction = {
    deferred: true,
    ephemeral: false,
    deleteReply: async () => { calls.push("deleteReply"); },
    followUp: async (payload) => { calls.push(["followUp", payload]); return payload; }
  };

  await respondPrivate(interaction, { kind: "error", title: "Denied", description: "Private details" });

  assert.equal(calls[0], "deleteReply");
  assert.equal(calls[1][0], "followUp");
  assert.equal(calls[1][1].flags, MessageFlags.Ephemeral);
  assert.match(calls[1][1].embeds[0].data.description, /Private details/);
});

test("private denial uses a generic public fallback if deferred reply deletion fails", async () => {
  const calls = [];
  const interaction = {
    deferred: true,
    ephemeral: false,
    deleteReply: async () => { throw new Error("Discord API failure"); },
    editReply: async (payload) => { calls.push(["editReply", payload]); return payload; },
    followUp: async (payload) => { calls.push(["followUp", payload]); return payload; }
  };

  await respondPrivate(interaction, { kind: "error", title: "Denied", description: "Private details" });

  assert.equal(calls[0][0], "editReply");
  assert.match(calls[0][1].content, /private reply/);
  assert.equal(calls[1][0], "followUp");
  assert.equal(calls[1][1].flags, MessageFlags.Ephemeral);
  assert.match(calls[1][1].embeds[0].data.description, /Private details/);
});

test("private denial replies ephemerally when the interaction has not been acknowledged", async () => {
  let response;
  const interaction = {
    deferred: false,
    replied: false,
    reply: async (payload) => { response = payload; return payload; }
  };

  await respondPrivate(interaction, { kind: "warning", title: "Slow down", description: "Wait" });

  assert.equal(response.flags, MessageFlags.Ephemeral);
  assert.match(response.embeds[0].data.description, /Wait/);
});

test("main acknowledges built-in slash commands before database-backed preflight checks", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../src/index"), "utf8");
  const commandStart = source.indexOf("if (!interaction.isChatInputCommand()) return;");
  assert.ok(commandStart >= 0, "chat-input command handler should exist");
  const commandSource = source.slice(commandStart);
  const ack = commandSource.indexOf("await interaction.deferReply(privateReply");
  const adminCheck = commandSource.indexOf("await security.hasAdminAccess(interaction.guild");
  const accessCheck = commandSource.indexOf("await security.checkAccess(interaction)");
  const rateCheck = commandSource.indexOf("await security.checkCommandRate(interaction)");
  const channelCheck = commandSource.indexOf('await guildSettings.get(interaction.guildId, "memberCommandsChannelId")');

  assert.ok(ack >= 0);
  assert.ok(adminCheck > ack);
  assert.ok(accessCheck > ack);
  assert.ok(rateCheck > ack);
  assert.ok(channelCheck > ack);
});
