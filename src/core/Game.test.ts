import { describe, expect, it } from "vitest";
import { CONFIG, type HeroClass } from "./config";
import { GameSimulation } from "./Game";
import { REPEATABLE, rewardKey } from "./items";
import { GAME_MAP, treeFelled } from "./map";
import { segmentEnds } from "./math";
import type { GameEvent } from "./types";
import { barricadeSpotProblem, nextInChain, snapBarricade } from "./systems/barricades";
import { gunStats } from "./systems/heroes";
import { rollRarity } from "./systems/shop";
import { canBuildTower, effectiveTowerStats, towerRefund, towerSlots, towerStats } from "./systems/towers";
import { nightDuration, waveComposition } from "./systems/waves";
import { spawnZombie } from "./systems/zombies";

const DT = 1 / CONFIG.tickRate;

function newGame(heroClass: HeroClass = "assault", seed = 1) {
  return new GameSimulation({ players: [{ id: "p1", heroClass }], seed });
}

function run(sim: GameSimulation, seconds: number) {
  for (let t = 0; t < seconds; t += DT) sim.step(DT);
}

/** Un zombie „de test” cu mult HP, pus exact unde vrem. */
function dummy(sim: GameSimulation, type: Parameters<typeof spawnZombie>[1], x: number, z: number, hp = 1e6) {
  sim.state.wave = Math.max(1, sim.state.wave);
  const zb = spawnZombie(sim.state, type);
  zb.pos = { x, z };
  zb.hp = zb.maxHp = hp;
  return zb;
}

describe("zi și noapte", () => {
  it("pornește ziua, iar noaptea vine după prima zi", () => {
    const sim = newGame();
    expect(sim.state.phase).toBe("day");
    run(sim, CONFIG.waves.firstDay + 0.1);
    expect(sim.state.phase).toBe("night");
    expect(sim.state.wave).toBe(1);
  });

  it("nopțile devin tot mai lungi", () => {
    expect(nightDuration(5)).toBeGreaterThan(nightDuration(1));
    expect(nightDuration(10)).toBeGreaterThan(nightDuration(5));
  });

  it("nopțile aduc tipuri noi de zombi și boss la 5 și 10", () => {
    expect(waveComposition(2, 1).length).toBeGreaterThan(waveComposition(1, 1).length);
    expect(waveComposition(1, 1)).not.toContain("runner");
    expect(waveComposition(2, 1)).toContain("runner");
    expect(waveComposition(3, 1)).toContain("spitter");
    expect(waveComposition(4, 1)).toContain("flyer");
    expect(waveComposition(4, 1)).toContain("brute");
    expect(waveComposition(5, 1).at(-1)).toBe("boss");
    expect(waveComposition(10, 1).at(-1)).toBe("boss");
    expect(waveComposition(1, 4).length).toBeGreaterThan(waveComposition(1, 1).length);
  });

  it("în zori zombii rămași iau foc și mor încet, fără monede", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    sim.enqueue({ type: "startNightNow", playerId: "p1" });
    sim.step(DT);
    s.spawnQueue = [];
    const z = dummy(sim, "boss", 20, 20, 1000);
    s.phaseTimer = 0.01;
    sim.step(DT);
    expect(s.phase).toBe("day");
    expect(z.burning).toBe(true);
    run(sim, 3);
    expect(z.hp).toBeLessThan(1000);
    expect(z.hp).toBeGreaterThan(0); // nu moare instant
    run(sim, 15);
    expect(s.zombies.length).toBe(0);
    expect(s.coins.length).toBe(0);
  });
});

