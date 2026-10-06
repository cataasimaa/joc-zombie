// Starea completă a jocului: doar date simple (fără clase, fără Babylon).
// Așa poate fi trimisă prin rețea / sincronizată de server în faza 3.

import type { AnimalKind, Difficulty, FishKind, GameMode, HeroClass, ItemKind, Rarity, ShopRarity, TowerKind, Weather, ZombieType } from "./config";
import type { ShopReward, WeaponId } from "./items";
import type { Vec2 } from "./math";

export type EntityId = number;
export type PlayerId = string;

/** day = zi (construiești), night = noapte (atacă zombii). */
export type Phase = "day" | "night" | "victory" | "gameover";

/**
 * Ce poate sta într-un loc din bara rapidă (4 locuri, le aranjezi cum vrei):
 * o armă pe care o ai, târnăcopul, lanterna, minele sau mâncare / pește.
 */
export type SlotItem = `weapon:${WeaponId}` | "pickaxe" | "rod" | "lantern" | "mine" | ItemKind;

/** Ce ții în mână: butonul principal (✛) face ce face unealta asta. */
export type HeldTool = "gun" | "pickaxe" | "rod" | "lantern";

export interface Player {
  id: PlayerId;
  /** Numele ales în meniu. */
  name: string;
  heroId: EntityId;
  /** Monede: pentru magazin. */
  coins: number;
  /** Lemn: pentru turnuri și baricade. */
  wood: number;
  weapon: WeaponId;
  /** Nivelul maxim de turn deblocat (2 la start, 3 din magazin / cufăr). */
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
  /** Recompensele de magazin deja câștigate în runda asta (se primesc o singură dată). */
  unlocked: string[];
  /** Zombi omorâți (pentru scor și clasament). */
  kills: number;
  /** Inventarul: carne crudă, carne friptă și peștii prinși (pe specii). */
  inventory: Record<ItemKind, number>;
  /** Armele pe care le ai (cea din mână e `weapon`). */
  weapons: WeaponId[];
  /** Bara rapidă: 4 locuri, fiecare cu ce vrei tu (sau gol). */
  hotbar: (SlotItem | null)[];
  /** Ce ții în mână: arma, târnăcopul, undița sau lanterna. */
  tool: HeldTool;
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
  /** Direcția în care ochește jucătorul (vector unitate). */
  aim: Vec2;
  /** Ține apăsat pe „trage”. */
  firing: boolean;
  /** Ochire automată (a apăsat „trage” fără să tragă de buton): ținta e cel mai apropiat zombie. */
  autoAim: boolean;
  /** Gloanțe rămase în încărcător. */
  ammo: number;
  /** Secunde rămase din reîncărcare (0 = nu reîncarcă). */
  reloadTimer: number;
  /** Gloanțe în rezervă (muniția nu e nelimitată). */
  reserve: number;
  /** Cât de departe e punctul ochit (glonțul se oprește acolo dacă nu lovește nimic). 0 = toată raza. */
  aimDist: number;
  /** Supraviețuire: 100 = sătul / cald, 0 = pierzi viață. */
  hunger: number;
  warmth: number;
  /** Ține apăsat butonul de acțiune (târnăcop / undiță / vânzare). */
  action: boolean;
  /** Tocmai a apăsat (o singură dată): aruncă / trage undița, vinde. */
  actionPress: boolean;
  actionTimer: number;
  /** Pescuit: secunde până mușcă peștele (-1 = nu pescuiește). */
  fishTimer: number;
  /** Peștele a mușcat: secunde rămase ca să-l scoți. */
  biteTimer: number;
  /** Peștele agățat și de câte ori ai tras deja de el. */
  hooked: FishKind | null;
  reel: number;
  /** Lanterna aprinsă (o iei în mână și apeși ✛) și cât mai are bateria (0..100). */
  lantern: boolean;
  battery: number;
  /** Căzut: cât l-a ridicat un coleg (0..CONFIG.heroCommon.reviveTime). */
  reviveProgress: number;
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
  /** Cât timp a stat blocat (pentru plasa de siguranță anti-blocare). */
  stuckTime: number;
  /** În zori, zombii rămași iau foc și mor încet. */
  burning: boolean;
  /** Turnul care l-a lovit: zombiul îl atacă întâi pe el, apoi merge spre mină. */
  aggroTowerId: EntityId | null;
  /** Eroul care l-a lovit ultima dată (cine primește kill-ul). */
  lastHitBy: EntityId | null;
  /** Răcit de un turn de gheață (secunde rămase): merge și atacă mai încet. */
  chillTimer: number;
  /** Înghețat complet (secunde rămase). */
  frozenTimer: number;
  /** Secunde în care nu mai poate fi înghețat din nou (două înghețări nu se adună). */
  freezeImmune: number;
}

/** Scuipat de zombie (proiectil care zboară spre țintă). */
export interface Projectile {
  id: EntityId;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  life: number;
}

