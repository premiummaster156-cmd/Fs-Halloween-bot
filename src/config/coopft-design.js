"use strict";

const { PermissionFlagsBits, PermissionsBitField } = require("discord.js");

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

// Ten operational staff ranks, five HR roles, and five separate application tracks.
// Staff privileges are defined explicitly; all other generated roles default to none.
const STAFF_RANKS = Object.freeze([
  { key: "owner", name: "Owner", icon: "👑", emoji: "cf3d_crown", primary: 0x7A101C, secondary: 0xE13D4B, permissions: OWNER_PERMISSIONS, description: "Leads CoopFT, sets the community direction, makes final decisions, and protects the long-term vision." },
  { key: "co_owner", name: "Co-Owner", icon: "🛡️", emoji: "cf3d_shield", primary: 0x7E2732, secondary: 0xC84B60, permissions: OWNER_PERMISSIONS, description: "Supports the Owner, coordinates major operations, and steps in to keep the community running smoothly." },
  { key: "high_rank_supervisor", name: "High Rank Supervisor", icon: "🌟", emoji: "cf3d_star", primary: 0xA67821, secondary: 0xF3D17A, permissions: HIGH_RANK_SUPERVISOR_PERMISSIONS, description: "Oversees senior leadership, handles escalations, and keeps teams aligned with community standards." },
  { key: "apex", name: "Apex", icon: "💎", emoji: "cf3d_gem", primary: 0x153D9A, secondary: 0x35B5F5, description: "A senior operational role trusted with high-impact projects, quality checks, and cross-team coordination." },
  { key: "overseer", name: "Overseer", icon: "🦋", emoji: "cf3d_butterfly", primary: 0x542A93, secondary: 0xB26AF2, description: "Monitors team performance, supports supervisors, and helps resolve complicated operational issues." },
  { key: "staff_supervisor", name: "Staff Supervisor", icon: "🍃", emoji: "cf3d_leaf", primary: 0x176B45, secondary: 0x62C987, description: "Guides day-to-day staff work, checks consistency, and helps teammates improve." },
  { key: "head_moderator", name: "Head Moderator", icon: "🔥", emoji: "cf3d_flame", primary: 0x9B2C16, secondary: 0xF47A3C, description: "Leads moderation operations, reviews difficult cases, and supports the moderation team." },
  { key: "senior_moderator", name: "Senior Moderator", icon: "❄️", emoji: "cf3d_ice", primary: 0x176D91, secondary: 0x73DDF5, description: "Handles escalated reports, mentors moderators, and applies server rules consistently." },
  { key: "moderator", name: "Moderator", icon: "⚙️", emoji: "cf3d_gear", primary: 0x48515E, secondary: 0xA7B4C5, description: "Keeps conversations safe and welcoming, responds to reports, and documents moderation actions." },
  { key: "junior_moderator", name: "Junior Moderator", icon: "✨", emoji: "cf3d_spark", primary: 0x6840A4, secondary: 0xB68BEA, description: "Learns the moderation process, assists members, and handles approved entry-level duties." }
]);

const HR_ROLES = Object.freeze([
  { key: "hr_director", name: "HR Director", icon: "🔑", emoji: "cf3d_key", primary: 0x9C315C, secondary: 0xF07DB0, description: "Leads recruitment and staff development, maintains HR standards, and oversees the HR team." },
  { key: "hr_manager", name: "HR Manager", icon: "📜", emoji: "cf3d_scroll", primary: 0x8A356B, secondary: 0xD68DBA, description: "Coordinates recruitment activity, supports staff welfare, and manages approved junior HR assignments." },
  { key: "hr_recruiter", name: "HR Recruiter", icon: "🤝", emoji: "cf3d_handshake", primary: 0x8A5B24, secondary: 0xE0B85F, description: "Supports candidate communication, screening coordination and recruitment outreach under HR leadership." },
  { key: "hr_coordinator", name: "HR Coordinator", icon: "🎟️", emoji: "cf3d_ticket", primary: 0x275B9A, secondary: 0x6EA8E8, description: "Coordinates interview scheduling, maintains recruitment records and supports HR-led candidate follow-up." },
  { key: "hr_trainee", name: "HR Trainee", icon: "🔔", emoji: "cf3d_bell", primary: 0x59616F, secondary: 0xA9B4C7, description: "Learns the HR workflow and assists with supervised administrative and candidate-support tasks." }
]);

