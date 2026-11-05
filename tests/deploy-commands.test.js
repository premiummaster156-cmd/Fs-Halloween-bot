const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveTargetGuildId } = require("../scripts/deploy-commands");

test("slash command deployment requires an explicit server ID", () => {
  assert.throws(
    () => resolveTargetGuildId({}, ""),
    /Global slash-command deployment is disabled/
  );
});

test("slash command deployment prefers DEPLOY_GUILD_ID when provided", () => {
  assert.equal(
    resolveTargetGuildId({ DEPLOY_GUILD_ID: "123456789012345678" }, "987654321098765432"),
    "123456789012345678"
  );
});

test("slash command deployment accepts configured GUILD_ID", () => {
  assert.equal(resolveTargetGuildId({}, "123456789012345678"), "123456789012345678");
});

test("slash command deployment rejects malformed server IDs", () => {
  assert.throws(
    () => resolveTargetGuildId({ DEPLOY_GUILD_ID: "not-a-discord-id" }, ""),
    /Global slash-command deployment is disabled/
  );
});
