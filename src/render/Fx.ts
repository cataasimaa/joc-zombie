// Efecte vizuale scurte: trasoare, flăcări de la armă, sânge (picături, nor, pete pe zăpadă),
// urme de pași, săgeți de balistă, explozii, inele. Folosim „pool”-uri și instanțe: obiectele
// se refolosesc în loc să fie create și distruse mereu (mult mai rapid pe telefon).

import {
  type Color3,
  DynamicTexture,
  type InstancedMesh,
  type Mesh,
  MeshBuilder,
  type Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { type Materials, ModelKit } from "./ModelKit";
import { rng } from "./noise";
import { PAL, mix } from "./palette";
import { terrainHeight } from "./Terrain";

export type BurstKind = "blood" | "snow" | "spark" | "ice" | "wood" | "bone" | "venom";

interface Particle {
  inst: InstancedMesh;
  vel: Vector3;
  life: number;
  maxLife: number;
  spin: number;
  size: number;
  kind: BurstKind;
}

interface Decal {
  inst: InstancedMesh;
  life: number;
  maxLife: number;
  size: number;
}

interface Timed {
  mesh: Mesh;
  life: number;
  maxLife: number;
  grow: number;
  mat?: StandardMaterial;
  from?: Vector3;
  to?: Vector3;
}

const BURST_COLORS: Record<BurstKind, Color3> = {
  blood: PAL.blood,
  snow: PAL.snow,
  spark: PAL.fire,
  ice: PAL.ice,
  wood: PAL.oldWood,
  bone: PAL.bone,
  venom: mix(PAL.ice, PAL.pineLight, 0.3),
};

/** Textură desenată pe canvas: pată de sânge neregulată, cu stropi în jur. */
function splatTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const tex = new DynamicTexture("bloodSplat", size, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const r = rng(77);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(90,14,22,0.95)";
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 22;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 8 + r() * 16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(70,10,18,0.9)";
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = 30 + r() * 30;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + r() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

/** Textură: urma unui bocanc în zăpadă. */
function footprintTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture("footprint", { width: 32, height: 64 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 32, 64);
  ctx.fillStyle = "rgba(95,120,145,0.55)";
  ctx.beginPath();
  ctx.ellipse(16, 20, 10, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(16, 48, 8, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export class Fx {
  private particleSources = new Map<BurstKind, Mesh>();
  private particles: Particle[] = [];
  private decalSource: Mesh;
  private decals: Decal[] = [];
  private decalIndex = 0;
  private footSource: Mesh;
  private footprints: Decal[] = [];
  private footIndex = 0;
  private mistSource: Mesh;
  private mists: Decal[] = [];
  private tracers: Timed[] = [];
  private flashes: Timed[] = [];
  private rings: Timed[] = [];
  private bolts: Timed[] = [];
  private boltSource: Mesh;

  constructor(private scene: Scene, private mats: Materials) {
    for (const kind of Object.keys(BURST_COLORS) as BurstKind[]) {
      const k = new ModelKit(scene, mats, 1000 + kind.length);
      const glow = kind === "spark" || kind === "ice" || kind === "venom";
      if (kind === "blood" || kind === "venom" || kind === "snow") {
        k.sphere(1, 6, {}, { color: BURST_COLORS[kind], mat: glow ? "glow" : "matte", wear: 0.15, smooth: true });
      } else {
        k.box(1, 1, 1, {}, { color: BURST_COLORS[kind], mat: glow ? "glow" : "matte", wear: 0.15 });
      }
      const src = k.buildOne(`p_${kind}`);
      src.isVisible = false;
      this.particleSources.set(kind, src);
    }

    // Petele de sânge: plăci pe sol cu textura de pată (instanțe → un singur apel de desenare).
    const splat = splatTexture(scene);
    const decalMat = new StandardMaterial("decalMat", scene);
    decalMat.diffuseTexture = splat;
    decalMat.useAlphaFromDiffuseTexture = true;
    decalMat.specularColor.set(0, 0, 0);
    decalMat.zOffset = -2;
    decalMat.backFaceCulling = false;
    this.decalSource = MeshBuilder.CreateGround("decal", { width: 1, height: 1 }, scene);
    this.decalSource.material = decalMat;
    this.decalSource.isVisible = false;

    // „Norul” de sânge la impact: aceeași textură, pe o placă orientată spre cameră.
    const mistMat = new StandardMaterial("mistMat", scene);
    mistMat.diffuseTexture = splat;
    mistMat.useAlphaFromDiffuseTexture = true;
    mistMat.emissiveColor = mix(PAL.blood, PAL.fire, 0.1).scale(0.6);
    mistMat.disableLighting = true;
    mistMat.backFaceCulling = false;
    this.mistSource = MeshBuilder.CreatePlane("mist", { size: 1 }, scene);
    this.mistSource.billboardMode = 7;
    this.mistSource.material = mistMat;
    this.mistSource.isVisible = false;

    const footMat = new StandardMaterial("footMat", scene);
    footMat.diffuseTexture = footprintTexture(scene);
    footMat.useAlphaFromDiffuseTexture = true;
    footMat.specularColor.set(0, 0, 0);
    footMat.zOffset = -1;
    this.footSource = MeshBuilder.CreateGround("foot", { width: 0.22, height: 0.4 }, scene);
    this.footSource.material = footMat;
    this.footSource.isVisible = false;

    // Săgeata de balistă: tijă de lemn cu vârf de fier.
    const bk = new ModelKit(scene, mats, 1200);
    bk.cyl(1.1, 0.05, 0.05, 5, { r: [Math.PI / 2, 0, 0] }, { color: PAL.oldWood });
    bk.cyl(0.22, 0, 0.12, 5, { p: [0, 0, 0.62], r: [Math.PI / 2, 0, 0] }, { color: PAL.iron });
    this.boltSource = bk.buildOne("bolt");
    this.boltSource.isVisible = false;
  }

  // ---------- Particule ----------

  /** Un jet de particule. `dir` = direcția principală (ex. de la trăgător spre zombie). */
  burst(kind: BurstKind, pos: Vector3, dir: Vector3 | null, count: number, speed = 4, size = 0.1): void {
    for (let i = 0; i < count; i++) {
      let p = this.particles.find((x) => x.life <= 0 && x.kind === kind);
      if (!p) {
        if (this.particles.length > 500) return;
        const inst = this.particleSources.get(kind)!.createInstance(`fx_${kind}`);
        inst.isPickable = false;
        p = { inst, vel: new Vector3(), life: 0, maxLife: 1, spin: 0, size: 0, kind };
        this.particles.push(p);
      }
      const spread = new Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5);
      const v = dir ? dir.normalizeToNew().scale(0.9).add(spread.scale(0.9)) : spread.scale(2);
      p.vel.copyFrom(v.scale(speed * (0.5 + Math.random() * 0.7)));
      p.inst.position.copyFrom(pos);
      p.size = size * (0.5 + Math.random() * 0.9);
      p.inst.scaling.setAll(p.size);
      p.inst.setEnabled(true);
      p.life = p.maxLife = 0.5 + Math.random() * 0.5;
      p.spin = (Math.random() - 0.5) * 12;
    }
  }

  /** Lovitură cu sânge: picături în direcția glonțului + un nor scurt + uneori o pată pe zăpadă. */
  blood(pos: Vector3, dir: Vector3 | null, amount = 1): void {
    this.burst("blood", pos, dir, Math.round(7 * amount), 4.5, 0.07);
    this.mist(pos, 0.5 + amount * 0.3);
  }

  private mist(pos: Vector3, size: number): void {
    let m = this.mists.find((x) => x.life <= 0);
    if (!m) {
      if (this.mists.length > 30) return;
      const inst = this.mistSource.createInstance("mist");
      inst.isPickable = false;
      m = { inst, life: 0, maxLife: 0.25, size: 1 };
      this.mists.push(m);
    }
    m.inst.position.copyFrom(pos);
    m.inst.rotation.z = Math.random() * Math.PI * 2;
    m.size = size;
    m.life = m.maxLife = 0.22;
    m.inst.setEnabled(true);
  }

  /** Pată de sânge pe zăpadă. Rămâne un timp, apoi se micșorează și dispare. */
  decal(x: number, z: number, size: number): void {
    let d = this.decals[this.decalIndex];
    if (!d) {
      const inst = this.decalSource.createInstance("decal");
      inst.isPickable = false;
      d = { inst, life: 0, maxLife: 30, size: 1 };
      this.decals.push(d);
    }
    this.decalIndex = (this.decalIndex + 1) % 100;
    d.inst.position.set(x, terrainHeight(x, z) + 0.04, z);
    d.inst.rotation.y = Math.random() * Math.PI * 2;
    d.size = size * (0.8 + Math.random() * 0.5);
    d.inst.scaling.set(d.size, 1, d.size);
    d.inst.setEnabled(true);
    d.life = d.maxLife = 30;
  }

  /** Urmă de bocanc în zăpadă (dispare încet). */
  footprint(x: number, z: number, facing: number): void {
    let d = this.footprints[this.footIndex];
    if (!d) {
      const inst = this.footSource.createInstance("foot");
      inst.isPickable = false;
      d = { inst, life: 0, maxLife: 20, size: 1 };
      this.footprints.push(d);
    }
    this.footIndex = (this.footIndex + 1) % 80;
    d.inst.position.set(x, terrainHeight(x, z) + 0.03, z);
    d.inst.rotation.y = facing;
    d.inst.scaling.setAll(1);
    d.inst.setEnabled(true);
    d.life = d.maxLife = 20;
  }

  // ---------- Trasoare, săgeți, flăcări, inele ----------

  tracer(from: Vector3, to: Vector3, color: Color3, width = 0.05, life = 0.05): void {
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

  /** Săgeată de balistă care zboară de la turn la țintă. */
  bolt(from: Vector3, to: Vector3): void {
    let b = this.bolts.find((x) => x.life <= 0);
    if (!b) {
      const inst = this.boltSource.createInstance("bolt") as unknown as Mesh;
      inst.isPickable = false;
      b = { mesh: inst, life: 0, maxLife: 1, grow: 0 };
      this.bolts.push(b);
    }
    b.from = from.clone();
    b.to = to.clone();
    b.life = b.maxLife = Math.max(0.08, Vector3.Distance(from, to) / 45);
    b.mesh.position.copyFrom(from);
    b.mesh.lookAt(to);
    b.mesh.setEnabled(true);
  }

  /** Flacăra scurtă de la gura armei. */
  muzzle(pos: Vector3, color = PAL.fire, size = 0.35, life = 0.05): void {
    let f = this.flashes.find((x) => x.life <= 0);
    if (!f) {
      const mesh = MeshBuilder.CreateSphere("flash", { diameter: 1, segments: 6 }, this.scene);
      mesh.isPickable = false;
      f = { mesh, life: 0, maxLife: 1, grow: 0 };
      this.flashes.push(f);
    }
    f.mesh.material = this.mats.glow(color, 2);
    f.mesh.position.copyFrom(pos);
    f.mesh.scaling.setAll(size);
    f.grow = size;
    f.mesh.setEnabled(true);
    f.life = f.maxLife = life;
  }

  /** Inel plat care crește și se stinge (unde de șoc, vindecări, nivel nou). */
  ring(pos: Vector3, radius: number, color: Color3, life = 0.45): void {
    let r = this.rings.find((x) => x.life <= 0);
    if (!r) {
      const mesh = MeshBuilder.CreateTorus("ring", { diameter: 2, thickness: 0.14, tessellation: 40 }, this.scene);
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
    this.burst("spark", pos.add(new Vector3(0, 0.4, 0)), null, 16, 7, 0.1);
    this.burst("snow", pos.add(new Vector3(0, 0.3, 0)), null, 20, 6, 0.2);
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 14 * dt;
      p.inst.position.addInPlace(p.vel.scale(dt));
      p.inst.rotation.x += p.spin * dt;
      p.inst.rotation.z += p.spin * dt * 0.7;
      const ground = terrainHeight(p.inst.position.x, p.inst.position.z) + 0.02;
      if (p.inst.position.y <= ground) {
        p.inst.position.y = ground;
        p.vel.setAll(0);
        // Picăturile de sânge se întind pe zăpadă și rămân o clipă; restul dispare.
        if (p.kind === "blood") p.inst.scaling.set(p.size * 1.6, p.size * 0.2, p.size * 1.6);
        else p.life = Math.min(p.life, 0.05);
      }
      if (p.life <= 0) p.inst.setEnabled(false);
      else if (p.life < 0.15 && p.kind !== "blood") p.inst.scaling.scaleInPlace(0.85);
    }
    const fade = (list: Decal[], shrinkFrom: number) => {
      for (const d of list) {
        if (d.life <= 0) continue;
        d.life -= dt;
        if (d.life < shrinkFrom) {
          const k = Math.max(0.01, d.life / shrinkFrom);
          d.inst.scaling.x = d.size * k;
          d.inst.scaling.z = d.size * k;
        }
        if (d.life <= 0) d.inst.setEnabled(false);
      }
    };
    fade(this.decals, 4);
    fade(this.footprints, 6);
    for (const m of this.mists) {
      if (m.life <= 0) continue;
      m.life -= dt;
      const k = 1 - m.life / m.maxLife;
      m.inst.scaling.setAll(m.size * (0.4 + k * 0.9));
      if (m.life <= 0) m.inst.setEnabled(false);
    }
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const k = 1 - Math.max(0, b.life) / b.maxLife;
      Vector3.LerpToRef(b.from!, b.to!, k, b.mesh.position);
      if (b.life <= 0) b.mesh.setEnabled(false);
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
