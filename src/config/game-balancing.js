const minute = 60 * 1000;
const hour = 60 * minute;

module.exports = {
  economy: {
    // Multiplies normal FC earning transactions; casino returns, transfers and admin grants are excluded.
    earningMultiplier: 3,
    dailyMin: 600, dailyMax: 900, dailyCooldownMs: 18 * hour, dailyXp: 30,
    minimumBet: 100, maximumBet: 100000,
    transferMinimum: 1, transferMaximum: 500000,
    maxWallet: 2000000000,
    levelIncomeBonusPerLevel: 0.001
  },
  progression: { xpMultiplier: 1, roleBoosterMultiplier: 1.2, maxLevel: 600, maxRebirths: 100, xpPerLevelBase: 80, xpPerLevelStep: 12 },
  careerProgression: { baseXp: 40, xpPerLevelSquared: 20 },
  chat: { rewardMin: 1, rewardMax: 3, dailyRewardCap: 250, xpPerMessage: 2, dailyXpCap: 100 },
  jobs: [
    { id: "street_runner", name: "Street Runner", tier: 1, minLevel: 1, minWallet: 0, payMin: 250, payMax: 350, cooldownMs: 5 * minute, xp: 30, description: "Take small deliveries and learn the city." },
    { id: "delivery_rider", name: "Delivery Rider", tier: 2, minLevel: 5, minWallet: 5000, payMin: 400, payMax: 600, cooldownMs: 5 * minute, xp: 36, description: "Complete risky deliveries on a tight schedule." },
    { id: "shopkeeper", name: "Shopkeeper", tier: 3, minLevel: 10, minWallet: 12000, payMin: 650, payMax: 950, cooldownMs: 5 * minute, xp: 45, description: "Manage supplies and keep the operation running." },
    { id: "enforcer", name: "Enforcer", tier: 4, minLevel: 16, minWallet: 25000, payMin: 950, payMax: 1350, cooldownMs: 5 * minute, xp: 55, description: "Protect clan operations and handle difficult jobs." },
    { id: "smuggler", name: "Smuggler", tier: 5, minLevel: 23, minWallet: 50000, payMin: 1400, payMax: 1950, cooldownMs: 5 * minute, xp: 65, description: "Move high-value goods while managing risk." },
    { id: "underboss", name: "Underboss", tier: 6, minLevel: 30, minWallet: 90000, payMin: 2000, payMax: 2800, cooldownMs: 5 * minute, xp: 78, description: "Coordinate valuable operations and trusted crews." },
    { id: "crime_boss", name: "Crime Boss", tier: 7, minLevel: 40, minWallet: 150000, payMin: 2800, payMax: 3800, cooldownMs: 5 * minute, xp: 90, description: "The highest career tier, earned through long-term progress." },
    { id: "investigator", name: "Investigator", tier: 8, minLevel: 45, minWallet: 200000, payMin: 3500, payMax: 4700, cooldownMs: 5 * minute, xp: 100, description: "Follow evidence and solve high-value cases." },
    { id: "medic", name: "Medic", tier: 9, minLevel: 50, minWallet: 250000, payMin: 4000, payMax: 5400, cooldownMs: 5 * minute, xp: 110, description: "Keep the crew alive through demanding operations." },
    { id: "engineer", name: "Engineer", tier: 10, minLevel: 55, minWallet: 300000, payMin: 4600, payMax: 6200, cooldownMs: 5 * minute, xp: 120, description: "Build and maintain advanced equipment." },
    { id: "hacker", name: "Hacker", tier: 11, minLevel: 60, minWallet: 350000, payMin: 5200, payMax: 7000, cooldownMs: 5 * minute, xp: 130, description: "Secure systems and outsmart digital threats." },
    { id: "lawyer", name: "Lawyer", tier: 12, minLevel: 70, minWallet: 450000, payMin: 6000, payMax: 8100, cooldownMs: 5 * minute, xp: 145, description: "Negotiate complex cases and protect the organisation." },
    { id: "scientist", name: "Scientist", tier: 13, minLevel: 80, minWallet: 550000, payMin: 7000, payMax: 9400, cooldownMs: 5 * minute, xp: 160, description: "Research rare materials and develop new technology." },
    { id: "pilot", name: "Pilot", tier: 14, minLevel: 90, minWallet: 700000, payMin: 8200, payMax: 11000, cooldownMs: 5 * minute, xp: 175, description: "Fly high-risk routes and precision missions." },
    { id: "bodyguard", name: "Bodyguard", tier: 15, minLevel: 100, minWallet: 850000, payMin: 9500, payMax: 12800, cooldownMs: 5 * minute, xp: 190, description: "Protect important clients and reduce operation losses." },
    { id: "blacksmith", name: "Blacksmith", tier: 16, minLevel: 110, minWallet: 1000000, payMin: 11000, payMax: 14800, cooldownMs: 5 * minute, xp: 205, description: "Forge and reinforce equipment for elite members." },
    { id: "merchant", name: "Merchant", tier: 17, minLevel: 120, minWallet: 1200000, payMin: 12500, payMax: 16800, cooldownMs: 5 * minute, xp: 220, description: "Trade rare goods across the city and beyond." },
    { id: "strategist", name: "Strategist", tier: 18, minLevel: 140, minWallet: 1500000, payMin: 14500, payMax: 19500, cooldownMs: 5 * minute, xp: 240, description: "Plan coordinated operations with maximum efficiency." },
    { id: "bounty_hunter", name: "Bounty Hunter", tier: 19, minLevel: 160, minWallet: 1800000, payMin: 16500, payMax: 22200, cooldownMs: 5 * minute, xp: 260, description: "Track dangerous targets and collect elite contracts." },
    { id: "alchemist", name: "Alchemist", tier: 20, minLevel: 180, minWallet: 2200000, payMin: 19000, payMax: 25500, cooldownMs: 5 * minute, xp: 280, description: "Transform rare ingredients into valuable creations." },
    { id: "diplomat", name: "Diplomat", tier: 21, minLevel: 200, minWallet: 2700000, payMin: 22000, payMax: 29500, cooldownMs: 5 * minute, xp: 305, description: "Settle rival disputes and negotiate major agreements." },
    { id: "syndicate_director", name: "Syndicate Director", tier: 22, minLevel: 220, minWallet: 3300000, payMin: 25500, payMax: 34000, cooldownMs: 5 * minute, xp: 330, description: "Lead the highest-value operations in Fukishokai." }
  ],
  careerEffects: {
    street_runner: { workPayBonus: 0.03 },
    delivery_rider: { workCooldownReduction: 0.04 },
    shopkeeper: { moneyBonus: 0.03 },
    enforcer: { crimeChance: 4, fineReduction: 0.03 },
    smuggler: { crimeRewardBonus: 0.08 },
    underboss: { heistChance: 4 },
    crime_boss: { moneyBonus: 0.05, heistChance: 2 },
    investigator: { crimeChance: 5, crimeRewardBonus: 0.04 },
    medic: { fineReduction: 0.08, workXpBonus: 0.06 },
    engineer: { workPayBonus: 0.08, workCooldownReduction: 0.05 },
    hacker: { heistChance: 5, crimeChance: 3 },
    lawyer: { fineReduction: 0.12, moneyBonus: 0.03 },
    scientist: { xpBonus: 0.10, candyDropBonus: 0.02 },
    pilot: { workPayBonus: 0.12, heistCooldownReduction: 0.05 },
    bodyguard: { fineReduction: 0.15, crimeChance: 2 },
    blacksmith: { workPayBonus: 0.10, xpBonus: 0.05 },
    merchant: { moneyBonus: 0.08, workPayBonus: 0.06 },
    strategist: { heistChance: 7, heistCooldownReduction: 0.06 },
    bounty_hunter: { crimeRewardBonus: 0.12, crimeChance: 4 },
    alchemist: { candyDropBonus: 0.06, xpBonus: 0.08 },
    diplomat: { fineReduction: 0.08, heistChance: 5 },
    syndicate_director: { moneyBonus: 0.10, workPayBonus: 0.12, heistChance: 5 }
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
    { id: "reinforced_gloves", name: "Reinforced Gloves", type: "equipment", slot: "hands", cost: 1500, minLevel: 1, description: "Reliable handling improves crime success and reduces crime cooldowns.", effects: { crimeChance: 3, crimeCooldownReduction: 0.05, candyDropBonus: 0.01 } },
    { id: "urban_disguise", name: "Urban Disguise", type: "equipment", slot: "outfit", cost: 3500, minLevel: 3, description: "Stay unnoticed on operations and get a small edge at the casino.", effects: { crimeChance: 4, heistChance: 1, casinoChance: 0.6, casinoCooldownReduction: 0.04, candyDropBonus: 0.015 } },
    { id: "operator_radio", name: "Operator Radio", type: "equipment", slot: "gadget", cost: 6000, minLevel: 5, description: "Coordinate crews, improve mission success and earn more XP.", effects: { heistChance: 4, heistCooldownReduction: 0.08, xpBonus: 0.04, candyDropBonus: 0.02 } },
    { id: "reinforced_vest", name: "Reinforced Vest", type: "equipment", slot: "armor", cost: 9000, minLevel: 7, description: "Reduce operation fines and add a steady income bonus.", effects: { fineReduction: 0.12, heistChance: 1, moneyBonus: 0.04, workCooldownReduction: 0.03, candyDropBonus: 0.02 } },
    { id: "delivery_bike", name: "Delivery Bike", type: "equipment", slot: "vehicle", cost: 13000, minLevel: 10, description: "Increase work salary and work XP while shortening shift cooldowns.", effects: { workPayBonus: 0.12, workXpBonus: 0.08, workCooldownReduction: 0.12, candyDropBonus: 0.025 } },
    { id: "field_toolkit", name: "Field Toolkit", type: "equipment", slot: "bag", cost: 18000, minLevel: 13, description: "A balanced kit for better pay, income and operation chances.", effects: { workPayBonus: 0.08, moneyBonus: 0.05, crimeChance: 2, heistChance: 2, crimeCooldownReduction: 0.04, candyDropBonus: 0.03 } },
    { id: "smuggler_satchel", name: "Smuggler Satchel", type: "equipment", slot: "belt", cost: 26000, minLevel: 16, description: "Improve crime success, reduce fines and shorten daily reward cooldowns.", effects: { crimeChance: 5, fineReduction: 0.10, xpBonus: 0.06, dailyCooldownReduction: 0.05, candyDropBonus: 0.035 } },
    { id: "crimson_charm", name: "Crimson Charm", type: "equipment", slot: "charm", cost: 36000, minLevel: 20, description: "A rare keepsake that improves work, income, XP and risky operations.", effects: { crimeChance: 3, heistChance: 4, workPayBonus: 0.10, moneyBonus: 0.08, xpBonus: 0.10, casinoChance: 0.8, workCooldownReduction: 0.06, candyDropBonus: 0.04 } },
    { id: "phantom_chronometer", name: "Phantom Chronometer", type: "equipment", slot: "watch", cost: 55000, minLevel: 24, description: "Advanced timing gear that shortens work, crime, heist, daily and casino cooldowns.", effects: { workCooldownReduction: 0.12, crimeCooldownReduction: 0.10, heistCooldownReduction: 0.10, dailyCooldownReduction: 0.08, casinoCooldownReduction: 0.12, xpBonus: 0.08, candyDropBonus: 0.045 } },
    { id: "syndicate_ledger", name: "Syndicate Ledger", type: "equipment", slot: "badge", cost: 80000, minLevel: 28, description: "Elite equipment for higher income, XP and improved gambling luck.", effects: { moneyBonus: 0.15, xpBonus: 0.15, workPayBonus: 0.12, crimeRewardBonus: 0.08, casinoChance: 1.5, slotLuck: 12, heistChance: 3, candyDropBonus: 0.05 } },
    { id: "booster_crimson_katana", name: "Crimson Oni Katana", type: "equipment", slot: "booster_weapon", cost: 180000, minLevel: 1, boosterOnly: true, boostNumber: 1, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "Crime success +5 points · Crime rewards +10% · Work pay +8% · Heist success +2 points · Candy drop chance +2 points", description: "Your first personal server boost earns this katana automatically. It is added to your collection and equipped right away.", effects: { crimeChance: 5, crimeRewardBonus: 0.10, workPayBonus: 0.08, heistChance: 2, candyDropBonus: 0.02 } },
    { id: "booster_phantom_mask", name: "Phantom Shogun Mask", type: "equipment", slot: "booster_mask", cost: 220000, minLevel: 1, boosterOnly: true, boostNumber: 2, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "FC income +8% · XP +10% · Heist success +3 points · Casino win chance +1 point · Slots luck +4 · Daily cooldown -5%", description: "Your second personal server boost earns this mask automatically. It is added to your collection and equipped right away.", effects: { moneyBonus: 0.08, xpBonus: 0.10, heistChance: 3, casinoChance: 1, slotLuck: 4, dailyCooldownReduction: 0.05 } },
    { id: "booster_wraith_armor", name: "Wraithguard Armor", type: "equipment", slot: "booster_armor", cost: 260000, minLevel: 1, boosterOnly: true, boostNumber: 3, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "Fines -15% · Crime success +3 points · Work XP +12% · Work cooldown -8% · Crime cooldown -8%", description: "Your third personal server boost earns this armor automatically. It is added to your collection and equipped right away.", effects: { fineReduction: 0.15, crimeChance: 3, workXpBonus: 0.12, workCooldownReduction: 0.08, crimeCooldownReduction: 0.08 } },
    { id: "booster_dragon_signet", name: "Dragonfire Signet", type: "equipment", slot: "booster_ring", cost: 320000, minLevel: 1, boosterOnly: true, boostNumber: 4, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "FC income +10% · XP +10% · Crime rewards +10% · Heist success +4 points · Candy drop chance +4 points", description: "Your fourth personal server boost earns this ring automatically. It is added to your collection and equipped right away.", effects: { moneyBonus: 0.10, xpBonus: 0.10, crimeRewardBonus: 0.10, heistChance: 4, candyDropBonus: 0.04 } },
    { id: "booster_kitsune_wings", name: "Eternal Kitsune Wings", type: "equipment", slot: "booster_aura", cost: 400000, minLevel: 1, boosterOnly: true, boostNumber: 5, rebirthEligible: false, rarity: "MYTHIC · BOOSTER EXCLUSIVE", rewardSummary: "FC income +12% · XP +12% · Work pay +15% · Work XP +15% · Crime rewards +8% · Heist success +5 points · Fines -10% · All game cooldowns -5% · Candy drop chance +5 points", description: "Your fifth personal server boost earns these wings automatically. This is the final item in the booster collection.", effects: { moneyBonus: 0.12, xpBonus: 0.12, workPayBonus: 0.15, workXpBonus: 0.15, crimeRewardBonus: 0.08, heistChance: 5, fineReduction: 0.10, candyDropBonus: 0.05, workCooldownReduction: 0.05, crimeCooldownReduction: 0.05, heistCooldownReduction: 0.05, dailyCooldownReduction: 0.05, casinoCooldownReduction: 0.05 } },
    { id: "nightfall_greaves", name: "Nightfall Greaves", type: "equipment", slot: "boots", cost: 100000, minLevel: 30, rarity: "LEGENDARY", ability: "PHASE", abilityDescription: "Move between operations with impossible speed.", description: "Nightfall Greaves turn every escape into a clean getaway.", effects: { workCooldownReduction: 0.12, heistChance: 4, xpBonus: 0.08, crimeChance: 3 } },
    { id: "soulrender_crown", name: "Soulrender Crown", type: "equipment", slot: "crown", cost: 135000, minLevel: 40, rarity: "LEGENDARY", ability: "DREAD", abilityDescription: "Strike fear into every target.", description: "A crown forged for leaders who never miss their moment.", effects: { crimeChance: 8, crimeRewardBonus: 0.15, fineReduction: 0.10 } },
    { id: "starforged_mantle", name: "Starforged Mantle", type: "equipment", slot: "cloak", cost: 175000, minLevel: 50, rarity: "MYTHIC", ability: "AEGIS", abilityDescription: "Turn danger into a survivable mistake.", description: "A cosmic mantle built to protect elite crews.", effects: { fineReduction: 0.18, workXpBonus: 0.12, heistChance: 5 } },
    { id: "phoenix_core", name: "Phoenix Core", type: "equipment", slot: "relic", cost: 220000, minLevel: 60, rarity: "MYTHIC", ability: "REBIRTH", abilityDescription: "Amplify every new run.", description: "A living ember that feeds both fortune and mastery.", effects: { moneyBonus: 0.14, xpBonus: 0.14, dailyCooldownReduction: 0.10 } },
    { id: "eclipse_greatblade", name: "Eclipse Greatblade", type: "equipment", slot: "weapon", cost: 270000, minLevel: 70, rarity: "MYTHIC", ability: "EXECUTE", abilityDescription: "Turn precision into greater operation rewards.", description: "A blade carried only by the syndicate's most feared operators.", effects: { crimeChance: 10, crimeRewardBonus: 0.20, heistChance: 4 } },
    { id: "chrono_shard", name: "Chrono Shard", type: "equipment", slot: "artifact", cost: 330000, minLevel: 80, rarity: "ASCENDANT", ability: "HASTE", abilityDescription: "Compress downtime across every operation.", description: "A fractured second from a clock that never stops.", effects: { workCooldownReduction: 0.15, crimeCooldownReduction: 0.12, heistCooldownReduction: 0.12, casinoCooldownReduction: 0.12 } },
    { id: "abyssal_grimoire", name: "Abyssal Grimoire", type: "equipment", slot: "tome", cost: 400000, minLevel: 90, rarity: "ASCENDANT", ability: "HEX", abilityDescription: "Bend luck and uncover rarer drops.", description: "Its pages whisper odds that should not exist.", effects: { casinoChance: 2, slotLuck: 20, candyDropBonus: 0.08, xpBonus: 0.18 } },
    { id: "dragon_sovereign_halo", name: "Dragon Sovereign Halo", type: "equipment", slot: "halo", cost: 480000, minLevel: 100, rarity: "ASCENDANT", ability: "ASCEND", abilityDescription: "Raise every core reward stat.", description: "The final mark of a player who has conquered the entire progression ladder.", effects: { moneyBonus: 0.20, xpBonus: 0.20, workPayBonus: 0.20, workXpBonus: 0.20, heistChance: 6, fineReduction: 0.15 } },
  ],
  itemUpgrades: { maxLevel: 5, effectPerLevel: 0.15, costBaseFactor: 0.45, costGrowthFactor: 1.45, levelRequirementPerUpgrade: 1 },
  rebirth: {
    startingWallet: 2500,
    firstWalletRequirement: 15000, walletRequirementStep: 5000,
    firstLevelRequirement: 10, levelRequirementGrowth: 2,
    firstQuestClaimsRequirement: 1, questClaimsGrowthEvery: 20, maxQuestClaimsRequirement: 3,
    firstJobLevelRequirement: 1, jobLevelGrowthEvery: 20, maxJobLevelRequirement: 5,
    firstWorkShiftsRequirement: 1, workShiftsGrowthEvery: 25, maxWorkShiftsRequirement: 3,
    itemRequirementsStartAt: 4, firstGearItemsRequirement: 1, gearItemsGrowthEvery: 40, maxGearItemsRequirement: 3,
    candyItemRequirementsStartAt: 9, firstCandyItemsRequirement: 1, candyItemsGrowthEvery: 45, maxCandyItemsRequirement: 2,
    candyBalanceRequirementsStartAt: 9, firstCandyBalanceRequirement: 10, candyBalanceGrowthEvery: 20, candyBalanceGrowth: 10, maxCandyBalanceRequirement: 50,
    gearUpgradeRequirementsStartAt: 19, firstGearUpgradeLevelsRequirement: 1, gearUpgradeLevelsGrowthEvery: 40, maxGearUpgradeLevelsRequirement: 3
  },
  crimes: [
    { id: "pickpocket", name: "Pickpocket", minLevel: 1, baseChance: 68, rewardMin: 120, rewardMax: 260, fineMin: 20, fineMax: 60, cooldownMs: 5 * minute, xp: 15, difficulty: 1 },
    { id: "shoplift", name: "Shoplift", minLevel: 3, baseChance: 62, rewardMin: 250, rewardMax: 500, fineMin: 40, fineMax: 110, cooldownMs: 7 * minute, xp: 20, difficulty: 2 },
    { id: "smuggle", name: "Smuggle", minLevel: 5, baseChance: 56, rewardMin: 450, rewardMax: 850, fineMin: 80, fineMax: 180, cooldownMs: 10 * minute, xp: 28, difficulty: 3 },
    { id: "courier_intercept", name: "Courier Intercept", minLevel: 8, baseChance: 50, rewardMin: 800, rewardMax: 1500, fineMin: 150, fineMax: 300, cooldownMs: 13 * minute, xp: 36, difficulty: 4 },
    { id: "data_breach", name: "Data Breach", minLevel: 12, baseChance: 45, rewardMin: 1400, rewardMax: 2500, fineMin: 250, fineMax: 500, cooldownMs: 17 * minute, xp: 45, difficulty: 5 },
    { id: "vault_extraction", name: "Vault Extraction", minLevel: 16, baseChance: 40, rewardMin: 2400, rewardMax: 4200, fineMin: 400, fineMax: 800, cooldownMs: 22 * minute, xp: 55, difficulty: 6 }
  ],
  casino: {
    // Same bet range for everyone. No daily wager cap.
    cooldownMs: 10 * 1000,
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
        name: "High Dice", minLevel: 2,
        winningChance: 33.333333, multiplierHundredths: 285,
        theoreticalReturnRate: 0.95,
        description: "Roll a 5 or 6 (2 chances out of 6). A win returns 2.85× your bet. Long-run average return: 95%."
      },
      slots: {
        name: "Slots", minLevel: 3,
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
    { id: "night_market", name: "Night Market Run", minLevel: 1, minParticipants: 2, maxParticipants: 3, difficulty: 1, baseChance: 60, payoutMin: 1800, payoutMax: 3600, failPenalty: 50, cooldownMs: 45 * minute, description: "A compact first team operation." },
    { id: "armored_van", name: "Armored Van", minLevel: 5, minParticipants: 2, maxParticipants: 4, difficulty: 2, baseChance: 54, payoutMin: 6000, payoutMax: 10000, failPenalty: 180, cooldownMs: 75 * minute, description: "Requires a balanced crew and good preparation." },
    { id: "museum_blackout", name: "Museum Blackout", minLevel: 10, minParticipants: 3, maxParticipants: 4, difficulty: 3, baseChance: 48, payoutMin: 14000, payoutMax: 22000, failPenalty: 350, cooldownMs: 2 * hour, description: "A demanding mission for experienced crews." },
    { id: "harbor_exchange", name: "Harbor Exchange", minLevel: 16, minParticipants: 3, maxParticipants: 5, difficulty: 4, baseChance: 44, payoutMin: 22000, payoutMax: 36000, failPenalty: 550, cooldownMs: 3 * hour, description: "Coordinate a five-person handoff across a guarded shipping terminal." },
    { id: "blacksite_extraction", name: "Blacksite Extraction", minLevel: 24, minParticipants: 3, maxParticipants: 5, difficulty: 5, baseChance: 40, payoutMin: 35000, payoutMax: 55000, failPenalty: 850, cooldownMs: 4 * hour, description: "A high-risk, full-crew operation that demands every role." }
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
    // Final-season drop rates keep collectibles attainable without requiring nonstop chat.
    daily_reward: { chance: 0.16, min: 1, max: 2 },
    job_work: { chance: 0.24, min: 1, max: 2 },
    crime_success: { chance: 0.18, min: 1, max: 2 },
    heist_reward: { chance: 0.30, min: 2, max: 3 },
    casino_play: { chance: 0.10, min: 1, max: 2 },
    chat_activity_reward: { chance: 0.03, min: 1, max: 1 },
    achievement_reward: { chance: 0.15, min: 1, max: 2 },
    scavenge_reward: { chance: 0.12, min: 1, max: 1 },
    delivery_contract_reward: { chance: 0.18, min: 1, max: 2 }
  },
  weeklyQuests: [
    { id: "weekly_work", name: "Clock In", action: "work", goal: 3, candy: 20, description: "Complete 3 work shifts." },
    { id: "weekly_daily", name: "Daily Routine", action: "daily", goal: 2, candy: 15, description: "Claim Daily twice." },
    { id: "weekly_crime", name: "Clean Getaway", action: "crime_success", goal: 2, candy: 15, description: "Complete 2 successful crimes." },
    { id: "weekly_casino", name: "Night at the Tables", action: "casino_play", goal: 5, candy: 10, description: "Play 5 casino rounds. Wins are not required." },
    { id: "weekly_heists", name: "Crew Contract", action: "heist_success", goal: 1, candy: 25, description: "Complete 1 successful heist as a crew member." }
  ],
  halloween: {
    eventId: "halloween-2026",
    finalRoleQuestCount: 4,
    weeklyMessageGoal: 250,
    weeklyMessageCandyReward: 45,
    weeklyMessagePointsReward: 45,
    quests: [
      { id: "first_shift", name: "First Shift", action: "work", goal: 2, candy: 20, points: 20, description: "Complete 2 work shifts." },
      { id: "daily_regular", name: "Daily Regular", action: "daily", goal: 2, candy: 15, points: 15, description: "Claim Daily twice." },
      { id: "night_operator", name: "Night Operator", action: "crime_success", goal: 1, candy: 25, points: 25, description: "Complete 1 successful crime." },
      { id: "high_roller", name: "High Roller", action: "casino_play", goal: 2, candy: 15, points: 15, description: "Play 2 casino rounds." },
      { id: "crew_member", name: "Crew Member", action: "heist_success", goal: 1, candy: 35, points: 35, description: "Complete a heist successfully." },
      { id: "steady_income", name: "Steady Income", action: "wallet_earned", goal: 1500, candy: 20, points: 20, description: "Earn 1,500 Fuk Coins from game rewards." }
    ],
    shop: [
      { id: "pumpkin_charm", name: "Pumpkin Charm", cost: 35, unique: true, description: "A seasonal collectible and first collectible milestone." },
      { id: "ghost_token", name: "Ghost Token", cost: 60, unique: true, description: "A rare Halloween collectible and rebirth milestone." },
      { id: "crimson_relic", name: "Crimson Relic", cost: 100, unique: true, description: "The final Candy-shop collectible milestone." }
    ]
  }
};
