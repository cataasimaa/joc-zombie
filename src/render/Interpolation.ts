import type { GameState } from "../core/types";

/**
 * Interpolare între pașii simulării (doar pentru desen).
 *
 * Simularea merge în pași fixi (CONFIG.tickRate = 30/s), dar ecranul se desenează de 60 sau
 * 120 de ori pe secundă. Fără interpolare, eroul și zombii „sar” o dată la fiecare pas, iar
 * între pași stau pe loc → mersul pare sacadat (și picioarele se leagănă în reprize).
 *
 * Soluția clasică („Fix your timestep”): ținem minte pozițiile de dinaintea ultimului pas și
 * desenăm fiecare entitate la `prev + (cur − prev) · alpha`, unde alpha = cât din pasul următor
 * a trecut deja (accumulator / STEP). Imaginea e cu cel mult un pas (33 ms) în urmă, dar lină.
 *
 * NU modifică GameState: `view()` întoarce o copie superficială a stării, cu listele de entități
 * care se mișcă (eroi, zombi, animale, proiectile) copiate cu poziția interpolată.
 */

type Moving = { id: number; pos: { x: number; z: number } };
type Store = Map<number, { x: number; z: number }>;

/** Peste distanța asta într-un singur pas (teleport, reînviere, săpătorul care țâșnește) nu interpolăm. */
const SNAP_DIST2 = 3 * 3;

const KEYS = ["heroes", "zombies", "animals", "projectiles", "shells"] as const;
type Key = (typeof KEYS)[number];

export class Interpolator {
  private prev: Record<Key, Store> = {
    heroes: new Map(),
    zombies: new Map(),
    animals: new Map(),
    projectiles: new Map(),
    shells: new Map(),
  };

  /** Apelată chiar înainte de fiecare `sim.step()`: memorează pozițiile curente. */
  beforeStep(state: GameState): void {
    for (const key of KEYS) {
      const store = this.prev[key];
      store.clear();
      for (const e of state[key] as Moving[]) store.set(e.id, { x: e.pos.x, z: e.pos.z });
    }
  }

  /** Uită tot (rundă nouă). */
  reset(): void {
    for (const key of KEYS) this.prev[key].clear();
  }

  /** Starea „de desenat”: aceeași stare, dar cu pozițiile interpolate cu `alpha` (0..1). */
  view(state: GameState, alpha: number): GameState {
    const a = Math.max(0, Math.min(1, alpha));
    const out = { ...state } as GameState;
    for (const key of KEYS) {
      const store = this.prev[key];
      if (store.size === 0) continue;
      (out as unknown as Record<Key, Moving[]>)[key] = (state[key] as Moving[]).map((e) => {
        const p = store.get(e.id);
        if (!p) return e;
        const dx = e.pos.x - p.x;
        const dz = e.pos.z - p.z;
        if ((dx === 0 && dz === 0) || dx * dx + dz * dz > SNAP_DIST2) return e;
        return { ...e, pos: { x: p.x + dx * a, z: p.z + dz * a } };
      });
    }
    return out;
  }
}
