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
  STAFF_RANKS, APPLICATION_RANKS, EMOJI_SPRITE, CATEGORY_NAMES, PUBLIC_CHANNELS, PRIVATE_CHANNELS
} = require("../config/coopft-design");
const { COOPFT_DEFAULT_GUILD_ID, coopftGuildId } = require("../config/server-personas");

const CLEANUP_CONFIRMATION = "DELETE_EDITABLE_ROLES";
const STAFF_MANAGER_KEYS = new Set(["owner", "co_owner", "monarch", "high_rank_supervisor"]);
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
const TICKET_TYPES = Object.freeze({
  support: { label: "General Support", icon: "cf3d_headset", fallback: "🎧" },
  bug: { label: "Bug Report", icon: "cf3d_gear", fallback: "⚙️" },
  custom_bot: { label: "Custom Bot Request", icon: "cf3d_key", fallback: "🔑" },
  suggestion: { label: "Suggestion", icon: "cf3d_spark", fallback: "✨" }
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
        if (emojiImage) {
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
    if (!guild || guild.id !== this.guildId) return { staff: 0, emojis: 0 };
    const resourceKeys = STAFF_RANKS.map((spec) => "resource:role:" + spec.key);
    const result = await this.pool.query(
      "SELECT setting_key,setting_value FROM coopft_community_settings WHERE guild_id=$1 AND setting_key=ANY($2::text[])",
      [guild.id, [...resourceKeys, "emoji_map"]]
    );
    const settings = new Map(result.rows.map((row) => [row.setting_key, row.setting_value]));
    this.roles.clear();
    const loadedRoles = await Promise.all(STAFF_RANKS.map(async (spec) => {
      const id = settings.get("resource:role:" + spec.key);
      return { spec, role: id ? await guild.roles.fetch(id).catch(() => null) : null };
    }));
    const counts = { staff: 0, emojis: 0 };
    for (const item of loadedRoles) {
      if (!item.role) continue;
      this.roles.set(item.spec.key, item.role);
      counts.staff += 1;
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
    if (!role) role = guild.roles.cache.find((item) => item.name === "CF • " + spec.name && !item.managed) || null;
    let created = false;
    if (!role) {
      try {
        role = await guild.roles.create({
          name: "CF • " + spec.name,
          color: spec.primary,
          permissions: rolePermissionArray(spec),
          hoist: true,
          mentionable: false,
          reason: "CoopFT automatic server setup"
        });
      } catch (error) {
        if (!String(error.message).toLowerCase().includes("unicode") && error.code !== 50035) throw error;
        role = await guild.roles.create({
          name: "CF • " + spec.name,
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
    const expectedName = "CF • " + spec.name;
    if (role.name !== expectedName) baseChanges.name = expectedName;
    if (role.color !== spec.primary) baseChanges.color = spec.primary;
    if (role.hoist !== true) baseChanges.hoist = true;
    if (role.mentionable !== false) baseChanges.mentionable = false;
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
        item.topic === marker
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
        topic: marker,
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
      if (typeof channel.setTopic === "function" && channel.topic !== marker) {
        await channel.setTopic(marker, "Repair CoopFT managed channel marker");
      }
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
    const allowedRoles = [...this.roles.values()].map((role) => role.id);
    const supportRoles = allowedRoles.map((id) => ({
      id,
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
    const startCategory = (await this.ensureCategory(guild, "start_here", CATEGORY_NAMES.start_here)).channel;
    const communityCategory = (await this.ensureCategory(guild, "community", CATEGORY_NAMES.community)).channel;
    const servicesCategory = (await this.ensureCategory(guild, "services", CATEGORY_NAMES.services)).channel;
    const publicByKey = {};
    const startKeys = new Set(["welcome", "rules", "announcements", "introductions", "role_guide"]);
    const communityKeys = new Set(["general", "media", "showcase", "your_creation", "announcement_stage", "community_voice", "event_voice"]);
    for (const spec of PUBLIC_CHANNELS) {
      const parent = startKeys.has(spec.key)
        ? startCategory
        : communityKeys.has(spec.key) ? communityCategory : servicesCategory;
      publicByKey[spec.key] = await createChannel(spec, parent);
    }
    publicByKey.staff_directory = await createChannel({ key: "staff_directory", name: "⌗・staff-directory" }, servicesCategory);

    const retiredRoles = await this.retireLegacyManagedRoles(guild);
    const cleanup = await this.cleanupEditableRoles(guild);
    this.roles.clear();
    for (const spec of STAFF_RANKS) {
      const result = await this.ensureRole(guild, spec);
      this.roles.set(spec.key, result.role);
      if (result.created) counts.createdRoles += 1;
    }
    const staffOverwrites = await this.staffPermissionOverwrites(guild);
    const staffCategory = (await this.ensureCategory(guild, "staff_hq", CATEGORY_NAMES.staff_hq, staffOverwrites)).channel;
    const privateByKey = {};
    for (const spec of PRIVATE_CHANNELS) {
      const result = await this.ensureChannel(guild, spec, staffCategory);
      privateByKey[spec.key] = result.channel;
      if (result.created) counts.createdChannels += 1;
    }

    // Application answers are sensitive. Only the server owner and designated
    // senior staff ranks may see the review queue.
    const applicationReviewRoles = [...STAFF_MANAGER_KEYS]
      .map((key) => this.roles.get(key))
      .filter(Boolean);
    const applicationReviewOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      },
      ...applicationReviewRoles.map((role) => ({
        id: role.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      }))
    ];
    await privateByKey.application_review.permissionOverwrites.set(
      applicationReviewOverwrites,
      "Restrict CoopFT application reviews to designated senior staff"
    );

    const ticketOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
    ];
    await this.ensureCategory(guild, "tickets", CATEGORY_NAMES.tickets, ticketOverwrites);

    await this.updateStaffDirectory(guild);
    await this.ensureTicketPanel(guild, publicByKey.open_ticket);
    await this.ensureApplicationPanel(guild, publicByKey.applications);
    await this.ensureRoleGuide(guild, publicByKey.role_guide);
    await this.ensureBrandMessages(guild, publicByKey);
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

  buildRulesEmblem() {
    const canvasApi = require("@napi-rs/canvas");
    const canvas = canvasApi.createCanvas(768, 768);
    const ctx = canvas.getContext("2d");
    const bg = ctx.createLinearGradient(0, 0, 768, 768);
    bg.addColorStop(0, "#070b17");
    bg.addColorStop(0.48, "#20234e");
    bg.addColorStop(1, "#090e20");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 768, 768);
    const glow = ctx.createRadialGradient(384, 325, 20, 384, 325, 380);
    glow.addColorStop(0, "rgba(109,141,255,0.55)");
    glow.addColorStop(0.58, "rgba(135,68,202,0.22)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 768, 768);
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(205,185,255,0.52)";
    ctx.strokeRect(24, 24, 720, 720);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(106,183,255,0.45)";
    ctx.strokeRect(42, 42, 684, 684);
    for (let i = 0; i < 70; i += 1) {
      const x = (i * 113 + 27) % 768;
      const y = (i * 197 + 53) % 768;
      ctx.beginPath();
      ctx.arc(x, y, i % 8 === 0 ? 3.2 : 1.4, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.72)" : "rgba(115,190,255,0.75)";
      ctx.fill();
    }
    ctx.save();
    ctx.translate(384, 335);
    ctx.shadowColor = "#759fff";
    ctx.shadowBlur = 48;
    ctx.beginPath();
    ctx.moveTo(0, -235);
    ctx.lineTo(185, -165);
    ctx.lineTo(168, 82);
    ctx.quadraticCurveTo(118, 215, 0, 264);
    ctx.quadraticCurveTo(-118, 215, -168, 82);
    ctx.lineTo(-185, -165);
    ctx.closePath();
    const shield = ctx.createLinearGradient(-185, -235, 185, 260);
    shield.addColorStop(0, "#f4e9ff");
    shield.addColorStop(0.3, "#766be5");
    shield.addColorStop(0.68, "#1765b9");
    shield.addColorStop(1, "#7ceaff");
    ctx.fillStyle = shield;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#f4f8ff";
    ctx.lineWidth = 13;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -186);
    ctx.lineTo(123, -132);
    ctx.lineTo(108, 76);
    ctx.lineTo(0, 205);
    ctx.lineTo(-108, 76);
    ctx.lineTo(-123, -132);
    ctx.closePath();
    ctx.fillStyle = "rgba(8,16,43,0.52)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.78)";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-135, -188);
    ctx.lineTo(-84, -305);
    ctx.lineTo(-27, -223);
    ctx.lineTo(0, -365);
    ctx.lineTo(38, -223);
    ctx.lineTo(98, -304);
    ctx.lineTo(139, -188);
    ctx.closePath();
    const crown = ctx.createLinearGradient(-140, -360, 140, -180);
    crown.addColorStop(0, "#fff2ce");
    crown.addColorStop(0.46, "#aa7dff");
    crown.addColorStop(1, "#66e5ff");
    ctx.fillStyle = crown;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -160);
    ctx.lineTo(82, -25);
    ctx.lineTo(0, 145);
    ctx.lineTo(-82, -25);
    ctx.closePath();
    ctx.fillStyle = "rgba(97,187,255,0.46)";
    ctx.fill();
    ctx.strokeStyle = "#dff6ff";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 58px Arial";
    ctx.fillText("COOPFT", 384, 666);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#c2d2ff";
    ctx.font = "bold 20px Arial";
    ctx.fillText("COMMUNITY  •  RULES  •  RESPECT", 384, 706);
    return canvas.toBuffer("image/png");
  }

  async ensureBrandMessages(guild, publicChannels) {
    this.assertCoopFTGuild(guild, "publish CoopFT messages");
    let bannerAttachment = null;
    try {
      bannerAttachment = new AttachmentBuilder(this.buildRulesEmblem(), { name: "coopft-rules-crest.png" });
    } catch (error) {
      console.warn("[coopft] Could not render rules artwork; using the text-only rules embed:", error.message);
    }
    const rules = new EmbedBuilder().setColor(0x35245F)
      .setTitle(this.emoji(guild.id, "cf3d_rules", "📜") + "  COOPFT • COMMUNITY CODE")
      .setDescription([
        "Welcome to **CoopFT** — a place to build, share, compete and meet good people. These standards apply to everyone.",
        "",
        this.emoji(guild.id, "cf3d_handshake", "🤝") + " **01 · RESPECT COMES FIRST**\nTreat every member with dignity. Harassment, hate speech, discrimination, threats and targeted abuse are not allowed.",
        "",
        this.emoji(guild.id, "cf3d_spark", "✨") + " **02 · KEEP IT CONSTRUCTIVE**\nStay on topic, use the right channels, and keep disagreements civil. No flooding, spam pings or disruptive behavior.",
        "",
        this.emoji(guild.id, "cf3d_shield", "🛡️") + " **03 · KEEP COOPFT SAFE**\nNo scams, phishing, malware, malicious links, raids, impersonation or attempts to evade moderation.",
        "",
        this.emoji(guild.id, "cf3d_key", "🔐") + " **04 · PROTECT PRIVACY**\nNever share passwords, tokens, private documents, personal addresses or another person's private information.",
        "",
        this.emoji(guild.id, "cf3d_ticket", "🎟️") + " **05 · NO UNAPPROVED ADVERTISING**\nPromotions, server invites and commercial posts require staff approval. Use the appropriate showcase channels.",
        "",
        this.emoji(guild.id, "cf3d_voice", "🎙️") + " **06 · RESPECT VOICE AND EVENTS**\nNo disruptive audio, recording people without consent, or interrupting hosted sessions.",
        "",
        this.emoji(guild.id, "cf3d_idea", "💡") + " **07 · SHARE IDEAS THE RIGHT WAY**\nUse #suggestions for proposals and #open-a-ticket for private support, reports or appeals.",
        "",
        this.emoji(guild.id, "cf3d_bell", "🔔") + " **08 · RESPECT MODERATION**\nFollow staff instructions. If you disagree with a decision, appeal calmly through a ticket.",
        "",
        this.emoji(guild.id, "cf3d_gem", "💎") + " **09 · KEEP CONTENT APPROPRIATE**\nNo explicit, exploitative or illegal content. Follow Discord's Terms of Service and Community Guidelines.",
        "",
        this.emoji(guild.id, "cf3d_star", "🌟") + " **10 · HELP THE COMMUNITY GROW**\nCredit creators, welcome newcomers and contribute in good faith."
      ].join("\n"))
      .setFooter({ text: "CoopFT • Respect the space. Elevate the community." });
    if (bannerAttachment) rules.setThumbnail("attachment://coopft-rules-crest.png");
    const entries = [
      { key: "rules", channel: publicChannels.rules, embed: rules, files: bannerAttachment ? [bannerAttachment] : [] },
      {
        key: "welcome", channel: publicChannels.welcome,
        embed: new EmbedBuilder().setColor(0x235A9A)
          .setTitle(this.emoji(guild.id, "cf3d_spark", "✨") + "  WELCOME TO COOPFT")
          .setDescription("A community for people who build, share, learn and compete together. Start with **#rules**, say hello in **#introductions**, explore **#role-explanations**, and visit **#applications** when you're ready to join a team.")
          .addFields(
            { name: this.emoji(guild.id, "cf3d_rules", "📘") + " Start here", value: "Read the community code and explore the server.", inline: true },
            { name: this.emoji(guild.id, "cf3d_community", "👥") + " Meet the community", value: "Introduce yourself, share your work and join conversations.", inline: true },
            { name: this.emoji(guild.id, "cf3d_applications", "📝") + " Join a team", value: "See open positions and apply from the applications panel.", inline: true }
          )
          .setFooter({ text: "CoopFT • Build something great together" })
      },
      {
        key: "introductions", channel: publicChannels.introductions,
        embed: new EmbedBuilder().setColor(0x6B4BB8)
          .setTitle(this.emoji(guild.id, "cf3d_butterfly", "👋") + "  YOUR INTRODUCTION")
          .setDescription("New here? Tell us what you enjoy creating, your interests, the projects or games you're into, and what brought you to CoopFT. Only share information you're comfortable making public.")
          .setFooter({ text: "No pressure • Be yourself • Welcome aboard" })
      },
      {
        key: "announcements", channel: publicChannels.announcements,
        embed: new EmbedBuilder().setColor(0x263F66)
          .setTitle(this.emoji(guild.id, "cf3d_announce", "📢") + "  OFFICIAL ANNOUNCEMENTS")
          .setDescription("Official community news, important updates, event schedules and service notices appear here. Join **announcements-live** for hosted briefings and community sessions.")
          .setFooter({ text: "CoopFT • Official information" })
      },
      {
        key: "suggestions", channel: publicChannels.suggestions,
        embed: new EmbedBuilder().setColor(0x8B6AD8)
          .setTitle(this.emoji(guild.id, "cf3d_idea", "💡") + "  THE IDEA FORGE")
          .setDescription("Have an idea that could make CoopFT better? Post one suggestion per message and explain the problem, your proposed solution and the benefit to members. Keep feedback constructive and check existing ideas before posting.")
          .addFields({ name: "What happens next?", value: "The community can discuss your idea. Staff may review it, ask follow-up questions or explain the next steps." })
          .setFooter({ text: "Good ideas grow through good discussion." })
      },
      {
        key: "bot_updates", channel: publicChannels.bot_updates,
        embed: new EmbedBuilder().setColor(0x263F66)
          .setTitle(this.emoji(guild.id, "cf3d_bell", "🔔") + "  COOPFT SYSTEM UPDATES")
          .setDescription("Important CoopFT bot releases, maintenance notices and feature changes appear here.")
          .setFooter({ text: "CoopFT • System notices" })
      }
    ];
    for (const entry of entries) {
      if (!entry.channel?.isTextBased?.() || typeof entry.channel.send !== "function") {
        const unavailable = "Brand message channel is unavailable: " + entry.key;
        console.error("[coopft]", unavailable);
        if (entry.key === "rules") throw new Error(unavailable);
        continue;
      }
      const savedId = await this.getResource(guild.id, "message:" + entry.key);
      let message = savedId ? await entry.channel.messages.fetch(savedId).catch(() => null) : null;
      const payload = { embeds: [entry.embed], files: entry.files || [], allowedMentions: { parse: [] } };
      try {
        if (message) await message.edit(payload);
        else {
          message = await entry.channel.send(payload);
          await this.saveResource(guild.id, "message:" + entry.key, message.id);
        }
        console.info("[coopft] Published " + entry.key + " message in #" + entry.channel.name + ".");
      } catch (error) {
        console.error("[coopft] Could not publish " + entry.key + " message in #" + entry.channel.name + ":", error.code || error.name, error.message);
        if (entry.key !== "rules") continue;
        try {
          const fallbackEmbed = EmbedBuilder.from(entry.embed).setThumbnail(null);
          const fallbackPayload = { embeds: [fallbackEmbed], files: [], attachments: [], allowedMentions: { parse: [] } };
          if (message) await message.edit(fallbackPayload);
          else {
            message = await entry.channel.send(fallbackPayload);
            await this.saveResource(guild.id, "message:rules", message.id);
          }
          console.warn("[coopft] Published the rules embed without artwork after the attachment failed.");
        } catch (fallbackError) {
          throw new Error("The CoopFT rules embed could not be published: " + fallbackError.message);
        }
      }
    }
  }

    async buildRoleGuideEmbed(guild) {
    this.assertCoopFTGuild(guild, "build the CoopFT role guide");
    const embed = new EmbedBuilder()
      .setColor(0x344E83)
      .setTitle(this.emoji(guild.id, "cf3d_rolebook", "📚") + "  COOPFT • ROLE GUIDE")
      .setDescription([
        "Every role has a purpose. Each entry lists its actual Discord permissions.",
        "",
        "👑 **Owner / Co-Owner:** full permissions, including Administrator.",
        "🌟 **High Rank Supervisor:** all permissions except Administrator, Manage Server and Manage Channels.",
        "✦ **Operational staff:** graduated permissions appropriate to each position. Critical bot actions still require a separate leadership authorization check.",
        "Applications are reviewed privately. Accepted applicants receive the staff rank they applied for."
      ].join("\n"))
      .setFooter({ text: "CoopFT • Clear roles. Clear responsibilities." });
    for (const role of STAFF_RANKS) embed.addFields({
      name: this.emoji(guild.id, role.emoji, role.icon) + "  " + role.name,
      value: role.description + "\n\n**Discord permissions:** " + role.permissionSummary,
      inline: false
    });
    embed.addFields({
      name: "STAFF STRUCTURE",
      value: "The hierarchy above is the complete CoopFT staff structure. Applications and assignments are reviewed privately by authorized leadership.",
      inline: false
    });
    return embed;
  }

  async ensureRoleGuide(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the CoopFT role guide");
    if (!channel?.isTextBased?.()) return;
    const embed = await this.buildRoleGuideEmbed(guild);
    const savedId = await this.getResource(guild.id, "message:role_guide");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    if (message) await message.edit({ embeds: [embed], allowedMentions: { parse: [] } });
    else {
      message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      await this.saveResource(guild.id, "message:role_guide", message.id);
    }
  }

  async ensureApplicationPanel(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the CoopFT application panel");
    if (!channel?.isTextBased?.()) return;
    const embed = new EmbedBuilder()
      .setColor(0x8C1D32)
      .setTitle("COOPFT  |  STAFF APPLICATIONS")
      .setDescription([
        "Interested in joining the CoopFT staff team?",
        "",
        "Choose one available operational rank and complete the private application form. Your answers are delivered directly to the leadership review channel.",
        "",
        "**Review process**",
        "Designated leadership reviews every application. You will receive a private decision summary. Accepted applicants are assigned the rank they applied for.",
        "",
        "**Leadership appointments**",
        "Owner, Co-Owner, Monarch, High Rank Supervisor, and senior high-rank appointments are reserved for leadership selection."
      ].join("\n"))
      .setFooter({ text: "COOPFT  •  STAFF RECRUITMENT" });
    const menu = new StringSelectMenuBuilder()
      .setCustomId("cf-application:position-select")
      .setPlaceholder("Choose the staff position you want to apply for")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(APPLICATION_RANKS.map((role) => ({
        label: role.name,
        value: role.key,
        description: role.description.slice(0, 100),
        emoji: this.emojis.has(role.emoji) ? { id: this.emojis.get(role.emoji), name: role.emoji } : role.icon
      })));
    const components = [new ActionRowBuilder().addComponents(menu)];
    const savedId = await this.getResource(guild.id, "message:application_panel");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const payload = { embeds: [embed], components, allowedMentions: { parse: [] } };
    if (message) await message.edit(payload);
    else {
      message = await channel.send(payload);
      await this.saveResource(guild.id, "message:application_panel", message.id);
    }
  }

  createApplicationModal(role) {
    const modal = new ModalBuilder().setCustomId("cf-application:submit:" + role.key).setTitle("Staff application  |  " + role.name);
    const questions = [
      ["experience", "What relevant experience do you have?", TextInputStyle.Paragraph, true, 900],
      ["motivation", "Why do you want this position?", TextInputStyle.Paragraph, true, 900],
      ["scenario", "How would you handle a difficult situation?", TextInputStyle.Paragraph, true, 900],
      ["availability", "What is your usual weekly availability?", TextInputStyle.Short, true, 250],
      ["extra", "Anything else we should know? (optional)", TextInputStyle.Paragraph, false, 700]
    ];
    modal.addComponents(...questions.map(([id, label, style, required, maxLength]) =>
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label)
        .setStyle(style).setRequired(required).setMaxLength(maxLength)
        .setPlaceholder(id === "availability" ? "For example: weekday evenings and weekends" : "Write a clear, honest answer"))
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
    const role = APPLICATION_RANKS.find((item) => item.key === interaction.values?.[0]);
    if (!role) {
      await interaction.reply({ content: "That staff position is not available for applications.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const existing = await this.pool.query(
      "SELECT id FROM coopft_applications WHERE guild_id=$1 AND applicant_id=$2 AND role_key=$3 AND status='pending' LIMIT 1",
      [interaction.guildId, interaction.user.id, role.key]
    );
    if (existing.rowCount) {
      await interaction.reply({ content: "You already have a pending application for **" + role.name + "**. The review team will contact you when it has been processed.", flags: MessageFlags.Ephemeral });
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
    if (!this.canManageStaff(interaction.member, interaction.guild)) {
      await interaction.reply({ content: "Only designated CoopFT leadership can review staff applications.", flags: MessageFlags.Ephemeral });
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
      await interaction.reply({ content: "Staff applications are only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const role = APPLICATION_RANKS.find((item) => item.key === interaction.customId.split(":")[2]);
    if (!role) {
      await interaction.reply({ content: "That staff position is no longer accepting applications.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const answers = {
      experience: interaction.fields.getTextInputValue("experience").trim(),
      motivation: interaction.fields.getTextInputValue("motivation").trim(),
      scenario: interaction.fields.getTextInputValue("scenario").trim(),
      availability: interaction.fields.getTextInputValue("availability").trim(),
      extra: interaction.fields.getTextInputValue("extra").trim()
    };
    if (Object.entries(answers).filter(([key]) => key !== "extra").some(([, value]) => !value)) {
      return interaction.editReply({ content: "Please answer every required question before submitting." });
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
      await this.pool.query("UPDATE coopft_applications SET status='withdrawn',review_note='Review channel unavailable' WHERE id=$1", [inserted.rows[0].id]);
      return interaction.editReply({ content: "Your application could not be delivered to the private review team. Please contact a server owner." });
    }
    const application = inserted.rows[0];
    const reviewEmbed = new EmbedBuilder()
      .setColor(0x28384F)
      .setTitle("NEW STAFF APPLICATION  |  " + role.name.toUpperCase())
      .setDescription("A new CoopFT staff application has been submitted and is awaiting leadership review.")
      .addFields(
        { name: "Applicant", value: "<@" + interaction.user.id + ">  •  " + interaction.user.tag, inline: false },
        { name: "Position requested", value: role.name, inline: true },
        { name: "Submitted", value: "<t:" + Math.floor(new Date(application.created_at).getTime() / 1000) + ":R>", inline: true },
        { name: "Relevant experience", value: answers.experience.slice(0, 1024), inline: false },
        { name: "Motivation", value: answers.motivation.slice(0, 1024), inline: false },
        { name: "Scenario response", value: answers.scenario.slice(0, 1024), inline: false },
        { name: "Availability", value: answers.availability.slice(0, 1024), inline: false },
        { name: "Additional notes", value: answers.extra ? answers.extra.slice(0, 1024) : "Not provided", inline: false }
      )
      .setFooter({ text: "Application reference  •  " + application.id });
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
      console.error("[coopft] Could not publish a staff application to the private review channel:", error.message);
      return interaction.editReply({ content: "Your application was saved, but the private review team could not receive it. Please contact a server owner." });
    }
    await this.pool.query("UPDATE coopft_applications SET review_message_id=$2 WHERE id=$1", [application.id, reviewMessage.id]);
    await interaction.editReply({ content: "Your application for **" + role.name + "** has been submitted privately. The review team will contact you with its decision." });
    return true;
  }

  async handleApplicationDecisionReason(interaction) {
    this.assertCoopFTGuild(interaction.guild, "submit a CoopFT application decision");
    const [, , decision, applicationId] = interaction.customId.split(":");
    if (interaction.guildId !== this.guildId || !["accept", "deny"].includes(decision)) {
      await interaction.reply({ content: "This application decision is invalid.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!this.canManageStaff(interaction.member, interaction.guild)) {
      await interaction.reply({ content: "Only designated CoopFT leadership can review staff applications.", flags: MessageFlags.Ephemeral });
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
    this.assertCoopFTGuild(interaction.guild, "review a CoopFT staff application");
    if (!["accept", "deny"].includes(decision)) throw new Error("Unknown application decision.");
    const selected = await this.pool.query(
      "SELECT * FROM coopft_applications WHERE guild_id=$1 AND id=$2 AND status='pending' LIMIT 1",
      [interaction.guildId, applicationId]
    );
    const application = selected.rows[0];
    if (!application) throw new Error("This application has already been reviewed or no longer exists.");
    const roleSpec = APPLICATION_RANKS.find((item) => item.key === application.role_key);
    if (!roleSpec) throw new Error("This application is for a retired position and cannot be accepted.");
    const member = await interaction.guild.members.fetch(application.applicant_id).catch(() => null);
    if (decision === "accept" && !member) throw new Error("The applicant is no longer in CoopFT. The application was left pending.");

    let role = null;
    if (decision === "accept") {
      role = this.roles.get(roleSpec.key) || null;
      if (!role) {
        role = (await this.ensureRole(interaction.guild, roleSpec)).role;
        this.roles.set(roleSpec.key, role);
      }
    }
    const newStatus = decision === "accept" ? "approved" : "declined";
    const claimed = await this.pool.query(
      "UPDATE coopft_applications SET status=$3,reviewed_by=$4,reviewed_at=NOW(),review_note=$5 WHERE guild_id=$1 AND id=$2 AND status='pending' RETURNING id",
      [interaction.guildId, applicationId, newStatus, interaction.user.id, reason]
    );
    if (!claimed.rowCount) throw new Error("Another reviewer has already processed this application.");

    if (decision === "accept") {
      const previousRank = this.getStaffRankKey(member);
      const addedRole = !member.roles.cache.has(role.id);
      const removedPreviousRoles = [];
      try {
        if (addedRole) await member.roles.add(role, "CoopFT application accepted by " + interaction.user.tag);
        for (const rank of STAFF_RANKS) {
          if (rank.key === roleSpec.key) continue;
          const oldRole = this.roles.get(rank.key);
          if (!oldRole || !member.roles.cache.has(oldRole.id)) continue;
          await member.roles.remove(oldRole, "CoopFT application accepted; replace previous staff rank");
          removedPreviousRoles.push(oldRole);
        }
        await this.pool.query(
          "INSERT INTO coopft_staff_members (guild_id,member_id,rank_key,active,updated_by) VALUES ($1,$2,$3,TRUE,$4) " +
          "ON CONFLICT (guild_id,member_id) DO UPDATE SET rank_key=EXCLUDED.rank_key,active=TRUE,updated_at=NOW(),updated_by=EXCLUDED.updated_by",
          [interaction.guildId, member.id, roleSpec.key, interaction.user.id]
        );
        await this.recordStaffAudit(interaction.guildId, interaction.user.id, member.id, "application_accepted", {
          applicationId, from: previousRank, to: roleSpec.key, reason
        });
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
      const finalEmbed = original ? EmbedBuilder.from(original) : new EmbedBuilder().setTitle("COOPFT STAFF APPLICATION");
      const decisionText = decision === "accept" ? "ACCEPTED" : "DENIED";
      const summaryLines = [
        "**Decision:** " + decisionText,
        "**Reviewed by:** <@" + interaction.user.id + ">",
        decision === "accept" ? "**Assigned rank:** " + roleSpec.name : "**No staff rank was assigned.**",
        reason ? "**Review note:** " + reason : "**Review note:** No additional feedback was provided."
      ];
      finalEmbed
        .setColor(decision === "accept" ? 0x267A58 : 0x963A48)
        .setDescription([original?.description, "", summaryLines.join("\n")].filter(Boolean).join("\n"))
        .setFooter({ text: "Application reference  •  " + applicationId + "  •  " + decisionText });
      await reviewMessage.edit({ embeds: [finalEmbed], components: [], allowedMentions: { parse: [] } }).catch((error) => {
        console.warn("[coopft] Could not update the reviewed application message:", error.message);
      });
    }

    const applicant = await interaction.client.users.fetch(application.applicant_id).catch(() => null);
    if (applicant) {
      const resultText = decision === "accept" ? "ACCEPTED" : "DENIED";
      const dm = [
        "**COOPFT  |  APPLICATION RESULT**",
        "Your application for **" + roleSpec.name + "** has been **" + resultText + "**.",
        decision === "accept" ? "Your staff rank has been assigned. Welcome to the team." : "No staff rank was assigned.",
        "**Reviewed by:** " + interaction.user.tag,
        reason ? "**Review note:** " + reason : "**Review note:** No additional feedback was provided."
      ].join("\n\n");
      await applicant.send({ content: dm, allowedMentions: { parse: [] } }).catch((error) => {
        console.warn("[coopft] Could not DM application decision to " + application.applicant_id + ":", error.message);
      });
    }
    return { applicantId: application.applicant_id, roleName: roleSpec.name, status: newStatus, reason };
  }

  async ensureTicketPanel(guild, channel) {
    this.assertCoopFTGuild(guild, "publish the CoopFT ticket panel");
    const savedId = await this.getResource(guild.id, "message:ticket_panel");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const embed = new EmbedBuilder()
      .setColor(0x354F86)
      .setTitle(this.emoji(guild.id, "cf3d_ticket", "🎟️") + "  CoopFT Support Centre")
      .setDescription("Choose the kind of help you need. Every ticket creates a private channel visible only to you, CoopFT staff and the bot. Please do not open duplicate tickets.")
      .addFields(
        { name: this.emoji(guild.id, "cf3d_headset", "🎧") + "  General support", value: "Questions or help using CoopFT services.", inline: true },
        { name: this.emoji(guild.id, "cf3d_gear", "⚙️") + "  Bug report", value: "Something is broken or behaving incorrectly.", inline: true },
        { name: this.emoji(guild.id, "cf3d_key", "🔑") + "  Custom bot request", value: "Request a bot or automation idea.", inline: true },
        { name: this.emoji(guild.id, "cf3d_spark", "✨") + "  Suggestion", value: "Suggest a feature or improvement.", inline: true }
      )
      .setFooter({ text: "CoopFT • Private ticket system" });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cf-ticket:open:support").setLabel("Support").setStyle(ButtonStyle.Primary).setEmoji("🎧"),
      new ButtonBuilder().setCustomId("cf-ticket:open:bug").setLabel("Report bug").setStyle(ButtonStyle.Danger).setEmoji("⚙️"),
      new ButtonBuilder().setCustomId("cf-ticket:open:custom_bot").setLabel("Custom bot").setStyle(ButtonStyle.Secondary).setEmoji("🔑"),
      new ButtonBuilder().setCustomId("cf-ticket:open:suggestion").setLabel("Suggestion").setStyle(ButtonStyle.Success).setEmoji("✨")
    );
    if (message) await message.edit({ embeds: [embed], components: [row] });
    else {
      message = await channel.send({ embeds: [embed], components: [row] });
      await this.saveResource(guild.id, "message:ticket_panel", message.id);
    }
  }

  async getTicketCategory(guild) {
    this.assertCoopFTGuild(guild, "read the CoopFT ticket category");
    const id = await this.getResource(guild.id, "category:tickets");
    return id ? guild.channels.fetch(id).catch(() => null) : null;
  }

  async openTicket(guild, member, ticketType) {
    this.assertCoopFTGuild(guild, "open a CoopFT ticket");
    if (!TICKET_TYPES[ticketType]) throw new Error("Unknown ticket type.");
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
    if (!category) throw new Error("The ticket category is not set up. Ask an administrator to run /coopft-setup.");
    const me = guild.members.me || await guild.members.fetchMe();
    const staffRoles = STAFF_RANKS.map((spec) => this.roles.get(spec.key)).filter(Boolean);
    const overwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
      ...staffRoles.map((role) => ({
        id: role.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]
      }))
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
    try {
      await this.pool.query(
        "INSERT INTO coopft_tickets (id,guild_id,channel_id,opener_id,ticket_type) VALUES ($1,$2,$3,$4,$5)",
        [ticketId, guild.id, channel.id, member.id, ticketType]
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

    const info = TICKET_TYPES[ticketType];
    const embed = new EmbedBuilder().setColor(0x314D7A)
      .setTitle(this.emoji(guild.id, info.icon, info.fallback) + "  " + info.label)
      .setDescription("Welcome, <@" + member.id + ">. Describe your request with useful detail. A staff member will join shortly.")
      .addFields(
        { name: "Ticket owner", value: "<@" + member.id + ">", inline: true },
        { name: "Status", value: this.emoji(guild.id, "cf3d_spark", "🟢") + " Open", inline: true }
      )
      .setFooter({ text: "CoopFT • Ticket " + ticketId.slice(0, 8) });
    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cf-ticket:claim:" + ticketId).setLabel("Claim").setStyle(ButtonStyle.Primary).setEmoji("🛡️"),
      new ButtonBuilder().setCustomId("cf-ticket:close:" + ticketId).setLabel("Close ticket").setStyle(ButtonStyle.Danger).setEmoji("🔒")
    );
    await channel.send({
      content: "<@" + member.id + ">",
      embeds: [embed],
      components: [controls],
      allowedMentions: { users: [member.id] }
    });
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

  getStaffRankKey(member) {
    return STAFF_RANKS.find((spec) => {
      const role = this.roles.get(spec.key);
      return role && member?.roles?.cache?.has(role.id);
    })?.key || null;
  }

  assertStaffChangeAuthority(actor, target, guild, currentRankKey, nextRankKey = null) {  assertStaffChangeAuthority(actor, target, guild, currentRankKey, nextRankKey = null) {
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
    const canvas = createCanvas(1200, 340);
    const ctx = canvas.getContext("2d");
    const bg = ctx.createLinearGradient(0, 0, 1200, 340);
    bg.addColorStop(0, "#08090D");
    bg.addColorStop(0.48, "#17191F");
    bg.addColorStop(1, "#090A0E");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 340);
    const glow = ctx.createRadialGradient(600, 165, 25, 600, 165, 560);
    glow.addColorStop(0, "rgba(150,22,39,0.34)");
    glow.addColorStop(0.65, "rgba(94,14,26,0.12)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1200, 340);
    ctx.strokeStyle = "rgba(216,47,65,0.8)";
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 22, 1152, 296);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(38, 36, 1124, 268);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side < 0 ? 0 : 1200, 0);
      ctx.scale(side, 1);
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(196,36,54,0.62)";
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.moveTo(110 + i * 22, 70 + i * 20);
        ctx.lineTo(230 + i * 12, 110 + i * 18);
        ctx.lineTo(330 + i * 6, 155 + i * 12);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#F4F0EF";
    ctx.font = "bold 78px Arial";
    ctx.fillText("COOPFT", 600, 150);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#D23A4A";
    ctx.font = "bold 38px Arial";
    ctx.fillText("STAFF TEAM", 600, 205);
    ctx.strokeStyle = "rgba(211,58,74,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(390, 230);
    ctx.lineTo(810, 230);
    ctx.stroke();
    ctx.fillStyle = "rgba(236,232,232,0.72)";
    ctx.font = "20px Arial";
    ctx.fillText("LEADERSHIP  •  OPERATIONS  •  COMMUNITY", 600, 270);
    return canvas.toBuffer("image/png");
  }

  async buildStaffDirectoryEmbed(guild) {
    this.assertCoopFTGuild(guild, "build the CoopFT staff directory");
    const result = await this.pool.query(
      "SELECT member_id,rank_key FROM coopft_staff_members WHERE guild_id=$1 AND active=TRUE",
      [guild.id]
    );
    const ordered = result.rows.sort((a, b) =>
      STAFF_RANKS.findIndex((item) => item.key === a.rank_key) - STAFF_RANKS.findIndex((item) => item.key === b.rank_key)
    );
    const grouped = new Map(STAFF_RANKS.map((rank) => [rank.key, []]));
    for (const record of ordered) {
      const group = grouped.get(record.rank_key);
      if (!group) continue;
      let member = guild.members.cache.get(record.member_id);
      if (!member) member = await guild.members.fetch(record.member_id).catch(() => null);
      if (!member) {
        await this.pool.query(
          "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by='directory-reconcile' WHERE guild_id=$1 AND member_id=$2",
          [guild.id, record.member_id]
        );
        continue;
      }
      group.push("<@" + record.member_id + ">");
    }
    const sectionFor = (key) => {
      if (["owner", "co_owner", "monarch"].includes(key)) return "OWNER RANK";
      if (["high_rank_supervisor", "apex", "right_wing", "left_wing", "halo", "overseer"].includes(key)) return "HIGH RANK";
      if (["staff_supervisor", "supreme_council", "senate", "head_moderator"].includes(key)) return "LOW RANK";
      return "MOD RANK";
    };
    const sections = ["OWNER RANK", "HIGH RANK", "LOW RANK", "MOD RANK"];
    const embed = new EmbedBuilder()
      .setColor(0x8C1D32)
      .setTitle("COOPFT  |  STAFF DIRECTORY")
      .setDescription("The official CoopFT staff structure. Members appear below their current rank.")
      .setFooter({ text: "COOPFT  •  STAFF & COMMUNITY OPERATIONS" })
      .setTimestamp();
    for (const section of sections) {
      const lines = STAFF_RANKS.filter((rank) => sectionFor(rank.key) === section).map((rank) => {
        const people = grouped.get(rank.key) || [];
        return this.emoji(guild.id, rank.emoji, rank.icon) + " **" + rank.name + "**  ›  " +
          (people.length ? people.join(", ") : "_No assigned member_");
      });
      embed.addFields({
        name: "━━━━━━━━  " + section + "  ━━━━━━━━",
        value: lines.join("\n").slice(0, 1024) || "_No positions configured._",
        inline: false
      });
    }
    return embed;
  }

  async buildStaffDirectoryPayload(guild) {
    const embed = await this.buildStaffDirectoryEmbed(guild);
    embed.setImage("attachment://coopft-staff-banner.png");
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
    embed.setImage("attachment://coopft-staff-banner.png");
    for (const key of ["staff_team", "staff_directory"]) {
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

  async postStaffUpdate(guild, description) {  async postStaffUpdate(guild, description) {
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
    if (action === "open") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await this.openTicket(interaction.guild, interaction.member, value);
      await interaction.editReply({ content: result.existing ? "You already have an open ticket: <#" + result.channel.id + ">." : "Your private ticket is ready: <#" + result.channel.id + ">." });
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
    const staff = this.isStaff(interaction.member);
    if (action === "claim") {
      if (!staff) {
        await interaction.reply({ content: "Only CoopFT staff can claim tickets.", flags: MessageFlags.Ephemeral });
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
        await interaction.reply({ content: "Only the ticket owner or CoopFT staff can close this ticket.", flags: MessageFlags.Ephemeral });
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
