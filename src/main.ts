// Punctul de pornire: leagă împreună părțile separate:
//   core (logica)  ←comenzi—  input (joystick, buton de tras, tastatură/mouse) + ui (butoane)
//   core (stare)   —citire→   render (Babylon) + ui (HUD) + audio (sunete + muzică)

import "./style.css";
import { Sfx } from "./audio/Sfx";
import {
  CONFIG,
  GAME_MAP,
  type Command,
  type Difficulty,
  type EntityId,
  type GameMode,
  type BuildingKind,
  buildingAt,
  buildingCost,
  canAddFuel,
  canBuildBuilding,
  canCraftCanteen,
  canRefineOil,
  GameSimulation,
  type GameState,
  type HeroClass,
  type Vec2,
  barricadeAt,
  isBoss,
  barricadeEnds,
  canBuildBarricade,
  canBuildTower,
  canMoveBarricade,
  canPlaceMine,
  canUpgradeBarricade,
  canUpgradeTower,
  defaultBarricadeRotation,
  type TowerKind,
  type ZombieType,
  heroById,
  nextInChain,
  snapBarricade,
  towerAt,
  towerRefund,
  refundFactor,
  towerStats,
  towerUpgradeCost,
} from "./core";
import { FireStick } from "./input/FireStick";
import { Keyboard } from "./input/Keyboard";
import { VirtualJoystick } from "./input/VirtualJoystick";
import type { Quality } from "./render/ModelKit";
import { Renderer } from "./render/Renderer";
import { Interpolator } from "./render/Interpolation";
import { Hud, type MenuOption, type PickKind } from "./ui/Hud";
import { recordRun } from "./ui/leaderboard";

const LOCAL_PLAYER = "p1";
const STEP = 1 / CONFIG.tickRate;
const ROTATE_STEP = Math.PI / 4;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);

// Calitatea grafică: Înaltă pe calculator, Medie pe telefon (se schimbă din meniu, se salvează).
const QUALITY_NAMES: Record<Quality, string> = { high: "Înaltă", medium: "Medie", low: "Mică" };
let quality: Quality = (() => {
  try {
    const saved = localStorage.getItem("im.quality");
    if (saved === "high" || saved === "medium" || saved === "low") return saved;
  } catch {
    // ignorăm
  }
  return window.matchMedia("(pointer: coarse)").matches ? "medium" : "high";
})();
renderer.setQuality(quality);
const keyboard = new Keyboard();
const joystick = new VirtualJoystick(document.getElementById("joystick-zone")!);
const fireStick = new FireStick(document.getElementById("fire-stick")!, document.getElementById("fire-knob")!);
const sfx = new Sfx();

let sim: GameSimulation | null = null;
let paused = false;
let playerName = "";
let difficulty: Difficulty = "easy";
let mode: GameMode = "defend";
let accumulator = 0;
const interp = new Interpolator();
let lastMove = { x: 0, z: 0 };
let lastAim = "";

const send = (cmd: Command) => sim?.enqueue(cmd);

function localHero(state: GameState) {
  return heroById(state, state.players[LOCAL_PLAYER].heroId)!;
}

function startGame(heroClass: HeroClass): void {
  renderer.reset();
  sim = new GameSimulation({ players: [{ id: LOCAL_PLAYER, heroClass, name: playerName }], difficulty, mode });
  menuScene = null;
  renderer.menuCamera = false;
  sfx.setMenu(false);
  paused = false;
  accumulator = 0;
  interp.reset();
  lastMove = { x: 0, z: 0 };
  lastAim = "";
  hud.startGame(heroClass);
  setBuildMode("off");
}

// =====================================================================
// Mod construcție: paletă (Turn / Zid / Mină) → plasare cu fantomă → ✔
// =====================================================================

type BuildMode = "off" | "palette" | "place";
let buildMode: BuildMode = "off";

/** Ce pui sau muți acum (fantoma care urmează tap-urile). */
type PlaceKind = "tower" | "wall" | BuildingKind;
const isBuilding = (k: PlaceKind): k is BuildingKind => k === "campfire" || k === "farmChicken" || k === "farmPig" || k === "well";

interface Placing {
  kind: PlaceKind;
  mode: "place" | "move";
  id: EntityId | null;
  pos: Vec2;
  rotation: number;
}
let placing: Placing | null = null;

function setBuildMode(mode: BuildMode): void {
  buildMode = mode;
  if (mode !== "place") placing = null;
  hud.setBuildMode(mode);
  renderer.setSelection(null);
  if (mode !== "place") renderer.hideGhost();
}

/** Rotația propusă pentru zid: continuă zidul vecin dacă e aproape, altfel cu fața spre adăpost. */
function autoRotation(pos: Vec2): number {
  if (!sim) return 0;
  for (const b of sim.state.barricades) {
    for (const end of barricadeEnds(b)) {
      if (Math.hypot(end.x - pos.x, end.z - pos.z) < CONFIG.barricade.length * 0.9) return b.rotation;
    }
  }
  return defaultBarricadeRotation(pos);
}

/** Un punct în fața eroului: acolo apare fantoma prima dată, ca să o vezi imediat. */
function inFrontOfHero(distance: number): Vec2 {
  const hero = localHero(sim!.state);
  return { x: hero.pos.x + Math.sin(hero.facing) * distance, z: hero.pos.z + Math.cos(hero.facing) * distance };
}

