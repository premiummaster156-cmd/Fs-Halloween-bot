# CoopFT server system

The Fukishōkai economy bot and CoopFT community system use the same Discord application connection, but they are separate **server personas**. Discord does not give one application bot account two independent application identities; the bot uses a per-server nickname, separate slash-command registration, separate message branding, and separate command routing.

- CoopFT server: `1498271944456540210` (fixed; a different `COOPFT_GUILD_ID` override is rejected).
- Fukishōkai server: `FUKISHOKAI_GUILD_ID`; legacy `GUILD_ID` is used as a fallback when it is not the CoopFT ID.
- Fukishōkai economy, boosters, activity rewards, games, custom slash commands, admin dashboard and raid/security workflows are accepted only in the Fukishōkai server.
- CoopFT receives only `/staff`, `/staff-manage`, `/hr-manage`, `/ticket`, `/applications-admin`, and `/coopft-setup`. It has no Fukishōkai economy, player wallets, candy rewards, inventory, jobs, heists, or game dashboard.

## Fukishōkai isolation and setup safety

The CoopFT server ID is hard-locked to `1498271944456540210`. A different `COOPFT_GUILD_ID` value makes the application fail closed at configuration load, and configuring Fukishōkai to the same ID is also rejected. The setup script separately checks the fixed ID before it runs database migrations, logs in to Discord or fetches a guild. It always calls `guilds.fetch("1498271944456540210")`; it does not use a general server list or select the current/first server.

The CoopFT community service repeats the ID check at the start of setup and before every resource-mutating helper (role, channel, category, emoji and cleanup operations). A call with a Fukishōkai guild object is rejected before it performs a Discord fetch or mutation. Runtime routing keeps CoopFT commands and staff synchronization inside the CoopFT persona; Fukishōkai game, booster, raid and economy listeners remain guarded by the Fukishōkai server ID.

The hosting command now uses `migrateCoopFT()`, not the general bot migration. It applies only numbered `*_coopft_*.sql` migrations (currently `0001`, `0002` and `0003`) and does not load the general `schema.sql` bootstrap, inspect the `players` table or add Fukishōkai player constraints. It writes the shared `schema_migrations` ledger and creates/updates only the `coopft_*` tables. It does not change wallets, levels, inventories, roles, channels or members in Fukishōkai.

This isolation applies to `npm run coopft:setup`. The separate `npm run deploy-commands` command is a command-registration tool and may publish both personas' slash-command definitions; it is not called by CoopFT setup and does not create or edit Discord channels/roles.

## Manual setup from the hosting console

CoopFT server configuration does **not** run during normal bot startup, restarts, or when the bot joins the server. This prevents every restart from re-checking or changing Discord roles, channels, panels and messages.

Run this command manually from the repository root in your hosting provider's console whenever you first want to configure CoopFT or intentionally repair its layout:

```sh
npm run coopft:setup
```

The command applies the database migrations, connects a temporary Discord client to the configured CoopFT server, creates or repairs the channels, roles, panels, directories and branded emojis, then disconnects and closes its database pool. It targets `COOPFT_GUILD_ID` (default: `1498271944456540210`). Keep `DISCORD_TOKEN`, `DATABASE_URL` and `COOPFT_GUILD_ID` configured in the hosting environment.

The command is safe to run again when you intentionally want to repair missing CoopFT resources. It reuses saved Neon resource IDs and does not wipe player data. It does **not** need to be added to the host's normal Start Command. Your regular `npm start` command only starts the bot and its event listeners; member lifecycle and audit logging continue after the initial setup has been completed.

The in-server `/coopft-setup` command remains available as an optional manual repair action for authorized CoopFT managers. The hosting-console command is the preferred way to perform initial setup or a full repair.

The setup creates these channel groups:

