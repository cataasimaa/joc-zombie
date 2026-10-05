// Toate numerele de echilibrare (balancing) într-un singur loc.
// Schimbă valorile aici ca să faci jocul mai ușor sau mai greu.

export type HeroClass = "assault" | "sniper" | "tank" | "healer";
export type ZombieType = "walker" | "runner" | "spitter" | "flyer" | "brute" | "boss";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type ShopRarity = "nothing" | Rarity;

export interface HeroStats {
  maxHp: number;
  speed: number;
  radius: number;
  range: number;
  /** Damage pe glonț (sau pe alică). */
  damage: number;
  /** Secunde între focuri. */
  fireInterval: number;
  /** Gloanțe în încărcător și cât durează reîncărcarea. */
  magazine: number;
  reloadTime: number;
  /** Câte alice pleacă la un foc (pușcă cu alice) și cât de împrăștiate (radiani). */
  pellets: number;
  spread: number;
  /** Prin câți zombi trece glonțul. */
  pierce: number;
}

export interface ZombieStats {
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  attackInterval: number;
  /** Șansa (0..1) să lase o monedă și cât valorează. */
  coinChance: number;
  coins: number;
  xp: number;
  /** Atac de la distanță (scuipă): raza de la care trage. 0 = doar corp la corp. */
  rangedRange: number;
  /** Zboară: trece peste ziduri, case și brazi. */
  flying: boolean;
}