/** Problema ține de loc (nu de lemn sau sloturi)? */
const isSpotProblem = (p: string | null) => p !== null && !p.startsWith("Ai nevoie") && p !== "Nu mai ai sloturi libere";

/**
 * Primul loc liber în fața eroului (apoi tot mai lateral), ca fantoma să apară
 * direct într-un loc bun — nu peste mină sau peste o casă.
 */
function firstFreeSpot(kind: PlaceKind): [Vec2, number] {
  const hero = localHero(sim!.state);
  // Direcții (unghiuri pe hartă): întâi încotro privește eroul dacă e spre partea de sus a ecranului,
  // apoi lateral și în sus — jos e paleta, acolo nu se vede bine fantoma.
  const dirs = [Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 0, (Math.PI * 3) / 4, (-Math.PI * 3) / 4, Math.PI];
  if (Math.cos(hero.facing) > -0.2) dirs.unshift(hero.facing);
  for (const d of kind === "tower" ? [3.5, 4.5, 5.5] : [3, 4, 5]) {
    for (const a of dirs) {
      const pos = { x: hero.pos.x + Math.sin(a) * d, z: hero.pos.z + Math.cos(a) * d };
      const rot = kind === "wall" ? autoRotation(pos) : 0;
      const p = kind === "tower" ? canBuildTower(sim!.state, LOCAL_PLAYER, pos)
        : kind === "wall" ? canBuildBarricade(sim!.state, LOCAL_PLAYER, pos, rot)
        : canBuildBuilding(sim!.state, LOCAL_PLAYER, kind, pos);
      if (!isSpotProblem(p)) return [pos, rot];
    }
  }
  const pos = inFrontOfHero(kind === "tower" ? 3.5 : 3);
  return [pos, kind === "wall" ? autoRotation(pos) : 0];
}

function startPlacing(kind: PlaceKind, placeMode: "place" | "move", pos: Vec2, rotation: number, id: EntityId | null = null): void {
  placing = { kind, mode: placeMode, id, pos, rotation };
  setBuildMode("place");
  buildMode = "place";
  setPlacePos(pos);
}

function setPlacePos(pos: Vec2): void {
  if (!sim || !placing) return;
  placing.pos = placing.kind === "wall" ? snapBarricade(sim.state, pos, placing.rotation, placing.id) : pos;
  refreshPlacing();
}

function placeProblem(): string | null {
  if (!sim || !placing) return "—";
  const s = sim.state;
  if (placing.kind === "tower") return canBuildTower(s, LOCAL_PLAYER, placing.pos);
  if (isBuilding(placing.kind)) return canBuildBuilding(s, LOCAL_PLAYER, placing.kind, placing.pos);
  return placing.mode === "place"
    ? canBuildBarricade(s, LOCAL_PLAYER, placing.pos, placing.rotation)
    : canMoveBarricade(s, LOCAL_PLAYER, placing.id!, placing.pos, placing.rotation);
}

function refreshPlacing(): void {
  if (!placing) return;
  const problem = placeProblem();
  const kind = placing.kind === "wall" ? "barricade" : placing.kind;
  const range = placing.kind === "tower" ? CONFIG.tower.kinds.crossbow.range : placing.kind === "campfire" ? CONFIG.survival.fireWarmRadius : 0;
  renderer.setGhost(placing.pos, kind, problem === null, range, placing.rotation);
  hud.showPlaceBar(placing.kind, placing.mode, problem);
}

function rotateWall(): void {
  if (!placing || placing.kind !== "wall") return;
  placing.rotation += ROTATE_STEP;
  setPlacePos(placing.pos);
}

function confirmPlace(): void {
  if (!sim || !placing || placeProblem() !== null) return;
  const { pos, rotation, kind } = placing;
  if (kind === "tower" || isBuilding(kind)) {
    send({ type: "build", playerId: LOCAL_PLAYER, kind, x: pos.x, z: pos.z });
    setBuildMode("off");
  } else if (placing.mode === "place") {
    send({ type: "build", playerId: LOCAL_PLAYER, kind: "barricade", x: pos.x, z: pos.z, rotation });
    // Fantoma sare la capătul zidului pus: apeși ✔ din nou și zidul continuă.
    const next = nextInChain({ pos, rotation });
    setTimeout(() => placing && setPlacePos(next), 60);
  } else {
    send({ type: "moveBarricade", playerId: LOCAL_PLAYER, barricadeId: placing.id!, x: pos.x, z: pos.z, rotation });
    setBuildMode("palette");
  }
}

function pick(kind: PickKind): void {
  if (!sim) return;
  if (kind === "mine") {
    const reason = canPlaceMine(sim.state, LOCAL_PLAYER);
    if (reason) hud.hint(reason);
    else send({ type: "placeMine", playerId: LOCAL_PLAYER });
    return;
  }
  startPlacing(kind, "place", ...firstFreeSpot(kind));
}

/** Construcția ta din punctul dat (turn, zid, foc, fermă) — pentru selectare directă. */
function ownStructure(pos: Vec2): { id: EntityId; pos: Vec2; radius: number } | null {
  if (!sim) return null;
  const s = sim.state;
  const t = towerAt(s, pos);
  if (t && t.ownerId === LOCAL_PLAYER) return { id: t.id, pos: t.pos, radius: 1.6 };
  const b = barricadeAt(s, pos);
  if (b && b.ownerId === LOCAL_PLAYER) return { id: b.id, pos: b.pos, radius: 1.7 };
  const f = buildingAt(s, pos);
  if (f && ("fuel" in f || f.ownerId === LOCAL_PLAYER)) return { id: f.id, pos: f.pos, radius: "fuel" in f ? 1.2 : "kind" in f ? 2.4 : 1.3 };
  return null;
}
function ownStructureAt(pos: Vec2): boolean {
  return ownStructure(pos) !== null;
}

