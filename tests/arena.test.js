const test = require("node:test");
const assert = require("node:assert/strict");
const { BOSSES, resolveArenaTurn } = require("../src/games/arena");

function battle(overrides = {}) {
  return {
    id: "test-battle",
    status: "active",
    playerHp: 1000,
    playerMaxHp: 1000,
    bossHp: 5000,
    bossMaxHp: 5000,
    turn: 0,
    shield: 0,
    weakenedTurns: 0,
    hexTurns: 0,
    usedAbilities: [],
    ...overrides
  };
}

const boss = { maxHp: 5000, attack: 100 };

test("Rift Arena boss ladder is ordered and level-gated", () => {
  assert.deepEqual(BOSSES.map((item) => item.minLevel), [1, 25, 75, 150, 300, 500]);
  assert.ok(BOSSES.every((item) => item.maxHp > 0 && item.attack > 0 && item.rewardFc > 0));
});

test("PHASE deals bonus damage and avoids the incoming strike", () => {
  const result = resolveArenaTurn(battle(), boss, { action: "ability", ability: "PHASE", damage: 100, bossDamage: 80 });
  assert.equal(result.bossHp, 4875);
  assert.equal(result.playerHp, 1000);
  assert.deepEqual(result.usedAbilities, ["PHASE"]);
});

test("DREAD weakens three incoming boss strikes", () => {
  const result = resolveArenaTurn(battle(), boss, { action: "ability", ability: "DREAD", damage: 100, bossDamage: 100 });
  assert.equal(result.playerHp, 930);
  assert.equal(result.weakenedTurns, 2);
});

test("AEGIS converts its shield into absorbed damage", () => {
  const result = resolveArenaTurn(battle(), boss, { action: "ability", ability: "AEGIS", damage: 100, bossDamage: 100 });
  assert.equal(result.shield, 280);
  assert.equal(result.playerHp, 1000);
});

test("REBIRTH restores health without exceeding maximum vitality", () => {
  const result = resolveArenaTurn(battle({ playerHp: 400 }), boss, { action: "ability", ability: "REBIRTH", damage: 100, bossDamage: 100 });
  assert.equal(result.playerHp, 720);
  const full = resolveArenaTurn(battle(), boss, { action: "ability", ability: "REBIRTH", damage: 100, bossDamage: 100 });
  assert.equal(full.playerHp, 900);
});

test("EXECUTE and ASCEND unleash large boss damage", () => {
  const execute = resolveArenaTurn(battle(), boss, { action: "ability", ability: "EXECUTE", damage: 100, bossDamage: 100 });
  const ascend = resolveArenaTurn(battle(), boss, { action: "ability", ability: "ASCEND", damage: 100, bossDamage: 100 });
  assert.equal(execute.bossHp, 3800);
  assert.equal(ascend.bossHp, 3400);
});

test("HASTE doubles a strike and HEX applies three turns of damage over time", () => {
  const haste = resolveArenaTurn(battle(), boss, { action: "ability", ability: "HASTE", damage: 100, bossDamage: 100 });
  assert.equal(haste.bossHp, 4800);
  const hex = resolveArenaTurn(battle(), boss, { action: "ability", ability: "HEX", damage: 100, bossDamage: 100 });
  assert.equal(hex.bossHp, 4625);
  assert.equal(hex.hexTurns, 2);
});

test("boss defeat and player defeat end the encounter", () => {
  const won = resolveArenaTurn(battle({ bossHp: 90 }), boss, { action: "attack", damage: 100, bossDamage: 100 });
  assert.equal(won.status, "won");
  assert.equal(won.playerHp, 1000);
  const lost = resolveArenaTurn(battle({ playerHp: 30 }), boss, { action: "attack", damage: 100, bossDamage: 100 });
  assert.equal(lost.status, "lost");
  assert.equal(lost.playerHp, 0);
});

test("Rift Arena rejects unknown powers", () => {
  assert.throws(
    () => resolveArenaTurn(battle(), boss, { action: "ability", ability: "INSTANT_WIN", damage: 100, bossDamage: 100 }),
    (error) => error.code === "ARENA_ABILITY_INVALID"
  );
});


test("Rift Arena renders the beveled HUD as a valid PNG", () => {
  const { createArenaCard } = require("../src/utils/arena-card");
  const image = createArenaCard({
    boss: BOSSES[5],
    battle: {
      bossHp: 12000, bossMaxHp: 19000,
      playerHp: 2800, playerMaxHp: 3800,
      turn: 4
    },
    playerLevel: 500
  });
  assert.ok(Buffer.isBuffer(image));
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
});