describe("tragere", () => {
  it("trage doar în direcția în care ochești", () => {
    const sim = newGame("sniper");
    const s = sim.state;
    s.heroes[0].pos = { x: 0, z: -10 };
    const left = dummy(sim, "brute", -8, -10);
    const right = dummy(sim, "brute", 8, -10);
    sim.enqueue({ type: "aim", playerId: "p1", x: 1, z: 0, firing: true, auto: false });
    run(sim, 1.5);
    expect(right.hp).toBeLessThan(right.maxHp);
    expect(left.hp).toBe(left.maxHp);
  });

  it("are încărcător și reîncarcă singur când se golește", () => {
    const sim = newGame("assault");
    const s = sim.state;
    const hero = s.heroes[0];
    const gun = gunStats(s, hero);
    hero.pos = { x: 0, z: -10 };
    dummy(sim, "brute", 6, -10);
    sim.enqueue({ type: "aim", playerId: "p1", x: 1, z: 0, firing: true, auto: false });
    run(sim, gun.interval * gun.magazine + 0.2);
    expect(hero.reloadTimer).toBeGreaterThan(0);
    run(sim, gun.reloadTime + 0.1);
    expect(hero.ammo).toBeGreaterThan(0);
  });

  it("ochirea automată ține cel mai apropiat zombie", () => {
    const sim = newGame("assault");
    const s = sim.state;
    s.heroes[0].pos = { x: 0, z: -10 };
    const z = dummy(sim, "brute", -5, -14);
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: 1, firing: true, auto: true });
    run(sim, 1);
    expect(z.hp).toBeLessThan(z.maxHp);
  });

  it("casele și brazii opresc gloanțele", () => {
    const sim = newGame("sniper");
    const s = sim.state;
    // Un zombie exact în spatele adăpostului.
    s.heroes[0].pos = { x: 0, z: -8 };
    const z = dummy(sim, "brute", 0, 8);
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: 1, firing: true, auto: false });
    run(sim, 2);
    expect(z.hp).toBe(z.maxHp);
  });

  it("zombii omorâți dau XP și uneori monede", () => {
    const sim = newGame("assault", 3);
    const s = sim.state;
    s.heroes[0].pos = { x: 0, z: -10 };
    for (let i = 0; i < 12; i++) dummy(sim, "walker", 3 + i * 0.1, -10 + (i % 3) * 0.2, 10);
    sim.enqueue({ type: "aim", playerId: "p1", x: 1, z: 0, firing: true, auto: true });
    run(sim, 6);
    expect(s.zombies.length).toBe(0);
    expect(s.heroes[0].xp + (s.heroes[0].level - 1) * 100).toBeGreaterThan(0);
    expect(s.coins.length).toBeLessThan(12); // nu fiecare zombie lasă monedă
  });
});

describe("luptă", () => {
  it("zombii distrug adăpostul dacă nimeni nu-l apără → game over", () => {
    const sim = newGame("assault", 2);
    sim.state.heroes[0].pos = { x: -38, z: -38 };
    sim.state.shelter.hp = 50;
    sim.enqueue({ type: "startNightNow", playerId: "p1" });
    run(sim, 120);
    expect(sim.state.phase).toBe("gameover");
  });

  it("zidurile opresc zombii, care le atacă", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    s.barricades.push({ id: 999, ownerId: "p1", pos: { x: 0, z: 10 }, rotation: 0, level: 1, door: false, broken: false, hp: 250, maxHp: 250 });
    const z = dummy(sim, "walker", 0, 14, 100);
    run(sim, 5);
    expect(z.pos.z).toBeGreaterThan(10);
    expect(s.barricades[0].hp).toBeLessThan(250);
  });

  it("zburătorii trec peste ziduri", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    s.barricades.push({ id: 999, ownerId: "p1", pos: { x: 0, z: 10 }, rotation: 0, level: 1, door: false, broken: false, hp: 250, maxHp: 250 });
    const z = dummy(sim, "flyer", 0, 14, 100);
    run(sim, 3);
    expect(z.pos.z).toBeLessThan(9);
  });

  it("scuipătorul lovește eroul de la distanță", () => {
    const sim = newGame("tank");
    const s = sim.state;
    const hero = s.heroes[0];
    hero.pos = { x: 0, z: -15 };
    dummy(sim, "spitter", 0, -23);
    const hp = hero.hp;
    run(sim, 6);
    expect(hero.hp).toBeLessThan(hp);
  });

  it("monedele neluate dispar după un timp", () => {
    const sim = newGame();
    sim.state.coins.push({ id: 900, pos: { x: 20, z: 20 }, value: 5, age: 0 });
    run(sim, CONFIG.coins.lifetime + 0.5);
    expect(sim.state.coins.length).toBe(0);
  });

  it("e deterministă: același seed + aceleași comenzi = aceeași stare", () => {
    const a = newGame("sniper", 99);
    const b = newGame("sniper", 99);
    for (const sim of [a, b]) {
      sim.enqueue({ type: "startNightNow", playerId: "p1" });
      sim.enqueue({ type: "move", playerId: "p1", x: 1, z: 0 });
      sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: 1, firing: true, auto: true });
      run(sim, 20);
    }
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});

/** Un turn de test. */
function tower(id: number, x: number, z: number, kind: "crossbow" | "rocket" | "cannon" | "tesla" | "frost" = "crossbow") {
  const hp = towerStats(kind, 1).hp;
  return { id, ownerId: "p1", kind, pos: { x, z }, level: 1, facing: 0, fireTimer: 0, abilityTimer: 99, hp, maxHp: hp };
}

