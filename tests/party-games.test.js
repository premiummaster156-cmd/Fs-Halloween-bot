const test = require("node:test");
const assert = require("node:assert/strict");
const party = require("../src/games/party");
const { PartyGameService, DAILY_FORTUNE_COOLDOWN_MS } = require("../src/services/party-games");

test("every trivia question has four unique choices and one correct answer", () => {
  assert.ok(party.TRIVIA_QUESTIONS.length >= 20);
  for (const item of party.TRIVIA_QUESTIONS) {
    assert.equal(item.options.length, 4);
    assert.equal(new Set(item.options).size, 4);
    assert.ok(item.options.includes(item.answer));
  }
});

test("trivia randomizer always retains the correct answer after shuffling", () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const question = party.makeTriviaQuestion();
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.equal(question.options[question.correctIndex], question.answer);
    assert.ok(question.correctIndex >= 0 && question.correctIndex < 4);
  }
});

test("Would You Rather always provides two distinct options", () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const prompt = party.makeWouldYouRather();
    assert.ok(prompt.first.length > 0);
    assert.ok(prompt.second.length > 0);
    assert.notEqual(prompt.first, prompt.second);
  }
});

test("roast generator neutralizes mention pings and returns a complete line", () => {
  const line = party.makeRoast("@everyone Captain", () => 0);
  assert.ok(line.includes("Captain"));
  assert.ok(!line.includes("@everyone"));
  assert.ok(line.length > 20);
});

test("fortune cards contain a title, vibe, mini-mission and warning", () => {
  assert.ok(party.FORTUNES.length >= 10);
  for (const card of party.FORTUNES) {
    assert.ok(card.title);
    assert.ok(card.vibe);
    assert.ok(card.mission);
    assert.ok(card.warning);
  }
  assert.ok(party.makeFortune().title);
  assert.equal(DAILY_FORTUNE_COOLDOWN_MS, 24 * 60 * 60 * 1000);
});

test("Rock-Paper-Scissors resolves all wins, losses and draws correctly", () => {
  assert.equal(party.resolveRps("rock", "rock"), "tie");
  assert.equal(party.resolveRps("paper", "paper"), "tie");
  assert.equal(party.resolveRps("scissors", "scissors"), "tie");
  assert.equal(party.resolveRps("rock", "scissors"), "first");
  assert.equal(party.resolveRps("paper", "rock"), "first");
  assert.equal(party.resolveRps("scissors", "paper"), "first");
  assert.equal(party.resolveRps("scissors", "rock"), "second");
  assert.equal(party.resolveRps("rock", "paper"), "second");
  assert.equal(party.resolveRps("paper", "scissors"), "second");
  assert.throws(() => party.resolveRps("lizard", "spock"), /choices/);
});

test("party stats record only bounded non-negative points and increment win streaks atomically", async () => {
  const calls = [];
  const service = new PartyGameService({
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes("SELECT is_active")) return { rowCount: 1, rows: [{ is_active: false }] };
      return { rowCount: 1, rows: [] };
    }
  }, {});
  await service.record("guild-1", "player-1", { points: 12, won: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /SELECT is_active/);
  assert.match(calls[1].sql, /INSERT INTO party_game_stats/);
  assert.match(calls[1].sql, /current_streak/);
  assert.deepEqual(calls[1].values, ["guild-1", "player-1", 12, 1, 1]);
  await service.record("guild-1", "player-2", { points: 999999, won: false });
  assert.equal(calls[3].values[2], 1000);
  assert.equal(calls[3].values[3], 0);
});

test("active server boosters earn 15% more Party Game points", async () => {
  const inserts = [];
  const pool = {
    query: async (sql, values) => {
      if (sql.includes("SELECT is_active")) return { rowCount: 1, rows: [{ is_active: true }] };
      inserts.push(values);
      return { rowCount: 1, rows: [] };
    }
  };
  const service = new PartyGameService(pool, {});
  await service.record("guild-1", "booster-1", { points: 12, won: true });
  assert.equal(inserts[0][2], Math.floor(12 * (1 + require("../src/config/game-balancing").serverBoosterEffects.partyPointsBonus)));
});

test("party leaderboard and profile queries are scoped to the requested guild and member", async () => {
  const calls = [];
  const service = new PartyGameService({
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rowCount: 0, rows: [] };
    }
  }, {});
  const stats = await service.getStats("guild-2", "player-2");
  const board = await service.leaderboard("guild-2", 99);
  assert.equal(stats.points, 0);
  assert.equal(board.length, 0);
  assert.deepEqual(calls[0].values, ["guild-2", "player-2"]);
  assert.deepEqual(calls[1].values, ["guild-2", 25]);
});


test("Party Games remain available through the game service, not standalone slash shortcuts", () => {
  const { loadCommands } = require("../src/commands");
  const commands = loadCommands();
  assert.deepEqual([...commands.keys()].sort(), ["admin-panel", "leaderboard", "menu", "profile"]);
  assert.ok(require("../src/services/party-games").PartyGameService);
});

test("custom JavaScript command names cannot shadow the new built-in social commands", () => {
  const { validateCommandMeta } = require("../src/services/custom-commands");
  for (const name of ["play", "roast", "fortune"]) {
    assert.throws(() => validateCommandMeta(name, "A conflicting built-in command"), /reserved/);
  }
});
