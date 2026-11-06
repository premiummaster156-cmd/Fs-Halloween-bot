const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { levelXpRequired } = require("./core");

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function compact(value) {
  const number = Math.max(0, Number(value) || 0);
  if (number >= 1_000_000) return (number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (number >= 1_000) return (number / 1_000).toFixed(number >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return Math.floor(number).toLocaleString("en-US");
}

function fitText(ctx, value, maxWidth, font, maxSize = 16, minSize = 11) {
  let size = maxSize;
  ctx.font = font.replace("{size}", String(size));
  const text = String(value || "—");
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 1;
    ctx.font = font.replace("{size}", String(size));
  }
  if (ctx.measureText(text).width <= maxWidth) return { text, size };
  let clipped = text;
  while (clipped.length > 3 && ctx.measureText(clipped + "…").width > maxWidth) clipped = clipped.slice(0, -1);
  return { text: clipped + "…", size };
}

function drawPumpkin(ctx, x, y, scale, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#F07A24";
  ctx.beginPath();
  ctx.ellipse(0, 4, 22, 17, 0, 0, Math.PI * 2);
  ctx.ellipse(-10, 4, 12, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(10, 4, 12, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#512B20";
  ctx.beginPath();
  ctx.moveTo(-11, -1); ctx.lineTo(-4, 1); ctx.lineTo(-10, 8); ctx.closePath();
  ctx.moveTo(11, -1); ctx.lineTo(4, 1); ctx.lineTo(10, 8); ctx.closePath();
  ctx.moveTo(-9, 12); ctx.quadraticCurveTo(0, 5, 9, 12); ctx.quadraticCurveTo(0, 18, -9, 12); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#67834A";
  ctx.fillRect(-3, -19, 6, 9);
  ctx.restore();
}

function drawGhost(ctx, x, y, scale, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#FFF1DA";
  ctx.beginPath();
  ctx.moveTo(-15, 18);
  ctx.lineTo(-15, -2);
  ctx.arc(0, -2, 15, Math.PI, 0);
  ctx.lineTo(15, 18);
  ctx.lineTo(7, 13);
  ctx.lineTo(0, 18);
  ctx.lineTo(-7, 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#34251F";
  ctx.beginPath();
  ctx.arc(-5, 0, 2, 0, Math.PI * 2);
  ctx.arc(5, 0, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function loadAvatar(user) {
  const url = user?.displayAvatarURL?.({ extension: "png", size: 256 }) ||
    user?.avatarURL?.({ extension: "png", size: 256 });
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch (_) {
    return null;
  }
}

function drawStat(ctx, x, y, label, value, width = 140) {
  ctx.textAlign = "left";
  ctx.fillStyle = "#F29A48";
  ctx.font = "bold 11px Arial";
  ctx.fillText(String(label).toUpperCase(), x, y, width);
  const fitted = fitText(ctx, value, width, "600 {size}px Arial", 16, 11);
  ctx.fillStyle = "#FFF8EF";
  ctx.font = "600 " + fitted.size + "px Arial";
  ctx.fillText(fitted.text, x, y + 19, width);
}

async function createProfileCard({ user, player, rank, stats = {} }) {
  const width = 800;
  const height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#202326";
  ctx.fillRect(0, 0, width, height);

  // Warm diagonal Halloween panel on the right.
  ctx.fillStyle = "#D9671D";
  ctx.beginPath();
  ctx.moveTo(654, 0);
  ctx.lineTo(800, 0);
  ctx.lineTo(800, height);
  ctx.lineTo(714, height);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#F28A2C";
  ctx.beginPath();
  ctx.moveTo(710, 0);
  ctx.lineTo(800, 0);
  ctx.lineTo(800, height);
  ctx.lineTo(762, height);
  ctx.closePath();
  ctx.fill();

  drawGhost(ctx, 735, 86, 1.35, 0.95);
  drawPumpkin(ctx, 752, 230, 1.55, 0.98);
  drawPumpkin(ctx, 687, 34, 0.60, 0.60);
  ctx.fillStyle = "rgba(255, 245, 230, 0.42)";
  for (const [x, y, r] of [[672, 145, 3], [700, 183, 2], [782, 35, 3], [704, 270, 2], [776, 170, 2]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const avatar = await loadAvatar(user);
  ctx.save();
  ctx.beginPath();
  ctx.arc(75, 65, 52, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, 23, 13, 104, 104);
  } else {
    ctx.fillStyle = "#75401F";
    ctx.fillRect(23, 13, 104, 104);
    ctx.fillStyle = "#FFF1DA";
    ctx.font = "bold 54px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(user?.username || "?").slice(0, 1).toUpperCase(), 75, 84);
  }
  ctx.restore();

  const username = String(user?.globalName || user?.displayName || user?.username || "Player");
  const name = fitText(ctx, username, 465, "600 {size}px Arial", 32, 21);
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFF8EF";
  ctx.font = "600 " + name.size + "px Arial";
  ctx.fillText(name.text, 146, 43, 465);

  ctx.strokeStyle = "#F28A2C";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(146, 56);
  ctx.lineTo(390, 56);
  ctx.stroke();

  const level = Math.max(1, Number(player?.level) || 1);
  const xp = Math.max(0, Number(player?.xp) || 0);
  const nextXp = levelXpRequired(level);
  ctx.fillStyle = "#F5EDE4";
  ctx.font = "20px Arial";
  ctx.fillText("LEVEL " + level + "   ·   XP " + compact(xp) + " / " + compact(nextXp) + "   ·   RANK #" + (Number(rank) || 1), 146, 87, 480);

  const barX = 146;
  const barY = 101;
  const barWidth = 482;
  const barHeight = 20;
  roundedRect(ctx, barX, barY, barWidth, barHeight, 10);
  ctx.fillStyle = "#FFFDF9";
  ctx.fill();
  const ratio = Math.max(0, Math.min(1, xp / Math.max(1, nextXp)));
  const fillWidth = Math.max(ratio > 0 ? 12 : 0, Math.floor((barWidth - 6) * ratio));
  if (fillWidth > 0) {
    roundedRect(ctx, barX + 3, barY + 3, Math.min(barWidth - 6, fillWidth), barHeight - 6, 8);
    const gradient = ctx.createLinearGradient(barX, barY, barX + Math.max(1, fillWidth), barY);
    gradient.addColorStop(0, "#E97822");
    gradient.addColorStop(1, "#FFB04A");
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255, 248, 239, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(22, 137);
  ctx.lineTo(635, 137);
  ctx.stroke();

  const wallet = Number(player?.wallet ?? stats.wallet) || 0;
  const bank = Number(player?.bank ?? stats.bank) || 0;
  const totalWealth = wallet + bank;
  const career = stats.career || "Unemployed";
  const careerText = career === "Unemployed" ? career : career + " · Job " + (Number(player?.job_level ?? stats.jobLevel) || 1);
  const rebirths = Math.max(0, Number(player?.prestige ?? stats.rebirths) || 0);
  const rebirthValue = rebirths + " · " + (Number(stats.rebirthMultiplier) || 1).toFixed(1) + "×";
  const partyWins = Number(stats.partyWins) || 0;
  const partyGames = Number(stats.partyGames) || 0;

  const columns = [24, 180, 336, 492];
  drawStat(ctx, columns[0], 160, "Wallet", compact(wallet) + " FC");
  drawStat(ctx, columns[1], 160, "Bank", compact(bank) + " FC");
  drawStat(ctx, columns[2], 160, "Total wealth", compact(totalWealth) + " FC");
  drawStat(ctx, columns[3], 160, "Candy", compact(stats.candy) );

  drawStat(ctx, columns[0], 205, "Career", careerText);
  drawStat(ctx, columns[1], 205, "Rebirths", rebirthValue);
  drawStat(ctx, columns[2], 205, "Lifetime FC", compact(player?.lifetime_earned ?? stats.lifetimeEarned));
  drawStat(ctx, columns[3], 205, "Party points", compact(stats.partyPoints) + " PP");

  drawStat(ctx, columns[0], 250, "Crimes", compact(player?.crime_successes ?? stats.crimes));
  drawStat(ctx, columns[1], 250, "Heists", compact(player?.heists_completed ?? stats.heists));
  drawStat(ctx, columns[2], 250, "Reputation", compact(player?.reputation ?? stats.reputation));
  drawStat(ctx, columns[3], 250, "Party record", partyWins + "W / " + partyGames + "G");

  return canvas.toBuffer("image/png");
}

module.exports = { createProfileCard, compact, drawStat };
