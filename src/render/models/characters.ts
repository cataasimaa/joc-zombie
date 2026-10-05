// Personajele: eroii (supraviețuitori de iarnă) și zombii (o familie de siluete).
// Brațele, picioarele și aripile sunt mesh-uri separate, cu „pivotul” în umăr/șold/genunchi,
// ca să le putem anima. Formele organice folosesc umbrire netedă (smooth) → aspect mai realist.

import { type Color3, type Mesh, type Scene, TransformNode } from "@babylonjs/core";
import type { HeroClass, WeaponId, ZombieType } from "../../core";
import { type Materials, ModelKit } from "../ModelKit";
import { PAL, hex, mix } from "../palette";

// =====================================================================
// Eroi
// =====================================================================

export interface HeroLook {
  heroClass: HeroClass;
  coat: Color3;
  level: number;
  weapon: WeaponId;
}

/** Un picior din două bucăți: coapsa (pivot în șold) și gamba (pivot în genunchi). */
export interface Leg {
  hip: TransformNode;
  knee: TransformNode;
  meshes: Mesh[];
}

export interface HeroModel {
  /** Partea de sus (tors, cap, brațe, armă). */
  body: Mesh[];
  legL: Leg;
  legR: Leg;
  /** Vârful armei (pentru flacără și trasoare), în coordonatele eroului. */
  muzzle: [number, number, number];
}

const SMOOTH = { smooth: true } as const;

function buildLeg(scene: Scene, mats: Materials, seed: number, trousers: Color3, x: number, bulk: number): Leg {
  const hip = new TransformNode("hip", scene);
  hip.position.set(x, 0.92, 0);
  const knee = new TransformNode("knee", scene);
  knee.parent = hip;
  knee.position.set(0, -0.46, 0.02);

  const t = new ModelKit(scene, mats, seed);
  t.capsule(0.5, 0.12 * bulk, { p: [0, -0.22, 0] }, { color: trousers, wear: 0.12, ...SMOOTH });
  const thigh = t.buildOne("thigh");
  thigh.parent = hip;

  const s = new ModelKit(scene, mats, seed + 1);
  s.capsule(0.44, 0.1 * bulk, { p: [0, -0.2, 0] }, { color: trousers.scale(0.9), wear: 0.12, ...SMOOTH });
  // Bocanc de piele cu manșetă de blană.
  s.box(0.2 * bulk, 0.16, 0.34, { p: [0, -0.4, 0.06] }, { color: PAL.leather, wear: 0.2, frost: 0.5, frostNormal: 0.7 });
  s.cyl(0.1, 0.24 * bulk, 0.24 * bulk, 8, { p: [0, -0.28, 0] }, { color: PAL.fur, wear: 0.25, ...SMOOTH });
  const shin = s.buildOne("shin");
  shin.parent = knee;
  return { hip, knee, meshes: [thigh, shin] };
}

