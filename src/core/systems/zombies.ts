import { CONFIG, isBoss, type ZombieType } from "../config";
import { type Vec2, angleOf, dist, nextRandom } from "../math";
import { canReachShelter, flowDirection, flowToTargets } from "../navigation";
import type { Barricade, EntityId, GameEvent, GameState, Hero, Projectile, Tower, Zombie } from "../types";
import { damageBarricade, distToBarricade } from "./barricades";
import { damageHero, giveXp, heroById } from "./heroes";
import { resolveCollisions, separateZombies } from "./physics";
import { spawnDrop } from "./survival";
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
    CONFIG.difficulty[state.difficulty].zombieHp * CONFIG.modes[state.mode].zombieHp;
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
    lastHitBy: null,
    chillTimer: 0,
    frozenTimer: 0,
    freezeImmune: 0,
    abilityTimer: firstAbility(state, type),
    ability2Timer: type === "witch" ? A.towerFreezeEvery : type === "colossus" ? A.boulderEvery : type === "frostKing" ? A.kingVolleyEvery : 0,
    charge: null,
    burrowed: type === "burrower",
    rageTimer: 0,
    enraged: false,
  };
  state.zombies.push(zombie);
  return zombie;
}

const A = CONFIG.zombieAbilities;

/** Prima folosire a abilității: puțin aleator, ca să nu urle / sară toți deodată. */
function firstAbility(state: GameState, type: ZombieType): number {
  const every: Partial<Record<ZombieType, number>> = {
    screamer: A.screamEvery, shaman: A.healEvery, broodmother: A.broodEvery, yeti: A.chargeEvery, witch: A.blinkEvery, colossus: A.stompEvery,
    frostKing: A.kingStompEvery,
  };
  return (every[type] ?? 0) * (0.5 + nextRandom(state) * 0.5);
}

/** Poate fi lovit / țintit? (Săpătorul sub zăpadă nu poate.) */
export const targetable = (z: Zombie): boolean => !z.burrowed;

