// Modelele pentru modul Supraviețuire și decorul nou: animale (căprioară, urs, găină, porc),
// ferme (coteț, țarc), focul de tabără, obiectele de pe jos (gloanțe, carne), schelete de
// dinozaur pe jumătate îngropate și copaci morți cu țurțuri.

import type { Mesh, Scene } from "@babylonjs/core";
import type { AnimalKind } from "../../core";
import { type Materials, ModelKit } from "../ModelKit";
import { PAL, hex, mix } from "../palette";

const SMOOTH = { smooth: true } as const;

// ---------- Animale ----------

export interface AnimalModel {
  body: Mesh[];
  /** Picioarele (pivot în șold), în ordinea: față-stânga, față-dreapta, spate-stânga, spate-dreapta. */
  leg: Mesh;
  legPos: [number, number, number][];
  /** Mărimea pentru animație (cât de repede pășește). */
  stride: number;
}

export function buildAnimal(scene: Scene, mats: Materials, kind: AnimalKind): AnimalModel {
  const k = new ModelKit(scene, mats, 3000 + kind.length);
  const leg = new ModelKit(scene, mats, 3100 + kind.length);
  switch (kind) {
    case "deer": {
      const fur = hex("#8a6a4a");
      k.capsule(1.3, 0.32, { p: [0, 1.15, 0], r: [Math.PI / 2, 0, 0], s: [0.9, 1, 1] }, { color: fur, wear: 0.15, ...SMOOTH });
      k.sphere(0.4, 8, { p: [0, 1.05, -0.5], s: [1, 0.8, 0.8] }, { color: hex("#efe6d6"), ...SMOOTH });
      k.capsule(0.6, 0.13, { p: [0, 1.55, 0.6], r: [0.5, 0, 0] }, { color: fur, ...SMOOTH });
      k.sphere(0.36, 8, { p: [0, 1.85, 0.82], s: [0.8, 0.8, 1.3] }, { color: fur, ...SMOOTH });
      k.sphere(0.1, 6, { p: [0, 1.8, 1.04] }, { color: hex("#1a1a1a"), ...SMOOTH });
      for (const side of [1, -1]) {
        // Coarne ramificate.
        k.cyl(0.7, 0.04, 0.08, 5, { p: [side * 0.2, 2.25, 0.7], r: [-0.25, 0, side * -0.45] }, { color: PAL.bone });
        for (let t = 0; t < 3; t++) {
          k.cyl(0.32, 0.02, 0.05, 4, { p: [side * (0.27 + t * 0.08), 2.35 + t * 0.12, 0.72 + t * 0.03], r: [0.5, 0, side * (-1.0 + t * 0.2)] }, { color: PAL.bone });
        }
        k.cyl(0.18, 0, 0.08, 4, { p: [side * 0.16, 1.98, 0.62], r: [0, 0, side * -1.2] }, { color: fur });
      }
      leg.capsule(1.0, 0.05, { p: [0, -0.48, 0] }, { color: mix(fur, PAL.darkWood, 0.3), ...SMOOTH });
      return { body: k.build("deer"), leg: leg.buildOne("deerLeg"), legPos: [[-0.17, 1.0, 0.45], [0.17, 1.0, 0.45], [-0.17, 1.0, -0.45], [0.17, 1.0, -0.45]], stride: 1.4 };
    }
    case "bear": {
      const fur = hex("#3e2c22");
      k.capsule(1.8, 0.7, { p: [0, 1.15, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.95] }, { color: fur, wear: 0.2, frost: 0.4, frostNormal: 0.5, ...SMOOTH });
      k.sphere(1.0, 8, { p: [0, 1.65, 0.35], s: [1, 0.7, 1] }, { color: fur, wear: 0.2, frost: 0.5, frostNormal: 0.4, ...SMOOTH });
      k.sphere(0.75, 10, { p: [0, 1.4, 1.05] }, { color: fur, ...SMOOTH });
      k.cyl(0.4, 0.28, 0.36, 8, { p: [0, 1.3, 1.4], r: [Math.PI / 2, 0, 0] }, { color: hex("#5a4232"), ...SMOOTH });
      k.sphere(0.14, 6, { p: [0, 1.32, 1.6] }, { color: hex("#111111"), ...SMOOTH });
      for (const side of [1, -1]) {
        k.sphere(0.2, 6, { p: [side * 0.26, 1.75, 1.0] }, { color: fur, ...SMOOTH });
        k.sphere(0.06, 6, { p: [side * 0.15, 1.5, 1.38] }, { color: hex("#ffcf6a"), mat: "glow" });
      }
      leg.capsule(1.0, 0.2, { p: [0, -0.45, 0] }, { color: fur, wear: 0.2, ...SMOOTH });
      for (const dx of [-0.08, 0, 0.08]) leg.cyl(0.14, 0, 0.04, 4, { p: [dx, -0.95, 0.2], r: [1.4, 0, 0] }, { color: PAL.bone });
      return { body: k.build("bear"), leg: leg.buildOne("bearLeg"), legPos: [[-0.4, 0.95, 0.65], [0.4, 0.95, 0.65], [-0.4, 0.95, -0.65], [0.4, 0.95, -0.65]], stride: 0.9 };
    }
    case "chicken": {
      k.sphere(0.5, 8, { p: [0, 0.42, 0], s: [0.9, 0.9, 1.1] }, { color: hex("#f2eee6"), ...SMOOTH });
      k.sphere(0.28, 8, { p: [0, 0.72, 0.2] }, { color: hex("#f2eee6"), ...SMOOTH });
      k.cyl(0.1, 0, 0.08, 4, { p: [0, 0.7, 0.38], r: [Math.PI / 2, 0, 0] }, { color: hex("#f0b020") });
      k.box(0.04, 0.12, 0.16, { p: [0, 0.88, 0.2] }, { color: hex("#d42020") });
      k.box(0.3, 0.2, 0.06, { p: [0, 0.52, -0.3], r: [0.6, 0, 0] }, { color: hex("#e2dbd0") });
      leg.cyl(0.26, 0.03, 0.03, 4, { p: [0, -0.13, 0] }, { color: hex("#f0b020") });
      return { body: k.build("chicken"), leg: leg.buildOne("chickenLeg"), legPos: [[-0.08, 0.27, 0], [0.08, 0.27, 0], [-0.08, 0.27, 0], [0.08, 0.27, 0]], stride: 3 };
    }
    case "pig": {
      const pink = hex("#e7a8a0");
      k.capsule(1.0, 0.36, { p: [0, 0.62, 0], r: [Math.PI / 2, 0, 0] }, { color: pink, wear: 0.1, ...SMOOTH });
      k.sphere(0.5, 8, { p: [0, 0.7, 0.52] }, { color: pink, ...SMOOTH });
      k.cyl(0.14, 0.2, 0.22, 8, { p: [0, 0.66, 0.78], r: [Math.PI / 2, 0, 0] }, { color: hex("#d68a84"), ...SMOOTH });
      for (const side of [1, -1]) k.cyl(0.14, 0, 0.12, 3, { p: [side * 0.15, 0.95, 0.5], r: [0.3, 0, side * -0.5] }, { color: pink });
      k.capsule(0.2, 0.03, { p: [0, 0.75, -0.55], r: [0.8, 0, 0] }, { color: pink, ...SMOOTH });
      leg.capsule(0.4, 0.08, { p: [0, -0.16, 0] }, { color: pink, ...SMOOTH });
      return { body: k.build("pig"), leg: leg.buildOne("pigLeg"), legPos: [[-0.17, 0.4, 0.3], [0.17, 0.4, 0.3], [-0.17, 0.4, -0.3], [0.17, 0.4, -0.3]], stride: 1.6 };
    }
  }
}

