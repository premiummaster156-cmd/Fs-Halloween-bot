# Fukishōkai — Living Project Handoff

**Repository:** https://github.com/premiummaster156-cmd/Fs-Halloween-bot  
**Default branch:** `main`  
**Runtime:** Node.js 20+, Discord.js 14, PostgreSQL on Neon  
**Last updated:** 2026-11-06  
**Rule:** Update this file whenever a feature, balance, deployment, or architecture change is merged. The next chat must read this file and inspect the current repository before making changes.

## Current task in progress

Branch: `progression-100-rebirth-level-600-game-expansion`  
PR: pending creation / CI validation. Do not treat this branch as deployed until merged and the user pulls/restarts the bot.

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
- Rebirth wealth requirement growth changed from 2× to 1.15× per rebirth; level target grows by 5.5 per rebirth and caps at 600.
- Rebirth service blocks further rebirth after 100.
- XP progression and admin Set Level / Set Rebirth controls use the new caps.
- Database migration adds idempotent PostgreSQL checks for level 1–600 and prestige 0–100.
- Eight new endgame items with named passive abilities: PHASE, DREAD, AEGIS, REBIRTH, EXECUTE, HASTE, HEX, ASCEND.
- Equipment shop and owned Gear inventory display rarity, ability descriptions and active passive stat effects.
- Member activity log channel receives compact themed embeds with readable fields rather than raw JSON. Full details remain in the PostgreSQL audit log.
- Tests updated for the new progression and endgame equipment.
- README progression text updated.

## Balance details

- Level cap: 600.
- Rebirth cap: 100.
- Multiplier: 1× at 0; 1.5× at 1; 2× at 2; 2.5× at 3; 11× at 20; 51× at 100.
- Wealth target: 500,000 FC × 1.15^currentRebirthCount.
- Level target: min(600, ceil(35 + 5.5 × currentRebirthCount)).
- Quest claims: starts at 3 and caps at the six normal Halloween quests.
- Career level: starts at 5 and rises by one per current rebirth, capped at 30.
- Work shifts: 20 at zero rebirths, 30 from one rebirth onward; hard cap remains 30.
- Distinct gear and Candy collectibles begin after two completed rebirths; gear upgrade levels begin after three.
- Existing 3× normal FC earning multiplier remains. Casino payouts remain excluded.

## New endgame gear

All eight items are normal shop equipment (not booster-exclusive), use unique equipment slots, require higher player level and use passive stats already supported by the game’s effect aggregation/calculation systems:

| Item | Unlock level | FC cost | Ability |
|---|---:|---:|---|
| Nightfall Greaves | 60 | 650,000 | PHASE |
| Soulrender Crown | 90 | 900,000 | DREAD |
| Starforged Mantle | 130 | 1,300,000 | AEGIS |
| Phoenix Core | 180 | 1,800,000 | REBIRTH |
| Eclipse Greatblade | 240 | 2,500,000 | EXECUTE |
| Chrono Shard | 300 | 3,400,000 | HASTE |
| Abyssal Grimoire | 400 | 4,500,000 | HEX |
| Dragon Sovereign Halo | 500 | 6,000,000 | ASCEND |

Abilities are passive item identities with real stat effects; they are not separate activated combat skills yet. If adding active cooldown abilities later, implement cooldown/charge tracking, server-side validation and tests.

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
- Work shift quiz remains three questions. Work-shift rebirth requirement caps at 30.
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

## Validation and deployment for the current branch

Before merge:
1. Run GitHub Actions CI and inspect test failures.
2. Search all source files for hard-coded level 100 / rebirth 20 caps that refer to player progression.
3. Validate PostgreSQL schema syntax and idempotency.
4. Verify admin forms, profile card and rebirth dashboard display 600/100 correctly.
5. Verify gear item effects are surfaced in Gear and Shop.
6. Merge only after green CI.

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

- Rebirth wealth requirement growth is **1.09×** per rebirth, not 1.15×. This keeps the 100th rebirth target within the 4 billion combined wallet/bank capacity.
- Rebirth level requirement growth is **5.65** per rebirth, so rebirth 100 requires level 600.
- Multiplier remains +0.5× per rebirth (51× at rebirth 100).
- Database caps are installed by the idempotent migration runner in `src/database/migrate.js`, not by procedural SQL in `schema.sql`.
- GitHub Actions run 42255754565 completed successfully: dependency installation, syntax validation, slash-command validation and full test suite all passed.
