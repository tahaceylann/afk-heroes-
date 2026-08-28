/* ==========================================================================
   Efsane Çağrısı — Otomatik savaş motoru + canvas render döngüsü.
   app.js ile aynı global kapsamı paylaşır (state, CHARACTER_DEFS,
   ENEMY_DEFS, generateStageEnemies, saveState, toast, switchScreen vb.
   oradan gelir).

   Tasarım: iki takım karşılıklı sabit "sıralarda" durur (klasik AFK-tarzı
   gacha oyunları gibi hareket yok, sadece saldırı efektleri) — en öndeki
   canlı düşman hedef alınır, bu da ön saftaki tank'ın "vuruş yemesini"
   doğal bir strateji katmanı haline getirir.
   ========================================================================== */
"use strict";

const BATTLE_TIME_LIMIT = 32; // saniye — süre dolarsa mağlubiyet
const ULT_GAUGE_PER_HIT = 22;

let canvas, ctx, canvasWrap;
let dpr = 1;
let battleActive = false;
let battleRAF = null;
let battleSpeed = 1;

let playerUnits = [];
let enemyUnits = [];
let particles = [];
let clock = 0;
let currentStageIdx = 0;
let playerShieldUntil = 0, playerShieldMult = 1;
let enemyShieldUntil = 0, enemyShieldMult = 1;
let unitUidCounter = 1;

function elementMultiplier(atkElement, defElement) {
  if (ELEMENT_BEATS[atkElement] === defElement) return 1.3;
  if (ELEMENT_BEATS[defElement] === atkElement) return 0.75;
  return 1;
}

/* ============================== BAŞLAT / BİTİR ============================== */

function startBattle(stageIdx) {
  currentStageIdx = stageIdx;
  clock = 0;
  particles = [];
  playerShieldUntil = 0; enemyShieldUntil = 0;
  battleSpeed = 1;

  const teamIds = state.team.filter(Boolean);
  if (!teamIds.length) { toast("Önce Takım ekranından kahraman seç!"); switchScreen("team"); return; }

  playerUnits = teamIds.map((id, i) => {
    const def = charDef(id);
    const st = heroStats(id);
    return {
      uid: unitUidCounter++, side: "player", slot: i, heroId: id,
      name: def.name, icon: def.icon, role: def.role, element: def.element,
      hp: st.hp, maxHp: st.hp, atk: st.atk, spd: st.spd,
      atkTimer: 0.3 + i * 0.15, ultGauge: 0, flashUntil: 0, alive: true,
    };
  });
  const enemySquad = generateStageEnemies(stageIdx);
  enemyUnits = enemySquad.map((e, i) => ({
    uid: unitUidCounter++, side: "enemy", slot: i,
    name: e.name, icon: e.icon, role: e.role, element: e.element, isBoss: !!e.isBoss,
    hp: e.hp, maxHp: e.hp, atk: e.atk, spd: e.spd,
    atkTimer: 0.5 + i * 0.15, ultGauge: 0, flashUntil: 0, alive: true,
  }));

  switchScreen("battle");
  initCanvasIfNeeded();
  resizeCanvas();
  updateBattleHud();
  battleActive = true;
  if (battleRAF) cancelAnimationFrame(battleRAF);
  let lastTs = performance.now();
  function loop(ts) {
    if (!battleActive) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000) * battleSpeed;
    lastTs = ts;
    updateBattle(dt);
    renderBattle();
    battleRAF = requestAnimationFrame(loop);
  }
  battleRAF = requestAnimationFrame(loop);
  document.getElementById("battleExitBtn").onclick = () => confirmExitBattle();
  document.getElementById("battleSpeedBtn").onclick = () => toggleBattleSpeed();
  updateSpeedBtn();
}

function toggleBattleSpeed() {
  battleSpeed = battleSpeed === 1 ? 2 : 1;
  updateSpeedBtn();
}
function updateSpeedBtn() {
  document.getElementById("battleSpeedBtn").textContent = battleSpeed === 1 ? "1x" : "2x";
}

function confirmExitBattle() {
  showModal(`<h3>Savaştan çık?</h3><p class="panel-desc">Bu savaştaki ilerlemen kaybolur.</p>
    <button class="btn btn-danger" id="exitConfirmBtn">Çık</button>
    <button class="btn btn-secondary" id="exitCancelBtn">Devam Et</button>`);
  document.getElementById("exitCancelBtn").addEventListener("click", closeModal);
  document.getElementById("exitConfirmBtn").addEventListener("click", () => { closeModal(); endBattle(null, true); });
}

