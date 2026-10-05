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
    damage: 1.35, interval: 1.1, range: 3, pellets: 0, pierce: 1, magazine: 0.6, reload: 1, slow: 0,
    description: "Damage mare, glonțul trece prin doi zombi.",
  },
  scattergun: {
    id: "scattergun", name: "Flintă cu alice", rarity: "rare",
    damage: 0.7, interval: 1.3, range: -3, pellets: 4, pierce: 0, magazine: 0.4, reload: 1.2, slow: 0,
    description: "Un nor de alice: devastatoare de aproape.",
  },
  pipeGun: {
    id: "pipeGun", name: "Mitralieră din țevi", rarity: "epic",
    damage: 0.9, interval: 0.55, range: 0, pellets: 0, pierce: 0, magazine: 2, reload: 1.3, slow: 0,
    description: "Trage foarte des, încărcător dublu.",
  },
  boneBow: {
    id: "boneBow", name: "Arbaletă de os", rarity: "epic",
    damage: 2.2, interval: 1.4, range: 4, pellets: 0, pierce: 2, magazine: 0.35, reload: 0.8, slow: 0,
    description: "Săgeți grele care trec prin trei zombi.",
  },
  iceLance: {
    id: "iceLance", name: "Lancea de gheață", rarity: "legendary",
    damage: 2, interval: 0.9, range: 3, pellets: 0, pierce: 1, magazine: 1, reload: 0.9, slow: 1.5,
    description: "Damage uriaș și îngheață ce lovește.",
  },
};

export type ShopReward =
  | { kind: "nothing" }
  | { kind: "wood"; amount: number }
  | { kind: "mines"; count: number }
  | { kind: "maxHp"; pct: number }
  | { kind: "speed"; pct: number }
  | { kind: "regen"; perSec: number }
  | { kind: "repair"; pct: number }
  | { kind: "towerSlot" }
  | { kind: "towerTier"; tier: number }
  | { kind: "weapon"; weaponId: WeaponId }
  | { kind: "skin"; skinId: string };

/** Recompensele care se pot repeta (consumabile). Restul se primesc o singură dată pe rundă. */
export const REPEATABLE: ShopReward["kind"][] = ["nothing", "wood", "mines"];

/** Cheie unică pentru o recompensă (ca să știm ce ai câștigat deja în runda asta). */
export const rewardKey = (r: ShopReward): string => JSON.stringify(r);

/** Ce poți primi la fiecare raritate (tragem la sorți una dintre variante). */
export const SHOP_POOLS: Record<ShopRarity, ShopReward[]> = {
  nothing: [{ kind: "nothing" }],
  common: [
    { kind: "wood", amount: 25 },
    { kind: "mines", count: 2 },
    { kind: "maxHp", pct: 0.1 },
    { kind: "speed", pct: 0.06 },
    { kind: "regen", perSec: 0.5 },
    { kind: "repair", pct: 0.25 },
  ],
  rare: [
    { kind: "mines", count: 4 },
    { kind: "maxHp", pct: 0.2 },
    { kind: "speed", pct: 0.1 },
    { kind: "regen", perSec: 1.5 },
    { kind: "repair", pct: 0.5 },
    { kind: "towerTier", tier: 2 },
    { kind: "weapon", weaponId: "hunting" },
    { kind: "weapon", weaponId: "scattergun" },
    { kind: "skin", skinId: "hunter" },
    { kind: "skin", skinId: "ember" },
  ],
  epic: [
    { kind: "mines", count: 6 },
    { kind: "regen", perSec: 3 },
    { kind: "towerSlot" },
    { kind: "towerTier", tier: 3 },
    { kind: "weapon", weaponId: "pipeGun" },
    { kind: "weapon", weaponId: "boneBow" },
    { kind: "skin", skinId: "arctic" },
    { kind: "skin", skinId: "shadow" },
  ],
  legendary: [
    { kind: "towerTier", tier: 4 },
    { kind: "weapon", weaponId: "iceLance" },
    { kind: "skin", skinId: "gold" },
  ],
};
