const { DomainError, uuid } = require("../utils/core");
class EconomyEventService {
  constructor(pool) { this.pool = pool; }
  async getActive(guildId) {
    const result = await this.pool.query(
      "SELECT * FROM economy_events WHERE guild_id=$1 AND enabled=TRUE AND starts_at<=NOW() AND ends_at>NOW() ORDER BY created_at DESC LIMIT 1",
      [guildId]);
    return result.rows[0] || null;
  }
  async getLatest(guildId) {
    const result = await this.pool.query(
      "SELECT * FROM economy_events WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 1",
      [guildId]);
    return result.rows[0] || null;
  }
  async start(guildId, actorId, name, multiplier, durationMinutes) {
    const factor=Number(multiplier),duration=Math.floor(Number(durationMinutes));
    const label=String(name||"").trim().slice(0,80);
    if(!label)throw new DomainError("Give the FC party a name.","EVENT_NAME_REQUIRED");
    if(!Number.isFinite(factor)||factor<2||factor>10)throw new DomainError("FC party multiplier must be between 2× and 10×.","EVENT_MULTIPLIER_INVALID");
    if(!Number.isInteger(duration)||duration<5||duration>1440)throw new DomainError("Duration must be between 5 minutes and 24 hours.","EVENT_DURATION_INVALID");
    await this.pool.query("UPDATE economy_events SET enabled=FALSE,updated_at=NOW() WHERE guild_id=$1 AND enabled=TRUE",[guildId]);
    const result=await this.pool.query(
      "INSERT INTO economy_events (id,guild_id,name,multiplier,starts_at,ends_at,enabled,created_by) " +
      "VALUES ($1,$2,$3,$4,NOW(),NOW()+($5 * INTERVAL '1 minute'),TRUE,$6) RETURNING *",
      [uuid(),guildId,label,factor,duration,actorId]);
    return result.rows[0];
  }
  async stop(guildId) {
    const result=await this.pool.query(
      "UPDATE economy_events SET enabled=FALSE,updated_at=NOW() WHERE guild_id=$1 AND enabled=TRUE RETURNING id,name,multiplier",
      [guildId]);
    return result.rows;
  }
}
module.exports={EconomyEventService};
