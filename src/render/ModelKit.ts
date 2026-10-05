// Trusa de modele: construim tot din primitive Babylon (cutii, cilindri, sfere, conuri).
//
// Cum funcționează:
//  1. Adaugi piese (`kit.box(...)`, `kit.cyl(...)`), fiecare cu culoarea și materialul ei.
//  2. Fiecare piesă e „flat shaded” (fețe plate = aspect low-poly) și primește culoare pe vârfuri,
//     cu mici variații aleatoare (lemn uzat, piatră pătată) și zăpadă pe fețele care privesc în sus.
//  3. `kit.build()` unește toate piesele cu același material într-un singur mesh.
//     Un model = 1–3 mesh-uri (mat, metal, strălucitor) → puține „draw calls” → rapid pe telefon.

import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  type Scene,
  StandardMaterial,
  Texture,
  VertexBuffer,
} from "@babylonjs/core";
import { fbm, noise2, rng } from "./noise";
import { PAL, mix } from "./palette";

export type MatKind = "matte" | "metal" | "glow";

export interface PartOptions {
  color: Color3;
  mat?: MatKind;
  /** Cât de „pătată”/uzată e culoarea (0 = uniformă). */
  wear?: number;
  /** 0..1: cât de albă devine fața care privește în sus (zăpadă). */
  frost?: number;
  /** Zăpada se pune doar pe fețele mai sus de această înălțime (în coordonatele modelului). */
  frostAbove?: number;
  /** Cât de „orizontală” trebuie să fie fața ca să țină zăpadă (componenta y a normalei). */
  frostNormal?: number;
  /** Umbrire netedă (pentru forme organice: corpuri, crengi, zăpadă). Implicit: fețe plate. */
  smooth?: boolean;
}

export interface Transform {
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number];
}

/**
 * Generează o textură de „granulație” (zgomot + fibre fine) și harta ei de relief (normal map).
 * O singură textură mică, refolosită pe tot: dă senzația de lemn, piatră, pânză, fără să arate de plastic.
 */
function detailTextures(scene: Scene, name: string, size: number, opts: { fibers: number; contrast: number; sparkle: number }) {
  const albedo = new DynamicTexture(`${name}Albedo`, size, scene, true);
  const bump = new DynamicTexture(`${name}Bump`, size, scene, true);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Zgomot „tileable”: îl calculăm pe un tor ca să nu se vadă cusăturile când se repetă.
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const nx = Math.cos(u) * 2 + 10;
      const ny = Math.sin(u) * 2 + 10;
      const nz = Math.cos(v) * 2 + 10;
      const nw = Math.sin(v) * 2 + 10;
      const n = fbm(nx * 2 + nz, ny * 2 + nw, 4);
      const fiber = noise2(nx * 1.5, (nz + nw) * 14) * opts.fibers;
      height[y * size + x] = n + fiber;
    }
  }
  const actx = albedo.getContext() as CanvasRenderingContext2D;
  const bctx = bump.getContext() as CanvasRenderingContext2D;
  const aImg = actx.createImageData(size, size);
  const bImg = bctx.createImageData(size, size);
  const r = rng(size * 7 + opts.fibers * 100);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const h = height[i];
      let a = 0.86 + (h - 0.5) * opts.contrast;
      if (r() < opts.sparkle) a = 1.15; // sclipiri (zăpadă)
      const c = Math.max(0, Math.min(255, a * 220));
      aImg.data.set([c, c, c, 255], i * 4);
      // Normal map din diferențele de înălțime cu vecinii.
      const hx = height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1 + size) % size)];
      const hy = height[((y + 1) % size) * size + x] - height[((y - 1 + size) % size) * size + x];
      const strength = 3;
      let nxv = -hx * strength;
      let nyv = -hy * strength;
      const len = Math.hypot(nxv, nyv, 1);
      nxv /= len;
      nyv /= len;
      bImg.data.set([(nxv * 0.5 + 0.5) * 255, (nyv * 0.5 + 0.5) * 255, (1 / len) * 255, 255], i * 4);
    }
  }
  actx.putImageData(aImg, 0, 0);
  bctx.putImageData(bImg, 0, 0);
  albedo.update();
  bump.update();
  for (const t of [albedo, bump]) {
    t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.anisotropicFilteringLevel = 4;
  }
  return { albedo, bump };
}