// ---------- Ferme ----------

export function buildFarm(scene: Scene, mats: Materials, kind: "chicken" | "pig"): Mesh[] {
  const k = new ModelKit(scene, mats, 3200 + kind.length);
  const fence = (r: number, posts: number, gap: number) => {
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      if (Math.abs(a - Math.PI * 1.5) < gap) continue; // intrarea, spre cameră
      k.cyl(0.8, 0.12, 0.14, 5, { p: [Math.cos(a) * r, 0.4, Math.sin(a) * r] }, { color: PAL.oldWood, wear: 0.25, frost: 0.6 });
      const b = ((i + 0.5) / posts) * Math.PI * 2;
      if (Math.abs(b - Math.PI * 1.5) < gap) continue;
      k.box(0.09, 0.09, (2 * Math.PI * r) / posts + 0.1, { p: [Math.cos(b) * r, 0.55, Math.sin(b) * r], r: [0, -b, 0] }, { color: PAL.darkWood, wear: 0.25, frost: 0.7 });
    }
  };
  if (kind === "chicken") {
    // Coteț pe picioroange, cu acoperiș în două ape și rampă.
    for (const [x, z] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) k.box(0.1, 0.6, 0.1, { p: [x, 0.3, z] }, { color: PAL.darkWood });
    k.box(1.2, 0.7, 1.0, { p: [0, 0.95, 0] }, { color: PAL.oldWood, wear: 0.3, frost: 0.4 });
    for (const side of [1, -1]) k.box(1.4, 0.08, 0.75, { p: [0, 1.45, side * 0.3], r: [side * 0.6, 0, 0] }, { color: PAL.burntWood, wear: 0.2, frost: 0.9, frostNormal: 0.3 });
    k.box(0.3, 0.3, 0.05, { p: [0, 0.9, 0.51] }, { color: hex("#1a1410") });
    k.box(0.3, 0.04, 0.9, { p: [0, 0.35, 0.85], r: [0.65, 0, 0] }, { color: PAL.oldWood });
    k.ico(0.4, { p: [0.6, 0.05, 0.6], s: [1.5, 0.3, 1.2] }, { color: hex("#c8a65a"), wear: 0.2 });
    fence(2.2, 14, 0.4);
  } else {
    // Țarc de porci: gard, noroi înghețat, jgheab.
    k.cyl(0.04, 3.4, 3.4, 16, { p: [0, 0.02, 0] }, { color: mix(PAL.dirt, PAL.snowShadow, 0.3), wear: 0.25 });
    k.box(1.0, 0.25, 0.35, { p: [0.9, 0.13, 0.7] }, { color: PAL.oldWood, wear: 0.3 });
    k.box(0.85, 0.05, 0.22, { p: [0.9, 0.24, 0.7] }, { color: hex("#6a5a3a") });
    k.box(1.0, 0.6, 0.6, { p: [-0.9, 0.3, -0.8] }, { color: PAL.burntWood, wear: 0.3, frost: 0.5 });
    k.box(1.2, 0.08, 0.8, { p: [-0.9, 0.66, -0.8], r: [0.15, 0, 0] }, { color: PAL.darkWood, frost: 0.9, frostNormal: 0.3 });
    fence(2.3, 16, 0.35);
  }
  return k.build(`farm_${kind}`);
}

