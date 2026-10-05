import { CONFIG } from "../config";
import { OBSTACLES } from "../map";
import { type Vec2, clamp } from "../math";
import type { GameState } from "../types";

/** Împinge un cerc (pos, radius) afară din obstacole și din adăpost, și îl ține pe hartă. */
export function resolveCollisions(state: GameState, pos: Vec2, radius: number): void {
  pushOutOf(pos, radius, state.shelter.pos, state.shelter.radius);
  for (const o of OBSTACLES) pushOutOf(pos, radius, o.pos, o.radius);
  const limit = CONFIG.map.halfSize - radius;
  pos.x = clamp(pos.x, -limit, limit);
  pos.z = clamp(pos.z, -limit, limit);
}

function pushOutOf(pos: Vec2, radius: number, center: Vec2, centerRadius: number): void {
  const dx = pos.x - center.x;
  const dz = pos.z - center.z;
  const minDist = radius + centerRadius;
  const dSq = dx * dx + dz * dz;
  if (dSq >= minDist * minDist) return;
  const d = Math.sqrt(dSq);
  if (d === 0) {
    pos.x = center.x + minDist;
    return;
  }
  pos.x = center.x + (dx / d) * minDist;
  pos.z = center.z + (dz / d) * minDist;
}

/** Ține zombii puțin depărtați unul de altul ca să nu stea toți într-un singur punct. */
export function separateZombies(state: GameState): void {
  const zs = state.zombies;
  const minDist = CONFIG.zombie.radius * 2;
  for (let i = 0; i < zs.length; i++) {
    for (let j = i + 1; j < zs.length; j++) {
      const a = zs[i].pos;
      const b = zs[j].pos;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dSq = dx * dx + dz * dz;
      if (dSq >= minDist * minDist || dSq === 0) continue;
      const d = Math.sqrt(dSq);
      const push = (minDist - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
    }
  }
}
