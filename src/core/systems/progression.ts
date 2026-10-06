// Progresul eroului: la fiecare nivel primești un punct de abilitate și alegi ce crești
// (tăiat, minerit, pescuit, tras). Treptele 3 și 5 dau câte o pasivă (un bonus mare).
// Tot aici: ce deblochezi cu nivelul (pistol, pușcă, drujbă, pușcă de asalt, turnuri mai bune)
// și armurile (cască, piept, pantaloni, papuci) din piele sau metal.

import { ARMOR_SLOTS, type ArmorMaterial, type ArmorSlot, CONFIG, type SkillId } from "../config";
import type { GameEvent, GameState, Hero, PlayerId } from "../types";
import { heroById } from "./heroes";
import { giveWeapon } from "./hotbar";

const K = CONFIG.skills;

/** Treapta unei abilități (0..5). */
export const rank = (hero: Hero, skill: SkillId): number => hero.skills?.[skill] ?? 0;
/** Pasiva de la treapta `at` (3 sau 5) e activă? */
export const hasPassive = (hero: Hero, skill: SkillId, at: 3 | 5): boolean => rank(hero, skill) >= at;

/** Ce face fiecare abilitate (pentru meniul de nivel). */
export const SKILL_INFO: Record<SkillId, { icon: string; name: string; perRank: string; passive3: string; passive5: string }> = {
  chop: {
    icon: "🪓", name: "Tăiat copaci", perRank: "+12% viteză la tăiat",
    passive3: "Tăietor: +1 lemn la fiecare lovitură", passive5: "Pădurar: bradul cade de 2× mai repede",
  },
  mine: {
    icon: "⛏️", name: "Minerit", perRank: "+12% viteză la spart piatră",
    passive3: "Ochi de aur: +50% aur din zăcăminte", passive5: "Miner: +1 ulei / fier din fiecare zăcământ",
  },
  fish: {
    icon: "🎣", name: "Pescuit", perRank: "+10% timp, smucituri −10%",
    passive3: "Mână sigură: smuciturile la jumătate", passive5: "Pescar: peștele se vinde cu 50% mai scump",
  },
  shoot: {
    icon: "🎯", name: "Tras cu arma", perRank: "+6% damage",
    passive3: "Mână rapidă: reîncarci cu 25% mai repede", passive5: "Ochi de vultur: 15% lovituri critice (×2)",
  },
};

export function canLearnSkill(state: GameState, playerId: PlayerId, skill: SkillId): string | null {
  const player = state.players[playerId];
  const hero = player && heroById(state, player.heroId);
  if (!hero) return "Erou necunoscut";
  if (hero.skillPoints <= 0) return "N-ai puncte (crește în nivel)";
  if (rank(hero, skill) >= K.maxRank) return "Treapta maximă";
  return null;
}

export function learnSkill(state: GameState, playerId: PlayerId, skill: SkillId, events: GameEvent[]): boolean {
  if (canLearnSkill(state, playerId, skill) !== null) return false;
  const hero = heroById(state, state.players[playerId].heroId)!;
  hero.skillPoints--;
  hero.skills[skill]++;
  const r = hero.skills[skill];
  events.push({ type: "skillLearned", heroId: hero.id, skill, rank: r, passive: r === 3 || r === 5 });
  return true;
}

