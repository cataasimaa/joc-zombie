// Starea completă a jocului: doar date simple (fără clase, fără Babylon).
// Așa poate fi trimisă prin rețea / sincronizată de server în faza 2.

import type { HeroClass, Rarity, ZombieType } from "./config";
import type { AbilityId } from "./heroDefs";
import type { Vec2 } from "./math";

export type EntityId = number;
export type PlayerId = string;

/** build = pauză între valuri, wave = val activ. */
export type Phase = "build" | "wave" | "victory" | "gameover";

export type ChestReward =
  | { kind: "wood"; amount: number }
  | { kind: "weapon"; bonus: number }
  | { kind: "towerTier"; tier: number }
  | { kind: "skin"; skinId: string };

export interface Player {
  id: PlayerId;
  heroId: EntityId;
  /** Monede: pentru cufere. */
  coins: number;
  /** Lemn: pentru turnuri și baricade. */
  wood: number;
  /** Bonus de damage al armei, din cufere (0.12 = +12%). */
  weaponBonus: number;
  /** Cel mai mare tier de turn deblocat (1–4). */
  towerTier: number;
  skins: string[];
  /** Skin-ul activ (null = culoarea de bază a clasei). */
  skin: string | null;
}

/** Efecte temporare pe erou: secunde rămase (0 = inactiv). */
export interface HeroBuffs {
  rapidFire: number;
  focus: number;
  shield: number;
  invulnerable: number;
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
  /** Cooldown rămas pentru cele 4 abilități (secunde). */
  cooldowns: [number, number, number, number];
  buffs: HeroBuffs;
}

export interface Zombie {
  id: EntityId;
  type: ZombieType;
  pos: Vec2;
  facing: number;
  hp: number;
  maxHp: number;
  attackTimer: number;
  /** Încetinire: secunde rămase. */
  slowTimer: number;
  /** Provocat de Tank: atacă doar eroul ăsta cât timp tauntTimer > 0. */
  tauntHeroId: EntityId | null;
  tauntTimer: number;
  /** Cât timp a stat blocat (pentru plasa de siguranță anti-blocare). */
  stuckTime: number;
}

export interface Tower {
  id: EntityId;
  ownerId: PlayerId;
  pos: Vec2;
  tier: number;
  facing: number;
  fireTimer: number;
}

export interface Barricade {
  id: EntityId;
  ownerId: PlayerId;
  pos: Vec2;
  hp: number;
  maxHp: number;
}

export interface Coin {
  id: EntityId;
  pos: Vec2;
  value: number;
}

/** Zonă cu efect pe hartă (ex. cercul de vindecare al Healer-ului). */
export interface Zone {
  id: EntityId;
  kind: "heal";
  pos: Vec2;
  radius: number;
  timer: number;
  power: number;
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
  /** Zombii care mai trebuie să apară în valul curent, în ordine. */
  spawnQueue: ZombieType[];
  spawnTimer: number;
  spawnInterval: number;
  shelter: Shelter;
  players: Record<PlayerId, Player>;
  heroes: Hero[];
  zombies: Zombie[];
  towers: Tower[];
  barricades: Barricade[];
  coins: Coin[];
  zones: Zone[];
  nextId: EntityId;
  rngState: number;
}

/** Evenimente unice („s-a întâmplat ceva”), folosite de randare, sunet și UI pentru efecte. */
export type GameEvent =
  | { type: "shot"; from: Vec2; to: Vec2; source: "hero" | "tower"; crit?: boolean }
  | { type: "zombieHit"; id: EntityId }
  | { type: "zombieDied"; id: EntityId; pos: Vec2; zombieType: ZombieType }
  | { type: "coinPicked"; playerId: PlayerId; value: number }
  | { type: "towerPlaced"; id: EntityId }
  | { type: "towerUpgraded"; id: EntityId; tier: number }
  | { type: "barricadePlaced"; id: EntityId }
  | { type: "barricadeDestroyed"; id: EntityId; pos: Vec2 }
  | { type: "waveStarted"; wave: number; boss: boolean }
  | { type: "waveCleared"; wave: number; wood: number }
  | { type: "shelterHit" }
  | { type: "heroDied"; id: EntityId }
  | { type: "heroRespawned"; id: EntityId }
  | { type: "heroRevived"; id: EntityId; byHeroId: EntityId }
  | { type: "levelUp"; heroId: EntityId; level: number }
  | { type: "ability"; heroId: EntityId; ability: AbilityId; pos: Vec2; radius: number; to?: Vec2 }
  | { type: "healed"; pos: Vec2; amount: number }
  | { type: "chestOpened"; playerId: PlayerId; rarity: Rarity; reward: ChestReward }
  | { type: "gameOver" }
  | { type: "victory" };
