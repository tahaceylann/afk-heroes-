/* ==========================================================================
   Efsane Çağrısı — Ana veri, durum (state), kayıt ve meta arayüz (ana ekran,
   kadro, takım kurma, çağırma/gacha, bölge haritası, mağaza, ayarlar).
   Savaş motoru ve canvas render döngüsü battle.js'te; bu dosya ile aynı
   global kapsamı paylaşır.

   ÖNEMLİ — İLERLEME SÖZLEŞMESİ:
   SAVE_KEY ve CHARACTER_DEFS/ENEMY_DEFS içindeki mevcut id'ler kalıcıdır,
   ileride SAKIN değiştirilmez. Yeni kahraman/düşman/bölge eklemek için
   dizilere yeni satır eklemek yeterli. freshState() varsayılanları verir,
   loadState() eski bir kayıtta bulunmayan alanları güvenli varsayılanla
   doldurur — hiçbir güncelleme oyuncunun altın/kahraman/bölge ilerlemesini
   silmez.

   TİCARİ NOT (mağaza / IAP):
   Mağazadaki elmas paketleri şu an "demo" modda — gerçek ödeme alınmıyor,
   satın al'a basınca elmaslar doğrudan hesaba ekleniyor ve bu arayüzde
   açıkça belirtiliyor. Gerçek para tahsilatı için bir ödeme sağlayıcısı
   (Stripe/RevenueCat vb.) + sunucu taraflı doğrulama entegre edilmesi
   gerekir — bu, kullanıcının kendi hesabı/anahtarlarıyla ayrıca kurulmalı.
   ========================================================================== */
"use strict";

/* ============================== KAHRAMAN TANIMLARI ============================== */
// role: "tank" | "fighter" | "assassin" | "mage" | "healer"
// element: "fire" | "water" | "nature" (üçgen avantaj: fire>nature>water>fire)
const CHARACTER_DEFS = [
  { id: "squire",      name: "Çırak Kalkanlı",     icon: "🛡️", rarity: "common",    role: "tank",     element: "water",  hp: 140, atk: 9,  spd: 0.8,  ult: "Kalkan Duvarı",   ultDesc: "Takımın aldığı hasarı kısa süreliğine azaltır." },
  { id: "militia",     name: "Milis Eri",          icon: "⚔️", rarity: "common",    role: "fighter",  element: "fire",   hp: 95,  atk: 14, spd: 0.9,  ult: "Vahşi Darbe",     ultDesc: "Hedefe ağır bir vuruş." },
  { id: "scout",       name: "Orman Gözcüsü",      icon: "🏹", rarity: "rare",      role: "assassin", element: "nature", hp: 70,  atk: 19, spd: 1.1,  ult: "Çifte Atış",      ultDesc: "En zayıf düşmana iki kez vurur." },
  { id: "apprentice",  name: "Çırak Büyücü",       icon: "🔮", rarity: "rare",      role: "mage",     element: "fire",   hp: 65,  atk: 22, spd: 0.75, ult: "Alev Patlaması",  ultDesc: "Tüm düşmanlara alan hasarı." },
  { id: "herbalist",   name: "Şifa Ustası",        icon: "🌿", rarity: "rare",      role: "healer",   element: "nature", hp: 80,  atk: 8,  spd: 0.85, ult: "Doğanın Nefesi",  ultDesc: "En az canlı müttefiki iyileştirir." },
  { id: "knight",      name: "Kraliyet Şövalyesi", icon: "⚜️", rarity: "epic",      role: "tank",     element: "water",  hp: 200, atk: 15, spd: 0.75, ult: "Kalkan Duvarı",   ultDesc: "Takımın aldığı hasarı kısa süreliğine azaltır." },
  { id: "berserker",   name: "Kuzey Berserkeri",   icon: "🪓", rarity: "epic",      role: "fighter",  element: "fire",   hp: 130, atk: 26, spd: 1.0,  ult: "Vahşi Darbe",     ultDesc: "Hedefe ağır bir vuruş." },
  { id: "shadowblade", name: "Gölge Bıçağı",       icon: "🗡️", rarity: "epic",      role: "assassin", element: "nature", hp: 85,  atk: 30, spd: 1.25, ult: "Çifte Atış",      ultDesc: "En zayıf düşmana iki kez vurur." },
  { id: "pyromancer",  name: "Alev Çağırıcı",      icon: "🔥", rarity: "epic",      role: "mage",     element: "fire",   hp: 75,  atk: 34, spd: 0.7,  ult: "Alev Patlaması",  ultDesc: "Tüm düşmanlara alan hasarı." },
  { id: "dragonqueen", name: "Ejder Kraliçesi",    icon: "🐉", rarity: "legendary", role: "fighter",  element: "fire",   hp: 240, atk: 42, spd: 0.95, ult: "Ejder Nefesi",    ultDesc: "Tüm düşmanlara ağır alan hasarı." },
  { id: "frostwarden", name: "Buz Muhafızı",       icon: "❄️", rarity: "legendary", role: "tank",     element: "water",  hp: 320, atk: 20, spd: 0.7,  ult: "Buzul Kalkanı",   ultDesc: "Takımın aldığı hasarı büyük oranda azaltır." },
  { id: "lifebloom",   name: "Yaşam Çiçeği",       icon: "🌸", rarity: "legendary", role: "healer",   element: "nature", hp: 150, atk: 12, spd: 0.9,  ult: "Yaşam Patlaması", ultDesc: "Tüm takımı büyük oranda iyileştirir." },
];

