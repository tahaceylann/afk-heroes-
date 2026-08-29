/* ==========================================================================
   Efsane Çağrısı — Otomatik savaş motoru: gerçek 3D sahne (Three.js) +
   savaş simülasyonu. app.js ile aynı global kapsamı paylaşır (state,
   CHARACTER_DEFS, ENEMY_DEFS, generateStageEnemies, saveState, toast,
   switchScreen, ELEMENT_PALETTE/ROLE_SHAPES gibi theme.js sabitleri vb.
   oradan gelir).

   Tasarım: iki takım "Büyülü Orman" sahnesinde karşılıklı sabit
   noktalarda durur — en öndeki canlı düşman hedef alınır (tank'ın vuruş
   yemesi doğal bir strateji katmanı). Görsel katman tamamen 3D: gerçek
   derinlik, gölgeler, açılı kamera, kristal geometrili karakterler.
   Simülasyon mantığı (hedefleme/hasar/ult) 2D sürümle neredeyse birebir
   aynı — sadece render katmanı Canvas2D'den Three.js'e taşındı.
   ========================================================================== */
"use strict";

const BATTLE_TIME_LIMIT = 32;
const ULT_GAUGE_PER_HIT = 22;

let battleScene, battleCamera, battleRenderer, canvasWrap;
let battleInited = false;
let battleActive = false;
let battleRAF = null;
let battleSpeed = 1;
let battleClock = 0;
let battleDpr = 1;

let playerUnits = [];
let enemyUnits = [];
let currentStageIdx = 0;
let playerShieldUntil = 0, playerShieldMult = 1;
let enemyShieldUntil = 0, enemyShieldMult = 1;
let unitUidCounter = 1;
let shieldDomeP = null, shieldDomeE = null;
let transientObjs = []; // { obj, kind:'sprite'|'bolt', life, age, vx, vy, vz, onArrive }
let camShake = 0;

function elementMultiplier(atkElement, defElement) {
  if (ELEMENT_BEATS[atkElement] === defElement) return 1.3;
  if (ELEMENT_BEATS[defElement] === atkElement) return 0.75;
  return 1;
}

/* ==========================================================================
   Sahne kurulumu (bir kez) — "Büyülü Orman": zemin, ağaçlar, sis, ışık.
   ========================================================================== */
function initBattleSceneIfNeeded() {
  if (battleInited) return;
  canvasWrap = document.getElementById("battleCanvasWrap");
  if (!canvasWrap || typeof THREE === "undefined") return;
  battleInited = true;

  battleScene = new THREE.Scene();
  battleScene.background = new THREE.Color(0x0e2418);
  battleScene.fog = new THREE.Fog(0x0e2418, 9, 26);

  battleCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  battleCamera.position.set(0, 6.1, 7.6);
  battleCamera.lookAt(0, 0.5, -1.0);

  battleRenderer = new THREE.WebGLRenderer({ antialias: true });
  battleRenderer.shadowMap.enabled = true;
  battleRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
  battleRenderer.outputEncoding = THREE.sRGBEncoding;
  battleRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  battleRenderer.toneMappingExposure = 1.1;
  battleRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  canvasWrap.innerHTML = "";
  canvasWrap.appendChild(battleRenderer.domElement);
  resizeBattleRenderer();
  window.addEventListener("resize", resizeBattleRenderer);

  const hemi = new THREE.HemisphereLight(0x9fd6a0, 0x0c1a10, 0.65);
  battleScene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe9b0, 1.0);
  sun.position.set(4, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 24;
  sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.bias = -0.0015;
  battleScene.add(sun);
  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  battleScene.add(ambient);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1c3320, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 32), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  battleScene.add(ground);

  buildForest();
  spawnFireflies();

  const godrayGeo = new THREE.PlaneGeometry(2.2, 14);
  [-1.4, 1.6].forEach((x, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xd6ffb0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(godrayGeo, mat);
    beam.position.set(x, 6, -0.5);
    beam.rotation.x = -0.45;
    beam.rotation.z = i === 0 ? 0.12 : -0.1;
    beam.userData.baseOpacity = 0.05;
    beam.userData.phase = i * 3;
    battleScene.add(beam);
  });

  battleScene.userData.godrays = battleScene.children.filter(c => c.userData && c.userData.baseOpacity !== undefined);
}

