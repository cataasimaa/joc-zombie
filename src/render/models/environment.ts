// Modelele de mediu: brazi, pietre, case de lemn, adăpostul.
// Totul în coordonate locale; poziționarea pe hartă o face World.ts.

import type { Mesh } from "@babylonjs/core";
import type { House } from "../../core";
import { type Materials, ModelKit } from "../ModelKit";
import { PAL, hex, mix } from "../palette";
import type { Scene } from "@babylonjs/core";

// ---------- Brazi ----------

/**
 * Brad realist: trunchi subțiat spre vârf, crengi pe 7 niveluri, lăsate în jos, cu bulgări de zăpadă
 * pe partea de sus. Folosit pentru brazii din sat (aproape de cameră).
 */
export function buildPine(scene: Scene, mats: Materials, seed: number): Mesh[] {
  const k = new ModelKit(scene, mats, seed);
  const H = 5.4;
  k.cyl(H, 0.14, 0.46, 7, { p: [0, H / 2 - 0.1, 0] }, { color: PAL.darkWood, wear: 0.25, smooth: true });
  const levels = 7;
  for (let i = 0; i < levels; i++) {
    const t = i / levels;
    const y = 0.95 + i * 0.62;
    const len = 2.1 * (1 - t) + 0.45 + k.rand(-0.1, 0.1);
    const count = 7 - Math.floor(i / 2);
    const droop = 0.35 + t * 0.15;
    const green = mix(PAL.pine, PAL.pineLight, k.rand(0, 1));
    for (let j = 0; j < count; j++) {
      const a = (j / count) * Math.PI * 2 + i * 0.55 + k.rand(-0.2, 0.2);
      const dx = Math.cos(droop) * (len / 2);
      const dy = -Math.sin(droop) * (len / 2);
      const thick = 0.75 * (1 - t) + 0.3;
      // Creanga: un con culcat, cu vârful spre exterior și în jos.
      k.cyl(len, 0.04, thick, 5, {
        p: [Math.cos(a) * dx, y + dy, -Math.sin(a) * dx],
        r: [0, a, -(Math.PI / 2 + droop)],
      }, { color: green, wear: 0.18, smooth: true });
      // Bulgăre de zăpadă pe partea de sus a crengii.
      if (k.rand() < 0.65) {
        k.sphere(1, 5, {
          p: [Math.cos(a) * dx * 0.9, y + dy + thick * 0.32, -Math.sin(a) * dx * 0.9],
          r: [0, a, -droop * 0.8],
          s: [len * 0.55, 0.14, thick * 0.55],
        }, { color: PAL.snow, wear: 0.04, smooth: true });
      }
    }
  }
  // Vârful.
  k.cyl(0.9, 0, 0.35, 5, { p: [0, H + 0.15, 0] }, { color: PAL.pine, wear: 0.15, frost: 0.6, frostNormal: 0.5 });
  return k.build(`pine${seed}`);
}

/** Brad simplu (conuri în trepte), pentru pădurea deasă din afara hărții. */
export function buildTree(scene: Scene, mats: Materials, seed: number): Mesh[] {
  const k = new ModelKit(scene, mats, seed);
  k.cyl(1.4, 0.26, 0.42, 6, { p: [0, 0.7, 0] }, { color: PAL.darkWood, wear: 0.2 });
  const tiers = 4;
  let y = 0.9;
  for (let i = 0; i < tiers; i++) {
    const h = 1.7 - i * 0.18;
    const d = 2.9 - i * (2.0 / tiers) + k.rand(-0.15, 0.15);
    const color = i % 2 === 0 ? PAL.pine : PAL.pineLight;
    k.cyl(h, 0.12, d, 7, { p: [k.rand(-0.05, 0.05), y + h / 2, k.rand(-0.05, 0.05)], r: [0, k.rand(0, 3), 0] }, {
      color,
      wear: 0.12,
      frost: 0.95,
      frostAbove: y + h * 0.62,
      frostNormal: 0.2,
      smooth: true,
    }, 3);
    y += h * 0.62;
  }
  return k.build(`tree${seed}`);
}

