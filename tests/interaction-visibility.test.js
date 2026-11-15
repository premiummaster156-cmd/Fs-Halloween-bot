"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isPrivateCommandReply } = require("../src/utils/interaction-visibility");

test("built-in admin and menu commands are private while public gameplay commands remain public", () => {
  assert.equal(isPrivateCommandReply({ data: { name: "admin-panel" } }, null), true);
  assert.equal(isPrivateCommandReply({ data: { name: "menu" } }, null), true);
  assert.equal(isPrivateCommandReply({ data: { name: "profile" } }, null), false);
  assert.equal(isPrivateCommandReply({ data: { name: "leaderboard" } }, null), false);
});

test("custom command visibility follows the saved response definition", () => {
  assert.equal(isPrivateCommandReply(null, {
    definition: { response: { visibility: "public" } }
  }), false);
  assert.equal(isPrivateCommandReply(null, {
    definition: { response: { visibility: "private" } }
  }), true);
});

test("missing command metadata fails closed with a private response", () => {
  assert.equal(isPrivateCommandReply(null, null), true);
  assert.equal(isPrivateCommandReply(null, { definition: {} }), true);
});
