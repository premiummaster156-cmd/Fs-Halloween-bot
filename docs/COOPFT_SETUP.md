# CoopFT server system

CoopFT and Fukishōkai use the same Discord application connection but remain separate server personas. CoopFT's fixed server ID is `1498271944456540210`. CoopFT uses its own role hierarchy, channels, staff review workflow, branding, database tables and slash-command set. Fukishōkai's economy, player data, games, boosts and security workflows remain in the Fukishōkai persona.

## Setup

Normal bot startup is `npm start`. It does not create or repair CoopFT channels or roles.

For first setup or an intentional repair, deploy the latest `main` branch and run this from the hosting console:

```sh
npm run coopft:setup
```

The setup applies only numbered `*_coopft_*.sql` migrations, fetches only the fixed CoopFT guild, creates or repairs its 50-emoji pack, bracket roles, staff/member/ping roles, channels and interactive panels, publishes the consolidated rules embed and staff directory, removes obsolete saved informational posts, and then closes its temporary Discord client and database pool. Keep `DISCORD_TOKEN`, `DATABASE_URL` and the matching `COOPFT_GUILD_ID` configured. Do not put `npm run coopft:setup` in the normal Start Command.

After deploying a release that changes the slash-command set, run:

```sh
npm run deploy-commands
```

This refreshes both persona-specific slash-command registrations. It does not create channels or roles. CoopFT exposes 50 server-operations slash commands covering information, announcements, polls, events, moderation, staff notes, roles, channels, tickets, applications and suggestions. The Fukishōkai economy and gameplay command set is never registered in CoopFT. The obsolete `/staff` directory command has been removed; the maintained staff directory is published in the staff channels.

## Staff hierarchy and applications

CoopFT has one official 17-rank hierarchy, displayed in four bracket groups:

**Owner Rank:** Owner, Co-Owner, Monarch.

**High Rank:** High Rank Supervisor, Apex, Right Wing, Left Wing, Halo, Overseer.

**Low Rank:** Staff Supervisor, Supreme Council, Senate, Head Moderator.

**Mod Roles:** Council, Senior Moderator, Moderator, Junior Moderator.

The setup creates a divider role above each group and positions the individual ranks immediately below the matching divider. Divider roles have no members and no permissions. The separate **Bots** divider is configured with Administrator permission to match the requested layout, but it is deliberately left unassigned. The bot receives a separate non-administrator `CoopFT Assistant` marker role beneath that divider. Never assign the empty Bots divider to a person or bot.

The setup creates and repairs only those staff roles. The former HR roles and specialist roles are retired when the role ID is still saved in CoopFT settings and its current name still matches the original managed name. Roles that are managed by an integration, above the bot, or renamed so ownership cannot be verified are left untouched. No broad role deletion is performed by this retirement pass.

The public `applications` panel offers these eight operational ranks: Staff Supervisor, Supreme Council, Senate, Head Moderator, Council, Senior Moderator, Moderator and Junior Moderator. Leadership and high-rank appointments are reserved for direct leadership selection.

A member selects one rank and completes a private application form. The application is saved in Neon and sent to the private `application-review` channel, where designated leadership can review the answers with exactly four options:

- **Accept** — accept and assign the requested staff rank.
- **Accept with reason** — accept, assign the requested staff rank and include reviewer feedback.
- **Deny** — deny without assigning any staff rank.
- **Deny with reason** — deny without assigning a staff rank and include reviewer feedback.

The review message is updated with the final decision. The applicant is sent a private decision summary by DM, including the selected rank, reviewer and any supplied reason. A member can have only one pending application for the same rank.

Only the server owner and designated senior staff ranks (Owner, Co-Owner, Monarch and High Rank Supervisor) can review applications. The application-review channel's overwrites are synchronized to the same reviewer group.

## Staff directory and rules

The `staff-team` channel contains one maintained staff-directory embed, not a separate banner embed or a duplicate directory post in another channel. Its custom 1200×360 banner is attached to the same embed as its thumbnail. Four clear sections—Owner Rank, High Rank, Low Rank and Mod Roles—use distinct custom icons and matching role names. The directory refreshes when staff roles change through the bot's approved audit flow or when a staff member leaves.

