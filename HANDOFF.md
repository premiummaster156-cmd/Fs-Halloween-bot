# Fukishokai — Live Project Handoff

> **Living handoff rule:** Update this file in every future code change or pull request. Before merging, update the pending work and test status. After merging, update the main commit, CI result, deployment state and remaining tasks. Never leave an old PR number, cap, feature list or test status in this file.

## Repository and current work

- **Repository:** `premiummaster156-cmd/Fs-Halloween-bot`
- **Main branch:** `main`
- **Current feature branch:** `expand-rpg-progression-level-600-rebirth-100`
- **Current status:** Implementation in progress; tests and PR still pending.
- **Current task:** Expand progression to level 600 / 100 rebirths; introduce high-tier careers, operations, gear and proc-based special abilities; replace raw JSON activity log spam with report-style Discord embeds; style dashboard panels as a game HUD.
- **Live deployment:** Not verified. This agent can update GitHub and inspect Actions, but cannot access the running Discord bot or the live Neon database.

## Project identity and guardrails

Fukishokai is a Discord RPG/economy game built with Node.js 20+, Discord.js 14 and PostgreSQL on Neon. Game state is persisted in PostgreSQL. The current built-in slash commands are:

- `/menu` — private player game dashboard.
- `/profile` — orange Halloween profile card.
- `/leaderboard` — public rankings.
- `/admin-panel` — private administration console.

Keep the retired weekly boss out of the game. Do not add duplicate or unnecessary slash commands. Member-facing controls should normally live inside `/menu`; admin operations belong in `/admin-panel`. Keep the normal FC earning multiplier at 3×; casino payouts remain excluded so their published 95% theoretical return is maintained. Candy drops from chat must stay silent—do not restore per-message Candy notifications. Respect the configured member command channel and configured activity/admin log channel.

When changing the code, run tests and make a PR. Never claim live Discord or Neon verification unless it actually happened. After a merge, give the user the pull/restart steps. Database schema changes are applied at bot startup by `migrate()`.

## Core economy and progression rules

### FC and XP

- Normal FC earning base: **3×**.
- Casino payouts: excluded from the FC multiplier.
- Rebirth multiplier is linear: **1 + 0.5 × rebirth count**, capped at 100 rebirths.
- Rebirth ladder: 0 = 1×; 1 = 1.5×; 2 = 2×; 3 = 2.5×; 20 = 11×; 50 = 26×; 100 = 51×.
- Rebirth multiplier applies to normal FC earnings and player XP. It must not return to exponential doubling.
- Maximum player level: **600**.
- XP requirement: `100 + level * 20 + floor(level^1.5 * 2)`; level 600 needs 41,493 XP for the next level calculation. XP is cleared when the player is already at the level cap.
- Maximum rebirth count: **100**.
- Existing progression and player records are preserved; no player reset is part of this work.

### Rebirth requirements

The first rebirth currently requires 500,000 FC combined wallet/bank wealth, level 35, three claimed normal event quest rewards, a career at job level 5 and 20 work shifts in the current run. Work shifts rise to 30 and never exceed that cap.

Later requirements scale with prestige:
- Wealth target: `ceil(500000 * (1 + 0.12 * currentRebirths)^2)`.
- Level target: `min(600, 35 + 5 * currentRebirths)`.
- Normal event quest claims grow to the six available quests.
- Career job level grows by one per rebirth, capped at 30.
- Work shifts: 20 initially, then 30 from the next rebirth onward; hard cap 30.
- Gear and Candy-shop collectible requirements begin when preparing for rebirth #3.
- Gear upgrade level requirements begin at prestige 3.
- At 100 rebirths, the player cannot rebirth again and has 51× FC / XP power.

A rebirth resets wallet to 1,000 FC, bank to zero, player level to 1 and current career. Gear, equipment upgrades, Candy, collectibles, event claims and lifetime statistics remain.

Database constraints in `src/database/schema.sql` enforce player level 1–600 and prestige 0–100.

## Expanded endgame content in this branch

### Careers (12 tiers)

| Career | Minimum level | Wallet |
|---|---:|---:|
| Street Runner | 1 | 0 FC |
| Delivery Rider | 8 | 10,000 FC |
| Shopkeeper | 18 | 50,000 FC |
| Enforcer | 32 | 200,000 FC |
| Smuggler | 50 | 750,000 FC |
| Underboss | 70 | 2,500,000 FC |
| Crime Boss | 100 | 10,000,000 FC |
| Syndicate Architect | 140 | 20,000,000 FC |
| Shadow Director | 220 | 45,000,000 FC |
| Underworld Sovereign | 320 | 100,000,000 FC |
| Phantom Emperor | 450 | 250,000,000 FC |
| Eternal Overlord | 600 | 600,000,000 FC |

