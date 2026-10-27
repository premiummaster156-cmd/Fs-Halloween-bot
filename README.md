# Fukishokai Halloween Bot

A Fukishokai-branded Discord economy game and Halloween event bot. It shares one economy, player profile, progression system, ledger, cooldown system, quest tracker, and embed renderer across games.

## Requirements

- Node.js 20+
- A Discord application and bot token
- PostgreSQL (Neon is supported through DATABASE_URL)

## Setup

1. Copy .env.example to .env and configure DISCORD_TOKEN, CLIENT_ID, DATABASE_URL, and optional server settings.
2. Run npm install.
3. Run npm run db:migrate.
4. Run npm run deploy-commands. Set GUILD_ID during testing for quick guild registration; leave it blank for global commands.
5. Run npm start.

Invite the bot with the bot and applications.commands scopes. Never commit a real token or .env file.

## Commands

- /balance, /daily, /work, /job, /profile, /leaderboard
- /crime, /casino, /heist, /event
- /admin for approved economy and event controls

## Design

Slash commands are the main interface; the bot does not request Message Content intent. Every embed uses a shared Fukishokai renderer and the custom clan emoji. Game balance lives in src/config/game-balancing.js. Gameplay modules call the same transactional economy and event services instead of maintaining disconnected wallets or unrelated currencies.

The game modules are designed around mechanics, balance, persistence, and tests rather than artificial line counts or duplicated code. The code can be expanded with new missions, job branches, items, quests, and systems while keeping shared rules consistent.

## Production notes

Use environment variables in the hosting provider. Configure admin roles and event role IDs, monitor logs, back up the database, and run npm test before deploying balance changes. For a large community, review pool limits and database query performance as usage grows.
