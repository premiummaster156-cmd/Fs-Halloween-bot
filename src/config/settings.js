const parseList = (value) => String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

module.exports = {
  discordToken: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || "",
  idePublicUrl: process.env.IDE_PUBLIC_URL || "",
  ideGuildId: process.env.IDE_GUILD_ID || process.env.GUILD_ID || "",
  idePort: Math.max(1, Math.floor(numberOr(process.env.IDE_PORT || process.env.PORT, 3000))),
  adminWorkspaceApiKey: process.env.ADMIN_WORKSPACE_API_KEY || "",
  guildId: process.env.GUILD_ID || "",
  databaseUrl: process.env.DATABASE_URL || "",
  ownerId: process.env.OWNER_ID || "",
  adminRoleIds: parseList(process.env.ADMIN_ROLE_IDS),
  // Role assigned to members who currently boost this Discord server.
  boosterRoleId: process.env.BOOSTER_ROLE_ID || "1376299577581240410",
  logChannelId: process.env.LOG_CHANNEL_ID || "",
  memberCommandsChannelId: process.env.MEMBER_COMMANDS_CHANNEL_ID || "1566508610459271478",
  defaultEventRoleId: process.env.HALLOWEEN_ROLE_ID || "",
  halloweenEndsAt: process.env.HALLOWEEN_ENDS_AT || "2026-12-01T00:00:00.000Z",
  startingWallet: Math.max(0, Math.floor(numberOr(process.env.STARTING_WALLET, 5000))),
  currencyName: process.env.CURRENCY_NAME || "FS Coins",
  currencySymbol: process.env.CURRENCY_SYMBOL || "FC",
  brand: {
    name: "Fukishokai Halloween Bot",
    emoji: "<:Fuk:1498610630746181772>",
    iconUrl: "https://cdn.discordapp.com/emojis/1498610630746181772.webp?size=128",
    icons: {
      settings: "https://cdn.discordapp.com/emojis/1535400233444315207.webp?size=128",
      guide: "https://cdn.discordapp.com/emojis/1489716015477817525.webp?size=128",
      task: "https://cdn.discordapp.com/emojis/1489717158798954586.webp?size=128",
      leaderboard: "https://cdn.discordapp.com/emojis/1535400248808185876.webp?size=128",
      profile: "https://cdn.discordapp.com/emojis/1535400260283797534.webp?size=128",
      failed: "https://cdn.discordapp.com/emojis/1498638780767408209.webp?size=128",
      cooldown: "https://cdn.discordapp.com/emojis/1489717580632555622.webp?size=128"
    },
    primary: 0x851E2A,
    gold: 0xD5AD59,
    success: 0x32865B,
    warning: 0xB77A28,
    danger: 0xB83D47,
    neutral: 0x343840
  }
};
