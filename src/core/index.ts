// Punctul de intrare public al logicii de joc. Restul aplicației importă doar de aici.
export { GameSimulation } from "./Game";
export type { GameOptions, PlayerSetup } from "./Game";
export type { BuildKind, Command } from "./commands";
export { CONFIG } from "./config";
export type { AnimalKind, Difficulty, GameMode, HeroClass, ItemKind, Rarity, ShopRarity, TowerKind, Weather, ZombieType } from "./config";
export { DEFAULT_SKIN_COLOR, HERO_DEFS, SKINS } from "./heroDefs";
export type { HeroDef, SkinAccessory, SkinDef } from "./heroDefs";
export { CHEST_POOL, REPEATABLE, SHOP_POOLS, WEAPONS, rewardKey } from "./items";
export type { ShopReward, WeaponDef, WeaponId } from "./items";
export { GAME_MAP } from "./map";
export type { GameMap, House, Rock, Tree } from "./map";
export { segmentEnds } from "./math";
export type { Vec2 } from "./math";
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
export { gunStats, heroById, heroRange, traceBullet, xpToNextLevel } from "./systems/heroes";
export type { GunStats } from "./systems/heroes";
export { canPlaceMine } from "./systems/mines";
export { canShopRoll, shopRemaining } from "./systems/shop";
export { buildingAt, buildingCost, canAddFuel, canBuildBuilding, litFireNear } from "./systems/survival";
export type { BuildingKind } from "./systems/survival";
export {
  canBuildTower,
  canUpgradeTower,
  towerAt,
  towerCost,
  towerRefund,
  towerSlots,
  towerStats,
  towerUpgradeCost,
  towersOf,
} from "./systems/towers";
export type * from "./types";