function buildForest() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 1 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x1f4a2c, roughness: 0.85 });
  const ringRadii = [7.2, 10.5];
  ringRadii.forEach((radius, ri) => {
    const count = ri === 0 ? 10 : 14;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + ri * 0.3;
      const x = Math.cos(ang) * radius, z = Math.sin(ang) * radius - 2;
      if (Math.abs(x) < 3.8 && z > -4.2 && z < 4.2) continue; // savaş alanını boş bırak
      const h = 3.2 + Math.random() * 2.2;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 6), trunkMat);
      trunk.position.set(x, h / 2, z);
      trunk.castShadow = true;
      battleScene.add(trunk);
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95 + Math.random() * 0.5, 0), canopyMat);
      canopy.position.set(x, h + 0.6, z);
      canopy.castShadow = true;
      canopy.scale.y = 0.8;
      battleScene.add(canopy);
    }
  });
}

let fireflies = [];
function spawnFireflies() {
  const tex = getDotTexture();
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xd8ff8a, transparent: true, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    const s = 0.06 + Math.random() * 0.05;
    spr.scale.set(s, s, 1);
    spr.position.set((Math.random() - 0.5) * 10, 0.5 + Math.random() * 3, (Math.random() - 0.5) * 8 - 1);
    spr.userData.phase = Math.random() * 10;
    spr.userData.speed = 0.15 + Math.random() * 0.2;
    battleScene.add(spr);
    fireflies.push(spr);
  }
}

let dotTexture = null;
function getDotTexture() {
  if (dotTexture) return dotTexture;
  const size = 32;
  const c = document.createElement("canvas"); c.width = c.height = size;
  const cx = c.getContext("2d");
  const grad = cx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.95)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  cx.fillStyle = grad; cx.fillRect(0, 0, size, size);
  dotTexture = new THREE.CanvasTexture(c);
  return dotTexture;
}

