import { CONFIG, type HeroStats } from "../config";
import { WEAPONS, type WeaponDef } from "../items";
import { OBSTACLES, obstacleActive } from "../map";
import { type Vec2, angleOf, dist, distSq, nextRandom } from "../math";
import type { Animal, Chest, EntityId, GameEvent, GameState, Hero, Player, Zombie } from "../types";
import { distToBarricade } from "./barricades";
import { resolveCollisions } from "./physics";
import { openBossChest } from "./shop";
import { damageAnimal } from "./survival";
import { damageZombie, targetable } from "./zombies";
import { armorReduction, armorSpeed, onLevelUp, shootBonus } from "./progression";

export function heroById(state: GameState, id: EntityId): Hero | undefined {
  return state.heroes.find((h) => h.id === id);
}

const playerOf = (state: GameState, hero: Hero): Player => state.players[hero.playerId];

/** Statisticile armei eroului: clasa + arma din magazin. */
export interface GunStats {
  damage: number;
  interval: number;
  range: number;
  magazine: number;
  reloadTime: number;
  pellets: number;
  spread: number;
  pierce: number;
  slow: number;
}

export function gunStats(state: GameState, hero: Hero): GunStats {
  const c: HeroStats = CONFIG.heroes[hero.heroClass];
  const w: WeaponDef = WEAPONS[playerOf(state, hero)?.weapon ?? "rusty"];
  const pellets = c.pellets + w.pellets;
  const skill = shootBonus(hero);
  return {
    damage: c.damage * w.damage * heroDamageMultiplier(hero) * skill.damage,
    interval: c.fireInterval * w.interval,
    range: Math.max(4, c.range + w.range),
    magazine: Math.max(1, Math.round(c.magazine * w.magazine)),
    reloadTime: c.reloadTime * w.reload * skill.reload,
    pellets,
    spread: pellets > 1 ? Math.max(c.spread, 0.2) : 0,
    pierce: c.pierce + w.pierce,
    slow: w.slow,
  };
}

/** Multiplicatorul de damage din nivel. */
export function heroDamageMultiplier(hero: Hero): number {
  return 1 + (hero.level - 1) * CONFIG.xp.damagePerLevel;
}

export function xpToNextLevel(level: number): number {
  return CONFIG.xp.perLevel + (level - 1) * CONFIG.xp.perLevelGrowth;
}

/** HP maxim = clasă × nivel × bonus din magazin. Păstrează procentul de HP curent. */
export function recomputeMaxHp(state: GameState, hero: Hero): void {
  const base = CONFIG.heroes[hero.heroClass].maxHp;
  const bonus = playerOf(state, hero)?.maxHpBonus ?? 0;
  const max = Math.round(base * (1 + (hero.level - 1) * CONFIG.xp.hpPerLevel) * (1 + bonus));
  const ratio = hero.maxHp > 0 ? hero.hp / hero.maxHp : 1;
  hero.maxHp = max;
  if (hero.alive) hero.hp = Math.max(1, Math.round(max * ratio));
}

/** Raza de tragere a eroului (clasă + armă). */
export function heroRange(state: GameState, hero: Hero): number {
  return gunStats(state, hero).range;
}

export function startReload(state: GameState, hero: Hero, events: GameEvent[]): void {
  const gun = gunStats(state, hero);
  if (hero.reloadTimer > 0 || hero.ammo >= gun.magazine || !hero.alive) return;
  // Fără gloanțe în rezervă nu ai ce băga în armă.
  if (hero.reserve <= 0) {
    events.push({ type: "noAmmo", heroId: hero.id });
    return;
  }
  hero.reloadTimer = gun.reloadTime;
  events.push({ type: "reloadStart", heroId: hero.id, time: gun.reloadTime });
}

