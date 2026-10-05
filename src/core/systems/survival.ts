// Supraviețuire: foame, frig, focuri de tabără (lemn, gătit), animale (căprioare, urși,
// găini și porci de la fermă), obiecte pe jos (cutii de gloanțe, carne) și inventarul.
// Foamea și frigul contează doar în modul „Supraviețuire”; focul și obiectele merg în ambele.

import { type AnimalKind, CONFIG, type ItemKind } from "../config";
import { OBSTACLES } from "../map";
import { type Vec2, angleOf, clamp, dist, nextRandom } from "../math";
import type { Animal, Campfire, Drop, EntityId, GameEvent, GameState, Hero, PlayerId } from "../types";
import { distToBarricade } from "./barricades";
import { damageHero, gunStats, heroById } from "./heroes";
import { resolveCollisions } from "./physics";

const S = CONFIG.survival;

export type BuildingKind = "campfire" | "farmChicken" | "farmPig";

export const buildingRadius = (kind: BuildingKind): number => (kind === "campfire" ? 0.8 : 1.5);
export const buildingCost = (kind: BuildingKind): number => (kind === "campfire" ? S.campfireCost : S.farmCost);

/** Un loc liber pentru un foc sau o fermă? null = da, altfel motivul. */
export function canBuildBuilding(state: GameState, playerId: PlayerId, kind: BuildingKind, pos: Vec2): string | null {
  const player = state.players[playerId];
  if (!player) return "Jucător necunoscut";
  if (state.phase === "gameover" || state.phase === "victory") return "Jocul s-a terminat";
  if (state.mode !== "survival") return "Doar în modul Supraviețuire";
  const cost = buildingCost(kind);
  if (player.wood < cost) return `Ai nevoie de ${cost} lemn`;
  if (kind === "campfire" && state.campfires.filter((f) => f.ownerId === playerId).length >= S.maxCampfires) return `Cel mult ${S.maxCampfires} focuri`;
  if (kind !== "campfire" && state.farms.filter((f) => f.ownerId === playerId).length >= S.maxFarms) return `Cel mult ${S.maxFarms} ferme`;
  const r = buildingRadius(kind);
  const edge = CONFIG.map.halfSize - r;
  if (Math.abs(pos.x) > edge || Math.abs(pos.z) > edge) return "În afara hărții";
  if (dist(pos, state.shelter.pos) < state.shelter.radius + r + 0.3) return "Prea aproape de mină";
  for (const o of OBSTACLES) if (dist(pos, o.pos) < o.radius + r) return "Loc ocupat";
  for (const t of state.towers) if (dist(pos, t.pos) < CONFIG.tower.radius + r) return "Loc ocupat";
  for (const b of state.barricades) if (distToBarricade(pos, b) < r) return "Loc ocupat";
  for (const f of state.campfires) if (dist(pos, f.pos) < buildingRadius("campfire") + r) return "Loc ocupat";
  for (const f of state.farms) if (dist(pos, f.pos) < buildingRadius("farmPig") + r) return "Loc ocupat";
  return null;
}

export function buildBuilding(state: GameState, playerId: PlayerId, kind: BuildingKind, pos: Vec2, events: GameEvent[]): boolean {
  if (canBuildBuilding(state, playerId, kind, pos) !== null) return false;
  state.players[playerId].wood -= buildingCost(kind);
  const id = state.nextId++;
  if (kind === "campfire") {
    state.campfires.push({ id, ownerId: playerId, pos: { ...pos }, fuel: S.campfireFuel, cooking: [] });
  } else {
    const farmKind = kind === "farmChicken" ? "chicken" : "pig";
    state.farms.push({ id, ownerId: playerId, pos: { ...pos }, kind: farmKind, timer: 3 });
  }
  events.push({ type: "buildingPlaced", id, pos: { ...pos } });
  return true;
}

/** Focul sau ferma aflată în punctul dat (pentru tap → meniu). */
export function buildingAt(state: GameState, pos: Vec2): Campfire | (typeof state.farms)[number] | null {
  return (
    state.campfires.find((f) => dist(f.pos, pos) <= 1.3) ??
    state.farms.find((f) => dist(f.pos, pos) <= 1.9) ??
    null
  );
}

