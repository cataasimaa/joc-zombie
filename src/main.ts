// Punctul de pornire: leagă împreună părțile separate:
//   core (logica)  ←comenzi—  input (joystick, buton de tras, tastatură/mouse) + ui (butoane)
//   core (stare)   —citire→   render (Babylon) + ui (HUD) + audio (sunete + muzică)

import "./style.css";
import { Sfx } from "./audio/Sfx";
import {
  CONFIG,
  type Command,
  type EntityId,
  GameSimulation,
  type GameState,
  type HeroClass,
  type Vec2,
  barricadeAt,
  barricadeEnds,
  canBuildBarricade,
  canBuildTower,
  canMoveBarricade,
  canPlaceMine,
  canUpgradeBarricade,
  canUpgradeTower,
  defaultBarricadeRotation,
  heroById,
  nextInChain,
  snapBarricade,
  towerAt,
} from "./core";
import { FireStick } from "./input/FireStick";
import { Keyboard } from "./input/Keyboard";
import { VirtualJoystick } from "./input/VirtualJoystick";
import { Renderer } from "./render/Renderer";
import { Hud, type MenuOption } from "./ui/Hud";

const LOCAL_PLAYER = "p1";
const STEP = 1 / CONFIG.tickRate;
const ROTATE_STEP = Math.PI / 4;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const keyboard = new Keyboard();
const joystick = new VirtualJoystick(document.getElementById("joystick-zone")!);
const fireStick = new FireStick(document.getElementById("fire-stick")!, document.getElementById("fire-knob")!);
const sfx = new Sfx();

let sim: GameSimulation | null = null;
let accumulator = 0;
let lastMove = { x: 0, z: 0 };
let lastAim = "";

const send = (cmd: Command) => sim?.enqueue(cmd);

function localHero(state: GameState) {
  return heroById(state, state.players[LOCAL_PLAYER].heroId)!;
}

function startGame(heroClass: HeroClass): void {
  renderer.reset();
  sim = new GameSimulation({ players: [{ id: LOCAL_PLAYER, heroClass }] });
  accumulator = 0;
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
interface Placing {
  kind: "tower" | "wall";
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

function startPlacing(kind: "tower" | "wall", mode: "place" | "move", pos: Vec2, rotation: number, id: EntityId | null = null): void {
  placing = { kind, mode, id, pos, rotation };
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
  return placing.mode === "place"
    ? canBuildBarricade(s, LOCAL_PLAYER, placing.pos, placing.rotation)
    : canMoveBarricade(s, LOCAL_PLAYER, placing.id!, placing.pos, placing.rotation);
}

function refreshPlacing(): void {
  if (!placing) return;
  const problem = placeProblem();
  const kind = placing.kind === "tower" ? "tower" : "barricade";
  renderer.setGhost(placing.pos, kind, problem === null, placing.kind === "tower" ? CONFIG.tower.tiers[0].range : 0, placing.rotation);
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
  if (kind === "tower") {
    send({ type: "build", playerId: LOCAL_PLAYER, kind: "tower", x: pos.x, z: pos.z });
    setBuildMode("palette");
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

function pick(kind: "tower" | "wall" | "mine"): void {
  if (!sim) return;
  if (kind === "mine") {
    const reason = canPlaceMine(sim.state, LOCAL_PLAYER);
    if (reason) hud.hint(reason);
    else send({ type: "placeMine", playerId: LOCAL_PLAYER });
    return;
  }
  const pos = inFrontOfHero(kind === "tower" ? 3.5 : 3);
  startPlacing(kind, "place", pos, kind === "wall" ? autoRotation(pos) : 0);
}

/** Tap în paletă: pe un turn sau zid de-al tău → meniul de editare. */
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
    const maxed = tower.tier >= CONFIG.tower.tiers.length;
    const next = CONFIG.tower.tiers[tower.tier];
    renderer.setSelection(tower.pos, 1.6);
    hud.showBuildMenu(screenX, screenY, [
      {
        label: maxed ? `🏰 Tier ${tower.tier} (maxim)` : `⬆ Upgrade la tier ${tower.tier + 1}`,
        detail: maxed ? undefined : `🪵 ${next.cost} · damage ${next.damage}`,
        blocked: maxed ? "Tier maxim" : canUpgradeTower(s, LOCAL_PLAYER, tower.id),
        onClick: act({ type: "upgradeTower", playerId: LOCAL_PLAYER, towerId: tower.id }),
      },
      cancel,
    ]);
    return;
  }
  const b = barricadeAt(s, pos);
  if (b && b.ownerId === LOCAL_PLAYER) {
    const refund = Math.floor(
      (CONFIG.barricade.levels.slice(0, b.level).reduce((a, l) => a + l.cost, 0) + (b.door ? CONFIG.barricade.doorCost : 0)) *
        CONFIG.barricade.refund,
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
        label: "🛡 Întărește",
        detail: `🪵 ${CONFIG.barricade.levels[b.level].cost} · palisadă pe piatră`,
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
    renderer.setSelection(b.pos, 1.7);
    hud.showBuildMenu(screenX, screenY, options);
    return;
  }
  hud.hint("Alege din paleta de jos: Turn, Zid sau Mină");
}

// =====================================================================
// HUD
// =====================================================================

const hud = new Hud({
  onPickHero: startGame,
  onToggleBuild: () => setBuildMode(buildMode === "off" ? "palette" : "off"),
  onPick: pick,
  onStartNight: () => send({ type: "startNightNow", playerId: LOCAL_PLAYER }),
  onShopRoll: () => send({ type: "shopRoll", playerId: LOCAL_PLAYER }),
  onToggleMute: () => {
    sfx.setMuted(!sfx.muted);
    return sfx.muted;
  },
  onReload: () => send({ type: "reload", playerId: LOCAL_PLAYER }),
  onWallRotate: rotateWall,
  onWallPlace: confirmPlace,
  onWallDone: () => setBuildMode("palette"),
  onRestart: () => {
    sim = null;
    renderer.reset();
    setBuildMode("off");
    hud.showHeroSelect();
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
let mouseGround: Vec2 | null = null;

function tapAt(x: number, y: number, mouse: boolean): void {
  if (buildMode === "off") return;
  const pos = renderer.pickGround(x, y);
  if (!pos) return;
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
  // Pe calculator: click ținut apăsat = trage spre cursor (când nu construiești).
  if (e.pointerType === "mouse" && e.button === 0 && buildMode === "off") mouseFiring = true;
});
window.addEventListener("pointerup", (e) => {
  if (e.pointerType === "mouse") mouseFiring = false;
});
canvas.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved <= 12) tapAt(e.clientX, e.clientY, e.pointerType === "mouse");
});
// Zona joystick-ului acoperă stânga-jos; o atingere scurtă acolo contează tot ca tap de construcție.
joystick.onTap = (x, y) => tapAt(x, y, false);
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  mouseGround = renderer.pickGround(e.clientX, e.clientY);
  if (placing && mouseGround) setPlacePos(mouseGround);
});

