# CoopFT server system

The Fukishōkai economy bot and CoopFT community system use the same Discord application connection, but they are separate **server personas**. Discord does not give one application bot account two independent application identities; the bot uses a per-server nickname, separate slash-command registration, separate message branding, and separate command routing.

- CoopFT server: `1498271944456540210` by default (`COOPFT_GUILD_ID` can override it).
- Fukishōkai server: `FUKISHOKAI_GUILD_ID`; legacy `GUILD_ID` is used as a fallback when it is not the CoopFT ID.
- Fukishōkai economy, boosters, activity rewards, games, custom slash commands, admin dashboard and raid/security workflows are accepted only in the Fukishōkai server.
- CoopFT receives only `/staff`, `/staff-manage`, `/ticket`, and `/coopft-setup`. It has no Fukishōkai economy, player wallets, candy rewards, inventory, jobs, heists, or game dashboard.

## Automatic setup

On startup, the bot checks CoopFT and creates missing resources. It stores resource IDs in Neon so restarts reuse existing resources rather than duplicating them. Running `/coopft-setup` repairs missing channels, roles, panels, and directory messages.

The setup creates these channel groups:

- **START HERE:** welcome, rules, announcements, introductions.
- **COMMUNITY:** general, media, showcase, help-study, your-creation.
- **COOPFT SERVICES:** open-a-ticket, bot-updates, suggestions, bug-reports, custom-bot-requests, staff-directory.
- **STAFF HQ (private):** staff-team, staff-chat, staff-announcements, staff-bot-updates, ticket-transcripts, member-logs.
- **PRIVATE TICKETS:** one private text channel per open ticket.

The private `#member-logs` channel records joins and departures with account age, join time, time in server, and the member’s last saved role list. Role snapshots are stored at join and refreshed after audited role changes, so a departure log can still show roles after Discord removes the member from the server. The public `#welcome` channel receives a welcome embed. Fukishōkai uses its configured `LOG_CHANNEL_ID` for lifecycle logs and the optional `WELCOME_CHANNEL_ID` (or the system channel) for public welcomes.

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

Each role receives a distinct colour palette, a Unicode role-icon attempt, and a position in the managed staff structure. Actual gradient colours require the server's Discord `ENHANCED_ROLE_COLORS` feature; role icons require `ROLE_ICONS`. If either feature is unavailable, the role keeps a solid colour and its icon still appears inline in bot embeds. The system does not grant `Administrator` or other server permission bits to staff roles. Staff access is managed through private-channel overwrites and bot-side HR checks.

The bot will not move its own role. Place the bot's highest role **below roles you want protected and above the new CoopFT-managed roles**. Roles above the bot's highest role are outside its control.

## Custom emojis

The bot generates sixteen small, branded custom emojis with `@napi-rs/canvas` and uploads them once by name. They are used inline in embed titles, field names, descriptions, status messages, and ticket panels—not as oversized thumbnails. The bot needs **Manage Expressions** to upload them. If Discord denies emoji creation or the server reaches its emoji limit, the embeds fall back to ordinary Unicode emoji.

## Tickets

Members can open a ticket using the buttons in `#open-a-ticket` or the `/ticket type:` command. Types are General Support, Bug Report, Custom Bot Request, and Suggestion. The bot prevents a member from opening a second ticket while one is already open.

Staff can claim a ticket. The opener or staff can close it. On close, the bot saves the latest 100 messages as a text transcript in the private `#ticket-transcripts` channel, including attachment URLs, then locks the opener from sending further messages in that ticket. Discord's API limits the amount of history fetched in one request, so this transcript is the latest 100 messages, not an unlimited archive.

## Staff changes

`/staff-manage hire`, `promote`, `demote`, and `remove` require the server owner, Owner/Co-Owner/High Rank Supervisor, or HR Director/HR Manager. A change updates the member's staff role, writes a Neon audit record, updates both staff directory embeds, and posts to private `#staff-bot-updates`.

HR roles are created automatically but are intentionally not granted to anyone automatically. The CoopFT server owner should assign HR Director/HR Manager to trusted people through Discord's role manager before delegating staff management.

## Role cleanup safety

The earlier request to delete every role the bot can manage is destructive: deleting a role also removes every member's assignment to that role, and the bot cannot reconstruct all those assignments from the approved event permissions.

Therefore, the first startup makes a cleanup **preview**, stores the names/IDs/permissions of ordinary editable roles in Neon, and posts the candidate list to private `#staff-bot-updates`. It deletes nothing by default. After reviewing the list and backing up assignments, an operator may set:

```env
COOPFT_ROLE_CLEANUP_CONFIRM=DELETE_EDITABLE_ROLES
```

The one-time cleanup deletes only unmanaged roles editable by the bot, excluding `@everyone`, managed integration roles, roles named with the `CF • ` prefix, and IDs listed in `COOPFT_KEEP_ROLE_IDS`. Roles above the bot remain inaccessible to it. Do not enable this until the candidate list and server role assignments have been reviewed.

## Required bot permissions

For full setup, invite/position the bot with:

- Manage Roles
- Manage Channels
- View Channels
- Send Messages
- Read Message History
- Embed Links
- Attach Files
- Manage Expressions (for the custom emoji pack)

The bot must be higher than the roles it creates/manages and lower than protected roles. It never needs Administrator for this system.

## Deploying slash commands

Set `COOPFT_GUILD_ID` and `FUKISHOKAI_GUILD_ID` (or the legacy Fukishōkai `GUILD_ID`) in the host environment, then run `npm run deploy-commands`. By default, the deploy script registers each persona's commands only in its own server and clears the global command set. To deploy one server for a test, set `DEPLOY_GUILD_ID` to that server's ID.

Neon remains the only database. The migration `0001_coopft_community.sql` adds isolated CoopFT tables; it does not alter existing player economy tables or wipe data.
