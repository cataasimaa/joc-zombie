// Punctul de pornire: leagă împreună părțile separate:
//   core (logica)  ←comenzi—  input (tastatură/joystick/tap) + ui (butoane)
//   core (stare)   —citire→   render (Babylon) + ui (HUD) + audio

import "./style.css";
import { Sfx } from "./audio/Sfx";
import {
  CONFIG,
  type Command,
  type EntityId,
  GameSimulation,
  type HeroClass,
  type Vec2,
  abilityBlockedReason,
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
  towerCost,
} from "./core";
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
const sfx = new Sfx();

let sim: GameSimulation | null = null;
let accumulator = 0;
let lastMove = { x: 0, z: 0 };

const send = (cmd: Command) => sim?.enqueue(cmd);

function startGame(heroClass: HeroClass): void {
  renderer.reset();
  sim = new GameSimulation({ players: [{ id: LOCAL_PLAYER, heroClass }] });
  accumulator = 0;
  lastMove = { x: 0, z: 0 };
  hud.startGame(heroClass);
  setBuildMode(false);
}

function useAbility(slot: number): void {
  if (!sim) return;
  const hero = heroById(sim.state, sim.state.players[LOCAL_PLAYER].heroId)!;
  const reason = abilityBlockedReason(sim.state, hero, slot);
  if (reason) hud.hint(reason);
  else send({ type: "useAbility", playerId: LOCAL_PLAYER, slot });
}

function placeMine(): void {
  if (!sim) return;
  const reason = canPlaceMine(sim.state, LOCAL_PLAYER);
  if (reason) hud.hint(reason);
  else send({ type: "placeMine", playerId: LOCAL_PLAYER });
}

// =====================================================================
// Mod construcție
// =====================================================================

let buildMode = false;

/** Zidul pe care îl pui sau îl muți acum (fantoma care urmează tap-urile). */
interface WallEdit {
  mode: "place" | "move";
  id: EntityId | null;
  pos: Vec2 | null;
  rotation: number;
}
let wall: WallEdit | null = null;

function setBuildMode(on: boolean): void {
  buildMode = on;
  wall = null;
  closeMenu();
  hud.setBuildMode(on);
}

function closeMenu(): void {
  hud.hideBuildMenu();
  renderer.setSelection(null);
  if (!wall) renderer.hideGhost();
}

/** Rotația propusă: continuă zidul vecin dacă suntem lângă capătul lui, altfel cu fața spre adăpost. */
function autoRotation(pos: Vec2): number {
  if (!sim) return 0;
  for (const b of sim.state.barricades) {
    for (const end of barricadeEnds(b)) {
      if (Math.hypot(end.x - pos.x, end.z - pos.z) < CONFIG.barricade.length * 0.9) return b.rotation;
    }
  }
  return defaultBarricadeRotation(pos);
}

function setWallPos(pos: Vec2): void {
  if (!sim || !wall) return;
  wall.pos = snapBarricade(sim.state, pos, wall.rotation, wall.id);
  refreshWall();
}

function wallProblem(): string | null {
  if (!sim || !wall?.pos) return "Atinge unde vrei zidul";
  return wall.mode === "place"
    ? canBuildBarricade(sim.state, LOCAL_PLAYER, wall.pos, wall.rotation)
    : canMoveBarricade(sim.state, LOCAL_PLAYER, wall.id!, wall.pos, wall.rotation);
}

function refreshWall(): void {
  if (!wall) return;
  const problem = wallProblem();
  renderer.setGhost(wall.pos, "barricade", problem === null, 0, wall.rotation);
  hud.showWallBar(wall.mode, problem);
}

function startWall(mode: "place" | "move", pos: Vec2, rotation: number, id: EntityId | null = null): void {
  closeMenu();
  wall = { mode, id, pos: null, rotation };
  setWallPos(pos);
}

function rotateWall(): void {
  if (!wall?.pos) return;
  wall.rotation += ROTATE_STEP;
  setWallPos(wall.pos);
}

