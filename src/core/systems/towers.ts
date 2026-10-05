// Turnuri (posturi de lemn și piatră, tier 1–4).

import { CONFIG } from "../config";
import { OBSTACLES } from "../map";
import { type Vec2, angleOf, dist } from "../math";
import type { EntityId, GameEvent, GameState, PlayerId, Tower } from "../types";
import { distToBarricade } from "./barricades";
import { findNearestZombie } from "./heroes";
import { damageZombie } from "./zombies";

/** Câte turnuri poate avea un jucător (cresc cu nopțile trecute și din magazin). */
export function towerSlots(state: GameState, playerId: PlayerId): number {
  const e = CONFIG.economy;
  const extra = state.players[playerId]?.extraTowerSlots ?? 0;
  return e.startTowerSlots + Math.floor(state.wavesCompleted / e.slotEveryWaves) + extra;
}

export const towersOf = (state: GameState, playerId: PlayerId): number =>
  state.towers.filter((t) => t.ownerId === playerId).length;

export const towerCost = (): number => CONFIG.tower.tiers[0].cost;

/**
 * Verifică dacă jucătorul poate pune un turn în punctul dat.
 * Returnează null dacă e OK, altfel motivul (text pentru UI).
 */
export function canBuildTower(state: GameState, playerId: PlayerId, pos: Vec2): string | null {
  const player = state.players[playerId];
  if (!player) return "Jucător necunoscut";
  if (state.phase === "gameover" || state.phase === "victory") return "Jocul s-a terminat";
  if (player.wood < towerCost()) return `Ai nevoie de ${towerCost()} lemn`;
  if (towersOf(state, playerId) >= towerSlots(state, playerId)) return "Nu mai ai sloturi libere";

  const r = CONFIG.tower.radius;
  const edge = CONFIG.map.halfSize - r;
  if (Math.abs(pos.x) > edge || Math.abs(pos.z) > edge) return "În afara hărții";
  if (dist(pos, state.shelter.pos) < state.shelter.radius + r + 0.5) return "Prea aproape de adăpost";
  for (const o of OBSTACLES) if (dist(pos, o.pos) < o.radius + r) return "Loc ocupat";
  for (const t of state.towers) if (dist(pos, t.pos) < r * 2 + 0.1) return "Loc ocupat";
  for (const b of state.barricades) if (distToBarricade(pos, b) < r) return "Loc ocupat";
  for (const z of state.zombies) if (dist(pos, z.pos) < r + CONFIG.zombies[z.type].radius) return "E un zombie acolo";
  return null;
}

export function buildTower(state: GameState, playerId: PlayerId, pos: Vec2, events: GameEvent[]): boolean {
  if (canBuildTower(state, playerId, pos) !== null) return false;
  state.players[playerId].wood -= towerCost();
  const id = state.nextId++;
  state.towers.push({ id, ownerId: playerId, pos: { ...pos }, tier: 1, facing: 0, fireTimer: 0 });
  events.push({ type: "towerPlaced", id });
  return true;
}

/** Turnul aflat în punctul dat (pentru tap → upgrade). */
export function towerAt(state: GameState, pos: Vec2): Tower | null {
  return state.towers.find((t) => dist(t.pos, pos) <= CONFIG.tower.radius + 0.6) ?? null;
}

export function canUpgradeTower(state: GameState, playerId: PlayerId, towerId: EntityId): string | null {
  const player = state.players[playerId];
  const tower = state.towers.find((t) => t.id === towerId);
  if (!player || !tower) return "Turn inexistent";
  if (tower.ownerId !== playerId) return "Nu e turnul tău";
  if (tower.tier >= CONFIG.tower.tiers.length) return "Tier maxim";
  if (tower.tier >= player.towerTier) return `Deblochează tier ${tower.tier + 1} din magazin`;
  const cost = CONFIG.tower.tiers[tower.tier].cost;
  if (player.wood < cost) return `Ai nevoie de ${cost} lemn`;
  return null;
}

export function upgradeTower(state: GameState, playerId: PlayerId, towerId: EntityId, events: GameEvent[]): boolean {
  if (canUpgradeTower(state, playerId, towerId) !== null) return false;
  const tower = state.towers.find((t) => t.id === towerId)!;
  state.players[playerId].wood -= CONFIG.tower.tiers[tower.tier].cost;
  tower.tier++;
  events.push({ type: "towerUpgraded", id: tower.id, tier: tower.tier });
  return true;
}

export function updateTowers(state: GameState, dt: number, events: GameEvent[]): void {
  for (const tower of state.towers) {
    const stats = CONFIG.tower.tiers[tower.tier - 1];
    tower.fireTimer -= dt;
    const target = findNearestZombie(state, tower.pos, stats.range);
    if (!target) continue;
    tower.facing = angleOf(target.pos.x - tower.pos.x, target.pos.z - tower.pos.z);
    if (tower.fireTimer > 0) continue;
    tower.fireTimer = stats.fireInterval;
    events.push({ type: "shot", from: { ...tower.pos }, to: { ...target.pos }, source: "tower" });
    // XP-ul pentru kill-urile turnului merge la eroul proprietarului.
    const owner = state.players[tower.ownerId];
    damageZombie(state, target, stats.damage, events, owner?.heroId ?? null, tower.pos);
  }
}
