// Armele și recompensele din magazin (gambling).

import type { Rarity, ShopRarity } from "./config";

export type WeaponId = "rusty" | "hunting" | "scattergun" | "pipeGun" | "boneBow" | "iceLance";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  rarity: Rarity | "start";
  /** Multiplicatori față de arma de bază a clasei. */
  damage: number;
  interval: number;
  /** Rază în plus (metri). */
  range: number;
  /** Alice în plus la fiecare foc. */
  pellets: number;
  /** Prin câți zombi în plus trece glonțul. */
  pierce: number;
  /** Multiplicator pentru încărcător și pentru timpul de reîncărcare. */
  magazine: number;
  reload: number;
  /** Încetinește zombiul lovit (secunde). */
  slow: number;
  description: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rusty: {
    id: "rusty", name: "Țeava ruginită", rarity: "start",
    damage: 1, interval: 1, range: 0, pellets: 0, pierce: 0, magazine: 1, reload: 1, slow: 0,
    description: "Arma cu care ai pornit.",
  },
  hunting: {
    id: "hunting", name: "Pușcă de vânătoare", rarity: "rare",
    damage: 1.25, interval: 1.1, range: 3, pellets: 0, pierce: 1, magazine: 0.6, reload: 1, slow: 0,
    description: "Damage mare, glonțul trece prin doi zombi.",
  },
  scattergun: {
    id: "scattergun", name: "Flintă cu alice", rarity: "rare",
    damage: 0.7, interval: 1.3, range: -3, pellets: 4, pierce: 0, magazine: 0.4, reload: 1.2, slow: 0,
    description: "Un nor de alice: devastatoare de aproape.",
  },
  pipeGun: {
    id: "pipeGun", name: "Mitralieră din țevi", rarity: "epic",
    damage: 0.85, interval: 0.65, range: 0, pellets: 0, pierce: 0, magazine: 1.6, reload: 1.3, slow: 0,
    description: "Trage foarte des, încărcător mare.",
  },
  boneBow: {
    id: "boneBow", name: "Arbaletă de os", rarity: "epic",
    damage: 1.9, interval: 1.4, range: 4, pellets: 0, pierce: 2, magazine: 0.35, reload: 0.8, slow: 0,
    description: "Săgeți grele care trec prin trei zombi.",
  },
  iceLance: {
    id: "iceLance", name: "Lancea de gheață", rarity: "legendary",
    damage: 1.7, interval: 0.95, range: 3, pellets: 0, pierce: 1, magazine: 1, reload: 0.9, slow: 1.2,
    description: "Damage uriaș și îngheață ce lovește.",
  },
};

export type ShopReward =
  | { kind: "nothing" }
  | { kind: "wood"; amount: number }
  /** Câștig în monede (jackpot-ul clasic de păcănele). */
  | { kind: "coins"; amount: number }
  /** Încărcătoare în plus în rezervă. */
  | { kind: "ammo"; magazines: number }
  | { kind: "mines"; count: number }
  | { kind: "maxHp"; pct: number }
  | { kind: "speed"; pct: number }
  | { kind: "regen"; perSec: number }
  | { kind: "repair"; pct: number }
  | { kind: "towerSlot" }
  /** Deblochează nivelul `tier` al turnurilor. */
  | { kind: "towerTier"; tier: number }
  | { kind: "weapon"; weaponId: WeaponId }
  | { kind: "skin"; skinId: string };

/** Recompensele care se pot repeta (consumabile). Restul se primesc o singură dată pe rundă. */
export const REPEATABLE: ShopReward["kind"][] = ["nothing", "wood", "mines", "coins", "ammo"];

/** Cheie unică pentru o recompensă (ca să știm ce ai câștigat deja în runda asta). */
export const rewardKey = (r: ShopReward): string => JSON.stringify(r);

/**
 * Ce poți primi la fiecare raritate (tragem la sorți una dintre variante).
 * Bonusurile de statistici sunt mici (max +10% viață); premiile mari sunt armele,
 * nivelul 3 al turnurilor și câștigurile în monede.
 */
export const SHOP_POOLS: Record<ShopRarity, ShopReward[]> = {
  nothing: [{ kind: "nothing" }],
  common: [
    { kind: "wood", amount: 25 },
    { kind: "ammo", magazines: 2 },
    { kind: "mines", count: 2 },
    { kind: "maxHp", pct: 0.05 },
    { kind: "speed", pct: 0.04 },
    { kind: "regen", perSec: 0.3 },
    { kind: "repair", pct: 0.2 },
  ],
  rare: [
    { kind: "coins", amount: 75 },
    { kind: "ammo", magazines: 4 },
    { kind: "mines", count: 4 },
    { kind: "maxHp", pct: 0.1 },
    { kind: "speed", pct: 0.06 },
    { kind: "regen", perSec: 0.8 },
    { kind: "repair", pct: 0.4 },
    { kind: "weapon", weaponId: "hunting" },
    { kind: "weapon", weaponId: "scattergun" },
    { kind: "skin", skinId: "skier" },
    { kind: "skin", skinId: "viking" },
    { kind: "skin", skinId: "zombie" },
    { kind: "skin", skinId: "knight" },
    { kind: "skin", skinId: "chef" },
  ],
  epic: [
    { kind: "coins", amount: 150 },
    { kind: "mines", count: 8 },
    { kind: "towerSlot" },
    { kind: "towerTier", tier: 3 },
    { kind: "weapon", weaponId: "pipeGun" },
    { kind: "weapon", weaponId: "boneBow" },
    { kind: "skin", skinId: "werewolf" },
    { kind: "skin", skinId: "snowman" },
    { kind: "skin", skinId: "yeti" },
    { kind: "skin", skinId: "pumpkin" },
  ],
  legendary: [
    { kind: "coins", amount: 400 },
    { kind: "weapon", weaponId: "iceLance" },
    { kind: "skin", skinId: "santa" },
    { kind: "skin", skinId: "astronaut" },
    { kind: "skin", skinId: "penguin" },
  ],
};

/** Cufărul lăsat de boss: mereu ceva rar (epic sau legendar). */
export const CHEST_POOL: { rarity: Rarity; reward: ShopReward }[] = [
  { rarity: "epic", reward: { kind: "towerTier", tier: 3 } },
  { rarity: "epic", reward: { kind: "towerSlot" } },
  { rarity: "epic", reward: { kind: "weapon", weaponId: "pipeGun" } },
  { rarity: "epic", reward: { kind: "weapon", weaponId: "boneBow" } },
  { rarity: "epic", reward: { kind: "mines", count: 8 } },
  { rarity: "legendary", reward: { kind: "weapon", weaponId: "iceLance" } },
  { rarity: "legendary", reward: { kind: "skin", skinId: "santa" } },
  { rarity: "legendary", reward: { kind: "skin", skinId: "penguin" } },
  { rarity: "epic", reward: { kind: "skin", skinId: "werewolf" } },
];
