// Testele pentru: abilitățile de la level up, armele / drujba deblocate cu nivelul, uleiul și
// benzina, armurile, zombii noi (urlătoarea, umflatul, săpătorul, șamanul) și cei 4 boși noi.

import { describe, expect, it } from "vitest";
import { CONFIG, type ZombieType } from "./config";
import { GameSimulation } from "./Game";
import { GAME_MAP, OBSTACLES } from "./map";
import type { GameEvent, Tower } from "./types";
import { giveXp, gunStats, xpToNextLevel } from "./systems/heroes";
import { armorReduction } from "./systems/progression";
import { waveComposition } from "./systems/waves";
import { spawnZombie } from "./systems/zombies";

const DT = 1 / CONFIG.tickRate;

const newGame = (mode: "defend" | "survival" = "defend") => new GameSimulation({ players: [{ id: "p1", heroClass: "assault" }], seed: 7, mode });

function run(sim: GameSimulation, seconds: number) {
  for (let t = 0; t < seconds; t += DT) sim.step(DT);
}

function dummy(sim: GameSimulation, type: ZombieType, x: number, z: number, hp = 1e6) {
  sim.state.wave = Math.max(1, sim.state.wave);
  const zb = spawnZombie(sim.state, type);
  zb.pos = { x, z };
  zb.hp = zb.maxHp = hp;
  return zb;
}

function levelTo(sim: GameSimulation, level: number) {
  const h = sim.state.heroes[0];
  const events: GameEvent[] = [];
  while (h.level < level) giveXp(sim.state, h, xpToNextLevel(h.level), events);
  return events;
}

function tower(id: number, x: number, z: number): Tower {
  return { id, ownerId: "p1", kind: "crossbow", pos: { x, z }, level: 1, facing: 0, fireTimer: 99, abilityTimer: 99, hp: 500, maxHp: 500 };
}

describe("nivel: abilități și pasive", () => {
  it("la fiecare nivel primești un punct și alegi ce crești; treapta 3 = pasivă", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    expect(h.skillPoints).toBe(0);
    levelTo(sim, 4);
    expect(h.skillPoints).toBe(3);
    const before = gunStats(sim.state, h);
    for (let i = 0; i < 3; i++) sim.enqueue({ type: "learnSkill", playerId: "p1", skill: "shoot" });
    sim.step(DT);
    const events = sim.drainEvents();
    expect(h.skills.shoot).toBe(3);
    expect(h.skillPoints).toBe(0);
    expect(events.some((e) => e.type === "skillLearned" && e.passive)).toBe(true);
    const after = gunStats(sim.state, h);
    expect(after.damage).toBeCloseTo(before.damage * (1 + 3 * CONFIG.skills.shootDamage), 5);
    expect(after.reloadTime).toBeCloseTo(before.reloadTime * (1 - CONFIG.skills.shootReload), 5);
    // Fără puncte nu mai poți învăța nimic.
    sim.enqueue({ type: "learnSkill", playerId: "p1", skill: "chop" });
    sim.step(DT);
    expect(h.skills.chop).toBe(0);
  });

  it("tăiatul: treapta 3 dă +1 lemn pe lovitură", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    const tree = OBSTACLES.find((o) => o.tree !== undefined)!;
    h.pos = { x: tree.pos.x + tree.radius + 0.8, z: tree.pos.z };
    sim.state.players.p1.tool = "pickaxe";
    h.skills.chop = 3;
    const wood = sim.state.players.p1.wood;
    sim.enqueue({ type: "action", playerId: "p1", on: true });
    sim.step(DT);
    expect(sim.state.players.p1.wood).toBe(wood + 2);
  });
});

describe("deblocări cu nivelul", () => {
  it("pistol la 2, pușcă la 4, drujbă la 5, pușcă de asalt la 7, turnuri mai bune", () => {
    const sim = newGame();
    const p = sim.state.players.p1;
    levelTo(sim, 2);
    expect(p.weapons).toContain("pistol");
    levelTo(sim, 4);
    expect(p.weapons).toContain("rifle");
    expect(p.towerTier).toBeGreaterThanOrEqual(3);
    levelTo(sim, 5);
    expect(p.chainsaw).toBe(true);
    expect(p.hotbar).toContain("chainsaw");
    levelTo(sim, 8);
    expect(p.weapons).toContain("assaultRifle");
    expect(p.towerTier).toBe(5);
  });
});

