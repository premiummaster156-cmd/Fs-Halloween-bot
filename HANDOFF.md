# Fukishokai — Living Project Handoff

**Repository:** https://github.com/premiummaster156-cmd/Fs-Halloween-bot  
**Default branch:** `main`  
**Runtime:** Node.js 20+, Discord.js 14, PostgreSQL on Neon  
**Last updated:** 2026-11-08 — no privileged intents, tracked-profile leaderboards, Admin Abuse live events, trade safeguards and Dragon Sovereign artwork
**Working rule:** `main` is the only development branch. Do not create feature branches. Inspect and update `main` directly, keep this file current, and verify CI before reporting completion.

## Final season — ends November 30, 2026

The user confirmed this is the bot's final season and it will not be used after **November 30, 2026 (Tashkent time)**. The default event end is `2026-11-30T19:00:00.000Z`, which is midnight at the start of December 1 in Tashkent and includes the full November 30 local day. The `HALLOWEEN_ENDS_AT` environment variable overrides this default if set on the host. This setting ends the event; it does not automatically shut down the bot.

### Rebirth requirements

These are the authoritative final-season rules. In the formulas below, `r` is the player's current completed rebirth count before the next rebirth.

- **FC wealth:** `15,000 + (5,000 × r)` combined wallet and bank.
- **Player level:** `min(600, 10 + 2 × r)`.
- **Claimed Halloween quests:** `min(3, 1 + floor(r / 20))`.
- **Career:** any selected career at rebirth 0; career level rises every 20 rebirths and caps at level 5.
- **Work shifts in the current run:** `min(3, 1 + floor(r / 25))`.
- **Normal gear:** first required for rebirth #5; one item, increasing by one every 40 rebirths and capped at three.
- **Candy-shop collectibles:** first required for rebirth #10; one item, increasing by one every 45 rebirths and capped at two.
- **Unspent Candy:** first required for rebirth #10 at 10 Candy, increases by 10 every 20 rebirths and caps at 50.
- **Combined normal-gear upgrade levels:** first required for rebirth #20; one level, increasing by one every 40 rebirths and capped at three.
- Booster-exclusive equipment does not count as normal rebirth gear.

To complete the 100th rebirth (with 99 already completed), the checklist is **510,000 FC, level 208, three quest claims, career level 5, three work shifts, three normal gear items, two Candy collectibles, 50 unspent Candy and three combined gear-upgrade levels**. The maximum player level remains **600** and the maximum rebirth count remains **100**.

Rebirth resets wallet to **2,500 FC**, bank to zero, player level to one and current career. Owned gear, upgrades, Candy collectibles, event claims and lifetime records remain. The permanent FC/XP duplication is `1 + rebirths`: 1×, 2×, 3×, 4× … up to **101×** at 100 rebirths (+1× for every rebirth).

### Final-season economy and activities

- Normal FC rewards retain the global **3×** earning multiplier and add **+0.1% per player level above level 1**, reaching **1.599×** at level 600. Rebirth and gear bonuses stack on top. Casino payouts, player trades and admin grants are excluded.
- Daily reward: **600–900 base FC**, 30 base XP and an 18-hour cooldown.
- Careers include 22 paths: the original seven plus 15 new specialist careers with progressive level/wallet unlocks, higher salaries and distinct passive perks. Work shifts retain three questions per run from a 115-question randomized pool with 15 added templates across easy, medium and hard bands; difficulty-based time limits are used.
- Crime unlocks begin at level 1 and progress to level 16; cooldowns range from five to 22 minutes with lower penalties and improved success chances.
- Heists unlock at levels 1, 5, 10, 16 and 24. Cooldowns range from 45 minutes to four hours, with less restrictive crew sizes and final-season payouts.
- Casino minimum bet remains 100 FC, there is no daily wager cap, base cooldown is 10 seconds, and the theoretical return remains 95%.
- Weekly Candy quests require 3 work shifts, 2 Daily claims, 2 successful crimes, 5 casino rounds and 1 successful heist. Combined reward: 85 Candy per week.
- Halloween event quests have lower goals/rewards; the unique Candy shop items cost 35, 60 and 100 Candy. The weekly message reward requires 250 messages and grants 45 Candy.
- Candy drops are available from Daily, Work, successful Crime, Heists, Casino play, chat activity and Achievements. Ordinary chat Candy drops stay silent.
- Achievement milestones have been lowered for this short season.
- Party Fortune cooldown is 12 hours.
- Normal equipment and five upgrade levels have reduced prices/level gates to make the catalog reachable during the finale.

