// Construcții: turnuri (cu tier-uri 1–4) și baricade.

import type { BuildKind } from "../commands";
import { CONFIG } from "../config";
import { OBSTACLES } from "../map";
import { type Vec2, angleOf, dist } from "../math";
import type { EntityId, GameEvent, GameState, PlayerId, Tower } from "../types";
import { findNearestZombie } from "./heroes";
import { damageZombie } from "./zombies";

const STEPS = (state: GameState) => Math.floor(state.wavesCompleted / CONFIG.economy.slotEveryWaves);

/** Câte sloturi are un jucător pentru fiecare tip de construcție (cresc cu valurile terminate). */
export function slotsFor(state: GameState, kind: BuildKind): number {
  const e = CONFIG.economy;
  return kind === "tower"
    ? e.startTowerSlots + STEPS(state)
    : e.startBarricadeSlots + STEPS(state) * e.barricadeSlotsPerStep;
}

export function builtBy(state: GameState, playerId: PlayerId, kind: BuildKind): number {
  const list = kind === "tower" ? state.towers : state.barricades;
  return list.filter((t) => t.ownerId === playerId).length;
}

export const buildCost = (kind: BuildKind): number =>
  kind === "tower" ? CONFIG.tower.tiers[0].cost : CONFIG.barricade.cost;

const buildRadius = (kind: BuildKind): number =>
  kind === "tower" ? CONFIG.tower.radius : CONFIG.barricade.radius;

/**
 * Verifică dacă jucătorul poate construi în punctul dat.
 * Returnează null dacă e OK, altfel motivul (text pentru UI).
 * UI-ul o folosește pentru culoarea „fantomei” verde/roșu, simularea pentru validare.
 */
export function canBuild(state: GameState, playerId: PlayerId, kind: BuildKind, pos: Vec2): string | null {
  const player = state.players[playerId];
  if (!player) return "Jucător necunoscut";
  if (state.phase === "gameover" || state.phase === "victory") return "Jocul s-a terminat";
  if (player.wood < buildCost(kind)) return `Ai nevoie de ${buildCost(kind)} lemn`;
  if (builtBy(state, playerId, kind) >= slotsFor(state, kind)) return "Nu mai ai sloturi libere";

  const r = buildRadius(kind);
  const edge = CONFIG.map.halfSize - r;
  if (Math.abs(pos.x) > edge || Math.abs(pos.z) > edge) return "În afara hărții";
  if (dist(pos, state.shelter.pos) < state.shelter.radius + r + 0.5) return "Prea aproape de adăpost";
  for (const o of OBSTACLES) if (dist(pos, o.pos) < o.radius + r) return "Loc ocupat";
  for (const t of state.towers) if (dist(pos, t.pos) < CONFIG.tower.radius + r + 0.1) return "Loc ocupat";
  // Baricadele se pot pune una lângă alta (ca să formeze un zid), dar nu una peste alta.
  const minBarricadeGap = kind === "barricade" ? CONFIG.barricade.radius * 1.5 : CONFIG.barricade.radius + r;
  for (const b of state.barricades) if (dist(pos, b.pos) < minBarricadeGap) return "Loc ocupat";
  for (const z of state.zombies) if (dist(pos, z.pos) < r + CONFIG.zombies[z.type].radius) return "E un zombie acolo";
  return null;
}

export function build(state: GameState, playerId: PlayerId, kind: BuildKind, pos: Vec2, events: GameEvent[]): boolean {
  if (canBuild(state, playerId, kind, pos) !== null) return false;
  state.players[playerId].wood -= buildCost(kind);
  const id = state.nextId++;
  if (kind === "tower") {
    state.towers.push({ id, ownerId: playerId, pos: { ...pos }, tier: 1, facing: 0, fireTimer: 0 });
    events.push({ type: "towerPlaced", id });
  } else {
    const hp = CONFIG.barricade.maxHp;
    state.barricades.push({ id, ownerId: playerId, pos: { ...pos }, hp, maxHp: hp });
    events.push({ type: "barricadePlaced", id });
  }
  return true;
}

/** Turnul jucătorului aflat în punctul dat (pentru tap → upgrade). */
export function towerAt(state: GameState, pos: Vec2): Tower | null {
  return state.towers.find((t) => dist(t.pos, pos) <= CONFIG.tower.radius + 0.6) ?? null;
}

export function canUpgradeTower(state: GameState, playerId: PlayerId, towerId: EntityId): string | null {
  const player = state.players[playerId];
  const tower = state.towers.find((t) => t.id === towerId);
  if (!player || !tower) return "Turn inexistent";
  if (tower.ownerId !== playerId) return "Nu e turnul tău";
  if (tower.tier >= CONFIG.tower.tiers.length) return "Tier maxim";
  if (tower.tier >= player.towerTier) return `Deblochează tier ${tower.tier + 1} din cufere`;
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
    damageZombie(state, target, stats.damage, events, owner?.heroId ?? null);
  }
}