// ---------- Fântâna ----------

/** Puț de țară: ghizduri de piatră, apă neagră, doi stâlpi cu acoperiș, vârtej (manivelă) și găleată. */
export function buildWell(scene: Scene, mats: Materials): Mesh[] {
  const k = new ModelKit(scene, mats, 3300);
  // Ghizdul: un inel de pietre (două rânduri) + gura de sus.
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + row * 0.28;
      k.ico(0.24, { p: [Math.cos(a) * 0.68, 0.18 + row * 0.3, Math.sin(a) * 0.68], s: [1.2, 0.8, 1], r: [0, -a, 0] },
        { color: row ? PAL.stone : PAL.stoneDark, wear: 0.3, frost: 0.7, frostNormal: 0.4, smooth: true });
    }
  }
  // Buza de sus: lespezi pe margine (nu un capac), ca să se vadă apa neagră din puț.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    k.box(0.5, 0.1, 0.26, { p: [Math.cos(a) * 0.66, 0.66, Math.sin(a) * 0.66], r: [0, -a + Math.PI / 2, 0] },
      { color: PAL.stone, wear: 0.3, frost: 0.8, frostNormal: 0.4 });
  }
  k.cyl(0.04, 1.1, 1.1, 18, { p: [0, 0.6, 0] }, { color: hex("#0b1a21"), mat: "metal", wear: 0.03, smooth: true });
  // Stâlpii, bârna cu vârtejul și manivela.
  for (const side of [1, -1]) k.box(0.13, 1.5, 0.13, { p: [side * 0.72, 1.35, 0] }, { color: PAL.oldWood, wear: 0.3, frost: 0.4 });
  k.cyl(1.55, 0.14, 0.14, 7, { p: [0, 1.7, 0], r: [0, 0, Math.PI / 2] }, { color: PAL.darkWood, wear: 0.25 });
  k.cyl(0.28, 0.17, 0.17, 7, { p: [0.15, 1.7, 0], r: [0, 0, Math.PI / 2] }, { color: hex("#8a7a60"), wear: 0.4 }); // frânghia înfășurată
  k.box(0.06, 0.32, 0.06, { p: [0.86, 1.56, 0] }, { color: PAL.iron, mat: "metal", wear: 0.5 });
  k.box(0.22, 0.05, 0.05, { p: [0.95, 1.42, 0] }, { color: PAL.darkWood });
  // Frânghia și găleata (de lemn, legată cu fier), puțin deasupra gurii.
  k.cyl(0.5, 0.02, 0.02, 4, { p: [0.15, 1.38, 0] }, { color: hex("#8a7a60") });
  k.cyl(0.3, 0.28, 0.22, 8, { p: [0.15, 1.0, 0] }, { color: PAL.oldWood, wear: 0.3 });
  k.cyl(0.04, 0.29, 0.29, 8, { p: [0.15, 1.1, 0] }, { color: PAL.iron, mat: "metal", wear: 0.5 });
  // Acoperișul în două ape, cu zăpadă.
  for (const side of [1, -1]) {
    k.box(1.9, 0.07, 0.75, { p: [0, 2.28, side * 0.3], r: [side * 0.62, 0, 0] }, { color: PAL.burntWood, wear: 0.25, frost: 1, frostNormal: 0.3 });
  }
  k.box(1.95, 0.08, 0.08, { p: [0, 2.5, 0] }, { color: PAL.darkWood });
  return k.build("well");
}

