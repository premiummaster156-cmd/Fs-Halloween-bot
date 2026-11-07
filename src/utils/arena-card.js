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

function drawBossPortrait(ctx, boss, cx, cy) {
  const palettes = {
    training_golem: ["#E4B66A", "#8A6B48", "#4C5668", "#FFE4A1"],
    ashen_knight: ["#FF795F", "#9C3F42", "#343447", "#FFC08B"],
    rift_warden: ["#B18AFF", "#6548A8", "#25294A", "#E3C7FF"],
    abyss_wyrm: ["#66E4E8", "#287C91", "#18384B", "#B9FFFF"],
    oni_shogun: ["#FF596A", "#A92D43", "#3B2034", "#FFD18A"],
    dragon_sovereign: ["#F5C76B", "#A66B32", "#2B2635", "#FFF0B0"]
  };
  const [glow, mid, dark, highlight] = palettes[boss.id] || palettes.oni_shogun;
  const grad = (x1, y1, x2, y2, stops) => {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    stops.forEach(([at, color]) => g.addColorStop(at, color));
    return g;
  };
  const path = (points, fill, stroke = null, lineWidth = 1) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const p of points.slice(1)) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  };
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = glow;
  ctx.shadowBlur = 24;

  // Back aura and crown silhouette.
  ctx.fillStyle = glow + "22";
  ctx.beginPath(); ctx.ellipse(0, 5, 142, 132, 0, 0, Math.PI * 2); ctx.fill();
  path([[-82,-42],[-142,-134],[-58,-98],[-28,-154],[0,-111],[38,-155],[62,-94],[140,-132],[82,-35],[102,74],[-102,74]], dark, glow, 3);
  ctx.shadowBlur = 0;

  // Broad armored shoulders and chest.
  path([[-34,42],[-106,38],[-148,93],[-126,151],[-58,137],[-20,103],[20,103],[58,137],[126,151],[148,93],[106,38],[34,42]], grad(-120,40,120,150,[[0,highlight],[0.24,mid],[0.55,dark],[0.82,mid],[1,highlight]]), glow, 2);
  path([[-78,62],[-45,48],[0,72],[45,48],[78,62],[55,132],[0,154],[-55,132]], grad(0,60,0,150,[[0,mid],[0.45,dark],[1,"#101321"]]), "#8D9BB9", 2);
  path([[-95,73],[-132,91],[-112,118],[-72,107]], dark, highlight, 2);
  path([[95,73],[132,91],[112,118],[72,107]], dark, highlight, 2);
  for (const side of [-1,1]) {
    ctx.strokeStyle = glow; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(side*95,75); ctx.lineTo(side*130,102); ctx.lineTo(side*108,130); ctx.stroke();
    ctx.fillStyle = highlight; ctx.beginPath(); ctx.arc(side*105,93,4,0,Math.PI*2); ctx.fill();
  }

  // Neck and head armor.
  path([[-43,18],[-35,65],[0,91],[35,65],[43,18]], dark, mid, 3);
  path([[-62,-53],[-45,-93],[0,-110],[45,-93],[62,-53],[55,14],[30,52],[0,68],[-30,52],[-55,14]], grad(-60,-90,65,55,[[0,highlight],[0.22,mid],[0.52,dark],[0.78,mid],[1,highlight]]), glow, 2.5);
  path([[-56,-45],[-35,-80],[0,-91],[35,-80],[56,-45],[37,-26],[0,-39],[-37,-26]], dark, highlight, 2);
  // Brow, eyes, nose bridge and mask.
  path([[-47,-34],[-14,-25],[-4,-16],[-42,-18]], dark);
  path([[47,-34],[14,-25],[4,-16],[42,-18]], dark);
  ctx.shadowColor = glow; ctx.shadowBlur = 18;
  for (const side of [-1,1]) {
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(side*23,-16,12,5,side*-0.12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(side*23,-16,2.2,0,Math.PI*2); ctx.fill();
  }
  ctx.shadowBlur = 0;
  path([[-18,-4],[0,-19],[18,-4],[12,30],[0,42],[-12,30]], grad(0,-15,0,42,[[0,mid],[1,dark]]), highlight, 1.5);
  path([[-35,5],[-14,14],[0,10],[14,14],[35,5],[24,42],[0,56],[-24,42]], dark, glow, 2);
  for (let x=-18;x<=18;x+=9) path([[x,27],[x+4,35],[x,41]], "#E8EAF7");
  // Horns.
  path([[-42,-68],[-69,-91],[-86,-143],[-49,-115],[-27,-76]], grad(-80,-130,-25,-70,[[0,highlight],[1,mid]]), "#E7C9A2", 2);
  path([[42,-68],[69,-91],[86,-143],[49,-115],[27,-76]], grad(25,-70,80,-130,[[0,mid],[1,highlight]]), "#E7C9A2", 2);
  // Forehead crest and engraved armor seams.
  path([[-19,-83],[0,-104],[19,-83],[0,-59]], glow, highlight, 1);
  ctx.strokeStyle = highlight; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0,64); ctx.lineTo(0,137); ctx.moveTo(-48,81); ctx.lineTo(-28,119); ctx.moveTo(48,81); ctx.lineTo(28,119); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
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

  // Clear, detailed illustrated boss portrait replaces the old abstract polygon placeholder.
  drawBossPortrait(ctx, boss, 748, 183);

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
