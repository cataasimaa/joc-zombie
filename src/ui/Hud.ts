// HUD-ul: afișează starea jocului în HTML peste canvas-ul 3D.
// Ca și randarea, doar CITEȘTE starea. Acțiunile jucătorului ies prin callback-uri.

import {
  CONFIG,
  type ChestReward,
  DEFAULT_SKIN_COLOR,
  type GameEvent,
  type GameState,
  HERO_DEFS,
  type HeroClass,
  type PlayerId,
  type Rarity,
  SKINS,
  abilityBlockedReason,
  builtBy,
  canOpenChest,
  slotsFor,
  xpToNextLevel,
} from "../core";

export interface HudCallbacks {
  onPickHero(heroClass: HeroClass): void;
  onToggleBuild(): void;
  onStartWave(): void;
  onUseAbility(slot: number): void;
  onOpenChest(): void;
  onToggleMute(): boolean;
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

const RARITY_NAMES: Record<Rarity, string> = {
  common: "Comun",
  rare: "Rar",
  epic: "Epic",
  legendary: "Legendar",
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function describeReward(r: ChestReward): string {
  switch (r.kind) {
    case "wood":
      return `🪵 +${r.amount} lemn`;
    case "weapon":
      return `🔫 Armă mai bună: +${Math.round(r.bonus * 100)}% damage`;
    case "towerTier":
      return `🗼 Turnuri tier ${r.tier} deblocate`;
    case "skin":
      return `🎨 Skin nou: ${SKINS.find((s) => s.id === r.skinId)?.name ?? r.skinId}`;
  }
}

export class Hud {
  private cache = new Map<HTMLElement, string>();
  private toastTimer = 0;
  private hintTimer = 0;
  private abilityButtons: HTMLButtonElement[] = [];
  private heroClass: HeroClass = "assault";

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
    startWave: $<HTMLButtonElement>("start-wave"),
    bossPanel: $("boss-panel"),
    bossBar: $("boss-bar"),
    wood: $("wood-text"),
    coins: $("coins-text"),
    towers: $("towers-text"),
    barricades: $("barricades-text"),
    chestBtn: $<HTMLButtonElement>("chest-btn"),
    muteBtn: $<HTMLButtonElement>("mute-btn"),
    abilities: $("ability-buttons"),
    buildBtn: $<HTMLButtonElement>("build-btn"),
    buildBanner: $("build-banner"),
    buildMenu: $("build-menu"),
    toast: $("toast"),
    hint: $("hint"),
    heroSelect: $("hero-select"),
    heroCards: $("hero-cards"),
    chestModal: $("chest-modal"),
    chestOdds: $("chest-odds"),
    chestResult: $("chest-result"),
    chestOpen: $<HTMLButtonElement>("chest-open"),
    chestOwned: $("chest-owned"),
    endScreen: $("end-screen"),
    endTitle: $("end-title"),
    endText: $("end-text"),
  };

  constructor(private cb: HudCallbacks) {
    this.el.buildBtn.addEventListener("click", () => cb.onToggleBuild());
    this.el.startWave.addEventListener("click", () => cb.onStartWave());
    this.el.chestBtn.addEventListener("click", () => this.setChestOpen(true));
    $("chest-close").addEventListener("click", () => this.setChestOpen(false));
    this.el.chestOpen.addEventListener("click", () => cb.onOpenChest());
    this.el.muteBtn.addEventListener("click", () => {
      this.el.muteBtn.textContent = cb.onToggleMute() ? "🔇" : "🔊";
    });
    $("restart-btn").addEventListener("click", () => cb.onRestart());
    this.renderHeroCards();
    this.renderOdds();
  }

  // ---------- Alegerea eroului ----------

  private renderHeroCards(): void {
    this.el.heroCards.innerHTML = "";
    for (const [cls, def] of Object.entries(HERO_DEFS) as [HeroClass, (typeof HERO_DEFS)[HeroClass]][]) {
      const stats = CONFIG.heroes[cls];
      const [r, g, b] = DEFAULT_SKIN_COLOR[cls].map((v) => Math.round(v * 255));
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
    this.setChestOpen(false);
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

    // Val + cronometru
    if (state.phase === "build") {
      this.text(this.el.waveText, `Valul ${state.wave + 1}/${state.totalWaves} vine în`);
      const t = Math.max(0, Math.ceil(state.phaseTimer));
      this.text(this.el.timerText, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`);
    } else if (state.phase === "wave") {
      this.text(this.el.waveText, `Valul ${state.wave}/${state.totalWaves}`);
      this.text(this.el.timerText, `🧟 ${state.zombies.length + state.spawnQueue.length}`);
    }
    this.el.startWave.classList.toggle("hidden", state.phase !== "build");

    const boss = state.zombies.find((z) => z.type === "boss");
    this.el.bossPanel.classList.toggle("hidden", !boss);
    if (boss) this.width(this.el.bossBar, boss.hp / boss.maxHp);

    // Resurse
    this.text(this.el.wood, String(player.wood));
    this.text(this.el.coins, String(player.coins));
    this.text(this.el.towers, `${builtBy(state, playerId, "tower")}/${slotsFor(state, "tower")}`);
    this.text(this.el.barricades, `${builtBy(state, playerId, "barricade")}/${slotsFor(state, "barricade")}`);
    const chestReady = canOpenChest(state, playerId) === null;
    this.el.chestBtn.classList.toggle("can-open", chestReady);

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

    // Cufăr (dacă fereastra e deschisă)
    if (!this.el.chestModal.classList.contains("hidden")) {
      this.el.chestOpen.disabled = !chestReady;
      this.text(this.el.chestOpen, `Deschide · 🪙 ${CONFIG.chest.cost}`);
      const skins = player.skins.map((id) => SKINS.find((s) => s.id === id)?.name).join(", ") || "niciunul";
      this.text(
        this.el.chestOwned,
        `Armă: +${Math.round(player.weaponBonus * 100)}% damage · Turnuri: până la tier ${player.towerTier} · Skin-uri: ${skins}`,
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
      case "waveStarted":
        this.toast(e.boss ? `Valul ${e.wave}! ☠ Vine un boss` : `Valul ${e.wave}!`);
        break;
      case "waveCleared":
        if (e.wave < state.totalWaves) this.toast(`Val respins! +${e.wood} 🪵`);
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
      case "chestOpened":
        if (e.playerId === playerId) this.showChestResult(e.rarity, e.reward);
        break;
      case "gameOver":
        this.showEnd(
          "Adăpostul a fost distrus",
          `Familia nu a supraviețuit. Ai rezistat până la valul ${state.wave} din ${state.totalWaves}.`,
        );
        break;
      case "victory":
        this.showEnd("Victorie!", `Ai respins toate cele ${state.totalWaves} valuri. Familia e în siguranță.`);
        break;
    }
  }

  // ---------- Construcție ----------

  setBuildMode(on: boolean): void {
    this.el.buildBtn.classList.toggle("active", on);
    this.el.buildBanner.classList.toggle("hidden", !on);
    if (!on) this.hideBuildMenu();
  }

  /** Meniul care apare după tap, cu opțiunile date (ex. Turn / Baricadă / Upgrade). */
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

  // ---------- Cufere ----------

  private renderOdds(): void {
    this.el.chestOdds.innerHTML = CONFIG.chest.odds
      .map(({ rarity, chance }) => `<div class="odd r-${rarity}">${RARITY_NAMES[rarity]}<b>${+(chance * 100).toFixed(1)}%</b></div>`)
      .join("");
  }

  setChestOpen(open: boolean): void {
    this.el.chestModal.classList.toggle("hidden", !open);
    if (open) {
      this.el.chestResult.innerHTML = `<div class="owned">Recompense: arme mai bune, tier-uri noi de turnuri, skin-uri.</div>`;
      this.cache.delete(this.el.chestOpen);
      this.cache.delete(this.el.chestOwned);
    }
  }

  private showChestResult(rarity: Rarity, reward: ChestReward): void {
    const r = this.el.chestResult;
    r.classList.remove("pop");
    void r.offsetWidth; // repornește animația
    r.classList.add("pop");
    r.innerHTML = `<div class="rarity r-${rarity}">${RARITY_NAMES[rarity]}</div><div class="reward">${describeReward(reward)}</div>`;
    if (this.el.chestModal.classList.contains("hidden")) this.toast(`${RARITY_NAMES[rarity]}: ${describeReward(reward)}`);
  }

  // ---------- Mesaje ----------

  /** Mesaj mic lângă butoane (ex. de ce nu merge o abilitate). */
  hint(msg: string): void {
    this.el.hint.textContent = msg;
    this.el.hint.classList.add("show");
    this.hintTimer = 1.6;
  }

  private toast(msg: string): void {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("show");
    this.toastTimer = 2.2;
  }

  private showEnd(title: string, text: string): void {
    this.el.endTitle.textContent = title;
    this.el.endText.textContent = text;
    this.el.endScreen.classList.remove("hidden");
    this.setChestOpen(false);
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