describe("drujba, uleiul și benzina", () => {
  it("drujba taie bradul repede și arde benzina; fără benzină nu merge", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    const p = sim.state.players.p1;
    p.chainsaw = true;
    p.tool = "chainsaw";
    p.inventory.petrol = 0;
    const tree = OBSTACLES.find((o) => o.tree !== undefined)!;
    h.pos = { x: tree.pos.x + tree.radius + 0.8, z: tree.pos.z };
    const wood = p.wood;
    sim.enqueue({ type: "action", playerId: "p1", on: true });
    run(sim, 1);
    expect(p.wood).toBe(wood);
    p.inventory.petrol = 1;
    run(sim, 1);
    // ~1 s de tăiat la 0,22 s pe lovitură = 4–5 lovituri (târnăcopul dă una la 0,7 s).
    expect(p.wood - wood).toBeGreaterThanOrEqual(4);
    expect(p.inventory.petrol).toBe(0);
    expect(h.sawFuel).toBeLessThan(CONFIG.chainsaw.secondsPerPetrol);
  });

  it("uleiul pus pe foc devine benzină", () => {
    const sim = newGame("survival");
    const h = sim.state.heroes[0];
    const p = sim.state.players.p1;
    const fire = sim.state.campfires[0];
    h.pos = { x: fire.pos.x + 1.5, z: fire.pos.z };
    p.inventory.oil = 1;
    sim.enqueue({ type: "refineOil", playerId: "p1" });
    sim.step(DT);
    expect(p.inventory.oil).toBe(0);
    expect(fire.refining.length).toBe(1);
    run(sim, CONFIG.oil.refineTime + 0.5);
    // Bidonul cade lângă foc; îl iei mergând peste el.
    const drop = sim.state.drops.find((d) => d.kind === "petrol");
    expect(drop || p.inventory.petrol > 0).toBeTruthy();
    if (drop) {
      h.pos = { ...drop.pos };
      sim.step(DT);
    }
    expect(p.inventory.petrol).toBe(1);
  });

  it("zăcământul negru dă ulei, argintul dă și fier", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    const p = sim.state.players.p1;
    p.tool = "pickaxe";
    sim.state.ores.push({ id: 900, kind: "oil", pos: { x: 15, z: 15 }, hits: 1 });
    h.pos = { x: 16.2, z: 15 };
    sim.enqueue({ type: "action", playerId: "p1", on: true });
    sim.step(DT);
    expect(p.inventory.oil).toBe(CONFIG.oil.amount);
    sim.state.ores.push({ id: 901, kind: "silver", pos: { x: -15, z: 15 }, hits: 1 });
    h.pos = { x: -16.2, z: 15 };
    run(sim, 1.2);
    expect(p.inventory.iron).toBe(CONFIG.loot.iron.silver);
  });
});

describe("armuri", () => {
  it("piesele de piele și metal costă piele / fier și opresc din damage; setul complet dă bonus", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    const p = sim.state.players.p1;
    sim.enqueue({ type: "craftArmor", playerId: "p1", slot: "chest", material: "leather" });
    sim.step(DT);
    expect(h.armor.chest).toBeNull();
    p.inventory.leather = 30;
    p.inventory.iron = 30;
    sim.enqueue({ type: "craftArmor", playerId: "p1", slot: "chest", material: "leather" });
    sim.step(DT);
    expect(h.armor.chest).toBe("leather");
    expect(p.inventory.leather).toBe(30 - CONFIG.armor.leather.cost.chest.leather);
    expect(armorReduction(h)).toBeCloseTo(CONFIG.armor.leather.reduction.chest, 5);
    for (const slot of ["head", "chest", "legs", "feet"] as const) sim.enqueue({ type: "craftArmor", playerId: "p1", slot, material: "metal" });
    sim.step(DT);
    expect(armorReduction(h)).toBeCloseTo(0.3 + CONFIG.armor.metal.setReduction, 5);
    // Lovit cu 100: primești doar 60.
    h.hp = h.maxHp = 1000;
    const z = dummy(sim, "walker", h.pos.x + 1, h.pos.z);
    z.attackTimer = 0;
    sim.step(DT);
    const hit = CONFIG.zombies.walker.damage * (1 - 0.4);
    expect(1000 - h.hp).toBeCloseTo(hit, 1);
  });

  it("animalele lasă piele", () => {
    const sim = newGame();
    sim.state.animals.push({ id: 900, kind: "deer", pos: { x: 10, z: 10 }, facing: 0, hp: 1, maxHp: 40, goal: { x: 10, z: 10 }, timer: 99, attackTimer: 0, farmId: null });
    const h = sim.state.heroes[0];
    sim.state.players.p1.tool = "pickaxe";
    h.pos = { x: 11, z: 10 };
    sim.enqueue({ type: "action", playerId: "p1", on: true });
    run(sim, 0.5);
    const onGround = sim.state.drops.filter((d) => d.kind === "leather").reduce((a, d) => a + d.amount, 0);
    expect(sim.state.players.p1.inventory.leather + onGround).toBe(CONFIG.loot.leather.deer);
  });
});

