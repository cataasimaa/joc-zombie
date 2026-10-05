// HUD-ul: afișează starea jocului în HTML peste canvas-ul 3D.
// Ca și randarea, doar CITEȘTE starea. Acțiunile jucătorului ies prin callback-uri.

import { CONFIG, slotsFor, towersOwnedBy, type GameEvent, type GameState, type PlayerId } from "../core";

export interface HudCallbacks {
  onToggleBuild(): void;
  onStartWave(): void;
  onBuildTower(): void;
  onCancelBuildMenu(): void;
  onRestart(): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private cache = new Map<HTMLElement, string>();
  private toastTimer = 0;

  private el = {
    shelterText: $("shelter-text"),
    shelterBar: $("shelter-bar"),
    heroText: $("hero-text"),
    heroLevel: $("hero-level"),
    heroBar: $("hero-bar"),
    xpBar: $("xp-bar"),
    waveText: $("wave-text"),
    timerText: $("timer-text"),
    startWave: $<HTMLButtonElement>("start-wave"),
    coins: $("coins-text"),
    slots: $("slots-text"),
    buildBtn: $<HTMLButtonElement>("build-btn"),
    buildBanner: $("build-banner"),
    buildMenu: $("build-menu"),
    buildTower: $<HTMLButtonElement>("build-tower"),
    buildError: $("build-error"),
    toast: $("toast"),
    endScreen: $("end-screen"),
    endTitle: $("end-title"),
    endText: $("end-text"),
  };

  constructor(cb: HudCallbacks) {
    $("tower-cost").textContent = String(CONFIG.tower.cost);
    this.el.buildBtn.addEventListener("click", () => cb.onToggleBuild());
    this.el.startWave.addEventListener("click", () => cb.onStartWave());
    this.el.buildTower.addEventListener("click", () => cb.onBuildTower());
    $("build-cancel").addEventListener("click", () => cb.onCancelBuildMenu());
    $("restart-btn").addEventListener("click", () => cb.onRestart());
  }

  update(state: GameState, playerId: PlayerId, events: GameEvent[], dt: number): void {
    const player = state.players[playerId];
    const hero = state.heroes.find((h) => h.id === player.heroId)!;

    // Bare de viață
    const sh = state.shelter;
    this.text(this.el.shelterText, `${Math.ceil(sh.hp)}/${sh.maxHp}`);
    this.width(this.el.shelterBar, sh.hp / sh.maxHp);
    this.text(this.el.heroLevel, `Nv. ${hero.level}`);
    this.text(this.el.heroText, hero.alive ? `${Math.ceil(hero.hp)}/${hero.maxHp}` : `reînvie în ${Math.ceil(hero.respawnTimer)}s`);
    this.width(this.el.heroBar, hero.hp / hero.maxHp);
    this.width(this.el.xpBar, hero.xp / CONFIG.xp.perLevel);

    // Val + cronometru
    if (state.phase === "build") {
      this.text(this.el.waveText, `Valul ${state.wave + 1}/${state.totalWaves} vine în`);
      const t = Math.max(0, Math.ceil(state.phaseTimer));
      this.text(this.el.timerText, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    } else if (state.phase === "wave") {
      this.text(this.el.waveText, `Valul ${state.wave}/${state.totalWaves}`);
      this.text(this.el.timerText, `🧟 ${state.zombies.length + state.zombiesToSpawn}`);
    }
    this.el.startWave.classList.toggle("hidden", state.phase !== "build");

    // Resurse
    this.text(this.el.coins, String(player.coins));
    this.text(this.el.slots, `${towersOwnedBy(state, playerId)}/${slotsFor(state)}`);

    for (const e of events) {
      if (e.type === "waveStarted") this.toast(`Valul ${e.wave}!`);
      if (e.type === "waveCleared" && e.wave < state.totalWaves) this.toast("Val respins! Construiește.");
      if (e.type === "levelUp" && e.heroId === hero.id) this.toast(`Nivelul ${e.level}!`);
      if (e.type === "heroDied" && e.id === hero.id) this.toast("Ai căzut!");
      if (e.type === "gameOver") this.showEnd("Adăpostul a fost distrus", `Familia nu a supraviețuit. Ai rezistat până la valul ${state.wave}.`);
      if (e.type === "victory") this.showEnd("Victorie!", `Ați respins toate cele ${state.totalWaves} valuri. Familia e în siguranță.`);
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove("show");
    }
  }

  setBuildMode(on: boolean): void {
    this.el.buildBtn.classList.toggle("active", on);
    this.el.buildBanner.classList.toggle("hidden", !on);
    if (!on) this.hideBuildMenu();
  }

  /** Meniul care apare după tap: „Turn” / „Baricadă”. `error` = de ce nu se poate construi. */
  showBuildMenu(screenX: number, screenY: number, error: string | null): void {
    const m = this.el.buildMenu;
    m.classList.remove("hidden");
    // Ținem meniul în interiorul ecranului.
    const x = Math.min(Math.max(screenX, 90), window.innerWidth - 90);
    const y = Math.max(screenY, 200);
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    this.el.buildTower.disabled = error !== null;
    this.el.buildError.textContent = error ?? "";
  }

  hideBuildMenu(): void {
    this.el.buildMenu.classList.add("hidden");
  }

  get buildMenuOpen(): boolean {
    return !this.el.buildMenu.classList.contains("hidden");
  }

  hideEnd(): void {
    this.el.endScreen.classList.add("hidden");
  }

  private showEnd(title: string, text: string): void {
    this.el.endTitle.textContent = title;
    this.el.endText.textContent = text;
    this.el.endScreen.classList.remove("hidden");
  }

  private toast(msg: string): void {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("show");
    this.toastTimer = 2;
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