function makeTextTexture(text, color, size) {
  size = size || 128;
  const c = document.createElement("canvas");
  c.width = size * 2; c.height = size;
  const cx = c.getContext("2d");
  cx.font = "bold " + Math.round(size * 0.55) + "px sans-serif";
  cx.textAlign = "center"; cx.textBaseline = "middle";
  cx.fillStyle = color;
  cx.shadowColor = "rgba(0,0,0,0.8)"; cx.shadowBlur = 6;
  cx.fillText(String(text), c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function resizeBattleRenderer() {
  if (!canvasWrap || !battleRenderer) return;
  const w = canvasWrap.clientWidth, h = canvasWrap.clientHeight;
  if (!w || !h) return;
  battleRenderer.setSize(w, h);
  battleCamera.aspect = w / h;
  battleCamera.updateProjectionMatrix();
}

/* ==========================================================================
   Karakter geometrisi — role göre siluet, elemente göre renk (theme.js'teki
   2D "Kristal Varlıklar" diliyle aynı mantık, şimdi gerçek 3D geometri).
   ========================================================================== */
// Paylaşılan geometriler — her ünitede yeniden oluşturmak yerine bir kez
// kurulup tüm karakterler arasında paylaşılıyor (bellek/performans).
const HUMANOID_GEO = {
  leg: new THREE.CylinderGeometry(0.062, 0.08, 0.46, 6),
  armThin: new THREE.CylinderGeometry(0.04, 0.05, 0.38, 6),
  armThick: new THREE.CylinderGeometry(0.05, 0.065, 0.4, 6),
  hand: new THREE.SphereGeometry(0.055, 8, 8),
  head: new THREE.SphereGeometry(0.145, 12, 10),
  torsoTank: new THREE.BoxGeometry(0.48, 0.4, 0.3),
  torsoFighter: new THREE.BoxGeometry(0.36, 0.38, 0.24),
  torsoAssassin: new THREE.BoxGeometry(0.28, 0.36, 0.2),
  robe: new THREE.ConeGeometry(0.3, 0.42, 8),
  shield: new THREE.BoxGeometry(0.055, 0.36, 0.28),
  sword: new THREE.BoxGeometry(0.045, 0.4, 0.045),
  swordSmall: new THREE.BoxGeometry(0.03, 0.24, 0.03),
  staff: new THREE.CylinderGeometry(0.02, 0.026, 0.7, 6),
  orb: new THREE.SphereGeometry(0.065, 10, 10),
  wing: new THREE.PlaneGeometry(0.3, 0.34),
};
const SKIN_MAT = new THREE.MeshStandardMaterial({ color: 0xe9c8a0, roughness: 0.7 });
const METAL_MAT = new THREE.MeshStandardMaterial({ color: 0xb9c0cc, roughness: 0.35, metalness: 0.6 });

/**
 * Basit primitiflerden kurulmuş, ayakta duran bir savaşçı figürü — düz bir
 * kristal/geometrik cisim yerine gerçek bir kafa/gövde/kol/bacak ve role
 * özgü bir silah/aksesuar. Element rengi kıyafete, nadirlik ayaklardaki
 * dönen halkaya yansıyor. three.js r140'ta CapsuleGeometry olmadığından
 * uzuvlar için CylinderGeometry kullanılıyor.
 */
function buildUnitMesh(role, element, rarity) {
  const pal = ELEMENT_PALETTE[element] || ELEMENT_PALETTE.fire;
  const outfitColor = new THREE.Color(pal.base);
  const outfitMat = new THREE.MeshStandardMaterial({
    color: outfitColor, emissive: outfitColor.clone().multiplyScalar(0.2), metalness: 0.25, roughness: 0.55,
  });

  const group = new THREE.Group();
  const isRobed = role === "mage" || role === "healer";

  const legL = new THREE.Mesh(HUMANOID_GEO.leg, outfitMat); legL.position.set(-0.1, 0.23, 0);
  const legR = new THREE.Mesh(HUMANOID_GEO.leg, outfitMat); legR.position.set(0.1, 0.23, 0);
  group.add(legL, legR);

  let torso, torsoTopY;
  if (isRobed) {
    torso = new THREE.Mesh(HUMANOID_GEO.robe, outfitMat);
    torso.position.y = 0.46 + 0.21;
    torsoTopY = 0.46 + 0.42;
  } else {
    const torsoGeo = role === "tank" ? HUMANOID_GEO.torsoTank : role === "assassin" ? HUMANOID_GEO.torsoAssassin : HUMANOID_GEO.torsoFighter;
    torso = new THREE.Mesh(torsoGeo, outfitMat);
    torso.position.y = 0.46 + torsoGeo.parameters.height / 2;
    torsoTopY = 0.46 + torsoGeo.parameters.height;
  }
  group.add(torso);

  const shoulderY = 0.46 + (torsoTopY - 0.46) * 0.82;
  const armGeo = role === "tank" ? HUMANOID_GEO.armThick : HUMANOID_GEO.armThin;
  const armL = new THREE.Mesh(armGeo, outfitMat); armL.position.set(-0.23, shoulderY - 0.19, 0); armL.rotation.z = 0.12;
  const armR = new THREE.Mesh(armGeo, outfitMat); armR.position.set(0.23, shoulderY - 0.19, 0); armR.rotation.z = -0.12;
  group.add(armL, armR);
  const handL = new THREE.Mesh(HUMANOID_GEO.hand, SKIN_MAT); handL.position.set(-0.25, shoulderY - 0.38, 0);
  const handR = new THREE.Mesh(HUMANOID_GEO.hand, SKIN_MAT); handR.position.set(0.25, shoulderY - 0.38, 0);
  group.add(handL, handR);

  const head = new THREE.Mesh(HUMANOID_GEO.head, SKIN_MAT);
  head.position.y = torsoTopY + 0.16;
  group.add(head);

  // role'e özgü silah/aksesuar
  if (role === "tank") {
    const shield = new THREE.Mesh(HUMANOID_GEO.shield, METAL_MAT);
    shield.position.set(-0.3, shoulderY - 0.25, 0.08);
    const sword = new THREE.Mesh(HUMANOID_GEO.sword, METAL_MAT);
    sword.position.set(0.28, shoulderY - 0.3, 0.05); sword.rotation.z = -0.25;
    group.add(shield, sword);
  } else if (role === "fighter") {
    const sword = new THREE.Mesh(HUMANOID_GEO.sword, METAL_MAT);
    sword.position.set(0.3, shoulderY - 0.25, 0.1); sword.rotation.z = -0.5; sword.rotation.x = -0.2;
    group.add(sword);
    group.userData.weapon = sword;
  } else if (role === "assassin") {
    const d1 = new THREE.Mesh(HUMANOID_GEO.swordSmall, METAL_MAT);
    d1.position.set(0.27, shoulderY - 0.32, 0.08); d1.rotation.z = -0.4;
    const d2 = new THREE.Mesh(HUMANOID_GEO.swordSmall, METAL_MAT);
    d2.position.set(-0.27, shoulderY - 0.32, 0.08); d2.rotation.z = 0.4;
    group.add(d1, d2);
    group.userData.weapon = d1;
  } else if (isRobed) {
    const staff = new THREE.Mesh(HUMANOID_GEO.staff, METAL_MAT);
    staff.position.set(0.3, shoulderY - 0.02, 0.05); staff.rotation.z = -0.1;
    const orbMat = new THREE.MeshStandardMaterial({ color: outfitColor, emissive: outfitColor, emissiveIntensity: 1.1, roughness: 0.2 });
    const orb = new THREE.Mesh(HUMANOID_GEO.orb, orbMat);
    orb.position.set(0.34, shoulderY + 0.34, 0.05);
    group.add(staff, orb);
    group.userData.orb = orb;
    if (role === "healer") {
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, emissive: outfitColor, emissiveIntensity: 0.3 });
      const wingL = new THREE.Mesh(HUMANOID_GEO.wing, wingMat); wingL.position.set(-0.18, torsoTopY - 0.12, -0.14); wingL.rotation.y = 0.5; wingL.rotation.z = 0.3;
      const wingR = new THREE.Mesh(HUMANOID_GEO.wing, wingMat); wingR.position.set(0.18, torsoTopY - 0.12, -0.14); wingR.rotation.y = -0.5; wingR.rotation.z = -0.3;
      group.add(wingL, wingR);
    }
  }

  if (role === "mage") {
    const satMat = new THREE.MeshStandardMaterial({ color: outfitColor, emissive: outfitColor.clone().multiplyScalar(0.5), metalness: 0.3, roughness: 0.3 });
    group.userData.satellites = [];
    for (let i = 0; i < 3; i++) {
      const sat = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), satMat);
      sat.castShadow = true;
      sat.userData.orbit = i / 3;
      group.add(sat);
      group.userData.satellites.push(sat);
    }
  }

  // nadirlik aurası (epik/efsanevi): ayaklardaki dönen büyü çemberi
  if (rarity === "epic" || rarity === "legendary") {
    const auraColor = rarity === "legendary" ? 0xffd24d : 0xc77bff;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.018, 6, 28), new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.6 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);
    group.userData.auraRing = ring;
  }

  [legL, legR, torso, armL, armR, handL, handR, head].forEach(m => { m.castShadow = true; m.receiveShadow = true; });

  torso.userData.baseColor = outfitColor;
  group.userData.mainMesh = torso;
  group.userData.baseColor = outfitColor;
  group.userData.headTopY = head.position.y + 0.14;
  return group;
}

