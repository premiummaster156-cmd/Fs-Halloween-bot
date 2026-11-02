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

- Start with **/guide** for a walkthrough of the economy, careers, risky games, heists, and Halloween event.
- **Money and progress:** /balance, /bank, /daily, /work, /job, /profile, /leaderboard, /transfer
- **Equipment:** /shop, /inventory, /equip, /unequip
- **Games:** /crime, /casino, /heist
- **Halloween:** /event, including the weekly message mission
- **Server administration:** /admin panel, /admin grant, /admin remove, /admin event-start, /admin event-stop (restricted to approved administrators)

### First steps

1. Run **/guide** or **/job view** to understand the available systems.
2. Choose a starting career with **/job apply**. You need a career before **/work** will pay you.
3. Use **/daily** and answer the three **/work** multiple-choice questions to earn Fuk Coins and XP. Chat also earns up to 2 XP per counted message, with a daily XP cap. Work has a 10-minute cooldown; check **/profile** to track progress.
4. Read the **/guide** topic for any system before spending FC or joining a heist.

## Design

Slash commands are the main interface; the bot does not request Message Content intent. Every embed uses a shared Fukishokai renderer and the custom clan emoji. Game balance lives in src/config/game-balancing.js. Gameplay modules call the same transactional economy and event services instead of maintaining disconnected wallets or unrelated currencies.

The game modules are designed around mechanics, balance, persistence, and tests rather than artificial line counts or duplicated code. The code can be expanded with new missions, job branches, items, quests, and systems while keeping shared rules consistent.

## Operations

Set `OWNER_ID` and/or `ADMIN_ROLE_IDS` in `.env` to control access to admin commands. Set `HALLOWEEN_ROLE_ID` if the event should assign a particular role. Back up the database before the event ends. Run `npm test` before deploying balance changes.


## Leaderboard fairness controls

The server owner or configured bot owner can use `/admin leaderboard-exclude` to hide a member from Wealth, Level, Lifetime Earned, and Weekly Activity leaderboards. `/admin leaderboard-include` restores eligibility. Exclusion does not change the member's balance or progression and is stored in PostgreSQL.

Administrative FS Coin grants are restricted to the server owner or configured bot owner. Self-grants are blocked; grants and removals remain recorded in the audit log.
