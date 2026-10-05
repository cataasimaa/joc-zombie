// Comenzile sunt SINGURA cale prin care un jucător poate schimba jocul.
// Acum le trimite input-ul local; în multiplayer le va trimite clientul la server.

import type { EntityId, PlayerId } from "./types";

export type BuildKind = "tower" | "barricade";

export type Command =
  /** Direcția joystick-ului (x = dreapta, z = înainte), lungime 0..1. */
  | { type: "move"; playerId: PlayerId; x: number; z: number }
  /** `rotation` contează doar pentru baricade. */
  | { type: "build"; playerId: PlayerId; kind: BuildKind; x: number; z: number; rotation?: number }
  | { type: "upgradeTower"; playerId: PlayerId; towerId: EntityId }
  /** Mută și/sau rotește o baricadă existentă. */
  | { type: "moveBarricade"; playerId: PlayerId; barricadeId: EntityId; x: number; z: number; rotation: number }
  | { type: "upgradeBarricade"; playerId: PlayerId; barricadeId: EntityId; to: "reinforce" | "door" }
  | { type: "demolish"; playerId: PlayerId; barricadeId: EntityId }
  | { type: "placeMine"; playerId: PlayerId }
  /** slot 0–2 = abilități normale, 3 = ultimate. */
  | { type: "useAbility"; playerId: PlayerId; slot: number }
  /** O încercare la magazin (gambling). */
  | { type: "shopRoll"; playerId: PlayerId }
  /** Sare peste restul zilei și începe noaptea. */
  | { type: "startNightNow"; playerId: PlayerId };