## Rift Arena — implemented on main

- Six solo bosses unlock at levels **1, 20, 40, 60, 80 and 100**: Training Golem, Ashen Knight, Rift Warden, Abyss Wyrm, Oni Shogun and Dragon Sovereign.
- PostgreSQL `boss_battles` records persist encounters. A player can have one active encounter; the service applies a 20-minute entry cooldown, turn locking and server-side expected-turn validation to prevent stale/double-click interactions.
- The eight endgame abilities can each be activated once per encounter: **PHASE** avoids a counterstrike; **DREAD** weakens three boss strikes; **AEGIS** creates a shield; **REBIRTH** restores health; **EXECUTE** deals bonus damage based on remaining boss health; **HASTE** doubles a strike; **HEX** applies damage over time; **ASCEND** deals a large burst.
- Boss victories grant FC and XP using the normal and rebirth multipliers. Losses charge no fine. Retreating does not erase the Arena cooldown.
- The dashboard includes boss selection, attack/ability/retreat controls, health bars, status effects and encounter result messages.
- `src/utils/arena-card.js` renders the beveled Arena HUD with `@napi-rs/canvas`; Dragon Sovereign uses its dedicated standalone image at `assets/bosses/dragon-sovereign.webp` inside the boss card. The surrounding HUD remains layered 2D artwork, not a true 3D scene.
- `tests/arena.test.js` covers boss gates, all eight powers, damage-over-time, shields, healing, battle outcomes and PNG rendering.

## Endgame gear

All eight endgame items are normal shop equipment, not booster-exclusive. Their final-season unlocks and prices are:

| Item | Unlock level | FC cost | Ability |
|---|---:|---:|---|
| Nightfall Greaves | 30 | 100,000 | PHASE |
| Soulrender Crown | 40 | 135,000 | DREAD |
| Starforged Mantle | 50 | 175,000 | AEGIS |
| Phoenix Core | 60 | 220,000 | REBIRTH |
| Eclipse Greatblade | 70 | 270,000 | EXECUTE |
| Chrono Shard | 80 | 330,000 | HASTE |
| Abyssal Grimoire | 90 | 400,000 | HEX |
| Dragon Sovereign Halo | 100 | 480,000 | ASCEND |

Abilities retain their passive equipment stats and have their one-use Arena power. All equipment can be upgraded five times. The five personal boost rewards remain separate MYTHIC booster-exclusive items.

## Main project rules and important context

- **Neon PostgreSQL only.** Do not change database providers.
- Main player interface: `/menu`; admin interface: `/admin-panel`; public `/leaderboard`. Preserve the current built-in slash-command model unless explicitly asked to change it.
- Preserve `src/ai/brain.js` prompt if present; the user previously instructed not to change it.
- Keep weekly boss removed.
- Wallet ceiling is 2 billion FC; overflow earnings auto-bank.
- Five personal server-boost Mythic items are assigned automatically from personal Discord boost notifications: Crimson Oni Katana, Phantom Shogun Mask, Wraithguard Armor, Dragonfire Signet and Eternal Kitsune Wings. Items are added/equipped automatically per member's boost count; no manual claim or FC purchase. Boosters keep earned gear after they stop boosting.
- Booster Role ID currently documented by the user: `1376299577581240410`. Inspect current settings before changing boost logic.
- Personal item tracking uses received `GUILD_BOOST` messages. Older boost counts are not generally backfilled beyond the explicit first-item active-booster backfill path already tested. Do not invent rewards for server-tier milestone messages.
- Ordinary chat Candy drops remain silent; do not restore per-message Candy announcements.
- Profile card uses the server display name and a system-font fallback for Unicode.
- Work shift quiz remains three multiple-choice questions per shift, drawn from the 115-question pool (15 additional templates). Difficulty-based time limits and level-based FC scaling apply.
- Admin access: server owner, configured bot owner or configured trusted Admin Role. Discord Administrator alone does not grant bot-admin access. Privileged actions remain audited.
- Do not claim live Discord or Neon validation from GitHub CI alone.


## Full player-data reset (hosting console)

