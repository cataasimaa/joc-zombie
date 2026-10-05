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
  SKINS,
  type ShopRarity,
  type ShopReward,
  WEAPONS,
  barricadeSlots,
  barricadesOf,
  canShopRoll,
  gunStats,
  shopRemaining,
  towerCost,
  towerSlots,
  towersOf,
  xpToNextLevel,
} from "../core";

export interface HudCallbacks {
  onPickHero(heroClass: HeroClass): void;
  onToggleBuild(): void;
  onPick(kind: "tower" | "wall" | "mine"): void;
  onStartNight(): void;
  onShopRoll(): void;
  onToggleMute(): boolean;
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
  return { nothing: "💨", wood: "🪵", mines: "💣", maxHp: "❤️", speed: "👟", regen: "✚", repair: "🔧", towerSlot: "🗼", towerTier: "🏰", weapon: "🔫", skin: "🎨" }[r.kind];
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
      return `Turnuri tier ${r.tier}`;
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

const REEL_ICONS = ["💨", "🪵", "💣", "❤️", "👟", "✚", "🔧", "🗼", "🏰", "🔫", "🎨", "💎"];
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
    buildBtn: $<HTMLButtonElement>("build-btn"),
    fireStick: $("fire-stick"),
    ammo: $("ammo-text"),
    reloadArc: document.getElementById("reload-arc") as unknown as SVGCircleElement,
    buildBanner: $("build-banner"),
    buildMenu: $("build-menu"),
    palette: $("build-palette"),
    pickTower: $<HTMLButtonElement>("pick-tower"),
    pickWall: $<HTMLButtonElement>("pick-wall"),
    pickMine: $<HTMLButtonElement>("pick-mine"),
    mineCost: $("mine-cost"),
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
    shopOdds: $("shop-odds"),
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
    $("palette-close").addEventListener("click", () => cb.onToggleBuild());
    this.el.ammo.addEventListener("click", () => cb.onReload());
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
    this.el.wallRotate.addEventListener("click", () => cb.onWallRotate());
    this.el.wallPlace.addEventListener("click", () => cb.onWallPlace());
    $("wall-done").addEventListener("click", () => cb.onWallDone());
    $("restart-btn").addEventListener("click", () => cb.onRestart());
    $("tower-cost").textContent = `🪵 ${towerCost()}`;
    $("wall-cost").textContent = `🪵 ${CONFIG.barricade.levels[0].cost}`;
    this.renderHeroCards();
    this.renderOdds();
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

  showHeroSelect(): void {
    this.el.heroSelect.classList.remove("hidden");
    this.el.hud.classList.add("hidden");
    this.el.endScreen.classList.add("hidden");
    this.setShopOpen(false);
  }

  /** Pregătește HUD-ul pentru eroul ales. */
  startGame(heroClass: HeroClass): void {
    this.cache.clear();
    this.el.heroSelect.classList.add("hidden");
    this.el.endScreen.classList.add("hidden");
    this.el.hud.classList.remove("hidden");
    const def = HERO_DEFS[heroClass];
    this.el.heroName.textContent = `${def.icon} ${def.name}`;
    this.el.shopResult.innerHTML = "";
    for (const r of this.el.reels) r.textContent = "🎰";
  }

  // ---------- Actualizare pe fiecare cadru ----------

  update(state: GameState, playerId: PlayerId, events: GameEvent[], dt: number): void {
    this.lastState = state;
    this.playerId = playerId;
    const player = state.players[playerId];
    const hero = state.heroes.find((h) => h.id === player.heroId)!;

    // Bare de viață
    const sh = state.shelter;
    this.text(this.el.shelterText, `${Math.ceil(sh.hp)}/${sh.maxHp}`);
    this.width(this.el.shelterBar, sh.hp / sh.maxHp);
    this.text(this.el.heroLevel, `Nv. ${hero.level}`);
    this.text(this.el.heroText, hero.alive ? `${Math.ceil(hero.hp)}/${hero.maxHp}` : `căzut · ${Math.ceil(hero.respawnTimer)}s`);
    this.width(this.el.heroBar, hero.hp / hero.maxHp);
    this.width(this.el.xpBar, hero.xp / xpToNextLevel(hero.level));

    // Muniție + cercul de reîncărcare de pe butonul de tras.
    const gun = gunStats(state, hero);
    this.text(this.el.ammo, hero.reloadTimer > 0 ? "↻" : `${hero.ammo}/${gun.magazine}`);
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
    this.text(this.el.towers, `${towersOf(state, playerId)}/${towerSlots(state, playerId)}`);
    this.text(this.el.barricades, `${barricadesOf(state, playerId)}/${barricadeSlots(state)}`);
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
        this.toast(e.boss ? `🌙 Noaptea ${e.wave} · ☠ vine Abominația` : `🌙 Se lasă noaptea… (${e.wave})`);
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
      case "gameOver":
        this.showEnd("Adăpostul a căzut", `Familia nu a mai văzut dimineața. Ai rezistat ${state.wave} nopți din ${state.totalWaves}.`);
        break;
      case "victory":
        this.showEnd("Ați supraviețuit iernii", `Toate cele ${state.totalWaves} nopți au trecut. Familia e în siguranță.`);
        break;
    }
  }

  // ---------- Construcție ----------

  /** Mod construcție: paleta (Turn / Zid / Mină) sau bara de plasare. */
  setBuildMode(mode: "off" | "palette" | "place"): void {
    this.el.buildBtn.classList.toggle("active", mode !== "off");
    this.el.palette.classList.toggle("hidden", mode !== "palette");
    this.el.buildBanner.classList.toggle("hidden", mode !== "palette");
    this.el.placeBar.classList.toggle("hidden", mode !== "place");
    if (mode !== "palette") this.hideBuildMenu();
  }

  /** Meniul care apare după tap pe o construcție de-a ta (upgrade, mută, ușă…). */
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
    const x = Math.min(Math.max(screenX, 100), window.innerWidth - 100);
    const y = Math.max(screenY, m.offsetHeight + 34);
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
  }

  hideBuildMenu(): void {
    this.el.buildMenu.classList.add("hidden");
  }

  /** Bara de plasare: ↻ (doar zid) / ✔ / ✖, cu motivul dacă nu se poate construi. */
  showPlaceBar(kind: "tower" | "wall", mode: "place" | "move", problem: string | null): void {
    this.el.wallRotate.classList.toggle("hidden", kind !== "wall");
    this.el.wallPlace.disabled = problem !== null;
    const cost = kind === "tower" ? towerCost() : CONFIG.barricade.levels[0].cost;
    this.text(this.el.wallPlace, mode === "move" ? "✔ Mută aici" : `✔ Pune · 🪵${cost}`);
    const help = kind === "tower" ? "Atinge locul unde vrei turnul" : "Atinge locul · zidurile se lipesc cap la cap";
    this.text(this.el.placeHint, problem ?? help);
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
    this.el.shopRoll.disabled = !canRoll || this.spinning;
    this.text(this.el.shopRoll, this.spinning ? "Se învârte…" : canRoll ? `Încearcă-ți norocul · 🪙 ${CONFIG.shop.cost}` : `Ai nevoie de 🪙 ${CONFIG.shop.cost}`);

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
      ["🏰", "Turnuri", `tier ${player.towerTier}`],
    ];
    const statsHtml = stats.map(([i, l, v]) => `<div class="stat"><span>${i} ${l}</span><b>${v}</b></div>`).join("");
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
    const start = performance.now();
    const stopped = [false, false, false];
    let delay = 45;
    const tick = () => {
      const elapsed = performance.now() - start;
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
