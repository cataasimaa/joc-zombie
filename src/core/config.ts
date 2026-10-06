// Toate numerele de echilibrare (balancing) într-un singur loc.
// Schimbă valorile aici ca să faci jocul mai ușor sau mai greu.

export type HeroClass = "assault" | "sniper" | "tank" | "healer";
export type ZombieType = "walker" | "runner" | "spitter" | "flyer" | "brute" | "boss";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type ShopRarity = "nothing" | Rarity;
/** Turnul de bază e arbaleta; din ea faci upgrade în celelalte. */
export type TowerKind = "crossbow" | "rocket" | "cannon" | "tesla" | "frost";
export type Difficulty = "easy" | "medium" | "hard" | "nightmare";
/** defend = apeși mina de plasmă; survival = supraviețuiești tu (foame, frig, vânătoare). */
export type GameMode = "defend" | "survival";
export type Weather = "clear" | "snow" | "blizzard" | "frost" | "rain" | "wind";
export type AnimalKind = "deer" | "bear" | "chicken" | "pig";
export type ItemKind = "rawMeat" | "cookedMeat" | "fish";

export interface WeatherStats {
  name: string;
  icon: string;
  /** Ce face vremea (text pentru HUD). */
  effect: string;
  heroSpeed: number;
  zombieSpeed: number;
  /** Cât de repede te răcești (supraviețuire). */
  cold: number;
  /** Cât de repede arde lemnul din foc. */
  fuel: number;
  /** Ceața (doar vizual): 1 = normal. */
  fog: number;
  /** Raza turnurilor (în afară de Tesla, care trece prin viscol). */
  towerRange: number;
  /** Șansa (pondere) să vină vremea asta. */
  weight: number;
}

export interface AnimalStats {
  hp: number;
  speed: number;
  radius: number;
  /** Carne crudă lăsată la moarte. */
  meat: number;
  /** Ursul atacă: damage și raza de la care te vede. */
  damage: number;
  aggroRadius: number;
  /** Căprioara fuge când te apropii. */
  fleeRadius: number;
  /** Aur (monede) lăsat la moarte. */
  coins: number;
}

export interface TowerStats {
  name: string;
  /** Lemn: pentru arbaletă = cât costă construcția; pentru restul = cât costă transformarea. */
  cost: number;
  damage: number;
  range: number;
  fireInterval: number;
  /** Viteza proiectilului (0 = lovește instant, ex. laserul). */
  shellSpeed: number;
  /** Raza exploziei (0 = o singură țintă). */
  splash: number;
  /** Abilitatea turnului: se declanșează singură la fiecare `abilityCooldown` secunde. */
  abilityCooldown: number;
  hp: number;
}

