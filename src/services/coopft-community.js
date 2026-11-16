"use strict";

const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
  MessageFlags, PermissionFlagsBits, Routes
} = require("discord.js");
const {
  STAFF_RANKS, APPLICATION_RANKS, OWNER_RANK_KEYS, EMOJI_SPRITE, ROLE_BRACKETS, BOT_ROLES, MEMBER_ROLES,
  INTEREST_ROLES, PING_ROLES, ROLE_LAYOUT, CATEGORY_NAMES, PUBLIC_CHANNELS, PRIVATE_CHANNELS
} = require("../config/coopft-design");
const { COOPFT_DEFAULT_GUILD_ID, coopftGuildId } = require("../config/server-personas");

const CLEANUP_CONFIRMATION = "DELETE_EDITABLE_ROLES";
const STAFF_MANAGER_KEYS = new Set(["owner", "co_owner", "monarch", "high_rank_supervisor"]);
const APPLICATION_MANAGER_KEYS = OWNER_RANK_KEYS;
// Existing server emojis shown in the owner's screenshots. These are reused when
// present; the setup never replaces or deletes member-supplied emoji assets.
const EXISTING_SERVER_EMOJIS = Object.freeze([
  "PayPal", "z1_quote", "boost", "emoji_19", "emoji_18", "7300lock", "verified"
]);
const LEGACY_COOPFT_ROLES = Object.freeze([
  { key: "hr_director", name: "CF • HR Director" },
  { key: "hr_manager", name: "CF • HR Manager" },
  { key: "hr_recruiter", name: "CF • HR Recruiter" },
  { key: "hr_coordinator", name: "CF • HR Coordinator" },
  { key: "hr_trainee", name: "CF • HR Trainee" },
  { key: "war_manager", name: "CF • War Manager" },
  { key: "referee", name: "CF • Referee" },
  { key: "observer", name: "CF • Observer" },
  { key: "helper", name: "CF • Helper" },
  { key: "ticket_staff", name: "CF • Ticket Staff" }
]);
const TICKET_SECTIONS = Object.freeze({
  bot: { label: "Fukishōkai Economy Bot", description: "Bot bugs, player-account support, gameplay issues, security reports and bot suggestions." },
  server: { label: "CoopFT Server", description: "Server bugs, community suggestions, member or staff concerns, general support and partnerships." },
  development: { label: "Custom Bot Development", description: "Paid custom Discord bot commissions. Owners quote the price after reviewing the requested features. Delivery is a ZIP folder containing the code; hosting is not currently included." }
});
const TICKET_TYPES = Object.freeze({
  bot_bug: { section: "bot", label: "Fukishōkai Bot Bug", icon: "cf3d_gear", fallback: "⚙️", questions: [
    { id: "summary", label: "What is broken?", style: "short", required: true },
    { id: "details", label: "Describe the bug", style: "paragraph", required: true },
    { id: "steps", label: "Steps to reproduce", style: "paragraph", required: false },
    { id: "expected", label: "Expected result", style: "paragraph", required: false }
  ] },
  bot_suggestion: { section: "bot", label: "Fukishōkai Bot Suggestion", icon: "cf3d_spark", fallback: "✨", questions: [
    { id: "idea", label: "What is your idea?", style: "short", required: true },
    { id: "details", label: "How should it work?", style: "paragraph", required: true },
    { id: "benefit", label: "Who would this help?", style: "paragraph", required: true }
  ] },
  bot_gameplay: { section: "bot", label: "Gameplay or Balance Issue", icon: "cf3d_gem", fallback: "🎮", questions: [
    { id: "feature", label: "Which game feature?", style: "short", required: true },
    { id: "details", label: "Describe the issue", style: "paragraph", required: true },
    { id: "example", label: "Example or relevant values", style: "paragraph", required: false }
  ] },
  bot_account: { section: "bot", label: "Player Account Support", icon: "cf3d_key", fallback: "🔑", questions: [
    { id: "issue", label: "What do you need help with?", style: "short", required: true },
    { id: "details", label: "Explain what happened", style: "paragraph", required: true },
    { id: "when", label: "When did this start?", style: "short", required: false }
  ] },
  bot_exploit: { section: "bot", label: "Exploit or Security Report", icon: "cf3d_shield", fallback: "🛡️", questions: [
    { id: "summary", label: "What vulnerability did you find?", style: "short", required: true },
    { id: "details", label: "Explain the issue privately", style: "paragraph", required: true },
    { id: "impact", label: "What could be affected?", style: "paragraph", required: false }
  ] },
  server_support: { section: "server", label: "General Server Support", icon: "cf3d_headset", fallback: "🎧", questions: [
    { id: "topic", label: "What do you need help with?", style: "short", required: true },
    { id: "details", label: "Describe your request", style: "paragraph", required: true }
  ] },
  server_bug: { section: "server", label: "CoopFT Server Bug", icon: "cf3d_gear", fallback: "⚙️", questions: [
    { id: "location", label: "Where is the issue?", style: "short", required: true },
    { id: "details", label: "What is going wrong?", style: "paragraph", required: true },
    { id: "steps", label: "Steps to reproduce", style: "paragraph", required: false }
  ] },
  server_suggestion: { section: "server", label: "CoopFT Server Suggestion", icon: "cf3d_spark", fallback: "✨", questions: [
    { id: "idea", label: "What would you improve?", style: "short", required: true },
    { id: "details", label: "How should it work?", style: "paragraph", required: true },
    { id: "benefit", label: "What would this improve?", style: "paragraph", required: true }
  ] },
  member_report: { section: "server", label: "Member Report", icon: "cf3d_shield", fallback: "🛡️", questions: [
    { id: "member", label: "Who is involved?", style: "short", required: true },
    { id: "details", label: "What happened?", style: "paragraph", required: true },
    { id: "evidence", label: "Evidence or message links", style: "paragraph", required: false }
  ] },
  staff_report: { section: "server", label: "Staff Concern or Appeal", icon: "cf3d_applications", fallback: "📝", questions: [
    { id: "staff", label: "Which staff member or decision?", style: "short", required: true },
    { id: "details", label: "Explain your concern", style: "paragraph", required: true },
    { id: "evidence", label: "Supporting information", style: "paragraph", required: false }
  ] },
  custom_bot_request: { section: "development", label: "Custom Bot Commission", icon: "cf3d_developer", fallback: "💻", questions: [
    { id: "project", label: "What should the bot do?", style: "paragraph", required: true },
    { id: "features", label: "List the main features and workflows", style: "paragraph", required: true },
    { id: "integrations", label: "Required integrations or APIs", style: "paragraph", required: false },
    { id: "hosting", label: "Database / technical preferences (hosting is not available yet)", style: "paragraph", required: false },
    { id: "timeline", label: "Expected timeline and ongoing support needs", style: "short", required: false }
  ] },
  partnership: { section: "server", label: "Partnership Enquiry", icon: "cf3d_handshake", fallback: "🤝", questions: [
    { id: "organization", label: "Community or organization", style: "short", required: true },
    { id: "proposal", label: "What are you proposing?", style: "paragraph", required: true },
    { id: "contact", label: "Preferred public contact", style: "short", required: false }
  ] }
});

function rolePermissionArray(spec) {
  const bits = BigInt(spec.permissions ?? 0n);
  return [...new Set(Object.values(PermissionFlagsBits))].filter((permission) =>
    typeof permission === "bigint" &&
    permission !== 0n &&
    (bits & permission) === permission
  );
}

function safeChannelName(value) {
  return String(value || "member").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 75) || "member";
}