function endBattle(victory, silent) {
  battleActive = false;
  if (battleRAF) cancelAnimationFrame(battleRAF);
  if (silent) { switchScreen("home"); return; }

  if (victory) {
    const aliveCount = playerUnits.filter(u => u.alive).length;
    const ratio = aliveCount / playerUnits.length;
    const stars = ratio >= 0.8 ? 3 : ratio >= 0.4 ? 2 : 1;
    const prevStars = state.stageStars[currentStageIdx] || 0;
    state.stageStars[currentStageIdx] = Math.max(prevStars, stars);
    if (currentStageIdx === state.stageIndex && state.stageIndex < TOTAL_STAGES - 1) state.stageIndex++;
    const goldReward = Math.round(60 + currentStageIdx * 22);
    const ticketReward = 1 + Math.floor(currentStageIdx / 5);
    state.gold += goldReward;
    state.tickets += ticketReward;
    const teamIds = state.team.filter(Boolean);
    const luckyId = teamIds[Math.floor(Math.random() * teamIds.length)];
    state.heroShards[luckyId] = (state.heroShards[luckyId] || 0) + 2;
    saveState();
    showModal(`
      <div class="result-modal win">
        <div class="result-icon">🏆</div>
        <h2>Zafer!</h2>
        <div class="result-stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>
        <div class="result-rewards">
          <div>🪙 +${goldReward} altın</div>
          <div>🎫 +${ticketReward} bilet</div>
          <div>🔩 ${charDef(luckyId).icon} ${charDef(luckyId).name}'a parça verildi</div>
        </div>
        <button class="btn btn-primary btn-big" id="resultContinueBtn">Devam Et</button>
      </div>`);
  } else {
    const consolationGold = Math.round(10 + currentStageIdx * 3);
    state.gold += consolationGold;
    saveState();
    showModal(`
      <div class="result-modal lose">
        <div class="result-icon">💀</div>
        <h2>Yenilgi</h2>
        <p class="panel-desc">Kahramanlarını güçlendirip tekrar dene.</p>
        <div class="result-rewards"><div>🪙 +${consolationGold} altın (teselli ödülü)</div></div>
        <button class="btn btn-primary btn-big" id="resultContinueBtn">Tamam</button>
      </div>`);
  }
  document.getElementById("resultContinueBtn").addEventListener("click", () => { closeModal(); switchScreen("home"); });
}

/* ============================== CANVAS ============================== */

function initCanvasIfNeeded() {
  canvasWrap = document.getElementById("battleCanvasWrap");
  canvas = document.getElementById("battleCanvas");
  ctx = canvas.getContext("2d");
  if (!canvas.dataset.wired) {
    canvas.dataset.wired = "1";
    window.addEventListener("resize", resizeCanvas);
  }
}

function resizeCanvas() {
  if (!canvasWrap) return;
  const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  if (!w || !h) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + "px"; canvas.style.height = h + "px";
}

/* ============================== GÜNCELLEME ============================== */

function updateBattle(dt) {
  clock += dt;
  if (playerShieldUntil && playerShieldUntil < clock) playerShieldUntil = 0;
  if (enemyShieldUntil && enemyShieldUntil < clock) enemyShieldUntil = 0;

  processTeamTurns(playerUnits, enemyUnits, "player");
  processTeamTurns(enemyUnits, playerUnits, "enemy");

  updateParticles(dt);

  const playerAlive = playerUnits.some(u => u.alive);
  const enemyAlive = enemyUnits.some(u => u.alive);
  if (!enemyAlive) { endBattle(true); return; }
  if (!playerAlive) { endBattle(false); return; }
  if (clock >= BATTLE_TIME_LIMIT) { endBattle(false); return; }

  updateBattleHud();

  function processTeamTurns(allies, enemies, side) {
    allies.forEach(u => {
      if (!u.alive) return;
      u.atkTimer -= dt;
      if (u.flashUntil && u.flashUntil < clock) u.flashUntil = 0;
      if (u.atkTimer > 0) return;
      u.atkTimer = 1 / u.spd;
      const target = enemies.find(e => e.alive);
      if (!target) return;
      const useUlt = u.ultGauge >= 100;
      if (useUlt) { u.ultGauge = 0; executeUlt(u, allies, enemies, side); }
      else { basicAttack(u, target, side); u.ultGauge = Math.min(100, u.ultGauge + ULT_GAUGE_PER_HIT); }
    });
  }
}

