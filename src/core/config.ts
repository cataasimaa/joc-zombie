// Toate numerele de echilibrare (balancing) într-un singur loc.
// Schimbă valorile aici ca să faci jocul mai ușor sau mai greu.

export type HeroClass = "assault" | "sniper" | "tank" | "healer";
export type ZombieType = "walker" | "runner" | "brute" | "boss";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface HeroStats {
  maxHp: number;
  speed: number;
  radius: number;
  range: number;
  damage: number;
  /** Secunde între gloanțe. */
  fireInterval: number;
}

export const CONFIG = {
  /** De câte ori pe secundă rulează simularea (pas fix). */
  tickRate: 30,

  map: {
    /** Harta e un pătrat de la -halfSize la +halfSize pe x și z. */
    halfSize: 40,
  },

  shelter: {
    maxHp: 1500,
    radius: 3.5,
  },

  heroes: {
    assault: { maxHp: 160, speed: 7, radius: 0.6, range: 12, damage: 9, fireInterval: 0.18 },
    sniper: { maxHp: 120, speed: 6.5, radius: 0.6, range: 22, damage: 42, fireInterval: 1.1 },
    tank: { maxHp: 420, speed: 6, radius: 0.75, range: 7, damage: 24, fireInterval: 0.45 },
    healer: { maxHp: 140, speed: 7, radius: 0.6, range: 10, damage: 11, fireInterval: 0.35 },
  } satisfies Record<HeroClass, HeroStats>,

  heroCommon: {
    respawnTime: 10,
    /** Raza în care un erou repară automat baricadele. */
    repairRadius: 2.8,
    /** HP pe secundă reparat (Tank-ul repară de 3 ori mai repede). */
    repairRate: 12,
    tankRepairMultiplier: 3,
    /** Assault Rifle: fiecare glonț lovește și un al doilea zombie, cu atât din damage. */
    assaultSecondaryDamage: 0.5,
    sniperCritChance: 0.2,
    sniperCritMultiplier: 2.5,
  },

  /** Nivelul de la care se deblochează abilitatea ultimate. */
  ultLevel: 4,

  zombies: {
    walker: { hp: 40, speed: 2.4, radius: 0.6, damage: 10, attackInterval: 1, coins: 5, xp: 10 },
    runner: { hp: 22, speed: 4.6, radius: 0.5, damage: 6, attackInterval: 0.7, coins: 4, xp: 8 },
    brute: { hp: 180, speed: 1.6, radius: 0.95, damage: 30, attackInterval: 1.4, coins: 12, xp: 30 },
    boss: { hp: 1400, speed: 1.4, radius: 1.5, damage: 70, attackInterval: 1.6, coins: 60, xp: 150 },
  } satisfies Record<ZombieType, {
    hp: number; speed: number; radius: number; damage: number; attackInterval: number; coins: number; xp: number;
  }>,

  zombieCommon: {
    /** HP-ul crește cu 18% la fiecare val. */
    hpGrowthPerWave: 0.18,
    /** Dacă un erou e mai aproape de atât, zombiul îl atacă pe el în loc de adăpost. */
    aggroRadius: 5,
    /** Fiecare jucător în plus: +25% HP la zombi. */
    hpPerExtraPlayer: 0.25,
  },

  tower: {
    radius: 1,
    /** Tier-urile 1–4: tier 1 e disponibil mereu, restul se deblochează din cufere. */
    tiers: [
      { damage: 14, range: 11, fireInterval: 0.6, cost: 30 },
      { damage: 24, range: 12, fireInterval: 0.5, cost: 30 },
      { damage: 38, range: 13, fireInterval: 0.42, cost: 45 },
      { damage: 60, range: 14.5, fireInterval: 0.34, cost: 70 },
    ],
  },

  barricade: {
    cost: 10,
    maxHp: 300,
    radius: 1.3,
  },

  economy: {
    /** Lemn = resursa pentru construcții. Monedele sunt pentru cufere. */
    startWood: 70,
    /** Lemn primit la finalul fiecărui val: base + perWave * val. */
    woodIncomeBase: 30,
    woodIncomePerWave: 10,
    startTowerSlots: 3,
    startBarricadeSlots: 4,
    /** La fiecare N valuri terminate: +1 slot de turn și +2 sloturi de baricadă. */
    slotEveryWaves: 3,
    barricadeSlotsPerStep: 2,
  },

  coins: {
    pickupRadius: 1.2,
    /** Monedele din această rază „zboară” spre erou. */
    magnetRadius: 3.5,
    magnetSpeed: 12,
  },

  xp: {
    perLevel: 100,
    /** Cât XP în plus cere fiecare nivel următor. */
    perLevelGrowth: 20,
    /** +10% damage la fiecare nivel. */
    damagePerLevel: 0.1,
    hpPerLevel: 0.1,
  },

  waves: {
    count: 10,
    /** Pauza dinaintea primului val (secunde). */
    firstDelay: 30,
    /** Pauza dintre valuri (secunde). */
    pause: 60,
    /** Fiecare jucător în plus adaugă +50% zombi. */
    extraPerPlayer: 0.5,
    baseCount: 8,
    countPerWave: 4,
    runnersFromWave: 3,
    runnerShare: 0.25,
    brutesFromWave: 5,
    bruteShare: 0.12,
    /** Valurile care au un boss la final. */
    bossWaves: [5, 10],
  },

  chest: {
    cost: 30,
    /** Șansele fiecărei rarități (suma = 1). Se afișează în joc. */
    odds: [
      { rarity: "common", chance: 0.6 },
      { rarity: "rare", chance: 0.28 },
      { rarity: "epic", chance: 0.1 },
      { rarity: "legendary", chance: 0.02 },
    ] as { rarity: Rarity; chance: number }[],
    /** Bonusul de damage al armei pentru fiecare raritate. */
    weaponBonus: { common: 0.05, rare: 0.12, epic: 0.25, legendary: 0.5 } satisfies Record<Rarity, number>,
    commonWood: 25,
  },
} as const;