export function buildHero(scene: Scene, mats: Materials, look: HeroLook): HeroModel {
  const k = new ModelKit(scene, mats, 11);
  const { heroClass: cls, coat, level } = look;
  const tank = cls === "tank";
  const healer = cls === "healer";
  const bulk = tank ? 1.2 : 1;
  const fur = cls === "sniper" ? mix(PAL.fur, PAL.pine, 0.35) : PAL.fur;
  const trousers = mix(PAL.cloth, coat, 0.2);

  // Tors: umeri lați, talie mai îngustă (umbrire netedă).
  k.capsule(0.82, 0.27 * bulk, { p: [0, 1.32, 0], s: [1.3, 1, 0.82] }, { color: coat, wear: 0.1, ...SMOOTH });
  // Haina lungă (poalele până la jumătatea coapsei).
  k.cyl(0.5, 0.66 * bulk, 0.86 * bulk, 10, { p: [0, 0.86, 0], s: [1, 1, 0.78] }, { color: coat.scale(0.92), wear: 0.12, frost: 0.3, frostNormal: 0.7, ...SMOOTH });
  // Centură cu cataramă de fier.
  k.cyl(0.1, 0.64 * bulk, 0.66 * bulk, 10, { p: [0, 1.05, 0], s: [1, 1, 0.8] }, { color: PAL.leather, wear: 0.15, ...SMOOTH });
  k.box(0.12, 0.09, 0.05, { p: [0, 1.05, 0.27] }, { color: PAL.iron, mat: "metal" });
  // Rucsac cu sac de dormit rulat deasupra.
  k.box(0.5 * bulk, 0.55, 0.26, { p: [0, 1.35, -0.33] }, { color: mix(PAL.leather, PAL.cloth, 0.4), wear: 0.2, frost: 0.5, frostNormal: 0.7 });
  k.cyl(0.62 * bulk, 0.2, 0.2, 10, { p: [0, 1.68, -0.32], r: [0, 0, Math.PI / 2] }, { color: hex("#5b6650"), wear: 0.15, frost: 0.6, frostNormal: 0.6, ...SMOOTH });
  // Guler de blană (mai mare la niveluri mari).
  const furSize = level >= 3 ? 1.2 : 1;
  k.cyl(0.22, 0.62 * bulk * furSize, 0.72 * bulk * furSize, 12, { p: [0, 1.66, 0], s: [1, 1, 0.82] }, { color: fur, wear: 0.25, frost: 0.45, frostNormal: 0.6, ...SMOOTH });
  if (level >= 3) {
    k.cyl(0.16, 0.7 * bulk, 0.92 * bulk, 12, { p: [0, 1.56, -0.04], s: [1, 1, 0.8] }, { color: PAL.furDark, wear: 0.25, ...SMOOTH });
  }
  // Bandă de fier pe umăr (nivel 5+), pe ambii umeri (nivel 8+).
  if (level >= 5) {
    for (const side of level >= 8 ? [1, -1] : [1]) {
      k.sphere(1, 8, { p: [side * 0.4 * bulk, 1.62, 0], s: [0.36, 0.18, 0.4], r: [0, 0, side * -0.35] }, { color: PAL.iron, mat: "metal", wear: 0.25, ...SMOOTH });
      k.box(0.3, 0.05, 0.36, { p: [side * 0.42 * bulk, 1.7, 0], r: [0, 0, side * -0.35] }, { color: PAL.rust, wear: 0.3 });
    }
  }

  // Cap: glugă de blană (sau coif de fier la Tank), fața în umbră, eșarfă.
  if (tank) {
    k.sphere(0.46, 12, { p: [0, 1.92, 0], s: [1, 0.95, 1] }, { color: PAL.iron, mat: "metal", wear: 0.2, ...SMOOTH });
    k.cyl(0.1, 0.5, 0.52, 12, { p: [0, 1.8, 0] }, { color: fur, wear: 0.2, ...SMOOTH });
    k.box(0.07, 0.24, 0.08, { p: [0, 1.87, 0.22] }, { color: PAL.iron, mat: "metal" });
    k.sphere(0.3, 8, { p: [0, 1.82, 0.12] }, { color: PAL.skin.scale(0.7), ...SMOOTH });
  } else {
    k.sphere(0.32, 10, { p: [0, 1.88, 0.06] }, { color: PAL.skin.scale(0.75), ...SMOOTH });
    k.sphere(0.5, 10, { p: [0, 1.92, -0.04], s: [1, 1.08, 1.05] }, { color: fur, wear: 0.22, frost: 0.5, frostNormal: 0.55, ...SMOOTH });
    k.cyl(0.14, 0.34, 0.38, 10, { p: [0, 1.77, 0.08] }, { color: coat.scale(0.6), wear: 0.15, ...SMOOTH });
  }

  // Bandulieră în diagonală, cu cartușe.
  if (!healer) {
    k.box(0.1, 0.95, 0.05, { p: [0, 1.3, 0.25], r: [0, 0, 0.62] }, { color: PAL.leather, wear: 0.2 });
    for (let i = 0; i < 5; i++) {
      k.cyl(0.1, 0.05, 0.05, 6, { p: [-0.22 + i * 0.11, 1.12 + i * 0.08, 0.29], r: [0, 0, 0.62] }, { color: PAL.gold, mat: "metal" });
    }
  }

  // Brațe întinse înainte, ținând arma (umăr → cot → mână).
  const arm = (x: number, reach: number) => {
    k.capsule(0.42, 0.095 * bulk, { p: [x, 1.48, 0.12 + reach * 0.05], r: [0.9, 0, 0] }, { color: coat, wear: 0.1, ...SMOOTH });
    k.capsule(0.4, 0.085 * bulk, { p: [x * 0.65, 1.33, 0.42 + reach * 0.15], r: [1.45, 0, 0] }, { color: coat.scale(0.9), wear: 0.1, ...SMOOTH });
    k.sphere(0.15, 8, { p: [x * 0.55, 1.3, 0.62 + reach * 0.15] }, { color: PAL.leather, ...SMOOTH });
  };

  let muzzle: [number, number, number] = [0.15, 1.3, 1.5];
  if (cls === "assault" || cls === "sniper") {
    arm(0.4, 0);
    arm(-0.4, 1);
    muzzle = gun(k, look.weapon, cls === "sniper");
  } else if (tank) {
    // Pușcă cu alice grea + scut rotund de lemn pe spate.
    arm(0.42, 0);
    arm(-0.42, 1);
    k.cyl(0.12, 1.1, 1.1, 14, { p: [0, 1.3, -0.5], r: [Math.PI / 2, 0, 0] }, { color: PAL.oldWood, wear: 0.22 });
    k.cyl(0.14, 1.16, 1.16, 14, { p: [0, 1.3, -0.51], r: [Math.PI / 2, 0, 0], s: [1, 0.5, 1] }, { color: PAL.iron, mat: "metal", wear: 0.25 });
    muzzle = gun(k, look.weapon === "rusty" ? "scattergun" : look.weapon, false);
  } else {
    // Healer: robă lungă, pușcă ușoară, felinar de gheață la șold.
    k.cyl(0.6, 0.8, 1.05, 12, { p: [0, 0.55, 0] }, { color: coat, wear: 0.12, frost: 0.4, frostNormal: 0.6, ...SMOOTH });
    arm(0.4, 0);
    arm(-0.4, 1);
    muzzle = gun(k, look.weapon, false);
    k.box(0.2, 0.26, 0.2, { p: [-0.42, 0.98, 0.1] }, { color: PAL.iron, mat: "metal", wear: 0.2 });
    k.box(0.13, 0.18, 0.13, { p: [-0.42, 0.98, 0.1] }, { color: PAL.ice, mat: "glow" });
  }

  const body = k.build(`hero_${cls}`);
  const legL = buildLeg(scene, mats, 21, trousers, -0.15 * bulk, bulk);
  const legR = buildLeg(scene, mats, 23, trousers, 0.15 * bulk, bulk);
  return { body, legL, legR, muzzle };
}

