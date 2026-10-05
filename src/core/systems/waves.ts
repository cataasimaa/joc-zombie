// Ziua și noaptea. Ziua (60 s) construiești; noaptea atacă zombii.
// Fiecare noapte e mai lungă decât precedenta. În zori, zombii rămași iau foc și mor încet.

import { CONFIG, type Difficulty, type ZombieType } from "../config";
import { nextRandom } from "../math";
import type { GameEvent, GameState } from "../types";
import { spawnZombie } from "./zombies";

/**
 * Compoziția unei nopți: ce zombi apar, în ordine.
 * Crește cu numărul nopții și cu numărul de jucători.
 */
export function waveComposition(wave: number, playerCount: number, difficulty: Difficulty = "easy"): ZombieType[] {
  const w = CONFIG.waves;
  const total = Math.round(
    (w.baseCount + (wave - 1) * w.countPerWave) * (1 + (playerCount - 1) * w.extraPerPlayer) * CONFIG.difficulty[difficulty].zombieCount,
  );
  const share = (from: number, pct: number) => (wave >= from ? Math.max(1, Math.round(total * pct)) : 0);
  const runners = share(w.runnersFromWave, w.runnerShare);
  const spitters = share(w.spittersFromWave, w.spitterShare);
  const flyers = share(w.flyersFromWave, w.flyerShare);
  const brutes = share(w.brutesFromWave, w.bruteShare);
  const walkers = Math.max(0, total - runners - spitters - flyers - brutes);

  // Îi amestecăm uniform: alergătorii și brutele apar printre cei normali, nu toți la final.
  const list: ZombieType[] = Array(walkers).fill("walker");
  const insertEvenly = (type: ZombieType, n: number) => {
    for (let i = 0; i < n; i++) list.splice(Math.floor(((i + 1) * list.length) / (n + 1)), 0, type);
  };
  insertEvenly("runner", runners);
  insertEvenly("spitter", spitters);
  insertEvenly("flyer", flyers);
  insertEvenly("brute", brutes);
  if ((w.bossWaves as readonly number[]).includes(wave)) list.push("boss");
  return list;
}

/** Câți zombi vin deodată, din același loc. Hoardele cresc de la o noapte la alta. */
export function hordeSize(wave: number): number {
  return 2 + Math.floor(wave / 2);
}

export function nightDuration(wave: number): number {
  return CONFIG.waves.nightBase + (wave - 1) * CONFIG.waves.nightPerWave;
}

export function woodIncomeFor(wave: number, difficulty: Difficulty = "easy"): number {
  return Math.round((CONFIG.economy.woodIncomeBase + wave * CONFIG.economy.woodIncomePerWave) * CONFIG.difficulty[difficulty].wood);
}

export function startNight(state: GameState, events: GameEvent[]): void {
  if (state.phase !== "day") return;
  state.wave++;
  state.phase = "night";
  state.phaseDuration = state.phaseTimer = nightDuration(state.wave);
  state.spawnQueue = waveComposition(state.wave, Object.keys(state.players).length, state.difficulty);
  // Zombii apar în hoarde, uniform în prima parte a nopții.
  const hordes = Math.ceil(state.spawnQueue.length / hordeSize(state.wave));
  state.spawnInterval = (state.phaseDuration * CONFIG.waves.spawnWindow) / Math.max(1, hordes);
  state.spawnTimer = 0;
  events.push({ type: "nightStarted", wave: state.wave, boss: state.spawnQueue.includes("boss") });
}

function startDay(state: GameState, events: GameEvent[]): void {
  state.wavesCompleted++;
  const wood = woodIncomeFor(state.wave, state.difficulty);
  for (const p of Object.values(state.players)) p.wood += wood;
  // Zombii rămași iau foc în lumina zilei și mor încet.
  state.spawnQueue = [];
  for (const z of state.zombies) z.burning = true;
  events.push({ type: "dawn", wave: state.wave, wood });
  if (state.wave >= state.totalWaves) {
    state.phase = "victory";
    events.push({ type: "victory" });
    return;
  }
  state.phase = "day";
  state.phaseDuration = state.phaseTimer = CONFIG.waves.day;
}

export function updateWaves(state: GameState, dt: number, events: GameEvent[]): void {
  state.phaseTimer -= dt;

  if (state.phase === "day") {
    if (state.phaseTimer <= 0) startNight(state, events);
    return;
  }
  if (state.phase !== "night") return;

  if (state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = state.spawnInterval;
      // O hoardă: primul zombie alege locul, ceilalți apar în jurul lui.
      const size = Math.min(hordeSize(state.wave), state.spawnQueue.length);
      const leader = spawnZombie(state, state.spawnQueue.shift()!);
      for (let i = 1; i < size; i++) {
        const z = spawnZombie(state, state.spawnQueue.shift()!, leader.pos);
        z.pos.x += (nextRandom(state) - 0.5) * 4;
        z.pos.z += (nextRandom(state) - 0.5) * 4;
      }
    }
  }

  // Zorii vin când se termină noaptea, sau mai devreme dacă ai omorât tot ce a venit.
  const allDead = state.spawnQueue.length === 0 && state.zombies.every((z) => z.burning);
  if (state.phaseTimer <= 0 || allDead) startDay(state, events);
}
