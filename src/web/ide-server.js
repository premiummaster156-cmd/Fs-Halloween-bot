const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const settings = require("../config/settings");
const { audit, sendLog } = require("../utils/logging");

const execFileAsync = promisify(execFile);
const sessions = new Map();
const oauthStates = new Map();
const WINDOW_MS = 60_000;
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_BODY = 96 * 1024;

function cookie(req, name) {
  const header = req.headers.cookie || "";
  const item = header.split(";").map((x) => x.trim()).find((x) => x.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin"
  });
  res.end(JSON.stringify(value));
}
function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store", ...headers });
  res.end();
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch (_) { reject(new Error("The request body must be valid JSON.")); }
    });
    req.on("error", reject);
  });
}
function baseUrl() {
  return settings.idePublicUrl.replace(/\/+$/, "");
}
function callbackUrl() {
  return baseUrl() + "/auth/callback";
}
function sessionCookie(value) {
  const secure = baseUrl().startsWith("https://") ? "; Secure" : "";
  return "fuk_ide_session=" + encodeURIComponent(value) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + Math.floor(SESSION_MS / 1000) + secure;
}
function clearSessionCookie() {
  const secure = baseUrl().startsWith("https://") ? "; Secure" : "";
  return "fuk_ide_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + secure;
}
function stateCookie(value) {
  const secure = baseUrl().startsWith("https://") ? "; Secure" : "";
  return "fuk_ide_state=" + encodeURIComponent(value) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=600" + secure;
}
function clearStateCookie() {
  const secure = baseUrl().startsWith("https://") ? "; Secure" : "";
  return "fuk_ide_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + secure;
}
async function exchangeOAuthCode(code) {
  const body = new URLSearchParams({
    client_id: settings.clientId,
    client_secret: settings.discordClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl()
  });
  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error("Discord sign-in could not be completed.");
  return response.json();
}
async function getDiscordUser(accessToken) {
  const response = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: "Bearer " + accessToken }
  });
  if (!response.ok) throw new Error("Discord did not return your user profile.");
  return response.json();
}
async function authoriseMember(client, services, userId) {
  const guildId = settings.ideGuildId;
  if (!guildId) throw new Error("IDE_GUILD_ID is not configured.");
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId);
  const isServerOwner = userId === guild.ownerId;
  const isBotOwner = Boolean(settings.ownerId && userId === settings.ownerId);
  const member = await guild.members.fetch(userId).catch(() => null);
  const trustedRoleId = await services.guildSettings.get(guildId, "adminRoleId");
  const hasTrustedRole = Boolean(member && trustedRoleId && member.roles.cache.has(trustedRoleId));
  if (!isServerOwner && !isBotOwner && !hasTrustedRole) {
    throw new Error("Code Studio is limited to the server owner, bot owner and configured Admin Role.");
  }
  return { guild, member, trustedRoleId };
}
async function requireSession(req, client, services) {
  const id = cookie(req, "fuk_ide_session");
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    if (id) sessions.delete(id);
    return null;
  }
  const access = await authoriseMember(client, services, session.user.id).catch(() => null);
  if (!access) {
    sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_MS;
  session.guildName = access.guild.name;
  session.sessionId = id;
  session.guild = access.guild;
  session.member = access.member;
  return session;
}
function rateLimit(session, action) {
  const now = Date.now();
  if (!session.rate) session.rate = [];
  session.rate = session.rate.filter((stamp) => now - stamp < WINDOW_MS);
  const limit = action === "deploy" ? 2 : 90;
  if (session.rate.length >= limit) return false;
  session.rate.push(now);
  return true;
}
function verifyMutation(req, session) {
  const origin = req.headers.origin;
  if (origin && origin !== baseUrl()) return false;
  return Boolean(req.headers["x-csrf-token"] && req.headers["x-csrf-token"] === session.csrf);
}
function safeCommandRecord(record) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    sourceCode: record.source_code || "",
    isActive: Boolean(record.is_active),
    deployedAt: record.deployed_at,
    updatedAt: record.updated_at || null
  };
}
function toPreviewPayload(payload) {
  return {
    content: payload.content || "",
    embeds: (payload.embeds || []).map((embed) => typeof embed.toJSON === "function" ? embed.toJSON() : embed)
  };
}
async function runDeployment(guildId) {
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = await execFileAsync(executable, ["run", "deploy-commands"], {
    cwd: process.cwd(),
    env: { ...process.env, DEPLOY_GUILD_ID: guildId },
    timeout: 90_000,
    maxBuffer: 1024 * 1024,
    shell: process.platform === "win32"
  });
  return String(result.stdout || "").slice(-7000);
}

