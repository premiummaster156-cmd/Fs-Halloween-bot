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

Casino games remain available with transparent odds and equal limits: 100–1,000 FC per round, a 30-second cooldown, and 5,000 FC in total wagers per rolling 24 hours. Coin Flip, High Dice and Slots each target a 95% theoretical return over a very large number of rounds; this is a statistical average, not a guaranteed individual result.

### First steps

1. Run **/menu** and open **Careers**. Choose a career you qualify for.
2. Open **Earn** and claim Daily or start a Work shift. Work uses three multiple-choice questions; each correct answer increases the reward.
3. Use **Profile** to track your level, career and wealth. Use **Bank** to protect savings and **Gear** to manage equipment.
4. Open **Games** to review crime and casino risks, or **Heists** to create a crew and invite members.
5. Open **Halloween** to track quests, claim completed rewards, check the weekly activity mission and browse seasonal items.

## Operations

Set `OWNER_ID` and/or `ADMIN_ROLE_IDS` in `.env` to control access to the admin console. Configure the additional admin role, log channel, Halloween reward role and 2× XP role in **/admin panel**. The Halloween reward must be a normal assignable server role, not `@everyone` or an integration-managed role. Back up the database before the event ends. Run `npm test` before deploying changes.

After updating the bot code, run `npm run deploy-commands` so Discord replaces the older slash-command list with `/menu` and `/admin panel`.


## Administration controls

Open **/admin panel** to manage the server from one private interface:

- **Server settings:** admin role, Halloween reward role, 2× XP role, admin log channel, and clear-setting controls.
- **Event controls:** start/restart or stop the Halloween event. Stopping requires confirmation.
- **Player management:** select a member, inspect their player details, and open Grant FC, Grant XP, Remove FC, Set level or Assign career forms.
- **Leaderboard fairness:** select a member and exclude or restore them from competitive rankings.
- **Audit history:** review the ten most recent administrative changes.

Access to settings and event controls is granted to administrators, Manage Server users and configured admin roles. Currency, XP, level, career and leaderboard eligibility edits are restricted to the server owner or configured bot owner. Player edits require an audit reason and are recorded in PostgreSQL.