describe("turnuri", () => {
  it("arbaleta se transformă în alt tip și crește în nivel", () => {
    const sim = newGame();
    const s = sim.state;
    s.players.p1.wood = 1000;
    sim.enqueue({ type: "build", playerId: "p1", kind: "tower", x: 8, z: 8 });
    sim.step(DT);
    const t = s.towers[0];
    expect(t.kind).toBe("crossbow");
    sim.enqueue({ type: "upgradeTower", playerId: "p1", towerId: t.id, to: "cannon" });
    sim.step(DT);
    expect(t.kind).toBe("cannon");
    // Un tun nu se mai transformă.
    sim.enqueue({ type: "upgradeTower", playerId: "p1", towerId: t.id, to: "tesla" });
    sim.enqueue({ type: "upgradeTower", playerId: "p1", towerId: t.id });
    sim.step(DT);
    expect(t.kind).toBe("cannon");
    expect(t.level).toBe(2);
    // Nivelul 3 cere deblocare.
    sim.enqueue({ type: "upgradeTower", playerId: "p1", towerId: t.id });
    sim.step(DT);
    expect(t.level).toBe(2);
    s.players.p1.towerTier = 3;
    sim.enqueue({ type: "upgradeTower", playerId: "p1", towerId: t.id });
    sim.step(DT);
    expect(t.level).toBe(3);
  });

  it("proiectilele zboară și lovesc la sosire", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    s.towers.push(tower(800, 8, 8));
    const z = dummy(sim, "brute", 16, 8);
    sim.step(DT);
    expect(s.shells.length).toBe(1);
    expect(z.hp).toBe(z.maxHp);
    run(sim, 0.5);
    expect(z.hp).toBeLessThan(z.maxHp);
  });

  it("zombiul lovit de turn atacă turnul", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    s.towers.push(tower(800, 15, 15));
    const z = dummy(sim, "walker", 22, 15);
    run(sim, 1);
    expect(z.aggroTowerId).toBe(800);
    run(sim, 6);
    expect(s.towers[0]?.hp ?? 0).toBeLessThan(towerStats("crossbow", 1).hp);
  });

  it("turnul distrus dispare și zombii merg mai departe spre mină", () => {
    const sim = newGame();
    const s = sim.state;
    s.towers.push({ ...tower(800, 15, 15), hp: 5 });
    const z = dummy(sim, "walker", 16.5, 15);
    z.aggroTowerId = 800;
    run(sim, 2);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === "towerDestroyed")).toBe(true);
    expect(s.towers.length).toBe(0);
    expect(z.aggroTowerId).toBeNull();
  });

  it("turnul de gheață încetinește zombii cu 30% și îi poate îngheța", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    s.towers.push({ ...tower(800, 10, 10, "frost"), abilityTimer: 0 });
    const z = dummy(sim, "walker", 14, 10);
    sim.step(DT);
    expect(z.chillTimer).toBeGreaterThan(0);
    expect(z.frozenTimer).toBeGreaterThan(0);
  });

  it("două turnuri de gheață nu țin un zombie înghețat la nesfârșit", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    s.towers.push({ ...tower(800, 10, 10, "frost"), abilityTimer: 0 });
    const z = dummy(sim, "walker", 12, 10);
    sim.step(DT);
    expect(z.frozenTimer).toBeGreaterThan(0);
    // Al doilea turn de gheață își folosește nova chiar când primul îngheț se termină: e imun.
    run(sim, CONFIG.tower.abilities.freezeDuration + 0.1);
    expect(z.frozenTimer).toBeLessThanOrEqual(0);
    s.towers.push({ ...tower(801, 14, 10, "frost"), abilityTimer: 0 });
    sim.step(DT);
    expect(z.frozenTimer).toBeLessThanOrEqual(0);
  });

  it("noaptea, vânzarea unui turn dă doar jumătate; viscolul scurtează raza (nu și la Tesla)", () => {
    const sim = newGame();
    const s = sim.state;
    const t = tower(800, 8, 8);
    s.towers.push(t);
    s.phase = "day";
    const day = towerRefund(s, t);
    s.phase = "night";
    expect(towerRefund(s, t)).toBe(Math.floor(day / 2));
    s.weather = "blizzard";
    expect(effectiveTowerStats(s, t).range).toBeLessThan(towerStats("crossbow", 1).range);
    const tesla = tower(801, -8, -8, "tesla");
    expect(effectiveTowerStats(s, tesla).range).toBe(towerStats("tesla", 1).range);
  });

  it("pe Nightmare turnurile fac mai puțin damage", () => {
    const sim = new GameSimulation({ players: [{ id: "p1", heroClass: "assault" }], seed: 1, difficulty: "nightmare" });
    expect(effectiveTowerStats(sim.state, tower(800, 8, 8)).damage).toBeLessThan(towerStats("crossbow", 1).damage);
  });

  it("tunul lasă foc pe jos, Tesla trage laser prin mai mulți zombi", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    s.towers.push({ ...tower(800, 10, 10, "cannon"), abilityTimer: 0 });
    dummy(sim, "brute", 16, 10);
    run(sim, 1);
    expect(s.fires.length).toBe(1);

    const sim2 = newGame();
    sim2.state.heroes[0].pos = { x: -38, z: -38 };
    sim2.state.towers.push({ ...tower(801, -10, -10, "tesla"), abilityTimer: 0 });
    const a = dummy(sim2, "brute", -6, -10);
    const b = dummy(sim2, "brute", -3, -10);
    sim2.step(DT);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it("boss-ul învins lasă un cufăr; îl împuști și primești ceva rar", () => {
    const sim = newGame();
    const s = sim.state;
    const boss = dummy(sim, "boss", 6, 0, 10);
    s.heroes[0].pos = { x: 0, z: -3 };
    sim.enqueue({ type: "aim", playerId: "p1", x: 1, z: 0.5, firing: true, auto: true });
    run(sim, 0.4);
    expect(s.zombies.includes(boss)).toBe(false);
    expect(s.chests.length).toBe(1);
    expect(s.chests[0].openedFor).toBeNull();
    // Cufărul se deschide trăgând în el.
    s.heroes[0].pos = { x: s.chests[0].pos.x - 4, z: s.chests[0].pos.z };
    s.heroes[0].reserve = 100;
    sim.drainEvents();
    const events: ReturnType<typeof sim.drainEvents> = [];
    for (let i = 0; i < 120; i++) {
      sim.enqueue({ type: "aim", playerId: "p1", x: 1, z: 0, firing: true, auto: false });
      sim.step(DT);
      events.push(...sim.drainEvents());
    }
    const opened = events.find((e) => e.type === "chestOpened");
    expect(opened && opened.type === "chestOpened" && ["epic", "legendary"].includes(opened.rarity)).toBe(true);
    expect(s.players.p1.inventory.cookedMeat).toBeGreaterThan(0);
  });
});

