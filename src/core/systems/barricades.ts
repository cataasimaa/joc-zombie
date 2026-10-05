// Baricade = segmente de zid care se lipesc cap la cap (ca în Minecraft / Ark).
// Se pot muta, roti, întări (palisadă) sau transforma în ușă.

import { CONFIG } from "../config";
import { OBSTACLES } from "../map";
import { type Vec2, dist, distToSegment, segmentDistance, segmentEnds } from "../math";
import type { Barricade, EntityId, GameEvent, GameState, PlayerId } from "../types";

const B = CONFIG.barricade;

export const barricadeEnds = (b: { pos: Vec2; rotation: number }): [Vec2, Vec2] =>
  segmentEnds(b.pos, b.rotation, B.length);

/** Distanța de la un punct la suprafața zidului. */
export function distToBarricade(p: Vec2, b: Barricade): number {
  const [a, c] = barricadeEnds(b);
  return distToSegment(p, a, c) - B.thickness / 2;
}

export function barricadeById(state: GameState, id: EntityId): Barricade | undefined {
  return state.barricades.find((b) => b.id === id);
}

/** Rotația „naturală” într-un punct: zidul stă cu fața spre adăpost. */
export const defaultBarricadeRotation = (pos: Vec2): number => Math.atan2(pos.x, pos.z);

/**
 * Lipire automată: dacă unul din capetele zidului propus e aproape de capătul altui zid,
 * mutăm zidul ca cele două capete să coincidă.
 */
export function snapBarricade(state: GameState, pos: Vec2, rotation: number, ignoreId: EntityId | null = null): Vec2 {
  const mine = segmentEnds(pos, rotation, B.length);
  let best: { dx: number; dz: number; d: number } | null = null;
  for (const other of state.barricades) {
    if (other.id === ignoreId) continue;
    for (const end of barricadeEnds(other)) {
      for (const m of mine) {
        const d = dist(end, m);
        if (d < B.snapDistance && (!best || d < best.d)) best = { dx: end.x - m.x, dz: end.z - m.z, d };
      }
    }
  }
  return best ? { x: pos.x + best.dx, z: pos.z + best.dz } : pos;
}

/** Unde ar sta următorul zid dintr-un șir (continuă de la capătul zidului dat). */
export function nextInChain(b: { pos: Vec2; rotation: number }, side: 1 | -1 = 1): Vec2 {
  return {
    x: b.pos.x + Math.cos(b.rotation) * B.length * side,
    z: b.pos.z - Math.sin(b.rotation) * B.length * side,
  };
}

/** Verifică doar locul (nu și resursele). Folosit la construire și la mutare. */
export function barricadeSpotProblem(
  state: GameState,
  pos: Vec2,
  rotation: number,
  ignoreId: EntityId | null = null,
): string | null {
  const [a, b] = segmentEnds(pos, rotation, B.length);
  const half = B.thickness / 2;
  const edge = CONFIG.map.halfSize - 0.5;
  for (const p of [a, b]) if (Math.abs(p.x) > edge || Math.abs(p.z) > edge) return "În afara hărții";
  if (distToSegment(state.shelter.pos, a, b) < state.shelter.radius + half + 0.3) return "Prea aproape de adăpost";
  for (const o of OBSTACLES) if (distToSegment(o.pos, a, b) < o.radius + half) return "Loc ocupat";
  for (const t of state.towers) if (distToSegment(t.pos, a, b) < CONFIG.tower.radius + half) return "Loc ocupat";
  // Zidurile se pot atinge la capete (sau în unghi), dar nu se pot suprapune.
  const shrink = (p: Vec2, q: Vec2): [Vec2, Vec2] => {
    const k = 0.4 / B.length;
    return [
      { x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k },
      { x: q.x + (p.x - q.x) * k, z: q.z + (p.z - q.z) * k },
    ];
  };
  const [sa, sb] = shrink(a, b);
  for (const other of state.barricades) {
    if (other.id === ignoreId) continue;
    const [oa, ob] = barricadeEnds(other);
    const [soa, sob] = shrink(oa, ob);
    if (segmentDistance(sa, sb, soa, sob) < B.thickness * 0.8) return "Se suprapune cu alt zid";
  }
  for (const z of state.zombies) {
    if (distToSegment(z.pos, a, b) < CONFIG.zombies[z.type].radius + half) return "E un zombie acolo";
  }
  return null;
}

export function canBuildBarricade(state: GameState, playerId: PlayerId, pos: Vec2, rotation: number): string | null {
  const player = state.players[playerId];
  if (!player) return "Jucător necunoscut";
  if (state.phase === "gameover" || state.phase === "victory") return "Jocul s-a terminat";
  if (player.wood < B.levels[0].cost) return `Ai nevoie de ${B.levels[0].cost} lemn`;
  if (barricadesOf(state, playerId) >= barricadeSlots(state)) return "Nu mai ai sloturi libere";
  return barricadeSpotProblem(state, pos, rotation);
}

