import { CONFIG, type ZombieType } from "../config";
import { type Vec2, angleOf, dist, nextRandom } from "../math";
import type { Barricade, EntityId, GameEvent, GameState, Hero, Zombie } from "../types";
import { canReachShelter, flowDirection } from "../navigation";
import { damageHero, giveXp, heroById } from "./heroes";
import { resolveCollisions, separateZombies } from "./physics";

/** Creează un zombie într-un punct aleator de pe marginea hărții. */
export function spawnZombie(state: GameState, type: ZombieType): Zombie {
  const edge = CONFIG.map.halfSize - 1.5;
  const radius = CONFIG.zombies[type].radius;
  // Alegem un punct de pe margine din care există drum până la adăpost.
  let pos: Vec2 = { x: 0, z: edge };
  for (let attempt = 0; attempt < 20; attempt++) {
    const side = Math.floor(nextRandom(state) * 4);
    const t = (nextRandom(state) * 2 - 1) * edge;
    pos =
      side === 0 ? { x: t, z: edge } :
      side === 1 ? { x: t, z: -edge } :
      side === 2 ? { x: edge, z: t } :
                   { x: -edge, z: t };
    if (canReachShelter(pos, radius)) break;
  }

  const c = CONFIG.zombieCommon;
  const players = Object.keys(state.players).length;
  const scale = (1 + (state.wave - 1) * c.hpGrowthPerWave) * (1 + (players - 1) * c.hpPerExtraPlayer);
  const hp = Math.round(CONFIG.zombies[type].hp * scale);
  const zombie: Zombie = {
    id: state.nextId++,
    type,
    pos,
    facing: angleOf(-pos.x, -pos.z),
    hp,
    maxHp: hp,
    attackTimer: 0,
    slowTimer: 0,
    tauntHeroId: null,
    tauntTimer: 0,
    stuckTime: 0,
  };
  state.zombies.push(zombie);
  return zombie;
}

export function updateZombies(state: GameState, dt: number, events: GameEvent[]): void {
  // Pentru detecția de blocare: ținta și distanța până la ea, înainte de mișcare.
  const targets: (Vec2 | null)[] = [];
  const distBefore: number[] = [];

  for (const zombie of state.zombies) {
    const stats = CONFIG.zombies[zombie.type];
    zombie.attackTimer -= dt;
    zombie.slowTimer = Math.max(0, zombie.slowTimer - dt);
    zombie.tauntTimer = Math.max(0, zombie.tauntTimer - dt);

    // 1. Ținta: eroul care l-a provocat → eroul din raza de „aggro” → adăpostul.
    let hero: Hero | null = null;
    if (zombie.tauntTimer > 0 && zombie.tauntHeroId !== null) {
      const h = heroById(state, zombie.tauntHeroId);
      if (h?.alive) hero = h;
    }
    hero ??= nearestLivingHero(state, zombie.pos, CONFIG.zombieCommon.aggroRadius);
    const targetPos = hero ? hero.pos : state.shelter.pos;
    const targetRadius = hero ? CONFIG.heroes[hero.heroClass].radius : state.shelter.radius;

    const d = dist(zombie.pos, targetPos);
    let dirX = (targetPos.x - zombie.pos.x) / (d || 1);
    let dirZ = (targetPos.z - zombie.pos.z) / (d || 1);
    // Spre adăpost merge pe drumul ocolit din flow field (evită casele și brazii).
    if (!hero) {
      const flow = flowDirection(zombie.pos, stats.radius);
      if (flow) {
        dirX = flow.x;
        dirZ = flow.z;
      }
    }
    zombie.facing = angleOf(dirX, dirZ);

    const reach = targetRadius + stats.radius + 0.3;
    // 2. O baricadă în drum? O atacă pe ea.
    const blocking = d > reach ? barricadeInTheWay(state, zombie, dirX, dirZ) : null;
    const walking = d > reach && !blocking;
    targets.push(walking ? targetPos : null);
    distBefore.push(d);

    if (blocking) {
      zombie.facing = angleOf(blocking.pos.x - zombie.pos.x, blocking.pos.z - zombie.pos.z);
      if (zombie.attackTimer <= 0) {
        zombie.attackTimer = stats.attackInterval;
        damageBarricade(state, blocking, stats.damage, events);
      }
    } else if (d > reach) {
      // 3. Merge spre țintă.
      const speed = stats.speed * (zombie.slowTimer > 0 ? 0.5 : 1);
      const step = Math.min(speed * dt, d - reach + 0.01);
      zombie.pos.x += dirX * step;
      zombie.pos.z += dirZ * step;
    } else if (zombie.attackTimer <= 0) {
      // 4. A ajuns: atacă.
      zombie.attackTimer = stats.attackInterval;
      if (hero) {
        damageHero(hero, stats.damage, events);
      } else {
        state.shelter.hp = Math.max(0, state.shelter.hp - stats.damage);
        events.push({ type: "shelterHit" });
      }
    }
  }

  separateZombies(state);
  state.zombies.forEach((zombie, i) => {
    const stats = CONFIG.zombies[zombie.type];
    // Plasă de siguranță: un zombie blocat de peste 2 secunde poate trece prin case și brazi,
    // ca un val să nu rămână niciodată neterminat.
    const ghost = zombie.stuckTime > 2;
    resolveCollisions(state, zombie.pos, stats.radius, true, ghost);
    const target = targets[i];
    if (!target) return;
    // Progresul spre țintă: dacă aproape nu se apropie, e blocat.
    const progress = distBefore[i] - dist(zombie.pos, target);
    if (progress < stats.speed * dt * 0.25) {
      zombie.stuckTime += dt;
    } else {
      zombie.stuckTime = Math.max(0, zombie.stuckTime - dt * 0.5);
    }
  });
}

