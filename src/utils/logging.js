const settings = require("../config/settings");

function log(level, message, details) {
  const extra = details ? " " + JSON.stringify(details) : "";
  const line = new Date().toISOString() + " [" + String(level).toUpperCase() + "] " + String(message) + extra;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

async function audit(pool, guildId, actorId, action, targetId = null, details = {}) {
  try {
    await pool.query(
      "INSERT INTO audit_logs (guild_id, actor_id, action, target_id, details) VALUES ($1, $2, $3, $4, $5::jsonb)",
      [guildId, actorId, action, targetId, JSON.stringify(details)]
    );
  } catch (error) {
    log("error", "Failed to write audit log", { action, message: error.message });
  }
}

async function sendLog(client, content) {
  if (!settings.logChannelId) return;
  try {
    const channel = await client.channels.fetch(settings.logChannelId);
    if (channel && channel.isTextBased()) await channel.send({ content: String(content).slice(0, 1900) });
  } catch (error) {
    log("warn", "Could not send to configured log channel", { message: error.message });
  }
}

module.exports = { log, audit, sendLog };