// ---------- Pietre ----------

export function buildRock(scene: Scene, mats: Materials, seed: number): Mesh[] {
  const k = new ModelKit(scene, mats, seed);
  const color = mix(PAL.stone, PAL.moss, k.rand(0.1, 0.5));
  k.ico(1, { p: [0, -0.15, 0], s: [k.rand(1.1, 1.6), k.rand(0.55, 0.85), k.rand(0.9, 1.3)], r: [0, k.rand(0, 3), k.rand(-0.2, 0.2)] }, {
    color,
    wear: 0.18,
    frost: 0.9,
    frostNormal: 0.55,
  });
  if (seed % 2 === 0) {
    k.ico(0.55, { p: [0.9, -0.1, 0.3], s: [1, 0.7, 1], r: [0, k.rand(0, 3), 0] }, { color: PAL.stoneDark, wear: 0.2, frost: 0.9, frostNormal: 0.55 });
  }
  // Bolovani mai mici crăpați, cu pete de mușchi și o dâră de gheață care „curge” pe ei.
  for (let i = 0; i < 3; i++) {
    const a = k.rand(0, Math.PI * 2);
    k.ico(k.rand(0.35, 0.55), { p: [Math.cos(a) * 0.7, k.rand(0.1, 0.4), Math.sin(a) * 0.6], s: [1, k.rand(1.0, 1.5), 1], r: [k.rand(-0.3, 0.3), a, 0] }, { color: mix(PAL.stoneDark, PAL.stone, k.rand(0, 1)), wear: 0.25, frost: 0.85, frostNormal: 0.6 });
  }
  for (let i = 0; i < 4; i++) k.sphere(0.25, 5, { p: [k.rand(-0.8, 0.8), k.rand(0.05, 0.45), k.rand(0.3, 0.7)], s: [1, 0.3, 1] }, { color: hex("#6a7a3a"), wear: 0.3, smooth: true });
  const sx = k.rand(-0.3, 0.3);
  k.box(0.18, 0.75, 0.06, { p: [sx, 0.15, 0.62], r: [-0.45, 0, k.rand(-0.2, 0.2)] }, { color: mix(PAL.ice, PAL.snow, 0.15), mat: "glow" });
  return k.build(`rock${seed}`);
}

// ---------- Case ----------

interface HouseParts {
  meshes: Mesh[];
  /** Vârful hornului (pentru fum), în coordonatele casei; null la casa dărâmată. */
  chimney: [number, number, number] | null;
}

/**
 * O casă de lemn. Fața (ușa, fereastra) e spre +z. Fiecare casă e diferită (seed),
 * iar variantele „collapsed” și „boarded” arată dărâmat / bătut în scânduri.
 */
