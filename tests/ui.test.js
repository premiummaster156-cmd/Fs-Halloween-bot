const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");
const { respondPrivately } = require("../src/ui");

test("private preflight denial removes a public deferred placeholder and sends an ephemeral follow-up", async () => {
  const calls = [];
  const interaction = {
    deferred: true,
    replied: false,
    ephemeral: false,
    deleteReply: async () => { calls.push("delete"); },
    followUp: async (payload) => { calls.push(["followUp", payload]); return payload; },
    editReply: async () => { calls.push("editReply"); }
  };

  await respondPrivately(interaction, {
    kind: "error",
    title: "Restricted",
    description: "This detail must remain private."
  });

  assert.equal(calls[0], "delete");
  assert.equal(calls[1][0], "followUp");
  assert.equal(calls[1][1].flags, MessageFlags.Ephemeral);
  assert.equal(calls.some((call) => call === "editReply"), false);
});

test("private preflight denial edits an already-ephemeral deferred response", async () => {
  let response;
  const interaction = {
    deferred: true,
    replied: false,
    ephemeral: true,
    editReply: async (payload) => { response = payload; return payload; },
    followUp: async () => { throw new Error("Should not create a follow-up"); }
  };

  await respondPrivately(interaction, { kind: "warning", title: "Wait", description: "Try again." });

  assert.ok(response);
  assert.equal(response.flags, undefined);
  assert.equal(response.embeds.length, 1);
});

test("private preflight denial replies ephemerally when the interaction is not acknowledged", async () => {
  let response;
  const interaction = {
    deferred: false,
    replied: false,
    reply: async (payload) => { response = payload; return payload; }
  };

  await respondPrivately(interaction, { kind: "error", title: "Private", description: "Hidden." });

  assert.equal(response.flags, MessageFlags.Ephemeral);
});
