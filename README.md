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

The existing `.env` in this project already has values configured for the required settings. Do not replace it with `.env.example`; that file contains placeholders only. The bot uses slash commands; the Message Content intent remains off by default and is requested only when the optional AI Watch is explicitly enabled and configured. Do not open or forward router ports for hosting this bot.

## Commands

Only three commands are needed to use the bot:

The bot's built-in Discord slash-command list is intentionally limited to these three commands:

- **/menu** — opens the private interactive player dashboard.
- **/admin-panel** — opens the private administration console. Only the server owner, configured bot owner and configured trusted Admin Role can use it.
- **/leaderboard ranking:** — publishes a public leaderboard for total wealth, player level, lifetime FC earned or Party Points.

Use the dashboard for the other player features, including the permanent Achievement Book. Dashboard navigation and administration screens remain private; completed gameplay receipts are posted publicly in the configured game channel. The `/leaderboard` response is public so everyone in the channel can see the rankings, with medal positions, scores and Party Games win rates.

The admin console retains its custom JavaScript command workspace. A custom slash command appears in Discord only when an authorized administrator explicitly publishes it; the default deployment contains only the three built-in commands.

Casino games have a 100 FC minimum bet and no maximum bet; wagers are limited only by the player's available wallet balance. The base cooldown is 10 seconds and there is no daily wager cap. Equipped casino gear can increase the frequency of winning results and shorten the cooldown, while adjusting winning payouts to keep the published long-run return fair. Coin Flip, High Dice and Slots each have a base theoretical return of 95%. Slots has a 1% Jackpot (10×), 4% Big win (4×), 20% Small win (3.45×), and 75% no-win chance.

Normal FC rewards from Daily, Work, Crime, Heists, chat activity, achievements and Arena victories use the 3× season multiplier and a level-based earning factor: **+0.5% per level above level 1**, reaching **3.995× at level 600**. Equipped gear and active FC Party events apply only where the reward rules allow them. Casino payouts, player trades and admin grants are excluded from the normal earning multiplier so the published 95% casino return stays unchanged.

### Server Booster rewards

Members actively boosting this server receive automatic passive bonuses across Fukishokai: +15% normal FC rewards, +15% XP, +8% work pay and work XP, +5% crime rewards, +3 crime and heist success points, +5% fine reduction, +3 percentage points to Candy-drop chance, and 5% shorter work, crime, heist, daily and casino cooldowns. Boosters also gain +15% Party Game points and +15% Candy/event points when claiming Halloween rewards. Casino win frequency improves, but payouts are adjusted so the published 95% long-run return stays fair.

**Five 🌟 MYTHIC booster-exclusive items** are awarded by each member's own personal boost notifications — never by the server's total boost count. Personal boost #1 awards the **Crimson Oni Katana**; #2 the **Phantom Shogun Mask**; #3 the **Wraithguard Armor**; #4 the **Dragonfire Signet**; and #5 the **Eternal Kitsune Wings**. Every reward is added to that member's inventory and equipped automatically. There is no claim button and these items cannot be bought with FC. Each item has several strong perks, can be upgraded five times with FC from **/menu → Gear**, and is clearly marked **MYTHIC · BOOSTER EXCLUSIVE** so it cannot be confused with normal shop equipment. Earned items and upgrades stay after a member stops boosting; the separate passive booster bonuses apply only while the member is actively boosting.

**One-time server setup for automatic booster items:** in Discord, open **Server Settings → Overview → System Messages Channel** and enable **Send a message when someone boosts this server**. The bot must be able to view that channel and read its messages. Personal boost #1–#5 each grants the matching MYTHIC item automatically; if the boost notification is not delivered to a channel the bot can read, that boost cannot be counted. Older boosts from before setup are not backfilled. The bot counts Discord's personal **GUILD_BOOST** system messages and ignores the separate server-tier milestone messages. Discord's member object exposes a boost-start timestamp, not a per-member boost quantity, so personal reward progress starts with the boost notifications the bot receives after this feature is deployed.

Equipment bonuses apply only while equipped. Every item can be upgraded five times; the final-season cost curve is reduced so the gear catalogue is reachable before November 30. The eight endgame abilities — PHASE, DREAD, AEGIS, PHOENIX, EXECUTE, HASTE, HEX and ASCEND — retain their passive gear effects and each has a one-use active Arena power. Phoenix Core's healing power is now named **PHOENIX**. Casino gear changes hit frequency while keeping the published 95% return fair. The final season runs through **November 30, 2026 in Tashkent** (default end: **November 30 at 19:00 UTC**, the start of December 1 locally). Daily rewards are 600–900 base FC every 18 hours. Existing player wallets, banks, levels, careers, gear, Candy and collectibles remain intact under the current level-based progression system.

