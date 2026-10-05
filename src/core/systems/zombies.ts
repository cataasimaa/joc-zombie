import { CONFIG } from "../config";
import { type Vec2, angleOf, dist, nextRandom } from "../math";
import type { GameEvent, GameState, Hero, Zombie } from "../types";
import { damageHero } from "./heroes";
import { resolveCollisions, separateZombies } from "./physics";

/** Creează un zombie într-un punct aleator de pe marginea hărții. */
export function spawnZombie(state: GameState): void {
  const edge = CONFIG.map.halfSize - 1;
  const side = Math.floor(nextRandom(state) * 4);
  const t = (nextRandom(state) * 2 - 1) * edge;
  const pos: Vec2 =
    side === 0 ? { x: t, z: edge } :
    side === 1 ? { x: t, z: -edge } :
    side === 2 ? { x: edge, z: t } :
                 { x: -edge, z: t };

  const hp = Math.round(CONFIG.zombie.baseHp * (1 + (state.wave - 1) * CONFIG.zombie.hpGrowthPerWave));
  state.zombies.push({
    id: state.nextId++,
    pos,
    facing: angleOf(-pos.x, -pos.z),
    hp,
    maxHp: hp,
    attackTimer: 0,
  });
}

export function updateZombies(state: GameState, dt: number, events: GameEvent[]): void {
  const cfg = CONFIG.zombie;
  const before = state.zombies.map((z) => ({ ...z.pos }));
  const walking: boolean[] = [];

  for (const zombie of state.zombies) {
    // Ținta: eroul viu cel mai apropiat dacă e în raza de „aggro”, altfel adăpostul.
    const hero = nearestLivingHero(state, zombie.pos, cfg.aggroRadius);
    const targetPos = hero ? hero.pos : state.shelter.pos;
    const targetRadius = hero ? CONFIG.heroes[hero.heroClass].radius : state.shelter.radius;

    const d = dist(zombie.pos, targetPos);
    zombie.facing = angleOf(targetPos.x - zombie.pos.x, targetPos.z - zombie.pos.z);
    zombie.attackTimer -= dt;

    const reach = targetRadius + cfg.radius + 0.3;
    walking.push(d > reach);
    if (d > reach) {
      // Merge spre țintă.
      const step = Math.min(cfg.speed * dt, d - reach + 0.01);
      zombie.pos.x += ((targetPos.x - zombie.pos.x) / d) * step;
      zombie.pos.z += ((targetPos.z - zombie.pos.z) / d) * step;
    } else if (zombie.attackTimer <= 0) {
      // A ajuns: atacă.
      zombie.attackTimer = cfg.attackInterval;
      if (hero) {
        damageHero(hero, cfg.damage, events);
      } else {
        state.shelter.hp = Math.max(0, state.shelter.hp - cfg.damage);
        events.push({ type: "shelterHit" });
      }
    }
  }

  separateZombies(state);
  state.zombies.forEach((zombie, i) => {
    resolveCollisions(state, zombie.pos, cfg.radius);
    // Dacă a vrut să meargă dar aproape nu s-a mișcat, e blocat în fața unui obstacol:
    // îl împingem lateral (stânga sau dreapta, după id) ca să-l ocolească.
    if (walking[i] && dist(before[i], zombie.pos) < cfg.speed * dt * 0.2) {
      const side = zombie.id % 2 === 0 ? 1 : -1;
      zombie.pos.x += Math.cos(zombie.facing) * side * cfg.speed * dt;
      zombie.pos.z -= Math.sin(zombie.facing) * side * cfg.speed * dt;
      resolveCollisions(state, zombie.pos, cfg.radius);
    }
  });
}

/** Aplică damage; dacă zombiul moare, îl scoate din joc și lasă o monedă. Returnează true la kill. */
export function damageZombie(state: GameState, zombie: Zombie, amount: number, events: GameEvent[]): boolean {
  if (zombie.hp <= 0) return false;
  zombie.hp -= amount;
  if (zombie.hp > 0) {
    events.push({ type: "zombieHit", id: zombie.id });
    return false;
  }
  state.zombies.splice(state.zombies.indexOf(zombie), 1);
  state.coins.push({ id: state.nextId++, pos: { ...zombie.pos }, value: CONFIG.zombie.coinValue });
  events.push({ type: "zombieDied", id: zombie.id, pos: { ...zombie.pos } });
  return true;
}

function nearestLivingHero(state: GameState, from: Vec2, range: number): Hero | null {
  let best: Hero | null = null;
  let bestD = range;
  for (const h of state.heroes) {
    if (!h.alive) continue;
    const d = dist(from, h.pos);
    if (d <= bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}
