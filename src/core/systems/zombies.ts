import { CONFIG, type ZombieType } from "../config";
import { type Vec2, angleOf, dist, nextRandom } from "../math";
import { canReachShelter, flowDirection } from "../navigation";
import type { Barricade, EntityId, GameEvent, GameState, Hero, Zombie } from "../types";
import { damageBarricade, distToBarricade } from "./barricades";
import { damageHero, giveXp, heroById } from "./heroes";
import { resolveCollisions, separateZombies } from "./physics";

/** Creează un zombie într-un punct aleator de pe marginea hărții (sau lângă `near`, pentru hoarde). */
export function spawnZombie(state: GameState, type: ZombieType, near: Vec2 | null = null): Zombie {
  const edge = CONFIG.map.halfSize - 1.5;
  const radius = CONFIG.zombies[type].radius;
  // Alegem un punct de pe margine din care există drum până la adăpost.
  let pos: Vec2 = near ? { ...near } : { x: 0, z: edge };
  for (let attempt = 0; attempt < (near ? 0 : 20); attempt++) {
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
    fleeing: false,
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
    const speed = stats.speed * (zombie.slowTimer > 0 ? 0.45 : 1);

    // În zori: fuge spre cea mai apropiată margine și dispare (fără monede).
    if (zombie.fleeing) {
      const edge = CONFIG.map.halfSize + 2;
      const target = Math.abs(zombie.pos.x) > Math.abs(zombie.pos.z)
        ? { x: Math.sign(zombie.pos.x) * edge, z: zombie.pos.z }
        : { x: zombie.pos.x, z: Math.sign(zombie.pos.z) * edge };
      const d = dist(zombie.pos, target) || 1;
      zombie.facing = angleOf(target.x - zombie.pos.x, target.z - zombie.pos.z);
      zombie.pos.x += ((target.x - zombie.pos.x) / d) * speed * 1.3 * dt;
      zombie.pos.z += ((target.z - zombie.pos.z) / d) * speed * 1.3 * dt;
      targets.push(null);
      distBefore.push(0);
      continue;
    }

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
    // 2. Un zid în drum? Îl sparge.
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
  const edge = CONFIG.map.halfSize;
  // Mergem de la coadă la cap ca să putem scoate din listă zombii care au fugit.
  for (let i = state.zombies.length - 1; i >= 0; i--) {
    const zombie = state.zombies[i];
    const stats = CONFIG.zombies[zombie.type];
    if (zombie.fleeing) {
      if (Math.abs(zombie.pos.x) > edge || Math.abs(zombie.pos.z) > edge) state.zombies.splice(i, 1);
      continue;
    }
    // Plasă de siguranță: un zombie blocat de peste 2 secunde poate trece prin case și brazi,
    // ca o noapte să nu rămână niciodată „agățată”.
    resolveCollisions(state, zombie.pos, stats.radius, { barricades: "all", ignoreObstacles: zombie.stuckTime > 2 });
    const target = targets[i];
    if (!target) continue;
    // Progresul spre țintă: dacă aproape nu se apropie, e blocat.
    const progress = distBefore[i] - dist(zombie.pos, target);
    if (progress < stats.speed * dt * 0.25) {
      zombie.stuckTime += dt;
    } else {
      zombie.stuckTime = Math.max(0, zombie.stuckTime - dt * 0.5);
    }
  }
}

/** Zidul pe care zombiul îl atinge și care e în direcția în care merge. */
function barricadeInTheWay(state: GameState, zombie: Zombie, dirX: number, dirZ: number): Barricade | null {
  const r = CONFIG.zombies[zombie.type].radius + 0.35;
  for (const b of state.barricades) {
    if (distToBarricade(zombie.pos, b) > r) continue;
    const dx = b.pos.x - zombie.pos.x;
    const dz = b.pos.z - zombie.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    // Zidul e lung: îl considerăm „în drum” dacă nu e în spatele zombiului.
    if ((dx * dirX + dz * dirZ) / d > -0.3) return b;
  }
  return null;
}

/**
 * Aplică damage; dacă zombiul moare, îl scoate din joc, lasă monede și dă XP eroului care l-a omorât.
 * `from` = de unde a venit lovitura (pentru direcția sângelui). Returnează true la kill.
 */
export function damageZombie(
  state: GameState,
  zombie: Zombie,
  amount: number,
  events: GameEvent[],
  attackerHeroId: EntityId | null = null,
  from: Vec2 | null = null,
): boolean {
  if (zombie.hp <= 0 || !state.zombies.includes(zombie)) return false;
  zombie.hp -= amount;
  events.push({ type: "zombieHit", id: zombie.id, pos: { ...zombie.pos }, from: from ? { ...from } : { ...zombie.pos } });
  if (zombie.hp > 0) return false;

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
  if (killer) giveXp(state, killer, stats.xp, events);
  return true;
}

/** Toți zombii (care nu fug) dintr-un cerc. */
export function zombiesInRadius(state: GameState, center: Vec2, radius: number): Zombie[] {
  return state.zombies.filter((z) => !z.fleeing && dist(z.pos, center) <= radius + CONFIG.zombies[z.type].radius);
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
