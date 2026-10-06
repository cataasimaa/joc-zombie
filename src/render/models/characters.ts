// Personajele: eroii (supraviețuitori de iarnă) și zombii (o familie de siluete).
// Brațele, picioarele și aripile sunt mesh-uri separate, cu „pivotul” în umăr/șold/genunchi,
// ca să le putem anima. Formele organice folosesc umbrire netedă (smooth) → aspect mai realist.

import { type Color3, type Mesh, type Scene, TransformNode } from "@babylonjs/core";
import type { ArmorMaterial, ArmorSlot, HeroClass, SkinAccessory, WeaponId, ZombieType } from "../../core";
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
  /** Accesoriul skin-ului (Moș Crăciun, vârcolac…), dacă are. */
  accessory?: SkinAccessory;
  /** Ține târnăcopul în mână: fără armă (târnăcopul e o piesă separată, animată). */
  noGun?: boolean;
  /** Armura purtată (cască, piept, pantaloni, papuci): piele sau metal. */
  armor?: Partial<Record<ArmorSlot, ArmorMaterial | null>>;
}

/** Culorile armurilor: piele tăbăcită cu cusături, fier forjat cu nituri și rugină. */
const LEATHER = hex("#7a5236");
const LEATHER_DARK = hex("#4e3322");
const STEEL = hex("#6d7882");
const STEEL_DARK = hex("#454e57");

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
  /**
   * Cu o unealtă în mână (fără armă), brațele sunt piese separate care se mișcă: atârnă din umăr
   * (în jos, pe -y), iar mâna e la `hand` sub umăr. Unealta se prinde de mână, deci nu mai trece prin ea.
   */
  arms?: { L: Mesh[]; R: Mesh[]; shoulder: [number, number, number]; hand: number };
}

const SMOOTH = { smooth: true } as const;

function buildLeg(scene: Scene, mats: Materials, seed: number, trousers: Color3, x: number, bulk: number, legs: ArmorMaterial | null = null, feet: ArmorMaterial | null = null): Leg {
  const hip = new TransformNode("hip", scene);
  hip.position.set(x, 0.92, 0);
  const knee = new TransformNode("knee", scene);
  knee.parent = hip;
  knee.position.set(0, -0.46, 0.02);

  const t = new ModelKit(scene, mats, seed);
  t.capsule(0.5, 0.12 * bulk, { p: [0, -0.22, 0] }, { color: legs === "leather" ? LEATHER : trousers, wear: 0.12, ...SMOOTH });
  if (legs === "leather") {
    // Pantaloni de piele: cusătură și curea la genunchi.
    t.cyl(0.05, 0.27 * bulk, 0.27 * bulk, 8, { p: [0, -0.4, 0] }, { color: LEATHER_DARK, wear: 0.2, ...SMOOTH });
  } else if (legs === "metal") {
    // Apărătoare de fier pe coapsă.
    t.box(0.22 * bulk, 0.34, 0.1, { p: [0, -0.2, 0.1] }, { color: STEEL, mat: "metal", wear: 0.3, frost: 0.3 });
    t.sphere(0.06, 5, { p: [0, -0.08, 0.16] }, { color: STEEL_DARK, mat: "metal" });
  }
  const thigh = t.buildOne("thigh");
  thigh.parent = hip;

  const s = new ModelKit(scene, mats, seed + 1);
  s.capsule(0.44, 0.1 * bulk, { p: [0, -0.2, 0] }, { color: legs === "leather" ? LEATHER.scale(0.9) : trousers.scale(0.9), wear: 0.12, ...SMOOTH });
  if (legs === "metal") {
    // Genunchere și apărătoare de fier pe gambă.
    s.sphere(0.2, 6, { p: [0, 0, 0.1], s: [1, 0.8, 0.7] }, { color: STEEL_DARK, mat: "metal", wear: 0.3 });
    s.box(0.2 * bulk, 0.3, 0.09, { p: [0, -0.2, 0.1] }, { color: STEEL, mat: "metal", wear: 0.3, frost: 0.3 });
  }
  // Bocanc de piele cu manșetă de blană (papucii de armură: piele groasă cu șireturi sau fier).
  const boot = feet === "metal" ? STEEL : feet === "leather" ? LEATHER : PAL.leather;
  s.box(0.2 * bulk * (feet ? 1.12 : 1), feet ? 0.2 : 0.16, feet ? 0.38 : 0.34, { p: [0, -0.4, 0.06] }, { color: boot, mat: feet === "metal" ? "metal" : undefined, wear: 0.2, frost: 0.5, frostNormal: 0.7 });
  if (feet === "metal") s.box(0.24 * bulk, 0.06, 0.12, { p: [0, -0.33, 0.22] }, { color: STEEL_DARK, mat: "metal", wear: 0.3 });
  if (feet === "leather") for (const dy of [-0.34, -0.29]) s.box(0.22 * bulk, 0.02, 0.02, { p: [0, dy, 0.17] }, { color: LEATHER_DARK });
  s.cyl(0.1, 0.24 * bulk, 0.24 * bulk, 8, { p: [0, -0.28, 0] }, { color: feet === "metal" ? STEEL_DARK : PAL.fur, mat: feet === "metal" ? "metal" : undefined, wear: 0.25, ...SMOOTH });
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

  // Mantie de blană ruptă, de pe umeri până sub genunchi (ca la supraviețuitorii din referințe).
  const mantle = mix(PAL.furDark, coat, 0.25);
  for (let i = 0; i < 11; i++) {
    const a = Math.PI + (i / 10 - 0.5) * 2.3;
    const h = k.rand(0.95, 1.35);
    const w = k.rand(0.2, 0.3);
    k.cyl(h, w, w * 0.2, 4, { p: [Math.sin(a) * 0.36 * bulk, 1.62 - h / 2, Math.cos(a) * 0.26 - 0.06], r: [k.rand(-0.1, 0.05), a + Math.PI / 4, 0], s: [1, 1, 0.14] }, { color: mix(mantle, PAL.cloth, k.rand(0, 0.4)), wear: 0.15, frost: 0.4, frostNormal: 0.25, smooth: true });
  }
  for (const side of [1, -1]) {
    k.sphere(0.42 * bulk, 8, { p: [side * 0.3 * bulk, 1.68, -0.02], s: [1, 0.55, 1] }, { color: fur, wear: 0.3, frost: 0.7, frostNormal: 0.3, ...SMOOTH });
  }

  // Cap: glugă de blană (sau coif de fier la Tank), fața în umbră, eșarfă. Skin-urile au capul lor.
  if (look.accessory) {
    skinHead(k, look.accessory, coat);
  } else if (tank) {
    k.sphere(0.46, 12, { p: [0, 1.92, 0], s: [1, 0.95, 1] }, { color: PAL.iron, mat: "metal", wear: 0.2, ...SMOOTH });
    k.cyl(0.1, 0.5, 0.52, 12, { p: [0, 1.8, 0] }, { color: fur, wear: 0.2, ...SMOOTH });
    k.box(0.07, 0.24, 0.08, { p: [0, 1.87, 0.22] }, { color: PAL.iron, mat: "metal" });
    k.sphere(0.3, 8, { p: [0, 1.82, 0.12] }, { color: PAL.skin.scale(0.7), ...SMOOTH });
  } else {
    // Glugă ascuțită cu margine de blană; fața în umbră (la Sniper, ochi reci care strălucesc).
    k.sphere(0.3, 10, { p: [0, 1.88, 0.08] }, { color: PAL.skin.scale(cls === "sniper" ? 0.3 : 0.6), ...SMOOTH });
    k.sphere(0.5, 10, { p: [0, 1.93, -0.05], s: [1, 1.1, 1.05] }, { color: mix(coat, PAL.cloth, 0.5), wear: 0.2, frost: 0.4, frostNormal: 0.55, ...SMOOTH });
    k.cyl(0.32, 0, 0.3, 8, { p: [0, 2.2, -0.16], r: [-0.5, 0, 0] }, { color: mix(coat, PAL.cloth, 0.5), wear: 0.2, frost: 0.5, ...SMOOTH });
    k.cyl(0.12, 0.48, 0.5, 12, { p: [0, 1.93, 0.13], r: [1.35, 0, 0] }, { color: fur, wear: 0.3, frost: 0.6, frostNormal: 0.3, ...SMOOTH });
    k.cyl(0.14, 0.34, 0.38, 10, { p: [0, 1.77, 0.08] }, { color: coat.scale(0.6), wear: 0.15, ...SMOOTH });
    if (cls === "sniper") for (const x of [-0.07, 0.07]) k.sphere(0.05, 6, { p: [x, 1.92, 0.33] }, { color: PAL.ice, mat: "glow" });
  }

  // Armura de piept și casca (peste haină și glugă).
  const chest = look.armor?.chest ?? null;
  const head = look.armor?.head ?? null;
  if (chest === "leather") {
    // Vestă de piele tăbăcită cu curele și cusături.
    k.capsule(0.62, 0.285 * bulk, { p: [0, 1.36, 0.01], s: [1.32, 1, 0.86] }, { color: LEATHER, wear: 0.25, frost: 0.2, ...SMOOTH });
    for (const y of [1.2, 1.38, 1.56]) k.box(0.62 * bulk, 0.035, 0.04, { p: [0, y, 0.25] }, { color: LEATHER_DARK });
  } else if (chest === "metal") {
    // Pieptar de fier cu nituri și umăr de oțel pe ambele părți.
    k.capsule(0.6, 0.29 * bulk, { p: [0, 1.37, 0.02], s: [1.3, 1, 0.86] }, { color: STEEL, mat: "metal", wear: 0.3, frost: 0.25, ...SMOOTH });
    k.box(0.06, 0.5, 0.06, { p: [0, 1.38, 0.27] }, { color: STEEL_DARK, mat: "metal" });
    for (const [x, y] of [[-0.2, 1.55], [0.2, 1.55], [-0.22, 1.2], [0.22, 1.2]] as const) k.sphere(0.04, 5, { p: [x, y, 0.27] }, { color: PAL.rust, mat: "metal" });
    for (const side of [1, -1]) k.sphere(1, 8, { p: [side * 0.42 * bulk, 1.64, 0], s: [0.34, 0.2, 0.38], r: [0, 0, side * -0.4] }, { color: STEEL, mat: "metal", wear: 0.25, ...SMOOTH });
  }
  if (head === "leather" && !look.accessory) {
    // Căciulă de piele cu clape pentru urechi.
    k.sphere(0.5, 10, { p: [0, 2.0, -0.03], s: [1.02, 0.7, 1.05] }, { color: LEATHER, wear: 0.25, frost: 0.5, ...SMOOTH });
    for (const side of [1, -1]) k.box(0.08, 0.26, 0.2, { p: [side * 0.25, 1.86, 0.02] }, { color: LEATHER_DARK, wear: 0.2 });
  } else if (head === "metal" && !look.accessory) {
    // Coif de fier cu apărătoare de nas și creastă.
    k.sphere(0.54, 12, { p: [0, 2.0, -0.02], s: [1, 0.78, 1.04] }, { color: STEEL, mat: "metal", wear: 0.25, frost: 0.4, ...SMOOTH });
    k.box(0.06, 0.24, 0.06, { p: [0, 1.9, 0.27] }, { color: STEEL_DARK, mat: "metal" });
    k.box(0.05, 0.08, 0.5, { p: [0, 2.2, -0.02] }, { color: STEEL_DARK, mat: "metal" });
  }

  // Bandulieră în diagonală, cu cartușe.
  if (!healer) {
    k.box(0.1, 0.95, 0.05, { p: [0, 1.3, 0.25], r: [0, 0, 0.62] }, { color: PAL.leather, wear: 0.2 });
    for (let i = 0; i < 5; i++) {
      k.cyl(0.1, 0.05, 0.05, 6, { p: [-0.22 + i * 0.11, 1.12 + i * 0.08, 0.29], r: [0, 0, 0.62] }, { color: PAL.gold, mat: "metal" });
    }
  }

  // Brațe întinse înainte, ținând arma (umăr → cot → mână). Cu unealta în mână, brațele se fac
  // separat (vezi `toolArm`), ca să poată ține unealta.
  const arm = (x: number, reach: number) => {
    if (look.noGun) return;
    k.capsule(0.42, 0.095 * bulk, { p: [x, 1.48, 0.12 + reach * 0.05], r: [0.9, 0, 0] }, { color: coat, wear: 0.1, ...SMOOTH });
    k.capsule(0.4, 0.085 * bulk, { p: [x * 0.65, 1.33, 0.42 + reach * 0.15], r: [1.45, 0, 0] }, { color: coat.scale(0.9), wear: 0.1, ...SMOOTH });
    k.sphere(0.15, 8, { p: [x * 0.55, 1.3, 0.62 + reach * 0.15] }, { color: PAL.leather, ...SMOOTH });
  };

  let muzzle: [number, number, number] = [0.15, 1.3, 1.5];
  if (cls === "assault" || cls === "sniper") {
    arm(0.4, 0);
    arm(-0.4, 1);
    if (!look.noGun) muzzle = gun(k, look.weapon, cls === "sniper");
  } else if (tank) {
    // Pușcă cu alice grea + scut rotund de lemn pe spate.
    arm(0.42, 0);
    arm(-0.42, 1);
    k.cyl(0.12, 1.1, 1.1, 14, { p: [0, 1.3, -0.5], r: [Math.PI / 2, 0, 0] }, { color: PAL.oldWood, wear: 0.22 });
    k.cyl(0.14, 1.16, 1.16, 14, { p: [0, 1.3, -0.51], r: [Math.PI / 2, 0, 0], s: [1, 0.5, 1] }, { color: PAL.iron, mat: "metal", wear: 0.25 });
    if (!look.noGun) muzzle = gun(k, look.weapon === "rusty" ? "scattergun" : look.weapon, false);
  } else {
    // Healer: robă lungă, pușcă ușoară, felinar de gheață la șold și toiag cu cristal de chihlimbar pe spate.
    k.cyl(2.1, 0.07, 0.09, 6, { p: [0.2, 1.25, -0.42], r: [0, 0, -0.3] }, { color: PAL.oldWood, wear: 0.25 });
    for (const [dx, dy] of [[-0.12, 0.12], [0.12, 0.1], [0, 0.18]] as const) {
      k.cyl(0.35, 0.02, 0.05, 4, { p: [0.53 + dx, 2.25 + dy, -0.42], r: [0, 0, dx * 4] }, { color: PAL.bone });
    }
    k.cyl(0.32, 0, 0.18, 5, { p: [0.53, 2.32, -0.42] }, { color: hex("#ffb347"), mat: "glow" });
    k.cyl(0.6, 0.8, 1.05, 12, { p: [0, 0.55, 0] }, { color: coat, wear: 0.12, frost: 0.4, frostNormal: 0.6, ...SMOOTH });
    arm(0.4, 0);
    arm(-0.4, 1);
    if (!look.noGun) muzzle = gun(k, look.weapon, false);
    k.box(0.2, 0.26, 0.2, { p: [-0.42, 0.98, 0.1] }, { color: PAL.iron, mat: "metal", wear: 0.2 });
    k.box(0.13, 0.18, 0.13, { p: [-0.42, 0.98, 0.1] }, { color: PAL.ice, mat: "glow" });
  }

  const body = k.build(`hero_${cls}`);
  const legL = buildLeg(scene, mats, 21, trousers, -0.15 * bulk, bulk, look.armor?.legs ?? null, look.armor?.feet ?? null);
  const legR = buildLeg(scene, mats, 23, trousers, 0.15 * bulk, bulk, look.armor?.legs ?? null, look.armor?.feet ?? null);
  let arms: HeroModel["arms"];
  if (look.noGun) {
    const toolArm = (seed: number) => {
      const a = new ModelKit(scene, mats, seed);
      a.capsule(0.42, 0.095 * bulk, { p: [0, -0.2, 0] }, { color: coat, wear: 0.1, ...SMOOTH });
      a.capsule(0.38, 0.085 * bulk, { p: [0, -0.5, 0.02] }, { color: coat.scale(0.9), wear: 0.1, ...SMOOTH });
      a.sphere(0.16, 8, { p: [0, -0.72, 0.02] }, { color: PAL.leather, ...SMOOTH });
      return a.build(`heroArm${seed}`);
    };
    arms = { L: toolArm(31), R: toolArm(33), shoulder: [0.38 * bulk, 1.58, 0.04], hand: 0.72 };
  }
  return { body, legL, legR, muzzle, arms };
}

