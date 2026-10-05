import { CONFIG } from "../config";
import { angleOf, distSq } from "../math";
import type { GameEvent, GameState, Hero, Zombie } from "../types";
import { resolveCollisions } from "./physics";
import { damageZombie } from "./zombies";

export function updateHeroes(state: GameState, dt: number, events: GameEvent[]): void {
  for (const hero of state.heroes) {
    const stats = CONFIG.heroes[hero.heroClass];

    if (!hero.alive) {
      hero.respawnTimer -= dt;
      if (hero.respawnTimer <= 0) respawnHero(state, hero, events);
      continue;
    }

    // 1. Mișcare după input.
    const { x, z } = hero.moveInput;
    if (x !== 0 || z !== 0) {
      hero.pos.x += x * stats.speed * dt;
      hero.pos.z += z * stats.speed * dt;
      hero.facing = angleOf(x, z);
      resolveCollisions(state, hero.pos, stats.radius);
    }

    // 2. Atac automat asupra celui mai apropiat zombie din rază.
    hero.fireTimer -= dt;
    const target = findNearestZombie(state, hero.pos, stats.range);
    if (target) {
      hero.facing = angleOf(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z);
      if (hero.fireTimer <= 0) {
        hero.fireTimer = stats.fireInterval;
        const damage = stats.damage * (1 + (hero.level - 1) * CONFIG.xp.damagePerLevel);
        events.push({ type: "shot", from: { ...hero.pos }, to: { ...target.pos }, source: "hero" });
        const killed = damageZombie(state, target, damage, events);
        if (killed) giveXp(hero, CONFIG.zombie.xp, events);
      }
    }
  }
}

export function findNearestZombie(
  state: GameState,
  from: { x: number; z: number },
  range: number,
): Zombie | null {
  let best: Zombie | null = null;
  let bestD = range * range;
  for (const z of state.zombies) {
    if (z.hp <= 0) continue;
    const d = distSq(from, z.pos);
    if (d <= bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

export function damageHero(hero: Hero, amount: number, events: GameEvent[]): void {
  if (!hero.alive) return;
  hero.hp -= amount;
  if (hero.hp <= 0) {
    hero.hp = 0;
    hero.alive = false;
    hero.respawnTimer = CONFIG.heroes[hero.heroClass].respawnTime;
    events.push({ type: "heroDied", id: hero.id });
  }
}

function respawnHero(state: GameState, hero: Hero, events: GameEvent[]): void {
  hero.alive = true;
  hero.hp = hero.maxHp;
  hero.pos = { x: state.shelter.pos.x, z: state.shelter.pos.z - state.shelter.radius - 1.5 };
  events.push({ type: "heroRespawned", id: hero.id });
}

function giveXp(hero: Hero, amount: number, events: GameEvent[]): void {
  hero.xp += amount;
  while (hero.xp >= CONFIG.xp.perLevel) {
    hero.xp -= CONFIG.xp.perLevel;
    hero.level++;
    hero.maxHp = Math.round(hero.maxHp * 1.1);
    hero.hp = hero.maxHp;
    events.push({ type: "levelUp", heroId: hero.id, level: hero.level });
  }
}