/** Materialele comune ale jocului (refolosite de toate modelele). */
export class Materials {
  readonly matte: PBRMaterial;
  readonly metal: PBRMaterial;
  readonly terrain: PBRMaterial;
  private glows = new Map<string, StandardMaterial>();

  constructor(private scene: Scene) {
    const detail = detailTextures(scene, "grain", 256, { fibers: 0.35, contrast: 0.55, sparkle: 0 });
    this.matte = this.pbr("matte", 0, 0.9);
    this.matte.albedoTexture = detail.albedo;
    this.matte.bumpTexture = detail.bump;
    this.matte.bumpTexture.level = 0.7;
    this.metal = this.pbr("metal", 0.5, 0.45);
    this.metal.albedoTexture = detail.albedo;
    this.metal.bumpTexture = detail.bump;
    this.metal.bumpTexture.level = 0.4;

    // Zăpada: granulație fină, mici sclipiri și relief moale, repetate des pe teren.
    const snow = detailTextures(scene, "snow", 256, { fibers: 0, contrast: 0.25, sparkle: 0.004 });
    for (const t of [snow.albedo, snow.bump]) {
      (t as Texture).uScale = 36;
      (t as Texture).vScale = 36;
    }
    this.terrain = this.pbr("terrain", 0, 0.82);
    this.terrain.albedoTexture = snow.albedo;
    this.terrain.bumpTexture = snow.bump;
    this.terrain.bumpTexture.level = 0.8;
  }

  private pbr(name: string, metallic: number, roughness: number): PBRMaterial {
    const m = new PBRMaterial(name, this.scene);
    m.albedoColor = Color3.White();
    m.metallic = metallic;
    m.roughness = roughness;
    // Atenuare „clasică” a luminii (cu rază), mai ușor de controlat decât cea fizică.
    m.usePhysicalLightFalloff = false;
    m.maxSimultaneousLights = 6;
    m.environmentIntensity = 0;
    return m;
  }

  /** Material strălucitor (foc, ferestre, ochi): nu depinde de lumini, „înflorește” (bloom) noaptea. */
  glow(color: Color3, intensity = 1): StandardMaterial {
    const key = color.toHexString() + intensity;
    let m = this.glows.get(key);
    if (!m) {
      m = new StandardMaterial(`glow${key}`, this.scene);
      m.disableLighting = true;
      // Peste 1 = mai luminos decât albul → declanșează bloom-ul din post-procesare.
      m.emissiveColor = color.scale(1.6 * intensity);
      m.diffuseColor = Color3.Black();
      this.glows.set(key, m);
    }
    return m;
  }

  /** Material transparent colorat (fantome de construcție, zone). */
  tint(name: string, color: Color3, alpha: number): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.disableLighting = true;
    m.emissiveColor = color;
    m.diffuseColor = Color3.Black();
    m.alpha = alpha;
    return m;
  }
}

export class ModelKit {
  private parts: { mesh: Mesh; mat: MatKind; glowColor?: Color3 }[] = [];
  private random: () => number;

  constructor(private scene: Scene, private mats: Materials, seed = 1) {
    this.random = rng(seed);
  }

  /** Număr aleator determinist (aceeași formă la fiecare pornire). */
  rand(min = 0, max = 1): number {
    return min + this.random() * (max - min);
  }

  box(w: number, h: number, d: number, t: Transform, o: PartOptions): Mesh {
    return this.add(MeshBuilder.CreateBox("p", { width: w, height: h, depth: d }, this.scene), t, o);
  }

  /** Cilindru (sau con, dacă diametrele diferă). `subdiv` = inele pe înălțime (pentru zăpadă doar sus). */
  cyl(h: number, dTop: number, dBottom: number, tess: number, t: Transform, o: PartOptions, subdiv = 1): Mesh {
    return this.add(
      MeshBuilder.CreateCylinder("p", { height: h, diameterTop: dTop, diameterBottom: dBottom, tessellation: tess, subdivisions: subdiv }, this.scene),
      t,
      o,
    );
  }

  sphere(d: number, segments: number, t: Transform, o: PartOptions): Mesh {
    return this.add(MeshBuilder.CreateSphere("p", { diameter: d, segments }, this.scene), t, o);
  }

  capsule(h: number, r: number, t: Transform, o: PartOptions, tess = 8): Mesh {
    return this.add(MeshBuilder.CreateCapsule("p", { height: h, radius: r, tessellation: tess, subdivisions: 2, capSubdivisions: 3 }, this.scene), t, o);
  }

