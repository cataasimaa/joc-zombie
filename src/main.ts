// Punctul de pornire: leagă împreună părțile separate:
//   core (logica)  ←comenzi—  input (tastatură/joystick/tap) + ui (butoane)
//   core (stare)   —citire→   render (Babylon) + ui (HUD) + audio

import "./style.css";
import { Sfx } from "./audio/Sfx";
import {
  type BuildKind,
  CONFIG,
  GameSimulation,
  type HeroClass,
  type Vec2,
  abilityBlockedReason,
  buildCost,
  canBuild,
  canUpgradeTower,
  heroById,
  towerAt,
} from "./core";
import { Keyboard } from "./input/Keyboard";
import { VirtualJoystick } from "./input/VirtualJoystick";
import { Renderer } from "./render/Renderer";
import { Hud, type MenuOption } from "./ui/Hud";

const LOCAL_PLAYER = "p1";
const STEP = 1 / CONFIG.tickRate;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const keyboard = new Keyboard();
const joystick = new VirtualJoystick(document.getElementById("joystick-zone")!);
const sfx = new Sfx();

let sim: GameSimulation | null = null;
let accumulator = 0;
let lastMove = { x: 0, z: 0 };
let buildMode = false;
let buildPos: Vec2 | null = null;

const send = (cmd: Parameters<GameSimulation["enqueue"]>[0]) => sim?.enqueue(cmd);

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

// ---------- Mod construcție ----------

function setBuildMode(on: boolean): void {
  buildMode = on;
  closeBuildMenu();
  hud.setBuildMode(on);
}

function closeBuildMenu(): void {
  buildPos = null;
  hud.hideBuildMenu();
  renderer.hideGhost();
}

/** Tap în mod construcție: pe un turn de-al tău → upgrade; pe loc liber → turn sau baricadă. */
function onBuildTap(pos: Vec2, screenX: number, screenY: number): void {
  if (!sim) return;
  const s = sim.state;
  const tower = towerAt(s, pos);
  const cancel: MenuOption = { label: "✖", cancel: true, onClick: closeBuildMenu };

  if (tower && tower.ownerId === LOCAL_PLAYER) {
    const next = tower.tier + 1;
    const maxed = tower.tier >= CONFIG.tower.tiers.length;
    buildPos = null;
    renderer.setGhost(tower.pos, "tower", true, CONFIG.tower.tiers[tower.tier - 1].range);
    hud.showBuildMenu(screenX, screenY, [
      {
        label: maxed ? `🗼 Tier ${tower.tier} (maxim)` : `⬆ Upgrade la tier ${next}`,
        detail: maxed ? undefined : `🪵 ${CONFIG.tower.tiers[tower.tier].cost} · damage ${CONFIG.tower.tiers[tower.tier].damage}`,
        blocked: canUpgradeTower(s, LOCAL_PLAYER, tower.id),
        onClick: () => {
          send({ type: "upgradeTower", playerId: LOCAL_PLAYER, towerId: tower.id });
          closeBuildMenu();
        },
      },
      cancel,
    ]);
    return;
  }

  buildPos = pos;
  const option = (kind: BuildKind, label: string): MenuOption => ({
    label,
    detail: `🪵 ${buildCost(kind)}`,
    blocked: canBuild(s, LOCAL_PLAYER, kind, pos),
    onClick: () => {
      send({ type: "build", playerId: LOCAL_PLAYER, kind, x: pos.x, z: pos.z });
      closeBuildMenu();
    },
  });
  const towerOpt = option("tower", "🗼 Turn");
  const fenceOpt = option("barricade", "🧱 Baricadă");
  renderer.setGhost(pos, "tower", !towerOpt.blocked || !fenceOpt.blocked, CONFIG.tower.tiers[0].range);
  hud.showBuildMenu(screenX, screenY, [towerOpt, fenceOpt, cancel]);
}

const hud = new Hud({
  onPickHero: startGame,
  onToggleBuild: () => setBuildMode(!buildMode),
  onStartWave: () => send({ type: "startWaveNow", playerId: LOCAL_PLAYER }),
  onUseAbility: useAbility,
  onOpenChest: () => send({ type: "openChest", playerId: LOCAL_PLAYER }),
  onToggleMute: () => {
    sfx.setMuted(!sfx.muted);
    return sfx.muted;
  },
  onRestart: () => {
    sim = null;
    renderer.reset();
    setBuildMode(false);
    hud.showHeroSelect();
  },
});

// Un „tap” = apăsare + ridicare fără să miști degetul mult.
let downAt: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => (downAt = { x: e.clientX, y: e.clientY }));
function tapAt(x: number, y: number): void {
  if (!buildMode) return;
  const pos = renderer.pickGround(x, y);
  if (pos) onBuildTap(pos, x, y);
}
canvas.addEventListener("pointerup", (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved <= 12) tapAt(e.clientX, e.clientY);
});
// Zona joystick-ului acoperă stânga-jos; o atingere scurtă acolo contează tot ca tap de construcție.
joystick.onTap = tapAt;
// Pe desktop, fantoma turnului urmărește mouse-ul (cât timp nu e deschis meniul).
canvas.addEventListener("pointermove", (e) => {
  if (!sim || !buildMode || buildPos || e.pointerType !== "mouse") return;
  const p = renderer.pickGround(e.clientX, e.clientY);
  if (p) renderer.setGhost(p, "tower", canBuild(sim.state, LOCAL_PLAYER, "tower", p) === null, CONFIG.tower.tiers[0].range);
});

keyboard.onPress("KeyB", () => sim && setBuildMode(!buildMode));
keyboard.onPress("Escape", () => setBuildMode(false));
keyboard.onPress("Enter", () => send({ type: "startWaveNow", playerId: LOCAL_PLAYER }));
keyboard.onPress("KeyC", () => sim && hud.setChestOpen(true));
["Digit1", "Digit2", "Digit3", "Digit4"].forEach((code, slot) => keyboard.onPress(code, () => useAbility(slot)));

// ---------- Bucla principală (o dată pe cadru) ----------
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
    sfx.play(events, LOCAL_PLAYER);
  }

  renderer.render();
});

hud.showHeroSelect();

// Pentru depanare în consola browserului: game().state
if (import.meta.env.DEV) (window as unknown as { game: () => GameSimulation | null }).game = () => sim;
