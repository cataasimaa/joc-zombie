// HUD-ul: afișează starea jocului în HTML peste canvas-ul 3D.
// Ca și randarea, doar CITEȘTE starea. Acțiunile jucătorului ies prin callback-uri.

import {
  CONFIG,
  FISH_KINDS,
  type FishKind,
  HOTBAR_SIZE,
  type Hero,
  type Player,
  type SlotItem,
  type WeaponId,
  DEFAULT_SKIN_COLOR,
  actionHint,
  type Difficulty,
  type GameMode,
  type ItemKind,
  type GameEvent,
  type GameState,
  HERO_DEFS,
  type HeroClass,
  type PlayerId,
  SKINS,
  type ShopRarity,
  type ShopReward,
  WEAPONS,
  canShopRoll,
  gunStats,
  shopRemaining,
  towerCost,
  xpToNextLevel,
  ARMOR_SLOTS,
  type ArmorMaterial,
  type ArmorSlot,
  SKILL_IDS,
  SKILL_INFO,
  type SkillId,
  ZOMBIE_NAMES,
  armorCost,
  armorReduction,
  armorSet,
  canCraftArmor,
  isBoss,
  rank,
} from "../core";
import { type RunResult, bestRuns, lastRuns } from "./leaderboard";

export interface HudCallbacks {
  /** Meniul principal: Start cu numele și dificultatea alese. */
  onMenuStart(name: string, difficulty: Difficulty, mode: GameMode): void;
  /** Bara rapidă: mănânci / pui carnea pe foc. */
  onUseItem(item: ItemKind): void;
  /** Bara rapidă: folosește locul `slot` / pune `item` în locul `slot`. */
  onUseSlot(slot: number): void;
  onSetSlot(slot: number, item: SlotItem | null): void;
  /** Meniul de nivel: pui punctul într-o abilitate. */
  onLearnSkill(skill: SkillId): void;
  /** Inventarul: faci (și îmbraci) o piesă de armură. */
  onCraftArmor(slot: ArmorSlot, material: ArmorMaterial): void;
  /** Butonul de acțiune: apăsat (true) / eliberat (false). */
  onAction(on: boolean): void;
  onPickHero(heroClass: HeroClass): void;
  /** Sunetul și muzica (doar din meniu). Returnează noua stare (true = pornit). */
  onToggleSound(): boolean;
  onToggleMusic(): boolean;
  /** Trece la următoarea calitate grafică; întoarce eticheta nouă. */
  onCycleQuality(): string;
  onPause(paused: boolean): void;
  onQuitToMenu(): void;
  onToggleBuild(): void;
  onPick(kind: PickKind): void;
  onStartNight(): void;
  onShopRoll(): void;
  onReload(): void;
  onWallRotate(): void;
  onWallPlace(): void;
  onWallDone(): void;
  onRestart(): void;
  /** Sunetele păcănelei. */
  onSpinTick(): void;
  onReelStop(): void;
  onSpinResult(rarity: ShopRarity): void;
}

export type PickKind = "tower" | "wall" | "mine" | "campfire" | "farmChicken" | "farmPig" | "well";

export interface MenuOption {
  label: string;
  detail?: string;
  /** Dacă e setat, butonul e dezactivat și arată motivul. */
  blocked?: string | null;
  cancel?: boolean;
  /** Ocupă tot rândul (în meniul pe două coloane). */
  full?: boolean;
  className?: string;
  onClick(): void;
}