function basicAttack(attacker, target, side) {
  const mult = elementMultiplier(attacker.element, target.element);
  const shieldMult = target.side === "player" ? (playerShieldUntil ? playerShieldMult : 1) : (enemyShieldUntil ? enemyShieldMult : 1);
  const dmg = Math.round(attacker.atk * mult * shieldMult);
  applyDamage(target, dmg, mult > 1);
  spawnAttackFx(attacker, target, side);
}

function executeUlt(attacker, allies, enemies, side) {
  attacker.flashUntil = clock + 0.4;
  triggerShake(0.25, 6);
  spawnFloatingText(unitX(attacker), unitY(attacker) - 46, `${attacker.name}: ${attacker.ult || "ULT"}!`, "#ffd24d", true);
  switch (attacker.role) {
    case "tank": {
      if (side === "player") { playerShieldUntil = clock + 3; playerShieldMult = 0.55; }
      else { enemyShieldUntil = clock + 3; enemyShieldMult = 0.55; }
      allies.forEach(a => a.alive && spawnParticleBurst(unitX(a), unitY(a), "#66e0ff", 8));
      break;
    }
    case "fighter": {
      const target = enemies.find(e => e.alive);
      if (target) {
        const mult = elementMultiplier(attacker.element, target.element) * 2.2;
        applyDamage(target, Math.round(attacker.atk * mult), true);
        spawnAttackFx(attacker, target, side, true);
      }
      break;
    }
    case "assassin": {
      let lowest = null;
      enemies.forEach(e => { if (e.alive && (!lowest || e.hp < lowest.hp)) lowest = e; });
      if (lowest) {
        for (let i = 0; i < 2; i++) {
          const mult = elementMultiplier(attacker.element, lowest.element) * 1.15;
          applyDamage(lowest, Math.round(attacker.atk * mult), true);
        }
        spawnAttackFx(attacker, lowest, side, true);
      }
      break;
    }
    case "mage": {
      enemies.forEach(e => {
        if (!e.alive) return;
        const mult = elementMultiplier(attacker.element, e.element);
        applyDamage(e, Math.round(attacker.atk * mult * 0.85), true);
        spawnParticleBurst(unitX(e), unitY(e), "#ff8a3d", 10);
      });
      break;
    }
    case "healer": {
      let lowest = null;
      allies.forEach(a => { if (a.alive && (!lowest || a.hp / a.maxHp < lowest.hp / lowest.maxHp)) lowest = a; });
      if (lowest) {
        const healAmt = Math.round(attacker.atk * 3.2);
        lowest.hp = Math.min(lowest.maxHp, lowest.hp + healAmt);
        spawnFloatingText(unitX(lowest), unitY(lowest) - 20, "+" + healAmt, "#4dd68a");
        spawnParticleBurst(unitX(lowest), unitY(lowest), "#4dd68a", 12);
      }
      break;
    }
  }
}

function applyDamage(unit, dmg, big) {
  unit.hp -= dmg;
  unit.flashUntil = clock + 0.15;
  spawnFloatingText(unitX(unit), unitY(unit) - 30, Math.round(dmg), big ? "#ffd24d" : "#ffffff", big);
  if (unit.hp <= 0 && unit.alive) {
    unit.alive = false;
    unit.hp = 0;
    spawnParticleBurst(unitX(unit), unitY(unit), "#ff4d6a", 16);
  }
}

function updateBattleHud() {
  document.getElementById("battleStageLabel").textContent = `${currentStageIdx + 1}. Bölge`;
  document.getElementById("battleTimerLabel").textContent = `${Math.max(0, Math.ceil(BATTLE_TIME_LIMIT - clock))}s`;
}

/* ============================== KOORDİNATLAR ============================== */
function unitX(u) {
  const w = canvas.width / dpr;
  return u.side === "player" ? w * 0.22 : w * 0.78;
}
function unitY(u) {
  const h = canvas.height / dpr;
  const total = (u.side === "player" ? playerUnits.length : enemyUnits.length);
  const usable = h * 0.82;
  return h * 0.10 + usable * ((u.slot + 0.5) / total);
}

