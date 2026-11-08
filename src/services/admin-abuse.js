const balancing = require("../config/game-balancing");
const { transaction } = require("../database/pool");
const { ensurePlayerTx } = require("./economy");
const { DomainError, uuid, randomInt } = require("../utils/core");

const PRESETS = Object.freeze({
  blood_moon: { name: "Blood Moon", description: "Crime success chance rises by 12 percentage points and successful crime base rewards rise by 25%.", defaultMinutes: 15 },
  candy_storm: { name: "Candy Storm", description: "Every eligible gameplay reward grants an additional 1–2 Candy while the storm lasts.", defaultMinutes: 10 },
  rift_surge: { name: "Rift Surge", description: "Rift Arena victories award 50% more FC and XP.", defaultMinutes: 15 },
  lucky_block_rain: { name: "Lucky Block Rain", description: "Every player can open one Lucky Block during this event for FC, Candy and a random eligible equipment drop.", defaultMinutes: 20, claimable: true }
});
const MIN_DURATION_MINUTES = 2;
const MAX_DURATION_MINUTES = 60;

function validateAdminAbuseStart(eventType, durationMinutes) {
  const preset = PRESETS[String(eventType || "")];
  if (!preset) throw new DomainError("Choose a valid Admin Abuse event.", "ADMIN_ABUSE_EVENT_INVALID");
  const duration = Math.floor(Number(durationMinutes));
  if (!Number.isInteger(duration) || duration < MIN_DURATION_MINUTES || duration > MAX_DURATION_MINUTES) {
    throw new DomainError("Admin Abuse events must last between 2 and 60 minutes.", "ADMIN_ABUSE_DURATION_INVALID");
  }
  return { eventType: String(eventType), preset, duration };
}

class AdminAbuseService {
  constructor(pool, economy, transactionRunner = transaction) {
    this.pool = pool;
    this.economy = economy;
    this.transactionRunner = transactionRunner;
  }
  presets() { return PRESETS; }
  async getActive(guildId) {
    const result = await this.pool.query(
      "SELECT * FROM admin_abuse_events WHERE guild_id=$1 AND status='active' AND starts_at<=NOW() AND ends_at>NOW() ORDER BY created_at DESC LIMIT 1",
      [guildId]
    );
    return result.rows[0] || null;
  }
  async start(guildId, actorId, eventType, durationMinutes) {
    const input = validateAdminAbuseStart(eventType, durationMinutes);
    return this.transactionRunner(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [guildId, "admin_abuse_event"]);
      await client.query(
        "UPDATE admin_abuse_events SET status='ended',ended_at=NOW(),updated_at=NOW() WHERE guild_id=$1 AND status='active'",
        [guildId]
      );
      const result = await client.query(
        "INSERT INTO admin_abuse_events (id,guild_id,event_type,name,description,status,starts_at,ends_at,created_by) " +
        "VALUES ($1,$2,$3,$4,$5,'active',NOW(),NOW()+($6 * INTERVAL '1 minute'),$7) RETURNING *",
        [uuid(), guildId, input.eventType, input.preset.name, input.preset.description, input.duration, actorId]
      );
      return result.rows[0];
    });
  }
  async stop(guildId) {
    const result = await this.pool.query(
      "UPDATE admin_abuse_events SET status='ended',ended_at=NOW(),updated_at=NOW() WHERE guild_id=$1 AND status='active' AND ends_at>NOW() RETURNING id,name,event_type",
      [guildId]
    );
    return result.rows;
  }
  async claimLuckyDrop(guildId, userId) {
    return this.transactionRunner(async (client) => {
      const active = await client.query(
        "SELECT * FROM admin_abuse_events WHERE guild_id=$1 AND event_type='lucky_block_rain' AND status='active' AND starts_at<=NOW() AND ends_at>NOW() ORDER BY created_at DESC LIMIT 1",
        [guildId]
      );
      const event = active.rows[0];
      if (!event) throw new DomainError("There is no active Lucky Block Rain event.", "ADMIN_ABUSE_DROP_INACTIVE");
      await ensurePlayerTx(client, guildId, userId);
      const player = await client.query("SELECT level FROM players WHERE guild_id=$1 AND user_id=$2 FOR UPDATE", [guildId, userId]);
      const fc = randomInt(1200, 2600);
      const candy = randomInt(1, 3);
      const itemPool = balancing.items.filter(item => !item.boosterOnly && item.type === "equipment" && Number(item.minLevel || 1) <= Number(player.rows[0].level) && Number(item.cost || 0) <= 175000);
      const item = itemPool.length ? itemPool[randomInt(0, itemPool.length - 1)] : null;
      const claim = await client.query(
        "INSERT INTO admin_abuse_claims (guild_id,event_id,user_id,reward_fc,reward_candy,item_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (guild_id,event_id,user_id) DO NOTHING RETURNING user_id",
        [guildId, event.id, userId, fc, candy, item?.id || null]
      );
      if (!claim.rowCount) throw new DomainError("You have already opened your Lucky Block for this event.", "ADMIN_ABUSE_DROP_CLAIMED");
      const earning = await this.economy.mutateTx(client, guildId, userId, fc, "admin_abuse_reward", uuid(), {
        eventId: event.id, eventName: event.name, source: "lucky_block"
      });
      await client.query(
        "INSERT INTO event_wallets (guild_id,user_id,event_id,candy,points) VALUES ($1,$2,$3,$4,0) " +
        "ON CONFLICT (guild_id,user_id,event_id) DO UPDATE SET candy=event_wallets.candy+EXCLUDED.candy,updated_at=NOW()",
        [guildId, userId, balancing.halloween.eventId, candy]
      );
      if (item) {
        await client.query(
          "INSERT INTO inventory (guild_id,user_id,item_id,quantity) VALUES ($1,$2,$3,1) " +
          "ON CONFLICT (guild_id,user_id,item_id) DO UPDATE SET quantity=inventory.quantity+1,updated_at=NOW()",
          [guildId, userId, item.id]
        );
      }
      return { event, amount: earning.delta, candy, item };
    });
  }
}

module.exports = { AdminAbuseService, PRESETS, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES, validateAdminAbuseStart };
