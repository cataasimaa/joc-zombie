// Personajele: eroii (supraviețuitori de iarnă) și zombii (trei siluete din aceeași familie).
// Brațele și picioarele sunt mesh-uri separate, cu „pivotul” în umăr/șold, ca să le putem legăna.

import type { Color3, Mesh, Scene } from "@babylonjs/core";
import type { HeroClass, ZombieType, WeaponId } from "../../core";
import { type Materials, ModelKit } from "../ModelKit";
import { PAL, mix } from "../palette";

// =====================================================================
// Eroi
// =====================================================================

export interface HeroLook {
  heroClass: HeroClass;
  coat: Color3;
  level: number;
  weapon: WeaponId;
}

export interface HeroModel {
  /** Corpul (tors, cap, armă), unit într-unul sau mai multe mesh-uri. */
  body: Mesh[];
  legL: Mesh;
  legR: Mesh;
  /** Vârful armei (pentru flacăra de la gură), în coordonatele eroului. */
  muzzle: [number, number, number];
}

function leg(scene: Scene, mats: Materials, seed: number, trousers: Color3, x: number): Mesh {
  const k = new ModelKit(scene, mats, seed);
  // Pivot în șold (y = 0): piciorul atârnă în jos.
  k.box(0.24, 0.62, 0.26, { p: [0, -0.33, 0] }, { color: trousers, wear: 0.12 });
  k.box(0.28, 0.22, 0.4, { p: [0, -0.72, 0.05] }, { color: PAL.leather, wear: 0.15, frost: 0.4, frostNormal: 0.7 });
  k.box(0.3, 0.08, 0.3, { p: [0, -0.56, 0] }, { color: PAL.fur, wear: 0.15 });
  const m = k.buildOne(`leg${seed}`);
  m.position.set(x, 0.82, 0);
  return m;
}

