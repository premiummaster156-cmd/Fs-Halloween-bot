# CoopFT server system

CoopFT and Fukishōkai use the same Discord application connection but remain separate server personas. CoopFT's fixed server ID is `1498271944456540210`. CoopFT uses its own role hierarchy, channels, staff review workflow, branding, database tables and slash-command set. Fukishōkai's economy, player data, games, boosts and security workflows remain in the Fukishōkai persona.

## Setup

Normal bot startup is `npm start`. It does not create or repair CoopFT channels or roles.

For first setup or an intentional repair, deploy the latest `main` branch and run this from the hosting console:

```sh
npm run coopft:setup
```

The setup applies only numbered `*_coopft_*.sql` migrations, fetches only the fixed CoopFT guild, creates or repairs CoopFT resources, publishes the rules and other maintained embeds, refreshes the staff directory, and then closes its temporary Discord client and database pool. Keep `DISCORD_TOKEN`, `DATABASE_URL` and the matching `COOPFT_GUILD_ID` configured. Do not put `npm run coopft:setup` in the normal Start Command.

After deploying a release that changes the slash-command set, run:

```sh
npm run deploy-commands
```

This refreshes both persona-specific slash-command registrations. It does not create channels or roles. CoopFT exposes only `/staff`; the previous HR, manual hiring, application-admin, standalone ticket and in-server setup commands have been removed. Public applications, private review buttons and the ticket panel are operated through their messages.

## Staff hierarchy and applications

CoopFT has one official 17-rank hierarchy, displayed in four groups:

**Owner Rank:** Owner, Co-Owner, Monarch.

**High Rank:** High Rank Supervisor, Apex, Right Wing, Left Wing, Halo, Overseer.

**Low Rank:** Staff Supervisor, Supreme Council, Senate, Head Moderator.

**Mod Rank:** Council, Senior Moderator, Moderator, Junior Moderator.

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

The `staff-team` and `staff-directory` messages use one maintained directory embed with four clearly separated rank groups and a custom CoopFT banner. The same directory is available through the `/staff` command. It refreshes when staff roles change through the bot's approved audit flow or when a staff member leaves.

The public `rules` channel receives the CoopFT community code embed. Setup first attempts to publish the branded version with its generated artwork; if the artwork attachment fails, it retries with a text-only rules embed. If the rules embed itself cannot be published, setup fails rather than reporting a completed setup.

The `role-explanations` channel contains the 17-rank staff permission guide. Welcome, introductions, announcements, suggestions and bot-updates also receive maintained information embeds.

## Channels and tickets

The layout includes START HERE, COMMUNITY, MEMBER SERVICES, STAFF OPERATIONS and SUPPORT DESK categories. Category names and text-channel names use restrained Unicode typography; channel names do not use emoji decorations.

Members open tickets from the buttons in `open-a-ticket`. Ticket types are General Support, Bug Report, Custom Bot Request and Suggestion. The system prevents duplicate open tickets, creates a private channel, supports claiming and closing, and archives a transcript to `ticket-transcripts`.

Staff-only channels include `staff-team`, `staff-chat`, `staff-announcements`, `staff-bot-updates`, `application-review`, `ticket-transcripts`, `member-logs` and `server-logs`.

## Permissions and safety

The setup requires the bot to have Administrator, Manage Roles, Manage Channels, View Channel, Send Messages, Embed Links, Read Message History, Attach Files and View Audit Log in CoopFT. Administrator is needed because Owner and Co-Owner are configured with Administrator. The bot's highest role must be above the CoopFT-managed staff roles.

The setup checks its fixed CoopFT guild ID before resource mutations. CoopFT migrations do not load the Fukishōkai schema or alter player tables. The application and directory services use only CoopFT guild IDs.

The old general role-cleanup option remains separate from legacy CoopFT role retirement. The optional cleanup is preview-only unless `COOPFT_ROLE_CLEANUP_CONFIRM=DELETE_EDITABLE_ROLES` is explicitly configured. Review the candidate list and member role assignments before enabling it.

## Database migrations

The CoopFT-only migration sequence is:

- `0001_coopft_community.sql` — community settings, staff records, audits and tickets.
- `0002_coopft_applications.sql` — application records and review state.
- `0003_coopft_application_notifications.sql` — legacy application-notification table, created only for upgrade compatibility.
- `0004_coopft_staff_applications.sql` — expands application choices to operational staff ranks, withdraws pending applications for retired positions, and drops the unused notification-subscription table.

The migrations use the shared schema-migration ledger but never load the main Fukishōkai schema or modify player-economy tables.
