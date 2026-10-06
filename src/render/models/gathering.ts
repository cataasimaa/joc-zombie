// Modelele pentru unelte și resurse: lacul înghețat cu copcă, taraba negustorului,
// zăcămintele de argint / aur, târnăcopul și undița.

import type { Mesh, Scene } from "@babylonjs/core";
import { type Materials, ModelKit } from "../ModelKit";
import { PAL, hex, mix } from "../palette";

const SMOOTH = { smooth: true } as const;

/**
 * Balta: apă închisă la culoare, lucioasă (metal = reflexe), cu o margine de gheață subțire
 * spartă în bucăți, stuf uscat, un ponton mic de lemn, un scăunel, o găleată și un semn.
 */
export function buildPond(scene: Scene, mats: Materials, radius: number): Mesh[] {
  const k = new ModelKit(scene, mats, 4100);
  // Apa: un disc întunecat, puțin sub nivelul malului.
  k.cyl(0.05, radius * 2 + 0.6, radius * 2 + 0.6, 40, { p: [0, -0.25, 0] }, { color: hex("#14303c"), mat: "metal", wear: 0.05, smooth: true });
  // Malul de gheață: plăci rupte pe margine.
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + k.rand(-0.05, 0.05);
    const r = radius - k.rand(0.2, 0.9);
    k.box(k.rand(0.7, 1.4), 0.07, k.rand(0.5, 1.0), { p: [Math.cos(a) * r, -0.2, Math.sin(a) * r], r: [k.rand(-0.06, 0.06), -a, k.rand(-0.06, 0.06)] }, { color: mix(PAL.ice, PAL.snow, k.rand(0.5, 0.8)), wear: 0.08 });
  }
  // Mal de zăpadă moale în jur.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + k.rand(-0.08, 0.08);
    k.sphere(1, 6, { p: [Math.cos(a) * (radius + 0.3), 0.02, Math.sin(a) * (radius + 0.3)], s: [1.9, 0.14, 0.9], r: [0, -a, 0] }, { color: PAL.snow, wear: 0.05, ...SMOOTH });
  }
  // Stuf uscat în smocuri pe mal.
  for (let g = 0; g < 7; g++) {
    const a = k.rand(0, Math.PI * 2);
    const r = radius - 0.3;
    for (let i = 0; i < 6; i++) {
      const h = k.rand(0.6, 1.2);
      k.cyl(h, 0.01, 0.04, 3, { p: [Math.cos(a) * r + k.rand(-0.3, 0.3), h / 2, Math.sin(a) * r + k.rand(-0.3, 0.3)], r: [k.rand(-0.2, 0.2), 0, k.rand(-0.2, 0.2)] }, { color: hex("#8a7a55"), wear: 0.2 });
    }
  }
  // Ponton de scânduri care intră puțin în apă (spre +x).
  for (let i = 0; i < 5; i++) k.box(0.3, 0.06, 1.3, { p: [radius - 0.9 + i * 0.32, 0.18, 0], r: [0, 0, k.rand(-0.03, 0.03)] }, { color: mix(PAL.oldWood, PAL.burntWood, k.rand(0, 0.6)), wear: 0.3, frost: 0.6 });
  for (const [x, z] of [[radius - 0.9, -0.55], [radius - 0.9, 0.55], [radius + 0.4, -0.55], [radius + 0.4, 0.55]]) k.cyl(0.6, 0.1, 0.1, 5, { p: [x, -0.05, z] }, { color: PAL.darkWood });
  // Scăunel, găleată ruginită și un semn cu un pește pictat.
  const sx = radius + 1.4;
  k.box(0.45, 0.06, 0.35, { p: [sx, 0.42, 1.0] }, { color: PAL.oldWood, wear: 0.3, frost: 0.6 });
  for (const [x, z] of [[sx - 0.18, 0.87], [sx + 0.18, 0.87], [sx - 0.18, 1.13], [sx + 0.18, 1.13]]) k.cyl(0.4, 0.05, 0.05, 5, { p: [x, 0.2, z] }, { color: PAL.darkWood });
  k.cyl(0.38, 0.4, 0.32, 10, { p: [sx, 0.19, -1.0] }, { color: PAL.rust, mat: "metal", wear: 0.35, frost: 0.4 });
  k.cyl(1.3, 0.07, 0.08, 5, { p: [sx + 0.6, 0.65, 1.9] }, { color: PAL.darkWood, wear: 0.25 });
  k.box(0.7, 0.4, 0.06, { p: [sx + 0.6, 1.2, 1.9] }, { color: PAL.oldWood, wear: 0.3, frost: 0.7 });
  k.sphere(0.3, 6, { p: [sx + 0.55, 1.2, 1.94], s: [1.4, 0.5, 0.2] }, { color: hex("#9fb3bb"), ...SMOOTH });
  return k.build("pond");
}

