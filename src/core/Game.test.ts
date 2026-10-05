import { describe, expect, it } from "vitest";
import { CONFIG } from "./config";
import { GameSimulation } from "./Game";
import { canPlaceTower } from "./systems/towers";
import { zombiesInWave } from "./systems/waves";

const DT = 1 / CONFIG.tickRate;

function run(sim: GameSimulation, seconds: number) {
  for (let t = 0; t < seconds; t += DT) sim.step(DT);
}

describe("GameSimulation", () => {
  it("pornește în pauză, cu cronometru și primul val după firstDelay", () => {
    const sim = new GameSimulation({ playerIds: ["p1"], seed: 1 });
    expect(sim.state.phase).toBe("build");
    run(sim, CONFIG.waves.firstDelay + 0.1);
    expect(sim.state.phase).toBe("wave");
    expect(sim.state.wave).toBe(1);
  });

  it("startWaveNow sare peste pauză", () => {
    const sim = new GameSimulation({ playerIds: ["p1"], seed: 1 });
    sim.enqueue({ type: "startWaveNow", playerId: "p1" });
    sim.step(DT);
    expect(sim.state.phase).toBe("wave");
  });

  it("zombii distrug adăpostul dacă nimeni nu-l apără → game over", () => {
    const sim = new GameSimulation({ playerIds: ["p1"], seed: 2 });
    // Eroul stă într-un colț, departe de adăpost.
    sim.state.heroes[0].pos = { x: -38, z: -38 };
    sim.state.shelter.hp = 50;
    sim.enqueue({ type: "startWaveNow", playerId: "p1" });
    run(sim, 120);
    expect(sim.state.phase).toBe("gameover");
    expect(sim.state.shelter.hp).toBe(0);
  });

  it("eroul omoară zombii, care lasă monede colectabile", () => {
    const sim = new GameSimulation({ playerIds: ["p1"], seed: 3 });
    sim.enqueue({ type: "startWaveNow", playerId: "p1" });
    run(sim, 40);
    const killed = zombiesInWave(1, 1) - sim.state.zombies.length - sim.state.zombiesToSpawn;
    expect(killed).toBeGreaterThan(0);
    const totalCoins = sim.state.coins.length * CONFIG.zombie.coinValue + sim.state.players.p1.coins;
    expect(totalCoins).toBe(CONFIG.economy.startCoins + killed * CONFIG.zombie.coinValue);
  });

  it("plasarea turnului costă monede și respectă sloturile", () => {
    const sim = new GameSimulation({ playerIds: ["p1"], seed: 4 });
    sim.state.players.p1.coins = 1000;
    const spots = [{ x: 7, z: 0 }, { x: -7, z: 0 }, { x: 0, z: 7 }, { x: 0, z: -8 }];
    for (const p of spots) sim.enqueue({ type: "placeTower", playerId: "p1", ...p });
    sim.step(DT);
    expect(sim.state.towers.length).toBe(CONFIG.economy.startSlots);
    expect(sim.state.players.p1.coins).toBe(1000 - CONFIG.economy.startSlots * CONFIG.tower.cost);
    expect(canPlaceTower(sim.state, "p1", { x: 0, z: 0 })).not.toBeNull();
  });

  it("dificultatea crește cu numărul de jucători", () => {
    expect(zombiesInWave(1, 4)).toBeGreaterThan(zombiesInWave(1, 1));
  });

  it("e deterministă: același seed + aceleași comenzi = aceeași stare", () => {
    const a = new GameSimulation({ playerIds: ["p1"], seed: 99 });
    const b = new GameSimulation({ playerIds: ["p1"], seed: 99 });
    for (const sim of [a, b]) {
      sim.enqueue({ type: "startWaveNow", playerId: "p1" });
      sim.enqueue({ type: "move", playerId: "p1", x: 1, z: 0 });
      run(sim, 20);
    }
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });
});