export function demolishBuilding(state: GameState, playerId: PlayerId, id: EntityId, events: GameEvent[]): boolean {
  const fi = state.campfires.findIndex((f) => f.id === id && f.ownerId === playerId);
  if (fi >= 0) {
    const f = state.campfires[fi];
    state.campfires.splice(fi, 1);
    events.push({ type: "structureRemoved", id: f.id, pos: { ...f.pos } });
    return true;
  }
  const ri = state.farms.findIndex((f) => f.id === id && f.ownerId === playerId);
  if (ri < 0) return false;
  const farm = state.farms[ri];
  state.farms.splice(ri, 1);
  state.players[playerId].wood += Math.floor(S.farmCost * CONFIG.barricade.refund);
  // Animalele fermei devin „sălbatice” (rămân pe hartă, le poți vâna).
  for (const a of state.animals) if (a.farmId === farm.id) a.farmId = null;
  events.push({ type: "structureRemoved", id: farm.id, pos: { ...farm.pos } });
  return true;
}

export function canAddFuel(state: GameState, playerId: PlayerId, fireId: EntityId): string | null {
  const fire = state.campfires.find((f) => f.id === fireId);
  const player = state.players[playerId];
  if (!fire || !player) return "Foc inexistent";
  if (player.wood < S.addWood) return `Ai nevoie de ${S.addWood} lemn`;
  if (fire.fuel >= S.campfireFuel - 1) return "Focul e plin";
  return null;
}

export function addFuel(state: GameState, playerId: PlayerId, fireId: EntityId, events: GameEvent[]): boolean {
  if (canAddFuel(state, playerId, fireId) !== null) return false;
  const fire = state.campfires.find((f) => f.id === fireId)!;
  state.players[playerId].wood -= S.addWood;
  fire.fuel = Math.min(S.campfireFuel, fire.fuel + S.addWood * S.fuelPerWood);
  events.push({ type: "fuelAdded", fireId, pos: { ...fire.pos } });
  return true;
}