const RARITY_ORDER = ["common", "rare", "epic", "legendary"];
const RARITY_LABEL = { common: "Sıradan", rare: "Nadir", epic: "Epik", legendary: "Efsanevi" };
const RARITY_WEIGHT = { common: 42, rare: 33, epic: 19, legendary: 6 };
const ROLE_LABEL = { tank: "Tank", fighter: "Savaşçı", assassin: "Suikastçı", mage: "Büyücü", healer: "Şifacı" };
const ELEMENT_LABEL = { fire: "🔥 Ateş", water: "💧 Su", nature: "🌿 Doğa" };
// Element üçgeni: saldıran > savunan ise hasar artışı.
const ELEMENT_BEATS = { fire: "nature", nature: "water", water: "fire" };

function charDef(id) { return CHARACTER_DEFS.find(c => c.id === id); }

const STAR_MULT = [1, 1.25, 1.6, 2.1, 2.8, 3.8]; // yıldız 1..6 (dizindeki 0 = yıldız 1)
const MAX_STAR = STAR_MULT.length;
const STAR_UP_SHARDS = [0, 3, 6, 12, 24, 40]; // yıldız N'ye çıkmak için gereken parça (index N-1)

const MAX_LEVEL = 30;
function levelMultiplier(level) { return Math.pow(1.06, level - 1); }
function levelUpGoldCost(level) { return Math.round(25 * Math.pow(1.18, level - 1)); }

function heroPower(id) {
  const def = charDef(id);
  const st = heroStats(id);
  return Math.round(st.hp * 0.35 + st.atk * 6.5);
}

function heroStats(id) {
  const def = charDef(id);
  const star = heroStar(id);
  const level = heroLevel(id);
  const mult = STAR_MULT[star - 1] * levelMultiplier(level);
  return { hp: Math.round(def.hp * mult), atk: Math.round(def.atk * mult), spd: def.spd };
}

function heroStar(id) { return state.heroStars[id] || 1; }
function heroLevel(id) { return state.heroLevels[id] || 1; }
function heroShards(id) { return state.heroShards[id] || 0; }
function ownsHero(id) { return state.roster.includes(id); }

/* ============================== DÜŞMAN TANIMLARI ============================== */
const ENEMY_DEFS = [
  { id: "goblin",  name: "Gulyabani Eri", icon: "👺", role: "fighter", element: "fire",   hpMult: 0.7, atkMult: 0.8 },
  { id: "wolf",    name: "Kara Kurt",     icon: "🐺", role: "assassin",element: "nature", hpMult: 0.55,atkMult: 1.0 },
  { id: "golem",   name: "Taş Golem",     icon: "🗿", role: "tank",    element: "water",  hpMult: 1.6, atkMult: 0.6 },
  { id: "witch",   name: "Bataklık Cadısı",icon:"🧙", role: "mage",    element: "nature", hpMult: 0.6, atkMult: 1.15 },
  { id: "wraith",  name: "Gölge Hayaleti",icon: "👻", role: "assassin",element: "water",  hpMult: 0.65,atkMult: 1.05 },
  { id: "ogre",    name: "Dağ Ogri",      icon: "👹", role: "fighter", element: "fire",   hpMult: 1.3, atkMult: 1.1 },
];
const BOSS_DEFS = [
  { id: "boss_drake",   name: "Genç Ejder",      icon: "🐲", role: "fighter", element: "fire" },
  { id: "boss_lich",    name: "Kemik Büyücüsü",  icon: "☠️", role: "mage",    element: "nature" },
  { id: "boss_titan",   name: "Kadim Titan",     icon: "🗿", role: "tank",    element: "water" },
];

