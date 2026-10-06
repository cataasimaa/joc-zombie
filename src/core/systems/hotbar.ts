// Bara rapidă: 4 locuri pe care le aranjezi cum vrei (din inventar).
// Într-un loc poate sta: o armă pe care o ai, târnăcopul, lanterna, minele, mâncare sau pește.
// Apăsat: arma / târnăcopul îl iei în mână, lanterna o aprinzi / stingi, mina o pui, mâncarea o mănânci.

import { FISH_KINDS, type GameMode, type ItemKind } from "../config";
import type { WeaponId } from "../items";
import type { GameEvent, GameState, Hero, Player, PlayerId, SlotItem } from "../types";
import { gunStats, heroById } from "./heroes";
import { placeMine } from "./mines";
import { useItem } from "./survival";

export const HOTBAR_SIZE = 4;

const FOOD: ItemKind[] = ["cookedMeat", "rawMeat", ...FISH_KINDS];

/** Bara de start: arma, târnăcopul, apoi mâncare (Supraviețuire) sau mină + lanternă. */
export function defaultHotbar(mode: GameMode): (SlotItem | null)[] {
  return mode === "survival" ? ["weapon:rusty", "pickaxe", "cookedMeat", "rawMeat"] : ["weapon:rusty", "pickaxe", "mine", "lantern"];
}

/** Poate jucătorul să pună asta în bară? (Armele doar dacă le are.) */
export function canHold(player: Player, item: SlotItem): boolean {
  if (item.startsWith("weapon:")) return player.weapons.includes(item.slice(7) as WeaponId);
  return item === "pickaxe" || item === "lantern" || item === "mine" || FOOD.includes(item as ItemKind);
}

export function setSlot(state: GameState, playerId: PlayerId, slot: number, item: SlotItem | null): boolean {
  const player = state.players[playerId];
  if (!player || slot < 0 || slot >= HOTBAR_SIZE || !Number.isInteger(slot)) return false;
  if (item !== null && !canHold(player, item)) return false;
  // Același lucru nu stă în două locuri: dacă era în alt loc, cele două locuri se schimbă între ele.
  const prev = item === null ? -1 : player.hotbar.indexOf(item);
  if (prev >= 0 && prev !== slot) player.hotbar[prev] = player.hotbar[slot];
  player.hotbar[slot] = item;
  return true;
}

/** Ia arma în mână (încărcătorul nu poate fi mai mare decât al armei noi). */
export function equipWeapon(state: GameState, player: Player, hero: Hero | undefined, weapon: WeaponId): void {
  player.weapon = weapon;
  player.tool = "gun";
  if (!hero) return;
  const mag = gunStats(state, hero).magazine;
  if (hero.ammo > mag) {
    hero.reserve += hero.ammo - mag;
    hero.ammo = mag;
  }
  hero.reloadTimer = 0;
}

export function useSlot(state: GameState, playerId: PlayerId, slot: number, events: GameEvent[]): boolean {
  const player = state.players[playerId];
  const item = player?.hotbar[slot];
  const hero = player && heroById(state, player.heroId);
  if (!player || !item || !hero || !hero.alive) return false;
  if (item.startsWith("weapon:")) {
    equipWeapon(state, player, hero, item.slice(7) as WeaponId);
  } else if (item === "pickaxe") {
    // Târnăcopul în mână; încă o apăsare = înapoi la armă.
    player.tool = player.tool === "pickaxe" ? "gun" : "pickaxe";
    hero.firing = false;
  } else if (item === "lantern") {
    hero.lantern = !hero.lantern;
  } else if (item === "mine") {
    return placeMine(state, playerId);
  } else {
    return useItem(state, playerId, item as ItemKind, events);
  }
  events.push({ type: "equipped", playerId, item });
  return true;
}

/** O armă nouă (din magazin / cufăr): o ai în inventar, o iei în mână și ocupă un loc liber din bară. */
export function giveWeapon(state: GameState, player: Player, weapon: WeaponId): void {
  if (!player.weapons.includes(weapon)) player.weapons.push(weapon);
  equipWeapon(state, player, heroById(state, player.heroId), weapon);
  const key: SlotItem = `weapon:${weapon}`;
  if (player.hotbar.includes(key)) return;
  const empty = player.hotbar.indexOf(null);
  if (empty >= 0) player.hotbar[empty] = key;
}