The public `rules` channel receives one concise community-code embed with a wide branded banner, six readable rule sections and a restrained red/charcoal visual theme. If the optional banner attachment fails, setup retries with the text-only version. If the rules post itself cannot be published, setup fails rather than reporting completion.

The redundant `role-explanations` channel is retired. Previously saved bot-authored information posts in welcome, introductions, announcements, suggestions and bot-updates are removed so those channels remain available for real conversations. The only persistent public information panels are the rules, application, ticket and role-selection panels.

## Channels and tickets

The layout includes START HERE, COMMUNITY, MEMBER SERVICES, STAFF OPERATIONS and SUPPORT DESK categories. `choose-roles` is the public role-selection channel. Category names and text-channel names use restrained Unicode typography.

Members open tickets from the service selector in `open-a-ticket`. They first choose **Fukishōkai Economy Bot** or **CoopFT Server**, then choose a relevant request type such as bot bug, gameplay issue, account support, exploit report, server bug, server suggestion, member report, staff concern or partnership. A guided form asks the relevant questions before creating the ticket. The bot posts every submitted answer in the private ticket, prevents duplicate open tickets, supports claiming and closing, and archives a transcript to `ticket-transcripts`.

Staff-only channels include `staff-team`, `staff-chat`, `staff-announcements`, `staff-bot-updates`, `application-review`, `ticket-transcripts`, `member-logs` and `server-logs`.

## Member roles and notifications

The server receives 50 named custom emojis. The original 28 names remain stable for existing embeds; 22 new purpose-specific icons cover rank brackets, member badges, interests and notifications. Custom emojis are used in role groups, the staff directory, panels and system messages. If Discord's emoji quota or permissions prevent an upload, setup records the failure and retains a readable Unicode fallback.

The **Member Roles** bracket contains leadership-managed badges such as Community Member, Verified, VIP, Contributor, Event Winner, Content Creator, Developer and Artist. New members are automatically given Community Member. VIP, verification and other status badges are not self-assignable.

The **Interests** and **Ping Roles** brackets contain self-selectable roles. In `#choose-roles`, members use four dropdowns: add interests, remove interests, subscribe to notification pings and unsubscribe from notification pings. Interests include Gaming, Programming, Art & Design, Music, Anime, Technology, Voice Chat and Community Events. Notification roles cover announcements, events, giveaways, community updates, game nights, bot updates, looking for group and voice activities. These roles are non-mentionable so members can subscribe without enabling unrestricted role pings.

## Permissions and safety

The setup requires the bot to have Administrator, Manage Roles, Manage Channels, View Channel, Send Messages, Embed Links, Read Message History, Attach Files and View Audit Log in CoopFT. Administrator is needed because Owner and Co-Owner are configured with Administrator. The bot's highest role must be above the CoopFT-managed staff roles.

The setup checks its fixed CoopFT guild ID before resource mutations. CoopFT migrations do not load the Fukishōkai schema or alter player tables. The application, role selector, audit logs and directory services use only CoopFT guild IDs.

The member log renders joins and departures with account age, join date, time in server and readable role names from the latest saved snapshot. Role-change entries distinguish roles added and removed. Server audit entries translate common channel, role, invite, webhook and moderation actions into a plain-English summary with the affected item, executor, changes and reason when Discord supplies one. Audit records are informational; they do not perform automatic moderation actions.

The old general role-cleanup option remains separate from legacy CoopFT role retirement. The optional cleanup is preview-only unless `COOPFT_ROLE_CLEANUP_CONFIRM=DELETE_EDITABLE_ROLES` is explicitly configured. Review the candidate list and member role assignments before enabling it.

## Database migrations

The CoopFT-only migration sequence is:

- `0001_coopft_community.sql` — community settings, staff records, audits and tickets.
- `0002_coopft_applications.sql` — application records and review state.
- `0003_coopft_application_notifications.sql` — legacy application-notification table, created only for upgrade compatibility.
- `0004_coopft_staff_applications.sql` — expands application choices to operational staff ranks, withdraws pending applications for retired positions, and drops the unused notification-subscription table.

The migrations use the shared schema-migration ledger but never load the main Fukishōkai schema or modify player-economy tables.