// ---------- Focul de tabără ----------

/** Cercul de pietre și buștenii (flăcările sunt separate, animate). */
export function buildCampfire(scene: Scene, mats: Materials): Mesh[] {
  const k = new ModelKit(scene, mats, 3300);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    k.ico(0.24, { p: [Math.cos(a) * 0.7, 0.08, Math.sin(a) * 0.7], s: [1, 0.7, 1] }, { color: PAL.stoneDark, wear: 0.25, frost: 0.5 });
  }
  for (let i = 0; i < 3; i++) {
    k.cyl(1.0, 0.15, 0.15, 6, { p: [0, 0.16, 0], r: [Math.PI / 2, (i * Math.PI) / 3, 0.25] }, { color: PAL.darkWood, wear: 0.35 });
  }
  // Frigarea (două furci + băț).
  for (const x of [-0.75, 0.75]) k.cyl(0.9, 0.05, 0.06, 4, { p: [x, 0.45, 0] }, { color: PAL.oldWood });
  k.cyl(1.6, 0.04, 0.04, 4, { p: [0, 0.88, 0], r: [0, 0, Math.PI / 2] }, { color: PAL.oldWood });
  return k.build("campfire");
}

/** Jarul (strălucește doar cât arde focul). */
export function buildEmbers(scene: Scene, mats: Materials): Mesh {
  const k = new ModelKit(scene, mats, 3301);
  k.cyl(0.08, 0.8, 0.8, 8, { p: [0, 0.05, 0] }, { color: PAL.fire, mat: "glow" });
  return k.buildOne("embers");
}

// ---------- Obiecte pe jos ----------

export type DropModel = "ammo" | "rawMeat" | "cookedMeat" | "fish" | "petrol" | "oil" | "leather" | "iron" | "canteen";