function makeBillboardBar(width) {
  width = width || 0.85;
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.11), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.11), new THREE.MeshBasicMaterial({ color: 0x4dd68a, depthTest: false }));
  fill.position.z = 0.001;
  g.add(bg, fill);
  g.userData.fill = fill;
  g.userData.width = width;
  g.renderOrder = 10;
  return g;
}

/* ==========================================================================
   Başlat / bitir
   ========================================================================== */
function startBattle(stageIdx) {
  currentStageIdx = stageIdx;
  battleClock = 0;
  playerShieldUntil = 0; enemyShieldUntil = 0;
  battleSpeed = 1;
  camShake = 0;

  const teamIds = state.team.filter(Boolean);
  if (!teamIds.length) { toast("Önce Takım ekranından kahraman seç!"); switchScreen("team"); return; }

  switchScreen("battle");
  initBattleSceneIfNeeded();
  if (!battleInited) return;
  clearUnits();
  resizeBattleRenderer();

  playerUnits = teamIds.map((id, i) => makeUnit("player", i, teamIds.length, {
    heroId: id, def: charDef(id), stats: heroStats(id),
  }));
  const enemySquad = generateStageEnemies(stageIdx);
  enemyUnits = enemySquad.map((e, i) => makeUnit("enemy", i, enemySquad.length, { enemyData: e }));

  updateBattleHud();
  battleActive = true;
  if (battleRAF) cancelAnimationFrame(battleRAF);
  let lastTs = performance.now();
  function loop(ts) {
    if (!battleActive) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000) * battleSpeed;
    lastTs = ts;
    updateBattle(dt);
    renderBattleFrame(dt);
    battleRAF = requestAnimationFrame(loop);
  }
  battleRAF = requestAnimationFrame(loop);
  document.getElementById("battleExitBtn").onclick = () => confirmExitBattle();
  document.getElementById("battleSpeedBtn").onclick = () => toggleBattleSpeed();
  updateSpeedBtn();
}

