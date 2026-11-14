# Fukishokai — Living Project Handoff

**Repository:** https://github.com/premiummaster156-cmd/Fs-Halloween-bot  
**Default branch:** `main`  
**Runtime:** Node.js 20+, Discord.js 14, PostgreSQL on Neon  
**Last updated:** 2026-11-14 — actual-join raid monitoring with invite/vanity attribution, alert-only Kings/bot-owner notifications, severe-only economy alerts, and opt-in owner-only Ollama AI Watch
**Working rule:** `main` is the only development branch. Do not create feature branches. Inspect and update `main` directly, keep this file current, and verify CI before reporting completion.

## Final season — ends November 30, 2026

The user confirmed this is the bot's final season and it will not be used after **November 30, 2026 (Tashkent time)**. The default event end is `2026-11-30T19:00:00.000Z`, which is midnight at the start of December 1 in Tashkent and includes the full November 30 local day. The `HALLOWEEN_ENDS_AT` environment variable overrides this default if set on the host. This setting ends the event; it does not automatically shut down the bot.

### Progression system

- Player progression uses the current level-based FC earning factor and remains capped at level 1,000.
- Existing wallets, banks, levels, careers, gear, inventory and historical gameplay records are preserved when progression rules change.
- Player level remains capped at **1,000**. Eligible normal FC rewards keep the **3× season multiplier** and now gain **+0.5% per level above level 1** (level factor **5.995× at level 1,000**). Equipped gear and configured FC Party events follow the existing eligibility rules.
- Candy-drop chance progression uses player level (up to +20 percentage points by level 600). Phoenix Core's Arena heal ability is named **PHOENIX**.

### Live event modes

Admin Abuse has six modes: Blood Moon, Candy Storm, Rift Surge, Lucky Block Rain, XP Surge (+50% eligible XP), and Heist Rush (+8 success percentage points and +30% base payout). The PostgreSQL event-type constraint is updated idempotently by schema migration.

### Final-season economy and activities

- Normal FC rewards retain the global **3×** earning multiplier and add **+0.5% per player level above level 1**, reaching a **5.995× level factor** at level 1,000. Eligible gear and FC Party bonuses stack according to each reward's rules. Casino payouts, player trades and admin grants are excluded from the ordinary reward multiplier.
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
- The eight endgame abilities can each be activated once per encounter: **PHASE** avoids a counterstrike; **DREAD** weakens three boss strikes; **AEGIS** creates a shield; **PHOENIX** restores health; **EXECUTE** deals bonus damage based on remaining boss health; **HASTE** doubles a strike; **HEX** applies damage over time; **ASCEND** deals a large burst.
- Boss victories grant FC and XP using the normal level-based earning factor and eligible gear/event bonuses. Losses charge no fine. Retreating does not erase the Arena cooldown.
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
| Phoenix Core | 60 | 220,000 | PHOENIX |
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
- Everyone else has FC/bank, level/XP, job/career, lifetime stats, owned/equipped items and upgrades, Candy/event records, activity/quests/achievements, party stats, heists and Arena progress reset.
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
- PR #26 progression tuning, eight endgame items and readable activity-log embeds.

## Next-chat rule

1. Read this `HANDOFF.md` first.
2. Work directly on `main`; do not create branches.
3. Inspect the current `main` commit and GitHub Actions status before changing or reporting code.
4. Keep this handoff and README synchronized with every substantive code/balance change.
5. For gameplay changes, define unlocks, costs, rewards, cooldowns, abuse prevention, logs and tests.
6. Prefer clear, fair and achievable gameplay over grind walls or exploit-prone reward inflation.

## Trading, leaderboards, economy events and admin DMs — current work