const TOTAL_STAGES = 20;
const STAGE_CHAPTER_NAMES = [
  "Terkedilmiş Köy", "Karanlık Orman", "Unutulmuş Mağaralar", "Buzul Geçidi",
  "Ejder Zirvesi",
];
function stageName(idx) {
  const chapter = STAGE_CHAPTER_NAMES[Math.floor(idx / 4)] || `Bölge ${idx + 1}`;
  return `${chapter} ${(idx % 4) + 1}`;
}

// Bölge zorluk eğrisi + düşman kadrosu üretimi — 20 bölgeyi elle dengelemek
// yerine formülle üretiliyor; yeni bölge eklemek TOTAL_STAGES'i artırmaktan
// ibaret, eski bölgelerin dengesi değişmez.
function generateStageEnemies(stageIdx) {
  const isBossStage = (stageIdx + 1) % 4 === 0;
  const power = 1 + stageIdx * 0.28;
  const count = isBossStage ? 3 : 3 + Math.min(2, Math.floor(stageIdx / 5));
  const squad = [];
  for (let i = 0; i < count; i++) {
    const def = ENEMY_DEFS[Math.floor(Math.random() * ENEMY_DEFS.length)];
    squad.push({
      name: def.name, icon: def.icon, role: def.role, element: def.element,
      hp: Math.round(90 * def.hpMult * power * (0.9 + Math.random() * 0.2)),
      atk: Math.round(11 * def.atkMult * power * (0.9 + Math.random() * 0.2)),
      spd: 0.8 + Math.random() * 0.3,
    });
  }
  if (isBossStage) {
    const boss = BOSS_DEFS[Math.floor((stageIdx / 4)) % BOSS_DEFS.length];
    squad.unshift({
      name: boss.name, icon: boss.icon, role: boss.role, element: boss.element,
      hp: Math.round(340 * power), atk: Math.round(19 * power), spd: 0.8, isBoss: true,
    });
  }
  return squad.slice(0, 5);
}

/* ============================== KAYIT / DURUM ============================== */
const SAVE_KEY = "afkHeroesSave_v1";
const TEAM_SIZE = 5;
const STARTER_HEROES = ["squire", "militia", "apprentice"];

function freshState() {
  return {
    gold: 400,
    gems: 320,
    tickets: 6,
    roster: STARTER_HEROES.slice(),
    heroStars: Object.fromEntries(STARTER_HEROES.map(id => [id, 1])),
    heroLevels: Object.fromEntries(STARTER_HEROES.map(id => [id, 1])),
    heroShards: {},
    team: STARTER_HEROES.slice(),
    stageIndex: 0,
    stageStars: {},
    pity: { standard: { sinceEpic: 0 }, premium: { sinceEpic: 0, sinceLegendary: 0 } },
    afkLastClaim: Date.now(),
    settings: { sound: true, shake: true },
  };
}

let state = freshState();

function loadState() {
  const fresh = freshState();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const loaded = JSON.parse(raw);
      state = Object.assign(fresh, loaded);
      state.heroStars = Object.assign({}, fresh.heroStars, loaded.heroStars);
      state.heroLevels = Object.assign({}, fresh.heroLevels, loaded.heroLevels);
      state.heroShards = Object.assign({}, fresh.heroShards, loaded.heroShards);
      state.stageStars = Object.assign({}, fresh.stageStars, loaded.stageStars);
      state.settings = Object.assign({}, fresh.settings, loaded.settings);
      state.pity = Object.assign({}, fresh.pity, loaded.pity);
      state.pity.standard = Object.assign({}, fresh.pity.standard, loaded.pity && loaded.pity.standard);
      state.pity.premium = Object.assign({}, fresh.pity.premium, loaded.pity && loaded.pity.premium);
      state.roster = Array.isArray(loaded.roster) && loaded.roster.length ? loaded.roster : fresh.roster;
      state.team = Array.isArray(loaded.team) && loaded.team.length ? loaded.team : fresh.team;
    } else {
      state = fresh;
    }
  } catch (e) {
    state = fresh;
  }
}

function saveState() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* yok say */ }
}
setInterval(saveState, 5000);
window.addEventListener("pagehide", saveState);
window.addEventListener("beforeunload", saveState);

/* ============================== AFK / OFFLINE KAZANÇ ============================== */
const AFK_BASE_CAP_HOURS = 4;
function afkCapHours() { return AFK_BASE_CAP_HOURS + (state.afkBoostLevel || 0) * 1; }
function afkGoldPerSec() {
  const teamPower = state.team.reduce((s, id) => s + (id ? heroPower(id) : 0), 0);
  return 0.6 + teamPower * 0.012 + state.stageIndex * 0.5;
}
function pendingAfkReward() {
  const elapsedSec = (Date.now() - state.afkLastClaim) / 1000;
  const cappedSec = Math.min(elapsedSec, afkCapHours() * 3600);
  return {
    gold: Math.round(cappedSec * afkGoldPerSec()),
    tickets: Math.floor(cappedSec / 1800), // 30 dakikada 1 bilet
    seconds: cappedSec,
    wasCapped: elapsedSec > afkCapHours() * 3600,
  };
}
function claimAfkReward() {
  const r = pendingAfkReward();
  state.gold += r.gold;
  state.tickets += r.tickets;
  state.afkLastClaim = Date.now();
  saveState();
  return r;
}

