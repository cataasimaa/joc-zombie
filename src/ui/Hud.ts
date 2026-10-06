// HUD-ul: afișează starea jocului în HTML peste canvas-ul 3D.
// Ca și randarea, doar CITEȘTE starea. Acțiunile jucătorului ies prin callback-uri.

import {
  type ActionHint,
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

export type PickKind = "tower" | "wall" | "mine" | "campfire" | "farmChicken" | "farmPig";

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
const WEAPON_ICONS: Record<WeaponId, string> = { rusty: "🔫", hunting: "🎯", scattergun: "💥", pipeGun: "🔩", boneBow: "🏹", iceLance: "❄️" };

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
    phaseBar: $("phase-bar"),
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
    hungerBar: $("hunger-bar"),
    warmthBar: $("warmth-bar"),
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
    this.el.buildBtn.addEventListener("click", () => cb.onToggleBuild());
    this.el.startWave.addEventListener("click", () => cb.onStartNight());
    this.el.pickTower.addEventListener("click", () => cb.onPick("tower"));
    this.el.pickWall.addEventListener("click", () => cb.onPick("wall"));
    this.el.pickMine.addEventListener("click", () => cb.onPick("mine"));
    for (const kind of ["campfire", "farmChicken", "farmPig"] as PickKind[]) $(`pick-${kind}`).addEventListener("click", () => cb.onPick(kind));
    $("campfire-cost").textContent = `🪵 ${CONFIG.survival.campfireCost}`;
    $("chicken-cost").textContent = `🪵 ${CONFIG.survival.farmCost}`;
    $("pig-cost").textContent = `🪵 ${CONFIG.survival.farmCost}`;
    for (let i = 0; i < HOTBAR_SIZE; i++) $(`qb-${i}`).addEventListener("click", () => this.onSlotClick(i));
    $("qb-bag").addEventListener("click", () => this.toggleInventory());
    // Butonul de acțiune: ții apăsat (târnăcop), sau apeși o dată (undiță, vânzare).
    const act = $("act-btn");
    const press = (on: boolean) => (e: Event) => {
      e.preventDefault();
      act.classList.toggle("held", on);
      cb.onAction(on);
    };
    act.addEventListener("pointerdown", press(true));
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) act.addEventListener(ev, press(false));
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

    // Muniție + cercul de reîncărcare de pe butonul de tras.
    const gun = gunStats(state, hero);
    this.text(this.el.ammo, hero.reloadTimer > 0 ? "↻" : `${hero.ammo}/${hero.reserve}`);
    this.el.fireStick.classList.toggle("empty", hero.ammo <= 0 && hero.reserve <= 0);
    this.el.fireStick.classList.toggle("reloading", hero.reloadTimer > 0);
    this.el.fireStick.classList.toggle("low", hero.reloadTimer <= 0 && hero.ammo <= Math.ceil(gun.magazine * 0.25));
    const progress = hero.reloadTimer > 0 ? 1 - hero.reloadTimer / gun.reloadTime : 0;
    this.el.reloadArc.style.strokeDashoffset = String(289 * (1 - progress));

    // Zi / noapte + cronometru
    const night = state.phase === "night";
    this.el.hud.classList.toggle("is-night", night);
    if (state.phase === "day") {
      this.text(this.el.waveText, state.wave === 0 ? "☀ Prima zi · construiește!" : `☀ Ziua ${state.wave + 1} · construiește!`);
      this.text(this.el.timerText, `noaptea vine în ${fmtTime(state.phaseTimer)}`);
    } else if (night) {
      this.text(this.el.waveText, `🌙 Noaptea ${state.wave}/${state.totalWaves}`);
      const left = state.zombies.filter((z) => !z.burning).length + state.spawnQueue.length;
      this.text(this.el.timerText, `🧟 ${left} · zori în ${fmtTime(state.phaseTimer)}`);
    }
    this.width(this.el.phaseBar, state.phaseDuration > 0 ? 1 - state.phaseTimer / state.phaseDuration : 0);
    this.el.startWave.classList.toggle("hidden", state.phase !== "day");

    const boss = state.zombies.find((z) => z.type === "boss");
    this.el.bossPanel.classList.toggle("hidden", !boss);
    if (boss) this.width(this.el.bossBar, boss.hp / boss.maxHp);

    // Resurse
    this.text(this.el.wood, String(player.wood));
    this.text(this.el.coins, String(player.coins));
    // Supraviețuire: foame, căldură, bara rapidă. Vremea pentru toți.
    const survival = state.mode === "survival";
    this.el.survivalBars.classList.toggle("hidden", !survival);
    this.el.hud.classList.toggle("survival", survival);
    if (survival) {
      this.width(this.el.hungerBar, hero.hunger / 100);
      this.width(this.el.warmthBar, hero.warmth / 100);
      this.el.hungerBar.parentElement!.classList.toggle("alert", hero.hunger < 20);
      this.el.warmthBar.parentElement!.classList.toggle("alert", hero.warmth < 20);
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
        this.toast(e.boss ? `🌙 Noaptea ${e.wave} · ☠ vine Lich-ul de gheață` : `🌙 Se lasă noaptea… (${e.wave})`);
        break;
      case "chestDropped":
        this.toast("🎁 Lich-ul a lăsat un cufăr! Trage în el ca să-l spargi!", 3.5);
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
      case "levelUp":
        if (e.heroId === heroId) this.toast(`Nivelul ${e.level}!`);
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
      : CONFIG.survival.farmCost;
    this.text(this.el.wallPlace, mode === "move" ? "✔ Mută aici" : `✔ Pune · 🪵${cost}`);
    const help: Record<PickKind, string> = {
      tower: "Atinge locul unde vrei turnul",
      wall: "Atinge locul · zidurile se lipesc cap la cap",
      mine: "",
      campfire: "Focul te încălzește și gătește carnea",
      farmChicken: "Cotețul face găini din când în când",
      farmPig: "Țarcul face porci din când în când",
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

  private actKey = "";
  private updateActionButton(state: GameState, hero: GameState["heroes"][number]): void {
    const hint: ActionHint = actionHint(state, hero);
    const bite = hero.hooked !== null;
    const pulls = hero.hooked ? CONFIG.gather.fish[hero.hooked].pulls : 0;
    const look: Record<Exclude<ActionHint, null>, [string, string]> = {
      chop: ["🪓", "taie"],
      mine: ["⛏️", "minează"],
      hunt: ["🔪", "taie"],
      fish: ["🎣", "pescuiește"],
      reel: [bite ? "❗" : "🎣", bite ? `TRAGE! ${hero.reel}/${pulls}` : "așteaptă"],
      sell: ["💰", "vinde"],
    };
    const key = `${hint}|${bite}|${hero.reel}`;
    const btn = $("act-btn");
    btn.classList.toggle("hidden", hint === null);
    btn.classList.toggle("alert", bite);
    if (key === this.actKey || !hint) return;
    this.actKey = key;
    $("act-ico").textContent = look[hint][0];
    $("act-label").textContent = look[hint][1];
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
    if (!open) this.pendingSlotItem = null;
    this.hotbarKey = "";
    $("inventory").classList.toggle("hidden", !open);
    if (open && this.lastState && this.playerId) this.renderInventory(this.lastState, this.playerId);
  }

  // ---------- Bara rapidă (4 locuri, le aranjezi tu) ----------

  /** Iconița, numele și câte ai dintr-un obiect. */
  private itemInfo(item: SlotItem, p: Player, hero: Hero): { icon: string; name: string; help: string; count: number | null } {
    if (item.startsWith("weapon:")) {
      const id = item.slice(7) as WeaponId;
      return { icon: WEAPON_ICONS[id], name: WEAPONS[id].name, help: "o iei în mână (tragi cu ✛)", count: null };
    }
    switch (item) {
      case "pickaxe":
        return { icon: "⛏️", name: "Târnăcop", help: "îl iei în mână: tai brazi, spargi piatră, tai animale (tragi cu ✛)", count: null };
      case "lantern":
        return { icon: hero.lantern ? "🔦" : "🌑", name: "Lanternă", help: "o aprinzi / stingi (noaptea luminează în jur)", count: null };
      case "mine":
        return { icon: "💣", name: "Mină", help: "o pui unde stai; explodează când trece un zombi", count: p.mines };
      case "cookedMeat":
        return { icon: "🍗", name: "Carne friptă", help: "+45 foame, +10 viață", count: p.inventory.cookedMeat };
      case "rawMeat":
        return { icon: "🥩", name: "Carne crudă", help: "o pui pe focul de lângă tine (15 s) sau o mănânci crudă", count: p.inventory.rawMeat };
      default: {
        const f = CONFIG.gather.fish[item as FishKind];
        return { icon: f.icon, name: f.name, help: `se vinde la tarabă cu ${f.price} aur (sau o mănânci)`, count: p.inventory[item as FishKind] };
      }
    }
  }

  private hotbarKey = "";
  private renderHotbar(state: GameState, p: Player, hero: Hero): void {
    const key = `${p.hotbar.join(",")}|${p.tool}|${p.weapon}|${hero.lantern}|${p.mines}|${Object.values(p.inventory).join(",")}|${this.pendingSlotItem}`;
    if (key === this.hotbarKey) return;
    this.hotbarKey = key;
    p.hotbar.forEach((item, i) => {
      const btn = $<HTMLButtonElement>(`qb-${i}`);
      const info = item ? this.itemInfo(item, p, hero) : null;
      (btn.querySelector(".qb-ico") as HTMLElement).textContent = info ? info.icon : "";
      (btn.querySelector(".qb-n") as HTMLElement).textContent = info?.count !== null && info?.count !== undefined ? String(info.count) : "";
      btn.title = info ? `${info.name}: ${info.help}` : "Loc gol (pune ceva din 🎒)";
      const equipped = item === "pickaxe" ? p.tool === "pickaxe" : item === `weapon:${p.weapon}` && p.tool === "gun";
      btn.classList.toggle("equipped", equipped);
      btn.classList.toggle("empty", !item || (info?.count === 0));
      btn.classList.toggle("target", this.pendingSlotItem !== null);
    });
    void state;
  }

  /** Obiectul ales în inventar care așteaptă un loc din bară (tap pe un loc = îl pui acolo). */
  private pendingSlotItem: SlotItem | null = null;
  private onSlotClick(slot: number): void {
    if (this.pendingSlotItem) {
      this.cb.onSetSlot(slot, this.pendingSlotItem);
      this.pendingSlotItem = null;
      this.invKey = "";
      return;
    }
    this.cb.onUseSlot(slot);
  }

  private invKey = "";
  private renderInventory(state: GameState, playerId: PlayerId): void {
    const p = state.players[playerId];
    const hero = state.heroes.find((h) => h.id === p.heroId)!;
    const items: SlotItem[] = [
      ...p.weapons.map((w) => `weapon:${w}` as SlotItem),
      "pickaxe", "lantern", "mine", "cookedMeat", "rawMeat",
      ...FISH_KINDS.filter((k) => p.inventory[k] > 0),
    ];
    const key = `${items.join(",")}|${p.hotbar.join(",")}|${Object.values(p.inventory).join(",")}|${hero.reserve}|${p.wood}|${p.coins}|${p.mines}|${this.pendingSlotItem}`;
    if (key === this.invKey) return;
    this.invKey = key;
    const el = $("inventory");
    const row = (item: SlotItem) => {
      const info = this.itemInfo(item, p, hero);
      const slots = Array.from({ length: HOTBAR_SIZE }, (_, i) =>
        `<button class="slot-btn ${p.hotbar[i] === item ? "on" : ""}" data-item="${item}" data-slot="${i}" title="Pune în locul ${i + 1}">${i + 1}</button>`).join("");
      return `<div class="inv-row ${this.pendingSlotItem === item ? "picked" : ""}" data-pick="${item}"><span class="inv-ico">${info.icon}</span><span class="inv-name">${info.name}<small>${info.help}</small></span><b>${info.count ?? ""}</b><span class="slot-btns">${slots}</span></div>`;
    };
    const plain = (ico: string, name: string, help: string, n: number) =>
      `<div class="inv-row"><span class="inv-ico">${ico}</span><span class="inv-name">${name}<small>${help}</small></span><b>${n}</b></div>`;
    el.innerHTML = `<h3>🎒 Inventar <small>· apasă 1–4 ca să pui obiectul în bara de jos</small></h3>` +
      items.map(row).join("") +
      plain("📦", "Gloanțe", "în rezervă", hero.reserve) +
      plain("🪵", "Lemn", "construcții; tai brazi cu târnăcopul", p.wood) +
      plain("🪙", "Aur", "magazinul norocului; pește, vânat, zăcăminte", p.coins);
    for (const b of el.querySelectorAll<HTMLButtonElement>("button[data-slot]")) {
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const slot = Number(b.dataset.slot);
        const item = b.dataset.item as SlotItem;
        this.cb.onSetSlot(slot, p.hotbar[slot] === item ? null : item);
      });
    }
    // Tap pe un rând = îl „ridici”; apoi tap pe un loc din bara de jos = îl pui acolo.
    for (const r of el.querySelectorAll<HTMLElement>(".inv-row[data-pick]")) {
      r.addEventListener("click", () => {
        const item = r.dataset.pick as SlotItem;
        this.pendingSlotItem = this.pendingSlotItem === item ? null : item;
        this.invKey = "";
        this.hotbarKey = "";
        this.renderInventory(state, playerId);
      });
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