  ico(r: number, t: Transform, o: PartOptions): Mesh {
    return this.add(MeshBuilder.CreateIcoSphere("p", { radius: r, subdivisions: 1, flat: true }, this.scene), t, o);
  }

  /** Adaugă o piesă: aplică transformarea, o face low-poly și o colorează. */
  add(mesh: Mesh, t: Transform, o: PartOptions): Mesh {
    if (t.s) mesh.scaling.set(...t.s);
    if (t.r) mesh.rotation.set(...t.r);
    if (t.p) mesh.position.set(...t.p);
    mesh.bakeCurrentTransformIntoVertices();
    if (!o.smooth) mesh.convertToFlatShadedMesh();
    this.paint(mesh, o);
    const mat = o.mat ?? "matte";
    this.parts.push({ mesh, mat, glowColor: mat === "glow" ? o.color : undefined });
    return mesh;
  }

  private paint(mesh: Mesh, o: PartOptions): void {
    const pos = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const nrm = mesh.getVerticesData(VertexBuffer.NormalKind)!;
    const idx = mesh.getIndices()!;
    const colors = new Float32Array((pos.length / 3) * 4);
    const wear = o.mat === "glow" ? 0 : (o.wear ?? 0.1);
    const frost = o.frost ?? 0;
    const frostAbove = o.frostAbove ?? -Infinity;
    const frostNormal = o.frostNormal ?? 0.45;

    const shade = (ny: number, y: number, jitter: number): Color3 => {
      let col = o.color.scale(1 + (jitter - 0.5) * 2 * wear);
      if (frost > 0 && ny > frostNormal && y > frostAbove) {
        col = mix(col, PAL.snow, frost * (0.8 + this.random() * 0.2));
      }
      // Fețele care privesc în jos sunt mai întunecate (umbră „pictată”).
      if (ny < -0.5 && o.mat !== "glow") col = col.scale(0.7);
      return col;
    };
    const set = (v: number, col: Color3) => {
      colors[v * 4] = col.r;
      colors[v * 4 + 1] = col.g;
      colors[v * 4 + 2] = col.b;
      colors[v * 4 + 3] = 1;
    };

    if (o.smooth) {
      // Umbrire netedă: culoare per vârf, cu variații moi.
      for (let v = 0; v < pos.length / 3; v++) set(v, shade(nrm[v * 3 + 1], pos[v * 3 + 1], this.random()));
    } else {
      // Fețe plate: fiecare față primește o nuanță puțin diferită → aspect de material uzat.
      for (let i = 0; i < idx.length; i += 3) {
        const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
        const ny = (nrm[a * 3 + 1] + nrm[b * 3 + 1] + nrm[c * 3 + 1]) / 3;
        const cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3;
        const col = shade(ny, cy, this.random());
        for (const v of [a, b, c]) set(v, col);
      }
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  }

  /**
   * Unește piesele: un mesh per material (mat / metal / fiecare culoare strălucitoare).
   * Primul mesh returnat e cel principal (mat).
   */
  build(name: string): Mesh[] {
    const groups = new Map<string, Mesh[]>();
    for (const p of this.parts) {
      const key = p.mat === "glow" ? `glow${p.glowColor!.toHexString()}` : p.mat;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p.mesh);
    }
    const out: Mesh[] = [];
    for (const key of ["matte", "metal", ...[...groups.keys()].filter((k) => k.startsWith("glow"))]) {
      const list = groups.get(key);
      if (!list) continue;
      const merged = list.length === 1 ? list[0] : Mesh.MergeMeshes(list, true, true)!;
      merged.name = `${name}_${key}`;
      merged.isPickable = false;
      if (key === "matte") merged.material = this.mats.matte;
      else if (key === "metal") merged.material = this.mats.metal;
      else {
        const part = this.parts.find((p) => p.mat === "glow" && `glow${p.glowColor!.toHexString()}` === key)!;
        merged.material = this.mats.glow(part.glowColor!);
      }
      out.push(merged);
    }
    this.parts = [];
    return out;
  }

  /** Ca build(), dar garantează un singur mesh (pentru piese animate sau instanțiate). */
  buildOne(name: string): Mesh {
    const meshes = this.build(name);
    if (meshes.length === 1) return meshes[0];
    // Dacă are mai multe materiale, le ținem ca un mesh principal cu „copii”.
    const [main, ...rest] = meshes;
    for (const m of rest) m.parent = main;
    return main;
  }
}