/** Tap pe o construcție de-a ta (oricând, nu doar cu ciocanul) → meniul ei. */
function onBuildTap(pos: Vec2, screenX: number, screenY: number): void {
  if (!sim) return;
  if (placing) {
    setPlacePos(pos);
    return;
  }
  const s = sim.state;
  const cancel: MenuOption = { label: "✖", cancel: true, onClick: () => { hud.hideBuildMenu(); renderer.setSelection(null); } };
  const act = (cmd: Command) => () => {
    send(cmd);
    hud.hideBuildMenu();
    renderer.setSelection(null);
  };
  const tower = towerAt(s, pos);
  if (tower && tower.ownerId === LOCAL_PLAYER) {
    const stats = towerStats(tower.kind, tower.level);
    const options: MenuOption[] = [];
    if (tower.level < CONFIG.tower.maxLevel) {
      const next = towerStats(tower.kind, tower.level + 1);
      options.push({
        label: `⬆ ${stats.name} nivel ${tower.level + 1}`,
        detail: `🪵 ${towerUpgradeCost(tower)} · damage ${Math.round(stats.damage)} → ${Math.round(next.damage)}`,
        blocked: canUpgradeTower(s, LOCAL_PLAYER, tower.id),
        full: true,
        onClick: act({ type: "upgradeTower", playerId: LOCAL_PLAYER, towerId: tower.id }),
      });
    }
    // Arbaleta (turnul de bază) se poate transforma în celelalte tipuri.
    if (tower.kind === "crossbow") {
      for (const kind of ["rocket", "cannon", "tesla", "frost"] as TowerKind[]) {
        const info = TOWER_INFO[kind];
        options.push({
          label: `${info.icon} ${CONFIG.tower.kinds[kind].name}`,
          detail: `🪵 ${towerUpgradeCost(tower, kind)} · ${info.text}`,
          blocked: canUpgradeTower(s, LOCAL_PLAYER, tower.id, kind),
          className: `kind-${kind}`,
          onClick: act({ type: "upgradeTower", playerId: LOCAL_PLAYER, towerId: tower.id, to: kind }),
        });
      }
    }
    options.push({
      label: s.phase === "night" ? "🔨 Vinde (noaptea: jumătate)" : "🔨 Demolează",
      detail: `+${towerRefund(s, tower)} 🪵`,
      className: "kind-demolish",
      full: tower.kind !== "crossbow",
      onClick: act({ type: "demolishTower", playerId: LOCAL_PLAYER, towerId: tower.id }),
    });
    options.push(cancel);
    renderer.setSelection(tower.pos, 1.6, tower.id);
    const info = TOWER_INFO[tower.kind];
    hud.showBuildMenu(screenX, screenY, options, `${info.icon} ${stats.name} · nivel ${tower.level} · ❤ ${Math.ceil(tower.hp)}/${tower.maxHp}<br><small>★ ${info.ability}</small>`);
    return;
  }
  const b = barricadeAt(s, pos);
  if (b && b.ownerId === LOCAL_PLAYER) {
    const refund = Math.floor(
      (CONFIG.barricade.levels.slice(0, b.level).reduce((a, l) => a + l.cost, 0) + (b.door ? CONFIG.barricade.doorCost : 0)) *
        refundFactor(s),
    );
    const options: MenuOption[] = [
      { label: "↔ Mută", detail: "gratis", onClick: () => { hud.hideBuildMenu(); startPlacing("wall", "move", b.pos, b.rotation, b.id); } },
      {
        label: "↻ Rotește",
        detail: "45°",
        blocked: canMoveBarricade(s, LOCAL_PLAYER, b.id, b.pos, b.rotation + ROTATE_STEP),
        onClick: act({ type: "moveBarricade", playerId: LOCAL_PLAYER, barricadeId: b.id, x: b.pos.x, z: b.pos.z, rotation: b.rotation + ROTATE_STEP }),
      },
    ];
    if (b.level < CONFIG.barricade.levels.length) {
      options.push({
        label: b.level === 1 ? "🛡 Forjează" : "🔩 Fă-l de metal",
        detail: `🪵 ${CONFIG.barricade.levels[b.level].cost} · ❤ ${CONFIG.barricade.levels[b.level].maxHp}`,
        blocked: canUpgradeBarricade(s, LOCAL_PLAYER, b.id, "reinforce"),
        onClick: act({ type: "upgradeBarricade", playerId: LOCAL_PLAYER, barricadeId: b.id, to: "reinforce" }),
      });
    }
    if (!b.door) {
      options.push({
        label: "🚪 Fă ușă",
        detail: `🪵 ${CONFIG.barricade.doorCost} · tu treci, zombii nu`,
        blocked: canUpgradeBarricade(s, LOCAL_PLAYER, b.id, "door"),
        onClick: act({ type: "upgradeBarricade", playerId: LOCAL_PLAYER, barricadeId: b.id, to: "door" }),
      });
    }
    options.push({ label: "🔨 Demolează", detail: `+${refund} 🪵`, onClick: act({ type: "demolish", playerId: LOCAL_PLAYER, barricadeId: b.id }) });
    options.push(cancel);
    renderer.setSelection(b.pos, 1.7, b.id);
    const state = b.broken ? "dărâmat — stai lângă el ca să-l repari" : b.hp < b.maxHp * 0.6 ? "crăpat" : "întreg";
    hud.showBuildMenu(screenX, screenY, options, `🧱 Zid ${b.level >= 2 ? "întărit" : "de pari"}${b.door ? " (ușă)" : ""} · ${state}<br><small>❤ ${Math.ceil(b.hp)}/${b.maxHp}</small>`);
    return;
  }
  const f = buildingAt(s, pos);
  if (f && "fuel" in f) {
    const raw = s.players[LOCAL_PLAYER].inventory.rawMeat;
    const options: MenuOption[] = [
      {
        label: `🪵 Pune lemne`,
        detail: `🪵 ${CONFIG.survival.addWood} · +${CONFIG.survival.addWood * CONFIG.survival.fuelPerWood}% foc`,
        blocked: canAddFuel(s, LOCAL_PLAYER, f.id),
        onClick: act({ type: "addFuel", playerId: LOCAL_PLAYER, fireId: f.id }),
      },
      {
        label: "🥩 Gătește carne",
        detail: `${CONFIG.survival.cookTime} s · ai ${raw}`,
        blocked: raw <= 0 ? "N-ai carne crudă (vânează)" : f.fuel <= 0 ? "Focul e stins" : f.cooking.length >= 3 ? "Frigarea e plină" : null,
        onClick: act({ type: "useItem", playerId: LOCAL_PLAYER, item: "rawMeat" }),
      },
      {
        label: "🛢️ Rafinează ulei",
        detail: `${CONFIG.oil.refineTime} s → ⛽ · ai ${s.players[LOCAL_PLAYER].inventory.oil}`,
        blocked: canRefineOil(s, LOCAL_PLAYER, f.id),
        onClick: act({ type: "refineOil", playerId: LOCAL_PLAYER }),
      },
    ];
    if (f.ownerId === LOCAL_PLAYER && s.campfires.indexOf(f) > 0) {
      options.push({ label: "🔨 Demolează", onClick: act({ type: "demolishBuilding", playerId: LOCAL_PLAYER, buildingId: f.id }) });
    }
    options.push(cancel);
    renderer.setSelection(f.pos, 1.2, f.id);
    const cooking = (f.cooking.length ? ` · 🍖 gata în ${Math.ceil(Math.min(...f.cooking))} s` : "") + (f.refining.length ? ` · ⛽ în ${Math.ceil(Math.min(...f.refining))} s` : "");
    hud.showBuildMenu(screenX, screenY, options, `🔥 Foc · ${f.fuel > 0 ? `${Math.ceil(f.fuel)}% lemn` : "stins"}${cooking}`);
    return;
  }
  if (f && !("kind" in f)) {
    // Fântâna: faci canistre noi (și o poți demola, dacă e a ta).
    const p = s.players[LOCAL_PLAYER];
    const options: MenuOption[] = [
      {
        label: "🧴 Canistră nouă",
        detail: `🪵 ${CONFIG.survival.canteenCost} · ai ${p.inventory.canteen}/${CONFIG.survival.maxCanteens}`,
        blocked: canCraftCanteen(s, LOCAL_PLAYER),
        onClick: act({ type: "craftCanteen", playerId: LOCAL_PLAYER }),
      },
    ];
    if (f.ownerId === LOCAL_PLAYER) {
      options.push({ label: "🔨 Demolează", detail: `+${Math.floor(buildingCost("well") * refundFactor(s))} 🪵`, onClick: act({ type: "demolishBuilding", playerId: LOCAL_PLAYER, buildingId: f.id }) });
    }
    options.push(cancel);
    renderer.setSelection(f.pos, 1.3, f.id);
    hud.showBuildMenu(screenX, screenY, options, `🪣 Fântână · apă oricând · 💧 ${p.water}/${p.inventory.canteen * CONFIG.survival.canteenDrinks}`);
    return;
  }
  if (f && f.ownerId === LOCAL_PLAYER) {
    renderer.setSelection(f.pos, 2.4, f.id);
    hud.showBuildMenu(screenX, screenY, [
      { label: "🔨 Demolează", detail: `+${Math.floor(buildingCost("farmPig") * refundFactor(s))} 🪵`, onClick: act({ type: "demolishBuilding", playerId: LOCAL_PLAYER, buildingId: f.id }) },
      cancel,
    ], `${"kind" in f && f.kind === "chicken" ? "🐔 Coteț de găini" : "🐖 Țarc de porci"}`);
    return;
  }
  if (buildMode !== "off") hud.hint("Alege din paleta de jos ce construiești");
}