export function updateZombies(state: GameState, dt: number, events: GameEvent[]): void {
  const c = CONFIG.zombieCommon;
  // Pentru detecția de blocare: ținta și distanța până la ea, înainte de mișcare.
  const tracked = new Map<Zombie, { target: Vec2 | null; before: number }>();
  const track = (z: Zombie, target: Vec2 | null, before: number) => tracked.set(z, { target, before });

  const difficultyDamage = CONFIG.difficulty[state.difficulty].zombieDamage;
  const weatherSpeed = CONFIG.weather[state.weather].zombieSpeed;
  const survival = state.mode === "survival";
  const heroTargets = state.heroes.filter((h) => h.alive).map((h) => h.pos);
  const stamp = `${Math.floor(state.time * 2)}`;
  for (const zombie of [...state.zombies]) {
    if (!state.zombies.includes(zombie)) continue; // a murit între timp (ex. explozia unui umflat)
    const stats = CONFIG.zombies[zombie.type];
    const chilled = zombie.chillTimer > 0;
    zombie.chillTimer = Math.max(0, zombie.chillTimer - dt);
    zombie.slowTimer = Math.max(0, zombie.slowTimer - dt);
    zombie.freezeImmune = Math.max(0, zombie.freezeImmune - dt);

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
      track(zombie, null, 0);
      continue;
    }
    // Înfuriat de urlătoare: mai rapid și atacă mai des. Colosul înfuriat: mai rapid.
    zombie.rageTimer = Math.max(0, zombie.rageTimer - dt);
    const rage = (zombie.rageTimer > 0 ? A.rageSpeed : 1) * (zombie.enraged ? A.enrageSpeed : 1);
    // Răcit: atacă mai rar.
    zombie.attackTimer -= dt * (chilled ? 1 - c.chillSlow : 1) * rage;
    const slow = (zombie.slowTimer > 0 ? 0.45 : 1) * (zombie.burning ? c.burnSlow : 1) * (chilled ? 1 - c.chillSlow : 1);
    const speed = stats.speed * slow * weatherSpeed * rage;
    const damage = stats.damage * difficultyDamage * (zombie.burning ? 0.5 : 1);

    // Yeti-ul în plină năpustire (sau încordat dinainte): nu mai face nimic altceva.
    if (zombie.charge) {
      updateCharge(state, zombie, dt, difficultyDamage, events);
      track(zombie, null, 0);
      continue;
    }
    // Abilitățile (urlet, vindecare, pui, teleport, undă de șoc...).
    useAbilities(state, zombie, dt, events);
    if (!state.zombies.includes(zombie)) continue;
    if (zombie.charge) {
      track(zombie, null, 0);
      continue;
    }

    // 1. Ținta: eroul foarte aproape > turnul care l-a lovit > mina de plasmă.
    //    În Supraviețuire nu există mină de apărat: zombii vânează eroii oriunde ar fi.
    const hero = nearestLivingHero(state, zombie.pos, survival ? Infinity : Math.max(c.aggroRadius, stats.rangedRange));
    const heroClose = hero !== null && dist(hero.pos, zombie.pos) <= Math.max(c.aggroRadius, stats.rangedRange);
    let tower: Tower | null = null;
    if (!heroClose && zombie.aggroTowerId !== null) {
      tower = state.towers.find((t) => t.id === zombie.aggroTowerId) ?? null;
      if (!tower || dist(tower.pos, zombie.pos) > c.towerAggroRange) {
        zombie.aggroTowerId = null;
        tower = null;
      }
    }
    const chase = tower ? null : hero; // eroul urmărit (dacă nu atacă un turn)
    const targetPos = tower ? tower.pos : chase ? chase.pos : state.shelter.pos;
    const targetRadius = tower ? CONFIG.tower.radius : chase ? CONFIG.heroes[chase.heroClass].radius : state.shelter.radius;
    const d = dist(zombie.pos, targetPos);
    let dirX = (targetPos.x - zombie.pos.x) / (d || 1);
    let dirZ = (targetPos.z - zombie.pos.z) / (d || 1);
    // Merge pe drumul ocolit din flow field (zburătorii, săpătorii și cei foarte aproape merg drept).
    if (!heroClose && !tower && !stats.flying && !zombie.burrowed && (chase || !survival)) {
      const flow = chase ? flowToTargets(zombie.pos, stats.radius, heroTargets, stamp) : flowDirection(zombie.pos, stats.radius);
      if (flow) {
        dirX = flow.x;
        dirZ = flow.z;
      }
    }
    zombie.facing = angleOf(dirX, dirZ);

    // Săpătorul iese din zăpadă lângă țintă (și îi dă o lovitură când iese).
    if (zombie.burrowed && d - targetRadius <= A.burrowEmerge) {
      zombie.burrowed = false;
      events.push({ type: "burrowUp", id: zombie.id, pos: { ...zombie.pos } });
      for (const h of state.heroes) {
        if (h.alive && dist(h.pos, zombie.pos) <= 2) damageHero(h, A.emergeDamage * difficultyDamage, events, zombie.pos, false, zombie.id);
      }
    }

    // 2. Scuipătorul (și vrăjitoarea): se oprește la distanță și aruncă. Șamanul doar stă în spate.
    if (stats.rangedRange > 0 && d - targetRadius <= stats.rangedRange) {
      zombie.facing = angleOf(targetPos.x - zombie.pos.x, targetPos.z - zombie.pos.z);
      track(zombie, null, d);
      if (zombie.attackTimer <= 0 && zombie.type !== "shaman") {
        zombie.attackTimer = stats.attackInterval;
        if (zombie.type === "witch") throwAt(state, zombie, targetPos, A.iceBoltDamage * difficultyDamage, "ice", events);
        else spit(state, zombie, targetPos, damage, events);
      }
      continue;
    }

    const reach = targetRadius + stats.radius + 0.3;
    // 3. Un zid în drum? Îl sparge (zburătorii trec pe deasupra, săpătorii pe dedesubt).
    const blocking = d > reach && !stats.flying && !zombie.burrowed ? barricadeInTheWay(state, zombie, dirX, dirZ) : null;
    const walking = d > reach && !blocking;
    track(zombie, walking ? targetPos : null, d);

    if (zombie.type === "bloater" && (blocking || d <= reach)) {
      // Umflatul nu mușcă: ajunge lângă țintă (sau lângă zid) și explodează.
      killZombie(state, zombie, events, null, false);
      continue;
    }
    if (blocking) {
      zombie.facing = angleOf(blocking.pos.x - zombie.pos.x, blocking.pos.z - zombie.pos.z);
      if (zombie.attackTimer <= 0) {
        zombie.attackTimer = stats.attackInterval;
        damageBarricade(state, blocking, damage, events);
        events.push({ type: "zombieAttack", id: zombie.id, zombieType: zombie.type, pos: { ...zombie.pos }, wall: true });
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
      if (tower) damageTower(state, tower, damage, events);
      else if (chase) damageHero(chase, damage, events, zombie.pos, false, zombie.id);
      else if (!survival) damageShelter(state, damage, events);
    }
  }

  separateZombies(state);
  for (const zombie of state.zombies) {
    const stats = CONFIG.zombies[zombie.type];
    if (stats.flying || zombie.burrowed) {
      // Zburătorii trec peste tot; îi ținem doar pe hartă și în afara adăpostului.
      resolveCollisions(state, zombie.pos, stats.radius, { ignoreObstacles: true });
      continue;
    }
    // Plasă de siguranță: un zombie blocat de peste 2 secunde poate trece prin case și brazi.
    resolveCollisions(state, zombie.pos, stats.radius, { barricades: "all", towers: true, ignoreObstacles: zombie.stuckTime > 2 });
    // Blocat mult timp lângă un turn pe care nu-l poate ajunge? Renunță și merge spre mină.
    if (zombie.stuckTime > 4 && zombie.aggroTowerId !== null) {
      zombie.aggroTowerId = null;
      zombie.stuckTime = 0;
    }
    const t = tracked.get(zombie);
    if (!t || !t.target) continue;
    const progress = t.before - dist(zombie.pos, t.target);
    if (progress < stats.speed * dt * 0.25) zombie.stuckTime += dt;
    else zombie.stuckTime = Math.max(0, zombie.stuckTime - dt * 0.5);
  }
}

