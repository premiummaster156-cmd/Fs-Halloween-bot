const { randomUUID } = require("node:crypto");
const balancing = require("../config/game-balancing");
const { randomInt, uuid, calculateHeistChance, splitReward, DomainError, claimCooldownTx } = require("../utils/core");
const { ensurePlayerTx } = require("../services/economy");
const { transaction } = require("../database/pool");
const { trackActionTx } = require("../services/events");

class HeistsGame {
  constructor(pool, economy, inventory) { this.pool = pool; this.economy = economy; this.inventory = inventory; }
  missions() { return balancing.heists.map((mission) => ({ ...mission })); }

  async create(guildId, userId, missionId) {
    const mission = balancing.heists.find((item) => item.id === missionId);
    if (!mission) throw new DomainError("Choose a valid mission.", "HEIST_MISSION_INVALID");
    const id = randomUUID();
    return transaction(async (client) => {
      await ensurePlayerTx(client, guildId, userId);
      const player = await client.query("SELECT level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      if (Number(player.rows[0].level) < mission.minLevel) throw new DomainError("You need level " + mission.minLevel + " to lead this mission.", "HEIST_LEVEL_REQUIRED");
      await client.query("INSERT INTO heists (id, guild_id, leader_id, mission_id, status) VALUES ($1, $2, $3, $4, 'recruiting')", [id, guildId, userId, mission.id]);
      await client.query("INSERT INTO heist_participants (heist_id, guild_id, user_id, role_id) VALUES ($1, $2, $3, 'planner')", [id, guildId, userId]);
      return { id, mission };
    });
  }

  async join(guildId, userId, heistId, roleId) {
    const role = balancing.heistRoles[roleId];
    if (!role) throw new DomainError("Choose a valid crew role.", "HEIST_ROLE_INVALID");
    return transaction(async (client) => {
      const query = await client.query("SELECT * FROM heists WHERE id = $1 AND guild_id = $2 FOR UPDATE", [heistId, guildId]);
      const heist = query.rows[0];
      if (!heist || heist.status !== "recruiting") throw new DomainError("That heist is not recruiting.", "HEIST_NOT_RECRUITING");
      const mission = balancing.heists.find((item) => item.id === heist.mission_id);
      const current = await client.query("SELECT user_id FROM heist_participants WHERE heist_id = $1", [heistId]);
      if (current.rows.some((row) => row.user_id === userId)) throw new DomainError("You already joined this crew.", "HEIST_ALREADY_JOINED");
      if (current.rowCount >= mission.maxParticipants) throw new DomainError("This crew is full.", "HEIST_CREW_FULL");
      await ensurePlayerTx(client, guildId, userId);
      const player = await client.query("SELECT level FROM players WHERE guild_id = $1 AND user_id = $2 FOR UPDATE", [guildId, userId]);
      if (Number(player.rows[0].level) < mission.minLevel) throw new DomainError("You need level " + mission.minLevel + " to join this mission.", "HEIST_LEVEL_REQUIRED");
      await client.query("INSERT INTO heist_participants (heist_id, guild_id, user_id, role_id) VALUES ($1, $2, $3, $4)", [heistId, guildId, userId, roleId]);
      return { mission, role, count: current.rowCount + 1, maximum: mission.maxParticipants };
    });
  }

  async start(guildId, userId, heistId) {
    return transaction(async (client) => {
      const query = await client.query("SELECT * FROM heists WHERE id = $1 AND guild_id = $2 FOR UPDATE", [heistId, guildId]);
      const heist = query.rows[0];
      if (!heist || heist.status !== "recruiting") throw new DomainError("That heist is not ready to start.", "HEIST_NOT_RECRUITING");
      if (heist.leader_id !== userId) throw new DomainError("Only the heist leader can start it.", "HEIST_NOT_LEADER");
      const mission = balancing.heists.find((item) => item.id === heist.mission_id);
      const crewResult = await client.query(
        "SELECT hp.user_id, hp.role_id, p.level, p.wallet FROM heist_participants hp JOIN players p ON p.guild_id = hp.guild_id AND p.user_id = hp.user_id WHERE hp.heist_id = $1 ORDER BY hp.user_id FOR UPDATE OF p",
        [heistId]
      );
      const crew = crewResult.rows;
      if (crew.length < mission.minParticipants) throw new DomainError("You need at least " + mission.minParticipants + " crew members to start.", "HEIST_CREW_TOO_SMALL");
      for (const member of crew) await claimCooldownTx(client, guildId, member.user_id, "heist", mission.cooldownMs);
      const averageLevel = crew.reduce((sum, member) => sum + Number(member.level), 0) / crew.length;
      const gearByUser = new Map();
      for (const member of crew) {
        const effects = this.inventory ? await this.inventory.getEffectsTx(client, guildId, member.user_id) : {};
        gearByUser.set(member.user_id, effects);
      }
      const uniqueRoles = new Set(crew.map((member) => member.role_id)).size;
      const roleBonus = crew.reduce((sum, member) => {
        const gear = gearByUser.get(member.user_id) || {};
        return sum + balancing.heistRoles[member.role_id].bonus + (gear.heistChance || 0);
      }, 0) + Math.max(0, uniqueRoles - 1) * 2;
      const successChance = calculateHeistChance(mission.baseChance, averageLevel, crew.length, mission.difficulty, roleBonus);
      const roll = randomInt(1, 100);
      const succeeded = roll <= successChance;
      const reference = uuid();
      let totalPayout = 0;
      if (succeeded) {
        totalPayout = randomInt(mission.payoutMin, mission.payoutMax);
        const shares = splitReward(totalPayout, crew.map((member) => member.user_id));
        for (const share of shares) {
          await this.economy.mutateTx(client, guildId, share.userId, share.amount, "heist_reward", reference + ":" + share.userId, { heistId, missionId: mission.id });
          await client.query("UPDATE players SET heists_completed = heists_completed + 1, reputation = LEAST(100, reputation + 2) WHERE guild_id = $1 AND user_id = $2", [guildId, share.userId]);
          await this.economy.addXpTx(client, guildId, share.userId, 40 + mission.difficulty * 20);
          await trackActionTx(client, guildId, share.userId, "heist_success", 1);
          await trackActionTx(client, guildId, share.userId, "wallet_earned", share.amount);
        }
      } else {
        for (const member of crew) {
          const gear = gearByUser.get(member.user_id) || {};
          const fine = Math.min(Number(member.wallet), Math.floor(mission.failPenalty * (1 - (gear.fineReduction || 0))));
          if (fine > 0) await this.economy.mutateTx(client, guildId, member.user_id, -fine, "heist_failed_fine", reference + ":" + member.user_id, { heistId, missionId: mission.id, roll });
          await client.query("UPDATE players SET reputation = GREATEST(-100, reputation - 1) WHERE guild_id = $1 AND user_id = $2", [guildId, member.user_id]);
        }
      }
      await client.query("UPDATE heists SET status = $3, success_chance = $4, roll = $5, total_payout = $6, started_at = NOW(), completed_at = NOW() WHERE id = $1 AND guild_id = $2", [heistId, guildId, succeeded ? "success" : "failed", successChance, roll, totalPayout]);
      return { mission, succeeded, successChance, roll, totalPayout, crew: crew.map((member) => ({ userId: member.user_id, role: member.role_id })) };
    });
  }

  async status(guildId, heistId) {
    const query = await this.pool.query(
      "SELECT h.*, COUNT(hp.user_id)::int AS crew_count FROM heists h LEFT JOIN heist_participants hp ON hp.heist_id = h.id WHERE h.guild_id = $1 AND h.id = $2 GROUP BY h.id",
      [guildId, heistId]
    );
    if (!query.rowCount) throw new DomainError("Heist not found.", "HEIST_NOT_FOUND");
    const members = await this.pool.query("SELECT user_id, role_id FROM heist_participants WHERE heist_id = $1 ORDER BY joined_at", [heistId]);
    return { heist: query.rows[0], crew: members.rows };
  }
}
module.exports = { HeistsGame };