export interface DifficultyStats {
  name: string;
  /** Multiplicatori față de Easy (jocul de acum). */
  zombieHp: number;
  zombieCount: number;
  zombieDamage: number;
  /** Lemnul de start și venitul din zori. */
  wood: number;
  /** Damage-ul turnurilor (pe dificultăți mari, turnurile nu mai duc singure valul). */
  towerDamage: number;
}

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

  /** Mina de plasmă (ce apărăm). Mai mică decât fosta casă: se înconjoară ușor cu ziduri. */
  shelter: {
    maxHp: 3000,
    radius: 2.2,
  },

  modes: {
    defend: { name: "Apără mina", icon: "⚡", text: "Zombii vor plasma. Dacă mina cade, ai pierdut.", zombieCount: 1, zombieHp: 1 },
    // În Supraviețuire moartea e pe bune (reapari doar în zori), deci hoardele sunt puțin mai mici.
    survival: { name: "Supraviețuire", icon: "🔥", text: "Doar tu contezi: foame, frig, vânătoare, foc.", zombieCount: 0.8, zombieHp: 0.85 },
  } satisfies Record<GameMode, { name: string; icon: string; text: string; zombieCount: number; zombieHp: number }>,

  /** Muniția nu e nelimitată: rezervă + cutii lăsate de zombi. */
  ammo: {
    /** Câte încărcătoare ai în rezervă la start. */
    startMagazines: 8,
    /** Șansa ca un zombie să lase o cutie de gloanțe și cât din încărcător conține. */
    dropChance: 0.3,
    dropMagazine: 0.6,
    /** În fiecare zori primești o „aprovizionare” (atâtea încărcătoare). */
    dawnMagazines: 3,
    /** Cel mult atâtea încărcătoare în rezervă. */
    maxMagazines: 12,
  },

  /** Obiecte pe jos (gloanțe, carne): dispar după atâtea secunde. */
  dropLifetime: 40,

  survival: {
    /** Foamea și căldura: 100 = bine, 0 = pierzi viață. */
    hungerPerSec: 0.32,
    coldPerSec: 0.45,
    starveDamage: 3,
    freezeDamage: 3,
    /** Lângă foc te încălzești. */
    fireWarmRadius: 4.5,
    fireWarmPerSec: 9,
    rawMeatFood: 12,
    fishFood: 18,
    rawMeatHurt: 6,
    cookedMeatFood: 45,
    cookTime: 15,
    /** Focul: costă lemn, arde lemn (100 = plin), 1 punct pe secundă. */
    campfireCost: 15,
    campfireFuel: 100,
    fuelPerWood: 6,
    addWood: 5,
    maxCampfires: 3,
    /** Fermele: dau găini sau porci din când în când, limitat (să nu facă lag). */
    farmCost: 40,
    maxFarms: 2,
    chickenEvery: 35,
    pigEvery: 60,
    maxPerFarm: 3,
    /** Animalele sălbatice care trec prin hartă (în ambele moduri, ziua). */
    maxDeer: 4,
    maxBears: 2,
    animalSpawnEvery: 9,
  },

  animals: {
    deer: { hp: 40, speed: 6.5, radius: 0.6, meat: 2, damage: 0, aggroRadius: 0, fleeRadius: 9, coins: 12 },
    bear: { hp: 220, speed: 4.2, radius: 1.0, meat: 5, damage: 24, aggroRadius: 9, fleeRadius: 0, coins: 40 },
    chicken: { hp: 8, speed: 1.6, radius: 0.3, meat: 1, damage: 0, aggroRadius: 0, fleeRadius: 0, coins: 0 },
    pig: { hp: 30, speed: 1.4, radius: 0.55, meat: 3, damage: 0, aggroRadius: 0, fleeRadius: 0, coins: 0 },
  } satisfies Record<AnimalKind, AnimalStats>,

  /** Vremea: se schimbă la fiecare zi / noapte și face ceva mai greu. */
  weather: {
    clear: { name: "Senin", icon: "☀", effect: "Liniște. Profită.", heroSpeed: 1, zombieSpeed: 1, cold: 0.8, fuel: 1, fog: 0.8, towerRange: 1, weight: 3 },
    snow: { name: "Ninsoare", icon: "❄", effect: "Zombii se aud mai greu", heroSpeed: 1, zombieSpeed: 1.05, cold: 1, fuel: 1, fog: 1.2, towerRange: 1, weight: 4 },
    blizzard: { name: "Viscol", icon: "🌨", effect: "Turnurile bat mai aproape (Tesla nu) · urmele îi trădează", heroSpeed: 0.85, zombieSpeed: 1.1, cold: 1.4, fuel: 1.3, fog: 1.15, towerRange: 0.7, weight: 2 },
    frost: { name: "Ger", icon: "🥶", effect: "Stai mai des lângă foc", heroSpeed: 1, zombieSpeed: 0.9, cold: 2.2, fuel: 1.3, fog: 0.9, towerRange: 1, weight: 2 },
    rain: { name: "Lapoviță", icon: "🌧", effect: "Focul se stinge de 2× mai repede", heroSpeed: 0.95, zombieSpeed: 1, cold: 1.2, fuel: 2, fog: 1.4, towerRange: 1, weight: 2 },
    wind: { name: "Vânt", icon: "🌬", effect: "Mergi mai greu, focul arde repede", heroSpeed: 0.88, zombieSpeed: 1.05, cold: 1.5, fuel: 1.6, fog: 1, towerRange: 1, weight: 2 },
  } satisfies Record<Weather, WeatherStats>,

  /** Cufărul boss-ului: îl împuști ca să-l deschizi. */
  chest: {
    hp: 60,
    radius: 0.9,
    wood: 60,
    ammoMagazines: 3,
    meat: 3,
    /** Cât stă deschis înainte să dispară. */
    openTime: 8,
  },

  difficulty: {
    easy: { name: "Easy", zombieHp: 0.9, zombieCount: 0.9, zombieDamage: 1, wood: 1, towerDamage: 1 },
    medium: { name: "Medium", zombieHp: 1.1, zombieCount: 1.08, zombieDamage: 1.08, wood: 1, towerDamage: 0.85 },
    hard: { name: "Hard", zombieHp: 1.12, zombieCount: 1.1, zombieDamage: 1.1, wood: 0.9, towerDamage: 0.8 },
    nightmare: { name: "Nightmare", zombieHp: 1.22, zombieCount: 1.15, zombieDamage: 1.2, wood: 0.85, towerDamage: 0.65 },
  } satisfies Record<Difficulty, DifficultyStats>,

  heroes: {
    assault: { maxHp: 160, speed: 7, radius: 0.6, range: 13, damage: 10, fireInterval: 0.13, magazine: 24, reloadTime: 1.9, pellets: 1, spread: 0, pierce: 1 },
    sniper: { maxHp: 120, speed: 6.5, radius: 0.6, range: 22, damage: 46, fireInterval: 0.85, magazine: 5, reloadTime: 2.4, pellets: 1, spread: 0, pierce: 2 },
    tank: { maxHp: 420, speed: 6, radius: 0.75, range: 8, damage: 10, fireInterval: 0.7, magazine: 6, reloadTime: 2.6, pellets: 5, spread: 0.22, pierce: 0 },
    healer: { maxHp: 140, speed: 7, radius: 0.6, range: 11, damage: 12, fireInterval: 0.28, magazine: 14, reloadTime: 1.6, pellets: 1, spread: 0, pierce: 0 },
  } satisfies Record<HeroClass, HeroStats>,

  heroCommon: {
    /** Cine cade NU reînvie singur: un coleg trebuie să stea lângă el atâtea secunde. */
    reviveTime: 4,
    reviveRadius: 1.8,
    /** Cu cât din viață te ridici. */
    reviveHp: 0.4,
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
    walker: { hp: 40, speed: 2.4, radius: 0.6, damage: 10, attackInterval: 1, coinChance: 0.16, coins: 5, xp: 4, rangedRange: 0, flying: false },
    runner: { hp: 24, speed: 5.6, radius: 0.5, damage: 7, attackInterval: 0.7, coinChance: 0.14, coins: 4, xp: 4, rangedRange: 0, flying: false },
    spitter: { hp: 36, speed: 2.0, radius: 0.6, damage: 11, attackInterval: 2.2, coinChance: 0.2, coins: 6, xp: 6, rangedRange: 9, flying: false },
    flyer: { hp: 28, speed: 4.0, radius: 0.55, damage: 8, attackInterval: 1, coinChance: 0.15, coins: 5, xp: 5, rangedRange: 0, flying: true },
    brute: { hp: 200, speed: 1.6, radius: 0.95, damage: 30, attackInterval: 1.4, coinChance: 0.5, coins: 10, xp: 14, rangedRange: 0, flying: false },
    boss: { hp: 1700, speed: 1.4, radius: 1.5, damage: 75, attackInterval: 1.6, coinChance: 1, coins: 50, xp: 100, rangedRange: 0, flying: false },
  } satisfies Record<ZombieType, ZombieStats>,

  zombieCommon: {
    /** Zombii loviți de un turn îl atacă pe el întâi (dacă e mai aproape de atât), apoi merg spre mină. */
    towerAggroRange: 12,
    /** Răcit de turnul de gheață: -30% viteză și -30% viteză de atac. */
    chillSlow: 0.3,
    /** HP-ul crește cu 22% la fiecare noapte (numărul de zombi crește și el). */
    hpGrowthPerWave: 0.22,
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
    /** Fiecare turn are 3 niveluri. Nivelul 3 se deblochează din magazin sau din cufărul boss-ului. */
    maxLevel: 3,
    /** Costul unui nivel în plus (lemn) și cât crește puterea pe nivel. */
    levelCost: [0, 45, 80],
    damagePerLevel: 0.45,
    rangePerLevel: 0.08,
    hpPerLevel: 0.4,
    /** Eroii din apropiere repară și turnurile (HP/s) — doar ziua. */
    repairRate: 10,
    kinds: {
      crossbow: { name: "Arbaletă", cost: 50, damage: 8, range: 11, fireInterval: 0.65, shellSpeed: 34, splash: 0, abilityCooldown: 6, hp: 120 },
      rocket: { name: "Rachete", cost: 50, damage: 20, range: 12, fireInterval: 1.8, shellSpeed: 16, splash: 1.2, abilityCooldown: 8, hp: 132 },
      cannon: { name: "Tun", cost: 55, damage: 13, range: 10, fireInterval: 2.5, shellSpeed: 13, splash: 2.0, abilityCooldown: 9, hp: 168 },
      tesla: { name: "Tesla", cost: 60, damage: 14, range: 9, fireInterval: 0.95, shellSpeed: 0, splash: 0, abilityCooldown: 7, hp: 114 },
      frost: { name: "Gheață", cost: 45, damage: 4, range: 9, fireInterval: 1.0, shellSpeed: 22, splash: 0, abilityCooldown: 10, hp: 138 },
    } satisfies Record<TowerKind, TowerStats>,
    /** Abilitățile turnurilor (se declanșează singure). */
    abilities: {
      /** Arbaleta: o săgeată grea, de N ori damage-ul, care trece prin 3 zombi. */
      heavyBoltMultiplier: 4,
      heavyBoltPierce: 3,
      /** Rachete: racheta mare explodează și lansează mini-rachete spre zombii din jur. */
      bigRocketMultiplier: 1.8,
      bigRocketSplash: 2.6,
      miniRockets: 5,
      miniRocketDamage: 0.35,
      miniRocketRange: 6,
      /** Tun: ghiuleaua lasă foc pe jos. */
      fireRadius: 2.4,
      fireDuration: 2,
      fireDps: 0.3,
      /** Tesla: laser care trece prin toți zombii de pe linie. */
      laserMultiplier: 2,
      laserWidth: 0.6,
      /** Gheață: înghețare completă a zombilor din rază. */
      freezeDuration: 1.6,
      /** După o înghețare, zombiul nu mai poate fi înghețat din nou atâtea secunde (nu se adună). */
      freezeImmunity: 3,
    },
  },

  barricade: {
    /** Un zid e un segment: lungime × grosime. Se leagă cap la cap cu altele. */
    length: 2.6,
    thickness: 0.5,
    /** Nivelul 1 = gard de lemn (5), 2 = palisadă forjată (10), 3 = zid de metal (20). */
    levels: [
      { maxHp: 250, cost: 5 },
      { maxHp: 600, cost: 10 },
      { maxHp: 1200, cost: 20 },
    ],
    /** Transformarea într-o ușă (eroii trec, zombii nu). */
    doorCost: 10,
    /** Un zid dărâmat se ridică la loc când e reparat până la atât din viață. */
    rebuildAt: 0.4,
    /** Cât lemn primești înapoi când demolezi (ziua). Noaptea, în timpul valului: jumătate din asta. */
    refund: 0.7,
    nightRefundFactor: 0.5,
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
    startWood: 80,
    /** Lemn primit în fiecare zori: base + perWave * noapte. */
    woodIncomeBase: 30,
    woodIncomePerWave: 10,
    startTowerSlots: 3,
    startBarricadeSlots: 8,
    /** La fiecare N nopți: +1 slot de turn și +4 sloturi de zid. */
    slotEveryWaves: 3,
    barricadeSlotsPerStep: 4,
  },

  /** Unelte: târnăcopul (copaci, minereuri, animale), undița și vânzarea la tarabă. */
  gather: {
    /** Cât de departe ajungi cu târnăcopul și cât de des lovești cât ții apăsat. */
    reach: 2.3,
    hitInterval: 0.4,
    /** Un brad cade după atâtea lovituri; fiecare lovitură dă atâta lemn. */
    treeHits: 50,
    woodPerHit: 1,
    /** Damage-ul târnăcopului în animale (o găină moare dintr-o lovitură, un porc din două). */
    animalDamage: 16,
    /** Minereuri: apar ziua, aleator. Câte lovituri țin și câte monede (aur) dau. */
    ore: {
      silver: { hits: 8, coins: 18 },
      gold: { hits: 12, coins: 45 },
    },
    orePerDay: 3,
    oreMax: 6,
    goldChance: 0.3,
    /** Pescuit (doar ziua, la copcă): peștele mușcă după 4–10 s; ai atâtea secunde să tragi. */
    fishReach: 2.6,
    biteMin: 4,
    biteMax: 10,
    biteWindow: 1.6,
    /** Peștele se vinde la tarabă (casa principală): monede pe bucată. */
    fishPrice: 14,
    sellReach: 2.8,
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
    nightBase: 120,
    nightPerWave: 15,
    /** Zombii apar în primele 75% din noapte. */
    spawnWindow: 0.75,
    /** Fiecare jucător în plus adaugă +50% zombi. */
    extraPerPlayer: 0.5,
    baseCount: 50,
    countPerWave: 10,
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
    /** Șansele (suma = 1). Riscant: des nimic, dar premiile mari merită. */
    odds: [
      { rarity: "nothing", chance: 0.38 },
      { rarity: "common", chance: 0.4 },
      { rarity: "rare", chance: 0.15 },
      { rarity: "epic", chance: 0.06 },
      { rarity: "legendary", chance: 0.01 },
    ] as { rarity: ShopRarity; chance: number }[],
  },
} as const;