/* ============================== GACHA / ÇAĞIRMA ============================== */
function pullRarity(pool, pity, guaranteeEpicAt, guaranteeLegendaryAt) {
  pity.sinceEpic = (pity.sinceEpic || 0) + 1;
  if (pity.sinceLegendary !== undefined) pity.sinceLegendary++;

  if (guaranteeLegendaryAt && pity.sinceLegendary >= guaranteeLegendaryAt) {
    pity.sinceLegendary = 0; pity.sinceEpic = 0;
    return "legendary";
  }
  const forceEpicPlus = pity.sinceEpic >= guaranteeEpicAt;
  const totalW = pool.reduce((s, r) => s + RARITY_WEIGHT[r], 0);
  let roll = Math.random() * totalW;
  let picked = pool[pool.length - 1];
  for (const r of pool) {
    if (roll < RARITY_WEIGHT[r]) { picked = r; break; }
    roll -= RARITY_WEIGHT[r];
  }
  if (forceEpicPlus && picked !== "epic" && picked !== "legendary") {
    picked = pool.includes("epic") ? "epic" : pool[pool.length - 1];
  }
  if (picked === "epic" || picked === "legendary") pity.sinceEpic = 0;
  if (picked === "legendary" && pity.sinceLegendary !== undefined) pity.sinceLegendary = 0;
  return picked;
}

function pullOne(banner) {
  const pool = banner === "standard" ? ["common", "rare", "epic"] : RARITY_ORDER;
  const pity = state.pity[banner];
  const rarity = pullRarity(pool, pity, 10, banner === "premium" ? 40 : null);
  const candidates = CHARACTER_DEFS.filter(c => c.rarity === rarity);
  const def = candidates[Math.floor(Math.random() * candidates.length)];
  let isDupe = ownsHero(def.id);
  if (!isDupe) {
    state.roster.push(def.id);
    state.heroStars[def.id] = 1;
    state.heroLevels[def.id] = 1;
  } else {
    state.heroShards[def.id] = (state.heroShards[def.id] || 0) + 2;
  }
  return { def, isDupe };
}

function doSummon(banner, count) {
  const cost = banner === "standard" ? 1 : 150;
  const currencyKey = banner === "standard" ? "tickets" : "gems";
  const totalCost = count === 10 ? Math.round(cost * 9) : cost * count; // 10-çekim indirimi
  if (state[currencyKey] < totalCost) return null;
  state[currencyKey] -= totalCost;
  const results = [];
  for (let i = 0; i < count; i++) results.push(pullOne(banner));
  saveState();
  return results;
}

/* ============================== EKRAN GEÇİŞİ ============================== */
function switchScreen(name) {
  document.querySelectorAll(".screen").forEach(el => { el.hidden = el.dataset.screen !== name; });
  if (name === "home") renderHome();
  if (name === "roster") renderRosterScreen();
  if (name === "team") renderTeamScreen();
  if (name === "summon") renderSummonScreen();
  if (name === "stages") renderStagesScreen();
  if (name === "shop") renderShopScreen();
}

/* ============================== TOAST / MODAL ============================== */
function toast(msg) {
  const area = document.getElementById("toastArea");
  if (!area) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  area.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 2200);
}
function showModal(html) {
  const overlay = document.getElementById("modalOverlay");
  document.getElementById("modalBox").innerHTML = html;
  overlay.classList.remove("hidden");
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}
function closeModal() { document.getElementById("modalOverlay").classList.add("hidden"); }

/* ============================== ANA EKRAN ============================== */
let afkTickTimer = null;
function renderHome() {
  document.getElementById("goldLabel").textContent = Math.floor(state.gold);
  document.getElementById("gemLabel").textContent = Math.floor(state.gems);
  document.getElementById("stageLabel").textContent = state.stageIndex + 1;
  document.getElementById("stageNameLabel").textContent = `${state.stageIndex + 1}. Bölge: ${stageName(state.stageIndex)}`;

  const teamPreview = document.getElementById("teamPreview");
  teamPreview.innerHTML = "";
  for (let i = 0; i < TEAM_SIZE; i++) {
    const id = state.team[i];
    const el = document.createElement("div");
    el.className = "mini-hero" + (id ? "" : " empty");
    if (id) {
      const def = charDef(id);
      el.innerHTML = `<span class="mini-hero-icon">${def.icon}</span><span class="mini-hero-star">★${heroStar(id)}</span>`;
    } else {
      el.innerHTML = `<span class="mini-hero-plus">+</span>`;
    }
    teamPreview.appendChild(el);
  }

  updateAfkPanel();
  if (afkTickTimer) clearInterval(afkTickTimer);
  afkTickTimer = setInterval(updateAfkPanel, 1000);
}