/* ============================== PARÇACIKLAR ============================== */
function spawnParticleBurst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 120;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.5 + Math.random() * 0.35, age: 0, color, size: 2 + Math.random() * 2.5, kind: "dot" });
  }
}
function spawnFloatingText(x, y, text, color, big) {
  particles.push({ x, y, vx: (Math.random() - 0.5) * 16, vy: -55, life: big ? 1.1 : 0.8, age: 0, color, text, kind: "text", big });
}
function spawnAttackFx(attacker, target, side, big) {
  const ax = unitX(attacker), ay = unitY(attacker);
  const tx = unitX(target), ty = unitY(target);
  particles.push({ x: ax, y: ay, vx: (tx - ax) / 0.14, vy: (ty - ay) / 0.14, life: 0.14, age: 0, color: big ? "#ffd24d" : "#66e0ff", size: big ? 6 : 4, kind: "bolt", onArrive: () => spawnParticleBurst(tx, ty, big ? "#ffd24d" : "#66e0ff", big ? 12 : 6) });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      if (p.kind === "bolt" && p.onArrive) p.onArrive();
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === "dot") p.vy += 130 * dt;
  }
}
let shakeTime = 0, shakeMag = 0;
function triggerShake(duration, mag) {
  if (!state.settings.shake) return;
  shakeTime = duration; shakeMag = mag;
}

/* ============================== RENDER ============================== */

function renderBattle() {
  if (!ctx) return;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  let ox = 0, oy = 0;
  if (shakeTime > 0) { shakeTime -= 1 / 60; ox = (Math.random() - 0.5) * shakeMag; oy = (Math.random() - 0.5) * shakeMag; ctx.translate(ox, oy); }

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#161225"); bg.addColorStop(1, "#0c0f16");
  ctx.fillStyle = bg; ctx.fillRect(-10, -10, w + 20, h + 20);

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();

  ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("VS", w / 2, h / 2);

  if (playerShieldUntil) drawShieldAura(w * 0.22, h);
  if (enemyShieldUntil) drawShieldAura(w * 0.78, h);

  playerUnits.forEach(u => drawUnit(u));
  enemyUnits.forEach(u => drawUnit(u));
  particles.forEach(p => drawParticle(p));

  ctx.restore();
}

function drawShieldAura(cx, h) {
  ctx.save();
  ctx.globalAlpha = 0.08 + Math.sin(clock * 4) * 0.03;
  ctx.fillStyle = "#66e0ff";
  ctx.fillRect(cx - 55, 0, 110, h);
  ctx.restore();
}

function drawUnit(u) {
  const x = unitX(u), y = unitY(u);
  const r = u.isBoss ? 34 : 26;
  ctx.save();
  if (!u.alive) ctx.globalAlpha = 0.25;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  const roleColor = { tank: "#66e0ff", fighter: "#ff8a3d", assassin: "#c77bff", mage: "#ff4d6a", healer: "#4dd68a" }[u.role] || "#8fa3c7";
  grad.addColorStop(0, "#fff"); grad.addColorStop(0.25, roleColor); grad.addColorStop(1, "#10141d");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = u.side === "player" ? "#66e0ff" : "#ff4d6a"; ctx.stroke();

  if (u.flashUntil && u.flashUntil > clock) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill();
  }

  // ult gauge ring
  if (u.alive && u.ultGauge > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + (u.ultGauge / 100) * Math.PI * 2);
    ctx.strokeStyle = "#ffd24d"; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();

  ctx.font = Math.round(r * 1.05) + "px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.globalAlpha = u.alive ? 1 : 0.3;
  ctx.fillText(u.icon, x, y + 1);
  ctx.globalAlpha = 1;

  ctx.font = "10px sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(u.name, x, y + r + 13);

  const barW = 50, barH = 5;
  const bx = x - barW / 2, by = y - r - 12;
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = u.side === "player" ? "#4dd68a" : "#ff4d6a";
  ctx.fillRect(bx, by, barW * Math.max(0, u.hp / u.maxHp), barH);
}

function drawParticle(p) {
  const t = p.age / p.life;
  const alpha = 1 - t;
  if (p.kind === "text") {
    ctx.globalAlpha = alpha; ctx.fillStyle = p.color;
    ctx.font = (p.big ? "bold 15px" : "bold 12px") + " sans-serif"; ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y); ctx.globalAlpha = 1;
    return;
  }
  if (p.kind === "bolt") {
    ctx.globalAlpha = alpha; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    return;
  }
  ctx.globalAlpha = alpha; ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
}
