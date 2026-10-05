// Mine: le cumperi din magazin și le pui jos unde stai. Explodează când trece un zombie.

import { CONFIG } from "../config";
import { dist } from "../math";
import type { GameEvent, GameState, PlayerId } from "../types";
import { heroById } from "./heroes";
import { damageZombie, zombiesInRadius } from "./zombies";

export function canPlaceMine(state: GameState, playerId: PlayerId): string | null {
  const player = state.players[playerId];
  if (!player) return "Jucător necunoscut";
  if (player.mines <= 0) return "Nu ai mine (le găsești în magazin)";
  const hero = heroById(state, player.heroId);
  if (!hero?.alive) return "Ești căzut";
  if (state.mines.some((m) => dist(m.pos, hero.pos) < 1.5)) return "E deja o mină aici";
  return null;
}

export function placeMine(state: GameState, playerId: PlayerId): boolean {
  if (canPlaceMine(state, playerId) !== null) return false;
  const player = state.players[playerId];
  const hero = heroById(state, player.heroId)!;
  player.mines--;
  state.mines.push({ id: state.nextId++, ownerId: playerId, pos: { ...hero.pos }, armTimer: CONFIG.mines.armTime });
  return true;
}

export function updateMines(state: GameState, dt: number, events: GameEvent[]): void {
  const c = CONFIG.mines;
  for (let i = state.mines.length - 1; i >= 0; i--) {
    const mine = state.mines[i];
    mine.armTimer = Math.max(0, mine.armTimer - dt);
    if (mine.armTimer > 0) continue;
    if (zombiesInRadius(state, mine.pos, c.triggerRadius).length === 0) continue;
    state.mines.splice(i, 1);
    events.push({ type: "mineExploded", pos: { ...mine.pos }, radius: c.blastRadius });
    const heroId = state.players[mine.ownerId]?.heroId ?? null;
    for (const z of zombiesInRadius(state, mine.pos, c.blastRadius)) {
      damageZombie(state, z, c.damage, events, heroId, mine.pos);
    }
  }
}