function updateAfkPanel() {
  const panel = document.getElementById("afkGoldLabel");
  if (!panel) return;
  const r = pendingAfkReward();
  document.getElementById("afkGoldLabel").textContent = Math.floor(r.gold);
  document.getElementById("afkTicketLabel").textContent = r.tickets;
  const hrs = Math.min(r.seconds / 3600, afkCapHours());
  document.getElementById("afkCapLabel").textContent = `${hrs.toFixed(1)}/${afkCapHours()} sa`;
}

/* ============================== KADRO (ROSTER) ============================== */
function renderRosterScreen() {
  document.getElementById("goldLabelRoster").textContent = Math.floor(state.gold);
  const grid = document.getElementById("rosterGrid");
  grid.innerHTML = "";
  const sorted = CHARACTER_DEFS.slice().sort((a, b) => {
    const ao = ownsHero(a.id) ? 0 : 1, bo = ownsHero(b.id) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
  });
  sorted.forEach(def => {
    const owned = ownsHero(def.id);
    const el = document.createElement("div");
    el.className = `hero-tile rarity-${def.rarity}` + (owned ? "" : " locked");
    if (owned) {
      const star = heroStar(def.id), level = heroLevel(def.id), shards = heroShards(def.id);
      const stCost = STAR_UP_SHARDS[star] || 0;
      const canStar = star < MAX_STAR;
      const lvlCost = levelUpGoldCost(level);
      const canLevel = level < MAX_LEVEL;
      el.innerHTML = `
        <div class="hero-tile-icon">${def.icon}</div>
        <div class="hero-tile-name">${def.name}</div>
        <div class="hero-tile-meta">${ROLE_LABEL[def.role]} · ${ELEMENT_LABEL[def.element]}</div>
        <div class="hero-tile-star">${"★".repeat(star)}${"☆".repeat(MAX_STAR - star)}</div>
        <div class="hero-tile-lvl">Sv. ${level}${canLevel ? "" : " (MAKS)"}</div>
        <div class="hero-tile-btns">
          ${canLevel ? `<button class="tile-btn" data-lvl="${def.id}" ${state.gold >= lvlCost ? "" : "disabled"}>⬆️Sv ${lvlCost}🪙</button>` : ""}
          ${canStar ? `<button class="tile-btn" data-star="${def.id}" ${shards >= stCost ? "" : "disabled"}>🌟${shards}/${stCost}</button>` : ""}
        </div>
      `;
      const lvlBtn = el.querySelector("[data-lvl]");
      if (lvlBtn) lvlBtn.addEventListener("click", () => levelUpHero(def.id));
      const starBtn = el.querySelector("[data-star]");
      if (starBtn) starBtn.addEventListener("click", () => starUpHero(def.id));
    } else {
      el.innerHTML = `
        <div class="hero-tile-icon">${def.icon}</div>
        <div class="hero-tile-name">${def.name}</div>
        <div class="hero-tile-meta">${RARITY_LABEL[def.rarity]} · Kilitli</div>
        <div class="hero-tile-locked-note">Çağırarak kazan</div>
      `;
    }
    grid.appendChild(el);
  });
}

function levelUpHero(id) {
  const level = heroLevel(id);
  if (level >= MAX_LEVEL) return;
  const cost = levelUpGoldCost(level);
  if (state.gold < cost) return;
  state.gold -= cost;
  state.heroLevels[id] = level + 1;
  saveState();
  renderRosterScreen();
  toast(`${charDef(id).icon} Seviye ${level + 1}!`);
}

function starUpHero(id) {
  const star = heroStar(id);
  if (star >= MAX_STAR) return;
  const cost = STAR_UP_SHARDS[star];
  if (heroShards(id) < cost) return;
  state.heroShards[id] -= cost;
  state.heroStars[id] = star + 1;
  saveState();
  renderRosterScreen();
  toast(`${charDef(id).icon} ${star + 1} Yıldıza yükseldi! ⭐`);
}

