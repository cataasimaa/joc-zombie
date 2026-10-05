// Turnuri. Construiești mereu o arbaletă (turnul de bază); din ea faci upgrade de nivel
// sau o transformi în Rachete, Tun, Tesla sau Gheață. Fiecare tip are o abilitate care se
// declanșează singură (cu cooldown). Proiectilele zboară cu adevărat (`Shell`) și lovesc la sosire.
// Turnurile au HP: zombii pe care îi lovesc vin să le dărâme.

import { CONFIG, type TowerKind, type TowerStats } from "../config";
import { OBSTACLES } from "../map";
import { type Vec2, angleOf, dist } from "../math";
import type { EntityId, GameEvent, GameState, PlayerId, Shell, Tower, Zombie } from "../types";
import { distToBarricade } from "./barricades";
import { findNearestZombie } from "./heroes";
import { damageZombie, zombiesInRadius } from "./zombies";

const T = CONFIG.tower;
const A = T.abilities;

/** Câte turnuri poate avea un jucător (cresc cu nopțile trecute și din magazin). */
export function towerSlots(state: GameState, playerId: PlayerId): number {
  const e = CONFIG.economy;
  const extra = state.players[playerId]?.extraTowerSlots ?? 0;
  return e.startTowerSlots + Math.floor(state.wavesCompleted / e.slotEveryWaves) + extra;
}

export const towersOf = (state: GameState, playerId: PlayerId): number =>
  state.towers.filter((t) => t.ownerId === playerId).length;

/** Costul construcției (o arbaletă). */
export const towerCost = (): number => T.kinds.crossbow.cost;

export const towerById = (state: GameState, id: EntityId): Tower | undefined => state.towers.find((t) => t.id === id);

/** Statisticile unui turn după tip și nivel. */
export function towerStats(kind: TowerKind, level: number): TowerStats {
  const base = T.kinds[kind];
  return {
    ...base,
    damage: base.damage * (1 + (level - 1) * T.damagePerLevel),
    range: base.range * (1 + (level - 1) * T.rangePerLevel),
    hp: Math.round(base.hp * (1 + (level - 1) * T.hpPerLevel)),
  };
}

/**
 * Verifică dacă jucătorul poate pune un turn în punctul dat.
 * Returnează null dacă e OK, altfel motivul (text pentru UI).
 */
export function canBuildTower(state: GameState, playerId: PlayerId, pos: Vec2): string | null {
  const player = state.players[playerId];
  if (!player) return "Jucător necunoscut";
  if (state.phase === "gameover" || state.phase === "victory") return "Jocul s-a terminat";
  if (player.wood < towerCost()) return `Ai nevoie de ${towerCost()} lemn`;
  if (towersOf(state, playerId) >= towerSlots(state, playerId)) return "Nu mai ai sloturi libere";

  const r = T.radius;
  const edge = CONFIG.map.halfSize - r;
  if (Math.abs(pos.x) > edge || Math.abs(pos.z) > edge) return "În afara hărții";
  if (dist(pos, state.shelter.pos) < state.shelter.radius + r + 0.5) return "Prea aproape de mină";
  for (const o of OBSTACLES) if (dist(pos, o.pos) < o.radius + r) return "Loc ocupat";
  for (const t of state.towers) if (dist(pos, t.pos) < r * 2 + 0.1) return "Loc ocupat";
  for (const b of state.barricades) if (distToBarricade(pos, b) < r) return "Loc ocupat";
  for (const h of state.heroes) if (h.alive && dist(pos, h.pos) < r + CONFIG.heroes[h.heroClass].radius) return "Stai pe locul ăsta";
  for (const z of state.zombies) if (dist(pos, z.pos) < r + CONFIG.zombies[z.type].radius) return "E un zombie acolo";
  return null;
}

export function buildTower(state: GameState, playerId: PlayerId, pos: Vec2, events: GameEvent[]): boolean {
  if (canBuildTower(state, playerId, pos) !== null) return false;
  state.players[playerId].wood -= towerCost();
  const id = state.nextId++;
  const hp = towerStats("crossbow", 1).hp;
  state.towers.push({
    id, ownerId: playerId, kind: "crossbow", pos: { ...pos }, level: 1, facing: 0,
    fireTimer: 0, abilityTimer: T.kinds.crossbow.abilityCooldown, hp, maxHp: hp,
  });
  events.push({ type: "towerPlaced", id });
  return true;
}

/** Turnul aflat în punctul dat (pentru tap → upgrade). */
export function towerAt(state: GameState, pos: Vec2): Tower | null {
  return state.towers.find((t) => dist(t.pos, pos) <= T.radius + 0.6) ?? null;
}

