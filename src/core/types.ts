// Starea completă a jocului: doar date simple (fără clase, fără Babylon).
// Așa poate fi trimisă prin rețea / sincronizată de server în faza 2.

import type { HeroClass } from "./config";
import type { Vec2 } from "./math";

export type EntityId = number;
export type PlayerId = string;

/** build = pauză între valuri, wave = val activ. */
export type Phase = "build" | "wave" | "victory" | "gameover";

export interface Player {
  id: PlayerId;
  heroId: EntityId;
  coins: number;
}

export interface Hero {
  id: EntityId;
  playerId: PlayerId;
  heroClass: HeroClass;
  pos: Vec2;
  /** Direcția în care privește (radiani). */
  facing: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnTimer: number;
  fireTimer: number;
  level: number;
  xp: number;
  /** Ultima direcție de mișcare cerută de jucător (lungime 0..1). */
  moveInput: Vec2;
}

export interface Zombie {
  id: EntityId;
  pos: Vec2;
  facing: number;
  hp: number;
  maxHp: number;
  attackTimer: number;
}

export interface Tower {
  id: EntityId;
  ownerId: PlayerId;
  pos: Vec2;
  tier: number;
  facing: number;
  fireTimer: number;
}

export interface Coin {
  id: EntityId;
  pos: Vec2;
  value: number;
}

export interface Shelter {
  pos: Vec2;
  hp: number;
  maxHp: number;
  radius: number;
}

export interface GameState {
  time: number;
  phase: Phase;
  /** Numărul valului curent (în pauză: ultimul val terminat). 0 = încă n-a început. */
  wave: number;
  totalWaves: number;
  wavesCompleted: number;
  /** Secunde rămase din pauză (doar în faza "build"). */
  phaseTimer: number;
  zombiesToSpawn: number;
  spawnTimer: number;
  shelter: Shelter;
  players: Record<PlayerId, Player>;
  heroes: Hero[];
  zombies: Zombie[];
  towers: Tower[];
  coins: Coin[];
  nextId: EntityId;
  rngState: number;
}

/** Evenimente unice („s-a întâmplat ceva”), folosite de randare și UI pentru efecte. */
export type GameEvent =
  | { type: "shot"; from: Vec2; to: Vec2; source: "hero" | "tower" }
  | { type: "zombieHit"; id: EntityId }
  | { type: "zombieDied"; id: EntityId; pos: Vec2 }
  | { type: "coinPicked"; playerId: PlayerId; value: number }
  | { type: "towerPlaced"; id: EntityId }
  | { type: "waveStarted"; wave: number }
  | { type: "waveCleared"; wave: number }
  | { type: "shelterHit" }
  | { type: "heroDied"; id: EntityId }
  | { type: "heroRespawned"; id: EntityId }
  | { type: "levelUp"; heroId: EntityId; level: number }
  | { type: "gameOver" }
  | { type: "victory" };
