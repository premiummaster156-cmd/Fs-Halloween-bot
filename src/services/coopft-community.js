"use strict";

const { randomUUID } = require("node:crypto");
const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
  MessageFlags, PermissionFlagsBits, Routes
} = require("discord.js");
const {
  STAFF_RANKS, HR_ROLES, APPLICATION_ROLES, EMOJI_SPRITE, PUBLIC_CHANNELS, PRIVATE_CHANNELS
} = require("../config/coopft-design");
const { coopftGuildId } = require("../config/server-personas");

const CLEANUP_CONFIRMATION = "DELETE_EDITABLE_ROLES";
const STAFF_MANAGER_KEYS = new Set(["owner", "co_owner", "high_rank_supervisor"]);
const HR_MANAGER_KEYS = new Set(["hr_director", "hr_manager"]);
const TICKET_TYPES = Object.freeze({
  support: { label: "General Support", icon: "cf_headset", fallback: "🎧" },
  bug: { label: "Bug Report", icon: "cf_gear", fallback: "⚙️" },
  custom_bot: { label: "Custom Bot Request", icon: "cf_key", fallback: "🔑" },
  suggestion: { label: "Suggestion", icon: "cf_spark", fallback: "✨" }
});

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
    case "cf_crown":
      stroke(() => { ctx.moveTo(15, 42); ctx.lineTo(29, 87); ctx.lineTo(99, 87); ctx.lineTo(113, 42); ctx.lineTo(88, 59); ctx.lineTo(64, 25); ctx.lineTo(40, 59); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(29, 97); ctx.lineTo(99, 97); }, "#fff0bd", 8);
      diamond(64, 59, 12, 14);
      break;
    case "cf_shield":
      shield();
      star(64, 62, 27, 12, 4, gem);
      break;
    case "cf_star":
      star(64, 63, 49, 21, 8, metal);
      diamond(64, 63, 12, 16);
      break;
    case "cf_gem":
      diamond(64, 65, 48, 43, gem);
      line(() => { ctx.moveTo(16, 51); ctx.lineTo(112, 51); ctx.moveTo(64, 22); ctx.lineTo(64, 108); }, "#effaff", 3);
      break;
    case "cf_butterfly":
      stroke(() => { ctx.moveTo(64, 58); ctx.bezierCurveTo(13, 0, 1, 62, 47, 76); ctx.bezierCurveTo(12, 122, 59, 111, 64, 78); ctx.bezierCurveTo(69, 111, 116, 122, 81, 76); ctx.bezierCurveTo(127, 62, 115, 0, 64, 58); ctx.closePath(); }, gem);
      line(() => { ctx.moveTo(64, 49); ctx.lineTo(64, 100); }, "#ffffff", 4);
      break;
    case "cf_leaf":
      stroke(() => { ctx.moveTo(19, 102); ctx.bezierCurveTo(18, 26, 76, 5, 111, 17); ctx.bezierCurveTo(117, 82, 71, 119, 19, 102); ctx.closePath(); }, gem);
      line(() => { ctx.moveTo(24, 105); ctx.quadraticCurveTo(62, 67, 105, 25); }, "#e9ffe7", 5);
      break;
    case "cf_flame":
      stroke(() => { ctx.moveTo(64, 117); ctx.bezierCurveTo(5, 105, 24, 56, 53, 20); ctx.bezierCurveTo(48, 53, 80, 47, 80, 8); ctx.bezierCurveTo(137, 69, 111, 112, 64, 117); ctx.closePath(); }, gem);
      stroke(() => { ctx.moveTo(64, 103); ctx.bezierCurveTo(34, 90, 54, 67, 68, 54); ctx.bezierCurveTo(67, 76, 92, 74, 87, 98); ctx.closePath(); }, "#fff0c7", "#ffffff");
      break;
    case "cf_ice":
      diamond(64, 45, 25, 42, gem); diamond(35, 81, 15, 27); diamond(95, 83, 17, 29);
      line(() => { ctx.moveTo(64, 10); ctx.lineTo(64, 119); ctx.moveTo(13, 83); ctx.lineTo(115, 83); }, "#e8fbff", 3);
      break;
    case "cf_key":
      ctx.beginPath(); ctx.arc(42, 44, 24, 0, Math.PI * 2); ctx.fillStyle = metal; ctx.fill(); ctx.strokeStyle = "#fff0c2"; ctx.lineWidth = 5; ctx.stroke();
      line(() => { ctx.moveTo(58, 62); ctx.lineTo(108, 112); ctx.moveTo(86, 92); ctx.lineTo(75, 103); ctx.moveTo(99, 105); ctx.lineTo(89, 116); }, "#f7d99a", 11);
      diamond(42, 44, 11, 14, gem);
      break;
    case "cf_ticket":
    case "cf_ticket_staff":
      stroke(() => { ctx.moveTo(14, 35); ctx.lineTo(114, 35); ctx.lineTo(114, 53); ctx.bezierCurveTo(98, 62, 98, 72, 114, 81); ctx.lineTo(114, 99); ctx.lineTo(14, 99); ctx.lineTo(14, 81); ctx.bezierCurveTo(30, 72, 30, 62, 14, 53); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(64, 42); ctx.lineTo(64, 92); }, "#fff0c4", 3);
      star(40, 68, 13, 6, 4, gem);
      if (name === "cf_ticket_staff") line(() => { ctx.arc(91, 34, 22, Math.PI, Math.PI * 2); ctx.moveTo(69, 34); ctx.lineTo(69, 62); ctx.moveTo(113, 34); ctx.lineTo(113, 62); }, "#d8eaff", 6);
      break;
    case "cf_scroll":
    case "cf_rolebook":
    case "cf_rules":
    case "cf_applications":
      stroke(() => { ctx.moveTo(30, 19); ctx.bezierCurveTo(16, 19, 16, 40, 30, 40); ctx.lineTo(93, 40); ctx.bezierCurveTo(111, 40, 111, 19, 93, 19); ctx.lineTo(30, 19); ctx.lineTo(30, 100); ctx.bezierCurveTo(17, 100, 17, 119, 34, 119); ctx.lineTo(98, 119); ctx.lineTo(98, 35); }, metal);
      line(() => { ctx.moveTo(43, 52); ctx.lineTo(85, 52); ctx.moveTo(43, 67); ctx.lineTo(85, 67); ctx.moveTo(43, 82); ctx.lineTo(76, 82); }, "#fff1c8", 4);
      if (name === "cf_applications") line(() => { ctx.moveTo(84, 91); ctx.lineTo(112, 61); ctx.lineTo(119, 70); ctx.lineTo(91, 101); ctx.closePath(); }, "#e4c8ff", 6);
      if (name === "cf_rules") star(88, 91, 12, 5, 4, gem);
      break;
    case "cf_headset":
      line(() => { ctx.arc(64, 65, 43, Math.PI, 0); }, "#c9faff", 9);
      stroke(() => { ctx.roundRect(15, 58, 23, 44, 9); }, metal);
      stroke(() => { ctx.roundRect(90, 58, 23, 44, 9); }, metal);
      line(() => { ctx.moveTo(100, 92); ctx.quadraticCurveTo(112, 111, 91, 113); }, "#71f3e8", 6);
      break;
    case "cf_gear":
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
    case "cf_bell":
      stroke(() => { ctx.moveTo(29, 87); ctx.quadraticCurveTo(40, 76, 40, 52); ctx.arc(64, 52, 24, Math.PI, 0); ctx.quadraticCurveTo(88, 76, 99, 87); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(22, 91); ctx.lineTo(106, 91); ctx.moveTo(55, 105); ctx.quadraticCurveTo(64, 119, 73, 105); }, "#ffe3a6", 7);
      diamond(64, 52, 9, 12);
      break;
    case "cf_handshake":
      stroke(() => { ctx.moveTo(12, 54); ctx.lineTo(38, 34); ctx.lineTo(60, 49); ctx.lineTo(82, 34); ctx.lineTo(116, 55); ctx.lineTo(92, 91); ctx.lineTo(77, 82); ctx.lineTo(63, 96); ctx.lineTo(49, 83); ctx.lineTo(36, 94); ctx.closePath(); }, metal);
      line(() => { ctx.moveTo(40, 60); ctx.lineTo(66, 81); ctx.lineTo(83, 66); ctx.lineTo(99, 77); }, "#fff1c4", 8);
      break;
    case "cf_spark":
      star(64, 64, 52, 9, 4, gem); star(23, 25, 12, 4, 4); star(105, 100, 14, 4, 4);
      break;
    case "cf_war":
      line(() => { ctx.moveTo(22, 18); ctx.lineTo(105, 111); ctx.moveTo(106, 18); ctx.lineTo(22, 111); }, "#f4e2c1", 10);
      line(() => { ctx.moveTo(12, 20); ctx.lineTo(31, 14); ctx.lineTo(24, 34); ctx.moveTo(116, 20); ctx.lineTo(97, 14); ctx.lineTo(104, 34); }, "#dbeaff", 7);
      diamond(64, 64, 12, 13, gem);
      break;
    case "cf_referee":
      line(() => { ctx.moveTo(64, 22); ctx.lineTo(64, 98); ctx.moveTo(24, 108); ctx.lineTo(104, 108); ctx.moveTo(30, 39); ctx.lineTo(98, 39); }, "#f3d89a", 7);
      line(() => { ctx.moveTo(32, 39); ctx.lineTo(18, 77); ctx.quadraticCurveTo(32, 94, 46, 77); ctx.closePath(); ctx.moveTo(96, 39); ctx.lineTo(82, 77); ctx.quadraticCurveTo(96, 94, 110, 77); ctx.closePath(); }, "#f5e7c3", 5);
      diamond(64, 22, 11, 14, gem);
      break;
    case "cf_observer":
      stroke(() => { ctx.moveTo(8, 64); ctx.quadraticCurveTo(64, 5, 120, 64); ctx.quadraticCurveTo(64, 123, 8, 64); ctx.closePath(); }, metal);
      ctx.beginPath(); ctx.arc(64, 64, 25, 0, Math.PI * 2); ctx.fillStyle = gem; ctx.fill(); ctx.strokeStyle = "#f2f7ff"; ctx.lineWidth = 4; ctx.stroke();
      ctx.beginPath(); ctx.arc(64, 64, 9, 0, Math.PI * 2); ctx.fillStyle = "#15182e"; ctx.fill();
      break;
    case "cf_helper":
      stroke(() => { ctx.moveTo(19, 70); ctx.lineTo(43, 47); ctx.lineTo(60, 62); ctx.lineTo(89, 37); ctx.bezierCurveTo(103, 25, 117, 43, 104, 55); ctx.lineTo(65, 102); ctx.quadraticCurveTo(51, 116, 36, 101); ctx.closePath(); }, metal);
      star(64, 72, 16, 7, 4, gem);
      break;
    case "cf_announce":
      stroke(() => { ctx.moveTo(18, 53); ctx.lineTo(90, 25); ctx.lineTo(90, 100); ctx.lineTo(18, 76); ctx.closePath(); }, metal);
      stroke(() => { ctx.roundRect(9, 52, 19, 25, 4); }, gem);
      line(() => { ctx.moveTo(39, 79); ctx.lineTo(51, 111); ctx.lineTo(73, 111); ctx.lineTo(66, 88); }, "#f0d9ad", 8);
      break;
    case "cf_voice":
      line(() => { ctx.moveTo(15, 65); ctx.lineTo(29, 65); ctx.lineTo(40, 38); ctx.lineTo(51, 94); ctx.lineTo(64, 22); ctx.lineTo(77, 103); ctx.lineTo(90, 45); ctx.lineTo(101, 79); ctx.lineTo(114, 65); }, "#87efff", 8);
      break;
    case "cf_idea":
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
    this.guildId = options.guildId || coopftGuildId;
    this.roles = new Map();
    this.applicationRoles = new Map();
    this.emojis = new Map();
  }

  async getSetting(guildId, key) {
    const result = await this.pool.query(
      "SELECT setting_value FROM coopft_community_settings WHERE guild_id=$1 AND setting_key=$2",
      [guildId, key]
    );
    return result.rows[0]?.setting_value ?? null;
  }

  async setSetting(guildId, key, value) {
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
    const result = { created: 0, available: 0, failed: [] };
    // Rebuild from the current guild cache so deleted custom emojis never leave stale markup.
    this.emojis.clear();
    const found = new Map(guild.emojis.cache.map((emoji) => [emoji.name, emoji]));
    let canvasApi = null;
    try {
      canvasApi = require("@napi-rs/canvas");
    } catch (error) {
      result.failed.push("emoji renderer unavailable: " + error.message);
    }
    for (let index = 0; index < EMOJI_SPRITE.length; index += 1) {
      const name = EMOJI_SPRITE[index];
      const existing = found.get(name);
      if (existing) {
        this.emojis.set(name, existing.id);
        result.available += 1;
        continue;
      }
      if (!canvasApi || !guild.members.me?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
        result.failed.push(name + ": missing Manage Expressions permission or canvas support");
        continue;
      }
      try {
        const canvas = canvasApi.createCanvas(128, 128);
        const context = canvas.getContext("2d");
        drawCoopFTEmoji(context, name, index);
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

  async loadManagedRoles(guild) {
    if (!guild || guild.id !== this.guildId) return { staff: 0, hr: 0, applications: 0, emojis: 0 };
    const roleGroups = [
      { specs: STAFF_RANKS, target: this.roles, count: "staff" },
      { specs: HR_ROLES, target: this.roles, count: "hr" },
      { specs: APPLICATION_ROLES, target: this.applicationRoles, count: "applications" }
    ];
    const resourceKeys = roleGroups.flatMap(({ specs }) => specs.map((spec) => "resource:role:" + spec.key));
    const result = await this.pool.query(
      "SELECT setting_key,setting_value FROM coopft_community_settings " +
        "WHERE guild_id=$1 AND setting_key=ANY($2::text[])",
      [guild.id, [...resourceKeys, "emoji_map"]]
    );
    const settings = new Map(result.rows.map((row) => [row.setting_key, row.setting_value]));
    this.roles.clear();
    this.applicationRoles.clear();
    const roleLookups = roleGroups.flatMap(({ specs, target, count }) => specs.map((spec) => ({
      id: settings.get("resource:role:" + spec.key),
      key: spec.key,
      target,
      count
    })));
    const loadedRoles = await Promise.all(roleLookups.map(async (item) => ({
      ...item,
      role: item.id ? await guild.roles.fetch(item.id).catch(() => null) : null
    })));
    const counts = { staff: 0, hr: 0, applications: 0, emojis: 0 };
    for (const item of loadedRoles) {
      if (!item.role) continue;
      item.target.set(item.key, item.role);
      counts[item.count] += 1;
    }
    const savedEmojiMap = settings.get("emoji_map");
    this.emojis.clear();
    if (savedEmojiMap && typeof savedEmojiMap === "object") {
      const emojiLookups = await Promise.all(Object.entries(savedEmojiMap).map(async ([name, id]) => ({
        name,
        emoji: await guild.emojis.fetch(id).catch(() => null)
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
          permissions: [],
          hoist: true,
          mentionable: false,
          reason: "CoopFT automatic server setup"
        });
      } catch (error) {
        if (!String(error.message).toLowerCase().includes("unicode") && error.code !== 50035) throw error;
        role = await guild.roles.create({
          name: "CF • " + spec.name,
          color: spec.primary,
          permissions: [],
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
    if (permissionBits !== undefined && BigInt(permissionBits) !== 0n) baseChanges.permissions = [];
    if (Object.keys(baseChanges).length) {
      if (role.editable !== false && typeof role.edit === "function") {
        try {
          role = await role.edit({
            ...baseChanges,
            reason: "Repair CoopFT managed staff role properties"
          });
        } catch (error) {
          console.warn("[coopft] Could not repair base styling for " + spec.name + ":", error.message);
        }
      } else {
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
    const resourceKey = "category:" + key;
    const savedId = await this.getResource(guild.id, resourceKey);
    let category = savedId ? await guild.channels.fetch(savedId).catch(() => null) : null;
    if (!category) {
      category = guild.channels.cache.find((channel) =>
        channel.type === ChannelType.GuildCategory &&
        channel.name === name &&
        channel.topic === "coopft-managed:v1:" + key
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
    const marker = "coopft-managed:v1:" + spec.key;
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
    const resourceKey = "channel:" + key;
    const savedId = await this.getResource(guild.id, resourceKey);
    if (!savedId) return false;
    const channel = await guild.channels.fetch(savedId).catch(() => null);
    if (!channel) return false;
    if (channel.topic !== "coopft-managed:v1:" + key) return false;
    await channel.delete("Remove retired CoopFT-managed channel: " + key);
    await this.setSetting(guild.id, "resource:" + resourceKey, null);
    return true;
  }

  async staffPermissionOverwrites(guild) {
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
    if (!guild || guild.id !== this.guildId) throw new Error("CoopFT setup can only run in the configured CoopFT server.");
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!me) throw new Error("The bot's server member could not be fetched.");
    const required = [
      PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ViewAuditLog
    ];
    const missing = required.filter((permission) => !me.permissions.has(permission));
    if (missing.length) throw new Error("CoopFT setup requires Manage Roles, Manage Channels, View Channel, Send Messages, Embed Links, Read Message History and View Audit Log. Missing: " + missing.join(", "));

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
    const startCategory = (await this.ensureCategory(guild, "start_here", "✦ START HERE")).channel;
    const communityCategory = (await this.ensureCategory(guild, "community", "✦ COMMUNITY")).channel;
    const servicesCategory = (await this.ensureCategory(guild, "services", "✦ COOPFT SERVICES")).channel;
    const publicByKey = {};
    const startKeys = new Set(["welcome", "rules", "announcements", "introductions", "role_guide"]);
    const communityKeys = new Set(["general", "media", "showcase", "your_creation", "announcement_stage", "community_voice", "event_voice"]);
    for (const spec of PUBLIC_CHANNELS) {
      const parent = startKeys.has(spec.key)
        ? startCategory
        : communityKeys.has(spec.key) ? communityCategory : servicesCategory;
      publicByKey[spec.key] = await createChannel(spec, parent);
    }
    publicByKey.staff_directory = await createChannel({ key: "staff_directory", name: "staff-directory" }, servicesCategory);

    const cleanup = await this.cleanupEditableRoles(guild);
    this.roles.clear();
    for (const spec of [...STAFF_RANKS, ...HR_ROLES]) {
      const result = await this.ensureRole(guild, spec);
      this.roles.set(spec.key, result.role);
      if (result.created) counts.createdRoles += 1;
    }
    this.applicationRoles.clear();
    for (const spec of APPLICATION_ROLES) {
      const result = await this.ensureRole(guild, spec);
      this.applicationRoles.set(spec.key, result.role);
      if (result.created) counts.createdRoles += 1;
    }

    const staffOverwrites = await this.staffPermissionOverwrites(guild);
    const staffCategory = (await this.ensureCategory(guild, "staff_hq", "✦ STAFF HQ", staffOverwrites)).channel;
    const privateByKey = {};
    for (const spec of PRIVATE_CHANNELS) {
      const result = await this.ensureChannel(guild, spec, staffCategory);
      privateByKey[spec.key] = result.channel;
      if (result.created) counts.createdChannels += 1;
    }

    const ticketOverwrites = [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }
    ];
    await this.ensureCategory(guild, "tickets", "✦ PRIVATE TICKETS", ticketOverwrites);

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
          this.emoji(guild.id, "cf_shield", "🛡️") + " **One-time role cleanup preview**\\n" +
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
        this.emoji(guild.id, "cf_shield", "🛡️") + " One-time cleanup completed. Deleted " + cleanup.deleted +
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
    return { ...counts, cleanup, emojiResult };
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
    let bannerAttachment = null;
    try {
      bannerAttachment = new AttachmentBuilder(this.buildRulesEmblem(), { name: "coopft-rules-crest.png" });
    } catch (error) {
      console.warn("[coopft] Could not render rules artwork; using the text-only rules embed:", error.message);
    }
    const rules = new EmbedBuilder().setColor(0x35245F)
      .setTitle(this.emoji(guild.id, "cf_rules", "📜") + "  COOPFT • COMMUNITY CODE")
      .setDescription([
        "Welcome to **CoopFT** — a place to build, share, compete and meet good people. These standards apply to everyone.",
        "",
        this.emoji(guild.id, "cf_handshake", "🤝") + " **01 · RESPECT COMES FIRST**\\nTreat every member with dignity. Harassment, hate speech, discrimination, threats and targeted abuse are not allowed.",
        "",
        this.emoji(guild.id, "cf_spark", "✨") + " **02 · KEEP IT CONSTRUCTIVE**\\nStay on topic, use the right channels, and keep disagreements civil. No flooding, spam pings or disruptive behavior.",
        "",
        this.emoji(guild.id, "cf_shield", "🛡️") + " **03 · KEEP COOPFT SAFE**\\nNo scams, phishing, malware, malicious links, raids, impersonation or attempts to evade moderation.",
        "",
        this.emoji(guild.id, "cf_key", "🔐") + " **04 · PROTECT PRIVACY**\\nNever share passwords, tokens, private documents, personal addresses or another person's private information.",
        "",
        this.emoji(guild.id, "cf_ticket", "🎟️") + " **05 · NO UNAPPROVED ADVERTISING**\\nPromotions, server invites and commercial posts require staff approval. Use the appropriate showcase channels.",
        "",
        this.emoji(guild.id, "cf_voice", "🎙️") + " **06 · RESPECT VOICE AND EVENTS**\\nNo disruptive audio, recording people without consent, or interrupting hosted sessions.",
        "",
        this.emoji(guild.id, "cf_idea", "💡") + " **07 · SHARE IDEAS THE RIGHT WAY**\\nUse #suggestions for proposals and #open-a-ticket for private support, reports or appeals.",
        "",
        this.emoji(guild.id, "cf_bell", "🔔") + " **08 · RESPECT MODERATION**\\nFollow staff instructions. If you disagree with a decision, appeal calmly through a ticket.",
        "",
        this.emoji(guild.id, "cf_gem", "💎") + " **09 · KEEP CONTENT APPROPRIATE**\\nNo explicit, exploitative or illegal content. Follow Discord's Terms of Service and Community Guidelines.",
        "",
        this.emoji(guild.id, "cf_star", "🌟") + " **10 · HELP THE COMMUNITY GROW**\\nCredit creators, welcome newcomers and contribute in good faith."
      ].join("\\n"))
      .setThumbnail(bannerAttachment ? "attachment://coopft-rules-crest.png" : null)
      .setFooter({ text: "CoopFT • Respect the space. Elevate the community." });
    const entries = [
      { key: "rules", channel: publicChannels.rules, embed: rules, files: bannerAttachment ? [bannerAttachment] : [] },
      {
        key: "welcome", channel: publicChannels.welcome,
        embed: new EmbedBuilder().setColor(0x235A9A)
          .setTitle(this.emoji(guild.id, "cf_spark", "✨") + "  WELCOME TO COOPFT")
          .setDescription("A community for people who build, share, learn and compete together. Start with **#rules**, say hello in **#introductions**, explore **#role-explanations**, and visit **#applications** when you're ready to join a team.")
          .addFields(
            { name: this.emoji(guild.id, "cf_rules", "📘") + " Start here", value: "Read the community code and explore the server.", inline: true },
            { name: this.emoji(guild.id, "cf_applications", "📝") + " Join a team", value: "See open positions and apply from the applications panel.", inline: true }
          )
          .setFooter({ text: "CoopFT • Build something great together" })
      },
      {
        key: "introductions", channel: publicChannels.introductions,
        embed: new EmbedBuilder().setColor(0x6B4BB8)
          .setTitle(this.emoji(guild.id, "cf_butterfly", "👋") + "  YOUR INTRODUCTION")
          .setDescription("New here? Tell us what you enjoy creating, your interests, the projects or games you're into, and what brought you to CoopFT. Only share information you're comfortable making public.")
          .setFooter({ text: "No pressure • Be yourself • Welcome aboard" })
      },
      {
        key: "announcements", channel: publicChannels.announcements,
        embed: new EmbedBuilder().setColor(0x263F66)
          .setTitle(this.emoji(guild.id, "cf_announce", "📢") + "  OFFICIAL ANNOUNCEMENTS")
          .setDescription("Official community news, important updates, event schedules and service notices appear here. Join **announcements-live** for hosted briefings and community sessions.")
          .setFooter({ text: "CoopFT • Official information" })
      },
      {
        key: "suggestions", channel: publicChannels.suggestions,
        embed: new EmbedBuilder().setColor(0x8B6AD8)
          .setTitle(this.emoji(guild.id, "cf_idea", "💡") + "  THE IDEA FORGE")
          .setDescription("Have an idea that could make CoopFT better? Post one suggestion per message and explain the problem, your proposed solution and the benefit to members. Keep feedback constructive and check existing ideas before posting.")
          .addFields({ name: "What happens next?", value: "The community can discuss your idea. Staff may review it, ask follow-up questions or explain the next steps." })
          .setFooter({ text: "Good ideas grow through good discussion." })
      },
      {
        key: "bot_updates", channel: publicChannels.bot_updates,
        embed: new EmbedBuilder().setColor(0x263F66)
          .setTitle(this.emoji(guild.id, "cf_bell", "🔔") + "  COOPFT SYSTEM UPDATES")
          .setDescription("Important CoopFT bot releases, maintenance notices and feature changes appear here.")
          .setFooter({ text: "CoopFT • System notices" })
      }
    ];
    for (const entry of entries) {
      if (!entry.channel?.isTextBased?.() || typeof entry.channel.send !== "function") continue;
      const savedId = await this.getResource(guild.id, "message:" + entry.key);
      let message = savedId ? await entry.channel.messages.fetch(savedId).catch(() => null) : null;
      const payload = { embeds: [entry.embed], files: entry.files || [], allowedMentions: { parse: [] } };
      if (message) await message.edit(payload);
      else {
        message = await entry.channel.send(payload);
        await this.saveResource(guild.id, "message:" + entry.key, message.id);
      }
    }
  }

  async buildRoleGuideEmbed(guild) {
    const embed = new EmbedBuilder()
      .setColor(0x344E83)
      .setTitle(this.emoji(guild.id, "cf_rolebook", "📚") + "  COOPFT • ROLE GUIDE")
      .setDescription("Every role has a purpose. This guide explains each team's responsibilities. Role titles do not automatically grant Discord administrator permissions.")
      .setFooter({ text: "CoopFT • Clear roles. Clear responsibilities." });
    for (const role of STAFF_RANKS) embed.addFields({
      name: this.emoji(guild.id, role.emoji, role.icon) + "  " + role.name,
      value: role.description,
      inline: false
    });
    embed.addFields({ name: this.emoji(guild.id, "cf_key", "🔑") + "  HUMAN RESOURCES", value: "The HR team handles recruitment, candidate communication and staff development.", inline: false });
    for (const role of HR_ROLES) embed.addFields({
      name: this.emoji(guild.id, role.emoji, role.icon) + "  " + role.name,
      value: role.description,
      inline: false
    });
    embed.addFields({ name: this.emoji(guild.id, "cf_applications", "📝") + "  SPECIALIST POSITIONS", value: "These positions support events and community operations. They are separate from the staff-rank and HR hierarchies.", inline: false });
    for (const role of APPLICATION_ROLES) embed.addFields({
      name: this.emoji(guild.id, role.emoji, role.icon) + "  " + role.name,
      value: role.description,
      inline: false
    });
    return embed;
  }

  async ensureRoleGuide(guild, channel) {
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

  async isApplicationOpen(guildId, roleKey) {
    const setting = await this.getSetting(guildId, "application_open:" + roleKey);
    return setting !== false;
  }

  async setApplicationOpen(guild, roleKey, isOpen) {
    if (!APPLICATION_ROLES.some((role) => role.key === roleKey)) throw new Error("Unknown application position.");
    const wasOpen = await this.isApplicationOpen(guild.id, roleKey);
    await this.setSetting(guild.id, "application_open:" + roleKey, Boolean(isOpen));
    const channelId = await this.getResource(guild.id, "channel:applications");
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (channel) await this.ensureApplicationPanel(guild, channel);
    if (isOpen && !wasOpen) {
      await this.notifyApplicationSubscribers(guild, roleKey).catch((error) => {
        console.warn("[coopft] Could not send application opening notifications:", error.message);
      });
    }
    return Boolean(isOpen);
  }

  async showApplicationNotificationPreferences(interaction) {
    const saved = await this.pool.query(
      "SELECT role_key FROM coopft_application_subscriptions WHERE guild_id=$1 AND member_id=$2",
      [interaction.guildId, interaction.user.id]
    );
    const selected = new Set(saved.rows.map((row) => row.role_key));
    const menu = new StringSelectMenuBuilder()
      .setCustomId("cf-application:notify-select")
      .setPlaceholder("Choose positions to receive opening alerts")
      .setMinValues(0)
      .setMaxValues(APPLICATION_ROLES.length)
      .addOptions(APPLICATION_ROLES.map((role) => ({
        label: role.name,
        value: role.key,
        description: "Notify me when " + role.name + " applications open",
        default: selected.has(role.key),
        emoji: this.emojis.has(role.emoji) ? { id: this.emojis.get(role.emoji), name: role.emoji } : role.icon
      })));
    const selectionRow = new ActionRowBuilder().addComponents(menu);
    const clearRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cf-application:clear-notifications")
        .setLabel("Clear all alerts")
        .setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      content: "🔔 **Application opening alerts**\\nChoose which positions you want a private DM about when applications reopen. No messages are sent unless you opt in.",
      components: [selectionRow, clearRow],
      flags: MessageFlags.Ephemeral
    });
  }

  async handleApplicationSelectMenu(interaction) {
    if (interaction.guildId !== this.guildId || interaction.customId !== "cf-application:notify-select") {
      await interaction.reply({ content: "These notification settings are only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const selected = interaction.values.filter((value) => APPLICATION_ROLES.some((role) => role.key === value));
    await this.pool.query(
      "DELETE FROM coopft_application_subscriptions WHERE guild_id=$1 AND member_id=$2",
      [interaction.guildId, interaction.user.id]
    );
    if (selected.length) {
      const placeholders = selected.map((_, index) => "($1,$2,$" + (index + 3) + ")").join(",");
      await this.pool.query(
        "INSERT INTO coopft_application_subscriptions (guild_id,member_id,role_key) VALUES " +
          placeholders + " ON CONFLICT DO NOTHING",
        [interaction.guildId, interaction.user.id, ...selected]
      );
    }
    await interaction.update({
      content: selected.length
        ? "✅ Alerts saved. I'll DM you when " + selected.map((key) => APPLICATION_ROLES.find((role) => role.key === key).name).join(", ") + " applications reopen."
        : "Application opening alerts are now turned off.",
      components: []
    });
    return true;
  }

  async notifyApplicationSubscribers(guild, roleKey) {
    const role = APPLICATION_ROLES.find((item) => item.key === roleKey);
    if (!role) return { sent: 0, failed: 0 };
    const subscribers = await this.pool.query(
      "SELECT member_id FROM coopft_application_subscriptions WHERE guild_id=$1 AND role_key=$2",
      [guild.id, roleKey]
    );
    const channelId = await this.getResource(guild.id, "channel:applications");
    const link = channelId
      ? " https://discord.com/channels/" + guild.id + "/" + channelId
      : "";
    let sent = 0;
    let failed = 0;
    for (const row of subscribers.rows) {
      const user = await guild.client.users.fetch(row.member_id).catch(() => null);
      if (!user) { failed += 1; continue; }
      try {
        await user.send({
          content: "🔔 **CoopFT application alert**\\nApplications for **" + role.name +
            "** are now open again. You can apply here:" + link,
          allowedMentions: { parse: [] }
        });
        sent += 1;
      } catch (_) {
        failed += 1;
      }
    }
    return { sent, failed };
  }

  async ensureApplicationPanel(guild, channel) {
    if (!channel?.isTextBased?.()) return;
    const statuses = await Promise.all(APPLICATION_ROLES.map(async (role) => ({
      role, open: await this.isApplicationOpen(guild.id, role.key)
    })));
    const embed = new EmbedBuilder()
      .setColor(0x344E83)
      .setTitle(this.emoji(guild.id, "cf_applications", "📝") + "  COOPFT • TEAM APPLICATIONS")
      .setDescription("Ready to contribute? Choose the position that fits your skills. Your answers are sent privately and reviewed by authorized CoopFT staff. Quality and honesty matter more than length.")
      .setFooter({ text: "One pending application per position • Keep your answers honest" });
    for (const { role, open } of statuses) embed.addFields({
      name: this.emoji(guild.id, role.emoji, role.icon) + "  " + role.name + "  •  " + (open ? "OPEN" : "CLOSED"),
      value: role.description,
      inline: false
    });
    const buttons = new ActionRowBuilder().addComponents(
      ...statuses.map(({ role, open }) => new ButtonBuilder()
        .setCustomId("cf-application:apply:" + role.key)
        .setLabel(role.name)
        .setEmoji(this.emojis.has(role.emoji) ? { id: this.emojis.get(role.emoji), name: role.emoji } : role.icon)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!open))
    );
    const notificationButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("cf-application:notifications")
        .setLabel("Manage opening alerts")
        .setEmoji(this.emojis.has("cf_bell") ? { id: this.emojis.get("cf_bell"), name: "cf_bell" } : "🔔")
        .setStyle(ButtonStyle.Secondary)
    );
    const savedId = await this.getResource(guild.id, "message:application_panel");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const components = [buttons, notificationButton];
    if (message) await message.edit({ embeds: [embed], components, allowedMentions: { parse: [] } });
    else {
      message = await channel.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
      await this.saveResource(guild.id, "message:application_panel", message.id);
    }
  }

  createApplicationModal(role) {
    const modal = new ModalBuilder().setCustomId("cf-application:submit:" + role.key).setTitle("Apply • " + role.name);
    const questions = [
      ["experience", "What relevant experience do you have?", TextInputStyle.Paragraph, true, 900],
      ["motivation", "Why do you want this position?", TextInputStyle.Paragraph, true, 900],
      ["scenario", "How would you handle a difficult situation?", TextInputStyle.Paragraph, true, 900],
      ["availability", "What is your usual weekly availability?", TextInputStyle.Short, true, 250],
      ["extra", "Anything else we should know? (optional)", TextInputStyle.Paragraph, false, 700]
    ];
    modal.addComponents(...questions.map(([id, label, style, required, maxLength]) =>
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId(id).setLabel(label).setStyle(style).setRequired(required)
        .setMaxLength(maxLength)
        .setPlaceholder(id === "availability" ? "For example: weekday evenings and weekends" : "Write a clear, honest answer"))
    ));
    return modal;
  }

  async handleApplicationButton(interaction) {
    if (interaction.guildId !== this.guildId) {
      await interaction.reply({ content: "Applications are only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const [, action, value] = interaction.customId.split(":");
    if (action === "notifications") {
      await this.showApplicationNotificationPreferences(interaction);
      return true;
    }
    if (action === "clear-notifications") {
      await this.pool.query(
        "DELETE FROM coopft_application_subscriptions WHERE guild_id=$1 AND member_id=$2",
        [interaction.guildId, interaction.user.id]
      );
      await interaction.update({ content: "Application opening alerts have been cleared.", components: [] });
      return true;
    }
    if (action === "apply") {
      const role = APPLICATION_ROLES.find((item) => item.key === value);
      if (!role) {
        await interaction.reply({ content: "That application position is unavailable.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (!(await this.isApplicationOpen(interaction.guildId, role.key))) {
        await interaction.reply({ content: "Applications for **" + role.name + "** are currently closed.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const existing = await this.pool.query(
        "SELECT id FROM coopft_applications WHERE guild_id=$1 AND applicant_id=$2 AND role_key=$3 AND status='pending' LIMIT 1",
        [interaction.guildId, interaction.user.id, role.key]
      );
      if (existing.rowCount) {
        await interaction.reply({ content: "You already have a pending **" + role.name + "** application. Staff will review it soon.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.showModal(this.createApplicationModal(role));
      return true;
    }
    const applicationId = value;
    if (!["approve", "decline"].includes(action)) {
      await interaction.reply({ content: "Unknown application action.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!this.canManageStaff(interaction.member, interaction.guild)) {
      await interaction.reply({ content: "Only authorized CoopFT management or HR can review applications.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.resolveApplication(interaction, applicationId, action);
    await interaction.editReply({
      content: action === "approve"
        ? "✅ Application approved and the specialist role assigned to <@" + result.applicantId + ">."
        : "Application declined. A private notification was attempted."
    });
    return true;
  }

  async handleApplicationModal(interaction) {
    if (interaction.guildId !== this.guildId) {
      await interaction.reply({ content: "Applications are only available in CoopFT.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const roleKey = interaction.customId.split(":")[2];
    const role = APPLICATION_ROLES.find((item) => item.key === roleKey);
    if (!role) {
      await interaction.reply({ content: "That application position is unavailable.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!(await this.isApplicationOpen(interaction.guildId, roleKey))) {
      return interaction.editReply({ content: "Applications for **" + role.name + "** have closed. Your answers were not submitted." });
    }
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
      [interaction.guildId, interaction.user.id, roleKey]
    );
    if (duplicate.rowCount) return interaction.editReply({ content: "You already have a pending application for **" + role.name + "**." });
    let inserted;
    try {
      inserted = await this.pool.query(
        "INSERT INTO coopft_applications (guild_id,applicant_id,role_key,answers) VALUES ($1,$2,$3,$4::jsonb) RETURNING id,created_at",
        [interaction.guildId, interaction.user.id, roleKey, JSON.stringify(answers)]
      );
    } catch (error) {
      if (error.code === "23505") {
        return interaction.editReply({ content: "You already have a pending application for **" + role.name + "**." });
      }
      throw error;
    }
    const reviewChannelId = await this.getResource(interaction.guildId, "channel:application_review");
    const reviewChannel = reviewChannelId ? await interaction.guild.channels.fetch(reviewChannelId).catch(() => null) : null;
    if (!reviewChannel?.isTextBased?.()) {
      await this.pool.query("UPDATE coopft_applications SET status='withdrawn',review_note='Review channel unavailable' WHERE id=$1", [inserted.rows[0].id]);
      return interaction.editReply({ content: "Your application could not be delivered to the review team. Please open a support ticket." });
    }
    const application = inserted.rows[0];
    const reviewEmbed = new EmbedBuilder()
      .setColor(0x344E83)
      .setTitle(this.emoji(interaction.guildId, role.emoji, role.icon) + "  NEW APPLICATION • " + role.name.toUpperCase())
      .setDescription("A new CoopFT team application is ready for review.")
      .addFields(
        { name: "Applicant", value: "<@" + interaction.user.id + "> • " + interaction.user.tag, inline: false },
        { name: "Position", value: role.name, inline: true },
        { name: "Submitted", value: "<t:" + Math.floor(new Date(application.created_at).getTime() / 1000) + ":R>", inline: true },
        { name: "Relevant experience", value: answers.experience.slice(0, 1024), inline: false },
        { name: "Motivation", value: answers.motivation.slice(0, 1024), inline: false },
        { name: "Scenario response", value: answers.scenario.slice(0, 1024), inline: false },
        { name: "Availability", value: answers.availability.slice(0, 1024), inline: false },
        { name: "Additional notes", value: answers.extra ? answers.extra.slice(0, 1024) : "Not provided", inline: false }
      )
      .setFooter({ text: "Application ID • " + application.id });
    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("cf-application:approve:" + application.id).setLabel("Approve").setStyle(ButtonStyle.Success).setEmoji("✅"),
      new ButtonBuilder().setCustomId("cf-application:decline:" + application.id).setLabel("Decline").setStyle(ButtonStyle.Danger).setEmoji("✖️")
    );
    const reviewMessage = await reviewChannel.send({ embeds: [reviewEmbed], components: [controls], allowedMentions: { parse: [] } });
    await this.pool.query("UPDATE coopft_applications SET review_message_id=$2 WHERE id=$1", [application.id, reviewMessage.id]);
    await interaction.editReply({
      content: "✅ Your **" + role.name + "** application has been submitted privately. Reference: `" + application.id.slice(0, 8) + "`. Authorized staff will review it."
    });
    return true;
  }

  async resolveApplication(interaction, applicationId, decision) {
    const selected = await this.pool.query(
      "SELECT * FROM coopft_applications WHERE guild_id=$1 AND id=$2 AND status='pending' LIMIT 1",
      [interaction.guildId, applicationId]
    );
    const application = selected.rows[0];
    if (!application) throw new Error("This application has already been reviewed or no longer exists.");
    const roleSpec = APPLICATION_ROLES.find((item) => item.key === application.role_key);
    if (!roleSpec) throw new Error("The application position is no longer configured.");
    const member = await interaction.guild.members.fetch(application.applicant_id).catch(() => null);
    if (decision === "approve" && !member) throw new Error("The applicant is no longer in CoopFT. The application was left pending.");
    const newStatus = decision === "approve" ? "approved" : "declined";
    const updated = await this.pool.query(
      "UPDATE coopft_applications SET status=$3,reviewed_by=$4,reviewed_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='pending' RETURNING id",
      [interaction.guildId, applicationId, newStatus, interaction.user.id]
    );
    if (!updated.rowCount) throw new Error("Another reviewer has already processed this application.");
    if (decision === "approve") {
      let role = this.applicationRoles.get(roleSpec.key);
      if (!role) {
        role = (await this.ensureRole(interaction.guild, roleSpec)).role;
        this.applicationRoles.set(roleSpec.key, role);
      }
      try {
        await member.roles.add(role, "CoopFT application approved by " + interaction.user.tag);
      } catch (error) {
        await this.pool.query(
          "UPDATE coopft_applications SET status='pending',reviewed_by=NULL,reviewed_at=NULL WHERE id=$1",
          [applicationId]
        );
        throw error;
      }
    }
    const reviewEmbed = new EmbedBuilder()
      .setColor(decision === "approve" ? 0x26996B : 0x9C394B)
      .setTitle(this.emoji(interaction.guildId, roleSpec.emoji, roleSpec.icon) + "  APPLICATION " + newStatus.toUpperCase())
      .setDescription("Applicant: <@" + application.applicant_id + ">\\nReviewed by: <@" + interaction.user.id + ">")
      .setFooter({ text: "Application ID • " + applicationId });
    await interaction.message.edit({ embeds: [reviewEmbed], components: [], allowedMentions: { parse: [] } }).catch(() => {});
    const applicant = await interaction.client.users.fetch(application.applicant_id).catch(() => null);
    if (applicant) {
      const dm = decision === "approve"
        ? "🎉 Your CoopFT **" + roleSpec.name + "** application has been approved. Your role has been assigned. Welcome to the team!"
        : "Thank you for applying for **" + roleSpec.name + "** at CoopFT. We did not select your application this time. You may apply again when applications reopen or your experience changes.";
      await applicant.send({ content: dm, allowedMentions: { parse: [] } }).catch(() => {});
    }
    return { applicantId: application.applicant_id, roleName: roleSpec.name, status: newStatus };
  }

  async ensureTicketPanel(guild, channel) {
    const savedId = await this.getResource(guild.id, "message:ticket_panel");
    let message = savedId ? await channel.messages.fetch(savedId).catch(() => null) : null;
    const embed = new EmbedBuilder()
      .setColor(0x354F86)
      .setTitle(this.emoji(guild.id, "cf_ticket", "🎟️") + "  CoopFT Support Centre")
      .setDescription("Choose the kind of help you need. Every ticket creates a private channel visible only to you, CoopFT staff and the bot. Please do not open duplicate tickets.")
      .addFields(
        { name: this.emoji(guild.id, "cf_headset", "🎧") + "  General support", value: "Questions or help using CoopFT services.", inline: true },
        { name: this.emoji(guild.id, "cf_gear", "⚙️") + "  Bug report", value: "Something is broken or behaving incorrectly.", inline: true },
        { name: this.emoji(guild.id, "cf_key", "🔑") + "  Custom bot request", value: "Request a bot or automation idea.", inline: true },
        { name: this.emoji(guild.id, "cf_spark", "✨") + "  Suggestion", value: "Suggest a feature or improvement.", inline: true }
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
    const id = await this.getResource(guild.id, "category:tickets");
    return id ? guild.channels.fetch(id).catch(() => null) : null;
  }

  async openTicket(guild, member, ticketType) {
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
    const staffRoles = [...STAFF_RANKS, ...HR_ROLES].map((spec) => this.roles.get(spec.key)).filter(Boolean);
    const ticketStaffRole = this.applicationRoles.get("ticket_staff");
    if (ticketStaffRole) staffRoles.push(ticketStaffRole);
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
      name: "ticket-" + safeChannelName(member.user.username),
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
        { name: "Status", value: this.emoji(guild.id, "cf_spark", "🟢") + " Open", inline: true }
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
    const ids = new Set([...STAFF_RANKS, ...HR_ROLES].map((spec) => this.roles.get(spec.key)?.id).filter(Boolean));
    const ticketStaffRole = this.applicationRoles.get("ticket_staff");
    if (ticketStaffRole) ids.add(ticketStaffRole.id);
    return member.roles.cache.some((role) => ids.has(role.id));
  }

  canManageStaff(member, guild) {
    if (!member || !guild) return false;
    if (member.id === guild.ownerId) return true;
    if (!member.roles?.cache) return false;
    return [...STAFF_MANAGER_KEYS, ...HR_MANAGER_KEYS].some((key) => {
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

  getHRRoleKeys(member) {
    return HR_ROLES
      .filter((spec) => {
        const role = this.roles.get(spec.key);
        return role && member?.roles?.cache?.has(role.id);
      })
      .map((spec) => spec.key);
  }

  async getHRAssignment(guildId, memberId) {
    const result = await this.pool.query(
      "SELECT action,details FROM coopft_staff_audit WHERE guild_id=$1 AND member_id=$2 " +
      "AND action IN ('hr_role_assigned','hr_role_removed') ORDER BY created_at DESC,id DESC LIMIT 1",
      [guildId, memberId]
    );
    const row = result.rows[0];
    if (!row) return null;
    let details = row.details || {};
    if (typeof details === "string") {
      try { details = JSON.parse(details); } catch (_) { details = {}; }
    }
    return { action: row.action, details };
  }

  assertHRRoleChangeAuthority(actor, target, guild, currentRoleKey, nextRoleKey = null) {
    if (!actor || !target || actor.id === target.id) {
      throw new Error("Ask another authorized CoopFT manager to make this HR change.");
    }
    if (actor.id === guild.ownerId) return;
    if (target.id === guild.ownerId) {
      throw new Error("Only the server owner can change the server owner's HR assignments.");
    }

    const hasRole = (key) => {
      const role = this.roles.get(key);
      return Boolean(role && actor.roles?.cache?.has(role.id));
    };
    if ([...STAFF_MANAGER_KEYS].some(hasRole)) return;

    if (hasRole("hr_director")) {
      if (currentRoleKey === "hr_director" || nextRoleKey === "hr_director") {
        throw new Error("HR Directors cannot appoint, remove or replace another HR Director. A senior staff manager or the server owner must do that.");
      }
      return;
    }

    const juniorHrRoles = new Set(["hr_recruiter", "hr_coordinator", "hr_trainee"]);
    if (hasRole("hr_manager")) {
      if ((currentRoleKey && !juniorHrRoles.has(currentRoleKey)) ||
          (nextRoleKey && !juniorHrRoles.has(nextRoleKey))) {
        throw new Error("HR Managers can manage HR Recruiter, HR Coordinator and HR Trainee only.");
      }
      return;
    }

    throw new Error("You do not have authority to manage HR roles.");
  }

  async assignHRRole(interaction, member, roleKey) {
    if (interaction.guildId !== this.guildId) throw new Error("This HR system is only available in CoopFT.");
    const roleSpec = HR_ROLES.find((item) => item.key === roleKey);
    const role = this.roles.get(roleKey);
    if (!roleSpec || !role) throw new Error("Unknown HR role. Run /coopft-setup and try again.");

    const previous = await this.getHRAssignment(interaction.guildId, member.id);
    const recordedRoleKey = previous?.action === "hr_role_assigned" ? previous.details?.roleKey : null;
    const currentRoleKeys = this.getHRRoleKeys(member);
    const currentRoleKey = currentRoleKeys.find((key) => key !== roleKey) || currentRoleKeys[0] || recordedRoleKey;
    this.assertHRRoleChangeAuthority(interaction.member, member, interaction.guild, currentRoleKey, roleKey);
    if (currentRoleKeys.length === 1 && currentRoleKeys[0] === roleKey) {
      return { roleName: roleSpec.name, previousRole: roleKey, alreadyAssigned: true };
    }

    for (const existingKey of currentRoleKeys) {
      if (existingKey === roleKey) continue;
      const existingRole = this.roles.get(existingKey);
      if (existingRole) await member.roles.remove(existingRole, "CoopFT HR role reassignment");
    }
    if (!member.roles.cache.has(role.id)) await member.roles.add(role, "CoopFT HR role assignment");

    await this.recordStaffAudit(interaction.guildId, interaction.user.id, member.id, "hr_role_assigned", {
      roleKey,
      roleName: roleSpec.name,
      from: currentRoleKey,
      status: "active"
    });
    await this.updateStaffDirectory(interaction.guild);
    await this.postStaffUpdate(
      interaction.guild,
      this.emoji(interaction.guildId, roleSpec.emoji, roleSpec.icon) + " <@" + member.id + "> was assigned **" +
      roleSpec.name + "** by <@" + interaction.user.id + ">."
    );
    return { roleName: roleSpec.name, previousRole: currentRoleKey, alreadyAssigned: false };
  }

  async removeHRRole(interaction, member) {
    if (interaction.guildId !== this.guildId) throw new Error("This HR system is only available in CoopFT.");
    const previous = await this.getHRAssignment(interaction.guildId, member.id);
    const recordedRoleKey = previous?.action === "hr_role_assigned" ? previous.details?.roleKey : null;
    const currentRoleKeys = this.getHRRoleKeys(member);
    const currentRoleKey = currentRoleKeys[0] || recordedRoleKey;
    if (!currentRoleKey) throw new Error("This member does not have an active HR role.");
    this.assertHRRoleChangeAuthority(interaction.member, member, interaction.guild, currentRoleKey, null);

    for (const roleKey of currentRoleKeys) {
      const role = this.roles.get(roleKey);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, "CoopFT HR role removal");
      }
    }
    const roleSpec = HR_ROLES.find((item) => item.key === currentRoleKey);
    await this.recordStaffAudit(interaction.guildId, interaction.user.id, member.id, "hr_role_removed", {
      roleKey: currentRoleKey,
      roleName: roleSpec?.name || currentRoleKey,
      status: "inactive"
    });
    await this.updateStaffDirectory(interaction.guild);
    await this.postStaffUpdate(
      interaction.guild,
      this.emoji(interaction.guildId, "cf_bell", "🔔") + " <@" + member.id + "> had **" +
      (roleSpec?.name || currentRoleKey) + "** removed by <@" + interaction.user.id + ">."
    );
    return { roleName: roleSpec?.name || currentRoleKey };
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
    const isHrManager = [...HR_MANAGER_KEYS].some((key) => {
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

    if (isHrManager) {
      const hrManagedFrom = STAFF_RANKS.findIndex((item) => item.key === "head_moderator");
      if ((currentIndex >= 0 && currentIndex < hrManagedFrom) ||
          (nextIndex >= 0 && nextIndex < hrManagedFrom)) {
        throw new Error("HR can manage Head Moderator and lower ranks only. Higher ranks require a senior staff manager or the server owner.");
      }
      return;
    }

    throw new Error("You do not have authority to make this staff change.");
  }

  async assignStaff(interaction, member, rankKey, action = "hire") {
    if (interaction.guildId !== this.guildId) throw new Error("This staff system is only available in CoopFT.");
    if (!this.canManageStaff(interaction.member, interaction.guild)) {
      throw new Error("You do not have HR or senior staff authority to change staff ranks.");
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
      this.emoji(interaction.guildId, "cf_star", "✦") + " <@" + member.id + "> was " +
      actionText + " to **" + rank.name + "** by <@" + interaction.user.id + ">."
    );
    return { rankName: rank.name, previousRank: currentRankKey };
  }

  async removeStaff(interaction, member) {
    if (interaction.guildId !== this.guildId) throw new Error("This staff system is only available in CoopFT.");
    if (!this.canManageStaff(interaction.member, interaction.guild)) {
      throw new Error("You do not have HR or senior staff authority to change staff ranks.");
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
    await this.postStaffUpdate(interaction.guild, this.emoji(interaction.guildId, "cf_bell", "🔔") + " <@" + member.id + "> was removed from the staff team by <@" + interaction.user.id + ">.");
  }

  async recordStaffAudit(guildId, actorId, memberId, action, details) {
    await this.pool.query(
      "INSERT INTO coopft_staff_audit (guild_id,actor_id,member_id,action,details) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [guildId, actorId, memberId || null, action, JSON.stringify(details || {})]
    );
  }

  async syncStaffMember(guild, member, actor) {
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
      await this.postStaffUpdate(guild, this.emoji(guild.id, "cf_bell", "🔔") + " <@" + member.id + "> no longer has an active staff rank.");
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
        this.emoji(guild.id, "cf_shield", "🛡️") + " An unauthorized staff-rank change for <@" +
        member.id + "> was rejected. Ask the server owner or HR to use /staff-manage."
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
      await this.postStaffUpdate(guild, this.emoji(guild.id, "cf_shield", "🛡️") + " A staff-rank change for <@" +
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
    await this.postStaffUpdate(guild, this.emoji(guild.id, "cf_star", "✦") + " <@" + member.id + "> is now **" + rank.name + "**.");
  }

  async syncHRMember(guild, member, actor) {
    if (!guild || guild.id !== this.guildId || !member || !this.roles.size || !actor) return;
    const previous = await this.getHRAssignment(guild.id, member.id);
    const previousRoleKey = previous?.action === "hr_role_assigned" ? previous.details?.roleKey : null;
    const currentRoleKeys = this.getHRRoleKeys(member);
    const nextRoleKey = currentRoleKeys.find((key) => key !== previousRoleKey) ||
      currentRoleKeys[0] || null;
    if (nextRoleKey === previousRoleKey && currentRoleKeys.length <= 1) return;
    if (!nextRoleKey && !previousRoleKey) return;

    try {
      this.assertHRRoleChangeAuthority(actor, member, guild, previousRoleKey, nextRoleKey);
    } catch (error) {
      for (const roleKey of currentRoleKeys) {
        if (roleKey === previousRoleKey) continue;
        const role = this.roles.get(roleKey);
        if (role) await member.roles.remove(role, "Revert unauthorized CoopFT HR role change").catch(() => {});
      }
      if (previousRoleKey) {
        const previousRole = this.roles.get(previousRoleKey);
        if (previousRole && !member.roles.cache.has(previousRole.id)) {
          await member.roles.add(previousRole, "Restore previous authorized CoopFT HR role").catch(() => {});
        }
      }
      await this.postStaffUpdate(
        guild,
        this.emoji(guild.id, "cf_shield", "🛡️") + " An unauthorized HR role change for <@" +
        member.id + "> was reverted: " + error.message
      );
      return;
    }

    if (nextRoleKey) {
      for (const roleKey of currentRoleKeys) {
        if (roleKey === nextRoleKey) continue;
        const role = this.roles.get(roleKey);
        if (role) await member.roles.remove(role, "Keep one active CoopFT HR assignment");
      }
      const roleSpec = HR_ROLES.find((item) => item.key === nextRoleKey);
      await this.recordStaffAudit(guild.id, actor.id, member.id, "hr_role_assigned", {
        roleKey: nextRoleKey,
        roleName: roleSpec?.name || nextRoleKey,
        from: previousRoleKey,
        status: "active"
      });
      await this.postStaffUpdate(
        guild,
        this.emoji(guild.id, roleSpec?.emoji || "cf_key", roleSpec?.icon || "🔑") +
        " <@" + member.id + "> is now **" + (roleSpec?.name || nextRoleKey) + "**."
      );
    } else if (previousRoleKey) {
      const oldSpec = HR_ROLES.find((item) => item.key === previousRoleKey);
      await this.recordStaffAudit(guild.id, actor.id, member.id, "hr_role_removed", {
        roleKey: previousRoleKey,
        roleName: oldSpec?.name || previousRoleKey,
        status: "inactive"
      });
      await this.postStaffUpdate(guild, this.emoji(guild.id, "cf_bell", "🔔") + " <@" + member.id + "> no longer has an HR role.");
    }
    await this.updateStaffDirectory(guild);
  }

  async handleMemberLeave(member) {
    if (!member || member.guild.id !== this.guildId) return;
    const result = await this.pool.query(
      "UPDATE coopft_staff_members SET active=FALSE,updated_at=NOW(),updated_by='member-left' WHERE guild_id=$1 AND member_id=$2 AND active=TRUE RETURNING rank_key",
      [this.guildId, member.id]
    );
    if (result.rowCount) {
      await this.recordStaffAudit(this.guildId, "member-left", member.id, "staff_left_server", { rank: result.rows[0].rank_key });
    }

    const hrAssignment = await this.getHRAssignment(this.guildId, member.id);
    const hrRoleKey = hrAssignment?.action === "hr_role_assigned" ? hrAssignment.details?.roleKey : null;
    if (hrRoleKey) {
      const hrRole = HR_ROLES.find((item) => item.key === hrRoleKey);
      await this.recordStaffAudit(this.guildId, "member-left", member.id, "hr_role_removed", {
        roleKey: hrRoleKey,
        roleName: hrRole?.name || hrRoleKey,
        status: "inactive",
        reason: "member_left_server"
      });
    }

    if (!result.rowCount && !hrRoleKey) return;
    await this.updateStaffDirectory(member.guild);
    await this.postStaffUpdate(member.guild, this.emoji(this.guildId, "cf_bell", "🔔") + " A staff or HR member left the server; their active directory entry was removed.");
  }

  async buildStaffDirectoryEmbed(guild) {
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
    const hrResult = await this.pool.query(
      "SELECT DISTINCT ON (member_id) member_id,action,details FROM coopft_staff_audit " +
      "WHERE guild_id=$1 AND member_id IS NOT NULL AND action IN ('hr_role_assigned','hr_role_removed') " +
      "ORDER BY member_id,created_at DESC,id DESC",
      [guild.id]
    );
    const hrGrouped = new Map(HR_ROLES.map((role) => [role.key, []]));
    for (const record of hrResult.rows) {
      if (record.action !== "hr_role_assigned") continue;
      let details = record.details || {};
      if (typeof details === "string") {
        try { details = JSON.parse(details); } catch (_) { details = {}; }
      }
      const group = hrGrouped.get(details.roleKey);
      if (!group) continue;
      let member = guild.members.cache.get(record.member_id);
      if (!member) member = await guild.members.fetch(record.member_id).catch(() => null);
      if (!member) {
        await this.recordStaffAudit(guild.id, "directory-reconcile", record.member_id, "hr_role_removed", {
          roleKey: details.roleKey,
          roleName: details.roleName || details.roleKey,
          status: "inactive",
          reason: "member_not_found"
        });
        continue;
      }
      const role = this.roles.get(details.roleKey);
      if (!role || !member.roles.cache.has(role.id)) continue;
      group.push("<@" + record.member_id + ">");
    }

    const embed = new EmbedBuilder()
      .setColor(0x8C1D32)
      .setTitle(this.emoji(guild.id, "cf_crown", "♛") + "  COOPFT • STAFF TEAM")
      .setDescription("The current staff structure of CoopFT. Staff ranks and HR assignments are maintained through audited role changes.")
      .setFooter({ text: "Maintained by CoopFT HR • " + ordered.length + " active staff" })
      .setTimestamp();
    for (const rank of STAFF_RANKS) {
      const people = grouped.get(rank.key);
      embed.addFields({
        name: this.emoji(guild.id, rank.emoji, rank.icon) + "  " + rank.name.toUpperCase(),
        value: people.length ? people.join(", ").slice(0, 1024) : "Vacant",
        inline: false
      });
    }
    embed.addFields({ name: "✦ HUMAN RESOURCES", value: "Assigned HR team members", inline: false });
    for (const role of HR_ROLES) {
      const people = hrGrouped.get(role.key);
      embed.addFields({
        name: this.emoji(guild.id, role.emoji, role.icon) + "  " + role.name.toUpperCase(),
        value: people.length ? people.join(", ").slice(0, 1024) : "Vacant",
        inline: false
      });
    }
    return embed;
  }

  async updateStaffDirectory(guild) {
    const embed = await this.buildStaffDirectoryEmbed(guild);
    for (const key of ["staff_team", "staff_directory"]) {
      const channelId = await this.getResource(guild.id, "channel:" + key);
      const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
      if (!channel?.isTextBased?.()) continue;
      const messageId = await this.getResource(guild.id, "message:directory:" + key);
      let message = messageId ? await channel.messages.fetch(messageId).catch(() => null) : null;
      if (message) await message.edit({ embeds: [embed], allowedMentions: { parse: [] } });
      else {
        message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        await this.saveResource(guild.id, "message:directory:" + key, message.id);
      }
    }
  }

  async postStaffUpdate(guild, description) {
    const channelId = await this.getResource(guild.id, "channel:staff_bot_updates");
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased?.()) return;
    const embed = new EmbedBuilder()
      .setColor(0x7B2438)
      .setTitle(this.emoji(guild.id, "cf_bell", "🔔") + "  Staff system update")
      .setDescription(String(description || "A staff system change occurred.").slice(0, 4000))
      .setTimestamp()
      .setFooter({ text: "CoopFT • Staff activity" });
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  }

  async handleButton(interaction) {
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
      await interaction.channel.send({ content: this.emoji(interaction.guildId, "cf_shield", "🛡️") + " This ticket is now being handled by <@" + interaction.user.id + ">.", allowedMentions: { users: [interaction.user.id] } });
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
        content: this.emoji(guild.id, "cf_scroll", "📜") + " Transcript for **" + channel.name + "** • opened by <@" + ticket.opener_id + "> • closed by <@" + closedBy + ">",
        files: [new AttachmentBuilder(buffer.subarray(0, 1500000), { name: "coopft-ticket-" + ticket.id.slice(0, 8) + ".txt" })],
        allowedMentions: { parse: [] }
      });
    }
    await channel.permissionOverwrites.edit(ticket.opener_id, { SendMessages: false, AddReactions: false }).catch(() => {});
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0x687386).setTitle(this.emoji(guild.id, "cf_shield", "🔒") + "  Ticket closed")
        .setDescription("Closed by <@" + closedBy + ">. A transcript has been archived.")
        .setTimestamp()],
      allowedMentions: { parse: [] }
    }).catch(() => {});
    await channel.setName("closed-" + safeChannelName(channel.name).slice(0, 65)).catch(() => {});
  }
}

module.exports = { CoopFTCommunityService, CLEANUP_CONFIRMATION, TICKET_TYPES, safeChannelName, drawCoopFTEmoji };
