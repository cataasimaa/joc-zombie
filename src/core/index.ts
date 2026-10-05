// Punctul de intrare public al logicii de joc. Restul aplicației importă doar de aici.
export { GameSimulation } from "./Game";
export type { GameOptions, PlayerSetup } from "./Game";
export type { BuildKind, Command } from "./commands";
export { CONFIG } from "./config";
export type { HeroClass, Rarity, ZombieType } from "./config";
export { ABILITY, DEFAULT_SKIN_COLOR, HERO_DEFS, SKINS } from "./heroDefs";
export type { AbilityDef, AbilityId, HeroDef, SkinDef } from "./heroDefs";
export { GAME_MAP } from "./map";
export type { Vec2 } from "./math";
export { abilityBlockedReason } from "./systems/abilities";
export { canOpenChest } from "./systems/chests";
export { heroById, xpToNextLevel } from "./systems/heroes";
export { buildCost, builtBy, canBuild, canUpgradeTower, slotsFor, towerAt } from "./systems/towers";
export type * from "./types";
