// Abilitățile eroilor. Toate țintesc automat (pe mobil nu avem mouse pentru țintit):
// cel mai apropiat zombie, zombiul cu cel mai mult HP, aliatul cel mai rănit etc.

import { CONFIG } from "../config";
import { ABILITY, HERO_DEFS } from "../heroDefs";
import { type Vec2, dist } from "../math";
import type { GameEvent, GameState, Hero, Zombie } from "../types";
import { abilityPower, findNearestZombie, healHero, reviveHero } from "./heroes";
import { damageZombie, zombiesInRadius } from "./zombies";

/** Returnează null dacă abilitatea se poate folosi acum, altfel motivul (pentru UI). */
export function abilityBlockedReason(state: GameState, hero: Hero, slot: number): string | null {
  if (slot < 0 || slot > 3) return "Abilitate inexistentă";
  if (!hero.alive) return "Ești căzut";
  if (slot === 3 && hero.level < CONFIG.ultLevel) return `Se deblochează la nivelul ${CONFIG.ultLevel}`;
  if (hero.cooldowns[slot] > 0) return "Se reîncarcă";
  const id = HERO_DEFS[hero.heroClass].abilities[slot].id;
  switch (id) {
    case "grenade":
      return findNearestZombie(state, hero.pos, ABILITY.grenade.range) ? null : "Niciun zombie în rază";
    case "headshot":
      return findNearestZombie(state, hero.pos, ABILITY.headshot.range) ? null : "Niciun zombie în rază";
    case "pierce":
      return findNearestZombie(state, hero.pos, ABILITY.pierce.length) ? null : "Niciun zombie în rază";
    case "heal":
      return healTarget(state, hero) ? null : "Toți sunt sănătoși";
    case "revive":
      return reviveTarget(state, hero) ? null : "Niciun coleg căzut aproape";
    default:
      return null;
  }
}

/** Folosește abilitatea din slotul dat. Returnează true dacă a reușit. */
export function useAbility(state: GameState, hero: Hero, slot: number, events: GameEvent[]): boolean {
  if (abilityBlockedReason(state, hero, slot) !== null) return false;
  const def = HERO_DEFS[hero.heroClass].abilities[slot];
  const power = abilityPower(hero);
  const fx = (pos: Vec2, radius: number, to?: Vec2) =>
    events.push({ type: "ability", heroId: hero.id, ability: def.id, pos: { ...pos }, radius, to: to && { ...to } });

  switch (def.id) {
    // ---------- Assault Rifle ----------
    case "grenade": {
      const target = findNearestZombie(state, hero.pos, ABILITY.grenade.range)!;
      const at = { ...target.pos };
      fx(hero.pos, ABILITY.grenade.radius, at);
      for (const z of zombiesInRadius(state, at, ABILITY.grenade.radius)) {
        damageZombie(state, z, ABILITY.grenade.damage * power, events, hero.id);
      }
      break;
    }
    case "rapidFire":
      hero.buffs.rapidFire = ABILITY.rapidFire.duration;
      fx(hero.pos, 1.5);
      break;
    case "spray": {
      const { range, coneDegrees, damage } = ABILITY.spray;
      const half = (coneDegrees / 2) * (Math.PI / 180);
      const dirX = Math.sin(hero.facing);
      const dirZ = Math.cos(hero.facing);
      fx(hero.pos, range, { x: hero.pos.x + dirX * range, z: hero.pos.z + dirZ * range });
      for (const z of [...state.zombies]) {
        const dx = z.pos.x - hero.pos.x;
        const dz = z.pos.z - hero.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > range || d === 0) continue;
        const cos = (dx * dirX + dz * dirZ) / d;
        if (cos >= Math.cos(half)) damageZombie(state, z, damage * power, events, hero.id);
      }
      break;
    }
    case "airstrike":
      fx(hero.pos, ABILITY.airstrike.radius);
      for (const z of zombiesInRadius(state, hero.pos, ABILITY.airstrike.radius)) {
        damageZombie(state, z, ABILITY.airstrike.damage * power, events, hero.id);
      }
      break;

    // ---------- Sniper ----------
    case "headshot": {
      const target = strongestZombies(state, hero.pos, ABILITY.headshot.range, 1)[0];
      events.push({ type: "shot", from: { ...hero.pos }, to: { ...target.pos }, source: "hero", crit: true });
      fx(target.pos, 1);
      damageZombie(state, target, ABILITY.headshot.damage * power, events, hero.id);
      break;
    }
    case "pierce": {
      const { length, width, damage } = ABILITY.pierce;
      const target = findNearestZombie(state, hero.pos, length)!;
      const d = dist(hero.pos, target.pos) || 1;
      const dirX = (target.pos.x - hero.pos.x) / d;
      const dirZ = (target.pos.z - hero.pos.z) / d;
      const end = { x: hero.pos.x + dirX * length, z: hero.pos.z + dirZ * length };
      fx(hero.pos, width, end);
      for (const z of [...state.zombies]) {
        const dx = z.pos.x - hero.pos.x;
        const dz = z.pos.z - hero.pos.z;
        const along = dx * dirX + dz * dirZ;
        const across = Math.abs(dx * dirZ - dz * dirX);
        if (along >= 0 && along <= length && across <= width + CONFIG.zombies[z.type].radius) {
          damageZombie(state, z, damage * power, events, hero.id);
        }
      }
      break;
    }
    case "focus":
      hero.buffs.focus = ABILITY.focus.duration;
      fx(hero.pos, 1.5);
      break;
    case "assassinate":
      fx(hero.pos, 2);
      for (const z of strongestZombies(state, hero.pos, ABILITY.assassinate.range, ABILITY.assassinate.targets)) {
        events.push({ type: "shot", from: { ...hero.pos }, to: { ...z.pos }, source: "hero", crit: true });
        damageZombie(state, z, ABILITY.assassinate.damage * power, events, hero.id);
      }
      break;

    // ---------- Tank ----------
    case "taunt":
      fx(hero.pos, ABILITY.taunt.radius);
      tauntAround(state, hero, ABILITY.taunt.radius, ABILITY.taunt.duration);
      break;
    case "shield":
      hero.buffs.shield = ABILITY.shield.duration;
      fx(hero.pos, 1.5);
      break;
    case "slam":
      fx(hero.pos, ABILITY.slam.radius);
      for (const z of zombiesInRadius(state, hero.pos, ABILITY.slam.radius)) {
        z.slowTimer = ABILITY.slam.slowDuration;
        damageZombie(state, z, ABILITY.slam.damage * power, events, hero.id);
      }
      break;
    case "fortress":
      hero.buffs.invulnerable = ABILITY.fortress.duration;
      fx(hero.pos, ABILITY.fortress.tauntRadius);
      tauntAround(state, hero, ABILITY.fortress.tauntRadius, ABILITY.fortress.duration);
      break;

    // ---------- Healer ----------
    case "heal": {
      const target = healTarget(state, hero)!;
      fx(target.pos, 1.5);
      healHero(target, ABILITY.heal.amount * power, events);
      break;
    }
    case "healZone":
      fx(hero.pos, ABILITY.healZone.radius);
      state.zones.push({
        id: state.nextId++,
        kind: "heal",
        pos: { ...hero.pos },
        radius: ABILITY.healZone.radius,
        timer: ABILITY.healZone.duration,
        power: ABILITY.healZone.healPerSecond * power,
      });
      break;
    case "revive": {
      const target = reviveTarget(state, hero)!;
      reviveHero(target, ABILITY.revive.hpFraction);
      fx(target.pos, 2);
      events.push({ type: "heroRevived", id: target.id, byHeroId: hero.id });
      break;
    }
    case "holyLight": {
      const { radius, damage, shelterHeal } = ABILITY.holyLight;
      fx(hero.pos, radius);
      for (const h of state.heroes) healHero(h, h.maxHp, events);
      const sh = state.shelter;
      sh.hp = Math.min(sh.maxHp, sh.hp + shelterHeal * power);
      events.push({ type: "healed", pos: { ...sh.pos }, amount: shelterHeal });
      for (const z of zombiesInRadius(state, hero.pos, radius)) {
        damageZombie(state, z, damage * power, events, hero.id);
      }
      break;
    }
  }

  hero.cooldowns[slot] = def.cooldown;
  return true;
}

