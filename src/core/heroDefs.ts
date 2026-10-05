// Descrierea claselor de eroi și a abilităților lor.
// Valorile numerice ale abilităților sunt aici, lângă descriere, ca să fie ușor de echilibrat.

import type { HeroClass, Rarity } from "./config";

export type AbilityId =
  | "grenade" | "rapidFire" | "spray" | "airstrike"
  | "headshot" | "pierce" | "focus" | "assassinate"
  | "taunt" | "shield" | "slam" | "fortress"
  | "heal" | "healZone" | "revive" | "holyLight";

export interface AbilityDef {
  id: AbilityId;
  name: string;
  icon: string;
  cooldown: number;
  description: string;
}

export interface HeroDef {
  name: string;
  icon: string;
  role: string;
  description: string;
  /** 3 abilități normale + 1 ultimate (ultima). */
  abilities: [AbilityDef, AbilityDef, AbilityDef, AbilityDef];
}

/** Numerele abilităților. Damage-ul și vindecarea cresc cu nivelul eroului (+15%/nivel). */
export const ABILITY = {
  levelScaling: 0.15,
  grenade: { range: 14, radius: 3.5, damage: 60 },
  rapidFire: { duration: 5, speedMultiplier: 2.2 },
  spray: { range: 11, coneDegrees: 70, damage: 35 },
  airstrike: { radius: 10, damage: 160 },
  headshot: { range: 24, damage: 220 },
  pierce: { length: 26, width: 1.4, damage: 90 },
  focus: { duration: 6, critBonus: 0.4, speedMultiplier: 1.6 },
  assassinate: { range: 30, targets: 5, damage: 600 },
  taunt: { radius: 11, duration: 5 },
  shield: { duration: 5, damageReduction: 0.7 },
  slam: { radius: 4.5, damage: 50, slowDuration: 3, slowFactor: 0.5 },
  fortress: { duration: 6, tauntRadius: 16 },
  heal: { range: 12, amount: 80 },
  healZone: { radius: 5, duration: 6, healPerSecond: 16 },
  revive: { range: 8, hpFraction: 0.5 },
  holyLight: { shelterHeal: 300, radius: 10, damage: 110 },
} as const;

export const HERO_DEFS: Record<HeroClass, HeroDef> = {
  assault: {
    name: "Assault Rifle",
    icon: "🔫",
    role: "Damage constant",
    description: "Trage rapid și lovește câte doi zombi deodată. Bun la curățat valuri.",
    abilities: [
      { id: "grenade", name: "Grenadă", icon: "💣", cooldown: 8, description: "Aruncă o grenadă în cel mai apropiat zombie (damage în zonă)." },
      { id: "rapidFire", name: "Foc rapid", icon: "⚡", cooldown: 15, description: "Trage de 2 ori mai repede, 5 secunde." },
      { id: "spray", name: "Rafală", icon: "🌪", cooldown: 10, description: "Lovește toți zombii dintr-un con în fața ta." },
      { id: "airstrike", name: "Bombardament", icon: "✈", cooldown: 60, description: "ULTIMATE: damage mare tuturor zombilor din jurul tău." },
    ],
  },
  sniper: {
    name: "Sniper",
    icon: "🎯",
    role: "Damage pe o țintă",
    description: "Rază foarte mare, gloanțe puternice și lovituri critice. Ideal pentru zombii mari.",
    abilities: [
      { id: "headshot", name: "Lovitură în cap", icon: "💀", cooldown: 10, description: "Lovește zombiul cu cel mai mult HP din rază." },
      { id: "pierce", name: "Glonț perforant", icon: "➶", cooldown: 12, description: "Glonțul trece prin toți zombii dintr-o linie." },
      { id: "focus", name: "Concentrare", icon: "👁", cooldown: 18, description: "6 secunde: mai multe critice și foc mai rapid." },
      { id: "assassinate", name: "Asasinare", icon: "☠", cooldown: 60, description: "ULTIMATE: lovește cei mai puternici 5 zombi de pe hartă." },
    ],
  },
  tank: {
    name: "Tank",
    icon: "🛡",
    role: "Rezistență, atrage zombii",
    description: "Mult HP. Atrage zombii pe el, se apără cu scutul și repară baricadele de 3 ori mai repede.",
    abilities: [
      { id: "taunt", name: "Provocare", icon: "📢", cooldown: 12, description: "Zombii din jur te atacă doar pe tine, 5 secunde." },
      { id: "shield", name: "Scut", icon: "🛡", cooldown: 15, description: "Primești cu 70% mai puțin damage, 5 secunde." },
      { id: "slam", name: "Izbitură", icon: "💥", cooldown: 8, description: "Damage în jurul tău și încetinește zombii." },
      { id: "fortress", name: "Fortăreață", icon: "🏰", cooldown: 60, description: "ULTIMATE: invulnerabil 6 secunde și atragi toți zombii din jur." },
    ],
  },
  healer: {
    name: "Healer",
    icon: "✚",
    role: "Suport",
    description: "Vindecă aliații și adăpostul, poate reînvia un coleg căzut.",
    abilities: [
      { id: "heal", name: "Vindecare", icon: "✚", cooldown: 6, description: "Vindecă aliatul cel mai rănit din apropiere (sau pe tine)." },
      { id: "healZone", name: "Cerc de viață", icon: "◎", cooldown: 14, description: "Zonă care vindecă eroii și baricadele din ea, 6 secunde." },
      { id: "revive", name: "Reînviere", icon: "↺", cooldown: 30, description: "Reînvie un coleg căzut din apropiere." },
      { id: "holyLight", name: "Lumină sfântă", icon: "☀", cooldown: 70, description: "ULTIMATE: vindecă toți eroii, repară adăpostul și arde zombii din jur." },
    ],
  },
};

export interface SkinDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Culoarea corpului (r, g, b între 0 și 1). */
  color: [number, number, number];
}

export const DEFAULT_SKIN_COLOR: Record<HeroClass, [number, number, number]> = {
  assault: [0.2, 0.45, 0.95],
  sniper: [0.55, 0.3, 0.8],
  tank: [0.5, 0.42, 0.32],
  healer: [0.95, 0.95, 0.85],
};

export const SKINS: SkinDef[] = [
  { id: "hunter", name: "Vânător", rarity: "rare", color: [0.2, 0.4, 0.2] },
  { id: "ember", name: "Jar", rarity: "rare", color: [0.9, 0.35, 0.15] },
  { id: "arctic", name: "Arctic", rarity: "epic", color: [0.75, 0.9, 1] },
  { id: "shadow", name: "Umbră", rarity: "epic", color: [0.12, 0.12, 0.18] },
  { id: "gold", name: "Aur legendar", rarity: "legendary", color: [1, 0.78, 0.15] },
];
