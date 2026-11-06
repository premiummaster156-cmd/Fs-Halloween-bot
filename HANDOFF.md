# Fukishōkai — Living Project Handoff

**Repository:** https://github.com/premiummaster156-cmd/Fs-Halloween-bot  
**Default branch:** `main`  
**Runtime:** Node.js 20+, Discord.js 14, PostgreSQL on Neon  
**Last updated:** 2026-11-07 — final-season balance applied  
**Rule:** Update this file whenever a feature, balance, deployment, or architecture change is merged. The next chat must read this file and inspect the current repository before making changes.

## Final-season balance update — November 7 to November 30, 2026

User confirmed the bot will only be used through **November 30, 2026**. The short-season economy is intentionally achievable without a long grind. Default event end is 2026-12-01T00:00:00Z (05:00 in Tashkent), so the full local November 30 is included. This does not auto-shut down the bot.

- First rebirth: 20,000 FC, level 12, one claimed event quest, career level 2, three current-run work shifts.
- Wallet requirement adds 10,000 FC and level adds four per rebirth. Quest claims rise every four rebirths (cap 4); career level rises every four (cap 10); work shifts rise every three (cap 10).
- No gear/Candy requirements for first two rebirths. One normal gear item from rebirth #3, one Candy-shop collectible from #4, one combined gear-upgrade level from #5. Slow increases cap at 4 gear items, 3 Candy collectibles, 70 unspent Candy and 5 total upgrade levels.
- Rebirth reset: 2,500 FC wallet, zero bank, level 1, no career. Gear, upgrades, Candy collectibles and lifetime records persist.
- Level XP: 80 + 12 × current level. Level cap 600; rebirth cap 100. Multiplier remains +0.5× per rebirth, reaching 51× at 100.
- Jobs, item costs/levels, upgrade costs, crimes, heists, weekly quests, Halloween quests, Candy prices/drop chances, achievements, Party Fortune and Arena unlocks are reduced for this final season.
- Casino remains 95% theoretical return, 100 FC minimum, 10-second cooldown. Normal FC retains the 3× multiplier. Automatic personal boost rewards are untouched.

## Current feature branch — Rift Arena and active gear powers (not merged)

Branch: `active-abilities-rift-arena`  
Status: PR #28 is open against `main` and is not merged. The active gameplay code and PNG HUD render test passed CI run 42284197549 at code head 9556ea5f133a264e54dba1e78c017931e8d9b118. The subsequent documentation update passed CI run 42284303743 at head 6295f097c915c6db9d9620be5dc06c114c80ff3a. No gameplay code changed in the documentation-only follow-up. Neon migration and Discord test-server checks remain outstanding. Do not describe this as live in Discord.

Implemented on this branch:
- A persistent solo **Rift Arena** with six bosses unlocked at levels 1, 20, 40, 60, 80 and 100.
- PostgreSQL `boss_battles` records, one active encounter per player, 10-minute entry cooldown, turn locking, and server-side validation of expected turn numbers to reject stale/double-clicked controls.
- Each equipped endgame ability can be activated once per encounter. PHASE avoids a counterstrike; DREAD weakens three boss strikes; AEGIS creates a shield; REBIRTH restores health; EXECUTE deals bonus damage based on the boss's remaining health; HASTE doubles a strike; HEX applies damage over time; ASCEND deals a large burst.
- Boss victories grant FC and XP. FC uses the existing 3× earning multiplier and the player's rebirth multiplier; losses charge no fine. Retreats do not erase the Arena cooldown.
- The Arena dashboard includes boss selection, attack/ability/retreat controls, health bars, status effects and encounter result messaging.
- `src/utils/arena-card.js` renders a custom beveled, 3D-inspired HUD illustration using `@napi-rs/canvas`. This is layered 2D artwork, not a true 3D scene.
- `tests/arena.test.js` covers boss gates, all eight active powers, damage-over-time, shielding, healing, battle end states and a successful PNG render of the Arena HUD.

Files added/changed: `src/games/arena.js`, `src/utils/arena-card.js`, `tests/arena.test.js`, `src/database/schema.sql`, `src/index.js`, `src/services/economy.js`, `src/commands/dashboard.js`.

