import { CONFIG } from "../config";
import { ABILITY } from "../heroDefs";
import { WEAPONS } from "../items";
import { angleOf, distSq, nextRandom } from "../math";
import type { EntityId, GameEvent, GameState, Hero, Player, Zombie } from "../types";
import { distToBarricade } from "./barricades";
import { resolveCollisions } from "./physics";
import { damageZombie } from "./zombies";

export function heroById(state: GameState, id: EntityId): Hero | undefined {
  return state.heroes.find((h) => h.id === id);
}

const playerOf = (state: GameState, hero: Hero): Player => state.players[hero.playerId];

/** Multiplicatorul de damage din nivel. Arma are multiplicatorul ei separat. */
export function heroDamageMultiplier(hero: Hero): number {
  return 1 + (hero.level - 1) * CONFIG.xp.damagePerLevel;
}

/** Multiplicatorul pentru abilități (cresc cu nivelul). */
export function abilityPower(hero: Hero): number {
  return 1 + (hero.level - 1) * ABILITY.levelScaling;
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

/** Raza de atac a eroului (clasă + armă). */
export function heroRange(state: GameState, hero: Hero): number {
  return CONFIG.heroes[hero.heroClass].range + WEAPONS[playerOf(state, hero).weapon].range;
}

export function updateHeroes(state: GameState, dt: number, events: GameEvent[]): void {
  for (const hero of state.heroes) {
    const stats = CONFIG.heroes[hero.heroClass];
    const player = playerOf(state, hero);
    const weapon = WEAPONS[player.weapon];

    for (let i = 0; i < 4; i++) hero.cooldowns[i] = Math.max(0, hero.cooldowns[i] - dt);
    hero.buffs.shield = Math.max(0, hero.buffs.shield - dt);
    hero.buffs.invulnerable = Math.max(0, hero.buffs.invulnerable - dt);

    if (!hero.alive) {
      hero.respawnTimer -= dt;
      if (hero.respawnTimer <= 0) respawnHero(state, hero, events);
      continue;
    }

    // Regenerare (din magazin).
    if (player.regenPerSec > 0) hero.hp = Math.min(hero.maxHp, hero.hp + player.regenPerSec * dt);

    // 1. Mișcare după input. Zidurile îl opresc, ușile nu.
    const { x, z } = hero.moveInput;
    if (x !== 0 || z !== 0) {
      const speed = stats.speed * (1 + player.speedBonus);
      hero.pos.x += x * speed * dt;
      hero.pos.z += z * speed * dt;
      hero.facing = angleOf(x, z);
      resolveCollisions(state, hero.pos, stats.radius, { barricades: "walls" });
    }

    // 2. Repară automat baricadele din apropiere.
    repairNearbyBarricades(state, hero, player, dt);

    // 3. Atac automat asupra celui mai apropiat zombie din rază.
    hero.fireTimer -= dt;
    const range = heroRange(state, hero);
    const target = findNearestZombie(state, hero.pos, range);
    if (!target) continue;
    hero.facing = angleOf(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z);
    if (hero.fireTimer > 0) continue;
    hero.fireTimer = stats.fireInterval * weapon.interval;

    let damage = stats.damage * weapon.damage * heroDamageMultiplier(hero);
    let crit = false;
    if (hero.heroClass === "sniper" && nextRandom(state) < CONFIG.heroCommon.sniperCritChance) {
      crit = true;
      damage *= CONFIG.heroCommon.sniperCritMultiplier;
    }

    // Ținte în plus: Assault Rifle lovește mereu 2 zombi; unele arme lovesc și mai mulți.
    const extra = weapon.extraTargets + (hero.heroClass === "assault" ? 1 : 0);
    const targets: Zombie[] = [target];
    for (let i = 0; i < extra; i++) {
      const next = findNearestZombie(state, target.pos, 6, targets);
      if (!next || distSq(next.pos, hero.pos) > range * range) break;
      targets.push(next);
    }
    targets.forEach((z, i) => {
      events.push({ type: "shot", from: { ...hero.pos }, to: { ...z.pos }, source: "hero", crit: crit && i === 0, heroId: hero.id });
      const dmg = i === 0 ? damage : damage * CONFIG.heroCommon.assaultSecondaryDamage;
      if (weapon.slow > 0) z.slowTimer = Math.max(z.slowTimer, weapon.slow);
      damageZombie(state, z, dmg, events, hero.id, hero.pos);
    });
  }
}

function repairNearbyBarricades(state: GameState, hero: Hero, player: Player, dt: number): void {
  const c = CONFIG.heroCommon;
  const rate = c.repairRate * (hero.heroClass === "tank" ? c.tankRepairMultiplier : 1) * (1 + player.repairBonus);
  for (const b of state.barricades) {
    if (b.hp < b.maxHp && distToBarricade(hero.pos, b) <= c.repairRadius) {
      b.hp = Math.min(b.maxHp, b.hp + rate * dt);
    }
  }
}

/** Cel mai apropiat zombie (care nu fuge) din rază, în afară de cei excluși. */
export function findNearestZombie(
  state: GameState,
  from: { x: number; z: number },
  range: number,
  exclude: Zombie[] = [],
): Zombie | null {
  let best: Zombie | null = null;
  let bestD = range * range;
  for (const z of state.zombies) {
    if (z.hp <= 0 || z.fleeing || exclude.includes(z)) continue;
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

export function giveXp(state: GameState, hero: Hero, amount: number, events: GameEvent[]): void {
  hero.xp += amount;
  while (hero.xp >= xpToNextLevel(hero.level)) {
    hero.xp -= xpToNextLevel(hero.level);
    hero.level++;
    recomputeMaxHp(state, hero);
    if (hero.alive) hero.hp = hero.maxHp;
    events.push({ type: "levelUp", heroId: hero.id, level: hero.level });
  }
}