- **START HERE:** welcome, rules, announcements (Announcement channel when supported; text fallback otherwise), introductions and role-explanations.
- **COMMUNITY:** general, media, showcase, your-creation, community-voice and events-voice.
- **LIVE ANNOUNCEMENTS:** announcements-live is created as a Stage channel, with an ordinary voice-channel fallback if Stage is unavailable.
- **COOPFT SERVICES:** open-a-ticket, applications, bot-updates, suggestions, bug-reports, custom-bot-requests and staff-directory.
- **STAFF HQ (private):** staff-team, staff-chat, staff-announcements, staff-bot-updates, application-review, ticket-transcripts, member-logs and server-logs.
- **PRIVATE TICKETS:** one private text channel per open ticket.

The old bot-managed `help-study` channel is retired and removed during setup only when its saved ID and CoopFT management marker both match. A manually created channel with that name is left alone.

The private `#member-logs` channel records joins, departures, kicks, bans, unbans, member updates/timeouts, member prunes, and moderator message deletions with account age, join time, time in server, and the member’s last saved role list. The private `#server-logs` channel records moderator-performed role, channel, server-setting, invite, and webhook create/update/delete actions. Role snapshots are stored at join and refreshed after audited role changes, so a departure log can still show roles after Discord removes the member from the server. The public `#welcome` channel receives a welcome embed. Fukishōkai uses its configured `LOG_CHANNEL_ID` for lifecycle and audit logs and the optional `WELCOME_CHANNEL_ID` (or the system channel) for public welcomes. Message-deletion audit events store metadata only; message contents are never collected or published, and Message Content Intent remains disabled.

The public staff directory and private staff-team embed use the same ten-rank list. They are refreshed after bot-managed hires/promotions/demotions/removals and after an audited manual staff-role change. The bot fetches only the exact member identified by that audit entry; it does not enumerate the server's member roster. If a staff member leaves, a later directory refresh marks the missing member inactive.

## Roles and styling

The setup creates ten staff roles:

1. Owner
2. Co-Owner
3. High Rank Supervisor
4. Apex
5. Overseer
6. Staff Supervisor
7. Head Moderator
8. Senior Moderator
9. Moderator
10. Junior Moderator

It also creates five Human Resources roles: HR Director, HR Manager, HR Recruiter, HR Coordinator, and HR Trainee.

Five specialist application roles are created separately: War Manager, Referee, Observer, Helper and Ticket Staff. They have no global Discord permission bits. Only Ticket Staff receives access to ticket handling after approval; approval assigns the selected specialist role to the applicant.

**Discord permission hierarchy:**

| Role | Global Discord permissions |
|---|---|
| Owner | Every permission, including Administrator |
| Co-Owner | Every permission, including Administrator |
| High Rank Supervisor | Every permission except Administrator, Manage Server and Manage Channels |
| Apex | Kick/timeout members, moderate messages, view audit logs, manage threads/events/nicknames |
| Overseer | Kick/timeout members, moderate messages, view audit logs, manage threads |
| Staff Supervisor | Kick/timeout members, moderate messages, manage threads |
| Head Moderator | Kick/timeout members, moderate messages, view audit logs |
| Senior Moderator | Timeout members, moderate messages, manage threads |
| Moderator | Timeout members, moderate messages |
| Junior Moderator | Moderate messages and create public threads; no kick/timeout |
| HR Director | Manage recruitment threads, create private threads and reply in threads |
| HR Manager | Manage recruitment threads, create private threads and reply in threads |
| HR Recruiter | Create public/private threads and reply in threads |
| HR Coordinator | Create public/private threads and reply in threads |
| HR Trainee | Create public threads and reply in threads |
| Specialist application roles | No global Discord permissions |

Owner and Co-Owner are full administrators. Discord's Administrator permission bypasses channel-specific permission overwrites, so members with either role can access private channels regardless of the ordinary Staff HQ restrictions. Assign these two roles only to people you fully trust.

High Rank Supervisor receives the full remaining permission set, including Manage Roles, ban/kick/moderation permissions and other server functions, but cannot administer the server, manage channels or hold Administrator. Discord's normal role hierarchy still applies when they manage roles.

The other staff ranks receive graduated moderation powers. Junior Moderator cannot kick or timeout members. Apex has event, nickname and audit-log tools; Overseer has audit-log access; only roles explicitly listed above receive those elevated capabilities.