/** Descrierea scurtă a fiecărui tip de turn (pentru meniul de upgrade). */
const TOWER_INFO: Record<TowerKind, { icon: string; text: string; ability: string }> = {
  crossbow: { icon: "🏹", text: "o țintă", ability: "La câteva secunde: o săgeată grea care trece prin 3 zombi" },
  rocket: { icon: "🚀", text: "damage mare, o țintă", ability: "Racheta mare explodează și lansează mini-rachete" },
  cannon: { icon: "💣", text: "explozie pe zonă, lent", ability: "Ghiuleaua lasă foc pe jos câteva secunde" },
  tesla: { icon: "⚡", text: "fulger, damage mare", ability: "Laser care trece prin toți zombii din linie" },
  frost: { icon: "❄", text: "-30% viteză și atac", ability: "Îngheață complet zombii din jur" },
};

// =====================================================================
// HUD
// =====================================================================

const hud = new Hud({
  onMenuStart: (name, diff, m) => {
    playerName = name;
    difficulty = diff;
    mode = m;
    hud.showHeroSelect(name);
  },
  onUseItem: (item) => send({ type: "useItem", playerId: LOCAL_PLAYER, item }),
  onAction: (on) => send({ type: "action", playerId: LOCAL_PLAYER, on }),
  onUseSlot: (slot) => send({ type: "useSlot", playerId: LOCAL_PLAYER, slot }),
  onSetSlot: (slot, item) => send({ type: "setSlot", playerId: LOCAL_PLAYER, slot, item }),
  onLearnSkill: (skill) => send({ type: "learnSkill", playerId: LOCAL_PLAYER, skill }),
  onCraftArmor: (slot, material) => send({ type: "craftArmor", playerId: LOCAL_PLAYER, slot, material }),
  onPickHero: startGame,
  onToggleSound: () => {
    sfx.setMuted(!sfx.muted);
    saveSetting("im.sound", !sfx.muted);
    return !sfx.muted;
  },
  onCycleQuality: () => {
    const order: Quality[] = ["high", "medium", "low"];
    quality = order[(order.indexOf(quality) + 1) % order.length];
    try {
      localStorage.setItem("im.quality", quality);
    } catch {
      // fără salvare (mod privat)
    }
    renderer.setQuality(quality);
    return QUALITY_NAMES[quality];
  },
  onToggleMusic: () => {
    sfx.setMusicOn(!sfx.musicOn);
    saveSetting("im.music", sfx.musicOn);
    return sfx.musicOn;
  },
  onPause: (p) => {
    paused = p;
  },
  onQuitToMenu: () => {
    sim = null;
    paused = false;
    renderer.reset();
    setBuildMode("off");
    showMenu();
  },
  onToggleBuild: () => setBuildMode(buildMode === "off" ? "palette" : "off"),
  onPick: pick,
  onStartNight: () => send({ type: "startNightNow", playerId: LOCAL_PLAYER }),
  onShopRoll: () => send({ type: "shopRoll", playerId: LOCAL_PLAYER }),
  onReload: () => send({ type: "reload", playerId: LOCAL_PLAYER }),
  onWallRotate: rotateWall,
  onWallPlace: confirmPlace,
  onWallDone: () => setBuildMode("palette"),
  onRestart: () => {
    sim = null;
    renderer.reset();
    startMenuScene();
    setBuildMode("off");
    hud.showHeroSelect(playerName);
  },
  onSpinTick: () => sfx.spinTick(),
  onReelStop: () => sfx.reelStop(),
  onSpinResult: (rarity) => sfx.spinResult(rarity),
});

