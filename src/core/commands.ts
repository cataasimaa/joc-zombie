// Comenzile sunt SINGURA cale prin care un jucător poate schimba jocul.
// Acum le trimite input-ul local; în multiplayer le va trimite clientul la server.

import type { PlayerId } from "./types";

export type Command =
  /** Direcția joystick-ului (x = dreapta, z = înainte), lungime 0..1. */
  | { type: "move"; playerId: PlayerId; x: number; z: number }
  | { type: "placeTower"; playerId: PlayerId; x: number; z: number }
  /** Sare peste restul pauzei și pornește valul următor. */
  | { type: "startWaveNow"; playerId: PlayerId };