function confirmWall(): void {
  if (!sim || !wall?.pos || wallProblem() !== null) return;
  const { pos, rotation } = wall;
  if (wall.mode === "place") {
    send({ type: "build", playerId: LOCAL_PLAYER, kind: "barricade", x: pos.x, z: pos.z, rotation });
    // Fantoma sare la capătul zidului pus: apeși ✔ din nou și zidul continuă.
    const next = nextInChain({ pos, rotation });
    wall.pos = null;
    // Comanda se aplică la următorul pas al simulării; atunci re-calculăm lipirea.
    setTimeout(() => wall && setWallPos(next), 60);
  } else {
    send({ type: "moveBarricade", playerId: LOCAL_PLAYER, barricadeId: wall.id!, x: pos.x, z: pos.z, rotation });
    finishWall();
  }
}

function finishWall(): void {
  wall = null;
  renderer.hideGhost();
  hud.hideWallBar();
  hud.setBuildMode(buildMode);
}

/** Tap în mod construcție: pe un turn/zid de-al tău → meniu de editare; pe loc liber → turn sau zid. */
function onBuildTap(pos: Vec2, screenX: number, screenY: number): void {
  if (!sim) return;
  if (wall) {
    setWallPos(pos);
    return;
  }
  const s = sim.state;
  const cancel: MenuOption = { label: "✖", cancel: true, onClick: closeMenu };
  const tower = towerAt(s, pos);
  const barricade = barricadeAt(s, pos);

  if (tower && tower.ownerId === LOCAL_PLAYER) {
    const maxed = tower.tier >= CONFIG.tower.tiers.length;
    const next = CONFIG.tower.tiers[tower.tier];
    renderer.hideGhost();
    renderer.setSelection(tower.pos, 1.8);
    hud.showBuildMenu(screenX, screenY, [
      {
        label: maxed ? `🏰 Tier ${tower.tier} (maxim)` : `⬆ Upgrade la tier ${tower.tier + 1}`,
        detail: maxed ? undefined : `🪵 ${next.cost} · damage ${next.damage}`,
        blocked: maxed ? "Tier maxim" : canUpgradeTower(s, LOCAL_PLAYER, tower.id),
        onClick: () => {
          send({ type: "upgradeTower", playerId: LOCAL_PLAYER, towerId: tower.id });
          closeMenu();
        },
      },
      cancel,
    ]);
    return;
  }

  if (barricade && barricade.ownerId === LOCAL_PLAYER) {
    const b = barricade;
    const refund = Math.floor(
      (CONFIG.barricade.levels.slice(0, b.level).reduce((a, l) => a + l.cost, 0) + (b.door ? CONFIG.barricade.doorCost : 0)) *
        CONFIG.barricade.refund,
    );
    const act = (cmd: Command) => () => {
      send(cmd);
      closeMenu();
    };
    const options: MenuOption[] = [
      { label: "↔ Mută", detail: "gratis", onClick: () => startWall("move", b.pos, b.rotation, b.id) },
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
    renderer.hideGhost();
    renderer.setSelection(b.pos, 1.7);
    hud.showBuildMenu(screenX, screenY, options);
    return;
  }

  renderer.setSelection(null);
  renderer.setGhost(pos, "tower", canBuildTower(s, LOCAL_PLAYER, pos) === null, CONFIG.tower.tiers[0].range);
  hud.showBuildMenu(screenX, screenY, [
    {
      label: "🗼 Turn",
      detail: `🪵 ${towerCost()}`,
      blocked: canBuildTower(s, LOCAL_PLAYER, pos),
      onClick: () => {
        send({ type: "build", playerId: LOCAL_PLAYER, kind: "tower", x: pos.x, z: pos.z });
        closeMenu();
      },
    },
    {
      label: "🧱 Zid",
      detail: `🪵 ${CONFIG.barricade.levels[0].cost} · se lipește de alte ziduri`,
      onClick: () => startWall("place", pos, autoRotation(pos)),
    },
    cancel,
  ]);
}

// =====================================================================
// HUD
// =====================================================================

const hud = new Hud({
  onPickHero: startGame,
  onToggleBuild: () => setBuildMode(!buildMode),
  onStartNight: () => send({ type: "startNightNow", playerId: LOCAL_PLAYER }),
  onUseAbility: useAbility,
  onPlaceMine: placeMine,
  onShopRoll: () => send({ type: "shopRoll", playerId: LOCAL_PLAYER }),
  onToggleMute: () => {
    sfx.setMuted(!sfx.muted);
    return sfx.muted;
  },
  onWallRotate: rotateWall,
  onWallPlace: confirmWall,
  onWallDone: finishWall,
  onRestart: () => {
    sim = null;
    renderer.reset();
    setBuildMode(false);
    hud.showHeroSelect();
  },
});

// =====================================================================
// Input
// =====================================================================

// Un „tap” = apăsare + ridicare fără să miști degetul mult.
let downAt: { x: number; y: number } | null = null;
function tapAt(x: number, y: number, mouse: boolean): void {
  if (!buildMode) return;
  const pos = renderer.pickGround(x, y);
  if (!pos) return;
  // Cu mouse-ul, click în modul „zid” pune direct zidul (fantoma urmărește deja cursorul).
  if (wall && mouse) {
    setWallPos(pos);
    confirmWall();
    return;
  }
  onBuildTap(pos, x, y);
}
canvas.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
canvas.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved <= 12) tapAt(e.clientX, e.clientY, e.pointerType === "mouse");
});
// Zona joystick-ului acoperă stânga-jos; o atingere scurtă acolo contează tot ca tap de construcție.
joystick.onTap = (x, y) => tapAt(x, y, false);
// Pe desktop, fantoma urmărește mouse-ul.
canvas.addEventListener("pointermove", (e) => {
  if (!sim || !buildMode || e.pointerType !== "mouse") return;
  const p = renderer.pickGround(e.clientX, e.clientY);
  if (!p) return;
  if (wall) setWallPos(p);
  else if (document.getElementById("build-menu")!.classList.contains("hidden")) {
    renderer.setGhost(p, "tower", canBuildTower(sim.state, LOCAL_PLAYER, p) === null, CONFIG.tower.tiers[0].range);
  }
});