### Crimes (10)

Existing operations through Vault Extraction remain. New unlocks:
- Black Market Sweep — level 120.
- Ghost Protocol — level 220.
- Capital Siege — level 350.
- Abyssal Extraction — level 500.

Crime and heist level odds now use square-root level scaling to avoid trivial 85% success at high levels.

### Heists (9)

Existing missions remain. New unlocks:
- Skyline Siege — level 120.
- Black Crown Protocol — level 250.
- Abyss Gate — level 400.
- Eclipse Protocol — level 550.

### Endgame gear and abilities

Eight standard high-tier items are added to the shop:

| Item | Unlock | Special ability |
|---|---:|---|
| Emberfang Blade | 100 | **Blood Pact** — 18% chance to add 25% to successful crime payout. |
| Spectral Mantle | 140 | **Phase** — 14% chance to avoid a failed-crime fine. |
| Titan Core | 200 | **Bulwark** — 20% chance to halve a failed-heist fine. |
| Oracle Lens | 260 | **Perfect** — 20% chance to add 35% payout on a perfect 3/3 work shift. |
| Revenant Sigil | 320 | **Echo** — 20% chance to add 40% XP on work completion. |
| Void Engine | 390 | **Rift** — 16% chance to add 8 heist success points at mission start. |
| Dragonheart Reactor | 480 | **Overdrive** — 15% chance to add 25% to a successful heist payout share. |
| Eclipse Crown | 570 | **Dominion** — 18% chance to add 50% to a daily reward. |

The ability trigger framework is in `src/utils/core.js`; equipped abilities flow through `combineEffects()` in `src/services/inventory.js`. Ability chances and values scale with item upgrades. Abilities are integrated into Crime, Work, Heist and Daily logic. Keep the short ability names and descriptions visible in Gear/shop and include triggered abilities in gameplay receipts and activity logs.

The five Mythic Booster-exclusive items remain unchanged and are still granted only for personal boost notifications.

## Activity logs and game HUD

The screenshot supplied by the user showed the configured log channel filled with repeated messages like `Member activity: crime_attempt ... {"crimeId":...}`. This was caused by `recordMemberAction()` serializing details into a plain-text log message.

Current branch change:
- `recordMemberAction()` now calls `sendActivityLog()`.
- `buildActivityLogEmbed()` creates short action-specific embeds for crimes, work, daily claims, rebirth, career, gear, bank and heists.
- Important values appear as named fields; the raw structured object stays in PostgreSQL audit history, not in the Discord channel.
- Heist join/completion events are being converted to the same formatted logger.
- The main `panel()` renderer is styled as a framed game HUD with ◆ title framing, a ◈ header, coloured panels and a depth-themed footer. Discord embeds are not physically 3D; this is an in-Discord visual treatment.

## Tests and validation

The repository uses Node's test runner. The Actions workflow performs:
1. Install dependencies.
2. Source syntax check.
3. Slash-command definition validation.
4. `npm test`.

New/updated tests in this branch cover:
- Multiplier values across 0–100 rebirths and the 51× cap.
- XP requirements through level 600.
- Level/rebirth caps and terminal rebirth status.
- Endgame item abilities and upgrade scaling.
- Endgame achievement milestones.
- Formatted activity log embeds instead of JSON.

**Current branch test status:** Pending final CI run. Do not merge until the workflow is green; update this file after the workflow result is known.

## Deployment

After the pull request is merged and the main-branch CI is green:

```powershell
git pull origin main
npm install
npm start
```

The bot calls `migrate()` on startup, so the schema constraints are applied automatically. Back up Neon before deployment. No new slash commands are introduced by this branch, so slash-command redeployment should not be required.

## Continue-from-here checklist for the next chat

1. Read this file first, then inspect the current `main` and active PR status.
2. Verify the latest branch contains all expected changes above; never assume this handoff is newer than GitHub.
3. Run the full CI/tests and fix every failure before merge.
4. Review the progression formulas, SQL constraints, special ability proc paths and log privacy for regressions.
5. Create/merge the PR only after green CI; verify the merge commit and post-merge CI.
6. Update this handoff with the PR number, merge commit, latest CI URL/result and any follow-up work.
7. In every future project change, update `HANDOFF.md` in the same PR before merging, then refresh it again after merge if the status changed.

### Important existing product constraints

- Neon/PostgreSQL is the database. Do not swap to SQLite, D1 or another DB.
- Keep 3× normal FC base earning; exclude casino payouts.
- Keep Candy chat drops silent.
- Keep weekly boss retired.
- The game should feel like a structured RPG rather than a plain economy bot.
- Preserve existing player progress and inventory.
- Be clear that GitHub merge is not the same as deploying/restarting the live Discord bot.