export const CONFIG = {
  /** De câte ori pe secundă rulează simularea (pas fix). */
  tickRate: 30,

  map: {
    /** Harta e un pătrat de la -halfSize la +halfSize pe x și z. */
    halfSize: 40,
  },

  shelter: {
    maxHp: 1200,
    radius: 3.5,
  },

  heroes: {
    assault: { maxHp: 160, speed: 7, radius: 0.6, range: 13, damage: 10, fireInterval: 0.13, magazine: 24, reloadTime: 1.9, pellets: 1, spread: 0, pierce: 1 },
    sniper: { maxHp: 120, speed: 6.5, radius: 0.6, range: 22, damage: 46, fireInterval: 0.85, magazine: 5, reloadTime: 2.4, pellets: 1, spread: 0, pierce: 2 },
    tank: { maxHp: 420, speed: 6, radius: 0.75, range: 8, damage: 10, fireInterval: 0.7, magazine: 6, reloadTime: 2.6, pellets: 5, spread: 0.22, pierce: 0 },
    healer: { maxHp: 140, speed: 7, radius: 0.6, range: 11, damage: 12, fireInterval: 0.28, magazine: 14, reloadTime: 1.6, pellets: 1, spread: 0, pierce: 0 },
  } satisfies Record<HeroClass, HeroStats>,

  heroCommon: {
    respawnTime: 10,
    /** Raza în care un erou repară automat baricadele. */
    repairRadius: 2.8,
    /** HP pe secundă reparat (Tank-ul repară de 3 ori mai repede). */
    repairRate: 12,
    tankRepairMultiplier: 3,
    /** Tank-ul primește cu atât mai puțin damage. */
    tankArmor: 0.25,
    sniperCritChance: 0.2,
    sniperCritMultiplier: 2.5,
    /** Healer: aură care vindecă eroii din jur (inclusiv pe el). */
    healerAuraRadius: 7,
    healerAuraPerSecond: 3,
    /** Ajutor la ochit: dacă glonțul trece pe lângă, prinde zombiul din acest con (radiani). */
    aimAssist: 0.16,
    /** Lățimea „glonțului” (cât de aproape trebuie să treacă de un zombie ca să-l lovească). */
    bulletWidth: 0.35,
  },

  zombies: {
    walker: { hp: 48, speed: 2.4, radius: 0.6, damage: 11, attackInterval: 1, coinChance: 0.5, coins: 5, xp: 10, rangedRange: 0, flying: false },
    runner: { hp: 26, speed: 5.6, radius: 0.5, damage: 7, attackInterval: 0.7, coinChance: 0.4, coins: 4, xp: 8, rangedRange: 0, flying: false },
    spitter: { hp: 40, speed: 2.0, radius: 0.6, damage: 12, attackInterval: 2.2, coinChance: 0.6, coins: 6, xp: 14, rangedRange: 9, flying: false },
    flyer: { hp: 30, speed: 4.0, radius: 0.55, damage: 8, attackInterval: 1, coinChance: 0.4, coins: 5, xp: 12, rangedRange: 0, flying: true },
    brute: { hp: 216, speed: 1.6, radius: 0.95, damage: 32, attackInterval: 1.4, coinChance: 1, coins: 10, xp: 30, rangedRange: 0, flying: false },
    boss: { hp: 1700, speed: 1.4, radius: 1.5, damage: 75, attackInterval: 1.6, coinChance: 1, coins: 50, xp: 150, rangedRange: 0, flying: false },
  } satisfies Record<ZombieType, ZombieStats>,

  zombieCommon: {
    /** HP-ul crește cu 19% la fiecare noapte. */
    hpGrowthPerWave: 0.19,
    /** Dacă un erou e mai aproape de atât, zombiul îl atacă pe el în loc de adăpost. */
    aggroRadius: 5,
    /** Fiecare jucător în plus: +25% HP la zombi. */
    hpPerExtraPlayer: 0.25,
    /** În zori zombii iau foc: pierd acest procent din HP-ul maxim pe secundă și merg mai încet. */
    dawnBurnPerSecond: 0.09,
    burnSlow: 0.5,
    /** Scuipatul: viteza proiectilului. */
    spitSpeed: 11,
    /** Zburătorii plutesc la înălțimea asta (doar vizual). */
    flyHeight: 2.6,
  },

  tower: {
    radius: 0.8,
    /** Tier-urile 1–4: tier 1 e disponibil mereu, restul se deblochează din magazin. */
    tiers: [
      { damage: 14, range: 11, fireInterval: 0.6, cost: 30 },
      { damage: 24, range: 12, fireInterval: 0.5, cost: 30 },
      { damage: 38, range: 13, fireInterval: 0.42, cost: 45 },
      { damage: 60, range: 14.5, fireInterval: 0.34, cost: 70 },
    ],
  },

  barricade: {
    /** Un zid e un segment: lungime × grosime. Se leagă cap la cap cu altele. */
    length: 2.6,
    thickness: 0.5,
    /** Nivelul 1 = gard de lemn, nivelul 2 = palisadă întărită. */
    levels: [
      { maxHp: 250, cost: 10 },
      { maxHp: 750, cost: 20 },
    ],
    /** Transformarea într-o ușă (eroii trec, zombii nu). */
    doorCost: 10,
    /** Cât lemn primești înapoi când demolezi. */
    refund: 0.5,
    /** Capetele aflate la mai puțin de atât se „lipesc” automat. */
    snapDistance: 1.4,
  },

  mines: {
    triggerRadius: 1.3,
    blastRadius: 3.8,
    damage: 160,
    /** Secunde după plasare până devine activă. */
    armTime: 1,
  },

  economy: {
    /** Lemn = resursa pentru construcții. Monedele sunt pentru magazin. */
    startWood: 70,
    /** Lemn primit în fiecare zori: base + perWave * noapte. */
    woodIncomeBase: 30,
    woodIncomePerWave: 10,
    startTowerSlots: 3,
    startBarricadeSlots: 8,
    /** La fiecare N nopți: +1 slot de turn și +4 sloturi de zid. */
    slotEveryWaves: 3,
    barricadeSlotsPerStep: 4,
  },

  coins: {
    pickupRadius: 1.2,
    /** Monedele din această rază „zboară” spre erou. */
    magnetRadius: 3.5,
    magnetSpeed: 12,
    /** Monedele neluate dispar după atâtea secunde. */
    lifetime: 30,
  },

  xp: {
    perLevel: 100,
    /** Cât XP în plus cere fiecare nivel următor. */
    perLevelGrowth: 45,
    /** +10% damage la fiecare nivel. */
    damagePerLevel: 0.1,
    hpPerLevel: 0.1,
  },

  waves: {
    count: 10,
    /** Prima zi (secunde) — un pic mai scurtă, ca să intri repede în acțiune. */
    firstDay: 45,
    /** Ziua: timp de construit. */
    day: 60,
    /** Noaptea: atacă zombii. Devine tot mai lungă cu fiecare noapte. */
    nightBase: 75,
    nightPerWave: 15,
    /** Zombii apar în primele 75% din noapte. */
    spawnWindow: 0.75,
    /** Fiecare jucător în plus adaugă +50% zombi. */
    extraPerPlayer: 0.5,
    baseCount: 12,
    countPerWave: 7,
    runnersFromWave: 2,
    runnerShare: 0.2,
    spittersFromWave: 3,
    spitterShare: 0.1,
    flyersFromWave: 4,
    flyerShare: 0.08,
    brutesFromWave: 4,
    bruteShare: 0.12,
    /** Nopțile care au un boss. */
    bossWaves: [5, 10],
  },

  shop: {
    /** Cât costă o încercare la magazin. */
    cost: 30,
    /** Șansele (suma = 1). Se afișează în joc. „nothing” = nu primești nimic. */
    odds: [
      { rarity: "nothing", chance: 0.26 },
      { rarity: "common", chance: 0.5 },
      { rarity: "rare", chance: 0.17 },
      { rarity: "epic", chance: 0.06 },
      { rarity: "legendary", chance: 0.01 },
    ] as { rarity: ShopRarity; chance: number }[],
  },
} as const;
