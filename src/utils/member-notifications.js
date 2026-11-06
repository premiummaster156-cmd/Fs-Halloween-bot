async function sendCandyDropNotification(client, guildSettings, guildId, userId, amount) {
  const channelId = await guildSettings.get(guildId, "memberCommandsChannelId");
  if (!channelId) return { sent: false, reason: "channel_not_configured" };
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || typeof channel.isTextBased !== "function" || !channel.isTextBased() || typeof channel.send !== "function") {
    return { sent: false, reason: "channel_unavailable", channelId };
  }
  await channel.send({
    content: "🍬 <@" + userId + "> found **" + Number(amount).toLocaleString() + " Candy**!",
    allowedMentions: { users: [userId] }
  });
  return { sent: true, channelId };
}

module.exports = { sendCandyDropNotification };