// ---------- Abilitățile zombilor noi și ale boșilor ----------

function useAbilities(state: GameState, z: Zombie, dt: number, events: GameEvent[]): void {
  if (z.burning) return;
  const difficultyDamage = CONFIG.difficulty[state.difficulty].zombieDamage;
  z.abilityTimer -= dt;
  z.ability2Timer -= dt;
  switch (z.type) {
    case "screamer": {
      // Urlă când e cineva de înfuriat în jur.
      if (z.abilityTimer > 0) return;
      const near = state.zombies.filter((o) => o !== z && dist(o.pos, z.pos) <= A.screamRadius);
      if (near.length === 0) return;
      z.abilityTimer = A.screamEvery;
      for (const o of near) o.rageTimer = A.rageTime;
      events.push({ type: "scream", id: z.id, pos: { ...z.pos }, radius: A.screamRadius });
      return;
    }
    case "shaman": {
      if (z.abilityTimer > 0) return;
      const hurt = state.zombies.filter((o) => o !== z && o.hp < o.maxHp && dist(o.pos, z.pos) <= A.healRadius);
      if (hurt.length === 0) return;
      z.abilityTimer = A.healEvery;
      for (const o of hurt) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * A.healPct);
      events.push({ type: "shamanHeal", id: z.id, pos: { ...z.pos }, radius: A.healRadius });
      return;
    }
    case "broodmother": {
      if (z.abilityTimer > 0) return;
      z.abilityTimer = A.broodEvery;
      spawnBrood(state, z, A.broodCount, events);
      return;
    }
    case "yeti": {
      if (z.abilityTimer > 0) return;
      const hero = nearestLivingHero(state, z.pos, A.chargeRange);
      if (!hero) return;
      const d = dist(hero.pos, z.pos) || 1;
      if (d < 3) return; // prea aproape: îl bate pe loc
      z.abilityTimer = A.chargeEvery;
      const dir = { x: (hero.pos.x - z.pos.x) / d, z: (hero.pos.z - z.pos.z) / d };
      z.facing = angleOf(dir.x, dir.z);
      z.charge = { phase: "wind", time: A.chargeWindup, dir };
      events.push({ type: "yetiWindup", id: z.id, pos: { ...z.pos }, dir });
      return;
    }
    case "witch": {
      // Viscolul ei îngheață turnurile din jur (nu trag câteva secunde).
      if (z.ability2Timer <= 0) {
        const towers = state.towers.filter((t) => dist(t.pos, z.pos) <= A.towerFreezeRadius);
        if (towers.length > 0) {
          z.ability2Timer = A.towerFreezeEvery;
          for (const t of towers) t.frozenTimer = A.towerFreezeTime;
          events.push({ type: "towersFrozen", id: z.id, pos: { ...z.pos }, radius: A.towerFreezeRadius, count: towers.length });
        }
      }
      // Teleport lângă țintă (eroul cel mai apropiat sau mina).
      if (z.abilityTimer <= 0) {
        z.abilityTimer = A.blinkEvery;
        const hero = nearestLivingHero(state, z.pos, Infinity);
        const goal = hero ? hero.pos : state.shelter.pos;
        const a = nextRandom(state) * Math.PI * 2;
        const to = { x: goal.x + Math.cos(a) * A.blinkDistance, z: goal.z + Math.sin(a) * A.blinkDistance };
        const lim = CONFIG.map.halfSize - 2;
        to.x = Math.max(-lim, Math.min(lim, to.x));
        to.z = Math.max(-lim, Math.min(lim, to.z));
        const from = { ...z.pos };
        z.pos = to;
        resolveCollisions(state, z.pos, CONFIG.zombies.witch.radius, { barricades: "all", towers: true });
        events.push({ type: "witchBlink", id: z.id, from, to: { ...z.pos } });
      }
      return;
    }
    case "frostKing": {
      // Regele Iernii: bate din picior / ridică morții pe rând, aruncă salve de țurțuri; la jumătate se înfurie.
      if (!z.enraged && z.hp <= z.maxHp * A.enrageAt) {
        z.enraged = true;
        events.push({ type: "bossEnraged", id: z.id, pos: { ...z.pos } });
      }
      if (z.abilityTimer <= 0) {
        z.abilityTimer = A.kingStompEvery;
        const r = A.stompRadius;
        const heroes = state.heroes.filter((h) => h.alive && dist(h.pos, z.pos) <= r);
        if (heroes.length > 0) {
          const dmg = A.stompDamage * difficultyDamage;
          for (const h of heroes) damageHero(h, dmg, events, z.pos, false, z.id);
          for (const t of state.towers) if (dist(t.pos, z.pos) <= r) damageTower(state, t, dmg, events);
          for (const b of state.barricades) if (!b.broken && distToBarricade(z.pos, b) <= r) damageBarricade(state, b, dmg * 2, events);
          events.push({ type: "stomp", id: z.id, pos: { ...z.pos }, radius: r });
        } else {
          // Nimeni aproape: ridică morții — strigoi în jurul lui (de două ori mai mulți înfuriat).
          const n = Math.min(A.kingSummon * (z.enraged ? 2 : 1), Math.max(0, A.broodCap - state.zombies.length));
          for (let i = 0; i < n; i++) {
            const a = (i / Math.max(1, n)) * Math.PI * 2;
            spawnZombie(state, nextRandom(state) < 0.3 ? "runner" : "walker", { x: z.pos.x + Math.cos(a) * 2.5, z: z.pos.z + Math.sin(a) * 2.5 });
          }
          z.abilityTimer = A.kingSummonEvery;
          if (n > 0) events.push({ type: "broodSpawn", id: z.id, pos: { ...z.pos }, count: n });
        }
      }
      if (z.ability2Timer <= 0) {
        const hero = nearestLivingHero(state, z.pos, A.kingVolleyRange);
        if (hero) {
          z.ability2Timer = A.kingVolleyEvery * (z.enraged ? 0.65 : 1);
          const d = dist(hero.pos, z.pos) || 1;
          const base = Math.atan2(hero.pos.x - z.pos.x, hero.pos.z - z.pos.z);
          for (let i = 0; i < A.kingVolley; i++) {
            const a = base + (i - (A.kingVolley - 1) / 2) * 0.22;
            throwAt(state, z, { x: z.pos.x + Math.sin(a) * d, z: z.pos.z + Math.cos(a) * d }, A.kingVolleyDamage * difficultyDamage, "ice", events);
          }
        }
      }
      return;
    }
    case "colossus": {
      // Sub jumătate de viață se înfurie (surpriza): merge și lovește mai repede.
      if (!z.enraged && z.hp <= z.maxHp * A.enrageAt) {
        z.enraged = true;
        events.push({ type: "bossEnraged", id: z.id, pos: { ...z.pos } });
      }
      // Undă de șoc: bate din picior când are ce lovi în jur.
      if (z.abilityTimer <= 0) {
        const r = A.stompRadius;
        const heroes = state.heroes.filter((h) => h.alive && dist(h.pos, z.pos) <= r);
        const towers = state.towers.filter((t) => dist(t.pos, z.pos) <= r);
        const walls = state.barricades.filter((b) => !b.broken && distToBarricade(z.pos, b) <= r);
        if (heroes.length + towers.length + walls.length > 0) {
          z.abilityTimer = A.stompEvery;
          const dmg = A.stompDamage * difficultyDamage;
          for (const h of heroes) damageHero(h, dmg, events, z.pos, false, z.id);
          for (const t of towers) damageTower(state, t, dmg, events);
          for (const b of walls) damageBarricade(state, b, dmg * 2, events);
          events.push({ type: "stomp", id: z.id, pos: { ...z.pos }, radius: r });
        }
      }
      // Bolovani aruncați în cel mai apropiat turn.
      if (z.ability2Timer <= 0) {
        let best: Tower | null = null;
        let bestD: number = A.boulderRange;
        for (const t of state.towers) {
          const d = dist(t.pos, z.pos);
          if (d <= bestD && d > 3) {
            bestD = d;
            best = t;
          }
        }
        if (best) {
          z.ability2Timer = A.boulderEvery;
          throwAt(state, z, best.pos, A.boulderDamage * difficultyDamage, "boulder", events);
        }
      }
      return;
    }
  }
}