describe("muniție și ziduri", () => {
  it("reîncărcarea ia gloanțe din rezervă; fără rezervă nu mai tragi", () => {
    const sim = newGame();
    const h = sim.state.heroes[0];
    const mag = h.ammo;
    expect(h.reserve).toBe(mag * CONFIG.ammo.startMagazines);
    h.ammo = 0;
    h.reserve = 5;
    sim.enqueue({ type: "reload", playerId: "p1" });
    run(sim, 3);
    expect(h.ammo).toBe(5);
    expect(h.reserve).toBe(0);
    h.ammo = 0;
    sim.enqueue({ type: "reload", playerId: "p1" });
    sim.step(DT);
    expect(sim.drainEvents().some((e) => e.type === "noAmmo")).toBe(true);
  });

  it("zidul dărâmat rămâne pe loc și se ridică la loc când e reparat", () => {
    const sim = newGame();
    const s = sim.state;
    s.barricades.push({ id: 999, ownerId: "p1", pos: { x: 0, z: 10 }, rotation: 0, level: 1, door: false, broken: false, hp: 5, maxHp: 250 });
    const z = dummy(sim, "brute", 0, 11.2);
    z.attackTimer = 0;
    run(sim, 0.5);
    const b = s.barricades[0];
    expect(b.broken).toBe(true);
    s.zombies.length = 0;
    s.heroes[0].pos = { x: 0, z: 8.6 };
    s.heroes[0].heroClass = "tank";
    run(sim, 6);
    expect(b.broken).toBe(false);
  });

  it("kill-urile se numără pe jucător", () => {
    const sim = newGame();
    dummy(sim, "walker", 10, 4, 1);
    sim.state.heroes[0].pos = { x: 10, z: -3 };
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: 1, firing: true, auto: true });
    run(sim, 1);
    expect(sim.state.players.p1.kills).toBe(1);
  });
});

