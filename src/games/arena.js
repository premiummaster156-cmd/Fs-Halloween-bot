const balancing = require("../config/game-balancing");
const { DomainError, uuid, randomInt, claimCooldownTx } = require("../utils/core");
const { ensurePlayerTx, getPlayer } = require("../services/economy");
const { transaction } = require("../database/pool");
const { trackActionTx } = require("../services/events");

const BOSSES = [
  { id: "training_golem", name: "Training Golem", title: "The First Trial", minLevel: 1, maxHp: 500, attack: 22, rewardFc: 500, rewardXp: 50, description: "An ancient construct that tests new challengers." },
  { id: "ashen_knight", name: "Ashen Knight", title: "Keeper of Embers", minLevel: 20, maxHp: 1300, attack: 38, rewardFc: 1200, rewardXp: 90, description: "A fallen champion wrapped in burning steel." },
  { id: "rift_warden", name: "Rift Warden", title: "Gatekeeper of the Deep", minLevel: 40, maxHp: 2600, attack: 58, rewardFc: 2500, rewardXp: 150, description: "A sentinel that bends the arena around its blade." },
  { id: "abyss_wyrm", name: "Abyss Wyrm", title: "The Hollow Serpent", minLevel: 60, maxHp: 4300, attack: 82, rewardFc: 4500, rewardXp: 230, description: "A colossal wyrm that feeds on broken promises." },
  { id: "oni_shogun", name: "Oni Shogun", title: "Lord of the Crimson Gate", minLevel: 80, maxHp: 6300, attack: 112, rewardFc: 7500, rewardXp: 350, description: "A warlord whose armour remembers a thousand duels." },
  { id: "dragon_sovereign", name: "Dragon Sovereign", title: "The Final Ascendant", minLevel: 100, maxHp: 8500, attack: 145, rewardFc: 12000, rewardXp: 500, description: "The final guardian of the Rift, beyond the old world." }
];

const BOSS_COOLDOWN_MS = 20 * 60 * 1000;
const abilityNames = new Set(["PHASE", "DREAD", "AEGIS", "REBIRTH", "EXECUTE", "HASTE", "HEX", "ASCEND"]);

function normalizeBattle(row) {
  if (!row) return null;
  let usedAbilities = row.used_abilities || [];
  if (typeof usedAbilities === "string") {
    try { usedAbilities = JSON.parse(usedAbilities); } catch (_) { usedAbilities = []; }
  }
  return {
    id: row.id,
    bossId: row.boss_id,
    status: row.status,
    playerHp: Number(row.player_hp),
    playerMaxHp: Number(row.player_max_hp),
    bossHp: Number(row.boss_hp),
    bossMaxHp: Number(row.boss_max_hp),
    turn: Number(row.turn || 0),
    shield: Number(row.shield || 0),
    weakenedTurns: Number(row.weakened_turns || 0),
    hexTurns: Number(row.hex_turns || 0),
    usedAbilities: Array.isArray(usedAbilities) ? usedAbilities : [],
    lastEvent: row.last_event || "The encounter begins."
  };
}

