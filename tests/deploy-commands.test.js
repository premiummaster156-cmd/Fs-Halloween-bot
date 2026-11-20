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


test("startup command sync updates only the CoopFT guild and includes staff-directory", async () => {
  const { Routes, SlashCommandBuilder } = require("discord.js");
  const { registerCoopFTGuildCommands } = require("../src/utils/coopft-command-registration");
  const clientId = "123456789012345678";
  const guildId = "1498271944456540210";
  const commands = new Map([
    ["staff-directory", {
      data: new SlashCommandBuilder()
        .setName("staff-directory")
        .setDescription("Manage the CoopFT staff directory.")
    }]
  ]);
  const calls = [];
  const rest = {
    put: async (route, payload) => {
      calls.push({ route, payload });
    }
  };

  const result = await registerCoopFTGuildCommands({ rest, clientId, guildId, commands });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, Routes.applicationGuildCommands(clientId, guildId));
  assert.notEqual(calls[0].route, Routes.applicationCommands(clientId));
  assert.deepEqual(calls[0].payload.body.map((command) => command.name), ["staff-directory"]);
  assert.equal(result.guildId, guildId);
  assert.equal(result.registeredCount, 1);
});

test("startup command sync rejects an invalid guild ID before making a Discord request", async () => {
  const { registerCoopFTGuildCommands } = require("../src/utils/coopft-command-registration");
  let requested = false;
  await assert.rejects(
    registerCoopFTGuildCommands({
      rest: { put: async () => { requested = true; } },
      clientId: "123456789012345678",
      guildId: "not-a-guild",
      commands: new Map()
    }),
    /valid CoopFT guild ID/
  );
  assert.equal(requested, false);
});
