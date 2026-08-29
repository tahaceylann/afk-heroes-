/* ==========================================================================
   Efsane Çağrısı — Görsel tema: "Kristal Varlıklar".
   Emoji yerine, tüm kahraman/düşman temsilleri BU dosyadaki tek bir çizim
   fonksiyonundan üretilir (canvas path + gradyan) — böylece savaş
   sahnesinde, kart görsellerinde, kadro ekranında hep AYNI özgün "asset"
   görünür, farklı yerlerde farklı emoji karışıklığı yerine tutarlı bir
   sanat yönü oluşur. Şekil = role, renk = element, parlaklık/aura = nadirlik.
   app.js ve battle.js ile aynı global kapsamı paylaşır.
   ========================================================================== */
"use strict";

// Her rol için özgün bir kristal silüeti (birim koordinat, -0.5..0.5 kutusu).
const ROLE_SHAPES = {
  tank:     [[0, -0.5], [0.44, -0.24], [0.44, 0.24], [0, 0.5], [-0.44, 0.24], [-0.44, -0.24]],
  fighter:  [[0, -0.5], [0.22, -0.08], [0.30, 0.5], [0, 0.28], [-0.30, 0.5], [-0.22, -0.08]],
  assassin: [[0, -0.5], [0.13, 0.02], [0.06, 0.5], [-0.06, 0.5], [-0.13, 0.02]],
  mage:     [[0, -0.5], [0.34, -0.15], [0.22, 0.5], [-0.22, 0.5], [-0.34, -0.15]],
  healer:   [[0, -0.5], [0.24, -0.24], [0.5, 0], [0.24, 0.24], [0, 0.5], [-0.24, 0.24], [-0.5, 0], [-0.24, -0.24]],
};
// Büyücü ve şifacının etrafında yörüngede dönen küçük "uydu" kristaller.
const ROLE_SATELLITES = { mage: 3, healer: 0, tank: 0, fighter: 0, assassin: 1 };

const ELEMENT_PALETTE = {
  fire:   { base: "#ff8a3d", edge: "#ffe14d", glow: "rgba(255,138,61,0.55)" },
  water:  { base: "#4dc9ff", edge: "#bdf3ff", glow: "rgba(77,201,255,0.55)" },
  nature: { base: "#4dd68a", edge: "#d6ffb0", glow: "rgba(77,214,138,0.5)" },
};
const RARITY_IDX = { common: 0, rare: 1, epic: 2, legendary: 3 };
const RARITY_AURA = ["", "", "rgba(199,123,255,0.5)", "rgba(255,210,77,0.65)"]; // epik/efsanevi aura rengi

function lightenHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + amt);
  const g = Math.min(255, ((n >> 8) & 255) + amt);
  const b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}

/**
 * Bir kristal varlığı canvas'a çizer. cx,cy merkezi; r yaklaşık yarıçapı.
 * opts: { role, element, rarity, alive, flashAlpha, spinT (0..1, uydular/aura için) }
 */
function drawCrystalBeing(ctx, cx, cy, r, opts) {
  const role = opts.role || "fighter";
  const element = opts.element || "fire";
  const rarity = opts.rarity || "common";
  const pal = ELEMENT_PALETTE[element] || ELEMENT_PALETTE.fire;
  const shape = ROLE_SHAPES[role] || ROLE_SHAPES.fighter;
  const t = opts.spinT || 0;
  const alive = opts.alive !== false;

  ctx.save();
  if (!alive) ctx.globalAlpha = 0.25;

  const auraColor = RARITY_AURA[RARITY_IDX[rarity]] || "";
  if (auraColor) {
    ctx.save();
    ctx.globalAlpha *= 0.5 + Math.sin(t * Math.PI * 2) * 0.15;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
    ctx.strokeStyle = auraColor;
    ctx.lineWidth = r * 0.1;
    ctx.stroke();
    ctx.restore();
  }

  // uydu kristaller (büyücü/suikastçı) — merkezin etrafında döner
  const satCount = ROLE_SATELLITES[role] || 0;
  for (let i = 0; i < satCount; i++) {
    const ang = t * Math.PI * 2 + (i / satCount) * Math.PI * 2;
    const sx = cx + Math.cos(ang) * r * 1.15;
    const sy = cy + Math.sin(ang) * r * 1.15;
    drawFacetShape(ctx, ROLE_SHAPES.assassin, sx, sy, r * 0.32, pal);
  }

  drawFacetShape(ctx, shape, cx, cy, r, pal);

  if (opts.flashAlpha && opts.flashAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = opts.flashAlpha;
    ctx.beginPath();
    shape.forEach(([x, y], i) => {
      const px = cx + x * r * 2, py = cy + y * r * 2;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawFacetShape(ctx, shapePts, cx, cy, r, pal) {
  const pts = shapePts.map(([x, y]) => [cx + x * r * 2, cy + y * r * 2]);
  ctx.save();
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = r * 0.5;
  ctx.beginPath();
  pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.closePath();
  const grad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  grad.addColorStop(0, pal.edge);
  grad.addColorStop(0.45, pal.base);
  grad.addColorStop(1, lightenHex(pal.base, -60));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.stroke();
  // facet çizgileri: merkezden her köşeye ince bir çizgi (kesim yüzeyi hissi)
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(0.5, r * 0.02);
  pts.forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); });
  ctx.restore();
}

/* ============================== DOM KART İKONLARI ============================== */
// Kart/rozet gibi DOM öğelerinde emoji yerine kullanılan küçük statik
// kristal ikonu: bir <canvas> döndürür, çağıran yer innerHTML yerine
// appendChild ile ekler.
function crystalIconCanvas(role, element, rarity, size) {
  size = size || 40;
  const c = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = size * dpr; c.height = size * dpr;
  c.style.width = size + "px"; c.style.height = size + "px";
  c.className = "crystal-icon";
  const cctx = c.getContext("2d");
  cctx.scale(dpr, dpr);
  drawCrystalBeing(cctx, size / 2, size / 2, size * 0.34, { role, element, rarity, spinT: 0.2 });
  return c;
}

// Bir kahraman id'sine göre ikon üretip verilen konteynerin BAŞINA ekler
// (mevcut içerik korunur — çağıran yer geri kalan metni kendisi ekler).
function mountHeroIcon(container, heroId, size) {
  const def = charDef(heroId);
  const rarity = def ? def.rarity : "common";
  const role = def ? def.role : "fighter";
  const element = def ? def.element : "fire";
  container.appendChild(crystalIconCanvas(role, element, rarity, size));
}
