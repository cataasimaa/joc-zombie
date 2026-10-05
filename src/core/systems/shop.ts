// Magazinul: plătești monede și încerci-ți norocul. Poți primi nimic, mine, HP, viteză,
// regenerare, reparat mai rapid, turnuri sau arme. Tragerea la sorți se face în core
// (pe server în multiplayer), cu RNG-ul din stare.

import { CONFIG, type ShopRarity } from "../config";
import { SHOP_POOLS, type ShopReward, WEAPONS } from "../items";
import { nextRandom } from "../math";
import type { GameEvent, GameState, Player, PlayerId } from "../types";
import { heroById, recomputeMaxHp } from "./heroes";

const RARITY_RANK = { start: 0, common: 1, rare: 2, epic: 3, legendary: 4 } as const;

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
  applyReward(state, player, reward);
  events.push({ type: "shopRoll", playerId, rarity, reward });
  return true;
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

/** Nu dăm ceva ce jucătorul are deja sau care a atins limita. */
function isUseful(player: Player, r: ShopReward): boolean {
  switch (r.kind) {
    case "towerTier":
      return r.tier > player.towerTier;
    case "weapon":
      return RARITY_RANK[WEAPONS[r.weaponId].rarity] > RARITY_RANK[WEAPONS[player.weapon].rarity] ||
        (RARITY_RANK[WEAPONS[r.weaponId].rarity] === RARITY_RANK[WEAPONS[player.weapon].rarity] && r.weaponId !== player.weapon);
    case "skin":
      return !player.skins.includes(r.skinId);
    case "speed":
      return player.speedBonus < CONFIG.shop.maxSpeedBonus;
    case "repair":
      return player.repairBonus < CONFIG.shop.maxRepairBonus;
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
      player.speedBonus = Math.min(CONFIG.shop.maxSpeedBonus, player.speedBonus + r.pct);
      break;
    case "regen":
      player.regenPerSec += r.perSec;
      break;
    case "repair":
      player.repairBonus = Math.min(CONFIG.shop.maxRepairBonus, player.repairBonus + r.pct);
      break;
    case "towerSlot":
      player.extraTowerSlots++;
      break;
    case "towerTier":
      player.towerTier = Math.max(player.towerTier, r.tier);
      break;
    case "weapon":
      player.weapon = r.weaponId;
      break;
    case "skin":
      player.skins.push(r.skinId);
      player.skin = r.skinId; // îl echipăm automat
      break;
  }
}
