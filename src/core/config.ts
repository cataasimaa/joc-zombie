// Toate numerele de echilibrare (balancing) într-un singur loc.
// Schimbă valorile aici ca să faci jocul mai ușor sau mai greu.

export const CONFIG = {
  /** De câte ori pe secundă rulează simularea (pas fix). */
  tickRate: 30,

  map: {
    /** Harta e un pătrat de la -halfSize la +halfSize pe x și z. */
    halfSize: 40,
  },

  shelter: {
    maxHp: 1000,
    radius: 3.5,
  },

  heroes: {
    assault: {
      maxHp: 150,
      speed: 7,
      radius: 0.6,
      range: 12,
      damage: 9,
      /** Secunde între gloanțe. */
      fireInterval: 0.18,
      respawnTime: 5,
    },
  },

  zombie: {
    baseHp: 40,
    /** HP-ul crește cu 35% la fiecare val. */
    hpGrowthPerWave: 0.35,
    speed: 2.4,
    radius: 0.6,
    damage: 10,
    attackInterval: 1,
    /** Dacă un erou e mai aproape de atât, zombiul îl atacă pe el în loc de adăpost. */
    aggroRadius: 5,
    coinValue: 5,
    xp: 10,
  },

  tower: {
    cost: 25,
    radius: 1,
    range: 11,
    damage: 14,
    fireInterval: 0.6,
  },

  economy: {
    startCoins: 50,
    startSlots: 3,
    /** +1 slot de construcție la fiecare N valuri terminate. */
    slotEveryWaves: 3,
  },

  coins: {
    pickupRadius: 1.2,
    /** Monedele din această rază „zboară” spre erou. */
    magnetRadius: 3.5,
    magnetSpeed: 12,
  },

  xp: {
    perLevel: 100,
    /** +10% damage la fiecare nivel. */
    damagePerLevel: 0.1,
  },

  waves: {
    /** Pauza dinaintea primului val (secunde). */
    firstDelay: 30,
    /** Pauza dintre valuri (secunde). */
    pause: 60,
    /** Fiecare jucător în plus adaugă +50% zombi. */
    extraPerPlayer: 0.5,
    list: [
      { count: 10, spawnInterval: 1.2 },
      { count: 18, spawnInterval: 0.9 },
      { count: 28, spawnInterval: 0.6 },
    ],
  },
} as const;

export type HeroClass = keyof typeof CONFIG.heroes;
