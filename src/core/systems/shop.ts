// Magazinul: plătești monede și încerci-ți norocul. Poți primi nimic, mine, HP, viteză,
// regenerare, reparat mai rapid, turnuri sau arme. Tragerea la sorți se face în core
// (pe server în multiplayer), cu RNG-ul din stare.

import { CONFIG, type Rarity, type ShopRarity } from "../config";
import { CHEST_POOL, REPEATABLE, SHOP_POOLS, type ShopReward, rewardKey } from "../items";
import { nextRandom } from "../math";
import type { Chest, GameEvent, GameState, Hero, Player, PlayerId } from "../types";
import { gunStats, heroById, recomputeMaxHp } from "./heroes";
import { giveWeapon } from "./hotbar";


export function canShopRoll(state: GameState, playerId: PlayerId): string | null {
  const player = state.players[playerId];
  if (!player) return "Jucător necunoscut";
  if (state.phase === "gameover" || state.phase === "victory") return "Jocul s-a terminat";
  if (player.coins < CONFIG.shop.cost) return `Ai nevoie de ${CONFIG.shop.cost} monede`;
  return null;
}

export function shopRoll(state: GameState, playerId: PlayerId, events: GameEvent[]): boolean {
  if (canShopRoll(state, playerId) !== null) return false;
  const player = state.players[playerId];
  player.coins -= CONFIG.shop.cost;

  const rarity = rollRarity(nextRandom(state));
  const options = SHOP_POOLS[rarity].filter((r) => isUseful(player, r));
  const reward: ShopReward = options.length > 0
    ? options[Math.floor(nextRandom(state) * options.length)]
    : { kind: "wood", amount: 25 }; // tot ce era la raritatea asta îl ai deja
  grantReward(state, player, reward);
  events.push({ type: "shopRoll", playerId, rarity, reward });
  return true;
}

/**
 * Cufărul boss-ului a fost spart: o recompensă epică/legendară pe care nu o ai, plus lemn,
 * gloanțe și carne friptă pentru jucătorul care l-a deschis.
 */
export function openBossChest(state: GameState, chest: Chest, hero: Hero, events: GameEvent[]): void {
  const player = state.players[hero.playerId];
  const { rarity, reward } = openChest(state, player);
  const c = CONFIG.chest;
  player.wood += c.wood;
  const gun = gunStats(state, hero);
  const ammo = c.ammoMagazines * gun.magazine;
  hero.reserve = Math.min(gun.magazine * CONFIG.ammo.maxMagazines, hero.reserve + ammo);
  player.inventory.cookedMeat += c.meat;
  events.push({ type: "chestOpened", playerId: player.id, pos: { ...chest.pos }, rarity, reward, wood: c.wood, ammo, meat: c.meat });
}

/** O recompensă epică sau legendară pe care jucătorul nu o are încă. */
export function openChest(state: GameState, player: Player): { rarity: Rarity; reward: ShopReward } {
  const options = CHEST_POOL.filter((o) => isUseful(player, o.reward));
  const pick = options.length > 0
    ? options[Math.floor(nextRandom(state) * options.length)]
    : { rarity: "epic" as Rarity, reward: { kind: "coins", amount: 150 } as ShopReward };
  grantReward(state, player, pick.reward);
  return pick;
}

function grantReward(state: GameState, player: Player, reward: ShopReward): void {
  applyReward(state, player, reward);
  if (!REPEATABLE.includes(reward.kind)) player.unlocked.push(rewardKey(reward));
}

/** Transformă un număr 0..1 într-o raritate, după șansele din config. */
export function rollRarity(roll: number): ShopRarity {
  let acc = 0;
  for (const { rarity, chance } of CONFIG.shop.odds) {
    acc += chance;
    if (roll < acc) return rarity;
  }
  return CONFIG.shop.odds[CONFIG.shop.odds.length - 1].rarity;
}

/** Nu dăm ceva ce jucătorul are deja: fiecare premiu (în afară de lemn și mine) se câștigă o dată pe rundă. */
function isUseful(player: Player, r: ShopReward): boolean {
  if (player.unlocked.includes(rewardKey(r))) return false;
  switch (r.kind) {
    case "towerTier":
      return r.tier > player.towerTier;
    case "weapon":
      // O armă pe care n-o ai încă (o pui în bara rapidă unde vrei).
      return !player.weapons.includes(r.weaponId);
    case "skin":
      return !player.skins.includes(r.skinId);
    default:
      return true;
  }
}

function applyReward(state: GameState, player: Player, r: ShopReward): void {
  switch (r.kind) {
    case "nothing":
      break;
    case "wood":
      player.wood += r.amount;
      break;
    case "coins":
      player.coins += r.amount;
      break;
    case "ammo": {
      const hero = heroById(state, player.heroId);
      if (hero) {
        const gun = gunStats(state, hero);
        hero.reserve = Math.min(gun.magazine * CONFIG.ammo.maxMagazines, hero.reserve + r.magazines * gun.magazine);
      }
      break;
    }
    case "mines":
      player.mines += r.count;
      break;
    case "maxHp": {
      player.maxHpBonus += r.pct;
      const hero = heroById(state, player.heroId);
      if (hero) recomputeMaxHp(state, hero);
      break;
    }
    case "speed":
      player.speedBonus += r.pct;
      break;
    case "regen":
      player.regenPerSec += r.perSec;
      break;
    case "repair":
      player.repairBonus += r.pct;
      break;
    case "towerSlot":
      player.extraTowerSlots++;
      break;
    case "towerTier":
      player.towerTier = Math.max(player.towerTier, r.tier);
      break;
    case "weapon": {
      giveWeapon(state, player, r.weaponId);
      // Arma nouă vine cu încărcătorul plin.
      const hero = heroById(state, player.heroId);
      if (hero) hero.ammo = gunStats(state, hero).magazine;
      break;
    }
    case "skin":
      player.skins.push(r.skinId);
      player.skin = r.skinId; // îl echipăm automat
      break;
  }
}

/** Ce mai poate câștiga jucătorul la fiecare raritate (pentru lista din magazin). */
export function shopRemaining(player: Player): Record<ShopRarity, ShopReward[]> {
  const out = {} as Record<ShopRarity, ShopReward[]>;
  for (const [rarity, pool] of Object.entries(SHOP_POOLS) as [ShopRarity, ShopReward[]][]) {
    out[rarity] = pool.filter((r) => isUseful(player, r));
  }
  return out;
}