export function buildHouse(scene: Scene, mats: Materials, h: House): HouseParts {
  const k = new ModelKit(scene, mats, h.seed);
  const W = h.width;
  const D = h.depth;
  const collapsed = h.variant === "collapsed";
  const wallH = (collapsed ? 1.1 : 2.1) + k.rand(0, 0.4);
  const base = 0.35;
  const top = base + wallH;
  const wood = mix(PAL.burntWood, PAL.oldWood, k.rand(0, 0.6));

  // Fundație de piatră.
  k.box(W + 0.35, base, D + 0.35, { p: [0, base / 2 - 0.05, 0] }, { color: PAL.stone, wear: 0.2, frost: 0.6 });

  if (collapsed) {
    // Pereți rupți, de înălțimi diferite.
    for (let i = 0; i < 4; i++) {
      const segH = wallH * k.rand(0.4, 1.1);
      k.box(W / 4 - 0.05, segH, 0.3, { p: [-W / 2 + W / 8 + (i * W) / 4, base + segH / 2, D / 2 - 0.15], r: [k.rand(-0.1, 0.1), 0, k.rand(-0.08, 0.08)] }, { color: wood, wear: 0.2, frost: 0.9 });
      const segH2 = wallH * k.rand(0.3, 1);
      k.box(W / 4 - 0.05, segH2, 0.3, { p: [-W / 2 + W / 8 + (i * W) / 4, base + segH2 / 2, -D / 2 + 0.15] }, { color: wood, wear: 0.2, frost: 0.9 });
    }
    k.box(0.3, wallH, D, { p: [-W / 2 + 0.15, base + wallH / 2, 0] }, { color: wood, wear: 0.2, frost: 0.9 });
    k.box(0.3, wallH * 0.6, D * 0.7, { p: [W / 2 - 0.15, base + wallH * 0.3, -D * 0.15] }, { color: wood, wear: 0.2, frost: 0.9 });
    // Acoperișul prăbușit înăuntru, în unghi.
    k.box(W * 0.9, 0.18, D * 0.75, { p: [0.2, base + wallH * 0.55, 0.1], r: [0.45, 0.15, 0.12] }, { color: PAL.darkWood, wear: 0.25, frost: 0.95, frostNormal: 0.3 });
    k.box(W * 0.85, 0.35, D * 0.65, { p: [0.25, base + wallH * 0.55 + 0.25, 0.05], r: [0.45, 0.15, 0.12] }, { color: PAL.snow, wear: 0.04 });
    // Bârne căzute.
    for (let i = 0; i < 4; i++) {
      k.cyl(k.rand(1.5, 2.8), 0.22, 0.22, 6, { p: [k.rand(-W / 2, W / 2), 0.2, D / 2 + k.rand(0.4, 1.5)], r: [Math.PI / 2, k.rand(0, 3), 0] }, { color: PAL.darkWood, wear: 0.2, frost: 0.8 });
    }
    return { meshes: k.build(`house${h.seed}`), chimney: null };
  }

  // Pereți de bârne.
  k.box(W, wallH, D, { p: [0, base + wallH / 2, 0] }, { color: wood, wear: 0.14 });
  for (let i = 0; i < 4; i++) {
    const y = base + 0.3 + (i * (wallH - 0.4)) / 3;
    for (const z of [D / 2, -D / 2]) {
      k.cyl(W + 0.5, 0.24, 0.24, 6, { p: [0, y, z], r: [0, 0, Math.PI / 2] }, { color: mix(wood, PAL.darkWood, 0.3), wear: 0.18, frost: 0.5, frostNormal: 0.7 });
    }
    for (const x of [W / 2, -W / 2]) {
      k.cyl(D + 0.5, 0.24, 0.24, 6, { p: [x, y + 0.12, 0], r: [Math.PI / 2, 0, 0] }, { color: mix(wood, PAL.darkWood, 0.3), wear: 0.18, frost: 0.5, frostNormal: 0.7 });
    }
  }
  // Bârne verticale la colțuri.
  for (const x of [W / 2, -W / 2]) for (const z of [D / 2, -D / 2]) {
    k.cyl(wallH + 0.15, 0.34, 0.38, 6, { p: [x, base + wallH / 2, z] }, { color: PAL.darkWood, wear: 0.15 });
  }

  // Fronton (triunghiul de sub acoperiș) + acoperiș în două ape.
  const rise = D * 0.42;
  const sx = rise / 0.75;
  k.cyl(W - 0.1, 1, 1, 3, { p: [0, top + 0.25 * sx, 0], r: [0, 0, Math.PI / 2], s: [sx, 1, D / 0.866] }, { color: mix(wood, PAL.oldWood, 0.3), wear: 0.15 });
  const half = D / 2 + 0.4;
  const slope = Math.atan2(rise, D / 2);
  const len = Math.hypot(half, rise + 0.3);
  const snowSide = h.seed % 2 === 0 ? 1 : -1;
  for (const side of [1, -1]) {
    const cz = side * (D / 4 + 0.1);
    const cy = top + rise / 2 + 0.1;
    k.box(W + 0.7, 0.16, len, { p: [0, cy, cz], r: [side * slope, 0, 0] }, { color: PAL.darkWood, wear: 0.22, frost: side === snowSide ? 0 : 0.55, frostNormal: 0.4 });
    // Zăpadă groasă pe o parte, strat subțire pe cealaltă.
    const thick = side === snowSide ? 0.38 : 0.1;
    const ny = Math.cos(slope);
    const nz = side * Math.sin(slope);
    k.box(W + 0.55, thick, len * (side === snowSide ? 0.98 : 0.6), {
      p: [0, cy + ny * (0.08 + thick / 2), cz + nz * (0.08 + thick / 2) - (side === snowSide ? 0 : side * len * 0.15)],
      r: [side * slope, 0, 0],
    }, { color: PAL.snow, wear: 0.04 });
  }
  // Rânduri de șindrilă pe partea cu zăpadă subțire + streașină rotunjită de zăpadă pe cealaltă.
  for (let row = 0; row < 4; row++) {
    const f = (row + 0.5) / 4;
    const side = -snowSide;
    const zz = side * (f * (D / 2 + 0.4));
    const yy = top + rise * (1 - f) + 0.2;
    k.box(W + 0.72, 0.06, 0.32, { p: [0, yy, zz], r: [side * slope, 0, 0] }, { color: PAL.burntWood, wear: 0.3, frost: 0.4, frostNormal: 0.6 });
  }
  k.capsule(W + 0.9, 0.24, { p: [0, top + 0.12, snowSide * (D / 2 + 0.42)], r: [0, 0, Math.PI / 2] }, { color: PAL.snow, wear: 0.03, smooth: true });

  // Țurțuri sub streașină.
  for (const side of [1, -1]) {
    const n = 6 + Math.floor(k.rand(0, 5));
    for (let i = 0; i < n; i++) {
      const ih = k.rand(0.25, 0.75);
      k.cyl(ih, 0.11, 0.0, 4, { p: [k.rand(-W / 2, W / 2), top + 0.05 - ih / 2, side * (D / 2 + 0.38)] }, { color: mix(PAL.ice, PAL.snow, 0.55), wear: 0.05 });
    }
  }
  // Horn de piatră.
  const chX = (h.seed % 3 - 1) * W * 0.28;
  k.box(0.75, rise + 1.3, 0.75, { p: [chX, top + (rise + 1.3) / 2 - 0.2, -D * 0.15] }, { color: PAL.stoneDark, wear: 0.2, frost: 0.85, frostNormal: 0.6 });
  k.box(0.9, 0.15, 0.9, { p: [chX, top + rise + 1.05, -D * 0.15] }, { color: PAL.stone, wear: 0.1, frost: 0.9, frostNormal: 0.6 });

  // Ușă cu balamale de fier.
  const fz = D / 2 + 0.13;
  k.box(0.95, 1.7, 0.1, { p: [W * 0.18, base + 0.85, fz] }, { color: PAL.darkWood, wear: 0.15 });
  for (const y of [0.45, 1.3]) k.box(0.9, 0.08, 0.04, { p: [W * 0.18, base + y, fz + 0.06] }, { color: PAL.iron, mat: "metal", wear: 0.2 });

  // Fereastră cu lumină caldă (cu ramă).
  const wx = -W * 0.22;
  k.box(1.05, 0.85, 0.12, { p: [wx, base + 1.35, fz - 0.02] }, { color: PAL.darkWood, wear: 0.1 });
  k.box(0.8, 0.6, 0.1, { p: [wx, base + 1.35, fz + 0.02] }, { color: PAL.window, mat: "glow" });
  k.box(0.08, 0.6, 0.12, { p: [wx, base + 1.35, fz + 0.04] }, { color: PAL.darkWood });
  // Pervaz cu zăpadă.
  k.box(1.15, 0.1, 0.3, { p: [wx, base + 0.92, fz + 0.08] }, { color: PAL.oldWood, frost: 1, frostNormal: 0.6 });

  if (h.variant === "boarded") {
    // Scânduri bătute în X peste ușă și fereastră.
    for (const [x, y, w] of [[W * 0.18, base + 0.85, 1.3], [wx, base + 1.35, 1.1]] as const) {
      for (const r of [0.6, -0.6]) {
        k.box(w, 0.16, 0.06, { p: [x, y, fz + 0.12], r: [0, 0, r] }, { color: PAL.oldWood, wear: 0.25 });
      }
    }
    for (let i = 0; i < 3; i++) {
      k.box(0.18, 1.6, 0.12, { p: [W * 0.18 + 0.75 + i * 0.25, base + 0.8, fz + 0.15], r: [k.rand(-0.15, 0.15), 0, k.rand(-0.2, 0.2)] }, { color: PAL.oldWood, wear: 0.25 });
    }
  }

  // Prag de piatră, felinar lângă ușă, stivă de lemne pe o parte.
  k.box(1.3, 0.18, 0.6, { p: [W * 0.18, 0.09, fz + 0.3] }, { color: PAL.stoneDark, wear: 0.25, frost: 0.8 });
  k.box(0.08, 0.08, 0.4, { p: [W * 0.18 + 0.7, base + 1.9, fz + 0.15] }, { color: PAL.iron, mat: "metal" });
  k.box(0.22, 0.3, 0.22, { p: [W * 0.18 + 0.7, base + 1.7, fz + 0.32] }, { color: PAL.iron, mat: "metal", wear: 0.2 });
  k.box(0.13, 0.18, 0.13, { p: [W * 0.18 + 0.7, base + 1.7, fz + 0.32] }, { color: PAL.window, mat: "glow" });
  const stackX = W / 2 + 0.45;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5 - row; i++) {
      k.cyl(1.0, 0.24, 0.24, 7, { p: [stackX, 0.13 + row * 0.21, -D * 0.25 + (i - (4 - row) / 2) * 0.25], r: [0, 0, Math.PI / 2] }, {
        color: mix(PAL.oldWood, PAL.burntWood, k.rand(0, 0.5)), wear: 0.2, frost: 0.85, frostNormal: 0.55, smooth: true,
      });
    }
  }

  // Troiene la baza pereților.
  for (let i = 0; i < 5; i++) {
    const side = k.rand() < 0.5 ? 1 : -1;
    k.sphere(k.rand(1.0, 1.7), 6, { p: [k.rand(-W / 2, W / 2), 0.0, side * (D / 2 + 0.35)], s: [1.8, 0.4, 1] }, { color: PAL.snow, wear: 0.03, smooth: true });
  }

  return { meshes: k.build(`house${h.seed}`), chimney: [chX, top + rise + 1.2, -D * 0.15] };
}

