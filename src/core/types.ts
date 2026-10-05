// Starea completă a jocului: doar date simple (fără clase, fără Babylon).
// Așa poate fi trimisă prin rețea / sincronizată de server în faza 3.

import type { HeroClass, ShopRarity, ZombieType } from "./config";
import type { AbilityId } from "./heroDefs";
import type { ShopReward, WeaponId } from "./items";
import type { Vec2 } from "./math";

export type EntityId = number;
export type PlayerId = string;

/** day = zi (construiești), night = noapte (atacă zombii). */
export type Phase = "day" | "night" | "victory" | "gameover";

export interface Player {
  id: PlayerId;
  heroId: EntityId;
  /** Monede: pentru magazin. */
  coins: number;
  /** Lemn: pentru turnuri și baricade. */
  wood: number;
  weapon: WeaponId;
  /** Cel mai mare tier de turn deblocat (1–4). */
  towerTier: number;
  extraTowerSlots: number;
  mines: number;
  /** Bonusuri din magazin. */
  maxHpBonus: number;
  speedBonus: number;
  regenPerSec: number;
  repairBonus: number;
  skins: string[];
  /** Skin-ul activ (null = culoarea de bază a clasei). */
  skin: string | null;
}

/** Efecte temporare pe erou: secunde rămase (0 = inactiv). */
export interface HeroBuffs {
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
  /** În zori, zombii rămași fug spre marginea hărții. */
  fleeing: boolean;
}

export interface Tower {
  id: EntityId;
  ownerId: PlayerId;
  pos: Vec2;
  tier: number;
  facing: number;
  fireTimer: number;
}

/** Un zid = un segment centrat în `pos`, rotit cu `rotation` (radiani, ca `facing`). */
export interface Barricade {
  id: EntityId;
  ownerId: PlayerId;
  pos: Vec2;
  rotation: number;
  /** 1 = gard de lemn, 2 = palisadă întărită. */
  level: number;
  /** Ușă: eroii trec prin ea, zombii nu. */
  door: boolean;
  hp: number;
  maxHp: number;
}

export interface Mine {
  id: EntityId;
  ownerId: PlayerId;
  pos: Vec2;
  armTimer: number;
}

export interface Coin {
  id: EntityId;
  pos: Vec2;
  value: number;
}

/** Zonă cu efect pe hartă: vindecare (Healer) sau foc (Molotov). */
export interface Zone {
  id: EntityId;
  kind: "heal" | "fire";
  ownerHeroId: EntityId;
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
  /** Numărul nopții curente (ziua: ultima noapte trecută). 0 = încă n-a început. */
  wave: number;
  totalWaves: number;
  wavesCompleted: number;
  /** Secunde rămase din zi sau din noapte. */
  phaseTimer: number;
  /** Durata totală a fazei curente (pentru UI și pentru cerul zi/noapte). */
  phaseDuration: number;
  /** Zombii care mai trebuie să apară în noaptea curentă, în ordine. */
  spawnQueue: ZombieType[];
  spawnTimer: number;
  spawnInterval: number;
  shelter: Shelter;
  players: Record<PlayerId, Player>;
  heroes: Hero[];
  zombies: Zombie[];
  towers: Tower[];
  barricades: Barricade[];
  mines: Mine[];
  coins: Coin[];
  zones: Zone[];
  nextId: EntityId;
  rngState: number;
}

/** Evenimente unice („s-a întâmplat ceva”), folosite de randare, sunet și UI pentru efecte. */
export type GameEvent =
  | { type: "shot"; from: Vec2; to: Vec2; source: "hero" | "tower"; crit?: boolean; heroId?: EntityId }
  | { type: "zombieHit"; id: EntityId; pos: Vec2; from: Vec2 }
  | { type: "zombieDied"; id: EntityId; pos: Vec2; zombieType: ZombieType }
  | { type: "coinPicked"; playerId: PlayerId; value: number }
  | { type: "towerPlaced"; id: EntityId }
  | { type: "towerUpgraded"; id: EntityId; tier: number }
  | { type: "barricadePlaced"; id: EntityId }
  | { type: "barricadeChanged"; id: EntityId }
  | { type: "barricadeDestroyed"; id: EntityId; pos: Vec2 }
  | { type: "barricadeHit"; id: EntityId; pos: Vec2 }
  | { type: "mineExploded"; pos: Vec2; radius: number }
  | { type: "nightStarted"; wave: number; boss: boolean }
  | { type: "dawn"; wave: number; wood: number }
  | { type: "shelterHit" }
  | { type: "heroDied"; id: EntityId }
  | { type: "heroRespawned"; id: EntityId }
  | { type: "heroRevived"; id: EntityId; byHeroId: EntityId }
  | { type: "levelUp"; heroId: EntityId; level: number }
  | { type: "ability"; heroId: EntityId; ability: AbilityId; pos: Vec2; radius: number; to?: Vec2 }
  | { type: "healed"; pos: Vec2; amount: number }
  | { type: "shopRoll"; playerId: PlayerId; rarity: ShopRarity; reward: ShopReward }
  | { type: "gameOver" }
  | { type: "victory" };
