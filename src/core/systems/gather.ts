// Uneltele: butonul de acțiune face ce are sens lângă erou.
//  - la copcă (ziua): aruncă undița; când mușcă peștele, apeși din nou ca să-l scoți;
//  - la taraba negustorului: vinzi tot peștele pe aur (monede);
//  - altfel, cât ții apăsat, lovești cu târnăcopul ce e cel mai aproape: un animal (găină, porc,
//    căprioară, urs), un zăcământ de argint / aur sau un brad (+1 lemn; la 50 de lovituri cade).
// Zăcămintele apar ziua, aleator, pe hartă.

import { CONFIG } from "../config";
import { GAME_MAP, OBSTACLES, obstacleActive, treeFelled } from "../map";
import { type Vec2, angleOf, dist, nextRandom } from "../math";
import type { Animal, GameEvent, GameState, Hero, Ore } from "../types";
import { damageAnimal } from "./survival";

const G = CONFIG.gather;

/** Ce ar face butonul de acțiune acum (pentru eticheta butonului din HUD). */
export type ActionHint = "fish" | "reel" | "sell" | "chop" | "mine" | "hunt" | null;

export function nearFishingHole(hero: Hero): boolean {
  return dist(hero.pos, GAME_MAP.pond.pos) <= G.fishReach;
}

export function nearTrader(hero: Hero): boolean {
  return dist(hero.pos, GAME_MAP.trader.pos) <= GAME_MAP.trader.radius + G.sellReach;
}

type Target = { kind: "animal"; animal: Animal; pos: Vec2 } | { kind: "ore"; ore: Ore; pos: Vec2 } | { kind: "tree"; index: number; pos: Vec2 };

/**
 * Ținta târnăcopului din raza brațului. Animalele au prioritate (fug!), apoi zăcămintele,
 * apoi brazii; între ținte de același fel, cea mai apropiată.
 */
export function toolTarget(state: GameState, hero: Hero): Target | null {
  const PRIORITY = { animal: 0, ore: 1, tree: 2 } as const;
  let best: Target | null = null;
  let bestScore = Infinity;
  const consider = (t: Target, edge: number) => {
    const d = dist(hero.pos, t.pos) - edge;
    const score = PRIORITY[t.kind] * 100 + d;
    if (d <= G.reach && score < bestScore) {
      bestScore = score;
      best = t;
    }
  };
  for (const a of state.animals) consider({ kind: "animal", animal: a, pos: a.pos }, CONFIG.animals[a.kind].radius);
  for (const o of state.ores) consider({ kind: "ore", ore: o, pos: o.pos }, 0.6);
  for (const o of OBSTACLES) {
    if (o.tree === undefined || !obstacleActive(state, o)) continue;
    consider({ kind: "tree", index: o.tree, pos: o.pos }, o.radius);
  }
  return best;
}

export function actionHint(state: GameState, hero: Hero): ActionHint {
  if (!hero.alive) return null;
  if (hero.fishTimer >= 0) return "reel";
  const player = state.players[hero.playerId];
  if (nearTrader(hero) && player.inventory.fish > 0) return "sell";
  if (nearFishingHole(hero) && state.phase === "day") return "fish";
  const t = toolTarget(state, hero);
  if (!t) return null;
  return t.kind === "tree" ? "chop" : t.kind === "ore" ? "mine" : "hunt";
}