// =====================================================================
// Input: tap-uri pentru construcție, mouse pentru ochire pe calculator
// =====================================================================

let downAt: { x: number; y: number } | null = null;
let mouseFiring = false;
/** Ultima poziție a mouse-ului pe ecran (ochirea se recalculează în fiecare cadru, chiar dacă se mișcă camera). */
let mouseScreen: { x: number; y: number } | null = null;
/** Degetul care ține apăsat pe ecran (în afara butoanelor): trage spre acel punct. */
let touchAim: { id: number; x: number; y: number } | null = null;

/** Apăsarea a început pe o construcție de-a ta: e o selectare, nu o tragere. */
let downOnStructure = false;

/** Apăsare lungă (telefon) pe o construcție: deschide meniul ei. */
let longPress: { timer: number; fired: boolean } | null = null;
const LONG_PRESS_MS = 450;

/**
 * Fără ciocan: un tap scurt pe o construcție de-a ta doar o SELECTEAZĂ (inel + viață);
 * meniul se deschide la apăsare lungă sau la un al doilea tap pe aceeași construcție.
 * Tap pe zăpadă = deselectezi. `menu` = deschide meniul direct (apăsare lungă).
 */
function selectAt(x: number, y: number, menu: boolean): void {
  const pos = renderer.pickGround(x, y);
  const target = pos ? ownStructure(pos) : null;
  if (!pos || !target) {
    hud.hideBuildMenu();
    renderer.setSelection(null);
    return;
  }
  if (menu || renderer.selectedId === target.id) {
    onBuildTap(pos, x, y);
    return;
  }
  hud.hideBuildMenu();
  renderer.setSelection(target.pos, target.radius, target.id);
}

