// Harta: satul de munte. Obstacolele (case, brazi) sunt definite aici, în logică,
// pentru că afectează coliziunile. Randarea doar le desenează.

import { CONFIG } from "./config";
import { type Vec2, nextRandom } from "./math";

export interface House {
  pos: Vec2;
  width: number;
  depth: number;
  rotation: number;
  /** Coliziunea casei e aproximată cu un cerc (simplu și rapid). */
  radius: number;
}

export interface Tree {
  pos: Vec2;
  scale: number;
  radius: number;
}

export interface GameMap {
  halfSize: number;
  houses: House[];
  trees: Tree[];
}

/** Seed fix: harta e mereu aceeași (și identică pe server și pe toți clienții). */
const MAP_SEED = 1337;

function generateMap(): GameMap {
  const rng = { rngState: MAP_SEED };
  const rand = () => nextRandom(rng);
  const halfSize = CONFIG.map.halfSize;

  // Case de lemn pe un inel în jurul adăpostului.
  const houses: House[] = [];
  const houseCount = 7;
  for (let i = 0; i < houseCount; i++) {
    const angle = (i / houseCount) * Math.PI * 2 + rand() * 0.4;
    const r = 17 + rand() * 6;
    const width = 4 + rand() * 1.5;
    const depth = 3.5 + rand() * 1.5;
    houses.push({
      pos: { x: Math.cos(angle) * r, z: Math.sin(angle) * r },
      width,
      depth,
      rotation: -angle + Math.PI / 2,
      radius: Math.max(width, depth) * 0.55,
    });
  }

  // Brazi, mai deși spre marginea hărții.
  const trees: Tree[] = [];
  let attempts = 0;
  while (trees.length < 70 && attempts < 2000) {
    attempts++;
    const x = (rand() * 2 - 1) * (halfSize - 2);
    const z = (rand() * 2 - 1) * (halfSize - 2);
    const d = Math.hypot(x, z);
    if (d < 11) continue; // lasă spațiu liber în jurul adăpostului
    if (d < 28 && rand() < 0.6) continue; // mai puțini brazi în sat
    const scale = 0.8 + rand() * 0.7;
    const radius = 0.7 * scale;
    const blocked =
      houses.some((h) => Math.hypot(h.pos.x - x, h.pos.z - z) < h.radius + radius + 1.5) ||
      trees.some((t) => Math.hypot(t.pos.x - x, t.pos.z - z) < t.radius + radius + 1.2);
    if (blocked) continue;
    trees.push({ pos: { x, z }, scale, radius });
  }

  return { halfSize, houses, trees };
}

export const GAME_MAP: GameMap = generateMap();

/** Toate obstacolele ca cercuri: {pos, radius}. */
export const OBSTACLES: ReadonlyArray<{ pos: Vec2; radius: number }> = [
  ...GAME_MAP.houses,
  ...GAME_MAP.trees,
];
