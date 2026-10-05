import { CONFIG } from "../config";
import { dist, moveTowards } from "../math";
import type { GameEvent, GameState } from "../types";

/** Monedele sunt colectate individual: le primește jucătorul al cărui erou trece peste ele. */
export function updateCoins(state: GameState, dt: number, events: GameEvent[]): void {
  const cfg = CONFIG.coins;
  for (let i = state.coins.length - 1; i >= 0; i--) {
    const coin = state.coins[i];
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
