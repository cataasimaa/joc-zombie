import { CONFIG, type ZombieType } from "../config";
import type { GameEvent, GameState } from "../types";
import { spawnZombie } from "./zombies";

/**
 * Compoziția unui val: ce zombi apar, în ordine.
 * Crește cu numărul valului și cu numărul de jucători.
 */
export function waveComposition(wave: number, playerCount: number): ZombieType[] {
  const w = CONFIG.waves;
  const total = Math.round((w.baseCount + (wave - 1) * w.countPerWave) * (1 + (playerCount - 1) * w.extraPerPlayer));
  const runners = wave >= w.runnersFromWave ? Math.round(total * w.runnerShare) : 0;
  const brutes = wave >= w.brutesFromWave ? Math.max(1, Math.round(total * w.bruteShare)) : 0;
  const walkers = Math.max(0, total - runners - brutes);

  // Îi amestecăm uniform: alergătorii și brutele apar printre cei normali, nu toți la final.
  const list: ZombieType[] = Array(walkers).fill("walker");
  const insertEvenly = (type: ZombieType, n: number) => {
    for (let i = 0; i < n; i++) list.splice(Math.floor(((i + 1) * list.length) / (n + 1)), 0, type);
  };
  insertEvenly("runner", runners);
  insertEvenly("brute", brutes);
  if ((w.bossWaves as readonly number[]).includes(wave)) list.push("boss");
  return list;
}

export function spawnIntervalFor(wave: number): number {
  return Math.max(0.35, 1.3 - (wave - 1) * 0.09);
}

export function woodIncomeFor(wave: number): number {
  return CONFIG.economy.woodIncomeBase + wave * CONFIG.economy.woodIncomePerWave;
}

export function startNextWave(state: GameState, events: GameEvent[]): void {
  if (state.phase !== "build") return;
  state.wave++;
  state.phase = "wave";
  state.phaseTimer = 0;
  state.spawnQueue = waveComposition(state.wave, Object.keys(state.players).length);
  state.spawnInterval = spawnIntervalFor(state.wave);
  state.spawnTimer = 0;
  events.push({ type: "waveStarted", wave: state.wave, boss: state.spawnQueue.includes("boss") });
}

export function updateWaves(state: GameState, dt: number, events: GameEvent[]): void {
  if (state.phase === "build") {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) startNextWave(state, events);
    return;
  }

  if (state.phase !== "wave") return;

  // Apar zombii unul câte unul, la interval fix.
  if (state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = state.spawnInterval;
      spawnZombie(state, state.spawnQueue.shift()!);
    }
  }

  // Valul se termină când toți zombii au apărut și au murit.
  if (state.spawnQueue.length === 0 && state.zombies.length === 0) {
    state.wavesCompleted++;
    const wood = woodIncomeFor(state.wave);
    for (const p of Object.values(state.players)) p.wood += wood;
    events.push({ type: "waveCleared", wave: state.wave, wood });
    if (state.wave >= state.totalWaves) {
      state.phase = "victory";
      events.push({ type: "victory" });
    } else {
      state.phase = "build";
      state.phaseTimer = CONFIG.waves.pause;
    }
  }
}
