// Bara rapidă: 4 locuri pe care le aranjezi cum vrei (din inventar).
// Într-un loc poate sta: o armă pe care o ai, târnăcopul, lanterna, minele, mâncare sau pește.
// Apăsat: arma / târnăcopul îl iei în mână (pe arma din mână: următoarea armă pe care o ai), lanterna o aprinzi / stingi, mina o pui, mâncarea o mănânci.

import { FISH_KINDS, type GameMode, type ItemKind } from "../config";
import { WEAPONS, type WeaponId } from "../items";
import type { GameEvent, GameState, Hero, Player, PlayerId, SlotItem } from "../types";
import { gunStats, heroById } from "./heroes";
import { placeMine } from "./mines";
import { useItem } from "./survival";

export const HOTBAR_SIZE = 4;

const FOOD: ItemKind[] = ["cookedMeat", "rawMeat", "canteen", "oil", ...FISH_KINDS];

/** Bara de start: arma, târnăcopul, apoi canistra + mâncare (Supraviețuire) sau undița + lanterna. */
export function defaultHotbar(mode: GameMode): (SlotItem | null)[] {
  return mode === "survival" ? ["weapon:rusty", "pickaxe", "canteen", "cookedMeat"] : ["weapon:rusty", "pickaxe", "rod", "lantern"];
}

/** Poate jucătorul să pună asta în bară? (Armele doar dacă le are.) */
export function canHold(player: Player, item: SlotItem): boolean {
  if (item.startsWith("weapon:")) return player.weapons.includes(item.slice(7) as WeaponId);
  if (item === "chainsaw") return player.chainsaw;
  return item === "pickaxe" || item === "rod" || item === "lantern" || item === "mine" || FOOD.includes(item as ItemKind);
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
    const weapon = item.slice(7) as WeaponId;
    // Încă o apăsare pe arma din mână = următoarea armă (pistol → pușcă → ...).
    if (player.tool === "gun" && player.weapon === weapon && cycleWeapon(state, player, hero, slot, weapon)) {
      events.push({ type: "equipped", playerId, item: player.hotbar[slot]! });
      return true;
    }
    equipWeapon(state, player, hero, weapon);
  } else if (item === "pickaxe" || item === "chainsaw" || item === "rod" || item === "lantern") {
    if (item === "chainsaw" && !player.chainsaw) return false;
    // Unealta în mână (butonul ✛ o folosește); încă o apăsare pe același loc = înapoi la armă.
    player.tool = player.tool === item ? "gun" : item;
    hero.firing = false;
  } else if (item === "mine") {
    return placeMine(state, playerId);
  } else {
    return useItem(state, playerId, item as ItemKind, events);
  }
  events.push({ type: "equipped", playerId, item });
  return true;
}

/**
 * O armă nouă (din magazin / cufăr / nivel): rămâne pentru totdeauna în `player.weapons` (🎒).
 * BUG vechi: bara are 4 locuri pline de la start, deci arma nouă nu încăpea în bară, dar era luată
 * în mână; prima apăsare pe locul armei (țeava) o schimba înapoi și arma nouă „dispărea”.
 * Acum: dacă e cel puțin la fel de bună ca arma din mână, o iei în mână și îi ia locul în bară
 * (cea veche rămâne în 🎒 și o găsești apăsând din nou pe locul armei); dacă e mai slabă, intră
 * doar într-un loc liber (sau rămâne în 🎒) și nu-ți schimbă arma din mână.
 */
export function giveWeapon(state: GameState, player: Player, weapon: WeaponId, source: "won" | "level" = "won"): void {
  if (!player.weapons.includes(weapon)) player.weapons.push(weapon);
  const key: SlotItem = `weapon:${weapon}`;
  // O armă câștigată (magazin / cufăr) o iei în mână dacă e cel puțin la fel de bună; una primită
  // la nivel doar dacă e strict mai bună (pușca de la nv. 4 nu-ți ia din mână flinta câștigată).
  const r = WEAPONS[weapon].rank;
  const cur = WEAPONS[player.weapon].rank;
  const better = source === "won" ? r >= cur : r > cur;
  if (!player.hotbar.includes(key)) {
    const current = player.hotbar.indexOf(`weapon:${player.weapon}`);
    const empty = player.hotbar.indexOf(null);
    if (better && current >= 0) player.hotbar[current] = key;
    else if (empty >= 0) player.hotbar[empty] = key;
    else if (better) {
      // Arma din mână nu era în bară: luăm locul celei mai slabe arme din bară (dacă există).
      const worst = weakestWeaponSlot(player);
      if (worst >= 0) player.hotbar[worst] = key;
    }
  }
  if (better) equipWeapon(state, player, heroById(state, player.heroId), weapon);
}

function weakestWeaponSlot(player: Player): number {
  let best = -1;
  let bestRank = Infinity;
  player.hotbar.forEach((item, i) => {
    if (!item?.startsWith("weapon:")) return;
    const r = WEAPONS[item.slice(7) as WeaponId].rank;
    if (r < bestRank) {
      bestRank = r;
      best = i;
    }
  });
  return best;
}

/**
 * Apăsat pe locul armei când o ai deja în mână: treci la următoarea armă pe care o ai (și care nu
 * stă deja în alt loc din bară); locul din bară arată acum arma nouă. Așa nu se pierde nicio armă.
 */
function cycleWeapon(state: GameState, player: Player, hero: Hero, slot: number, current: WeaponId): boolean {
  const n = player.weapons.length;
  const start = player.weapons.indexOf(current);
  for (let i = 1; i < n; i++) {
    const next = player.weapons[(start + i + n) % n];
    if (player.hotbar.includes(`weapon:${next}`)) continue;
    player.hotbar[slot] = `weapon:${next}`;
    equipWeapon(state, player, hero, next);
    return true;
  }
  return false;
}