/** Cât costă upgrade-ul: nivelul următor (fără `to`) sau transformarea în alt tip. */
export function towerUpgradeCost(tower: Tower, to?: TowerKind): number {
  return to ? T.kinds[to].cost : T.levelCost[tower.level] ?? 0;
}

export function canUpgradeTower(state: GameState, playerId: PlayerId, towerId: EntityId, to?: TowerKind): string | null {
  const player = state.players[playerId];
  const tower = towerById(state, towerId);
  if (!player || !tower) return "Turn inexistent";
  if (tower.ownerId !== playerId) return "Nu e turnul tău";
  if (to) {
    if (tower.kind !== "crossbow") return "Doar arbaleta se transformă";
    if (to === "crossbow") return "E deja arbaletă";
  } else {
    if (tower.level >= T.maxLevel) return "Nivel maxim";
    if (tower.level >= player.towerTier) return `Nivelul ${tower.level + 1}: din magazin sau cufărul boss-ului`;
  }
  const cost = towerUpgradeCost(tower, to);
  if (player.wood < cost) return `Ai nevoie de ${cost} lemn`;
  return null;
}

export function upgradeTower(state: GameState, playerId: PlayerId, towerId: EntityId, to: TowerKind | undefined, events: GameEvent[]): boolean {
  if (canUpgradeTower(state, playerId, towerId, to) !== null) return false;
  const tower = towerById(state, towerId)!;
  state.players[playerId].wood -= towerUpgradeCost(tower, to);
  if (to) {
    tower.kind = to;
    tower.abilityTimer = T.kinds[to].abilityCooldown * 0.5;
  } else {
    tower.level++;
  }
  const ratio = tower.hp / tower.maxHp;
  tower.maxHp = towerStats(tower.kind, tower.level).hp;
  tower.hp = Math.max(1, Math.round(tower.maxHp * Math.max(ratio, 0.5)));
  events.push({ type: "towerUpgraded", id: tower.id, level: tower.level, kind: tower.kind });
  return true;
}

/** Lemnul primit înapoi la demolare (vezi `refundFactor`: mai puțin noaptea). */
export function towerRefund(state: GameState, tower: Tower): number {
  let spent = towerCost() + (tower.kind !== "crossbow" ? T.kinds[tower.kind].cost : 0);
  for (let l = 1; l < tower.level; l++) spent += T.levelCost[l];
  return Math.floor(spent * refundFactor(state));
}

export function demolishTower(state: GameState, playerId: PlayerId, towerId: EntityId, events: GameEvent[]): boolean {
  const tower = towerById(state, towerId);
  if (!tower || tower.ownerId !== playerId) return false;
  state.players[playerId].wood += towerRefund(state, tower);
  removeTower(state, tower, events);
  return true;
}

function removeTower(state: GameState, tower: Tower, events: GameEvent[]): void {
  state.towers.splice(state.towers.indexOf(tower), 1);
  for (const z of state.zombies) if (z.aggroTowerId === tower.id) z.aggroTowerId = null;
  events.push({ type: "towerDestroyed", id: tower.id, pos: { ...tower.pos }, kind: tower.kind });
}

export function damageTower(state: GameState, tower: Tower, amount: number, events: GameEvent[]): void {
  if (!state.towers.includes(tower)) return;
  tower.hp -= amount;
  events.push({ type: "towerHit", id: tower.id, pos: { ...tower.pos } });
  if (tower.hp <= 0) removeTower(state, tower, events);
}

/** Damage de la un turn: zombiul lovit se întoarce să atace turnul (dacă e destul de aproape). */
function towerDamage(state: GameState, tower: Tower | undefined, z: Zombie, amount: number, ownerHeroId: EntityId | null, from: Vec2, events: GameEvent[]): void {
  if (tower && z.aggroTowerId === null && dist(z.pos, tower.pos) <= CONFIG.zombieCommon.towerAggroRange) {
    z.aggroTowerId = tower.id;
  }
  damageZombie(state, z, amount, events, ownerHeroId, from);
}

const ownerHero = (state: GameState, tower: Tower): EntityId | null => state.players[tower.ownerId]?.heroId ?? null;

function launch(state: GameState, tower: Tower, target: Zombie, special: Shell["special"], damage: number, splash: number, speed: number, events: GameEvent[]): void {
  state.shells.push({
    id: state.nextId++,
    towerId: tower.id,
    kind: tower.kind,
    special,
    from: { ...tower.pos },
    pos: { ...tower.pos },
    targetId: target.id,
    target: { ...target.pos },
    speed,
    damage,
    splash,
    ownerHeroId: ownerHero(state, tower),
  });
  events.push({ type: "towerFired", towerId: tower.id, kind: tower.kind, from: { ...tower.pos }, to: { ...target.pos }, special });
}

