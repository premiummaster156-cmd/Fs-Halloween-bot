const settings = require("../config/settings");

const settingKeys = new Set([
  "adminRoleId", "logChannelId", "halloweenRoleId", "xpBoosterRoleId",
  "memberCommandsChannelId"
]);

class GuildSettingsService {
  constructor(pool) { this.pool = pool; }

  async get(guildId, key) {
    if (!settingKeys.has(key)) throw new TypeError("Unknown guild setting: " + key);
    const result = await this.pool.query(
      "SELECT setting_value FROM guild_settings WHERE guild_id = $1 AND setting_key = $2",
      [guildId, key]
    );
    if (result.rowCount) {
      const value = result.rows[0].setting_value;
      if (key === "memberCommandsChannelId") return value || settings.memberCommandsChannelId || null;
      return value;
    }
    if (key === "adminRoleId") return settings.adminRoleIds[0] || null;
    if (key === "logChannelId") return settings.logChannelId || null;
    if (key === "halloweenRoleId") return settings.defaultEventRoleId || null;
    if (key === "memberCommandsChannelId") return settings.memberCommandsChannelId || null;
    return null;
  }

  async getAll(guildId) {
    const result = await this.pool.query(
      "SELECT setting_key, setting_value FROM guild_settings WHERE guild_id = $1 AND setting_key = ANY($2::text[])",
      [guildId, Array.from(settingKeys)]
    );
    const values = Object.fromEntries(result.rows.map((row) => [row.setting_key, row.setting_value]));
    return {
      adminRoleId: Object.hasOwn(values, "adminRoleId") ? values.adminRoleId : settings.adminRoleIds[0] || null,
      logChannelId: Object.hasOwn(values, "logChannelId") ? values.logChannelId : settings.logChannelId || null,
      halloweenRoleId: Object.hasOwn(values, "halloweenRoleId") ? values.halloweenRoleId : settings.defaultEventRoleId || null,
      xpBoosterRoleId: Object.hasOwn(values, "xpBoosterRoleId") ? values.xpBoosterRoleId : null,
      memberCommandsChannelId: values.memberCommandsChannelId || settings.memberCommandsChannelId || null
    };
  }

  async set(guildId, key, value, actorId) {
    if (!settingKeys.has(key)) throw new TypeError("Unknown guild setting: " + key);
    await this.pool.query(
      "INSERT INTO guild_settings (guild_id, setting_key, setting_value, updated_by) VALUES ($1, $2, $3::jsonb, $4) " +
      "ON CONFLICT (guild_id, setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()",
      [guildId, key, JSON.stringify(value), actorId]
    );
  }

  async clear(guildId, key) {
    if (!settingKeys.has(key)) throw new TypeError("Unknown guild setting: " + key);
    await this.pool.query(
      "INSERT INTO guild_settings (guild_id, setting_key, setting_value, updated_by) VALUES ($1, $2, 'null'::jsonb, 'system') " +
      "ON CONFLICT (guild_id, setting_key) DO UPDATE SET setting_value = 'null'::jsonb, updated_at = NOW()",
      [guildId, key]
    );
  }
}

module.exports = { GuildSettingsService, settingKeys };
