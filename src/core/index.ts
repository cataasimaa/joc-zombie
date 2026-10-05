// Punctul de intrare public al logicii de joc. Restul aplicației importă doar de aici.
export { GameSimulation } from "./Game";
export type { GameOptions, PlayerSetup } from "./Game";
export type { BuildKind, Command } from "./commands";
export { CONFIG } from "./config";
export type { HeroClass, Rarity, ShopRarity, ZombieType } from "./config";
export { ABILITY, DEFAULT_SKIN_COLOR, HERO_DEFS, SKINS } from "./heroDefs";
export type { AbilityDef, AbilityId, HeroDef, SkinDef } from "./heroDefs";
export { SHOP_POOLS, WEAPONS } from "./items";
export type { ShopReward, WeaponDef, WeaponId } from "./items";
export { GAME_MAP } from "./map";
export type { GameMap, House, Rock, Tree } from "./map";
export { segmentEnds } from "./math";
export type { Vec2 } from "./math";
export { abilityBlockedReason } from "./systems/abilities";
export {
  barricadeAt,
  barricadeEnds,
  barricadeSlots,
  barricadeSpotProblem,
  barricadesOf,
  canBuildBarricade,
  canMoveBarricade,
  canUpgradeBarricade,
  defaultBarricadeRotation,
  nextInChain,
  snapBarricade,
} from "./systems/barricades";
export { heroById, heroRange, xpToNextLevel } from "./systems/heroes";
export { canPlaceMine } from "./systems/mines";
export { canShopRoll } from "./systems/shop";
export { canBuildTower, canUpgradeTower, towerAt, towerCost, towerSlots, towersOf } from "./systems/towers";
export type * from "./types";