/** Ce primești când crește nivelul: un punct de abilitate + arme / unelte / turnuri la anumite niveluri. */
export function onLevelUp(state: GameState, hero: Hero, events: GameEvent[]): void {
  hero.skillPoints++;
  const player = state.players[hero.playerId];
  if (!player) return;
  const U = CONFIG.levelUnlocks;
  const weapon = (id: "pistol" | "rifle" | "assaultRifle", at: number) => {
    if (hero.level >= at && !player.weapons.includes(id)) {
      giveWeapon(state, player, id, "level");
      events.push({ type: "unlocked", playerId: player.id, what: id });
    }
  };
  weapon("pistol", U.pistol);
  weapon("rifle", U.rifle);
  weapon("assaultRifle", U.assaultRifle);
  if (hero.level >= U.chainsaw && !player.chainsaw) {
    player.chainsaw = true;
    // Drujba vine cu un bidon de benzină și ia locul târnăcopului în bară (dacă e acolo).
    player.inventory.petrol += 2;
    const slot = player.hotbar.indexOf("pickaxe");
    if (slot >= 0 && !player.hotbar.includes("chainsaw")) player.hotbar[slot] = "chainsaw";
    else if (!player.hotbar.includes("chainsaw") && player.hotbar.includes(null)) player.hotbar[player.hotbar.indexOf(null)] = "chainsaw";
    if (player.tool === "pickaxe") player.tool = "chainsaw";
    events.push({ type: "unlocked", playerId: player.id, what: "chainsaw" });
  }
  const tiers = CONFIG.tower.tierAtHeroLevel;
  for (let tier = 3; tier < tiers.length; tier++) {
    if (hero.level >= tiers[tier] && player.towerTier < tier) {
      player.towerTier = tier;
      events.push({ type: "unlocked", playerId: player.id, what: "towerTier", tier });
    }
  }
}

// ---------- Armuri ----------

export function armorCost(slot: ArmorSlot, material: ArmorMaterial): { leather: number; iron: number } {
  return CONFIG.armor[material].cost[slot];
}

export function canCraftArmor(state: GameState, playerId: PlayerId, slot: ArmorSlot, material: ArmorMaterial): string | null {
  const player = state.players[playerId];
  const hero = player && heroById(state, player.heroId);
  if (!player || !hero) return "Erou necunoscut";
  if (!hero.alive) return "Erou căzut";
  if (hero.armor[slot] === material) return "O porți deja";
  const c = armorCost(slot, material);
  if (player.inventory.leather < c.leather) return `Ai nevoie de ${c.leather} piele`;
  if (player.inventory.iron < c.iron) return `Ai nevoie de ${c.iron} fier`;
  return null;
}

/** Faci piesa și o îmbraci pe loc (cea veche se rupe). */
export function craftArmor(state: GameState, playerId: PlayerId, slot: ArmorSlot, material: ArmorMaterial, events: GameEvent[]): boolean {
  if (canCraftArmor(state, playerId, slot, material) !== null) return false;
  const player = state.players[playerId];
  const hero = heroById(state, player.heroId)!;
  const c = armorCost(slot, material);
  player.inventory.leather -= c.leather;
  player.inventory.iron -= c.iron;
  hero.armor[slot] = material;
  events.push({ type: "armorCrafted", playerId, slot, material });
  return true;
}

/** Setul complet (toate 4 piesele din același material) sau null. */
export function armorSet(hero: Hero): ArmorMaterial | null {
  const first = hero.armor?.head ?? null;
  if (!first) return null;
  return ARMOR_SLOTS.every((s) => hero.armor[s] === first) ? first : null;
}

/** Cât din damage oprește armura (0..1). */
export function armorReduction(hero: Hero): number {
  if (!hero.armor) return 0;
  let r = 0;
  for (const s of ARMOR_SLOTS) {
    const m = hero.armor[s];
    if (m) r += CONFIG.armor[m].reduction[s];
  }
  const set = armorSet(hero);
  if (set) r += CONFIG.armor[set].setReduction;
  return Math.min(0.6, r);
}

export function armorSpeed(hero: Hero): number {
  const set = armorSet(hero);
  return set ? CONFIG.armor[set].setSpeed : 0;
}

export function armorCold(hero: Hero): number {
  const set = armorSet(hero);
  return set ? CONFIG.armor[set].setCold : 0;
}

/** Bonusurile de tras (damage, reîncărcare, critice) din abilitatea „Tras cu arma”. */
export function shootBonus(hero: Hero): { damage: number; reload: number; crit: number } {
  const r = rank(hero, "shoot");
  return {
    damage: 1 + r * K.shootDamage,
    reload: r >= 3 ? 1 - K.shootReload : 1,
    crit: r >= 5 ? K.critChance : 0,
  };
}

/** Câte lovituri pe secundă în plus la tăiat / minerit (multiplicator pentru intervalul dintre lovituri). */
export function gatherSpeed(hero: Hero, skill: "chop" | "mine"): number {
  const per = skill === "chop" ? K.chopSpeed : K.mineSpeed;
  return 1 / (1 + rank(hero, skill) * per);
}