/** Zonele de vindecare: vindecă eroii și baricadele din interior. */
export function updateZones(state: GameState, dt: number): void {
  for (let i = state.zones.length - 1; i >= 0; i--) {
    const zone = state.zones[i];
    zone.timer -= dt;
    if (zone.timer <= 0) {
      state.zones.splice(i, 1);
      continue;
    }
    for (const h of state.heroes) {
      if (h.alive && h.hp < h.maxHp && dist(h.pos, zone.pos) <= zone.radius) {
        h.hp = Math.min(h.maxHp, h.hp + zone.power * dt);
      }
    }
    for (const b of state.barricades) {
      if (dist(b.pos, zone.pos) <= zone.radius) b.hp = Math.min(b.maxHp, b.hp + zone.power * dt);
    }
  }
}

function tauntAround(state: GameState, hero: Hero, radius: number, duration: number): void {
  for (const z of zombiesInRadius(state, hero.pos, radius)) {
    z.tauntHeroId = hero.id;
    z.tauntTimer = duration;
  }
}

function strongestZombies(state: GameState, from: Vec2, range: number, count: number): Zombie[] {
  return state.zombies
    .filter((z) => dist(z.pos, from) <= range)
    .sort((a, b) => b.hp - a.hp || a.id - b.id)
    .slice(0, count);
}

/** Aliatul viu cu cel mai mic procent de HP din rază (inclusiv eroul însuși). */
function healTarget(state: GameState, hero: Hero): Hero | null {
  let best: Hero | null = null;
  for (const h of state.heroes) {
    if (!h.alive || h.hp >= h.maxHp || dist(h.pos, hero.pos) > ABILITY.heal.range) continue;
    if (!best || h.hp / h.maxHp < best.hp / best.maxHp) best = h;
  }
  return best;
}

function reviveTarget(state: GameState, hero: Hero): Hero | null {
  return (
    state.heroes.find((h) => h !== hero && !h.alive && dist(h.pos, hero.pos) <= ABILITY.revive.range) ?? null
  );
}