function createIdeServer(client, services) {
  const htmlPath = path.join(__dirname, "ide.html");
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/ide")) {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "same-origin",
          "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net; worker-src blob: data:"
        });
        return res.end(fs.readFileSync(htmlPath));
      }

      if (req.method === "GET" && url.pathname === "/auth/discord") {
        const state = crypto.randomBytes(24).toString("hex");
        oauthStates.set(state, Date.now());
        const params = new URLSearchParams({
          client_id: settings.clientId,
          response_type: "code",
          redirect_uri: callbackUrl(),
          scope: "identify",
          state
        });
        return redirect(res, "https://discord.com/oauth2/authorize?" + params.toString(), { "Set-Cookie": stateCookie(state) });
      }

      if (req.method === "GET" && url.pathname === "/auth/callback") {
        const state = url.searchParams.get("state") || "";
        const storedState = cookie(req, "fuk_ide_state");
        const stateTime = oauthStates.get(state);
        oauthStates.delete(state);
        if (!state || state !== storedState || !stateTime || Date.now() - stateTime > 600_000) {
          return json(res, 400, { error: "Sign-in expired. Please try again." });
        }
        if (url.searchParams.get("iss") && url.searchParams.get("iss") !== "https://discord.com") {
          return json(res, 400, { error: "Unexpected sign-in issuer." });
        }
        const code = url.searchParams.get("code");
        if (!code) return json(res, 400, { error: "Discord did not return a sign-in code." });
        const token = await exchangeOAuthCode(code);
        const user = await getDiscordUser(token.access_token);
        const access = await authoriseMember(client, services, user.id);
        const sessionId = crypto.randomBytes(32).toString("hex");
        sessions.set(sessionId, {
          user: { id: user.id, username: user.username, globalName: user.global_name || user.username, avatar: user.avatar || null },
          guildName: access.guild.name,
          csrf: crypto.randomBytes(24).toString("hex"),
          expiresAt: Date.now() + SESSION_MS,
          rate: [],
          lastDeployAt: 0
        });
        return redirect(res, baseUrl() + "/ide", {
          "Set-Cookie": [sessionCookie(sessionId), clearStateCookie()]
        });
      }

      if (req.method === "GET" && url.pathname === "/api/session") {
        const session = await requireSession(req, client, services);
        if (!session) return json(res, 200, { authenticated: false });
        return json(res, 200, {
          authenticated: true,
          user: session.user,
          guildName: session.guildName,
          csrf: session.csrf
        });
      }

      if (req.method === "DELETE" && url.pathname === "/api/session") {
        const session = await requireSession(req, client, services);
        if (session && !verifyMutation(req, session)) return json(res, 403, { error: "Security check failed." });
        if (session) sessions.delete(session.sessionId);
        res.setHeader("Set-Cookie", clearSessionCookie());
        return json(res, 200, { ok: true });
      }

      const session = await requireSession(req, client, services);
      if (!session) return json(res, 401, { error: "Sign in with an authorized Fukishōkai account." });
      if (!rateLimit(session, "normal")) return json(res, 429, { error: "Please slow down and try again shortly." });

      if (req.method === "GET" && url.pathname === "/api/commands") {
        const records = await services.customCommands.list(settings.ideGuildId);
        return json(res, 200, { commands: records.map(safeCommandRecord) });
      }

      if ((req.method === "POST" || req.method === "DELETE") && !verifyMutation(req, session)) {
        return json(res, 403, { error: "Security check failed. Refresh Code Studio and try again." });
      }

      if (req.method === "POST" && url.pathname === "/api/commands") {
        const body = await readBody(req);
        const saved = await services.customCommands.saveSource(settings.ideGuildId, session.user.id, {
          id: typeof body.id === "string" ? body.id : null,
          sourceCode: body.sourceCode
        });
        await audit(services.pool, settings.ideGuildId, session.user.id, body.id ? "custom_command_source_updated" : "custom_command_source_created", saved.id, { name: saved.name });
        await sendLog(client, settings.ideGuildId, "JavaScript command /" + saved.name + " saved by <@" + session.user.id + ">. It is inactive until deployed and activated.");
        return json(res, 200, { command: safeCommandRecord(saved) });
      }

      const route = url.pathname.match(/^\/api\/commands\/([a-f0-9-]+)(?:\/(test|deploy|activate|deactivate))?$/i);
      if (route) {
        const id = route[1];
        const action = route[2] || "";
        const record = await services.customCommands.get(settings.ideGuildId, id);
        if (!record) return json(res, 404, { error: "That command no longer exists." });

        if (req.method === "POST" && action === "test") {
          const body = await readBody(req);
          const previewContext = {
            user: {
              id: session.user.id,
              username: session.user.username,
              displayName: session.user.globalName,
              mention: "<@" + session.user.id + ">"
            },
            guild: { id: settings.ideGuildId, name: session.guildName },
            channel: { id: "preview-channel", name: "code-preview", mention: "#code-preview" },
            options: body.options && typeof body.options === "object" ? body.options : {}
          };
          const payload = await services.customCommands.previewSource(record.source_code || "", previewContext);
          return json(res, 200, { preview: toPreviewPayload(payload) });
        }

        if (req.method === "POST" && action === "deploy") {
          if (!rateLimit(session, "deploy") || Date.now() - session.lastDeployAt < 15_000) {
            return json(res, 429, { error: "Please wait before deploying again." });
          }
          session.lastDeployAt = Date.now();
          const output = await runDeployment(settings.ideGuildId);
          await audit(services.pool, settings.ideGuildId, session.user.id, "custom_commands_deployed", id, { name: record.name });
          await sendLog(client, settings.ideGuildId, "Custom slash commands deployed by <@" + session.user.id + ">.");
          return json(res, 200, { ok: true, output });
        }

        if (req.method === "POST" && action === "activate") {
          const result = await services.customCommands.activate(settings.ideGuildId, id, session.user.id);
          await audit(services.pool, settings.ideGuildId, session.user.id, "custom_command_activated", id, { name: result.name });
          await sendLog(client, settings.ideGuildId, "Custom command /" + result.name + " activated by <@" + session.user.id + ">.");
          return json(res, 200, { ok: true, command: result });
        }
        if (req.method === "POST" && action === "deactivate") {
          const result = await services.customCommands.deactivate(settings.ideGuildId, id, session.user.id);
          await audit(services.pool, settings.ideGuildId, session.user.id, "custom_command_deactivated", id, { name: result.name });
          await sendLog(client, settings.ideGuildId, "Custom command /" + result.name + " deactivated by <@" + session.user.id + ">.");
          return json(res, 200, { ok: true, command: result });
        }
        if (req.method === "DELETE" && !action) {
          const removed = await services.customCommands.remove(settings.ideGuildId, id, session.user.id);
          await runDeployment(settings.ideGuildId);
          await audit(services.pool, settings.ideGuildId, session.user.id, "custom_command_deleted", id, { name: removed.name });
          await sendLog(client, settings.ideGuildId, "Custom command /" + removed.name + " deleted by <@" + session.user.id + ">.");
          return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { error: "Route not found." });
    } catch (error) {
      console.error("[code-studio] Request failed:", error.code || error.name, error.message);
      const status = error.code === "CUSTOM_COMMAND_INVALID" ? 400
        : error.code === "CUSTOM_COMMAND_NOT_FOUND" ? 404
        : error.code === "CUSTOM_COMMAND_NOT_DEPLOYED" ? 409 : 500;
      return json(res, status, { error: error.message || "Code Studio could not complete this request." });
    }
  });
  return server;
}

async function startIdeServer(client, services) {
  if (!settings.discordClientSecret || !settings.idePublicUrl || !settings.ideGuildId) {
    console.log("[code-studio] Disabled until DISCORD_CLIENT_SECRET, IDE_PUBLIC_URL and IDE_GUILD_ID are configured.");
    return null;
  }
  const server = createIdeServer(client, services);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(settings.idePort, "0.0.0.0", resolve);
  });
  console.log("[code-studio] Listening on port " + settings.idePort + " for " + settings.idePublicUrl + "/ide");
  return server;
}

module.exports = { startIdeServer, createIdeServer };
