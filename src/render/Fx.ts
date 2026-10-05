// Efecte vizuale scurte: trasoare de gloanțe, inele care se extind (explozii, vindecări, nivel nou).
// Folosim „pool”-uri: obiectele se refolosesc în loc să fie create și distruse mereu (mai rapid pe telefon).

import { Color3, type Mesh, MeshBuilder, type Scene, type StandardMaterial, Vector3 } from "@babylonjs/core";
import type { Vec2 } from "../core";
import { makeMaterial } from "./World";

interface Tracer {
  mesh: Mesh;
  life: number;
}

interface Ring {
  mesh: Mesh;
  mat: StandardMaterial;
  life: number;
  maxLife: number;
  radius: number;
}

export const FX_COLORS = {
  heroShot: new Color3(1, 0.9, 0.4),
  crit: new Color3(1, 0.3, 0.2),
  towerShot: new Color3(1, 0.5, 0.2),
  explosion: new Color3(1, 0.55, 0.1),
  heal: new Color3(0.3, 1, 0.45),
  taunt: new Color3(1, 0.2, 0.2),
  buff: new Color3(1, 0.9, 0.3),
  holy: new Color3(1, 0.95, 0.6),
  death: new Color3(0.4, 0.5, 0.35),
  wood: new Color3(0.5, 0.32, 0.15),
  level: new Color3(1, 0.8, 0.2),
};

export class Fx {
  private tracers: Tracer[] = [];
  private rings: Ring[] = [];
  private tracerMats = new Map<Color3, StandardMaterial>();

  constructor(private scene: Scene) {}

  tracer(from: Vec2, to: Vec2, color: Color3, fromY = 1.1, width = 0.08, life = 0.07): void {
    let t = this.tracers.find((x) => x.life <= 0);
    if (!t) {
      const mesh = MeshBuilder.CreateBox("tracer", { size: 1 }, this.scene);
      mesh.isPickable = false;
      t = { mesh, life: 0 };
      this.tracers.push(t);
    }
    let mat = this.tracerMats.get(color);
    if (!mat) {
      mat = makeMaterial(this.scene, "tracerMat", color, 1);
      mat.disableLighting = true;
      this.tracerMats.set(color, mat);
    }
    const a = new Vector3(from.x, fromY, from.z);
    const b = new Vector3(to.x, 1, to.z);
    t.mesh.material = mat;
    t.mesh.position = Vector3.Center(a, b);
    t.mesh.scaling.set(width, width, Vector3.Distance(a, b));
    t.mesh.lookAt(b);
    t.mesh.setEnabled(true);
    t.life = life;
  }

  /** Un inel plat care crește până la `radius` și dispare. */
  ring(pos: Vec2, radius: number, color: Color3, life = 0.45, y = 0.1): void {
    let r = this.rings.find((x) => x.life <= 0);
    if (!r) {
      const mesh = MeshBuilder.CreateTorus("ring", { diameter: 2, thickness: 0.25, tessellation: 32 }, this.scene);
      mesh.isPickable = false;
      const mat = makeMaterial(this.scene, "ringMat", Color3.White(), 1);
      mat.disableLighting = true;
      mesh.material = mat;
      r = { mesh, mat, life: 0, maxLife: 1, radius: 1 };
      this.rings.push(r);
    }
    r.mat.emissiveColor = color;
    r.mat.diffuseColor = color;
    r.mesh.position.set(pos.x, y, pos.z);
    r.life = r.maxLife = life;
    r.radius = radius;
    r.mesh.setEnabled(true);
    this.updateRing(r);
  }

  /** O explozie = două inele și un disc care pâlpâie. */
  explosion(pos: Vec2, radius: number, color = FX_COLORS.explosion): void {
    this.ring(pos, radius, color, 0.4);
    this.ring(pos, radius * 0.6, color, 0.3, 0.6);
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.setEnabled(false);
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) r.mesh.setEnabled(false);
      else this.updateRing(r);
    }
  }

  private updateRing(r: Ring): void {
    const k = 1 - r.life / r.maxLife; // 0 → 1
    const s = r.radius * (0.25 + 0.75 * Math.sqrt(k));
    r.mesh.scaling.set(s, 1, s);
    r.mat.alpha = 1 - k;
  }
}