export function updateHeroes(state: GameState, dt: number, events: GameEvent[]): void {
  for (const hero of state.heroes) {
    const stats = CONFIG.heroes[hero.heroClass];
    const player = playerOf(state, hero);

    if (!hero.alive) {
      // Ai căzut = ai murit. Te ridici doar dacă un coleg stă lângă tine câteva secunde.
      const c = CONFIG.heroCommon;
      const helper = state.heroes.some((h) => h !== hero && h.alive && dist(h.pos, hero.pos) <= c.reviveRadius);
      hero.reviveProgress = helper ? hero.reviveProgress + dt : Math.max(0, hero.reviveProgress - dt);
      if (hero.reviveProgress >= c.reviveTime) reviveHero(state, hero, events);
      continue;
    }

    // Regenerare (din magazin) și aura Healer-ului.
    if (player.regenPerSec > 0) hero.hp = Math.min(hero.maxHp, hero.hp + player.regenPerSec * dt);
    if (hero.heroClass === "healer") healerAura(state, hero, dt);

    // 1. Mișcare. Zidurile și turnurile îl opresc, ușile nu.
    const { x, z } = hero.moveInput;
    if (x !== 0 || z !== 0) {
      const speed = stats.speed * (1 + player.speedBonus + armorSpeed(hero)) * (hero.firing ? 0.8 : 1) * CONFIG.weather[state.weather].heroSpeed;
      hero.pos.x += x * speed * dt;
      hero.pos.z += z * speed * dt;
      if (!hero.firing) hero.facing = angleOf(x, z);
      resolveCollisions(state, hero.pos, stats.radius, { barricades: "walls", towers: true });
    }

    // 2. Repară automat zidurile din apropiere.
    repairNearbyBarricades(state, hero, player, dt, events);

    // 3. Reîncărcare.
    const gun = gunStats(state, hero);
    if (hero.reloadTimer > 0) {
      hero.reloadTimer -= dt;
      if (hero.reloadTimer <= 0) {
        hero.reloadTimer = 0;
        const take = Math.min(gun.magazine - hero.ammo, hero.reserve);
        hero.ammo += take;
        hero.reserve -= take;
        events.push({ type: "reloadDone", heroId: hero.id });
      }
    }

    // 4. Tragere în direcția în care ochește jucătorul.
    hero.fireTimer -= dt;
    // Cu târnăcopul sau undița în mână nu tragi.
    // Tragi doar cu arma în mână (cu târnăcopul / undița / lanterna, ✛ face altceva).
    if (!hero.firing || hero.action || hero.fishTimer >= 0 || player.tool !== "gun") continue;
    if (hero.autoAim) {
      // Ochire automată: zombii întâi, apoi vânatul sălbatic (niciodată animalele de la fermă).
      const target: { pos: Vec2 } | null = findNearestZombie(state, hero.pos, gun.range) ?? nearestWildAnimal(state, hero.pos, gun.range);
      if (target) {
        const d = dist(hero.pos, target.pos) || 1;
        hero.aim = { x: (target.pos.x - hero.pos.x) / d, z: (target.pos.z - hero.pos.z) / d };
      }
    }
    hero.facing = angleOf(hero.aim.x, hero.aim.z);
    if (hero.fireTimer > 0 || hero.reloadTimer > 0) continue;
    if (hero.ammo <= 0) {
      events.push({ type: "dryFire", heroId: hero.id });
      // Clic în gol: nu mai încercăm în fiecare pas (fără spam de mesaje).
      hero.fireTimer = 0.6;
      startReload(state, hero, events);
      continue;
    }
    hero.ammo--;
    hero.fireTimer = gun.interval;
    fire(state, hero, gun, events);
    if (hero.ammo <= 0) startReload(state, hero, events);
  }
}