describe("supraviețuire", () => {
  const survival = () => new GameSimulation({ players: [{ id: "p1", heroClass: "assault" }], seed: 3, mode: "survival" });

  it("foamea și frigul scad; lângă foc te încălzești", () => {
    const sim = survival();
    const h = sim.state.heroes[0];
    h.pos = { x: 20, z: -20 };
    run(sim, 10);
    expect(h.hunger).toBeLessThan(100);
    expect(h.warmth).toBeLessThan(100);
    const cold = h.warmth;
    h.pos = { x: sim.state.campfires[0].pos.x, z: sim.state.campfires[0].pos.z + 1.3 }; // lângă focul de start
    run(sim, 3);
    expect(h.warmth).toBeGreaterThan(cold);
  });

  it("carnea crudă se gătește pe foc în 15 s și apare pe jos", () => {
    const sim = survival();
    const s = sim.state;
    s.players.p1.inventory.rawMeat = 1;
    s.heroes[0].pos = { x: s.campfires[0].pos.x, z: s.campfires[0].pos.z + 1.3 };
    sim.enqueue({ type: "useItem", playerId: "p1", item: "rawMeat" });
    sim.step(DT);
    expect(s.campfires[0].cooking.length).toBe(1);
    run(sim, CONFIG.survival.cookTime + 0.2);
    expect(s.drops.some((d) => d.kind === "cookedMeat")).toBe(true);
  });

  it("vânezi o căprioară și primești carne", () => {
    const sim = survival();
    const s = sim.state;
    s.heroes[0].pos = { x: 10, z: 10 };
    s.animals.push({ id: 700, kind: "deer", pos: { x: 10, z: 14 }, facing: 0, hp: 40, maxHp: 40, goal: { x: 10, z: 14 }, timer: 99, attackTimer: 0, farmId: null });
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: 1, firing: true, auto: true });
    run(sim, 1.5);
    expect(s.animals.some((a) => a.id === 700)).toBe(false);
    expect(s.drops.some((d) => d.kind === "rawMeat")).toBe(true);
  });

  it("zombii vânează eroul, nu mina; dacă eroul cade, jocul se termină", () => {
    const sim = survival();
    const s = sim.state;
    s.heroes[0].pos = { x: 25, z: 25 };
    const z = dummy(sim, "walker", 10, 10);
    const d0 = Math.hypot(z.pos.x - 25, z.pos.z - 25);
    run(sim, 2);
    expect(Math.hypot(z.pos.x - 25, z.pos.z - 25)).toBeLessThan(d0);
    s.heroes[0].hp = 1;
    s.heroes[0].hunger = 0;
    run(sim, 2);
    expect(s.phase).toBe("gameover");
  });

  it("focul și ferma se construiesc doar în Supraviețuire", () => {
    const sim = survival();
    sim.state.players.p1.wood = 200;
    sim.enqueue({ type: "build", playerId: "p1", kind: "campfire", x: 10, z: -10 });
    sim.enqueue({ type: "build", playerId: "p1", kind: "farmChicken", x: -10, z: -10 });
    sim.step(DT);
    expect(sim.state.campfires.length).toBe(2);
    expect(sim.state.farms.length).toBe(1);
    const def = newGame();
    def.state.players.p1.wood = 200;
    def.enqueue({ type: "build", playerId: "p1", kind: "campfire", x: 10, z: -10 });
    def.step(DT);
    expect(def.state.campfires.length).toBe(0);
  });
});

describe("dificultate", () => {
  it("Nightmare are mai mulți zombi și mai puternici decât Easy", () => {
    expect(waveComposition(5, 1, "nightmare").length).toBeGreaterThan(waveComposition(5, 1, "easy").length);
    const easy = new GameSimulation({ players: [{ id: "p1", heroClass: "assault" }], seed: 1, difficulty: "easy" });
    const hard = new GameSimulation({ players: [{ id: "p1", heroClass: "assault" }], seed: 1, difficulty: "nightmare" });
    easy.state.wave = hard.state.wave = 1;
    expect(spawnZombie(hard.state, "walker").maxHp).toBeGreaterThan(spawnZombie(easy.state, "walker").maxHp);
  });

  it("numele jucătorului vine din meniu", () => {
    const sim = new GameSimulation({ players: [{ id: "p1", heroClass: "tank", name: "Ion" }] });
    expect(sim.state.players.p1.name).toBe("Ion");
  });
});

