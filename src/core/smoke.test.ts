// Test lung (≈1–2 min): o rundă întreagă — campania (grăbită), asaltul boșilor și valul fără sfârșit,
// cu toți zombii și boșii. Rulează cu `npm run test:smoke`.
import { expect, it } from "vitest";
import { CONFIG, isBoss } from "./config";
import { GameSimulation } from "./Game";

it.skipIf(!import.meta.env.SMOKE)("o rundă întreagă cu toți zombii și boșii, fără erori", () => {
  for (const mode of ["defend", "survival"] as const) {
    const sim = new GameSimulation({ players: [{ id: "p1", heroClass: "assault" }, { id: "p2", heroClass: "tank" }], seed: 11, mode, difficulty: "hard" });
    const s = sim.state;
    const seen = new Set<string>();
    let steps = 0;
    let bossAge = 0;
    while (!(s.stage === "endless" && s.endlessWave >= 3) && s.phase !== "gameover" && steps < 30 * 60 * 60) {
      for (const h of s.heroes) {
        h.hp = h.maxHp; // nemuritori: vrem să vedem toate etapele
        h.alive = true;
        h.reserve = 999;
        h.hunger = h.thirst = h.warmth = 100;
      }
      s.shelter.hp = s.shelter.maxHp;
      if (steps % 30 === 0) {
        sim.enqueue({ type: "aim", playerId: "p1", x: 0, z: 1, firing: true, auto: true });
        sim.enqueue({ type: "aim", playerId: "p2", x: 0, z: 1, firing: true, auto: true });
      }
      if (s.stage === "campaign") {
        if (s.phase === "day" && s.phaseTimer > 5) sim.enqueue({ type: "startNightNow", playerId: "p1" });
        // Grăbim nopțile (toți zombii apar repede, zorii după 25 s) și sărim la final după noaptea 7.
        if (s.phase === "night") {
          s.spawnInterval = Math.min(s.spawnInterval, 0.4);
          if (s.phaseDuration - s.phaseTimer > 25) s.phaseTimer = Math.min(s.phaseTimer, 0.001);
        }
        if (s.wave >= 7 && s.phase === "day") s.runTimer = Math.min(s.runTimer, 0.01);
      } else if (s.stage === "bossRush") {
        if (s.phase === "day") s.phaseTimer = Math.min(s.phaseTimer, 0.01);
        // Boss-ul trăiește 15 s (îi vedem abilitățile), apoi îl „terminăm”.
        const boss = s.zombies.find((z) => z.id === s.rushBossId);
        bossAge = boss ? bossAge + 1 : 0;
        if (boss && bossAge > 30 * 15) boss.hp = Math.min(boss.hp, 1);
      }
      sim.step(1 / CONFIG.tickRate);
      for (const z of s.zombies) seen.add(z.type);
      sim.drainEvents();
      steps++;
    }
    expect(s.stage).toBe("endless");
    for (const t of ["bloater", "screamer", "burrower", "shaman", "broodmother", "boss", "yeti", "witch", "colossus", "frostKing"]) expect(seen.has(t)).toBe(true);
    expect(s.zombies.some((z) => isBoss(z.type) && z.burning)).toBe(false);
    expect(JSON.parse(JSON.stringify(s)).zombies.length).toBe(s.zombies.length);
  }
}, 240_000);
