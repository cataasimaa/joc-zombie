// Uneltele: butonul de acțiune (sau târnăcopul ținut în mână) face ce are sens lângă erou.
//  - pe malul bălții (ziua): arunci undița; când se agață un pește, tragi de mai multe ori
//    (biban 2, păstrăv 3, știucă 5, somn 8) până nu-ți scapă;
//  - la taraba negustorului: vinzi tot peștele pe aur (fiecare specie are prețul ei);
//  - altfel, cât ții apăsat, lovești cu târnăcopul ce e cel mai aproape: un animal (găină, porc,
//    căprioară, urs), un zăcământ de argint / aur sau un brad (+1 lemn; la 50 de lovituri cade).
// Zăcămintele apar ziua, aleator, pe hartă.

import { CONFIG, FISH_KINDS, type FishKind } from "../config";
import { GAME_MAP, OBSTACLES, obstacleActive, treeFelled } from "../map";
import { type Vec2, angleOf, dist, nextRandom } from "../math";
import type { Animal, GameEvent, GameState, Hero, Ore, Player, Zombie } from "../types";
import { heroDamageMultiplier } from "./heroes";
import { gatherSpeed, hasPassive, rank } from "./progression";
import { damageAnimal } from "./survival";
import { damageZombie, targetable } from "./zombies";

const G = CONFIG.gather;

/** Ce ar face butonul de acțiune acum (pentru eticheta butonului din HUD). */
export type ActionHint = "fish" | "reel" | "sell" | "chop" | "mine" | "hunt" | null;

/** Pe malul bălții (nu în apă, nu prea departe): de aici poți pescui. */
export function nearFishingHole(hero: Hero): boolean {
  const d = dist(hero.pos, GAME_MAP.pond.pos);
  return d <= GAME_MAP.pond.radius + G.fishReach;
}

/** Unde cade pluta: în apă, în fața eroului (spre centrul bălții). */
export function bobberPos(hero: Hero): Vec2 {
  const p = GAME_MAP.pond;
  const dx = hero.pos.x - p.pos.x;
  const dz = hero.pos.z - p.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const r = Math.max(1, p.radius - 1.6);
  return { x: p.pos.x + (dx / d) * r, z: p.pos.z + (dz / d) * r };
}

export function nearTrader(hero: Hero): boolean {
  return dist(hero.pos, GAME_MAP.trader.pos) <= GAME_MAP.trader.radius + G.sellReach;
}

export function fishCount(player: Player): number {
  return FISH_KINDS.reduce((a, k) => a + player.inventory[k], 0);
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
  if (nearFishingHole(hero) && state.phase === "day") return "fish";
  const t = toolTarget(state, hero);
  if (!t) return null;
  return t.kind === "tree" ? "chop" : t.kind === "ore" ? "mine" : "hunt";
}

/** Ce pește se agață (după cât de rar e fiecare). */
function rollFish(state: GameState): FishKind {
  const total = FISH_KINDS.reduce((a, k) => a + G.fish[k].weight, 0);
  let r = nextRandom(state) * total;
  for (const k of FISH_KINDS) {
    r -= G.fish[k].weight;
    if (r <= 0) return k;
  }
  return "perch";
}

const nextBite = (state: GameState) => G.biteMin + nextRandom(state) * (G.biteMax - G.biteMin);
const nextTug = (state: GameState) => G.tugMin + nextRandom(state) * (G.tugMax - G.tugMin);

