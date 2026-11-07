const { EmbedBuilder } = require("discord.js");
const settings = require("../config/settings");

const LEGACY_ACTIVITY_PREFIX = /^Member activity:\s*([a-z0-9_]+)\s*·\s*(.*?)\s*\((\d{15,22})\)\s*·\s*(\{[\s\S]*\})$/i;
const ACTION_LABELS = {
  work_shift_completed: "WORK SHIFT COMPLETE",
  casino_round: "CASINO ROUND",
  bank_deposit: "BANK DEPOSIT",
  bank_withdrawal: "BANK WITHDRAWAL",
  crime_attempt: "CRIME OPERATION",
  heist_completed: "HEIST COMPLETE",
  daily_reward_claimed: "DAILY REWARD CLAIMED",
  member_transfer: "FC TRANSFER",
  halloween_weekly_claimed: "WEEKLY EVENT CLAIMED"
};
const FIELD_LABELS = {
  careerId: "Career",
  crimeId: "Operation",
  game: "Game",
  correct: "Correct answers",
  total: "Total questions",
  pay: "Pay",
  reward: "Reward",
  fine: "Fine",
  xp: "XP",
  candy: "Candy",
  successChance: "Success chance",
  succeeded: "Result",
  wager: "Wager",
  payout: "Payout",
  net: "Net result",
  amount: "Amount",
  messages: "Messages",
  personalBoostCount: "Personal boost number",
  item: "Item",
  level: "Level",
  rebirths: "Rebirths"
};
const MONEY_FIELDS = new Set(["pay", "reward", "fine", "wager", "payout", "net", "amount"]);

function humanize(value) {
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatLegacyActivityLog(content) {
  if (typeof content !== "string") return null;
  const match = content.trim().match(LEGACY_ACTIVITY_PREFIX);
  if (!match) return null;

  const [, action, displayName, actorId, rawDetails] = match;
  let details;
  try {
    details = JSON.parse(rawDetails);
  } catch (_) {
    return null;
  }
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;

  const fields = [];
  const add = (name, value) => {
    if (value === undefined || value === null || value === "") return;
    fields.push({ name, value: String(value).slice(0, 1024), inline: true });
  };

  if (details.careerId) add("Career", humanize(details.careerId));
  if (details.crimeId) add("Operation", humanize(details.crimeId));
  if (details.game) add("Game", humanize(details.game));
  if (details.correct !== undefined && details.total !== undefined) {
    add("Quiz result", Number(details.correct) + " / " + Number(details.total) + " correct");
  }

  for (const [key, value] of Object.entries(details)) {
    if (key === "careerId" || key === "crimeId" || key === "game" || key === "correct" || key === "total") continue;
    const label = FIELD_LABELS[key] || humanize(key);
    let formatted = value;
    if (key === "succeeded") formatted = value ? "SUCCESS" : "FAILED";
    else if (MONEY_FIELDS.has(key) && Number.isFinite(Number(value))) {
      const amount = Number(value).toLocaleString("en-US");
      formatted = key === "net" && Number(value) > 0 ? "+" + amount + " FC" : amount + " FC";
    } else if (key === "xp" && Number.isFinite(Number(value))) {
      formatted = "+" + Number(value).toLocaleString("en-US") + " XP";
    } else if (key === "candy" && Number.isFinite(Number(value))) {
      formatted = "+" + Number(value).toLocaleString("en-US") + " 🍬";
    } else if (key === "successChance" && Number.isFinite(Number(value))) {
      formatted = Number(value) + "%";
    } else if (typeof value === "object") {
      formatted = JSON.stringify(value);
    } else if (typeof value === "boolean") {
      formatted = value ? "Yes" : "No";
    }
    add(label, formatted);
  }

  if (!fields.length) add("Activity", humanize(action));
  return new EmbedBuilder()
    .setColor(settings.brand.primary)
    .setTitle("🎮 FUKISHOKAI  /  " + (ACTION_LABELS[action] || humanize(action)).toUpperCase())
    .setDescription("<@" + actorId + "> · **" + displayName.trim() + "**")
    .addFields(fields.slice(0, 25))
    .setFooter({ text: "ACTIVITY RECORD  •  Structured details, no raw payloads" })
    .setTimestamp();
}

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

async function sendLog(client, guildId, content) {
  try {
    const channelId = await client.services.guildSettings.get(guildId, "logChannelId");
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || channel.guildId !== guildId) return;

    // Legacy activity publishers appended raw JSON to a "Member activity:" line.
    // Normalize that old payload here so it can never be posted as an opaque text dump.
    const legacyActivityEmbed = formatLegacyActivityLog(content);
    if (legacyActivityEmbed) {
      await channel.send({ embeds: [legacyActivityEmbed], allowedMentions: { parse: [] } });
    } else if (content && typeof content === "object") {
      await channel.send({ embeds: [content], allowedMentions: { parse: [] } });
    } else {
      await channel.send({
        content: String(content).slice(0, 1900),
        allowedMentions: { parse: [] }
      });
    }
  } catch (error) {
    log("warn", "Could not send to the server's configured log channel", { guildId, message: error.message });
  }
}

module.exports = { log, audit, sendLog, formatLegacyActivityLog };
