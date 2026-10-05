// Comenzile sunt SINGURA cale prin care un jucător poate schimba jocul.
// Acum le trimite input-ul local; în multiplayer le va trimite clientul la server.

import type { ItemKind, TowerKind } from "./config";
import type { EntityId, PlayerId } from "./types";

export type BuildKind = "tower" | "barricade" | "campfire" | "farmChicken" | "farmPig";

export type Command =
  /** Direcția joystick-ului (x = dreapta, z = înainte), lungime 0..1. */
  | { type: "move"; playerId: PlayerId; x: number; z: number }
  /** `rotation` contează doar pentru baricade. */
  | { type: "build"; playerId: PlayerId; kind: BuildKind; x: number; z: number; rotation?: number }
  /**
   * Upgrade de turn: fără `to` = nivelul următor; cu `to` = transformă arbaleta
   * în alt tip (rachete, tun, tesla, gheață), păstrând nivelul.
   */
  | { type: "upgradeTower"; playerId: PlayerId; towerId: EntityId; to?: TowerKind }
  | { type: "demolishTower"; playerId: PlayerId; towerId: EntityId }
  /** Mută și/sau rotește o baricadă existentă. */
  | { type: "moveBarricade"; playerId: PlayerId; barricadeId: EntityId; x: number; z: number; rotation: number }
  | { type: "upgradeBarricade"; playerId: PlayerId; barricadeId: EntityId; to: "reinforce" | "door" }
  | { type: "demolish"; playerId: PlayerId; barricadeId: EntityId }
  | { type: "placeMine"; playerId: PlayerId }
  /**
   * Ochire + tragere. (x, z) = direcția de ochire. `firing` = ține apăsat pe „trage”.
   * `auto` = ochire automată spre cel mai apropiat zombie (când nu tragi de buton).
   */
  | { type: "aim"; playerId: PlayerId; x: number; z: number; firing: boolean; auto: boolean; dist?: number }
  /** Reîncarcă manual (altfel se reîncarcă singur când se golește încărcătorul). */
  | { type: "reload"; playerId: PlayerId }
  /** Bara rapidă: mănânci (sau pui carnea crudă pe focul de lângă tine). */
  | { type: "useItem"; playerId: PlayerId; item: ItemKind }
  /** Pui lemne pe foc. */
  | { type: "addFuel"; playerId: PlayerId; fireId: EntityId }
  /** Demolezi un foc sau o fermă. */
  | { type: "demolishBuilding"; playerId: PlayerId; buildingId: EntityId }
  /** O încercare la magazin (gambling). */
  | { type: "shopRoll"; playerId: PlayerId }
  /** Sare peste restul zilei și începe noaptea. */
  | { type: "startNightNow"; playerId: PlayerId };
