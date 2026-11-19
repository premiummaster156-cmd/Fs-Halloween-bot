"use strict";

const { PermissionFlagsBits } = require("discord.js");

function permissionSet(...names) {
  return names.reduce((bits, name) => {
    const permission = PermissionFlagsBits[name];
    if (typeof permission !== "bigint") {
      throw new Error("Unknown Discord permission flag: " + name);
    }
    return bits | permission;
  }, 0n);
}

// Owner and Co-Owner intentionally receive the complete Discord permission set,
// including Administrator. High Rank Supervisor receives everything except the
// three explicitly reserved permissions.
const ALL_PERMISSION_BITS = [...new Set(Object.values(PermissionFlagsBits))]
  .reduce((all, permission) => all | permission, 0n);
const OWNER_PERMISSIONS = ALL_PERMISSION_BITS;
const HIGH_RANK_SUPERVISOR_PERMISSIONS = ALL_PERMISSION_BITS & ~(
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.ManageChannels
);

// The official 17-rank staff hierarchy. Only the two moderation ranks and Developer specialist track below
// the leadership appointment tier are available through the public application panel.
const STAFF_RANKS = Object.freeze([
  { key: "owner", name: "Owner", icon: "👑", emoji: "cf3d_crown", primary: 0x7A101C, secondary: 0xE13D4B, permissions: OWNER_PERMISSIONS, permissionSummary: "Every Discord permission, including Administrator.", description: "Leads CoopFT, sets the community direction, makes final decisions, and protects the long-term vision." },
  { key: "co_owner", name: "Co-Owner", icon: "🛡️", emoji: "cf3d_shield", primary: 0x7E2732, secondary: 0xC84B60, permissions: OWNER_PERMISSIONS, permissionSummary: "Every Discord permission, including Administrator.", description: "Supports the Owner, coordinates major operations, and keeps the community running smoothly." },
  { key: "monarch", name: "Monarch", icon: "♛", emoji: "cf3d_crown", primary: 0x55515B, secondary: 0xAAA2B5, permissions: HIGH_RANK_SUPERVISOR_PERMISSIONS, permissionSummary: "Senior leadership permissions, excluding Administrator, Manage Server and Manage Channels.", description: "Provides senior oversight and coordinates high-level community decisions." },
  { key: "high_rank_supervisor", name: "High Rank Lead", legacyNames: ["High Chancellor", "High Rank Supervisor", "High Command", "CF • High Chancellor", "CF • High Rank Supervisor", "CF • High Command"], icon: "🐉", emoji: "cf3d_dragon", primary: 0x2563EB, secondary: 0x60A5FA, permissions: HIGH_RANK_SUPERVISOR_PERMISSIONS, permissionSummary: "All Discord permissions except Administrator, Manage Server and Manage Channels.", description: "Sets leadership direction, resolves senior escalations, and keeps CoopFT teams aligned." },
  { key: "apex", name: "Project Lead", legacyNames: ["Vanguard", "Apex", "CF • Vanguard", "CF • Apex"], icon: "❄️", emoji: "cf3d_ice", primary: 0x7C3AED, secondary: 0xC4B5FD, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog", "ManageThreads", "ManageEvents", "ManageNicknames"), permissionSummary: "Can kick members, timeout members, moderate messages, review audit logs, manage threads and events, and manage nicknames.", description: "Leads high-impact initiatives and coordinates cross-team execution." },
  { key: "right_wing", name: "Right Wing", icon: "🗡️", emoji: "cf3d_war", primary: 0xA67821, secondary: 0xF3D17A, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog"), permissionSummary: "Can kick and timeout members, moderate messages and review audit logs.", description: "Supports leadership with operational oversight and member-safety decisions." },
  { key: "left_wing", name: "Left Wing", icon: "🗡️", emoji: "cf3d_referee", primary: 0x813E9B, secondary: 0xD49AEF, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog"), permissionSummary: "Can kick and timeout members, moderate messages and review audit logs.", description: "Supports leadership with operational oversight and consistent policy enforcement." },
  { key: "halo", name: "Support Lead", legacyNames: ["Sentinel", "Halo", "CF • Sentinel", "CF • Halo"], icon: "🏆", emoji: "cf3d_star", primary: 0x0891B2, secondary: 0x67E8F9, permissions: permissionSet("ModerateMembers", "ManageMessages", "ManageThreads", "ViewAuditLog"), permissionSummary: "Can timeout members, moderate messages, manage threads and review audit logs.", description: "Protects community standards and supports leadership with sensitive escalations." },
  { key: "overseer", name: "Overseer", icon: "🔱", emoji: "cf3d_butterfly", primary: 0x302E91, secondary: 0x7773E8, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog", "ManageThreads"), permissionSummary: "Can kick and timeout members, moderate messages, review audit logs and manage threads.", description: "Monitors team performance, supports supervisors, and resolves complicated operational issues." },
  { key: "staff_supervisor", name: "Staff Manager", legacyNames: ["Operations Director", "Staff Supervisor", "Operations Lead", "CF • Operations Director", "CF • Staff Supervisor", "CF • Operations Lead"], icon: "🔥", emoji: "cf3d_flame", primary: 0xEA580C, secondary: 0xFDBA74, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ManageThreads"), permissionSummary: "Can kick and timeout members, moderate messages and manage threads.", description: "Directs daily operations, reviews team performance, and keeps staff execution consistent." },
  { key: "supreme_council", name: "Senior Council", legacyNames: ["Executive Council", "Supreme Council", "CF • Executive Council", "CF • Supreme Council"], icon: "🦚", emoji: "cf3d_gem", primary: 0xBE185D, secondary: 0xF9A8D4, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages"), permissionSummary: "Can kick and timeout members and moderate messages.", description: "Reviews major community decisions and advises the senior leadership team." },
  { key: "senate", name: "Team Council", legacyNames: ["Strategic Council", "Senate", "CF • Strategic Council", "CF • Senate"], icon: "⚖️", emoji: "cf3d_scroll", primary: 0x0F766E, secondary: 0x5EEAD4, permissions: permissionSet("ModerateMembers", "ManageMessages", "ManageThreads"), permissionSummary: "Can timeout members, moderate messages and manage threads.", description: "Coordinates long-term planning, policy direction, and cross-team priorities." },
  { key: "council", name: "Council", icon: "⚔️", emoji: "cf3d_shield", primary: 0xB45309, secondary: 0xFCD34D, permissions: permissionSet("ModerateMembers", "ManageMessages"), permissionSummary: "Can timeout members and moderate messages.", description: "Provides governance, reviews operational decisions, and advises CoopFT leadership." },
  { key: "head_moderator", name: "Head Moderator", icon: "🔨", emoji: "cf3d_gear", primary: 0xA32B48, secondary: 0xF06B83, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog"), permissionSummary: "Can kick and timeout members, moderate messages and review audit logs.", description: "Leads moderation operations, reviews difficult cases, and supports the moderation team." },
  { key: "senior_moderator", name: "Senior Moderator", icon: "🌟", emoji: "cf3d_spark", primary: 0xD3A33B, secondary: 0xF5D77C, permissions: permissionSet("ModerateMembers", "ManageMessages", "ManageThreads"), permissionSummary: "Can timeout members, moderate messages and manage threads.", description: "Handles escalated reports, mentors moderators, and applies server rules consistently." },
  { key: "moderator", name: "Moderator", icon: "🔱", emoji: "cf3d_flame", primary: 0xA52A20, secondary: 0xE45A48, permissions: permissionSet("ModerateMembers", "ManageMessages"), permissionSummary: "Can timeout members and moderate messages.", description: "Keeps conversations safe and welcoming, responds to reports, and documents moderation actions." },
  { key: "junior_moderator", name: "Junior Moderator", icon: "🌿", emoji: "cf3d_leaf", primary: 0x269B69, secondary: 0x76D8A7, permissions: permissionSet("ManageMessages", "CreatePublicThreads"), permissionSummary: "Can moderate messages and create public threads; cannot kick or timeout members.", description: "Learns the moderation process, assists members, and handles approved entry-level duties." },
]);

// Recruitment is limited to two moderation entry points and one specialist
// Developer track for commissioned custom Discord bots.
const OWNER_RANK_KEYS = new Set(["owner", "co_owner", "monarch"]);
const APPLICATION_RANKS = Object.freeze([
  { ...STAFF_RANKS.find((role) => role.key === "junior_moderator"), category: "staff", roleKey: "junior_moderator" },
  { ...STAFF_RANKS.find((role) => role.key === "moderator"), category: "staff", roleKey: "moderator" },
  {
    key: "developer", roleKey: "developer_member", category: "developer",
    name: "Developer", icon: "💻", emoji: "cf3d_developer",
    primary: 0x397C94, secondary: 0x73C2D7, permissions: 0n,
    permissionSummary: "No moderation or administrative permissions.",
    description: "Builds and maintains custom Discord bots commissioned by CoopFT members."
  }
]);

const EMOJI_SPRITE = Object.freeze([
  "cf3d_crown", "cf3d_shield", "cf3d_star", "cf3d_gem",
  "cf3d_butterfly", "cf3d_leaf", "cf3d_flame", "cf3d_ice",
  "cf3d_key", "cf3d_ticket", "cf3d_scroll", "cf3d_headset",
  "cf3d_gear", "cf3d_bell", "cf3d_handshake", "cf3d_spark",
  "cf3d_war", "cf3d_referee", "cf3d_observer", "cf3d_helper",
  "cf3d_applications", "cf3d_rolebook", "cf3d_rules", "cf3d_announce",
  "cf3d_voice", "cf3d_idea", "cf3d_ticket_staff", "cf3d_community",
  "cf3d_owner_crest", "cf3d_high_rank", "cf3d_low_rank", "cf3d_mod_rank",
  "cf3d_bots", "cf3d_member", "cf3d_vip", "cf3d_verified",
  "cf3d_contributor", "cf3d_creator", "cf3d_developer", "cf3d_artist",
  "cf3d_gaming", "cf3d_programming", "cf3d_music", "cf3d_anime",
  "cf3d_design", "cf3d_announcement_ping", "cf3d_event_ping", "cf3d_giveaway_ping",
  "cf3d_updates_ping", "cf3d_role_select"
]);
const ROLE_BRACKETS = Object.freeze([
  { key: "owner_rank", name: "━━━━━━〔 OWNER RANK 〕━━━━━━", emoji: "cf3d_owner_crest", icon: "👑", primary: 0x8C2635, secondary: 0xD84A57, permissions: 0n, hoist: false },
  { key: "high_rank", name: "━━━━━━〔 LEADERSHIP 〕━━━━━━", legacyNames: ["━━━━━━〔 HIGH RANK 〕━━━━━━", "━━━━━━〔 MANAGEMENT 〕━━━━━━"], emoji: "cf3d_high_rank", icon: "🐉", primary: 0x2769A6, secondary: 0x65B4E5, permissions: 0n, hoist: false },
  { key: "low_rank", name: "━━━━━━〔 OPERATIONS 〕━━━━━━", legacyNames: ["━━━━━━〔 LOW RANK 〕━━━━━━", "━━━━━━〔 SUPPORT TEAM 〕━━━━━━"], emoji: "cf3d_low_rank", icon: "⚖️", primary: 0x287E8C, secondary: 0x62C8D2, permissions: 0n, hoist: false },
  { key: "mod_roles", name: "━━━━━━〔 MOD ROLES 〕━━━━━━", emoji: "cf3d_mod_rank", icon: "⚔️", primary: 0x693E9C, secondary: 0xA786D8, permissions: 0n, hoist: false },
  // This divider is intentionally never assigned. Only the empty bracket itself has Administrator.
  { key: "bots", name: "━━━━━━〔 BOTS 〕━━━━━━", emoji: "cf3d_bots", icon: "🤖", primary: 0x596575, secondary: 0x9BA8BA, permissions: PermissionFlagsBits.Administrator, hoist: false },
  { key: "member_roles", name: "━━━━━━〔 MEMBER ROLES 〕━━━━━━", emoji: "cf3d_member", icon: "👥", primary: 0x487B91, secondary: 0x83B6C9, permissions: 0n, hoist: false },
  { key: "interest_roles", name: "━━━━━━〔 INTERESTS 〕━━━━━━", emoji: "cf3d_role_select", icon: "🎯", primary: 0x5676A7, secondary: 0x8DADE0, permissions: 0n, hoist: false },
  { key: "ping_roles", name: "━━━━━━〔 PING ROLES 〕━━━━━━", emoji: "cf3d_announcement_ping", icon: "📣", primary: 0xA16B36, secondary: 0xE5B36E, permissions: 0n, hoist: false }
]);
const BOT_ROLES = Object.freeze([{ key: "bot_coopft_assistant", name: "CoopFT Assistant", emoji: "cf3d_bots", icon: "🤖", primary: 0x63738A, secondary: 0x9DAFC7, permissions: 0n, hoist: false, mentionable: false }]);
const MEMBER_ROLES = Object.freeze([
  { key: "community_member", name: "Community Member", emoji: "cf3d_member", icon: "👤", primary: 0x527D9D, secondary: 0x8CB6D2, permissions: 0n, hoist: false },
  { key: "verified_member", name: "Verified", emoji: "cf3d_verified", icon: "✅", primary: 0x3184B8, secondary: 0x78C9F1, permissions: 0n, hoist: false },
  { key: "vip_member", name: "VIP", emoji: "cf3d_vip", icon: "💎", primary: 0xB88B37, secondary: 0xF1D07A, permissions: 0n, hoist: false },
  { key: "contributor_member", name: "Contributor", emoji: "cf3d_contributor", icon: "🤝", primary: 0x7A58A5, secondary: 0xB79BDF, permissions: 0n, hoist: false },
  { key: "event_winner", name: "Event Winner", emoji: "cf3d_star", icon: "🏆", primary: 0xB57C2E, secondary: 0xE8BE64, permissions: 0n, hoist: false },
  { key: "content_creator", name: "Content Creator", emoji: "cf3d_creator", icon: "🎨", primary: 0xA35D77, secondary: 0xE4A3BC, permissions: 0n, hoist: false },
  { key: "developer_member", name: "Developer", emoji: "cf3d_developer", icon: "💻", primary: 0x397C94, secondary: 0x73C2D7, permissions: 0n, hoist: false },
  { key: "artist_member", name: "Artist", emoji: "cf3d_artist", icon: "🖌️", primary: 0x8E5BA5, secondary: 0xC69DE0, permissions: 0n, hoist: false }
]);
const INTEREST_ROLES = Object.freeze([
  { key: "interest_gaming", name: "Gaming", emoji: "cf3d_roleimg_gaming", icon: "🎮", primary: 0x5274A8, secondary: 0x8BAEEA, permissions: 0n, hoist: false },
  { key: "interest_programming", name: "Programming", emoji: "cf3d_roleimg_programming", icon: "💻", primary: 0x367D88, secondary: 0x76C6D0, permissions: 0n, hoist: false },
  { key: "interest_art", name: "Art & Design", emoji: "cf3d_roleimg_art", icon: "🎨", primary: 0x925FA5, secondary: 0xCEA2E1, permissions: 0n, hoist: false },
  { key: "interest_music", name: "Music", emoji: "cf3d_roleimg_music", icon: "🎵", primary: 0xA45D83, secondary: 0xE29DC0, permissions: 0n, hoist: false },
  { key: "interest_anime", name: "Anime", emoji: "cf3d_roleimg_anime", icon: "🌸", primary: 0xB45E83, secondary: 0xEDA8C3, permissions: 0n, hoist: false },
  { key: "interest_technology", name: "Technology", emoji: "cf3d_roleimg_technology", icon: "⚙️", primary: 0x4A718F, secondary: 0x91B7D4, permissions: 0n, hoist: false },
  { key: "interest_voice", name: "Voice Chat", emoji: "cf3d_roleimg_voice_chat", icon: "🎙️", primary: 0x39868C, secondary: 0x7FD1CE, permissions: 0n, hoist: false },
  { key: "interest_events", name: "Community Events", emoji: "cf3d_roleimg_community_events", icon: "🎟️", primary: 0xA87838, secondary: 0xE6BA6E, permissions: 0n, hoist: false }
]);
const PING_ROLES = Object.freeze([
  { key: "ping_announcements", name: "Announcements Ping", emoji: "cf3d_roleimg_announcements", icon: "📢", primary: 0xA24C43, secondary: 0xE18B7B, permissions: 0n, mentionable: false, hoist: false },
  { key: "ping_events", name: "Events Ping", emoji: "cf3d_roleimg_events", icon: "📅", primary: 0xA87936, secondary: 0xE8BA68, permissions: 0n, mentionable: false, hoist: false },
  { key: "ping_giveaways", name: "Giveaways Ping", emoji: "cf3d_roleimg_giveaways", icon: "🎁", primary: 0x94713B, secondary: 0xD7B56C, permissions: 0n, mentionable: false, hoist: false },
  { key: "ping_community", name: "Community Updates Ping", emoji: "cf3d_roleimg_community", icon: "🔔", primary: 0x477C82, secondary: 0x81C8C0, permissions: 0n, mentionable: false, hoist: false },
  { key: "ping_game_nights", name: "Game Nights Ping", emoji: "cf3d_roleimg_game_nights", icon: "🎮", primary: 0x4F62A3, secondary: 0x909DE7, permissions: 0n, mentionable: false, hoist: false },
  { key: "ping_bot_updates", name: "Bot Updates Ping", emoji: "cf3d_roleimg_bot_updates", icon: "🤖", primary: 0x596575, secondary: 0xA3B1C5, permissions: 0n, mentionable: false, hoist: false },
  { key: "ping_lfg", name: "Looking for Group Ping", emoji: "cf3d_roleimg_lfg", icon: "⚔️", primary: 0x526E99, secondary: 0x90B2E0, permissions: 0n, mentionable: false, hoist: false },
  { key: "ping_voice", name: "Voice Activities Ping", emoji: "cf3d_roleimg_voice", icon: "🎙️", primary: 0x39868C, secondary: 0x7FD1CE, permissions: 0n, mentionable: false, hoist: false },
  { key: "ping_free_bot_releases", name: "Free Bot Releases Ping", emoji: "cf3d_bell", icon: "📦", primary: 0x397C94, secondary: 0x73C2D7, permissions: 0n, mentionable: false, hoist: false }
]);
const ROLE_IMAGE_ICONS = Object.freeze([
  { roleKey: "ping_announcements", emoji: "cf3d_roleimg_announcements", slot: 0 },
  { roleKey: "ping_events", emoji: "cf3d_roleimg_events", slot: 1 },
  { roleKey: "ping_giveaways", emoji: "cf3d_roleimg_giveaways", slot: 2 },
  { roleKey: "ping_community", emoji: "cf3d_roleimg_community", slot: 3 },
  { roleKey: "ping_game_nights", emoji: "cf3d_roleimg_game_nights", slot: 4 },
  { roleKey: "ping_bot_updates", emoji: "cf3d_roleimg_bot_updates", slot: 5 },
  { roleKey: "ping_lfg", emoji: "cf3d_roleimg_lfg", slot: 6 },
  { roleKey: "ping_voice", emoji: "cf3d_roleimg_voice", slot: 7 },
  { roleKey: "interest_gaming", emoji: "cf3d_roleimg_gaming", slot: 8 },
  { roleKey: "interest_programming", emoji: "cf3d_roleimg_programming", slot: 9 },
  { roleKey: "interest_art", emoji: "cf3d_roleimg_art", slot: 10 },
  { roleKey: "interest_music", emoji: "cf3d_roleimg_music", slot: 11 },
  { roleKey: "interest_anime", emoji: "cf3d_roleimg_anime", slot: 12 },
  { roleKey: "interest_technology", emoji: "cf3d_roleimg_technology", slot: 13 },
  { roleKey: "interest_voice", emoji: "cf3d_roleimg_voice_chat", slot: 14 },
  { roleKey: "interest_events", emoji: "cf3d_roleimg_community_events", slot: 15 }
]);

const ROLE_LAYOUT = Object.freeze([
  { bracket: "owner_rank", roles: ["owner", "co_owner", "monarch"] },
  { bracket: "high_rank", roles: ["high_rank_supervisor", "apex", "right_wing", "left_wing", "halo", "overseer"] },
  { bracket: "low_rank", roles: ["staff_supervisor", "supreme_council", "senate", "council"] },
  { bracket: "mod_roles", roles: ["head_moderator", "senior_moderator", "moderator", "junior_moderator"] },
  { bracket: "member_roles", roles: MEMBER_ROLES.map((role) => role.key) },
  { bracket: "interest_roles", roles: INTEREST_ROLES.map((role) => role.key) },
  { bracket: "ping_roles", roles: PING_ROLES.map((role) => role.key) },
  { bracket: "bots", roles: BOT_ROLES.map((role) => role.key) }
]);

const CATEGORY_NAMES = Object.freeze({
  start_here: "╭────〔 START HERE 〕────╮",
  community: "╭────〔 COMMUNITY 〕────╮",
  services: "╭────〔 MEMBER SERVICES 〕────╮",
  staff_hq: "╭────〔 STAFF OPERATIONS 〕────╮",
  tickets: "╭────〔 SUPPORT DESK 〕────╮"
});

const PUBLIC_CHANNELS = Object.freeze([
  { key: "welcome", name: "⌖・welcome" },
  { key: "rules", name: "§・rules" },
  { key: "announcements", name: "▰・announcements", channelType: "announcement", fallbackChannelType: "text" },
  { key: "introductions", name: "◌・introductions" },
  { key: "general", name: "◈・general" },
  { key: "media", name: "▧・media" },
  { key: "showcase", name: "◇・showcase" },
  { key: "your_creation", name: "⟡・your-creation" },
  { key: "announcement_stage", name: "∿・announcements-live", channelType: "stage", fallbackChannelType: "voice" },
  { key: "community_voice", name: "∿・community-voice", channelType: "voice" },
  { key: "event_voice", name: "∿・events-voice", channelType: "voice" },
  { key: "open_ticket", name: "▣・open-a-ticket" },
  { key: "applications", name: "⌑・applications" },
  { key: "role_selection", name: "☷・choose-roles" },
  { key: "bot_updates", name: "⌘・bot-updates" },
  { key: "suggestions", name: "⌁・suggestions" },
  { key: "bug_reports", name: "⌬・bug-reports" },
  { key: "custom_bot_requests", name: "⌘・custom-bot-requests" },
  { key: "free_bot_releases", name: "▣・free-bot-releases" }
]);

const PRIVATE_CHANNELS = Object.freeze([
  { key: "staff_directory", name: "⌖・staff-directory" },
  { key: "staff_chat", name: "◌・staff-chat" },
  { key: "staff_announcements", name: "▰・staff-announcements" },
  { key: "staff_bot_updates", name: "⌘・staff-bot-updates" },
  { key: "application_review", name: "⌑・application-review" },
  { key: "application_control", name: "⌑・application-control" },
  { key: "staff_guide", name: "▤・staff-guide" },
  { key: "ticket_transcripts", name: "▤・ticket-transcripts" },
  { key: "member_logs", name: "⌁・member-logs" },
  { key: "server_logs", name: "⌁・server-logs" }
]);

module.exports = {
  STAFF_RANKS, APPLICATION_RANKS, OWNER_RANK_KEYS, EMOJI_SPRITE, ROLE_BRACKETS, BOT_ROLES, MEMBER_ROLES, INTEREST_ROLES, PING_ROLES, ROLE_IMAGE_ICONS, ROLE_LAYOUT,
  CATEGORY_NAMES, PUBLIC_CHANNELS, PRIVATE_CHANNELS, OWNER_PERMISSIONS, HIGH_RANK_SUPERVISOR_PERMISSIONS, ALL_PERMISSION_BITS
};