HR permissions are deliberately narrower: HR roles can work with recruitment threads, but cannot kick or ban members, timeout members, manage roles, manage channels, manage the server or view the server-wide audit log. Specialist application roles remain permission-neutral; Ticket Staff receives ticket access through channel overrides and the bot's ticket workflow after approval.

Each role receives a distinct colour palette, a Unicode role-icon attempt, and a position in the managed staff structure. Actual gradient colours require the server's Discord `ENHANCED_ROLE_COLORS` feature; role icons require `ROLE_ICONS`. If either feature is unavailable, the role keeps a solid colour and its icon still appears inline in bot embeds. Every role's permission bitfield is explicitly reapplied during manual setup/repair, so later runs will not reset the configured permission hierarchy.

The bot will not move its own role. Place the bot's highest role **below roles you want protected and above the new CoopFT-managed roles**. Roles above the bot's highest role are outside its control.

## Custom emojis

The bot uses **28 individually illustrated 3D-style metallic and gemstone emblems** stored in `assets/coopft-emojis.png.b64`. The emoji names use the new `cf3d_*` namespace so an older `cf_*` emoji is never mistaken for the new artwork; existing legacy emojis are left untouched. Each tile has a distinct purpose: crowns, shields, rank stars, diamonds, butterflies, leaves, flames, ice crystals, keys, tickets, scrolls, headsets, gears, bells, handshakes, sparks, war swords, referee scales, observer eyes, helper emblems, application clipboards, a role guide, rules scroll, megaphone, voice waveform, idea bulb, ticket-staff badge and community group. During the manual setup run, `@napi-rs/canvas` crops each 32×32 tile from the 4×7 source sheet and uploads it as its own 128×128 transparent Discord emoji. The emblems appear in the rules, role explanations, welcome and announcement embeds, suggestions, application panels, staff updates and ticket panels. The bot needs Discord's **Create Expressions** permission to upload them. If the server only grants Manage Expressions, lacks Create Expressions, or reaches its emoji limit, that upload can fail; embeds and buttons then fall back to Unicode emoji. The saved emoji IDs are reloaded from Neon after bot restarts; ordinary restarts do not re-upload or recreate the pack.

## Rules, role explanations and applications

The `#rules` channel receives one branded embed with a generated square CoopFT crest attached as the embed's top thumbnail. The rules use the custom emoji illustrations and cover respect, constructive discussion, server safety, privacy, advertising, voice/events, suggestions, moderation, appropriate content and community participation.

The `#role-explanations` channel receives one maintained guide covering all 10 staff ranks, all 5 HR roles and all 5 specialist positions. Each role has its own description and custom emblem.

The `#applications` panel offers five separate tracks: War Manager, Referee, Observer, Helper and Ticket Staff. Each button opens a private application modal with four required questions (experience, motivation, scenario response and availability) plus one optional note. Submitted applications are saved in Neon and posted to the private `#application-review` channel with applicant details and Approve/Decline controls. Only the server owner, senior CoopFT managers and authorized HR managers can review them. Approval assigns the specialist role and attempts to notify the applicant by DM; decline records the decision and also attempts a private DM. A member can have only one pending application for the same position.

Use `/applications-admin open position:` or `/applications-admin close position:` to control each application track. The public panel updates its OPEN/CLOSED status and enables or disables that position's button. All five positions default to open on first setup. Members can also choose **Manage opening alerts** on the public panel and opt in to private DMs for selected positions. When a manager reopens one of those positions, only its opted-in subscribers are notified; no one is subscribed by default. Users can clear their notification selections at any time.

The `#suggestions` channel receives a dedicated guide embed that explains how to write useful suggestions and what review may look like.

The application records and notification subscriptions are stored in Neon using immutable migrations `0002_coopft_applications.sql` and `0003_coopft_application_notifications.sql`. Both migrations are applied by the normal migration runner and by `npm run coopft:setup` before Discord resources are touched.

## Tickets

