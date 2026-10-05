import { CONFIG, type ZombieType } from "../config";
import { type Vec2, angleOf, dist, nextRandom } from "../math";
import { canReachShelter, flowDirection } from "../navigation";
import type { Barricade, EntityId, GameEvent, GameState, Hero, Tower, Zombie } from "../types";
import { damageBarricade, distToBarricade } from "./barricades";
import { damageHero, giveXp, heroById } from "./heroes";
import { resolveCollisions, separateZombies } from "./physics";
import { damageTower } from "./towers";

/** Creează un zombie într-un punct aleator de pe marginea hărții (sau lângă `near`, pentru hoarde). */
export function spawnZombie(state: GameState, type: ZombieType, near: Vec2 | null = null): Zombie {
  const edge = CONFIG.map.halfSize - 1.5;
  const stats = CONFIG.zombies[type];
  // Alegem un punct de pe margine din care există drum până la adăpost (zburătorii nu au nevoie).
  let pos: Vec2 = near ? { ...near } : { x: 0, z: edge };
  for (let attempt = 0; attempt < (near ? 0 : 20); attempt++) {
    const side = Math.floor(nextRandom(state) * 4);
    const t = (nextRandom(state) * 2 - 1) * edge;
    pos =
      side === 0 ? { x: t, z: edge } :
      side === 1 ? { x: t, z: -edge } :
      side === 2 ? { x: edge, z: t } :
                   { x: -edge, z: t };
    if (stats.flying || canReachShelter(pos, stats.radius)) break;
  }

  const c = CONFIG.zombieCommon;
  const players = Object.keys(state.players).length;
  const scale = (1 + (state.wave - 1) * c.hpGrowthPerWave) * (1 + (players - 1) * c.hpPerExtraPlayer) *
    CONFIG.difficulty[state.difficulty].zombieHp;
  const hp = Math.round(stats.hp * scale);
  const zombie: Zombie = {
    id: state.nextId++,
    type,
    pos,
    facing: angleOf(-pos.x, -pos.z),
    hp,
    maxHp: hp,
    attackTimer: nextRandom(state) * stats.attackInterval,
    slowTimer: 0,
    stuckTime: 0,
    burning: false,
    aggroTowerId: null,
    chillTimer: 0,
    frozenTimer: 0,
  };
  state.zombies.push(zombie);
  return zombie;
}