keyboard.onPress("KeyB", () => sim && setBuildMode(!buildMode));
keyboard.onPress("Escape", () => (wall ? finishWall() : setBuildMode(false)));
keyboard.onPress("KeyR", rotateWall);
keyboard.onPress("Space", confirmWall);
keyboard.onPress("KeyM", placeMine);
keyboard.onPress("KeyC", () => sim && hud.setShopOpen(!hud.shopOpen));
keyboard.onPress("Enter", () => send({ type: "startNightNow", playerId: LOCAL_PLAYER }));
["Digit1", "Digit2", "Digit3", "Digit4"].forEach((code, slot) => keyboard.onPress(code, () => useAbility(slot)));

// =====================================================================
// Bucla principală (o dată pe cadru)
// =====================================================================

renderer.engine.runRenderLoop(() => {
  const dt = Math.min(renderer.engine.getDeltaTime() / 1000, 0.1);

  if (sim) {
    // 1. Input → comandă (trimisă doar când se schimbă; important pentru rețea mai târziu).
    const k = keyboard.getMove();
    const move = k.x !== 0 || k.z !== 0 ? k : joystick.getMove();
    if (move.x !== lastMove.x || move.z !== lastMove.z) {
      send({ type: "move", playerId: LOCAL_PLAYER, x: move.x, z: move.z });
      lastMove = move;
    }

    // 2. Simularea avansează în pași FICȘI (aceleași rezultate pe orice telefon).
    accumulator += dt;
    while (accumulator >= STEP) {
      sim.step(STEP);
      accumulator -= STEP;
    }

    // 3. Randare, HUD și sunet citesc starea și evenimentele.
    const events = sim.drainEvents();
    renderer.sync(sim.state, events, LOCAL_PLAYER, dt);
    hud.update(sim.state, LOCAL_PLAYER, events, dt);
    sfx.update(events, LOCAL_PLAYER, renderer.nightAmount, dt);
    if (wall) refreshWall();
  }

  renderer.render();
});

hud.showHeroSelect();

// Pentru depanare în consola browserului: game().state
if (import.meta.env.DEV) Object.assign(window, { game: () => sim, renderer });
