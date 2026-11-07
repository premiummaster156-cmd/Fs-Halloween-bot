const { createCanvas } = require("@napi-rs/canvas");

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function polygon(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function bar(ctx, x, y, width, height, ratio, first, second) {
  rounded(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = "#10131D";
  ctx.fill();
  const fillWidth = Math.max(0, Math.min(width, width * ratio));
  if (fillWidth > 0) {
    rounded(ctx, x, y, fillWidth, height, height / 2);
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, first);
    gradient.addColorStop(1, second);
    ctx.fillStyle = gradient;
    ctx.shadowColor = second;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function createArenaCard({ boss, battle = null, playerLevel = 1 }) {
  const width = 980;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#090D1A");
  bg.addColorStop(0.48, "#20233A");
  bg.addColorStop(1, "#080B15");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  polygon(ctx, [[0, 0], [400, 0], [280, height], [0, height]], "rgba(79, 86, 145, 0.13)");
  polygon(ctx, [[610, 0], [980, 0], [980, 360], [770, 360]], "rgba(219, 72, 74, 0.10)");
  for (let i = 0; i < 11; i++) {
    const y = 32 + i * 29;
    ctx.strokeStyle = "rgba(177, 195, 255, 0.055)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y - 34);
    ctx.stroke();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  rounded(ctx, 28, 26, 924, 308, 22);
  const frame = ctx.createLinearGradient(28, 26, 950, 334);
  frame.addColorStop(0, "#67769D");
  frame.addColorStop(0.16, "#202A45");
  frame.addColorStop(0.85, "#3B385C");
  frame.addColorStop(1, "#11192D");
  ctx.fillStyle = frame;
  ctx.fill();
  ctx.restore();

  rounded(ctx, 34, 32, 912, 296, 18);
  const inside = ctx.createLinearGradient(34, 32, 900, 328);
  inside.addColorStop(0, "#10172A");
  inside.addColorStop(0.5, "#1B1C31");
  inside.addColorStop(1, "#0B1020");
  ctx.fillStyle = inside;
  ctx.fill();
  ctx.strokeStyle = "rgba(207, 220, 255, 0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const accent = ctx.createLinearGradient(60, 0, 430, 0);
  accent.addColorStop(0, "#6A8BFF");
  accent.addColorStop(1, "#B16CFF");
  rounded(ctx, 58, 56, 5, 44, 3);
  ctx.fillStyle = accent;
  ctx.fill();

  ctx.font = "700 15px Arial";
  ctx.fillStyle = "#AFC0F5";
  ctx.fillText("FUKISHOKAI  //  RIFT ARENA", 78, 69);
  ctx.font = "700 30px Arial";
  ctx.fillStyle = "#F2F4FF";
  ctx.fillText(String(boss.name).toUpperCase(), 78, 111, 480);
  ctx.font = "italic 15px Arial";
  ctx.fillStyle = "#AAB3D0";
  ctx.fillText(boss.title || "Rift encounter", 80, 137, 460);

  // Layered polygon silhouette creates a beveled, 3D-inspired boss portrait.
  const cx = 732;
  const cy = 184;
  ctx.save();
  ctx.shadowColor = "rgba(255, 74, 93, 0.55)";
  ctx.shadowBlur = 28;
  polygon(ctx, [[cx - 120, cy + 75], [cx - 90, cy - 20], [cx - 145, cy - 118], [cx - 40, cy - 66], [cx, cy - 128], [cx + 38, cy - 62], [cx + 140, cy - 108], [cx + 90, cy - 12], [cx + 120, cy + 78], [cx + 30, cy + 54], [cx, cy + 115], [cx - 34, cy + 50]], "#171D32");
  ctx.restore();
  polygon(ctx, [[cx - 90, cy + 27], [cx - 56, cy - 56], [cx - 18, cy - 24], [cx - 2, cy - 87], [cx + 29, cy - 25], [cx + 75, cy - 52], [cx + 69, cy + 31], [cx + 23, cy + 78], [cx - 34, cy + 76]], "#424B75");
  polygon(ctx, [[cx - 55, cy + 8], [cx - 15, cy - 48], [cx + 2, cy - 10], [cx + 31, cy - 43], [cx + 51, cy + 6], [cx + 21, cy + 53], [cx - 27, cy + 53]], "#242D49");
  polygon(ctx, [[cx - 47, cy - 28], [cx - 7, cy - 14], [cx - 33, cy - 5]], "#FF6A78");
  polygon(ctx, [[cx + 9, cy - 14], [cx + 48, cy - 30], [cx + 30, cy - 4]], "#FF6A78");
  polygon(ctx, [[cx - 38, cy + 48], [cx, cy + 61], [cx + 36, cy + 46], [cx + 14, cy + 78], [cx - 15, cy + 78]], "#10162B");
  polygon(ctx, [[cx - 90, cy + 27], [cx - 56, cy - 56], [cx - 100, cy - 95], [cx - 71, cy - 2]], "rgba(151, 177, 255, 0.5)");
  polygon(ctx, [[cx + 75, cy - 52], [cx + 140, cy - 108], [cx + 91, cy - 20]], "rgba(255, 119, 132, 0.48)");

  ctx.font = "700 11px Arial";
  ctx.fillStyle = "#7F8AAE";
  ctx.fillText("CHALLENGER", 80, 190);
  ctx.font = "700 18px Arial";
  ctx.fillStyle = "#E8ECFF";
  ctx.fillText("LEVEL " + playerLevel, 80, 218);

  if (battle) {
    ctx.fillStyle = "#8895BE";
    ctx.font = "700 11px Arial";
    ctx.fillText("BOSS INTEGRITY", 80, 252);
    bar(ctx, 80, 266, 440, 15, battle.bossHp / Math.max(1, battle.bossMaxHp), "#C34B61", "#FF8A73");
    ctx.font = "12px Arial";
    ctx.fillStyle = "#D8DDF1";
    ctx.fillText(battle.bossHp.toLocaleString() + " / " + battle.bossMaxHp.toLocaleString(), 80, 299);
    ctx.fillStyle = "#8895BE";
    ctx.font = "700 11px Arial";
    ctx.fillText("YOUR VITALITY", 560, 252);
    bar(ctx, 560, 266, 300, 15, battle.playerHp / Math.max(1, battle.playerMaxHp), "#238E93", "#63E0C2");
    ctx.font = "12px Arial";
    ctx.fillStyle = "#D8DDF1";
    ctx.fillText(battle.playerHp.toLocaleString() + " / " + battle.playerMaxHp.toLocaleString() + "   ·   TURN " + battle.turn, 560, 299);
  } else {
    ctx.fillStyle = "#8895BE";
    ctx.font = "700 11px Arial";
    ctx.fillText("THREAT RATING", 80, 252);
    ctx.font = "700 25px Arial";
    ctx.fillStyle = "#F3D38A";
    ctx.fillText("LEVEL " + boss.minLevel + "+", 80, 282);
    ctx.font = "12px Arial";
    ctx.fillStyle = "#D8DDF1";
    ctx.fillText("Select your target to enter the Rift.", 560, 282);
  }

  ctx.font = "700 10px Arial";
  ctx.fillStyle = "#68769F";
  ctx.fillText("ONE POWER PER ITEM  ·  TURN-BASED COMBAT  ·  PERSISTENT ENCOUNTER", 80, 316);
  return canvas.toBuffer("image/png");
}

module.exports = { createArenaCard };
