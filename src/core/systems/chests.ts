// Cuferele: plătești monede, primești o recompensă de o anumită raritate.
// Tragerea la sorți se face în core (pe server în multiplayer), cu RNG-ul din stare.

import { CONFIG, type Rarity } from "../config";
import { SKINS } from "../heroDefs";
import { nextRandom } from "../math";
import type { ChestReward, GameEvent, GameState, Player, PlayerId } from "../types";

export function canOpenChest(state: GameState, playerId: PlayerId): string | null {
  const player = state.players[playerId];
  if (!player) return "Jucător necunoscut";
  if (state.phase === "gameover" || state.phase === "victory") return "Jocul s-a terminat";
  if (player.coins < CONFIG.chest.cost) return `Ai nevoie de ${CONFIG.chest.cost} monede`;
  return null;
}

export function openChest(state: GameState, playerId: PlayerId, events: GameEvent[]): boolean {
  if (canOpenChest(state, playerId) !== null) return false;
  const player = state.players[playerId];
  player.coins -= CONFIG.chest.cost;

  const rarity = rollRarity(nextRandom(state));
  const reward = rollReward(state, player, rarity);
  applyReward(player, reward);
  events.push({ type: "chestOpened", playerId, rarity, reward });
  return true;
}

/** Transformă un număr 0..1 într-o raritate, după șansele din config. */
export function rollRarity(roll: number): Rarity {
  let acc = 0;
  for (const { rarity, chance } of CONFIG.chest.odds) {
    acc += chance;
    if (roll < acc) return rarity;
  }
  return CONFIG.chest.odds[CONFIG.chest.odds.length - 1].rarity;
}

function rollReward(state: GameState, player: Player, rarity: Rarity): ChestReward {
  const weapon: ChestReward = { kind: "weapon", bonus: CONFIG.chest.weaponBonus[rarity] };
  const tier = { common: 1, rare: 2, epic: 3, legendary: 4 }[rarity];
  const options: ChestReward[] = [weapon];

  if (rarity === "common") options.push({ kind: "wood", amount: CONFIG.chest.commonWood });
  // Tier de turn nou (doar dacă e mai mare decât ce ai deja).
  if (tier > player.towerTier) options.push({ kind: "towerTier", tier });
  // Skin de raritatea asta pe care nu-l ai încă.
  for (const skin of SKINS) {
    if (skin.rarity === rarity && !player.skins.includes(skin.id)) options.push({ kind: "skin", skinId: skin.id });
  }
  return options[Math.floor(nextRandom(state) * options.length)];
}

function applyReward(player: Player, reward: ChestReward): void {
  switch (reward.kind) {
    case "wood":
      player.wood += reward.amount;
      break;
    case "weapon":
      player.weaponBonus += reward.bonus;
      break;
    case "towerTier":
      player.towerTier = Math.max(player.towerTier, reward.tier);
      break;
    case "skin":
      player.skins.push(reward.skinId);
      player.skin = reward.skinId; // îl echipăm automat
      break;
  }
}