Members can open a ticket using the buttons in `#open-a-ticket` or the `/ticket type:` command. Types are General Support, Bug Report, Custom Bot Request, and Suggestion. The bot prevents a member from opening a second ticket while one is already open.

Staff can claim a ticket. The opener or staff can close it. On close, the bot saves the latest 100 messages as a text transcript in the private `#ticket-transcripts` channel, including attachment URLs, then locks the opener from sending further messages in that ticket. Discord's API limits the amount of history fetched in one request, so this transcript is the latest 100 messages, not an unlimited archive.

## Staff changes

`/staff-manage hire`, `promote`, `demote`, and `remove` require the server owner, Owner/Co-Owner/High Rank Supervisor, or HR Director/HR Manager. A change updates the member's staff role, writes a Neon audit record, updates both staff directory embeds, and posts to private `#staff-bot-updates`.

HR roles are created automatically but are not granted to anyone automatically. The server owner assigns the first HR Director using `/hr-manage assign`. After that, senior staff managers can manage all HR ranks; an HR Director can manage HR Manager and lower; an HR Manager can manage HR Recruiter, HR Coordinator and HR Trainee only. HR Managers cannot appoint or remove HR Directors/Managers, and users cannot change their own HR role. Every HR assignment is audited and shown in the HR section of the staff directory. Manual HR role changes are checked against the same hierarchy and unauthorized changes are reverted.

## Role cleanup safety

The earlier request to delete every role the bot can manage is destructive: deleting a role also removes every member's assignment to that role, and the bot cannot reconstruct all those assignments from the approved event permissions.

Therefore, the first manual setup run makes a cleanup **preview**, stores the names/IDs/permissions of ordinary editable roles in Neon, and posts the candidate list to private `#staff-bot-updates`. It deletes nothing by default. After reviewing the list and backing up assignments, an operator may set:

```env
COOPFT_ROLE_CLEANUP_CONFIRM=DELETE_EDITABLE_ROLES
```

The one-time cleanup deletes only unmanaged roles editable by the bot, excluding `@everyone`, managed integration roles, roles named with the `CF • ` prefix, and IDs listed in `COOPFT_KEEP_ROLE_IDS`. Roles above the bot remain inaccessible to it. Do not enable this until the candidate list and server role assignments have been reviewed.

## Required bot permissions

For full setup, invite/position the bot with:

- Administrator (required so the bot can grant Administrator to the Owner and Co-Owner roles)
- Manage Roles
- Manage Channels
- View Channels
- Send Messages
- Read Message History
- Embed Links
- Attach Files
- Create Expressions (optional; required for the custom emoji pack)
- View Audit Log (for member-role, moderator-action, channel and role audit events)

**Important security trade-off:** Discord only lets a bot grant permissions that the bot itself has. Because CoopFT Owner and Co-Owner must receive Administrator, the bot must also have Administrator in CoopFT for automatic setup and future role-permission repairs to work. This gives the bot full control of the CoopFT server; only enable it if you trust this bot and its code. This grant applies to the bot's CoopFT membership, not to its separate membership in other servers.

The bot must be higher than the roles it creates/manages and lower than protected roles. View Audit Log is required: Discord only sends the live Guild Audit Log Entry Create gateway event to bots with this permission.

## Deploying slash commands

Set `COOPFT_GUILD_ID` and `FUKISHOKAI_GUILD_ID` (or the legacy Fukishōkai `GUILD_ID`) in the host environment, then run `npm run deploy-commands`. By default, the deploy script registers each persona's commands only in its own server and clears the global command set. To deploy one server for a test, set `DEPLOY_GUILD_ID` to that server's ID.

Neon remains the only database. The migration `0001_coopft_community.sql` adds isolated CoopFT tables; it does not alter existing player economy tables or wipe data.

## Hosting-console setup command

After configuring the required environment variables and deploying the CoopFT slash commands, run `npm run coopft:setup` in the hosting console to create or repair the CoopFT server layout. Run it only when you intentionally want to configure or repair the server; do not add it to the normal process start command. Routine bot restarts do not perform server setup.

