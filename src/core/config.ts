// Toate numerele de echilibrare (balancing) într-un singur loc.
// Schimbă valorile aici ca să faci jocul mai ușor sau mai greu.

export type HeroClass = "assault" | "sniper" | "tank" | "healer";
export type ZombieType =
  | "walker" | "runner" | "spitter" | "flyer" | "brute"
  /** Noi: urlătoarea (înfurie zombii), umflatul (explodează), săpătorul (vine pe sub zăpadă), șamanul (vindecă). */
  | "screamer" | "bloater" | "burrower" | "shaman"
  /** Boșii: lich-ul, matca, yeti-ul turbat, vrăjitoarea viscolului, colosul. */
  | "boss" | "broodmother" | "yeti" | "witch" | "colossus"
  /** Boss-ul final, cel mai greu: Regele Iernii (vine ultimul în asaltul boșilor). */
  | "frostKing";
export const BOSS_TYPES: ZombieType[] = ["boss", "broodmother", "yeti", "witch", "colossus", "frostKing"];
/** Etapele rundei: campania de 30 de minute (zi/noapte), asaltul boșilor, apoi valul fără sfârșit. */
export type RunStage = "campaign" | "bossRush" | "endless";
export const isBoss = (t: ZombieType): boolean => BOSS_TYPES.includes(t);
/** Ce poate învăța eroul la fiecare nivel: tăiat, minerit, pescuit, tras. */
export type SkillId = "chop" | "mine" | "fish" | "shoot";
export const SKILL_IDS: SkillId[] = ["chop", "mine", "fish", "shoot"];
export type ArmorSlot = "head" | "chest" | "legs" | "feet";
export const ARMOR_SLOTS: ArmorSlot[] = ["head", "chest", "legs", "feet"];
export type ArmorMaterial = "leather" | "metal";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type ShopRarity = "nothing" | Rarity;
/** Turnul de bază e arbaleta; din ea faci upgrade în celelalte. */
export type TowerKind = "crossbow" | "rocket" | "cannon" | "tesla" | "frost";
export type Difficulty = "easy" | "medium" | "hard" | "nightmare";
/** defend = apeși mina de plasmă; survival = supraviețuiești tu (foame, frig, vânătoare). */
export type GameMode = "defend" | "survival";
export type Weather = "clear" | "snow" | "blizzard" | "frost" | "rain" | "wind";
export type AnimalKind = "deer" | "bear" | "chicken" | "pig";
/** Peștii din baltă: de la cel mai des (biban) la cel mai rar și mai greu de scos (somn). */
export type FishKind = "perch" | "trout" | "pike" | "catfish";
export const FISH_KINDS: FishKind[] = ["perch", "trout", "pike", "catfish"];
/** oil = ulei brut (din zăcământ), petrol = benzină (uleiul rafinat pe foc, pentru drujbă). */
export type ItemKind = "rawMeat" | "cookedMeat" | "canteen" | "oil" | "petrol" | "leather" | "iron" | FishKind;

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

