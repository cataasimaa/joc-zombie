import { describe, expect, it } from "vitest";
import { CONFIG, type HeroClass } from "./config";
import { GameSimulation } from "./Game";
import { segmentEnds } from "./math";
import { abilityBlockedReason } from "./systems/abilities";
import { barricadeSpotProblem, nextInChain, snapBarricade } from "./systems/barricades";
import { rollRarity } from "./systems/shop";
import { canBuildTower, towerSlots } from "./systems/towers";
import { nightDuration, waveComposition } from "./systems/waves";
import { spawnZombie } from "./systems/zombies";

const DT = 1 / CONFIG.tickRate;

function newGame(heroClass: HeroClass = "assault", seed = 1) {
  return new GameSimulation({ players: [{ id: "p1", heroClass }], seed });
}

function run(sim: GameSimulation, seconds: number) {
  for (let t = 0; t < seconds; t += DT) sim.step(DT);
}

describe("zi și noapte", () => {
  it("pornește ziua, iar noaptea vine după prima zi", () => {
    const sim = newGame();
    expect(sim.state.phase).toBe("day");
    run(sim, CONFIG.waves.firstDay + 0.1);
    expect(sim.state.phase).toBe("night");
    expect(sim.state.wave).toBe(1);
  });

  it("startNightNow sare peste zi", () => {
    const sim = newGame();
    sim.enqueue({ type: "startNightNow", playerId: "p1" });
    sim.step(DT);
    expect(sim.state.phase).toBe("night");
  });

  it("nopțile devin tot mai lungi", () => {
    expect(nightDuration(5)).toBeGreaterThan(nightDuration(1));
    expect(nightDuration(10)).toBeGreaterThan(nightDuration(5));
  });

  it("valurile cresc, au tipuri noi de zombi și boss la nopțile 5 și 10", () => {
    expect(waveComposition(2, 1).length).toBeGreaterThan(waveComposition(1, 1).length);
    expect(waveComposition(1, 1)).not.toContain("runner");
    expect(waveComposition(3, 1)).toContain("runner");
    expect(waveComposition(5, 1)).toContain("brute");
    expect(waveComposition(5, 1).at(-1)).toBe("boss");
    expect(waveComposition(10, 1).at(-1)).toBe("boss");
    expect(waveComposition(6, 1)).not.toContain("boss");
    expect(waveComposition(1, 4).length).toBeGreaterThan(waveComposition(1, 1).length);
  });

  it("în zori zombii rămași fug, iar jucătorul primește lemn", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    sim.enqueue({ type: "startNightNow", playerId: "p1" });
    sim.step(DT);
    run(sim, 5);
    const wood = s.players.p1.wood;
    s.phaseTimer = 0.01;
    sim.step(DT);
    expect(s.phase).toBe("day");
    expect(s.players.p1.wood).toBeGreaterThan(wood);
    expect(s.zombies.every((z) => z.fleeing)).toBe(true);
    run(sim, 30);
    expect(s.zombies.length).toBe(0);
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
    expect(sim.state.shelter.hp).toBe(0);
  });

  it("eroul omoară zombii, care lasă monede, și primește XP", () => {
    const sim = newGame("assault", 3);
    sim.enqueue({ type: "startNightNow", playerId: "p1" });
    run(sim, 40);
    const hero = sim.state.heroes[0];
    expect(hero.xp + (hero.level - 1) * 100).toBeGreaterThan(0);
    const coinsOnGround = sim.state.coins.reduce((a, c) => a + c.value, 0);
    expect(coinsOnGround + sim.state.players.p1.coins).toBeGreaterThan(0);
  });

  it("baricadele blochează zombii, care le atacă", () => {
    const sim = newGame();
    const s = sim.state;
    s.heroes[0].pos = { x: -38, z: -38 };
    s.barricades.push({ id: 999, ownerId: "p1", pos: { x: 0, z: 10 }, rotation: 0, level: 1, door: false, hp: 300, maxHp: 300 });
    s.wave = 1;
    const z = spawnZombie(s, "walker");
    z.pos = { x: 0, z: 14 };
    run(sim, 5);
    expect(s.zombies[0].pos.z).toBeGreaterThan(10);
    expect(s.barricades[0].hp).toBeLessThan(300);
  });

  it("e deterministă: același seed + aceleași comenzi = aceeași stare", () => {
    const a = newGame("sniper", 99);
    const b = newGame("sniper", 99);
    for (const sim of [a, b]) {
      sim.enqueue({ type: "startNightNow", playerId: "p1" });
      sim.enqueue({ type: "move", playerId: "p1", x: 1, z: 0 });
      run(sim, 20);
    }
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
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
    expect(sim.state.players.p1.wood).toBe(1000 - slots * CONFIG.tower.tiers[0].cost);
    expect(canBuildTower(sim.state, "p1", { x: 0, z: 0 })).not.toBeNull();
  });

  it("zidurile se lipesc cap la cap și nu se suprapun", () => {
    const sim = newGame();
    const s = sim.state;
    sim.enqueue({ type: "build", playerId: "p1", kind: "barricade", x: 8, z: 8, rotation: 0 });
    sim.step(DT);
    const first = s.barricades[0];
    // Al doilea zid, pus puțin alături de capăt, e tras exact la capăt.
    const near = nextInChain(first);
    const snapped = snapBarricade(s, { x: near.x + 0.4, z: near.z + 0.3 }, 0);
    expect(snapped.x).toBeCloseTo(near.x);
    expect(snapped.z).toBeCloseTo(near.z);
    expect(barricadeSpotProblem(s, snapped, 0)).toBeNull();
    // Peste primul zid nu se poate.
    expect(barricadeSpotProblem(s, { x: 8.3, z: 8 }, 0)).not.toBeNull();
    // În unghi drept, lipit la capăt, se poate (colț de zid).
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
    expect(b.rotation).toBe(1);
    expect(b.level).toBe(2);
    expect(b.maxHp).toBe(CONFIG.barricade.levels[1].maxHp);
    expect(b.door).toBe(true);
  });

  it("eroii trec prin uși, dar nu prin ziduri", () => {
    const sim = newGame();
    const s = sim.state;
    const hero = s.heroes[0];
    s.barricades.push({ id: 900, ownerId: "p1", pos: { x: 10, z: 0 }, rotation: Math.PI / 2, level: 1, door: false, hp: 300, maxHp: 300 });
    hero.pos = { x: 8, z: 0 };
    sim.enqueue({ type: "move", playerId: "p1", x: 1, z: 0 });
    run(sim, 1);
    expect(hero.pos.x).toBeLessThan(10);
    s.barricades[0].door = true;
    run(sim, 1);
    expect(hero.pos.x).toBeGreaterThan(10.5);
  });

  it("upgrade de turn doar cu tier-ul deblocat", () => {
    const sim = newGame();
    const s = sim.state;
    s.players.p1.wood = 1000;
    sim.enqueue({ type: "build", playerId: "p1", kind: "tower", x: 7, z: 0 });
    sim.step(DT);
    const id = s.towers[0].id;
    sim.enqueue({ type: "upgradeTower", playerId: "p1", towerId: id });
    sim.step(DT);
    expect(s.towers[0].tier).toBe(1);
    s.players.p1.towerTier = 3;
    sim.enqueue({ type: "upgradeTower", playerId: "p1", towerId: id });
    sim.enqueue({ type: "upgradeTower", playerId: "p1", towerId: id });
    sim.enqueue({ type: "upgradeTower", playerId: "p1", towerId: id });
    sim.step(DT);
    expect(s.towers[0].tier).toBe(3);
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
    s.wave = 1;
    const z = spawnZombie(s, "brute");
    z.pos = { x: 10.5, z: 10 };
    run(sim, CONFIG.mines.armTime + 0.2);
    expect(s.mines.length).toBe(0);
    expect(z.hp).toBeLessThan(z.maxHp);
  });
});