Before merge:
1. Open/inspect the pull request and wait for GitHub Actions CI to complete.
2. Fix any syntax, test, Discord component or canvas rendering errors; do not claim success until CI is green.
3. Check Neon schema application at startup and confirm the partial unique index prevents parallel active encounters.
4. Test the full interaction flow in a test Discord server: start, attack, activate each equipped power once, defeat, lose, escape, cooldown, and stale controls.
5. Tune reward amounts and fight difficulty against real player gear/loadouts.

CI status: runs 42284197549 and 42284303743 passed; see the branch status above. PR #28 remains open pending manual Neon/Discord validation.

After merge, the user must pull main, run `npm install`, run `npm run db:migrate`, and restart the bot. No live Discord deployment is claimed.

## Latest completed task

Branch: `progression-100-rebirth-level-600-game-expansion`  
PR #26 merged into main as commit `0bbe3271699646830e224a8a4037a85cc8c924b2`. Post-merge CI runs 42256014897 and 42256071916 both completed successfully. The user must still pull/restart the bot; no live Discord deployment is claimed.

Requested:
- Replace raw JSON activity-log lines with readable game log cards.
- Rebirth multiplier ladder: 1×, 1.5×, 2×, 2.5× ...
- Maximum 100 rebirths and maximum level 600.
- Add endgame items and one-word special abilities.
- Give embeds a more polished game presentation.
- Keep this handoff file current for all future chats.

Implemented on this branch:
- `progression.maxLevel = 600`, `progression.maxRebirths = 100`.
- Rebirth multiplier is `1 + 0.5 × rebirths`, capped at 100 rebirths (51×).
- Final-season rebirth formula: 20,000 FC + 10,000 FC per current rebirth; level 12 + four per current rebirth, capped at 600.
- Rebirth service blocks further rebirth after 100.
- XP progression and admin Set Level / Set Rebirth controls use the new caps.
- Database migration adds idempotent PostgreSQL checks for level 1–600 and prestige 0–100.
- Eight new endgame items with named passive abilities: PHASE, DREAD, AEGIS, REBIRTH, EXECUTE, HASTE, HEX, ASCEND.
- Equipment shop and owned Gear inventory display rarity, ability descriptions and active passive stat effects.
- Member activity log channel receives compact themed embeds with readable fields rather than raw JSON. Full details remain in the PostgreSQL audit log.
- Tests updated for the new progression and endgame equipment.
- README progression text updated.

## Current final-season balance

- Level cap 600; rebirth cap 100; multiplier +0.5× per rebirth (1×, 1.5×, 2×, 2.5× … 51×).
- First rebirth: 20,000 FC, level 12, one event quest claim, career level 2, three work shifts.
- Each rebirth adds 10,000 FC and four levels; quest claims/career/work shift requirements rise gradually and cap at 4/10/10.
- Gear/Candy/upgrade requirements start at rebirths 3/4/5, grow slowly and cap at 4/3/70 Candy/5 upgrade levels.
- Reset wallet 2,500 FC, bank 0, level 1, career cleared; owned gear, Candy collectibles and lifetime progress persist.
- Normal FC multiplier remains 3×; Casino excluded.
- Final event deadline is Nov 30, 2026 local time; default timestamp Dec 1 00:00 UTC.


## New endgame gear

All eight items are normal shop equipment (not booster-exclusive), use unique equipment slots, require higher player level and use passive stats already supported by the game’s effect aggregation/calculation systems:

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

Abilities retain their passive stat bonuses and, on `active-abilities-rift-arena`, also have one-use active combat effects in the Rift Arena. Each equipped ability can be used once per battle. The Arena adds a custom beveled 3D-inspired canvas HUD; it is layered 2D artwork, not true 3D geometry. More abilities/items, loot tables and richer 3D art remain possible follow-on work.

## Existing project rules