function makeUnit(side, slot, total, src) {
  const isPlayer = side === "player";
  const role = isPlayer ? src.def.role : src.enemyData.role;
  const element = isPlayer ? src.def.element : src.enemyData.element;
  const rarity = isPlayer ? src.def.rarity : (src.enemyData.isBoss ? "legendary" : "common");
  const name = isPlayer ? src.def.name : src.enemyData.name;
  const hp = isPlayer ? src.stats.hp : src.enemyData.hp;
  const atk = isPlayer ? src.stats.atk : src.enemyData.atk;
  const spd = isPlayer ? src.stats.spd : src.enemyData.spd;
  const isBoss = !isPlayer && !!src.enemyData.isBoss;

  // Portre yönü: taraflar derinlikte (Z) ayrılıyor, dar dikey mobil ekranda
  // kameranın yatay (X) görüş açısı çok kısıtlı olduğundan yan yana (X)
  // ayırmak birimleri kadraj dışına düşürüyordu — bkz. commit notu. 4-5
  // kişilik takımların kadraj dışına taşmaması için aralık takım
  // büyüklüğüne göre daralıyor.
  const slotGap = total <= 3 ? 1.25 : total === 4 ? 1.0 : 0.86;
  const baseX = (slot - (total - 1) / 2) * slotGap;
  const baseZ = isPlayer ? 2.5 : -2.5;
  const scale = isBoss ? 1.4 : 1;

  // Karakterin "önü" -Z eksenine bakacak şekilde modellendi (silahlar +X
  // elinde) — oyuncu tarafı rakibe (-Z) dönük, düşman tarafı oyuncuya (+Z)
  // dönük olacak şekilde 180° çevriliyor, iki taraf birbirine bakıyor.
  const baseRotY = isPlayer ? 0 : Math.PI;
  const obj3d = buildUnitMesh(role, element, rarity);
  obj3d.position.set(baseX, 0, baseZ);
  obj3d.rotation.y = baseRotY;
  obj3d.scale.setScalar(scale);
  obj3d.userData.spawnAt = battleClock;
  battleScene.add(obj3d);

  const hpBar = makeBillboardBar(Math.min(0.85, slotGap * 0.9));
  hpBar.position.set(baseX, 1.32 * scale, baseZ);
  battleScene.add(hpBar);

  const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeTextTexture(name, "#ffffff", 40), transparent: true, depthTest: false }));
  nameSprite.scale.set(0.72, 0.18, 1);
  nameSprite.position.set(baseX, 1.5 * scale, baseZ);
  nameSprite.renderOrder = 10;
  battleScene.add(nameSprite);

  return {
    uid: unitUidCounter++, side, slot, heroId: src.heroId, isBoss,
    name, role, element, rarity,
    hp, maxHp: hp, atk, spd, scale, baseRotY,
    baseX, baseZ, y: 0,
    atkTimer: 0.35 + slot * 0.15, ultGauge: 0, flashUntil: 0, alive: true,
    obj3d, hpBar, nameSprite, lungeT: 0, lungeTarget: null,
  };
}

function clearUnits() {
  [...playerUnits, ...enemyUnits].forEach(disposeUnit);
  playerUnits = []; enemyUnits = [];
  transientObjs.forEach(t => removeTransient(t));
  transientObjs = [];
  if (shieldDomeP) { battleScene.remove(shieldDomeP); shieldDomeP = null; }
  if (shieldDomeE) { battleScene.remove(shieldDomeE); shieldDomeE = null; }
}
function disposeUnit(u) {
  battleScene.remove(u.obj3d, u.hpBar, u.nameSprite);
  u.nameSprite.material.map.dispose(); u.nameSprite.material.dispose();
}

function toggleBattleSpeed() { battleSpeed = battleSpeed === 1 ? 2 : 1; updateSpeedBtn(); }
function updateSpeedBtn() { document.getElementById("battleSpeedBtn").textContent = battleSpeed === 1 ? "1x" : "2x"; }

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

/* ==========================================================================
   Simülasyon (2D sürümle aynı mantık) — hedefleme, hasar, ult tetikleme.
   ========================================================================== */