function drawCoopFTEmoji(ctx, name, index) {
  const palettes = [
    ["#f9d5a4", "#9b2634", "#f04a57"], ["#dceaff", "#566477", "#a8c4e8"],
    ["#fff0b2", "#95621b", "#ffd66e"], ["#d7f6ff", "#1558b8", "#54d6ff"],
    ["#eedaff", "#54238f", "#b978fa"], ["#ddffd8", "#176b45", "#63c987"],
    ["#ffe0bd", "#9b2c16", "#ff843d"], ["#dcfbff", "#176d91", "#80edff"],
    ["#ffe0ef", "#9c315c", "#ff85c0"], ["#fff0c2", "#8a5b24", "#efbd56"],
    ["#e2eaff", "#275b9a", "#7eb7ff"], ["#f8dcff", "#6840a4", "#d19aff"]
  ];
  const colors = palettes[index % palettes.length];
  const metal = ctx.createLinearGradient(18, 8, 110, 120);
  metal.addColorStop(0, "#ffffff");
  metal.addColorStop(0.25, colors[0]);
  metal.addColorStop(0.62, colors[1]);
  metal.addColorStop(1, "#242c45");
  const gem = ctx.createLinearGradient(30, 18, 104, 110);
  gem.addColorStop(0, "#ffffff");
  gem.addColorStop(0.3, colors[2]);
  gem.addColorStop(1, colors[1]);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 7;
  ctx.shadowColor = colors[2];
  ctx.shadowBlur = 13;
  const stroke = (path, fill = metal, line = "#f2f5ff") => {
    ctx.beginPath();
    path();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = line;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 13;
  };
  const line = (path, color = "#fff0d4", width = 7) => {
    ctx.beginPath();
    path();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const roundedRect = (x, y, width, height, radius) => {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };
  const diamond = (x, y, w, h, fill = gem) => stroke(() => {
    ctx.moveTo(x, y - h); ctx.lineTo(x + w, y); ctx.lineTo(x, y + h); ctx.lineTo(x - w, y); ctx.closePath();
  }, fill);
  const star = (x, y, outer, inner, points = 5, fill = gem) => stroke(() => {
    for (let i = 0; i < points * 2; i += 1) {
      const radius = i % 2 ? inner : outer;
      const angle = -Math.PI / 2 + i * Math.PI / points;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }, fill);
  const shield = () => stroke(() => {
    ctx.moveTo(64, 10); ctx.lineTo(108, 27); ctx.lineTo(103, 74);
    ctx.quadraticCurveTo(94, 105, 64, 120); ctx.quadraticCurveTo(34, 105, 25, 74);
    ctx.lineTo(20, 27); ctx.closePath();
  }, metal);
  switch (name) {
    case "cf3d_crown":
      stroke(() => { ctx.moveTo(15, 42); ctx.lineTo(29, 87); ctx.lineTo(99, 87); ctx.lineTo(113, 42); ctx.lineTo(88, 59); ctx.lineTo(64, 25); ctx.lineTo(40, 59); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(29, 97); ctx.lineTo(99, 97); }, "#fff0bd", 8);
      diamond(64, 59, 12, 14);
      break;
    case "cf3d_shield":
      shield();
      star(64, 62, 27, 12, 4, gem);
      break;
    case "cf3d_star":
      star(64, 63, 49, 21, 8, metal);
      diamond(64, 63, 12, 16);
      break;
    case "cf3d_gem":
      diamond(64, 65, 48, 43, gem);
      line(() => { ctx.moveTo(16, 51); ctx.lineTo(112, 51); ctx.moveTo(64, 22); ctx.lineTo(64, 108); }, "#effaff", 3);
      break;
    case "cf3d_butterfly":
      stroke(() => { ctx.moveTo(64, 58); ctx.bezierCurveTo(13, 0, 1, 62, 47, 76); ctx.bezierCurveTo(12, 122, 59, 111, 64, 78); ctx.bezierCurveTo(69, 111, 116, 122, 81, 76); ctx.bezierCurveTo(127, 62, 115, 0, 64, 58); ctx.closePath(); }, gem);
      line(() => { ctx.moveTo(64, 49); ctx.lineTo(64, 100); }, "#ffffff", 4);
      break;
    case "cf3d_leaf":
      stroke(() => { ctx.moveTo(19, 102); ctx.bezierCurveTo(18, 26, 76, 5, 111, 17); ctx.bezierCurveTo(117, 82, 71, 119, 19, 102); ctx.closePath(); }, gem);
      line(() => { ctx.moveTo(24, 105); ctx.quadraticCurveTo(62, 67, 105, 25); }, "#e9ffe7", 5);
      break;
    case "cf3d_flame":
      stroke(() => { ctx.moveTo(64, 117); ctx.bezierCurveTo(5, 105, 24, 56, 53, 20); ctx.bezierCurveTo(48, 53, 80, 47, 80, 8); ctx.bezierCurveTo(137, 69, 111, 112, 64, 117); ctx.closePath(); }, gem);
      stroke(() => { ctx.moveTo(64, 103); ctx.bezierCurveTo(34, 90, 54, 67, 68, 54); ctx.bezierCurveTo(67, 76, 92, 74, 87, 98); ctx.closePath(); }, "#fff0c7", "#ffffff");
      break;
    case "cf3d_ice":
      diamond(64, 45, 25, 42, gem); diamond(35, 81, 15, 27); diamond(95, 83, 17, 29);
      line(() => { ctx.moveTo(64, 10); ctx.lineTo(64, 119); ctx.moveTo(13, 83); ctx.lineTo(115, 83); }, "#e8fbff", 3);
      break;
    case "cf3d_key":
      ctx.beginPath(); ctx.arc(42, 44, 24, 0, Math.PI * 2); ctx.fillStyle = metal; ctx.fill(); ctx.strokeStyle = "#fff0c2"; ctx.lineWidth = 5; ctx.stroke();
      line(() => { ctx.moveTo(58, 62); ctx.lineTo(108, 112); ctx.moveTo(86, 92); ctx.lineTo(75, 103); ctx.moveTo(99, 105); ctx.lineTo(89, 116); }, "#f7d99a", 11);
      diamond(42, 44, 11, 14, gem);
      break;
    case "cf3d_ticket":
    case "cf3d_ticket_staff":
      stroke(() => { ctx.moveTo(14, 35); ctx.lineTo(114, 35); ctx.lineTo(114, 53); ctx.bezierCurveTo(98, 62, 98, 72, 114, 81); ctx.lineTo(114, 99); ctx.lineTo(14, 99); ctx.lineTo(14, 81); ctx.bezierCurveTo(30, 72, 30, 62, 14, 53); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(64, 42); ctx.lineTo(64, 92); }, "#fff0c4", 3);
      star(40, 68, 13, 6, 4, gem);
      if (name === "cf3d_ticket_staff") line(() => { ctx.arc(91, 34, 22, Math.PI, Math.PI * 2); ctx.moveTo(69, 34); ctx.lineTo(69, 62); ctx.moveTo(113, 34); ctx.lineTo(113, 62); }, "#d8eaff", 6);
      break;
    case "cf3d_scroll":
    case "cf3d_rolebook":
    case "cf3d_rules":
    case "cf3d_applications":
      stroke(() => { ctx.moveTo(30, 19); ctx.bezierCurveTo(16, 19, 16, 40, 30, 40); ctx.lineTo(93, 40); ctx.bezierCurveTo(111, 40, 111, 19, 93, 19); ctx.lineTo(30, 19); ctx.lineTo(30, 100); ctx.bezierCurveTo(17, 100, 17, 119, 34, 119); ctx.lineTo(98, 119); ctx.lineTo(98, 35); }, metal);
      line(() => { ctx.moveTo(43, 52); ctx.lineTo(85, 52); ctx.moveTo(43, 67); ctx.lineTo(85, 67); ctx.moveTo(43, 82); ctx.lineTo(76, 82); }, "#fff1c8", 4);
      if (name === "cf3d_applications") line(() => { ctx.moveTo(84, 91); ctx.lineTo(112, 61); ctx.lineTo(119, 70); ctx.lineTo(91, 101); ctx.closePath(); }, "#e4c8ff", 6);
      if (name === "cf3d_rules") star(88, 91, 12, 5, 4, gem);
      break;
    case "cf3d_headset":
      line(() => { ctx.arc(64, 65, 43, Math.PI, 0); }, "#c9faff", 9);
      stroke(() => { roundedRect(15, 58, 23, 44, 9); }, metal);
      stroke(() => { roundedRect(90, 58, 23, 44, 9); }, metal);
      line(() => { ctx.moveTo(100, 92); ctx.quadraticCurveTo(112, 111, 91, 113); }, "#71f3e8", 6);
      break;
    case "cf3d_gear":
      ctx.beginPath();
      for (let i = 0; i < 24; i += 1) {
        const radius = i % 3 === 0 ? 51 : 42;
        const angle = -Math.PI / 2 + i * Math.PI / 12;
        const x = 64 + Math.cos(angle) * radius;
        const y = 64 + Math.sin(angle) * radius;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fillStyle = metal; ctx.fill(); ctx.strokeStyle = "#d9efff"; ctx.lineWidth = 5; ctx.stroke();
      ctx.beginPath(); ctx.arc(64, 64, 22, 0, Math.PI * 2); ctx.fillStyle = gem; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.stroke();
      break;
    case "cf3d_bell":
      stroke(() => { ctx.moveTo(29, 87); ctx.quadraticCurveTo(40, 76, 40, 52); ctx.arc(64, 52, 24, Math.PI, 0); ctx.quadraticCurveTo(88, 76, 99, 87); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(22, 91); ctx.lineTo(106, 91); ctx.moveTo(55, 105); ctx.quadraticCurveTo(64, 119, 73, 105); }, "#ffe3a6", 7);
      diamond(64, 52, 9, 12);
      break;
    case "cf3d_handshake":
      stroke(() => { ctx.moveTo(12, 54); ctx.lineTo(38, 34); ctx.lineTo(60, 49); ctx.lineTo(82, 34); ctx.lineTo(116, 55); ctx.lineTo(92, 91); ctx.lineTo(77, 82); ctx.lineTo(63, 96); ctx.lineTo(49, 83); ctx.lineTo(36, 94); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(40, 60); ctx.lineTo(66, 81); ctx.lineTo(83, 66); ctx.lineTo(99, 77); }, "#fff1c4", 8);
      break;
    case "cf3d_spark":
      star(64, 64, 52, 9, 4, gem); star(23, 25, 12, 4, 4); star(105, 100, 14, 4, 4);
      break;
    case "cf3d_war":
      line(() => { ctx.moveTo(22, 18); ctx.lineTo(105, 111); ctx.moveTo(106, 18); ctx.lineTo(22, 111); }, "#f4e2c1", 10);
      line(() => { ctx.moveTo(12, 20); ctx.lineTo(31, 14); ctx.lineTo(24, 34); ctx.moveTo(116, 20); ctx.lineTo(97, 14); ctx.lineTo(104, 34); }, "#dbeaff", 7);
      diamond(64, 64, 12, 13, gem);
      break;
    case "cf3d_referee":
      line(() => { ctx.moveTo(64, 22); ctx.lineTo(64, 98); ctx.moveTo(24, 108); ctx.lineTo(104, 108); ctx.moveTo(30, 39); ctx.lineTo(98, 39); }, "#f3d89a", 7);
      line(() => { ctx.moveTo(32, 39); ctx.lineTo(18, 77); ctx.quadraticCurveTo(32, 94, 46, 77); ctx.closePath(); ctx.moveTo(96, 39); ctx.lineTo(82, 77); ctx.quadraticCurveTo(96, 94, 110, 77); ctx.closePath(); }, "#f5e7c3", 5);
      diamond(64, 22, 11, 14, gem);
      break;
    case "cf3d_observer":
      stroke(() => { ctx.moveTo(8, 64); ctx.quadraticCurveTo(64, 5, 120, 64); ctx.quadraticCurveTo(64, 123, 8, 64); ctx.closePath(); }, metal);
      ctx.beginPath(); ctx.arc(64, 64, 25, 0, Math.PI * 2); ctx.fillStyle = gem; ctx.fill(); ctx.strokeStyle = "#f2f7ff"; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.arc(64, 64, 9, 0, Math.PI * 2); ctx.fillStyle = "#15182e"; ctx.fill();
      break;
    case "cf3d_helper":
      stroke(() => { ctx.moveTo(19, 70); ctx.lineTo(43, 47); ctx.lineTo(60, 62); ctx.lineTo(89, 37); ctx.bezierCurveTo(103, 25, 117, 43, 104, 55); ctx.lineTo(65, 102); ctx.quadraticCurveTo(51, 116, 36, 101); ctx.closePath(); }, metal);
      star(64, 72, 16, 7, 4, gem);
      break;
    case "cf3d_announce":
      stroke(() => { ctx.moveTo(18, 53); ctx.lineTo(90, 25); ctx.lineTo(90, 100); ctx.lineTo(18, 76); ctx.closePath(); }, metal);
      stroke(() => { roundedRect(9, 52, 19, 25, 4); }, gem);
      line(() => { ctx.moveTo(39, 79); ctx.lineTo(51, 111); ctx.lineTo(73, 111); ctx.lineTo(66, 88); }, "#f0d9ad", 8);
      break;
    case "cf3d_voice":
      line(() => { ctx.moveTo(15, 65); ctx.lineTo(29, 65); ctx.lineTo(40, 38); ctx.lineTo(51, 94); ctx.lineTo(64, 22); ctx.lineTo(77, 103); ctx.lineTo(90, 45); ctx.lineTo(101, 79); ctx.lineTo(114, 65); }, "#87efff", 8);
      break;
    case "cf3d_idea":
      ctx.beginPath(); ctx.arc(64, 54, 35, Math.PI, Math.PI * 2); ctx.lineTo(99, 66); ctx.lineTo(80, 88); ctx.lineTo(48, 88); ctx.lineTo(29, 66); ctx.closePath(); ctx.fillStyle = gem; ctx.fill(); ctx.strokeStyle = "#fff0ce"; ctx.lineWidth = 5; ctx.stroke();
      line(() => { ctx.moveTo(47, 97); ctx.lineTo(81, 97); ctx.moveTo(51, 108); ctx.lineTo(77, 108); ctx.moveTo(64, 6); ctx.lineTo(64, 15); }, "#fff0c8", 6);
      break;
    case "cf3d_owner_crest":
      shield(); star(64, 40, 26, 12, 5, gem); break;
    case "cf3d_high_rank":
      diamond(64, 45, 31, 38, gem); star(64, 85, 24, 10, 6, metal); break;
    case "cf3d_low_rank":
      line(() => { ctx.moveTo(64, 21); ctx.lineTo(64, 102); ctx.moveTo(26, 42); ctx.lineTo(102, 42); ctx.moveTo(22, 108); ctx.lineTo(106, 108); }, "#f5dda4", 7);
      line(() => { ctx.moveTo(31, 43); ctx.lineTo(19, 78); ctx.quadraticCurveTo(31, 93, 43, 78); ctx.closePath(); ctx.moveTo(97, 43); ctx.lineTo(85, 78); ctx.quadraticCurveTo(97, 93, 109, 78); ctx.closePath(); }, gem, 5); break;
    case "cf3d_mod_rank":
      shield(); line(() => { ctx.moveTo(33, 36); ctx.lineTo(94, 96); ctx.moveTo(95, 36); ctx.lineTo(34, 96); }, "#fff0ca", 9); diamond(64, 66, 12, 13, gem); break;
    case "cf3d_bots":
      stroke(() => { roundedRect(22, 30, 84, 70, 16); }, metal);
      line(() => { ctx.moveTo(64, 12); ctx.lineTo(64, 28); ctx.moveTo(53, 14); ctx.lineTo(75, 14); }, "#e6f4ff", 6);
      ctx.beginPath(); ctx.arc(46, 61, 8, 0, Math.PI * 2); ctx.arc(82, 61, 8, 0, Math.PI * 2); ctx.fillStyle = gem; ctx.fill();
      line(() => { ctx.moveTo(44, 83); ctx.lineTo(84, 83); }, "#d9f6ff", 6); break;
    case "cf3d_member":
      ctx.beginPath(); ctx.arc(64, 39, 17, 0, Math.PI * 2); ctx.fillStyle = gem; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.stroke();
      stroke(() => { ctx.moveTo(23, 112); ctx.quadraticCurveTo(25, 67, 64, 67); ctx.quadraticCurveTo(103, 67, 105, 112); ctx.closePath(); }, metal); break;
    case "cf3d_vip":
      star(64, 67, 48, 19, 8, gem);
      line(() => { ctx.moveTo(29, 27); ctx.lineTo(42, 51); ctx.lineTo(64, 16); ctx.lineTo(86, 51); ctx.lineTo(99, 27); }, "#fff0bd", 7); break;
    case "cf3d_verified":
      shield();
      line(() => { ctx.moveTo(39, 67); ctx.lineTo(57, 84); ctx.lineTo(91, 47); }, "#dffff0", 10); break;
    case "cf3d_contributor":
      stroke(() => { ctx.moveTo(12, 54); ctx.lineTo(38, 34); ctx.lineTo(61, 49); ctx.lineTo(84, 34); ctx.lineTo(116, 56); ctx.lineTo(91, 92); ctx.lineTo(76, 82); ctx.lineTo(63, 96); ctx.lineTo(48, 83); ctx.lineTo(36, 94); ctx.closePath(); }, metal);
      star(64, 67, 17, 8, 5, gem); break;
    case "cf3d_creator":
      stroke(() => { ctx.moveTo(26, 94); ctx.lineTo(89, 31); ctx.lineTo(108, 50); ctx.lineTo(45, 113); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(22, 116); ctx.lineTo(45, 113); ctx.lineTo(26, 94); }, "#ffe6ad", 6);
      diamond(91, 31, 13, 13, gem); break;
    case "cf3d_developer":
      line(() => { ctx.moveTo(45, 34); ctx.lineTo(18, 64); ctx.lineTo(45, 94); ctx.moveTo(83, 34); ctx.lineTo(110, 64); ctx.lineTo(83, 94); }, "#e3f6ff", 10);
      line(() => { ctx.moveTo(72, 24); ctx.lineTo(53, 104); }, "#83d6ff", 8); break;
    case "cf3d_artist":
      stroke(() => { ctx.moveTo(22, 22); ctx.quadraticCurveTo(113, 7, 111, 71); ctx.quadraticCurveTo(108, 118, 64, 112); ctx.quadraticCurveTo(18, 108, 22, 22); ctx.closePath(); }, metal);
      for (const [x, y, color] of [[47,48,"#f5a0b5"],[78,43,"#7fd7ee"],[55,78,"#d0a2f2"],[86,81,"#f5d17d"]]) { ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fillStyle=color; ctx.fill(); }
      break;
    case "cf3d_gaming":
      stroke(() => { roundedRect(14, 40, 100, 58, 22); }, metal);
      line(() => { ctx.moveTo(35, 69); ctx.lineTo(59, 69); ctx.moveTo(47, 57); ctx.lineTo(47, 81); }, "#fff0c2", 7);
      ctx.beginPath(); ctx.arc(83, 63, 6, 0, Math.PI*2); ctx.arc(97, 77, 6, 0, Math.PI*2); ctx.fillStyle=gem; ctx.fill(); break;
    case "cf3d_programming":
      stroke(() => { roundedRect(17, 20, 94, 75, 9); }, metal);
      line(() => { ctx.moveTo(9, 108); ctx.lineTo(119, 108); ctx.lineTo(105, 96); ctx.lineTo(23, 96); ctx.closePath(); }, "#e4f3ff", 6);
      line(() => { ctx.moveTo(48, 46); ctx.lineTo(35, 59); ctx.lineTo(48, 72); ctx.moveTo(79, 46); ctx.lineTo(92, 59); ctx.lineTo(79, 72); }, gem, 6); break;
    case "cf3d_music":
      line(() => { ctx.moveTo(76, 20); ctx.lineTo(76, 86); ctx.lineTo(109, 76); ctx.lineTo(109, 11); ctx.lineTo(76, 20); }, "#ffe6aa", 8);
      ctx.beginPath(); ctx.ellipse(57, 91, 18, 12, -0.35, 0, Math.PI*2); ctx.ellipse(92, 81, 18, 12, -0.35, 0, Math.PI*2); ctx.fillStyle=gem; ctx.fill(); ctx.fill(); break;
    case "cf3d_anime":
      ctx.beginPath(); ctx.arc(64, 64, 46, 0, Math.PI*2); ctx.fillStyle=metal; ctx.fill(); ctx.strokeStyle="#fff0f0"; ctx.lineWidth=5; ctx.stroke();
      star(64, 20, 12, 5, 5, gem);
      ctx.beginPath(); ctx.arc(48, 63, 7, 0, Math.PI*2); ctx.arc(80, 63, 7, 0, Math.PI*2); ctx.fillStyle="#fff"; ctx.fill();
      line(() => { ctx.moveTo(49, 88); ctx.quadraticCurveTo(64, 100, 79, 88); }, "#ffc6d8", 6); break;
    case "cf3d_design":
      line(() => { ctx.moveTo(21, 105); ctx.lineTo(85, 27); ctx.lineTo(107, 48); ctx.lineTo(43, 112); ctx.closePath(); }, "#f2e0bc", 9);
      diamond(94, 39, 12, 13, gem); star(31, 31, 13, 5, 4, metal); break;
    case "cf3d_announcement_ping":
      stroke(() => { ctx.moveTo(17, 52); ctx.lineTo(94, 23); ctx.lineTo(94, 99); ctx.lineTo(17, 76); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(42, 82); ctx.lineTo(52, 111); ctx.lineTo(74, 111); ctx.moveTo(101, 36); ctx.quadraticCurveTo(119, 61, 101, 87); }, "#ffe6af", 7); break;
    case "cf3d_event_ping":
      stroke(() => { roundedRect(18, 27, 92, 88, 10); }, metal);
      line(() => { ctx.moveTo(18, 51); ctx.lineTo(110, 51); ctx.moveTo(41, 16); ctx.lineTo(41, 39); ctx.moveTo(86, 16); ctx.lineTo(86, 39); }, "#fff1c5", 7);
      star(64, 79, 20, 9, 5, gem); break;
    case "cf3d_giveaway_ping":
      stroke(() => { roundedRect(17, 50, 94, 62, 8); }, metal);
      stroke(() => { roundedRect(12, 35, 104, 23, 7); }, gem);
      line(() => { ctx.moveTo(64, 37); ctx.lineTo(64, 112); }, "#fff2cc", 6);
      star(47, 24, 16, 7, 5, metal); star(82, 24, 16, 7, 5, metal); break;
    case "cf3d_updates_ping":
      stroke(() => { ctx.moveTo(30, 90); ctx.quadraticCurveTo(42, 77, 42, 52); ctx.arc(64, 52, 22, Math.PI, 0); ctx.quadraticCurveTo(86, 77, 98, 90); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(22, 94); ctx.lineTo(106, 94); ctx.moveTo(56, 108); ctx.quadraticCurveTo(64, 120, 72, 108); }, "#fff0c2", 7);
      break;
    case "cf3d_role_select":
      stroke(() => { roundedRect(19, 17, 90, 96, 12); }, metal);
      for (let y of [42, 67, 92]) {
        stroke(() => { ctx.moveTo(31, y); ctx.lineTo(40, y+9); ctx.lineTo(54, y-9); }, gem);
        line(() => { ctx.moveTo(63, y); ctx.lineTo(96, y); }, "#f1f7ff", 6);
      }
      break;
    default:
      star(64, 64, 48, 20, 8, gem);
  }
  ctx.restore();
}

class CoopFTCommunityService {
  constructor(pool, options = {}) {
    this.pool = pool;
    const requestedGuildId = options.guildId || coopftGuildId;
    if (requestedGuildId !== COOPFT_DEFAULT_GUILD_ID) {
      throw new Error(
        "Safety lock: CoopFTCommunityService can only be bound to server " +
        COOPFT_DEFAULT_GUILD_ID + "."
      );
    }
    this.guildId = COOPFT_DEFAULT_GUILD_ID;
    this.roles = new Map();
    this.emojis = new Map();
    this.memberRosterLoaded = false;
    this.directoryRefreshRunning = false;
    this.directoryRefreshTimer = null;
  }

  assertCoopFTGuildId(guildId, action = "access CoopFT data") {
    if (guildId !== COOPFT_DEFAULT_GUILD_ID || this.guildId !== COOPFT_DEFAULT_GUILD_ID) {
      throw new Error(
        "Safety lock: refusing to " + action + " outside the verified CoopFT server " +
        COOPFT_DEFAULT_GUILD_ID + "."
      );
    }
  }

  assertCoopFTGuild(guild, action = "change") {
    if (!guild) {
      throw new Error("Safety lock: refusing to " + action + " without a guild.");
    }
    this.assertCoopFTGuildId(guild.id, action);
  }

  async getSetting(guildId, key) {
    this.assertCoopFTGuildId(guildId, "read CoopFT settings");
    const result = await this.pool.query(
      "SELECT setting_value FROM coopft_community_settings WHERE guild_id=$1 AND setting_key=$2",
      [guildId, key]
    );
    return result.rows[0]?.setting_value ?? null;
  }

  async setSetting(guildId, key, value) {
    this.assertCoopFTGuildId(guildId, "write CoopFT settings");
    await this.pool.query(
      "INSERT INTO coopft_community_settings (guild_id,setting_key,setting_value) VALUES ($1,$2,$3::jsonb) " +
      "ON CONFLICT (guild_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()",
      [guildId, key, JSON.stringify(value)]
    );
  }

  async getResource(guildId, key) {
    return this.getSetting(guildId, "resource:" + key);
  }

  async saveResource(guildId, key, id) {
    await this.setSetting(guildId, "resource:" + key, id);
  }

  emoji(guildId, name, fallback = "✦") {
    const id = this.emojis.get(name);
    return id ? "<:" + name + ":" + id + ">" : fallback;
  }

  async ensureEmojis(guild) {
    this.assertCoopFTGuild(guild, "create or reuse custom emojis");
    const result = { created: 0, available: 0, failed: [] };
    // Rebuild from the current guild cache so deleted custom emojis never leave stale markup.
    this.emojis.clear();
    const found = new Map(guild.emojis.cache.map((emoji) => [emoji.name, emoji]));
    let canvasApi = null;
    let emojiImage = null;
    try {
      canvasApi = require("@napi-rs/canvas");
      const encoded = fs.readFileSync(
        path.resolve(__dirname, "../../assets/coopft-emojis.png.b64"),
        "utf8"
      ).trim();
      if (!encoded) throw new Error("The generated CoopFT emoji sprite is empty.");
      emojiImage = await canvasApi.loadImage(Buffer.from(encoded, "base64"));
      if (emojiImage.width !== 128 || emojiImage.height !== 224) {
        throw new Error("Expected the 128×224 4-by-7 CoopFT emoji sprite, received " +
          emojiImage.width + "×" + emojiImage.height + ".");
      }
    } catch (error) {
      result.failed.push("illustrated emoji source unavailable; vector fallback enabled: " + error.message);
    }
    for (let index = 0; index < EMOJI_SPRITE.length; index += 1) {
      const name = EMOJI_SPRITE[index];
      const existing = found.get(name);
      if (existing) {
        this.emojis.set(name, existing.id);
        result.available += 1;
        continue;
      }
      if (!canvasApi || !guild.members.me?.permissions?.has(PermissionFlagsBits.CreateGuildExpressions)) {
        result.failed.push(name + ": missing Create Expressions permission or canvas support");
        continue;
      }
      try {
        const canvas = canvasApi.createCanvas(128, 128);
        const context = canvas.getContext("2d");
        if (emojiImage && index < 28) {
          const sourceX = (index % 4) * 32;
          const sourceY = Math.floor(index / 4) * 32;
          context.drawImage(emojiImage, sourceX, sourceY, 32, 32, 0, 0, 128, 128);
        } else {
          drawCoopFTEmoji(context, name, index);
        }
        const created = await guild.emojis.create({
          attachment: canvas.toBuffer("image/png"),
          name,
          reason: "CoopFT branded interface emoji pack"
        });
        this.emojis.set(name, created.id);
        result.created += 1;
      } catch (error) {
        result.failed.push(name + ": " + error.message);
      }
    }
    // Reuse useful existing community emojis as well as the dedicated CoopFT pack.
    for (const name of EXISTING_SERVER_EMOJIS) {
      const existing = found.get(name);
      if (existing) this.emojis.set(name, existing.id);
    }
    const nextMap = Object.fromEntries([...this.emojis.entries()]);
    await this.setSetting(guild.id, "emoji_map", nextMap);
    return result;
  }

  async retireLegacyManagedRoles(guild) {
    this.assertCoopFTGuild(guild, "retire obsolete CoopFT roles");
    const retired = [];
    const preserved = [];
    for (const spec of LEGACY_COOPFT_ROLES) {
      const resourceKey = "resource:role:" + spec.key;
      const roleId = await this.getSetting(guild.id, resourceKey);
      if (typeof roleId !== "string" || !roleId) continue;
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        await this.pool.query("DELETE FROM coopft_community_settings WHERE guild_id=$1 AND setting_key=$2", [guild.id, resourceKey]);
        retired.push(spec.name + " (already absent)");
        continue;
      }
      if (role.managed || role.editable === false || role.name !== spec.name) {
        preserved.push(spec.name + " (ownership or hierarchy could not be verified)");
        continue;
      }
      try {
        await role.delete("Retire obsolete CoopFT HR and specialist role");
        await this.pool.query("DELETE FROM coopft_community_settings WHERE guild_id=$1 AND setting_key=$2", [guild.id, resourceKey]);
        retired.push(spec.name);
      } catch (error) {
        preserved.push(spec.name + " (" + error.message + ")");
      }
    }
    return { retired, preserved };
  }

  async loadManagedRoles(guild) {
    this.assertCoopFTGuild(guild, "load managed CoopFT roles");
    if (!guild || guild.id !== this.guildId) return { staff: 0, member: 0, interest: 0, ping: 0, brackets: 0, emojis: 0 };
    const roleSpecs = [...ROLE_BRACKETS, ...STAFF_RANKS, ...MEMBER_ROLES, ...INTEREST_ROLES, ...PING_ROLES, ...BOT_ROLES];
    const resourceKeys = roleSpecs.map((spec) => "resource:role:" + spec.key);
    const result = await this.pool.query(
      "SELECT setting_key,setting_value FROM coopft_community_settings WHERE guild_id=$1 AND setting_key=ANY($2::text[])",
      [guild.id, [...resourceKeys, "emoji_map"]]
    );
    const settings = new Map(result.rows.map((row) => [row.setting_key, row.setting_value]));
    this.roles.clear();
    const loadedRoles = await Promise.all(roleSpecs.map(async (spec) => {
      const id = settings.get("resource:role:" + spec.key);
      return { spec, role: id ? await guild.roles.fetch(id).catch(() => null) : null };
    }));
    const counts = { staff: 0, member: 0, interest: 0, ping: 0, brackets: 0, emojis: 0 };
    for (const item of loadedRoles) {
      if (!item.role) continue;
      this.roles.set(item.spec.key, item.role);
      if (STAFF_RANKS.some((spec) => spec.key === item.spec.key)) counts.staff += 1;
      else if (MEMBER_ROLES.some((spec) => spec.key === item.spec.key) || BOT_ROLES.some((spec) => spec.key === item.spec.key)) counts.member += 1;
      else if (INTEREST_ROLES.some((spec) => spec.key === item.spec.key)) counts.interest += 1;
      else if (PING_ROLES.some((spec) => spec.key === item.spec.key)) counts.ping += 1;
      else counts.brackets += 1;
    }
    const savedEmojiMap = settings.get("emoji_map");
    this.emojis.clear();
    if (savedEmojiMap && typeof savedEmojiMap === "object") {
      const emojiLookups = await Promise.all(Object.entries(savedEmojiMap).map(async ([name, id]) => ({
        name, emoji: await guild.emojis.fetch(id).catch(() => null)
      })));
      for (const item of emojiLookups) {
        if (!item.emoji) continue;
        this.emojis.set(item.name, item.emoji.id);
        counts.emojis += 1;
      }
    }
    return counts;
  }

  async ensureRole(guild, spec) {
    this.assertCoopFTGuild(guild, "create or edit a CoopFT role");
    const resourceKey = "role:" + spec.key;
    const savedId = await this.getResource(guild.id, resourceKey);
    let role = savedId ? await guild.roles.fetch(savedId).catch(() => null) : null;
    if (!role) role = guild.roles.cache.find((item) =>
      !item.managed && [spec.name, "CF • " + spec.name].includes(item.name)
    ) || null;
    let created = false;
    if (!role) {
      try {
        role = await guild.roles.create({
          name: spec.name,
          color: spec.primary,
          permissions: rolePermissionArray(spec),
          hoist: spec.hoist ?? true,
          mentionable: spec.mentionable ?? false,
          reason: "CoopFT automatic server setup"
        });
      } catch (error) {
        if (!String(error.message).toLowerCase().includes("unicode") && error.code !== 50035) throw error;
        role = await guild.roles.create({
          name: spec.name,
          color: spec.primary,
          permissions: rolePermissionArray(spec),
          hoist: true,
          mentionable: false,
          reason: "CoopFT automatic server setup"
        });
      }
      created = true;
    }
    await this.saveResource(guild.id, resourceKey, role.id);

    // Repair the ordinary role properties on every setup run. This also gives
    // servers without enhanced role colours a predictable solid-colour fallback.
    const baseChanges = {};
    const expectedName = spec.name;
    if (role.name !== expectedName) baseChanges.name = expectedName;
    if (role.color !== spec.primary) baseChanges.color = spec.primary;
    if (role.hoist !== (spec.hoist ?? true)) baseChanges.hoist = spec.hoist ?? true;
    if (role.mentionable !== (spec.mentionable ?? false)) baseChanges.mentionable = spec.mentionable ?? false;
    const permissionBits = role.permissions?.bitfield;
    const expectedPermissionBits = BigInt(spec.permissions ?? 0n);
    if (permissionBits !== undefined && BigInt(permissionBits) !== expectedPermissionBits) {
      baseChanges.permissions = rolePermissionArray(spec);
    }
    if (Object.keys(baseChanges).length) {
      if (role.editable !== false && typeof role.edit === "function") {
        try {
          role = await role.edit({
            ...baseChanges,
            reason: "Repair CoopFT managed staff role properties"
          });
        } catch (error) {
          if (baseChanges.permissions) {
            throw new Error(
              "Could not apply the configured Discord permissions to CF • " + spec.name +
              ". Check that the bot has Administrator and that its highest role is above this role. " +
              error.message
            );
          }
          console.warn("[coopft] Could not repair base styling for " + spec.name + ":", error.message);
        }
      } else {
        if (baseChanges.permissions) {
          throw new Error(
            "Cannot apply the configured Discord permissions to CF • " + spec.name +
            " because the role is above the bot or otherwise not editable. Move the bot's highest role above all CoopFT-managed roles, then rerun setup."
          );
        }
        console.warn("[coopft] Cannot repair " + spec.name + " because the role is above the bot or otherwise not editable.");
      }
    }

    // Enhanced gradients are optional. The primary solid colour above remains
    // in place when the server does not have ENHANCED_ROLE_COLORS.
    if (guild.features?.includes?.("ENHANCED_ROLE_COLORS") && role.editable !== false) {
      try {
        await guild.client.rest.patch(Routes.guildRole(guild.id, role.id), {
          body: { colors: { primary_color: spec.primary, secondary_color: spec.secondary, tertiary_color: null } },
          reason: "CoopFT staff role visual style"
        });
      } catch (error) {
        console.warn("[coopft] Gradient styling unavailable for " + spec.name + "; solid colour fallback retained:", error.message);
      }
    }

    // Discord role icons are feature-gated. Staff directory embeds always keep
    // their own Unicode/custom-emoji icon when native role icons are unavailable.
    if (guild.features?.includes?.("ROLE_ICONS") && role.editable !== false) {
      try {
        await guild.client.rest.patch(Routes.guildRole(guild.id, role.id), {
          body: { unicode_emoji: spec.icon },
          reason: "CoopFT staff role icon"
        });
      } catch (error) {
        console.warn("[coopft] Native role icon unavailable for " + spec.name + "; embed icon fallback retained:", error.message);
      }
    }
    return { role, created };
  }

  async cleanupEditableRoles(guild) {
    this.assertCoopFTGuild(guild, "clean up CoopFT roles");
    const alreadyDone = await this.getSetting(guild.id, "role_cleanup_complete");
    if (alreadyDone) return { deleted: 0, candidates: [], alreadyDone: true };

    const keepIds = new Set(String(process.env.COOPFT_KEEP_ROLE_IDS || "")
      .split(",").map((value) => value.trim()).filter(Boolean));
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      return { deleted: 0, candidates: [], blocked: "Manage Roles permission is missing." };
    }

    const candidates = [...guild.roles.cache.values()]
      .filter((role) =>
        role.id !== guild.id &&
        !role.managed &&
        role.editable &&
        !keepIds.has(role.id) &&
        !role.name.startsWith("CF • ")
      )
      .sort((a, b) => a.position - b.position);

    const snapshot = candidates.map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      permissions: role.permissions.bitfield.toString(),
      hoist: role.hoist,
      mentionable: role.mentionable,
      position: role.position,
      cachedMemberCount: role.members?.size ?? null
    }));
    await this.setSetting(guild.id, "role_cleanup_preview", snapshot);

    // A restart never deletes roles by itself. Review the preview and provide the
    // exact environment confirmation after backing up role assignments.
    if (process.env.COOPFT_ROLE_CLEANUP_CONFIRM !== CLEANUP_CONFIRMATION) {
      return { deleted: 0, candidates: snapshot, awaitingConfirmation: true };
    }

    await this.setSetting(guild.id, "role_cleanup_snapshot", snapshot);
    let deleted = 0;
    const failures = [];
    for (const role of candidates) {
      try {
        await role.delete("One-time CoopFT role cleanup explicitly confirmed by server operator");
        deleted += 1;
      } catch (error) {
        failures.push(role.name + ": " + error.message);
      }
    }
    await this.setSetting(guild.id, "role_cleanup_complete", {
      completedAt: new Date().toISOString(),
      deleted,
      skippedOrFailed: failures
    });
    return { deleted, candidates: snapshot, failures, completed: true };
  }

  async ensureCategory(guild, key, name, permissionOverwrites) {
    this.assertCoopFTGuild(guild, "create or edit a CoopFT category");
    const resourceKey = "category:" + key;
    const savedId = await this.getResource(guild.id, resourceKey);
    let category = savedId ? await guild.channels.fetch(savedId).catch(() => null) : null;
    if (!category) {
      category = guild.channels.cache.find((channel) =>
        channel.type === ChannelType.GuildCategory &&
        channel.name === name &&
        channel.topic === "cf1:" + key
      ) || null;
    }
    let created = false;
    if (!category) {
      category = await guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: permissionOverwrites || [],
        reason: "CoopFT automatic server layout"
      });
      created = true;
    } else {
      if (category.name !== name) await category.setName(name, "Repair CoopFT managed category name");
      if (permissionOverwrites) {
        await category.permissionOverwrites.set(permissionOverwrites, "CoopFT managed category permissions");
      }
    }
    await this.saveResource(guild.id, resourceKey, category.id);
    return { channel: category, created };
  }

  async ensureChannel(guild, spec, parent) {
    this.assertCoopFTGuild(guild, "create or edit a CoopFT channel");
    const resourceKey = "channel:" + spec.key;
    const savedId = await this.getResource(guild.id, resourceKey);
    const channelTypes = {
      text: ChannelType.GuildText,
      announcement: ChannelType.GuildAnnouncement,
      voice: ChannelType.GuildVoice,
      stage: ChannelType.GuildStageVoice
    };
    const requestedType = channelTypes[spec.channelType || "text"];
    if (requestedType === undefined) throw new Error("Unsupported CoopFT channel type: " + spec.channelType);
    const acceptedTypes = [requestedType];
    if (spec.fallbackChannelType && channelTypes[spec.fallbackChannelType] !== undefined) {
      acceptedTypes.push(channelTypes[spec.fallbackChannelType]);
    }
    const marker = "cf1:" + spec.key;
    let channel = savedId ? await guild.channels.fetch(savedId).catch(() => null) : null;
    if (channel && !acceptedTypes.includes(channel.type)) channel = null;
    if (!channel) {
      channel = guild.channels.cache.find((item) =>
        acceptedTypes.includes(item.type) &&
        item.parentId === parent.id &&
        (item.name === spec.name || item.topic === marker)
      ) || null;
    }
    const permissionOverwrites = [...parent.permissionOverwrites.cache.values()].map((overwrite) => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield,
      deny: overwrite.deny.bitfield
    }));
    let created = false;
    if (!channel) {
      const base = {
        name: spec.name,
        parent: parent.id,
        permissionOverwrites,
        reason: "CoopFT managed community layout"
      };
      try {
        channel = await guild.channels.create({ ...base, type: requestedType });
      } catch (error) {
        const fallbackType = spec.fallbackChannelType ? channelTypes[spec.fallbackChannelType] : null;
        if (!fallbackType || fallbackType === requestedType) throw error;
        console.warn("[coopft] Could not create " + spec.name + " with its preferred channel type; using fallback:", error.message);
        channel = await guild.channels.create({ ...base, type: fallbackType });
      }
      created = true;
    } else {
      if (channel.name !== spec.name) await channel.setName(spec.name, "Repair CoopFT managed channel name");
      if (channel.parentId !== parent.id) await channel.setParent(parent.id, { lockPermissions: false, reason: "Repair CoopFT managed channel category" });
      await channel.permissionOverwrites.set(permissionOverwrites, "CoopFT managed channel permission synchronization");
    }
    await this.saveResource(guild.id, resourceKey, channel.id);
    return { channel, created };
  }

  async removeManagedChannel(guild, key) {
    this.assertCoopFTGuild(guild, "remove a CoopFT-managed channel");
    const resourceKey = "channel:" + key;
    const savedId = await this.getResource(guild.id, resourceKey);
    if (!savedId) return false;
    const channel = await guild.channels.fetch(savedId).catch(() => null);
    if (!channel) return false;
    if (channel.topic !== "cf1:" + key) return false;
    await channel.delete("Remove retired CoopFT-managed channel: " + key);
    await this.setSetting(guild.id, "resource:" + resourceKey, null);
    return true;
  }

  async staffPermissionOverwrites(guild) {
    this.assertCoopFTGuild(guild, "build CoopFT permission overrides");
    const botMember = guild.members.me || await guild.members.fetchMe();
    // Only actual staff ranks can view staff-only categories. Member tags,
    // interest roles, ping roles and divider roles must never grant staff access.
    const allowedRoles = STAFF_RANKS.map((spec) => this.roles.get(spec.key)).filter(Boolean);
    const supportRoles = allowedRoles.map((role) => ({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }));
    return [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      },
      ...supportRoles
    ];
  }

  async bootstrap(guild, options = {}) {
    this.assertCoopFTGuild(guild, "run server setup");
    if (!guild || guild.id !== this.guildId) throw new Error("CoopFT setup can only run in the configured CoopFT server.");
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!me) throw new Error("The bot's server member could not be fetched.");
    const required = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ViewAuditLog
    ];
    const missing = required.filter((permission) => !me.permissions.has(permission));
    if (missing.length) {
      const adminRequired = missing.includes(PermissionFlagsBits.Administrator);
      throw new Error(
        "CoopFT setup requires the bot to have Administrator, Manage Roles, Manage Channels, View Channel, Send Messages, Embed Links, Read Message History, Attach Files and View Audit Log. " +
        (adminRequired
          ? "Administrator is required because Owner and Co-Owner must receive the Administrator permission, and Discord only lets a bot grant permissions it already has. "
          : "") +
        "Missing: " + missing.join(", ")
      );
    }

    // Startup guild fetches can return a Guild before its child managers are warm.
    // Populate only guild-level resource caches; never enumerate the member roster.
    await Promise.all([
      guild.roles.fetch(),
      guild.channels.fetch(),
      guild.emojis.fetch()
    ]);
    const emojiResult = await this.ensureEmojis(guild);
    const counts = { createdRoles: 0, createdChannels: 0, createdEmojis: emojiResult.created };
    const createChannel = async (spec, parent) => {
      const result = await this.ensureChannel(guild, spec, parent);
      if (result.created) counts.createdChannels += 1;
      return result.channel;
    };

    await this.removeManagedChannel(guild, "help_study");
    await this.removeManagedChannel(guild, "staff_directory");
    await this.removeRetiredRoleGuide(guild);
    const startCategory = (await this.ensureCategory(guild, "start_here", CATEGORY_NAMES.start_here)).channel;
    const communityCategory = (await this.ensureCategory(guild, "community", CATEGORY_NAMES.community)).channel;
    const servicesCategory = (await this.ensureCategory(guild, "services", CATEGORY_NAMES.services)).channel;
    const publicByKey = {};
    const startKeys = new Set(["welcome", "rules", "announcements", "introductions"]);
    const communityKeys = new Set(["general", "media", "showcase", "your_creation", "announcement_stage", "community_voice", "event_voice"]);
    for (const spec of PUBLIC_CHANNELS) {
      const parent = startKeys.has(spec.key)
        ? startCategory
        : communityKeys.has(spec.key) ? communityCategory : servicesCategory;
      publicByKey[spec.key] = await createChannel(spec, parent);
    }

    const retiredRoles = await this.retireLegacyManagedRoles(guild);
    const cleanup = await this.cleanupEditableRoles(guild);
    this.roles.clear();
    const managedRoleSpecs = [...ROLE_BRACKETS, ...STAFF_RANKS, ...MEMBER_ROLES, ...INTEREST_ROLES, ...PING_ROLES, ...BOT_ROLES];
    for (const spec of managedRoleSpecs) {
      const result = await this.ensureRole(guild, spec);
      this.roles.set(spec.key, result.role);
      if (result.created) counts.createdRoles += 1;
    }

    // Put the divider roles immediately above their own role groups. All existing
    // non-managed roles remain intact; only this bot-owned role set is repositioned.
    const roleKeyOrder = ROLE_LAYOUT.flatMap((group) => [group.bracket, ...group.roles]);
    const topManagedPosition = Math.max(1, (me.roles.highest?.position || guild.roles.cache.size) - 1);
    const positions = roleKeyOrder
      .map((key, index) => ({ role: this.roles.get(key), position: topManagedPosition - index }))
      .filter((item) => item.role && item.position > 0);
    if (positions.length) {
      await guild.roles.setPositions(positions, "Arrange CoopFT bracket roles and their grouped roles");
    }
    const assistantRole = this.roles.get("bot_coopft_assistant");
    if (assistantRole && !me.roles.cache.has(assistantRole.id) && assistantRole.position < me.roles.highest.position) {
      await me.roles.add(assistantRole, "Mark the CoopFT bot under the Bots role bracket").catch((error) =>
        console.warn("[coopft] Could not add the CoopFT Assistant marker role:", error.message)
      );
    }
    const staffOverwrites = await this.staffPermissionOverwrites(guild);
    const staffCategory = (await this.ensureCategory(guild, "staff_hq", CATEGORY_NAMES.staff_hq, staffOverwrites)).channel;
    const privateByKey = {};
    for (const spec of PRIVATE_CHANNELS) {
      const result = await this.ensureChannel(guild, spec, staffCategory);
      privateByKey[spec.key] = result.channel;
      if (result.created) counts.createdChannels += 1;
    }

    // Applications contain personal information. Only the three Owner Ranks
    // can read submissions or operate recruitment controls.
    const ownerApplicationRoles = [...APPLICATION_MANAGER_KEYS]
      .map((key) => this.roles.get(key))
      .filter(Boolean);
    const nonOwnerStaffDeny = STAFF_RANKS
      .filter((spec) => !APPLICATION_MANAGER_KEYS.has(spec.key))
      .map((spec) => this.roles.get(spec.key))
      .filter(Boolean)
      .map((role) => ({ id: role.id, deny: [PermissionFlagsBits.ViewChannel] }));
    const ownerAllow = ownerApplicationRoles.map((role) => ({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }));
    const ownerOnlyOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks
        ]
      },
      ...nonOwnerStaffDeny,
      ...ownerAllow
    ];
    await privateByKey.application_review.permissionOverwrites.set(
      ownerOnlyOverwrites,
      "Restrict application submissions to Owner, Co-Owner and Monarch"
    );
    await privateByKey.application_control.permissionOverwrites.set(
      ownerOnlyOverwrites,
      "Restrict recruitment controls to Owner, Co-Owner and Monarch"
    );

    const staffGuideOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      {
        id: me.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]
      },
      ...STAFF_RANKS.map((spec) => this.roles.get(spec.key)).filter(Boolean).map((role) => ({
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages]
      }))
    ];
    const guideDeveloperRole = this.roles.get("developer_member");
    if (guideDeveloperRole) staffGuideOverwrites.push({
      id: guideDeveloperRole.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages]
    });
    await privateByKey.staff_guide.permissionOverwrites.set(
      staffGuideOverwrites,
      "Make the private CoopFT staff guide read-only for staff and approved Developers"
    );

    const ticketOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
    ];
    await this.ensureCategory(guild, "tickets", CATEGORY_NAMES.tickets, ticketOverwrites);

    await this.updateStaffDirectory(guild);
    await this.ensureTicketPanel(guild, publicByKey.open_ticket);
    await this.ensureRoleSelectionPanel(guild, publicByKey.role_selection);
    await this.ensureApplicationPanel(guild, publicByKey.applications);
    await this.ensureApplicationControlPanel(guild, privateByKey.application_control);
    await this.ensureStaffGuide(guild, privateByKey.staff_guide);
    await this.ensureBrandMessages(guild, publicByKey);
    await this.ensureCustomBotRequestPanel(guild, publicByKey.custom_bot_requests);
    if (cleanup.awaitingConfirmation) {
      const previewAnnounced = await this.getSetting(guild.id, "role_cleanup_preview_announced");
      if (!previewAnnounced) {
        const names = cleanup.candidates.map((role) => role.name).slice(0, 35);
        const remainder = Math.max(0, cleanup.candidates.length - names.length);
        await this.postStaffUpdate(
          guild,
          this.emoji(guild.id, "cf3d_shield", "🛡️") + " **One-time role cleanup preview**\\n" +
          cleanup.candidates.length + " ordinary roles are editable by the bot. No roles were deleted.\\n" +
          (names.length ? names.map((name) => "• " + name).join("\\n") : "No eligible roles found.") +
          (remainder ? "\\n… and " + remainder + " more." : "") +
          "\\n\\nReview role assignments and backups before setting COOPFT_ROLE_CLEANUP_CONFIRM=DELETE_EDITABLE_ROLES. Managed roles and roles above the bot remain untouched."
        );
        await this.setSetting(guild.id, "role_cleanup_preview_announced", true);
      }
    }
    if (cleanup.completed) {
      await this.postStaffUpdate(
        guild,
        this.emoji(guild.id, "cf3d_shield", "🛡️") + " One-time cleanup completed. Deleted " + cleanup.deleted +
        " editable roles. Unmanageable/managed roles were left in place."
      );
    }
    if (options.manual) await this.postStaffUpdate(guild, "Setup repaired by <@" + options.actorId + ">.");

    await me.setNickname("CoopFT • Assistant", "Per-server CoopFT identity").catch((error) =>
      console.warn("[coopft] Could not set CoopFT nickname:", error.message)
    );

    if (cleanup.awaitingConfirmation) {
      console.warn("[coopft] Role cleanup is preview-only. " + cleanup.candidates.length + " editable roles are eligible; no roles were deleted. Review the snapshot and confirm with COOPFT_ROLE_CLEANUP_CONFIRM.");
    }
    if (cleanup.failures?.length) console.warn("[coopft] Some roles could not be deleted:", cleanup.failures.join("; "));
    if (emojiResult.failed.length) console.warn("[coopft] Emoji fallbacks will be used for:", emojiResult.failed.join("; "));
    if (retiredRoles.retired.length) console.info("[coopft] Retired legacy CoopFT roles:", retiredRoles.retired.join(", "));
    if (retiredRoles.preserved.length) console.warn("[coopft] Legacy CoopFT roles were preserved for safety:", retiredRoles.preserved.join("; "));
    return { ...counts, cleanup, emojiResult, retiredRoles };
  }

  buildPanelBanner(title, subtitle, accent = "#A92E43") {
    const { createCanvas } = require("@napi-rs/canvas");
    const canvas = createCanvas(1200, 300);
    const ctx = canvas.getContext("2d");
    const bg = ctx.createLinearGradient(0, 0, 1200, 300);
    bg.addColorStop(0, "#07090D");
    bg.addColorStop(0.52, "#191117");
    bg.addColorStop(1, "#080B11");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 300);
    const glow = ctx.createRadialGradient(600, 120, 10, 600, 120, 620);
    glow.addColorStop(0, accent + "55");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1200, 300);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 20, 1156, 260);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.strokeRect(38, 36, 1124, 228);
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#F8F1ED";
    ctx.font = "bold 66px Arial";
    ctx.fillText(String(title).toUpperCase().slice(0, 28), 600, 137);
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    ctx.font = "bold 26px Arial";
    ctx.fillText(String(subtitle).toUpperCase().slice(0, 54), 600, 190);
    ctx.fillStyle = "rgba(245,235,229,0.7)";
    ctx.font = "17px Arial";
    ctx.fillText("COOPFT  •  COMMUNITY  •  SUPPORT", 600, 236);
    return canvas.toBuffer("image/png");
  }

  buildRulesEmblem() {
    const { createCanvas } = require("@napi-rs/canvas");
    const canvas = createCanvas(1200, 360);
    const ctx = canvas.getContext("2d");
    const background = ctx.createLinearGradient(0, 0, 1200, 360);
    background.addColorStop(0, "#07090D");
    background.addColorStop(0.48, "#1A1015");
    background.addColorStop(1, "#090B10");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 1200, 360);
    const glow = ctx.createRadialGradient(600, 150, 10, 600, 150, 650);
    glow.addColorStop(0, "rgba(184,35,54,0.30)");
    glow.addColorStop(0.55, "rgba(107,20,33,0.13)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1200, 360);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(214,70,83,0.9)";
    ctx.strokeRect(22, 22, 1156, 316);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(244,206,166,0.28)";
    ctx.strokeRect(38, 38, 1124, 284);
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#F7F0EA";
    ctx.font = "bold 92px Arial";
    ctx.fillText("COOPFT", 600, 150);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#E45A66";
    ctx.font = "bold 38px Arial";
    ctx.fillText("COMMUNITY CODE", 600, 210);
    ctx.strokeStyle = "rgba(232,151,145,0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(360, 232); ctx.lineTo(840, 232); ctx.stroke();
    ctx.fillStyle = "rgba(245,231,224,0.82)";
    ctx.font = "20px Arial";
    ctx.fillText("RESPECT  •  SAFETY  •  PRIVACY  •  COMMUNITY", 600, 275);
    for (const x of [120, 1080]) {
      ctx.save();
      ctx.translate(x, 180);
      ctx.strokeStyle = "rgba(226,75,90,0.72)";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-34, -48); ctx.lineTo(0, -15); ctx.lineTo(34, -48);
      ctx.lineTo(28, 22); ctx.lineTo(0, 58); ctx.lineTo(-28, 22); ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = "#9F2939";
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    return canvas.toBuffer("image/png");
  }

  async ensureStaffGuide(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the private CoopFT staff guide");
    if (!channel?.isTextBased?.() || typeof channel.send !== "function") {
      throw new Error("The private staff-guide channel is unavailable.");
    }
    const me = guild.members.me || await guild.members.fetchMe();
    const developerRole = this.roles.get("developer_member");
    const readOnlyStaff = STAFF_RANKS.map((spec) => this.roles.get(spec.key)).filter(Boolean)
      .map((role) => ({
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
      }));
    if (developerRole) readOnlyStaff.push({
      id: developerRole.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
    });
    await channel.permissionOverwrites.set([
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks
        ]
      },
      ...readOnlyStaff
    ], "Keep the CoopFT staff handbook readable by staff and Developers only");

    const q = (name, fallback) => this.emoji(guild.id, name, fallback);
    const pages = [
      {
        title: "1 • INTRODUCTION & STAFF STANDARDS",
        icon: q("cf3d_rolebook", "📖"),
        description: [
          q("emoji_18", "👥") + " Staff recruitment is limited to Junior Moderator, Moderator and Developer. Application controls are visible only to Owner Rank.",
          "Welcome to the CoopFT Staff Guide. This handbook explains how staff protect the community, apply the rules fairly, handle reports and keep internal work professional.",
          "",
          "THE STANDARD: be fair, calm, consistent, evidence-led and respectful. Always use common sense. Rank is responsibility, not permission to intimidate members.",
          "",
          "CORE DUTIES",
          "• Help members and direct them to the correct channels or ticket.",
          "• Enforce the published CoopFT rules consistently, without favoritism.",
          "• Keep a clear record of formal actions and important decisions.",
          "• Protect private reports, application answers, staff discussions and personal information.",
          "• Ask for guidance when a case is unclear or serious. Do not guess.",
          "",
          "STAFF ROLES",
          "• Junior Moderator: entry-level support, basic chat moderation, report triage and learning the procedures. Do not exceed your assigned permissions.",
          "• Moderator: handles member reports, routine enforcement, timeouts and clear case documentation.",
          "• Developer: builds custom Discord bots requested by members. This is a technical role, not a moderation rank; it has no moderator or administrative authority.",
          "• Owner Rank: Owner, Co-Owner and Monarch. They supervise recruitment, sensitive cases, policy decisions and final escalations.",
          "",
          "This guide applies to CoopFT only. Fukishōkai economy commands, TSBCC procedures and Fukishōkai-only channels are not CoopFT workflows."
        ].join("\n")
      },
      {
        title: "2 • MODERATION DECISIONS & WARNINGS",
        icon: q("cf3d_shield", "🛡️"),
        description: [
          "Choose the least severe action that safely addresses the behaviour. Consider intent, repetition, impact, context, prior history and whether the member complied after being asked to stop.",
          "",
          "LOW SEVERITY — REMINDER OR VERBAL WARNING",
          "Examples: first minor disruption, off-topic posting, mild spam, excessive caps, repeated low-level interruptions or a minor misunderstanding of channel rules. Explain what needs to change and give the member a reasonable chance to comply.",
          "",
          "MODERATE SEVERITY — FORMAL WARNING AND PROPORTIONATE TIMEOUT",
          "Examples: repeated disruption after a reminder, persistent spamming or mass mentions, targeted arguments, minimodding, repeated harassment, inappropriate sexual remarks, or continuing to ignore staff instructions. Record the exact behaviour and choose a proportionate timeout where necessary.",
          "",
          "SEVERE — IMMEDIATE STAFF INTERVENTION AND OWNER RANK ESCALATION",
          "Examples: hate speech, targeted discrimination, serious harassment, sexual harassment, credible threats, malicious links, scams, raids, doxxing threats, attempts to compromise accounts or other serious Discord Terms violations. Preserve evidence and use a timeout, kick or ban only when justified and within your permissions.",
          "",
          "CRITICAL / SAFETY CASES",
          "Credible threats of real-world harm, grooming, child sexual exploitation, extortion, doxxing or imminent danger must be escalated to Owner Rank immediately. Do not investigate alone, repost explicit material, confront suspected offenders privately or circulate sensitive evidence. Use Discord reporting tools where appropriate.",
          "",
          "CONTEXT MATTERS",
          "A word filter, a quoted message, an obvious typo, reclaimed language, a joke and a direct targeted insult are not automatically the same situation. Review the surrounding context. When unsure, pause and ask Owner Rank before issuing a severe punishment."
        ].join("\n")
      },
      {
        title: "3 • HOW TO HANDLE A REPORT",
        icon: q("verified", "✅"),
        description: [
          "1. REVIEW THE EVIDENCE. Read the surrounding conversation, check the message link and timestamp, identify the people involved, and distinguish first-hand evidence from hearsay.",
          "",
          "2. STOP IMMEDIATE HARM. Where necessary, use a proportionate timeout or remove harmful content. Do not publicly argue with the reported member.",
          "",
          "3. EXPLAIN THE ACTION. State the rule or behaviour, the action taken and what the member should do next. Keep wording neutral and specific.",
          "",
          "4. RECORD THE CASE. Use /warn, /timeout, /kick or /ban as appropriate. Add a clear reason. Use /case to check a case and /warnings to review a member's active warning history.",
          "",
          "5. ESCALATE UNCERTAINTY. Send a private summary to Owner Rank or ask a senior moderator for guidance. Include links, dates and the action already taken.",
          "",
          "6. CLOSE THE LOOP. Update the ticket/report, avoid promising a particular outcome and do not share internal deliberations with uninvolved members.",
          "",
          "USEFUL COOPFT COMMANDS",
          "/warn • /warnings • /case • /timeout • /untimeout • /kick • /ban • /unban • /note • /notes",
          "",
          "A formal reason must be factual: describe the behaviour, not your opinion of the person. Never issue a warning simply because a member disagrees with staff."
        ].join("\n")
      },
      {
        title: "4 • BLACKLISTS, PRIVACY & ESCALATION",
        icon: q("7300lock", "🔒"),
        description: [
          "COOPFT DOES NOT CURRENTLY OPERATE THE FUKISHŌKAI BLACKLIST SYSTEM. Do not use Fukishōkai /bl-request, TSBCC blacklist categories, blacklist appeal procedures or Fukishōkai-only channels in CoopFT. Do not invent a CoopFT blacklist or promise a blacklist outcome.",
          "",
          "For serious, repeated or safety-related behaviour, collect the available evidence and refer the case to Owner Rank. Owner Rank decides whether a ban, removal, further review or a future policy process is appropriate.",
          "",
          "PRIVATE INFORMATION",
          "• Never leak application answers, staff conversations, internal announcements, moderation notes or ticket transcripts.",
          "• Never publish addresses, phone numbers, account credentials, tokens, private documents or personal details.",
          "• Share evidence only with staff who need it to resolve the case.",
          "• Do not use personal DMs to threaten, pressure or negotiate with a reported member.",
          "• Do not promise confidentiality beyond what the platform and staff process can provide.",
          "",
          "WHEN TO ESCALATE IMMEDIATELY",
          "Doxxing, credible threats, exploitation, suspected account compromise, raids, extortion, serious TOS violations, staff misconduct involving authority, or any case where you feel unsafe or unsure.",
          "",
          "If a member reports an urgent safety issue, acknowledge the report, preserve relevant message links and notify Owner Rank. Do not delay escalation while trying to make the case look complete."
        ].join("\n")
      },
      {
        title: "5 • PROFESSIONAL CONDUCT, STRIKES & PROMOTIONS",
        icon: q("cf3d_crown", "👑"),
        description: [
          "EXPECTED CONDUCT",
          "• Be respectful in public and private. Do not bait, insult or argue with members.",
          "• Do not show favoritism toward friends, partners, donors or other staff.",
          "• Do not use staff powers for personal disputes, entertainment or retaliation.",
          "• Follow reasonable instructions from higher-ranked staff.",
          "• Do not leak the staff guide, moderation decisions, application details or internal announcements.",
          "• If unavailable, notify the appropriate staff channel rather than silently disappearing.",
          "• Correct mistakes honestly. Do not delete evidence or falsify a reason to hide an invalid action.",
          "",
          "STRIKEABLE CONDUCT MAY INCLUDE",
          "False or unjustified warnings/timeouts, misuse of authority, favoritism, repeated unprofessional conduct, ignoring assigned duties, leaking internal material, avoidable inactivity without notice, or disrespect toward members or staff.",
          "",
          "SERIOUS MISCONDUCT MAY LEAD TO DEMOTION OR REMOVAL",
          "Repeated abuse of moderation tools, deliberate disclosure of sensitive information, retaliation, deliberate insubordination, serious disloyalty, or actions that put the community at risk.",
          "",
          "PROMOTIONS AND QUOTAS",
          "Promotion is based on consistent judgment, activity, professionalism, accurate records, teamwork and trust. Owner Rank publishes any applicable activity targets and promotion timelines. Do not invent a quota or promise a promotion date that has not been officially announced.",
          "",
          "Owner Rank determines the appropriate response to staff misconduct. Invalid or careless punishment decisions may themselves be reviewed."
        ].join("\n")
      },
      {
        title: "6 • DEVELOPER PLAYBOOK & CUSTOM BOT COMMISSIONS",
        icon: q("cf3d_developer", "💻"),
        description: [
          "DEVELOPER RESPONSIBILITIES",
          "The Developer role is responsible for designing and building custom Discord bots requested by members. It is a technical service role, not a moderation position.",
          "",
          "PROJECT WORKFLOW",
          "1. Review the custom bot ticket and all form answers.",
          "2. Clarify requirements, user flows, permissions, integrations, data storage and edge cases before agreeing to scope.",
          "3. Ask Owner Rank to confirm the final price and payment terms with the customer.",
          "4. Build only the agreed features. Keep credentials and private data secure; never ask a customer to post bot tokens in a ticket.",
          "5. Test the bot, document setup requirements and prepare the project as a ZIP folder containing the code.",
          "6. Explain what the customer must configure and what is not included.",
          "",
          "PAYMENT RULES",
          "Only Robux or Discord Nitro are accepted. The price depends on the requested bot's complexity, features and integrations. Only Cookie/Brian (the server Owner) or another verified Owner Rank member may receive payment. Developers and other staff must never collect payment themselves. A customer must receive a confirmed quote and verified recipient from Owner Rank before paying.",
          "",
          "CURRENT DELIVERY LIMITATION",
          "For now, the deliverable is the ZIP folder of code only. The team does not host, deploy or operate the customer's bot, and does not promise 24/7 uptime. Hosting may become available in the future, but it is not part of the current service.",
          "",
          "Never promise free work, a fixed price, hosting, a deployment date or ongoing maintenance unless Owner Rank has expressly approved it."
        ].join("\n")
      }
    ];

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const embed = new EmbedBuilder()
        .setColor(index === 5 ? 0x397C94 : 0x8C2635)
        .setTitle(page.icon + "  COOPFT STAFF GUIDE  •  " + page.title)
        .setDescription(page.description)
        .setFooter({ text: "INTERNAL STAFF MATERIAL • Page " + (index + 1) + " of " + pages.length + " • Do not share outside CoopFT staff" })
        .setTimestamp();
      const resourceKey = "message:staff_guide_" + (index + 1);
      const savedId = await this.getResource(guild.id, resourceKey);
      let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
      if (message) {
        await message.edit({ embeds: [embed], components: [], allowedMentions: { parse: [] } });
      } else {
        message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        await this.saveResource(guild.id, resourceKey, message.id);
      }
    }
    console.info("[coopft] Published " + pages.length + " CoopFT staff-guide pages in #" + channel.name + ".");
  }

  async ensureCustomBotRequestPanel(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the custom bot commission information");
    if (!channel?.isTextBased?.() || typeof channel.send !== "function") {
      throw new Error("The custom-bot-requests channel is unavailable.");
    }
    const me = guild.members.me || await guild.members.fetchMe();
    await channel.permissionOverwrites.set([
      {
        id: guild.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [
          PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads,
          PermissionFlagsBits.SendMessagesInThreads
        ]
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages
        ]
      }
    ], "Make custom bot commission information read-only for members");

    const ticketChannelId = await this.getResource(guild.id, "channel:open_ticket");
    const customEmoji = (name, fallback) => this.emoji(guild.id, name, fallback);
    const banner = new AttachmentBuilder(
      this.buildPanelBanner("Custom Bot Commissions", "Robux or Nitro • ZIP code delivery only", "#397C94"),
      { name: "coopft-custom-bot-commissions.png" }
    );
    const embed = new EmbedBuilder()
      .setColor(0x397C94)
      .setTitle(customEmoji("cf3d_developer", "💻") + "  CUSTOM DISCORD BOT COMMISSIONS")
      .setDescription([
        "Want a custom Discord bot built for your server or project? CoopFT can review a scoped development request.",
        "",
        "WHAT YOU RECEIVE",
        "A tested project delivered as a ZIP folder containing the code. You receive the project files and setup information.",
        "",
        "PAYMENT METHODS",
        "Only Robux or Discord Nitro are accepted. " + customEmoji("boost", "✨") + " Server boosts are not a payment method. " +
          customEmoji("PayPal", "🚫") + " PayPal and all other payment methods are not accepted.",
        "",
        "PRICING",
        "There is no single fixed price. The final quote depends on the requested bot, complexity, features, integrations and scope. Owner Rank confirms the price before any payment is made.",
        "",
        "WHO CAN RECEIVE PAYMENT?",
        customEmoji("verified", "✅") + " Payment goes only to Cookie/Brian (the CoopFT Owner) or another verified Owner Rank member (Owner, Co-Owner or Monarch). Developers and other staff must never collect payment. Confirm the recipient inside your private ticket before paying.",
        "",
        "CURRENT LIMITATION",
        customEmoji("7300lock", "🔒") + " The current service provides the ZIP folder of code only. Hosting, deployment, operation and 24/7 uptime are not included or currently available. Hosting may be introduced in the future, but it is not offered yet.",
        "",
        "HOW TO REQUEST",
        "Open " + (ticketChannelId ? "<#" + ticketChannelId + ">" : "the ticket channel") + ", choose Custom Bot Development, and complete the project form. Describe the features and integrations you need. Wait for Owner Rank to confirm the quote and payment recipient before sending anything.",
        "",
        "No payment is requested by this information panel. Do not send Robux or Nitro until Owner Rank confirms your quote and the verified recipient in the private ticket."
      ].join("\n"))
      .setImage("attachment://coopft-custom-bot-commissions.png")
      .setFooter({ text: "COOPFT DEVELOPMENT • Paid commissions • ZIP delivery only • No hosting at present" })
      .setTimestamp();

    const savedId = await this.getResource(guild.id, "message:custom_bot_requests");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const payload = {
      embeds: [embed],
      files: [banner],
      attachments: [],
      components: [],
      allowedMentions: { parse: [] }
    };
    if (message) await message.edit(payload);
    else {
      message = await channel.send(payload);
      await this.saveResource(guild.id, "message:custom_bot_requests", message.id);
    }
    console.info("[coopft] Published read-only custom bot commission information.");
  }

  async ensureBrandMessages(guild, publicChannels) {
    this.assertCoopFTGuild(guild, "publish CoopFT messages");
    const retiredKeys = ["welcome", "introductions", "announcements", "suggestions", "bot_updates"];
    for (const key of retiredKeys) {
      const messageId = await this.getResource(guild.id, "message:" + key);
      const channel = publicChannels[key];
      if (messageId && channel?.messages) {
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (message) await message.delete().catch((error) =>
          console.warn("[coopft] Could not remove the obsolete " + key + " information post:", error.message)
        );
      }
      if (messageId) await this.setSetting(guild.id, "resource:message:" + key, null);
    }

    let bannerAttachment = null;
    try {
      bannerAttachment = new AttachmentBuilder(this.buildRulesEmblem(), { name: "coopft-rules-banner.png" });
    } catch (error) {
      console.warn("[coopft] Could not render rules banner; using a clean text-only rules embed:", error.message);
    }
    const rules = new EmbedBuilder()
      .setColor(0x8C2635)
      .setTitle(this.emoji(guild.id, "cf3d_rules", "📜") + "  COOPFT | COMMUNITY CODE")
      .setDescription("Welcome to **CoopFT**. Keep this community safe, respectful and enjoyable for everyone. These standards apply to all members, including staff.")
      .addFields(
        { name: this.emoji(guild.id, "cf3d_handshake", "🤝") + "  RESPECT PEOPLE", value: "Treat others with dignity. Harassment, hate speech, discrimination, threats, targeted abuse and personal attacks are not allowed.", inline: true },
        { name: this.emoji(guild.id, "cf3d_spark", "✨") + "  KEEP IT CONSTRUCTIVE", value: "Use the right channels. Do not flood chats, spam mentions, disrupt conversations or deliberately provoke arguments.", inline: true },
        { name: this.emoji(guild.id, "cf3d_shield", "🛡️") + "  KEEP COOPFT SAFE", value: "No scams, phishing, malware, malicious links, raids, impersonation or attempts to bypass moderation.", inline: true },
        { name: this.emoji(guild.id, "cf3d_key", "🔐") + "  PROTECT PRIVACY", value: "Never publish passwords, tokens, private documents, personal addresses or someone else's private information.", inline: true },
        { name: this.emoji(guild.id, "cf3d_announce", "📢") + "  ADVERTISING AND CONTENT", value: "Promotions and server invites need staff approval. Keep shared content appropriate and follow Discord's Terms and Community Guidelines.", inline: true },
        { name: this.emoji(guild.id, "cf3d_ticket", "🎟️") + "  STAFF AND SUPPORT", value: "Follow reasonable staff instructions. Use **#suggestions** for ideas and **#open-a-ticket** for support, reports or appeals.", inline: true }
      )
      .setFooter({ text: "CoopFT • Respect the space. Elevate the community." })
      .setTimestamp();
    if (bannerAttachment) rules.setImage("attachment://coopft-rules-banner.png");

    const channel = publicChannels.rules;
    if (!channel?.isTextBased?.() || typeof channel.send !== "function") {
      throw new Error("The CoopFT rules channel is unavailable.");
    }
    const savedId = await this.getResource(guild.id, "message:rules");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const payload = {
      embeds: [rules],
      files: bannerAttachment ? [bannerAttachment] : [],
      allowedMentions: { parse: [] }
    };
    try {
      if (message) await message.edit({ ...payload, attachments: [] });
      else {
        message = await channel.send(payload);
        await this.saveResource(guild.id, "message:rules", message.id);
      }
      console.info("[coopft] Published the consolidated community code in #" + channel.name + ".");
    } catch (error) {
      console.error("[coopft] Could not publish the CoopFT community code:", error.code || error.name, error.message);
      if (!bannerAttachment) throw error;
      const fallback = EmbedBuilder.from(rules.toJSON());
      fallback.setImage(null);
      if (message) await message.edit({ embeds: [fallback], files: [], attachments: [], allowedMentions: { parse: [] } });
      else {
        message = await channel.send({ embeds: [fallback], allowedMentions: { parse: [] } });
        await this.saveResource(guild.id, "message:rules", message.id);
      }
      console.warn("[coopft] Published the community code without the optional banner image.");
    }
  }

  async removeRetiredRoleGuide(guild) {
    this.assertCoopFTGuild(guild, "retire the obsolete CoopFT role guide");
    const channelId = await this.getResource(guild.id, "channel:role_guide");
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    const shouldDelete = channel && ["▤・role-explanations", "role-explanations"].includes(channel.name);
    if (shouldDelete) await channel.delete("Retire the unnecessary CoopFT role explanations channel");
    else if (channel) console.warn("[coopft] Preserved the saved role-guide channel because its name no longer matches the managed channel.");
    await this.setSetting(guild.id, "resource:channel:role_guide", null);
    await this.setSetting(guild.id, "resource:message:role_guide", null);
    return Boolean(shouldDelete);
  }

  async ensureApplicationPanel(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the CoopFT application panel");
    if (!channel?.isTextBased?.()) return;
    let applicationsOpen = await this.getSetting(guild.id, "applications_open");
    if (applicationsOpen === null) {
      applicationsOpen = true;
      await this.setSetting(guild.id, "applications_open", true);
    }
    const banner = new AttachmentBuilder(
      this.buildPanelBanner("Staff Applications", applicationsOpen ? "Applications now open" : "Applications temporarily closed", "#8C2635"),
      { name: "coopft-applications-banner.png" }
    );
    const embed = new EmbedBuilder()
      .setColor(applicationsOpen ? 0x267A58 : 0x963A48)
      .setTitle("COOPFT  |  STAFF & DEVELOPER APPLICATIONS")
      .setDescription(applicationsOpen ? [
        "**Applications are currently open.**",
        "",
        "Choose one of the three available tracks and complete the private form. Your answers are delivered to the Owner Rank review team.",
        "",
        "**Junior Moderator**",
        "An entry-level moderation role focused on member support, learning procedures and handling approved low-risk duties.",
        "",
        "**Moderator**",
        "A moderation role responsible for reports, member safety, consistent rule enforcement and clear case records.",
        "",
        "**Developer**",
        "Builds custom Discord bots requested by members. This is a technical service role, not a moderation rank.",
        "",
        "Each applicant may have one pending application per track. Decisions are sent privately."
      ].join("\n") : [
        "**Applications are currently closed.**",
        "",
        "The CoopFT Owner Rank has temporarily paused recruitment. Please check again later.",
        "",
        "Available tracks when recruitment reopens: Junior Moderator, Moderator and Developer."
      ].join("\n"))
      .setImage("attachment://coopft-applications-banner.png")
      .setFooter({ text: "COOPFT  •  " + (applicationsOpen ? "RECRUITMENT OPEN" : "RECRUITMENT CLOSED") });
    const components = applicationsOpen ? [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("cf-application:position-select")
          .setPlaceholder("Choose Junior Moderator, Moderator or Developer")
          .setMinValues(1).setMaxValues(1)
          .addOptions(APPLICATION_RANKS.map((role) => ({
            label: role.name,
            value: role.key,
            description: role.description.slice(0, 100),
            emoji: this.emojis.has(role.emoji) ? { id: this.emojis.get(role.emoji), name: role.emoji } : role.icon
          })))
      )
    ] : [];
    const savedId = await this.getResource(guild.id, "message:application_panel");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const payload = { embeds: [embed], components, files: [banner], attachments: [], allowedMentions: { parse: [] } };
    if (message) await message.edit(payload);
    else {
      message = await channel.send(payload);
      await this.saveResource(guild.id, "message:application_panel", message.id);
    }
  }

  async ensureApplicationControlPanel(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the private application controls");
    if (!channel?.isTextBased?.()) throw new Error("The private application-control channel is unavailable.");
    const open = (await this.getSetting(guild.id, "applications_open")) !== false;
    const embed = new EmbedBuilder()
      .setColor(0x8C2635)
      .setTitle(this.emoji(guild.id, "cf3d_applications", "📋") + "  OWNER RANK | RECRUITMENT CONTROL")
      .setDescription([
        "This private panel is restricted to **Owner, Co-Owner and Monarch**.",
        "",
        "**Current status:** " + (open ? "🟢 OPEN — public applications are accepting submissions." : "🔴 CLOSED — the public form is disabled."),
        "",
        "Use the controls below to open or close recruitment. Closing applications removes the public submission menu immediately; existing pending applications remain in the review queue.",
        "",
        "**Available tracks:** Junior Moderator • Moderator • Developer"
      ].join("\n"))
      .setFooter({ text: "PRIVATE • OWNER RANK ONLY • CoopFT recruitment controls" })
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cf-application-control:open").setLabel("Open applications")
        .setStyle(ButtonStyle.Success).setEmoji("🟢").setDisabled(open),
      new ButtonBuilder().setCustomId("cf-application-control:close").setLabel("Close applications")
        .setStyle(ButtonStyle.Danger).setEmoji("🔴").setDisabled(!open)
    );
    const payload = { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
    const savedId = await this.getResource(guild.id, "message:application_control");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    if (message) await message.edit(payload);
    else {
      message = await channel.send(payload);
      await this.saveResource(guild.id, "message:application_control", message.id);
    }
  }

  async handleApplicationControlButton(interaction) {
    this.assertCoopFTGuild(interaction.guild, "change CoopFT recruitment status");
    if (interaction.guildId !== this.guildId) {
      await interaction.reply({ content: "Recruitment controls are only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!this.canManageApplications(interaction.member, interaction.guild)) {
      await interaction.reply({ content: "Only Owner, Co-Owner or Monarch can open or close applications.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const action = interaction.customId.split(":")[1];
    if (!["open", "close"].includes(action)) {
      await interaction.reply({ content: "Unknown recruitment control.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const open = action === "open";
    await this.setSetting(interaction.guildId, "applications_open", open);
    const publicId = await this.getResource(interaction.guildId, "channel:applications");
    const publicChannel = publicId ? await interaction.guild.channels.fetch(publicId).catch(() => null) : null;
    if (!publicChannel?.isTextBased?.()) throw new Error("The public applications channel could not be found.");
    await this.ensureApplicationPanel(interaction.guild, publicChannel);
    await this.ensureApplicationControlPanel(interaction.guild, interaction.channel);
    await interaction.reply({
      content: open
        ? "Recruitment is now **OPEN**. The public application menu is active."
        : "Recruitment is now **CLOSED**. The public application menu has been disabled.",
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  getApplicationQuestions(role) {
    if (role.category === "developer") {
      return [
        ["experience", "What bots have you built before?", TextInputStyle.Paragraph, true, 900],
        ["portfolio", "Share portfolio, GitHub or demo links", TextInputStyle.Paragraph, true, 900],
        ["workflow", "How do you scope and build a custom bot request?", TextInputStyle.Paragraph, true, 900],
        ["security", "How do you protect bot tokens and user data?", TextInputStyle.Paragraph, true, 900],
        ["support", "What is your availability for updates and support?", TextInputStyle.Paragraph, true, 900]
      ];
    }
    return [
      ["experience", "What relevant moderation experience do you have?", TextInputStyle.Paragraph, true, 900],
      ["motivation", "Why do you want this position?", TextInputStyle.Paragraph, true, 900],
      ["scenario", "How would you handle a difficult situation?", TextInputStyle.Paragraph, true, 900],
      ["availability", "What is your usual weekly availability?", TextInputStyle.Short, true, 250],
      ["extra", "Anything else we should know? (optional)", TextInputStyle.Paragraph, false, 700]
    ];
  }

  createApplicationModal(role) {
    const modal = new ModalBuilder()
      .setCustomId("cf-application:submit:" + role.key)
      .setTitle((role.category === "developer" ? "Developer application" : "Staff application") + " | " + role.name);
    const questions = this.getApplicationQuestions(role);
    modal.addComponents(...questions.map(([id, label, style, required, maxLength]) =>
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label)
        .setStyle(style).setRequired(required).setMaxLength(maxLength)
        .setPlaceholder(id === "portfolio" ? "Links to work you can share publicly" :
          id === "availability" ? "For example: weekday evenings and weekends" : "Write a clear, honest answer"))
    ));
    return modal;
  }

  buildApplicationReviewComponents(applicationId) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("cf-application:accept:" + applicationId).setLabel("Accept").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("cf-application:accept-reason:" + applicationId).setLabel("Accept with reason").setStyle(ButtonStyle.Success)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("cf-application:deny:" + applicationId).setLabel("Deny").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("cf-application:deny-reason:" + applicationId).setLabel("Deny with reason").setStyle(ButtonStyle.Danger)
      )
    ];
  }

  async handleApplicationSelectMenu(interaction) {
    this.assertCoopFTGuild(interaction.guild, "select a CoopFT staff application position");
    if (interaction.guildId !== this.guildId || interaction.customId !== "cf-application:position-select") {
      await interaction.reply({ content: "This application panel is only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if ((await this.getSetting(interaction.guildId, "applications_open")) === false) {
      await interaction.reply({ content: "CoopFT recruitment is currently closed.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const role = APPLICATION_RANKS.find((item) => item.key === interaction.values?.[0]);
    if (!role) {
      await interaction.reply({ content: "That staff position is not available for applications.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.showModal(this.createApplicationModal(role));
    return true;
  }

  async handleApplicationButton(interaction) {
    this.assertCoopFTGuild(interaction.guild, "process a CoopFT application review");
    if (interaction.guildId !== this.guildId) {
      await interaction.reply({ content: "Application reviews are only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const [, action, applicationId] = interaction.customId.split(":");
    if (!["accept", "accept-reason", "deny", "deny-reason"].includes(action)) {
      await interaction.reply({ content: "This application review action is not recognized.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!this.canManageApplications(interaction.member, interaction.guild)) {
      await interaction.reply({ content: "Only Owner, Co-Owner or Monarch can review CoopFT applications.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (action.endsWith("-reason")) {
      const decision = action === "accept-reason" ? "accept" : "deny";
      const modal = new ModalBuilder()
        .setCustomId("cf-application:decision-reason:" + decision + ":" + applicationId)
        .setTitle(decision === "accept" ? "Accept application" : "Deny application");
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("reason")
          .setLabel(decision === "accept" ? "Reason for acceptance" : "Reason for denial")
          .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)
          .setPlaceholder("Write a clear, respectful explanation.")
      ));
      await interaction.showModal(modal);
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.resolveApplication(interaction, applicationId, action, null);
    await interaction.editReply({
      content: (action === "accept" ? "Application accepted" : "Application denied") +
        " for **" + result.roleName + "**. The applicant has been sent a private decision summary."
    });
    return true;
  }

  async handleApplicationModal(interaction) {
    this.assertCoopFTGuild(interaction.guild, "save a CoopFT staff application");
    if (interaction.guildId !== this.guildId) {
      await interaction.reply({ content: "Applications are only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if ((await this.getSetting(interaction.guildId, "applications_open")) === false) {
      await interaction.reply({ content: "CoopFT recruitment has closed. Your form was not submitted.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const role = APPLICATION_RANKS.find((item) => item.key === interaction.customId.split(":")[2]);
    if (!role) {
      await interaction.reply({ content: "That application track is no longer available.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const answers = {};
    const questions = this.getApplicationQuestions(role);
    for (const [fieldId, label, style, required] of questions) {
      const value = interaction.fields.getTextInputValue(fieldId).trim();
      if (required && !value) {
        return interaction.editReply({ content: "Please complete the required field: " + label + "." });
      }
      answers[fieldId] = value;
    }
    const duplicate = await this.pool.query(
      "SELECT id FROM coopft_applications WHERE guild_id=$1 AND applicant_id=$2 AND role_key=$3 AND status='pending' LIMIT 1",
      [interaction.guildId, interaction.user.id, role.key]
    );
    if (duplicate.rowCount) {
      return interaction.editReply({ content: "You already have a pending application for **" + role.name + "**." });
    }
    let inserted;
    try {
      inserted = await this.pool.query(
        "INSERT INTO coopft_applications (guild_id,applicant_id,role_key,answers) VALUES ($1,$2,$3,$4::jsonb) RETURNING id,created_at",
        [interaction.guildId, interaction.user.id, role.key, JSON.stringify(answers)]
      );
    } catch (error) {
      if (error.code === "23505") return interaction.editReply({ content: "You already have a pending application for **" + role.name + "**." });
      throw error;
    }
    const reviewChannelId = await this.getResource(interaction.guildId, "channel:application_review");
    const reviewChannel = reviewChannelId ? await interaction.guild.channels.fetch(reviewChannelId).catch(() => null) : null;
    if (!reviewChannel?.isTextBased?.()) {
      await this.pool.query(
        "UPDATE coopft_applications SET status='withdrawn',review_note='Review channel unavailable' WHERE id=$1",
        [inserted.rows[0].id]
      );
      return interaction.editReply({ content: "Your application could not reach the private Owner Rank review team. Please contact a server owner." });
    }
    const application = inserted.rows[0];
    const fields = [
      { name: "Applicant", value: "<@" + interaction.user.id + ">  •  " + interaction.user.tag, inline: false },
      { name: "Position requested", value: role.name, inline: true },
      { name: "Submitted", value: "<t:" + Math.floor(new Date(application.created_at).getTime() / 1000) + ":R>", inline: true }
    ];
    for (const [fieldId, label] of questions) {
      fields.push({
        name: label,
        value: (answers[fieldId] || "Not provided").slice(0, 1024),
        inline: false
      });
    }
    const reviewEmbed = new EmbedBuilder()
      .setColor(role.category === "developer" ? 0x397C94 : 0x28384F)
      .setTitle("NEW APPLICATION  |  " + role.name.toUpperCase())
      .setDescription("A CoopFT application has been submitted and is awaiting an Owner Rank decision.")
      .addFields(fields.slice(0, 25))
      .setFooter({ text: "Private application reference  •  " + application.id });
    let reviewMessage;
    try {
      reviewMessage = await reviewChannel.send({
        embeds: [reviewEmbed],
        components: this.buildApplicationReviewComponents(application.id),
        allowedMentions: { parse: [] }
      });
    } catch (error) {
      await this.pool.query(
        "UPDATE coopft_applications SET status='withdrawn',review_note=$2 WHERE id=$1 AND status='pending'",
        [application.id, ("Review delivery failed: " + error.message).slice(0, 500)]
      );
      console.error("[coopft] Could not publish an application to the private Owner Rank review channel:", error.message);
      return interaction.editReply({ content: "Your application was saved, but the Owner Rank review team could not receive it. Please contact a server owner." });
    }
    await this.pool.query("UPDATE coopft_applications SET review_message_id=$2 WHERE id=$1", [application.id, reviewMessage.id]);
    await interaction.editReply({
      content: "Your **" + role.name + "** application has been submitted privately to the Owner Rank review team. You will receive the decision by DM."
    });
    return true;
  }

  async handleApplicationDecisionReason(interaction) {
    this.assertCoopFTGuild(interaction.guild, "submit a CoopFT application decision");
    const [, , decision, applicationId] = interaction.customId.split(":");
    if (interaction.guildId !== this.guildId || !["accept", "deny"].includes(decision)) {
      await interaction.reply({ content: "This application decision is invalid.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!this.canManageApplications(interaction.member, interaction.guild)) {
      await interaction.reply({ content: "Only Owner, Co-Owner or Monarch can review CoopFT applications.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const reason = interaction.fields.getTextInputValue("reason").trim();
    if (!reason) {
      await interaction.reply({ content: "Please provide a reason before submitting.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.resolveApplication(interaction, applicationId, decision, reason);
    await interaction.editReply({
      content: (decision === "accept" ? "Application accepted" : "Application denied") +
        " for **" + result.roleName + "**. The applicant has been sent your decision summary."
    });
    return true;
  }

  async resolveApplication(interaction, applicationId, decision, reason = null) {
    this.assertCoopFTGuild(interaction.guild, "review a CoopFT application");
    if (!this.canManageApplications(interaction.member, interaction.guild)) {
      throw new Error("Only Owner, Co-Owner or Monarch can make application decisions.");
    }
    if (!["accept", "deny"].includes(decision)) throw new Error("Unknown application decision.");
    const selected = await this.pool.query(
      "SELECT * FROM coopft_applications WHERE guild_id=$1 AND id=$2 AND status='pending' LIMIT 1",
      [interaction.guildId, applicationId]
    );
    const application = selected.rows[0];
    if (!application) throw new Error("This application has already been reviewed or no longer exists.");
    const roleSpec = APPLICATION_RANKS.find((item) => item.key === application.role_key);
    if (!roleSpec) throw new Error("This application track is no longer available.");
    const assignedRoleKey = roleSpec.roleKey || roleSpec.key;
    const member = await interaction.guild.members.fetch(application.applicant_id).catch(() => null);
    if (decision === "accept" && !member) throw new Error("The applicant is no longer in CoopFT. The application was left pending.");

    let role = null;
    if (decision === "accept") {
      role = this.roles.get(assignedRoleKey) || null;
      if (!role) {
        const roleSource = [...STAFF_RANKS, ...MEMBER_ROLES].find((item) => item.key === assignedRoleKey);
        if (!roleSource) throw new Error("The role for this application track is not configured.");
        role = (await this.ensureRole(interaction.guild, roleSource)).role;
        this.roles.set(assignedRoleKey, role);
      }
    }
    const newStatus = decision === "accept" ? "approved" : "declined";
    const claimed = await this.pool.query(
      "UPDATE coopft_applications SET status=$3,reviewed_by=$4,reviewed_at=NOW(),review_note=$5 WHERE guild_id=$1 AND id=$2 AND status='pending' RETURNING id",
      [interaction.guildId, applicationId, newStatus, interaction.user.id, reason]
    );
    if (!claimed.rowCount) throw new Error("Another reviewer has already processed this application.");

    if (decision === "accept") {
      const addedRole = !member.roles.cache.has(role.id);
      const removedPreviousRoles = [];
      const previousRank = roleSpec.category === "staff" ? this.getStaffRankKey(member) : null;
      try {
        if (addedRole) await member.roles.add(role, "CoopFT " + roleSpec.name + " application accepted by " + interaction.user.tag);
        if (roleSpec.category === "staff") {
          for (const rank of STAFF_RANKS) {
            if (rank.key === assignedRoleKey) continue;
            const oldRole = this.roles.get(rank.key);
            if (!oldRole || !member.roles.cache.has(oldRole.id)) continue;
            await member.roles.remove(oldRole, "CoopFT application accepted; replace previous staff rank");
            removedPreviousRoles.push(oldRole);
          }
          await this.pool.query(
            "INSERT INTO coopft_staff_members (guild_id,member_id,rank_key,active,updated_by) VALUES ($1,$2,$3,TRUE,$4) " +
            "ON CONFLICT (guild_id,member_id) DO UPDATE SET rank_key=EXCLUDED.rank_key,active=TRUE,updated_at=NOW(),updated_by=EXCLUDED.updated_by",
            [interaction.guildId, member.id, assignedRoleKey, interaction.user.id]
          );
          await this.recordStaffAudit(interaction.guildId, interaction.user.id, member.id, "application_accepted", {
            applicationId, from: previousRank, to: assignedRoleKey, reason
          });
        } else {
          await this.recordStaffAudit(interaction.guildId, interaction.user.id, member.id, "developer_application_accepted", {
            applicationId, role: assignedRoleKey, reason
          });
        }
        await this.updateStaffDirectory(interaction.guild);
      } catch (error) {
        await this.pool.query(
          "UPDATE coopft_applications SET status='pending',reviewed_by=NULL,reviewed_at=NULL,review_note=NULL WHERE id=$1",
          [applicationId]
        ).catch(() => {});
        if (addedRole) await member.roles.remove(role, "Roll back failed CoopFT application acceptance").catch(() => {});
        for (const oldRole of removedPreviousRoles) {
          await member.roles.add(oldRole, "Restore previous CoopFT staff rank after failed application acceptance").catch(() => {});
        }
        throw error;
      }
    }

    let reviewMessage = interaction.message || null;
    if (!reviewMessage && application.review_message_id) {
      const reviewChannelId = await this.getResource(interaction.guildId, "channel:application_review");
      const reviewChannel = reviewChannelId ? await interaction.guild.channels.fetch(reviewChannelId).catch(() => null) : null;
      reviewMessage = reviewChannel?.messages ? await reviewChannel.messages.fetch(application.review_message_id).catch(() => null) : null;
    }
    if (reviewMessage) {
      const original = reviewMessage.embeds?.[0];
      const finalEmbed = original ? EmbedBuilder.from(original) : new EmbedBuilder().setTitle("COOPFT APPLICATION");
      const decisionText = decision === "accept" ? "ACCEPTED" : "DENIED";
      const summaryLines = [
        "**Decision:** " + decisionText,
        "**Reviewed by:** <@" + interaction.user.id + ">",
        decision === "accept"
          ? (roleSpec.category === "developer" ? "**Assigned role:** Developer" : "**Assigned rank:** " + roleSpec.name)
          : "**No role was assigned.**",
        reason ? "**Review note:** " + reason : "**Review note:** No additional feedback was provided."
      ];
      finalEmbed.setColor(decision === "accept" ? 0x267A58 : 0x963A48)
        .setDescription([original?.description, "", summaryLines.join("\n")].filter(Boolean).join("\n"))
        .setFooter({ text: "Application reference  •  " + applicationId + "  •  " + decisionText });
      await reviewMessage.edit({ embeds: [finalEmbed], components: [], allowedMentions: { parse: [] } }).catch((error) => {
        console.warn("[coopft] Could not update the reviewed application message:", error.message);
      });
    }
    const applicant = await interaction.client.users.fetch(application.applicant_id).catch(() => null);
    if (applicant) {
      const resultText = decision === "accept" ? "ACCEPTED" : "DENIED";
      const assignedText = roleSpec.category === "developer"
        ? "Your Developer role has been assigned. The team can now coordinate custom bot requests with you."
        : "Your " + roleSpec.name + " staff rank has been assigned. Welcome to the team.";
      const dm = [
        "**COOPFT  |  APPLICATION RESULT**",
        "Your application for **" + roleSpec.name + "** has been **" + resultText + "**.",
        decision === "accept" ? assignedText : "No CoopFT role was assigned.",
        "**Reviewed by:** " + interaction.user.tag,
        reason ? "**Review note:** " + reason : "**Review note:** No additional feedback was provided."
      ].join("\n\n");
      await applicant.send({ content: dm, allowedMentions: { parse: [] } }).catch((error) => {
        console.warn("[coopft] Could not DM application decision to " + application.applicant_id + ":", error.message);
      });
    }
    return { applicantId: application.applicant_id, roleName: roleSpec.name, status: newStatus, reason };
  }

  async ensureStaffGuide(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the CoopFT staff and Developer guide");
    if (!channel?.isTextBased?.()) throw new Error("The staff-guide channel is unavailable.");
    const colour = 0x344F73;
    const pages = [
      new EmbedBuilder().setColor(0x8C2635)
        .setTitle("COOPFT  |  STAFF & DEVELOPER HANDBOOK")
        .setDescription([
          "**Purpose**",
          "This guide explains how CoopFT staff should protect the community, handle reports, apply moderation consistently and work professionally. It also contains a separate operational guide for the Developer role.",
          "",
          "**The standard**",
          "Use common sense. Be fair, calm, evidence-led and consistent. Apply the same rules regardless of friendship, rank, popularity or personal disagreements.",
          "",
          "**Every staff member is expected to**",
          "• Be active and approachable while on duty; help members find the right channel or support route",
          "• Read the current rules and staff updates before taking action",
          "• Check context, message history and available evidence before warning or timing out someone",
          "• Explain decisions respectfully and record accurate reasons",
          "• Escalate serious, unclear or high-impact cases rather than guessing",
          "• Protect member privacy, staff discussions, application answers and evidence",
          "",
          "**Never**",
          "• Threaten, bully, bait, shame or argue with members using staff authority",
          "• Moderate someone because of a personal dispute or because another member asked you to",
          "• Invent rules, issue punishment without evidence, or exaggerate a case",
          "• Leak staff discussions, private logs, applications, guides or moderation announcements",
          "• Promise an outcome that is reserved for Owner Rank",
          "",
          "**Authority is responsibility.** A staff role is not permission to control conversations or win arguments."
        ].join("\n"))
        .setFooter({ text: "1 / 7  •  Introduction and staff standards" }),
      new EmbedBuilder().setColor(colour)
        .setTitle("01  |  MODERATION WORKFLOW")
        .setDescription([
          "**Before taking action**",
          "1. Read the whole relevant conversation; do not rely on cropped screenshots or one-sided claims.",
          "2. Identify the exact rule or behaviour. Separate a genuine violation from disagreement, humour, typos or context.",
          "3. Preserve message links, timestamps and evidence in the appropriate private staff channel or ticket.",
          "4. Choose the lowest effective action that protects the community, unless the severity requires immediate escalation.",
          "5. Record a factual reason. Include the category, the behaviour and the relevant evidence.",
          "",
          "**Verbal warnings**",
          "A verbal warning is a clear instruction that the behaviour must stop. State what needs to change and give the member a reasonable opportunity to comply. Keep a record when the case or staff procedure requires it.",
          "",
          "**Warnings and timeouts**",
          "Use /warn for a formal warning and /timeout for a temporary restriction. Use /untimeout only when the restriction should be lifted. Do not use a timeout as retaliation or as a way to silence criticism.",
          "",
          "**Escalate immediately**",
          "Credible threats, doxxing, sexual exploitation, grooming, child-safety concerns, coordinated raids, account compromise, serious slurs or threats against server infrastructure must be sent privately to Owner Rank. Preserve evidence; do not repost harmful material publicly.",
          "",
          "**When unsure**",
          "Pause. Ask a Senior Moderator, Head Moderator or Owner Rank in a private staff channel. A delayed decision is better than an unjustified punishment."
        ].join("\n"))
        .setFooter({ text: "2 / 7  •  How to handle a report" }),
      new EmbedBuilder().setColor(colour)
        .setTitle("02  |  WARNING GUIDELINES")
        .setDescription([
          "These examples are guidance, not an automatic punishment script. Consider intent, repetition, impact, context and prior warnings. A more serious incident may skip the verbal-warning stage.",
          "",
          "**MINOR — reminder, then formal warning if repeated**",
          "• Laddering, low-level spam or disruptive repeated messages: verbal reminder; repeated behaviour may become a warning",
          "• Begging for roles, perks or benefits: one clear verbal reminder, then a warning if it continues",
          "• Arguments that disrupt chat: one verbal instruction to stop; warn if the disruption continues",
          "• Excessive rage-bait: repeated behaviour after two clear reminders may receive a warning and a short timeout",
          "• Reaction or mention spam: warn when repeated after instruction; use a short timeout where the disruption continues",
          "",
          "**MODERATE — formal warning and proportionate timeout where needed**",
          "• Ignoring a reasonable staff instruction after being informed",
          "• Minimodding or falsely claiming authority to punish other members",
          "• Encouraging rule-breaking or repeatedly targeting a member",
          "• Inappropriate sexual remarks, soft NSFW or disturbing jokes; remove the content and consider a timeout",
          "• Publicly exposing another person's private information or reports; move evidence to a private channel",
          "• Harassment that is persistent, targeted or continues after a clear instruction",
          "",
          "**SEVERE — warn, restrict access where appropriate and escalate**",
          "• Hate speech, discriminatory insults, targeted slurs or repeated abusive language",
          "• Sexual harassment, grooming references, rape or molestation threats/jokes directed at people",
          "• Severe harassment, credible death threats or encouragement of self-harm",
          "• Serious Discord Terms violations, scams, malicious links or attempts to compromise accounts",
          "• Threats to raid, destroy or compromise CoopFT; immediately notify Owner Rank",
          "",
          "**CRITICAL — Owner Rank review is mandatory**",
          "• Doxxing or credible doxx threats, severe defamation, coordinated raids or deliberate server compromise",
          "• Child-safety exploitation, sexual exploitation, credible violence or severe targeted threats",
          "• Repeated severe violations, ban evasion or serious abuse of platform rules",
          "Do not decide permanent exclusion alone. Preserve evidence and refer the case privately to Owner Rank."
        ].join("\n"))
        .setFooter({ text: "3 / 7  •  Warning severity and escalation" }),
      new EmbedBuilder().setColor(colour)
        .setTitle("03  |  LANGUAGE, CONTEXT & EVIDENCE")
        .setDescription([
          "**Context matters**",
          "Do not punish a member solely for an ambiguous typo, quotation, educational discussion or a word fragment without checking how it was used. A direct targeted insult, discriminatory slur or repeated harassment is different and can be actionable.",
          "",
          "**Language notes from the supplied moderation reference**",
          "• The string “nga” alone is not an automatic violation; an additional letter may be an ordinary typo. Judge whether it is being used as a direct insult or slur in context.",
          "• A bypass of the B-word alone is not automatically a violation. Warn when it is used as a direct targeted insult or harassment.",
          "• Do not enforce an English-only rule in CoopFT unless Owner Rank has explicitly published that rule for this server.",
          "",
          "**Sensitive conversations**",
          "Keep discussions of politics, religion, conflicts and other sensitive topics respectful and in the appropriate place. Do not warn someone merely for mentioning a topic; intervene when the conversation becomes targeted harassment, threats, hate speech or deliberate disruption.",
          "",
          "**Evidence handling**",
          "Use message links, dates, channel names and concise factual descriptions. Keep private information in private staff channels. Never share explicit or exploitative material in staff chat; preserve only the minimum evidence needed and escalate child-safety material immediately.",
          "",
          "**Do not**",
          "• Edit screenshots, remove context or ask others to pile onto a report",
          "• Publicly accuse someone of a private offence",
          "• Promise that someone will be banned before leadership reviews the evidence",
          "• Delete evidence before it has been safely recorded"
        ].join("\n"))
        .setFooter({ text: "4 / 7  •  Context, language and evidence" }),
      new EmbedBuilder().setColor(colour)
        .setTitle("04  |  BLACKLISTS, BANS & APPEALS")
        .setDescription([
          "**CoopFT procedure**",
          "CoopFT currently uses Discord moderation actions and Owner Rank review; it does not expose the Fukishōkai bl-request, criticalwarn or changebantype commands. Do not run Fukishōkai-only commands in CoopFT or invent a private blacklist record.",
          "",
          "**Refer to Owner Rank before permanent exclusion**",
          "Send the member ID, message links, dates, case history and a neutral summary in the private staff area. Only Owner Rank decides permanent exclusion, whether an appeal is available and whether an existing restriction should change.",
          "",
          "**Cases that require leadership review**",
          "• Compromised or hacked accounts, suspected under-age accounts and relevant Discord Terms concerns",
          "• Scamming, malicious links, coordinated raids, ban evasion or repeated serious warnings",
          "• Discrimination, severe defamation, doxxing or credible threats",
          "• Sexual exploitation, grooming, child-safety violations or severe violence",
          "• Deliberate nuking or attempts to compromise CoopFT or another server",
          "",
          "**Appeals**",
          "Treat appeals respectfully. Ask for new evidence or a clear explanation; do not argue with the appellant. Staff who issued the original action should not pressure reviewers to uphold it. Owner Rank records the final decision.",
          "",
          "**Important**",
          "A warning count is not the only factor. Severity, repetition, evidence, risk and prior decisions matter. Never promise that a particular number of warnings automatically guarantees a ban or an appeal."
        ].join("\n"))
        .setFooter({ text: "5 / 7  •  Leadership-controlled sanctions and appeals" }),
      new EmbedBuilder().setColor(colour)
        .setTitle("05  |  STAFF ACCOUNTABILITY & PROMOTION")
        .setDescription([
          "**Strikeable conduct**",
          "• Unprofessional behaviour or disrespect toward members or staff",
          "• Ignoring assigned duties or agreed activity expectations without notice",
          "• Favouritism, bias or inconsistent enforcement",
          "• Abusing warnings, timeouts or other moderation permissions",
          "• False or careless warnings/timeouts",
          "• Leaking moderation announcements or private staff material",
          "",
          "**Demotion or removal may follow**",
          "• Reaching three active strikes under the staff review process",
          "• Ignoring higher-ranked staff instructions",
          "• Misusing authority for personal benefit, serious disloyalty or repeated poor decisions",
          "• Severe inactivity without communication",
          "• Leaking the staff guide, private applications, member records or important staff information",
          "• Disrespecting Owner Rank or seriously damaging community trust",
          "",
          "**Promotion timing — starting guideline**",
          "• Junior Moderator → Moderator: 1 month",
          "• Moderator → Senior Moderator: 1 month",
          "• Senior Moderator → Head Moderator: 1 month",
          "• Head Moderator → Low Rank bracket: 2 months",
          "• Smaller promotions within the same bracket: normally 1 month",
          "• Major promotion into a higher bracket/tier: normally 2 months",
          "",
          "Time served is not an entitlement. Consistent judgement, activity, communication, teamwork, reliable records and leadership approval are all required. Owner Rank makes final appointment decisions.",
          "",
          "**Staff notes**",
          "Keep notes factual, relevant and respectful. Never use staff notes to store gossip, passwords, private credentials or unrelated personal information."
        ].join("\n"))
        .setFooter({ text: "6 / 7  •  Professional standards and progression" }),
      new EmbedBuilder().setColor(0x397C94)
        .setTitle("06  |  DEVELOPER ROLE — CUSTOM BOT DELIVERY")
        .setDescription([
          "**Purpose of Developer**",
          "The Developer role is responsible for building custom Discord bots requested by CoopFT members. It is a technical service role, not a moderation rank. It does not grant permission to moderate members or view the Owner Rank application queue.",
          "",
          "**Request workflow**",
          "1. Receive a request through the Custom Bot Development ticket section.",
          "2. Clarify the problem, target users, required commands, buttons, automations, integrations, hosting and database needs.",
          "3. Write a short scope: what is included, what is not included, expected milestones and how changes will be approved.",
          "4. Confirm requirements before building. Ask questions rather than guessing or promising impossible features.",
          "5. Build with least-privilege Discord permissions, modular code, input validation, logging and safe failure handling.",
          "6. Test commands, permissions, edge cases, rate limits, data storage and recovery before delivery.",
          "7. Provide setup instructions, configuration notes, feature documentation and a clear handover.",
          "8. Agree on maintenance, bug-fix expectations and future changes with the requester.",
          "",
          "**Security and privacy**",
          "• Never ask a requester to post a bot token, password, API secret or database credential in Discord.",
          "• Never paste secrets into source code, commits, screenshots or public logs. Use protected environment variables or another approved secret manager.",
          "• Request only the permissions and data the bot actually needs.",
          "• Do not copy private code, data or credentials into another project without permission.",
          "• Do not deploy, invite or modify a bot in a server without the owner's authorization.",
          "",
          "**Professional delivery**",
          "Give honest progress updates, document known limitations, report blockers early and never claim a feature is finished before it has been tested. Escalate payment, scope disputes or access concerns to Owner Rank."
        ].join("\n"))
        .setFooter({ text: "7 / 7  •  Developer responsibilities and custom bot commissions" })
    ];
    // Discord limits the combined embed text in one message. Keep the handbook
    // in four compact, maintained posts so no page is silently truncated.
    const groups = [pages.slice(0, 2), pages.slice(2, 4), pages.slice(4, 6), pages.slice(6, 7)];
    for (let index = 0; index < groups.length; index += 1) {
      const key = index === 0 ? "message:staff_guide" : "message:staff_guide:" + (index + 1);
      const savedId = await this.getResource(guild.id, key);
      let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
      const payload = { embeds: groups[index], components: [], allowedMentions: { parse: [] } };
      if (message) await message.edit(payload);
      else {
        message = await channel.send(payload);
        await this.saveResource(guild.id, key, message.id);
      }
    }
  }

  async ensureTicketPanel(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the CoopFT ticket panel");
    const savedId = await this.getResource(guild.id, "message:ticket_panel");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const banner = new AttachmentBuilder(this.buildPanelBanner("Community Support", "Tickets • Reports • Questions", "#4E70B5"), { name: "coopft-support-banner.png" });
    const embed = new EmbedBuilder().setColor(0x354F86)
      .setTitle(this.emoji(guild.id, "cf3d_ticket", "🎟️") + "  COMMUNITY SUPPORT CENTRE")
      .setDescription([
        "Choose which service your request concerns. The next menu shows relevant request types, then a short form collects details before a private ticket is opened.",
        "",
        "**Fukishōkai Economy Bot**",
        "Bot bugs, gameplay and balance issues, player-account support, security reports and bot suggestions.",
        "",
        "**CoopFT Server**",
        "Server bugs, community suggestions, member reports, staff concerns, general support and partnership enquiries.",
        "",
        "**Custom Bot Development — paid commission**",
        "Commission a new custom bot or a defined feature build. Pricing depends on scope and features; Robux or Discord Nitro only. Payment goes only to Cookie/Brian or another verified Owner Rank member after the quote is confirmed.",
        "Current delivery is a ZIP folder of code only. Hosting, deployment and 24/7 operation are not currently available.",
        "",
        "Your form answers are copied into the private ticket. One open ticket per member is allowed."
      ].join("\n"))
      .setImage("attachment://coopft-support-banner.png")
      .setFooter({ text: "Select a service below • no ticket is created until the form is submitted" });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId("cf-ticket:section")
        .setPlaceholder("Choose a service or custom bot development").setMinValues(1).setMaxValues(1)
        .addOptions(
          { label: "Fukishōkai Economy Bot", value: "bot", description: "Bot bugs, accounts, gameplay and suggestions", emoji: "🎮" },
          { label: "CoopFT Server", value: "server", description: "Server support, reports, suggestions and partnerships", emoji: "🏛️" },
          { label: "Custom Bot Development", value: "development", description: "Request a custom Discord bot or feature build", emoji: "💻" }
        )
    );
    if (message) await message.edit({ embeds: [embed], components: [row], files: [banner], attachments: [] });
    else {
      message = await channel.send({ embeds: [embed], components: [row], files: [banner] });
      await this.saveResource(guild.id, "message:ticket_panel", message.id);
    }
  }

  async ensureRoleSelectionPanel(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the member role selector");
    if (!channel?.isTextBased?.() || typeof channel.send !== "function") {
      throw new Error("The CoopFT role-selection channel is unavailable.");
    }
    const menu = (action, group, label, specs) => new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("cf-roles:" + action + ":" + group)
        .setPlaceholder(label)
        .setMinValues(1)
        .setMaxValues(specs.length)
        .addOptions(specs.map((spec) => {
          const emojiId = this.emojis.get(spec.emoji);
          return {
            label: spec.name,
            value: spec.key,
            description: (action === "add" ? "Add" : "Remove") + " the " + spec.name + " role",
            emoji: emojiId ? { id: emojiId, name: spec.emoji } : spec.icon
          };
        }))
    );
    const banner = new AttachmentBuilder(this.buildPanelBanner("Choose Your Roles", "Interests • Notifications • Community", "#477D98"), { name: "coopft-role-selector.png" });
    const embed = new EmbedBuilder()
      .setColor(0x344F73)
      .setTitle(this.emoji(guild.id, "cf3d_role_select", "☷") + "  CHOOSE YOUR ROLES")
      .setDescription([
        "Customize your CoopFT experience with the menus below.",
        "",
        "**INTERESTS**",
        "Choose topics you enjoy. These roles help members find people with similar interests.",
        "",
        "**NOTIFICATIONS**",
        "Opt into only the updates you want to receive. Staff use these roles for relevant announcements and event notices.",
        "",
        "Use an **Add** menu to opt in and a **Remove** menu to opt out. You can change your selections at any time.",
        "",
        "Staff ranks, verification, VIP and contributor badges are assigned by CoopFT leadership and cannot be self-selected."
      ].join("\n"))
      .setImage("attachment://coopft-role-selector.png")
      .setFooter({ text: "Your selections affect only your own roles • No unnecessary pings" });
    const components = [
      menu("add", "interests", "Add interests", INTEREST_ROLES),
      menu("remove", "interests", "Remove interests", INTEREST_ROLES),
      menu("add", "pings", "Subscribe to notifications", PING_ROLES),
      menu("remove", "pings", "Unsubscribe from notifications", PING_ROLES)
    ];
    const savedId = await this.getResource(guild.id, "message:role_selection");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const payload = { embeds: [embed], components, files: [banner], attachments: [], allowedMentions: { parse: [] } };
    if (message) await message.edit(payload);
    else {
      message = await channel.send(payload);
      await this.saveResource(guild.id, "message:role_selection", message.id);
    }
  }

  async handleSelfRoleSelection(interaction) {
    this.assertCoopFTGuild(interaction.guild, "process a member role selection");
    if (interaction.guildId !== this.guildId || !interaction.customId?.startsWith("cf-roles:")) {
      await interaction.reply({ content: "This role selector is only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const [, action, group] = interaction.customId.split(":");
    const specs = group === "interests" ? INTEREST_ROLES : group === "pings" ? PING_ROLES : null;
    if (!specs || !["add", "remove"].includes(action)) {
      await interaction.reply({ content: "That role-selection menu is not recognized.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const allowed = new Map(specs.map((spec) => [spec.key, spec]));
    const selected = [...new Set(interaction.values || [])];
    if (!selected.length || selected.some((key) => !allowed.has(key))) {
      await interaction.reply({ content: "Select one or more roles from this menu.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "I couldn't load your server member profile. Please try again.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const changed = [];
    for (const key of selected) {
      const spec = allowed.get(key);
      let role = this.roles.get(key);
      if (!role) {
        const roleId = await this.getResource(interaction.guildId, "role:" + key);
        role = roleId ? await interaction.guild.roles.fetch(roleId).catch(() => null) : null;
        if (role) this.roles.set(key, role);
      }
      if (!role || role.managed || role.id === interaction.guild.id) continue;
      const hasRole = member.roles.cache.has(role.id);
      if (action === "add" && !hasRole) {
        await member.roles.add(role, "Member self-selected " + spec.name);
        changed.push(spec.name);
      } else if (action === "remove" && hasRole) {
        await member.roles.remove(role, "Member opted out of " + spec.name);
        changed.push(spec.name);
      }
    }
    const actionLabel = action === "add" ? "Added" : "Removed";
    await interaction.reply({
      content: changed.length
        ? actionLabel + " your roles: **" + changed.join(", ") + "**."
        : "No changes were needed. Your selected roles already match your current settings.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] }
    });
    return true;
  }

  async assignCommunityMemberRole(member) {
    if (!member?.guild || member.guild.id !== this.guildId) return false;
    this.assertCoopFTGuild(member.guild, "assign the default Community Member role");
    let role = this.roles.get("community_member");
    if (!role) {
      const id = await this.getResource(member.guild.id, "role:community_member");
      role = id ? await member.guild.roles.fetch(id).catch(() => null) : null;
      if (role) this.roles.set("community_member", role);
    }
    if (!role || member.roles.cache.has(role.id)) return false;
    await member.roles.add(role, "Automatic CoopFT Community Member role");
    return true;
  }

  createTicketIntakeModal(ticketType) {
    const spec = TICKET_TYPES[ticketType];
    if (!spec) throw new Error("Unknown ticket type.");
    const modal = new ModalBuilder().setCustomId("cf-ticket:submit:" + ticketType).setTitle(spec.label.slice(0, 45));
    for (const question of spec.questions) {
      const input = new TextInputBuilder().setCustomId(question.id)
        .setLabel(question.label.slice(0, 45))
        .setStyle(question.style === "short" ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setRequired(Boolean(question.required))
        .setMaxLength(question.style === "short" ? 100 : 1000);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
    }
    return modal;
  }

  async handleTicketSectionSelect(interaction) {
    this.assertCoopFTGuild(interaction.guild, "choose a CoopFT support section");
    if (interaction.guildId !== this.guildId || interaction.customId !== "cf-ticket:section") {
      await interaction.reply({ content: "This support panel is only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const sectionKey = interaction.values?.[0];
    const section = TICKET_SECTIONS[sectionKey];
    if (!section) {
      await interaction.reply({ content: "Choose one of the available support areas.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const types = Object.entries(TICKET_TYPES).filter(([, spec]) => spec.section === sectionKey);
    const rows = [];
    for (let index = 0; index < types.length; index += 5) {
      const buttons = types.slice(index, index + 5).map(([key, spec]) =>
        new ButtonBuilder().setCustomId("cf-ticket:type:" + key)
          .setLabel(spec.label.slice(0, 80))
          .setStyle(key.includes("bug") || key.includes("report") || key.includes("exploit") ? ButtonStyle.Danger :
            key.includes("suggestion") ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(spec.fallback)
      );
      rows.push(new ActionRowBuilder().addComponents(buttons));
    }
    await interaction.reply({
      content: "**" + section.label + "**\n" + section.description + "\n\nChoose the request type. A short form will appear next.",
      components: rows,
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  async handleTicketIntakeModal(interaction) {
    this.assertCoopFTGuild(interaction.guild, "submit a CoopFT support request");
    if (interaction.guildId !== this.guildId || !interaction.customId?.startsWith("cf-ticket:submit:")) {
      await interaction.reply({ content: "This support form is only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const ticketType = interaction.customId.split(":")[2];
    const spec = TICKET_TYPES[ticketType];
    if (!spec) {
      await interaction.reply({ content: "This request type is no longer available.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const answers = {};
    for (const question of spec.questions) {
      const value = interaction.fields.getTextInputValue(question.id).trim();
      if (question.required && !value) {
        await interaction.reply({ content: "Please complete the required field: " + question.label + ".", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (value) answers[question.label] = value;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.openTicket(interaction.guild, interaction.member, ticketType, answers);
    await interaction.editReply({
      content: result.existing
        ? "You already have an open ticket: <#" + result.channel.id + ">. Your new form was not used to create a duplicate."
        : "Your request has been submitted. Your private ticket is ready: <#" + result.channel.id + ">."
    });
    return true;
  }

  async getTicketCategory(guild) {
    this.assertCoopFTGuild(guild, "read the CoopFT ticket category");
    const id = await this.getResource(guild.id, "category:tickets");
    return id ? guild.channels.fetch(id).catch(() => null) : null;
  }

  async openTicket(guild, member, ticketType, answers = {}) {
    this.assertCoopFTGuild(guild, "open a CoopFT ticket");
    const info = TICKET_TYPES[ticketType];
    if (!info) throw new Error("Unknown ticket type.");
    const section = TICKET_SECTIONS[info.section];
    if (!section) throw new Error("Unknown ticket section.");
    const existing = await this.pool.query(
      "SELECT id,channel_id FROM coopft_tickets WHERE guild_id=$1 AND opener_id=$2 AND status='open' ORDER BY created_at DESC LIMIT 1",
      [guild.id, member.id]
    );
    if (existing.rowCount) {
      const channel = await guild.channels.fetch(existing.rows[0].channel_id).catch(() => null);
      if (channel) return { channel, existing: true };
      await this.pool.query("UPDATE coopft_tickets SET status='closed',closed_at=NOW() WHERE guild_id=$1 AND channel_id=$2", [guild.id, existing.rows[0].channel_id]);
    }
    const category = await this.getTicketCategory(guild);
    if (!category) throw new Error("The ticket category is not set up. Ask an administrator to run npm run coopft:setup from the hosting console.");
    const me = guild.members.me || await guild.members.fetchMe();
    const staffRoles = STAFF_RANKS.map((spec) => this.roles.get(spec.key)).filter(Boolean);
    const developerRole = info.section === "development" ? this.roles.get("developer_member") : null;
    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
      ...staffRoles.map((role) => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] })),
      ...(developerRole ? [{ id: developerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }] : [])
    ];
    const channel = await guild.channels.create({
      name: "▣・ticket-" + safeChannelName(member.user.username),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
      topic: "CoopFT private ticket • opener " + member.id,
      reason: "CoopFT ticket opened by " + member.user.tag
    });
    const ticketId = randomUUID();
    const ticketData = {
      sectionKey: info.section,
      sectionLabel: section.label,
      typeLabel: info.label,
      answers: Object.fromEntries(Object.entries(answers || {}).map(([key, value]) => [String(key).slice(0, 80), String(value).slice(0, 1000)]))
    };
    try {
      await this.pool.query(
        "INSERT INTO coopft_tickets (id,guild_id,channel_id,opener_id,ticket_type,ticket_data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
        [ticketId, guild.id, channel.id, member.id, ticketType, JSON.stringify(ticketData)]
      );
    } catch (error) {
      await channel.delete("Ticket record creation failed").catch(() => {});
      if (error.code === "23505") {
        const raced = await this.pool.query(
          "SELECT channel_id FROM coopft_tickets WHERE guild_id=$1 AND opener_id=$2 AND status='open' ORDER BY created_at DESC LIMIT 1",
          [guild.id, member.id]
        );
        if (raced.rowCount) {
          const existingChannel = await guild.channels.fetch(raced.rows[0].channel_id).catch(() => null);
          if (existingChannel) return { channel: existingChannel, existing: true };
        }
      }
      throw error;
    }
    const fields = [
      { name: "Ticket owner", value: "<@" + member.id + ">", inline: true },
      { name: "Service", value: section.label, inline: true },
      { name: "Request type", value: info.label, inline: true },
      { name: "Status", value: this.emoji(guild.id, "cf3d_spark", "🟢") + " Open", inline: true }
    ];
    for (const [label, value] of Object.entries(ticketData.answers)) {
      fields.push({ name: label.slice(0, 256), value: value.slice(0, 1024) || "Not provided", inline: false });
    }
    if (ticketType === "custom_bot_request") {
      fields.push({
        name: "Commission terms — please read before proceeding",
        value: [
          "Paid commission. Accepted payment: **Robux or Discord Nitro only**.",
          "The final price is quoted by Owner Rank after reviewing the scope, features and integrations.",
          "Payment may go only to **Cookie/Brian (server Owner)** or another verified Owner Rank member. Developers and other staff do not collect payment.",
          "Current delivery: **ZIP folder of code only**. Hosting, deployment and 24/7 operation are not currently offered.",
          "Do not pay until Owner Rank confirms the exact quote and recipient in this ticket."
        ].join("\n"),
        inline: false
      });
    }
    const embed = new EmbedBuilder().setColor(0x314D7A)
      .setTitle(this.emoji(guild.id, info.icon, info.fallback) + "  " + info.label)
      .setDescription("A private request was submitted by <@" + member.id + ">. Intake answers are included below so the team can start with the right context.")
      .addFields(fields.slice(0, 25))
      .setFooter({ text: "CoopFT • Ticket " + ticketId.slice(0, 8) }).setTimestamp();
    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cf-ticket:claim:" + ticketId).setLabel("Claim").setStyle(ButtonStyle.Primary).setEmoji("🛡️"),
      new ButtonBuilder().setCustomId("cf-ticket:close:" + ticketId).setLabel("Close ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
    );
    await channel.send({ content: "<@" + member.id + ">", embeds: [embed], components: [controls], allowedMentions: { users: [member.id] } });
    return { channel, existing: false };
  }

  isStaff(member) {
    if (!member?.roles?.cache) return false;
    const ids = new Set(STAFF_RANKS.map((spec) => this.roles.get(spec.key)?.id).filter(Boolean));
    return member.roles.cache.some((role) => ids.has(role.id));
  }

  canManageStaff(member, guild) {
    if (!member || !guild) return false;
    if (member.id === guild.ownerId) return true;
    if (!member.roles?.cache) return false;
    return [...STAFF_MANAGER_KEYS].some((key) => {
      const role = this.roles.get(key);
      return role && member.roles.cache.has(role.id);
    });
  }

  isDeveloper(member) {
    const role = this.roles.get("developer_member");
    return Boolean(role && member?.roles?.cache?.has(role.id));
  }

  canHandleTicket(member, ticket) {
    if (this.isStaff(member)) return true;
    return ticket?.ticket_type === "custom_bot_request" && this.isDeveloper(member);
  }

  canManageApplications(member, guild) {
    if (!member || !guild) return false;
    if (member.id === guild.ownerId) return true;
    if (!member.roles?.cache) return false;
    return [...APPLICATION_MANAGER_KEYS].some((key) => {
      const role = this.roles.get(key);
      return role && member.roles.cache.has(role.id);
    });
  }

  getStaffRankKey(member) {
    return STAFF_RANKS.find((spec) => {
      const role = this.roles.get(spec.key);
      return role && member?.roles?.cache?.has(role.id);
    })?.key || null;
  }

  assertStaffChangeAuthority(actor, target, guild, currentRankKey, nextRankKey = null) {
    if (actor?.id === guild.ownerId) return;
    if (!actor || !target || actor.id === target.id) {
      throw new Error("Ask another authorized CoopFT manager to make this staff change.");
    }

    const actorRankKey = this.getStaffRankKey(actor);
    const actorRankIndex = actorRankKey ? STAFF_RANKS.findIndex((item) => item.key === actorRankKey) : -1;
    const isStaffManager = [...STAFF_MANAGER_KEYS].some((key) => {
      const role = this.roles.get(key);
      return role && actor.roles?.cache?.has(role.id);
    });
    const currentIndex = currentRankKey ? STAFF_RANKS.findIndex((item) => item.key === currentRankKey) : -1;
    const nextIndex = nextRankKey ? STAFF_RANKS.findIndex((item) => item.key === nextRankKey) : -1;

    if (isStaffManager && actorRankIndex >= 0) {
      if (currentIndex >= 0 && currentIndex <= actorRankIndex) {
        throw new Error("You cannot change someone at your own rank or above it.");
      }
      if (nextIndex >= 0 && nextIndex <= actorRankIndex) {
        throw new Error("You can only appoint staff below your own rank.");
      }
      return;
    }

    throw new Error("You do not have authority to make this staff change.");
  }

  async assignStaff(interaction, member, rankKey, action = "hire") {
    this.assertCoopFTGuild(interaction.guild, "change a CoopFT staff role");
    if (interaction.guildId !== this.guildId) throw new Error("This staff system is only available in CoopFT.");
    if (!this.canManageStaff(interaction.member, interaction.guild)) {
      throw new Error("Only designated CoopFT leadership can change staff ranks.");
    }

    const rank = STAFF_RANKS.find((item) => item.key === rankKey);
    if (!rank) throw new Error("Unknown staff rank.");
    const previous = await this.pool.query(
      "SELECT rank_key,active FROM coopft_staff_members WHERE guild_id=$1 AND member_id=$2",
      [interaction.guildId, member.id]
    );
    const currentRankKey = previous.rows[0]?.active
      ? previous.rows[0].rank_key
      : this.getStaffRankKey(member);
    const currentIndex = currentRankKey ? STAFF_RANKS.findIndex((item) => item.key === currentRankKey) : -1;
    const nextIndex = STAFF_RANKS.findIndex((item) => item.key === rankKey);

    if (action === "hire" && currentIndex >= 0) {
      throw new Error("This member is already on the staff team. Use promote or demote instead.");
    }
    if (action === "promote" && (currentIndex < 0 || nextIndex >= currentIndex)) {
      throw new Error("A promotion must move an existing staff member to a higher rank.");
    }
    if (action === "demote" && (currentIndex < 0 || nextIndex <= currentIndex)) {
      throw new Error("A demotion must move an existing staff member to a lower rank.");
    }
    this.assertStaffChangeAuthority(
      interaction.member,
      member,
      interaction.guild,
      currentRankKey,
      rankKey
    );

    const role = this.roles.get(rankKey) || await this.ensureRole(interaction.guild, rank).then((value) => value.role);
    const roleIds = new Set(STAFF_RANKS.map((item) => this.roles.get(item.key)?.id).filter(Boolean));
    for (const oldRole of member.roles.cache.filter((item) => roleIds.has(item.id) && item.id !== role.id).values()) {
      await member.roles.remove(oldRole, "CoopFT staff rank change");
    }
    if (!member.roles.cache.has(role.id)) await member.roles.add(role, "CoopFT staff " + action);
    await this.pool.query(
      "INSERT INTO coopft_staff_members (guild_id,member_id,rank_key,active,updated_by) VALUES ($1,$2,$3,TRUE,$4) " +
      "ON CONFLICT (guild_id,member_id) DO UPDATE SET rank_key=EXCLUDED.rank_key,active=TRUE,updated_at=NOW(),updated_by=EXCLUDED.updated_by",
      [interaction.guildId, member.id, rankKey, interaction.user.id]
    );
    await this.recordStaffAudit(interaction.guildId, interaction.user.id, member.id, action, {
      from: currentRankKey,
      to: rankKey
    });
    await this.updateStaffDirectory(interaction.guild);
    const actionText = action === "hire" ? "hired" : action === "promote" ? "promoted" : "demoted";
    await this.postStaffUpdate(
      interaction.guild,
      this.emoji(interaction.guildId, "cf3d_star", "✦") + " <@" + member.id + "> was " +
      actionText + " to **" + rank.name + "** by <@" + interaction.user.id + ">."
    );
    return { rankName: rank.name, previousRank: currentRankKey };
  }

  async removeStaff(interaction, member) {
    this.assertCoopFTGuild(interaction.guild, "remove a CoopFT staff role");
    if (interaction.guildId !== this.guildId) throw new Error("This staff system is only available in CoopFT.");
    if (!this.canManageStaff(interaction.member, interaction.guild)) {
      throw new Error("Only designated CoopFT leadership can change staff ranks.");
    }
    const previous = await this.pool.query(
      "SELECT rank_key,active FROM coopft_staff_members WHERE guild_id=$1 AND member_id=$2",
      [interaction.guildId, member.id]
    );
    const currentRankKey = previous.rows[0]?.active
      ? previous.rows[0].rank_key
      : this.getStaffRankKey(member);
    if (!currentRankKey) throw new Error("This member does not have an active staff rank.");
    this.assertStaffChangeAuthority(interaction.member, member, interaction.guild, currentRankKey, null);

    for (const spec of STAFF_RANKS) {
      const role = this.roles.get(spec.key);
      if (role && member.roles.cache.has(role.id)) await member.roles.remove(role, "CoopFT staff removal");
    }
    await this.pool.query(
      "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by=$3 WHERE guild_id=$1 AND member_id=$2",
      [interaction.guildId, member.id, interaction.user.id]
    );
    await this.recordStaffAudit(interaction.guildId, interaction.user.id, member.id, "remove", { from: currentRankKey });
    await this.updateStaffDirectory(interaction.guild);
    await this.postStaffUpdate(interaction.guild, this.emoji(interaction.guildId, "cf3d_bell", "🔔") + " <@" + member.id + "> was removed from the staff team by <@" + interaction.user.id + ">.");
  }

  async recordStaffAudit(guildId, actorId, memberId, action, details) {
    this.assertCoopFTGuildId(guildId, "write CoopFT staff audit data");
    await this.pool.query(
      "INSERT INTO coopft_staff_audit (guild_id,actor_id,member_id,action,details) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [guildId, actorId, memberId || null, action, JSON.stringify(details || {})]
    );
  }

  async syncStaffMember(guild, member, actor) {
    this.assertCoopFTGuild(guild, "synchronize CoopFT staff membership");
    if (!guild || guild.id !== this.guildId || !member || !this.roles.size) return;
    const newRankKey = this.getStaffRankKey(member);
    const previous = await this.pool.query(
      "SELECT rank_key,active FROM coopft_staff_members WHERE guild_id=$1 AND member_id=$2",
      [guild.id, member.id]
    );
    const oldRankKey = previous.rows[0]?.active ? previous.rows[0].rank_key : null;

    // Removing a staff role only removes bot-managed access, so it is safe to
    // reconcile even when the executor cannot be identified.
    if (!newRankKey && previous.rows[0]?.active) {
      await this.pool.query(
        "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by='discord-audit-sync' WHERE guild_id=$1 AND member_id=$2",
        [guild.id, member.id]
      );
      await this.recordStaffAudit(guild.id, actor?.id || "unknown", member.id, "staff_role_removed", { from: oldRankKey });
      await this.updateStaffDirectory(guild);
      await this.postStaffUpdate(guild, this.emoji(guild.id, "cf3d_bell", "🔔") + " <@" + member.id + "> no longer has an active staff rank.");
      return;
    }

    if (!newRankKey || newRankKey === oldRankKey) return;
    if (!actor || !this.canManageStaff(actor, guild)) {
      const unauthorizedRole = this.roles.get(newRankKey);
      if (unauthorizedRole && member.roles.cache.has(unauthorizedRole.id)) {
        await member.roles.remove(unauthorizedRole, "Revert unauthorized CoopFT staff role assignment").catch(() => {});
      }
      await this.postStaffUpdate(
        guild,
        this.emoji(guild.id, "cf3d_shield", "🛡️") + " An unauthorized staff-rank change for <@" +
        member.id + "> was rejected. Ask designated CoopFT leadership to review the change."
      );
      return;
    }

    try {
      this.assertStaffChangeAuthority(actor, member, guild, oldRankKey, newRankKey);
    } catch (error) {
      const unauthorizedRole = this.roles.get(newRankKey);
      if (unauthorizedRole && member.roles.cache.has(unauthorizedRole.id)) {
        await member.roles.remove(unauthorizedRole, "Revert unauthorized CoopFT staff rank escalation").catch(() => {});
      }
      await this.postStaffUpdate(guild, this.emoji(guild.id, "cf3d_shield", "🛡️") + " A staff-rank change for <@" +
        member.id + "> was reverted: " + error.message);
      return;
    }

    await this.pool.query(
      "INSERT INTO coopft_staff_members (guild_id,member_id,rank_key,active,updated_by) VALUES ($1,$2,$3,TRUE,$4) " +
      "ON CONFLICT (guild_id,member_id) DO UPDATE SET rank_key=EXCLUDED.rank_key,active=TRUE,updated_at=NOW(),updated_by=EXCLUDED.updated_by",
      [guild.id, member.id, newRankKey, actor.id]
    );
    await this.recordStaffAudit(guild.id, actor.id, member.id, oldRankKey ? "staff_rank_changed" : "staff_added", {
      from: oldRankKey,
      to: newRankKey
    });
    await this.updateStaffDirectory(guild);
    const rank = STAFF_RANKS.find((spec) => spec.key === newRankKey);
    await this.postStaffUpdate(guild, this.emoji(guild.id, "cf3d_star", "✦") + " <@" + member.id + "> is now **" + rank.name + "**.");
  }

  async handleMemberLeave(member) {
    if (!member || member.guild.id !== this.guildId) return;
    this.assertCoopFTGuild(member.guild, "record a CoopFT member departure");
    const result = await this.pool.query(
      "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by='member-left' WHERE guild_id=$1 AND member_id=$2 AND active=TRUE RETURNING rank_key",
      [this.guildId, member.id]
    );
    if (!result.rowCount) return;
    await this.recordStaffAudit(this.guildId, "member-left", member.id, "staff_left_server", { rank: result.rows[0].rank_key });
    await this.updateStaffDirectory(member.guild);
    await this.postStaffUpdate(member.guild, "<@" + member.id + "> left the server. Their staff directory entry has been set inactive.");
  }

  buildStaffBanner() {
    const { createCanvas } = require("@napi-rs/canvas");
    const canvas = createCanvas(1200, 360);
    const ctx = canvas.getContext("2d");
    const bg = ctx.createLinearGradient(0, 0, 1200, 360);
    bg.addColorStop(0, "#08090D");
    bg.addColorStop(0.52, "#171116");
    bg.addColorStop(1, "#090A0F");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 360);
    const glow = ctx.createRadialGradient(600, 150, 20, 600, 150, 680);
    glow.addColorStop(0, "rgba(164,31,51,0.30)");
    glow.addColorStop(0.58, "rgba(70,20,35,0.12)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1200, 360);
    ctx.strokeStyle = "rgba(221,65,83,0.88)";
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 20, 1156, 320);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(36, 34, 1128, 292);
    ctx.textAlign = "center";
    ctx.fillStyle = "#F5F0ED";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 16;
    ctx.font = "bold 56px Arial";
    ctx.fillText("COOPFT", 600, 86);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#E45767";
    ctx.font = "bold 26px Arial";
    ctx.fillText("STAFF DIRECTORY", 600, 122);

    const groups = [
      { label: "OWNER RANK", color: "#D85A67", accent: "#8C2635" },
      { label: "HIGH RANK", color: "#74B8E8", accent: "#2769A6" },
      { label: "LOW RANK", color: "#6CC7D2", accent: "#287E8C" },
      { label: "MOD ROLES", color: "#B99AE5", accent: "#693E9C" }
    ];
    const width = 250, gap = 22, left = 78, top = 158, height = 104;
    groups.forEach((group, index) => {
      const x = left + index * (width + gap);
      const card = ctx.createLinearGradient(x, top, x + width, top + height);
      card.addColorStop(0, "rgba(28,25,31,0.95)");
      card.addColorStop(1, "rgba(12,13,18,0.95)");
      ctx.fillStyle = card;
      ctx.fillRect(x, top, width, height);
      ctx.strokeStyle = group.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, top, width, height);
      ctx.fillStyle = group.color;
      ctx.beginPath();
      ctx.arc(x + width / 2, top + 28, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 20px Arial";
      ctx.fillText(group.label, x + width / 2, top + 70);
    });
    ctx.fillStyle = "rgba(244,235,232,0.78)";
    ctx.font = "18px Arial";
    ctx.fillText("LEADERSHIP  •  OPERATIONS  •  COMMUNITY", 600, 300);
    return canvas.toBuffer("image/png");
  }

  async buildStaffDirectoryEmbed(guild) {
    this.assertCoopFTGuild(guild, "build the CoopFT staff directory");
    if (!this.memberRosterLoaded) {
      await guild.members.fetch();
      this.memberRosterLoaded = true;
    }
    const members = [...guild.members.cache.values()];
    const grouped = new Map(STAFF_RANKS.map((rank) => [rank.key, []]));
    const developerMembers = [];
    for (const member of members) {
      const rankKey = this.getStaffRankKey(member);
      if (rankKey && grouped.has(rankKey)) grouped.get(rankKey).push(member);
      const developerRole = this.roles.get("developer_member");
      if (developerRole && member.roles.cache.has(developerRole.id)) developerMembers.push(member);
    }
    const sectionFor = (key) => {
      if (["owner", "co_owner", "monarch"].includes(key)) return "OWNER RANK";
      if (["high_rank_supervisor", "apex", "right_wing", "left_wing", "halo", "overseer"].includes(key)) return "HIGH RANK";
      if (["staff_supervisor", "supreme_council", "senate", "head_moderator"].includes(key)) return "LOW RANK";
      return "MOD ROLES";
    };
    const sections = [
      { name: "OWNER RANK", emoji: "cf3d_owner_crest", fallback: "👑" },
      { name: "HIGH RANK", emoji: "cf3d_high_rank", fallback: "🐉" },
      { name: "LOW RANK", emoji: "cf3d_low_rank", fallback: "⚖️" },
      { name: "MOD ROLES", emoji: "cf3d_mod_rank", fallback: "⚔️" }
    ];
    const embed = new EmbedBuilder()
      .setColor(0x8C2635)
      .setTitle("COOPFT  |  STAFF DIRECTORY")
      .setDescription("The live CoopFT hierarchy, read from current Discord role assignments. Every listed member currently holds the displayed role.\n**Last refreshed:** <t:" + Math.floor(Date.now() / 1000) + ":T>")
      .setFooter({ text: "COOPFT  •  Live role-based directory • Refreshes every 15 seconds" })
      .setTimestamp();
    for (const section of sections) {
      const lines = STAFF_RANKS.filter((rank) => sectionFor(rank.key) === section.name).map((rank) => {
        const people = grouped.get(rank.key) || [];
        const names = people.length
          ? people.sort((a, b) => a.displayName.localeCompare(b.displayName)).map((member) => "<@" + member.id + ">").join(", ")
          : "_Open position_";
        return this.emoji(guild.id, rank.emoji, rank.icon) + " **" + rank.name + "**  ›  " + names;
      });
      embed.addFields({
        name: "━━━━  " + this.emoji(guild.id, section.emoji, section.fallback) + "  " + section.name + "  ━━━━",
        value: lines.join("\n").slice(0, 1024) || "_No positions configured._",
        inline: false
      });
    }
    const developerLines = developerMembers.length
      ? developerMembers.sort((a, b) => a.displayName.localeCompare(b.displayName)).map((member) => "<@" + member.id + ">").join(", ")
      : "_No active Developers_";
    embed.addFields({
      name: "━━━━  " + this.emoji(guild.id, "cf3d_developer", "💻") + "  DEVELOPER  ━━━━",
      value: "**Developer**  ›  " + developerLines,
      inline: false
    });
    return embed;
  }

  async refreshStaffDirectory(guild, options = {}) {
    this.assertCoopFTGuild(guild, "reconcile and refresh the CoopFT staff directory");
    if (this.directoryRefreshRunning) return { skipped: true };
    this.directoryRefreshRunning = true;
    try {
      if (options.fetchMembers || !this.memberRosterLoaded) {
        await guild.members.fetch();
        this.memberRosterLoaded = true;
      }
      const current = new Map();
      for (const member of guild.members.cache.values()) {
        const rankKey = this.getStaffRankKey(member);
        if (rankKey) current.set(member.id, rankKey);
      }
      const existing = await this.pool.query(
        "SELECT member_id,rank_key,active FROM coopft_staff_members WHERE guild_id=$1",
        [guild.id]
      );
      const byMember = new Map(existing.rows.map((row) => [row.member_id, row]));
      let added = 0;
      let changed = 0;
      let removed = 0;
      for (const [memberId, rankKey] of current) {
        const previous = byMember.get(memberId);
        if (!previous || !previous.active) added += 1;
        else if (previous.rank_key !== rankKey) changed += 1;
        await this.pool.query(
          "INSERT INTO coopft_staff_members (guild_id,member_id,rank_key,active,updated_by) VALUES ($1,$2,$3,TRUE,'guild-members-sync') " +
          "ON CONFLICT (guild_id,member_id) DO UPDATE SET rank_key=EXCLUDED.rank_key,active=TRUE,updated_at=NOW(),updated_by=EXCLUDED.updated_by " +
          "WHERE coopft_staff_members.rank_key IS DISTINCT FROM EXCLUDED.rank_key OR coopft_staff_members.active=FALSE",
          [guild.id, memberId, rankKey]
        );
      }
      const currentIds = [...current.keys()];
      const stale = await this.pool.query(
        "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by='guild-members-sync' " +
        "WHERE guild_id=$1 AND active=TRUE AND NOT (member_id=ANY($2::text[])) RETURNING member_id",
        [guild.id, currentIds]
      );
      removed = stale.rowCount;
      await this.updateStaffDirectory(guild);
      return { members: current.size, added, changed, removed };
    } finally {
      this.directoryRefreshRunning = false;
    }
  }

  async startStaffDirectoryRefresh(guild, intervalMs = 15000) {
    this.assertCoopFTGuild(guild, "start automatic staff directory refresh");
    if (this.directoryRefreshTimer) clearInterval(this.directoryRefreshTimer);
    await this.refreshStaffDirectory(guild, { fetchMembers: true });
    this.directoryRefreshTimer = setInterval(() => {
      this.refreshStaffDirectory(guild).catch((error) =>
        console.warn("[coopft] Live staff directory refresh failed:", error.message)
      );
    }, intervalMs);
    this.directoryRefreshTimer.unref?.();
    console.info("[coopft] Live staff directory refresh started at " + intervalMs + " ms using GuildMembers data.");
    return true;
  }

  async buildStaffDirectoryPayload(guild) {
    const embed = await this.buildStaffDirectoryEmbed(guild);
    embed.setThumbnail("attachment://coopft-staff-banner.png");
    return {
      embeds: [embed],
      files: [new AttachmentBuilder(this.buildStaffBanner(), { name: "coopft-staff-banner.png" })],
      allowedMentions: { parse: [] }
    };
  }

  async updateStaffDirectory(guild) {
    this.assertCoopFTGuild(guild, "update the CoopFT staff directory");
    const embed = await this.buildStaffDirectoryEmbed(guild);
    const banner = this.buildStaffBanner();
    embed.setThumbnail("attachment://coopft-staff-banner.png");
    for (const key of ["staff_team"]) {
      const channelId = await this.getResource(guild.id, "channel:" + key);
      const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
      if (!channel?.isTextBased?.()) continue;
      const messageId = await this.getResource(guild.id, "message:directory:" + key);
      let message = messageId ? await channel.messages.fetch(messageId).catch(() => null) : null;
      const payload = {
        embeds: [EmbedBuilder.from(embed)],
        files: [new AttachmentBuilder(banner, { name: "coopft-staff-banner.png" })],
        attachments: [],
        allowedMentions: { parse: [] }
      };
      if (message) await message.edit(payload);
      else {
        message = await channel.send(payload);
        await this.saveResource(guild.id, "message:directory:" + key, message.id);
      }
    }
  }

  async postStaffUpdate(guild, description) {
    this.assertCoopFTGuild(guild, "post a CoopFT staff update");
    const channelId = await this.getResource(guild.id, "channel:staff_bot_updates");
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased?.()) return;
    const embed = new EmbedBuilder()
      .setColor(0x7B2438)
      .setTitle(this.emoji(guild.id, "cf3d_bell", "🔔") + "  Staff system update")
      .setDescription(String(description || "A staff system change occurred.").slice(0, 4000))
      .setTimestamp()
      .setFooter({ text: "CoopFT • Staff activity" });
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  }

  async handleButton(interaction) {
    this.assertCoopFTGuild(interaction.guild, "process a CoopFT ticket button");
    if (!interaction.customId?.startsWith("cf-ticket:")) return false;
    if (interaction.guildId !== this.guildId) {
      await interaction.reply({ content: "This ticket system is only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const [, action, value] = interaction.customId.split(":");
    if (action === "type") {
      if (!TICKET_TYPES[value]) {
        await interaction.reply({ content: "That request type is unavailable.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.showModal(this.createTicketIntakeModal(value));
      return true;
    }
    const ticketResult = await this.pool.query(
      "SELECT * FROM coopft_tickets WHERE guild_id=$1 AND id=$2 AND status='open'",
      [interaction.guildId, value]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) {
      await interaction.reply({ content: "That ticket is already closed or no longer exists.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const staff = this.canHandleTicket(interaction.member, ticket);
    if (action === "claim") {
      if (!staff) {
        await interaction.reply({ content: "Only the ticket owner or authorized ticket team can claim this request.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const claimed = await this.pool.query(
        "UPDATE coopft_tickets SET claimed_by=$3 WHERE guild_id=$1 AND id=$2 AND status='open' AND (claimed_by IS NULL OR claimed_by=$3) RETURNING id",
        [interaction.guildId, value, interaction.user.id]
      );
      if (!claimed.rowCount) {
        await interaction.reply({ content: "Another staff member has already claimed this ticket. Please coordinate in the ticket before taking over.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.reply({ content: "You claimed this ticket.", flags: MessageFlags.Ephemeral });
      await interaction.channel.send({ content: this.emoji(interaction.guildId, "cf3d_shield", "🛡️") + " This ticket is now being handled by <@" + interaction.user.id + ">.", allowedMentions: { users: [interaction.user.id] } });
      return true;
    }
    if (action === "close") {
      if (!staff && interaction.user.id !== ticket.opener_id) {
        await interaction.reply({ content: "Only the ticket owner or authorized ticket team can close this ticket.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await this.closeTicket(interaction.guild, interaction.channel, ticket, interaction.user.id);
      await interaction.editReply({ content: "Ticket closed. The conversation transcript was sent to the private transcript archive." });
      return true;
    }
    await interaction.reply({ content: "Unknown ticket action.", flags: MessageFlags.Ephemeral });
    return true;
  }

  async closeTicket(guild, channel, ticket, closedBy) {
    this.assertCoopFTGuild(guild, "close a CoopFT ticket");
    const transcriptChannelId = await this.getResource(guild.id, "channel:ticket_transcripts");
    const transcriptChannel = transcriptChannelId ? await guild.channels.fetch(transcriptChannelId).catch(() => null) : null;
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const transcript = messages
      ? [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp).map((message) => {
          const attachments = [...message.attachments.values()].map((file) => file.url).join(" ");
          return ("[" + new Date(message.createdTimestamp).toISOString() + "] " + message.author.tag + ": " +
            (message.content || "[no text]") + (attachments ? " | Attachments: " + attachments : "")).replace(/\r?\n/g, " ").slice(0, 2000);
        }).join("\n")
      : "Transcript could not be fetched. Ticket " + ticket.id;

    await this.pool.query(
      "UPDATE coopft_tickets SET status='closed',closed_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='open'",
      [guild.id, ticket.id]
    );
    if (transcriptChannel?.isTextBased?.()) {
      const buffer = Buffer.from(
        "CoopFT ticket transcript\nTicket ID: " + ticket.id +
        "\nOpened by: " + ticket.opener_id + "\nClosed by: " + closedBy +
        "\nType: " + ticket.ticket_type + "\n\n" + transcript,
        "utf8"
      );
      await transcriptChannel.send({
        content: this.emoji(guild.id, "cf3d_scroll", "📜") + " Transcript for **" + channel.name + "** • opened by <@" + ticket.opener_id + "> • closed by <@" + closedBy + ">",
        files: [new AttachmentBuilder(buffer.subarray(0, 1500000), { name: "coopft-ticket-" + ticket.id.slice(0, 8) + ".txt" })],
        allowedMentions: { parse: [] }
      });
    }
    await channel.permissionOverwrites.edit(ticket.opener_id, { SendMessages: false, AddReactions: false }).catch(() => {});
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0x687386).setTitle(this.emoji(guild.id, "cf3d_shield", "🔒") + "  Ticket closed")
        .setDescription("Closed by <@" + closedBy + ">. A transcript has been archived.")
        .setTimestamp()],
      allowedMentions: { parse: [] }
    }).catch(() => {});
    await channel.setName("⌁・closed-" + safeChannelName(channel.name).slice(0, 58)).catch(() => {});
  }
}

module.exports = { CoopFTCommunityService, CLEANUP_CONFIRMATION, TICKET_TYPES, safeChannelName, drawCoopFTEmoji };