### First steps

1. Run **/menu** and open **Careers**. Choose a career you qualify for.
2. Open **Earn** and claim Daily or start a Work shift. Work keeps three multiple-choice questions per shift, selected from a 115-question randomized pool with 15 additional question templates across easy, medium and hard difficulties. Correct answers improve pay and XP, difficulty sets the shift time limit, and Work FC receives the same player-level income bonus as other normal FC rewards.
3. Use **Profile** to track your level, career and wealth. Use **Bank** to protect savings and **Gear** to manage equipment.
4. Open **Games** to review crime and casino risks, or **Heists** to create a crew. The bot posts a public crew board that updates with each member and chosen role, then publishes the final mission result when the leader starts it.
5. Use **Gear** to equip items and upgrade each one up to five times. More expensive equipment has stronger bonuses; upgrades improve its effects. Gear can improve salary, FC and XP income, operation success, casino hit frequency, fines and cooldowns.
6. Level up to increase eligible FC earnings by **0.5% per level above level 1**. At level 600, the level factor reaches **3.995×**. Your wallet, bank, current level, career, equipment, upgrades and seasonal collectibles continue as you progress.
7. Open **Achievements** to track permanent milestones and claim each unlocked FC/XP reward once. Open **Halloween** to track quests, claim completed rewards, check the weekly activity mission and browse seasonal items.


## Reset all player/game data from the hosting console

The reset utility clears gameplay data for ordinary members across every guild using this database. It checks the Discord bot owner, each Discord server owner, and every member who currently has the **Admin Role** configured for that guild in its admin panel. Those users' records are protected in every player-data table.

It resets everyone else’s FC and bank balances, levels, XP, careers and job progress, lifetime earnings/spending, inventory, equipped gear and upgrades, cooldowns, economy history, Candy/event balances and claims, daily/weekly activity, achievements, Party Game stats, heists and Arena battles. The player's row is reset, so both their selected job and all owned items are removed.

Admin-panel settings, event configuration, custom commands, leaderboard exclusions, audit history and security restrictions are preserved. Discord boost status and boost-message deduplication history are also preserved so old boost notifications cannot grant an already-issued item again; booster items themselves are cleared with inventory.