describe("zombi noi", () => {
  it("apar în nopțile lor", () => {
    expect(waveComposition(2, 1)).toContain("bloater");
    expect(waveComposition(3, 1)).toContain("screamer");
    expect(waveComposition(5, 1)).toContain("burrower");
    expect(waveComposition(6, 1)).toContain("shaman");
    expect(waveComposition(1, 1)).not.toContain("bloater");
  });

  it("urlătoarea înfurie zombii din jur", () => {
    const sim = newGame();
    const s = dummy(sim, "screamer", 20, 20);
    const w = dummy(sim, "walker", 21, 20);
    s.abilityTimer = 0;
    sim.step(DT);
    expect(w.rageTimer).toBeGreaterThan(0);
  });

  it("umflatul explodează lângă erou și îl rănește", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    h.pos = { x: 20, z: -20 };
    const b = dummy(sim, "bloater", 21, -20, 50);
    sim.step(DT);
    expect(sim.state.zombies.includes(b)).toBe(false);
    expect(h.hp).toBeLessThan(h.maxHp);
    expect(sim.drainEvents().some((e) => e.type === "bloaterBurst")).toBe(true);
  });

  it("săpătorul nu poate fi lovit sub zăpadă și iese lângă erou", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    h.pos = { x: 0, z: -12 };
    const b = dummy(sim, "burrower", 0, -24, 50);
    expect(b.burrowed).toBe(true);
    // Tragi în el: glonțul trece pe deasupra.
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: -1, firing: true, auto: false });
    sim.step(DT);
    expect(b.hp).toBe(50);
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: -1, firing: false, auto: false });
    run(sim, 4);
    expect(b.burrowed).toBe(false);
  });

  it("șamanul vindecă zombii răniți", () => {
    const sim = newGame();
    const sh = dummy(sim, "shaman", 25, 25);
    const w = dummy(sim, "walker", 26, 25, 100);
    w.hp = 10;
    sh.abilityTimer = 0;
    sim.step(DT);
    expect(w.hp).toBeGreaterThan(10);
  });
});

describe("boși noi", () => {
  it("fiecare noapte de boss are boss-ul ei", () => {
    expect(waveComposition(3, 1)).toContain("broodmother");
    expect(waveComposition(5, 1)).toContain("boss");
    expect(waveComposition(7, 1)).toContain("yeti");
    expect(waveComposition(9, 1)).toContain("witch");
    expect(waveComposition(10, 1)).toContain("colossus");
  });

  it("matca naște pui, iar la moarte îi scapă pe toți; lasă cufăr", () => {
    const sim = newGame();
    const m = dummy(sim, "broodmother", 25, 25, 10);
    m.abilityTimer = 0;
    sim.step(DT);
    expect(sim.state.zombies.filter((z) => z.type === "runner").length).toBe(CONFIG.zombieAbilities.broodCount);
    sim.state.heroes[0].pos = { x: 25, z: 18 };
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: 1, firing: true, auto: false });
    sim.drainEvents();
    let born = 0;
    for (let i = 0; i < 30 && sim.state.zombies.includes(m); i++) {
      sim.step(DT);
      for (const e of sim.drainEvents()) if (e.type === "broodSpawn") born += e.count;
    }
    expect(sim.state.zombies.includes(m)).toBe(false);
    expect(born).toBe(CONFIG.zombieAbilities.broodOnDeath);
    expect(sim.state.chests.length).toBe(1);
  });

  it("yeti-ul se încordează, apoi se năpustește și te aruncă", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    h.pos = { x: 20, z: -20 };
    const y = dummy(sim, "yeti", 20, -28);
    y.abilityTimer = 0;
    sim.step(DT);
    expect(y.charge?.phase).toBe("wind");
    run(sim, CONFIG.zombieAbilities.chargeWindup + 1);
    expect(h.hp).toBeLessThan(h.maxHp);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === "yetiCharge")).toBe(true);
  });

  it("vrăjitoarea îngheață turnurile și se teleportează", () => {
    const sim = newGame();
    const t = tower(800, 15, 15);
    sim.state.towers.push(t);
    const w = dummy(sim, "witch", 18, 15);
    w.ability2Timer = 0;
    w.abilityTimer = 0;
    const from = { ...w.pos };
    sim.step(DT);
    expect(t.frozenTimer).toBeGreaterThan(0);
    expect(w.pos.x !== from.x || w.pos.z !== from.z).toBe(true);
  });

  it("colosul bate din picior (undă de șoc) și se înfurie la jumătate", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    h.pos = { x: 20, z: -20 };
    const c = dummy(sim, "colossus", 23, -20, 1000);
    c.abilityTimer = 0;
    sim.step(DT);
    expect(h.hp).toBeLessThan(h.maxHp);
    c.hp = 400;
    sim.step(DT);
    expect(c.enraged).toBe(true);
  });

  it("toți boșii lasă cufăr", () => {
    for (const type of ["yeti", "witch", "colossus"] as ZombieType[]) {
      const sim = newGame();
      const z = dummy(sim, type, 25, 25, 1);
      sim.state.heroes[0].pos = { x: 25, z: 18 };
      sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: 1, firing: true, auto: false });
      run(sim, 0.5);
      expect(sim.state.zombies.includes(z)).toBe(false);
      expect(sim.state.chests.length).toBe(1);
    }
  });
});

it("harta are încă balta (sanity)", () => {
  expect(GAME_MAP.pond.radius).toBeGreaterThan(0);
});