keyboard.onPress("KeyB", () => sim && setBuildMode(buildMode === "off" ? "palette" : "off"));
keyboard.onPress("Escape", () => setBuildMode(buildMode === "place" ? "palette" : "off"));
keyboard.onPress("KeyR", () => (placing ? rotateWall() : send({ type: "reload", playerId: LOCAL_PLAYER })));
keyboard.onPress("Enter", () => (placing ? confirmPlace() : send({ type: "startNightNow", playerId: LOCAL_PLAYER })));
keyboard.onPress("KeyC", () => sim && hud.setShopOpen(!hud.shopOpen));
keyboard.onPress("Digit1", () => buildMode !== "off" && pick("tower"));
keyboard.onPress("Digit2", () => buildMode !== "off" && pick("wall"));
keyboard.onPress("Digit3", () => buildMode !== "off" && pick("mine"));

/** Ochirea: butonul de tras (telefon), mouse-ul sau Space (ochire automată). */
function aimCommand(state: GameState): Command | null {
  const stick = fireStick.get();
  if (stick.firing) return { type: "aim", playerId: LOCAL_PLAYER, x: stick.x, z: stick.z, firing: true, auto: stick.auto };
  const hero = localHero(state);
  if (mouseFiring && mouseGround) {
    return { type: "aim", playerId: LOCAL_PLAYER, x: mouseGround.x - hero.pos.x, z: mouseGround.z - hero.pos.z, firing: true, auto: false };
  }
  if (keyboard.isDown("Space") && !placing) return { type: "aim", playerId: LOCAL_PLAYER, x: 0, z: 1, firing: true, auto: true };
  return { type: "aim", playerId: LOCAL_PLAYER, x: hero.aim.x, z: hero.aim.z, firing: false, auto: true };
}

/** Cât de periculos e momentul (0..1) — muzica trece de la liniște la teroare. */
function danger(state: GameState): number {
  if (state.phase !== "night") return state.phase === "day" && state.phaseTimer < 10 ? 0.15 : 0;
  const hero = localHero(state);
  const near = state.zombies.filter((z) => !z.burning && Math.hypot(z.pos.x - hero.pos.x, z.pos.z - hero.pos.z) < 14).length;
  const atShelter = state.zombies.filter((z) => Math.hypot(z.pos.x, z.pos.z) < 10).length;
  const boss = state.zombies.some((z) => z.type === "boss") ? 0.25 : 0;
  const shelterLow = state.shelter.hp / state.shelter.maxHp < 0.4 ? 0.2 : 0;
  return Math.min(1, 0.35 + near * 0.06 + atShelter * 0.04 + boss + shelterLow);
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
    const aimKey = aim && aim.type === "aim" ? `${aim.firing}|${aim.auto}|${aim.x.toFixed(2)}|${aim.z.toFixed(2)}` : "";
    if (aim && aimKey !== lastAim) {
      send(aim);
      lastAim = aimKey;
    }

    // 2. Simularea avansează în pași FICȘI (aceleași rezultate pe orice telefon).
    accumulator += dt;
    while (accumulator >= STEP) {
      sim.step(STEP);
      accumulator -= STEP;
    }

    // 3. Randare, HUD și sunet citesc starea și evenimentele.
    const events = sim.drainEvents();
    renderer.sync(state, events, LOCAL_PLAYER, dt);
    hud.update(state, LOCAL_PLAYER, events, dt);
    sfx.update({
      events,
      localPlayer: LOCAL_PLAYER,
      localHero: state.players[LOCAL_PLAYER].heroId,
      night: renderer.nightAmount,
      danger: danger(state),
      steps: renderer.drainSteps(),
      weaponOf: (heroId) => state.players[heroById(state, heroId)?.playerId ?? LOCAL_PLAYER]?.weapon ?? "rusty",
      dt,
    });
    if (placing) refreshPlacing();
  }

  renderer.render();
});

hud.showHeroSelect();

// Pentru depanare în consola browserului: game().state, renderer.setCameraOffset(...)
if (import.meta.env.DEV) Object.assign(window, { game: () => sim, renderer });