/** Taraba negustorului: tejghea de lemn sub o streașină, cântar, saci și un felinar. */
export function buildTrader(scene: Scene, mats: Materials): { meshes: Mesh[]; lampPos: [number, number, number] } {
  const k = new ModelKit(scene, mats, 4200);
  // Podeaua și tejgheaua.
  k.box(2.4, 0.15, 1.6, { p: [0, 0.07, 0] }, { color: PAL.darkWood, wear: 0.3, frost: 0.5 });
  k.box(2.2, 0.9, 0.5, { p: [0, 0.6, 0.45] }, { color: PAL.oldWood, wear: 0.3, frost: 0.3 });
  k.box(2.35, 0.08, 0.62, { p: [0, 1.07, 0.45] }, { color: PAL.burntWood, wear: 0.25, frost: 0.8, frostNormal: 0.6 });
  // Stâlpi și acoperiș în pantă, cu zăpadă.
  for (const [x, z] of [[-1.1, 0.7], [1.1, 0.7], [-1.1, -0.7], [1.1, -0.7]]) k.cyl(2.3 + (z < 0 ? 0.35 : 0), 0.14, 0.16, 6, { p: [x, 1.15 + (z < 0 ? 0.18 : 0), z] }, { color: PAL.darkWood, wear: 0.25 });
  k.box(2.9, 0.12, 2.0, { p: [0, 2.5, 0], r: [0.2, 0, 0] }, { color: PAL.burntWood, wear: 0.3, frost: 0.95, frostNormal: 0.4 });
  // Cântar de fier pe tejghea și saci de pânză.
  k.cyl(0.5, 0.05, 0.05, 5, { p: [0.55, 1.35, 0.45] }, { color: PAL.iron, mat: "metal" });
  k.box(0.6, 0.04, 0.04, { p: [0.55, 1.6, 0.45] }, { color: PAL.iron, mat: "metal" });
  for (const x of [0.28, 0.82]) k.cyl(0.03, 0.22, 0.22, 8, { p: [x, 1.4, 0.45] }, { color: hex("#9a7a3a"), mat: "metal" });
  for (const [x, z] of [[-0.75, -0.25], [-0.35, -0.4], [0.9, -0.35]]) k.sphere(0.55, 7, { p: [x, 0.42, z], s: [1, 1.15, 1] }, { color: mix(PAL.cloth, PAL.fur, 0.6), wear: 0.2, ...SMOOTH });
  // Pești atârnați la uscat și firma cu o monedă.
  for (let i = 0; i < 3; i++) k.sphere(0.32, 6, { p: [-0.75 + i * 0.25, 1.75, 0.72], s: [0.3, 1.3, 0.45] }, { color: hex("#9fb3bb"), ...SMOOTH });
  k.box(1.0, 0.4, 0.06, { p: [0, 2.15, 0.95] }, { color: PAL.oldWood, wear: 0.3, frost: 0.6 });
  k.cyl(0.04, 0.26, 0.26, 12, { p: [0, 2.15, 0.99], r: [Math.PI / 2, 0, 0] }, { color: PAL.gold, mat: "metal" });
  // Felinarul cald (fereastra „negustorului” — al doilea accent cald, lângă foc).
  k.box(0.2, 0.28, 0.2, { p: [1.1, 1.95, 0.85] }, { color: PAL.iron, mat: "metal" });
  k.sphere(0.16, 6, { p: [1.1, 1.95, 0.85] }, { color: PAL.window, mat: "glow" });
  return { meshes: k.build("trader"), lampPos: [1.1, 1.95, 0.85] };
}

/** Zăcământ: bolovan cu cristale de argint sau pepite de aur care ies din piatră. */
export function buildOre(scene: Scene, mats: Materials, kind: "silver" | "gold"): Mesh[] {
  const k = new ModelKit(scene, mats, kind === "gold" ? 4301 : 4302);
  k.ico(0.7, { p: [0, 0.3, 0], s: [1.3, 0.85, 1.1] }, { color: PAL.stoneDark, wear: 0.3, frost: 0.6 });
  k.ico(0.45, { p: [0.55, 0.2, 0.2], s: [1.1, 0.8, 1] }, { color: PAL.stone, wear: 0.3, frost: 0.6 });
  const vein = kind === "gold" ? hex("#e2b13c") : hex("#c9d3da");
  for (let i = 0; i < 7; i++) {
    const a = k.rand(0, Math.PI * 2);
    const y = k.rand(0.25, 0.75);
    k.ico(k.rand(0.1, 0.19), { p: [Math.cos(a) * 0.62, y, Math.sin(a) * 0.55] }, { color: vein, mat: "metal", wear: 0.15 });
  }
  // O sclipire: câteva fațete strălucitoare (se văd și noaptea).
  for (let i = 0; i < 3; i++) {
    const a = k.rand(0, Math.PI * 2);
    k.ico(0.06, { p: [Math.cos(a) * 0.66, k.rand(0.4, 0.8), Math.sin(a) * 0.58] }, { color: kind === "gold" ? hex("#ffd36a") : hex("#e6f4ff"), mat: "glow" });
  }
  return k.build(`ore_${kind}`);
}

/** Târnăcopul (ținut de coadă; capul de fier sus). */
export function buildPickaxe(scene: Scene, mats: Materials): Mesh[] {
  const k = new ModelKit(scene, mats, 4400);
  k.cyl(1.0, 0.06, 0.07, 6, { p: [0, 0.5, 0] }, { color: PAL.oldWood, wear: 0.25 });
  k.cyl(0.85, 0.02, 0.1, 5, { p: [0, 1.0, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.8] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
  return k.build("pickaxe");
}

/** Undița: băț lung de alun cu mulinetă. */
export function buildRod(scene: Scene, mats: Materials): Mesh[] {
  const k = new ModelKit(scene, mats, 4500);
  k.cyl(2.2, 0.025, 0.06, 5, { p: [0, 1.1, 0] }, { color: PAL.oldWood, wear: 0.2 });
  k.cyl(0.08, 0.14, 0.14, 8, { p: [0.05, 0.35, 0], r: [0, 0, Math.PI / 2] }, { color: PAL.iron, mat: "metal" });
  return k.build("rod");
}