function updateBattle(dt) {
  battleClock += dt;
  if (playerShieldUntil && playerShieldUntil < battleClock) playerShieldUntil = 0;
  if (enemyShieldUntil && enemyShieldUntil < battleClock) enemyShieldUntil = 0;

  processTeamTurns(playerUnits, enemyUnits, "player");
  processTeamTurns(enemyUnits, playerUnits, "enemy");

  const playerAlive = playerUnits.some(u => u.alive);
  const enemyAlive = enemyUnits.some(u => u.alive);
  if (!enemyAlive) { endBattle(true); return; }
  if (!playerAlive) { endBattle(false); return; }
  if (battleClock >= BATTLE_TIME_LIMIT) { endBattle(false); return; }

  updateBattleHud();

  function processTeamTurns(allies, enemies, side) {
    allies.forEach(u => {
      if (!u.alive) return;
      u.atkTimer -= dt;
      if (u.flashUntil && u.flashUntil < battleClock) u.flashUntil = 0;
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
  triggerLunge(attacker);
  spawnAttackFx(attacker, target, mult > 1);
}

function executeUlt(attacker, allies, enemies, side) {
  attacker.flashUntil = battleClock + 0.4;
  triggerShake(6);
  spawnFloatingText(attacker, `${attacker.name}: ULT!`, "#ffd24d", true, 0.5);
  switch (attacker.role) {
    case "tank": {
      if (side === "player") { playerShieldUntil = battleClock + 3; playerShieldMult = 0.55; spawnShieldDome("player"); }
      else { enemyShieldUntil = battleClock + 3; enemyShieldMult = 0.55; spawnShieldDome("enemy"); }
      allies.forEach(a => a.alive && spawnParticleBurst(unitWorldPos(a), 0x66e0ff, 10));
      break;
    }
    case "fighter": {
      const target = enemies.find(e => e.alive);
      if (target) {
        const mult = elementMultiplier(attacker.element, target.element) * 2.2;
        applyDamage(target, Math.round(attacker.atk * mult), true);
        triggerLunge(attacker, true);
        spawnAttackFx(attacker, target, true);
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
        triggerLunge(attacker, true);
        spawnAttackFx(attacker, lowest, true);
      }
      break;
    }
    case "mage": {
      enemies.forEach(e => {
        if (!e.alive) return;
        const mult = elementMultiplier(attacker.element, e.element);
        applyDamage(e, Math.round(attacker.atk * mult * 0.85), true);
        spawnParticleBurst(unitWorldPos(e), 0xff8a3d, 12);
      });
      break;
    }
    case "healer": {
      let lowest = null;
      allies.forEach(a => { if (a.alive && (!lowest || a.hp / a.maxHp < lowest.hp / lowest.maxHp)) lowest = a; });
      if (lowest) {
        const healAmt = Math.round(attacker.atk * 3.2);
        lowest.hp = Math.min(lowest.maxHp, lowest.hp + healAmt);
        spawnFloatingText(lowest, "+" + healAmt, "#4dd68a", false, 0.2);
        spawnParticleBurst(unitWorldPos(lowest), 0x4dd68a, 14);
      }
      break;
    }
  }
}

function applyDamage(unit, dmg, big) {
  unit.hp -= dmg;
  unit.flashUntil = battleClock + 0.15;
  spawnFloatingText(unit, Math.round(dmg), big ? "#ffd24d" : "#ffffff", big, 0);
  if (unit.hp <= 0 && unit.alive) {
    unit.alive = false;
    unit.hp = 0;
    spawnParticleBurst(unitWorldPos(unit), 0xff4d6a, 18);
    unit.obj3d.userData.deathAt = battleClock;
  }
}

function updateBattleHud() {
  document.getElementById("battleStageLabel").textContent = `${currentStageIdx + 1}. Bölge`;
  document.getElementById("battleTimerLabel").textContent = `${Math.max(0, Math.ceil(BATTLE_TIME_LIMIT - battleClock))}s`;
}

/* ==========================================================================
   Görsel efektler — vuruş sekmesi, mermi, parçacıklar, uçan metin, aura.
   ========================================================================== */
function unitWorldPos(u) {
  return new THREE.Vector3(u.obj3d.position.x, u.obj3d.position.y + 0.78 * u.scale, u.obj3d.position.z);
}

function triggerLunge(u, big) {
  u.lungeT = big ? 1.4 : 1;
}

function spawnAttackFx(attacker, target, big) {
  const isMelee = attacker.role === "assassin" || attacker.role === "fighter" || attacker.role === "tank";
  if (isMelee) {
    spawnParticleBurst(unitWorldPos(target), big ? 0xffd24d : 0xffffff, big ? 10 : 5);
    return;
  }
  // menzilli (büyücü/şifacı) — hedefe uçan bir mermi
  const from = unitWorldPos(attacker), to = unitWorldPos(target);
  const geo = new THREE.SphereGeometry(big ? 0.09 : 0.06, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: big ? 0xffd24d : 0x66e0ff });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from);
  battleScene.add(mesh);
  const t = { obj: mesh, kind: "bolt", life: 0.18, age: 0, from, to, onArrive: () => spawnParticleBurst(to, big ? 0xffd24d : 0x66e0ff, big ? 10 : 6) };
  transientObjs.push(t);
}

function spawnParticleBurst(pos, colorHex, count) {
  const tex = getDotTexture();
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: colorHex, transparent: true, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    const s = 0.08 + Math.random() * 0.08;
    spr.scale.set(s, s, 1);
    spr.position.copy(pos);
    battleScene.add(spr);
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;
    transientObjs.push({
      obj: spr, kind: "sprite", life: 0.5 + Math.random() * 0.3, age: 0,
      vx: Math.cos(angle) * speed, vy: 1.5 + Math.random() * 1.5, vz: Math.sin(angle) * speed,
    });
  }
}