export function updateGather(state: GameState, dt: number, events: GameEvent[]): void {
  for (const hero of state.heroes) {
    const press = hero.actionPress;
    hero.actionPress = false;
    if (!hero.alive) {
      hero.fishTimer = -1;
      continue;
    }
    hero.actionTimer -= dt;

    // 1. Pescuit în curs.
    if (hero.fishTimer >= 0) {
      const moving = hero.moveInput.x !== 0 || hero.moveInput.z !== 0;
      if (moving || state.phase !== "day" || !nearFishingHole(hero)) {
        hero.fishTimer = -1;
        hero.biteTimer = 0;
        events.push({ type: "fishLost", heroId: hero.id, pos: { ...GAME_MAP.pond.pos } });
        continue;
      }
      if (hero.biteTimer > 0) {
        if (press) {
          // L-ai prins!
          hero.fishTimer = -1;
          hero.biteTimer = 0;
          state.players[hero.playerId].inventory.fish++;
          events.push({ type: "fishCaught", heroId: hero.id, playerId: hero.playerId, pos: { ...GAME_MAP.pond.pos } });
          continue;
        }
        hero.biteTimer -= dt;
        if (hero.biteTimer <= 0) {
          // Prea târziu: peștele a scăpat. Undița rămâne în apă pentru următorul.
          hero.biteTimer = 0;
          hero.fishTimer = G.biteMin + nextRandom(state) * (G.biteMax - G.biteMin);
          events.push({ type: "fishLost", heroId: hero.id, pos: { ...GAME_MAP.pond.pos } });
        }
        continue;
      }
      if (press) {
        // Ai tras prea devreme: scoți undița goală.
        hero.fishTimer = -1;
        continue;
      }
      hero.fishTimer -= dt;
      if (hero.fishTimer <= 0) {
        hero.fishTimer = 0;
        hero.biteTimer = G.biteWindow;
        events.push({ type: "fishBite", heroId: hero.id, pos: { ...GAME_MAP.pond.pos } });
      }
      continue;
    }

    // 2. O apăsare: vinzi la tarabă sau arunci undița.
    if (press) {
      const player = state.players[hero.playerId];
      if (nearTrader(hero) && player.inventory.fish > 0) {
        const fish = player.inventory.fish;
        const coins = fish * G.fishPrice;
        player.inventory.fish = 0;
        player.coins += coins;
        events.push({ type: "sold", playerId: player.id, fish, coins, pos: { ...GAME_MAP.trader.pos } });
        continue;
      }
      if (nearFishingHole(hero) && state.phase === "day") {
        hero.fishTimer = G.biteMin + nextRandom(state) * (G.biteMax - G.biteMin);
        hero.biteTimer = 0;
        hero.facing = angleOf(GAME_MAP.pond.pos.x - hero.pos.x, GAME_MAP.pond.pos.z - hero.pos.z);
        events.push({ type: "fishCast", heroId: hero.id, pos: { ...GAME_MAP.pond.pos } });
        continue;
      }
    }

    // 3. Târnăcopul: cât ții apăsat, lovești ținta cea mai apropiată.
    if (!hero.action || hero.actionTimer > 1e-6) continue;
    const target = toolTarget(state, hero);
    if (!target) continue;
    hero.actionTimer = G.hitInterval;
    hero.facing = angleOf(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z);
    events.push({ type: "toolHit", heroId: hero.id, target: target.kind, pos: { ...target.pos } });
    if (target.kind === "animal") {
      damageAnimal(state, target.animal, G.animalDamage, events, hero.pos);
    } else if (target.kind === "ore") {
      const ore = target.ore;
      ore.hits--;
      if (ore.hits <= 0) {
        const coins = G.ore[ore.kind].coins;
        state.players[hero.playerId].coins += coins;
        state.ores.splice(state.ores.indexOf(ore), 1);
        events.push({ type: "oreMined", id: ore.id, kind: ore.kind, pos: { ...ore.pos }, playerId: hero.playerId, coins });
      }
    } else {
      state.treeHits[target.index] = (state.treeHits[target.index] ?? 0) + 1;
      state.players[hero.playerId].wood += G.woodPerHit;
      if (treeFelled(state, target.index)) events.push({ type: "treeFelled", index: target.index, pos: { ...target.pos } });
    }
  }
}

/** Ziua apar câteva zăcăminte noi de argint sau aur, în locuri libere de pe hartă. */
export function spawnDayOres(state: GameState, events: GameEvent[]): void {
  for (let n = 0; n < G.orePerDay && state.ores.length < G.oreMax; n++) {
    const pos = freeSpot(state);
    if (!pos) return;
    const kind: Ore["kind"] = nextRandom(state) < G.goldChance ? "gold" : "silver";
    const ore: Ore = { id: state.nextId++, kind, pos, hits: G.ore[kind].hits };
    state.ores.push(ore);
    events.push({ type: "oreSpawned", id: ore.id, kind, pos: { ...pos } });
  }
}

function freeSpot(state: GameState): Vec2 | null {
  const H = CONFIG.map.halfSize - 4;
  for (let i = 0; i < 40; i++) {
    const pos = { x: (nextRandom(state) * 2 - 1) * H, z: (nextRandom(state) * 2 - 1) * H };
    if (Math.hypot(pos.x, pos.z) < 9) continue;
    if (dist(pos, GAME_MAP.pond.pos) < GAME_MAP.pond.radius + 1.5) continue;
    if (OBSTACLES.some((o) => obstacleActive(state, o) && dist(o.pos, pos) < o.radius + 1.2)) continue;
    if (state.ores.some((o) => dist(o.pos, pos) < 4)) continue;
    if (state.towers.some((t) => dist(t.pos, pos) < 2.5)) continue;
    return pos;
  }
  return null;
}