export function updateGather(state: GameState, dt: number, events: GameEvent[]): void {
  for (const hero of state.heroes) {
    const press = hero.actionPress;
    hero.actionPress = false;
    if (!hero.alive) {
      hero.fishTimer = -1;
      hero.hooked = null;
      continue;
    }
    hero.actionTimer -= dt;
    const player = state.players[hero.playerId];
    // „Folosești” unealta: ții apăsat butonul principal (✛) sau acțiunea (G / comanda veche).
    const using = hero.firing || hero.action;

    // Lanterna: bateria se descarcă cât e aprinsă și se reîncarcă cât e stinsă.
    if (hero.lantern) {
      hero.battery = Math.max(0, hero.battery - G.batteryDrain * dt);
      if (hero.battery <= 0) {
        hero.lantern = false;
        events.push({ type: "lantern", heroId: hero.id, on: false });
      }
    } else {
      hero.battery = Math.min(100, hero.battery + G.batteryCharge * dt);
    }
    if (player.tool === "lantern" && press) {
      hero.lantern = !hero.lantern && hero.battery > 1;
      events.push({ type: "lantern", heroId: hero.id, on: hero.lantern });
    }

    // Lângă tarabă, peștele se vinde singur.
    if (nearTrader(hero) && fishCount(player) > 0) {
      let coins = 0;
      let fish = 0;
      const price = hasPassive(hero, "fish", 5) ? CONFIG.skills.fishPrice : 1;
      for (const k of FISH_KINDS) {
        coins += Math.round(player.inventory[k] * G.fish[k].price * price);
        fish += player.inventory[k];
        player.inventory[k] = 0;
      }
      player.coins += coins;
      events.push({ type: "sold", playerId: player.id, fish, coins, pos: { ...GAME_MAP.trader.pos } });
    }

    // 1. Pescuit în curs.
    if (hero.fishTimer >= 0) {
      const bob = bobberPos(hero);
      const moving = hero.moveInput.x !== 0 || hero.moveInput.z !== 0;
      if (moving || state.phase !== "day" || !nearFishingHole(hero) || player.tool !== "rod") {
        hero.fishTimer = -1;
        hero.hooked = null;
        hero.biteTimer = 0;
        events.push({ type: "fishLost", heroId: hero.id, pos: bob });
        continue;
      }
      if (hero.hooked) {
        const f = G.fish[hero.hooked];
        // Peștele se zbate: din când în când se smucește și îți smulge firul înapoi.
        hero.tugTimer -= dt;
        if (hero.tugTimer <= 0) {
          hero.tugTimer = nextTug(state);
          hero.reel = Math.max(0, hero.reel - f.tug * fishTugFactor(hero));
          events.push({ type: "fishTug", heroId: hero.id, playerId: hero.playerId, pos: bob, reel: hero.reel });
        }
        if (press) {
          // Tragi de pește: încă o dată... și încă o dată, până iese.
          hero.reel++;
          events.push({ type: "fishReel", heroId: hero.id, pos: bob, reel: hero.reel, pulls: f.pulls });
          if (hero.reel >= f.pulls) {
            player.inventory[hero.hooked]++;
            events.push({ type: "fishCaught", heroId: hero.id, playerId: hero.playerId, pos: bob, fish: hero.hooked });
            hero.fishTimer = -1;
            hero.hooked = null;
            hero.biteTimer = 0;
            continue;
          }
        }
        hero.biteTimer -= dt;
        if (hero.biteTimer <= 0) {
          // N-ai tras destul de repede: peștele a rupt firul. Undița rămâne în apă.
          hero.hooked = null;
          hero.biteTimer = 0;
          hero.fishTimer = nextBite(state);
          events.push({ type: "fishLost", heroId: hero.id, pos: bob });
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
        const fish = rollFish(state);
        hero.fishTimer = 0;
        hero.hooked = fish;
        hero.reel = 0;
        hero.tugTimer = nextTug(state);
        hero.biteTimer = G.fish[fish].time * (1 + rank(hero, "fish") * CONFIG.skills.fishTime);
        events.push({ type: "fishBite", heroId: hero.id, pos: bob, fish });
      }
      continue;
    }

    // 2. Cu undița în mână: o apăsare pe malul bălții (ziua) aruncă undița.
    if (press && player.tool === "rod") {
      if (nearFishingHole(hero) && state.phase === "day") {
        hero.fishTimer = nextBite(state);
        hero.biteTimer = 0;
        hero.hooked = null;
        const bob = bobberPos(hero);
        hero.facing = angleOf(bob.x - hero.pos.x, bob.z - hero.pos.z);
        events.push({ type: "fishCast", heroId: hero.id, pos: bob });
        continue;
      }
    }

    // 3. Drujba în mână: cât ții apăsat, taie (copaci, animale, zombi) și arde benzină.
    if (player.tool === "chainsaw") {
      if (!using) continue;
      if (hero.sawFuel <= 0 && player.inventory.petrol > 0) {
        player.inventory.petrol--;
        hero.sawFuel = Math.min(CONFIG.chainsaw.tank, hero.sawFuel + CONFIG.chainsaw.secondsPerPetrol);
      }
      if (hero.sawFuel <= 0) {
        if (press) events.push({ type: "noPetrol", heroId: hero.id });
        continue;
      }
      hero.sawFuel = Math.max(0, hero.sawFuel - dt);
      if (hero.actionTimer > 1e-6) continue;
      hero.actionTimer = CONFIG.chainsaw.hitInterval * gatherSpeed(hero, "chop");
      const t = sawTarget(state, hero);
      if (!t) {
        const f = hero.facing;
        events.push({ type: "toolHit", heroId: hero.id, target: "air", tool: "chainsaw", pos: { x: hero.pos.x + Math.sin(f) * 1.1, z: hero.pos.z + Math.cos(f) * 1.1 } });
        continue;
      }
      hero.facing = angleOf(t.pos.x - hero.pos.x, t.pos.z - hero.pos.z);
      events.push({ type: "toolHit", heroId: hero.id, target: t.kind, tool: "chainsaw", pos: { ...t.pos } });
      if (t.kind === "zombie") damageZombie(state, t.zombie, CONFIG.chainsaw.zombieDamage * heroDamageMultiplier(hero), events, hero.id, hero.pos);
      else if (t.kind === "animal") damageAnimal(state, t.animal, G.animalDamage * 1.5, events, hero.pos);
      else if (t.kind === "tree") chopTree(state, hero, player, t.index, t.pos, events);
      continue;
    }

    // 4. Târnăcopul în mână: cât ții apăsat, lovești ținta din față (sau dai în gol).
    if (player.tool !== "pickaxe" || !using || hero.actionTimer > 1e-6) continue;
    const target = toolTarget(state, hero);
    if (!target) {
      hero.actionTimer = G.missInterval;
      const f = hero.facing;
      events.push({ type: "toolHit", heroId: hero.id, target: "air", tool: "pickaxe", pos: { x: hero.pos.x + Math.sin(f) * 1.2, z: hero.pos.z + Math.cos(f) * 1.2 } });
      continue;
    }
    const speed = target.kind === "tree" ? gatherSpeed(hero, "chop") : target.kind === "ore" ? gatherSpeed(hero, "mine") : 1;
    hero.actionTimer = G.hitInterval[target.kind] * speed;
    hero.facing = angleOf(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z);
    events.push({ type: "toolHit", heroId: hero.id, target: target.kind, tool: "pickaxe", pos: { ...target.pos } });
    if (target.kind === "animal") {
      damageAnimal(state, target.animal, G.animalDamage, events, hero.pos);
    } else if (target.kind === "ore") {
      const ore = target.ore;
      ore.hits--;
      if (ore.hits <= 0) {
        // Argint / aur: monede (+50% cu „Ochi de aur”) și fier; uleiul: bidoane de ulei brut.
        const coins = Math.round(G.ore[ore.kind].coins * (hasPassive(hero, "mine", 3) ? 1 + CONFIG.skills.goldBonus : 1));
        const extra = hasPassive(hero, "mine", 5) ? 1 : 0;
        player.coins += coins;
        if (ore.kind === "oil") player.inventory.oil += CONFIG.oil.amount + extra;
        else player.inventory.iron += CONFIG.loot.iron[ore.kind] + extra;
        state.ores.splice(state.ores.indexOf(ore), 1);
        events.push({ type: "oreMined", id: ore.id, kind: ore.kind, pos: { ...ore.pos }, playerId: hero.playerId, coins });
      }
    } else {
      chopTree(state, hero, player, target.index, target.pos, events);
    }
  }
}

/** O lovitură în brad: lemn (+1 cu „Tăietor”), iar cu „Pădurar” bradul cade de 2× mai repede. */
function chopTree(state: GameState, hero: Hero, player: Player, index: number, pos: Vec2, events: GameEvent[]): void {
  state.treeHits[index] = (state.treeHits[index] ?? 0) + (hasPassive(hero, "chop", 5) ? 2 : 1);
  player.wood += G.woodPerHit + (hasPassive(hero, "chop", 3) ? 1 : 0);
  if (treeFelled(state, index)) events.push({ type: "treeFelled", index, pos: { ...pos } });
}

/** Cât de tare te smucește peștele (mai puțin cu abilitatea de pescuit). */
function fishTugFactor(hero: Hero): number {
  return Math.max(0.2, 1 - rank(hero, "fish") * CONFIG.skills.fishTug) * (hasPassive(hero, "fish", 3) ? 0.5 : 1);
}

type SawTarget = { kind: "zombie"; zombie: Zombie; pos: Vec2 } | { kind: "animal"; animal: Animal; pos: Vec2 } | { kind: "tree"; index: number; pos: Vec2 };

/** Ținta drujbei: zombii din față au prioritate, apoi animalele, apoi brazii. */
function sawTarget(state: GameState, hero: Hero): SawTarget | null {
  const reach = CONFIG.chainsaw.reach;
  let best: SawTarget | null = null;
  let bestScore = Infinity;
  const consider = (t: SawTarget, edge: number, prio: number) => {
    const d = dist(hero.pos, t.pos) - edge;
    if (d > reach) return;
    const score = prio * 100 + d;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  };
  for (const z of state.zombies) if (targetable(z)) consider({ kind: "zombie", zombie: z, pos: z.pos }, CONFIG.zombies[z.type].radius, 0);
  for (const a of state.animals) consider({ kind: "animal", animal: a, pos: a.pos }, CONFIG.animals[a.kind].radius, 1);
  for (const o of OBSTACLES) {
    if (o.tree === undefined || !obstacleActive(state, o)) continue;
    consider({ kind: "tree", index: o.tree, pos: o.pos }, o.radius, 2);
  }
  return best;
}

/** Ziua apar câteva zăcăminte noi de argint sau aur, în locuri libere de pe hartă. */
export function spawnDayOres(state: GameState, events: GameEvent[]): void {
  for (let n = 0; n < G.orePerDay && state.ores.length < G.oreMax; n++) {
    const pos = freeSpot(state);
    if (!pos) return;
    const roll = nextRandom(state);
    const kind: Ore["kind"] = roll < CONFIG.oil.chance ? "oil" : roll < CONFIG.oil.chance + G.goldChance ? "gold" : "silver";
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