/** Un foc: una sau mai multe alice, fiecare un „glonț” pe o linie dreaptă. */
function fire(state: GameState, hero: Hero, gun: GunStats, events: GameEvent[]): void {
  const base = Math.atan2(hero.aim.x, hero.aim.z);
  // Critice: Sniper-ul din clasă, oricine cu pasiva „Ochi de vultur” (tras, treapta 5).
  const sniperCrit = hero.heroClass === "sniper" && nextRandom(state) < CONFIG.heroCommon.sniperCritChance;
  const skillCrit = !sniperCrit && nextRandom(state) < shootBonus(hero).crit;
  const crit = sniperCrit || skillCrit;
  const damage = gun.damage * (sniperCrit ? CONFIG.heroCommon.sniperCritMultiplier : skillCrit ? CONFIG.skills.critMultiplier : 1);
  for (let i = 0; i < gun.pellets; i++) {
    const offset = gun.pellets > 1 ? (i / (gun.pellets - 1) - 0.5) * gun.spread + (nextRandom(state) - 0.5) * 0.04 : 0;
    const a = base + offset;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    // Ochire manuală: glonțul se oprește la punctul ochit (dacă nu lovește nimic înainte).
    const range = !hero.autoAim && hero.aimDist > 0 ? Math.min(gun.range, hero.aimDist + 0.4) : gun.range;
    const { hits, animals, chest, end } = traceBullet(state, hero.pos, dir, range, gun.pierce + 1, gun.pellets === 1);
    events.push({ type: "shot", from: { ...hero.pos }, to: end, source: "hero", crit, heroId: hero.id, hit: hits.length > 0 });
    for (const z of hits) {
      if (gun.slow > 0) z.slowTimer = Math.max(z.slowTimer, gun.slow);
      damageZombie(state, z, damage, events, hero.id, hero.pos);
    }
    for (const a of animals) damageAnimal(state, a, damage, events, hero.pos);
    if (chest) damageChest(state, chest, damage, hero, events);
  }
}

/**
 * Urmărește glonțul pe o linie: lovește primii `maxHits` zombi (sau animale) pe care îi atinge.
 * Se oprește în case, brazi, mină și în cufărul boss-ului (pe care îl și lovește).
 * Cu `assist`, prinde și zombii foarte aproape de linie.
 */
export function traceBullet(
  state: GameState,
  from: Vec2,
  dir: Vec2,
  range: number,
  maxHits: number,
  assist: boolean,
): { hits: Zombie[]; animals: Animal[]; chest: Chest | null; end: Vec2 } {
  // Unde se oprește glonțul în obstacole.
  let maxT = range;
  const blockers = [...OBSTACLES.filter((o) => !o.water && obstacleActive(state, o)), state.shelter];
  for (const o of blockers) {
    const t = rayCircle(from, dir, o.pos, o.radius);
    if (t !== null && t < maxT) maxT = t;
  }
  let chest: Chest | null = null;
  for (const c of state.chests) {
    if (c.openedFor !== null) continue;
    const t = rayCircle(from, dir, c.pos, CONFIG.chest.radius);
    if (t !== null && t < maxT) {
      maxT = t;
      chest = c;
    }
  }
  const width = CONFIG.heroCommon.bulletWidth;
  const candidates: { z?: Zombie; a?: Animal; t: number }[] = [];
  const onLine = (pos: Vec2, radius: number): number | null => {
    const dx = pos.x - from.x;
    const dz = pos.z - from.z;
    const t = dx * dir.x + dz * dir.z;
    if (t <= 0 || t > maxT) return null;
    return Math.abs(dx * dir.z - dz * dir.x) <= radius + width ? t : null;
  };
  for (const z of state.zombies) {
    if (z.hp <= 0 || !targetable(z)) continue;
    const t = onLine(z.pos, CONFIG.zombies[z.type].radius);
    if (t !== null) candidates.push({ z, t });
  }
  for (const a of state.animals) {
    const t = onLine(a.pos, CONFIG.animals[a.kind].radius);
    if (t !== null) candidates.push({ a, t });
  }
  // Ajutor la ochit: dacă n-am nimerit nimic, prindem zombiul cel mai aproape de linie (într-un con mic).
  if (candidates.length === 0 && assist) {
    let best: { z: Zombie; t: number; ang: number } | null = null;
    for (const z of state.zombies) {
      if (!targetable(z)) continue;
      const dx = z.pos.x - from.x;
      const dz = z.pos.z - from.z;
      const d = Math.hypot(dx, dz);
      if (d === 0 || d > maxT) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / d)));
      if (ang < CONFIG.heroCommon.aimAssist && (!best || ang < best.ang)) best = { z, t: d, ang };
    }
    if (best) candidates.push(best);
  }
  candidates.sort((a, b) => a.t - b.t);
  const hit = candidates.slice(0, maxHits);
  // Glonțul se oprește în ultima țintă pe care o poate lovi (sau merge până la capăt).
  const stopped = hit.length >= maxHits;
  const endT = stopped ? hit[hit.length - 1].t : maxT;
  return {
    hits: hit.filter((h) => h.z).map((h) => h.z!),
    animals: hit.filter((h) => h.a).map((h) => h.a!),
    chest: stopped ? null : chest,
    end: { x: from.x + dir.x * endT, z: from.z + dir.z * endT },
  };
}