/* ============================== TAKIM KURMA ============================== */
function renderTeamScreen() {
  const slots = document.getElementById("teamSlots");
  slots.innerHTML = "";
  for (let i = 0; i < TEAM_SIZE; i++) {
    const id = state.team[i];
    const el = document.createElement("div");
    el.className = "team-slot" + (id ? "" : " empty");
    if (id) {
      const def = charDef(id);
      el.innerHTML = `<span class="team-slot-icon">${def.icon}</span><span class="team-slot-star">★${heroStar(id)}</span>`;
      el.addEventListener("click", () => { state.team[i] = null; saveState(); renderTeamScreen(); });
    } else {
      el.innerHTML = `<span class="team-slot-plus">${i + 1}</span>`;
    }
    slots.appendChild(el);
  }

  const totalPower = state.team.reduce((s, id) => s + (id ? heroPower(id) : 0), 0);
  document.getElementById("teamPowerLabel").textContent = totalPower;

  const pool = document.getElementById("teamPool");
  pool.innerHTML = "";
  state.roster.forEach(id => {
    const def = charDef(id);
    const inTeam = state.team.includes(id);
    const el = document.createElement("div");
    el.className = `hero-tile small rarity-${def.rarity}` + (inTeam ? " in-team" : "");
    el.innerHTML = `
      <div class="hero-tile-icon">${def.icon}</div>
      <div class="hero-tile-name">${def.name}</div>
      <div class="hero-tile-star">${"★".repeat(heroStar(id))}</div>
    `;
    el.addEventListener("click", () => {
      if (inTeam) {
        const idx = state.team.indexOf(id);
        state.team[idx] = null;
      } else {
        const emptyIdx = state.team.indexOf(null);
        if (emptyIdx === -1) { toast("Takım dolu! Önce bir kahraman çıkar."); return; }
        state.team[emptyIdx] = id;
      }
      saveState();
      renderTeamScreen();
    });
    pool.appendChild(el);
  });
}

/* ============================== ÇAĞIRMA (SUMMON) ============================== */
function renderSummonScreen() {
  document.getElementById("gemLabelSummon").textContent = Math.floor(state.gems);
  document.getElementById("ticketLabelSummon").textContent = Math.floor(state.tickets);
  document.getElementById("standardPityLabel").textContent = `${state.pity.standard.sinceEpic}/10 (garantili epik+)`;
  document.getElementById("premiumPityLabel").textContent = `${state.pity.premium.sinceEpic}/10 epik+ · ${state.pity.premium.sinceLegendary}/40 efsanevi`;
}

function summonAndShow(banner, count) {
  const results = doSummon(banner, count);
  if (!results) { toast(banner === "standard" ? "🎫 Yetersiz bilet" : "💎 Yetersiz elmas"); return; }
  renderSummonScreen();
  showSummonResultModal(results);
}

function showSummonResultModal(results) {
  const cards = results.map(r => `
    <div class="summon-result-card rarity-${r.def.rarity}">
      <div class="summon-result-icon">${r.def.icon}</div>
      <div class="summon-result-name">${r.def.name}</div>
      <div class="summon-result-rarity">${RARITY_LABEL[r.def.rarity]}</div>
      ${r.isDupe ? `<div class="summon-result-dupe">🔩 Tekrar → Parça</div>` : `<div class="summon-result-new">✨ YENİ!</div>`}
    </div>
  `).join("");
  showModal(`
    <h3>✨ Çağırma Sonuçları</h3>
    <div class="summon-result-grid">${cards}</div>
    <button class="btn btn-primary" id="summonResultCloseBtn">Tamam</button>
  `);
  document.getElementById("summonResultCloseBtn").addEventListener("click", closeModal);
}

/* ============================== BÖLGE HARİTASI ============================== */
function renderStagesScreen() {
  const list = document.getElementById("stageList");
  list.innerHTML = "";
  for (let i = 0; i < TOTAL_STAGES; i++) {
    const unlocked = i <= state.stageIndex;
    const stars = state.stageStars[i] || 0;
    const isBoss = (i + 1) % 4 === 0;
    const el = document.createElement("div");
    el.className = "stage-row" + (unlocked ? "" : " locked") + (isBoss ? " boss" : "");
    el.innerHTML = `
      <div class="stage-row-num">${isBoss ? "👑" : i + 1}</div>
      <div class="stage-row-main">
        <div class="stage-row-name">${stageName(i)}</div>
        <div class="stage-row-stars">${unlocked ? "★".repeat(stars) + "☆".repeat(3 - stars) : "🔒"}</div>
      </div>
      <div class="stage-row-go">${unlocked ? "▶️" : ""}</div>
    `;
    if (unlocked) el.addEventListener("click", () => startBattle(i));
    list.appendChild(el);
  }
}