export function buildDrop(scene: Scene, mats: Materials, kind: DropModel): Mesh[] {
  const k = new ModelKit(scene, mats, 3400 + kind.length);
  if (kind === "petrol") {
    // Bidon roșu de benzină, cu mâner și gură.
    k.box(0.36, 0.46, 0.2, { p: [0, 0.23, 0] }, { color: hex("#b0302a"), wear: 0.35, frost: 0.3 });
    k.box(0.22, 0.06, 0.06, { p: [-0.02, 0.5, 0] }, { color: hex("#7a1e1a") });
    k.cyl(0.12, 0.06, 0.07, 6, { p: [0.14, 0.5, 0], r: [0, 0, -0.4] }, { color: PAL.iron, mat: "metal" });
  } else if (kind === "oil") {
    // Butoiaș negru cu țiței.
    k.cyl(0.5, 0.36, 0.36, 10, { p: [0, 0.25, 0] }, { color: hex("#1b1d21"), mat: "metal", wear: 0.3, frost: 0.3 });
    for (const y of [0.08, 0.42]) k.cyl(0.04, 0.38, 0.38, 10, { p: [0, y, 0] }, { color: PAL.rust, mat: "metal", wear: 0.4 });
  } else if (kind === "leather") {
    // Piele rulată, legată cu sfoară.
    k.cyl(0.5, 0.22, 0.22, 8, { p: [0, 0.12, 0], r: [0, 0, Math.PI / 2] }, { color: hex("#8a5a38"), wear: 0.3, ...SMOOTH });
    for (const x of [-0.14, 0.14]) k.cyl(0.04, 0.24, 0.24, 8, { p: [x, 0.12, 0], r: [0, 0, Math.PI / 2] }, { color: hex("#c8b48a") });
  } else if (kind === "iron") {
    // Două lingouri de fier.
    k.box(0.38, 0.1, 0.16, { p: [0, 0.06, -0.06] }, { color: hex("#6d7882"), mat: "metal", wear: 0.35 });
    k.box(0.38, 0.1, 0.16, { p: [0.03, 0.16, 0.04], r: [0, 0.3, 0] }, { color: hex("#5d6872"), mat: "metal", wear: 0.35 });
  } else if (kind === "canteen") {
    k.cyl(0.36, 0.2, 0.22, 10, { p: [0, 0.18, 0] }, { color: hex("#4a5a48"), mat: "metal", wear: 0.3 });
  } else if (kind === "ammo") {
    // Lădiță de lemn legată cu fier, cu cartușe de alamă deasupra.
    k.box(0.6, 0.32, 0.4, { p: [0, 0.16, 0] }, { color: PAL.oldWood, wear: 0.3, frost: 0.4 });
    for (const x of [-0.22, 0.22]) k.box(0.05, 0.34, 0.42, { p: [x, 0.16, 0] }, { color: PAL.iron, mat: "metal" });
    for (let i = 0; i < 4; i++) k.cyl(0.2, 0.06, 0.06, 6, { p: [-0.12 + i * 0.08, 0.38, 0], r: [0, 0, 0] }, { color: hex("#d9a441"), mat: "metal" });
  } else if (kind === "fish") {
    // Păstrăv argintiu cu spinarea verzuie și coadă în V.
    k.sphere(0.5, 8, { p: [0, 0.14, 0], s: [1.4, 0.45, 0.32] }, { color: hex("#a9b8bf"), wear: 0.15, ...SMOOTH });
    k.sphere(0.42, 8, { p: [0, 0.2, 0], s: [1.3, 0.25, 0.2] }, { color: hex("#4f6b5a"), wear: 0.15, ...SMOOTH });
    k.cyl(0.22, 0, 0.26, 3, { p: [-0.42, 0.14, 0], r: [0, 0, Math.PI / 2], s: [1, 1, 0.3] }, { color: hex("#7d8f96"), wear: 0.1 });
  } else if (kind === "rawMeat") {
    k.sphere(0.45, 8, { p: [0, 0.18, 0], s: [1.2, 0.6, 0.9] }, { color: hex("#a8323a"), wear: 0.2, ...SMOOTH });
    k.cyl(0.4, 0.07, 0.07, 6, { p: [0.3, 0.18, 0], r: [0, 0, Math.PI / 2] }, { color: PAL.bone });
  } else {
    k.sphere(0.45, 8, { p: [0, 0.18, 0], s: [1.2, 0.65, 0.9] }, { color: hex("#7a4422"), wear: 0.25, ...SMOOTH });
    k.cyl(0.4, 0.07, 0.07, 6, { p: [0.3, 0.18, 0], r: [0, 0, Math.PI / 2] }, { color: PAL.bone });
  }
  return k.build(`drop_${kind}`);
}

// ---------- Decor: schelete de dinozaur, copaci morți ----------