/** Cufărul boss-ului se deschide când îl spargi cu gloanțe. */
function damageChest(state: GameState, chest: Chest, amount: number, hero: Hero, events: GameEvent[]): void {
  if (chest.openedFor !== null) return;
  chest.hp -= amount;
  events.push({ type: "chestHit", id: chest.id, pos: { ...chest.pos } });
  if (chest.hp > 0) return;
  chest.openedFor = 0;
  openBossChest(state, chest, hero, events);
}

/** Vânatul sălbatic cel mai apropiat (pentru ochirea automată când nu sunt zombi). */
function nearestWildAnimal(state: GameState, from: Vec2, range: number): Animal | null {
  let best: Animal | null = null;
  let bestD = range;
  for (const a of state.animals) {
    if (a.farmId !== null) continue;
    const d = dist(a.pos, from);
    if (d <= bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/** Distanța pe rază până la un cerc (sau null dacă raza nu-l atinge). */
function rayCircle(from: Vec2, dir: Vec2, center: Vec2, r: number): number | null {
  const fx = from.x - center.x;
  const fz = from.z - center.z;
  const b = fx * dir.x + fz * dir.z;
  const c = fx * fx + fz * fz - r * r;
  if (c < 0) return null; // suntem în cerc
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

function healerAura(state: GameState, healer: Hero, dt: number): void {
  const c = CONFIG.heroCommon;
  for (const h of state.heroes) {
    if (h.alive && h.hp < h.maxHp && dist(h.pos, healer.pos) <= c.healerAuraRadius) {
      h.hp = Math.min(h.maxHp, h.hp + c.healerAuraPerSecond * dt);
    }
  }
}

function repairNearbyBarricades(state: GameState, hero: Hero, player: Player, dt: number, events: GameEvent[]): void {
  const c = CONFIG.heroCommon;
  const rate = c.repairRate * (hero.heroClass === "tank" ? c.tankRepairMultiplier : 1) * (1 + player.repairBonus);
  for (const b of state.barricades) {
    if (b.hp < b.maxHp && distToBarricade(hero.pos, b) <= c.repairRadius) {
      b.hp = Math.min(b.maxHp, b.hp + rate * dt);
      // Un zid dărâmat se ridică la loc când e reparat pe jumătate (și nu stă nimeni în el).
      if (b.broken && b.hp >= b.maxHp * CONFIG.barricade.rebuildAt) {
        const blocked = [...state.zombies, ...state.heroes].some((e) => {
          const r = "type" in e ? CONFIG.zombies[e.type].radius : CONFIG.heroes[e.heroClass].radius;
          return distToBarricade(e.pos, b) < r;
        });
        if (!blocked) {
          b.broken = false;
          events.push({ type: "barricadeRepaired", id: b.id, pos: { ...b.pos } });
        }
      }
    }
  }
  // Și turnurile — dar doar ziua (noaptea n-ai timp să cari pietre).
  if (state.phase !== "day") return;
  const towerRate = CONFIG.tower.repairRate * (rate / c.repairRate);
  for (const t of state.towers) {
    if (t.hp < t.maxHp && dist(hero.pos, t.pos) <= c.repairRadius + CONFIG.tower.radius) {
      t.hp = Math.min(t.maxHp, t.hp + towerRate * dt);
    }
  }
}

/** Cel mai apropiat zombie (care nu arde) din rază, în afară de cei excluși. */
export function findNearestZombie(
  state: GameState,
  from: { x: number; z: number },
  range: number,
  exclude: Zombie[] = [],
): Zombie | null {
  let best: Zombie | null = null;
  let bestD = range * range;
  for (const z of state.zombies) {
    if (z.hp <= 0 || !targetable(z) || exclude.includes(z)) continue;
    const d = distSq(from, z.pos);
    if (d <= bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

/**
 * `silent` = damage „din interior” (foame, frig): fără armură și fără sânge.
 * `by` = zombiul care a lovit (ca randarea să arate lovitura care intră în erou).
 */
export function damageHero(hero: Hero, amount: number, events: GameEvent[], from: Vec2, silent = false, by?: EntityId): void {
  if (!hero.alive) return;
  if (hero.heroClass === "tank" && !silent) amount *= 1 - CONFIG.heroCommon.tankArmor;
  if (!silent) amount *= 1 - armorReduction(hero);
  hero.hp -= amount;
  if (!silent) events.push({ type: "heroHit", id: hero.id, pos: { ...hero.pos }, from: { ...from }, amount, by });
  if (hero.hp <= 0) {
    hero.hp = 0;
    hero.alive = false;
    hero.firing = false;
    hero.respawnTimer = 0;
    hero.reviveProgress = 0;
    hero.action = false;
    hero.fishTimer = -1;
    events.push({ type: "heroDied", id: hero.id });
  }
}

/** Un coleg te-a ridicat: te ridici pe loc, cu o parte din viață. */
export function reviveHero(state: GameState, hero: Hero, events: GameEvent[]): void {
  hero.alive = true;
  hero.hp = Math.round(hero.maxHp * CONFIG.heroCommon.reviveHp);
  hero.reviveProgress = 0;
  hero.reloadTimer = 0;
  hero.ammo = Math.max(hero.ammo, Math.min(gunStats(state, hero).magazine, hero.reserve));
  events.push({ type: "heroRespawned", id: hero.id });
}

export function respawnHero(state: GameState, hero: Hero, events: GameEvent[]): void {
  hero.alive = true;
  hero.hp = hero.maxHp;
  hero.respawnTimer = 0;
  hero.reloadTimer = 0;
  hero.hunger = Math.max(hero.hunger, 60);
  hero.thirst = Math.max(hero.thirst, 60);
  hero.warmth = Math.max(hero.warmth, 60);
  // Reînvii cu încărcătorul plin, dar rezerva rămâne cât era (muniția e o resursă reală).
  hero.ammo = gunStats(state, hero).magazine;
  hero.pos = { x: state.shelter.pos.x, z: state.shelter.pos.z - state.shelter.radius - 1.5 };
  events.push({ type: "heroRespawned", id: hero.id });
}

export function giveXp(state: GameState, hero: Hero, amount: number, events: GameEvent[]): void {
  hero.xp += amount;
  while (hero.xp >= xpToNextLevel(hero.level)) {
    hero.xp -= xpToNextLevel(hero.level);
    hero.level++;
    recomputeMaxHp(state, hero);
    if (hero.alive) hero.hp = hero.maxHp;
    events.push({ type: "levelUp", heroId: hero.id, level: hero.level });
    onLevelUp(state, hero, events);
  }
}