/** Numele afișat al fiecărui zombie (HUD: bara boss-ului, mesaje). */
export const ZOMBIE_NAMES: Record<ZombieType, string> = {
  walker: "Strigoi", runner: "Târâtor", spitter: "Scuipător", flyer: "Zburător", brute: "Trol",
  screamer: "Urlătoarea", bloater: "Umflatul", burrower: "Săpătorul", shaman: "Șamanul",
  boss: "Lich-ul", broodmother: "Matca", yeti: "Yeti-ul turbat", witch: "Vrăjitoarea viscolului", colossus: "Colosul de gheață", frostKing: "Regele Iernii",
};

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
    /** Foamea și căldura: 100 = bine, 0 = pierzi viață. Foamea se golește în 4 minute. */
    hungerPerSec: 100 / 240,
    /** Setea se golește în 5 minute; bei pe malul bălții / la fântână (repede) sau topești zăpadă la foc (încet). */
    thirstPerSec: 100 / 300,
    drinkPerSec: 22,
    snowMeltPerSec: 5,
    thirstDamage: 3,
    coldPerSec: 0.45,
    starveDamage: 3,
    freezeDamage: 3,
    /** Lângă foc te încălzești. */
    fireWarmRadius: 4.5,
    fireWarmPerSec: 9,
    rawMeatFood: 12,
    rawMeatHurt: 6,
    /** O bucată de carne friptă = un sfert din foame. */
    cookedMeatFood: 25,
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
    /** Fântâna (puțul): are mereu apă; lângă ea bei și îți umpli canistrele. */
    wellCost: 30,
    maxWells: 2,
    wellReach: 2.2,
    /** Canistra: o umpli la fântână sau la baltă; ține 2 „plinuri” (bei = setea la 100%). */
    canteenDrinks: 2,
    canteenCost: 10,
    maxCanteens: 3,
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
    screamer: { hp: 30, speed: 3.0, radius: 0.5, damage: 6, attackInterval: 1, coinChance: 0.3, coins: 7, xp: 8, rangedRange: 0, flying: false },
    bloater: { hp: 70, speed: 1.7, radius: 0.8, damage: 0, attackInterval: 1, coinChance: 0.25, coins: 6, xp: 7, rangedRange: 0, flying: false },
    burrower: { hp: 55, speed: 4.2, radius: 0.6, damage: 14, attackInterval: 0.9, coinChance: 0.3, coins: 7, xp: 9, rangedRange: 0, flying: false },
    shaman: { hp: 60, speed: 2.0, radius: 0.6, damage: 8, attackInterval: 1.2, coinChance: 0.4, coins: 9, xp: 12, rangedRange: 8, flying: false },
    // Lich-ul (campania): era bătut prea ușor — viață ×2,35 (1700 → 4000) + abilități (vezi zombieAbilities).
    boss: { hp: 4000, speed: 1.4, radius: 1.5, damage: 75, attackInterval: 1.6, coinChance: 1, coins: 50, xp: 100, rangedRange: 0, flying: false },
    broodmother: { hp: 1600, speed: 1.6, radius: 1.4, damage: 40, attackInterval: 1.3, coinChance: 1, coins: 50, xp: 90, rangedRange: 0, flying: false },
    yeti: { hp: 1500, speed: 2.2, radius: 1.3, damage: 55, attackInterval: 1.2, coinChance: 1, coins: 50, xp: 110, rangedRange: 0, flying: false },
    witch: { hp: 1250, speed: 2.0, radius: 1.0, damage: 30, attackInterval: 1.4, coinChance: 1, coins: 50, xp: 120, rangedRange: 11, flying: false },
    colossus: { hp: 3200, speed: 1.0, radius: 2.0, damage: 90, attackInterval: 2.0, coinChance: 1, coins: 80, xp: 160, rangedRange: 0, flying: false },
    frostKing: { hp: 6500, speed: 1.35, radius: 1.9, damage: 95, attackInterval: 1.6, coinChance: 1, coins: 150, xp: 400, rangedRange: 0, flying: false },
  } satisfies Record<ZombieType, ZombieStats>,

  /** Abilitățile zombilor noi și ale boșilor (secunde, metri, damage). */
  zombieAbilities: {
    /** Urlătoarea: la câteva secunde urlă și înfurie zombii din jur (mai rapizi, atacă mai des). */
    screamEvery: 6,
    screamRadius: 7,
    rageTime: 4,
    rageSpeed: 1.5,
    /** Umflatul: explodează când ajunge lângă țintă sau când moare (gaz înghețat). */
    bloatRadius: 3,
    bloatDamage: 34,
    /** Săpătorul: merge pe sub zăpadă (nu-l poți lovi, trece pe sub ziduri) și iese lângă țintă. */
    burrowEmerge: 3.5,
    emergeDamage: 12,
    /** Șamanul: vindecă zombii din jur. */
    healEvery: 4,
    healRadius: 6,
    healPct: 0.2,
    /** Matca: naște pui (târâtori) și la moarte îi scapă pe toți. */
    broodEvery: 5,
    broodCount: 3,
    /** Matca înfuriată (sub jumătate de viață) naște mai des: intervalul × atât. */
    broodEnragedEvery: 0.6,
    broodOnDeath: 6,
    /** Nu mai naște dacă pe hartă sunt deja atâția zombi (să nu facă lag pe telefon). */
    broodCap: 120,
    /** Yeti-ul: se încordează, apoi se năpustește în linie dreaptă, dărâmă zidurile și te aruncă. */
    chargeEvery: 7,
    chargeRange: 15,
    chargeWindup: 0.9,
    chargeSpeed: 15,
    chargeTime: 1.1,
    chargeDamage: 45,
    chargeWallDamage: 260,
    knockback: 3,
    /** Vrăjitoarea: se teleportează, aruncă țurțuri și îngheață turnurile din jur. */
    blinkEvery: 6,
    blinkDistance: 8,
    towerFreezeEvery: 9,
    towerFreezeRadius: 9,
    towerFreezeTime: 4,
    iceBoltDamage: 22,
    /** Colosul: bate din picior (undă de șoc) și aruncă bolovani în turnuri; la jumătate se înfurie. */
    stompEvery: 6,
    stompRadius: 5,
    stompDamage: 38,
    boulderEvery: 5,
    boulderRange: 16,
    boulderDamage: 70,
    enrageAt: 0.5,
    enrageSpeed: 1.6,
    /**
     * Regele Iernii: le face pe toate — ridică morții (strigoi în jur), aruncă salve de țurțuri,
     * bate din picior; la jumătate de viață se înfurie și cheamă de două ori mai mulți.
     */
    kingSummonEvery: 13,
    kingSummon: 5,
    kingVolleyEvery: 4.5,
    kingVolley: 3,
    kingVolleyDamage: 24,
    kingVolleyRange: 16,
    kingStompEvery: 7,
    /**
     * Lich-ul (boss-ul campaniei): ridică morții (strigoi / târâtori în jur) și aruncă salve de
     * țurțuri spre eroul cel mai apropiat (sau spre un turn). Sub jumătate de viață se înfurie:
     * merge mai repede, cheamă de 2× mai mulți, salve mai dese și cu 2 țurțuri în plus.
     */
    lichSummonEvery: 10,
    lichSummon: 4,
    lichBoltEvery: 3.5,
    lichBolts: 3,
    lichBoltDamage: 20,
    lichBoltRange: 14,
  },

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
    /**
     * Fiecare turn are 5 niveluri. Nivelul 3 se deblochează din magazin / cufărul boss-ului sau la
     * nivelul 4 al eroului; nivelul 4 (turn de elită) la eroul de nivel 6, nivelul 5 (legendar) la 8.
     */
    maxLevel: 5,
    /** Costul unui nivel în plus (lemn) și cât crește puterea pe nivel. */
    levelCost: [0, 45, 80, 140, 220],
    /** Nivelul eroului de la care se deblochează nivelul de turn (index = nivelul turnului). */
    tierAtHeroLevel: [0, 0, 0, 4, 6, 8],
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
    /** Ziduri: ~50 de la început (ca să poți înconjura mina și baza fără să rămâi fără sloturi). */
    startBarricadeSlots: 50,
    /** La fiecare N nopți: +1 slot de turn și +4 sloturi de zid. */
    slotEveryWaves: 3,
    barricadeSlotsPerStep: 4,
  },

  /** Unelte: târnăcopul (copaci, minereuri, animale), undița și vânzarea la tarabă. */
  gather: {
    /** Cât de departe ajungi cu târnăcopul și cât de des lovești cât ții apăsat. */
    reach: 2.3,
    /** Secunde între lovituri (cât ții apăsat): lemnul și piatra merg greu. */
    // Bradul: 0,7 → 0,63 s (−10%), tăiatul la început mergea prea greu.
    hitInterval: { tree: 0.63, ore: 1.0, animal: 0.6, zombie: 0.6 },
    /** Un brad cade după atâtea lovituri; fiecare lovitură dă atâta lemn. */
    treeHits: 50,
    woodPerHit: 1,
    /** Damage-ul târnăcopului în animale (o găină moare dintr-o lovitură, un porc din două). */
    animalDamage: 16,
    /** Damage-ul târnăcopului în zombi (× nivelul eroului, ca armele). Zombii din rază au prioritate. */
    zombieDamage: 18,
    /** Minereuri: apar ziua, aleator. Câte lovituri țin și câte monede (aur) dau. */
    ore: {
      silver: { hits: 8, coins: 18 },
      gold: { hits: 12, coins: 45 },
      oil: { hits: 6, coins: 0 },
    },
    orePerDay: 3,
    oreMax: 6,
    goldChance: 0.3,
    /** Pescuit (doar ziua, de pe malul bălții): peștele mușcă după 4–10 s. */
    fishReach: 2.2,
    biteMin: 4,
    biteMax: 10,
    /**
     * Peștii: șansă (pondere), preț la tarabă, de câte ori trebuie să tragi ca să-l scoți, cât
     * timp ai (secunde) și cât de tare se zbate: la fiecare smucitură (la `tugMin`–`tugMax` s,
     * telefonul vibrează) îți smulge înapoi `tug` trageri. Cu cât e mai rar, cu atât e mai greu.
     */
    fish: {
      perch: { name: "Biban", icon: "🐟", weight: 45, price: 8, pulls: 4, time: 6, tug: 1, food: 14 },
      trout: { name: "Păstrăv", icon: "🐠", weight: 30, price: 15, pulls: 6, time: 7, tug: 1.5, food: 18 },
      pike: { name: "Știucă", icon: "🦈", weight: 18, price: 28, pulls: 9, time: 9, tug: 2, food: 22 },
      catfish: { name: "Somn", icon: "🐋", weight: 7, price: 60, pulls: 13, time: 11, tug: 3, food: 30 },
    } satisfies Record<FishKind, { name: string; icon: string; weight: number; price: number; pulls: number; time: number; tug: number; food: number }>,
    tugMin: 0.7,
    tugMax: 1.5,
    sellReach: 2.8,
    /** Lovitură în gol cu târnăcopul (nu e nimic în față): cât durează. */
    missInterval: 0.8,
    /** Lanterna: bateria ține ~6 minute aprinsă și se reîncarcă în ~4 minute stinsă. */
    batteryDrain: 100 / 360,
    batteryCharge: 100 / 240,
  },

  coins: {
    pickupRadius: 1.2,
    /** Monedele din această rază „zboară” spre erou. */
    magnetRadius: 3.5,
    magnetSpeed: 12,
    /** Monedele neluate dispar după atâtea secunde. */
    lifetime: 30,
  },

  /**
   * Abilitățile eroului: la fiecare nivel primești un punct și alegi ce crești (max 5 trepte).
   * Fiecare treaptă dă un bonus mic; treptele 3 și 5 dau și câte o pasivă (un bonus mare).
   */
  skills: {
    maxRank: 5,
    /** Tăiat: lovești mai des; la 3 = +1 lemn pe lovitură, la 5 = bradul cade de 2 ori mai repede. */
    chopSpeed: 0.12,
    /** Minerit: lovești mai des; la 3 = +50% aur din zăcăminte, la 5 = +1 ulei / fier. */
    mineSpeed: 0.12,
    goldBonus: 0.5,
    /** Pescuit: mai mult timp și smucituri mai slabe; la 3 = smuciturile la jumătate, la 5 = peștele ×1,5 aur. */
    fishTime: 0.1,
    fishTug: 0.1,
    fishPrice: 1.5,
    /** Tras: +6% damage pe treaptă; la 3 = reîncarci cu 25% mai repede, la 5 = 15% lovituri critice ×2. */
    shootDamage: 0.06,
    shootReload: 0.25,
    critChance: 0.15,
    critMultiplier: 2,
  },

  /** Armele care vin cu nivelul (le primești singur): pistol, pușcă, pușcă de asalt. Drujba la 5. */
  levelUnlocks: {
    pistol: 2,
    rifle: 4,
    chainsaw: 5,
    assaultRifle: 7,
  },

  /** Drujba: taie copacii foarte repede și tăie și zombii; merge cu benzină. */
  chainsaw: {
    hitInterval: 0.22,
    zombieDamage: 22,
    reach: 2.0,
    /** Câte secunde de tăiat ține un bidon de benzină. */
    secondsPerPetrol: 25,
    tank: 50,
  },

  /** Uleiul brut se rafinează pe foc în benzină. */
  oil: {
    hits: 6,
    /** Ulei primit când spargi zăcământul. */
    amount: 3,
    chance: 0.25,
    refineTime: 12,
  },

  /**
   * Armurile: cască, piept, pantaloni, papuci; din piele (de la animale) sau metal (fier din
   * zăcăminte). Fiecare piesă reduce damage-ul; setul complet dă un bonus în plus.
   */
  armor: {
    leather: {
      name: "Piele",
      reduction: { head: 0.03, chest: 0.06, legs: 0.04, feet: 0.02 },
      cost: { head: { leather: 3, iron: 0 }, chest: { leather: 6, iron: 0 }, legs: { leather: 5, iron: 0 }, feet: { leather: 3, iron: 0 } },
      /** Setul complet: îngheți mai greu și mergi puțin mai repede. */
      setCold: 0.3,
      setSpeed: 0.05,
      setReduction: 0,
    },
    metal: {
      name: "Metal",
      reduction: { head: 0.06, chest: 0.12, legs: 0.08, feet: 0.04 },
      cost: { head: { leather: 1, iron: 4 }, chest: { leather: 2, iron: 8 }, legs: { leather: 1, iron: 6 }, feet: { leather: 1, iron: 3 } },
      setCold: 0,
      setSpeed: -0.05,
      setReduction: 0.1,
    },
  },
  /** Piele din animale (căprioară, urs, porc) și fier din zăcăminte (argint / aur). */
  loot: {
    leather: { deer: 2, bear: 4, pig: 1, chicken: 0 },
    iron: { silver: 2, gold: 1, oil: 0 },
  },

  xp: {
    perLevel: 100,
    /** Cât XP în plus cere fiecare nivel următor. */
    perLevelGrowth: 45,
    /** +10% damage la fiecare nivel. */
    damagePerLevel: 0.1,
    hpPerLevel: 0.1,
  },

  /**
   * Runda: (1) **campania** — 30 de minute de zile și nopți, cu un ceas mare sus; (2) **asaltul
   * boșilor** — fără limită de timp, boșii vin unul după altul (pauză scurtă între ei), ultimul e
   * Regele Iernii; (3) **valul fără sfârșit** — valuri tot mai grele, la infinit; contează cât reziști
   * (clasament, ca la Survival în Warframe).
   */
  run: {
    campaignTime: 30 * 60,
    rushBosses: ["yeti", "witch", "colossus", "frostKing"] as ZombieType[],
    /** Cât stă până apare boss-ul (la începutul asaltului și după pauză). */
    rushBossDelay: 4,
    /** Escorta fiecărui boss și zombii care tot vin cât trăiește (la câteva secunde). */
    rushEscort: 6,
    rushTrickleEvery: 8,
    rushTrickle: 3,
    /** Pauza (zi scurtă) dintre doi boși: repari, iei gloanțe. */
    rushRespite: 25,
    /** Valul fără sfârșit: un val nou la fiecare `endlessEvery` secunde, tot mai mare și mai puternic. */
    endlessEvery: 35,
    endlessBase: 16,
    endlessPerWave: 5,
    /** Un boss la întâmplare la fiecare atâtea valuri. */
    endlessBossEvery: 5,
  },

  waves: {
    /**
     * Câte nopți încap în cele 30 de minute ale campaniei — doar pentru afișare / teste.
     * Cu zile de 120 s: 6 × 120 + nopțile 1–6 (150…175 s, 975 s) = 1695 s < 1800 s; a 7-a zi nu mai încape.
     * (Nopțile cu boss țin cât trăiește boss-ul, iar o noapte curățată devreme aduce zorii mai repede.)
     */
    count: 6,
    /** Prima zi (secunde): la fel de lungă ca celelalte (120 s) — ai timp să tai lemne și să construiești. */
    firstDay: 120,
    /** Ziua: timp de construit (120 s în toate modurile). */
    day: 120,
    /** Noaptea: atacă zombii. Devine puțin mai lungă cu fiecare noapte. */
    nightBase: 150,
    nightPerWave: 5,
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
    /** Zombii noi: din ce noapte apar și cât din val sunt. */
    bloatersFromWave: 2,
    bloaterShare: 0.05,
    screamersFromWave: 3,
    screamerShare: 0.04,
    burrowersFromWave: 5,
    burrowerShare: 0.05,
    shamansFromWave: 6,
    shamanShare: 0.03,
    /** Boșii din campanie (ceilalți vin în asaltul de după cele 30 de minute). */
    bossWaves: [3, 6],
    bosses: { 3: ["broodmother"], 6: ["boss"] } as Record<number, ZombieType[]>,
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