describe("construcții", () => {
  it("turnul costă lemn și respectă sloturile", () => {
    const sim = newGame();
    sim.state.players.p1.wood = 1000;
    const spots = [{ x: 7, z: 0 }, { x: -7, z: 0 }, { x: 0, z: 7 }, { x: 0, z: -8 }];
    for (const p of spots) sim.enqueue({ type: "build", playerId: "p1", kind: "tower", ...p });
    sim.step(DT);
    const slots = towerSlots(sim.state, "p1");
    expect(sim.state.towers.length).toBe(slots);
    expect(sim.state.players.p1.wood).toBe(1000 - slots * CONFIG.tower.kinds.crossbow.cost);
    expect(canBuildTower(sim.state, "p1", { x: 0, z: 0 })).not.toBeNull();
  });

  it("turnurile trag singure în zombii din rază", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    sim.enqueue({ type: "build", playerId: "p1", kind: "tower", x: 8, z: 8 });
    sim.step(DT);
    const z = dummy(sim, "brute", 12, 12);
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      sim.step(DT);
      shots += sim.drainEvents().filter((e) => e.type === "towerFired").length;
    }
    expect(shots).toBeGreaterThan(0);
    expect(z.hp).toBeLessThan(z.maxHp);
  });

  it("nu poți trece prin turnuri", () => {
    const sim = newGame();
    const s = sim.state;
    s.towers.push(tower(800, 10, 0));
    s.heroes[0].pos = { x: 7, z: 0 };
    sim.enqueue({ type: "move", playerId: "p1", x: 1, z: 0 });
    run(sim, 1.5);
    expect(s.heroes[0].pos.x).toBeLessThan(10);
  });

  it("zidurile se lipesc cap la cap și nu se suprapun", () => {
    const sim = newGame();
    const s = sim.state;
    sim.enqueue({ type: "build", playerId: "p1", kind: "barricade", x: 8, z: 8, rotation: 0 });
    sim.step(DT);
    const first = s.barricades[0];
    const near = nextInChain(first);
    const snapped = snapBarricade(s, { x: near.x + 0.4, z: near.z + 0.3 }, 0);
    expect(snapped.x).toBeCloseTo(near.x);
    expect(snapped.z).toBeCloseTo(near.z);
    expect(barricadeSpotProblem(s, snapped, 0)).toBeNull();
    expect(barricadeSpotProblem(s, { x: 8.3, z: 8 }, 0)).not.toBeNull();
    const [, end] = segmentEnds(first.pos, first.rotation, CONFIG.barricade.length);
    const corner = snapBarricade(s, { x: end.x + 0.2, z: end.z + 1.3 }, Math.PI / 2);
    expect(barricadeSpotProblem(s, corner, Math.PI / 2)).toBeNull();
  });

  it("zidul se poate muta, roti, întări și transforma în ușă", () => {
    const sim = newGame();
    const s = sim.state;
    s.players.p1.wood = 500;
    sim.enqueue({ type: "build", playerId: "p1", kind: "barricade", x: 8, z: 8, rotation: 0 });
    sim.step(DT);
    const id = s.barricades[0].id;
    sim.enqueue({ type: "moveBarricade", playerId: "p1", barricadeId: id, x: -8, z: 9, rotation: 1 });
    sim.enqueue({ type: "upgradeBarricade", playerId: "p1", barricadeId: id, to: "reinforce" });
    sim.enqueue({ type: "upgradeBarricade", playerId: "p1", barricadeId: id, to: "door" });
    sim.step(DT);
    const b = s.barricades[0];
    expect(b.pos).toEqual({ x: -8, z: 9 });
    expect(b.level).toBe(2);
    expect(b.door).toBe(true);
  });

  it("eroii trec prin uși, dar nu prin ziduri", () => {
    const sim = newGame();
    const s = sim.state;
    const hero = s.heroes[0];
    s.barricades.push({ id: 900, ownerId: "p1", pos: { x: 10, z: 0 }, rotation: Math.PI / 2, level: 1, door: false, broken: false, hp: 250, maxHp: 250 });
    hero.pos = { x: 8, z: 0 };
    sim.enqueue({ type: "move", playerId: "p1", x: 1, z: 0 });
    run(sim, 1);
    expect(hero.pos.x).toBeLessThan(10);
    s.barricades[0].door = true;
    run(sim, 1);
    expect(hero.pos.x).toBeGreaterThan(10.5);
  });

  it("mina explodează când trece un zombie", () => {
    const sim = newGame();
    const s = sim.state;
    s.players.p1.mines = 1;
    s.heroes[0].pos = { x: 10, z: 10 };
    sim.enqueue({ type: "placeMine", playerId: "p1" });
    sim.step(DT);
    expect(s.mines.length).toBe(1);
    s.heroes[0].pos = { x: -38, z: -38 };
    const z = dummy(sim, "brute", 10.5, 10);
    run(sim, CONFIG.mines.armTime + 0.2);
    expect(s.mines.length).toBe(0);
    expect(z.hp).toBeLessThan(z.maxHp);
  });
});

describe("magazin", () => {
  it("șansele însumează 100% și includ „nimic”", () => {
    const sum = CONFIG.shop.odds.reduce((a, o) => a + o.chance, 0);
    expect(sum).toBeCloseTo(1);
    expect(rollRarity(0)).toBe("nothing");
    expect(rollRarity(0.5)).toBe("common");
    expect(rollRarity(0.995)).toBe("legendary");
  });

  it("o încercare costă monede și dă un rezultat", () => {
    const sim = newGame();
    sim.state.players.p1.coins = CONFIG.shop.cost;
    sim.enqueue({ type: "shopRoll", playerId: "p1" });
    sim.step(DT);
    expect(sim.state.players.p1.coins).toBe(0);
    expect(sim.drainEvents().some((e) => e.type === "shopRoll")).toBe(true);
  });

  it("premiile (în afară de lemn și mine) se câștigă o singură dată pe rundă", () => {
    const sim = newGame("assault", 7);
    const p = sim.state.players.p1;
    p.coins = CONFIG.shop.cost * 300;
    for (let i = 0; i < 300; i++) sim.enqueue({ type: "shopRoll", playerId: "p1" });
    sim.step(DT);
    const won = sim
      .drainEvents()
      .filter((e) => e.type === "shopRoll")
      .map((e) => (e.type === "shopRoll" ? e.reward : null)!)
      .filter((r) => !REPEATABLE.includes(r.kind))
      .map(rewardKey);
    expect(new Set(won).size).toBe(won.length);
    expect(p.weapon).not.toBe("rusty");
  });
});

