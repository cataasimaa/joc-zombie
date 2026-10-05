// Paleta „Northrend survival”: aproape totul rece, foc și ferestre calde ca accent.

import { Color3 } from "@babylonjs/core";

export const hex = (h: string): Color3 => Color3.FromHexString(h);

export const PAL = {
  snow: hex("#e7eef2"),
  snowShadow: hex("#8aa0b0"),
  burntWood: hex("#5a3a28"),
  darkWood: hex("#3d2a1e"),
  oldWood: hex("#6e5440"),
  iron: hex("#3c4650"),
  rust: hex("#6a4433"),
  bone: hex("#d9d0bf"),
  blood: hex("#6b1d24"),
  fire: hex("#ff8a3d"),
  ice: hex("#7ec8ff"),
  stone: hex("#5f666d"),
  stoneDark: hex("#454b52"),
  moss: hex("#56645a"),
  pine: hex("#152a22"),
  pineLight: hex("#1d362b"),
  dirt: hex("#4e4038"),
  path: hex("#b4c0c8"),
  skinZombie: hex("#5d6a75"),
  skinZombieDark: hex("#434e58"),
  rags: hex("#36302c"),
  fur: hex("#7a6a58"),
  furDark: hex("#54473b"),
  leather: hex("#4a3324"),
  skin: hex("#b89478"),
  cloth: hex("#3a3530"),
  window: hex("#ffb070"),
  gold: hex("#e8c050"),
};

/** Interpolare liniară între două culori. */
export const mix = (a: Color3, b: Color3, t: number): Color3 => Color3.Lerp(a, b, Math.max(0, Math.min(1, t)));
