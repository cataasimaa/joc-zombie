// Clasamentul: rezultatele rundelor, salvate pe dispozitiv (localStorage), pe fiecare mod și
// dificultate. Arătăm cele mai bune 5 (cele mai multe nopți, apoi cei mai mulți zombi) și ultimele 5.

import type { Difficulty, GameMode, HeroClass } from "../core";

export interface RunResult {
  name: string;
  mode: GameMode;
  difficulty: Difficulty;
  heroClass: HeroClass;
  nights: number;
  kills: number;
  victory: boolean;
  /** Data (ms), doar pentru afișare. */
  at: number;
}

const KEY = "im.leaderboard";
const MAX_STORED = 200;

function load(): RunResult[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RunResult[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function recordRun(run: RunResult): void {
  const list = load();
  list.push(run);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_STORED)));
  } catch {
    // fără spațiu sau mod privat: nu salvăm
  }
}

export const score = (r: RunResult): number => (r.victory ? 1000 : 0) + r.nights * 100 + r.kills;

export function bestRuns(mode: GameMode, difficulty: Difficulty, n = 5): RunResult[] {
  return load()
    .filter((r) => r.mode === mode && r.difficulty === difficulty)
    .sort((a, b) => score(b) - score(a))
    .slice(0, n);
}

export function lastRuns(mode: GameMode, difficulty: Difficulty, n = 5): RunResult[] {
  return load()
    .filter((r) => r.mode === mode && r.difficulty === difficulty)
    .slice(-n)
    .reverse();
}