/** Cel mai apropiat foc aprins din rază. */
export function litFireNear(state: GameState, pos: Vec2, radius: number = S.fireWarmRadius): Campfire | null {
  let best: Campfire | null = null;
  let bestD = radius;
  for (const f of state.campfires) {
    if (f.fuel <= 0) continue;
    const d = dist(f.pos, pos);
    if (d <= bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

/**
 * Bara rapidă: carnea friptă se mănâncă; carnea crudă se pune pe focul de lângă tine
 * (se gătește în 15 s), iar dacă nu e niciun foc aproape o mănânci crudă (te doare burta).
 */
export function useItem(state: GameState, playerId: PlayerId, item: ItemKind, events: GameEvent[]): boolean {
  const player = state.players[playerId];
  const hero = player && heroById(state, player.heroId);
  if (!player || !hero || !hero.alive || player.inventory[item] <= 0) return false;
  if (item === "cookedMeat") {
    player.inventory.cookedMeat--;
    hero.hunger = Math.min(100, hero.hunger + S.cookedMeatFood);
    hero.hp = Math.min(hero.maxHp, hero.hp + 10);
    events.push({ type: "ate", playerId, cooked: true });
    return true;
  }
  const fire = litFireNear(state, hero.pos);
  if (fire && fire.cooking.length < 3) {
    player.inventory.rawMeat--;
    fire.cooking.push(S.cookTime);
    return true;
  }
  player.inventory.rawMeat--;
  hero.hunger = Math.min(100, hero.hunger + S.rawMeatFood);
  damageHero(hero, S.rawMeatHurt, events, hero.pos, true);
  events.push({ type: "ate", playerId, cooked: false });
  return true;
}

export function spawnDrop(state: GameState, pos: Vec2, kind: Drop["kind"], amount: number): void {
  state.drops.push({ id: state.nextId++, pos: { ...pos }, kind, amount, age: 0 });
}

/** Foamea, frigul, focurile (lemnul arde, carnea se gătește). */
export function updateSurvival(state: GameState, dt: number, events: GameEvent[]): void {
  const weather = CONFIG.weather[state.weather];
  const survival = state.mode === "survival";

  for (const fire of state.campfires) {
    if (survival && fire.fuel > 0) {
      fire.fuel = Math.max(0, fire.fuel - dt * weather.fuel);
      if (fire.fuel <= 0) events.push({ type: "fireOut", fireId: fire.id, pos: { ...fire.pos } });
    }
    if (fire.fuel <= 0) continue;
    for (let i = fire.cooking.length - 1; i >= 0; i--) {
      fire.cooking[i] -= dt;
      if (fire.cooking[i] > 0) continue;
      fire.cooking.splice(i, 1);
      const a = nextRandom(state) * Math.PI * 2;
      spawnDrop(state, { x: fire.pos.x + Math.cos(a) * 1.1, z: fire.pos.z + Math.sin(a) * 1.1 }, "cookedMeat", 1);
      events.push({ type: "cooked", fireId: fire.id, pos: { ...fire.pos } });
    }
  }

  if (!survival) return;
  const night = state.phase === "night" ? 1 : 0.6;
  for (const hero of state.heroes) {
    if (!hero.alive) continue;
    hero.hunger = Math.max(0, hero.hunger - S.hungerPerSec * dt);
    if (litFireNear(state, hero.pos)) hero.warmth = Math.min(100, hero.warmth + S.fireWarmPerSec * dt);
    else hero.warmth = Math.max(0, hero.warmth - S.coldPerSec * weather.cold * night * dt);
    // Flămând sau înghețat: pierzi viață încet.
    const hurt = (hero.hunger <= 0 ? S.starveDamage : 0) + (hero.warmth <= 0 ? S.freezeDamage : 0);
    if (hurt > 0) {
      const before = Math.floor(state.time / 2);
      damageHero(hero, hurt * dt, events, hero.pos, true);
      if (Math.floor((state.time + dt) / 2) !== before) {
        if (hero.hunger <= 0) events.push({ type: "starving", heroId: hero.id });
        if (hero.warmth <= 0) events.push({ type: "freezing", heroId: hero.id });
      }
    }
  }
}

/** Obiectele de pe jos: le iei mergând peste ele; dispar după un timp. */
export function updateDrops(state: GameState, dt: number, events: GameEvent[]): void {
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const d = state.drops[i];
    d.age += dt;
    if (d.age >= CONFIG.dropLifetime) {
      state.drops.splice(i, 1);
      continue;
    }
    const hero = state.heroes.find((h) => h.alive && dist(h.pos, d.pos) <= CONFIG.coins.pickupRadius + 0.2);
    if (!hero) continue;
    const player = state.players[hero.playerId];
    let amount = d.amount;
    if (d.kind === "ammo") {
      const gun = gunStats(state, hero);
      const max = gun.magazine * CONFIG.ammo.maxMagazines;
      if (hero.reserve >= max) continue; // plin: lasă cutia pentru alții
      amount = Math.max(1, Math.round(d.amount * gun.magazine));
      hero.reserve = Math.min(max, hero.reserve + amount);
    } else {
      player.inventory[d.kind] += d.amount;
    }
    state.drops.splice(i, 1);
    events.push({ type: "picked", playerId: hero.playerId, kind: d.kind, amount, pos: { ...d.pos } });
  }
}

// ---------- Animale ----------

function spawnAnimal(state: GameState, kind: AnimalKind, pos: Vec2, farmId: EntityId | null): Animal {
  const st = CONFIG.animals[kind];
  const a: Animal = {
    id: state.nextId++, kind, pos: { ...pos }, facing: nextRandom(state) * Math.PI * 2,
    hp: st.hp, maxHp: st.hp, goal: { ...pos }, timer: 0, attackTimer: 0, farmId,
  };
  state.animals.push(a);
  return a;
}

export function updateAnimals(state: GameState, dt: number, events: GameEvent[]): void {
  if (state.mode !== "survival") return;
  // Animalele sălbatice intră pe hartă ziua, pe la margini.
  state.wildTimer -= dt;
  if (state.wildTimer <= 0 && state.phase === "day") {
    state.wildTimer = S.animalSpawnEvery;
    const deer = state.animals.filter((a) => a.kind === "deer").length;
    const bears = state.animals.filter((a) => a.kind === "bear").length;
    const kind: AnimalKind | null = deer < S.maxDeer ? (bears < S.maxBears && nextRandom(state) < 0.25 ? "bear" : "deer") : bears < S.maxBears ? "bear" : null;
    if (kind) {
      const e = CONFIG.map.halfSize - 4;
      const t = (nextRandom(state) * 2 - 1) * e;
      const side = Math.floor(nextRandom(state) * 4);
      const pos = side === 0 ? { x: t, z: e } : side === 1 ? { x: t, z: -e } : side === 2 ? { x: e, z: t } : { x: -e, z: t };
      spawnAnimal(state, kind, pos, null);
    }
  }
  // Fermele: un pui sau un purceluș din când în când (limitat).
  for (const farm of state.farms) {
    farm.timer -= dt;
    if (farm.timer > 0) continue;
    farm.timer = farm.kind === "chicken" ? S.chickenEvery : S.pigEvery;
    if (state.animals.filter((a) => a.farmId === farm.id).length < S.maxPerFarm) {
      spawnAnimal(state, farm.kind, { x: farm.pos.x + (nextRandom(state) - 0.5) * 2, z: farm.pos.z + (nextRandom(state) - 0.5) * 2 }, farm.id);
    }
  }

  for (const a of state.animals) {
    const st = CONFIG.animals[a.kind];
    a.timer -= dt;
    a.attackTimer -= dt;
    let speed = st.speed * 0.35;
    const hero = nearestHero(state, a.pos);
    const hd = hero ? dist(hero.pos, a.pos) : Infinity;
    const farm = a.farmId !== null ? state.farms.find((f) => f.id === a.farmId) : undefined;

    if (a.kind === "deer" && hero && hd < st.fleeRadius) {
      // Fuge de vânător.
      const d = hd || 1;
      a.goal = { x: a.pos.x + ((a.pos.x - hero.pos.x) / d) * 10, z: a.pos.z + ((a.pos.z - hero.pos.z) / d) * 10 };
      speed = st.speed;
    } else if (a.kind === "bear" && hero && hd < st.aggroRadius) {
      // Ursul atacă.
      a.goal = { ...hero.pos };
      speed = st.speed;
      const reach = st.radius + CONFIG.heroes[hero.heroClass].radius + 0.4;
      if (hd <= reach) {
        speed = 0;
        if (a.attackTimer <= 0) {
          a.attackTimer = 1.6;
          damageHero(hero, st.damage, events, a.pos);
          events.push({ type: "animalAttack", id: a.id, pos: { ...a.pos } });
        }
      }
    } else if (a.timer <= 0) {
      // Se plimbă: găinile și porcii lângă fermă, restul prin pădure.
      a.timer = 3 + nextRandom(state) * 5;
      const center = farm ? farm.pos : a.pos;
      const r = farm ? 2.5 : 9;
      a.goal = { x: center.x + (nextRandom(state) * 2 - 1) * r, z: center.z + (nextRandom(state) * 2 - 1) * r };
    }
    const dx = a.goal.x - a.pos.x;
    const dz = a.goal.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.3 && speed > 0) {
      const step = Math.min(d, speed * dt);
      a.pos.x += (dx / d) * step;
      a.pos.z += (dz / d) * step;
      a.facing = angleOf(dx, dz);
    } else if (hero && a.kind === "bear" && hd < st.aggroRadius) {
      a.facing = angleOf(hero.pos.x - a.pos.x, hero.pos.z - a.pos.z);
    }
    resolveCollisions(state, a.pos, st.radius, { barricades: "all", towers: true });
    a.pos.x = clamp(a.pos.x, -CONFIG.map.halfSize + 1, CONFIG.map.halfSize - 1);
    a.pos.z = clamp(a.pos.z, -CONFIG.map.halfSize + 1, CONFIG.map.halfSize - 1);
  }
}

export function damageAnimal(state: GameState, a: Animal, amount: number, events: GameEvent[], from: Vec2): void {
  if (!state.animals.includes(a)) return;
  a.hp -= amount;
  events.push({ type: "animalHit", id: a.id, pos: { ...a.pos }, from: { ...from } });
  if (a.kind === "deer") a.timer = 0;
  if (a.hp > 0) return;
  state.animals.splice(state.animals.indexOf(a), 1);
  spawnDrop(state, a.pos, "rawMeat", CONFIG.animals[a.kind].meat);
  events.push({ type: "animalDied", id: a.id, kind: a.kind, pos: { ...a.pos } });
}

function nearestHero(state: GameState, pos: Vec2): Hero | null {
  let best: Hero | null = null;
  let bestD = Infinity;
  for (const h of state.heroes) {
    if (!h.alive) continue;
    const d = dist(h.pos, pos);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}