/* ============================== MAĞAZA (IAP) ============================== */
const GEM_PACKS = [
  { id: "gem_small",  gems: 80,   price: "₺19,99", tag: "" },
  { id: "gem_med",    gems: 500,  price: "₺89,99", tag: "En Popüler" },
  { id: "gem_large",  gems: 1200, price: "₺179,99", tag: "En İyi Değer" },
  { id: "gem_huge",   gems: 2600, price: "₺349,99", tag: "" },
  { id: "gem_mega",   gems: 6000, price: "₺699,99", tag: "" },
];
const STARTER_BUNDLE = { id: "starter_bundle", gems: 600, tickets: 15, gold: 3000, price: "₺49,99" };

function renderShopScreen() {
  document.getElementById("gemLabelShop").textContent = Math.floor(state.gems);
  const grid = document.getElementById("gemPackGrid");
  grid.innerHTML = "";
  GEM_PACKS.forEach(pack => {
    const el = document.createElement("div");
    el.className = "pack-card";
    el.innerHTML = `
      ${pack.tag ? `<div class="pack-tag">${pack.tag}</div>` : ""}
      <div class="pack-icon">💎</div>
      <div class="pack-amount">${pack.gems.toLocaleString("tr-TR")}</div>
      <button class="pack-buy-btn" data-pack="${pack.id}">${pack.price}</button>
    `;
    el.querySelector(".pack-buy-btn").addEventListener("click", () => buyGemPack(pack.id));
    grid.appendChild(el);
  });

  const bundleEl = document.getElementById("starterBundleCard");
  if (!state.starterBundleBought) {
    bundleEl.hidden = false;
    bundleEl.querySelector(".pack-buy-btn").onclick = () => buyStarterBundle();
  } else {
    bundleEl.hidden = true;
  }

  document.getElementById("afkBoostLevelLabel").textContent = state.afkBoostLevel || 0;
  document.getElementById("afkBoostCostLabel").textContent = afkBoostCost();
  document.getElementById("afkBoostBtn").disabled = state.gems < afkBoostCost();
}

function afkBoostCost() { return 150 + (state.afkBoostLevel || 0) * 120; }
function buyAfkBoost() {
  const cost = afkBoostCost();
  if (state.gems < cost) { toast("💎 Yetersiz elmas"); return; }
  state.gems -= cost;
  state.afkBoostLevel = (state.afkBoostLevel || 0) + 1;
  saveState();
  renderShopScreen();
  toast(`⏱️ AFK süresi artık ${afkCapHours()} saat!`);
}

function buyGemPack(packId) {
  const pack = GEM_PACKS.find(p => p.id === packId);
  showModal(`
    <h3>💎 ${pack.gems.toLocaleString("tr-TR")} Elmas</h3>
    <p class="panel-desc">Bu bir <b>demo mağaza</b> — gerçek bir ödeme alınmıyor, ${pack.price} tutarındaki bu paketi onaylarsan elmaslar doğrudan hesabına eklenir. Gerçek ödeme için bir ödeme sağlayıcısı entegrasyonu gerekir.</p>
    <button class="btn btn-primary" id="packConfirmBtn">${pack.price} — Onayla (Demo)</button>
    <button class="btn btn-secondary" id="packCancelBtn">Vazgeç</button>
  `);
  document.getElementById("packCancelBtn").addEventListener("click", closeModal);
  document.getElementById("packConfirmBtn").addEventListener("click", () => {
    state.gems += pack.gems;
    saveState();
    closeModal();
    renderShopScreen();
    toast(`💎 +${pack.gems} elmas eklendi (demo satın alma)`);
  });
}

function buyStarterBundle() {
  showModal(`
    <h3>🎁 Başlangıç Paketi</h3>
    <p class="panel-desc">💎 ${STARTER_BUNDLE.gems} elmas + 🎫 ${STARTER_BUNDLE.tickets} bilet + 🪙 ${STARTER_BUNDLE.gold} altın — tek seferlik özel fiyat. Demo mağaza: gerçek ödeme alınmaz.</p>
    <button class="btn btn-primary" id="bundleConfirmBtn">${STARTER_BUNDLE.price} — Onayla (Demo)</button>
    <button class="btn btn-secondary" id="bundleCancelBtn">Vazgeç</button>
  `);
  document.getElementById("bundleCancelBtn").addEventListener("click", closeModal);
  document.getElementById("bundleConfirmBtn").addEventListener("click", () => {
    state.gems += STARTER_BUNDLE.gems;
    state.tickets += STARTER_BUNDLE.tickets;
    state.gold += STARTER_BUNDLE.gold;
    state.starterBundleBought = true;
    saveState();
    closeModal();
    renderShopScreen();
    toast("🎁 Başlangıç paketi alındı!");
  });
}