/** Baricada pe care zombiul o atinge și care e în direcția în care merge. */
function barricadeInTheWay(state: GameState, zombie: Zombie, dirX: number, dirZ: number): Barricade | null {
  const r = CONFIG.zombies[zombie.type].radius + CONFIG.barricade.radius + 0.35;
  for (const b of state.barricades) {
    const dx = b.pos.x - zombie.pos.x;
    const dz = b.pos.z - zombie.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < r && (dx * dirX + dz * dirZ) / (d || 1) > 0.2) return b;
  }
  return null;
}

export function damageBarricade(state: GameState, b: Barricade, amount: number, events: GameEvent[]): void {
  b.hp -= amount;
  if (b.hp > 0) return;
  state.barricades.splice(state.barricades.indexOf(b), 1);
  events.push({ type: "barricadeDestroyed", id: b.id, pos: { ...b.pos } });
}

/**
 * Aplică damage; dacă zombiul moare, îl scoate din joc, lasă monede și dă XP eroului care l-a omorât.
 * Returnează true la kill.
 */
export function damageZombie(
  state: GameState,
  zombie: Zombie,
  amount: number,
  events: GameEvent[],
  attackerHeroId: EntityId | null = null,
): boolean {
  if (zombie.hp <= 0) return false;
  zombie.hp -= amount;
  if (zombie.hp > 0) {
    events.push({ type: "zombieHit", id: zombie.id });
    return false;
  }
  const stats = CONFIG.zombies[zombie.type];
  state.zombies.splice(state.zombies.indexOf(zombie), 1);
  // Boss-ul lasă mai multe monede, împrăștiate.
  const drops = zombie.type === "boss" ? 6 : 1;
  for (let i = 0; i < drops; i++) {
    const a = (i / drops) * Math.PI * 2;
    const spread = drops > 1 ? 1.5 : 0;
    state.coins.push({
      id: state.nextId++,
      pos: { x: zombie.pos.x + Math.cos(a) * spread, z: zombie.pos.z + Math.sin(a) * spread },
      value: Math.round(stats.coins / drops),
    });
  }
  events.push({ type: "zombieDied", id: zombie.id, pos: { ...zombie.pos }, zombieType: zombie.type });
  const killer = attackerHeroId !== null ? heroById(state, attackerHeroId) : null;
  if (killer) giveXp(killer, stats.xp, events);
  return true;
}

/** Toți zombii (în viață) dintr-un cerc. */
export function zombiesInRadius(state: GameState, center: Vec2, radius: number): Zombie[] {
  return state.zombies.filter((z) => dist(z.pos, center) <= radius + CONFIG.zombies[z.type].radius);
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