/** Zombii de pe o linie (laserul Tesla, săgeata grea). */
function zombiesOnLine(state: GameState, from: Vec2, dir: Vec2, length: number, width: number): Zombie[] {
  const out: { z: Zombie; t: number }[] = [];
  for (const z of state.zombies) {
    const dx = z.pos.x - from.x;
    const dz = z.pos.z - from.z;
    const t = dx * dir.x + dz * dir.z;
    if (t <= 0 || t > length) continue;
    if (Math.abs(dx * dir.z - dz * dir.x) <= CONFIG.zombies[z.type].radius + width) out.push({ z, t });
  }
  return out.sort((a, b) => a.t - b.t).map((o) => o.z);
}

/**
 * Statisticile „din teren”: dificultatea scade damage-ul (pe Nightmare turnurile nu mai duc
 * singure valul), iar viscolul scurtează raza tuturor turnurilor, în afară de Tesla.
 */
export function effectiveTowerStats(state: GameState, tower: Tower): TowerStats {
  const base = towerStats(tower.kind, tower.level);
  const range = tower.kind === "tesla" ? 1 : CONFIG.weather[state.weather].towerRange;
  return { ...base, damage: base.damage * CONFIG.difficulty[state.difficulty].towerDamage, range: base.range * range };
}

/** Cât din lemnul investit primești înapoi: ziua `refund`, noaptea (în timpul valului) jumătate din el. */
export function refundFactor(state: GameState): number {
  const B = CONFIG.barricade;
  return B.refund * (state.phase === "night" ? B.nightRefundFactor : 1);
}

export function updateTowers(state: GameState, dt: number, events: GameEvent[]): void {
  for (const tower of [...state.towers]) {
    const stats = effectiveTowerStats(state, tower);
    tower.fireTimer -= dt;
    tower.abilityTimer -= dt;

    // Pasiva turnului de gheață: răcește tot ce e în rază.
    if (tower.kind === "frost") {
      for (const z of zombiesInRadius(state, tower.pos, stats.range)) z.chillTimer = Math.max(z.chillTimer, 0.25);
    }

    const target = findNearestZombie(state, tower.pos, stats.range);
    if (!target) continue;
    tower.facing = angleOf(target.pos.x - tower.pos.x, target.pos.z - tower.pos.z);

    if (tower.abilityTimer <= 0) {
      tower.abilityTimer = stats.abilityCooldown;
      tower.fireTimer = Math.max(tower.fireTimer, stats.fireInterval * 0.5);
      useAbility(state, tower, stats, target, events);
      continue;
    }
    if (tower.fireTimer > 0) continue;
    tower.fireTimer = stats.fireInterval;

    if (tower.kind === "tesla") {
      // Descărcare electrică: lovește instant.
      events.push({ type: "towerFired", towerId: tower.id, kind: "tesla", from: { ...tower.pos }, to: { ...target.pos }, special: "none" });
      towerDamage(state, tower, target, stats.damage, ownerHero(state, tower), tower.pos, events);
    } else {
      launch(state, tower, target, "none", stats.damage, stats.splash, stats.shellSpeed, events);
    }
  }
}

function useAbility(state: GameState, tower: Tower, stats: TowerStats, target: Zombie, events: GameEvent[]): void {
  const d = dist(tower.pos, target.pos) || 1;
  const dir = { x: (target.pos.x - tower.pos.x) / d, z: (target.pos.z - tower.pos.z) / d };
  const end = { x: tower.pos.x + dir.x * stats.range, z: tower.pos.z + dir.z * stats.range };
  switch (tower.kind) {
    case "crossbow":
      launch(state, tower, target, "heavy", stats.damage * A.heavyBoltMultiplier, 0, stats.shellSpeed * 1.2, events);
      break;
    case "rocket":
      launch(state, tower, target, "big", stats.damage * A.bigRocketMultiplier, A.bigRocketSplash, stats.shellSpeed * 0.8, events);
      break;
    case "cannon":
      launch(state, tower, target, "fire", stats.damage, stats.splash, stats.shellSpeed, events);
      break;
    case "tesla": {
      // Laser care trece prin toți zombii de pe linie.
      events.push({ type: "towerAbility", towerId: tower.id, kind: "tesla", pos: { ...tower.pos }, to: end });
      for (const z of zombiesOnLine(state, tower.pos, dir, stats.range, A.laserWidth)) {
        towerDamage(state, tower, z, stats.damage * A.laserMultiplier, ownerHero(state, tower), tower.pos, events);
      }
      break;
    }
    case "frost":
      events.push({ type: "towerAbility", towerId: tower.id, kind: "frost", pos: { ...tower.pos }, to: { ...target.pos } });
      // Înghețarea nu se adună: un zombie abia dezghețat e imun câteva secunde (și la alt turn).
      let frozen = 0;
      for (const z of zombiesInRadius(state, tower.pos, stats.range)) {
        if (z.frozenTimer > 0 || z.freezeImmune > 0) continue;
        z.frozenTimer = A.freezeDuration;
        z.freezeImmune = A.freezeDuration + A.freezeImmunity;
        frozen++;
      }
      if (frozen > 0) events.push({ type: "frozen", pos: { ...tower.pos }, count: frozen });
      break;
  }
}