function tapAt(x: number, y: number, mouse: boolean): void {
  const pos = renderer.pickGround(x, y);
  if (!pos) return;
  if (buildMode === "off") {
    selectAt(x, y, false);
    return;
  }
  // Cu mouse-ul, click în modul de plasare pune direct (fantoma urmărește deja cursorul).
  if (placing && mouse) {
    setPlacePos(pos);
    confirmPlace();
    return;
  }
  onBuildTap(pos, x, y);
}
canvas.addEventListener("pointerdown", (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  if (buildMode !== "off" || !sim) return;
  const ground = renderer.pickGround(e.clientX, e.clientY);
  downOnStructure = !!ground && ownStructureAt(ground);
  if (downOnStructure) {
    if (e.pointerType !== "mouse") {
      const x = e.clientX, y = e.clientY;
      const lp = { timer: 0, fired: false };
      lp.timer = window.setTimeout(() => {
        if (longPress !== lp || !downAt || Math.hypot(downAt.x - x, downAt.y - y) > 12) return;
        lp.fired = true;
        navigator.vibrate?.(15);
        selectAt(x, y, true);
      }, LONG_PRESS_MS);
      longPress = lp;
    }
    return;
  }
  // Calculator: click ținut = trage spre cursor. Telefon: ții degetul pe ecran = trage acolo.
  if (e.pointerType === "mouse") {
    if (e.button === 0) mouseFiring = true;
    mouseScreen = { x: e.clientX, y: e.clientY };
  } else if (!touchAim) {
    touchAim = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
});
window.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse") mouseFiring = false;
  if (touchAim?.id === e.pointerId) touchAim = null;
});
window.addEventListener("pointercancel", (e) => {
  if (touchAim?.id === e.pointerId) touchAim = null;
});
canvas.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  const lp = longPress;
  if (lp) {
    clearTimeout(lp.timer);
    longPress = null;
    if (lp.fired) return;
  }
  if (moved <= 12) tapAt(e.clientX, e.clientY, e.pointerType === "mouse");
});
canvas.addEventListener("pointermove", (e) => {
  if (longPress && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) {
    clearTimeout(longPress.timer);
    longPress = null;
  }
});
// Zona joystick-ului: degetul de mers nu deschide niciodată meniuri. Un tap scurt acolo doar
// selectează (sau, cu ciocanul, alege locul de construcție).
joystick.onTap = (x, y) => {
  if (buildMode === "off") {
    const pos = renderer.pickGround(x, y);
    const target = pos ? ownStructure(pos) : null;
    hud.hideBuildMenu();
    if (target && renderer.selectedId !== target.id) renderer.setSelection(target.pos, target.radius, target.id);
    else if (!target) renderer.setSelection(null);
    return;
  }
  tapAt(x, y, false);
};
canvas.addEventListener("pointermove", (e) => {
  if (touchAim?.id === e.pointerId) {
    touchAim.x = e.clientX;
    touchAim.y = e.clientY;
  }
  if (e.pointerType !== "mouse") return;
  mouseScreen = { x: e.clientX, y: e.clientY };
  const ground = renderer.pickGround(e.clientX, e.clientY);
  if (placing && ground) setPlacePos(ground);
});

// Telefonul sună / treci în altă aplicație: jocul intră singur pe pauză (noaptea și păcănelele stau).
function autoPause(): void {
  if (sim && (sim.state.phase === "day" || sim.state.phase === "night") && !hud.paused) hud.setPaused(true);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) autoPause();
});
window.addEventListener("pagehide", autoPause);

keyboard.onPress("KeyB", () => sim && !paused && setBuildMode(buildMode === "off" ? "palette" : "off"));
keyboard.onPress("Escape", () => {
  if (!sim) return;
  if (buildMode !== "off") setBuildMode(buildMode === "place" ? "palette" : "off");
  else if (hud.shopOpen) hud.setShopOpen(false);
  else hud.setPaused(!hud.paused);
});
keyboard.onPress("KeyR", () => (placing ? rotateWall() : send({ type: "reload", playerId: LOCAL_PLAYER })));
keyboard.onPress("Enter", () => (placing ? confirmPlace() : send({ type: "startNightNow", playerId: LOCAL_PLAYER })));
keyboard.onPress("KeyC", () => sim && !paused && hud.setShopOpen(!hud.shopOpen));
// 1–4: în modul construcție alegi ce construiești; altfel folosești locul din bara rapidă.
const slotKey = (slot: number) => sim && !paused && send({ type: "useSlot", playerId: LOCAL_PLAYER, slot });
keyboard.onPress("Digit1", () => (buildMode !== "off" ? pick("tower") : slotKey(0)));
keyboard.onPress("Digit2", () => (buildMode !== "off" ? pick("wall") : slotKey(1)));
keyboard.onPress("Digit3", () => (buildMode !== "off" ? pick("mine") : slotKey(2)));
keyboard.onPress("Digit4", () => (buildMode !== "off" ? pick("campfire") : slotKey(3)));
keyboard.onPress("KeyL", () => sim && hud.toggleLevelMenu());
// G = acțiune (ții apăsat: târnăcop; apeși: undiță / vânzare), I = inventar.
keyboard.onPress("KeyI", () => sim && hud.toggleInventory());
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyG" && !e.repeat && sim && !paused) send({ type: "action", playerId: LOCAL_PLAYER, on: true });
});
window.addEventListener("keyup", (e) => {
  if (e.code === "KeyG" && sim) send({ type: "action", playerId: LOCAL_PLAYER, on: false });
});
keyboard.onPress("KeyE", () => send({ type: "useItem", playerId: LOCAL_PLAYER, item: "cookedMeat" }));
keyboard.onPress("KeyF", () => send({ type: "useItem", playerId: LOCAL_PLAYER, item: "rawMeat" }));

/** Direcția de la erou spre un punct de pe ecran. */
function aimAtScreen(state: GameState, x: number, y: number): { x: number; z: number } | null {
  const ground = renderer.pickGround(x, y);
  if (!ground) return null;
  const hero = localHero(state);
  return { x: ground.x - hero.pos.x, z: ground.z - hero.pos.z };
}