- Preview with \`npm run reset:player-data\`; execute with \`npm run reset:player-data -- --confirm RESET_ALL_PLAYER_DATA\`.
- Back up Neon and stop the bot first. The reset requires \`DISCORD_TOKEN\` and \`OWNER_ID\` to verify Discord server owners, bot owner and currently configured Admin Role members. Any failed verification aborts without deletion.
- Bot owner, each guild/server owner and users holding that guild's configured Admin Role are excluded from every user-scoped delete.
- Everyone else has FC/bank, level/XP/rebirth, job/career, lifetime stats, owned/equipped items and upgrades, Candy/event records, activity/quests/achievements, party stats, heists and Arena progress reset.
- Admin-panel settings, event configuration, custom commands, leaderboard exclusions, audit history and security restrictions remain unchanged.
- Discord boost status and boost-message idempotency history are preserved to prevent re-granting old boost rewards; booster equipment itself is removed with inventory.
- Tables without a recognized guild/member identity are skipped. The reset is transactional and rolls back on any error.
## Validation and deployment status

The final code and balance are committed directly to `main` in commit `f8de471f1a91ab46d53ff281ea6de4c2e80ff86d`. GitHub Actions run **42331427414** passed on that exact `main` commit: dependency installation, syntax validation, slash-command validation and **149 tests passed, 0 failed**. The earlier source snapshot run 42289846723 also passed 149/149. The previous PR #28 was closed after its 20-file contents were committed directly to `main`; it is no longer an active change path. Neon migration and full Discord test-server interaction checks remain manual deployment checks. Do not report the bot as live from this repository update alone.

After pulling the new `main` commit on the host:
```powershell
git pull origin main
npm install
npm run db:migrate
npm start
```
The project also applies schema changes at startup. No slash-command redeployment is required for these dashboard/gameplay changes unless command definitions are changed separately.

## Historical completed work

- PR #10 duplicate command deployment fix.
- PR #11 wallet overflow auto-bank and profile.
- PR #12 3× normal FC earning multiplier.
- PR #13 server booster passive perks and exclusive gear.
- PR #14 automatic personal boost rewards.
- PR #15 booster reward/member guide.
- PR #16 admin grant controls for Mythic booster items.
- PR #24 Unicode and server nickname profile-card fix.
- PR #25 silent ordinary chat Candy-drop notifications.
- PR #26 level 600 / 100 rebirth progression, +1× per-rebirth FC/XP duplication, eight endgame items and readable activity-log embeds.
- The original PR #26 long-term rebirth requirements were superseded by the final-season values documented above.

## Next-chat rule

1. Read this `HANDOFF.md` first.
2. Work directly on `main`; do not create branches.
3. Inspect the current `main` commit and GitHub Actions status before changing or reporting code.
4. Keep this handoff and README synchronized with every substantive code/balance change.
5. For gameplay changes, define unlocks, costs, rewards, cooldowns, abuse prevention, logs and tests.
6. Prefer clear, fair and achievable gameplay over grind walls or exploit-prone reward inflation.


## Trading, leaderboards, economy events and admin DMs — current work

- /menu → Trade replaces one-way FC transfer. Offers may contain FC and up to 10 item types. Both players must contribute; both confirm independently; changing either offer resets both confirmations. Offers are revalidated at settlement and FC/items exchange in a transaction. Booster-exclusive Mythic gear is non-tradable. Active trades expire after 30 minutes.
- Leaderboards use saved player profiles, Party Game stats, weekly activity and the current non-privileged member cache. Exact Discord-ID lookup fetches one member at a time. This intentionally does not enumerate never-seen server members because the user will not enable privileged intents. Zero-score saved profiles are included. Categories: Wealth, Level, Lifetime Earned, Party Points, Weekly Messages, Rebirths, Career Level, Successful Crimes and Completed Heists; paging, search and leaderboard exclusions are supported.
- New FC activities: Scavenge (30m) and Delivery Contract (3h). They award FC/XP and participate in normal multipliers and Candy drops.
- Admin console retains FC Party Events (2×–10×, 5m–24h) as a separate economy feature. Member DMs target one selected member or tracked profiles plus cached members only. The Guild Members privileged intent is deliberately disabled; never-seen members cannot be enumerated. Bulk DMs are capped at 1,500 known recipients; failures/skips are counted and Discord privacy settings are respected.


## Current approved upgrade — November 8, 2026

- **Privileged intents:** Do not request or enable any privileged Gateway intent. `src/index.js` uses Guilds, GuildMessages and GuildModeration only. `GatewayIntentBits.GuildMembers` must stay removed. The bot cannot enumerate every server member; leaderboards and bulk DM recipient lists are limited to saved player profiles, tracked activity and currently cached members. Exact Discord-ID search performs an individual member lookup only.
- **Leaderboards:** Added Rebirths, Career Level, Successful Crimes and Completed Heists. Ranking pages include zero-stat saved profiles, respect exclusions and disclose the tracked-profile limitation. Search supports cached usernames/display names and exact IDs.
- **Trading safeguards:** Both sides still contribute and independently confirm. Editing an offer clears both confirmations. New trade invitations require a 7-day-old Discord account and at least 24 hours in the server; each account can open at most eight trades per rolling 24 hours, and the same pair has a 10-minute re-open cooldown. These checks deter low-effort alt abuse but do not claim perfect alt detection.
- **Admin Abuse:** Separate from FC Party Events. Presets: Blood Moon (+12 crime-success points and +25% crime base rewards), Candy Storm (+1–2 Candy on eligible gameplay rewards), Rift Surge (+50% Rift Arena victory FC/XP), and Lucky Block Rain (one claim per player per event; FC, Candy and a level-eligible non-booster equipment item). Admins start/stop events through `/admin-panel → Admin Abuse`; events announce in the configured member-command channel and are logged.
- **Dragon Sovereign:** Replaced the emblem-like image at `assets/bosses/dragon-sovereign.webp` with an original dragon creature portrait, displayed in the existing right-side Arena image viewport.
- **FC Party Events remain a separate feature** and must not be substituted for Admin Abuse.
- **DM limitation:** Bulk DMs target tracked profiles and cached members only. The service does not call `guild.members.fetch()` without a specific ID. Never-seen members cannot be automatically discovered.
- **Remaining deployment checks:** Confirm GitHub Actions, then validate the Neon migration and full Discord test-server interactions separately. Do not claim deployment is live from CI alone.


## Latest code validation — November 8, 2026

- **Verified code revision:** `5870cb338864ec2a5806e56f13dae1bed29dfb72` on `main`.
- **GitHub Actions:** [CI run 42506948962](https://github.com/premiummaster156-cmd/Fs-Halloween-bot/actions/runs/42506948962) passed: dependency installation, source syntax validation, slash-command validation and **171 tests passed / 0 failed**.
- The passing suite includes Admin Abuse preset validation, tracked-profile leaderboard coverage, cached zero-stat members, bulk DM handling without privileged member enumeration, and trade eligibility checks.
- This does not verify the live Neon migration, Discord Developer Portal settings, actual Discord DM delivery or end-to-end interactions in the live server. Those remain deployment checks.


## Latest visual and leaderboard fixes — November 9, 2026

- Replaced the Dragon Sovereign's external WebP bitmap renderer with an original Canvas-drawn dragon portrait in `src/utils/arena-card.js`. This removes the corrupted image decode path and avoids embedding AI-generated text/artwork in the boss card.
- Shared embeds in `src/ui.js` no longer attach remote custom Discord emoji images automatically as author/footer icons or default thumbnails. Explicit caller-supplied thumbnails remain supported.
- Hardened `src/commands/leaderboard-ui.js` search handling for missing guild/member managers and string-safe ID matching. Exact Discord IDs use one-member lookup only; no privileged member-list intent or full roster fetch.
- `src/commands/dashboard.js` validates modal context and ranking metric and returns a safe, actionable message if a search fails.
- Added regression tests for cached username search and exact Discord-ID lookup in `tests/economy-trading-admin.test.js`.
- Latest code commit: `dfe7acd15ea093fb281dc581ac349727d55ad8c5`. CI run 42578940881 was queued/in progress at handoff update time; confirm its final status before claiming validation.

## Approved full upgrade — November 9, 2026

The user approved a full reliability, security, database, gameplay, dashboard and testing upgrade. Continue on `main`, inspect current CI before reporting status, and update this handoff with every substantive change.

### External repository review

- Reviewed [Alexis-katabump/bot-protect-v3](https://github.com/Alexis-katabump/bot-protect-v3). It is a Python/discord.py bot with CAPTCHA, anti-spam, tickets, and activity statistics. Do not merge its code or run it as a second moderator. It uses `discord.Intents.all()`, global JSON files, and includes risky behavior such as an anti-join mode that kicks every new member and mass role assignment. Reimplement only suitable ideas in this project's Discord.js + Neon architecture, with explicit opt-in configuration, safe defaults, audit logs, and tests.
- Reviewed [Alexis-katabump/bot-status](https://github.com/Alexis-katabump/bot-status). Do not integrate its custom-status role automation because it requires both `GuildMembers` and `GuildPresences`, fetches the full member roster with presences, and conflicts with the user's hard rule against privileged Gateway intents.
- Never enable `GuildMembers`, `GuildPresences`, or `MessageContent` as part of this work.

### First verified fix in this upgrade

- `src/services/trade-interactions.js`: expired trade operations previously updated `player_trades.status='expired'` and then threw inside the transaction. The transaction helper rolls back on thrown errors, so the expired status was not persisted. The methods now return an expiry sentinel from the transaction (allowing the status update to commit) and raise the user-facing domain error after the transaction completes. Updates are scoped by both guild ID and trade ID.
- `tests/economy-trading-admin.test.js`: added regression tests for expired offer edits and expired confirmations to assert that the expiry status update occurs before the error is surfaced.

### Verified issue still to fix

- `package.json` declares `isolated-vm` and `@napi-rs/canvas`, but the root dependencies in `package-lock.json` omit both, and no corresponding `node_modules` lock entries were found. CI currently runs `npm install`, which can update the lock during installation and mask the mismatch. Regenerate and commit the lockfile using a supported Node/npm environment before changing CI to `npm ci`.
- Node.js 20 reached end-of-life on 2026-03-24. Latest official Node.js release schedule marks Node 26 as Active LTS and Node 24 as Maintenance LTS as of 2026-11-09. Select the target Node version after validating compatibility of `discord.js`, `isolated-vm`, `@napi-rs/canvas`, and the hosting provider; do not perform a blind runtime bump.
- The migration script currently re-runs the full `schema.sql` on every startup and then adds constraints manually. Design ordered, versioned migrations with a migration lock and PostgreSQL integration tests before changing production database behavior.
- The interaction flow performs some database/access checks before acknowledgement. Refactor in small steps so potentially slow interactions defer/reply before long operations while preserving ephemeral/public response behavior and avoiding duplicate replies.
- The bearer-key AI workspace API needs explicit draft-by-default/publish authorization and rate limits before being considered production-hardened.

### Upgrade workflow and guardrails

1. Repair dependency/CI reproducibility and interaction acknowledgement.
2. Add safe, versioned Neon migrations and real PostgreSQL integration tests.
3. Harden admin workspace and custom-command publishing/execution.
4. Improve anti-abuse/security and transaction correctness.
5. Audit and balance every existing gameplay system while preserving documented season rules.
6. Modularize dashboard/UI gradually; do not rewrite the 156 KB dashboard in one step.
7. Complete regression, security and release checks. Never claim live Discord/Neon validation from CI alone.

Keep Neon PostgreSQL, no privileged intents, no destructive player reset, preserve server/bot owner and configured Admin Role protections, keep FC Party Events separate from Admin Abuse, and preserve the November 30, 2026 final-season date unless the user changes it.

### Additional fixes in progress — November 9, 2026

- `src/web/ide-server.js`: added an in-memory per-source-address rolling rate limit to the bearer-key AI workspace API (60 requests per 60 seconds). The API now saves valid command source as an inactive draft by default, rejects `publish: true` with HTTP 403, and blocks command-file deletion through the bearer-key API. Publishing/activation/deletion remains in the OAuth-authenticated Code Studio for the server owner, bot owner or configured Admin Role. This intentionally narrows the agent API's permissions.
- `tests/ide-server.test.js`: added regression coverage for blocked bearer-key publish/delete operations and saving JavaScript as an inactive draft by default.
- CI runs triggered by these changes are tracked at [run 42615623367](https://github.com/premiummaster156-cmd/Fs-Halloween-bot/actions/runs/42615623367); confirm the latest run result before claiming all changes passed. The previous commit-specific CI runs for the trade expiry fix and initial API hardening completed successfully.
- The Bot Protect V3 repository has no declared license in its GitHub repository metadata. Do not copy or transplant its source code; use only independently implemented feature ideas. Its `Intents.all()`, global JSON persistence and destructive anti-join/mass-role behavior remain reasons not to merge it.
