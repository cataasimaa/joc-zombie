// Efecte vizuale scurte: trasoare, flama de la gura armei, sânge (stropi + pete pe zăpadă),
// explozii, scântei, inele. Folosim „pool”-uri și instanțe: obiectele se refolosesc
// în loc să fie create și distruse mereu (mult mai rapid pe telefon).

import {
  Color3,
  type InstancedMesh,
  type Mesh,
  MeshBuilder,
  type Scene,
  type StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { type Materials, ModelKit } from "./ModelKit";
import { PAL, mix } from "./palette";
import { terrainHeight } from "./Terrain";

export type BurstKind = "blood" | "snow" | "spark" | "ice" | "wood" | "bone";

interface Particle {
  inst: InstancedMesh;
  vel: Vector3;
  life: number;
  maxLife: number;
  spin: number;
  kind: BurstKind;
}

interface Decal {
  inst: InstancedMesh;
  life: number;
  size: number;
}

interface Timed {
  mesh: Mesh;
  life: number;
  maxLife: number;
  grow: number;
  mat?: StandardMaterial;
}

const BURST_COLORS: Record<BurstKind, Color3> = {
  blood: PAL.blood,
  snow: PAL.snow,
  spark: PAL.fire,
  ice: PAL.ice,
  wood: PAL.oldWood,
  bone: PAL.bone,
};

export class Fx {
  private particleSources = new Map<BurstKind, Mesh>();
  private particles: Particle[] = [];
  private decalSource: Mesh;
  private decals: Decal[] = [];
  private decalIndex = 0;
  private tracers: Timed[] = [];
  private flashes: Timed[] = [];
  private rings: Timed[] = [];

  constructor(private scene: Scene, private mats: Materials) {
    for (const kind of Object.keys(BURST_COLORS) as BurstKind[]) {
      const k = new ModelKit(scene, mats, 1000 + kind.length);
      const glow = kind === "spark" || kind === "ice";
      k.box(1, 1, 1, {}, { color: BURST_COLORS[kind], mat: glow ? "glow" : "matte", wear: 0.15 });
      const src = k.buildOne(`p_${kind}`);
      src.isVisible = false;
      this.particleSources.set(kind, src);
    }
    const dk = new ModelKit(scene, mats, 1100);
    dk.cyl(0.02, 1, 1, 9, {}, { color: mix(PAL.blood, PAL.rust, 0.15), wear: 0.25 });
    this.decalSource = dk.buildOne("decal");
    this.decalSource.isVisible = false;
  }

  // ---------- Particule ----------

  /** Un jet de particule. `dir` = direcția principală (ex. de la trăgător spre zombie). */
  burst(kind: BurstKind, pos: Vector3, dir: Vector3 | null, count: number, speed = 4, size = 0.1): void {
    for (let i = 0; i < count; i++) {
      let p = this.particles.find((x) => x.life <= 0 && x.kind === kind);
      if (!p) {
        if (this.particles.length > 400) return;
        const inst = this.particleSources.get(kind)!.createInstance(`fx_${kind}`);
        inst.isPickable = false;
        p = { inst, vel: new Vector3(), life: 0, maxLife: 1, spin: 0, kind };
        this.particles.push(p);
      }
      const spread = new Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5);
      const v = dir ? dir.normalizeToNew().scale(0.9).add(spread.scale(0.9)) : spread.scale(2);
      p.vel.copyFrom(v.scale(speed * (0.5 + Math.random() * 0.7)));
      p.inst.position.copyFrom(pos);
      const s = size * (0.6 + Math.random() * 0.8);
      p.inst.scaling.setAll(s);
      p.inst.setEnabled(true);
      p.life = p.maxLife = 0.5 + Math.random() * 0.5;
      p.spin = (Math.random() - 0.5) * 12;
    }
  }

  /** Pată de sânge pe zăpadă. Rămâne un timp, apoi se micșorează și dispare. */
  decal(x: number, z: number, size: number): void {
    let d = this.decals[this.decalIndex];
    if (!d) {
      const inst = this.decalSource.createInstance("decal");
      inst.isPickable = false;
      d = { inst, life: 0, size: 1 };
      this.decals.push(d);
    }
    this.decalIndex = (this.decalIndex + 1) % 90;
    d.inst.position.set(x, terrainHeight(x, z) + 0.03, z);
    d.inst.rotation.y = Math.random() * Math.PI;
    d.size = size;
    d.inst.scaling.set(size * (0.7 + Math.random() * 0.6), 1, size * (0.7 + Math.random() * 0.6));
    d.inst.setEnabled(true);
    d.life = 25;
  }

  // ---------- Trasoare, flăcări, inele ----------

  tracer(from: Vector3, to: Vector3, color: Color3, width = 0.06, life = 0.06): void {
    let t = this.tracers.find((x) => x.life <= 0);
    if (!t) {
      const mesh = MeshBuilder.CreateBox("tracer", { size: 1 }, this.scene);
      mesh.isPickable = false;
      t = { mesh, life: 0, maxLife: 1, grow: 0 };
      this.tracers.push(t);
    }
    t.mesh.material = this.mats.glow(color, 1.4);
    t.mesh.position = Vector3.Center(from, to);
    t.mesh.scaling.set(width, width, Vector3.Distance(from, to));
    t.mesh.lookAt(to);
    t.mesh.setEnabled(true);
    t.life = t.maxLife = life;
  }

  /** Flacăra scurtă de la gura armei. */
  muzzle(pos: Vector3, color = PAL.fire, size = 0.35, life = 0.05): void {
    let f = this.flashes.find((x) => x.life <= 0);
    if (!f) {
      const mesh = MeshBuilder.CreateSphere("flash", { diameter: 1, segments: 4 }, this.scene);
      mesh.isPickable = false;
      f = { mesh, life: 0, maxLife: 1, grow: 0 };
      this.flashes.push(f);
    }
    f.mesh.material = this.mats.glow(color, 1.6);
    f.mesh.position.copyFrom(pos);
    f.mesh.scaling.setAll(size);
    f.grow = size;
    f.mesh.setEnabled(true);
    f.life = f.maxLife = life;
  }

  /** Inel plat care crește și se stinge (unde de șoc, vindecări, provocări). */
  ring(pos: Vector3, radius: number, color: Color3, life = 0.45): void {
    let r = this.rings.find((x) => x.life <= 0);
    if (!r) {
      const mesh = MeshBuilder.CreateTorus("ring", { diameter: 2, thickness: 0.18, tessellation: 32 }, this.scene);
      mesh.isPickable = false;
      const mat = this.mats.tint(`ringMat${this.rings.length}`, color, 1);
      mesh.material = mat;
      r = { mesh, life: 0, maxLife: 1, grow: 1, mat };
      this.rings.push(r);
    }
    r.mat!.emissiveColor = color;
    r.mesh.position.copyFrom(pos);
    r.grow = radius;
    r.life = r.maxLife = life;
    r.mesh.setEnabled(true);
    this.updateRing(r);
  }

  /** Explozie: lumină, inel, scântei și bulgări de zăpadă aruncați în sus. */
  explosion(pos: Vector3, radius: number): void {
    this.muzzle(pos.add(new Vector3(0, 0.6, 0)), PAL.fire, radius * 0.9, 0.18);
    this.ring(pos.add(new Vector3(0, 0.15, 0)), radius, PAL.fire, 0.45);
    this.burst("spark", pos.add(new Vector3(0, 0.4, 0)), null, 14, 7, 0.12);
    this.burst("snow", pos.add(new Vector3(0, 0.3, 0)), null, 18, 6, 0.22);
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 14 * dt;
      p.inst.position.addInPlace(p.vel.scale(dt));
      p.inst.rotation.x += p.spin * dt;
      p.inst.rotation.z += p.spin * dt * 0.7;
      const ground = terrainHeight(p.inst.position.x, p.inst.position.z) + 0.03;
      if (p.inst.position.y <= ground) {
        p.inst.position.y = ground;
        p.vel.setAll(0);
        // Stropii de sânge rămân o clipă pe zăpadă.
        if (p.kind !== "blood") p.life = Math.min(p.life, 0.05);
      }
      if (p.life <= 0) p.inst.setEnabled(false);
      else if (p.life < 0.2) p.inst.scaling.scaleInPlace(0.9);
    }
    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life < 3) {
        const k = Math.max(0.01, d.life / 3);
        d.inst.scaling.x *= 0.98 + 0.02 * k;
        d.inst.scaling.z *= 0.98 + 0.02 * k;
      }
      if (d.life <= 0) d.inst.setEnabled(false);
    }
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.setEnabled(false);
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.mesh.scaling.setAll(f.grow * (0.6 + 0.6 * (1 - f.life / f.maxLife)));
      if (f.life <= 0) f.mesh.setEnabled(false);
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) r.mesh.setEnabled(false);
      else this.updateRing(r);
    }
  }

  private updateRing(r: Timed): void {
    const k = 1 - r.life / r.maxLife;
    const s = r.grow * (0.2 + 0.8 * Math.sqrt(k));
    r.mesh.scaling.set(s, 1, s);
    r.mat!.alpha = (1 - k) * 0.9;
  }
}
