import { describe, expect, it } from "vitest";
import { CONFIG, type HeroClass } from "./config";
import { GameSimulation } from "./Game";
import { REPEATABLE, rewardKey } from "./items";
import { segmentEnds } from "./math";
import { barricadeSpotProblem, nextInChain, snapBarricade } from "./systems/barricades";
import { gunStats } from "./systems/heroes";
import { rollRarity } from "./systems/shop";
import { canBuildTower, towerSlots, towerStats } from "./systems/towers";
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
    s.barricades.push({ id: 999, ownerId: "p1", pos: { x: 0, z: 10 }, rotation: 0, level: 1, door: false, hp: 250, maxHp: 250 });
    const z = dummy(sim, "walker", 0, 14, 100);
    run(sim, 5);
    expect(z.pos.z).toBeGreaterThan(10);
    expect(s.barricades[0].hp).toBeLessThan(250);
  });

  it("zburătorii trec peste ziduri", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    s.barricades.push({ id: 999, ownerId: "p1", pos: { x: 0, z: 10 }, rotation: 0, level: 1, door: false, hp: 250, maxHp: 250 });
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

  it("boss-ul învins lasă un cufăr cu ceva rar", () => {
    const sim = newGame();
    const s = sim.state;
    const boss = dummy(sim, "boss", 6, 0, 10);
    s.heroes[0].pos = { x: 0, z: -3 };
    sim.enqueue({ type: "aim", playerId: "p1", x: 1, z: 0.5, firing: true, auto: true });
    run(sim, 1);
    expect(s.zombies.includes(boss)).toBe(false);
    expect(s.chests.length).toBe(1);
    s.heroes[0].pos = { ...s.chests[0].pos };
    sim.drainEvents();
    sim.step(DT);
    const opened = sim.drainEvents().find((e) => e.type === "chestOpened");
    expect(opened && opened.type === "chestOpened" && ["epic", "legendary"].includes(opened.rarity)).toBe(true);
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
    s.barricades.push({ id: 900, ownerId: "p1", pos: { x: 10, z: 0 }, rotation: Math.PI / 2, level: 1, door: false, hp: 250, maxHp: 250 });
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