/** Proiectilele turnurilor: urmăresc ținta și lovesc când ajung. */
export function updateShells(state: GameState, dt: number, events: GameEvent[]): void {
  for (let i = state.shells.length - 1; i >= 0; i--) {
    const s = state.shells[i];
    const target = s.targetId !== null ? state.zombies.find((z) => z.id === s.targetId) : undefined;
    if (target) s.target = { ...target.pos };
    else s.targetId = null;
    const d = dist(s.pos, s.target);
    const step = s.speed * dt;
    if (d > step + 0.05) {
      s.pos.x += ((s.target.x - s.pos.x) / d) * step;
      s.pos.z += ((s.target.z - s.pos.z) / d) * step;
      continue;
    }
    s.pos = { ...s.target };
    state.shells.splice(i, 1);
    shellImpact(state, s, target ?? null, events);
  }
}

function shellImpact(state: GameState, s: Shell, target: Zombie | null, events: GameEvent[]): void {
  const tower = towerById(state, s.towerId);
  events.push({ type: "shellHit", kind: s.kind, special: s.special, pos: { ...s.pos }, splash: s.splash });

  if (s.splash > 0) {
    for (const z of zombiesInRadius(state, s.pos, s.splash)) towerDamage(state, tower, z, s.damage, s.ownerHeroId, s.pos, events);
  } else if (target) {
    if (s.kind === "frost") target.chillTimer = Math.max(target.chillTimer, 2);
    towerDamage(state, tower, target, s.damage, s.ownerHeroId, s.from, events);
  }

  if (s.special === "heavy") {
    // Săgeata grea trece mai departe prin încă doi zombi din spate.
    const d = dist(s.from, s.pos) || 1;
    const dir = { x: (s.pos.x - s.from.x) / d, z: (s.pos.z - s.from.z) / d };
    const behind = zombiesOnLine(state, s.pos, dir, 5, 0.4).filter((z) => z !== target).slice(0, A.heavyBoltPierce - 1);
    for (const z of behind) towerDamage(state, tower, z, s.damage * 0.6, s.ownerHeroId, s.from, events);
  } else if (s.special === "big") {
    // Racheta mare se sparge în mini-rachete spre zombii din jur.
    const near = state.zombies
      .filter((z) => dist(z.pos, s.pos) <= A.miniRocketRange)
      .sort((a, b) => dist(a.pos, s.pos) - dist(b.pos, s.pos))
      .slice(0, A.miniRockets);
    for (const z of near) {
      state.shells.push({
        id: state.nextId++, towerId: s.towerId, kind: "rocket", special: "mini",
        from: { ...s.pos }, pos: { ...s.pos }, targetId: z.id, target: { ...z.pos },
        speed: 14, damage: s.damage * A.miniRocketDamage, splash: 0.9, ownerHeroId: s.ownerHeroId,
      });
    }
  } else if (s.special === "fire") {
    state.fires.push({
      id: state.nextId++, pos: { ...s.pos }, radius: A.fireRadius, life: A.fireDuration,
      dps: s.damage * A.fireDps, ownerHeroId: s.ownerHeroId,
    });
  }
}

/** Focul de pe jos (de la tun) arde zombii care stau în el. */
export function updateFires(state: GameState, dt: number, events: GameEvent[]): void {
  for (let i = state.fires.length - 1; i >= 0; i--) {
    const f = state.fires[i];
    f.life -= dt;
    if (f.life <= 0) {
      state.fires.splice(i, 1);
      continue;
    }
    for (const z of zombiesInRadius(state, f.pos, f.radius)) {
      if (CONFIG.zombies[z.type].flying) continue;
      const dmg = f.dps * dt;
      // Fără eveniment de lovitură la fiecare pas (ar fi prea mult sânge); doar lovitura finală.
      if (z.hp - dmg > 0) z.hp -= dmg;
      else damageZombie(state, z, dmg, events, f.ownerHeroId, f.pos);
    }
  }
}
