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

The bot now has two user-facing slash-command entry points:

- **/menu** — open the private player hub. Buttons and menus guide members through profile, rewards, careers, banking, transfers, gear, games, heists, Halloween and leaderboards.
- **/admin panel** — open the private administration console. Server settings, event controls, player tools, leaderboard fairness and audit history are managed inside the panel.

Actions that require typed values open a short form. Members no longer need separate slash commands for routine game actions. The older command names are removed when the slash commands are redeployed.

Casino games have a 100 FC minimum bet and no maximum bet; wagers are limited only by the player's available wallet balance. The base cooldown is 15 seconds and there is no daily wager cap. Equipped casino gear can increase the frequency of winning results and shorten the cooldown, while adjusting winning payouts to keep the published long-run return fair. Coin Flip and High Dice have a base theoretical return of 95%, and Slots has a base return of 90%.

Equipment bonuses apply only while the item is equipped. Gear can improve work salary and XP, general FC and XP rewards, crime and heist outcomes, casino win chances, and cooldowns. Each item can be upgraded five times; upgrades cost progressively more FC and require higher player levels. Casino gear improves the chance of hitting a win, while the payout is adjusted to preserve each game's published long-run return. Rebirth requires 15,000 FC in combined wallet and bank wealth, level 10, and at least one event quest reward claimed. Each rebirth resets the wallet to 1,000 FC and the player to level 1, but doubles FC and XP earning permanently (2×, then 4×, 8× and so on). The next wealth requirement grows by 2.5× and the level requirement increases by five after each rebirth; owned gear and upgrades are kept. Claiming one normal event quest reward permanently unlocks rebirth.

### First steps

1. Run **/menu** and open **Careers**. Choose a career you qualify for.
2. Open **Earn** and claim Daily or start a Work shift. Work uses three multiple-choice questions; each correct answer increases the reward.
3. Use **Profile** to track your level, career and wealth. Use **Bank** to protect savings and **Gear** to manage equipment.
4. Open **Games** to review crime and casino risks, or **Heists** to create a crew. The bot posts a public crew board that updates with each member and chosen role, then publishes the final mission result when the leader starts it.
5. Use **Gear** to equip items and upgrade each one up to five times. More expensive equipment has stronger bonuses; upgrades improve its effects. Gear can improve salary, FC and XP income, operation success, casino hit frequency, fines and cooldowns.
6. Open **Rebirth** when you meet its requirements. The first rebirth requires 15,000 FC in combined wallet and bank wealth, level 10, and at least one normal event quest reward claimed. Rebirth resets wallet to 1,000 FC, bank to zero and player level to 1. Gear, gear upgrades, event claims and lifetime records stay. Every rebirth doubles eligible FC and XP earnings: 2× after the first, 4× after the second, 8× after the third, and so on. Later rebirths require 2.5 times the previous wealth target and five more levels.
7. Open **Halloween** to track quests, claim completed rewards, check the weekly activity mission and browse seasonal items.

## Operations

Set **OWNER_ID** in `.env` to the bot owner's Discord user ID. The server owner, configured bot owner, and members holding the Admin Role selected in **/admin panel → Server settings** can open and operate the full administration console. Discord Administrator, Manage Server, and other admin roles do not grant bot-control access. `ADMIN_ROLE_IDS` is no longer used for bot access.

Configure the trusted Admin Role, log channel, Halloween reward role and 2× XP role in **/admin panel → Server settings**. The Admin Role must be a normal server role, not @everyone or an integration-managed role. The Halloween reward role must be a normal assignable server role, not `@everyone` or an integration-managed role.

Members open **/menu** in the configured game channel. The dashboard itself stays private; successful gameplay and economy actions are announced in that same channel. Navigation, refreshes and ordinary cooldown messages are not posted publicly.

Weekly activity counts every message sent by a human server member, including rapid or spam messages; there is no message-count cooldown or anti-spam filter. Bot and webhook messages are ignored. Chat FC and XP rewards retain their daily earning caps. The bot records successful member actions, admin changes, failed actions, cooldown blocks and security incidents in PostgreSQL and the configured log channel. The configured log channel should allow the bot to view the channel and send messages. Give the bot **View Audit Log** permission if you want the security monitor to attribute bursts of channel deletions, role deletions or bans to the member who performed them. The bot uses the standard Guild Moderation gateway intent; it does not require Message Content, Guild Members or Guild Presences for these protections.

Security alerts only monitor members whose highest role is at or below the bot's highest role. Members above the bot's role hierarchy, the server owner and the configured bot owner are excluded from security alerts, security logs, cooldown-abuse records, and bot restrictions. Their completed gameplay is also not written to the member activity log or announced by the bot. The bot will not apply pause, block or timeout actions to them.

Security alerts mention the server owner and configured bot owner. Their buttons can ignore an alert, pause a member's access to this bot for 10 minutes, block bot access until an owner restores it, or restore bot access. A separate **Timeout 10m** action is available for a detected target; it only runs after an owner clicks it and only when Discord allows the bot to moderate that member. No timeout, kick or ban is applied automatically. Bot-access restrictions affect this bot only, not the member's Discord permissions.

After updating the bot code, run `npm run deploy-commands` so Discord replaces the old slash-command registrations with `/menu` and `/admin panel`. The database schema is applied automatically at bot startup. Back up the database before the event ends and run `npm test` before deploying changes.


## Administration controls

Open **/admin panel** to manage the server from one private interface:

- **Server settings:** Halloween reward role, 2× XP role, log channel, and clear-setting controls.
- **Event controls:** start/restart or stop the Halloween event. Stopping requires confirmation.
- **Player management:** select a member, inspect their player details, and open Grant FC, Grant XP, Remove FC, Set level or Assign career forms.
- **Leaderboard fairness:** select a member and exclude or restore them from competitive rankings.
- **Audit history:** review the ten most recent administrative changes.
- **Security:** owner-controlled bot-access restrictions are applied from alerts in the log channel.

All admin actions are owner-only, require audit reasons for player edits, and are recorded in PostgreSQL.