export function updateZombies(state: GameState, dt: number, events: GameEvent[]): void {
  const c = CONFIG.zombieCommon;
  // Pentru detecția de blocare: ținta și distanța până la ea, înainte de mișcare.
  const targets: (Vec2 | null)[] = [];
  const distBefore: number[] = [];

  const difficultyDamage = CONFIG.difficulty[state.difficulty].zombieDamage;
  for (const zombie of [...state.zombies]) {
    const stats = CONFIG.zombies[zombie.type];
    const chilled = zombie.chillTimer > 0;
    zombie.chillTimer = Math.max(0, zombie.chillTimer - dt);
    zombie.slowTimer = Math.max(0, zombie.slowTimer - dt);

    // În zori: arde și moare încet (fără monede).
    if (zombie.burning) {
      zombie.hp -= zombie.maxHp * c.dawnBurnPerSecond * dt;
      if (zombie.hp <= 0) {
        killZombie(state, zombie, events, null, true);
        continue;
      }
    }
    // Înghețat de turnul de gheață: nu se mișcă și nu atacă.
    if (zombie.frozenTimer > 0) {
      zombie.frozenTimer -= dt;
      targets.push(null);
      distBefore.push(0);
      continue;
    }
    // Răcit: atacă mai rar.
    zombie.attackTimer -= dt * (chilled ? 1 - c.chillSlow : 1);
    const slow = (zombie.slowTimer > 0 ? 0.45 : 1) * (zombie.burning ? c.burnSlow : 1) * (chilled ? 1 - c.chillSlow : 1);
    const speed = stats.speed * slow;
    const damage = stats.damage * difficultyDamage * (zombie.burning ? 0.5 : 1);

    // 1. Ținta: eroul foarte aproape > turnul care l-a lovit > mina de plasmă.
    const hero = nearestLivingHero(state, zombie.pos, Math.max(c.aggroRadius, stats.rangedRange));
    let tower: Tower | null = null;
    if (!hero && zombie.aggroTowerId !== null) {
      tower = state.towers.find((t) => t.id === zombie.aggroTowerId) ?? null;
      if (!tower || dist(tower.pos, zombie.pos) > c.towerAggroRange) {
        zombie.aggroTowerId = null;
        tower = null;
      }
    }
    const targetPos = hero ? hero.pos : tower ? tower.pos : state.shelter.pos;
    const targetRadius = hero ? CONFIG.heroes[hero.heroClass].radius : tower ? CONFIG.tower.radius : state.shelter.radius;
    const d = dist(zombie.pos, targetPos);
    let dirX = (targetPos.x - zombie.pos.x) / (d || 1);
    let dirZ = (targetPos.z - zombie.pos.z) / (d || 1);
    // Spre mină merge pe drumul ocolit din flow field (zburătorii merg drept).
    if (!hero && !tower && !stats.flying) {
      const flow = flowDirection(zombie.pos, stats.radius);
      if (flow) {
        dirX = flow.x;
        dirZ = flow.z;
      }
    }
    zombie.facing = angleOf(dirX, dirZ);

    // 2. Scuipătorul: se oprește la distanță și aruncă proiectile.
    if (stats.rangedRange > 0 && d - targetRadius <= stats.rangedRange) {
      zombie.facing = angleOf(targetPos.x - zombie.pos.x, targetPos.z - zombie.pos.z);
      targets.push(null);
      distBefore.push(d);
      if (zombie.attackTimer <= 0) {
        zombie.attackTimer = stats.attackInterval;
        spit(state, zombie, targetPos, damage, events);
      }
      continue;
    }

    const reach = targetRadius + stats.radius + 0.3;
    // 3. Un zid în drum? Îl sparge (zburătorii trec pe deasupra).
    const blocking = d > reach && !stats.flying ? barricadeInTheWay(state, zombie, dirX, dirZ) : null;
    const walking = d > reach && !blocking;
    targets.push(walking ? targetPos : null);
    distBefore.push(d);

    if (blocking) {
      zombie.facing = angleOf(blocking.pos.x - zombie.pos.x, blocking.pos.z - zombie.pos.z);
      if (zombie.attackTimer <= 0) {
        zombie.attackTimer = stats.attackInterval;
        damageBarricade(state, blocking, damage, events);
        events.push({ type: "zombieAttack", id: zombie.id, zombieType: zombie.type, pos: { ...zombie.pos } });
      }
    } else if (d > reach) {
      // 4. Merge spre țintă.
      const step = Math.min(speed * dt, d - reach + 0.01);
      zombie.pos.x += dirX * step;
      zombie.pos.z += dirZ * step;
    } else if (zombie.attackTimer <= 0) {
      // 5. A ajuns: atacă.
      zombie.attackTimer = stats.attackInterval;
      events.push({ type: "zombieAttack", id: zombie.id, zombieType: zombie.type, pos: { ...zombie.pos } });
      if (hero) damageHero(hero, damage, events, zombie.pos);
      else if (tower) damageTower(state, tower, damage, events);
      else damageShelter(state, damage, events);
    }
  }

  separateZombies(state);
  state.zombies.forEach((zombie, i) => {
    const stats = CONFIG.zombies[zombie.type];
    if (stats.flying) {
      // Zburătorii trec peste tot; îi ținem doar pe hartă și în afara adăpostului.
      resolveCollisions(state, zombie.pos, stats.radius, { ignoreObstacles: true });
      return;
    }
    // Plasă de siguranță: un zombie blocat de peste 2 secunde poate trece prin case și brazi.
    resolveCollisions(state, zombie.pos, stats.radius, { barricades: "all", towers: true, ignoreObstacles: zombie.stuckTime > 2 });
    // Blocat mult timp lângă un turn pe care nu-l poate ajunge? Renunță și merge spre mină.
    if (zombie.stuckTime > 4 && zombie.aggroTowerId !== null) {
      zombie.aggroTowerId = null;
      zombie.stuckTime = 0;
    }
    const target = targets[i];
    if (!target) return;
    const progress = distBefore[i] - dist(zombie.pos, target);
    if (progress < stats.speed * dt * 0.25) zombie.stuckTime += dt;
    else zombie.stuckTime = Math.max(0, zombie.stuckTime - dt * 0.5);
  });
}

