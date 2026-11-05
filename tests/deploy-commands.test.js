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


test("deployment clears global commands before replacing the target server command set", async () => {
  const { replaceCommandsForGuild } = require("../scripts/deploy-commands");
  const calls = [];
  const result = await replaceCommandsForGuild({
    rest: {
      put: async (route, payload) => {
        calls.push({ type: "clear-global", route, payload });
      }
    },
    clientId: "app-1",
    guildId: "guild-1",
    deployGuild: async (guildId) => {
      calls.push({ type: "replace-guild", guildId });
      return { registeredCount: 3, customCount: 0 };
    }
  });

  assert.deepEqual(calls.map((call) => call.type), ["clear-global", "replace-guild"]);
  assert.deepEqual(calls[0].payload, { body: [] });
  assert.equal(calls[1].guildId, "guild-1");
  assert.deepEqual(result, { registeredCount: 3, customCount: 0 });
});

test("deployment does not proceed to guild registration if global cleanup fails", async () => {
  const { replaceCommandsForGuild } = require("../scripts/deploy-commands");
  let guildDeploymentCalled = false;

  await assert.rejects(
    replaceCommandsForGuild({
      rest: { put: async () => { throw new Error("Discord API unavailable"); } },
      clientId: "app-1",
      guildId: "guild-1",
      deployGuild: async () => { guildDeploymentCalled = true; }
    }),
    /Discord API unavailable/
  );
  assert.equal(guildDeploymentCalled, false);
});
