import { CONFIG } from "../config";
import { OBSTACLES } from "../map";
import { type Vec2, angleOf, dist } from "../math";
import type { GameEvent, GameState, PlayerId } from "../types";
import { findNearestZombie } from "./heroes";
import { damageZombie } from "./zombies";

/** Câte sloturi de construcție are un jucător (crește cu valurile terminate). */
export function slotsFor(state: GameState): number {
  return CONFIG.economy.startSlots + Math.floor(state.wavesCompleted / CONFIG.economy.slotEveryWaves);
}

export function towersOwnedBy(state: GameState, playerId: PlayerId): number {
  return state.towers.filter((t) => t.ownerId === playerId).length;
}

/**
 * Verifică dacă jucătorul poate pune un turn în punctul dat.
 * Returnează null dacă e OK, altfel motivul (text pentru UI).
 * UI-ul o folosește pentru culoarea „fantomei” verde/roșu, simularea pentru validare.
 */
export function canPlaceTower(state: GameState, playerId: PlayerId, pos: Vec2): string | null {
  const player = state.players[playerId];
  if (!player) return "Jucător necunoscut";
  if (state.phase === "gameover" || state.phase === "victory") return "Jocul s-a terminat";
  if (player.coins < CONFIG.tower.cost) return `Ai nevoie de ${CONFIG.tower.cost} monede`;
  if (towersOwnedBy(state, playerId) >= slotsFor(state)) return "Nu mai ai sloturi libere";

  const r = CONFIG.tower.radius;
  const edge = CONFIG.map.halfSize - r;
  if (Math.abs(pos.x) > edge || Math.abs(pos.z) > edge) return "În afara hărții";
  if (dist(pos, state.shelter.pos) < state.shelter.radius + r + 0.5) return "Prea aproape de adăpost";
  for (const o of OBSTACLES) if (dist(pos, o.pos) < o.radius + r) return "Loc ocupat";
  for (const t of state.towers) if (dist(pos, t.pos) < r * 2 + 0.2) return "Loc ocupat";
  return null;
}

export function placeTower(state: GameState, playerId: PlayerId, pos: Vec2, events: GameEvent[]): boolean {
  if (canPlaceTower(state, playerId, pos) !== null) return false;
  state.players[playerId].coins -= CONFIG.tower.cost;
  const id = state.nextId++;
  state.towers.push({ id, ownerId: playerId, pos: { ...pos }, tier: 1, facing: 0, fireTimer: 0 });
  events.push({ type: "towerPlaced", id });
  return true;
}

export function updateTowers(state: GameState, dt: number, events: GameEvent[]): void {
  const cfg = CONFIG.tower;
  for (const tower of state.towers) {
    tower.fireTimer -= dt;
    const target = findNearestZombie(state, tower.pos, cfg.range);
    if (!target) continue;
    tower.facing = angleOf(target.pos.x - tower.pos.x, target.pos.z - tower.pos.z);
    if (tower.fireTimer > 0) continue;
    tower.fireTimer = cfg.fireInterval;
    events.push({ type: "shot", from: { ...tower.pos }, to: { ...target.pos }, source: "tower" });
    damageZombie(state, target, cfg.damage, events);
  }
}
