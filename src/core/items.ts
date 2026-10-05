// Armele și recompensele din magazin (gambling).

import type { Rarity, ShopRarity } from "./config";

export type WeaponId = "rusty" | "hunting" | "scattergun" | "pipeGun" | "boneBow" | "iceLance";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  rarity: Rarity | "start";
  /** Multiplicatori față de atacul de bază al eroului. */
  damage: number;
  interval: number;
  range: number;
  /** Câte ținte în plus lovește fiecare glonț (alice). */
  extraTargets: number;
  /** Încetinește zombiul lovit (secunde). */
  slow: number;
  description: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rusty: {
    id: "rusty", name: "Țeava ruginită", rarity: "start",
    damage: 1, interval: 1, range: 0, extraTargets: 0, slow: 0,
    description: "Arma cu care ai pornit.",
  },
  hunting: {
    id: "hunting", name: "Pușcă de vânătoare", rarity: "rare",
    damage: 1.3, interval: 1.05, range: 2, extraTargets: 0, slow: 0,
    description: "+30% damage, rază mai mare.",
  },
  scattergun: {
    id: "scattergun", name: "Flintă cu alice", rarity: "rare",
    damage: 0.8, interval: 1.1, range: -2, extraTargets: 2, slow: 0,
    description: "Lovește încă 2 zombi la fiecare foc.",
  },
  pipeGun: {
    id: "pipeGun", name: "Mitralieră din țevi", rarity: "epic",
    damage: 0.95, interval: 0.6, range: 0, extraTargets: 0, slow: 0,
    description: "Trage mult mai des.",
  },
  boneBow: {
    id: "boneBow", name: "Arbaletă de os", rarity: "epic",
    damage: 1.9, interval: 1.25, range: 4, extraTargets: 1, slow: 0,
    description: "Săgeți grele care trec printr-un zombie.",
  },
  iceLance: {
    id: "iceLance", name: "Lancea de gheață", rarity: "legendary",
    damage: 2, interval: 0.9, range: 3, extraTargets: 1, slow: 1.5,
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