/** Schelet uriaș pe jumătate îngropat: craniu cu colți, coloană, coaste arcuite, coadă. */
export function buildDinoSkeleton(scene: Scene, mats: Materials, seed: number): Mesh[] {
  const k = new ModelKit(scene, mats, 3500 + seed);
  const bone = mix(PAL.bone, PAL.snowShadow, 0.15);
  // Coloana (vertebre) care iese din zăpadă în arc.
  const n = 16;
  const spine: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const z = -4 + t * 8;
    const y = Math.sin(t * Math.PI) * 1.6 - 0.2;
    spine.push([z, y]);
    k.sphere(0.36 - Math.abs(t - 0.45) * 0.3, 6, { p: [0, y, z] }, { color: bone, wear: 0.25, frost: 0.5, ...SMOOTH });
    k.cyl(0.35, 0, 0.1, 4, { p: [0, y + 0.25, z] }, { color: bone, wear: 0.2 });
  }
  // Coaste curbate (arce din capsule) pe mijlocul coloanei.
  for (let i = 4; i < 11; i++) {
    const [z, y] = spine[i];
    const len = 1.6 - Math.abs(i - 7) * 0.15;
    for (const side of [1, -1]) {
      k.capsule(len, 0.07, { p: [side * 0.45, y - 0.35, z], r: [0, 0, side * 0.45] }, { color: bone, wear: 0.2, ...SMOOTH });
      k.capsule(len * 0.8, 0.06, { p: [side * 0.85, y - len * 0.75, z], r: [0, 0, side * -0.15] }, { color: bone, wear: 0.2, ...SMOOTH });
    }
  }
  // Craniul cu fălci și colți, la capătul coloanei.
  const [hz, hy] = spine[n - 1];
  k.sphere(1.2, 8, { p: [0, hy + 0.3, hz + 0.7], s: [0.8, 0.7, 1.5] }, { color: bone, wear: 0.25, frost: 0.4, ...SMOOTH });
  k.box(0.6, 0.15, 1.2, { p: [0, hy - 0.15, hz + 1.1], r: [0.3, 0, 0] }, { color: bone, wear: 0.2 });
  for (let i = 0; i < 6; i++) k.cyl(0.25, 0, 0.07, 3, { p: [(i % 2 ? 0.2 : -0.2), hy - 0.02, hz + 0.7 + i * 0.15], r: [Math.PI, 0, 0] }, { color: PAL.bone });
  k.sphere(0.2, 6, { p: [0.3, hy + 0.5, hz + 0.6] }, { color: hex("#1a1e22"), ...SMOOTH });
  // Zăpadă în jur (îl îngroapă pe jumătate).
  for (let i = 0; i < 5; i++) k.ico(1.2, { p: [k.rand(-1, 1), -0.4, -3 + i * 1.6], s: [1.8, 0.45, 1.3] }, { color: PAL.snow, wear: 0.03 });
  return k.build(`dino${seed}`);
}

/** Copac mort, fără ace, cu crengi rupte și țurțuri (ca în referințe). */
export function buildDeadTree(scene: Scene, mats: Materials, seed: number): Mesh[] {
  const k = new ModelKit(scene, mats, 3600 + seed);
  const bark = mix(PAL.darkWood, PAL.stoneDark, 0.4);
  const h = k.rand(3.2, 4.5);
  k.cyl(h, 0.18, 0.5, 6, { p: [0, h / 2, 0], r: [k.rand(-0.06, 0.06), 0, k.rand(-0.06, 0.06)] }, { color: bark, wear: 0.3, frost: 0.4 });
  for (let i = 0; i < 3; i++) k.cyl(0.6, 0, 0.12, 4, { p: [k.rand(-0.1, 0.1), h + 0.2, k.rand(-0.1, 0.1)], r: [k.rand(-0.5, 0.5), 0, k.rand(-0.5, 0.5)] }, { color: bark });
  for (let i = 0; i < 4; i++) {
    const y = k.rand(1.5, h - 0.4);
    const a = k.rand(0, Math.PI * 2);
    const len = k.rand(0.7, 1.3);
    k.cyl(len, 0.03, 0.1, 4, { p: [Math.sin(a) * len * 0.45, y + 0.2, Math.cos(a) * len * 0.45], r: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9] }, { color: bark, wear: 0.3, frost: 0.6 });
    for (let j = 0; j < 3; j++) k.cyl(k.rand(0.2, 0.45), 0.05, 0, 4, { p: [Math.sin(a) * len * (0.3 + j * 0.2), y - 0.05, Math.cos(a) * len * (0.3 + j * 0.2)] }, { color: mix(PAL.ice, PAL.snow, 0.5), wear: 0.05 });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    k.cyl(0.6, 0.06, 0.2, 4, { p: [Math.sin(a) * 0.4, 0.15, Math.cos(a) * 0.4], r: [Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1] }, { color: bark });
  }
  k.ico(0.8, { p: [0, 0, 0], s: [1.4, 0.3, 1.4] }, { color: PAL.snow, wear: 0.03 });
  return k.build(`deadTree${seed}`);
}
