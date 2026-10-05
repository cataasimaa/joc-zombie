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

export interface SkinDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Culoarea corpului (r, g, b între 0 și 1). */
  color: [number, number, number];
}

/** Culoarea mantiei/hainei fiecărei clase (pielea, blana și armele au culorile lor). */
export const DEFAULT_SKIN_COLOR: Record<HeroClass, [number, number, number]> = {
  assault: [0.24, 0.3, 0.36],
  sniper: [0.27, 0.32, 0.22],
  tank: [0.35, 0.22, 0.16],
  healer: [0.62, 0.6, 0.55],
};

export const SKINS: SkinDef[] = [
  { id: "hunter", name: "Vânător", rarity: "rare", color: [0.22, 0.28, 0.16] },
  { id: "ember", name: "Jar", rarity: "rare", color: [0.48, 0.18, 0.1] },
  { id: "arctic", name: "Lup alb", rarity: "epic", color: [0.85, 0.88, 0.9] },
  { id: "shadow", name: "Umbră", rarity: "epic", color: [0.1, 0.1, 0.13] },
  { id: "gold", name: "Rege al iernii", rarity: "legendary", color: [0.62, 0.45, 0.12] },
];