export function buildHero(scene: Scene, mats: Materials, look: HeroLook): HeroModel {
  const k = new ModelKit(scene, mats, 11);
  const { heroClass: cls, coat, level } = look;
  const tank = cls === "tank";
  const healer = cls === "healer";
  const bulk = tank ? 1.22 : 1;
  const fur = cls === "sniper" ? mix(PAL.fur, PAL.pine, 0.35) : PAL.fur;
  const trousers = mix(PAL.cloth, coat, 0.25);

  // Tors cu umeri lați (con întors).
  k.cyl(0.78, 0.98 * bulk, 0.66 * bulk, 6, { p: [0, 1.2, 0], s: [1, 1, 0.72] }, { color: coat, wear: 0.12 });
  // Centură.
  k.box(0.72 * bulk, 0.12, 0.5, { p: [0, 0.86, 0] }, { color: PAL.leather, wear: 0.15 });
  k.box(0.14, 0.1, 0.06, { p: [0, 0.86, 0.26] }, { color: PAL.iron, mat: "metal" });
  // Mantie scurtă (spate).
  k.box(0.9 * bulk, 0.85, 0.07, { p: [0, 1.15, -0.32], r: [-0.12, 0, 0] }, { color: coat.scale(0.75), wear: 0.15, frost: 0.5, frostNormal: 0.5 });
  // Guler de blană (mai mare la niveluri mari).
  const furSize = level >= 3 ? 1.18 : 1;
  k.cyl(0.2, 0.9 * bulk * furSize, 1.0 * bulk * furSize, 8, { p: [0, 1.58, 0], s: [1, 1, 0.8] }, { color: fur, wear: 0.25, frost: 0.5, frostNormal: 0.6 });
  if (level >= 3) {
    k.cyl(0.14, 0.95 * bulk, 1.15 * bulk, 8, { p: [0, 1.48, -0.05], s: [1, 1, 0.75] }, { color: PAL.furDark, wear: 0.25 });
  }
  // Bandă de metal pe umăr (nivel 5+), pe ambii umeri (nivel 8+).
  if (level >= 5) {
    for (const side of level >= 8 ? [1, -1] : [1]) {
      k.box(0.36, 0.14, 0.46, { p: [side * 0.42 * bulk, 1.62, 0], r: [0, 0, side * -0.35] }, { color: PAL.iron, mat: "metal", wear: 0.25 });
      k.box(0.3, 0.06, 0.4, { p: [side * 0.42 * bulk, 1.7, 0], r: [0, 0, side * -0.35] }, { color: PAL.rust, wear: 0.3 });
    }
  }

  // Cap: glugă de blană (sau coif de fier la Tank), fața în umbră.
  if (tank) {
    k.sphere(0.5, 6, { p: [0, 1.86, 0], s: [1, 0.95, 1] }, { color: PAL.iron, mat: "metal", wear: 0.2 });
    k.cyl(0.12, 0.56, 0.58, 8, { p: [0, 1.74, 0] }, { color: fur, wear: 0.2 });
    k.box(0.08, 0.26, 0.1, { p: [0, 1.8, 0.25] }, { color: PAL.iron, mat: "metal" });
  } else {
    k.sphere(0.56, 6, { p: [0, 1.86, -0.03], s: [1, 1.05, 1.05] }, { color: fur, wear: 0.22, frost: 0.55, frostNormal: 0.55 });
    k.box(0.3, 0.26, 0.1, { p: [0, 1.82, 0.22] }, { color: PAL.skin.scale(0.75), wear: 0.08 });
    // Eșarfă peste gură.
    k.box(0.36, 0.12, 0.12, { p: [0, 1.71, 0.21] }, { color: coat.scale(0.6), wear: 0.15 });
  }

  // Bandulieră în diagonală, cu cartușe.
  if (!healer) {
    k.box(0.12, 0.95, 0.06, { p: [0, 1.2, 0.27], r: [0, 0, 0.62] }, { color: PAL.leather, wear: 0.2 });
    for (let i = 0; i < 4; i++) {
      k.box(0.07, 0.1, 0.05, { p: [-0.18 + i * 0.12, 1.06 + i * 0.09, 0.31], r: [0, 0, 0.62] }, { color: PAL.gold, wear: 0.2 });
    }
  }

  // Brațe întinse înainte, ținând arma.
  const arm = (x: number, reach: number) => {
    k.box(0.2, 0.2, 0.55, { p: [x, 1.42, 0.12 + reach * 0.1], r: [0.5, 0, 0] }, { color: coat, wear: 0.12 });
    k.box(0.18, 0.18, 0.45, { p: [x * 0.7, 1.28, 0.42 + reach * 0.15] }, { color: coat.scale(0.9), wear: 0.12 });
    k.box(0.16, 0.14, 0.14, { p: [x * 0.6, 1.26, 0.66 + reach * 0.15] }, { color: PAL.leather });
  };

  let muzzle: [number, number, number] = [0.15, 1.3, 1.5];
  if (cls === "assault" || cls === "sniper") {
    arm(0.5, 0);
    arm(-0.5, 1);
    muzzle = gun(k, look.weapon, cls === "sniper");
  } else if (tank) {
    // Scut rotund de lemn cu ramă de fier pe brațul stâng, topor greu în dreapta.
    arm(0.55, 0);
    k.cyl(0.12, 1.25, 1.25, 10, { p: [-0.62, 1.2, 0.45], r: [Math.PI / 2, 0, 0.15] }, { color: PAL.oldWood, wear: 0.22 });
    k.cyl(0.14, 1.32, 1.32, 10, { p: [-0.63, 1.2, 0.44], r: [Math.PI / 2, 0, 0.15], s: [1, 0.6, 1] }, { color: PAL.iron, mat: "metal", wear: 0.25 });
    k.sphere(0.3, 5, { p: [-0.66, 1.2, 0.55] }, { color: PAL.iron, mat: "metal" });
    k.cyl(1.4, 0.08, 0.1, 5, { p: [0.45, 1.25, 0.65], r: [1.1, 0, 0] }, { color: PAL.darkWood, wear: 0.2 });
    const axe = look.weapon === "iceLance" ? PAL.ice : PAL.iron;
    k.box(0.08, 0.45, 0.5, { p: [0.45, 1.55, 1.2], r: [1.1, 0, 0] }, { color: axe, mat: look.weapon === "iceLance" ? "glow" : "metal", wear: 0.2 });
    muzzle = [0.45, 1.5, 1.2];
  } else {
    // Healer: robă lungă și toiag cu felinar de gheață.
    k.cyl(0.75, 0.75, 1.05, 7, { p: [0, 0.45, 0] }, { color: coat, wear: 0.12, frost: 0.4, frostNormal: 0.6 });
    arm(0.5, 0);
    k.box(0.2, 0.55, 0.2, { p: [-0.5, 1.25, 0.05] }, { color: coat });
    k.cyl(2.3, 0.08, 0.11, 5, { p: [0.45, 1.15, 0.55] }, { color: PAL.oldWood, wear: 0.22 });
    k.box(0.3, 0.36, 0.3, { p: [0.45, 2.42, 0.55] }, { color: PAL.iron, mat: "metal", wear: 0.2 });
    k.box(0.2, 0.26, 0.2, { p: [0.45, 2.42, 0.55] }, { color: PAL.ice, mat: "glow" });
    k.cyl(0.2, 0, 0.36, 4, { p: [0.45, 2.7, 0.55] }, { color: PAL.iron, mat: "metal" });
    muzzle = [0.45, 2.42, 0.55];
  }

  const body = k.build(`hero_${cls}`);
  const legL = leg(scene, mats, 21, healer ? coat : trousers, -0.17 * bulk);
  const legR = leg(scene, mats, 22, healer ? coat : trousers, 0.17 * bulk);
  return { body, legL, legR, muzzle };
}

