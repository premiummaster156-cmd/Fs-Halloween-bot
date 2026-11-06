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
      options: {
        getUser: () => selected,
        getMember: () => ({ displayName: "𝕵𝖊𝖘𝖘𝖎" })
      },
      editReply: async (payload) => { response = payload; return payload; }
    };
    const services = {
      partyGames: { getStats: async () => ({ wins: 2, games: 4, points: 30 }) },
      pool: {
        query: async (sql) => sql.includes("SELECT * FROM players")
          ? { rowCount: 1, rows: [player] }
          : sql.includes("SELECT candy FROM event_wallets")
            ? { rowCount: 1, rows: [{ candy: 88 }] }
            : { rowCount: 1, rows: [{ rank: 7 }] }
      }
    };

    await profileCommand.execute(interaction, services);
    assert.ok(response);
    assert.equal(response.content, "");
    assert.equal(response.files.length, 1);
    assert.equal(response.files[0].name, "fukishokai-profile.png");
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


test("profile fetches the guild member so its nickname can be displayed", async () => {
  const user = {
    id: "member-3", username: "bulletismygoat", globalName: "Jessi",
    displayAvatarURL: () => null
  };
  let fetchedId;
  let response;
  const interaction = {
    guildId: "guild-1",
    user,
    guild: { members: { fetch: async (id) => {
      fetchedId = id;
      return { displayName: "𝕵𝖊𝖘𝖘𝖎" };
    } } },
    options: { getUser: () => null, getMember: () => null },
    editReply: async (payload) => { response = payload; return payload; }
  };
  const services = {
    partyGames: { getStats: async () => ({}) },
    pool: {
      query: async (sql) => sql.includes("SELECT * FROM players")
        ? { rowCount: 1, rows: [{ wallet: 0, bank: 0, level: 1, xp: 0, job_id: "street_runner" }] }
        : sql.includes("SELECT candy FROM event_wallets")
          ? { rowCount: 0, rows: [] }
          : { rowCount: 1, rows: [{ rank: 1 }] }
    }
  };
  await profileCommand.execute(interaction, services);
  assert.equal(fetchedId, user.id);
  assert.equal(response.files[0].name, "fukishokai-profile.png");
});