- /menu → Trade replaces one-way FC transfer. Offers may contain FC and up to 10 item types. Both players must contribute; both confirm independently; changing either offer resets both confirmations. Offers are revalidated at settlement and FC/items exchange in a transaction. Booster-exclusive Mythic gear is non-tradable. Active trades expire after 30 minutes.
- Leaderboards use saved player profiles, Party Game stats, weekly activity and cached member display names. Exact Discord-ID lookup fetches one member at a time; leaderboards do not bulk-enumerate the member list. The GuildMembers intent is enabled for join-raid events, not unrestricted member enumeration. Zero-score saved profiles are included. Categories: Wealth, Level, Lifetime Earned, Party Points, Weekly Messages, Career Level, Successful Crimes and Completed Heists; paging, search and leaderboard exclusions are supported.
- New FC activities: Scavenge (30m) and Delivery Contract (3h). They award FC/XP and participate in normal multipliers and Candy drops.
- Admin console retains FC Party Events (2×–10×, 5m–24h) as a separate economy feature. Member DMs target one selected member or tracked profiles plus cached members only. GuildMembers is used for join-raid monitoring; the bot does not bulk-enumerate members for administrator DMs. Bulk DMs are capped at 1,500 known recipients; failures/skips are counted and Discord privacy settings are respected.

## Current approved upgrade — November 8, 2026

- **Privileged intents:** `GuildMembers` is enabled to receive `guildMemberAdd` for join-raid detection; `GuildPresences` remains disabled. `MessageContent` is opt-in only for AI Watch: request it only when `AI_MESSAGE_MONITOR_ENABLED=true`, `OLLAMA_API_KEY` and `OWNER_ID` are configured. Default operation uses Guilds, GuildMessages, GuildModeration and GuildMembers. `GuildInvites` is not needed because invite-use counters are fetched on actual joins. The raid monitor does not enumerate members; it only inspects each join event. Existing leaderboard and bulk-DM restrictions remain unchanged.
- **Leaderboards:** Added Career Level, Successful Crimes and Completed Heists. Ranking pages include zero-stat saved profiles, respect exclusions and disclose the tracked-profile limitation. Search supports cached usernames/display names and exact IDs.
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
- Never enable `GuildMembers` or `GuildPresences`. `MessageContent` is permitted only for the explicitly requested, opt-in, read-only AI Watch, and only after the user enables it in the Discord Developer Portal and configures its environment variables.

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

Keep Neon PostgreSQL, keep `GuildMembers` and `GuildPresences` disabled, keep `MessageContent` off unless the opt-in AI Watch is configured, no destructive player reset, preserve server/bot owner and configured Admin Role protections, keep FC Party Events separate from Admin Abuse, and preserve the November 30, 2026 final-season date unless the user changes it.

### Additional fixes in progress — November 9, 2026