function resolveArenaTurn(battle, boss, options = {}) {
  const next = { ...battle, usedAbilities: [...(battle.usedAbilities || [])] };
  const action = options.action || "attack";
  const ability = options.ability || null;
  const baseDamage = Math.max(1, Math.floor(Number(options.damage) || 1));
  const bossDamage = Math.max(1, Math.floor(Number(options.bossDamage) || boss.attack));
  let damage = baseDamage;
  let skipCounter = false;
  let event = "";

  if (action === "ability" && !abilityNames.has(ability)) {
    throw new DomainError("That power is not available in the Rift Arena.", "ARENA_ABILITY_INVALID");
  }
  if (action !== "attack" && action !== "ability") {
    throw new DomainError("Choose an attack or an equipped ability.", "ARENA_ACTION_INVALID");
  }

  if (action === "ability") {
    switch (ability) {
      case "PHASE":
        damage = Math.floor(baseDamage * 1.25);
        skipCounter = true;
        event = "PHASE: you slipped through the counterstrike and hit from the blind side.";
        break;
      case "DREAD":
        next.weakenedTurns = 3;
        event = "DREAD: the boss recoils. Its next three strikes are weakened.";
        break;
      case "AEGIS":
        next.shield = Math.max(Number(next.shield || 0), Math.ceil(next.playerMaxHp * 0.38));
        event = "AEGIS: a barrier formed around you.";
        break;
      case "REBIRTH":
        next.playerHp = Math.min(next.playerMaxHp, next.playerHp + Math.ceil(next.playerMaxHp * 0.42));
        event = "REBIRTH: the Phoenix Core restored your vitality.";
        break;
      case "EXECUTE":
        damage += Math.ceil(next.bossHp * 0.22);
        event = "EXECUTE: a precision strike tore through the boss's guard.";
        break;
      case "HASTE":
        damage *= 2;
        event = "HASTE: you chained two attacks into one opening.";
        break;
      case "HEX":
        next.hexTurns = Math.max(Number(next.hexTurns || 0), 3);
        event = "HEX: a curse attached to the boss.";
        break;
      case "ASCEND":
        damage += Math.ceil(boss.maxHp * 0.30);
        event = "ASCEND: an overwhelming burst of power descended on the arena.";
        break;
    }
    next.usedAbilities.push(ability);
  } else {
    event = "You landed a clean strike.";
  }

  next.bossHp = Math.max(0, next.bossHp - damage);
  let damageText = damage.toLocaleString() + " damage dealt";
  if (next.bossHp > 0 && next.hexTurns > 0) {
    const curseDamage = Math.max(1, Math.ceil(boss.maxHp * 0.055));
    next.bossHp = Math.max(0, next.bossHp - curseDamage);
    next.hexTurns -= 1;
    damageText += " · HEX " + curseDamage.toLocaleString();
  }

  next.turn += 1;
  if (next.bossHp <= 0) {
    next.status = "won";
    next.lastEvent = event + " " + damageText + ". The boss has fallen.";
    return next;
  }

  let incoming = bossDamage;
  if (next.weakenedTurns > 0) {
    incoming = Math.max(1, Math.floor(incoming * 0.70));
    next.weakenedTurns -= 1;
  }
  if (skipCounter) {
    incoming = 0;
  } else if (next.shield > 0) {
    const absorbed = Math.min(next.shield, incoming);
    next.shield -= absorbed;
    incoming -= absorbed;
  }
  next.playerHp = Math.max(0, next.playerHp - incoming);
  if (next.playerHp <= 0) {
    next.status = "lost";
    next.lastEvent = event + " " + damageText + ". The boss overwhelmed you.";
  } else {
    next.status = "active";
    next.lastEvent = event + " " + damageText + (incoming ? ". You took " + incoming.toLocaleString() + " damage." : ". The counterstrike was stopped.");
  }
  return next;
}

class RiftArena {
  constructor(pool, economy, inventory, transactionRunner = transaction) {
    this.pool = pool;
    this.economy = economy;
    this.inventory = inventory;
    this.transactionRunner = transactionRunner;
  }

  bossesForLevel(level) {
    return BOSSES.filter((boss) => Number(level) >= boss.minLevel).map((boss) => ({ ...boss }));
  }

