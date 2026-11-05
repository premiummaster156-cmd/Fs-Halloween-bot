const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCommands } = require("../src/commands");
const { leaderboardCommand, profileCommand } = require("../src/commands/gameplay");

test("the approved built-in slash commands are registered", () => {
  const commands = loadCommands();
  assert.deepEqual([...commands.keys()].sort(), ["admin-panel", "leaderboard", "menu", "profile"]);
  for (const command of commands.values()) {
    assert.doesNotThrow(() => command.data.toJSON());
  }
});

test("profile shows the caller's profile by default and supports another member", async () => {
  const player = {
    wallet: 4500, bank: 1500, level: 5, xp: 100, job_id: "street_runner",
    job_level: 2, prestige: 1, lifetime_earned: 9000
  };
  for (const selected of [null, { id: "member-2", username: "Other", globalName: "Other Member" }]) {
    const caller = { id: "member-1", username: "Caller", globalName: "Caller Name" };
    const displayed = selected || caller;
    let response;
    const interaction = {
      guildId: "guild-1",
      user: caller,
      options: { getUser: () => selected },
      editReply: async (payload) => { response = payload; return payload; }
    };
    const services = {
      pool: {
        query: async (sql) => sql.includes("SELECT * FROM players")
          ? { rowCount: 1, rows: [player] }
          : { rowCount: 1, rows: [] }
      },
      partyGames: { getStats: async () => ({ wins: 2, games: 4, points: 30 }) }
    };

    await profileCommand.execute(interaction, services);
    assert.ok(response);
    assert.match(response.embeds[0].data.title, new RegExp(displayed.globalName));
    assert.match(response.embeds[0].data.fields.map((field) => field.name).join(" "), /Total wealth/);
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
