"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const {
  isModalLaunchInteraction,
  acknowledgeDashboardInteraction
} = require("../src/utils/dashboard-interactions");

function fakeInteraction(customId, kind = "button") {
  const calls = [];
  const interaction = {
    customId,
    deferred: false,
    replied: false,
    ephemeral: false,
    isRepliable: () => true,
    isButton: () => kind === "button",
    isAnySelectMenu: () => kind === "select",
    isModalSubmit: () => kind === "modal",
    deferUpdate: async () => { calls.push("deferUpdate"); interaction.deferred = true; },
    deferReply: async (payload) => { calls.push(["deferReply", payload]); interaction.deferred = true; interaction.ephemeral = true; },
    update: async (payload) => { calls.push(["update", payload]); interaction.replied = true; },
    editReply: async (payload) => { calls.push(["editReply", payload]); return payload; },
    reply: async (payload) => { calls.push(["reply", payload]); interaction.replied = true; },
    followUp: async (payload) => { calls.push(["followUp", payload]); return payload; }
  };
  return { interaction, calls };
}

test("modal-launch buttons remain unacknowledged so showModal can be the initial response", async () => {
  for (const customId of [
    "admin:owner:fc-party-start",
    "admin:owner:dm-send-all",
    "admin:owner:grant-fc:member",
    "admin:owner:exclude:member",
    "dash:owner:leaderboard-search",
    "dash:owner:deposit",
    "dash:owner:casino-slots",
    "dash:owner:heist-start"
  ]) {
    const { interaction } = fakeInteraction(customId);
    assert.equal(isModalLaunchInteraction(interaction), true, customId);
    await assert.rejects(acknowledgeDashboardInteraction(interaction), /must not be acknowledged/);
    assert.equal(interaction.deferred, false);
  }
});

test("modal-launch selects remain unacknowledged", () => {
  for (const customId of ["admin:owner:admin-abuse-type", "admin:owner:career-select:member", "dash:owner:trade-item:trade"]) {
    const { interaction } = fakeInteraction(customId, "select");
    assert.equal(isModalLaunchInteraction(interaction), true, customId);
  }
});

test("ordinary components defer their update and preserve subsequent panel updates", async () => {
  const { interaction, calls } = fakeInteraction("dash:owner:daily");
  const adapted = await acknowledgeDashboardInteraction(interaction);
  assert.equal(calls[0], "deferUpdate");

  await adapted.update({ content: "updated panel" });
  assert.equal(calls[1][0], "editReply");
  await adapted.deferUpdate();
  assert.equal(calls.length, 2);
});

test("private denials after a public component acknowledgement use an ephemeral follow-up", async () => {
  const { interaction, calls } = fakeInteraction("admin:owner:home");
  const adapted = await acknowledgeDashboardInteraction(interaction);
  await adapted.reply({ content: "Access denied", flags: MessageFlags.Ephemeral });
  assert.equal(calls[1][0], "followUp");
  assert.equal(calls[1][1].flags, MessageFlags.Ephemeral);
});

test("modal submissions are deferred privately and the handler's second defer is ignored", async () => {
  const { interaction, calls } = fakeInteraction("dash:owner:bank-modal:deposit", "modal");
  const adapted = await acknowledgeDashboardInteraction(interaction);
  assert.equal(calls[0][0], "deferReply");
  assert.equal(calls[0][1].flags, MessageFlags.Ephemeral);
  await adapted.deferReply({ flags: MessageFlags.Ephemeral });
  assert.equal(calls.length, 1);

  await adapted.reply({ content: "Private validation error", flags: MessageFlags.Ephemeral });
  assert.equal(calls[1][0], "editReply");
});