- Neon PostgreSQL only. Do not switch database providers.
- Public player UI: `/menu`; admin: `/admin-panel`; public `/leaderboard`; `/profile` is also registered.
- Preserve `src/ai/brain.js` prompt if present; user previously said not to change it.
- Keep weekly boss removed.
- Keep normal FC earning multiplier at 3×; casino payouts excluded.
- Wallet ceiling 2 billion; overflow earnings auto-bank.
- Five personal server-boost Mythic rewards are granted from Discord personal boost notifications. The user supplied Booster Role ID `1376299577581240410`; inspect current code/settings before changing boost logic.
- Personal boost item rewards depend on received `GUILD_BOOST` messages; old boosts are not backfilled.
- Ordinary chat Candy drops are silent; never restore per-message Candy announcements.
- Profile card uses server display name and system font fallback for Unicode.
- Work shift quiz remains three questions. Final-season work-shift rebirth requirement starts at three and caps at ten.
- Admin access: server owner, configured bot owner, or configured trusted Admin Role. Discord Administrator alone does not grant bot admin.
- Privileged actions remain audited.
- Never claim live Discord testing based only on GitHub CI/repository access.

## Previously merged PRs

- #10 duplicate command deployment fix
- #11 wallet overflow auto-bank and profile
- #12 3× normal FC earning multiplier
- #13 server booster passive perks and exclusive gear
- #14 automatic personal boost rewards
- #15 booster reward/member guide
- #16 admin grant controls for Mythic booster items
- #24 Unicode and server nickname profile-card fix
- #25 silent ordinary chat Candy-drop notifications
- #26 level 600 / 100 rebirth progression, linear multiplier, eight endgame items and readable activity log embeds

## Validation and deployment

For the current `active-abilities-rift-arena` branch:
1. Latest final-season CI run 42287485838 passed on commit `65251dd2771edeb948c1a6fd407ba00ebffa2de1` (dependency installation, syntax check, slash-command validation and full test suite). Earlier failed runs were before the test expectations were updated to the new season values.
2. Run `npm run check` / `npm test` in Node.js 20 locally when available.
3. Validate PostgreSQL schema syntax and idempotency, including the one-active-battle partial index.
4. Verify Arena actions, ability ownership/equip checks, one-use-per-ability, stale-turn rejection, reward balance and cooldown behavior.
5. Verify the canvas HUD renders and Discord accepts its attachment in an edited dashboard response.
6. Merge only after green CI and manual test-server validation.

Previously merged progression validation: PR #26's post-merge CI runs 42256014897 and 42256071916 completed successfully.

After merge:
```powershell
git pull origin main
npm install
npm run db:migrate
npm start
```
The schema is also applied at startup. No slash-command redeployment is required unless command definitions change.

## Next-chat rule

1. Read this `HANDOFF.md` first.
2. Inspect current `main`, latest PR and CI status; never assume a pending branch has merged.
3. Update this file whenever more work is merged.
4. For every new gameplay system, define unlocks, costs, rewards, cooldowns, abuse prevention, logging and tests.
5. Prefer fair progression and readable game UI over exploit-prone reward inflation.

## Finalized balance correction — supersedes earlier draft values above

- Earlier draft rebirth values (1.09× wealth growth and +5.65 levels) are superseded by the November 30 final-season formula: 20,000 FC + 10,000 FC per current rebirth; level 12 + four per current rebirth.
- Career level caps at ten and current-run work shifts cap at ten. Gear/Candy/upgrade milestones begin at rebirths 3/4/5 and are capped to keep the finale attainable.
- Multiplier remains +0.5× per rebirth (51× at rebirth 100).
- Database caps are installed by the idempotent migration runner in `src/database/migrate.js`, not by procedural SQL in `schema.sql`.
- GitHub Actions run 42255754565 completed successfully: dependency installation, syntax validation, slash-command validation and full test suite all passed.

## Merge status update — 2026-11-06

- PR #26 is merged into `main` (merge commit `0bbe3271699646830e224a8a4037a85cc8c924b2`).
- Pre-merge CI on the final PR head passed: run 42255886764.
- Post-merge CI runs 42256014897 and 42256071916 completed successfully.
- Deployment remains the user's responsibility: pull main, run migrations, restart the bot.


## Handoff maintenance rule

This file is the living source of truth. On every future feature branch, update the current-branch section with implemented behavior, files, tests, outstanding checks, branch/PR/merge status and deployment status. When a branch merges, move its work into Latest completed task / Previously merged PRs and refresh the current status. Never leave old pending tasks presented as current once they are complete.
