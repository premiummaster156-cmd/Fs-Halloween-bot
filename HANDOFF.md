# Fukishokai — Living Project Handoff

**Repository:** https://github.com/premiummaster156-cmd/Fs-Halloween-bot  
**Default branch:** `main`  
**Runtime:** Node.js 20+, Discord.js 14, PostgreSQL on Neon  
**Last updated:** 2026-11-07 — final-season balance and Rift Arena committed to main  
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

Rebirth resets wallet to **2,500 FC**, bank to zero, player level to one and current career. Owned gear, upgrades, Candy collectibles, event claims and lifetime records remain. The permanent FC/XP multiplier is unchanged: `1 + 0.5 × rebirths`, giving 1×, 1.5×, 2×, 2.5× … up to **51×** at 100 rebirths.

### Final-season economy and activities

- Normal FC rewards retain the global **3×** earning multiplier. Casino payouts, transfers and admin grants are excluded.
- Daily reward: **600–900 base FC**, 30 base XP and an 18-hour cooldown.
- Careers use seven earlier unlock tiers, with lower level/wealth requirements and five-minute work cooldowns. Career XP requirements use the final-season curve in `game-balancing.js`.
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
- PostgreSQL `boss_battles` records persist encounters. A player can have one active encounter; the service applies a 10-minute entry cooldown, turn locking and server-side expected-turn validation to prevent stale/double-click interactions.
- The eight endgame abilities can each be activated once per encounter: **PHASE** avoids a counterstrike; **DREAD** weakens three boss strikes; **AEGIS** creates a shield; **REBIRTH** restores health; **EXECUTE** deals bonus damage based on remaining boss health; **HASTE** doubles a strike; **HEX** applies damage over time; **ASCEND** deals a large burst.
- Boss victories grant FC and XP using the normal and rebirth multipliers. Losses charge no fine. Retreating does not erase the Arena cooldown.
- The dashboard includes boss selection, attack/ability/retreat controls, health bars, status effects and encounter result messages.
- `src/utils/arena-card.js` creates a beveled, 3D-inspired HUD with `@napi-rs/canvas`. It is layered 2D artwork, not a true 3D scene.
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
- Work shift quiz remains three multiple-choice questions.
- Admin access: server owner, configured bot owner or configured trusted Admin Role. Discord Administrator alone does not grant bot-admin access. Privileged actions remain audited.
- Do not claim live Discord or Neon validation from GitHub CI alone.

## Validation and deployment status

The complete final-season source/test snapshot passed GitHub Actions run **42289846723** on commit `29b2fc92dfdb8c6dde64df7b7dfa6599f0086d7f`: **149 tests passed, 0 failed**; syntax validation and slash-command validation also passed. The same tested files are being committed to `main`; check the new `main` CI run after the commit. Neon migration and full Discord test-server interaction checks are still manual deployment checks. Do not report the bot as live from this repository update alone.

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
- PR #26 level 600 / 100 rebirth progression, linear multiplier, eight endgame items and readable activity-log embeds.
- The original PR #26 long-term rebirth requirements were superseded by the final-season values documented above.

## Next-chat rule

1. Read this `HANDOFF.md` first.
2. Work directly on `main`; do not create branches.
3. Inspect the current `main` commit and GitHub Actions status before changing or reporting code.
4. Keep this handoff and README synchronized with every substantive code/balance change.
5. For gameplay changes, define unlocks, costs, rewards, cooldowns, abuse prevention, logs and tests.
6. Prefer clear, fair and achievable gameplay over grind walls or exploit-prone reward inflation.
