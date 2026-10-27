const minute = 60 * 1000;
const hour = 60 * minute;

module.exports = {
  economy: {
    dailyMin: 420, dailyMax: 720, dailyCooldownMs: 24 * hour, dailyXp: 18,
    minimumBet: 100, maximumBet: 100000,
    transferMinimum: 1, transferMaximum: 500000,
    maxWallet: 2000000000
  },
  jobs: [
    { id: "street_runner", name: "Street Runner", tier: 1, minLevel: 1, minWallet: 0, payMin: 120, payMax: 210, cooldownMs: 30 * minute, xp: 24, description: "Take small deliveries and learn the city." },
    { id: "delivery_rider", name: "Delivery Rider", tier: 2, minLevel: 3, minWallet: 2500, payMin: 220, payMax: 380, cooldownMs: 35 * minute, xp: 30, description: "Complete risky deliveries on a tight schedule." },
    { id: "shopkeeper", name: "Shopkeeper", tier: 3, minLevel: 6, minWallet: 9000, payMin: 330, payMax: 570, cooldownMs: 40 * minute, xp: 38, description: "Manage supplies and keep the operation running." },
    { id: "enforcer", name: "Enforcer", tier: 4, minLevel: 10, minWallet: 25000, payMin: 520, payMax: 880, cooldownMs: 45 * minute, xp: 48, description: "Protect clan operations and handle difficult jobs." },
    { id: "smuggler", name: "Smuggler", tier: 5, minLevel: 15, minWallet: 90000, payMin: 850, payMax: 1450, cooldownMs: 55 * minute, xp: 62, description: "Move high-value goods while managing risk." },
    { id: "underboss", name: "Underboss", tier: 6, minLevel: 21, minWallet: 300000, payMin: 1350, payMax: 2300, cooldownMs: 65 * minute, xp: 80, description: "Coordinate valuable operations and trusted crews." },
    { id: "crime_boss", name: "Crime Boss", tier: 7, minLevel: 30, minWallet: 1000000, payMin: 2200, payMax: 3800, cooldownMs: 75 * minute, xp: 105, description: "The highest career tier, earned through long-term progress." }
  ],
  crimes: [
    { id: "pickpocket", name: "Pickpocket", minLevel: 1, baseChance: 67, rewardMin: 90, rewardMax: 220, fineMin: 35, fineMax: 100, cooldownMs: 12 * minute, xp: 12, difficulty: 1 },
    { id: "shoplift", name: "Shoplift", minLevel: 4, baseChance: 54, rewardMin: 260, rewardMax: 650, fineMin: 120, fineMax: 290, cooldownMs: 22 * minute, xp: 22, difficulty: 2 },
    { id: "smuggle", name: "Smuggle", minLevel: 9, baseChance: 42, rewardMin: 700, rewardMax: 1650, fineMin: 300, fineMax: 720, cooldownMs: 35 * minute, xp: 38, difficulty: 3 }
  ],
  casino: {
    cooldownMs: 5000, minBet: 100, maxBet: 100000,
    games: {
      coinflip: { name: "Coin Flip", minLevel: 1, winningChance: 47, multiplierHundredths: 200, description: "47% win chance; a win returns twice the bet." },
      dice: { name: "High Dice", minLevel: 3, winningChance: 32, multiplierHundredths: 290, description: "Roll a 5 or 6 to win." },
      slots: {
        name: "Slots", minLevel: 5,
        outcomes: [
          { maxRoll: 39, label: "Jackpot", multiplierHundredths: 1000 },
          { maxRoll: 119, label: "Big win", multiplierHundredths: 400 },
          { maxRoll: 299, label: "Small win", multiplierHundredths: 130 },
          { maxRoll: 999, label: "No win", multiplierHundredths: 0 }
        ],
        description: "Rare large payouts with a house edge."
      }
    }
  },
  heists: [
    { id: "night_market", name: "Night Market Run", minLevel: 2, minParticipants: 2, maxParticipants: 3, difficulty: 1, baseChance: 43, payoutMin: 1800, payoutMax: 3600, failPenalty: 90, cooldownMs: 8 * hour, description: "A compact first team operation." },
    { id: "armored_van", name: "Armored Van", minLevel: 7, minParticipants: 3, maxParticipants: 4, difficulty: 2, baseChance: 34, payoutMin: 6500, payoutMax: 12000, failPenalty: 260, cooldownMs: 12 * hour, description: "Requires a balanced crew and good preparation." },
    { id: "museum_blackout", name: "Museum Blackout", minLevel: 13, minParticipants: 4, maxParticipants: 5, difficulty: 3, baseChance: 27, payoutMin: 18000, payoutMax: 34000, failPenalty: 650, cooldownMs: 18 * hour, description: "A demanding mission for experienced crews." }
  ],
  heistRoles: {
    planner: { bonus: 5, label: "Planner" },
    hacker: { bonus: 7, label: "Hacker" },
    driver: { bonus: 4, label: "Driver" },
    muscle: { bonus: 3, label: "Muscle" },
    scout: { bonus: 5, label: "Scout" }
  },
  halloween: {
    eventId: "halloween-2026",
    finalRoleQuestCount: 5,
    quests: [
      { id: "first_shift", name: "First Shift", action: "work", goal: 3, candy: 30, points: 30, description: "Complete 3 work shifts." },
      { id: "daily_regular", name: "Daily Regular", action: "daily", goal: 2, candy: 25, points: 25, description: "Claim your daily reward twice." },
      { id: "night_operator", name: "Night Operator", action: "crime_success", goal: 2, candy: 40, points: 40, description: "Complete 2 successful crime attempts." },
      { id: "high_roller", name: "High Roller", action: "casino_play", goal: 3, candy: 20, points: 20, description: "Play 3 casino rounds." },
      { id: "crew_member", name: "Crew Member", action: "heist_success", goal: 1, candy: 60, points: 60, description: "Complete a heist successfully." },
      { id: "steady_income", name: "Steady Income", action: "wallet_earned", goal: 2500, candy: 45, points: 45, description: "Earn 2,500 Fuk Coins from game rewards." }
    ],
    shop: [
      { id: "pumpkin_charm", name: "Pumpkin Charm", cost: 75, description: "A seasonal collectible." },
      { id: "ghost_token", name: "Ghost Token", cost: 140, description: "A rare Halloween collectible." },
      { id: "crimson_relic", name: "Crimson Relic", cost: 280, description: "An exclusive high-tier collectible." }
    ]
  }
};