describe("abilități", () => {
  it("ultimate-ul e blocat până la nivelul cerut", () => {
    const sim = newGame("assault");
    const hero = sim.state.heroes[0];
    expect(abilityBlockedReason(sim.state, hero, 3)).not.toBeNull();
    hero.level = CONFIG.ultLevel;
    expect(abilityBlockedReason(sim.state, hero, 3)).toBeNull();
  });

  it("grenada face damage în zonă și pornește cooldown-ul", () => {
    const sim = newGame("assault");
    const s = sim.state;
    s.wave = 1;
    const a = spawnZombie(s, "brute");
    const b = spawnZombie(s, "brute");
    a.pos = { x: 6, z: 6 };
    b.pos = { x: 7, z: 6 };
    sim.enqueue({ type: "useAbility", playerId: "p1", slot: 0 });
    sim.step(DT);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(s.heroes[0].cooldowns[0]).toBeGreaterThan(0);
  });

  it("Tank: provocarea face zombii să-l atace pe el", () => {
    const sim = newGame("tank");
    const s = sim.state;
    s.wave = 1;
    const z = spawnZombie(s, "walker");
    z.pos = { x: 8, z: -8 };
    sim.enqueue({ type: "useAbility", playerId: "p1", slot: 0 });
    sim.step(DT);
    expect(z.tauntHeroId).toBe(s.heroes[0].id);
  });

  it("Healer: reînvie un coleg căzut", () => {
    const sim = new GameSimulation({
      players: [{ id: "p1", heroClass: "healer" }, { id: "p2", heroClass: "tank" }],
      seed: 5,
    });
    const [healer, tank] = sim.state.heroes;
    tank.alive = false;
    tank.hp = 0;
    tank.respawnTimer = 10;
    tank.pos = { x: healer.pos.x + 2, z: healer.pos.z };
    sim.enqueue({ type: "useAbility", playerId: "p1", slot: 2 });
    sim.step(DT);
    expect(tank.alive).toBe(true);
    expect(tank.hp).toBeGreaterThan(0);
  });
});

describe("magazin", () => {
  it("șansele însumează 100% și includ „nimic”", () => {
    const sum = CONFIG.shop.odds.reduce((a, o) => a + o.chance, 0);
    expect(sum).toBeCloseTo(1);
    expect(rollRarity(0)).toBe("nothing");
    expect(rollRarity(0.5)).toBe("common");
    expect(rollRarity(0.999)).toBe("legendary");
  });

  it("o încercare costă monede și dă un rezultat", () => {
    const sim = newGame();
    sim.state.players.p1.coins = CONFIG.shop.cost;
    sim.enqueue({ type: "shopRoll", playerId: "p1" });
    sim.step(DT);
    const events = sim.drainEvents();
    expect(sim.state.players.p1.coins).toBe(0);
    expect(events.some((e) => e.type === "shopRoll")).toBe(true);
  });

  it("multe încercări dau bonusuri reale", () => {
    const sim = newGame("assault", 7);
    const p = sim.state.players.p1;
    p.coins = CONFIG.shop.cost * 200;
    for (let i = 0; i < 200; i++) sim.enqueue({ type: "shopRoll", playerId: "p1" });
    sim.step(DT);
    expect(p.mines + p.maxHpBonus + p.speedBonus + p.regenPerSec + p.repairBonus).toBeGreaterThan(0);
    expect(p.weapon).not.toBe("rusty");
    expect(p.speedBonus).toBeLessThanOrEqual(CONFIG.shop.maxSpeedBonus);
  });
});
