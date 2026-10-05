// Punctul de pornire: leagă împreună cele 4 părți separate:
//   core (logica)  ←comenzi—  input (tastatură/joystick/tap)
//   core (stare)   —citire→   render (Babylon) + ui (HUD)

import "./style.css";
import { CONFIG, GameSimulation, canPlaceTower, type Vec2 } from "./core";
import { Keyboard } from "./input/Keyboard";
import { VirtualJoystick } from "./input/VirtualJoystick";
import { Renderer } from "./render/Renderer";
import { Hud } from "./ui/Hud";

const LOCAL_PLAYER = "p1";
const STEP = 1 / CONFIG.tickRate;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const keyboard = new Keyboard();
const joystick = new VirtualJoystick(document.getElementById("joystick-zone")!);

let sim = new GameSimulation({ playerIds: [LOCAL_PLAYER] });
let accumulator = 0;
let lastMove = { x: 0, z: 0 };

// ---------- Mod construcție ----------
let buildMode = false;
let buildPos: Vec2 | null = null;
let buildScreen = { x: 0, y: 0 };

function setBuildMode(on: boolean): void {
  buildMode = on;
  buildPos = null;
  hud.setBuildMode(on);
  renderer.setGhost(null, false);
}

const hud = new Hud({
  onToggleBuild: () => setBuildMode(!buildMode),
  onStartWave: () => sim.enqueue({ type: "startWaveNow", playerId: LOCAL_PLAYER }),
  onBuildTower: () => {
    if (!buildPos) return;
    sim.enqueue({ type: "placeTower", playerId: LOCAL_PLAYER, x: buildPos.x, z: buildPos.z });
    buildPos = null;
    hud.hideBuildMenu();
    renderer.setGhost(null, false);
  },
  onCancelBuildMenu: () => {
    buildPos = null;
    hud.hideBuildMenu();
    renderer.setGhost(null, false);
  },
  onRestart: () => {
    sim = new GameSimulation({ playerIds: [LOCAL_PLAYER] });
    renderer.reset();
    hud.hideEnd();
    setBuildMode(false);
  },
});

// Un „tap” = apăsare + ridicare fără să miști degetul mult.
let downAt: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
canvas.addEventListener("pointerup", (e) => {
  if (!downAt || !buildMode) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 12) return;
  buildPos = renderer.pickGround(e.clientX, e.clientY);
  buildScreen = { x: e.clientX, y: e.clientY };
});
// Pe desktop, fantoma turnului urmărește mouse-ul.
canvas.addEventListener("pointermove", (e) => {
  if (!buildMode || buildPos || e.pointerType !== "mouse") return;
  const p = renderer.pickGround(e.clientX, e.clientY);
  renderer.setGhost(p, !!p && canPlaceTower(sim.state, LOCAL_PLAYER, p) === null);
});

keyboard.onPress("KeyB", () => setBuildMode(!buildMode));
keyboard.onPress("Escape", () => setBuildMode(false));
keyboard.onPress("Enter", () => sim.enqueue({ type: "startWaveNow", playerId: LOCAL_PLAYER }));

// ---------- Bucla principală (o dată pe cadru) ----------
renderer.engine.runRenderLoop(() => {
  const dt = Math.min(renderer.engine.getDeltaTime() / 1000, 0.1);

  // 1. Input → comandă (trimisă doar când se schimbă; important pentru rețea mai târziu).
  const k = keyboard.getMove();
  const move = k.x !== 0 || k.z !== 0 ? k : joystick.getMove();
  if (move.x !== lastMove.x || move.z !== lastMove.z) {
    sim.enqueue({ type: "move", playerId: LOCAL_PLAYER, x: move.x, z: move.z });
    lastMove = move;
  }

  // 2. Simularea avansează în pași FICȘI (aceleași rezultate pe orice telefon).
  accumulator += dt;
  while (accumulator >= STEP) {
    sim.step(STEP);
    accumulator -= STEP;
  }

  // 3. Randare + HUD citesc starea.
  const events = sim.drainEvents();
  renderer.sync(sim.state, events, LOCAL_PLAYER, dt);
  hud.update(sim.state, LOCAL_PLAYER, events, dt);

  if (buildMode && buildPos) {
    const error = canPlaceTower(sim.state, LOCAL_PLAYER, buildPos);
    renderer.setGhost(buildPos, error === null);
    hud.showBuildMenu(buildScreen.x, buildScreen.y, error);
  }

  renderer.render();
});

// Pentru depanare în consola browserului: window.game.state
if (import.meta.env.DEV) (window as unknown as { game: () => GameSimulation }).game = () => sim;