function spawnFloatingText(unit, text, color, big, delay) {
  const tex = makeTextTexture(text, color, big ? 96 : 72);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  const s = big ? 1.3 : 0.9;
  spr.scale.set(s, s * 0.5, 1);
  const pos = unitWorldPos(unit); pos.y += 0.6 * unit.scale;
  spr.position.copy(pos);
  spr.renderOrder = 20;
  spr.visible = !delay;
  battleScene.add(spr);
  transientObjs.push({ obj: spr, kind: "text", life: big ? 1.1 : 0.85, age: -(delay || 0), vy: 0.9 });
}

function spawnShieldDome(side) {
  const isPlayer = side === "player";
  const z = isPlayer ? 2.5 : -2.5;
  const geo = new THREE.SphereGeometry(2.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.7);
  const mat = new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.14, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const dome = new THREE.Mesh(geo, mat);
  dome.position.set(0, 0, z);
  battleScene.add(dome);
  if (isPlayer) { if (shieldDomeP) battleScene.remove(shieldDomeP); shieldDomeP = dome; }
  else { if (shieldDomeE) battleScene.remove(shieldDomeE); shieldDomeE = dome; }
}

function removeTransient(t) {
  battleScene.remove(t.obj);
  if (t.obj.material) {
    if (t.obj.material.map) t.obj.material.map.dispose();
    t.obj.material.dispose();
  }
  if (t.obj.geometry) t.obj.geometry.dispose();
}

function triggerShake(mag) {
  if (!state.settings.shake) return;
  camShake = mag;
}

/* ==========================================================================
   Kare döngüsü — animasyon, billboard, temizlik, render.
   ========================================================================== */
function renderBattleFrame(dt) {
  if (!battleRenderer) return;

  [...playerUnits, ...enemyUnits].forEach(u => updateUnitVisual(u, dt));
  updateTransients(dt);
  updateFireflies(dt);
  updateGodrays();
  updateShieldDomes(dt);

  if (camShake > 0.001) {
    battleCamera.position.x = (Math.random() - 0.5) * camShake * 0.06;
    battleCamera.position.y = 6.1 + (Math.random() - 0.5) * camShake * 0.06;
    camShake *= 0.85;
  } else {
    battleCamera.position.x = 0; battleCamera.position.y = 6.1;
  }
  battleCamera.lookAt(0, 0.5, -1.0);

  battleRenderer.render(battleScene, battleCamera);
}

