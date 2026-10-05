import { describe, expect, it } from "vitest";
import { CONFIG, type HeroClass } from "./config";
import { GameSimulation } from "./Game";
import { abilityBlockedReason } from "./systems/abilities";
import { rollRarity } from "./systems/chests";
import { spawnZombie } from "./systems/zombies";
import { canBuild, slotsFor } from "./systems/towers";
import { waveComposition } from "./systems/waves";

const DT = 1 / CONFIG.tickRate;

function newGame(heroClass: HeroClass = "assault", seed = 1) {
  return new GameSimulation({ players: [{ id: "p1", heroClass }], seed });
}

function run(sim: GameSimulation, seconds: number) {
  for (let t = 0; t < seconds; t += DT) sim.step(DT);
}

describe("valuri", () => {
  it("pornește în pauză, cu cronometru și primul val după firstDelay", () => {
    const sim = newGame();
    expect(sim.state.phase).toBe("build");
    run(sim, CONFIG.waves.firstDelay + 0.1);
    expect(sim.state.phase).toBe("wave");
    expect(sim.state.wave).toBe(1);
  });

  it("startWaveNow sare peste pauză", () => {
    const sim = newGame();
    sim.enqueue({ type: "startWaveNow", playerId: "p1" });
    sim.step(DT);
    expect(sim.state.phase).toBe("wave");
  });

  it("valurile cresc, au tipuri noi de zombi și boss la valurile 5 și 10", () => {
    expect(waveComposition(2, 1).length).toBeGreaterThan(waveComposition(1, 1).length);
    expect(waveComposition(1, 1)).not.toContain("runner");
    expect(waveComposition(3, 1)).toContain("runner");
    expect(waveComposition(5, 1)).toContain("brute");
    expect(waveComposition(5, 1).at(-1)).toBe("boss");
    expect(waveComposition(10, 1).at(-1)).toBe("boss");
    expect(waveComposition(6, 1)).not.toContain("boss");
  });

  it("dificultatea crește cu numărul de jucători", () => {
    expect(waveComposition(1, 4).length).toBeGreaterThan(waveComposition(1, 1).length);
  });

  it("la finalul valului fiecare jucător primește lemn", () => {
    const sim = newGame();
    sim.enqueue({ type: "startWaveNow", playerId: "p1" });
    sim.step(DT);
    sim.state.spawnQueue = [];
    sim.state.zombies = [];
    const wood = sim.state.players.p1.wood;
    sim.step(DT);
    expect(sim.state.phase).toBe("build");
    expect(sim.state.players.p1.wood).toBeGreaterThan(wood);
  });
});

describe("luptă", () => {
  it("zombii distrug adăpostul dacă nimeni nu-l apără → game over", () => {
    const sim = newGame("assault", 2);
    sim.state.heroes[0].pos = { x: -38, z: -38 };
    sim.state.shelter.hp = 50;
    sim.enqueue({ type: "startWaveNow", playerId: "p1" });
    run(sim, 120);
    expect(sim.state.phase).toBe("gameover");
    expect(sim.state.shelter.hp).toBe(0);
  });

  it("eroul omoară zombii, care lasă monede, și primește XP", () => {
    const sim = newGame("assault", 3);
    sim.enqueue({ type: "startWaveNow", playerId: "p1" });
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
    s.barricades.push({ id: 999, ownerId: "p1", pos: { x: 0, z: 10 }, hp: 300, maxHp: 300 });
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
      sim.enqueue({ type: "startWaveNow", playerId: "p1" });
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
    const slots = slotsFor(sim.state, "tower");
    expect(sim.state.towers.length).toBe(slots);
    expect(sim.state.players.p1.wood).toBe(1000 - slots * CONFIG.tower.tiers[0].cost);
    expect(canBuild(sim.state, "p1", "tower", { x: 0, z: 0 })).not.toBeNull();
  });

  it("baricadele se pot pune una lângă alta, dar nu una peste alta", () => {
    const sim = newGame();
    const s = sim.state;
    sim.enqueue({ type: "build", playerId: "p1", kind: "barricade", x: 8, z: 8 });
    sim.step(DT);
    expect(canBuild(s, "p1", "barricade", { x: 8.3, z: 8 })).toBe("Loc ocupat");
    expect(canBuild(s, "p1", "barricade", { x: 8 + CONFIG.barricade.radius * 2, z: 8 })).toBeNull();
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

describe("cufere", () => {
  it("șansele raritătilor însumează 100%", () => {
    const sum = CONFIG.chest.odds.reduce((a, o) => a + o.chance, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("rollRarity respectă pragurile", () => {
    expect(rollRarity(0)).toBe("common");
    expect(rollRarity(0.7)).toBe("rare");
    expect(rollRarity(0.95)).toBe("epic");
    expect(rollRarity(0.995)).toBe("legendary");
  });

  it("deschiderea costă monede și dă o recompensă", () => {
    const sim = newGame();
    sim.state.players.p1.coins = CONFIG.chest.cost;
    sim.enqueue({ type: "openChest", playerId: "p1" });
    sim.step(DT);
    const events = sim.drainEvents();
    expect(sim.state.players.p1.coins).toBe(0);
    expect(events.some((e) => e.type === "chestOpened")).toBe(true);
  });
});
