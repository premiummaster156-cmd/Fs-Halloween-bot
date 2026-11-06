const { EmbedBuilder } = require("discord.js");
const settings = require("../config/settings");
const balancing = require("../config/game-balancing");

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

function buildActivityLogEmbed({ action, actorId, displayName, details = {}, kind = "success" }) {
  const event = {
    crime_attempt: { title: details.succeeded ? "⚔️ OPERATION CLEARED" : "🛡️ OPERATION BLOCKED", color: details.succeeded ? 0xD97724 : 0xA94442 },
    work_shift_completed: { title: "🧠 WORK SHIFT COMPLETE", color: 0xD97724 },
    daily_reward_claimed: { title: "🎁 DAILY SUPPLY CLAIMED", color: 0xC98736 },
    player_rebirth: { title: "♻️ REBIRTH ASCENDED", color: 0x8B5CF6 },
    career_applied: { title: "💼 CAREER CONTRACT SIGNED", color: 0xD97724 },
    equipment_equipped: { title: "⚙️ LOADOUT UPDATED", color: 0xC98736 },
    equipment_upgraded: { title: "⬆️ GEAR REFORGED", color: 0x8B5CF6 },
    shop_purchase: { title: "🛒 GEAR ACQUIRED", color: 0xD97724 },
    bank_deposit: { title: "🏦 VAULT DEPOSIT", color: 0x3B82A8 },
    bank_withdrawal: { title: "🏦 VAULT WITHDRAWAL", color: 0x3B82A8 },
    heist_completed: { title: "🕵️ CREW OPERATION RESOLVED", color: details.succeeded ? 0xD97724 : 0xA94442 }
  }[action] || {
    title: "◆ " + String(action || "MEMBER ACTIVITY").replace(/_/g, " ").toUpperCase(),
    color: kind === "warning" ? 0xA94442 : kind === "info" ? 0x3B82A8 : 0xD97724
  };

  const fields = [];
  const add = (name, value, inline = true) => {
    if (value === undefined || value === null || value === "") return;
    fields.push({ name, value: String(value).slice(0, 1024), inline });
  };
  const number = (value) => Number(value || 0).toLocaleString("en-US");
  const crime = balancing.crimes.find((item) => item.id === details.crimeId);
  const job = balancing.jobs.find((item) => item.id === (details.careerId || details.jobId));
  const mission = balancing.heists.find((item) => item.id === details.missionId);

  if (action === "crime_attempt") {
    add("Operation", crime?.name || "Unknown operation");
    add("Result", details.succeeded ? "SUCCESS" : "FAILED");
    add(details.succeeded ? "Payout" : "Fine", number(details.succeeded ? details.reward : details.fine) + " FC");
    add("Success odds", Number(details.successChance || 0) + "%");
    add("Candy", details.candy ? "+" + number(details.candy) : "None");
  } else if (action === "work_shift_completed") {
    add("Career", job?.name || String(details.careerId || "Unknown"));
    add("Answers", Number(details.correct || 0) + "/" + Number(details.total || 0));
    add("Pay", "+" + number(details.pay) + " FC");
    add("XP", "+" + number(details.xp));
    add("Candy", details.candy ? "+" + number(details.candy) : "None");
  } else if (action === "player_rebirth") {
    add("Rebirth", "#" + number(details.rebirths));
    add("Permanent power", Number(details.multiplier || 1).toLocaleString("en-US") + "× FC / XP");
    add("Previous wealth", number(details.previousWealth) + " FC");
  } else if (action === "daily_reward_claimed") {
    add("FC", "+" + number(details.amount));
    add("XP", "+" + number(details.xp));
    add("Candy", details.candy ? "+" + number(details.candy) : "None");
  } else if (action === "heist_completed") {
    add("Mission", mission?.name || String(details.missionId || "Unknown mission"));
    add("Result", details.succeeded ? "SUCCESS" : "FAILED");
    add("Crew payout", number(details.totalPayout) + " FC");
    add("Success odds", Number(details.successChance || 0) + "%");
  } else if (action === "career_applied") {
    add("Career", job?.name || String(details.careerName || details.careerId || "Unknown"));
  } else if (action === "bank_deposit" || action === "bank_withdrawal") {
    add("Amount", number(details.amount) + " FC");
  } else if (action === "equipment_equipped" || action === "equipment_upgraded" || action === "shop_purchase") {
    add("Item", String(details.itemName || details.itemId || "Equipment"));
    if (details.upgradeLevel !== undefined) add("Upgrade", "Level " + details.upgradeLevel);
    if (details.cost !== undefined) add("Cost", number(details.cost) + " FC");
  } else {
    const labels = {
      amount: "Amount", reward: "Reward", fine: "Fine", xp: "XP",
      candy: "Candy", points: "Points", level: "Level", rebirths: "Rebirths",
      multiplier: "Multiplier", correct: "Correct", total: "Questions"
    };
    for (const [key, value] of Object.entries(details).slice(0, 6)) {
      if (value === null || value === undefined || typeof value === "object") continue;
      add(labels[key] || key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase()), value);
    }
  }

  const abilities = Array.isArray(details.triggeredAbilities) ? details.triggeredAbilities : [];
  if (abilities.length) add("Special ability", "⚡ " + abilities.join(" · "), false);

  const embed = new EmbedBuilder()
    .setColor(event.color)
    .setAuthor({ name: "FUKISHOKAI  //  FIELD INTELLIGENCE", iconURL: settings.brand.iconUrl })
    .setTitle(event.title)
    .setDescription("**" + String(displayName || "Player").slice(0, 80) + "** · <@" + actorId + ">")
    .setFooter({ text: "◆ ACTIVITY RECORD  •  Full structured data saved to audit history" })
    .setTimestamp();
  if (fields.length) embed.addFields(fields.slice(0, 10));
  return embed;
}

async function sendActivityLog(client, guildId, activity) {
  try {
    const channelId = await client.services.guildSettings.get(guildId, "logChannelId");
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased() && channel.guildId === guildId) {
      await channel.send({
        embeds: [buildActivityLogEmbed(activity)],
        allowedMentions: { parse: [] }
      });
    }
  } catch (error) {
    log("warn", "Could not send formatted member activity log", {
      guildId, action: activity?.action, message: error.message
    });
  }
}

async function sendLog(client, guildId, content) {
  try {
    const channelId = await client.services.guildSettings.get(guildId, "logChannelId");
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.isTextBased() && channel.guildId === guildId) {
      await channel.send({
        content: String(content).slice(0, 1900),
        allowedMentions: { parse: [] }
      });
    }
  } catch (error) {
    log("warn", "Could not send to the server's configured log channel", { guildId, message: error.message });
  }
}

module.exports = { log, audit, sendLog, sendActivityLog, buildActivityLogEmbed };