/** Yeti-ul: se încordează pe loc, apoi se năpustește în linie dreaptă. */
function updateCharge(state: GameState, z: Zombie, dt: number, difficultyDamage: number, events: GameEvent[]): void {
  const ch = z.charge!;
  ch.time -= dt;
  if (ch.phase === "wind") {
    if (ch.time <= 0) {
      ch.phase = "charge";
      ch.time = A.chargeTime;
      events.push({ type: "yetiCharge", id: z.id, pos: { ...z.pos } });
    }
    return;
  }
  const r = CONFIG.zombies[z.type].radius;
  z.pos.x += ch.dir.x * A.chargeSpeed * dt;
  z.pos.z += ch.dir.z * A.chargeSpeed * dt;
  let stop = ch.time <= 0;
  // Zidurile din drum sunt făcute țăndări (dar îl și opresc).
  const wall = barricadeInTheWay(state, z, ch.dir.x, ch.dir.z);
  if (wall) {
    damageBarricade(state, wall, A.chargeWallDamage, events);
    stop = true;
  }
  for (const t of state.towers) {
    if (dist(t.pos, z.pos) <= r + CONFIG.tower.radius + 0.2) {
      damageTower(state, t, A.chargeWallDamage * 0.6, events);
      stop = true;
    }
  }
  // Eroul lovit e aruncat în lături.
  for (const h of state.heroes) {
    if (!h.alive || dist(h.pos, z.pos) > r + CONFIG.heroes[h.heroClass].radius + 0.3) continue;
    damageHero(h, A.chargeDamage * difficultyDamage, events, z.pos, false, z.id);
    h.pos.x += ch.dir.x * A.knockback;
    h.pos.z += ch.dir.z * A.knockback;
    resolveCollisions(state, h.pos, CONFIG.heroes[h.heroClass].radius, { barricades: "walls", towers: true });
    stop = true;
  }
  if (stop) z.charge = null;
}