export function barricadeSlots(state: GameState): number {
  const e = CONFIG.economy;
  return e.startBarricadeSlots + Math.floor(state.wavesCompleted / e.slotEveryWaves) * e.barricadeSlotsPerStep;
}

export const barricadesOf = (state: GameState, playerId: PlayerId): number =>
  state.barricades.filter((b) => b.ownerId === playerId).length;

export function buildBarricade(
  state: GameState,
  playerId: PlayerId,
  pos: Vec2,
  rotation: number,
  events: GameEvent[],
): boolean {
  if (canBuildBarricade(state, playerId, pos, rotation) !== null) return false;
  state.players[playerId].wood -= B.levels[0].cost;
  const id = state.nextId++;
  const hp = B.levels[0].maxHp;
  state.barricades.push({ id, ownerId: playerId, pos: { ...pos }, rotation, level: 1, door: false, hp, maxHp: hp });
  events.push({ type: "barricadePlaced", id });
  return true;
}

export function canMoveBarricade(state: GameState, playerId: PlayerId, id: EntityId, pos: Vec2, rotation: number): string | null {
  const b = barricadeById(state, id);
  if (!b) return "Zid inexistent";
  if (b.ownerId !== playerId) return "Nu e zidul tău";
  return barricadeSpotProblem(state, pos, rotation, id);
}

export function moveBarricade(
  state: GameState,
  playerId: PlayerId,
  id: EntityId,
  pos: Vec2,
  rotation: number,
  events: GameEvent[],
): boolean {
  if (canMoveBarricade(state, playerId, id, pos, rotation) !== null) return false;
  const b = barricadeById(state, id)!;
  b.pos = { ...pos };
  b.rotation = rotation;
  events.push({ type: "barricadeChanged", id });
  return true;
}

export function canUpgradeBarricade(state: GameState, playerId: PlayerId, id: EntityId, to: "reinforce" | "door"): string | null {
  const b = barricadeById(state, id);
  const player = state.players[playerId];
  if (!b || !player) return "Zid inexistent";
  if (b.ownerId !== playerId) return "Nu e zidul tău";
  if (to === "door" && b.door) return "E deja ușă";
  if (to === "reinforce" && b.level >= B.levels.length) return "Nivel maxim";
  const cost = to === "door" ? B.doorCost : B.levels[b.level].cost;
  if (player.wood < cost) return `Ai nevoie de ${cost} lemn`;
  return null;
}

export function upgradeBarricade(
  state: GameState,
  playerId: PlayerId,
  id: EntityId,
  to: "reinforce" | "door",
  events: GameEvent[],
): boolean {
  if (canUpgradeBarricade(state, playerId, id, to) !== null) return false;
  const b = barricadeById(state, id)!;
  const player = state.players[playerId];
  if (to === "door") {
    player.wood -= B.doorCost;
    b.door = true;
  } else {
    player.wood -= B.levels[b.level].cost;
    b.level++;
    const ratio = b.hp / b.maxHp;
    b.maxHp = B.levels[b.level - 1].maxHp;
    b.hp = Math.max(b.hp, b.maxHp * ratio);
  }
  events.push({ type: "barricadeChanged", id });
  return true;
}

export function demolishBarricade(state: GameState, playerId: PlayerId, id: EntityId, events: GameEvent[]): boolean {
  const b = barricadeById(state, id);
  if (!b || b.ownerId !== playerId) return false;
  const spent = B.levels.slice(0, b.level).reduce((a, l) => a + l.cost, 0) + (b.door ? B.doorCost : 0);
  state.players[playerId].wood += Math.floor(spent * B.refund);
  state.barricades.splice(state.barricades.indexOf(b), 1);
  events.push({ type: "barricadeDestroyed", id, pos: { ...b.pos } });
  return true;
}

export function damageBarricade(state: GameState, b: Barricade, amount: number, events: GameEvent[]): void {
  b.hp -= amount;
  events.push({ type: "barricadeHit", id: b.id, pos: { ...b.pos } });
  if (b.hp > 0) return;
  state.barricades.splice(state.barricades.indexOf(b), 1);
  events.push({ type: "barricadeDestroyed", id: b.id, pos: { ...b.pos } });
}

/** Zidul cel mai apropiat de un punct (pentru tap → meniul de editare). */
export function barricadeAt(state: GameState, pos: Vec2): Barricade | null {
  let best: Barricade | null = null;
  let bestD = 0.9;
  for (const b of state.barricades) {
    const d = distToBarricade(pos, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}