- `src/web/ide-server.js`: added an in-memory per-source-address rolling rate limit to the bearer-key AI workspace API (60 requests per 60 seconds). The API now saves valid command source as an inactive draft by default, rejects `publish: true` with HTTP 403, and blocks command-file deletion through the bearer-key API. Publishing/activation/deletion remains in the OAuth-authenticated Code Studio for the server owner, bot owner or configured Admin Role. This intentionally narrows the agent API's permissions.
- `tests/ide-server.test.js`: added regression coverage for blocked bearer-key publish/delete operations and saving JavaScript as an inactive draft by default.
- CI runs triggered by these changes are tracked at [run 42615623367](https://github.com/premiummaster156-cmd/Fs-Halloween-bot/actions/runs/42615623367); confirm the latest run result before claiming all changes passed. The previous commit-specific CI runs for the trade expiry fix and initial API hardening completed successfully.
- The Bot Protect V3 repository has no declared license in its GitHub repository metadata. Do not copy or transplant its source code; use only independently implemented feature ideas. Its `Intents.all()`, global JSON persistence and destructive anti-join/mass-role behavior remain reasons not to merge it.

- `src/database/migrate.js`: added a PostgreSQL transaction-scoped advisory lock before applying the idempotent schema/backfills. This serializes concurrent startup migration attempts across multiple bot instances. It does not yet replace the schema file with fully versioned migration files; that remains a planned database-hardening task.
- CI run for the latest migration-lock commit: [42615755679](https://github.com/premiummaster156-cmd/Fs-Halloween-bot/actions/runs/42615755679). Check its final status before reporting the latest commit as validated.

- `src/database/migrate.js` records a SHA-256 checksum for `schema.sql` in `schema_migrations` and reapplies the idempotent schema only when content changes. It verifies the level cap; this is an intermediate safe migration improvement, not a substitute for a fully ordered per-release migration directory with PostgreSQL integration coverage.
- CI run for this schema-checksum change: [42615869661](https://github.com/premiummaster156-cmd/Fs-Halloween-bot/actions/runs/42615869661). Verify its final result.

## Trade invitation acceptance flow — November 9, 2026

- Selecting a trading partner now creates a `pending` invitation, not an active trade. The recipient receives a Discord DM with **Accept** and **Deny** buttons. If DMs are closed, the bot posts a mention plus the same buttons in the channel where the invitation was created.
- The recipient can also open `/menu → Trade` and respond there if they missed the DM. Only the invited recipient can accept or deny; the sender can cancel a still-pending invitation from their Trade page.
- Accepting changes the status to `open` and starts the 30-minute trade window. The sender is notified by DM; the recipient is told to open `/menu → Trade` to make offers. Both sides still need to offer something and independently confirm before any FC or items move.
- Denying changes the status to `cancelled` and notifies the sender. No assets are exchanged. Pending invitations reserve both participants so they cannot start overlapping trades.
- The PostgreSQL status constraint now includes `pending`. The schema checksum migration path applies the updated constraint on the next deployment/startup. CI and the live DM/channel interaction still need verification; no live Discord or Neon validation is implied by code changes alone.

- **Invitation control security:** Accept/Deny buttons from DMs now resolve the originating server, verify the recipient is still a member through one targeted member lookup, and apply the existing bot-access restriction and component rate-limit checks before changing invitation status. No privileged intents or whole-member fetches are used. If a sender's DM is closed, the bot attempts a mention notification in the current server channel (or the server system channel when the response came from a DM).

## Economy integrity and progression update — November 12, 2026

- **Progression:** player level remains capped at 1,000. Phoenix Core's Arena ability is named **PHOENIX**.
- **Level earnings:** eligible FC actions receive the normal 3× season multiplier plus `1 + (level - 1) × 0.005`; the level factor reaches 5.995× at level 1,000. Candy-drop odds use a level-based bonus. Active player rows and inventories are preserved.
- **Database cleanup:** obsolete progression columns are dropped by the idempotent `schema.sql` migration. Player wallets, banks, levels, careers and inventory are not modified.
- **Mutation allowlist:** `src/services/economy-guard.js` defines approved currency reasons, valid credit/debit directions, per-action base caps, admin-grant audit requirements and self-grant prevention. Unknown or malformed mutations are rejected and recorded as security incidents.
- **Casino integrity:** every payout is checked against the same user's recorded `casino_bet` reference and the server-side wager × payout multiplier formula. Duplicate ledger references remain idempotent.
- **Reward-rate detection:** eligible FC rewards are examined over a rolling 60-second ledger window. Only a calculated risk score of 80/100 or higher creates an owner alert; lower scores are ignored. Hard safety thresholds still block an unsafe latest reward. XP grants have per-action and calculated-gain ceilings.
- **Snapshot integrity:** `player_economy_snapshots` is backfilled for saved players by schema migration. FC, bank, lifetime earned/spent, level and XP are compared with the last verified state before economy/XP changes; mismatches block the attempted action and raise a high-risk incident. Legitimate bank transfers, admin changes and trade settlements update snapshots in the same transaction.
- **Trade audit:** settled FC deltas are written to `economy_ledger` as `player_trade_in` / `player_trade_out`, without treating trade value as lifetime earnings or spending. Trade references are tied to the trade ID and member.
- **No automatic ban:** detections are explainable security incidents; no account is automatically banned or timed out based solely on a statistical flag. Existing restrictions remain owner/admin controlled.
- **Intent boundary:** `GuildMembers` and `GuildPresences` remain disabled. `MessageContent` is requested only by the optional AI Watch configuration; all non-AI bot behavior remains without privileged intents.
- **Validation boundary:** CI tests and syntax/command validation are separate from a live Neon migration or real Discord guild test. Record the exact CI run and test count after completion; do not claim live Neon/Discord verification unless performed.

## Anti-nuke and actual-join anti-raid alert-only policy — November 14, 2026

This is an explicit user requirement and overrides any older handoff/README wording about owner-approved security responses or action buttons:

- **Recipients:** Anti-nuke and join-raid notifications must be DM'd to exactly the two configured Fukishōkai Kings (`settings.kingIds`) and the configured bot owner (`OWNER_ID` / `settings.ownerId`). Do not add `guild.ownerId` as a separate recipient. The server owner receives the DM only because they are one of the two King IDs. Deduplicate overlapping IDs.
- **No controls:** Anti-nuke and join-raid DMs must have no buttons, components, action rows, menus or action prompts. Do not send an empty components array; omit the components property entirely.
- **No intervention:** These systems only detect, record incidents, and send private DMs. Never ban, kick, timeout, quarantine, remove roles, change permissions, restrict bot access, change verification levels, enable lockdown, or take any other moderation/server-setting action because of an anti-nuke or join-raid detection.
- **Legacy controls:** Old anti-nuke or anti-raid buttons from previously delivered DMs must be rejected without performing an action. The security interaction handler must check the incident category before executing any legacy action.
- **Detection remains active:** Keep audit-log based destructive-action and permission-escalation detection. Join-raid monitoring listens for actual member joins and triggers at five joins in 30 seconds or three accounts created within seven days joining within 60 seconds. Compare invite-use and vanity-use counters to identify the source. Label vanity links as Vanity URL; if counters are missing or multiple sources change, report Unknown / ambiguous. Do not infer a creator when attribution is not supported by the counter delta. `GuildMembers` is required; `GuildInvites` is not.
- **Files updated:** `src/services/security.js` sends priority alerts only to Kings + configured bot owner, omits DM components for these categories and blocks legacy anti-alert buttons. `src/services/raid-monitor.js` detects rapid member joins, compares invite/vanity-use counters and includes joiner ages, invite codes and creator IDs when available. `src/index.js` registers the member-join listener. Tests assert exact recipients, absent controls, explicit unknown attribution and no moderation/server edits.
- Join-raid and anti-nuke alerts are strictly alert-only. Economy integrity is separate from these systems. Severe economy alerts may offer owner-clicked leaderboard exclusion or bot-only access controls; no economy punishment or restriction is applied automatically.
- Check CI and verify live Discord DM delivery separately. Never claim live delivery from CI alone.

## Severe-only economy alerts and owner-approved controls — November 13, 2026

- Economy reward-burst alert threshold is **80/100**. Scores below 80 are ignored before a security incident is persisted or an owner notification throttle is consumed. Hard reward safety thresholds still block an unsafe latest reward and produce a severe signal.
- Verified out-of-band economy snapshots require two mismatches by the same member within ten minutes; invalid casino payouts remain severe signals. Reward bursts require `riskScore >= 80`; rejected currency/XP mutations require at least three attempts by the same member within two minutes. Isolated malformed operations are ignored.
- Economy alerts are concise plain-text DMs: short summary, member, evidence/context, recommended manual review and owner-approved actions. Do not use embeds or add generic greeting paragraphs, repeated action/status prose or oversized diagnostics.
- Economy plain-text DMs can offer **Exclude leaderboard**, **Pause bot · 1h**, **Block bot access**, and **Dismiss**. These controls are never automatic; an authorized server owner, configured bot owner, King or configured Admin Role must explicitly click. Exclusion is reversible via leaderboard fairness settings. Pausing/blocking affects Fukishōkai bot access only, not Discord roles or moderation permissions.
- Do not automatically punish for economy incidents. The bot must not automatically ban, kick, timeout, remove roles, change Discord permissions, exclude a player, or restrict Fukishōkai access based only on an economy detection. Unsafe/malformed currency operations may still be rejected before ledger/player data changes; this is transaction integrity, not a member punishment.
- Protected King accounts cannot be targeted by economy action controls. Re-check incident category and severity from PostgreSQL before applying any button action.
- `src/services/economy-guard.js` calculates reward-burst severity. `src/services/security.js` filters soft signals, renders plain-text economy notices and executes only explicitly selected owner-approved controls. Tests must cover risk-score threshold, no soft DMs, exact actions, King protection and no automatic restrictions.

## Opt-in Ollama AI Watch — November 13, 2026

- **Model:** Ollama Cloud `gpt-oss:20b` is the selected cost-efficient classification model. `OLLAMA_MODEL` can override it. The model is a read-only classifier; it has no Discord tools and cannot take actions.
- **Cost:** Ollama Cloud is pay-per-token, not unlimited free. `gpt-oss:20b` is currently listed at $0.07 per million input tokens and $0.30 per million output tokens. Beam's temporary free promotion ended November 9, 2026. Never describe cloud monitoring as permanently free. `AI_MESSAGE_MONITOR_DAILY_LIMIT` defaults to 100 calls per guild per UTC day, stored in `ai_message_monitor_usage`.
- **Enablement:** default off. Set `AI_MESSAGE_MONITOR_ENABLED=true`, `OLLAMA_API_KEY`, `OWNER_ID`, and `AI_MESSAGE_MONITOR_GUILD_IDS` (or `GUILD_ID`) to explicitly scope monitored server IDs. Optionally set `OLLAMA_MODEL=gpt-oss:20b` and `AI_MESSAGE_MONITOR_DAILY_LIMIT=100`. The app requests `GatewayIntentBits.MessageContent` only when all required values exist. The user must enable Message Content Intent in Discord Developer Portal before restarting. Do not enable GuildMembers or GuildPresences. If the privileged intent is not enabled in the portal, Discord can reject the Gateway connection.
- **Coverage:** receives new human-authored guild messages from channels the bot can view. A local candidate gate checks all incoming messages and forwards likely rule-related cases to Ollama, rather than sending every ordinary chat message to the cloud. Candidates include direct free-FC requests/begging, economy evasion, possible scams/impersonation, targeted harassment and spam. Normal earning questions, commands, legitimate trades and harmless jokes should not be reported.
- **Context:** short in-memory channel history, reply target and permalink, current message permalink, attachment URLs, author ID, username/display names, account creation date, join date when available, assigned role names/IDs/positions/permissions, effective channel permissions, channel name/category/ID and permission overwrites. Targeted member REST fetches are used for known message authors when needed; the bot does not enumerate the member list.
- **Reporting:** only `OWNER_ID` receives plain-text DMs. Reports require confidence >= 0.88 and include category, confidence, evidence, suggested manual review, role/channel metadata and message/reply/attachment links. Repeat notices for the same member/category are suppressed for 15 minutes. The bot does not create screenshots; use Discord permalinks to open the original messages.
- **Data boundary:** candidate message content and selected context are sent to Ollama Cloud for classification. Tell server members about this monitoring and enable it only if this data transfer is acceptable. Recent channel context is in memory only; the daily usage counter is persisted. AI Watch does not ban, kick, timeout, delete messages, change roles/permissions, exclude members, or execute any moderation actions.

## FC Party start announcement — November 13, 2026

- Starting an FC Party now calls `announceEconomyParty` from `src/commands/dashboard.js` after the event is persisted.
- Public destination is the configured `memberCommandsChannelId` (the game/commands channel). The announcement is plain text, not an embed.
- It contains the event name, duration and relative end time, FC duplication multiplier, starter display name, and reward audience.
- The only mention allowed is the configured `halloweenRoleId` / Halloween reward role, and only when it exists, is not managed/@everyone, and is mentionable or the bot has `MentionEveryone` permission. `allowedMentions` is `{ parse: [], roles: [rewardRoleId] }` in that case.
- Never use `@everyone` or `@here`. If the role is absent/unavailable or cannot be pinged, still announce without a ping and report that state in the private admin panel. If a role-mention send fails, retry with the role name as plain text and no mentions.
- Audit log notification remains separate from the public event announcement. Tests verify the configured-role-only mention and no broad ping fallback.