/** Matca: naște pui (târâtori mai slabi) în jurul ei. */
function spawnBrood(state: GameState, mother: Zombie, count: number, events: GameEvent[]): void {
  count = Math.min(count, Math.max(0, A.broodCap - state.zombies.length));
  if (count <= 0) return;
  for (let i = 0; i < count; i++) {
    const a = nextRandom(state) * Math.PI * 2;
    const pup = spawnZombie(state, "runner", { x: mother.pos.x + Math.cos(a) * 1.8, z: mother.pos.z + Math.sin(a) * 1.8 });
    pup.hp = pup.maxHp = Math.round(pup.maxHp * 0.6);
  }
  events.push({ type: "broodSpawn", id: mother.id, pos: { ...mother.pos }, count });
}

/** Umflatul explodează: gaz înghețat care rănește eroii, turnurile, zidurile și mina din jur. */
function bloaterBurst(state: GameState, z: Zombie, events: GameEvent[]): void {
  const r = A.bloatRadius;
  const dmg = A.bloatDamage * CONFIG.difficulty[state.difficulty].zombieDamage;
  for (const h of state.heroes) if (h.alive && dist(h.pos, z.pos) <= r) damageHero(h, dmg, events, z.pos, false, z.id);
  for (const t of state.towers) if (dist(t.pos, z.pos) <= r + CONFIG.tower.radius) damageTower(state, t, dmg, events);
  for (const b of state.barricades) if (!b.broken && distToBarricade(z.pos, b) <= r) damageBarricade(state, b, dmg * 2, events);
  if (state.mode === "defend" && dist(z.pos, state.shelter.pos) <= r + state.shelter.radius) damageShelter(state, dmg, events);
  events.push({ type: "bloaterBurst", pos: { ...z.pos }, radius: r });
}

