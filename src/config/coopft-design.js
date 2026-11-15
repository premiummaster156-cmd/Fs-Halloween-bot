"use strict";

// Ten operational staff ranks, five HR roles, and five separate application tracks.
// All generated roles start with no Discord permission bits.
const STAFF_RANKS = Object.freeze([
  { key: "owner", name: "Owner", icon: "👑", emoji: "cf_crown", primary: 0x7A101C, secondary: 0xE13D4B, description: "Leads CoopFT, sets the community direction, makes final decisions, and protects the long-term vision." },
  { key: "co_owner", name: "Co-Owner", icon: "🛡️", emoji: "cf_shield", primary: 0x7E2732, secondary: 0xC84B60, description: "Supports the Owner, coordinates major operations, and steps in to keep the community running smoothly." },
  { key: "high_rank_supervisor", name: "High Rank Supervisor", icon: "🌟", emoji: "cf_star", primary: 0xA67821, secondary: 0xF3D17A, description: "Oversees senior leadership, handles escalations, and keeps teams aligned with community standards." },
  { key: "apex", name: "Apex", icon: "💎", emoji: "cf_gem", primary: 0x153D9A, secondary: 0x35B5F5, description: "A senior operational role trusted with high-impact projects, quality checks, and cross-team coordination." },
  { key: "overseer", name: "Overseer", icon: "🦋", emoji: "cf_butterfly", primary: 0x542A93, secondary: 0xB26AF2, description: "Monitors team performance, supports supervisors, and helps resolve complicated operational issues." },
  { key: "staff_supervisor", name: "Staff Supervisor", icon: "🍃", emoji: "cf_leaf", primary: 0x176B45, secondary: 0x62C987, description: "Guides day-to-day staff work, checks consistency, and helps teammates improve." },
  { key: "head_moderator", name: "Head Moderator", icon: "🔥", emoji: "cf_flame", primary: 0x9B2C16, secondary: 0xF47A3C, description: "Leads moderation operations, reviews difficult cases, and supports the moderation team." },
  { key: "senior_moderator", name: "Senior Moderator", icon: "❄️", emoji: "cf_ice", primary: 0x176D91, secondary: 0x73DDF5, description: "Handles escalated reports, mentors moderators, and applies server rules consistently." },
  { key: "moderator", name: "Moderator", icon: "⚙️", emoji: "cf_gear", primary: 0x48515E, secondary: 0xA7B4C5, description: "Keeps conversations safe and welcoming, responds to reports, and documents moderation actions." },
  { key: "junior_moderator", name: "Junior Moderator", icon: "✨", emoji: "cf_spark", primary: 0x6840A4, secondary: 0xB68BEA, description: "Learns the moderation process, assists members, and handles approved entry-level duties." }
]);

const HR_ROLES = Object.freeze([
  { key: "hr_director", name: "HR Director", icon: "🔑", emoji: "cf_key", primary: 0x9C315C, secondary: 0xF07DB0, description: "Leads recruitment and staff development, maintains HR standards, and oversees the HR team." },
  { key: "hr_manager", name: "HR Manager", icon: "📜", emoji: "cf_scroll", primary: 0x8A356B, secondary: 0xD68DBA, description: "Coordinates recruitment activity, supports staff welfare, and manages approved junior HR assignments." },
  { key: "hr_recruiter", name: "HR Recruiter", icon: "🤝", emoji: "cf_handshake", primary: 0x8A5B24, secondary: 0xE0B85F, description: "Reviews applications, communicates with candidates, and helps identify suitable team members." },
  { key: "hr_coordinator", name: "HR Coordinator", icon: "🎟️", emoji: "cf_ticket", primary: 0x275B9A, secondary: 0x6EA8E8, description: "Organizes interviews, tracks application progress, and keeps recruitment records tidy." },
  { key: "hr_trainee", name: "HR Trainee", icon: "🔔", emoji: "cf_bell", primary: 0x59616F, secondary: 0xA9B4C7, description: "Learns the HR workflow and assists with supervised administrative and candidate-support tasks." }
]);

// These are opt-in team positions, not moderation ranks or Discord permission roles.
const APPLICATION_ROLES = Object.freeze([
  { key: "war_manager", name: "War Manager", icon: "⚔️", emoji: "cf_war", primary: 0x8D2634, secondary: 0xF06473, description: "Plans competitive matches, coordinates teams and schedules, and keeps war activities organized." },
  { key: "referee", name: "Referee", icon: "⚖️", emoji: "cf_referee", primary: 0xA67821, secondary: 0xF3D17A, description: "Oversees matches fairly, checks reported incidents, and records clear match outcomes." },
  { key: "observer", name: "Observer", icon: "👁️", emoji: "cf_observer", primary: 0x176D91, secondary: 0x73DDF5, description: "Watches events, documents important moments, and supports transparent event oversight." },
  { key: "helper", name: "Helper", icon: "🧭", emoji: "cf_helper", primary: 0x176B45, secondary: 0x62C987, description: "Welcomes members, answers everyday questions, and guides people to the right resources." },
  { key: "ticket_staff", name: "Ticket Staff", icon: "🎫", emoji: "cf_ticket_staff", primary: 0x542A93, secondary: 0xB26AF2, description: "Handles support tickets, communicates clearly with members, and routes complex issues to the right team." }
]);

const EMOJI_SPRITE = Object.freeze([
  "cf_bell", "cf_butterfly", "cf_crown", "cf_flame",
  "cf_gear", "cf_gem", "cf_handshake", "cf_headset",
  "cf_ice", "cf_key", "cf_leaf", "cf_scroll",
  "cf_shield", "cf_spark", "cf_star", "cf_ticket",
  "cf_war", "cf_referee", "cf_observer", "cf_helper",
  "cf_ticket_staff", "cf_applications", "cf_rolebook", "cf_rules",
  "cf_announce", "cf_voice", "cf_idea", "cf_community"
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

module.exports = { STAFF_RANKS, HR_ROLES, APPLICATION_ROLES, EMOJI_SPRITE, PUBLIC_CHANNELS, PRIVATE_CHANNELS };
