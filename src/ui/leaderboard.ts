// Clasamentul: rezultatele rundelor, salvate pe dispozitiv (localStorage), pe fiecare mod și
// dificultate. Arătăm cele mai bune 5 și ultimele 5. Cel mai bun = a ajuns cel mai departe: valul
// fără sfârșit (cât a rezistat acolo) > asaltul boșilor (câți boși a învins) > campania (cât timp).

import type { Difficulty, GameMode, HeroClass } from "../core";

export interface RunResult {
  name: string;
  mode: GameMode;
  difficulty: Difficulty;
  heroClass: HeroClass;
  nights: number;
  kills: number;
  victory: boolean;
  /** Etapa la care s-a terminat runda și timpii (secunde). Lipsesc la rundele vechi (10 nopți). */
  stage?: "campaign" | "bossRush" | "endless";
  /** Cât a rezistat în campanie (max 30 min), câți boși a învins în asalt, cât în valul fără sfârșit. */
  time?: number;
  bosses?: number;
  endless?: number;
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

export function score(r: RunResult): number {
  if (r.stage === "endless") return 3e7 + (r.endless ?? 0) * 1000 + r.kills;
  if (r.stage === "bossRush") return 2e7 + (r.bosses ?? 0) * 1e5 + r.kills;
  if (r.stage === "campaign") return 1e7 + (r.time ?? 0) * 100 + r.kills;
  // Rundele vechi (10 nopți): sub cele noi.
  return (r.victory ? 1000 : 0) + r.nights * 100 + r.kills;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Ce arătăm în clasament: ∞ timpul din valul final, ☠ boșii învinși sau ⏳ timpul din campanie. */
export function runLabel(r: RunResult): string {
  if (r.stage === "endless") return `∞ ${mmss(r.endless ?? 0)}`;
  if (r.stage === "bossRush") return `☠ ${r.bosses ?? 0} boși`;
  if (r.stage === "campaign") return `⏳ ${mmss(r.time ?? 0)}`;
  return r.victory ? "🏆" : `🌙 ${r.nights}`;
}

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
