# Fukishokai Halloween Bot

A Fukishokai-branded Discord economy game and Halloween event bot. It shares one economy, player profile, progression system, ledger, cooldown system, quest tracker, and embed renderer across games.

## Requirements

- Node.js 20+
- A Discord application and bot token
- PostgreSQL (the Neon Free plan is supported through DATABASE_URL)

## Free hosting without billing details

For a one-month event where you must not provide payment details, the simplest option is to run the bot on your own Windows PC and use Neon Free for PostgreSQL. Neon says its Free plan is permanent and requires no credit card. The bot itself then costs nothing to host, but it is online only while your PC, internet connection, and bot process are running. Keep the PC plugged in and prevent it from sleeping during the event.

Cloud alternatives have trade-offs: Render's free web services sleep after 15 minutes without inbound traffic, which interrupts a Discord gateway connection; Oracle Cloud's free-tier signup asks for a credit or debit card. Railway's free trial is a one-time $5 credit for up to 30 days, followed by a $1/month free allowance, so it is not a dependable no-billing-details 24/7 option.

- [Neon Free plan and billing details](https://neon.com/pricing)
- [Render free-service limitations](https://render.com/docs/free)
- [Oracle Cloud Free Tier FAQ](https://www.oracle.com/cloud/free/)
- [Railway trial and free-plan terms](https://docs.railway.com/pricing/free-trial)

## Setup on Windows

1. Install Node.js 20 or newer. Keep the existing `.env` file if you already have one; otherwise, in PowerShell from the project folder run `Copy-Item .env.example .env`.
2. Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications). Copy the bot token and application ID into `.env` as `DISCORD_TOKEN` and `CLIENT_ID`. Keep the token private; never paste it into chat or commit `.env`.
3. Create a database on the [Neon Free plan](https://neon.com/pricing) and copy its connection string into `DATABASE_URL` in `.env`. Neon Free is listed as $0/month with no credit card required. Do not share the connection string.
4. Optionally set `GUILD_ID` to your Discord server ID to register commands there immediately. Leave it empty to register global commands.
5. From PowerShell in the project folder, run:

   ```powershell
   npm install
   npm run db:migrate
   npm run deploy-commands
   npm start
   ```

6. Invite the bot to your server with the `bot` and `applications.commands` scopes. Keep the PowerShell window open for the duration of the event; use Ctrl+C to stop the bot cleanly.

The existing `.env` in this project already has values configured for the required settings. Do not replace it with `.env.example`; that file contains placeholders only. The bot uses slash commands and does not request the Message Content intent. Do not open or forward router ports for hosting this bot.

## Commands

Four built-in slash commands are available:

The bot's built-in Discord slash-command list contains four commands:

- **/menu** — opens the private interactive player dashboard.
- **/profile** — publishes the orange Halloween profile card with level, XP, rank, wallet, bank, Candy, career, rebirths and activity stats.
- **/admin-panel** — opens the private administration console. Only the server owner, configured bot owner and configured trusted Admin Role can use it.
- **/leaderboard ranking:** — publishes a public leaderboard for total wealth, player level, lifetime FC earned or Party Points.

Use the dashboard for the other player features, including the permanent Achievement Book. Dashboard navigation and administration screens remain private; completed gameplay receipts are posted publicly in the configured game channel. The `/leaderboard` response is public so everyone in the channel can see the rankings, with medal positions, scores and Party Games win rates.

The admin console retains its custom JavaScript command workspace. A custom slash command appears in Discord only when an authorized administrator explicitly publishes it; the default deployment contains only the three built-in commands.

Casino games have a 100 FC minimum bet and no maximum bet; wagers are limited only by the player's available wallet balance. The base cooldown is 15 seconds and there is no daily wager cap. Equipped casino gear can increase the frequency of winning results and shorten the cooldown, while adjusting winning payouts to keep the published long-run return fair. Coin Flip, High Dice and Slots each have a base theoretical return of 95%. Slots has a 1% Jackpot (10×), 4% Big win (4×), 20% Small win (3.45×), and 75% no-win chance.

Normal FC rewards from Daily, Work, Crime, Heists, chat activity and achievements use the 3× base FC multiplier. Rebirth bonuses and equipped gear stack on top. Casino payouts are excluded so each game's published 95% theoretical return remains unchanged.

### RPG progression and endgame

Player progression runs from **level 1 to level 600**. XP requirements accelerate gradually at high levels, and level 600 is enforced in game logic, admin controls and the database.

Rebirth runs from **0 to 100**. Each rebirth adds **+0.5×** to FC and XP: 0 = 1×, 1 = 1.5×, 2 = 2×, 3 = 2.5×, 20 = 11×, 50 = 26× and 100 = 51×. This is linear, not exponential. The 100th rebirth is the final ascension tier. The first rebirth requires 500,000 FC, level 35, three claimed event rewards, career level 5 and 20 work shifts. Work-shift requirements cap at 30. Wealth and level targets scale across later ascensions; equipment, Candy collectibles and upgrade milestones start from rebirth #3. Rebirth resets wallet to 1,000 FC, bank to zero, level to 1 and current career. Equipment, upgrades, Candy, collectibles, event claims and lifetime records remain.

The career ladder has **12 tiers**, ending with Eternal Overlord at level 600. Crime has 10 operations and cooperative heists have 9 missions, with endgame content unlocking between levels 120 and 550.

The equipment shop contains 18 standard gear pieces plus five automatic Mythic Booster exclusives. Eight endgame items unlock from level 100 to 570. Each has a named special ability with a short description and a chance to trigger during its matching action: Blood Pact, Phase, Bulwark, Perfect, Echo, Rift, Overdrive and Dominion. Abilities scale with item upgrades and appear in Gear and activity reports.

Candy drops from ordinary chat are silent: Candy is credited as before, but the bot no longer posts a public message for each chat drop. Candy from explicit game actions can still appear in those action results.

### Server Booster rewards

Members actively boosting this server receive automatic passive bonuses across Fukishokai: +15% normal FC rewards, +15% XP, +8% work pay and work XP, +5% crime rewards, +3 crime and heist success points, +5% fine reduction, +3 percentage points to Candy-drop chance, and 5% shorter work, crime, heist, daily and casino cooldowns. Boosters also gain +15% Party Game points and +15% Candy/event points when claiming Halloween rewards. Casino win frequency improves, but payouts are adjusted so the published 95% long-run return stays fair.

**Five 🌟 MYTHIC booster-exclusive items** are awarded by each member's own personal boost notifications — never by the server's total boost count. Personal boost #1 awards the **Crimson Oni Katana**; #2 the **Phantom Shogun Mask**; #3 the **Wraithguard Armor**; #4 the **Dragonfire Signet**; and #5 the **Eternal Kitsune Wings**. Every reward is added to that member's inventory and equipped automatically. There is no claim button and these items cannot be bought with FC. Each item has several strong perks, can be upgraded five times with FC from **/menu → Gear**, and is clearly marked **MYTHIC · BOOSTER EXCLUSIVE** so it cannot be confused with normal shop equipment. Earned items and upgrades stay after a member stops boosting; the separate passive booster bonuses apply only while the member is actively boosting.

**One-time server setup for automatic booster items:** in Discord, open **Server Settings → Overview → System Messages Channel** and enable **Send a message when someone boosts this server**. The bot must be able to view that channel and read its messages. Personal boost #1–#5 each grants the matching MYTHIC item automatically; if the boost notification is not delivered to a channel the bot can read, that boost cannot be counted. Older boosts from before setup are not backfilled. The bot counts Discord's personal **GUILD_BOOST** system messages and ignores the separate server-tier milestone messages. Discord's member object exposes a boost-start timestamp, not a per-member boost quantity, so personal reward progress starts with the boost notifications the bot receives after this feature is deployed.

Equipment bonuses apply only while the item is equipped. Gear can improve work salary and XP, general FC and XP rewards, crime and heist outcomes, casino win chances, cooldowns, and random Candy drop chances. Each item can be upgraded five times; upgrades cost progressively more FC and require higher player levels. Casino gear improves the chance of hitting a win, while the payout is adjusted to preserve each game's published long-run return. Candy drops are rolled on real FC earnings: Daily 12%, Work 20%, successful Crime 14%, Heist rewards 26%, Casino payouts 6%, and chat FC rewards 2.5%. Equipped gear adds up to 20 percentage points to the chance, with upgrades strengthening the bonus. Drops remain available after the Halloween event schedule ends. The first three rebirths have no gear, Candy or upgrade requirements. Starting with the fourth rebirth, members need progressively more distinct equipment, unique Candy-shop collectibles and an unspent Candy reserve; gear-upgrade levels are added from the fifth rebirth onward. Rebirth begins at 30,000 FC in combined wallet and bank wealth and player level 8. It also requires claimed normal event quest rewards, an active career at the required job level, and completed work shifts in the current run. Each rebirth resets the wallet to 1,000 FC, bank to zero, player level to 1, and current career, while doubling FC and XP earning permanently (2×, then 4×, 8× and so on). For later rebirths, the FC target grows by 1.5×, the player-level target rises by two, claimed quest requirements increase by one up to the six normal quests, job level rises every two rebirths, and required work shifts increase by two.

### First steps

1. Run **/menu** and open **Careers**. Choose a career you qualify for.
2. Open **Earn** and claim Daily or start a Work shift. Work uses three multiple-choice questions; each correct answer increases the reward.
3. Use **Profile** to track your level, career and wealth. Use **Bank** to protect savings and **Gear** to manage equipment.
4. Open **Games** to review crime and casino risks, or **Heists** to create a crew. The bot posts a public crew board that updates with each member and chosen role, then publishes the final mission result when the leader starts it.
5. Use **Gear** to equip items and upgrade each one up to five times. More expensive equipment has stronger bonuses; upgrades improve its effects. Gear can improve salary, FC and XP income, operation success, casino hit frequency, fines and cooldowns.
6. Open **Rebirth** to see the live ascension checklist. Each rebirth adds +0.5× FC and XP, up to 51× at 100 rebirths. Work shifts never exceed 30 per run. Gear, upgrades, Candy, collectibles, event claims and lifetime records stay; wallet, bank, level and career reset.
7. Open **Achievements** to track permanent milestones and claim each unlocked FC/XP reward once. Open **Halloween** to track quests, claim completed rewards, check the weekly activity mission and browse seasonal items.

## Quick start for members

1. Run **/menu**.
2. Choose **Careers** and select the first job you qualify for.
3. Open **Earn** and claim Daily or complete a Work shift.
4. Open **Gear** to equip items. Normal gear is bought with FC; 🌟 MYTHIC booster gear is awarded automatically for your personal server boosts.
5. Use **How to play** inside the menu whenever you need a plain-language explanation. You can ignore Rebirth, Casino and Heists until you want them.

## Achievements

The private dashboard's **Achievements** page tracks permanent milestones across work shifts, career levels, successful operations, heists, player levels up to 600, combined wealth, rebirths up to 100 and Party Games. Each milestone shows live progress and its FC/XP reward. Unlocked rewards are claimed through the dashboard and can only be collected once; achievement progress does not expire.

## Bank, equipment and rebirth records

The Bank dashboard shows wallet and savings balances, lifetime deposits and withdrawals, and recent bank transactions. Deposits and withdrawals move FC between the two balances without creating new lifetime earnings or spending. Player-to-player transfers are not counted as earned FC; the Lifetime Earned leaderboard reflects game rewards and casino payouts rather than money moved between accounts.

The Gear dashboard shows owned equipment, equipped slots, active bonuses, total upgrade levels and the cheapest available next upgrade. Each upgrade adds 15% to that item's listed effects, up to five levels. Rebirth keeps equipment, upgrades, Candy, collectibles, event claims and lifetime records; it resets wallet, bank, level and current career. The dashboard previews the next rebirth requirements and records completed rebirths.

## Careers, operations and casino

All twelve career tiers now have a distinct passive benefit: work pay, work cooldown, general FC income, crime success, crime rewards, or heist success. The Career Desk shows each perk and the member's job-level promotion progress. Work shifts continue to generate a fresh pool of 100 randomized questions in one of three difficulty bands, with recent questions avoided.

The Crime board contains ten operations, from Pickpocket through the endgame Abyssal Extraction. Higher-risk operations require higher player levels and offer larger rewards, fines and cooldowns. Career perks, reputation and equipped gear influence success and rewards.

Heists now include nine cooperative missions, with crews of two to five and seven selectable roles. Unique crew roles improve team success odds; higher-tier missions require a full, coordinated crew.

The Casino dashboard displays lifetime rounds, wins, win rate, total FC wagered, total payouts, net result and recent round history. The published theoretical return remains 95% for all three casino games. The 3× FC earning multiplier does not apply to casino payouts.

## Party Games and social features

Party Games use **Party Points**, a separate non-spendable score. They do not create FS Coins, so multiplayer activity cannot inflate the economy. Historical party-game records remain stored and can be viewed through the Party Points option in **/leaderboard**. Party Games are accessed through the interactive dashboard; the standalone `/play`, `/roast` and `/fortune` shortcuts are not registered.

## Operations

Set **OWNER_ID** in `.env` to the bot owner Discord user ID. For AI-assisted command creation, also configure a long random `ADMIN_WORKSPACE_API_KEY` and give the same secret to the authorized AI agent. The server owner, configured bot owner, and members holding the Admin Role selected in **/admin-panel → Server settings** can open and operate the full administration console. Discord Administrator, Manage Server, and other admin roles do not grant bot-control access. `ADMIN_ROLE_IDS` is no longer used for bot access.

Configure the trusted Admin Role, log channel, member command + Candy-drop channel, Halloween reward role and 2× XP role in **/admin-panel → Server settings**. Channel options live on the separate **Channel settings** page. The Admin Role must be a normal server role, not @everyone or an integration-managed role. The Halloween reward role must be a normal assignable server role, not `@everyone` or an integration-managed role.

Members use **/menu** and **/profile** in the channel selected under **/admin-panel → Server settings → Channel settings**. The dashboard itself stays private; completed game actions publish readable receipts in the configured game channel. Routine chat Candy drops are silent. Navigation, refreshes and ordinary cooldown messages are not posted publicly.

Weekly activity counts every message sent by a human server member, including rapid or spam messages; there is no message-count cooldown or anti-spam filter. Bot and webhook messages are ignored. Chat FC and XP rewards retain their daily earning caps. The bot records successful member actions, admin changes, failed actions, cooldown blocks and security incidents in PostgreSQL. Member activity appears in the configured log channel as compact report embeds with named fields instead of raw JSON; full structured event details remain in the database audit history. The configured log channel should allow the bot to view the channel and send messages. Give the bot **View Audit Log** permission if you want the security monitor to attribute bursts of channel deletions, role deletions or bans to the member who performed them. The bot uses the standard Guild Moderation gateway intent; it does not require Message Content, Guild Members or Guild Presences for these protections.

Security alerts only monitor members whose highest role is at or below the bot's highest role. Members above the bot's role hierarchy, the server owner, the configured bot owner, and members with the configured trusted Admin Role are excluded from security alerts, security logs, cooldown-abuse records, and bot restrictions. Their successful gameplay can still be announced publicly in the game channel, but it is not written to operational activity or security logs. The bot will not apply pause, block or timeout actions to them.

Fukishokai's staff moderation framework is separate from this economy game bot. Staff promotions, weekly moderator quotas, warnings and mutes, verbal/severe-verbal/strike decisions, and staff performance reviews remain governed by the server's staff guide and human staff leadership. The bot does not automatically promote, demote, warn, mute, or strike staff members. Staff notes should follow the guide's concise, professional format and clearly record the staff member, action level, reason, and supporting evidence.

Security alerts mention the server owner and configured bot owner. Their buttons can ignore an alert, pause a member's access to this bot for 10 minutes, block bot access until an owner restores it, or restore bot access. A separate **Timeout 10m** action is available for a detected target; it only runs after an owner clicks it and only when Discord allows the bot to moderate that member. No timeout, kick or ban is applied automatically. Bot-access restrictions affect this bot only, not the member's Discord permissions.

Built-in command registration during initial setup still uses `npm run deploy-commands`. Custom JavaScript commands are registered directly through Discord while the bot is online; creating, editing, deleting, syncing or activating one does not restart the process. Each command source file is re-read for every invocation, so the next interaction uses the latest saved code. The database schema is applied automatically at bot startup. Back up the database before the event ends and run `npm test` before deploying changes.


## Administration controls

Open **/admin-panel** to manage the server from one private interface:

- **Server settings:** Halloween reward role, 2× XP role, log channel, and clear-setting controls.
- **Event controls:** start/restart or stop the Halloween event. Stopping requires confirmation.
- **Player management:** select a member, inspect their player details, and open Grant FC, Grant XP, Remove FC, Set level, Assign career or Set rebirth forms. Setting rebirth changes only the rebirth count (0–100) and earning multiplier; setting level supports levels 1–600; the member's other progress stays unchanged.
- **Leaderboard fairness:** select a member and exclude or restore them from competitive rankings.
- **Custom slash commands:** create and edit real `.js` files in Code Studio. Files are saved under `admin-workspace/<server-id>/<command-name>.js`, mirrored to PostgreSQL for recovery, validated, tested and synced directly to Discord without restarting the bot. JavaScript commands export `data` (name, description and slash options) and `async execute(interaction)`, then use `interaction.options.getString()`, `interaction.options.getUser()`, `interaction.reply()`, `interaction.editReply()` and `interaction.followUp()`. They use JavaScript modules and a restricted Discord.js-style interaction API. A small `require('discord.js')` shim provides `SlashCommandBuilder` and `EmbedBuilder`; arbitrary Node modules, host secrets, direct filesystem access, the live bot client and unrestricted network access are not exposed. Use `data.setVisibility('private')` for private replies.
- **Audit history:** review the ten most recent administrative changes.
- **Security:** owner-controlled bot-access restrictions are applied from alerts in the log channel.

All admin actions are restricted to the server owner, configured bot owner and configured Admin Role, and are recorded in PostgreSQL. Code Studio and the AI workspace API write `.js` files into `admin-workspace/<server-id>/`. To let an external AI chatbot create and publish command files, set `ADMIN_WORKSPACE_API_KEY` in the bot host and give the same bearer key to the AI tool. The API supports listing, reading, creating/updating and deleting command files; writes can validate, register and activate a command immediately. Keep this key private. Command files execute in `isolated-vm` with a narrow command context, not in the bot process, so they cannot access host secrets or arbitrary Node.js modules. On hosts with ephemeral disks, mount persistent storage at `ADMIN_WORKSPACE_DIR`; the workspace files are restored from PostgreSQL when the bot starts. Saving a changed command deactivates it until it is synced and activated again.