/** Arma de foc a eroului; arată diferit pentru fiecare armă din magazin. Returnează vârful țevii. */
function gun(k: ModelKit, weapon: WeaponId, sniper: boolean): [number, number, number] {
  const y = 1.32;
  const x = 0.12;
  const stock = (len: number, color = PAL.oldWood) =>
    k.box(0.14, 0.2, len, { p: [x, y - 0.05, 0.15], r: [0.08, 0, 0] }, { color, wear: 0.22 });
  switch (weapon) {
    case "hunting":
      stock(0.7);
      k.box(0.12, 0.12, 0.9, { p: [x, y, 0.75] }, { color: PAL.oldWood, wear: 0.2 });
      k.cyl(1.3, 0.07, 0.08, 6, { p: [x, y + 0.06, 1.1], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
      return [x, y + 0.06, 1.75];
    case "scattergun":
      stock(0.6, PAL.darkWood);
      for (const dx of [-0.05, 0.05]) {
        k.cyl(1.0, 0.09, 0.09, 6, { p: [x + dx, y + 0.04, 0.95], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
      }
      return [x, y + 0.04, 1.45];
    case "pipeGun":
      stock(0.5);
      for (const [dx, dy] of [[-0.06, 0], [0.06, 0], [0, 0.09]]) {
        k.cyl(1.2, 0.08, 0.08, 6, { p: [x + dx, y + dy, 0.95], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
      }
      k.box(0.26, 0.3, 0.3, { p: [x, y - 0.22, 0.6] }, { color: PAL.rust, mat: "metal", wear: 0.3 });
      return [x, y + 0.03, 1.55];
    case "boneBow":
      stock(0.9, PAL.bone);
      k.box(1.3, 0.08, 0.08, { p: [x, y + 0.05, 1.0], r: [0, 0, 0] }, { color: PAL.bone, wear: 0.15 });
      k.box(0.04, 0.04, 0.9, { p: [x, y + 0.1, 0.85] }, { color: PAL.darkWood });
      return [x, y + 0.1, 1.3];
    case "iceLance":
      stock(0.6, PAL.darkWood);
      k.cyl(1.3, 0.04, 0.16, 6, { p: [x, y + 0.04, 1.05], r: [Math.PI / 2, 0, 0] }, { color: PAL.ice, mat: "glow" });
      k.box(0.2, 0.2, 0.2, { p: [x, y + 0.04, 0.45] }, { color: PAL.iron, mat: "metal" });
      return [x, y + 0.04, 1.7];
    default: {
      // Țeava ruginită: pușcă din țevi și lemn, legată cu sfoară. La Sniper e lungă, cu lunetă.
      const len = sniper ? 1.9 : 1.25;
      stock(0.65);
      k.cyl(len, 0.1, 0.12, 6, { p: [x, y + 0.04, 0.4 + len / 2], r: [Math.PI / 2, 0, 0] }, { color: mix(PAL.iron, PAL.rust, 0.35), mat: "metal", wear: 0.25 });
      k.box(0.16, 0.08, 0.2, { p: [x, y + 0.04, 0.75] }, { color: PAL.cloth, wear: 0.2 });
      k.box(0.1, 0.3, 0.16, { p: [x, y - 0.2, 0.6] }, { color: PAL.iron, mat: "metal" });
      if (sniper) k.cyl(0.5, 0.09, 0.09, 6, { p: [x, y + 0.2, 0.7], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
      return [x, y + 0.04, 0.45 + len];
    }
  }
}

// =====================================================================
// Zombi
// =====================================================================

export interface ZombieModel {
  /** Corpul (tors + cap + zdrențe) și ochii strălucitori — sursele instanțelor. */
  body: Mesh[];
  armL: Mesh;
  armR: Mesh;
  legL: Mesh;
  legR: Mesh;
  /** Unde stau umerii/șoldurile (pentru pivoturi). */
  shoulder: [number, number, number];
  hip: [number, number];
}

function limb(scene: Scene, mats: Materials, seed: number, build: (k: ModelKit) => void): Mesh {
  const k = new ModelKit(scene, mats, seed);
  build(k);
  return k.buildOne(`limb${seed}`);
}

/** 1) Sălbatic subțire: brațe lungi, zdrențe înghețate, cap mare aplecat în față. */
function buildWalker(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = PAL.skinZombie;
  // Tors aplecat, spate cocoșat.
  k.box(0.52, 0.72, 0.34, { p: [0, 1.12, 0.12], r: [0.55, 0, 0] }, { color: skin, wear: 0.16 });
  k.ico(0.3, { p: [0, 1.38, -0.05], s: [1.1, 0.8, 1] }, { color: PAL.skinZombieDark, wear: 0.15, frost: 0.35 });
  k.box(0.46, 0.18, 0.3, { p: [0, 0.8, 0] }, { color: PAL.skinZombieDark, wear: 0.15 });
  // Coaste vizibile (os îngălbenit).
  for (let i = 0; i < 3; i++) k.box(0.4, 0.04, 0.05, { p: [0, 1.0 + i * 0.12, 0.33 + i * 0.06], r: [0.55, 0, 0] }, { color: PAL.bone, wear: 0.15 });
  // Cap mare, împins în față și în jos.
  k.box(0.42, 0.42, 0.42, { p: [0, 1.55, 0.48], r: [0.2, 0, 0.08] }, { color: skin, wear: 0.15 });
  k.box(0.3, 0.12, 0.12, { p: [0, 1.38, 0.66] }, { color: PAL.skinZombieDark, wear: 0.1 });
  for (const x of [-0.11, 0.11]) k.box(0.1, 0.07, 0.05, { p: [x, 1.6, 0.7] }, { color: PAL.ice, mat: "glow" });
  // Zdrențe înghețate care atârnă.
  for (let i = 0; i < 5; i++) {
    const h = k.rand(0.3, 0.6);
    k.box(k.rand(0.12, 0.22), h, 0.04, { p: [k.rand(-0.24, 0.24), 0.82 - h / 2 + 0.15, k.rand(-0.15, 0.18)], r: [k.rand(-0.2, 0.2), k.rand(0, 3), k.rand(-0.2, 0.2)] }, { color: PAL.rags, wear: 0.2, frost: 0.4 });
  }
  const body = k.build(`walker${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.box(0.14, 0.5, 0.14, { p: [0, -0.25, 0] }, { color: skin, wear: 0.15 });
    a.box(0.12, 0.55, 0.12, { p: [0, -0.75, 0.08] }, { color: PAL.skinZombieDark, wear: 0.15 });
    for (const dx of [-0.04, 0.04]) a.box(0.03, 0.18, 0.03, { p: [dx, -1.1, 0.12] }, { color: PAL.bone });
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.box(0.16, 0.45, 0.16, { p: [0, -0.22, 0] }, { color: PAL.rags, wear: 0.2, frost: 0.3 });
    a.box(0.14, 0.4, 0.14, { p: [0, -0.62, -0.06] }, { color: skin, wear: 0.15 });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [0.33, 1.38, 0.3], hip: [0.14, 0.82] };
}

/** 2) Brută: umeri de blană ruptă, cap mic, armă de os. */
function buildBrute(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(PAL.skinZombie, PAL.skinZombieDark, 0.4);
  k.box(1.05, 0.95, 0.65, { p: [0, 1.35, 0.1], r: [0.4, 0, 0] }, { color: skin, wear: 0.15 });
  k.ico(0.55, { p: [0, 1.85, -0.2], s: [1.4, 0.8, 1] }, { color: PAL.skinZombieDark, wear: 0.15, frost: 0.4 });
  k.box(0.8, 0.35, 0.55, { p: [0, 0.9, 0] }, { color: PAL.rags, wear: 0.2 });
  // Umeri de blană ruptă.
  for (const side of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      k.ico(0.32 - i * 0.04, { p: [side * (0.5 + i * 0.08), 1.82 - i * 0.12, 0.1 - i * 0.12], s: [1, 0.7, 1] }, { color: i === 0 ? PAL.furDark : PAL.fur, wear: 0.25, frost: 0.55, frostNormal: 0.5 });
    }
  }
  // Cap mic, jos, între umeri.
  k.box(0.38, 0.36, 0.38, { p: [0, 1.8, 0.62] }, { color: skin, wear: 0.15 });
  for (const x of [-0.09, 0.09]) k.box(0.1, 0.07, 0.05, { p: [x, 1.84, 0.82] }, { color: PAL.ice, mat: "glow" });
  k.box(0.26, 0.08, 0.08, { p: [0, 1.68, 0.8] }, { color: PAL.bone });
  const body = k.build(`brute${seed}`);
  const armBuild = (withClub: boolean) => (a: ModelKit) => {
    a.box(0.3, 0.6, 0.3, { p: [0, -0.3, 0] }, { color: skin, wear: 0.15 });
    a.box(0.28, 0.6, 0.28, { p: [0, -0.85, 0.12] }, { color: PAL.skinZombieDark, wear: 0.15 });
    if (withClub) {
      a.cyl(1.3, 0.14, 0.2, 6, { p: [0, -1.1, 0.6], r: [1.2, 0, 0] }, { color: PAL.bone, wear: 0.2 });
      a.ico(0.26, { p: [0, -0.85, 1.2] }, { color: PAL.bone, wear: 0.2 });
    }
  };
  const armL = limb(scene, mats, seed + 1, armBuild(false));
  const armR = limb(scene, mats, seed + 2, armBuild(true));
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.box(0.3, 0.5, 0.3, { p: [0, -0.25, 0] }, { color: PAL.rags, wear: 0.2, frost: 0.3 });
    a.box(0.26, 0.4, 0.3, { p: [0, -0.65, 0.04] }, { color: skin, wear: 0.15 });
  });
  return { body, armL, armR, legL: legM(1), legR: legM(2), shoulder: [0.68, 1.75, 0.2], hip: [0.25, 0.9] };
}

/** 3) „Abominație” mică: înaltă, coarne de gheață, piept de os. Apare rar (boss). */
function buildBoss(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(PAL.skinZombieDark, PAL.iron, 0.3);
  // Burtă mare și tors cocoșat.
  k.ico(1.0, { p: [0, 1.75, 0.15], s: [1.15, 1.0, 0.95] }, { color: skin, wear: 0.15 });
  k.box(1.6, 1.2, 1.0, { p: [0, 2.55, 0.1], r: [0.35, 0, 0] }, { color: skin, wear: 0.15 });
  k.ico(0.8, { p: [0, 3.05, -0.35], s: [1.3, 0.8, 1] }, { color: PAL.skinZombie, wear: 0.15, frost: 0.5 });
  // Piept de os: coaste mari peste piept.
  for (let i = 0; i < 4; i++) {
    k.box(1.3 - i * 0.12, 0.1, 0.12, { p: [0, 2.0 + i * 0.25, 0.75 + i * 0.07], r: [0.35, 0, 0] }, { color: PAL.bone, wear: 0.18 });
  }
  k.box(0.14, 1.0, 0.14, { p: [0, 2.35, 0.86], r: [0.35, 0, 0] }, { color: PAL.bone, wear: 0.15 });
  // Cap, cu coarne de gheață.
  k.box(0.6, 0.55, 0.55, { p: [0, 3.05, 0.8] }, { color: skin, wear: 0.15 });
  k.box(0.46, 0.14, 0.14, { p: [0, 2.82, 1.08] }, { color: PAL.bone });
  for (const x of [-0.14, 0.14]) k.box(0.1, 0.07, 0.04, { p: [x, 3.1, 1.08] }, { color: PAL.ice, mat: "glow" });
  for (const side of [1, -1]) {
    k.cyl(1.0, 0, 0.26, 5, { p: [side * 0.35, 3.6, 0.7], r: [-0.3, 0, side * -0.5] }, { color: mix(PAL.ice, PAL.snow, 0.3), wear: 0.08 });
    // Țepi de gheață pe umeri.
    for (let i = 0; i < 3; i++) {
      k.cyl(0.6 + i * 0.15, 0, 0.18, 4, { p: [side * (0.6 + i * 0.15), 3.25 - i * 0.05, -0.3 + i * 0.25], r: [-0.5, 0, side * -0.35] }, { color: mix(PAL.ice, PAL.snow, 0.4), wear: 0.08 });
    }
  }
  // Lanțuri / zdrențe.
  k.box(1.5, 0.3, 1.0, { p: [0, 1.1, 0] }, { color: PAL.rags, wear: 0.2, frost: 0.4 });
  const body = k.build(`boss${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.box(0.5, 0.9, 0.5, { p: [0, -0.45, 0] }, { color: skin, wear: 0.15 });
    a.box(0.46, 0.9, 0.46, { p: [0, -1.3, 0.25] }, { color: PAL.skinZombie, wear: 0.15 });
    for (const dx of [-0.14, 0, 0.14]) a.cyl(0.45, 0, 0.12, 4, { p: [dx, -1.9, 0.4], r: [0.4, 0, 0] }, { color: mix(PAL.ice, PAL.snow, 0.3) });
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.box(0.5, 0.7, 0.5, { p: [0, -0.35, 0] }, { color: PAL.rags, wear: 0.2 });
    a.box(0.46, 0.55, 0.5, { p: [0, -0.9, 0.05] }, { color: skin, wear: 0.15 });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [1.0, 3.0, 0.3], hip: [0.45, 1.2] };
}

export function buildZombie(scene: Scene, mats: Materials, type: ZombieType): ZombieModel {
  switch (type) {
    case "brute":
      return buildBrute(scene, mats, 300);
    case "boss":
      return buildBoss(scene, mats, 400);
    case "runner":
      return buildWalker(scene, mats, 150);
    default:
      return buildWalker(scene, mats, 100);
  }
}