describe("unelte: târnăcop, pescuit, vânzare", () => {
  const near = (sim: GameSimulation, x: number, z: number) => {
    sim.state.heroes[0].pos = { x, z };
  };
  /** Unealta din mână (butonul principal o folosește). */
  const hold = (sim: GameSimulation, tool: "pickaxe" | "rod" | "lantern" | "gun") => {
    sim.state.players.p1.tool = tool;
  };

  it("lovești un brad cu târnăcopul: +1 lemn pe lovitură, cade după 50", () => {
    const sim = newGame();
    const s = sim.state;
    const t = GAME_MAP.trees[0];
    near(sim, t.pos.x + t.radius + 0.8, t.pos.z);
    hold(sim, "pickaxe");
    const wood = s.players.p1.wood;
    sim.enqueue({ type: "action", playerId: "p1", on: true });
    // Lovituri la 0,7 s: în 2,05 s = 3 lovituri (la 0; 0,7; 1,4).
    run(sim, 2.05);
    expect(s.treeHits[0]).toBe(3);
    expect(s.players.p1.wood).toBe(wood + 3);
    s.treeHits[0] = 49;
    const events: GameEvent[] = [];
    for (let i = 0; i < 40; i++) {
      sim.step(DT);
      events.push(...sim.drainEvents());
    }
    expect(s.treeHits[0]).toBe(50);
    expect(events.some((e) => e.type === "treeFelled")).toBe(true);
    // Tăiat: nu mai e obstacol (poți construi sau trece pe acolo).
    expect(treeFelled(s, 0)).toBe(true);
  });

  it("zăcământul de aur se sparge și dă monede", () => {
    const sim = newGame();
    const s = sim.state;
    s.ores = [{ id: 999, kind: "gold", pos: { x: 12, z: 12 }, hits: 2 }];
    near(sim, 13.2, 12);
    hold(sim, "pickaxe");
    sim.enqueue({ type: "action", playerId: "p1", on: true });
    run(sim, 1.2);
    expect(s.ores.length).toBe(0);
    expect(s.players.p1.coins).toBe(CONFIG.gather.ore.gold.coins);
  });

  it("pescuiești de pe malul bălții: peștele agățat trebuie tras de mai multe ori, apoi îl vinzi", () => {
    const sim = newGame();
    const s = sim.state;
    const p = GAME_MAP.pond;
    near(sim, p.pos.x + p.radius + 0.8, p.pos.z);
    hold(sim, "rod");
    const tap = () => {
      sim.enqueue({ type: "action", playerId: "p1", on: true });
      sim.step(DT);
      sim.enqueue({ type: "action", playerId: "p1", on: false });
      sim.step(DT);
    };
    tap();
    expect(s.heroes[0].fishTimer).toBeGreaterThan(0);
    // Mușcă: se agață un pește (de obicei biban).
    s.heroes[0].fishTimer = 0.05;
    run(sim, 0.2);
    const fish = s.heroes[0].hooked!;
    expect(fish).not.toBeNull();
    const pulls = CONFIG.gather.fish[fish].pulls;
    for (let i = 0; i < pulls - 1; i++) tap();
    expect(s.players.p1.inventory[fish]).toBe(0); // încă se zbate
    tap();
    expect(s.players.p1.inventory[fish]).toBe(1);
    // Lângă tarabă peștele se vinde singur.
    const tr = GAME_MAP.trader.pos;
    near(sim, tr.x + 2, tr.z + 1);
    sim.step(DT);
    expect(s.players.p1.inventory[fish]).toBe(0);
    expect(s.players.p1.coins).toBe(CONFIG.gather.fish[fish].price);
  });

  it("peștele scapă dacă nu tragi destul de repede", () => {
    const sim = newGame();
    const s = sim.state;
    const p = GAME_MAP.pond;
    near(sim, p.pos.x + p.radius + 0.8, p.pos.z);
    hold(sim, "rod");
    sim.enqueue({ type: "action", playerId: "p1", on: true });
    sim.step(DT);
    sim.enqueue({ type: "action", playerId: "p1", on: false });
    s.heroes[0].fishTimer = 0.05;
    run(sim, 0.2);
    expect(s.heroes[0].hooked).not.toBeNull();
    run(sim, 4);
    expect(s.heroes[0].hooked).toBeNull();
  });

  it("găinile se pot tăia pentru carne; căprioara lasă și aur", () => {
    const sim = newGame();
    const s = sim.state;
    s.animals.push({ id: 900, kind: "chicken", pos: { x: 10, z: 10 }, facing: 0, hp: 8, maxHp: 8, goal: { x: 10, z: 10 }, timer: 99, attackTimer: 0, farmId: null });
    near(sim, 11, 10);
    hold(sim, "pickaxe");
    sim.enqueue({ type: "action", playerId: "p1", on: true });
    sim.step(DT);
    expect(s.animals.some((a) => a.id === 900)).toBe(false);
    // Carnea cade lângă tine și o iei pe loc.
    expect(s.players.p1.inventory.rawMeat + s.drops.filter((d) => d.kind === "rawMeat").length).toBeGreaterThan(0);
    sim.enqueue({ type: "action", playerId: "p1", on: false });
    run(sim, 0.5); // târnăcopul are nevoie de 0,4 s între lovituri
    s.animals.push({ id: 901, kind: "deer", pos: { x: -10, z: 10 }, facing: 0, hp: 1, maxHp: 40, goal: { x: -10, z: 10 }, timer: 99, attackTimer: 0, farmId: null });
    near(sim, -11, 10);
    sim.enqueue({ type: "action", playerId: "p1", on: true });
    sim.step(DT);
    run(sim, 0.5);
    expect(s.players.p1.coins).toBe(CONFIG.animals.deer.coins);
  });
});