export interface Tower {
  id: EntityId;
  ownerId: PlayerId;
  kind: TowerKind;
  pos: Vec2;
  /** Nivelul 1–3. */
  level: number;
  facing: number;
  fireTimer: number;
  /** Secunde până la următoarea abilitate. */
  abilityTimer: number;
  hp: number;
  maxHp: number;
}

/** Proiectil de turn (săgeată, rachetă, ghiulea, cristal de gheață). Lovește la sosire. */
export interface Shell {
  id: EntityId;
  towerId: EntityId;
  kind: TowerKind;
  /** Proiectil special (abilitatea turnului) sau mini-rachetă. */
  special: "none" | "heavy" | "big" | "mini" | "fire";
  from: Vec2;
  pos: Vec2;
  /** Zombiul urmărit (dacă moare, proiectilul merge până la ultima lui poziție). */
  targetId: EntityId | null;
  target: Vec2;
  speed: number;
  damage: number;
  splash: number;
  ownerHeroId: EntityId | null;
}

/** Foc pe jos (de la ghiuleaua tunului): arde zombii care stau în el. */
export interface FirePatch {
  id: EntityId;
  pos: Vec2;
  radius: number;
  life: number;
  dps: number;
  ownerHeroId: EntityId | null;
}

/** Cufărul lăsat de boss: îl împuști ca să se deschidă. */
export interface Chest {
  id: EntityId;
  pos: Vec2;
  hp: number;
  /** Secunde de când s-a deschis (null = încă închis). */
  openedFor: number | null;
}

/** Foc de tabără construit de jucător: te încălzește și gătește carnea. */
export interface Campfire {
  id: EntityId;
  ownerId: PlayerId;
  pos: Vec2;
  /** Lemnul rămas (0 = stins). */
  fuel: number;
  /** Bucăți de carne pe foc: secunde rămase până se gătesc. */
  cooking: number[];
}

/** Zăcământ de argint sau aur: apare ziua, îl spargi cu târnăcopul și primești aur. */
export interface Ore {
  id: EntityId;
  kind: "silver" | "gold";
  pos: Vec2;
  /** Lovituri rămase până se sparge. */
  hits: number;
}

/** Fermă: coteț de găini sau țarc de porci. */
export interface Farm {
  id: EntityId;
  ownerId: PlayerId;
  pos: Vec2;
  kind: "chicken" | "pig";
  timer: number;
}

export interface Animal {
  id: EntityId;
  kind: AnimalKind;
  pos: Vec2;
  facing: number;
  hp: number;
  maxHp: number;
  /** Unde merge acum (plimbare / fugă). */
  goal: Vec2;
  timer: number;
  attackTimer: number;
  /** Ferma de care aparține (găinile și porcii stau lângă ea). */
  farmId: EntityId | null;
}

/** Obiecte pe jos: cutii de gloanțe și carne. Le iei mergând peste ele. */
export interface Drop {
  id: EntityId;
  pos: Vec2;
  kind: "ammo" | ItemKind;
  amount: number;
  age: number;
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
  /** Dărâmat: rămân doar țăruși rupți (nu mai oprește pe nimeni); eroii îl pot repara. */
  broken: boolean;
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
  /** Secunde de când a căzut (dispare după CONFIG.coins.lifetime). */
  age: number;
}

export interface Shelter {
  pos: Vec2;
  hp: number;
  maxHp: number;
  radius: number;
}

export interface GameState {
  time: number;
  mode: GameMode;
  difficulty: Difficulty;
  weather: Weather;
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
  projectiles: Projectile[];
  shells: Shell[];
  fires: FirePatch[];
  chests: Chest[];
  campfires: Campfire[];
  farms: Farm[];
  animals: Animal[];
  drops: Drop[];
  ores: Ore[];
  /** Lovituri primite de fiecare brad (după index în GAME_MAP.trees); la 50 cade. */
  treeHits: number[];
  /** Secunde până intră pe hartă un nou animal sălbatic. */
  wildTimer: number;
  nextId: EntityId;
  rngState: number;
}

