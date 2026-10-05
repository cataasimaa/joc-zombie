import { CONFIG } from "../config";
import { dist, moveTowards } from "../math";
import type { GameEvent, GameState } from "../types";

/** Monedele sunt colectate individual: le primește jucătorul al cărui erou trece peste ele. */
export function updateCoins(state: GameState, dt: number, events: GameEvent[]): void {
  const cfg = CONFIG.coins;
  for (let i = state.coins.length - 1; i >= 0; i--) {
    const coin = state.coins[i];
    // Monedele neluate dispar după un timp (mai puține obiecte = mai puțin lag, joc mai greu).
    coin.age += dt;
    if (coin.age >= cfg.lifetime) {
      state.coins.splice(i, 1);
      continue;
    }
    for (const hero of state.heroes) {
      if (!hero.alive) continue;
      const d = dist(coin.pos, hero.pos);
      if (d <= cfg.pickupRadius) {
        state.players[hero.playerId].coins += coin.value;
        state.coins.splice(i, 1);
        events.push({ type: "coinPicked", playerId: hero.playerId, value: coin.value });
        break;
      }
      if (d <= cfg.magnetRadius) {
        moveTowards(coin.pos, hero.pos, cfg.magnetSpeed * dt);
        break;
      }
    }
  }
}

/** Cufărul deschis stă puțin pe hartă (se vede deschis), apoi dispare. */
export function updateChests(state: GameState, dt: number): void {
  for (let i = state.chests.length - 1; i >= 0; i--) {
    const chest = state.chests[i];
    if (chest.openedFor === null) continue;
    chest.openedFor += dt;
    if (chest.openedFor >= CONFIG.chest.openTime) state.chests.splice(i, 1);
  }
}