describe("moarte și reînviere", () => {
  it("singur: dacă mori, jocul se termină (nu mai reînvii)", () => {
    const sim = newGame();
    sim.state.heroes[0].hp = 1;
    sim.state.heroes[0].alive = false;
    sim.step(DT);
    expect(sim.state.phase).toBe("gameover");
  });

  it("în echipă: un coleg care stă lângă tine te ridică", () => {
    const sim = new GameSimulation({ players: [{ id: "p1", heroClass: "assault" }, { id: "p2", heroClass: "tank" }], seed: 3 });
    const [a, b] = sim.state.heroes;
    a.alive = false;
    a.hp = 0;
    b.pos = { x: a.pos.x + 1, z: a.pos.z };
    run(sim, CONFIG.heroCommon.reviveTime + 0.2);
    expect(sim.state.phase).not.toBe("gameover");
    expect(a.alive).toBe(true);
    expect(a.hp).toBe(Math.round(a.maxHp * CONFIG.heroCommon.reviveHp));
  });
});

describe("prețuri", () => {
  it("turnul costă 50 lemn, zidurile 5 / 10 / 20 (lemn → forjat → metal)", () => {
    expect(CONFIG.tower.kinds.crossbow.cost).toBe(50);
    expect(CONFIG.barricade.levels.map((l) => l.cost)).toEqual([5, 10, 20]);
  });
});

describe("bara rapidă", () => {
  it("pui ce vrei în fiecare loc; armele doar dacă le ai; târnăcopul îl iei în mână", () => {
    const sim = newGame();
    const p = sim.state.players.p1;
    expect(p.hotbar.length).toBe(4);
    sim.enqueue({ type: "setSlot", playerId: "p1", slot: 1, item: "weapon:hunting" });
    sim.step(DT);
    expect(p.hotbar[1]).not.toBe("weapon:hunting"); // n-o ai
    p.weapons.push("hunting");
    sim.enqueue({ type: "setSlot", playerId: "p1", slot: 1, item: "weapon:hunting" });
    sim.enqueue({ type: "setSlot", playerId: "p1", slot: 3, item: "pickaxe" });
    sim.step(DT);
    expect(p.hotbar[1]).toBe("weapon:hunting");
    expect(p.hotbar[3]).toBe("pickaxe");
    // Nu stă de două ori în bară: locul vechi primește ce era în locul nou.
    expect(p.hotbar.filter((x) => x === "pickaxe").length).toBe(1);
    sim.enqueue({ type: "useSlot", playerId: "p1", slot: 1 });
    sim.step(DT);
    expect(p.weapon).toBe("hunting");
    sim.enqueue({ type: "useSlot", playerId: "p1", slot: 3 });
    sim.step(DT);
    expect(p.tool).toBe("pickaxe");
  });
});

describe("unelte în mână", () => {
  it("butonul principal: cu târnăcopul lovește (și în gol), nu trage; lanterna se aprinde și consumă bateria", () => {
    const sim = newGame();
    const s = sim.state;
    const h = s.heroes[0];
    h.pos = { x: 0, z: -6 };
    s.players.p1.tool = "pickaxe";
    const ammo = h.ammo;
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: -1, firing: true, auto: false });
    const events: GameEvent[] = [];
    for (let i = 0; i < 10; i++) {
      sim.step(DT);
      events.push(...sim.drainEvents());
    }
    expect(h.ammo).toBe(ammo);
    expect(events.some((e) => e.type === "toolHit" && e.target === "air")).toBe(true);
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: -1, firing: false, auto: false });
    s.players.p1.tool = "lantern";
    sim.step(DT);
    sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: -1, firing: true, auto: false });
    sim.step(DT);
    expect(h.lantern).toBe(true);
    run(sim, 10);
    expect(h.battery).toBeLessThan(100);
  });
});
