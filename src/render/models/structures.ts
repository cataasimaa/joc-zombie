// Construcțiile: turnuri (post de lemn și piatră + armă pe pivot), ziduri și uși, mine, monede.

import type { Mesh, Scene } from "@babylonjs/core";
import { CONFIG } from "../../core";
import { type Materials, ModelKit } from "../ModelKit";
import { PAL, mix } from "../palette";

// ---------- Turn ----------

/** Baza turnului (piatră + cadru de lemn + acoperiș cu zăpadă). Tier 3–4: mai înalt, întărit cu fier. */
export function buildTowerBase(scene: Scene, mats: Materials, tier: number): Mesh[] {
  const k = new ModelKit(scene, mats, 500 + tier);
  const strong = tier >= 3;
  const stoneH = strong ? 1.3 : 0.85;
  k.cyl(stoneH, 1.7, 2.1, 7, { p: [0, stoneH / 2, 0] }, { color: PAL.stone, wear: 0.22, frost: 0.7 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    k.box(0.45, 0.3, 0.12, { p: [Math.sin(a) * 0.98, k.rand(0.2, stoneH - 0.2), Math.cos(a) * 0.98], r: [0, a, 0] }, { color: mix(PAL.stoneDark, PAL.moss, k.rand(0, 0.5)), wear: 0.2, frost: 0.6 });
  }
  if (strong) k.cyl(0.18, 1.95, 1.95, 7, { p: [0, stoneH - 0.3, 0] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
  // Patru stâlpi de lemn și o platformă.
  const top = stoneH + 1.55;
  for (const [x, z] of [[0.62, 0.62], [-0.62, 0.62], [0.62, -0.62], [-0.62, -0.62]]) {
    k.box(0.2, top - stoneH + 0.9, 0.2, { p: [x, stoneH + (top - stoneH + 0.9) / 2, z] }, { color: PAL.burntWood, wear: 0.2 });
  }
  for (const side of [1, -1]) {
    k.box(1.4, 0.12, 0.1, { p: [0, stoneH + 0.6, side * 0.62], r: [0, 0, 0.55] }, { color: PAL.darkWood, wear: 0.2 });
    k.box(0.1, 0.12, 1.4, { p: [side * 0.62, stoneH + 0.6, 0], r: [-0.55, 0, 0] }, { color: PAL.darkWood, wear: 0.2 });
  }
  k.box(1.6, 0.14, 1.6, { p: [0, stoneH + 0.12, 0] }, { color: PAL.oldWood, wear: 0.2, frost: 0.5 });
  // Acoperiș în patru ape, cu zăpadă.
  k.cyl(0.85, 0, 2.3, 4, { p: [0, top + 0.95, 0], r: [0, Math.PI / 4, 0] }, { color: strong ? PAL.iron : PAL.darkWood, mat: strong ? "metal" : "matte", wear: 0.2 });
  k.cyl(0.6, 0, 2.0, 4, { p: [0, top + 1.05, 0], r: [0, Math.PI / 4, 0] }, { color: PAL.snow, wear: 0.04 });
  // Mangal de fier la bază (focul e separat, animat).
  k.cyl(0.25, 0.55, 0.3, 6, { p: [0, 0.75, -1.15] }, { color: PAL.iron, mat: "metal", wear: 0.25 });
  k.cyl(0.6, 0.08, 0.08, 4, { p: [0, 0.35, -1.15] }, { color: PAL.iron, mat: "metal" });
  return k.build(`towerBase${tier}`);
}

/** Înălțimea platformei (unde stă arma), după tier. */
export const towerHeadY = (tier: number): number => (tier >= 3 ? 1.3 : 0.85) + 0.19;

/** Arma de pe pivot: balistă de lemn (tier 1–2) sau țeavă de fier (tier 3–4). Privește spre +z. */
export function buildTowerHead(scene: Scene, mats: Materials, tier: number): Mesh[] {
  const k = new ModelKit(scene, mats, 600 + tier);
  k.cyl(0.35, 0.3, 0.4, 6, { p: [0, 0.17, 0] }, { color: PAL.iron, mat: "metal", wear: 0.25 });
  if (tier <= 2) {
    // Balistă: grindă, arcuri, coardă, săgeată cu vârf de fier.
    const s = tier === 2 ? 1.2 : 1;
    k.box(0.22 * s, 0.2 * s, 1.5 * s, { p: [0, 0.45, 0.15] }, { color: PAL.oldWood, wear: 0.2 });
    for (const side of [1, -1]) {
      k.box(0.9 * s, 0.1, 0.12, { p: [side * 0.45 * s, 0.45, 0.65 * s], r: [0, side * -0.35, 0] }, { color: tier === 2 ? PAL.bone : PAL.darkWood, wear: 0.15 });
    }
    k.box(1.6 * s, 0.03, 0.03, { p: [0, 0.48, 0.38 * s] }, { color: PAL.cloth });
    k.cyl(1.2 * s, 0.05, 0.05, 4, { p: [0, 0.58, 0.45 * s], r: [Math.PI / 2, 0, 0] }, { color: PAL.oldWood });
    k.cyl(0.2, 0, 0.12, 4, { p: [0, 0.58, 1.12 * s], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
    if (tier === 2) for (const z of [-0.2, 0.5]) k.box(0.3, 0.26, 0.06, { p: [0, 0.45, z] }, { color: PAL.iron, mat: "metal" });
  } else {
    // Țeavă de fier pe afet de lemn; tier 4: țeavă dublă cu miez de gheață.
    k.box(0.7, 0.3, 0.8, { p: [0, 0.4, -0.05] }, { color: PAL.oldWood, wear: 0.2 });
    const pipes = tier === 4 ? [-0.18, 0.18] : [0];
    for (const x of pipes) {
      k.cyl(1.6, 0.22, 0.3, 7, { p: [x, 0.68, 0.45], r: [Math.PI / 2, 0, 0] }, { color: mix(PAL.iron, PAL.rust, 0.25), mat: "metal", wear: 0.25 });
      k.cyl(0.14, 0.34, 0.34, 7, { p: [x, 0.68, 1.15], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
    }
    if (tier === 4) k.box(0.3, 0.3, 0.3, { p: [0, 0.75, -0.3], r: [0.6, 0.6, 0] }, { color: PAL.ice, mat: "glow" });
  }
  return k.build(`towerHead${tier}`);
}

/** O flacără mică (focul de la baza turnului, minele, Molotov). Pivot la bază. */
export function buildFlame(scene: Scene, mats: Materials): Mesh {
  const k = new ModelKit(scene, mats, 700);
  k.cyl(0.55, 0, 0.3, 5, { p: [0, 0.27, 0] }, { color: PAL.fire, mat: "glow" });
  k.cyl(0.35, 0, 0.18, 5, { p: [0.05, 0.2, 0.04] }, { color: mix(PAL.fire, PAL.gold, 0.6), mat: "glow" });
  return k.buildOne("flame");
}

// ---------- Ziduri ----------

/**
 * Un segment de zid (lungimea pe axa x). level 1 = gard de pari, 2 = palisadă pe piatră.
 * door = ușă (scânduri orizontale pe un cadru).
 */
export function buildWall(scene: Scene, mats: Materials, level: number, door: boolean): Mesh[] {
  const k = new ModelKit(scene, mats, 800 + level * 10 + (door ? 1 : 0));
  const L = CONFIG.barricade.length;
  const strong = level >= 2;
  const stakeH = strong ? 2.1 : 1.6;
  if (strong) {
    k.box(L, 0.5, 0.65, { p: [0, 0.25, 0] }, { color: PAL.stone, wear: 0.22, frost: 0.7 });
  }
  const baseY = strong ? 0.45 : 0;
  const stake = (x: number, h: number) => {
    k.cyl(h, 0.3, 0.34, 5, { p: [x, baseY + h / 2, 0], r: [k.rand(-0.05, 0.05), 0, k.rand(-0.06, 0.06)] }, { color: mix(PAL.burntWood, PAL.oldWood, k.rand(0, 0.6)), wear: 0.2 });
    k.cyl(0.4, 0, 0.3, 5, { p: [x, baseY + h + 0.2, 0] }, { color: PAL.oldWood, wear: 0.2, frost: 0.6, frostNormal: 0.3 });
  };

  if (door) {
    // Cadru (doi pari groși + grindă) și ușa din scânduri cu benzi de fier.
    for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) stake(x, stakeH + 0.2);
    k.box(L, 0.22, 0.3, { p: [0, baseY + stakeH + 0.05, 0] }, { color: PAL.darkWood, wear: 0.2, frost: 0.8 });
    const dw = L - 0.75;
    for (let i = 0; i < 4; i++) {
      k.box(dw, 0.3, 0.14, { p: [0, baseY + 0.25 + i * 0.34, 0], r: [0, 0, k.rand(-0.02, 0.02)] }, { color: mix(PAL.oldWood, PAL.burntWood, k.rand(0, 0.5)), wear: 0.2, frost: 0.5, frostNormal: 0.7 });
    }
    for (const x of [-dw / 3, dw / 3]) k.box(0.12, 1.3, 0.05, { p: [x, baseY + 0.75, 0.09] }, { color: PAL.iron, mat: "metal", wear: 0.25 });
    k.cyl(0.04, 0.2, 0.2, 8, { p: [0.3, baseY + 0.75, 0.12], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
  } else {
    const n = 6;
    for (let i = 0; i < n; i++) stake(-L / 2 + 0.2 + (i * (L - 0.4)) / (n - 1), stakeH + k.rand(-0.15, 0.15));
    for (const y of [0.45, stakeH - 0.35]) {
      k.box(L + 0.1, 0.16, 0.12, { p: [0, baseY + y, 0.2], r: [0, 0, k.rand(-0.04, 0.04)] }, { color: PAL.darkWood, wear: 0.2, frost: 0.7, frostNormal: 0.7 });
    }
    if (strong) {
      for (const x of [-0.8, 0, 0.8]) k.box(0.5, 0.1, 0.42, { p: [x, baseY + stakeH * 0.55, 0] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
      // Țepi îndreptați spre exterior.
      for (const x of [-0.9, -0.3, 0.3, 0.9]) {
        k.cyl(0.9, 0, 0.14, 4, { p: [x, baseY + 0.6, 0.55], r: [1.1, 0, 0] }, { color: PAL.oldWood, wear: 0.2 });
      }
    }
  }
  // Troian de zăpadă la bază.
  k.ico(0.6, { p: [k.rand(-0.6, 0.6), 0.02, 0.3], s: [2.2, 0.35, 0.9] }, { color: PAL.snow, wear: 0.03 });
  return k.build(`wall${level}${door ? "door" : ""}`);
}

// ---------- Mine și monede ----------

export function buildMine(scene: Scene, mats: Materials): Mesh[] {
  const k = new ModelKit(scene, mats, 900);
  k.cyl(0.18, 0.7, 0.8, 8, { p: [0, 0.08, 0] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.cyl(0.2, 0, 0.07, 4, { p: [Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25] }, { color: PAL.rust, mat: "metal" });
  }
  k.sphere(0.12, 4, { p: [0, 0.2, 0] }, { color: PAL.ice, mat: "glow" });
  return k.build("mine");
}

export function buildCoin(scene: Scene, mats: Materials): Mesh {
  const k = new ModelKit(scene, mats, 950);
  k.cyl(0.08, 0.6, 0.6, 10, { r: [Math.PI / 2, 0, 0] }, { color: PAL.gold, mat: "glow" });
  return k.buildOne("coin");
}