const RARITY_NAMES: Record<ShopRarity, string> = {
  nothing: "Nimic",
  common: "Comun",
  rare: "Rar",
  epic: "Epic",
  legendary: "Legendar",
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Iconițele armelor (în bara rapidă și în inventar). */
const WEAPON_ICONS: Record<WeaponId, string> = {
  rusty: "🔧", pistol: "🔫", rifle: "🎯", assaultRifle: "🪖", hunting: "🦌", scattergun: "💥", pipeGun: "🔩", boneBow: "🏹", iceLance: "❄️",
};

const ARMOR_NAMES: Record<ArmorSlot, { icon: string; name: string }> = {
  head: { icon: "⛑️", name: "Cască" },
  chest: { icon: "🦺", name: "Piept" },
  legs: { icon: "👖", name: "Pantaloni" },
  feet: { icon: "🥾", name: "Papuci" },
};

/** Ce face fiecare boss (anunțat când vine noaptea lui). */
const BOSS_TRICKS: Partial<Record<string, string>> = {
  boss: "lich-ul cu coasă",
  broodmother: "naște pui și îi scapă pe toți când moare",
  yeti: "se încordează, apoi se năpustește prin ziduri",
  witch: "se teleportează și îngheață turnurile",
  colossus: "undă de șoc, bolovani, se înfurie la jumătate",
};

/** Ce primești la fiecare nivel al eroului (pentru meniul de nivel). */
const LEVEL_ROAD: [number, string][] = [
  [CONFIG.levelUnlocks.pistol, "🔫 Pistol"],
  [CONFIG.tower.tierAtHeroLevel[3], "🏰 Turnuri nivel 3"],
  [CONFIG.levelUnlocks.rifle, "🎯 Pușcă"],
  [CONFIG.levelUnlocks.chainsaw, "🪚 Drujbă"],
  [CONFIG.tower.tierAtHeroLevel[4], "🏰 Turnuri nivel 4 (elită)"],
  [CONFIG.levelUnlocks.assaultRifle, "🪖 Pușcă de asalt"],
  [CONFIG.tower.tierAtHeroLevel[5], "🏰 Turnuri nivel 5 (legendare)"],
];

export function rewardIcon(r: ShopReward): string {
  const icons: Record<ShopReward["kind"], string> = {
    nothing: "💨", wood: "🪵", coins: "💰", ammo: "📦", mines: "💣", maxHp: "❤️", speed: "👟", regen: "✚", repair: "🔧",
    towerSlot: "🗼", towerTier: "🏰", weapon: "🔫", skin: "🎨",
  };
  return icons[r.kind];
}

export function describeReward(r: ShopReward): string {
  switch (r.kind) {
    case "nothing":
      return "Nimic. Ghinion!";
    case "wood":
      return `+${r.amount} lemn`;
    case "coins":
      return `+${r.amount} monede`;
    case "ammo":
      return `+${r.magazines} încărcătoare de gloanțe`;
    case "mines":
      return `+${r.count} mine`;
    case "maxHp":
      return `+${pct(r.pct)} viață maximă`;
    case "speed":
      return `+${pct(r.pct)} viteză de mers`;
    case "regen":
      return `+${r.perSec} HP/s regenerare`;
    case "repair":
      return `+${pct(r.pct)} viteză de reparat`;
    case "towerSlot":
      return "+1 loc pentru turn";
    case "towerTier":
      return `Turnuri nivel ${r.tier}`;
    case "weapon":
      return WEAPONS[r.weaponId].name;
    case "skin":
      return `Skin ${SKINS.find((s) => s.id === r.skinId)?.name ?? r.skinId}`;
  }
}

const fmtTime = (t: number) => {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const REEL_ICONS = ["💨", "🪵", "💰", "💣", "❤️", "👟", "✚", "🔧", "🗼", "🏰", "🔫", "🎨", "💎"];

const DIFFICULTY_TEXT: Record<Difficulty, string> = {
  easy: "Jocul de bază",
  medium: "Mai mulți zombi, mai rezistenți",
  hard: "Hoarde mari, mai puțin lemn",
  nightmare: "Doar pentru nebuni",
};
const SPIN_TIME = 3000;
const REEL_STOPS = [1500, 2250, 3000];

export class Hud {
  private cache = new Map<HTMLElement, string>();
  private toastTimer = 0;
  private hintTimer = 0;
  private damageFlash = 0;
  private spinning = false;
  private pendingResult: { rarity: ShopRarity; reward: ShopReward } | null = null;
  private lastState: GameState | null = null;
  private playerId: PlayerId = "p1";
  private difficulty: Difficulty = "easy";
  private mode: GameMode = "defend";
  private boardTab: { mode: GameMode; difficulty: Difficulty } = { mode: "defend", difficulty: "easy" };

  private el = {
    hud: $("hud"),
    mineHp: $("mine-hp"),
    mineText: $("mine-text"),
    mineFill: $("mine-fill"),
    heroName: $("hero-name"),
    heroText: $("hero-text"),
    heroLevel: $("hero-level"),
    heroBar: $("hero-bar"),
    xpBar: $("xp-bar"),
    xpText: $("xp-text"),
    mainMenu: $("main-menu"),
    pauseMenu: $("pause-menu"),
    nameInput: $<HTMLInputElement>("player-name"),
    difficulty: $("difficulty"),
    heroSubtitle: $("hero-subtitle"),
    waveText: $("wave-text"),
    timerText: $("timer-text"),
    startWave: $<HTMLButtonElement>("start-wave"),
    bossPanel: $("boss-panel"),
    bossBar: $("boss-bar"),
    wood: $("wood-text"),
    coins: $("coins-text"),
    shopBtn: $<HTMLButtonElement>("shop-btn"),
    buildBtn: $<HTMLButtonElement>("build-btn"),
    fireStick: $("fire-stick"),
    ammo: $("ammo-text"),
    reloadArc: document.getElementById("reload-arc") as unknown as SVGCircleElement,
    buildMenu: $("build-menu"),
    palette: $("build-palette"),
    pickTower: $<HTMLButtonElement>("pick-tower"),
    pickWall: $<HTMLButtonElement>("pick-wall"),
    pickMine: $<HTMLButtonElement>("pick-mine"),
    mineCost: $("mine-cost"),
    survivalBars: $("survival-bars"),
    quickbar: $("quickbar"),
    modeBox: $("mode"),
    placeBar: $("place-bar"),
    placeHint: $("place-hint"),
    wallRotate: $<HTMLButtonElement>("wall-rotate"),
    wallPlace: $<HTMLButtonElement>("wall-place"),
    damage: $("damage"),
    toast: $("toast"),
    hint: $("hint"),
    heroSelect: $("hero-select"),
    heroCards: $("hero-cards"),
    shopModal: $("shop-modal"),
    shopCoins: $("shop-coins"),
    reels: [$("reel-0"), $("reel-1"), $("reel-2")],
    shopOdds: $("shop-odds-mini"),
    shopResult: $("shop-result"),
    shopRoll: $<HTMLButtonElement>("shop-roll"),
    shopRemaining: $("shop-remaining"),
    shopStats: $("shop-stats"),
    endScreen: $("end-screen"),
    endTitle: $("end-title"),
    endText: $("end-text"),
  };

  constructor(private cb: HudCallbacks) {
    // Apeși pe nivelul din stânga sus: meniul de nivel (alegi ce crești).
    $("level-btn").addEventListener("click", () => this.toggleLevelMenu());
    this.el.buildBtn.addEventListener("click", () => cb.onToggleBuild());
    this.el.startWave.addEventListener("click", () => cb.onStartNight());
    this.el.pickTower.addEventListener("click", () => cb.onPick("tower"));
    this.el.pickWall.addEventListener("click", () => cb.onPick("wall"));
    this.el.pickMine.addEventListener("click", () => cb.onPick("mine"));
    for (const kind of ["campfire", "farmChicken", "farmPig", "well"] as PickKind[]) $(`pick-${kind}`).addEventListener("click", () => cb.onPick(kind));
    $("campfire-cost").textContent = `🪵 ${CONFIG.survival.campfireCost}`;
    $("chicken-cost").textContent = `🪵 ${CONFIG.survival.farmCost}`;
    $("pig-cost").textContent = `🪵 ${CONFIG.survival.farmCost}`;
    $("well-cost").textContent = `🪵 ${CONFIG.survival.wellCost}`;
    for (let i = 0; i < HOTBAR_SIZE; i++) $(`qb-${i}`).addEventListener("click", () => !this.suppressClick && this.onSlotClick(i));
    this.setupDrag();
    $("qb-bag").addEventListener("click", () => this.toggleInventory());
    $("menu-board").addEventListener("click", () => this.showBoard(true));
    $("board-close").addEventListener("click", () => this.showBoard(false));
    $("palette-close").addEventListener("click", () => cb.onToggleBuild());
    this.el.ammo.addEventListener("click", () => cb.onReload());
    this.el.shopBtn.addEventListener("click", () => this.setShopOpen(true));
    $("shop-close").addEventListener("click", () => this.setShopOpen(false));
    this.el.shopRoll.addEventListener("click", () => {
      if (this.spinning) return;
      this.startSpin();
      cb.onShopRoll();
    });
    // Meniul principal și pauza.
    $("menu-start").addEventListener("click", () => {
      const name = this.el.nameInput.value.trim();
      try {
        localStorage.setItem("im.name", name);
        localStorage.setItem("im.difficulty", this.difficulty);
      } catch {
        // fără salvare (mod privat) — nu e grav
      }
      try {
        localStorage.setItem("im.mode", this.mode);
      } catch {
        // ignorăm
      }
      cb.onMenuStart(name, this.difficulty, this.mode);
    });
    const sound = () => this.setAudioLabels(cb.onToggleSound(), null);
    const music = () => this.setAudioLabels(null, cb.onToggleMusic());
    $("menu-sound").addEventListener("click", sound);
    $("pause-sound").addEventListener("click", sound);
    $("menu-music").addEventListener("click", music);
    $("menu-quality").addEventListener("click", () => this.setQualityLabel(cb.onCycleQuality()));
    $("pause-music").addEventListener("click", music);
    $("menu-btn").addEventListener("click", () => this.setPaused(true));
    $("pause-resume").addEventListener("click", () => this.setPaused(false));
    $("pause-quit").addEventListener("click", () => {
      this.setPaused(false);
      cb.onQuitToMenu();
    });
    $("end-menu-btn").addEventListener("click", () => cb.onQuitToMenu());
    try {
      this.el.nameInput.value = localStorage.getItem("im.name") ?? "";
      const d = localStorage.getItem("im.difficulty") as Difficulty | null;
      if (d && d in CONFIG.difficulty) this.difficulty = d;
      const m = localStorage.getItem("im.mode") as GameMode | null;
      if (m && m in CONFIG.modes) this.mode = m;
    } catch {
      // ignorăm
    }
    this.renderDifficulty();
    this.renderModes();
    this.el.wallRotate.addEventListener("click", () => cb.onWallRotate());
    this.el.wallPlace.addEventListener("click", () => cb.onWallPlace());
    $("wall-done").addEventListener("click", () => cb.onWallDone());
    $("restart-btn").addEventListener("click", () => cb.onRestart());
    $("tower-cost").textContent = `🪵 ${towerCost()}`;
    $("wall-cost").textContent = `🪵 ${CONFIG.barricade.levels[0].cost}`;
    this.renderHeroCards();
    this.renderOdds();
  }

  // ---------- Meniu ----------

  private renderDifficulty(): void {
    this.el.difficulty.innerHTML = "";
    for (const [id, d] of Object.entries(CONFIG.difficulty) as [Difficulty, (typeof CONFIG.difficulty)[Difficulty]][]) {
      const b = document.createElement("button");
      b.className = `diff-btn diff-${id}${id === this.difficulty ? " selected" : ""}`;
      b.innerHTML = `<b>${d.name}</b><small>${DIFFICULTY_TEXT[id]}</small>`;
      b.addEventListener("click", () => {
        this.difficulty = id;
        this.renderDifficulty();
      });
      this.el.difficulty.appendChild(b);
    }
  }

  private renderModes(): void {
    this.el.modeBox.innerHTML = "";
    for (const [id, m] of Object.entries(CONFIG.modes) as [GameMode, (typeof CONFIG.modes)[GameMode]][]) {
      const b = document.createElement("button");
      b.className = `mode-btn${id === this.mode ? " selected" : ""}`;
      b.innerHTML = `<b>${m.icon} ${m.name}</b><small>${m.text}</small>`;
      b.addEventListener("click", () => {
        this.mode = id;
        this.renderModes();
      });
      this.el.modeBox.appendChild(b);
    }
  }

  // ---------- Clasament ----------

  showBoard(open: boolean): void {
    $("board").classList.toggle("hidden", !open);
    if (!open) return;
    this.boardTab = { mode: this.mode, difficulty: this.difficulty };
    this.renderBoard();
  }

  private renderBoard(): void {
    const tabs = $("board-tabs");
    tabs.innerHTML = "";
    for (const mode of Object.keys(CONFIG.modes) as GameMode[]) {
      for (const diff of Object.keys(CONFIG.difficulty) as Difficulty[]) {
        const b = document.createElement("button");
        const on = this.boardTab.mode === mode && this.boardTab.difficulty === diff;
        b.className = `board-tab${on ? " selected" : ""}`;
        b.textContent = `${CONFIG.modes[mode].icon} ${CONFIG.difficulty[diff].name}`;
        b.addEventListener("click", () => {
          this.boardTab = { mode, difficulty: diff };
          this.renderBoard();
        });
        tabs.appendChild(b);
      }
    }
    const row = (r: RunResult) =>
      `<li><span class="b-name">${escapeHtml(r.name)} <small>${HERO_DEFS[r.heroClass].icon}</small></span>` +
      `<span class="b-val">${r.victory ? "🏆" : `🌙 ${r.nights}`} · 🧟 ${r.kills}</span></li>`;
    const { mode, difficulty } = this.boardTab;
    const best = bestRuns(mode, difficulty);
    const last = lastRuns(mode, difficulty);
    $("board-best").innerHTML = best.length ? best.map(row).join("") : '<li class="empty">Nicio rundă încă</li>';
    $("board-last").innerHTML = last.length ? last.map(row).join("") : '<li class="empty">Nicio rundă încă</li>';
  }

  /** Anunț mare pe mijlocul ecranului (Double Kill, Rampage...). */

  setQualityLabel(label: string): void {
    $("menu-quality").textContent = `🖥 Grafică: ${label}`;
  }

  /** Etichetele butoanelor de sunet și muzică (null = nu se schimbă). */
  setAudioLabels(sound: boolean | null, music: boolean | null): void {
    if (sound !== null) for (const id of ["menu-sound", "pause-sound"]) $(id).textContent = sound ? "🔊 Sunet: pornit" : "🔇 Sunet: oprit";
    // În joc nu e buton de sunet: doar o linie peste ☰ arată că sunetul e oprit (se schimbă din meniu).
    if (sound !== null) $("menu-btn").classList.toggle("muted", !sound);
    if (music !== null) for (const id of ["menu-music", "pause-music"]) $(id).textContent = music ? "🎵 Muzică: pornită" : "🎵 Muzică: oprită";
  }

  showMainMenu(): void {
    this.el.mainMenu.classList.remove("hidden");
    $("board").classList.add("hidden");
    this.el.heroSelect.classList.add("hidden");
    this.el.hud.classList.add("hidden");
    this.el.endScreen.classList.add("hidden");
    clearTimeout(this.endTimer);
    this.el.pauseMenu.classList.add("hidden");
    this.setShopOpen(false);
  }

  setPaused(paused: boolean): void {
    this.el.pauseMenu.classList.toggle("hidden", !paused);
    this.cb.onPause(paused);
  }

  get paused(): boolean {
    return !this.el.pauseMenu.classList.contains("hidden");
  }

  // ---------- Alegerea eroului ----------

  private renderHeroCards(): void {
    this.el.heroCards.innerHTML = "";
    for (const [cls, def] of Object.entries(HERO_DEFS) as [HeroClass, (typeof HERO_DEFS)[HeroClass]][]) {
      const stats = CONFIG.heroes[cls];
      const [r, g, b] = DEFAULT_SKIN_COLOR[cls].map((v) => Math.round(Math.min(255, v * 255 * 1.6)));
      const card = document.createElement("button");
      card.className = "hero-card";
      card.innerHTML = `
        <div class="hc-head">
          <div class="hc-icon" style="background: rgb(${r},${g},${b})">${def.icon}</div>
          <div><div class="hc-name">${def.name}</div><div class="hc-role">${def.role}</div></div>
        </div>
        <div class="hc-desc">${def.description}</div>
        <div class="hc-passive">★ ${def.passive}</div>
        <div class="hc-stats">❤ ${stats.maxHp} · 🎯 ${stats.range} m · 🔫 ${stats.magazine} gloanțe</div>`;
      card.addEventListener("click", () => this.cb.onPickHero(cls));
      this.el.heroCards.appendChild(card);
    }
  }

  showHeroSelect(name = ""): void {
    this.el.mainMenu.classList.add("hidden");
    this.el.heroSelect.classList.remove("hidden");
    const d = CONFIG.difficulty[this.difficulty].name;
    this.el.heroSubtitle.textContent = `${name ? `${name}, alege` : "Alege"}-ți eroul · dificultate ${d}`;
    this.el.hud.classList.add("hidden");
    this.el.endScreen.classList.add("hidden");
    clearTimeout(this.endTimer);
    this.setShopOpen(false);
  }

  /** Pregătește HUD-ul pentru eroul ales. */
  startGame(heroClass: HeroClass): void {
    this.cache.clear();
    this.el.heroSelect.classList.add("hidden");
    this.el.endScreen.classList.add("hidden");
    clearTimeout(this.endTimer);
    this.el.hud.classList.remove("hidden");
    this.el.heroName.dataset.icon = HERO_DEFS[heroClass].icon;
    this.el.shopResult.innerHTML = "";
    for (const r of this.el.reels) r.textContent = "🎰";
  }

  // ---------- Actualizare pe fiecare cadru ----------

  update(state: GameState, playerId: PlayerId, events: GameEvent[], dt: number): void {
    this.lastState = state;
    this.playerId = playerId;
    const player = state.players[playerId];
    const hero = state.heroes.find((h) => h.id === player.heroId)!;

    // Personajul: nume, nivel, viață (roșu) și experiență (galben).
    this.text(this.el.heroName, player.name);
    this.text(this.el.heroLevel, String(hero.level));
    this.el.heroLevel.classList.toggle("has-points", hero.skillPoints > 0);
    this.text($("skill-points"), hero.skillPoints > 0 ? `+${hero.skillPoints}` : "");
    if (this.levelOpen) this.renderLevelMenu(hero);
    this.text(this.el.heroText, hero.alive ? `❤ ${Math.ceil(hero.hp)} / ${hero.maxHp}` : "căzut");
    this.updateActionButton(state, hero);
    this.updateRevive(state, hero);
    if (this.invOpen) this.renderInventory(state, playerId);
    this.width(this.el.heroBar, hero.hp / hero.maxHp);
    const need = xpToNextLevel(hero.level);
    this.text(this.el.xpText, `XP ${Math.floor(hero.xp)} / ${need}`);
    this.width(this.el.xpBar, hero.xp / need);

    // Mina de plasmă.
    const sh = state.shelter;
    this.text(this.el.mineText, `${Math.ceil(sh.hp)}/${sh.maxHp}`);
    this.width(this.el.mineFill, sh.hp / sh.maxHp);
    this.el.mineHp.classList.toggle("low", sh.hp / sh.maxHp < 0.35);

    // Muniție + cercul de reîncărcare de pe butonul de tras (doar cu arma în mână).
    const gun = gunStats(state, hero);
    const holdsGun = player.tool === "gun";
    $("tool-icon").classList.toggle("hidden", holdsGun);
    if (holdsGun) {
      this.toolKey = "";
      this.text(this.el.ammo, hero.reloadTimer > 0 ? "↻" : `${hero.ammo}/${hero.reserve}`);
    }
    this.el.fireStick.classList.toggle("empty", holdsGun && hero.ammo <= 0 && hero.reserve <= 0);
    this.el.fireStick.classList.toggle("reloading", holdsGun && hero.reloadTimer > 0);
    this.el.fireStick.classList.toggle("low", holdsGun && hero.reloadTimer <= 0 && hero.ammo <= Math.ceil(gun.magazine * 0.25));
    // Cercul: reîncărcarea (arma) sau bateria (lanterna).
    const progress = player.tool === "lantern" ? hero.battery / 100 : holdsGun && hero.reloadTimer > 0 ? 1 - hero.reloadTimer / gun.reloadTime : 0;
    this.el.reloadArc.style.strokeDashoffset = String(289 * (1 - progress));

    // Zi / noapte + cronometru
    const night = state.phase === "night";
    this.el.hud.classList.toggle("is-night", night);
    // Ceasul: doar ziua / noaptea și timpul rămas (câți zombi vin rămâne un mister).
    if (state.phase === "day") {
      this.text(this.el.waveText, `Ziua ${state.wave + 1}`);
      this.text(this.el.timerText, fmtTime(state.phaseTimer));
    } else if (night) {
      this.text(this.el.waveText, `Noaptea ${state.wave}/${state.totalWaves}`);
      this.text(this.el.timerText, fmtTime(state.phaseTimer));
    }
    const clock = $("clock");
    clock.style.setProperty("--p", String(state.phaseDuration > 0 ? 1 - state.phaseTimer / state.phaseDuration : 0));
    clock.classList.toggle("night", night);
    this.text($("clock-icon"), night ? "🌙" : "☀️");
    this.el.startWave.classList.toggle("hidden", state.phase !== "day");

    const boss = state.zombies.find((z) => isBoss(z.type) && !z.burning) ?? state.zombies.find((z) => isBoss(z.type));
    this.el.bossPanel.classList.toggle("hidden", !boss);
    if (boss) {
      this.width(this.el.bossBar, boss.hp / boss.maxHp);
      this.text($("boss-name"), `☠ ${ZOMBIE_NAMES[boss.type]}${boss.enraged ? " · ÎNFURIAT" : ""}`);
    }

    // Resurse
    this.text(this.el.wood, String(player.wood));
    this.text(this.el.coins, String(player.coins));
    // Supraviețuire: foame, căldură, bara rapidă. Vremea pentru toți.
    const survival = state.mode === "survival";
    this.el.survivalBars.classList.toggle("hidden", !survival);
    this.el.hud.classList.toggle("survival", survival);
    if (survival) {
      // Iconițele din dreapta se „golesc” de sus în jos; sub 20% clipesc.
      for (const [id, v] of [["hunger", hero.hunger], ["thirst", hero.thirst], ["warmth", hero.warmth]] as const) {
        const el = $(`stat-${id}`);
        el.style.setProperty("--v", (Math.round(v) / 100).toFixed(2));
        el.classList.toggle("alert", v < 20);
      }
    }
    this.el.quickbar.classList.toggle("hidden", false);
    this.renderHotbar(state, player, hero);

    this.text($("gold-text"), String(player.coins));
    this.text(this.el.mineCost, `× ${player.mines}`);
    this.el.pickMine.disabled = player.mines <= 0;
    const canRoll = canShopRoll(state, playerId) === null;
    this.el.shopBtn.classList.toggle("can-open", canRoll);

    if (this.shopOpen) this.updateShop(state, playerId, canRoll);

    for (const e of events) this.handleEvent(state, hero.id, playerId, e);

    // Ecran roșu când ești lovit.
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
    const lowHp = hero.alive && hero.hp / hero.maxHp < 0.3 ? 0.35 + Math.sin(performance.now() / 180) * 0.1 : 0;
    this.el.damage.style.opacity = String(Math.min(1, Math.max(this.damageFlash, lowHp)));

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove("show");
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove("show");
    }
  }

  private handleEvent(state: GameState, heroId: number, playerId: PlayerId, e: GameEvent): void {
    switch (e.type) {
      case "nightStarted":
        this.toast(e.boss && e.bossType ? `🌙 Noaptea ${e.wave} · ☠ vine ${ZOMBIE_NAMES[e.bossType]}: ${BOSS_TRICKS[e.bossType] ?? ""}` : `🌙 Se lasă noaptea… (${e.wave})`, e.boss ? 4.5 : 2.5);
        break;
      case "chestDropped":
        this.toast("🎁 Boss-ul a lăsat un cufăr! Trage în el ca să-l spargi!", 3.5);
        break;
      case "chestOpened":
        if (e.playerId === playerId) {
          this.toast(`🎁 ${RARITY_NAMES[e.rarity]}: ${rewardIcon(e.reward)} ${describeReward(e.reward)} · +${e.wood} 🪵 · +${e.ammo} gloanțe · +${e.meat} 🍗`, 5);
        }
        break;
      case "noAmmo":
        if (e.heroId === heroId) this.hint("📦 Fără gloanțe! Ia cutii de la zombii morți");
        break;
      case "starving":
        if (e.heroId === heroId) this.hint("🍖 Mori de foame! Mănâncă ceva (bara de jos)");
        break;
      case "thirsty":
        if (e.heroId === heroId) this.hint("💧 Îți e sete! Bea din canistră, la fântână, la baltă sau topește zăpadă lângă un foc");
        break;
      case "levelUp":
        if (e.heroId === heroId) this.toast(`⭐ Nivelul ${e.level}! Apasă pe nivel (stânga sus) și alege ce crești`, 3.5);
        break;
      case "skillLearned":
        if (e.heroId === heroId && e.passive) {
          const info = SKILL_INFO[e.skill];
          this.toast(`✨ Pasivă nouă — ${e.rank >= 5 ? info.passive5 : info.passive3}`, 3.5);
        }
        break;
      case "unlocked":
        if (e.playerId === playerId) {
          const what = e.what === "towerTier" ? `🏰 Poți urca turnurile la nivelul ${e.tier}!` :
            e.what === "chainsaw" ? "🪚 Ai primit DRUJBA! Merge cu benzină (ulei rafinat pe foc)" :
            `${WEAPON_ICONS[e.what]} Ai primit ${WEAPONS[e.what].name}! (o schimbi din bara de jos)`;
          this.toast(what, 4);
        }
        break;
      case "armorCrafted":
        if (e.playerId === playerId) this.hint(`${ARMOR_NAMES[e.slot].icon} ${ARMOR_NAMES[e.slot].name} din ${e.material === "metal" ? "metal" : "piele"} — o porți`);
        break;
      case "noPetrol":
        if (e.heroId === heroId) this.hint("⛽ Drujba n-are benzină! Sparge zăcăminte de ulei și rafinează-l pe foc");
        break;
      case "scream":
        this.hint("😱 Urlătoarea înfurie zombii din jur — omoar-o prima!");
        break;
      case "towersFrozen":
        this.hint("❄ Vrăjitoarea a înghețat turnurile!");
        break;
      case "bossEnraged":
        this.toast("💢 Colosul s-a înfuriat!", 2.5);
        break;
      case "refilled":
        if (e.playerId === playerId) this.hint("💧 Canistrele sunt pline");
        break;
      case "fishBite":
        if (state.heroes.find((h) => h.id === e.heroId)?.playerId === playerId) this.buzz([90, 50, 140]);
        break;
      case "fishTug":
        if (e.playerId === playerId) {
          this.buzz(60);
          this.el.fireStick.classList.remove("tug");
          void this.el.fireStick.offsetWidth; // repornește animația
          this.el.fireStick.classList.add("tug");
        }
        break;
      case "freezing":
        if (e.heroId === heroId) this.hint("🥶 Îngheți! Stai lângă un foc");
        break;
      case "fireOut":
        if (state.campfires.some((f) => f.id === e.fireId)) this.hint("🔥 Un foc s-a stins — pune lemne (atinge-l)");
        break;
      case "picked":
        if (e.playerId === playerId) this.hint(e.kind === "ammo" ? `📦 +${e.amount} gloanțe` : e.kind === "rawMeat" ? `🥩 +${e.amount} carne crudă` : `🍗 +${e.amount} carne friptă`);
        break;
      case "towerDestroyed":
        if (state.players[playerId] && !state.towers.some((t) => t.id === e.id)) this.hint("💥 Un turn a fost dărâmat!");
        break;
      case "dawn":
        if (e.wave < state.totalWaves) this.toast(`☀ Zorii! Zombii ard · +${e.wood} 🪵`);
        break;
      case "heroHit":
        if (e.id === heroId) this.damageFlash = Math.min(1, this.damageFlash + 0.5);
        break;
      case "heroDied":
        if (e.id === heroId) this.toast("Ai căzut!");
        break;
      case "shopRoll":
        if (e.playerId === playerId) this.landSpin(e.rarity, e.reward);
        break;
      // Ecranul final vine după câteva secunde: întâi vezi mina căzând (sau zorii victoriei).
      case "gameOver":
        if (state.mode === "survival") this.showEnd("Ai murit", `Iarna te-a înghițit. Ai rezistat ${state.wave} nopți din ${state.totalWaves} · 🧟 ${state.players[playerId].kills}`, 1800);
        else this.showEnd("Mina a căzut", `Zombii au ajuns la plasmă. Ai rezistat ${state.wave} nopți din ${state.totalWaves} · 🧟 ${state.players[playerId].kills}`, 3000);
        break;
      case "victory":
        this.showEnd("Ați supraviețuit iernii", `Toate cele ${state.totalWaves} nopți au trecut · 🧟 ${state.players[playerId].kills}`, 2000);
        break;
    }
  }

  // ---------- Construcție ----------

  /** Mod construcție: paleta (Turn / Zid / Mină) sau bara de plasare. */
  setBuildMode(mode: "off" | "palette" | "place"): void {
    this.el.buildBtn.classList.toggle("active", mode !== "off");
    this.el.palette.classList.toggle("hidden", mode !== "palette");
    this.el.placeBar.classList.toggle("hidden", mode !== "place");
    if (mode !== "palette") this.hideBuildMenu();
  }

  /** Meniul care apare după tap pe o construcție de-a ta (upgrade, mută, ușă…). */
  showBuildMenu(screenX: number, screenY: number, options: MenuOption[], title?: string): void {
    const m = this.el.buildMenu;
    m.innerHTML = "";
    m.classList.toggle("wide", options.length > 4);
    if (title) {
      const t = document.createElement("div");
      t.className = "menu-title";
      t.innerHTML = title;
      m.appendChild(t);
    }
    for (const opt of options) {
      const b = document.createElement("button");
      b.className = [opt.cancel ? "cancel" : "", opt.full ? "full" : "", opt.className ?? ""].join(" ").trim();
      b.disabled = !!opt.blocked;
      b.innerHTML = opt.label + (opt.blocked ? `<small class="reason">${opt.blocked}</small>` : opt.detail ? `<small>${opt.detail}</small>` : "");
      b.addEventListener("click", () => opt.onClick());
      m.appendChild(b);
    }
    m.classList.remove("hidden");
    // Deasupra punctului atins, dar mereu în întregime pe ecran.
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const x = Math.min(Math.max(screenX, w / 2 + 8), window.innerWidth - w / 2 - 8);
    const top = Math.min(Math.max(screenY - 24 - h, 8), window.innerHeight - h - 8);
    m.style.left = `${x}px`;
    m.style.top = `${top}px`;
  }

  hideBuildMenu(): void {
    this.el.buildMenu.classList.add("hidden");
  }

  /** Bara de plasare: ↻ (doar zid) / ✔ / ✖, cu motivul dacă nu se poate construi. */
  showPlaceBar(kind: PickKind, mode: "place" | "move", problem: string | null): void {
    this.el.wallRotate.classList.toggle("hidden", kind !== "wall");
    this.el.wallPlace.disabled = problem !== null;
    const cost =
      kind === "tower" ? towerCost()
      : kind === "wall" ? CONFIG.barricade.levels[0].cost
      : kind === "campfire" ? CONFIG.survival.campfireCost
      : kind === "well" ? CONFIG.survival.wellCost
      : CONFIG.survival.farmCost;
    this.text(this.el.wallPlace, mode === "move" ? "✔ Mută aici" : `✔ Pune · 🪵${cost}`);
    const help: Record<PickKind, string> = {
      tower: "Atinge locul unde vrei turnul",
      wall: "Atinge locul · zidurile se lipesc cap la cap",
      mine: "",
      campfire: "Focul te încălzește și gătește carnea",
      farmChicken: "Cotețul face găini din când în când",
      farmPig: "Țarcul face porci din când în când",
      well: "Fântâna are mereu apă: bei și îți umpli canistrele",
    };
    this.text(this.el.placeHint, problem ?? help[kind]);
    this.el.placeHint.classList.toggle("bad", problem !== null);
  }

  // ---------- Magazin ----------

  private renderOdds(): void {
    // O bară cu proporțiile reale ale șanselor + legenda.
    this.el.shopOdds.innerHTML =
      `<div class="odds-track">${CONFIG.shop.odds
        .map(({ rarity, chance }) => `<span class="seg bg-${rarity}" style="flex:${chance}"></span>`)
        .join("")}</div>` +
      `<div class="odds-legend">${CONFIG.shop.odds
        .map(({ rarity, chance }) => `<span class="r-${rarity}">● ${RARITY_NAMES[rarity]} ${+(chance * 100).toFixed(1)}%</span>`)
        .join("")}</div>`;
  }

  setShopOpen(open: boolean): void {
    this.el.shopModal.classList.toggle("hidden", !open);
    if (open) {
      this.cache.delete(this.el.shopRoll);
      if (this.lastState) this.updateShop(this.lastState, this.playerId, canShopRoll(this.lastState, this.playerId) === null, true);
    }
  }

  get shopOpen(): boolean {
    return !this.el.shopModal.classList.contains("hidden");
  }

  private updateShop(state: GameState, playerId: PlayerId, canRoll: boolean, force = false): void {
    const player = state.players[playerId];
    const hero = state.heroes.find((h) => h.id === player.heroId)!;
    this.text(this.el.shopCoins, String(player.coins));
    this.el.shopRoll.innerHTML = this.spinning ? "Se învârte…" : `${canRoll ? "Încearcă-ți norocul" : "Ai nevoie de"} · <i class="coin"></i> ${CONFIG.shop.cost}`;
    this.el.shopRoll.disabled = !canRoll || this.spinning;

    // Ce mai poți câștiga, pe rarități (premiile câștigate dispar din listă).
    const remaining = shopRemaining(player);
    const html = (["legendary", "epic", "rare", "common"] as ShopRarity[])
      .map((r) => {
        const chips = remaining[r].map((rw) => `<span class="chip" title="${describeReward(rw)}">${rewardIcon(rw)} ${describeReward(rw)}</span>`).join("");
        return `<div class="rem-row"><span class="rem-label r-${r}">${RARITY_NAMES[r]}</span><div class="chips">${chips || '<span class="chip done">tot câștigat ✓</span>'}</div></div>`;
      })
      .join("");
    if (force || this.cache.get(this.el.shopRemaining) !== html) {
      this.cache.set(this.el.shopRemaining, html);
      this.el.shopRemaining.innerHTML = html;
    }

    const gun = gunStats(state, hero);
    const stats = [
      ["🔫", "Armă", WEAPONS[player.weapon].name],
      ["🎯", "Încărcător", `${gun.magazine} gloanțe`],
      ["❤️", "Viață", `+${pct(player.maxHpBonus)}`],
      ["👟", "Viteză", `+${pct(player.speedBonus)}`],
      ["✚", "Regenerare", `${player.regenPerSec} HP/s`],
      ["🔧", "Reparat", `+${pct(player.repairBonus)}`],
      ["💣", "Mine", `${player.mines}`],
      ["🏰", "Turnuri", `până la nivel ${player.towerTier}`],
      ["🗼", "Locuri turn", `+${player.extraTowerSlots}`],
    ];
    // Ce ai câștigat iese în evidență; ce e încă la zero e estompat.
    const statsHtml = stats
      .map(([i, l, v]) => {
        const zero = /^\+?0(%| HP\/s)?$/.test(v) || v === "0";
        return `<div class="stat${zero ? " zero" : " gained"}"><span>${i} ${l}</span><b>${v}</b></div>`;
      })
      .join("");
    if (force || this.cache.get(this.el.shopStats) !== statsHtml) {
      this.cache.set(this.el.shopStats, statsHtml);
      this.el.shopStats.innerHTML = statsHtml;
    }
  }

  /**
   * Pornește „păcăneaua”: trei role care se învârt, apoi se opresc pe rând (≈3 secunde).
   * Rezultatul îl decide logica jocului; animația doar îl dezvăluie.
   */
  private startSpin(): void {
    this.spinning = true;
    this.pendingResult = null;
    this.el.shopResult.innerHTML = "";
    this.el.shopResult.className = "shop-result";
    // Timpul rolelor curge doar cât jocul nu e pe pauză (un apel nu-ți „consumă” păcăneaua).
    let elapsed = 0;
    let last = performance.now();
    const stopped = [false, false, false];
    let delay = 45;
    const tick = () => {
      const now = performance.now();
      if (this.paused) {
        last = now;
        window.setTimeout(tick, 120);
        return;
      }
      elapsed += now - last;
      last = now;
      const res = this.pendingResult;
      this.el.reels.forEach((r, i) => {
        if (stopped[i]) return;
        if (elapsed >= REEL_STOPS[i] && res) {
          stopped[i] = true;
          r.textContent = this.finalIcon(res, i);
          r.parentElement!.classList.add("stopped");
          this.cb.onReelStop();
          return;
        }
        r.textContent = REEL_ICONS[Math.floor(Math.random() * REEL_ICONS.length)];
        r.parentElement!.classList.remove("stopped");
      });
      if (stopped.every(Boolean)) {
        this.finishSpin();
        return;
      }
      if (elapsed > SPIN_TIME + 2500 && !res) {
        // Comanda n-a reușit (ex. nu mai aveai monede): oprim fără rezultat.
        this.spinning = false;
        for (const r of this.el.reels) r.textContent = "🎰";
        return;
      }
      this.cb.onSpinTick();
      delay = Math.min(180, delay * 1.035);
      window.setTimeout(tick, delay);
    };
    tick();
  }

  /** Ce simbol arată fiecare rolă la final: la JACKPOT (epic/legendar) toate trei sunt la fel. */
  private finalIcon(res: { rarity: ShopRarity; reward: ShopReward }, reel: number): string {
    const icon = rewardIcon(res.reward);
    if (res.rarity === "epic" || res.rarity === "legendary") return icon;
    if (reel === 1) return icon;
    if (res.rarity === "nothing") return ["💨", "🪨", "❄️"][reel];
    return REEL_ICONS[(REEL_ICONS.indexOf(icon) + reel * 3) % REEL_ICONS.length];
  }

  private landSpin(rarity: ShopRarity, reward: ShopReward): void {
    this.pendingResult = { rarity, reward };
  }

  private finishSpin(): void {
    const res = this.pendingResult!;
    this.spinning = false;
    const jackpot = res.rarity === "epic" || res.rarity === "legendary";
    const r = this.el.shopResult;
    r.className = `shop-result pop${jackpot ? " jackpot" : ""}`;
    r.innerHTML = `<div class="rarity r-${res.rarity}">${jackpot ? "★ JACKPOT ★ " : ""}${RARITY_NAMES[res.rarity]}</div><div class="reward">${rewardIcon(res.reward)} ${describeReward(res.reward)}</div>`;
    this.el.shopModal.querySelector(".modal")!.classList.toggle("jackpot-glow", jackpot);
    this.cb.onSpinResult(res.rarity);
    if (!this.shopOpen) this.toast(`${rewardIcon(res.reward)} ${describeReward(res.reward)}`);
  }

  // ---------- Mesaje ----------

  /** Mesaj mic lângă butoane (ex. de ce nu se poate face ceva). */
  hint(msg: string): void {
    this.el.hint.textContent = msg;
    this.el.hint.classList.add("show");
    this.hintTimer = 1.8;
  }

  private toast(msg: string, time = 2.4): void {
    this.el.toast.textContent = msg;
    // Mesajele lungi (pasive, boși) se scriu mai mic și pe mai multe rânduri, ca să încapă pe ecran.
    this.el.toast.classList.toggle("long", msg.length > 26);
    this.el.toast.classList.add("show");
    this.toastTimer = time;
  }

  /** Poziția pe ecran a barei minei (deasupra ei). null = nu se vede. */
  setMineScreen(pos: { x: number; y: number } | null): void {
    const el = this.el.mineHp;
    if (!pos) {
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    // Poziția prin left/top (nu prin transform): animațiile CSS nu o mai pot strica.
    el.style.left = `${Math.round(pos.x)}px`;
    el.style.top = `${Math.round(pos.y)}px`;
  }

  private fireLabels: HTMLElement[] = [];
  /** Etichetele focurilor de tabără (ca la mină): cât lemn mai au, deasupra fiecăruia. */
  setFireLabels(list: { x: number; y: number; ratio: number }[]): void {
    while (this.fireLabels.length < list.length) {
      const el = document.createElement("div");
      el.className = "world-bar fire-bar";
      el.innerHTML = `<div class="wb-label">🔥 Foc <b></b></div><div class="bar"><div class="fill fire"></div></div>`;
      this.el.hud.appendChild(el);
      this.fireLabels.push(el);
    }
    this.fireLabels.forEach((el, i) => {
      const f = list[i];
      if (!f) {
        el.style.display = "none";
        return;
      }
      el.style.display = "";
      el.style.left = `${Math.round(f.x)}px`;
      el.style.top = `${Math.round(f.y)}px`;
      const pct = Math.round(f.ratio * 100);
      this.text(el.querySelector("b")!, pct > 0 ? `${pct}%` : "stins");
      this.width(el.querySelector(".fill") as HTMLElement, f.ratio);
      el.classList.toggle("low", f.ratio < 0.25);
    });
  }

  // ---------- Butonul de acțiune, reînvierea, inventarul ----------

  /**
   * Butonul principal (✛) arată unealta din mână: arma = gloanțele; târnăcopul = doar iconița;
   * undița = „aruncă” / „TRAGE! 2/5”; lanterna = bateria (și cercul din jur se golește).
   */
  private toolKey = "";
  private updateActionButton(state: GameState, hero: Hero): void {
    const player = state.players[hero.playerId];
    const tool = player.tool;
    const bite = hero.hooked !== null;
    const pulls = hero.hooked ? CONFIG.gather.fish[hero.hooked].pulls : 0;
    const stick = this.el.fireStick;
    for (const t of ["gun", "pickaxe", "chainsaw", "rod", "lantern"]) stick.classList.toggle(`tool-${t}`, tool === t);
    stick.classList.toggle("bite", tool === "rod" && bite);
    if (tool === "gun") return;
    const icon = tool === "chainsaw" ? "🪚" : tool === "pickaxe" ? "⛏️" : tool === "rod" ? (bite ? "❗" : "🎣") : hero.lantern ? "🔦" : "🔦";
    const hint = actionHint(state, hero);
    const label =
      tool === "pickaxe" ? "" :
      tool === "chainsaw" ? (hero.sawFuel > 0 ? `⛽ ${Math.ceil(hero.sawFuel)}s` : player.inventory.petrol > 0 ? `⛽ ${player.inventory.petrol}` : "fără benzină") :
      tool === "rod" ? (bite ? `TRAGE ${Math.floor(hero.reel)}/${pulls}` : hint === "reel" ? "așteaptă" : hint === "fish" ? "aruncă" : "la baltă") :
      `${Math.round(hero.battery)}%`;
    const key = `${tool}|${icon}|${label}|${hero.lantern}`;
    if (key === this.toolKey) return;
    this.toolKey = key;
    this.text($("tool-icon"), icon);
    this.text(this.el.ammo, label);
    stick.classList.toggle("lantern-on", tool === "lantern" && hero.lantern);
  }

  private updateRevive(state: GameState, hero: GameState["heroes"][number]): void {
    const el = $("revive");
    const show = !hero.alive && state.phase !== "gameover";
    el.classList.toggle("hidden", !show);
    if (!show) return;
    const p = hero.reviveProgress / CONFIG.heroCommon.reviveTime;
    el.innerHTML = p > 0
      ? `Un coleg te ridică…<div class="bar"><div class="fill" style="width:${Math.round(p * 100)}%"></div></div>`
      : "Ai căzut. Doar un coleg te poate ridica (să stea lângă tine).";
  }

  private invOpen = false;
  toggleInventory(open = !this.invOpen): void {
    this.invOpen = open;
    if (!open) this.selectedItem = null;
    this.hotbarKey = "";
    $("inventory").classList.toggle("hidden", !open);
    if (open && this.lastState && this.playerId) this.renderInventory(this.lastState, this.playerId);
  }

  /**
   * Vibrația telefonului (Android / Chrome). Safari pe iPhone nu o are; în aplicația iOS
   * (Capacitor) o vom face cu pluginul Haptics.
   */
  private buzz(pattern: number | number[]): void {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // fără vibrație: nu e nimic de făcut
    }
  }

  // ---------- Bara rapidă (4 locuri) și inventarul (grilă), în stil Ark ----------

  /** Iconița, numele și câte ai dintr-un obiect; `fill` = bara subțire de sub iconiță (0..1). */
  private itemInfo(item: SlotItem, p: Player, hero: Hero): { icon: string; name: string; count: number | null; fill: number | null } {
    if (item.startsWith("weapon:")) {
      const id = item.slice(7) as WeaponId;
      const held = p.weapon === id;
      return { icon: WEAPON_ICONS[id], name: WEAPONS[id].name, count: null, fill: held ? hero.ammo / Math.max(1, gunStats(this.lastState!, hero).magazine) : null };
    }
    switch (item) {
      case "pickaxe":
        return { icon: "⛏️", name: "Târnăcop", count: null, fill: null };
      case "rod":
        return { icon: "🎣", name: "Undiță", count: null, fill: null };
      case "chainsaw":
        return { icon: "🪚", name: `Drujbă · ⛽ ${Math.ceil(hero.sawFuel)} s + ${p.inventory.petrol} bidoane`, count: p.inventory.petrol, fill: hero.sawFuel / CONFIG.chainsaw.tank };
      case "oil":
        return { icon: "🛢️", name: "Ulei brut · pune-l pe foc → benzină", count: p.inventory.oil, fill: null };
      case "petrol":
        return { icon: "⛽", name: "Benzină (pentru drujbă)", count: p.inventory.petrol, fill: null };
      case "leather":
        return { icon: "🟫", name: "Piele (pentru armuri)", count: p.inventory.leather, fill: null };
      case "iron":
        return { icon: "⛓️", name: "Fier (pentru armuri de metal)", count: p.inventory.iron, fill: null };
      case "lantern":
        return { icon: "🔦", name: hero.lantern ? "Lanternă (aprinsă)" : "Lanternă", count: null, fill: hero.battery / 100 };
      case "mine":
        return { icon: "💣", name: "Mină", count: p.mines, fill: null };
      case "cookedMeat":
        return { icon: "🍗", name: "Carne friptă", count: p.inventory.cookedMeat, fill: null };
      case "rawMeat":
        return { icon: "🥩", name: "Carne crudă", count: p.inventory.rawMeat, fill: null };
      case "canteen": {
        const full = p.inventory.canteen * CONFIG.survival.canteenDrinks;
        return { icon: "🧴", name: `Canistră · ${p.water}/${full} plinuri de apă`, count: p.water, fill: full > 0 ? p.water / full : 0 };
      }
      default: {
        const f = CONFIG.gather.fish[item as FishKind];
        return { icon: f.icon, name: `${f.name} · ${f.price} aur`, count: p.inventory[item as FishKind], fill: null };
      }
    }
  }

  /** Conținutul unei căsuțe (bară sau inventar): iconiță, număr, bara de jos. */
  private cellHtml(info: { icon: string; count: number | null; fill: number | null } | null, key?: string): string {
    if (!info) return key ? `<i class="qb-k">${key}</i>` : "";
    return `${key ? `<i class="qb-k">${key}</i>` : ""}<span class="qb-ico">${info.icon}</span>${
      info.count !== null ? `<b class="qb-n">${info.count}</b>` : ""}${
      info.fill !== null ? `<span class="qb-fill"><span style="width:${Math.round(Math.max(0, Math.min(1, info.fill)) * 100)}%"></span></span>` : ""}`;
  }

  private hotbarKey = "";
  private renderHotbar(state: GameState, p: Player, hero: Hero): void {
    const key = `${p.hotbar.join(",")}|${p.tool}|${p.weapon}|${hero.lantern}|${Math.round(hero.battery / 5)}|${hero.ammo}|${p.mines}|${Object.values(p.inventory).join(",")}|${p.water}|${this.selectedItem}`;
    if (key === this.hotbarKey) return;
    this.hotbarKey = key;
    p.hotbar.forEach((item, i) => {
      const btn = $<HTMLButtonElement>(`qb-${i}`);
      const info = item ? this.itemInfo(item, p, hero) : null;
      btn.innerHTML = this.cellHtml(info, String(i + 1));
      btn.title = info ? info.name : "Loc gol";
      const equipped = item === `weapon:${p.weapon}` ? p.tool === "gun" : item === p.tool;
      btn.classList.toggle("equipped", equipped);
      btn.classList.toggle("empty", !item || info?.count === 0);
      btn.classList.toggle("target", this.selectedItem !== null);
    });
    void state;
  }

  /** Obiectul ales în inventar (tap): următorul tap pe un loc din bară îl pune acolo. */
  private selectedItem: SlotItem | null = null;
  /** Tras cu degetul: obiectul, de unde vine (loc din bară sau inventar) și „fantoma” care urmărește degetul. */
  private drag: { item: SlotItem | null; fromSlot: number | null; ghost: HTMLElement | null; x: number; y: number; moved: boolean } | null = null;

  private onSlotClick(slot: number): void {
    if (this.selectedItem) {
      this.cb.onSetSlot(slot, this.selectedItem);
      this.selectedItem = null;
      this.invKey = this.hotbarKey = "";
      return;
    }
    this.cb.onUseSlot(slot);
  }

  /** Pornește un „drag” (de pe o căsuță din inventar sau din bară). */
  private startDrag(e: PointerEvent, item: SlotItem | null, fromSlot: number | null): void {
    this.drag = { item, fromSlot, ghost: null, x: e.clientX, y: e.clientY, moved: false };
  }

  private setupDrag(): void {
    window.addEventListener("pointermove", (e) => {
      const d = this.drag;
      if (!d || !d.item) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      if (!d.moved) {
        d.moved = true;
        const g = document.createElement("div");
        g.className = "drag-ghost";
        g.textContent = this.lastState && this.playerId ? this.itemInfo(d.item, this.lastState.players[this.playerId], this.myHero()!).icon : "";
        document.body.appendChild(g);
        d.ghost = g;
        $("quickbar").classList.add("dropping");
      }
      d.ghost!.style.left = `${e.clientX}px`;
      d.ghost!.style.top = `${e.clientY}px`;
    });
    window.addEventListener("pointerup", (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      $("quickbar").classList.remove("dropping");
      d.ghost?.remove();
      if (!d.moved) return; // a fost un tap: îl tratează click-ul
      // Unde l-a lăsat: pe un loc din bară = îl pune acolo; în afara barei (din bară) = golește locul.
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".qb-slot[id^='qb-']");
      const slot = el && el.id !== "qb-bag" ? Number(el.id.slice(3)) : -1;
      if (slot >= 0 && d.item) this.cb.onSetSlot(slot, d.item);
      else if (d.fromSlot !== null) this.cb.onSetSlot(d.fromSlot, null);
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 50);
      this.invKey = this.hotbarKey = "";
    });
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      $(`qb-${i}`).addEventListener("pointerdown", (e) => {
        const p = this.lastState && this.playerId ? this.lastState.players[this.playerId] : null;
        this.startDrag(e, p?.hotbar[i] ?? null, i);
      });
    }
  }
  private suppressClick = false;

  private myHero(): Hero | undefined {
    const st = this.lastState;
    if (!st || !this.playerId) return undefined;
    return st.heroes.find((h) => h.id === st.players[this.playerId!].heroId);
  }

  private invKey = "";
  private renderInventory(state: GameState, playerId: PlayerId): void {
    const p = state.players[playerId];
    const hero = state.heroes.find((h) => h.id === p.heroId)!;
    const items: SlotItem[] = [
      ...p.weapons.map((w) => `weapon:${w}` as SlotItem),
      "pickaxe", ...(p.chainsaw ? ["chainsaw" as SlotItem] : []), "rod", "lantern",
      ...(p.mines > 0 ? ["mine" as SlotItem] : []),
      ...(["canteen", "cookedMeat", "rawMeat", "oil", "petrol", "leather", "iron"] as SlotItem[]).filter((k) => p.inventory[k as "rawMeat"] > 0),
      ...FISH_KINDS.filter((k) => p.inventory[k] > 0),
    ];
    const key = `${items.join(",")}|${p.hotbar.join(",")}|${Object.values(p.inventory).join(",")}|${hero.reserve}|${p.wood}|${p.coins}|${p.mines}|${Math.round(hero.battery / 5)}|${this.selectedItem}|${JSON.stringify(hero.armor)}|${Math.ceil(hero.sawFuel)}`;
    if (key === this.invKey) return;
    this.invKey = key;
    const cells = Array.from({ length: Math.max(15, Math.ceil(items.length / 5) * 5) }, (_, i) => {
      const item = items[i];
      if (!item) return `<div class="inv-cell blank"></div>`;
      const info = this.itemInfo(item, p, hero);
      const inBar = p.hotbar.indexOf(item);
      return `<button class="inv-cell ${this.selectedItem === item ? "picked" : ""}" data-item="${item}" title="${info.name}">${this.cellHtml(info, inBar >= 0 ? String(inBar + 1) : undefined)}</button>`;
    }).join("");
    const sel = this.selectedItem ? this.itemInfo(this.selectedItem, p, hero).name : "Trage un obiect pe bara de jos";
    $("inventory").innerHTML =
      `<div class="inv-head"><span>INVENTAR</span><span class="inv-res">🪵 ${p.wood} · <i class="coin"></i> ${p.coins} · 📦 ${hero.reserve}</span><button class="inv-close">✕</button></div>` +
      `<div class="inv-body"><div class="inv-left"><div class="inv-grid">${cells}</div><div class="inv-sel">${sel}</div></div>${this.armorHtml(state, p, hero)}</div>`;
    $("inventory").querySelector(".inv-close")!.addEventListener("click", () => this.toggleInventory(false));
    for (const b of $("inventory").querySelectorAll<HTMLButtonElement>(".armor-craft[data-slot]")) {
      b.addEventListener("click", () => this.cb.onCraftArmor(b.dataset.slot as ArmorSlot, b.dataset.mat as ArmorMaterial));
    }
    for (const c of $("inventory").querySelectorAll<HTMLElement>(".inv-cell[data-item]")) {
      const item = c.dataset.item as SlotItem;
      c.addEventListener("pointerdown", (e) => this.startDrag(e, item, null));
      c.addEventListener("click", () => {
        if (this.suppressClick) return;
        // Tap: îl alegi (locurile din bară clipesc); încă un tap = renunți.
        this.selectedItem = this.selectedItem === item ? null : item;
        this.invKey = this.hotbarKey = "";
        this.renderInventory(state, playerId);
      });
    }
  }

  /** Armura: cele 4 locuri, ce porți și butoanele de făcut piese (piele / metal). */
  private armorHtml(state: GameState, p: Player, hero: Hero): string {
    const rows = ARMOR_SLOTS.map((slot) => {
      const worn = hero.armor[slot];
      const btn = (mat: ArmorMaterial) => {
        const c = armorCost(slot, mat);
        const why = canCraftArmor(state, p.id, slot, mat);
        const cost = `${c.leather ? `🟫${c.leather}` : ""}${c.iron ? ` ⛓️${c.iron}` : ""}`;
        return `<button class="armor-craft ${mat}" data-slot="${slot}" data-mat="${mat}" ${why ? `disabled title="${escapeHtml(why)}"` : ""}>${mat === "metal" ? "Metal" : "Piele"}<small>${cost}</small></button>`;
      };
      return `<div class="armor-row ${worn ?? ""}"><span class="armor-ico">${ARMOR_NAMES[slot].icon}</span><span class="armor-name">${ARMOR_NAMES[slot].name}<small>${worn === "metal" ? "metal" : worn === "leather" ? "piele" : "nimic"}</small></span>${btn("leather")}${btn("metal")}</div>`;
    }).join("");
    const set = armorSet(hero);
    const bonus = set === "leather" ? " · set de piele: frig −30%, +5% viteză" : set === "metal" ? " · set de metal: +10% armură" : "";
    return `<div class="inv-armor"><div class="armor-head">ARMURĂ · 🛡 ${Math.round(armorReduction(hero) * 100)}%${bonus}</div>${rows}<div class="armor-res">🟫 ${p.inventory.leather} piele · ⛓️ ${p.inventory.iron} fier</div></div>`;
  }

  // ---------- Meniul de nivel (apeși pe nivelul din stânga sus) ----------

  private levelOpen = false;
  private levelKey = "";
  toggleLevelMenu(open = !this.levelOpen): void {
    this.levelOpen = open;
    this.levelKey = "";
    $("level-menu").classList.toggle("hidden", !open);
    if (open && this.lastState && this.playerId) this.renderLevelMenu(this.myHero()!);
  }

  private renderLevelMenu(hero: Hero): void {
    const key = `${hero.level}|${hero.skillPoints}|${SKILL_IDS.map((k) => rank(hero, k)).join(",")}`;
    if (key === this.levelKey) return;
    this.levelKey = key;
    const max = CONFIG.skills.maxRank;
    const rows = SKILL_IDS.map((id) => {
      const info = SKILL_INFO[id];
      const r = rank(hero, id);
      const pips = Array.from({ length: max }, (_, i) => `<i class="pip ${i < r ? "on" : ""} ${i === 2 || i === 4 ? "star" : ""}"></i>`).join("");
      const can = hero.skillPoints > 0 && r < max;
      return `<div class="skill ${r >= max ? "maxed" : ""}">
        <span class="skill-ico">${info.icon}</span>
        <div class="skill-txt"><b>${info.name}</b><small>${info.perRank}</small>
          <div class="pips">${pips}</div>
          <small class="passive ${r >= 3 ? "on" : ""}">★3 ${info.passive3}</small>
          <small class="passive ${r >= 5 ? "on" : ""}">★5 ${info.passive5}</small>
        </div>
        <button class="skill-up" data-skill="${id}" ${can ? "" : "disabled"}>+</button>
      </div>`;
    }).join("");
    const road = LEVEL_ROAD.map(([lvl, what]) => `<span class="${hero.level >= lvl ? "got" : ""}">nv.${lvl} ${what}</span>`).join("");
    $("level-menu").innerHTML =
      `<div class="lvl-head"><span>NIVELUL ${hero.level}</span><span class="lvl-pts">${hero.skillPoints > 0 ? `${hero.skillPoints} ${hero.skillPoints === 1 ? "punct" : "puncte"} de pus` : "Fără puncte · crește în nivel"}</span><button class="lvl-close">✕</button></div>` +
      `<div class="skills">${rows}</div><div class="lvl-road">${road}</div>`;
    $("level-menu").querySelector(".lvl-close")!.addEventListener("click", () => this.toggleLevelMenu(false));
    for (const b of $("level-menu").querySelectorAll<HTMLButtonElement>(".skill-up")) {
      b.addEventListener("click", () => this.cb.onLearnSkill(b.dataset.skill as SkillId));
    }
  }

  private endTimer = 0;
  private showEnd(title: string, text: string, delayMs = 0): void {
    this.setShopOpen(false);
    clearTimeout(this.endTimer);
    this.endTimer = window.setTimeout(() => {
      this.el.endTitle.textContent = title;
      this.el.endText.textContent = text;
      this.el.endScreen.classList.remove("hidden");
    }, delayMs);
  }

  // Scriem în DOM doar când valoarea chiar se schimbă (DOM-ul e lent).
  private text(el: HTMLElement, value: string): void {
    if (this.cache.get(el) === value) return;
    this.cache.set(el, value);
    el.textContent = value;
  }

  private width(el: HTMLElement, ratio: number): void {
    const v = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
    if (el.style.width !== v) el.style.width = v;
  }
}