  async getStatus(guildId, userId) {
    const player = await getPlayer(this.pool, guildId, userId);
    const [active, inv] = await Promise.all([
      this.pool.query(
        "SELECT * FROM boss_battles WHERE guild_id = $1 AND user_id = $2 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
        [guildId, userId]
      ),
      this.inventory.getInventory(guildId, userId)
    ]);
    const battle = normalizeBattle(active.rows[0]);
    const boss = battle ? BOSSES.find((entry) => entry.id === battle.bossId) || null : null;
    const equippedAbilities = inv.equipped.map((entry) => entry.item)
      .filter((item) => item && item.ability && abilityNames.has(item.ability))
      .map((item) => ({ id: item.id, name: item.name, ability: item.ability, description: item.abilityDescription || item.description }));
    const unlockedBosses = this.bossesForLevel(player.level);
    const nextBoss = BOSSES.find((entry) => Number(player.level) < entry.minLevel) || null;
    const used = new Set(battle ? battle.usedAbilities : []);
    return {
      playerLevel: Number(player.level),
      battle,
      boss,
      unlockedBosses,
      nextBoss,
      equippedAbilities,
      availableAbilities: equippedAbilities.filter((item) => !used.has(item.ability))
    };
  }

  async start(guildId, userId, bossId) {
    const boss = BOSSES.find((entry) => entry.id === bossId);
    if (!boss) throw new DomainError("Choose a valid Rift boss.", "ARENA_BOSS_INVALID");
    await this.transactionRunner(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const playerResult = await client.query(
        "SELECT level, prestige FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      const player = playerResult.rows[0];
      const active = await client.query(
        "SELECT id FROM boss_battles WHERE guild_id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE",
        [guildId, userId]
      );
      if (active.rowCount) return;
      if (Number(player.level) < boss.minLevel) {
        throw new DomainError("You need level " + boss.minLevel + " to challenge " + boss.name + ".", "ARENA_LEVEL_REQUIRED");
      }
      await claimCooldownTx(client, guildId, userId, "rift_arena", BOSS_COOLDOWN_MS);
      const playerMaxHp = 900 + Number(player.level) * 5 + Number(player.prestige) * 8;
      await client.query(
        "INSERT INTO boss_battles (id, guild_id, user_id, boss_id, status, player_hp, player_max_hp, boss_hp, boss_max_hp) " +
        "VALUES ($1, $2, $3, $4, 'active', $5, $5, $6, $6)",
        [uuid(), guildId, userId, boss.id, playerMaxHp, boss.maxHp]
      );
    });
    return this.getStatus(guildId, userId);
  }