/** Scuipătorul aruncă un proiectil spre țintă. */
function spit(state: GameState, zombie: Zombie, target: Vec2, damage: number, events: GameEvent[]): void {
  const d = dist(zombie.pos, target) || 1;
  const speed = CONFIG.zombieCommon.spitSpeed;
  state.projectiles.push({
    id: state.nextId++,
    pos: { ...zombie.pos },
    vel: { x: ((target.x - zombie.pos.x) / d) * speed, z: ((target.z - zombie.pos.z) / d) * speed },
    damage,
    life: (d + 2) / speed,
  });
  events.push({ type: "spit", id: zombie.id, from: { ...zombie.pos }, to: { ...target } });
}

/** Proiectilele zboară peste ziduri și lovesc eroii sau adăpostul. */
export function updateProjectiles(state: GameState, dt: number, events: GameEvent[]): void {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    p.life -= dt;
    const hero = state.heroes.find((h) => h.alive && dist(h.pos, p.pos) < CONFIG.heroes[h.heroClass].radius + 0.3);
    const tower = hero ? undefined : state.towers.find((t) => dist(t.pos, p.pos) < CONFIG.tower.radius + 0.2);
    if (hero) {
      damageHero(hero, p.damage, events, { x: p.pos.x - p.vel.x, z: p.pos.z - p.vel.z });
    } else if (tower) {
      damageTower(state, tower, p.damage, events);
    } else if (dist(p.pos, state.shelter.pos) < state.shelter.radius) {
      damageShelter(state, p.damage, events);
    } else if (p.life > 0) {
      continue;
    }
    events.push({ type: "projectileHit", pos: { ...p.pos } });
    state.projectiles.splice(i, 1);
  }
}

function damageShelter(state: GameState, amount: number, events: GameEvent[]): void {
  state.shelter.hp = Math.max(0, state.shelter.hp - amount);
  events.push({ type: "shelterHit" });
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
 * Aplică damage; dacă zombiul moare, îl scoate din joc, poate lăsa o monedă și dă XP eroului care l-a omorât.
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
  killZombie(state, zombie, events, attackerHeroId, false);
  return true;
}

function killZombie(state: GameState, zombie: Zombie, events: GameEvent[], attackerHeroId: EntityId | null, burned: boolean): void {
  const stats = CONFIG.zombies[zombie.type];
  state.zombies.splice(state.zombies.indexOf(zombie), 1);
  events.push({ type: "zombieDied", id: zombie.id, pos: { ...zombie.pos }, zombieType: zombie.type, burned });
  if (burned) return; // cei arși de soare nu lasă nimic
  // Boss-ul învins lasă un cufăr cu ceva rar.
  if (zombie.type === "boss") {
    const id = state.nextId++;
    state.chests.push({ id, pos: { ...zombie.pos } });
    events.push({ type: "chestDropped", id, pos: { ...zombie.pos } });
  }
  // Monedele cad doar uneori; boss-ul lasă mai multe, împrăștiate.
  const drops = zombie.type === "boss" ? 5 : nextRandom(state) < stats.coinChance ? 1 : 0;
  for (let i = 0; i < drops; i++) {
    const a = (i / drops) * Math.PI * 2;
    const spread = drops > 1 ? 1.5 : 0;
    state.coins.push({
      id: state.nextId++,
      pos: { x: zombie.pos.x + Math.cos(a) * spread, z: zombie.pos.z + Math.sin(a) * spread },
      value: Math.round(stats.coins / drops),
      age: 0,
    });
  }
  const killer = attackerHeroId !== null ? heroById(state, attackerHeroId) : null;
  if (killer) giveXp(state, killer, stats.xp, events);
}

/** Toți zombii dintr-un cerc. */
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