/** Vrăjitoarea (țurțuri) și colosul (bolovani) aruncă proiectile. */
function throwAt(state: GameState, z: Zombie, target: Vec2, damage: number, kind: Projectile["kind"], events: GameEvent[]): void {
  const d = dist(z.pos, target) || 1;
  const speed = kind === "boulder" ? 9 : 14;
  state.projectiles.push({
    id: state.nextId++,
    kind,
    pos: { ...z.pos },
    vel: { x: ((target.x - z.pos.x) / d) * speed, z: ((target.z - z.pos.z) / d) * speed },
    damage,
    life: (d + 1) / speed,
  });
  events.push({ type: "throw", id: z.id, kind, from: { ...z.pos }, to: { ...target } });
}

/** Scuipătorul aruncă un proiectil spre țintă. */
function spit(state: GameState, zombie: Zombie, target: Vec2, damage: number, events: GameEvent[]): void {
  const d = dist(zombie.pos, target) || 1;
  const speed = CONFIG.zombieCommon.spitSpeed;
  state.projectiles.push({
    id: state.nextId++,
    kind: "spit",
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
    const big = p.kind === "boulder" ? 0.6 : 0;
    const hero = state.heroes.find((h) => h.alive && dist(h.pos, p.pos) < CONFIG.heroes[h.heroClass].radius + 0.3 + big);
    const tower = hero ? undefined : state.towers.find((t) => dist(t.pos, p.pos) < CONFIG.tower.radius + 0.2 + big);
    if (hero) {
      damageHero(hero, p.damage, events, { x: p.pos.x - p.vel.x, z: p.pos.z - p.vel.z });
    } else if (tower) {
      damageTower(state, tower, p.damage, events);
    } else if (state.mode === "defend" && dist(p.pos, state.shelter.pos) < state.shelter.radius) {
      damageShelter(state, p.damage, events);
    } else if (p.life > 0) {
      continue;
    }
    events.push({ type: "projectileHit", pos: { ...p.pos }, kind: p.kind });
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
    if (b.broken || distToBarricade(zombie.pos, b) > r) continue;
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
  if (attackerHeroId !== null) zombie.lastHitBy = attackerHeroId;
  events.push({ type: "zombieHit", id: zombie.id, pos: { ...zombie.pos }, from: from ? { ...from } : { ...zombie.pos } });
  if (zombie.hp > 0) return false;
  killZombie(state, zombie, events, attackerHeroId ?? zombie.lastHitBy, false);
  return true;
}

function killZombie(state: GameState, zombie: Zombie, events: GameEvent[], attackerHeroId: EntityId | null, burned: boolean): void {
  const stats = CONFIG.zombies[zombie.type];
  state.zombies.splice(state.zombies.indexOf(zombie), 1);
  events.push({ type: "zombieDied", id: zombie.id, pos: { ...zombie.pos }, zombieType: zombie.type, burned, killerHeroId: burned ? null : attackerHeroId });
  // Umflatul explodează oricum moare; matca își scapă puii.
  if (zombie.type === "bloater") bloaterBurst(state, zombie, events);
  if (burned) return; // cei arși de soare nu lasă nimic
  if (zombie.type === "broodmother") spawnBrood(state, zombie, A.broodOnDeath, events);
  const boss = isBoss(zombie.type);
  // Cutie de gloanțe: muniția vine din zombi.
  if (boss || nextRandom(state) < CONFIG.ammo.dropChance) {
    const a = nextRandom(state) * Math.PI * 2;
    spawnDrop(state, { x: zombie.pos.x + Math.cos(a) * 0.8, z: zombie.pos.z + Math.sin(a) * 0.8 }, "ammo", boss ? 3 : CONFIG.ammo.dropMagazine);
  }
  // Boss-ul învins lasă un cufăr cu ceva rar (colosul lasă și fier).
  if (zombie.type === "colossus") spawnDrop(state, { x: zombie.pos.x - 1, z: zombie.pos.z }, "iron", 8);
  if (boss) {
    const id = state.nextId++;
    state.chests.push({ id, pos: { ...zombie.pos }, hp: CONFIG.chest.hp, openedFor: null });
    events.push({ type: "chestDropped", id, pos: { ...zombie.pos } });
  }
  // Monedele cad doar uneori; boss-ul lasă mai multe, împrăștiate.
  const drops = boss ? 5 : nextRandom(state) < stats.coinChance ? 1 : 0;
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
  if (killer) {
    giveXp(state, killer, stats.xp, events);
    state.players[killer.playerId].kills++;
  }
}

/** Toți zombii dintr-un cerc. */
export function zombiesInRadius(state: GameState, center: Vec2, radius: number): Zombie[] {
  return state.zombies.filter((z) => targetable(z) && dist(z.pos, center) <= radius + CONFIG.zombies[z.type].radius);
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