/** Ochirea: butonul de tras, degetul pe ecran, mouse-ul sau Space. */
function aimCommand(state: GameState): Command | null {
  const stick = fireStick.get();
  if (stick.firing) return { type: "aim", playerId: LOCAL_PLAYER, x: stick.x, z: stick.z, firing: true, auto: stick.auto };
  const hero = localHero(state);
  // Glonțul se oprește la punctul unde ai apăsat (dist), dacă nu lovește nimic înainte.
  const at = (d: { x: number; z: number }): Command => ({ type: "aim", playerId: LOCAL_PLAYER, x: d.x, z: d.z, firing: true, auto: false, dist: Math.hypot(d.x, d.z) });
  if (touchAim && buildMode === "off") {
    const d = aimAtScreen(state, touchAim.x, touchAim.y);
    if (d) return at(d);
  }
  const toMouse = mouseScreen ? aimAtScreen(state, mouseScreen.x, mouseScreen.y) : null;
  if (mouseFiring && toMouse && buildMode === "off") return at(toMouse);
  // Space: trage spre cursor (dacă folosești mouse-ul), altfel ochește singur.
  if (keyboard.isDown("Space") && !placing) {
    return toMouse ? at(toMouse) : { type: "aim", playerId: LOCAL_PLAYER, x: 0, z: 1, firing: true, auto: true };
  }
  return { type: "aim", playerId: LOCAL_PLAYER, x: hero.aim.x, z: hero.aim.z, firing: false, auto: true };
}

/** Tipul celui mai apropiat zombi (gemetele au vocea lui) — completat de nearestZombie(). */
let nearestType: ZombieType = "walker";
/** Cât de periculos e momentul (0..1) — muzica trece de la liniște la teroare. */
/** Distanța de la eroul local la cel mai apropiat zombi (pentru gemetele care se apropie). */
function nearestZombie(state: GameState): number {
  const hero = localHero(state);
  let best = Infinity;
  nearestType = "walker";
  for (const z of state.zombies) {
    if (z.burning) continue;
    const d = Math.hypot(z.pos.x - hero.pos.x, z.pos.z - hero.pos.z);
    if (d < best) {
      best = d;
      nearestType = z.type;
    }
  }
  return best;
}

function danger(state: GameState): number {
  if (state.phase !== "night") return state.phase === "day" && state.phaseTimer < 10 ? 0.15 : 0;
  const hero = localHero(state);
  const near = state.zombies.filter((z) => !z.burning && Math.hypot(z.pos.x - hero.pos.x, z.pos.z - hero.pos.z) < 14).length;
  const atShelter = state.zombies.filter((z) => Math.hypot(z.pos.x, z.pos.z) < 10).length;
  const boss = state.zombies.some((z) => isBoss(z.type)) ? 0.25 : 0;
  const shelterLow = state.mode === "defend" && state.shelter.hp / state.shelter.maxHp < 0.4 ? 0.2 : 0;
  const hurt = hero.alive && hero.hp / hero.maxHp < 0.35 ? 0.15 : 0;
  // Noaptea muzica pornește deja alertă (0,5) și crește cu cât e mai aproape pericolul.
  return Math.min(1, 0.5 + near * 0.06 + atShelter * 0.04 + boss + shelterLow + hurt);
}

// =====================================================================
// Meniul (cu scena din fundal), clasament, anunțuri
// =====================================================================

/** O „scenă” statică pentru fundalul meniului: noapte, lich-ul și zombii lângă mină, eroul la foc. */
let menuScene: GameSimulation | null = null;

function startMenuScene(): void {
  menuScene = new GameSimulation({ players: [{ id: LOCAL_PLAYER, heroClass: "tank" }], seed: 7 });
  const s = menuScene.state;
  s.phase = "night";
  s.wave = 5;
  s.heroes[0].pos = { x: 0.2, z: -3.6 };
  s.heroes[0].facing = -0.9;
  const mk = (type: Parameters<typeof spawnZombieAt>[1], x: number, z: number, facing: number) => spawnZombieAt(s, type, x, z, facing);
  // La stânga minei (pe ecran), venind spre foc.
  mk("boss", -6.5, 3.5, 2.5);
  mk("brute", -9, 0.5, 2.0);
  mk("walker", -4.5, 6.5, 2.8);
  mk("runner", -7.5, 6, 2.6);
  mk("walker", -10.5, 3.5, 2.2);
  renderer.menuCamera = true;
  sfx.setMenu(true);
}

function spawnZombieAt(s: GameState, type: ZombieType, x: number, z: number, facing: number): void {
  s.zombies.push({
    id: s.nextId++, type, pos: { x, z }, facing, hp: 1, maxHp: 1, attackTimer: 9, slowTimer: 0, stuckTime: 0,
    burning: false, aggroTowerId: null, lastHitBy: null, chillTimer: 0, frozenTimer: 0, freezeImmune: 0,
    abilityTimer: 99, ability2Timer: 99, charge: null, burrowed: false, rageTimer: 0, enraged: false,
  });
}

function showMenu(): void {
  renderer.reset();
  startMenuScene();
  hud.showMainMenu();
}

