const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCommands } = require("../src/commands");
const { leaderboardCommand } = require("../src/commands/gameplay");

test("only the three approved built-in slash commands are registered", () => {
  const commands = loadCommands();
  assert.deepEqual([...commands.keys()].sort(), ["admin-panel", "leaderboard", "menu"]);
  for (const command of commands.values()) {
    assert.doesNotThrow(() => command.data.toJSON());
  }
});

test("the public leaderboard reply does not request ephemeral visibility", async () => {
  let response;
  const interaction = {
    guildId: "guild-1",
    options: { getString: () => "party" },
    editReply: async (payload) => { response = payload; return payload; }
  };
  const services = {
    partyGames: { leaderboard: async () => [] }
  };
  await leaderboardCommand.execute(interaction, services);
  assert.ok(response);
  assert.equal(response.ephemeral, undefined);
  assert.equal(response.flags, undefined);
  assert.match(response.embeds[0].data.description, /No party-game results yet/);
});