**Before running:** back up Neon and stop/pause the bot. The script requires \`DISCORD_TOKEN\` and \`OWNER_ID\`. If Discord cannot verify a guild owner or configured Admin Role membership, it aborts without deleting anything.

Preview (no data is deleted):

\`\`\`sh
npm run reset:player-data
\`\`\`

Execute after checking the protected-account count and eligible rows:

\`\`\`sh
npm run reset:player-data -- --confirm RESET_ALL_PLAYER_DATA
\`\`\`

The operation is transactional, locks the affected tables and excludes protected users by guild ID + Discord user ID. Any error rolls the entire reset back. Tables without a recognized guild/member identity are skipped rather than being blindly emptied.
## Quick start for members

1. Run **/menu**.
2. Choose **Careers** and select the first job you qualify for.
3. Open **Earn** and claim Daily or complete a Work shift.
4. Open **Gear** to equip items. Normal gear is bought with FC; 🌟 MYTHIC booster gear is awarded automatically for your personal server boosts.
5. Use **How to play** inside the menu whenever you need a plain-language explanation. You can ignore Casino and Heists until you want them.

## Achievements

The private dashboard's **Achievements** page tracks ten permanent milestones across work shifts, career levels, successful operations, heists, player level, combined wealth and Party Games. Each milestone shows live progress and its FC/XP reward. Unlocked rewards are claimed through the dashboard and can only be collected once; achievement progress does not expire.

## Bank, equipment and audited economy

The Bank dashboard shows wallet and savings balances, lifetime deposits and withdrawals, and recent bank transactions. Deposits and withdrawals move FC between the two balances without creating new lifetime earnings or spending. Player-to-player trade settlements are not counted as earned FC; the Lifetime Earned leaderboard reflects game rewards and casino payouts rather than money moved between accounts.

The Gear dashboard shows owned equipment, equipped slots, active bonuses, total upgrade levels and the cheapest available next upgrade. Each upgrade adds 15% to that item's listed effects, up to five levels. The level-based FC factor is displayed in the player profile. The economy guard keeps a last-verified balance/level snapshot and flags values changed outside bot transactions.

## Careers, operations and casino

The 22 career paths include the original seven plus 15 new specialist careers with progressive level and wallet unlocks, higher salaries and unique passive perks. The Career Desk shows each perk and the member's job-level promotion progress. Work shifts keep three questions per run from a 115-question randomized pool, including 15 added templates across three difficulty bands, with recently shown questions avoided.

The Crime board contains six operations, from Pickpocket through Vault Extraction. Higher-risk operations require higher player levels and offer larger rewards, fines and cooldowns. Career perks, reputation and equipped gear influence success and rewards.

Heists now include five cooperative missions, with crews of two to five and seven selectable roles. Unique crew roles improve team success odds; higher-tier missions require a full, coordinated crew.

The Casino dashboard displays lifetime rounds, wins, win rate, total FC wagered, total payouts, net result and recent round history. The published theoretical return remains 95% for all three casino games. The 3× FC earning multiplier does not apply to casino payouts.

## Party Games and social features

Party Games use **Party Points**, a separate non-spendable score. They do not create FS Coins, so multiplayer activity cannot inflate the economy. Historical party-game records remain stored and can be viewed through the Party Points option in **/leaderboard**. Party Games are accessed through the interactive dashboard; the standalone `/play`, `/roast` and `/fortune` shortcuts are not registered.

## Operations

Set **OWNER_ID** in `.env` to the bot owner Discord user ID. For AI-assisted command creation, also configure a long random `ADMIN_WORKSPACE_API_KEY` and give the same secret to the authorized AI agent. The server owner, configured bot owner, and members holding the Admin Role selected in **/admin-panel → Server settings** can open and operate the full administration console. Discord Administrator, Manage Server, and other admin roles do not grant bot-control access. `ADMIN_ROLE_IDS` is no longer used for bot access.

Configure the trusted Admin Role, log channel, Halloween reward role and 2× XP role in **/admin-panel → Server settings**. The Admin Role must be a normal server role, not @everyone or an integration-managed role. The Halloween reward role must be a normal assignable server role, not `@everyone` or an integration-managed role.

Members open **/menu** in the configured game channel. The dashboard itself stays private; successful gameplay and economy actions are announced in that same channel. Navigation, refreshes and ordinary cooldown messages are not posted publicly.

Weekly activity counts every message sent by a human server member, including rapid or spam messages; there is no message-count cooldown or anti-spam filter. Bot and webhook messages are ignored. Chat FC and XP rewards retain their daily earning caps. The bot records successful member actions, admin changes, failed actions, cooldown blocks and security incidents in PostgreSQL and the configured log channel. The configured log channel should allow the bot to view the channel and send messages. Give the bot **View Audit Log** permission if you want the security monitor to attribute bursts of channel deletions, role deletions or bans to the member who performed them. By default, the bot uses Guilds, Guild Messages, Guild Moderation and Guild Invites and requests no privileged intents. Optional **AI Watch** adds only the privileged **Message Content** intent when `AI_MESSAGE_MONITOR_ENABLED=true`, `OLLAMA_API_KEY` and `OWNER_ID` are configured. You must also enable Message Content Intent in the Discord Developer Portal before restarting. AI Watch never requests Guild Members or Guild Presences. With Message Content enabled, it receives new messages in channels the bot can view, keeps a short in-memory channel context, and sends only plausible rule-related candidates to Ollama Cloud for classification; it does not submit every ordinary chat message to the model. It includes reply context, author IDs/names, role names and positions, effective channel permissions, account creation/join dates when available, and channel metadata. High-confidence evidence is sent by plain-text DM to `OWNER_ID` only, with original message/reply permalinks and attachment links. It never takes moderation actions. The bot still cannot observe ordinary member joins without Guild Members, so invite activity is only a limited raid-preparation signal.

**AI Watch (opt-in):** configure `AI_MESSAGE_MONITOR_ENABLED=true`, `OLLAMA_API_KEY`, `OWNER_ID`, and `AI_MESSAGE_MONITOR_GUILD_IDS` (or `GUILD_ID`), plus optionally `OLLAMA_MODEL=gpt-oss:20b` and `AI_MESSAGE_MONITOR_DAILY_LIMIT=100`. The selected `gpt-oss:20b` model is a cost-efficient general classifier. Ollama Cloud is pay-per-token, not guaranteed free; set a daily limit and check Ollama usage. The temporary Beam free offer ended November 9, 2026. AI Watch reports only to the configured bot owner, uses a high confidence threshold, suppresses repeated notices, and performs no actions. It does not create Discord screenshots; evidence is provided through original message and reply links. Message content and the selected context are sent to Ollama Cloud, so enable it only if that data transfer is acceptable. The default remains disabled.


Routine member-level monitoring, cooldown-abuse records and bot-access restrictions continue to respect the existing owner, trusted Admin Role and role-hierarchy exemptions. High-impact anti-nuke/anti-raid signals are different: when destructive audit-log activity or invite bursts cross their thresholds, **only the two configured Fukishōkai Kings and the configured bot owner (`OWNER_ID`) receive private DMs**. The server owner is not added as a separate recipient unless they are one of the two Kings. These systems are strictly alert-only: no action buttons or controls are attached, and the bot never bans, kicks, times out, restricts accounts, removes roles, changes permissions, changes verification settings or takes any other moderation/server action in response to an anti-nuke or anti-raid alert.

Fukishokai's staff moderation framework is separate from this economy game bot. Staff promotions, weekly moderator quotas, warnings and mutes, verbal/severe-verbal/strike decisions, and staff performance reviews remain governed by the server's staff guide and human staff leadership. The bot does not automatically promote, demote, warn, mute, or strike staff members. Staff notes should follow the guide's concise, professional format and clearly record the staff member, action level, reason, and supporting evidence.

Security incidents are recorded in PostgreSQL. Routine security notices retain their configured owner/admin notification workflow. **Anti-nuke and anti-raid notices are a separate alert-only path:** they are privately DM'd only to both protected Fukishōkai Kings and the configured bot owner (`OWNER_ID`), with no extra server-owner recipient unless that owner is one of the Kings. Those DMs contain incident details but **no buttons, controls or action prompts**. No public security-channel posts or owner mentions are sent. Anti-nuke and anti-raid incidents bypass the routine digest but are throttled to one DM per server/category every 10 minutes, including across bot restarts. If a recipient has DMs disabled, failed delivery is recorded in the bot logs.

**Fukishōkai King hierarchy:** the clan founder and server owner are configured as the bot's two highest-trust identities, above the configured OWNER_ID. Both have full bot-admin and Code Studio access, bypass bot-level restrictions and ordinary rate-limit/security exemptions, and cannot be targeted by administrator member-management actions. Their accounts are protected from admin FC/XP/level/career edits, leaderboard exclusion, individual administrator DMs and bulk administrator DM campaigns. They still receive security incident notices.

Economy guards reject invalid currency/XP mutations before player data changes. Owner notifications are limited to severe integrity signals: repeated out-of-band balance/level mismatches (two within ten minutes), invalid casino payouts, reward bursts scoring at least 80/100, or at least three rejected currency/XP mutations by one member within two minutes. Softer activity and isolated malformed mutations are ignored. Economy DMs are concise plain-text context messages with a recommended manual review. Authorized owners/admins may explicitly choose to exclude the member from leaderboards, pause Fukishōkai bot access for one hour, or block Fukishōkai bot access until restored. These are bot-side controls applied only after a button is clicked; no economy alert automatically bans, kicks, times out, excludes or restricts a member.

**Anti-nuke:** With View Audit Log enabled, the bot attributes channel/role creation and deletion, member bans and kicks to recent audit-log entries. Three channel/role deletions, five member removals, or eight channel/role creations within 20 seconds trigger an alert. A single high-impact permission grant (such as Administrator, Manage Server, Manage Channels, Manage Roles, Ban/Kick, Manage Webhooks or Manage Messages) to a role or channel overwrite also triggers immediate detection. **Strictly alert-only:** the bot records the incident and privately DMs only the two Kings and configured bot owner. No action buttons are attached, and the bot never bans, kicks, times out, restricts accounts, removes roles or changes permissions/settings in response.

**Anti-raid without privileged intents:** The bot monitors invite creation/deletion activity using the standard **Guild Invites** intent. Five invite creations in 30 seconds, or eight invite changes with at least three creations and two deletions, trigger an alert. This is a possible raid-preparation/invite-distribution signal, not proof that new members have joined. The bot cannot see ordinary member-join events without the privileged Guild Members intent, so it does not claim to detect join waves. **Strictly alert-only:** only the two Kings and configured bot owner receive private DMs. There are no buttons or lockdown controls, and the bot never changes verification settings, roles, permissions or member status.

No privileged intents need to be enabled in the Discord Developer Portal. Anti-nuke attribution requires **View Audit Log**. The anti-nuke and anti-raid alert systems do not require ban, kick, timeout, role-management, or Manage Server permissions because they do not perform moderation or server changes. Guild Invites is a standard, non-privileged Gateway intent.

Built-in command registration during initial setup still uses `npm run deploy-commands`. Custom JavaScript commands are registered directly through Discord while the bot is online; creating, editing, deleting, syncing or activating one does not restart the process. Each command source file is re-read for every invocation, so the next interaction uses the latest saved code. The database schema is applied automatically at bot startup. Back up the database before the event ends and run `npm test` before deploying changes.


## Administration controls

Open **/admin-panel** to manage the server from one private interface:

- **Server settings:** Halloween reward role, 2× XP role, log channel, and clear-setting controls.
- **Event controls:** start/restart or stop the Halloween event. Stopping requires confirmation.
- **Player management:** select a member, inspect their player details, and open Grant FC, Grant XP, Remove FC, Set level or Assign career forms. Currency grants require an audit reason; the panel blocks self-grants and records administrator actions.
- **Leaderboard fairness:** select a member and exclude or restore them from competitive rankings.
- **Custom slash commands:** create and edit real `.js` files in Code Studio. Files are saved under `admin-workspace/<server-id>/<command-name>.js`, mirrored to PostgreSQL for recovery, validated, tested and synced directly to Discord without restarting the bot. JavaScript commands export `data` (name, description and slash options) and `async execute(interaction)`, then use `interaction.options.getString()`, `interaction.options.getUser()`, `interaction.reply()`, `interaction.editReply()` and `interaction.followUp()`. They use JavaScript modules and a restricted Discord.js-style interaction API. A small `require('discord.js')` shim provides `SlashCommandBuilder` and `EmbedBuilder`; arbitrary Node modules, host secrets, direct filesystem access, the live bot client and unrestricted network access are not exposed. Use `data.setVisibility('private')` for private replies.
- **Audit history:** review the ten most recent administrative changes.
- **Security:** owner-controlled bot-access restrictions are applied from alerts in the log channel.

All admin actions are available to the server owner, configured bot owner, protected Fukishōkai Kings and configured Admin Role, and are recorded in PostgreSQL. Protected King accounts cannot be managed as member targets by the admin console. Code Studio and the AI workspace API write `.js` files into `admin-workspace/<server-id>/`. To let an external AI chatbot create and publish command files, set `ADMIN_WORKSPACE_API_KEY` in the bot host and give the same bearer key to the AI tool. The API supports listing, reading, creating/updating and deleting command files; writes can validate, register and activate a command immediately. Keep this key private. Command files execute in `isolated-vm` with a narrow command context, not in the bot process, so they cannot access host secrets or arbitrary Node.js modules. On hosts with ephemeral disks, mount persistent storage at `ADMIN_WORKSPACE_DIR`; the workspace files are restored from PostgreSQL when the bot starts. Saving a changed command deactivates it until it is synced and activated again.


## Rift Arena — active boss combat

The Rift Arena is available from **/menu → Game Room → Rift Arena**.

- Six solo bosses unlock at player levels 1, 20, 40, 60, 80 and 100, ending with the Dragon Sovereign.
- Battles persist in PostgreSQL. A player can have only one active encounter, and starting a fresh encounter has a 20-minute cooldown.
- Each equipped endgame item grants its named active power once per battle, in addition to its existing passive gear bonuses:
  - **PHASE** — evade the boss's next counterstrike.
  - **DREAD** — weaken the next three boss strikes.
  - **AEGIS** — create a protective shield.
  - **PHOENIX** — restore a portion of player health.
  - **EXECUTE** — deal bonus damage based on the boss's remaining health.
  - **HASTE** — double the damage of a strike.
  - **HEX** — apply damage over time.
  - **ASCEND** — unleash a large burst of damage.
- Victory awards FC and XP. FC rewards use the normal 3× season multiplier, level-based factor, and eligible gear/event bonuses. A defeat does not charge an FC fine. Retreat ends the encounter but does not reset the entry cooldown.
- Turn numbers are checked on the server to reject stale controls. Item ownership and equipped status are checked before a power can be used.
- The Arena dashboard includes health bars, combat effects and a custom beveled HUD image rendered with `@napi-rs/canvas`. The image uses a 3D-inspired, layered 2D illustration; Discord embeds themselves are not true 3D scenes.

**Implementation status:** Rift Arena is committed to `main`. The Dragon Sovereign now uses a dedicated original creature portrait at `assets/bosses/dragon-sovereign.webp` rather than the former emblem-like art. GitHub CI validates the canvas PNG render; Neon migration and live Discord test-server interactions remain separate deployment checks.


## Final-season balance — through November 30, 2026

This is a short, playable finale, not a multi-month grind. The default event end is December 1, 2026 at 00:00 UTC (05:00 in Tashkent), including the full November 30 local day. The bot does not automatically shut down after the event.

- Player level cap: **600**. XP per level: `80 + 12 × current level`.
- Eligible normal FC income uses the **3× season multiplier** plus **0.5% per level above level 1**, reaching a **3.995× level factor at level 600**. Gear and FC Party bonuses follow action-specific rules.
- Player progression retains the 600-level cap; wallets, banks and levels are not reset by ordinary gameplay progression.
- Career unlocks, gear prices, crimes, heists, weekly quests, Halloween quests, Candy shop, achievements, Party Fortune and Arena boss gates are reduced for the short season.
- Casino retains a 95% theoretical return, 100 FC minimum bet and no daily wager cap; base cooldown is 10 seconds.
- Booster-exclusive rewards and automatic boost assignment remain unchanged.


## Trading, leaderboards, FC activities and administration

- Player-to-player one-way FC transfers have been removed. Use /menu → Trade for two-sided trading: both members must contribute FC or items, both independently confirm the final offer, and editing either offer clears both confirmations. Trades expire after 30 minutes and settle FC/items atomically. Booster-exclusive Mythic gear cannot be traded.
- The leaderboard includes every saved player profile, including zero-stat profiles, plus tracked Party Game/activity records and members currently known in cache. Privileged Gateway intents are deliberately disabled, so Discord does not allow the bot to enumerate never-seen members. A one-off exact Discord-ID lookup is supported. Categories include wealth, level, lifetime FC, Party Points, weekly messages, career level, successful crimes and completed heists, with Previous/Next pagination and no decorative rank emojis.
- New repeatable earning activities: Scavenge (30-minute cooldown) and Delivery Contract (3-hour cooldown). Both award FC and XP, use the normal level/gear multipliers and may drop Candy.
- Trusted administrators can start a server-wide FC Party with a 2×–10× multiplier for 5 minutes–24 hours. It multiplies eligible gameplay earnings only; casino payouts, trades and admin grants are excluded. Starting an FC Party posts a short text announcement in the configured member/game commands channel. It includes event name, duration/end time, FC multiplier and starter display name. It may ping **only** the configured Halloween reward role (`halloweenRoleId`), using an explicit `allowedMentions.roles` allowlist. It never uses `@everyone` or `@here`; if the reward role is missing, invalid, or cannot be mentioned, the announcement is sent without a role ping.
- The admin console includes Member DMs for one selected member or tracked profiles plus cached members. The privileged Members intent stays disabled, so members who have never interacted with the bot cannot be automatically discovered. Delivery is paced, bots are skipped, failures are counted, and sends are recorded in audit history. Discord privacy settings still apply; the bot cannot bypass closed DMs.


## Admin Abuse live events

**Admin Abuse is separate from FC Party Events.** Trusted administrators can trigger short, server-wide gameplay effects from **/admin-panel → Admin Abuse**:

- **Blood Moon:** crime success chance +12 percentage points and crime base rewards +25%.
- **Candy Storm:** every eligible gameplay reward grants an additional 1–2 Candy.
- **Rift Surge:** Rift Arena victory FC and XP rewards increase by 50%.
- **Lucky Block Rain:** each player can open one event Lucky Block for FC, Candy and a random level-eligible non-booster equipment item.

Each event has a configurable 2–60 minute duration, a public announcement in the configured member-command channel, an audit record and an administrator stop control. Lucky Block claims are one-per-player-per-event and protected by a database uniqueness constraint.

## Gateway intent policy

The bot does not request privileged Gateway intents. Leaderboards and bulk DM campaigns operate on saved player profiles, tracked activity and cached members. Full roster enumeration is intentionally unavailable; searching a specific Discord ID uses an individual member lookup instead.