  async act(guildId, userId, action, itemId = null, roleIds = [], expectedTurn = null) {
    const result = await this.transactionRunner(async (client) => {
      const battleResult = await client.query(
        "SELECT * FROM boss_battles WHERE guild_id = $1 AND user_id = $2 AND status = 'active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [guildId, userId]
      );
      if (!battleResult.rowCount) throw new DomainError("You do not have an active Rift battle. Open the Arena and start a boss fight.", "ARENA_NO_ACTIVE_BATTLE");
      const battle = normalizeBattle(battleResult.rows[0]);
      if (expectedTurn !== null && Number(expectedTurn) !== battle.turn) {
        throw new DomainError("That turn has already been resolved. Use the latest Arena controls.", "ARENA_STALE_TURN");
      }
      const boss = BOSSES.find((entry) => entry.id === battle.bossId);
      if (!boss) throw new DomainError("This boss is no longer in the arena catalog.", "ARENA_BOSS_UNAVAILABLE");
      const playerResult = await client.query(
        "SELECT level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE",
        [guildId, userId]
      );
      if (!playerResult.rowCount) throw new DomainError("Your player profile could not be found.", "PLAYER_NOT_FOUND");

      let ability = null;
      if (action === "ability") {
        const owned = await client.query(
          "SELECT e.item_id FROM equipped_items e JOIN inventory i ON i.guild_id = e.guild_id AND i.user_id = e.user_id AND i.item_id = e.item_id " +
          "WHERE e.guild_id = $1 AND e.user_id = $2 AND e.item_id = $3 AND i.quantity > 0 FOR UPDATE OF i",
          [guildId, userId, itemId]
        );
        if (!owned.rowCount) throw new DomainError("Equip the item before using its power.", "ARENA_POWER_NOT_EQUIPPED");
        ability = balancing.items.find((entry) => entry.id === itemId && entry.ability);
        if (!ability || !abilityNames.has(ability.ability)) throw new DomainError("That item does not have an Arena power.", "ARENA_POWER_INVALID");
        if (battle.usedAbilities.includes(ability.ability)) {
          throw new DomainError(ability.ability + " has already been used in this battle.", "ARENA_POWER_SPENT");
        }
      } else if (action !== "attack") {
        throw new DomainError("Choose an attack or an equipped ability.", "ARENA_ACTION_INVALID");
      }

      const level = Number(playerResult.rows[0].level);
      const damage = randomInt(75 + Math.floor(level * 2.0), 105 + Math.floor(level * 2.45));
      const bossDamage = randomInt(Math.max(1, Math.floor(boss.attack * 0.82)), Math.max(2, Math.ceil(boss.attack * 1.18)));
      const next = resolveArenaTurn(battle, { maxHp: boss.maxHp, attack: boss.attack }, {
        action,
        ability: ability ? ability.ability : null,
        damage,
        bossDamage
      });
      const update = await client.query(
        "UPDATE boss_battles SET status = $2, player_hp = $3, boss_hp = $4, turn = $5, shield = $6, weakened_turns = $7, hex_turns = $8, " +
        "used_abilities = $9::jsonb, last_event = $10, updated_at = NOW(), finished_at = CASE WHEN $2 = 'active' THEN NULL ELSE NOW() END " +
        "WHERE id = $1 RETURNING id",
        [battle.id, next.status, next.playerHp, next.bossHp, next.turn, next.shield || 0, next.weakenedTurns || 0, next.hexTurns || 0, JSON.stringify(next.usedAbilities), next.lastEvent]
      );
      let reward = 0;
      let progression = null;
      let adminAbuseEvent = null;
      if (next.status === "won") {
        const liveEventResult = await client.query(
          "SELECT event_type,name FROM admin_abuse_events WHERE guild_id=$1 AND status='active' AND starts_at<=NOW() AND ends_at>NOW() ORDER BY created_at DESC LIMIT 1",
          [guildId]
        );
        adminAbuseEvent = liveEventResult.rows[0] || null;
        const riftBonus = adminAbuseEvent?.event_type === "rift_surge" ? 1.5 : 1;
        const earning = await this.economy.mutateTx(client, guildId, userId, Math.floor(boss.rewardFc * riftBonus), "boss_reward", uuid(), { bossId: boss.id, battleId: battle.id, adminAbuseEvent: adminAbuseEvent?.name || null });
        reward = earning.delta;
        progression = await this.economy.addXpTx(client, guildId, userId, Math.floor(boss.rewardXp * riftBonus), roleIds);
        await trackActionTx(client, guildId, userId, "wallet_earned", reward);
      }
      return { battleId: battle.id, status: next.status, boss, battle: next, reward, baseReward: boss.rewardFc, xp: progression ? progression.gained : 0, progression, adminAbuseEvent: adminAbuseEvent?.name || null };
    });
    return result;
  }

  async escape(guildId, userId) {
    const result = await this.transactionRunner(async (client) => {
      const active = await client.query(
        "SELECT id FROM boss_battles WHERE guild_id = $1 AND user_id = $2 AND status = 'active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        [guildId, userId]
      );
      if (!active.rowCount) throw new DomainError("You do not have an active Rift battle.", "ARENA_NO_ACTIVE_BATTLE");
      await client.query(
        "UPDATE boss_battles SET status = 'escaped', finished_at = NOW(), updated_at = NOW(), last_event = 'You left the Rift before the fight was finished.' WHERE id = $1",
        [active.rows[0].id]
      );
      return { status: "escaped", battleId: active.rows[0].id };
    });
    return result;
  }
}

module.exports = { RiftArena, BOSSES, resolveArenaTurn, BOSS_COOLDOWN_MS };
