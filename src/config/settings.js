const parseList = (value) => String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
const numberOr = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

module.exports = {
  discordToken: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",
  databaseUrl: process.env.DATABASE_URL || "",
  ownerId: process.env.OWNER_ID || "",
  adminRoleIds: parseList(process.env.ADMIN_ROLE_IDS),
  logChannelId: process.env.LOG_CHANNEL_ID || "",
  defaultEventRoleId: process.env.HALLOWEEN_ROLE_ID || "",
  halloweenEndsAt: process.env.HALLOWEEN_ENDS_AT || "2026-11-30T00:00:00.000Z",
  startingWallet: Math.max(0, Math.floor(numberOr(process.env.STARTING_WALLET, 5000))),
  currencyName: process.env.CURRENCY_NAME || "Fuk Coins",
  currencySymbol: process.env.CURRENCY_SYMBOL || "FC",
  brand: {
    name: "Fukishokai Halloween Bot",
    emoji: "<:Fuk:1498610630746181772>",
    primary: 0x851E2A,
    gold: 0xD5AD59,
    success: 0x32865B,
    warning: 0xB77A28,
    danger: 0xB83D47,
    neutral: 0x343840
  }
};
