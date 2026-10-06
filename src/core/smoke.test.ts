// Test lung (≈1,5 min): un joc întreg, 10 nopți, cu toți zombii și boșii. Rulează cu `npm run test:smoke`.
import { expect, it } from "vitest";
import { CONFIG } from "./config";
import { GameSimulation } from "./Game";

it.skipIf(!import.meta.env.SMOKE)("10 nopți cu toți zombii și boșii noi, fără erori", () => {
  for (const mode of ["defend", "survival"] as const) {
    const sim = new GameSimulation({ players: [{ id: "p1", heroClass: "assault" }, { id: "p2", heroClass: "tank" }], seed: 11, mode, difficulty: "hard" });
    const s = sim.state;
    const seen = new Set<string>();
    let steps = 0;
    while (s.phase !== "victory" && s.phase !== "gameover" && steps < 30 * 60 * 60) {
      for (const h of s.heroes) {
        h.hp = h.maxHp; // nemuritori: vrem să vedem toate nopțile
        h.alive = true;
        h.reserve = 999;
        h.hunger = h.thirst = h.warmth = 100;
      }
      s.shelter.hp = s.shelter.maxHp;
      if (steps % 30 === 0) {
        sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: 1, firing: true, auto: true });
        sim.enqueue({ type: "aim", playerId: "p2", x: 0, z: 1, firing: true, auto: true });
      }
      if (s.phase === "day" && s.phaseTimer > 5) sim.enqueue({ type: "startNightNow", playerId: "p1" });
      // Grăbim noaptea: toți zombii apar repede, iar după 25 s vin zorii (vrem doar să trecem prin toate).
      if (s.phase === "night") {
        s.spawnInterval = Math.min(s.spawnInterval, 0.4);
        if (s.phaseDuration - s.phaseTimer > 25) s.phaseTimer = Math.min(s.phaseTimer, 0.001);
      }
      sim.step(1 / CONFIG.tickRate);
      for (const z of s.zombies) seen.add(z.type);
      sim.drainEvents();
      steps++;
    }
    expect(s.phase).toBe("victory");
    for (const t of ["bloater", "screamer", "burrower", "shaman", "broodmother", "yeti", "witch", "colossus"]) expect(seen.has(t)).toBe(true);
    expect(JSON.parse(JSON.stringify(s)).zombies.length).toBe(s.zombies.length);
  }
}, 120_000);
