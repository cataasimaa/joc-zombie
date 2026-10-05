// Descrierea claselor de eroi. În faza beta nu au abilități speciale: fiecare clasă are doar
// arma ei și un avantaj pasiv (mereu activ).

import type { HeroClass, Rarity } from "./config";

export interface HeroDef {
  name: string;
  icon: string;
  role: string;
  description: string;
  /** Avantajul pasiv al clasei, pe scurt. */
  passive: string;
}

export const HERO_DEFS: Record<HeroClass, HeroDef> = {
  assault: {
    name: "Assault Rifle",
    icon: "🔫",
    role: "Foc continuu",
    description: "Supraviețuitor cu pușcă din țevi. Încărcător mare, trage des.",
    passive: "Gloanțele trec prin doi zombi.",
  },
  sniper: {
    name: "Sniper",
    icon: "🎯",
    role: "O țintă, mult damage",
    description: "Rază foarte mare și gloanțe puternice, dar încărcător mic.",
    passive: "20% lovituri critice (×2,5), glonțul trece prin trei zombi.",
  },
  tank: {
    name: "Tank",
    icon: "🛡",
    role: "Rezistență",
    description: "Mult HP și pușcă cu alice, devastatoare de aproape.",
    passive: "Primește 25% mai puțin damage, repară zidurile de 3× mai repede.",
  },
  healer: {
    name: "Healer",
    icon: "✚",
    role: "Suport",
    description: "Ține echipa în viață și trage des cu o armă ușoară.",
    passive: "Vindecă încet eroii din jurul lui (inclusiv pe el).",
  },
};

/** Accesoriul care schimbă silueta eroului (pe lângă culoarea hainei). */
export type SkinAccessory =
  | "santa" | "skier" | "werewolf" | "viking" | "snowman" | "yeti"
  | "zombie" | "knight" | "chef" | "astronaut" | "pumpkin" | "penguin";

export interface SkinDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Culoarea hainei (r, g, b între 0 și 1). */
  color: [number, number, number];
  accessory: SkinAccessory;
}

/** Culoarea mantiei/hainei fiecărei clase (pielea, blana și armele au culorile lor). */
export const DEFAULT_SKIN_COLOR: Record<HeroClass, [number, number, number]> = {
  assault: [0.24, 0.3, 0.36],
  sniper: [0.27, 0.32, 0.22],
  tank: [0.35, 0.22, 0.16],
  healer: [0.62, 0.6, 0.55],
};

/** 12 skin-uri amuzante (din magazin și din cufere). */
export const SKINS: SkinDef[] = [
  { id: "skier", name: "Schiorul", rarity: "rare", color: [0.1, 0.55, 0.75], accessory: "skier" },
  { id: "viking", name: "Vikingul", rarity: "rare", color: [0.42, 0.28, 0.18], accessory: "viking" },
  { id: "zombie", name: "Vecinul zombi", rarity: "rare", color: [0.32, 0.4, 0.28], accessory: "zombie" },
  { id: "knight", name: "Cavalerul", rarity: "rare", color: [0.4, 0.42, 0.46], accessory: "knight" },
  { id: "chef", name: "Bucătarul", rarity: "rare", color: [0.88, 0.88, 0.86], accessory: "chef" },
  { id: "werewolf", name: "Vârcolacul", rarity: "epic", color: [0.36, 0.33, 0.3], accessory: "werewolf" },
  { id: "snowman", name: "Omul de zăpadă", rarity: "epic", color: [0.92, 0.94, 0.96], accessory: "snowman" },
  { id: "yeti", name: "Yeti", rarity: "epic", color: [0.85, 0.88, 0.92], accessory: "yeti" },
  { id: "pumpkin", name: "Cap de dovleac", rarity: "epic", color: [0.25, 0.18, 0.12], accessory: "pumpkin" },
  { id: "santa", name: "Moș Crăciun", rarity: "legendary", color: [0.72, 0.08, 0.08], accessory: "santa" },
  { id: "astronaut", name: "Astronautul", rarity: "legendary", color: [0.9, 0.9, 0.92], accessory: "astronaut" },
  { id: "penguin", name: "Pinguinul", rarity: "legendary", color: [0.08, 0.08, 0.1], accessory: "penguin" },
];
