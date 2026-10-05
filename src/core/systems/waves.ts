import { CONFIG } from "../config";
import type { GameEvent, GameState } from "../types";
import { spawnZombie } from "./zombies";

/** Câți zombi are un val; crește cu numărul de jucători. */
export function zombiesInWave(wave: number, playerCount: number): number {
  const base = CONFIG.waves.list[wave - 1].count;
  return Math.round(base * (1 + (playerCount - 1) * CONFIG.waves.extraPerPlayer));
}

export function startNextWave(state: GameState, events: GameEvent[]): void {
  if (state.phase !== "build") return;
  state.wave++;
  state.phase = "wave";
  state.phaseTimer = 0;
  state.zombiesToSpawn = zombiesInWave(state.wave, Object.keys(state.players).length);
  state.spawnTimer = 0;
  events.push({ type: "waveStarted", wave: state.wave });
}

export function updateWaves(state: GameState, dt: number, events: GameEvent[]): void {
  if (state.phase === "build") {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) startNextWave(state, events);
    return;
  }

  if (state.phase !== "wave") return;

  // Apar zombii unul câte unul, la interval fix.
  if (state.zombiesToSpawn > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = CONFIG.waves.list[state.wave - 1].spawnInterval;
      spawnZombie(state);
      state.zombiesToSpawn--;
    }
  }

  // Valul se termină când toți zombii au apărut și au murit.
  if (state.zombiesToSpawn === 0 && state.zombies.length === 0) {
    state.wavesCompleted++;
    events.push({ type: "waveCleared", wave: state.wave });
    if (state.wave >= state.totalWaves) {
      state.phase = "victory";
      events.push({ type: "victory" });
    } else {
      state.phase = "build";
      state.phaseTimer = CONFIG.waves.pause;
    }
  }
}
