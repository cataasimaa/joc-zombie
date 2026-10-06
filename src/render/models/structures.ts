// Construcțiile: turnuri (post de lemn și piatră + armă pe pivot), ziduri și uși, mine, monede.

import type { Color3, Mesh, Scene } from "@babylonjs/core";
import { CONFIG, type TowerKind } from "../../core";
import { type Materials, ModelKit } from "../ModelKit";
import { PAL, hex, mix } from "../palette";

// ---------- Turn ----------

/**
 * Baza turnului: un bastion scund de piatră cu creneluri de lemn (fără acoperiș, ca să se vadă
 * arma). Nivelul 2 primește o bandă de fier, nivelul 3 e mai înalt și are țepi.
 */
export function buildTowerBase(scene: Scene, mats: Materials, level: number): Mesh[] {
  const k = new ModelKit(scene, mats, 500 + level);
  const h = towerHeadY(level) - 0.08;
  k.cyl(h, 1.75, 2.15, 8, { p: [0, h / 2, 0] }, { color: PAL.stone, wear: 0.24, frost: 0.7 });
  // Pietre ieșite în afară (zidărie neregulată).
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + k.rand(0, 0.3);
    k.box(0.42, 0.26, 0.14, { p: [Math.sin(a) * (1.0 - 0.1), k.rand(0.2, h - 0.2), Math.cos(a) * (1.0 - 0.1)], r: [0, a, 0] }, { color: mix(PAL.stoneDark, PAL.moss, k.rand(0, 0.5)), wear: 0.2, frost: 0.6 });
  }
  // Platforma de lemn și crenelurile.
  k.cyl(0.14, 1.95, 1.95, 8, { p: [0, h + 0.02, 0] }, { color: PAL.oldWood, wear: 0.2, frost: 0.4 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.box(0.32, 0.38, 0.14, { p: [Math.sin(a) * 0.9, h + 0.24, Math.cos(a) * 0.9], r: [0, a, 0] }, { color: mix(PAL.burntWood, PAL.oldWood, k.rand(0, 0.6)), wear: 0.2, frost: 0.7 });
  }
  if (level >= 2) k.cyl(0.18, 2.0, 2.0, 8, { p: [0, h - 0.35, 0] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
  if (level >= 3) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      k.cyl(0.6, 0, 0.12, 4, { p: [Math.sin(a) * 1.15, 0.55, Math.cos(a) * 1.15], r: [Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
    }
    k.cyl(0.18, 2.05, 2.05, 8, { p: [0, 0.35, 0] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
  }
  // Troian de zăpadă la bază.
  k.ico(0.9, { p: [0.6, 0.05, 0.5], s: [1.6, 0.35, 1.2] }, { color: PAL.snow, wear: 0.03 });
  return k.build(`towerBase${level}`);
}

/** Înălțimea platformei (unde stă arma), după nivel. */
export const towerHeadY = (level: number): number => (level >= 3 ? 1.35 : level === 2 ? 1.1 : 0.9);

/** Culoarea „semnătură” a fiecărui tip (pentru efecte). */
export const TOWER_COLORS: Record<TowerKind, Color3> = {
  crossbow: PAL.bone,
  rocket: PAL.fire,
  cannon: hex("#ffb24a"),
  tesla: hex("#9fdcff"),
  frost: PAL.ice,
};

/** Arma de pe pivot, după tip și nivel. Privește spre +z. */
export function buildTowerHead(scene: Scene, mats: Materials, kind: TowerKind, level: number): Mesh[] {
  const k = new ModelKit(scene, mats, 600 + level * 10 + kind.length);
  const s = 1 + (level - 1) * 0.12;
  // Pivotul de fier comun.
  k.cyl(0.3, 0.55, 0.65, 8, { p: [0, 0.15, 0] }, { color: PAL.iron, mat: "metal", wear: 0.25 });
  switch (kind) {
    case "crossbow": {
      // Arbaletă mare (balistă): grindă, arcuri, coardă, săgeată cu vârf de fier.
      const armColor = level >= 3 ? PAL.iron : level === 2 ? PAL.bone : PAL.darkWood;
      k.box(0.3 * s, 0.26 * s, 1.7 * s, { p: [0, 0.48, 0.15] }, { color: PAL.oldWood, wear: 0.2 });
      for (const side of [1, -1]) {
        k.box(1.1 * s, 0.13, 0.16, { p: [side * 0.55 * s, 0.5, 0.75 * s], r: [0, side * -0.4, 0] }, { color: armColor, mat: level >= 3 ? "metal" : "matte", wear: 0.15 });
      }
      k.box(2.0 * s, 0.035, 0.035, { p: [0, 0.52, 0.38 * s] }, { color: PAL.cloth });
      k.cyl(1.4 * s, 0.07, 0.07, 5, { p: [0, 0.65, 0.55 * s], r: [Math.PI / 2, 0, 0] }, { color: PAL.oldWood });
      k.cyl(0.26, 0, 0.16, 4, { p: [0, 0.65, 1.3 * s], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
      for (const z of [-0.3, 0.45]) k.box(0.38 * s, 0.32 * s, 0.07, { p: [0, 0.48, z * s] }, { color: PAL.iron, mat: "metal" });
      break;
    }
    case "rocket": {
      // Lansator: cutie de fier cu 4 (nivel 3: 6) tuburi; rachetele au vârf roșu.
      k.box(1.0 * s, 0.25, 0.8, { p: [0, 0.38, -0.05] }, { color: PAL.oldWood, wear: 0.2 });
      const cols = level >= 3 ? [-0.33, 0, 0.33] : [-0.2, 0.2];
      for (const x of cols) {
        for (const y of [0.68, 1.02]) {
          k.cyl(1.25, 0.3, 0.3, 8, { p: [x * s, y, 0.2], r: [Math.PI / 2 - 0.15, 0, 0] }, { color: mix(PAL.iron, PAL.rust, 0.35), mat: "metal", wear: 0.3 });
          k.cyl(0.22, 0, 0.22, 6, { p: [x * s, y + 0.1, 0.85], r: [Math.PI / 2 - 0.15, 0, 0] }, { color: hex("#9a2a22"), wear: 0.2 });
        }
      }
      k.box(0.12, 0.7, 0.12, { p: [0.62 * s, 0.75, -0.25] }, { color: PAL.iron, mat: "metal" });
      k.sphere(0.16, 6, { p: [0.62 * s, 1.12, -0.25] }, { color: PAL.fire, mat: "glow" });
      break;
    }
    case "cannon": {
      // Tun: țeavă groasă de fier pe afet de lemn cu roți.
      k.box(0.9 * s, 0.35, 1.2, { p: [0, 0.45, -0.1] }, { color: PAL.oldWood, wear: 0.25 });
      for (const side of [1, -1]) k.cyl(0.14, 0.7, 0.7, 10, { p: [side * 0.52 * s, 0.38, 0.1], r: [0, 0, Math.PI / 2] }, { color: PAL.darkWood, wear: 0.2 });
      k.cyl(1.6 * s, 0.42, 0.62, 10, { p: [0, 0.8, 0.35], r: [Math.PI / 2 - 0.12, 0, 0] }, { color: hex("#2a2f35"), mat: "metal", wear: 0.2 });
      k.cyl(0.2, 0.56, 0.56, 10, { p: [0, 0.88, 1.1 * s], r: [Math.PI / 2 - 0.12, 0, 0] }, { color: hex("#2a2f35"), mat: "metal" });
      const bands = level >= 2 ? [-0.2, 0.3, 0.75] : [0.3];
      for (const z of bands) k.cyl(0.08, 0.66, 0.66, 10, { p: [0, 0.8 + z * 0.12, z], r: [Math.PI / 2 - 0.12, 0, 0] }, { color: PAL.rust, mat: "metal" });
      k.sphere(0.65, 10, { p: [0, 0.75, -0.45] }, { color: hex("#2a2f35"), mat: "metal", wear: 0.2 });
      break;
    }
    case "tesla": {
      // Bobină: coloană de fier cu inele de cupru și o sferă de energie sus.
      const copper = hex("#a8653a");
      k.cyl(1.5 * s, 0.32, 0.5, 8, { p: [0, 0.9 * s, 0] }, { color: PAL.iron, mat: "metal", wear: 0.25 });
      for (let i = 0; i < 4 + level; i++) k.cyl(0.08, 0.75 - i * 0.06, 0.75 - i * 0.06, 12, { p: [0, 0.4 + i * 0.28 * s, 0] }, { color: copper, mat: "metal", wear: 0.15 });
      k.sphere(0.75, 12, { p: [0, 1.85 * s, 0] }, { color: hex("#9fdcff"), mat: "glow" });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        k.cyl(0.6, 0.02, 0.08, 4, { p: [Math.sin(a) * 0.45, 1.55 * s, Math.cos(a) * 0.45], r: [Math.cos(a) * 0.8, 0, -Math.sin(a) * 0.8] }, { color: copper, mat: "metal" });
      }
      break;
    }
    case "frost": {
      // Obelisc de gheață: cristale mari care strălucesc rece, pe un inel de piatră.
      k.cyl(0.3, 1.2, 1.3, 8, { p: [0, 0.35, 0] }, { color: PAL.stoneDark, wear: 0.2, frost: 0.8 });
      k.cyl(1.9 * s, 0, 0.6, 6, { p: [0, 1.4 * s, 0] }, { color: mix(PAL.ice, PAL.snow, 0.2), mat: "glow" });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        const h = k.rand(0.7, 1.1) * s;
        k.cyl(h, 0, 0.3, 5, { p: [Math.sin(a) * 0.38, 0.5 + h / 2, Math.cos(a) * 0.38], r: [Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45] }, { color: mix(PAL.ice, PAL.snow, 0.5), wear: 0.05, smooth: true });
      }
      break;
    }
  }
  return k.build(`towerHead_${kind}${level}`);
}

/** O flacără mică (focul de la baza turnului, minele, Molotov). Pivot la bază. */
export function buildFlame(scene: Scene, mats: Materials): Mesh {
  const k = new ModelKit(scene, mats, 700);
  k.cyl(0.55, 0, 0.3, 5, { p: [0, 0.27, 0] }, { color: PAL.fire, mat: "glow" });
  k.cyl(0.35, 0, 0.18, 5, { p: [0.05, 0.2, 0.04] }, { color: mix(PAL.fire, PAL.gold, 0.6), mat: "glow" });
  return k.buildOne("flame");
}

// ---------- Ziduri ----------

export type WallState = "intact" | "cracked" | "broken";

/**
 * Un segment de zid (lungimea pe axa x), din țăruși, scânduri și zăpadă — fără piatră.
 * level 1 = gard de pari, 2 = palisadă dublă cu benzi de fier și țepi. door = ușă din scânduri.
 * Trei stări ale aceluiași obiect, ca să se vadă că se strică și se repară:
 *   întreg · crăpat (pari aplecați, o scândură căzută, așchii) · dărâmat (cioturi și scânduri pe jos).
 */
export function buildWall(scene: Scene, mats: Materials, level: number, door: boolean, state: WallState = "intact"): Mesh[] {
  const k = new ModelKit(scene, mats, 800 + level * 10 + (door ? 1 : 0));
  const L = CONFIG.barricade.length;
  const strong = level >= 2;
  const stakeH = strong ? 2.0 : 1.6;
  const cracked = state === "cracked";
  const broken = state === "broken";
  const wood = (t: number) => mix(PAL.burntWood, PAL.oldWood, t);

  // Un par ascuțit; `snap` = rupt (ciot cu vârf așchiat), `lean` = aplecat.
  const stake = (x: number, h: number, z = 0, thick = 0.32, snap = false, lean = 0) => {
    const hh = snap ? h * k.rand(0.25, 0.45) : h;
    k.cyl(hh, thick * 0.92, thick, 6, { p: [x + lean * hh * 0.5, hh / 2, z], r: [k.rand(-0.05, 0.05), 0, -lean + k.rand(-0.05, 0.05)] }, { color: wood(k.rand(0, 0.7)), wear: 0.25, frost: 0.4, frostNormal: 0.75 });
    if (snap) {
      for (let i = 0; i < 3; i++) k.cyl(0.25, 0, 0.08, 3, { p: [x + k.rand(-0.08, 0.08), hh + 0.08, z + k.rand(-0.06, 0.06)], r: [k.rand(-0.4, 0.4), 0, k.rand(-0.4, 0.4)] }, { color: PAL.oldWood });
    } else {
      k.cyl(0.38, 0, thick * 0.92, 6, { p: [x + lean * (hh + 0.2), hh + 0.18, z], r: [0, 0, -lean] }, { color: PAL.oldWood, wear: 0.2, frost: 0.7, frostNormal: 0.3 });
    }
  };
  // Scândură pe jos (căzută).
  const fallen = (x: number, z: number, len: number) =>
    k.box(len, 0.08, 0.22, { p: [x, 0.06, z], r: [0, k.rand(-0.6, 0.6), k.rand(-0.08, 0.08)] }, { color: wood(k.rand(0.2, 0.8)), wear: 0.25, frost: 0.6 });

  const n = door ? 2 : strong ? 7 : 6;
  const xs = door ? [-L / 2 + 0.2, L / 2 - 0.2] : Array.from({ length: n }, (_, i) => -L / 2 + 0.2 + (i * (L - 0.4)) / (n - 1));
  const rows = strong ? [0, 0.26] : [0];
  xs.forEach((x, i) => {
    for (const z of rows) {
      const h = (door ? stakeH + 0.25 : stakeH) + k.rand(-0.15, 0.15) - (z > 0 ? 0.3 : 0);
      const snap = broken ? true : cracked && (i === 2 || (strong && i === 5)) && z === 0;
      const lean = cracked && i % 3 === 1 ? k.rand(0.12, 0.22) * (i % 2 ? 1 : -1) : 0;
      stake(x, h, z, strong ? 0.36 : 0.32, snap, lean);
    }
  });

  if (!broken) {
    if (door) {
      // Cadrul ușii și ușa din scânduri, cu benzi de fier.
      k.box(L, 0.22, 0.3, { p: [0, stakeH + 0.05, 0] }, { color: PAL.darkWood, wear: 0.2, frost: 0.8 });
      const dw = L - 0.75;
      for (let i = 0; i < 4; i++) {
        if (cracked && i === 1) continue;
        k.box(dw, 0.3, 0.14, { p: [0, 0.25 + i * 0.34, 0], r: [0, 0, cracked ? k.rand(-0.08, 0.08) : k.rand(-0.02, 0.02)] }, { color: wood(k.rand(0, 0.5)), wear: 0.2, frost: 0.5, frostNormal: 0.7 });
      }
      for (const x of [-dw / 3, dw / 3]) k.box(0.12, 1.3, 0.05, { p: [x, 0.75, 0.09] }, { color: PAL.iron, mat: "metal", wear: 0.3 });
      k.cyl(0.04, 0.2, 0.2, 8, { p: [0.3, 0.75, 0.12], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
    } else {
      // Scânduri prinse orizontal peste pari (la crăpat: una lipsește, una atârnă strâmb).
      const ys = strong ? [0.4, 1.0, stakeH - 0.4] : [0.45, stakeH - 0.35];
      ys.forEach((y, i) => {
        if (cracked && i === 1) return;
        const tilt = cracked && i === 0 ? 0.18 : k.rand(-0.04, 0.04);
        k.box(L + 0.1, 0.18, 0.1, { p: [0, y, 0.2], r: [0, 0, tilt] }, { color: PAL.darkWood, wear: 0.22, frost: 0.7, frostNormal: 0.7 });
      });
      if (level >= 3) {
        // Zid de metal: table de fier nituite peste pari, cu rugină scursă din nituri.
        const plates = cracked ? [-0.85, 0.85] : [-0.85, 0, 0.85];
        for (const x of plates) {
          k.box(0.86, stakeH - 0.3, 0.08, { p: [x, (stakeH - 0.3) / 2 + 0.12, 0.3], r: [0, 0, k.rand(-0.015, 0.015)] }, { color: mix(PAL.iron, PAL.rust, k.rand(0.1, 0.4)), mat: "metal", wear: 0.4, frost: 0.5, frostNormal: 0.8 });
          for (const y of [0.3, stakeH - 0.35]) for (const dx of [-0.34, 0.34]) k.sphere(0.07, 4, { p: [x + dx, y, 0.35] }, { color: PAL.rust, mat: "metal" });
          k.box(0.06, 0.5, 0.02, { p: [x + 0.2, 0.55, 0.345] }, { color: PAL.rust, wear: 0.3 });
        }
        if (cracked) k.box(0.8, 0.06, 0.6, { p: [0.1, 0.05, 0.7], r: [0, 0.4, 0.1] }, { color: PAL.iron, mat: "metal", wear: 0.4 });
      }
      if (strong) {
        // Benzi de fier peste pari și țepi îndreptați spre exterior.
        for (const y of [0.7, stakeH - 0.6]) k.box(L, 0.08, 0.4, { p: [0, y, 0.12] }, { color: PAL.iron, mat: "metal", wear: 0.35 });
        for (const x of [-0.9, -0.3, 0.3, 0.9]) {
          if (cracked && x === 0.3) continue;
          k.cyl(0.9, 0, 0.14, 4, { p: [x, 0.6, 0.6], r: [1.1, 0, 0] }, { color: PAL.oldWood, wear: 0.2 });
        }
      }
    }
  }
  if (cracked) {
    fallen(0.2, 0.55, L * 0.6);
    for (let i = 0; i < 4; i++) k.box(0.18, 0.04, 0.06, { p: [k.rand(-1, 1), 0.04, k.rand(0.3, 0.8)], r: [0, k.rand(0, 3), 0] }, { color: PAL.oldWood });
  }
  if (broken) {
    // Dărâmat: doar cioturi, scânduri împrăștiate și zăpadă peste ele.
    fallen(-0.4, 0.5, L * 0.7);
    fallen(0.5, -0.4, L * 0.55);
    fallen(0.1, 0.9, L * 0.45);
    if (strong) fallen(-0.2, -0.8, L * 0.6);
    for (let i = 0; i < 6; i++) k.box(0.2, 0.05, 0.07, { p: [k.rand(-1.2, 1.2), 0.04, k.rand(-0.9, 0.9)], r: [0, k.rand(0, 3), 0] }, { color: PAL.oldWood });
    k.ico(0.7, { p: [k.rand(-0.5, 0.5), 0.02, 0.1], s: [2.4, 0.3, 1.4] }, { color: PAL.snow, wear: 0.03 });
  }
  // Troian de zăpadă la bază.
  k.ico(0.6, { p: [k.rand(-0.6, 0.6), 0.02, 0.3], s: [2.2, 0.35, 0.9] }, { color: PAL.snow, wear: 0.03 });
  return k.build(`wall${level}${door ? "door" : ""}${state}`);
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

// ---------- Proiectilele turnurilor ----------

export type ShellModel = "arrow" | "heavy" | "rocket" | "ball" | "fireball" | "ice";

/** Proiectilele: toate privesc spre +z (le rotim cu lookAt spre direcția de zbor). */
export function buildShell(scene: Scene, mats: Materials, model: ShellModel): Mesh {
  const k = new ModelKit(scene, mats, 1500 + model.length);
  switch (model) {
    case "arrow":
    case "heavy": {
      const s = model === "heavy" ? 1.6 : 1;
      k.cyl(1.2 * s, 0.07 * s, 0.07 * s, 5, { r: [Math.PI / 2, 0, 0] }, { color: PAL.oldWood });
      k.cyl(0.28 * s, 0, 0.16 * s, 4, { p: [0, 0, 0.7 * s], r: [Math.PI / 2, 0, 0] }, { color: model === "heavy" ? PAL.fire : PAL.iron, mat: model === "heavy" ? "glow" : "metal" });
      for (const r of [0, Math.PI / 2]) k.box(0.22 * s, 0.02, 0.3 * s, { p: [0, 0, -0.5 * s], r: [0, 0, r] }, { color: PAL.bone });
      break;
    }
    case "rocket":
      k.cyl(0.8, 0.2, 0.2, 8, { r: [Math.PI / 2, 0, 0] }, { color: hex("#7a2620"), wear: 0.2 });
      k.cyl(0.3, 0, 0.2, 8, { p: [0, 0, 0.55], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron, mat: "metal" });
      for (const r of [0, Math.PI / 2]) k.box(0.4, 0.03, 0.2, { p: [0, 0, -0.35], r: [0, 0, r] }, { color: PAL.iron, mat: "metal" });
      k.cyl(0.3, 0.18, 0, 6, { p: [0, 0, -0.55], r: [Math.PI / 2, 0, 0] }, { color: PAL.fire, mat: "glow" });
      break;
    case "ball":
      k.sphere(0.5, 10, {}, { color: hex("#24292e"), mat: "metal", wear: 0.2 });
      break;
    case "fireball":
      k.sphere(0.55, 10, {}, { color: hex("#24292e"), mat: "metal", wear: 0.2 });
      k.sphere(0.62, 6, { s: [1, 1, 1.4] }, { color: PAL.fire, mat: "glow" });
      break;
    case "ice":
      k.cyl(0.7, 0, 0.22, 5, { p: [0, 0, 0.1], r: [Math.PI / 2, 0, 0] }, { color: mix(PAL.ice, PAL.snow, 0.3), mat: "glow" });
      k.cyl(0.3, 0.22, 0, 5, { p: [0, 0, -0.4], r: [Math.PI / 2, 0, 0] }, { color: PAL.ice, mat: "glow" });
      break;
  }
  return k.buildOne(`shell_${model}`);
}

/** Cristale de gheață în jurul unui zombie înghețat (le scalăm după mărimea zombiului). */
export function buildIceShell(scene: Scene, mats: Materials): Mesh {
  const k = new ModelKit(scene, mats, 1600);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const h = k.rand(0.6, 1.2);
    k.cyl(h, 0, k.rand(0.18, 0.3), 5, { p: [Math.cos(a) * 0.45, h * 0.35 + k.rand(0, 0.9), Math.sin(a) * 0.45], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }, { color: mix(PAL.ice, PAL.snow, k.rand(0.2, 0.6)), mat: "glow" });
  }
  return k.buildOne("iceShell");
}

// ---------- Cufărul boss-ului ----------

/** Lumina de chihlimbar (ca monedele), nu aur de fantasy. */
export const AMBER = hex("#ffb347");

/**
 * Cufărul: lemn ars legat cu fier, pe jumătate îngropat în zăpadă, cu balama de os.
 * Corpul și capacul sunt separate (capacul se rotește când se deschide, pivot în balama).
 */
export function buildChest(scene: Scene, mats: Materials): { base: Mesh[]; lid: Mesh[]; glow: Mesh } {
  const k = new ModelKit(scene, mats, 1700);
  const W = 1.3;
  const D = 0.85;
  // Corpul, înfipt strâmb în zăpadă.
  k.box(W, 0.62, D, { p: [0, 0.18, 0] }, { color: PAL.burntWood, wear: 0.3, frost: 0.4 });
  for (let i = 0; i < 4; i++) k.box(W + 0.02, 0.02, 0.02, { p: [0, -0.05 + i * 0.13, D / 2 + 0.005] }, { color: PAL.darkWood });
  for (const x of [-0.5, 0.5]) k.box(0.1, 0.64, D + 0.04, { p: [x, 0.18, 0] }, { color: PAL.iron, mat: "metal", wear: 0.35 });
  // Încuietoare de fier ruginit.
  k.box(0.22, 0.24, 0.08, { p: [0, 0.38, D / 2 + 0.04] }, { color: PAL.rust, mat: "metal", wear: 0.3 });
  // Balama de os la spate.
  for (const x of [-0.35, 0.35]) k.cyl(0.22, 0.09, 0.09, 6, { p: [x, 0.5, -D / 2 - 0.02], r: [0, 0, Math.PI / 2] }, { color: PAL.bone, wear: 0.1 });
  // Troian care acoperă jumătate din cufăr.
  k.ico(0.9, { p: [0.15, -0.1, 0.25], s: [1.3, 0.55, 1.0] }, { color: PAL.snow, wear: 0.03 });
  k.ico(0.7, { p: [-0.5, -0.05, -0.2], s: [1, 0.5, 1] }, { color: PAL.snow, wear: 0.03 });
  const base = k.build("chestBase");

  // Capacul (pivot în balama: y = 0.5, z = -D/2), cu zăpadă deasupra.
  const l = new ModelKit(scene, mats, 1701);
  l.cyl(W, D, D, 10, { p: [0, 0.02, D / 2], r: [0, 0, Math.PI / 2], s: [0.4, 1, 1] }, { color: PAL.oldWood, wear: 0.3, frost: 0.8, frostNormal: 0.4 });
  for (const x of [-0.5, 0.5]) l.cyl(0.1, D + 0.04, D + 0.04, 10, { p: [x, 0.02, D / 2], r: [0, 0, Math.PI / 2], s: [0.42, 1, 1] }, { color: PAL.iron, mat: "metal", wear: 0.35 });
  const lid = l.build("chestLid");

  // Lumina dinăuntru (se vede doar când e deschis).
  const g = new ModelKit(scene, mats, 1702);
  g.box(W - 0.15, 0.06, D - 0.15, { p: [0, 0.45, 0] }, { color: AMBER, mat: "glow" });
  const glow = g.buildOne("chestGlow");
  return { base, lid, glow };
}
