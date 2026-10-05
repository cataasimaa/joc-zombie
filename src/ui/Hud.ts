// HUD-ul: afișează starea jocului în HTML peste canvas-ul 3D.
// Ca și randarea, doar CITEȘTE starea. Acțiunile jucătorului ies prin callback-uri.

import {
  CONFIG,
  DEFAULT_SKIN_COLOR,
  type GameEvent,
  type GameState,
  HERO_DEFS,
  type HeroClass,
  type PlayerId,
  SHOP_POOLS,
  SKINS,
  type ShopRarity,
  type ShopReward,
  WEAPONS,
  abilityBlockedReason,
  barricadeSlots,
  barricadesOf,
  canShopRoll,
  heroRange,
  towerSlots,
  towersOf,
  xpToNextLevel,
} from "../core";

export interface HudCallbacks {
  onPickHero(heroClass: HeroClass): void;
  onToggleBuild(): void;
  onStartNight(): void;
  onUseAbility(slot: number): void;
  onPlaceMine(): void;
  onShopRoll(): void;
  onToggleMute(): boolean;
  onWallRotate(): void;
  onWallPlace(): void;
  onWallDone(): void;
  onRestart(): void;
}

export interface MenuOption {
  label: string;
  detail?: string;
  /** Dacă e setat, butonul e dezactivat și arată motivul. */
  blocked?: string | null;
  cancel?: boolean;
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
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function rewardIcon(r: ShopReward): string {
  return { nothing: "💨", wood: "🪵", mines: "💣", maxHp: "❤", speed: "👟", regen: "✚", repair: "🔧", towerSlot: "🗼", towerTier: "🏰", weapon: "🔫", skin: "🎨" }[r.kind];
}

export function describeReward(r: ShopReward): string {
  switch (r.kind) {
    case "nothing":
      return "Nimic. Ghinion!";
    case "wood":
      return `+${r.amount} lemn`;
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
      return `Turnuri tier ${r.tier} deblocate`;
    case "weapon":
      return `Armă nouă: ${WEAPONS[r.weaponId].name}`;
    case "skin":
      return `Skin nou: ${SKINS.find((s) => s.id === r.skinId)?.name ?? r.skinId}`;
  }
}

const fmtTime = (t: number) => {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export class Hud {
  private cache = new Map<HTMLElement, string>();
  private toastTimer = 0;
  private hintTimer = 0;
  private abilityButtons: HTMLButtonElement[] = [];
  private heroClass: HeroClass = "assault";
  private spinning = false;
  private pendingResult: { rarity: ShopRarity; reward: ShopReward } | null = null;

  private el = {
    hud: $("hud"),
    shelterText: $("shelter-text"),
    shelterBar: $("shelter-bar"),
    heroName: $("hero-name"),
    heroText: $("hero-text"),
    heroLevel: $("hero-level"),
    heroBar: $("hero-bar"),
    xpBar: $("xp-bar"),
    waveText: $("wave-text"),
    timerText: $("timer-text"),
    phaseBar: $("phase-bar"),
    startWave: $<HTMLButtonElement>("start-wave"),
    bossPanel: $("boss-panel"),
    bossBar: $("boss-bar"),
    wood: $("wood-text"),
    coins: $("coins-text"),
    towers: $("towers-text"),
    barricades: $("barricades-text"),
    shopBtn: $<HTMLButtonElement>("shop-btn"),
    muteBtn: $<HTMLButtonElement>("mute-btn"),
    mineBtn: $<HTMLButtonElement>("mine-btn"),
    mineCount: $("mine-count"),
    abilities: $("ability-buttons"),
    buildBtn: $<HTMLButtonElement>("build-btn"),
    buildBanner: $("build-banner"),
    buildMenu: $("build-menu"),
    wallBar: $("wall-bar"),
    wallHint: $("wall-hint"),
    wallPlace: $<HTMLButtonElement>("wall-place"),
    toast: $("toast"),
    hint: $("hint"),
    heroSelect: $("hero-select"),
    heroCards: $("hero-cards"),
    shopModal: $("shop-modal"),
    shopOdds: $("shop-odds"),
    shopReel: $("shop-reel"),
    shopResult: $("shop-result"),
    shopRoll: $<HTMLButtonElement>("shop-roll"),
    shopStats: $("shop-stats"),
    endScreen: $("end-screen"),
    endTitle: $("end-title"),
    endText: $("end-text"),
  };

  constructor(private cb: HudCallbacks) {
    this.el.buildBtn.addEventListener("click", () => cb.onToggleBuild());
    this.el.startWave.addEventListener("click", () => cb.onStartNight());
    this.el.mineBtn.addEventListener("click", () => cb.onPlaceMine());
    this.el.shopBtn.addEventListener("click", () => this.setShopOpen(true));
    $("shop-close").addEventListener("click", () => this.setShopOpen(false));
    this.el.shopRoll.addEventListener("click", () => {
      if (this.spinning) return;
      this.startSpin();
      cb.onShopRoll();
    });
    this.el.muteBtn.addEventListener("click", () => {
      this.el.muteBtn.textContent = cb.onToggleMute() ? "🔇" : "🔊";
    });
    $("wall-rotate").addEventListener("click", () => cb.onWallRotate());
    this.el.wallPlace.addEventListener("click", () => cb.onWallPlace());
    $("wall-done").addEventListener("click", () => cb.onWallDone());
    $("restart-btn").addEventListener("click", () => cb.onRestart());
    this.renderHeroCards();
    this.renderOdds();
  }

  // ---------- Alegerea eroului ----------

  private renderHeroCards(): void {
    this.el.heroCards.innerHTML = "";
    for (const [cls, def] of Object.entries(HERO_DEFS) as [HeroClass, (typeof HERO_DEFS)[HeroClass]][]) {
      const stats = CONFIG.heroes[cls];
      const [r, g, b] = DEFAULT_SKIN_COLOR[cls].map((v) => Math.round(v * 255 * 1.6));
      const card = document.createElement("button");
      card.className = "hero-card";
      card.innerHTML = `
        <div class="hc-head">
          <div class="hc-icon" style="background: rgb(${r},${g},${b})">${def.icon}</div>
          <div><div class="hc-name">${def.name}</div><div class="hc-role">${def.role}</div></div>
        </div>
        <div class="hc-desc">${def.description}</div>
        <div class="hc-abilities">${def.abilities
          .map((a, i) => `<span class="${i === 3 ? "ult" : ""}" title="${a.name}: ${a.description}">${a.icon}</span>`)
          .join("")}</div>
        <div class="hc-stats">❤ ${stats.maxHp} · 🎯 rază ${stats.range} · 💥 ${Math.round(stats.damage / stats.fireInterval)}/s</div>`;
      card.addEventListener("click", () => this.cb.onPickHero(cls));
      this.el.heroCards.appendChild(card);
    }
  }

  showHeroSelect(): void {
    this.el.heroSelect.classList.remove("hidden");
    this.el.hud.classList.add("hidden");
    this.el.endScreen.classList.add("hidden");
    this.setShopOpen(false);
  }

  /** Pregătește HUD-ul pentru eroul ales. */
  startGame(heroClass: HeroClass): void {
    this.heroClass = heroClass;
    this.cache.clear();
    this.el.heroSelect.classList.add("hidden");
    this.el.endScreen.classList.add("hidden");
    this.el.hud.classList.remove("hidden");
    const def = HERO_DEFS[heroClass];
    this.el.heroName.textContent = `${def.icon} ${def.name}`;
    this.el.shopResult.innerHTML = "";

    this.el.abilities.innerHTML = "";
    this.abilityButtons = def.abilities.map((a, slot) => {
      const btn = document.createElement("button");
      btn.className = `ability${slot === 3 ? " ult" : ""}`;
      btn.title = `${a.name}: ${a.description}`;
      btn.innerHTML = `<span class="icon">${a.icon}</span><span class="cd"></span><span class="cd-text"></span><span class="key">${slot + 1}</span>`;
      btn.addEventListener("click", () => this.cb.onUseAbility(slot));
      this.el.abilities.appendChild(btn);
      return btn;
    });
  }

  // ---------- Actualizare pe fiecare cadru ----------

  update(state: GameState, playerId: PlayerId, events: GameEvent[], dt: number): void {
    const player = state.players[playerId];
    const hero = state.heroes.find((h) => h.id === player.heroId)!;
    const def = HERO_DEFS[this.heroClass];

    // Bare de viață
    const sh = state.shelter;
    this.text(this.el.shelterText, `${Math.ceil(sh.hp)}/${sh.maxHp}`);
    this.width(this.el.shelterBar, sh.hp / sh.maxHp);
    this.text(this.el.heroLevel, `Nv. ${hero.level}`);
    this.text(this.el.heroText, hero.alive ? `${Math.ceil(hero.hp)}/${hero.maxHp}` : `căzut · ${Math.ceil(hero.respawnTimer)}s`);
    this.width(this.el.heroBar, hero.hp / hero.maxHp);
    this.width(this.el.xpBar, hero.xp / xpToNextLevel(hero.level));

    // Zi / noapte + cronometru
    const night = state.phase === "night";
    this.el.hud.classList.toggle("is-night", night);
    if (state.phase === "day") {
      this.text(this.el.waveText, state.wave === 0 ? "☀ Prima zi · construiește!" : `☀ Ziua ${state.wave + 1} · construiește!`);
      this.text(this.el.timerText, `noaptea vine în ${fmtTime(state.phaseTimer)}`);
    } else if (night) {
      this.text(this.el.waveText, `🌙 Noaptea ${state.wave}/${state.totalWaves}`);
      const left = state.zombies.filter((z) => !z.fleeing).length + state.spawnQueue.length;
      this.text(this.el.timerText, `🧟 ${left} · zori în ${fmtTime(state.phaseTimer)}`);
    }
    this.width(this.el.phaseBar, state.phaseDuration > 0 ? 1 - state.phaseTimer / state.phaseDuration : 0);
    this.el.startWave.classList.toggle("hidden", state.phase !== "day");

    const boss = state.zombies.find((z) => z.type === "boss" && !z.fleeing);
    this.el.bossPanel.classList.toggle("hidden", !boss);
    if (boss) this.width(this.el.bossBar, boss.hp / boss.maxHp);

    // Resurse
    this.text(this.el.wood, String(player.wood));
    this.text(this.el.coins, String(player.coins));
    this.text(this.el.towers, `${towersOf(state, playerId)}/${towerSlots(state, playerId)}`);
    this.text(this.el.barricades, `${barricadesOf(state, playerId)}/${barricadeSlots(state)}`);
    this.text(this.el.mineCount, String(player.mines));
    this.el.mineBtn.classList.toggle("empty", player.mines <= 0);
    const canRoll = canShopRoll(state, playerId) === null;
    this.el.shopBtn.classList.toggle("can-open", canRoll);

    // Abilități: cooldown (cerc care se golește), blocată, ultimate încă închisă.
    this.abilityButtons.forEach((btn, slot) => {
      const cd = hero.cooldowns[slot];
      const total = def.abilities[slot].cooldown;
      const locked = slot === 3 && hero.level < CONFIG.ultLevel;
      const blocked = abilityBlockedReason(state, hero, slot) !== null;
      btn.style.setProperty("--cd", cd > 0 ? String(cd / total) : "0");
      this.text(btn.querySelector(".cd-text")!, locked ? `🔒${CONFIG.ultLevel}` : cd > 0 ? String(Math.ceil(cd)) : "");
      btn.classList.toggle("locked", locked);
      btn.classList.toggle("blocked", blocked && !locked);
      btn.classList.toggle("ready", !blocked);
    });

    // Magazin (dacă e deschis)
    if (!this.el.shopModal.classList.contains("hidden")) {
      this.el.shopRoll.disabled = !canRoll || this.spinning;
      this.text(this.el.shopRoll, this.spinning ? "Se învârte…" : `Încearcă-ți norocul · 🪙 ${CONFIG.shop.cost}`);
      const w = WEAPONS[player.weapon];
      this.text(
        this.el.shopStats,
        `🔫 ${w.name} · ❤ +${pct(player.maxHpBonus)} · 👟 +${pct(player.speedBonus)} · ✚ ${player.regenPerSec} HP/s · ` +
          `🔧 +${pct(player.repairBonus)} · 💣 ${player.mines} · 🏰 tier ${player.towerTier} · 🎯 rază ${heroRange(state, hero)}`,
      );
    }

    for (const e of events) this.handleEvent(state, playerId, hero.id, e);

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.classList.remove("show");
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove("show");
    }
  }

  private handleEvent(state: GameState, playerId: PlayerId, heroId: number, e: GameEvent): void {
    switch (e.type) {
      case "nightStarted":
        this.toast(e.boss ? `🌙 Noaptea ${e.wave} · ☠ vine Abominația` : `🌙 Se lasă noaptea… (${e.wave})`);
        break;
      case "dawn":
        if (e.wave < state.totalWaves) this.toast(`☀ S-a făcut ziuă! +${e.wood} 🪵`);
        break;
      case "levelUp":
        if (e.heroId === heroId) {
          this.toast(e.level === CONFIG.ultLevel ? `Nivelul ${e.level}! Ultimate deblocat ★` : `Nivelul ${e.level}!`);
        }
        break;
      case "heroDied":
        if (e.id === heroId) this.toast("Ai căzut!");
        break;
      case "heroRevived":
        if (e.id === heroId) this.toast("Ai fost reînviat!");
        break;
      case "shopRoll":
        if (e.playerId === playerId) this.landSpin(e.rarity, e.reward);
        break;
      case "gameOver":
        this.showEnd("Adăpostul a căzut", `Familia nu a mai văzut dimineața. Ai rezistat ${state.wave} nopți din ${state.totalWaves}.`);
        break;
      case "victory":
        this.showEnd("Ați supraviețuit iernii", `Toate cele ${state.totalWaves} nopți au trecut. Familia e în siguranță.`);
        break;
    }
  }

  // ---------- Construcție ----------

  setBuildMode(on: boolean): void {
    this.el.buildBtn.classList.toggle("active", on);
    this.el.buildBanner.classList.toggle("hidden", !on);
    if (!on) {
      this.hideBuildMenu();
      this.hideWallBar();
    }
  }

  /** Meniul care apare după tap, cu opțiunile date (ex. Turn / Zid / Upgrade). */
  showBuildMenu(screenX: number, screenY: number, options: MenuOption[]): void {
    const m = this.el.buildMenu;
    m.innerHTML = "";
    for (const opt of options) {
      const b = document.createElement("button");
      if (opt.cancel) b.className = "cancel";
      b.disabled = !!opt.blocked;
      b.innerHTML = opt.label + (opt.blocked ? `<small class="reason">${opt.blocked}</small>` : opt.detail ? `<small>${opt.detail}</small>` : "");
      b.addEventListener("click", () => opt.onClick());
      m.appendChild(b);
    }
    m.classList.remove("hidden");
    // Ținem meniul în interiorul ecranului.
    const x = Math.min(Math.max(screenX, 100), window.innerWidth - 100);
    const y = Math.max(screenY, m.offsetHeight + 34);
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
  }

  hideBuildMenu(): void {
    this.el.buildMenu.classList.add("hidden");
  }

  /** Bara de jos cu ↻ / ✔ / ✖ când pui sau muți un zid. */
  showWallBar(mode: "place" | "move", problem: string | null): void {
    this.el.wallBar.classList.remove("hidden");
    this.el.buildBanner.classList.add("hidden");
    this.el.wallPlace.disabled = problem !== null;
    this.text(this.el.wallPlace, mode === "move" ? "✔ Mută aici" : `✔ Pune · 🪵${CONFIG.barricade.levels[0].cost}`);
    this.text(
      this.el.wallHint,
      problem ?? (mode === "move" ? "Atinge unde vrei zidul" : "Atinge locul · zidurile se lipesc cap la cap"),
    );
    this.el.wallHint.classList.toggle("bad", problem !== null);
  }

  hideWallBar(): void {
    this.el.wallBar.classList.add("hidden");
  }

  // ---------- Magazin ----------

  private renderOdds(): void {
    this.el.shopOdds.innerHTML = CONFIG.shop.odds
      .map(({ rarity, chance }) => {
        const examples = [...new Set(SHOP_POOLS[rarity].map(rewardIcon))].join("");
        return `<div class="odd r-${rarity}">${RARITY_NAMES[rarity]}<b>${+(chance * 100).toFixed(1)}%</b><span>${examples}</span></div>`;
      })
      .join("");
  }

  setShopOpen(open: boolean): void {
    this.el.shopModal.classList.toggle("hidden", !open);
    if (open) {
      this.cache.delete(this.el.shopRoll);
      this.cache.delete(this.el.shopStats);
      if (!this.spinning && !this.el.shopResult.innerHTML) this.el.shopReel.textContent = "🎲";
    }
  }

  get shopOpen(): boolean {
    return !this.el.shopModal.classList.contains("hidden");
  }

  /** Pornește „păcăneaua”: iconițele se schimbă repede, apoi încetinesc. */
  private startSpin(): void {
    this.spinning = true;
    this.pendingResult = null;
    this.el.shopResult.innerHTML = "";
    this.el.shopReel.classList.add("spinning");
    const icons = ["💨", "🪵", "💣", "❤", "👟", "✚", "🔧", "🗼", "🏰", "🔫", "🎨"];
    const start = performance.now();
    let delay = 50;
    const tick = () => {
      this.el.shopReel.textContent = icons[Math.floor(Math.random() * icons.length)];
      const elapsed = performance.now() - start;
      if (elapsed > 1100 && this.pendingResult) {
        this.finishSpin();
        return;
      }
      if (elapsed > 3000) {
        // Comanda n-a reușit (ex. nu mai aveai monede): oprim fără rezultat.
        this.spinning = false;
        this.el.shopReel.classList.remove("spinning");
        this.el.shopReel.textContent = "🎲";
        return;
      }
      delay = Math.min(220, delay * 1.08);
      window.setTimeout(tick, delay);
    };
    tick();
  }

  private landSpin(rarity: ShopRarity, reward: ShopReward): void {
    if (!this.spinning) {
      // A venit dintr-o comandă fără animație (ex. tastatură): arătăm direct.
      this.pendingResult = { rarity, reward };
      this.finishSpin();
      return;
    }
    this.pendingResult = { rarity, reward };
  }

  private finishSpin(): void {
    const res = this.pendingResult!;
    this.spinning = false;
    this.el.shopReel.classList.remove("spinning");
    this.el.shopReel.textContent = rewardIcon(res.reward);
    const r = this.el.shopResult;
    r.classList.remove("pop");
    void r.offsetWidth; // repornește animația
    r.classList.add("pop");
    r.innerHTML = `<div class="rarity r-${res.rarity}">${RARITY_NAMES[res.rarity]}</div><div class="reward">${describeReward(res.reward)}</div>`;
    this.el.shopReel.className = `reel r-${res.rarity}`;
    if (!this.shopOpen) this.toast(`${rewardIcon(res.reward)} ${describeReward(res.reward)}`);
  }

  // ---------- Mesaje ----------

  /** Mesaj mic lângă butoane (ex. de ce nu merge o abilitate). */
  hint(msg: string): void {
    this.el.hint.textContent = msg;
    this.el.hint.classList.add("show");
    this.hintTimer = 1.8;
  }

  private toast(msg: string): void {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("show");
    this.toastTimer = 2.4;
  }

  private showEnd(title: string, text: string): void {
    this.el.endTitle.textContent = title;
    this.el.endText.textContent = text;
    this.el.endScreen.classList.remove("hidden");
    this.setShopOpen(false);
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
