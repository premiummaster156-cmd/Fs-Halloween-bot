"use strict";

// Ten operational staff ranks, followed by five Human Resources roles.
// Roles have no Discord permission bits; access is granted through channel overwrites
// and bot-side checks, never Administrator.
const STAFF_RANKS = Object.freeze([
  { key: "owner", name: "Owner", icon: "👑", emoji: "cf_crown", primary: 0x7A101C, secondary: 0xE13D4B },
  { key: "co_owner", name: "Co-Owner", icon: "🛡️", emoji: "cf_shield", primary: 0x7E2732, secondary: 0xC84B60 },
  { key: "high_rank_supervisor", name: "High Rank Supervisor", icon: "🌟", emoji: "cf_star", primary: 0xA67821, secondary: 0xF3D17A },
  { key: "apex", name: "Apex", icon: "💎", emoji: "cf_gem", primary: 0x153D9A, secondary: 0x35B5F5 },
  { key: "overseer", name: "Overseer", icon: "🦋", emoji: "cf_butterfly", primary: 0x542A93, secondary: 0xB26AF2 },
  { key: "staff_supervisor", name: "Staff Supervisor", icon: "🍃", emoji: "cf_leaf", primary: 0x176B45, secondary: 0x62C987 },
  { key: "head_moderator", name: "Head Moderator", icon: "🔥", emoji: "cf_flame", primary: 0x9B2C16, secondary: 0xF47A3C },
  { key: "senior_moderator", name: "Senior Moderator", icon: "❄️", emoji: "cf_ice", primary: 0x176D91, secondary: 0x73DDF5 },
  { key: "moderator", name: "Moderator", icon: "⚙️", emoji: "cf_gear", primary: 0x48515E, secondary: 0xA7B4C5 },
  { key: "junior_moderator", name: "Junior Moderator", icon: "✨", emoji: "cf_spark", primary: 0x6840A4, secondary: 0xB68BEA }
]);

const HR_ROLES = Object.freeze([
  { key: "hr_director", name: "HR Director", icon: "🔑", emoji: "cf_key", primary: 0x9C315C, secondary: 0xF07DB0 },
  { key: "hr_manager", name: "HR Manager", icon: "📜", emoji: "cf_scroll", primary: 0x8A356B, secondary: 0xD68DBA },
  { key: "hr_recruiter", name: "HR Recruiter", icon: "🤝", emoji: "cf_handshake", primary: 0x8A5B24, secondary: 0xE0B85F },
  { key: "hr_coordinator", name: "HR Coordinator", icon: "🎟️", emoji: "cf_ticket", primary: 0x275B9A, secondary: 0x6EA8E8 },
  { key: "hr_trainee", name: "HR Trainee", icon: "🔔", emoji: "cf_bell", primary: 0x59616F, secondary: 0xA9B4C7 }
]);

const EMOJI_SPRITE = Object.freeze([
  "cf_bell", "cf_butterfly", "cf_crown", "cf_flame",
  "cf_gear", "cf_gem", "cf_handshake", "cf_headset",
  "cf_ice", "cf_key", "cf_leaf", "cf_scroll",
  "cf_shield", "cf_spark", "cf_star", "cf_ticket"
]);

const PUBLIC_CHANNELS = Object.freeze([
  { key: "welcome", name: "welcome" },
  { key: "rules", name: "rules" },
  { key: "announcements", name: "announcements" },
  { key: "introductions", name: "introductions" },
  { key: "general", name: "general" },
  { key: "media", name: "media" },
  { key: "showcase", name: "showcase" },
  { key: "help_study", name: "help-study" },
  { key: "your_creation", name: "your-creation" },
  { key: "open_ticket", name: "open-a-ticket" },
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
  { key: "ticket_transcripts", name: "ticket-transcripts" },
  { key: "member_logs", name: "member-logs" }
]);

module.exports = { STAFF_RANKS, HR_ROLES, EMOJI_SPRITE, PUBLIC_CHANNELS, PRIVATE_CHANNELS };
