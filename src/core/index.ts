// Punctul de intrare public al logicii de joc. Restul aplicației importă doar de aici.
export { GameSimulation } from "./Game";
export type { GameOptions } from "./Game";
export type { Command } from "./commands";
export { CONFIG } from "./config";
export { GAME_MAP } from "./map";
export type { Vec2 } from "./math";
export { canPlaceTower, slotsFor, towersOwnedBy } from "./systems/towers";
export type * from "./types";
