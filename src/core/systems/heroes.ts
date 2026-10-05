import { CONFIG } from "../config";
import { ABILITY } from "../heroDefs";
import { angleOf, dist, distSq, nextRandom } from "../math";
import type { EntityId, GameEvent, GameState, Hero, Zombie } from "../types";
import { resolveCollisions } from "./physics";
import { damageZombie } from "./zombies";

export function heroById(state: GameState, id: EntityId): Hero | undefined {
  return state.heroes.find((h) => h.id === id);
}

/** Multiplicatorul de damage: nivel + arma din cufere. */
export function heroDamageMultiplier(state: GameState, hero: Hero): number {
  const weapon = state.players[hero.playerId]?.weaponBonus ?? 0;
  return (1 + (hero.level - 1) * CONFIG.xp.damagePerLevel) * (1 + weapon);
}

/** Multiplicatorul pentru abilități (cresc cu nivelul). */
export function abilityPower(hero: Hero): number {
  return 1 + (hero.level - 1) * ABILITY.levelScaling;
}

export function xpToNextLevel(level: number): number {
  return CONFIG.xp.perLevel + (level - 1) * CONFIG.xp.perLevelGrowth;
}

export function updateHeroes(state: GameState, dt: number, events: GameEvent[]): void {
  for (const hero of state.heroes) {
    const stats = CONFIG.heroes[hero.heroClass];

    for (let i = 0; i < 4; i++) hero.cooldowns[i] = Math.max(0, hero.cooldowns[i] - dt);
    const b = hero.buffs;
    b.rapidFire = Math.max(0, b.rapidFire - dt);
    b.focus = Math.max(0, b.focus - dt);
    b.shield = Math.max(0, b.shield - dt);
    b.invulnerable = Math.max(0, b.invulnerable - dt);

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

    // 2. Repară automat baricadele din apropiere.
    repairNearbyBarricades(state, hero, dt);

    // 3. Atac automat asupra celui mai apropiat zombie din rază.
    hero.fireTimer -= dt;
    const target = findNearestZombie(state, hero.pos, stats.range);
    if (!target) continue;
    hero.facing = angleOf(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z);
    if (hero.fireTimer > 0) continue;

    let interval: number = stats.fireInterval;
    if (b.rapidFire > 0) interval /= ABILITY.rapidFire.speedMultiplier;
    if (b.focus > 0) interval /= ABILITY.focus.speedMultiplier;
    hero.fireTimer = interval;

    let damage = stats.damage * heroDamageMultiplier(state, hero);
    let crit = false;
    if (hero.heroClass === "sniper") {
      const chance = CONFIG.heroCommon.sniperCritChance + (b.focus > 0 ? ABILITY.focus.critBonus : 0);
      if (nextRandom(state) < chance) {
        crit = true;
        damage *= CONFIG.heroCommon.sniperCritMultiplier;
      }
    }

    // Assault Rifle: glonțul lovește și al doilea cel mai apropiat zombie.
    const secondary = hero.heroClass === "assault" ? findNearestZombie(state, hero.pos, stats.range, target) : null;

    events.push({ type: "shot", from: { ...hero.pos }, to: { ...target.pos }, source: "hero", crit });
    damageZombie(state, target, damage, events, hero.id);
    if (secondary) {
      events.push({ type: "shot", from: { ...hero.pos }, to: { ...secondary.pos }, source: "hero" });
      damageZombie(state, secondary, damage * CONFIG.heroCommon.assaultSecondaryDamage, events, hero.id);
    }
  }
}

function repairNearbyBarricades(state: GameState, hero: Hero, dt: number): void {
  const c = CONFIG.heroCommon;
  const rate = c.repairRate * (hero.heroClass === "tank" ? c.tankRepairMultiplier : 1);
  for (const b of state.barricades) {
    if (b.hp < b.maxHp && dist(b.pos, hero.pos) <= c.repairRadius + CONFIG.barricade.radius) {
      b.hp = Math.min(b.maxHp, b.hp + rate * dt);
    }
  }
}

export function findNearestZombie(
  state: GameState,
  from: { x: number; z: number },
  range: number,
  exclude: Zombie | null = null,
): Zombie | null {
  let best: Zombie | null = null;
  let bestD = range * range;
  for (const z of state.zombies) {
    if (z.hp <= 0 || z === exclude) continue;
    const d = distSq(from, z.pos);
    if (d <= bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

export function damageHero(hero: Hero, amount: number, events: GameEvent[]): void {
  if (!hero.alive || hero.buffs.invulnerable > 0) return;
  if (hero.buffs.shield > 0) amount *= 1 - ABILITY.shield.damageReduction;
  hero.hp -= amount;
  if (hero.hp <= 0) {
    hero.hp = 0;
    hero.alive = false;
    hero.respawnTimer = CONFIG.heroCommon.respawnTime;
    events.push({ type: "heroDied", id: hero.id });
  }
}

export function healHero(hero: Hero, amount: number, events: GameEvent[]): void {
  if (!hero.alive || hero.hp >= hero.maxHp) return;
  hero.hp = Math.min(hero.maxHp, hero.hp + amount);
  events.push({ type: "healed", pos: { ...hero.pos }, amount });
}

export function reviveHero(hero: Hero, hpFraction: number): void {
  hero.alive = true;
  hero.hp = Math.round(hero.maxHp * hpFraction);
  hero.respawnTimer = 0;
}

function respawnHero(state: GameState, hero: Hero, events: GameEvent[]): void {
  reviveHero(hero, 1);
  hero.pos = { x: state.shelter.pos.x, z: state.shelter.pos.z - state.shelter.radius - 1.5 };
  events.push({ type: "heroRespawned", id: hero.id });
}

export function giveXp(hero: Hero, amount: number, events: GameEvent[]): void {
  hero.xp += amount;
  while (hero.xp >= xpToNextLevel(hero.level)) {
    hero.xp -= xpToNextLevel(hero.level);
    hero.level++;
    hero.maxHp = Math.round(CONFIG.heroes[hero.heroClass].maxHp * (1 + (hero.level - 1) * CONFIG.xp.hpPerLevel));
    if (hero.alive) hero.hp = hero.maxHp;
    events.push({ type: "levelUp", heroId: hero.id, level: hero.level });
  }
}