// ---------- Mina de plasmă (ce apărăm) ----------

export interface ShelterParts {
  meshes: Mesh[];
  /** Piese animate: flăcările focului și cristalele de plasmă care pulsează. */
  flames: Mesh[];
  crystals: Mesh[];
  firePos: [number, number, number];
  plasmaPos: [number, number, number];
}

/**
 * Mina de plasmă: o movilă de stâncă înghețată, cu un puț acoperit de un capac greu de fier,
 * un cadru de lemn cu scripete deasupra și cristale extraterestre care strălucesc printre pietre.
 * Lângă ea, un foc de tabără (accentul cald). Raza ≈ CONFIG.shelter.radius.
 */
export function buildShelter(scene: Scene, mats: Materials): ShelterParts {
  const k = new ModelKit(scene, mats, 77);
  const R = 2.1;
  // Movila de stâncă.
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + k.rand(-0.15, 0.15);
    const r = R - k.rand(0.2, 0.5);
    k.ico(k.rand(0.55, 0.85), { p: [Math.cos(a) * r, k.rand(0.15, 0.35), Math.sin(a) * r], s: [1.2, k.rand(0.6, 0.9), 1], r: [0, k.rand(0, 3), 0] }, { color: mix(PAL.stone, PAL.stoneDark, k.rand(0, 1)), wear: 0.25, frost: 0.75 });
  }
  k.cyl(0.7, R * 1.5, R * 2, 10, { p: [0, 0.3, 0] }, { color: PAL.stoneDark, wear: 0.25, frost: 0.6 });
  // Gura puțului: inel de piatră + capac de fier cu grilaj (plasma luminează printre bare).
  k.cyl(0.4, 2.0, 2.2, 12, { p: [0, 0.75, 0] }, { color: PAL.stone, wear: 0.2, frost: 0.5 });
  k.cyl(0.05, 1.7, 1.7, 12, { p: [0, 0.92, 0] }, { color: PLASMA, mat: "glow" });
  for (let i = -3; i <= 3; i++) k.box(0.12, 0.12, 1.75, { p: [i * 0.24, 1.0, 0] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
  for (const z of [-0.5, 0.5]) k.box(1.75, 0.14, 0.14, { p: [0, 1.04, z] }, { color: PAL.rust, mat: "metal", wear: 0.3 });
  // Cadrul de lemn (capră) cu scripete și frânghie.
  const top = 3.6;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const bx = x * 1.35;
    const bz = z * 1.1;
    const len = Math.hypot(bx * 0.6, top, bz * 0.6);
    k.cyl(len, 0.2, 0.26, 6, { p: [bx * 0.7, top / 2 + 0.6, bz * 0.7], r: [Math.atan2(-bz * 0.6, top) * -1, 0, Math.atan2(bx * 0.6, top)] }, { color: PAL.darkWood, wear: 0.2, frost: 0.4 });
  }
  k.cyl(1.9, 0.22, 0.22, 6, { p: [0, top + 0.45, 0], r: [0, 0, Math.PI / 2] }, { color: PAL.burntWood, wear: 0.2, frost: 0.7, frostNormal: 0.5 });
  k.cyl(0.14, 0.9, 0.9, 12, { p: [0, top + 0.1, 0], r: [0, 0, Math.PI / 2] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
  k.cyl(top - 1.0, 0.04, 0.04, 4, { p: [0, (top + 1.0) / 2, 0] }, { color: PAL.cloth });
  // Felinar de plasmă atârnat de cadru.
  k.box(0.3, 0.4, 0.3, { p: [0.75, top - 0.3, 0] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
  k.sphere(0.24, 8, { p: [0.75, top - 0.3, 0] }, { color: PLASMA, mat: "glow" });
  // Vagonet cu minereu de plasmă.
  k.box(1.0, 0.5, 0.7, { p: [-1.9, 0.75, -1.2], r: [0, 0.4, 0] }, { color: PAL.rust, mat: "metal", wear: 0.3 });
  for (let i = 0; i < 4; i++) k.ico(0.18, { p: [-1.9 + k.rand(-0.3, 0.3), 1.05, -1.2 + k.rand(-0.2, 0.2)] }, { color: PLASMA, mat: "glow" });
  const meshes = k.build("shelter");

  // Focul de lângă mină e acum o entitate din joc (se vede prin SurvivalView).
  const flames: Mesh[] = [];
  // Cristalele de plasmă: ies dintre pietre, pulsează (le animăm).
  const crystals: Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const ck = new ModelKit(scene, mats, 260 + i);
    const h = ck.rand(0.7, 1.5);
    ck.cyl(h, 0, ck.rand(0.25, 0.4), 5, { p: [0, h / 2, 0] }, { color: i % 3 === 0 ? PLASMA_DEEP : PLASMA, mat: "glow" });
    ck.cyl(h * 0.6, 0, 0.18, 5, { p: [0.15, h * 0.3, 0.05], r: [0, 0, -0.5] }, { color: PLASMA, mat: "glow" });
    const c = ck.build(`plasma${i}`)[0];
    const a = (i / 7) * Math.PI * 2 + 0.4;
    c.position.set(Math.cos(a) * (R - 0.35), 0.3, Math.sin(a) * (R - 0.35));
    c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    crystals.push(c);
  }
  return { meshes, flames, crystals, firePos: [1.6, 1, -3.7], plasmaPos: [0, 1.6, 0] };
}

/** Plasma extraterestră din mină: verde-cyan rece. */
export const PLASMA = hex("#5cffc8");
const PLASMA_DEEP = hex("#2fd6ff");