/** Capul (și ce mai ține de el) pentru fiecare skin amuzant. */
function skinHead(k: ModelKit, acc: SkinAccessory, coat: Color3): void {
  const skin = PAL.skin.scale(0.85);
  const white = hex("#f2f4f6");
  const black = hex("#15161a");
  const eyes = (y: number, z: number, color: Color3, size = 0.06, gap = 0.08) => {
    for (const x of [-gap, gap]) k.sphere(size, 6, { p: [x, y, z] }, { color, mat: "glow" });
  };
  switch (acc) {
    case "santa":
      k.sphere(0.34, 10, { p: [0, 1.9, 0.05] }, { color: skin, ...SMOOTH });
      k.sphere(0.36, 10, { p: [0, 1.76, 0.14], s: [1, 1.1, 0.8] }, { color: white, wear: 0.05, ...SMOOTH });
      k.sphere(0.07, 6, { p: [0, 1.9, 0.24] }, { color: hex("#d06a6a"), ...SMOOTH });
      eyes(1.96, 0.2, black, 0.04);
      k.cyl(0.12, 0.42, 0.42, 12, { p: [0, 2.05, 0] }, { color: white, ...SMOOTH });
      k.cyl(0.55, 0, 0.38, 10, { p: [0.08, 2.32, -0.05], r: [0, 0, -0.5] }, { color: coat, ...SMOOTH });
      k.sphere(0.14, 8, { p: [0.32, 2.44, -0.05] }, { color: white, ...SMOOTH });
      k.cyl(0.1, 0.66, 0.66, 12, { p: [0, 1.06, 0], s: [1, 1, 0.8] }, { color: white, ...SMOOTH });
      break;
    case "skier":
      k.sphere(0.34, 10, { p: [0, 1.9, 0.05] }, { color: skin, ...SMOOTH });
      k.sphere(0.4, 10, { p: [0, 1.98, -0.02], s: [1, 0.8, 1] }, { color: hex("#ff5a2a"), ...SMOOTH });
      k.sphere(0.12, 6, { p: [0, 2.17, -0.02] }, { color: white, ...SMOOTH });
      k.box(0.36, 0.11, 0.08, { p: [0, 1.93, 0.2] }, { color: hex("#ffb020"), mat: "glow" });
      for (const x of [-0.12, 0.12]) k.box(0.08, 0.05, 2.0, { p: [x, 1.4, -0.42], r: [-1.45, 0, x] }, { color: hex("#2a7fd4"), wear: 0.05 });
      break;
    case "werewolf":
      k.sphere(0.46, 10, { p: [0, 1.95, 0.02] }, { color: hex("#5d5650"), wear: 0.2, ...SMOOTH });
      k.cyl(0.36, 0.14, 0.24, 8, { p: [0, 1.88, 0.3], r: [Math.PI / 2, 0, 0] }, { color: hex("#6e655c"), ...SMOOTH });
      k.sphere(0.08, 6, { p: [0, 1.92, 0.48] }, { color: black, ...SMOOTH });
      for (const x of [-0.18, 0.18]) k.cyl(0.26, 0, 0.14, 4, { p: [x, 2.22, -0.02], r: [0, 0, x * -1.5] }, { color: hex("#4a443e"), wear: 0.2 });
      eyes(2.02, 0.2, hex("#ffd23f"), 0.05, 0.1);
      for (const x of [-0.05, 0.05]) k.cyl(0.08, 0, 0.03, 3, { p: [x, 1.79, 0.42] }, { color: white });
      break;
    case "viking":
      k.sphere(0.34, 10, { p: [0, 1.9, 0.05] }, { color: skin, ...SMOOTH });
      k.sphere(0.36, 8, { p: [0, 1.74, 0.13], s: [1, 1.2, 0.8] }, { color: hex("#c26a2a"), wear: 0.15, ...SMOOTH });
      for (const x of [-0.1, 0.1]) k.capsule(0.3, 0.05, { p: [x, 1.55, 0.2] }, { color: hex("#c26a2a"), ...SMOOTH });
      k.sphere(0.44, 10, { p: [0, 2.0, 0], s: [1, 0.75, 1] }, { color: PAL.iron, mat: "metal", wear: 0.25, ...SMOOTH });
      for (const side of [1, -1]) k.cyl(0.42, 0, 0.13, 6, { p: [side * 0.3, 2.18, 0], r: [0, 0, side * -1.0] }, { color: PAL.bone, wear: 0.1, ...SMOOTH });
      break;
    case "snowman":
      k.sphere(0.46, 12, { p: [0, 1.95, 0.02] }, { color: white, wear: 0.03, ...SMOOTH });
      k.cyl(0.32, 0, 0.09, 6, { p: [0, 1.93, 0.36], r: [Math.PI / 2, 0, 0] }, { color: hex("#f07a1a"), ...SMOOTH });
      for (const x of [-0.1, 0.1]) k.sphere(0.07, 6, { p: [x, 2.03, 0.2] }, { color: black, ...SMOOTH });
      k.cyl(0.08, 0.6, 0.6, 12, { p: [0, 2.17, 0] }, { color: black, ...SMOOTH });
      k.cyl(0.36, 0.38, 0.38, 12, { p: [0, 2.38, 0] }, { color: black, ...SMOOTH });
      k.cyl(0.07, 0.39, 0.39, 12, { p: [0, 2.24, 0] }, { color: hex("#b0202a"), ...SMOOTH });
      for (let i = 0; i < 3; i++) k.sphere(0.07, 6, { p: [0, 1.15 + i * 0.16, 0.3] }, { color: black, ...SMOOTH });
      break;
    case "yeti":
      k.sphere(0.6, 12, { p: [0, 1.98, 0], s: [1, 0.95, 1] }, { color: hex("#e6ecf2"), wear: 0.08, ...SMOOTH });
      k.sphere(0.3, 8, { p: [0, 1.92, 0.24], s: [1, 0.9, 0.6] }, { color: hex("#6fa0c8"), ...SMOOTH });
      for (const side of [1, -1]) k.cyl(0.45, 0, 0.14, 6, { p: [side * 0.32, 2.3, -0.05], r: [0.3, 0, side * -0.8] }, { color: PAL.bone, ...SMOOTH });
      eyes(2.0, 0.33, PAL.ice, 0.05);
      for (const x of [-0.08, 0.08]) k.cyl(0.1, 0.03, 0, 3, { p: [x, 1.8, 0.33] }, { color: white });
      break;
    case "zombie":
      k.sphere(0.4, 10, { p: [0, 1.92, 0.04] }, { color: hex("#7a9a6a"), wear: 0.2, ...SMOOTH });
      k.sphere(0.15, 6, { p: [0.08, 2.08, 0.12] }, { color: hex("#c87a8a"), ...SMOOTH });
      k.sphere(0.07, 6, { p: [-0.09, 1.95, 0.22] }, { color: hex("#d6ff6a"), mat: "glow" });
      k.box(0.12, 0.03, 0.03, { p: [0.09, 1.95, 0.24] }, { color: black });
      k.box(0.2, 0.06, 0.04, { p: [0, 1.8, 0.22] }, { color: PAL.blood });
      break;
    case "knight":
      k.cyl(0.55, 0.42, 0.46, 12, { p: [0, 1.98, 0] }, { color: hex("#9aa4ae"), mat: "metal", wear: 0.15, ...SMOOTH });
      k.sphere(0.42, 12, { p: [0, 2.24, 0], s: [1, 0.5, 1] }, { color: hex("#9aa4ae"), mat: "metal", ...SMOOTH });
      k.box(0.3, 0.04, 0.05, { p: [0, 2.02, 0.22] }, { color: black });
      k.box(0.04, 0.2, 0.05, { p: [0, 1.9, 0.22] }, { color: black });
      for (let i = 0; i < 5; i++) k.sphere(0.16, 6, { p: [0, 2.38 + i * 0.03, -0.1 - i * 0.07] }, { color: hex("#c02030"), ...SMOOTH });
      break;
    case "chef":
      k.sphere(0.34, 10, { p: [0, 1.9, 0.05] }, { color: skin, ...SMOOTH });
      k.cyl(0.45, 0.38, 0.34, 12, { p: [0, 2.22, 0] }, { color: white, wear: 0.03, ...SMOOTH });
      k.sphere(0.5, 10, { p: [0, 2.48, 0], s: [1, 0.6, 1] }, { color: white, wear: 0.03, ...SMOOTH });
      for (const x of [-0.08, 0.08]) k.capsule(0.16, 0.035, { p: [x, 1.86, 0.22], r: [0, 0, Math.PI / 2 + x * 4] }, { color: black, ...SMOOTH });
      eyes(1.97, 0.2, black, 0.04);
      k.cyl(0.05, 0.5, 0.5, 12, { p: [0, 1.3, -0.45], r: [Math.PI / 2, 0, 0] }, { color: black, mat: "metal" });
      break;
    case "astronaut":
      k.sphere(0.6, 14, { p: [0, 1.96, 0] }, { color: white, wear: 0.03, ...SMOOTH });
      k.sphere(0.46, 12, { p: [0, 1.96, 0.12], s: [1, 0.8, 0.8] }, { color: hex("#2a4a7a"), mat: "glow" });
      k.cyl(0.4, 0.02, 0.02, 4, { p: [0.22, 2.35, -0.1] }, { color: PAL.iron, mat: "metal" });
      k.sphere(0.06, 6, { p: [0.22, 2.56, -0.1] }, { color: hex("#ff4040"), mat: "glow" });
      k.box(0.6, 0.6, 0.3, { p: [0, 1.38, -0.42] }, { color: white, wear: 0.05 });
      break;
    case "pumpkin":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.sphere(0.36, 8, { p: [Math.sin(a) * 0.14, 1.97, Math.cos(a) * 0.14], s: [0.8, 1, 0.8] }, { color: hex("#e0701a"), wear: 0.1, ...SMOOTH });
      }
      k.cyl(0.16, 0.05, 0.07, 6, { p: [0, 2.25, 0] }, { color: hex("#4a6a2a") });
      for (const x of [-0.1, 0.1]) k.cyl(0.04, 0.1, 0.1, 3, { p: [x, 2.03, 0.29], r: [Math.PI / 2, 0, 0] }, { color: PAL.fire, mat: "glow" });
      k.box(0.24, 0.06, 0.04, { p: [0, 1.88, 0.3] }, { color: PAL.fire, mat: "glow" });
      break;
    case "penguin":
      k.sphere(0.48, 12, { p: [0, 1.96, 0] }, { color: black, ...SMOOTH });
      k.sphere(0.34, 10, { p: [0, 1.92, 0.16], s: [1, 1, 0.6] }, { color: white, ...SMOOTH });
      k.cyl(0.2, 0, 0.12, 6, { p: [0, 1.9, 0.38], r: [Math.PI / 2, 0, 0] }, { color: hex("#f0a020"), ...SMOOTH });
      eyes(2.02, 0.32, black, 0.04);
      k.sphere(0.6, 10, { p: [0, 1.25, 0.12], s: [0.85, 1, 0.5] }, { color: white, ...SMOOTH });
      break;
  }
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
    case "pistol":
      // Pistol: mâner scurt, țeavă scurtă de oțel, ținut cu ambele mâini.
      k.box(0.1, 0.24, 0.12, { p: [x, y - 0.14, 0.62], r: [0.25, 0, 0] }, { color: PAL.darkWood, wear: 0.2 });
      k.box(0.11, 0.13, 0.42, { p: [x, y + 0.02, 0.8] }, { color: STEEL_DARK, mat: "metal", wear: 0.25 });
      barrel(0.25, 1.1, 0.06, STEEL_DARK);
      return [x, y + 0.05, 1.25];
    case "rifle":
      // Pușca (nv. 4): armă militară cu încărcare manuală — foarte lungă, fără lunetă, cu
      // închizătorul (mânerul) ieșit în lateral și baionetă lungă în vârf. Silueta: o lance.
      stock(0.8, mix(PAL.oldWood, LEATHER, 0.3));
      k.box(0.12, 0.13, 1.05, { p: [x, y, 0.85] }, { color: mix(PAL.oldWood, LEATHER, 0.3), wear: 0.2 });
      barrel(1.5, 1.2, 0.07, STEEL_DARK);
      // Închizătorul: o bilă pe un braț scurt, în dreapta.
      k.box(0.18, 0.03, 0.03, { p: [x + 0.13, y + 0.06, 0.55] }, { color: STEEL_DARK, mat: "metal" });
      k.sphere(0.09, 6, { p: [x + 0.23, y + 0.03, 0.55] }, { color: STEEL_DARK, mat: "metal" });
      // Baioneta: lamă subțire care trece de țeavă.
      k.box(0.025, 0.06, 0.5, { p: [x, y - 0.03, 2.08] }, { color: mix(STEEL_DARK, PAL.snow, 0.35), mat: "metal", wear: 0.1 });
      k.box(0.03, 0.04, 0.9, { p: [x - 0.08, y - 0.1, 0.55] }, { color: LEATHER_DARK });
      return [x, y + 0.05, 1.95];
    case "assaultRifle":
      // Pușca de asalt: corp negru de oțel, încărcător curbat, pat rabatabil, mâner în față.
      k.box(0.13, 0.2, 0.55, { p: [x, y - 0.02, 0.15] }, { color: hex("#2c3238"), mat: "metal", wear: 0.3 });
      k.box(0.14, 0.22, 0.7, { p: [x, y, 0.75] }, { color: hex("#30363d"), mat: "metal", wear: 0.25 });
      k.box(0.1, 0.32, 0.14, { p: [x, y - 0.26, 0.78], r: [-0.3, 0, 0] }, { color: hex("#3a2a1e"), wear: 0.2 });
      k.box(0.09, 0.2, 0.09, { p: [x, y - 0.2, 1.05] }, { color: hex("#2c3238"), mat: "metal" });
      barrel(0.75, 1.42, 0.065, hex("#22272c"));
      k.box(0.05, 0.08, 0.3, { p: [x, y + 0.15, 0.7] }, { color: hex("#22272c"), mat: "metal" });
      return [x, y + 0.05, 1.8];
    case "hunting":
      // Pușca de vânătoare: lemn deschis, pat gros, lunetă MARE (cu capace) — silueta cu „cocoașă”.
      stock(0.75, mix(PAL.oldWood, PAL.bone, 0.15));
      k.box(0.12, 0.12, 0.85, { p: [x, y, 0.75] }, { color: mix(PAL.oldWood, PAL.bone, 0.15), wear: 0.2 });
      barrel(1.2, 1.05);
      k.cyl(0.55, 0.12, 0.12, 12, { p: [x, y + 0.22, 0.72], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal", smooth: true });
      for (const z of [0.42, 1.0]) k.cyl(0.07, 0.16, 0.16, 12, { p: [x, y + 0.22, z], r: [Math.PI / 2, 0, 0] }, { color: STEEL_DARK, mat: "metal", smooth: true });
      for (const z of [0.6, 0.85]) k.box(0.04, 0.12, 0.04, { p: [x, y + 0.12, z] }, { color: STEEL_DARK, mat: "metal" });
      return [x, y + 0.05, 1.66];
    case "scattergun":
      // Flinta cu alice: scurtă și GROASĂ — două țevi late una lângă alta, gura evazată, pat retezat,
      // cartușe roșii prinse pe pat. Silueta: un trabuc dublu, lat.
      stock(0.45, PAL.darkWood);
      barrel(0.8, 0.85, 0.12, PAL.iron, -0.07);
      barrel(0.8, 0.85, 0.12, PAL.iron, 0.07);
      for (const dx of [-0.07, 0.07]) k.cyl(0.1, 0.16, 0.13, 10, { p: [x + dx, y + 0.05, 1.27], r: [Math.PI / 2, 0, 0] }, { color: STEEL_DARK, mat: "metal", smooth: true });
      k.box(0.3, 0.14, 0.26, { p: [x, y - 0.06, 0.82] }, { color: PAL.darkWood, wear: 0.25 });
      for (const z of [0.1, 0.2, 0.3]) k.cyl(0.07, 0.035, 0.035, 6, { p: [x + 0.09, y - 0.03, z], r: [0, 0, Math.PI / 2] }, { color: hex("#8a2a22") });
      return [x, y + 0.05, 1.35];
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
      // Țeava ruginită: pușcă din țevi și lemn, legată cu curele de piele, cu talisman de os.
      // La Sniper e lungă, cu lunetă.
      const len = sniper ? 1.9 : 1.25;
      stock(0.65);
      barrel(len, 0.4 + len / 2, 0.1, mix(PAL.iron, PAL.rust, 0.35));
      for (const z of [0.3, 0.55, 0.8]) k.cyl(0.07, 0.17, 0.17, 8, { p: [x, y + 0.02, z], r: [Math.PI / 2, 0, 0] }, { color: PAL.leather, wear: 0.3, smooth: true });
      k.cyl(0.18, 0.15, 0.15, 8, { p: [x, y + 0.05, 0.4 + len - 0.05], r: [Math.PI / 2, 0, 0] }, { color: PAL.rust, mat: "metal", wear: 0.3, smooth: true });
      k.cyl(0.2, 0.01, 0.06, 4, { p: [x, y - 0.25, 0.5], r: [0.3, 0, 0] }, { color: PAL.bone });
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

/** Culorile „iernii moarte”: piele cenușiu-albăstruie, cruste de gheață, zdrențe înghețate. */
const FROST_SKIN = hex("#6d7f8e");
const FROST_SKIN_DARK = hex("#4a5866");
const FROST_RAG = hex("#55606a");
const ICE_CRUST = mix(PAL.ice, PAL.snow, 0.45);

/** Fâșii de zdrențe înghețate care atârnă (cu vârfuri albe de chiciură). */
function rags(k: ModelKit, count: number, x: [number, number], y: number, z: [number, number], len: [number, number], width = 0.16, color = FROST_RAG) {
  for (let i = 0; i < count; i++) {
    const h = k.rand(len[0], len[1]);
    const px = k.rand(x[0], x[1]);
    const pz = k.rand(z[0], z[1]);
    const ry = Math.atan2(px, pz) + k.rand(-0.3, 0.3);
    // Fâșie ascuțită (lată sus, îngustă jos) — pânză ruptă, nu scândură.
    const w = k.rand(width * 0.6, width);
    k.cyl(h, w, w * 0.15, 4, { p: [px, y - h / 2, pz], r: [k.rand(-0.15, 0.15), ry + Math.PI / 4, k.rand(-0.12, 0.12)], s: [1, 1, 0.12] }, { color: mix(color, PAL.blood, k.rand(0, 0.2)), wear: 0.12, frost: 0.45, frostNormal: 0.2, smooth: true });
    if (k.rand() < 0.6) k.cyl(0.14, 0, w * 0.3, 4, { p: [px, y - h - 0.03, pz] }, { color: ICE_CRUST, wear: 0.05 });
  }
}

/** Gheare lungi, curbate. */
function claws(k: ModelKit, y: number, z: number, len: number, spread = 0.05, color = PAL.bone) {
  for (const dx of [-spread, 0, spread]) {
    k.cyl(len, 0.004, 0.035, 4, { p: [dx, y - len * 0.4, z + len * 0.25], r: [0.6, 0, dx * 3] }, { color, wear: 0.15 });
  }
}

/** 1) Strigoiul înghețat (walker): înalt și slab, înfășurat în zdrențe înghețate, ochi albaștri, gheare lungi. */
function buildWalker(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  // Tors slab, puțin aplecat, cu zdrențe lipite de corp.
  k.capsule(0.85, 0.2, { p: [0, 1.22, 0.06], r: [0.3, 0, 0], s: [1.1, 1, 0.75] }, { color: FROST_SKIN, wear: 0.2, ...SMOOTH });
  k.capsule(0.8, 0.215, { p: [0, 1.2, 0.04], r: [0.3, 0, 0], s: [1.15, 1, 0.8] }, { color: FROST_RAG, wear: 0.35, frost: 0.55, frostNormal: 0.3, ...SMOOTH });
  // Umeri osoși sub zdrențe.
  for (const side of [1, -1]) k.sphere(0.26, 8, { p: [side * 0.24, 1.55, 0.12] }, { color: FROST_RAG, wear: 0.3, frost: 0.7, frostNormal: 0.2, ...SMOOTH });
  // Bazin + fâșii de pânză care atârnă până la genunchi.
  k.capsule(0.36, 0.17, { p: [0, 0.86, 0], r: [0, 0, Math.PI / 2] }, { color: FROST_RAG, wear: 0.3, ...SMOOTH });
  rags(k, 10, [-0.24, 0.24], 0.95, [-0.16, 0.2], [0.35, 0.65]);
  rags(k, 6, [-0.3, 0.3], 1.6, [-0.1, 0.25], [0.3, 0.5], 0.14);
  // Cap înfășurat (glugă de zdrențe), față cenușie, gură deschisă, însângerată.
  k.sphere(0.4, 10, { p: [0, 1.78, 0.28], s: [1, 1.1, 1.05] }, { color: FROST_RAG, wear: 0.3, frost: 0.8, frostNormal: 0.2, ...SMOOTH });
  k.sphere(0.32, 10, { p: [0, 1.74, 0.38], s: [0.95, 1.05, 0.9] }, { color: FROST_SKIN, wear: 0.15, ...SMOOTH });
  k.sphere(0.14, 8, { p: [0, 1.64, 0.5], s: [1, 1.2, 0.6] }, { color: PAL.blood, wear: 0.2, ...SMOOTH });
  for (const dx of [-0.05, 0, 0.05]) k.cyl(0.05, 0, 0.02, 3, { p: [dx, 1.69, 0.52] }, { color: PAL.bone });
  for (const x of [-0.07, 0.07]) eye(k, x, 1.79, 0.52, 0.06);
  // Chiciură pe creștet.
  k.sphere(0.3, 8, { p: [0, 1.95, 0.26], s: [1.1, 0.4, 1] }, { color: PAL.snow, wear: 0.05, ...SMOOTH });
  const body = k.build(`walker${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(0.6, 0.07, { p: [0, -0.28, 0] }, { color: FROST_SKIN, wear: 0.15, ...SMOOTH });
    a.capsule(0.62, 0.06, { p: [0, -0.84, 0.06] }, { color: FROST_SKIN_DARK, wear: 0.2, ...SMOOTH });
    rags(a, 3, [-0.05, 0.05], -0.1, [-0.05, 0.05], [0.25, 0.45], 0.1);
    a.sphere(0.13, 6, { p: [0, -1.18, 0.1], s: [1, 0.7, 1.2] }, { color: FROST_SKIN_DARK, ...SMOOTH });
    claws(a, -1.22, 0.14, 0.26);
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.5, 0.085, { p: [0, -0.23, 0] }, { color: FROST_RAG, wear: 0.3, frost: 0.4, ...SMOOTH });
    a.capsule(0.5, 0.07, { p: [0, -0.65, -0.03] }, { color: FROST_SKIN_DARK, wear: 0.2, ...SMOOTH });
    a.sphere(0.16, 6, { p: [0, -0.9, 0.06], s: [0.8, 0.45, 1.5] }, { color: FROST_SKIN_DARK, ...SMOOTH });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [0.3, 1.55, 0.14], hip: [0.12, 0.88] };
}

/**
 * 1b) Târâtorul de gheață (runner): merge în patru labe, cap lung de reptilă, spini de cristal pe spate.
 * „Brațele” sunt labele din față, „picioarele” cele din spate (animate ca un galop).
 */
function buildRunner(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(FROST_SKIN, PAL.ice, 0.18);
  // Trup orizontal, slab, cu coloana vizibilă.
  k.capsule(1.3, 0.24, { p: [0, 0.95, 0], r: [Math.PI / 2 - 0.12, 0, 0], s: [1, 1, 0.85] }, { color: skin, wear: 0.2, ...SMOOTH });
  for (let i = 0; i < 6; i++) k.sphere(0.1, 6, { p: [0, 1.17 - i * 0.012, -0.45 + i * 0.17] }, { color: PAL.bone, wear: 0.1, ...SMOOTH });
  // Spini de gheață pe spate, înclinați spre coadă.
  for (let i = 0; i < 11; i++) {
    const z = -0.55 + i * 0.12;
    const h = 0.35 + Math.sin((i / 10) * Math.PI) * 0.45 + k.rand(-0.08, 0.08);
    for (const side of [-1, 1]) {
      k.cyl(h, 0, 0.07, 4, { p: [side * k.rand(0.05, 0.16), 1.15 + h * 0.35, z - h * 0.3], r: [-0.85 + k.rand(-0.15, 0.15), 0, side * k.rand(0.15, 0.45)] }, { color: mix(ICE_CRUST, PAL.snow, k.rand(0, 0.4)), wear: 0.05 });
    }
  }
  // Gât și cap lung, coborât spre pământ, cu ochi și dinți.
  k.capsule(0.45, 0.13, { p: [0, 0.92, 0.72], r: [1.9, 0, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(0.4, 10, { p: [0, 0.82, 0.98], s: [0.85, 0.75, 1.5] }, { color: skin, wear: 0.15, frost: 0.3, ...SMOOTH });
  k.sphere(0.28, 8, { p: [0, 0.7, 1.12], s: [0.8, 0.5, 1.3] }, { color: FROST_SKIN_DARK, ...SMOOTH });
  for (let i = 0; i < 5; i++) k.cyl(0.07, 0, 0.025, 3, { p: [-0.1 + i * 0.05, 0.69, 1.25] }, { color: PAL.bone });
  for (const x of [-0.11, 0.11]) {
    eye(k, x, 0.88, 1.13, 0.08);
    k.cyl(0.22, 0, 0.06, 4, { p: [x * 1.4, 1.0, 0.92], r: [-1.1, 0, x * 3] }, { color: mix(PAL.blood, skin, 0.6) });
  }
  // Coadă scurtă din zdrențe.
  rags(k, 4, [-0.12, 0.12], 0.95, [-0.75, -0.6], [0.3, 0.5], 0.12);
  const body = k.build(`runner${seed}`);
  const frontLeg = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(0.55, 0.07, { p: [0, -0.24, 0.04] }, { color: skin, wear: 0.15, ...SMOOTH });
    a.capsule(0.5, 0.055, { p: [0, -0.62, 0.12] }, { color: FROST_SKIN_DARK, ...SMOOTH });
    a.sphere(0.14, 6, { p: [0, -0.86, 0.18], s: [1, 0.5, 1.4] }, { color: FROST_SKIN_DARK, ...SMOOTH });
    for (const dx of [-0.06, 0, 0.06]) a.cyl(0.32, 0.004, 0.04, 4, { p: [dx, -0.9, 0.38], r: [1.35, 0, dx * 2] }, { color: mix(PAL.ice, PAL.iron, 0.5), mat: "metal" });
  });
  const hindLeg = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.5, 0.09, { p: [0, -0.2, -0.05], r: [-0.4, 0, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
    a.capsule(0.45, 0.06, { p: [0, -0.55, -0.05], r: [0.3, 0, 0] }, { color: FROST_SKIN_DARK, ...SMOOTH });
    for (const dx of [-0.05, 0.05]) a.cyl(0.2, 0.004, 0.035, 4, { p: [dx, -0.8, 0.08], r: [1.3, 0, 0] }, { color: PAL.bone });
  });
  return { body, armL: frontLeg(1), armR: frontLeg(2), legL: hindLeg(1), legR: hindLeg(2), shoulder: [0.22, 0.9, 0.5], hip: [0.2, 0.88] };
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

/** 4) Trolul de gheață (brute): uriaș, mantie de blană cu țurțuri, piele albastră cu cruste de gheață, bâtă din trunchi. */
function buildBrute(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = hex("#6f8aa6");
  const skinDark = hex("#4c6178");
  const fur = hex("#6a5c4c");
  // Trunchi masiv, aplecat, burtă și piept.
  k.capsule(1.3, 0.55, { p: [0, 1.45, 0.08], r: [0.32, 0, 0], s: [1.2, 1, 0.9] }, { color: skin, wear: 0.2, ...SMOOTH });
  k.sphere(1.0, 12, { p: [0, 1.15, 0.25], s: [1.1, 0.9, 0.85] }, { color: skinDark, wear: 0.2, ...SMOOTH });
  // Cruste de gheață pe piele (pete strălucitoare reci).
  for (let i = 0; i < 9; i++) {
    const a = k.rand(-1.2, 1.2);
    k.ico(k.rand(0.07, 0.13), { p: [Math.sin(a) * 0.5, k.rand(1.0, 1.8), 0.35 + Math.cos(a) * 0.25], s: [1, 0.5, 1] }, { color: PAL.ice, mat: "glow" });
  }
  // Mantia de blană: un guler gros în jurul umerilor și pe spate, cu țurțuri.
  for (let i = 0; i < 14; i++) {
    const a = (i / 13) * Math.PI * 1.6 - Math.PI * 0.8 + Math.PI;
    const r = 0.62;
    k.sphere(k.rand(0.42, 0.55), 8, { p: [Math.sin(a) * r, 2.0 + k.rand(-0.08, 0.1), Math.cos(a) * r * 0.75 + 0.05], s: [1, 0.7, 1] }, { color: mix(fur, PAL.furDark, k.rand(0, 1)), wear: 0.35, frost: 0.6, frostNormal: 0.4, ...SMOOTH });
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 13) * Math.PI * 1.7 - Math.PI * 0.85 + Math.PI;
    const h = k.rand(0.25, 0.55);
    k.cyl(h, 0.06, 0, 4, { p: [Math.sin(a) * 0.85, 1.75 - h / 2, Math.cos(a) * 0.65 + 0.05] }, { color: ICE_CRUST, wear: 0.05 });
  }
  // Blana atârnă pe spate până la genunchi (smocuri, nu plăci).
  for (let i = 0; i < 9; i++) {
    k.capsule(k.rand(0.8, 1.2), 0.13, { p: [-0.62 + i * 0.155, 1.35, -0.48], r: [0.18, 0, k.rand(-0.12, 0.12)], s: [1, 1, 0.5] }, { color: mix(fur, PAL.furDark, k.rand(0, 1)), wear: 0.25, frost: 0.55, frostNormal: 0.3, smooth: true });
  }
  // Fustă din fâșii de piele și blană.
  rags(k, 12, [-0.45, 0.45], 0.95, [-0.3, 0.38], [0.45, 0.7], 0.22, fur);
  // Cap mare, încruntat, maxilar proeminent.
  k.sphere(0.55, 10, { p: [0, 2.15, 0.62], s: [1, 1.05, 1] }, { color: skin, wear: 0.2, ...SMOOTH });
  k.sphere(0.42, 8, { p: [0, 1.98, 0.78], s: [1.2, 0.7, 0.9] }, { color: skinDark, ...SMOOTH });
  k.box(0.42, 0.1, 0.18, { p: [0, 2.28, 0.84], r: [0.3, 0, 0] }, { color: skinDark });
  for (const x of [-0.13, 0.13]) {
    eye(k, x, 2.2, 0.88, 0.08);
    k.cyl(0.12, 0, 0.05, 4, { p: [x * 0.8, 1.96, 0.98], r: [-0.2, 0, 0] }, { color: PAL.bone });
  }
  for (let i = 0; i < 5; i++) k.cyl(0.18, 0, 0.05, 4, { p: [k.rand(-0.15, 0.15), 2.45, 0.5 + k.rand(-0.1, 0.1)], r: [k.rand(-0.4, 0.2), 0, k.rand(-0.4, 0.4)] }, { color: ICE_CRUST });
  const body = k.build(`brute${seed}`);
  const armBuild = (withClub: boolean) => (a: ModelKit) => {
    a.capsule(0.75, 0.2, { p: [0, -0.32, 0] }, { color: skin, wear: 0.2, ...SMOOTH });
    a.capsule(0.75, 0.19, { p: [0, -0.95, 0.1] }, { color: skinDark, wear: 0.2, ...SMOOTH });
    // Brățări de blană legate cu sfoară.
    a.cyl(0.32, 0.46, 0.46, 8, { p: [0, -1.0, 0.1] }, { color: fur, wear: 0.35, frost: 0.4, smooth: true });
    a.sphere(0.36, 8, { p: [0, -1.38, 0.2] }, { color: skinDark, ...SMOOTH });
    if (withClub) {
      // Bâta: un trunchi noduros, înghețat la capăt.
      // Bâta pleacă din pumn, în jos și în față (direcția: rotație 2 rad pe x).
      a.cyl(1.8, 0.26, 0.15, 7, { p: [0, -1.76, 1.02], r: [2.0, 0, 0] }, { color: PAL.burntWood, wear: 0.3 });
      a.sphere(0.6, 8, { p: [0, -2.14, 1.84], s: [0.9, 0.9, 1.3] }, { color: PAL.oldWood, wear: 0.3, frost: 0.6, frostNormal: 0.2 });
      for (let i = 0; i < 5; i++) a.cyl(0.25, 0, 0.08, 4, { p: [a.rand(-0.2, 0.2), -2.14 + a.rand(-0.2, 0.2), 1.84 + a.rand(-0.25, 0.25)], r: [a.rand(0, 3), a.rand(0, 3), 0] }, { color: ICE_CRUST });
    } else {
      claws(a, -1.48, 0.28, 0.24, 0.1, PAL.bone);
    }
  };
  const armL = limb(scene, mats, seed + 1, armBuild(false));
  const armR = limb(scene, mats, seed + 2, armBuild(true));
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.6, 0.22, { p: [0, -0.25, 0] }, { color: skin, wear: 0.2, ...SMOOTH });
    // Picioare înfășurate în blană (ca niște cizme uriașe).
    a.cyl(0.6, 0.48, 0.55, 8, { p: [0, -0.68, 0.03] }, { color: fur, wear: 0.35, frost: 0.6, smooth: true });
    a.sphere(0.5, 8, { p: [0, -0.92, 0.12], s: [1, 0.5, 1.3] }, { color: mix(fur, PAL.snow, 0.3), wear: 0.3, ...SMOOTH });
  });
  return { body, armL, armR, legL: legM(1), legR: legM(2), shoulder: [0.78, 1.95, 0.15], hip: [0.3, 0.98] };
}

/**
 * 5) Lich-ul de gheață (boss): schelet uriaș cu craniu cu coarne, cușcă toracică goală,
 * mantie zdrențuită din care atârnă țurțuri, gheare lungi și o coasă din os, cu țepi.
 */
function buildBoss(scene: Scene, mats: Materials, seed: number, king = false): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const bone = mix(PAL.bone, hex("#b9c4cc"), 0.5);
  const boneDark = mix(bone, PAL.iron, 0.4);
  const cloak = hex("#4c5762");
  // Coloana, bazinul.
  for (let i = 0; i < 9; i++) k.sphere(0.2, 6, { p: [0, 1.7 + i * 0.2, -0.2 + i * 0.015] }, { color: boneDark, wear: 0.15, ...SMOOTH });
  k.sphere(0.7, 8, { p: [0, 1.65, -0.05], s: [1.3, 0.55, 0.8] }, { color: bone, wear: 0.2, ...SMOOTH });
  // Cușca toracică: coaste curbate (arcuri din capsule) + stern.
  for (let i = 0; i < 6; i++) {
    const y = 2.25 + i * 0.22;
    const w = 0.55 + Math.sin((i / 5) * Math.PI) * 0.25;
    for (const side of [1, -1]) {
      k.capsule(w * 1.2, 0.05, { p: [side * w * 0.45, y, 0.12], r: [0, side * 0.9, Math.PI / 2 + side * 0.25] }, { color: bone, wear: 0.15, ...SMOOTH });
      k.capsule(w * 0.8, 0.045, { p: [side * w * 0.42, y - 0.05, 0.38], r: [0, side * -0.9, Math.PI / 2 - side * 0.3] }, { color: bone, wear: 0.15, ...SMOOTH });
    }
  }
  k.capsule(1.1, 0.06, { p: [0, 2.75, 0.5], r: [0.1, 0, 0] }, { color: bone, wear: 0.15, ...SMOOTH });
  // Gheață ce crește printre coaste.
  for (let i = 0; i < 6; i++) k.cyl(k.rand(0.2, 0.4), 0, 0.08, 4, { p: [k.rand(-0.4, 0.4), k.rand(2.3, 3.2), k.rand(0.1, 0.4)], r: [k.rand(-1, 1), 0, k.rand(-1, 1)] }, { color: PAL.ice, mat: "glow" });
  // Mantia: umeri înalți din blană înghețată și fâșii lungi cu țurțuri.
  for (const side of [1, -1]) {
    for (let i = 0; i < 6; i++) {
      k.cyl(k.rand(0.5, 0.9), 0, 0.12, 4, { p: [side * (0.75 + i * 0.07), 3.55 + k.rand(-0.1, 0.1), k.rand(-0.3, 0.2)], r: [k.rand(-0.4, 0.3), 0, side * -k.rand(0.4, 1.1)] }, { color: ICE_CRUST, wear: 0.05 });
    }
    k.sphere(0.85, 8, { p: [side * 0.8, 3.45, -0.05], s: [1, 0.6, 1] }, { color: cloak, wear: 0.35, frost: 0.7, frostNormal: 0.3, ...SMOOTH });
  }
  rags(k, 16, [-0.95, 0.95], 3.4, [-0.6, -0.15], [1.4, 2.6], 0.3, cloak);
  rags(k, 8, [-0.6, 0.6], 1.7, [-0.2, 0.35], [0.6, 1.0], 0.26, cloak);
  // Craniul cu coarne, ochi reci și maxilar.
  k.sphere(0.62, 10, { p: [0, 3.95, 0.25], s: [0.9, 1, 1] }, { color: bone, wear: 0.15, frost: 0.3, ...SMOOTH });
  k.box(0.38, 0.22, 0.3, { p: [0, 3.66, 0.4] }, { color: boneDark, wear: 0.15 });
  for (let i = 0; i < 6; i++) k.cyl(0.12, 0, 0.04, 3, { p: [-0.13 + i * 0.052, 3.58, 0.55] }, { color: bone });
  for (const x of [-0.13, 0.13]) {
    k.sphere(0.16, 6, { p: [x, 3.98, 0.47] }, { color: hex("#10161c"), ...SMOOTH });
    eye(k, x, 3.98, 0.53, 0.09);
  }
  for (const side of [1, -1]) {
    k.cyl(0.45, 0.12, 0.2, 6, { p: [side * 0.3, 4.3, 0.15], r: [-0.2, 0, side * -0.6] }, { color: bone, wear: 0.15, smooth: true });
    k.cyl(0.55, 0, 0.12, 6, { p: [side * 0.48, 4.62, 0.12], r: [-0.4, 0, side * 0.25] }, { color: ICE_CRUST, wear: 0.05, smooth: true });
  }
  if (king) {
    // Regele Iernii: coroană înaltă de țurțuri care arde rece, inimă de gheață în cușca toracică,
    // mantie lungă până în zăpadă.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const h = i % 2 ? 0.55 : 0.95;
      k.cyl(h, 0, 0.13, 4, { p: [Math.sin(a) * 0.42, 4.45 + h / 2, 0.25 + Math.cos(a) * 0.38] }, { color: PAL.ice, mat: "glow" });
    }
    k.cyl(0.12, 0.92, 0.92, 12, { p: [0, 4.4, 0.25] }, { color: PAL.gold, mat: "metal", wear: 0.2 });
    k.ico(0.42, { p: [0, 2.75, 0.25], s: [1, 1.3, 1] }, { color: hex("#9fe6ff"), mat: "glow" });
    rags(k, 18, [-1.1, 1.1], 3.3, [-0.8, -0.3], [2.4, 3.2], 0.34, hex("#2f3c52"));
  }
  const body = k.build(`boss${seed}`);
  const arm = (s: number, scythe: boolean) => limb(scene, mats, seed + s, (a) => {
    // Os lung al brațului + antebraț cu două oase, încheieturi cu gheață.
    a.capsule(1.1, 0.12, { p: [0, -0.5, 0] }, { color: bone, wear: 0.15, ...SMOOTH });
    a.sphere(0.24, 6, { p: [0, -1.05, 0.05] }, { color: boneDark, ...SMOOTH });
    for (const dx of [-0.06, 0.06]) a.capsule(1.0, 0.065, { p: [dx, -1.55, 0.12] }, { color: bone, wear: 0.15, ...SMOOTH });
    for (let i = 0; i < 3; i++) a.cyl(0.3, 0, 0.08, 4, { p: [0.1, -1.2 - i * 0.25, 0.05], r: [0, 0, -0.9] }, { color: ICE_CRUST });
    a.sphere(0.3, 6, { p: [0, -2.1, 0.2], s: [1, 0.6, 1.2] }, { color: boneDark, ...SMOOTH });
    if (scythe) {
      // Coasa: coadă lungă din os ținută în mână, cu lama sus, curbată în față, plină de țepi.
      a.cyl(3.4, 0.1, 0.12, 6, { p: [0, -1.3, 0.3], r: [-0.15, 0, 0] }, { color: boneDark, wear: 0.2 });
      for (let i = 0; i < 8; i++) {
        const ang = 0.15 + (i / 7) * 2.0;
        const r = 1.0 - i * 0.03;
        a.box(0.09, 0.42, 0.34 - i * 0.03, { p: [0, 0.35 + Math.cos(ang) * r, 0.05 + Math.sin(ang) * r], r: [ang, 0, 0] }, { color: bone, wear: 0.15 });
        a.cyl(0.24, 0, 0.07, 4, { p: [0, 0.35 + Math.cos(ang) * (r + 0.24), 0.05 + Math.sin(ang) * (r + 0.24)], r: [ang, 0, 0] }, { color: ICE_CRUST });
      }
    } else {
      // Mâna cu gheare uriașe.
      for (const dx of [-0.12, -0.04, 0.04, 0.12]) {
        a.cyl(0.55, 0.005, 0.07, 4, { p: [dx, -2.4, 0.38], r: [0.7, 0, dx * 1.5] }, { color: mix(bone, PAL.ice, 0.3), wear: 0.1 });
      }
    }
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.95, 0.12, { p: [0, -0.42, 0] }, { color: bone, wear: 0.15, ...SMOOTH });
    a.sphere(0.24, 6, { p: [0, -0.9, 0.05] }, { color: boneDark, ...SMOOTH });
    a.capsule(0.75, 0.1, { p: [0, -1.25, 0] }, { color: bone, wear: 0.15, ...SMOOTH });
    a.cyl(0.5, 0.3, 0.42, 6, { p: [0, -1.2, 0] }, { color: ICE_CRUST, wear: 0.05 });
    a.sphere(0.3, 6, { p: [0, -1.6, 0.15], s: [1, 0.4, 1.6] }, { color: boneDark, ...SMOOTH });
  });
  return { body, armL: arm(1, false), armR: arm(2, true), legL: legM(1), legR: legM(2), shoulder: [0.95, 3.45, 0.1], hip: [0.35, 1.65] };
}

// ---------- Zombii noi ----------

/** Urlătoarea (screamer): strigoaică slabă, păr lung alb, gura uriașă care strălucește violet-rece, brațe ridicate. */
function buildScreamer(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(FROST_SKIN, PAL.bone, 0.35);
  const wail = hex("#b9a6ff");
  // Trup subțire, rochie lungă ruptă până în zăpadă.
  k.capsule(0.75, 0.16, { p: [0, 1.3, 0], r: [0.15, 0, 0], s: [1, 1, 0.75] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.cyl(1.05, 0.34, 0.62, 10, { p: [0, 0.62, 0], s: [1, 1, 0.8] }, { color: mix(FROST_RAG, PAL.bone, 0.25), wear: 0.25, frost: 0.5, frostNormal: 0.25, ...SMOOTH });
  rags(k, 12, [-0.32, 0.32], 0.4, [-0.25, 0.25], [0.2, 0.42], 0.16, mix(FROST_RAG, PAL.bone, 0.2));
  // Capul dat pe spate, gura căscată (glow), ochi goi.
  k.sphere(0.36, 10, { p: [0, 1.86, 0.08], s: [0.9, 1.2, 0.95] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(0.2, 8, { p: [0, 1.74, 0.22], s: [0.8, 1.4, 0.6] }, { color: wail, mat: "glow" });
  for (const x of [-0.08, 0.08]) eye(k, x, 1.94, 0.22, 0.05, wail);
  // Părul alb, lung, în șuvițe care curg pe spate.
  for (let i = 0; i < 14; i++) {
    const a = Math.PI + (i / 13 - 0.5) * 2.4;
    const h = k.rand(0.7, 1.2);
    k.cyl(h, 0.06, 0.01, 4, { p: [Math.sin(a) * 0.2, 1.95 - h / 2, Math.cos(a) * 0.16 - 0.05], r: [k.rand(-0.2, 0.05), 0, Math.sin(a) * 0.2] }, { color: hex("#e8eef2"), wear: 0.05, smooth: true });
  }
  const body = k.build(`screamer${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(0.6, 0.05, { p: [0, -0.28, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
    a.capsule(0.6, 0.045, { p: [0, -0.84, 0.05] }, { color: FROST_SKIN_DARK, ...SMOOTH });
    claws(a, -1.16, 0.1, 0.3, 0.05, PAL.bone);
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.75, 0.06, { p: [0, -0.4, 0] }, { color: FROST_SKIN_DARK, ...SMOOTH });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [0.22, 1.6, 0.06], hip: [0.1, 0.8] };
}

/** Umflatul (bloater): burtă uriașă, pungi de gaz înghețat galben-verzui care strălucesc, cap mic. */
function buildBloater(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(FROST_SKIN, hex("#8a9a6a"), 0.45);
  const gas = hex("#d8f08a");
  k.sphere(1.6, 14, { p: [0, 1.15, 0.05], s: [1, 0.95, 1] }, { color: skin, wear: 0.18, frost: 0.2, ...SMOOTH });
  // Vene și pungi de gaz care stau să plesnească.
  for (let i = 0; i < 9; i++) {
    const a = k.rand(0, Math.PI * 2);
    const y = k.rand(0.7, 1.6);
    const r = Math.sqrt(Math.max(0.05, 0.64 - (y - 1.15) ** 2)) * 0.98;
    k.sphere(k.rand(0.16, 0.3), 8, { p: [Math.sin(a) * r, y, Math.cos(a) * r + 0.05] }, { color: gas, mat: "glow" });
  }
  for (let i = 0; i < 6; i++) k.capsule(k.rand(0.4, 0.7), 0.025, { p: [k.rand(-0.5, 0.5), k.rand(0.8, 1.5), 0.72], r: [0, 0, k.rand(-1, 1)] }, { color: PAL.blood, ...SMOOTH });
  // Cap mic, înfundat în umeri.
  k.sphere(0.4, 10, { p: [0, 2.0, 0.25] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(0.14, 6, { p: [0, 1.92, 0.42], s: [1, 0.6, 0.6] }, { color: PAL.blood, ...SMOOTH });
  for (const x of [-0.08, 0.08]) eye(k, x, 2.05, 0.4, 0.05, gas);
  k.box(0.9, 0.25, 0.7, { p: [0, 0.45, 0] }, { color: PAL.rags, wear: 0.25, frost: 0.4 });
  const body = k.build(`bloater${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(0.45, 0.1, { p: [0, -0.22, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
    a.capsule(0.4, 0.09, { p: [0, -0.6, 0.06] }, { color: FROST_SKIN_DARK, ...SMOOTH });
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.5, 0.15, { p: [0, -0.22, 0] }, { color: skin, wear: 0.15, ...SMOOTH });
    a.sphere(0.24, 6, { p: [0, -0.45, 0.08], s: [1, 0.5, 1.4] }, { color: FROST_SKIN_DARK, ...SMOOTH });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [0.78, 1.55, 0.1], hip: [0.32, 0.5] };
}

/** Săpătorul (burrower): cocoșat, cu plăci de gheață și piatră pe spate și gheare-lopată uriașe. */
function buildBurrower(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(FROST_SKIN_DARK, PAL.dirt, 0.35);
  k.capsule(1.1, 0.34, { p: [0, 1.0, 0], r: [1.1, 0, 0], s: [1.15, 1, 0.9] }, { color: skin, wear: 0.25, frost: 0.3, ...SMOOTH });
  // Carapacea: plăci de piatră și gheață, ca solzii.
  for (let i = 0; i < 7; i++) {
    for (const side of [-1, 0, 1]) {
      k.ico(0.22 - Math.abs(side) * 0.04, { p: [side * 0.24, 1.32 - i * 0.03, -0.45 + i * 0.16], s: [1.2, 0.5, 1] }, { color: i % 2 ? PAL.stoneDark : mix(PAL.stone, PAL.ice, 0.3), wear: 0.3, frost: 0.6, smooth: true });
    }
  }
  // Bot lung, ochi mici, colți.
  k.sphere(0.4, 10, { p: [0, 1.0, 0.65], s: [0.9, 0.7, 1.4] }, { color: skin, wear: 0.2, ...SMOOTH });
  k.cyl(0.25, 0.1, 0.18, 6, { p: [0, 0.95, 0.95], r: [Math.PI / 2, 0, 0] }, { color: hex("#c79a9a"), ...SMOOTH });
  for (const x of [-0.12, 0.12]) {
    eye(k, x, 1.12, 0.82, 0.045);
    k.cyl(0.14, 0, 0.04, 3, { p: [x * 0.6, 0.82, 0.95] }, { color: PAL.bone });
  }
  const body = k.build(`burrower${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(0.5, 0.11, { p: [0, -0.22, 0.05] }, { color: skin, wear: 0.2, ...SMOOTH });
    // Mâna-lopată: palmă lată și 4 gheare groase.
    a.box(0.36, 0.08, 0.3, { p: [0, -0.55, 0.2], r: [0.5, 0, 0] }, { color: FROST_SKIN_DARK, wear: 0.2 });
    for (const dx of [-0.13, -0.045, 0.045, 0.13]) a.cyl(0.32, 0.01, 0.07, 4, { p: [dx, -0.68, 0.42], r: [1.0, 0, 0] }, { color: PAL.bone, wear: 0.2 });
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.55, 0.12, { p: [0, -0.25, -0.05] }, { color: skin, wear: 0.2, ...SMOOTH });
    a.sphere(0.22, 6, { p: [0, -0.52, 0.06], s: [1, 0.5, 1.4] }, { color: FROST_SKIN_DARK, ...SMOOTH });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [0.36, 1.0, 0.45], hip: [0.22, 0.6] };
}

/** Șamanul de gheață: bătrân cocoșat, coarne de cerb pe cap, colier de oase, toiag cu cristal care pulsează. */
function buildShaman(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const skin = mix(FROST_SKIN, hex("#7a8f8a"), 0.3);
  const fur = hex("#5e5244");
  const heal = hex("#7ff0d8");
  k.capsule(0.8, 0.22, { p: [0, 1.2, 0.05], r: [0.45, 0, 0], s: [1.1, 1, 0.8] }, { color: skin, wear: 0.2, ...SMOOTH });
  // Mantie de blană cu glugă, până jos.
  k.cyl(1.25, 0.45, 0.7, 10, { p: [0, 0.75, -0.05], s: [1, 1, 0.85] }, { color: fur, wear: 0.3, frost: 0.5, frostNormal: 0.3, ...SMOOTH });
  for (const side of [1, -1]) k.sphere(0.45, 8, { p: [side * 0.26, 1.58, -0.05], s: [1, 0.6, 1] }, { color: mix(fur, PAL.furDark, 0.5), wear: 0.3, frost: 0.6, ...SMOOTH });
  // Colier de oase și dinți.
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 2.2;
    k.cyl(0.12, 0.01, 0.04, 4, { p: [Math.sin(a) * 0.3, 1.48, 0.25 + Math.cos(a) * 0.05] }, { color: PAL.bone });
  }
  // Cap cu glugă și coarne de cerb.
  k.sphere(0.34, 10, { p: [0, 1.8, 0.32] }, { color: skin, wear: 0.15, ...SMOOTH });
  k.sphere(0.46, 10, { p: [0, 1.86, 0.22], s: [1, 1, 1.05] }, { color: mix(fur, PAL.furDark, 0.4), wear: 0.25, frost: 0.6, ...SMOOTH });
  for (const x of [-0.07, 0.07]) eye(k, x, 1.82, 0.48, 0.05, heal);
  for (const side of [1, -1]) {
    k.cyl(0.55, 0.03, 0.06, 5, { p: [side * 0.25, 2.2, 0.18], r: [0, 0, side * -0.6] }, { color: PAL.bone, wear: 0.15 });
    for (let i = 0; i < 3; i++) k.cyl(0.25, 0.015, 0.035, 4, { p: [side * (0.3 + i * 0.07), 2.3 + i * 0.08, 0.18], r: [0, 0, side * (0.3 - i * 0.3)] }, { color: PAL.bone, wear: 0.15 });
  }
  const body = k.build(`shaman${seed}`);
  const arm = (s: number, staff: boolean) => limb(scene, mats, seed + s, (a) => {
    a.capsule(0.55, 0.07, { p: [0, -0.26, 0] }, { color: fur, wear: 0.3, ...SMOOTH });
    a.capsule(0.5, 0.06, { p: [0, -0.7, 0.08] }, { color: skin, wear: 0.15, ...SMOOTH });
    if (staff) {
      // Toiagul: lemn noduros, cu cristalul de gheață vindecătoare sus.
      a.cyl(2.2, 0.05, 0.07, 6, { p: [0, -0.4, 0.2] }, { color: PAL.burntWood, wear: 0.3 });
      a.ico(0.2, { p: [0, 0.78, 0.2], s: [0.8, 1.5, 0.8] }, { color: heal, mat: "glow" });
      for (let i = 0; i < 3; i++) a.cyl(0.18, 0.005, 0.03, 4, { p: [Math.sin(i * 2.1) * 0.08, 0.55, 0.2 + Math.cos(i * 2.1) * 0.08], r: [0, 0, Math.sin(i * 2.1) * 0.5] }, { color: PAL.bone });
    } else {
      claws(a, -0.98, 0.14, 0.2);
    }
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.7, 0.07, { p: [0, -0.35, 0] }, { color: FROST_SKIN_DARK, ...SMOOTH });
  });
  return { body, armL: arm(1, false), armR: arm(2, true), legL: legM(1), legR: legM(2), shoulder: [0.34, 1.5, 0.15], hip: [0.12, 0.75] };
}

// ---------- Boșii noi ----------

/** Matca: un păianjen de gheață umflat, cu abdomen plin de ouă care strălucesc și 8 picioare. */
function buildBroodmother(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const shell = mix(FROST_SKIN_DARK, hex("#3a3448"), 0.4);
  const egg = hex("#b8f4ff");
  // Abdomenul: sac uriaș cu ouă vizibile prin piele.
  k.sphere(2.4, 14, { p: [0, 1.75, -1.0], s: [1, 0.85, 1.15] }, { color: mix(shell, FROST_SKIN, 0.35), wear: 0.2, frost: 0.4, frostNormal: 0.3, ...SMOOTH });
  for (let i = 0; i < 14; i++) {
    const a = k.rand(0, Math.PI * 2);
    const b = k.rand(-0.6, 0.9);
    k.sphere(k.rand(0.22, 0.34), 8, { p: [Math.sin(a) * Math.cos(b) * 1.1, 1.75 + Math.sin(b) * 0.95, -1.0 + Math.cos(a) * Math.cos(b) * 1.25] }, { color: egg, mat: "glow" });
  }
  // Toracele și capul cu mulți ochi și clești.
  k.sphere(1.3, 12, { p: [0, 1.35, 0.55], s: [1, 0.75, 1] }, { color: shell, wear: 0.2, frost: 0.4, ...SMOOTH });
  k.sphere(0.8, 10, { p: [0, 1.35, 1.25] }, { color: shell, wear: 0.2, ...SMOOTH });
  for (const [x, y] of [[-0.18, 1.55], [0.18, 1.55], [-0.3, 1.42], [0.3, 1.42], [-0.1, 1.68], [0.1, 1.68]] as const) eye(k, x, y, 1.6, 0.07, egg);
  for (const side of [1, -1]) k.cyl(0.5, 0.02, 0.1, 5, { p: [side * 0.2, 1.05, 1.6], r: [1.0, 0, side * 0.4] }, { color: PAL.bone, wear: 0.2 });
  // Încă 4 picioare fixe pe laterale (cele animate sunt brațele / picioarele).
  for (const side of [1, -1]) {
    for (const dz of [0.2, 0.75]) {
      k.capsule(1.3, 0.09, { p: [side * 1.15, 1.6, dz], r: [0, 0, side * 1.0] }, { color: shell, wear: 0.2, ...SMOOTH });
      k.capsule(1.4, 0.07, { p: [side * 1.9, 0.8, dz + 0.1], r: [0, 0, side * -0.35] }, { color: mix(shell, PAL.ice, 0.2), wear: 0.2, ...SMOOTH });
    }
  }
  const body = k.build(`brood${seed}`);
  const leg = (s: number, side: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(1.2, 0.1, { p: [side * 0.5, 0.15, 0], r: [0, 0, side * 1.15] }, { color: shell, wear: 0.2, ...SMOOTH });
    a.capsule(1.5, 0.075, { p: [side * 1.15, -0.55, 0.05], r: [0, 0, side * -0.3] }, { color: mix(shell, PAL.ice, 0.2), wear: 0.2, ...SMOOTH });
  });
  return { body, armL: leg(1, -1), armR: leg(2, 1), legL: leg(3, -1), legR: leg(4, 1), shoulder: [0.7, 1.35, 1.2], hip: [0.7, 1.35] };
}

/** Yeti-ul turbat: maimuță uriașă cu blană albă murdară, față albastră, coarne, brațe până la pământ. */
function buildYeti(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const fur = hex("#dfe6ea");
  const furDark = hex("#aeb9c2");
  const face = hex("#4f79a8");
  k.capsule(1.6, 0.85, { p: [0, 2.05, 0.1], r: [0.35, 0, 0], s: [1.2, 1, 0.95] }, { color: fur, wear: 0.15, frost: 0.3, frostNormal: 0.4, ...SMOOTH });
  // Smocuri de blană zbârlită pe umeri și spate.
  for (let i = 0; i < 18; i++) {
    const a = k.rand(-2.4, 2.4) + Math.PI;
    k.sphere(k.rand(0.45, 0.7), 8, { p: [Math.sin(a) * 0.8, k.rand(2.2, 3.0), Math.cos(a) * 0.6], s: [1, 0.8, 1] }, { color: mix(fur, furDark, k.rand(0, 1)), wear: 0.2, frost: 0.4, ...SMOOTH });
  }
  k.sphere(1.1, 10, { p: [0, 1.7, 0.6], s: [1, 0.9, 0.7] }, { color: furDark, wear: 0.2, ...SMOOTH });
  // Capul: față albastră, gura cu colți, sprâncene grele, coarne.
  k.sphere(0.85, 12, { p: [0, 3.05, 0.85] }, { color: fur, wear: 0.15, ...SMOOTH });
  k.sphere(0.6, 10, { p: [0, 2.95, 1.12], s: [1, 0.95, 0.7] }, { color: face, wear: 0.15, ...SMOOTH });
  k.box(0.6, 0.12, 0.2, { p: [0, 3.18, 1.28], r: [0.2, 0, 0] }, { color: mix(face, PAL.iron, 0.4) });
  for (const x of [-0.17, 0.17]) {
    eye(k, x, 3.08, 1.36, 0.08);
    k.cyl(0.18, 0.06, 0, 4, { p: [x * 0.7, 2.72, 1.38], r: [0, 0, 0] }, { color: PAL.bone });
  }
  k.sphere(0.32, 8, { p: [0, 2.72, 1.3], s: [1.2, 0.5, 0.6] }, { color: PAL.blood, ...SMOOTH });
  for (const side of [1, -1]) k.cyl(0.7, 0, 0.18, 6, { p: [side * 0.6, 3.5, 0.75], r: [0.4, 0, side * -0.9] }, { color: PAL.bone, wear: 0.15, smooth: true });
  const body = k.build(`yeti${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.capsule(1.1, 0.32, { p: [0, -0.5, 0] }, { color: fur, wear: 0.15, frost: 0.3, ...SMOOTH });
    a.capsule(1.1, 0.28, { p: [0, -1.4, 0.15] }, { color: furDark, wear: 0.2, ...SMOOTH });
    a.sphere(0.6, 8, { p: [0, -2.05, 0.3], s: [1, 0.8, 1.1] }, { color: face, wear: 0.15, ...SMOOTH });
    claws(a, -2.2, 0.55, 0.32, 0.14, PAL.bone);
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.capsule(0.9, 0.35, { p: [0, -0.4, 0] }, { color: fur, wear: 0.15, ...SMOOTH });
    a.sphere(0.6, 8, { p: [0, -0.95, 0.2], s: [1, 0.5, 1.4] }, { color: furDark, ...SMOOTH });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [1.1, 2.75, 0.4], hip: [0.45, 1.15] };
}

/** Vrăjitoarea viscolului: înaltă, robă lungă în formă de clopot, glugă ascuțită cu coroană de gheață, toiag cu glob. */
function buildWitch(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const robe = hex("#2e3f58");
  const robeLight = hex("#4c6788");
  const frost = hex("#a9e4ff");
  // Roba plutește puțin deasupra zăpezii (fără picioare vizibile).
  k.cyl(2.0, 0.42, 1.25, 12, { p: [0, 1.2, 0] }, { color: robe, wear: 0.2, frost: 0.4, frostNormal: 0.3, ...SMOOTH });
  rags(k, 14, [-0.6, 0.6], 0.35, [-0.55, 0.55], [0.2, 0.4], 0.22, robe);
  k.capsule(0.7, 0.3, { p: [0, 2.45, 0], s: [1.2, 1, 0.8] }, { color: robeLight, wear: 0.2, ...SMOOTH });
  for (let i = 0; i < 6; i++) k.cyl(0.04, 0.95 - i * 0.08, 0.95 - i * 0.08, 12, { p: [0, 0.35 + i * 0.35, 0] }, { color: frost, mat: "glow" });
  // Gluga ascuțită, fața palidă, ochi care ard rece, coroana de țurțuri.
  k.sphere(0.6, 10, { p: [0, 3.05, 0.02], s: [1, 1.1, 1] }, { color: robe, wear: 0.2, frost: 0.5, ...SMOOTH });
  k.cyl(0.9, 0, 0.45, 8, { p: [0, 3.65, -0.2], r: [-0.5, 0, 0] }, { color: robe, wear: 0.2, frost: 0.6, ...SMOOTH });
  k.sphere(0.36, 10, { p: [0, 3.0, 0.22] }, { color: mix(PAL.bone, PAL.ice, 0.3), wear: 0.1, ...SMOOTH });
  for (const x of [-0.1, 0.1]) eye(k, x, 3.05, 0.5, 0.07, frost);
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 2.4;
    k.cyl(0.35 + (i === 3 ? 0.2 : 0), 0, 0.06, 4, { p: [Math.sin(a) * 0.38, 3.45, Math.cos(a) * 0.3 + 0.05] }, { color: frost, mat: "glow" });
  }
  const body = k.build(`witch${seed}`);
  const arm = (s: number, staff: boolean) => limb(scene, mats, seed + s, (a) => {
    a.cyl(0.9, 0.12, 0.3, 8, { p: [0, -0.42, 0.05] }, { color: robeLight, wear: 0.2, ...SMOOTH });
    a.capsule(0.4, 0.05, { p: [0, -0.95, 0.12] }, { color: mix(PAL.bone, PAL.ice, 0.3), ...SMOOTH });
    for (const dx of [-0.05, 0, 0.05]) a.cyl(0.3, 0.004, 0.025, 4, { p: [dx, -1.2, 0.2], r: [0.5, 0, dx * 2] }, { color: frost });
    if (staff) {
      a.cyl(3.0, 0.05, 0.07, 6, { p: [0, -0.6, 0.3] }, { color: hex("#1e2a38"), wear: 0.2 });
      a.sphere(0.42, 12, { p: [0, 1.0, 0.3] }, { color: frost, mat: "glow" });
      for (let i = 0; i < 4; i++) a.cyl(0.35, 0.02, 0.05, 4, { p: [Math.sin(i * 1.57) * 0.22, 1.0, 0.3 + Math.cos(i * 1.57) * 0.22], r: [Math.cos(i * 1.57) * 0.6, 0, -Math.sin(i * 1.57) * 0.6] }, { color: hex("#1e2a38") });
    }
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.sphere(0.05, 4, { p: [0, -0.1, 0] }, { color: robe });
  });
  return { body, armL: arm(1, false), armR: arm(2, true), legL: legM(1), legR: legM(2), shoulder: [0.45, 2.7, 0.05], hip: [0.2, 0.6] };
}

/** Colosul de gheață: golem uriaș din bolovani și blocuri de gheață, cu un miez care arde rece în piept. */
function buildColossus(scene: Scene, mats: Materials, seed: number): ZombieModel {
  const k = new ModelKit(scene, mats, seed);
  const rock = PAL.stoneDark;
  const iceBlock = mix(PAL.ice, PAL.snow, 0.3);
  const core = hex("#5fd8ff");
  // Trunchiul: bolovani mari îngrămădiți, cu blocuri de gheață între ei.
  k.ico(1.5, { p: [0, 3.0, 0], s: [1.35, 1.05, 1] }, { color: rock, wear: 0.3, frost: 0.6, frostNormal: 0.4, smooth: true });
  k.ico(1.1, { p: [0, 1.9, 0.05], s: [1.2, 0.8, 0.95] }, { color: mix(rock, PAL.stone, 0.4), wear: 0.3, frost: 0.5, smooth: true });
  for (let i = 0; i < 8; i++) {
    k.box(k.rand(0.4, 0.7), k.rand(0.4, 0.9), k.rand(0.4, 0.6), { p: [k.rand(-1.4, 1.4), k.rand(2.2, 3.8), k.rand(-0.9, 0.7)], r: [k.rand(0, 1), k.rand(0, 1), k.rand(0, 1)] }, { color: iceBlock, wear: 0.05, frost: 0.3 });
  }
  // Miezul: o crăpătură în piept prin care se vede lumina.
  k.ico(0.55, { p: [0, 3.0, 1.05] }, { color: core, mat: "glow" });
  for (let i = 0; i < 5; i++) k.box(0.08, k.rand(0.6, 1.1), 0.08, { p: [k.rand(-0.5, 0.5), 3.0 + k.rand(-0.3, 0.3), 1.2], r: [0, 0, k.rand(-1, 1)] }, { color: core, mat: "glow" });
  // Capul mic, adânc între umeri, cu ochi ca niște fante.
  k.ico(0.6, { p: [0, 4.35, 0.45], s: [1.1, 0.8, 1] }, { color: rock, wear: 0.3, frost: 0.7, smooth: true });
  for (const x of [-0.22, 0.22]) k.box(0.22, 0.07, 0.1, { p: [x, 4.38, 0.98] }, { color: core, mat: "glow" });
  // Țurțuri și zăpadă pe umeri.
  for (const side of [1, -1]) {
    k.ico(0.9, { p: [side * 1.7, 3.8, 0], s: [1, 0.8, 1] }, { color: mix(rock, PAL.stone, 0.3), wear: 0.3, frost: 0.9, frostNormal: 0.5, smooth: true });
    for (let i = 0; i < 4; i++) k.cyl(k.rand(0.4, 0.8), 0, 0.15, 4, { p: [side * (1.4 + i * 0.25), 4.5, k.rand(-0.4, 0.4)], r: [k.rand(-0.3, 0.3), 0, side * -0.3] }, { color: iceBlock, wear: 0.05 });
  }
  const body = k.build(`colossus${seed}`);
  const arm = (s: number) => limb(scene, mats, seed + s, (a) => {
    a.ico(0.65, { p: [0, -0.7, 0], s: [1, 1.4, 1] }, { color: rock, wear: 0.3, frost: 0.5, smooth: true });
    a.box(0.5, 0.6, 0.5, { p: [0, -1.5, 0.1], r: [0.3, 0.4, 0] }, { color: iceBlock, wear: 0.05 });
    a.ico(0.85, { p: [0, -2.35, 0.25], s: [1.1, 1, 1.1] }, { color: mix(rock, PAL.stone, 0.4), wear: 0.3, frost: 0.4, smooth: true });
  });
  const legM = (s: number) => limb(scene, mats, seed + 10 + s, (a) => {
    a.ico(0.65, { p: [0, -0.55, 0], s: [1, 1.3, 1] }, { color: rock, wear: 0.3, frost: 0.4, smooth: true });
    a.box(0.95, 0.5, 1.2, { p: [0, -1.15, 0.15] }, { color: mix(rock, PAL.stone, 0.3), wear: 0.3, frost: 0.8 });
  });
  return { body, armL: arm(1), armR: arm(2), legL: legM(1), legR: legM(2), shoulder: [1.9, 3.6, 0.1], hip: [0.7, 1.4] };
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
      return buildRunner(scene, mats, 150);
    case "screamer":
      return buildScreamer(scene, mats, 700);
    case "bloater":
      return buildBloater(scene, mats, 720);
    case "burrower":
      return buildBurrower(scene, mats, 740);
    case "shaman":
      return buildShaman(scene, mats, 760);
    case "broodmother":
      return buildBroodmother(scene, mats, 800);
    case "yeti":
      return buildYeti(scene, mats, 820);
    case "witch":
      return buildWitch(scene, mats, 840);
    case "colossus":
      return buildColossus(scene, mats, 860);
    case "frostKing":
      return buildBoss(scene, mats, 880, true);
    default:
      return buildWalker(scene, mats, 100);
  }
}
