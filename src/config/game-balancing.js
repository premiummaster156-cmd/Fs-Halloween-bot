const minute = 60 * 1000;
const hour = 60 * minute;

module.exports = {
  economy: {
    // Multiplies normal FC earning transactions; casino returns, transfers and admin grants are excluded.
    earningMultiplier: 3,
    dailyMin: 420, dailyMax: 720, dailyCooldownMs: 24 * hour, dailyXp: 18,
    minimumBet: 100, maximumBet: 100000,
    transferMinimum: 1, transferMaximum: 500000,
    maxWallet: 2000000000
  },
  progression: { xpMultiplier: 3, roleBoosterMultiplier: 2 },
  chat: { rewardMin: 1, rewardMax: 3, dailyRewardCap: 250, xpPerMessage: 2, dailyXpCap: 100 },
  jobs: [
    { id: "street_runner", name: "Street Runner", tier: 1, minLevel: 1, minWallet: 0, payMin: 120, payMax: 210, cooldownMs: 10 * minute, xp: 24, description: "Take small deliveries and learn the city." },
    { id: "delivery_rider", name: "Delivery Rider", tier: 2, minLevel: 3, minWallet: 2500, payMin: 220, payMax: 380, cooldownMs: 10 * minute, xp: 30, description: "Complete risky deliveries on a tight schedule." },
    { id: "shopkeeper", name: "Shopkeeper", tier: 3, minLevel: 6, minWallet: 9000, payMin: 330, payMax: 570, cooldownMs: 10 * minute, xp: 38, description: "Manage supplies and keep the operation running." },
    { id: "enforcer", name: "Enforcer", tier: 4, minLevel: 10, minWallet: 25000, payMin: 520, payMax: 880, cooldownMs: 10 * minute, xp: 48, description: "Protect clan operations and handle difficult jobs." },
    { id: "smuggler", name: "Smuggler", tier: 5, minLevel: 15, minWallet: 90000, payMin: 850, payMax: 1450, cooldownMs: 10 * minute, xp: 62, description: "Move high-value goods while managing risk." },
    { id: "underboss", name: "Underboss", tier: 6, minLevel: 21, minWallet: 300000, payMin: 1350, payMax: 2300, cooldownMs: 10 * minute, xp: 80, description: "Coordinate valuable operations and trusted crews." },
    { id: "crime_boss", name: "Crime Boss", tier: 7, minLevel: 30, minWallet: 1000000, payMin: 2200, payMax: 3800, cooldownMs: 10 * minute, xp: 105, description: "The highest career tier, earned through long-term progress." }
  ],
  careerEffects: {
    street_runner: { workPayBonus: 0.03 },
    delivery_rider: { workCooldownReduction: 0.04 },
    shopkeeper: { moneyBonus: 0.03 },
    enforcer: { crimeChance: 4, fineReduction: 0.03 },
    smuggler: { crimeRewardBonus: 0.08 },
    underboss: { heistChance: 4 },
    crime_boss: { moneyBonus: 0.05, heistChance: 2 }
  },
  // Applied automatically while a member is actively boosting this server.
  // Casino odds are increased through the fair-play gear path, which scales payouts to preserve RTP.
  serverBoosterEffects: {
    moneyBonus: 0.15,
    xpBonus: 0.15,
    workPayBonus: 0.08,
    workXpBonus: 0.08,
    crimeRewardBonus: 0.05,
    crimeChance: 3,
    heistChance: 3,
    fineReduction: 0.05,
    casinoChance: 0.5,
    slotLuck: 3,
    candyDropBonus: 0.03,
    workCooldownReduction: 0.05,
    crimeCooldownReduction: 0.05,
    heistCooldownReduction: 0.05,
    dailyCooldownReduction: 0.05,
    casinoCooldownReduction: 0.05,
    partyPointsBonus: 0.15,
    partyCooldownReduction: 0.05,
    eventRewardBonus: 0.15
  },
  items: [
    { id: "reinforced_gloves", name: "Reinforced Gloves", type: "equipment", slot: "hands", cost: 7000, minLevel: 2, description: "Reliable handling improves crime success and reduces crime cooldowns.", effects: { crimeChance: 3, crimeCooldownReduction: 0.05, candyDropBonus: 0.01 } },
    { id: "urban_disguise", name: "Urban Disguise", type: "equipment", slot: "outfit", cost: 18000, minLevel: 5, description: "Stay unnoticed on operations and get a small edge at the casino.", effects: { crimeChance: 4, heistChance: 1, casinoChance: 0.6, casinoCooldownReduction: 0.04, candyDropBonus: 0.015 } },
    { id: "operator_radio", name: "Operator Radio", type: "equipment", slot: "gadget", cost: 25000, minLevel: 6, description: "Coordinate crews, improve mission success and earn more XP.", effects: { heistChance: 4, heistCooldownReduction: 0.08, xpBonus: 0.04, candyDropBonus: 0.02 } },
    { id: "reinforced_vest", name: "Reinforced Vest", type: "equipment", slot: "armor", cost: 36000, minLevel: 8, description: "Reduce operation fines and add a steady income bonus.", effects: { fineReduction: 0.12, heistChance: 1, moneyBonus: 0.04, workCooldownReduction: 0.03, candyDropBonus: 0.02 } },
    { id: "delivery_bike", name: "Delivery Bike", type: "equipment", slot: "vehicle", cost: 50000, minLevel: 10, description: "Increase work salary and work XP while shortening shift cooldowns.", effects: { workPayBonus: 0.12, workXpBonus: 0.08, workCooldownReduction: 0.12, candyDropBonus: 0.025 } },
    { id: "field_toolkit", name: "Field Toolkit", type: "equipment", slot: "bag", cost: 64000, minLevel: 12, description: "A balanced kit for better pay, income and operation chances.", effects: { workPayBonus: 0.08, moneyBonus: 0.05, crimeChance: 2, heistChance: 2, crimeCooldownReduction: 0.04, candyDropBonus: 0.03 } },
    { id: "smuggler_satchel", name: "Smuggler Satchel", type: "equipment", slot: "belt", cost: 116000, minLevel: 17, description: "Improve crime success, reduce fines and shorten daily reward cooldowns.", effects: { crimeChance: 5, fineReduction: 0.10, xpBonus: 0.06, dailyCooldownReduction: 0.05, candyDropBonus: 0.035 } },
    { id: "crimson_charm", name: "Crimson Charm", type: "equipment", slot: "charm", cost: 170000, minLevel: 20, description: "A rare keepsake that improves work, income, XP and risky operations.", effects: { crimeChance: 3, heistChance: 4, workPayBonus: 0.10, moneyBonus: 0.08, xpBonus: 0.10, casinoChance: 0.8, workCooldownReduction: 0.06, candyDropBonus: 0.04 } },
    { id: "phantom_chronometer", name: "Phantom Chronometer", type: "equipment", slot: "watch", cost: 290000, minLevel: 26, description: "Advanced timing gear that shortens work, crime, heist, daily and casino cooldowns.", effects: { workCooldownReduction: 0.12, crimeCooldownReduction: 0.10, heistCooldownReduction: 0.10, dailyCooldownReduction: 0.08, casinoCooldownReduction: 0.12, xpBonus: 0.08, candyDropBonus: 0.045 } },
    { id: "syndicate_ledger", name: "Syndicate Ledger", type: "equipment", slot: "badge", cost: 480000, minLevel: 32, description: "Elite equipment for higher income, XP and improved gambling luck.", effects: { moneyBonus: 0.15, xpBonus: 0.15, workPayBonus: 0.12, crimeRewardBonus: 0.08, casinoChance: 1.5, slotLuck: 12, heistChance: 3, candyDropBonus: 0.05 } },
    { id: "booster_crimson_katana", name: "Crimson Oni Katana", type: "equipment", slot: "booster_weapon", cost: 180000, minLevel: 1, boosterOnly: true, boostNumber: 1, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "Crime success +5 points · Crime rewards +10% · Work pay +8% · Heist success +2 points · Candy drop chance +2 points", description: "Your first personal server boost earns this katana automatically. It is added to your collection and equipped right away.", effects: { crimeChance: 5, crimeRewardBonus: 0.10, workPayBonus: 0.08, heistChance: 2, candyDropBonus: 0.02 } },
    { id: "booster_phantom_mask", name: "Phantom Shogun Mask", type: "equipment", slot: "booster_mask", cost: 220000, minLevel: 1, boosterOnly: true, boostNumber: 2, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "FC income +8% · XP +10% · Heist success +3 points · Casino win chance +1 point · Slots luck +4 · Daily cooldown -5%", description: "Your second personal server boost earns this mask automatically. It is added to your collection and equipped right away.", effects: { moneyBonus: 0.08, xpBonus: 0.10, heistChance: 3, casinoChance: 1, slotLuck: 4, dailyCooldownReduction: 0.05 } },
    { id: "booster_wraith_armor", name: "Wraithguard Armor", type: "equipment", slot: "booster_armor", cost: 260000, minLevel: 1, boosterOnly: true, boostNumber: 3, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "Fines -15% · Crime success +3 points · Work XP +12% · Work cooldown -8% · Crime cooldown -8%", description: "Your third personal server boost earns this armor automatically. It is added to your collection and equipped right away.", effects: { fineReduction: 0.15, crimeChance: 3, workXpBonus: 0.12, workCooldownReduction: 0.08, crimeCooldownReduction: 0.08 } },
    { id: "booster_dragon_signet", name: "Dragonfire Signet", type: "equipment", slot: "booster_ring", cost: 320000, minLevel: 1, boosterOnly: true, boostNumber: 4, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "FC income +10% · XP +10% · Crime rewards +10% · Heist success +4 points · Candy drop chance +4 points", description: "Your fourth personal server boost earns this ring automatically. It is added to your collection and equipped right away.", effects: { moneyBonus: 0.10, xpBonus: 0.10, crimeRewardBonus: 0.10, heistChance: 4, candyDropBonus: 0.04 } },
    { id: "booster_kitsune_wings", name: "Eternal Kitsune Wings", type: "equipment", slot: "booster_aura", cost: 400000, minLevel: 1, boosterOnly: true, boostNumber: 5, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "FC income +12% · XP +12% · Work pay +15% · Work XP +15% · Crime rewards +8% · Heist success +5 points · Fines -10% · All game cooldowns -5% · Candy drop chance +5 points", description: "Your fifth personal server boost earns these wings automatically. This is the final item in the booster collection.", effects: { moneyBonus: 0.12, xpBonus: 0.12, workPayBonus: 0.15, workXpBonus: 0.15, crimeRewardBonus: 0.08, heistChance: 5, fineReduction: 0.10, candyDropBonus: 0.05, workCooldownReduction: 0.05, crimeCooldownReduction: 0.05, heistCooldownReduction: 0.05, dailyCooldownReduction: 0.05, casinoCooldownReduction: 0.05 } }
  ],
  itemUpgrades: { maxLevel: 5, effectPerLevel: 0.15, costBaseFactor: 0.65, costGrowthFactor: 1.7, levelRequirementPerUpgrade: 2 },
  rebirth: { startingWallet: 1000, firstWalletRequirement: 30000, firstLevelRequirement: 8, walletRequirementGrowth: 1.5, levelRequirementGrowth: 2, firstQuestClaimsRequirement: 1, questClaimsGrowth: 1, firstJobLevelRequirement: 1, jobLevelGrowthEvery: 2, firstWorkShiftsRequirement: 3, workShiftsGrowth: 2, itemRequirementsStartAt: 3, firstGearItemsRequirement: 1, gearItemsGrowth: 1, firstCandyItemsRequirement: 1, candyItemsGrowth: 1, firstCandyBalanceRequirement: 25, candyBalanceGrowth: 25, gearUpgradeRequirementsStartAt: 4, firstGearUpgradeLevelsRequirement: 1, gearUpgradeLevelsGrowth: 1 },
  crimes: [
    { id: "pickpocket", name: "Pickpocket", minLevel: 1, baseChance: 67, rewardMin: 90, rewardMax: 220, fineMin: 35, fineMax: 100, cooldownMs: 12 * minute, xp: 12, difficulty: 1 },
    { id: "shoplift", name: "Shoplift", minLevel: 4, baseChance: 54, rewardMin: 260, rewardMax: 650, fineMin: 120, fineMax: 290, cooldownMs: 22 * minute, xp: 22, difficulty: 2 },
    { id: "smuggle", name: "Smuggle", minLevel: 9, baseChance: 42, rewardMin: 700, rewardMax: 1650, fineMin: 300, fineMax: 720, cooldownMs: 35 * minute, xp: 38, difficulty: 3 },
    { id: "courier_intercept", name: "Courier Intercept", minLevel: 14, baseChance: 38, rewardMin: 1400, rewardMax: 2800, fineMin: 550, fineMax: 1100, cooldownMs: 45 * minute, xp: 48, difficulty: 4 },
    { id: "data_breach", name: "Data Breach", minLevel: 20, baseChance: 32, rewardMin: 2600, rewardMax: 5200, fineMin: 900, fineMax: 1800, cooldownMs: 60 * minute, xp: 68, difficulty: 5 },
    { id: "vault_extraction", name: "Vault Extraction", minLevel: 27, baseChance: 26, rewardMin: 5000, rewardMax: 9500, fineMin: 1800, fineMax: 3600, cooldownMs: 90 * minute, xp: 95, difficulty: 6 }
  ],
  casino: {
    // Same bet range for everyone. No daily wager cap.
    cooldownMs: 15 * 1000,
    minBet: 100,
    targetReturnRate: 0.95,
    games: {
      coinflip: {
        name: "Coin Flip", minLevel: 1,
        winningChance: 47.5, multiplierHundredths: 200,
        theoreticalReturnRate: 0.95,
        description: "47.5% win chance. A win returns 2× your bet. Long-run average return: 95%."
      },
      dice: {
        name: "High Dice", minLevel: 3,
        winningChance: 33.333333, multiplierHundredths: 285,
        theoreticalReturnRate: 0.95,
        description: "Roll a 5 or 6 (2 chances out of 6). A win returns 2.85× your bet. Long-run average return: 95%."
      },
      slots: {
        name: "Slots", minLevel: 5,
        theoreticalReturnRate: 0.95,
        outcomes: [
          { maxRoll: 9, label: "Jackpot", multiplierHundredths: 1000 },
          { maxRoll: 49, label: "Big win", multiplierHundredths: 400 },
          { maxRoll: 249, label: "Small win", multiplierHundredths: 345 },
          { maxRoll: 999, label: "No win", multiplierHundredths: 0 }
        ],
        description: "1% Jackpot (10×), 4% Big win (4×), 20% Small win (3.45×), 75% no win. Long-run average return: 95%."
      }
    }
  },
  heists: [
    { id: "night_market", name: "Night Market Run", minLevel: 2, minParticipants: 2, maxParticipants: 3, difficulty: 1, baseChance: 43, payoutMin: 1800, payoutMax: 3600, failPenalty: 90, cooldownMs: 8 * hour, description: "A compact first team operation." },
    { id: "armored_van", name: "Armored Van", minLevel: 7, minParticipants: 3, maxParticipants: 4, difficulty: 2, baseChance: 34, payoutMin: 6500, payoutMax: 12000, failPenalty: 260, cooldownMs: 12 * hour, description: "Requires a balanced crew and good preparation." },
    { id: "museum_blackout", name: "Museum Blackout", minLevel: 13, minParticipants: 4, maxParticipants: 5, difficulty: 3, baseChance: 27, payoutMin: 18000, payoutMax: 34000, failPenalty: 650, cooldownMs: 18 * hour, description: "A demanding mission for experienced crews." },
    { id: "harbor_exchange", name: "Harbor Exchange", minLevel: 18, minParticipants: 4, maxParticipants: 5, difficulty: 4, baseChance: 24, payoutMin: 28000, payoutMax: 52000, failPenalty: 1000, cooldownMs: 20 * hour, description: "Coordinate a five-person handoff across a guarded shipping terminal." },
    { id: "blacksite_extraction", name: "Blacksite Extraction", minLevel: 25, minParticipants: 5, maxParticipants: 5, difficulty: 5, baseChance: 20, payoutMin: 50000, payoutMax: 90000, failPenalty: 1800, cooldownMs: 24 * hour, description: "A high-risk, full-crew operation that demands every role." }
  ],
  heistRoles: {
    planner: { bonus: 5, label: "Planner" },
    hacker: { bonus: 7, label: "Hacker" },
    driver: { bonus: 4, label: "Driver" },
    muscle: { bonus: 3, label: "Muscle" },
    scout: { bonus: 5, label: "Scout" },
    infiltrator: { bonus: 4, label: "Infiltrator" },
    technician: { bonus: 5, label: "Technician" }
  },
  candyDrops: {
    // Chance is rolled once for each genuine FC earning transaction. Gear adds percentage points.
    daily_reward: { chance: 0.12, min: 1, max: 2 },
    job_work: { chance: 0.20, min: 1, max: 2 },
    crime_success: { chance: 0.14, min: 1, max: 2 },
    heist_reward: { chance: 0.26, min: 2, max: 4 },
    casino_payout: { chance: 0.06, min: 1, max: 2 },
    chat_activity_reward: { chance: 0.025, min: 1, max: 1 }
  },
  halloween: {
    eventId: "halloween-2026",
    finalRoleQuestCount: 5,
    weeklyMessageGoal: 1000,
    weeklyMessageCandyReward: 75,
    weeklyMessagePointsReward: 75,
    quests: [
      { id: "first_shift", name: "First Shift", action: "work", goal: 3, candy: 30, points: 30, description: "Complete 3 work shifts." },
      { id: "daily_regular", name: "Daily Regular", action: "daily", goal: 2, candy: 25, points: 25, description: "Claim your daily reward twice." },
      { id: "night_operator", name: "Night Operator", action: "crime_success", goal: 2, candy: 40, points: 40, description: "Complete 2 successful crime attempts." },
      { id: "high_roller", name: "High Roller", action: "casino_play", goal: 3, candy: 20, points: 20, description: "Play 3 casino rounds." },
      { id: "crew_member", name: "Crew Member", action: "heist_success", goal: 1, candy: 60, points: 60, description: "Complete a heist successfully." },
      { id: "steady_income", name: "Steady Income", action: "wallet_earned", goal: 2500, candy: 45, points: 45, description: "Earn 2,500 Fuk Coins from game rewards." }
    ],
    shop: [
      { id: "pumpkin_charm", name: "Pumpkin Charm", cost: 75, unique: true, description: "A seasonal collectible and a first collectible milestone for advanced rebirths." },
      { id: "ghost_token", name: "Ghost Token", cost: 140, unique: true, description: "A rare Halloween collectible and a rebirth milestone." },
      { id: "crimson_relic", name: "Crimson Relic", cost: 280, unique: true, description: "An exclusive high-tier collectible and the final Candy-shop rebirth milestone." }
    ]
  }
};
