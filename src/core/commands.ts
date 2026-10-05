// Comenzile sunt SINGURA cale prin care un jucător poate schimba jocul.
// Acum le trimite input-ul local; în multiplayer le va trimite clientul la server.

import type { EntityId, PlayerId } from "./types";

export type BuildKind = "tower" | "barricade";

export type Command =
  /** Direcția joystick-ului (x = dreapta, z = înainte), lungime 0..1. */
  | { type: "move"; playerId: PlayerId; x: number; z: number }
  | { type: "build"; playerId: PlayerId; kind: BuildKind; x: number; z: number }
  | { type: "upgradeTower"; playerId: PlayerId; towerId: EntityId }
  /** slot 0–2 = abilități normale, 3 = ultimate. */
  | { type: "useAbility"; playerId: PlayerId; slot: number }
  | { type: "openChest"; playerId: PlayerId }
  /** Sare peste restul pauzei și pornește valul următor. */
  | { type: "startWaveNow"; playerId: PlayerId };