/** Salvarea rezultatului în clasament la finalul rundei. */
function handleRunEvents(state: GameState, events: ReturnType<GameSimulation["drainEvents"]>): void {
  for (const e of events) {
    if (e.type === "gameOver" || e.type === "victory") {
      const p = state.players[LOCAL_PLAYER];
      recordRun({
        name: p.name, mode: state.mode, difficulty: state.difficulty, heroClass: localHero(state).heroClass,
        nights: Math.max(0, state.wave - 1), kills: p.kills, victory: false, at: Date.now(),
        stage: state.stage,
        time: CONFIG.run.campaignTime - state.runTimer,
        bosses: state.rushIndex,
        endless: state.endlessTime,
      });
      sfx.setMenu(false);
    }
  }
}

// =====================================================================
// Bucla principală (o dată pe cadru)
// =====================================================================

renderer.engine.runRenderLoop(() => {
  const dt = Math.min(renderer.engine.getDeltaTime() / 1000, 0.1);

  if (sim) {
    const state = sim.state;
    // 1. Input → comenzi (trimise doar când se schimbă; important pentru rețea mai târziu).
    const k = keyboard.getMove();
    const move = k.x !== 0 || k.z !== 0 ? k : joystick.getMove();
    if (move.x !== lastMove.x || move.z !== lastMove.z) {
      send({ type: "move", playerId: LOCAL_PLAYER, x: move.x, z: move.z });
      lastMove = move;
    }
    const aim = aimCommand(state);
    const aimKey = aim && aim.type === "aim" ? `${aim.firing}|${aim.auto}|${aim.x.toFixed(2)}|${aim.z.toFixed(2)}|${(aim.dist ?? 0).toFixed(1)}` : "";
    if (aim && aimKey !== lastAim) {
      send(aim);
      lastAim = aimKey;
    }

    // 2. Simularea avansează în pași FICȘI (aceleași rezultate pe orice telefon). În pauză stă pe loc.
    if (!paused) accumulator += dt;
    while (accumulator >= STEP) {
      interp.beforeStep(state);
      sim.step(STEP);
      accumulator -= STEP;
    }

    // 3. Randare, HUD și sunet citesc starea și evenimentele. Randarea primește o copie cu
    //    pozițiile interpolate între ultimii doi pași (mers lin pe ecrane de 60 / 120 Hz).
    const events = sim.drainEvents();
    renderer.sync(interp.view(state, accumulator / STEP), events, LOCAL_PLAYER, dt, state);
    hud.update(state, LOCAL_PLAYER, events, dt);
    handleRunEvents(state, events);
    // Eticheta minei: chiar deasupra ei (doar în Apără mina; în Supraviețuire e decor).
    const mineAt = renderer.projectToScreen(state.shelter.pos, 2.6);
    const onScreen = mineAt.x > 0 && mineAt.x < window.innerWidth && mineAt.y > 40 && mineAt.y < window.innerHeight;
    hud.setMineScreen(state.mode === "defend" && onScreen ? mineAt : null);
    // Etichetele focurilor (în Supraviețuire focul arde lemn): cât mai ține fiecare.
    const me = localHero(state);
    hud.setFireLabels(
      state.mode !== "survival" ? [] : state.campfires
        .filter((f) => Math.hypot(f.pos.x - me.pos.x, f.pos.z - me.pos.z) < 30)
        .map((f) => ({ ...renderer.projectToScreen(f.pos, 1.7), ratio: f.fuel / CONFIG.survival.campfireFuel }))
        .filter((p) => p.x > 0 && p.x < window.innerWidth && p.y > 40 && p.y < window.innerHeight),
    );
    sfx.update({
      events,
      localPlayer: LOCAL_PLAYER,
      localHero: state.players[LOCAL_PLAYER].heroId,
      night: renderer.nightAmount,
      danger: danger(state),
      steps: renderer.drainSteps(),
      weaponOf: (heroId) => state.players[heroById(state, heroId)?.playerId ?? LOCAL_PLAYER]?.weapon ?? "rusty",
      dt,
      boss: state.phase === "night" && state.zombies.some((z) => isBoss(z.type) && !z.burning),
      nearestZombie: nearestZombie(state),
      nearestType,
      stage: state.stage,
      phase: state.phase,
      bossType: state.phase === "night" ? (state.zombies.find((z) => isBoss(z.type) && !z.burning)?.type ?? null) : null,
      running: state.phase === "day" || state.phase === "night",
    });
    if (placing) refreshPlacing();
  } else if (menuScene) {
    // Meniul: scena de noapte din fundal, cu camera care se rotește încet.
    renderer.sync(menuScene.state, [], LOCAL_PLAYER, dt);
    sfx.update({ events: [], localPlayer: LOCAL_PLAYER, localHero: null, night: 1, danger: 0, steps: 0, weaponOf: () => "rusty", dt });
  }

  renderer.render();
});

// Setările de sunet păstrate de la o sesiune la alta.
function loadSetting(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}
function saveSetting(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // fără salvare
  }
}
sfx.setMuted(!loadSetting("im.sound"));
sfx.setMusicOn(loadSetting("im.music"));
hud.setAudioLabels(!sfx.muted, sfx.musicOn);
hud.setQualityLabel(QUALITY_NAMES[quality]);
showMenu();

// Pentru depanare în consola browserului: game().state, renderer.setCameraOffset(...)
if (import.meta.env.DEV) Object.assign(window, { game: () => sim, renderer, __map: GAME_MAP });
