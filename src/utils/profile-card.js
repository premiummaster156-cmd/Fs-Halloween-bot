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

async function createProfileCard({ user, player, rank }) {
  const width = 800;
  const height = 200;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#202326";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#E97822";
  ctx.beginPath();
  ctx.moveTo(552, 0);
  ctx.lineTo(800, 0);
  ctx.lineTo(800, 200);
  ctx.lineTo(690, 200);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#F28A2C";
  ctx.beginPath();
  ctx.moveTo(618, 0);
  ctx.lineTo(800, 0);
  ctx.lineTo(800, 200);
  ctx.lineTo(742, 200);
  ctx.closePath();
  ctx.fill();

  drawGhost(ctx, 724, 52, 1.2, 0.92);
  drawPumpkin(ctx, 755, 147, 1.45, 0.98);
  drawPumpkin(ctx, 680, 34, 0.55, 0.5);
  ctx.fillStyle = "rgba(255, 245, 230, 0.35)";
  for (const [x, y, r] of [[632, 88, 3], [690, 104, 2], [780, 32, 3], [710, 185, 2]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const avatar = await loadAvatar(user);
  ctx.save();
  ctx.beginPath();
  ctx.arc(75, 76, 59, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, 16, 17, 118, 118);
  } else {
    ctx.fillStyle = "#75401F";
    ctx.fillRect(16, 17, 118, 118);
    ctx.fillStyle = "#FFF1DA";
    ctx.font = "bold 58px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(user?.username || "?").slice(0, 1).toUpperCase(), 75, 98);
  }
  ctx.restore();

  const username = String(user?.globalName || user?.displayName || user?.username || "Player");
  let nameSize = 35;
  ctx.font = "600 " + nameSize + "px Arial";
  while (ctx.measureText(username).width > 430 && nameSize > 22) {
    nameSize -= 1;
    ctx.font = "600 " + nameSize + "px Arial";
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFF8EF";
  ctx.fillText(username, 150, 66, 440);

  ctx.strokeStyle = "#F28A2C";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(150, 82);
  ctx.lineTo(390, 82);
  ctx.stroke();

  const level = Math.max(1, Number(player?.level) || 1);
  const xp = Math.max(0, Number(player?.xp) || 0);
  const nextXp = levelXpRequired(level);
  ctx.fillStyle = "#F5EDE4";
  ctx.font = "27px Arial";
  ctx.fillText("Level: " + level + "   XP: " + compact(xp) + " / " + compact(nextXp) + "   Rank: " + (Number(rank) || 1), 150, 126, 490);

  const barX = 15;
  const barY = 150;
  const barWidth = 630;
  const barHeight = 36;
  roundedRect(ctx, barX, barY, barWidth, barHeight, 18);
  ctx.fillStyle = "#FFFDF9";
  ctx.fill();
  const ratio = Math.max(0, Math.min(1, xp / Math.max(1, nextXp)));
  const fillWidth = Math.max(ratio > 0 ? 24 : 0, Math.floor((barWidth - 8) * ratio));
  if (fillWidth > 0) {
    roundedRect(ctx, barX + 4, barY + 4, Math.min(barWidth - 8, fillWidth), barHeight - 8, 14);
    const gradient = ctx.createLinearGradient(barX, barY, barX + Math.max(1, fillWidth), barY);
    gradient.addColorStop(0, "#E97822");
    gradient.addColorStop(1, "#FFB04A");
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  return canvas.toBuffer("image/png");
}

module.exports = { createProfileCard, compact };