/* ============================== BAŞLATMA ============================== */
function initApp() {
  loadState();
  switchScreen("home");

  document.getElementById("fightBtn").addEventListener("click", () => startBattle(state.stageIndex));
  document.getElementById("claimAfkBtn").addEventListener("click", () => {
    const r = claimAfkReward();
    updateAfkPanel();
    toast(`🪙 +${r.gold} altın${r.tickets ? ` · 🎫 +${r.tickets} bilet` : ""} alındı!`);
  });
  document.getElementById("openRosterBtn").addEventListener("click", () => switchScreen("roster"));
  document.getElementById("openTeamBtn").addEventListener("click", () => switchScreen("team"));
  document.getElementById("openSummonBtn").addEventListener("click", () => switchScreen("summon"));
  document.getElementById("openStagesBtn").addEventListener("click", () => switchScreen("stages"));
  document.getElementById("openShopBtn").addEventListener("click", () => switchScreen("shop"));
  document.getElementById("openSettingsBtn").addEventListener("click", () => switchScreen("settings"));
  document.querySelectorAll(".back-btn").forEach(btn => btn.addEventListener("click", () => switchScreen(btn.dataset.back)));

  document.getElementById("summonStd1Btn").addEventListener("click", () => summonAndShow("standard", 1));
  document.getElementById("summonStd10Btn").addEventListener("click", () => summonAndShow("standard", 10));
  document.getElementById("summonPrem1Btn").addEventListener("click", () => summonAndShow("premium", 1));
  document.getElementById("summonPrem10Btn").addEventListener("click", () => summonAndShow("premium", 10));

  document.getElementById("afkBoostBtn").addEventListener("click", buyAfkBoost);

  document.getElementById("soundToggle").checked = state.settings.sound;
  document.getElementById("shakeToggle").checked = state.settings.shake;
  document.getElementById("soundToggle").addEventListener("change", e => { state.settings.sound = e.target.checked; saveState(); });
  document.getElementById("shakeToggle").addEventListener("change", e => { state.settings.shake = e.target.checked; saveState(); });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const data = JSON.stringify(state);
    navigator.clipboard && navigator.clipboard.writeText(data).then(() => toast("Kayıt panoya kopyalandı!"), () => showModal(`<h3>Kaydın</h3><textarea readonly style="width:100%;height:160px;">${data}</textarea>`));
  });
  document.getElementById("importBtn").addEventListener("click", () => {
    showModal(`<h3>Kaydı İçe Aktar</h3><textarea id="importArea" style="width:100%;height:160px;" placeholder="Kayıt JSON'unu buraya yapıştır"></textarea><button class="btn btn-primary" id="importConfirmBtn">İçe Aktar</button>`);
    document.getElementById("importConfirmBtn").addEventListener("click", () => {
      try {
        localStorage.setItem(SAVE_KEY, document.getElementById("importArea").value);
        loadState();
        closeModal();
        switchScreen("home");
        toast("Kayıt içe aktarıldı!");
      } catch (e) { toast("Geçersiz kayıt verisi."); }
    });
  });
  document.getElementById("resetBtn").addEventListener("click", () => {
    showModal(`<h3>Emin misin?</h3><p class="panel-desc">Tüm ilerleme kalıcı olarak silinecek.</p>
      <button class="btn btn-danger" id="resetConfirm1">Evet, Sıfırla</button>
      <button class="btn btn-secondary" id="resetCancel">Vazgeç</button>`);
    document.getElementById("resetCancel").addEventListener("click", closeModal);
    document.getElementById("resetConfirm1").addEventListener("click", () => {
      showModal(`<h3>Son kez soruyoruz</h3><p class="panel-desc">Gerçekten TÜM ilerlemeni silmek istiyor musun?</p>
        <button class="btn btn-danger" id="resetConfirm2">Evet, eminim</button>
        <button class="btn btn-secondary" id="resetCancel2">Vazgeç</button>`);
      document.getElementById("resetCancel2").addEventListener("click", closeModal);
      document.getElementById("resetConfirm2").addEventListener("click", () => {
        localStorage.removeItem(SAVE_KEY);
        state = freshState();
        closeModal();
        switchScreen("home");
        toast("Oyun sıfırlandı.");
      });
    });
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}

window.addEventListener("DOMContentLoaded", () => {
  const splash = document.getElementById("splash");
  const appEl = document.getElementById("app");
  const barFill = document.getElementById("splashBarFill");
  let p = 0;
  const iv = setInterval(() => {
    p += 8 + Math.random() * 14;
    barFill.style.width = Math.min(100, p) + "%";
    if (p >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        splash.classList.add("fade-out");
        appEl.classList.remove("hidden");
        setTimeout(() => splash.remove(), 400);
      }, 150);
    }
  }, 90);
  initApp();
});
