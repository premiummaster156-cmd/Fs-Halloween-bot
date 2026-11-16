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

// The official 17-rank staff hierarchy. Only the eight operational ranks below
// the leadership appointment tier are available through the public application panel.
const STAFF_RANKS = Object.freeze([
  { key: "owner", name: "Owner", icon: "👑", emoji: "cf3d_crown", primary: 0x7A101C, secondary: 0xE13D4B, permissions: OWNER_PERMISSIONS, permissionSummary: "Every Discord permission, including Administrator.", description: "Leads CoopFT, sets the community direction, makes final decisions, and protects the long-term vision." },
  { key: "co_owner", name: "Co-Owner", icon: "🛡️", emoji: "cf3d_shield", primary: 0x7E2732, secondary: 0xC84B60, permissions: OWNER_PERMISSIONS, permissionSummary: "Every Discord permission, including Administrator.", description: "Supports the Owner, coordinates major operations, and keeps the community running smoothly." },
  { key: "monarch", name: "Monarch", icon: "♛", emoji: "cf3d_crown", primary: 0x55515B, secondary: 0xAAA2B5, permissions: HIGH_RANK_SUPERVISOR_PERMISSIONS, permissionSummary: "Senior leadership permissions, excluding Administrator, Manage Server and Manage Channels.", description: "Provides senior oversight and coordinates high-level community decisions." },
  { key: "high_rank_supervisor", name: "High Rank Supervisor", icon: "🐉", emoji: "cf3d_dragon", primary: 0x2376C9, secondary: 0x75C9F4, permissions: HIGH_RANK_SUPERVISOR_PERMISSIONS, permissionSummary: "All Discord permissions except Administrator, Manage Server and Manage Channels.", description: "Oversees senior leadership, handles escalations, and keeps teams aligned with community standards." },
  { key: "apex", name: "Apex", icon: "❄️", emoji: "cf3d_ice", primary: 0xD5A8E8, secondary: 0xF2D9FF, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog", "ManageThreads", "ManageEvents", "ManageNicknames"), permissionSummary: "Can kick members, timeout members, moderate messages, review audit logs, manage threads and events, and manage nicknames.", description: "A senior operational role trusted with high-impact projects and cross-team coordination." },
  { key: "right_wing", name: "Right Wing", icon: "🗡️", emoji: "cf3d_war", primary: 0xA67821, secondary: 0xF3D17A, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog"), permissionSummary: "Can kick and timeout members, moderate messages and review audit logs.", description: "Supports leadership with operational oversight and member-safety decisions." },
  { key: "left_wing", name: "Left Wing", icon: "🗡️", emoji: "cf3d_referee", primary: 0x813E9B, secondary: 0xD49AEF, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog"), permissionSummary: "Can kick and timeout members, moderate messages and review audit logs.", description: "Supports leadership with operational oversight and consistent policy enforcement." },
  { key: "halo", name: "Halo", icon: "🏆", emoji: "cf3d_star", primary: 0x3979B8, secondary: 0x9AD4F4, permissions: permissionSet("ModerateMembers", "ManageMessages", "ManageThreads", "ViewAuditLog"), permissionSummary: "Can timeout members, moderate messages, manage threads and review audit logs.", description: "Maintains standards across teams and assists with escalated community matters." },
  { key: "overseer", name: "Overseer", icon: "🔱", emoji: "cf3d_butterfly", primary: 0x302E91, secondary: 0x7773E8, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog", "ManageThreads"), permissionSummary: "Can kick and timeout members, moderate messages, review audit logs and manage threads.", description: "Monitors team performance, supports supervisors, and resolves complicated operational issues." },
  { key: "staff_supervisor", name: "Staff Supervisor", icon: "🔥", emoji: "cf3d_flame", primary: 0xA32B23, secondary: 0xF46C5C, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ManageThreads"), permissionSummary: "Can kick and timeout members, moderate messages and manage threads.", description: "Guides day-to-day staff work, checks consistency, and helps teammates improve." },
  { key: "supreme_council", name: "Supreme Council", icon: "🦚", emoji: "cf3d_gem", primary: 0x8A37A8, secondary: 0xD48AEF, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages"), permissionSummary: "Can kick and timeout members and moderate messages.", description: "Reviews important community matters and advises senior staff." },
  { key: "senate", name: "Senate", icon: "⚖️", emoji: "cf3d_scroll", primary: 0x208A9B, secondary: 0x73D6E1, permissions: permissionSet("ModerateMembers", "ManageMessages", "ManageThreads"), permissionSummary: "Can timeout members, moderate messages and manage threads.", description: "Supports policy discussions, staff coordination and fair decision-making." },
  { key: "head_moderator", name: "Head Moderator", icon: "🔨", emoji: "cf3d_gear", primary: 0xA32B48, secondary: 0xF06B83, permissions: permissionSet("KickMembers", "ModerateMembers", "ManageMessages", "ViewAuditLog"), permissionSummary: "Can kick and timeout members, moderate messages and review audit logs.", description: "Leads moderation operations, reviews difficult cases, and supports the moderation team." },
  { key: "council", name: "Council", icon: "⚔️", emoji: "cf3d_shield", primary: 0x5542A5, secondary: 0x9B8CEB, permissions: permissionSet("ModerateMembers", "ManageMessages"), permissionSummary: "Can timeout members and moderate messages.", description: "Provides moderation support and helps maintain consistent community standards." },
  { key: "senior_moderator", name: "Senior Moderator", icon: "🌟", emoji: "cf3d_spark", primary: 0xD3A33B, secondary: 0xF5D77C, permissions: permissionSet("ModerateMembers", "ManageMessages", "ManageThreads"), permissionSummary: "Can timeout members, moderate messages and manage threads.", description: "Handles escalated reports, mentors moderators, and applies server rules consistently." },
  { key: "moderator", name: "Moderator", icon: "🔱", emoji: "cf3d_flame", primary: 0xA52A20, secondary: 0xE45A48, permissions: permissionSet("ModerateMembers", "ManageMessages"), permissionSummary: "Can timeout members and moderate messages.", description: "Keeps conversations safe and welcoming, responds to reports, and documents moderation actions." },
  { key: "junior_moderator", name: "Junior Moderator", icon: "🌿", emoji: "cf3d_leaf", primary: 0x269B69, secondary: 0x76D8A7, permissions: permissionSet("ManageMessages", "CreatePublicThreads"), permissionSummary: "Can moderate messages and create public threads; cannot kick or timeout members.", description: "Learns the moderation process, assists members, and handles approved entry-level duties." }
]);

// Applications are limited to operational staff ranks. Executive and high-rank
// appointments remain leadership decisions and cannot be self-applied for.
const APPLICATION_RANK_KEYS = new Set([
  "staff_supervisor", "supreme_council", "senate", "head_moderator",
  "council", "senior_moderator", "moderator", "junior_moderator"
]);
const APPLICATION_RANKS = Object.freeze(
  STAFF_RANKS.filter((role) => APPLICATION_RANK_KEYS.has(role.key))
);

const EMOJI_SPRITE = Object.freeze([
  "cf3d_crown", "cf3d_shield", "cf3d_star", "cf3d_gem",
  "cf3d_butterfly", "cf3d_leaf", "cf3d_flame", "cf3d_ice",
  "cf3d_key", "cf3d_ticket", "cf3d_scroll", "cf3d_headset",
  "cf3d_gear", "cf3d_bell", "cf3d_handshake", "cf3d_spark",
  "cf3d_war", "cf3d_referee", "cf3d_observer", "cf3d_helper",
  "cf3d_applications", "cf3d_rolebook", "cf3d_rules", "cf3d_announce",
  "cf3d_voice", "cf3d_idea", "cf3d_ticket_staff", "cf3d_community"
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
  { key: "bot_updates", name: "⌘・bot-updates" },
  { key: "suggestions", name: "⌁・suggestions" },
  { key: "bug_reports", name: "⌬・bug-reports" },
  { key: "custom_bot_requests", name: "⌘・custom-bot-requests" }
]);

const PRIVATE_CHANNELS = Object.freeze([
  { key: "staff_team", name: "⌖・staff-team" },
  { key: "staff_chat", name: "◌・staff-chat" },
  { key: "staff_announcements", name: "▰・staff-announcements" },
  { key: "staff_bot_updates", name: "⌘・staff-bot-updates" },
  { key: "application_review", name: "⌑・application-review" },
  { key: "ticket_transcripts", name: "▤・ticket-transcripts" },
  { key: "member_logs", name: "⌁・member-logs" },
  { key: "server_logs", name: "⌁・server-logs" }
]);

module.exports = {
  STAFF_RANKS, APPLICATION_RANKS, EMOJI_SPRITE, CATEGORY_NAMES, PUBLIC_CHANNELS, PRIVATE_CHANNELS,
  OWNER_PERMISSIONS, HIGH_RANK_SUPERVISOR_PERMISSIONS, ALL_PERMISSION_BITS
};