// These are opt-in team positions, not moderation ranks or Discord permission roles.
const APPLICATION_ROLES = Object.freeze([
  { key: "war_manager", name: "War Manager", icon: "⚔️", emoji: "cf3d_war", primary: 0x8D2634, secondary: 0xF06473, description: "Plans competitive matches, coordinates teams and schedules, and keeps war activities organized." },
  { key: "referee", name: "Referee", icon: "⚖️", emoji: "cf3d_referee", primary: 0xA67821, secondary: 0xF3D17A, description: "Oversees matches fairly, checks reported incidents, and records clear match outcomes." },
  { key: "observer", name: "Observer", icon: "👁️", emoji: "cf3d_observer", primary: 0x176D91, secondary: 0x73DDF5, description: "Watches events, documents important moments, and supports transparent event oversight." },
  { key: "helper", name: "Helper", icon: "🧭", emoji: "cf3d_helper", primary: 0x176B45, secondary: 0x62C987, description: "Welcomes members, answers everyday questions, and guides people to the right resources." },
  { key: "ticket_staff", name: "Ticket Staff", icon: "🎫", emoji: "cf3d_ticket_staff", primary: 0x542A93, secondary: 0xB26AF2, description: "Handles support tickets, communicates clearly with members, and routes complex issues to the right team." }
]);

const EMOJI_SPRITE = Object.freeze([
  "cf3d_crown", "cf3d_shield", "cf3d_star", "cf3d_gem",
  "cf3d_butterfly", "cf3d_leaf", "cf3d_flame", "cf3d_ice",
  "cf3d_key", "cf3d_ticket", "cf3d_scroll", "cf3d_headset",
  "cf3d_gear", "cf3d_bell", "cf3d_handshake", "cf3d_spark",
  "cf3d_war", "cf3d_referee", "cf3d_observer", "cf3d_helper",
  "cf3d_applications", "cf3d_rolebook", "cf3d_rules", "cf3d_announce",
  "cf3d_voice", "cf3d_idea", "cf3d_ticket_staff", "cf3d_community"
]);

const PUBLIC_CHANNELS = Object.freeze([
  { key: "welcome", name: "welcome" },
  { key: "rules", name: "rules" },
  { key: "announcements", name: "announcements", channelType: "announcement", fallbackChannelType: "text" },
  { key: "introductions", name: "introductions" },
  { key: "role_guide", name: "role-explanations" },
  { key: "general", name: "general" },
  { key: "media", name: "media" },
  { key: "showcase", name: "showcase" },
  { key: "your_creation", name: "your-creation" },
  { key: "announcement_stage", name: "announcements-live", channelType: "stage", fallbackChannelType: "voice" },
  { key: "community_voice", name: "community-voice", channelType: "voice" },
  { key: "event_voice", name: "events-voice", channelType: "voice" },
  { key: "open_ticket", name: "open-a-ticket" },
  { key: "applications", name: "applications" },
  { key: "bot_updates", name: "bot-updates" },
  { key: "suggestions", name: "suggestions" },
  { key: "bug_reports", name: "bug-reports" },
  { key: "custom_bot_requests", name: "custom-bot-requests" }
]);

const PRIVATE_CHANNELS = Object.freeze([
  { key: "staff_team", name: "staff-team" },
  { key: "staff_chat", name: "staff-chat" },
  { key: "staff_announcements", name: "staff-announcements" },
  { key: "staff_bot_updates", name: "staff-bot-updates" },
  { key: "application_review", name: "application-review" },
  { key: "ticket_transcripts", name: "ticket-transcripts" },
  { key: "member_logs", name: "member-logs" },
  { key: "server_logs", name: "server-logs" }
]);

module.exports = {
  STAFF_RANKS, HR_ROLES, APPLICATION_ROLES, EMOJI_SPRITE, PUBLIC_CHANNELS, PRIVATE_CHANNELS,
  OWNER_PERMISSIONS, HIGH_RANK_SUPERVISOR_PERMISSIONS, ALL_PERMISSION_BITS
};
