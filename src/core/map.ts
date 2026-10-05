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
  /** Doar pentru aspect: fiecare casă arată altfel. */
  variant: "normal" | "collapsed" | "boarded";
  seed: number;
}

/** Pietre pe jumătate îngropate în zăpadă (doar decor, fără coliziune). */
export interface Rock {
  pos: Vec2;
  size: number;
  seed: number;
}

export interface Tree {
  pos: Vec2;
  scale: number;
  radius: number;
}

/** Schelet uriaș de dinozaur, pe jumătate îngropat (doar decor, fără coliziune). */
export interface Fossil {
  pos: Vec2;
  rotation: number;
  scale: number;
  seed: number;
}

export interface GameMap {
  halfSize: number;
  houses: House[];
  trees: Tree[];
  rocks: Rock[];
  fossils: Fossil[];
}

/** Lățimea minimă a culoarelor dintre obstacole (diametrul boss-ului + o marjă). */
const PASSAGE = CONFIG.zombies.boss.radius * 2 + 0.4;

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
      variant: i === 2 ? "collapsed" : i === 5 ? "boarded" : "normal",
      seed: Math.floor(rand() * 1e6),
    });
  }

  // Brazi, mai deși spre marginea hărții.
  const trees: Tree[] = [];
  let attempts = 0;
  while (trees.length < 60 && attempts < 3000) {
    attempts++;
    const x = (rand() * 2 - 1) * (halfSize - 2);
    const z = (rand() * 2 - 1) * (halfSize - 2);
    const d = Math.hypot(x, z);
    if (d < 11) continue; // lasă spațiu liber în jurul adăpostului
    if (d < 28 && rand() < 0.6) continue; // mai puțini brazi în sat
    const scale = 0.8 + rand() * 0.7;
    const radius = 0.7 * scale;
    // Lăsăm între obstacole un culoar destul de lat cât să treacă și boss-ul.
    const blocked =
      houses.some((h) => Math.hypot(h.pos.x - x, h.pos.z - z) < h.radius + radius + PASSAGE) ||
      trees.some((t) => Math.hypot(t.pos.x - x, t.pos.z - z) < t.radius + radius + PASSAGE);
    if (blocked) continue;
    trees.push({ pos: { x, z }, scale, radius });
  }

  const rocks: Rock[] = [];
  for (let i = 0; i < 45; i++) {
    const x = (rand() * 2 - 1) * (halfSize - 1);
    const z = (rand() * 2 - 1) * (halfSize - 1);
    if (Math.hypot(x, z) < 7) continue;
    rocks.push({ pos: { x, z }, size: 0.3 + rand() * 0.8, seed: Math.floor(rand() * 1e6) });
  }

  // Câteva schelete de dinozaur prin zăpadă (ca în Warcraft), departe de sat și de case.
  const fossils: Fossil[] = [];
  for (let attempts = 0; fossils.length < 4 && attempts < 400; attempts++) {
    const a = rand() * Math.PI * 2;
    const d = 25 + rand() * 10;
    const pos = { x: Math.cos(a) * d, z: Math.sin(a) * d };
    const free =
      houses.every((h) => Math.hypot(h.pos.x - pos.x, h.pos.z - pos.z) > h.radius + 5) &&
      trees.every((t) => Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z) > t.radius + 3) &&
      fossils.every((f) => Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z) > 14);
    if (free) fossils.push({ pos, rotation: rand() * Math.PI * 2, scale: 0.8 + rand() * 0.5, seed: fossils.length });
  }

  return { halfSize, houses, trees, rocks, fossils };
}

export const GAME_MAP: GameMap = generateMap();

/** Toate obstacolele ca cercuri: {pos, radius}. */
export const OBSTACLES: ReadonlyArray<{ pos: Vec2; radius: number }> = [
  ...GAME_MAP.houses,
  ...GAME_MAP.trees,
];