/** Evenimente unice („s-a întâmplat ceva”), folosite de randare, sunet și UI pentru efecte. */
export type GameEvent =
  | { type: "shot"; from: Vec2; to: Vec2; source: "hero"; crit?: boolean; heroId?: EntityId; hit?: boolean }
  /** Un turn a tras (proiectilul zboară ca `Shell`; laserul Tesla lovește instant). */
  | { type: "towerFired"; towerId: EntityId; kind: TowerKind; from: Vec2; to: Vec2; special: Shell["special"] }
  /** Abilitatea unui turn (pentru efecte: laser lung, nova de gheață etc.). */
  | { type: "towerAbility"; towerId: EntityId; kind: TowerKind; pos: Vec2; to: Vec2 }
  /** Proiectilul de turn a lovit / a explodat. */
  | { type: "frozen"; pos: Vec2; count: number }
  | { type: "shellHit"; kind: TowerKind; special: Shell["special"]; pos: Vec2; splash: number }
  | { type: "towerHit"; id: EntityId; pos: Vec2 }
  | { type: "towerDestroyed"; id: EntityId; pos: Vec2; kind: TowerKind }
  | { type: "dryFire"; heroId: EntityId }
  | { type: "reloadStart"; heroId: EntityId; time: number }
  | { type: "reloadDone"; heroId: EntityId }
  | { type: "zombieHit"; id: EntityId; pos: Vec2; from: Vec2 }
  | { type: "zombieDied"; id: EntityId; pos: Vec2; zombieType: ZombieType; burned: boolean; killerHeroId: EntityId | null }
  | { type: "zombieAttack"; id: EntityId; zombieType: ZombieType; pos: Vec2; wall?: boolean }
  | { type: "spit"; id: EntityId; from: Vec2; to: Vec2 }
  | { type: "projectileHit"; pos: Vec2 }
  | { type: "coinPicked"; playerId: PlayerId; value: number }
  | { type: "towerPlaced"; id: EntityId }
  | { type: "towerUpgraded"; id: EntityId; level: number; kind: TowerKind }
  | { type: "barricadePlaced"; id: EntityId }
  | { type: "barricadeChanged"; id: EntityId }
  | { type: "barricadeDestroyed"; id: EntityId; pos: Vec2 }
  | { type: "barricadeHit"; id: EntityId; pos: Vec2 }
  | { type: "barricadeRepaired"; id: EntityId; pos: Vec2 }
  /** Construcție demolată de jucător (dispare, fără prăbușire). */
  | { type: "structureRemoved"; id: EntityId; pos: Vec2 }
  | { type: "mineExploded"; pos: Vec2; radius: number }
  | { type: "nightStarted"; wave: number; boss: boolean }
  | { type: "dawn"; wave: number; wood: number }
  | { type: "shelterHit" }
  | { type: "heroHit"; id: EntityId; pos: Vec2; from: Vec2; amount: number }
  | { type: "heroDied"; id: EntityId }
  | { type: "heroRespawned"; id: EntityId }
  | { type: "levelUp"; heroId: EntityId; level: number }
  | { type: "healed"; pos: Vec2; amount: number }
  | { type: "shopRoll"; playerId: PlayerId; rarity: ShopRarity; reward: ShopReward }
  | { type: "chestDropped"; id: EntityId; pos: Vec2 }
  | { type: "chestHit"; id: EntityId; pos: Vec2 }
  | { type: "weatherChanged"; weather: Weather }
  | { type: "noAmmo"; heroId: EntityId }
  | { type: "picked"; playerId: PlayerId; kind: Drop["kind"]; amount: number; pos: Vec2 }
  | { type: "ate"; playerId: PlayerId; cooked: boolean }
  | { type: "cooked"; fireId: EntityId; pos: Vec2 }
  | { type: "fireOut"; fireId: EntityId; pos: Vec2 }
  | { type: "fuelAdded"; fireId: EntityId; pos: Vec2 }
  | { type: "buildingPlaced"; id: EntityId; pos: Vec2 }
  | { type: "animalHit"; id: EntityId; pos: Vec2; from: Vec2 }
  | { type: "animalDied"; id: EntityId; kind: AnimalKind; pos: Vec2 }
  | { type: "animalAttack"; id: EntityId; pos: Vec2 }
  | { type: "starving"; heroId: EntityId }
  | { type: "freezing"; heroId: EntityId }
  | { type: "chestOpened"; playerId: PlayerId; pos: Vec2; rarity: Rarity; reward: ShopReward; wood: number; ammo: number; meat: number }
  | { type: "toolHit"; heroId: EntityId; target: "tree" | "ore" | "animal" | "air"; pos: Vec2 }
  | { type: "lantern"; heroId: EntityId; on: boolean }
  | { type: "treeFelled"; index: number; pos: Vec2 }
  | { type: "oreSpawned"; id: EntityId; kind: Ore["kind"]; pos: Vec2 }
  | { type: "oreMined"; id: EntityId; kind: Ore["kind"]; pos: Vec2; playerId: PlayerId; coins: number }
  | { type: "fishCast"; heroId: EntityId; pos: Vec2 }
  | { type: "fishBite"; heroId: EntityId; pos: Vec2; fish: FishKind }
  | { type: "fishReel"; heroId: EntityId; pos: Vec2; reel: number; pulls: number }
  | { type: "fishCaught"; heroId: EntityId; playerId: PlayerId; pos: Vec2; fish: FishKind }
  | { type: "fishLost"; heroId: EntityId; pos: Vec2 }
  | { type: "sold"; playerId: PlayerId; fish: number; coins: number; pos: Vec2 }
  | { type: "equipped"; playerId: PlayerId; item: SlotItem }
  | { type: "gameOver" }
  | { type: "victory" };