/** Arma de foc a eroului; arată diferit pentru fiecare armă din magazin. Returnează vârful țevii. */
function gun(k: ModelKit, weapon: WeaponId, sniper: boolean): [number, number, number] {
  const y = 1.36;
  const x = 0.1;
  const stock = (len: number, color = PAL.oldWood) =>
    k.box(0.13, 0.19, len, { p: [x, y - 0.05, 0.18], r: [0.08, 0, 0] }, { color, wear: 0.22 });
  const barrel = (len: number, z: number, d = 0.08, color = PAL.iron, dx = 0, dy = 0.05) =>
    k.cyl(len, d, d * 1.15, 10, { p: [x + dx, y + dy, z], r: [Math.PI / 2, 0, 0] }, { color, mat: "metal", wear: 0.2, smooth: true });
  switch (weapon) {
    case "hunting":
      stock(0.75);
      k.box(0.11, 0.11, 0.9, { p: [x, y, 0.75] }, { color: PAL.oldWood, wear: 0.2 });
      barrel(1.3, 1.1);
      k.cyl(0.4, 0.09, 0.09, 10, { p: [x, y + 0.17, 0.75], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal", smooth: true });
      return [x, y + 0.05, 1.76];
    case "scattergun":
      stock(0.6, PAL.darkWood);
      barrel(1.0, 0.95, 0.09, PAL.iron, -0.05);
      barrel(1.0, 0.95, 0.09, PAL.iron, 0.05);
      return [x, y + 0.05, 1.45];
    case "pipeGun":
      stock(0.5);
      for (const [dx, dy] of [[-0.06, 0.02], [0.06, 0.02], [0, 0.11]] as const) barrel(1.2, 0.95, 0.075, mix(PAL.iron, PAL.rust, 0.3), dx, dy);
      k.box(0.24, 0.3, 0.3, { p: [x, y - 0.22, 0.6] }, { color: PAL.rust, mat: "metal", wear: 0.3 });
      return [x, y + 0.05, 1.55];
    case "boneBow":
      stock(0.9, PAL.bone);
      k.box(1.3, 0.07, 0.07, { p: [x, y + 0.05, 1.0] }, { color: PAL.bone, wear: 0.15 });
      k.box(0.03, 0.03, 0.9, { p: [x, y + 0.1, 0.85] }, { color: PAL.darkWood });
      return [x, y + 0.1, 1.3];
    case "iceLance":
      stock(0.6, PAL.darkWood);
      k.cyl(1.3, 0.04, 0.16, 8, { p: [x, y + 0.04, 1.05], r: [Math.PI / 2, 0, 0] }, { color: PAL.ice, mat: "glow" });
      k.box(0.2, 0.2, 0.2, { p: [x, y + 0.04, 0.45] }, { color: PAL.iron, mat: "metal" });
      return [x, y + 0.04, 1.7];
    default: {
      // Țeava ruginită: pușcă din țevi și lemn, legată cu sfoară. La Sniper e lungă, cu lunetă.
      const len = sniper ? 1.9 : 1.25;
      stock(0.65);
      barrel(len, 0.4 + len / 2, 0.1, mix(PAL.iron, PAL.rust, 0.35));
      k.cyl(0.18, 0.15, 0.15, 8, { p: [x, y + 0.05, 0.75], r: [Math.PI / 2, 0, 0] }, { color: PAL.cloth, wear: 0.3, smooth: true });
      k.box(0.09, 0.3, 0.15, { p: [x, y - 0.2, 0.6], r: [0.15, 0, 0] }, { color: PAL.iron, mat: "metal" });
      if (sniper) k.cyl(0.5, 0.09, 0.09, 10, { p: [x, y + 0.2, 0.7], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal", smooth: true });
      return [x, y + 0.05, 0.45 + len];
    }
  }
}

// =====================================================================
// Zombi
// =====================================================================

export interface ZombieModel {
  /** Corpul (tors + cap + zdrențe) și ochii strălucitori — sursele instanțelor. */
  body: Mesh[];
  /** Brațe (sau aripi, la zburător) și picioare, fiecare cu pivotul în articulație. */
  armL: Mesh;
  armR: Mesh;
  legL: Mesh;
  legR: Mesh;
  shoulder: [number, number, number];
  hip: [number, number];
}

function limb(scene: Scene, mats: Materials, seed: number, build: (k: ModelKit) => void): Mesh {
  const k = new ModelKit(scene, mats, seed);
  build(k);
  return k.buildOne(`limb${seed}`);
}

const eye = (k: ModelKit, x: number, y: number, z: number, size = 0.08, color = PAL.ice) =>
  k.sphere(size, 6, { p: [x, y, z] }, { color, mat: "glow" });

/** 1) Sălbatic subțire: brațe lungi, zdrențe înghețate, cap mare aplecat în față. */
function buildWalker(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = PAL.skinZombie;
  // Tors aplecat, spate cocoșat (forme netede).
  k.capsule(0.78, 0.22, { p: [0, 1.12, 0.12], r: [0.6, 0, 0], s: [1.15, 1, 0.8] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(0.5, 10, { p: [0, 1.4, -0.04], s: [1.2, 0.8, 1] }, { color: PAL.skinZombieDark, wear: 0.15, frost: 0.3, ...SMOOTH });
  k.capsule(0.4, 0.2, { p: [0, 0.82, 0], r: [0, 0, Math.PI / 2] }, { color: PAL.skinZombieDark, wear: 0.15, ...SMOOTH });
  // Coaste vizibile (os îngălbenit).
  for (let i = 0; i < 4; i++) k.capsule(0.36, 0.022, { p: [0, 0.98 + i * 0.1, 0.3 + i * 0.05], r: [0.6, 0, Math.PI / 2] }, { color: PAL.bone, wear: 0.15, ...SMOOTH });
  // Cap mare, împins în față și în jos, maxilar căzut.
  k.sphere(0.42, 10, { p: [0, 1.56, 0.46], s: [1, 1.05, 1.05] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(0.26, 8, { p: [0, 1.4, 0.6], s: [1, 0.6, 0.9] }, { color: PAL.skinZombieDark, wear: 0.1, ...SMOOTH });
  for (const x of [-0.1, 0.1]) eye(k, x, 1.6, 0.66);
  // Zdrențe înghețate care atârnă.
  for (let i = 0; i < 6; i++) {
    const h = k.rand(0.3, 0.6);
    k.box(k.rand(0.12, 0.22), h, 0.03, { p: [k.rand(-0.24, 0.24), 0.82 - h / 2 + 0.15, k.rand(-0.15, 0.18)], r: [k.rand(-0.2, 0.2), k.rand(0, 3), k.rand(-0.2, 0.2)] }, { color: PAL.rags, wear: 0.25, frost: 0.4 });
  }
  const body = k.build(`walker${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(0.55, 0.075, { p: [0, -0.26, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
    a.capsule(0.6, 0.065, { p: [0, -0.76, 0.08] }, { color: PAL.skinZombieDark, wear: 0.15, ...SMOOTH });
    for (const dx of [-0.04, 0, 0.04]) a.cyl(0.18, 0.005, 0.03, 4, { p: [dx, -1.12, 0.12] }, { color: PAL.bone });
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.48, 0.09, { p: [0, -0.22, 0] }, { color: PAL.rags, wear: 0.2, frost: 0.3, ...SMOOTH });
    a.capsule(0.44, 0.075, { p: [0, -0.62, -0.05] }, { color: skin, wear: 0.15, ...SMOOTH });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [0.3, 1.38, 0.3], hip: [0.13, 0.82] };
}

/** 2) Scuipător: burtă umflată, pungi de otravă înghețată care strălucesc pe spate. */
function buildSpitter(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(PAL.skinZombie, hex("#5f7a6a"), 0.4);
  const venom = hex("#9fe8c0");
  k.sphere(0.95, 12, { p: [0, 1.05, 0.05], s: [1, 1.05, 0.95] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(0.6, 10, { p: [0, 1.45, -0.12], s: [1.2, 0.8, 1] }, { color: PAL.skinZombieDark, wear: 0.15, frost: 0.3, ...SMOOTH });
  for (const [x, y, z, d] of [[0.2, 1.4, -0.42, 0.3], [-0.22, 1.3, -0.4, 0.26], [0, 1.6, -0.35, 0.24], [0.28, 1.05, -0.35, 0.2]] as const) {
    k.sphere(d, 8, { p: [x, y, z] }, { color: venom, mat: "glow" });
  }
  // Gât lung și cap cu falcă largă.
  k.capsule(0.4, 0.1, { p: [0, 1.62, 0.3], r: [0.9, 0, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(0.36, 10, { p: [0, 1.75, 0.5] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(0.3, 8, { p: [0, 1.6, 0.62], s: [1.1, 0.6, 1] }, { color: PAL.skinZombieDark, ...SMOOTH });
  k.sphere(0.12, 6, { p: [0, 1.6, 0.74] }, { color: venom, mat: "glow" });
  for (const x of [-0.08, 0.08]) eye(k, x, 1.82, 0.65, 0.07);
  k.box(0.7, 0.3, 0.5, { p: [0, 0.65, 0] }, { color: PAL.rags, wear: 0.2, frost: 0.4 });
  const body = k.build(`spitter${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(0.4, 0.07, { p: [0, -0.2, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
    a.capsule(0.38, 0.06, { p: [0, -0.55, 0.06] }, { color: PAL.skinZombieDark, ...SMOOTH });
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.62, 0.11, { p: [0, -0.28, 0] }, { color: PAL.rags, wear: 0.2, ...SMOOTH });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [0.42, 1.35, 0.1], hip: [0.16, 0.62] };
}

/** 3) Zburător: harpie înghețată cu aripi de membrană, picioare cu gheare care atârnă. */
function buildFlyer(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(PAL.skinZombie, PAL.ice, 0.15);
  k.capsule(0.75, 0.16, { p: [0, 0, 0], r: [1.2, 0, 0], s: [1.1, 1, 0.9] }, { color: skin, wear: 0.15, ...SMOOTH });
  for (let i = 0; i < 4; i++) k.capsule(0.26, 0.018, { p: [0, -0.08, -0.15 + i * 0.1], r: [0, 0, Math.PI / 2] }, { color: PAL.bone, ...SMOOTH });
  k.sphere(0.3, 10, { p: [0, 0.12, 0.45], s: [0.9, 0.9, 1.3] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.cyl(0.25, 0, 0.1, 5, { p: [0, 0.06, 0.68], r: [Math.PI / 2, 0, 0] }, { color: PAL.bone });
  for (const x of [-0.07, 0.07]) eye(k, x, 0.18, 0.56, 0.06);
  // Coadă zdrențuită.
  k.box(0.18, 0.03, 0.6, { p: [0, -0.05, -0.55], r: [-0.3, 0, 0] }, { color: PAL.rags, wear: 0.25 });
  const body = k.build(`flyer${seed}`);
  // Aripa: os lung + membrane (plăci subțiri) — pivot la umăr, se întinde spre exterior pe axa x.
  const wing = (s: number, side: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(1.3, 0.04, { p: [side * 0.62, 0.05, 0], r: [0, 0, Math.PI / 2] }, { color: PAL.bone, ...SMOOTH });
    for (let i = 0; i < 3; i++) {
      a.box(0.55, 0.015, 0.55 - i * 0.1, { p: [side * (0.3 + i * 0.4), 0, -0.25 - i * 0.04], r: [0, side * 0.2 * i, 0] }, { color: mix(PAL.skinZombieDark, PAL.rags, 0.4), wear: 0.25 });
    }
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.5, 0.04, { p: [0, -0.22, 0] }, { color: skin, ...SMOOTH });
    for (const dx of [-0.04, 0.04]) a.cyl(0.12, 0.005, 0.03, 4, { p: [dx, -0.5, 0.04] }, { color: PAL.bone });
  });
  return { body, armL: wing(1, -1), armR: wing(2, 1), legL: legM(1), legR: legM(2), shoulder: [0.12, 0.08, 0.05], hip: [0.08, -0.1] };
}

/** 4) Brută: umeri de blană ruptă, cap mic, bâtă de os. */
function buildBrute(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(PAL.skinZombie, PAL.skinZombieDark, 0.4);
  k.capsule(1.1, 0.48, { p: [0, 1.35, 0.1], r: [0.45, 0, 0], s: [1.15, 1, 0.85] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(1.0, 12, { p: [0, 1.85, -0.25], s: [1.35, 0.8, 1] }, { color: PAL.skinZombieDark, wear: 0.15, frost: 0.4, ...SMOOTH });
  k.box(0.85, 0.35, 0.6, { p: [0, 0.9, 0] }, { color: PAL.rags, wear: 0.2 });
  // Umeri de blană ruptă.
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      k.sphere(0.6 - i * 0.08, 8, { p: [side * (0.48 + i * 0.07), 1.84 - i * 0.1, 0.12 - i * 0.12], s: [1, 0.65, 1] }, { color: i === 0 ? PAL.furDark : PAL.fur, wear: 0.3, frost: 0.55, frostNormal: 0.5, ...SMOOTH });
    }
  }
  // Cap mic, jos, între umeri.
  k.sphere(0.4, 10, { p: [0, 1.8, 0.62] }, { color: skin, wear: 0.15, ...SMOOTH });
  for (const x of [-0.09, 0.09]) eye(k, x, 1.84, 0.8);
  k.box(0.24, 0.07, 0.07, { p: [0, 1.68, 0.78] }, { color: PAL.bone });
  const body = k.build(`brute${seed}`);
  const armBuild = (withClub: boolean) => (a: ModelKit) => {
    a.capsule(0.65, 0.16, { p: [0, -0.3, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
    a.capsule(0.65, 0.15, { p: [0, -0.86, 0.12] }, { color: PAL.skinZombieDark, wear: 0.15, ...SMOOTH });
    if (withClub) {
      a.cyl(1.3, 0.14, 0.2, 8, { p: [0, -1.1, 0.6], r: [1.2, 0, 0] }, { color: PAL.bone, wear: 0.2, smooth: true });
      a.sphere(0.5, 8, { p: [0, -0.85, 1.2], s: [1, 0.85, 1.1] }, { color: PAL.bone, wear: 0.2, ...SMOOTH });
      a.sphere(0.5, 6, { p: [0, -0.85, 1.2], s: [1.05, 0.9, 1.15] }, { color: mix(PAL.bone, PAL.blood, 0.6), wear: 0.3 });
    }
  };
  const armL = limb(scene, mats, seed + 1, armBuild(false));
  const armR = limb(scene, mats, seed + 2, armBuild(true));
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.55, 0.17, { p: [0, -0.25, 0] }, { color: PAL.rags, wear: 0.2, frost: 0.3, ...SMOOTH });
    a.capsule(0.45, 0.15, { p: [0, -0.65, 0.04] }, { color: skin, wear: 0.15, ...SMOOTH });
  });
  return { body, armL, armR, legL: legM(1), legR: legM(2), shoulder: [0.68, 1.75, 0.2], hip: [0.25, 0.9] };
}

/** 5) „Abominație” mică: înaltă, coarne de gheață, piept de os. Apare rar (boss). */
function buildBoss(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(PAL.skinZombieDark, PAL.iron, 0.3);
  k.sphere(2.0, 14, { p: [0, 1.75, 0.15], s: [1.15, 1.0, 0.95] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.capsule(1.6, 0.6, { p: [0, 2.6, 0.1], r: [0.35, 0, Math.PI / 2], s: [1, 1, 0.9] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(1.6, 12, { p: [0, 3.05, -0.35], s: [1.3, 0.8, 1] }, { color: PAL.skinZombie, wear: 0.15, frost: 0.5, ...SMOOTH });
  // Cusături grosolane pe burtă.
  for (let i = 0; i < 5; i++) k.box(0.5, 0.04, 0.04, { p: [0.1, 1.3 + i * 0.18, 1.02], r: [0, 0, 0.4] }, { color: PAL.cloth });
  // Piept de os: coaste mari peste piept.
  for (let i = 0; i < 4; i++) {
    k.capsule(1.3 - i * 0.12, 0.06, { p: [0, 2.0 + i * 0.25, 0.78 + i * 0.07], r: [0.35, 0, Math.PI / 2] }, { color: PAL.bone, wear: 0.18, ...SMOOTH });
  }
  k.capsule(1.0, 0.07, { p: [0, 2.35, 0.86], r: [0.35, 0, 0] }, { color: PAL.bone, wear: 0.15, ...SMOOTH });
  // Cap, cu coarne de gheață.
  k.sphere(0.65, 12, { p: [0, 3.05, 0.8] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.box(0.46, 0.13, 0.13, { p: [0, 2.82, 1.08] }, { color: PAL.bone });
  for (const x of [-0.14, 0.14]) eye(k, x, 3.1, 1.1, 0.11);
  for (const side of [1, -1]) {
    k.cyl(1.0, 0, 0.26, 6, { p: [side * 0.35, 3.6, 0.7], r: [-0.3, 0, side * -0.5] }, { color: mix(PAL.ice, PAL.snow, 0.3), wear: 0.08, smooth: true });
    for (let i = 0; i < 3; i++) {
      k.cyl(0.6 + i * 0.15, 0, 0.18, 5, { p: [side * (0.6 + i * 0.15), 3.25 - i * 0.05, -0.3 + i * 0.25], r: [-0.5, 0, side * -0.35] }, { color: mix(PAL.ice, PAL.snow, 0.4), wear: 0.08, smooth: true });
    }
  }
  k.box(1.5, 0.3, 1.0, { p: [0, 1.1, 0] }, { color: PAL.rags, wear: 0.2, frost: 0.4 });
  const body = k.build(`boss${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(1.0, 0.26, { p: [0, -0.45, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
    a.capsule(1.0, 0.24, { p: [0, -1.3, 0.25] }, { color: PAL.skinZombie, wear: 0.15, ...SMOOTH });
    for (const dx of [-0.14, 0, 0.14]) a.cyl(0.45, 0, 0.12, 5, { p: [dx, -1.9, 0.4], r: [0.4, 0, 0] }, { color: mix(PAL.ice, PAL.snow, 0.3) });
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.8, 0.26, { p: [0, -0.35, 0] }, { color: PAL.rags, wear: 0.2, ...SMOOTH });
    a.capsule(0.65, 0.24, { p: [0, -0.9, 0.05] }, { color: skin, wear: 0.15, ...SMOOTH });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [1.0, 3.0, 0.3], hip: [0.45, 1.2] };
}

export function buildZombie(scene: Scene, mats: Materials, type: ZombieType): ZombieModel {
  switch (type) {
    case "brute":
      return buildBrute(scene, mats, 300);
    case "boss":
      return buildBoss(scene, mats, 400);
    case "spitter":
      return buildSpitter(scene, mats, 500);
    case "flyer":
      return buildFlyer(scene, mats, 600);
    case "runner":
      return buildWalker(scene, mats, 150);
    default:
      return buildWalker(scene, mats, 100);
  }
}