function updateUnitVisual(u, dt) {
  // ölüm animasyonu: batıp küçülür
  if (!u.alive) {
    const t = Math.min(1, (battleClock - (u.obj3d.userData.deathAt || battleClock)) / 0.6);
    u.obj3d.scale.setScalar(Math.max(0.001, u.scale * (1 - t)));
    u.obj3d.position.y = -t * 0.4;
    u.hpBar.visible = false; u.nameSprite.visible = false;
    return;
  }

  // doğuş sekmesi
  let spawnScale = 1;
  const spawnT = Math.min(1, (battleClock - u.obj3d.userData.spawnAt) / 0.5);
  if (spawnT < 1) spawnScale = elasticOutBattle(spawnT);

  // hafif nefes/bob + saldırı sekmesi (lunge)
  const bob = Math.sin(battleClock * 2 + u.slot) * 0.04;
  let lungeOffset = 0;
  if (u.lungeT > 0) {
    u.lungeT -= dt * 5;
    const t = Math.max(0, u.lungeT);
    lungeOffset = Math.sin(Math.min(1, 1 - (t % 1)) * Math.PI) * (t > 1 ? 0.55 : 0.35);
  }
  const dirZ = u.side === "player" ? -1 : 1; // rakip tarafa doğru sekme
  u.obj3d.position.x = u.baseX;
  u.obj3d.position.z = u.baseZ + dirZ * lungeOffset;
  u.obj3d.position.y = bob;
  u.obj3d.scale.setScalar(u.scale * spawnScale);
  // sürekli dönüş yerine hafif ağırlık aktarma sallanışı — insansı bir
  // figürün durmadan fırıl fırıl dönmesi garip dururdu
  u.obj3d.rotation.y = u.baseRotY + Math.sin(battleClock * 1.1 + u.slot) * 0.07;

  // ult gauge -> emissive parlaklık; hasar flaşı -> beyaz parlama
  const mesh = u.obj3d.userData.mainMesh;
  const flashing = u.flashUntil && u.flashUntil > battleClock;
  const chargeGlow = 0.25 + (u.ultGauge / 100) * 0.9;
  mesh.material.emissive.copy(flashing ? new THREE.Color(0xffffff) : mesh.userData.baseColor).multiplyScalar(flashing ? 0.9 : chargeGlow * 0.4 + 0.15);

  if (u.obj3d.userData.satellites) {
    u.obj3d.userData.satellites.forEach((sat, i) => {
      const ang = battleClock * 1.4 + sat.userData.orbit * Math.PI * 2;
      sat.position.set(Math.cos(ang) * 0.45, 0.8 + Math.sin(ang * 1.3) * 0.1, Math.sin(ang) * 0.45);
    });
  }
  if (u.obj3d.userData.auraRing) u.obj3d.userData.auraRing.rotation.z += dt * 1.2;
  if (u.obj3d.userData.weapon) {
    const swing = Math.max(0, u.lungeT) * 0.9;
    u.obj3d.userData.weapon.rotation.x = -0.2 - swing;
  }

  // hp barı + isim: kameraya bakacak şekilde billboard, konumu ünitenin üstü
  const worldY = 1.05 * u.scale + u.obj3d.position.y;
  u.hpBar.position.set(u.obj3d.position.x, worldY, u.obj3d.position.z);
  u.hpBar.quaternion.copy(battleCamera.quaternion);
  const ratio = Math.max(0, u.hp / u.maxHp);
  u.hpBar.userData.fill.scale.x = ratio;
  u.hpBar.userData.fill.position.x = -(1 - ratio) * (u.hpBar.userData.width / 2);
  u.hpBar.userData.fill.material.color.setHex(u.side === "player" ? 0x4dd68a : 0xff4d6a);

  u.nameSprite.position.set(u.obj3d.position.x, 1.28 * u.scale + u.obj3d.position.y, u.obj3d.position.z);
}

function updateTransients(dt) {
  for (let i = transientObjs.length - 1; i >= 0; i--) {
    const t = transientObjs[i];
    t.age += dt;
    if (t.age < 0) continue; // gecikmeli (delay) efektler henüz başlamadı
    if (t.kind === "text" && !t.obj.visible) t.obj.visible = true;
    if (t.age >= t.life) {
      if (t.kind === "bolt" && t.onArrive) t.onArrive();
      removeTransient(t);
      transientObjs.splice(i, 1);
      continue;
    }
    if (t.kind === "sprite") {
      t.obj.position.x += t.vx * dt; t.obj.position.y += t.vy * dt; t.obj.position.z += t.vz * dt;
      t.vy -= 3 * dt;
      t.obj.material.opacity = 1 - t.age / t.life;
    } else if (t.kind === "bolt") {
      const p = t.age / t.life;
      t.obj.position.lerpVectors(t.from, t.to, p);
    } else if (t.kind === "text") {
      t.obj.position.y += t.vy * dt;
      t.obj.material.opacity = 1 - t.age / t.life;
      t.obj.quaternion.copy(battleCamera.quaternion);
    }
  }
}

function updateFireflies(dt) {
  fireflies.forEach(f => {
    f.position.y += Math.sin(battleClock * f.userData.speed + f.userData.phase) * dt * 0.15;
    f.position.x += Math.cos(battleClock * 0.3 + f.userData.phase) * dt * 0.05;
    f.material.opacity = 0.4 + Math.sin(battleClock * 3 + f.userData.phase) * 0.4;
  });
}

function updateGodrays() {
  if (!battleScene.userData.godrays) return;
  battleScene.userData.godrays.forEach((g, i) => {
    g.material.opacity = g.userData.baseOpacity + Math.sin(battleClock * 0.5 + g.userData.phase) * 0.015;
  });
}

function updateShieldDomes(dt) {
  if (shieldDomeP) {
    shieldDomeP.visible = playerShieldUntil > battleClock;
    shieldDomeP.rotation.y += dt * 0.3;
  }
  if (shieldDomeE) {
    shieldDomeE.visible = enemyShieldUntil > battleClock;
    shieldDomeE.rotation.y += dt * 0.3;
  }
}

function elasticOutBattle(t) {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}
