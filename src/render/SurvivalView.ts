// Randarea lucrurilor din modul Supraviețuire (și a cufărului boss-ului):
// focuri de tabără (flăcări după cât lemn mai au, carne pe frigare, lumină caldă),
// ferme, animale (mers pe patru picioare), obiecte pe jos și cufărul care se deschide.
// Ca restul randării, doar CITEȘTE starea.

import {
  type InstancedMesh,
  type Mesh,
  PointLight,
  type Scene,
  type ShadowGenerator,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { type AnimalKind, CONFIG, type EntityId, type GameState } from "../core";
import type { Fx } from "./Fx";
import type { Materials } from "./ModelKit";
import { AMBER, buildChest, buildFlame } from "./models/structures";
import { buildOre } from "./models/gathering";
import { type AnimalModel, buildAnimal, buildCampfire, buildDrop, buildEmbers, buildFarm } from "./models/survival";
import { PAL } from "./palette";
import { terrainHeight } from "./Terrain";
import { Prefab } from "./World";

interface Disposable {
  dispose(): void;
}

interface FireView extends Disposable {
  root: TransformNode;
  flames: TransformNode[];
  embers: InstancedMesh;
  meat: TransformNode;
  light: PointLight;
}

interface AnimalView extends Disposable {
  root: TransformNode;
  legs: TransformNode[];
  last: { x: number; z: number };
  walk: number;
  kind: AnimalKind;
}

interface ChestView extends Disposable {
  root: TransformNode;
  lid: TransformNode;
  glow: InstancedMesh;
  light: PointLight;
  open: number;
}

export class SurvivalView {
  private campfire: Prefab;
  private embers: Prefab;
  private flame: Prefab;
  private meat: Prefab;
  private farms: Record<"chicken" | "pig", Prefab>;
  private animals = {} as Record<AnimalKind, { model: AnimalModel; body: Prefab; leg: Prefab }>;
  private drops: Record<"ammo" | "rawMeat" | "cookedMeat" | "fish", Prefab>;
  private ores: Record<"silver" | "gold", Prefab>;
  private oreViews = new Map<EntityId, TransformNode>();
  private chestBase: Prefab;
  private chestLid: Prefab;
  private chestGlow: Prefab;

  private fireViews = new Map<EntityId, FireView>();
  private farmViews = new Map<EntityId, TransformNode>();
  private animalViews = new Map<EntityId, AnimalView>();
  private dropViews = new Map<EntityId, TransformNode>();
  private chestViews = new Map<EntityId, ChestView>();
  private time = 0;

  constructor(private scene: Scene, mats: Materials, private fx: Fx, shadows: ShadowGenerator) {
    const cast = (p: Prefab) => {
      for (const s of p.sources) shadows.addShadowCaster(s);
      return p;
    };
    this.campfire = cast(new Prefab(buildCampfire(scene, mats)));
    this.embers = new Prefab([buildEmbers(scene, mats)]);
    this.flame = new Prefab([buildFlame(scene, mats)]);
    this.farms = { chicken: cast(new Prefab(buildFarm(scene, mats, "chicken"))), pig: cast(new Prefab(buildFarm(scene, mats, "pig"))) };
    for (const kind of ["deer", "bear", "chicken", "pig"] as AnimalKind[]) {
      const model = buildAnimal(scene, mats, kind);
      this.animals[kind] = { model, body: cast(new Prefab(model.body)), leg: cast(new Prefab([model.leg])) };
    }
    this.drops = {
      ammo: new Prefab(buildDrop(scene, mats, "ammo")),
      rawMeat: new Prefab(buildDrop(scene, mats, "rawMeat")),
      cookedMeat: new Prefab(buildDrop(scene, mats, "cookedMeat")),
      fish: new Prefab(buildDrop(scene, mats, "fish")),
    };
    this.ores = { silver: cast(new Prefab(buildOre(scene, mats, "silver"))), gold: cast(new Prefab(buildOre(scene, mats, "gold"))) };
    this.meat = this.drops.rawMeat;
    const chest = buildChest(scene, mats);
    this.chestBase = cast(new Prefab(chest.base));
    this.chestLid = cast(new Prefab(chest.lid));
    this.chestGlow = new Prefab([chest.glow]);
  }

  private at(x: number, z: number, y = 0): Vector3 {
    return new Vector3(x, terrainHeight(x, z) + y, z);
  }

  sync(state: GameState, dt: number): void {
    this.time += dt;
    this.syncFires(state);
    this.syncFarms(state);
    this.syncAnimals(state, dt);
    this.syncDrops(state);
    this.syncOres(state);
    this.syncChests(state, dt);
  }

  // ---------- Focuri ----------

  private syncFires(state: GameState): void {
    sync(this.fireViews, state.campfires, () => {
      const root = new TransformNode("campfire", this.scene);
      this.campfire.instance("campfireMesh", root);
      const [embers] = this.embers.instance("embers", root);
      const flames: TransformNode[] = [];
      for (let i = 0; i < 3; i++) {
        const n = new TransformNode("cf", this.scene);
        n.parent = root;
        n.position.set((i - 1) * 0.14, 0.1, (i % 2) * 0.12);
        this.flame.instance("cfFlame", n);
        flames.push(n);
      }
      const meat = new TransformNode("spitMeat", this.scene);
      meat.parent = root;
      meat.position.set(0, 0.88, 0);
      meat.scaling.setAll(0.55);
      this.meat.instance("spitMeatMesh", meat);
      const light = new PointLight("campfireLight", new Vector3(0, 1.2, 0), this.scene);
      light.parent = root;
      light.diffuse = PAL.fire;
      light.specular.set(0, 0, 0);
      light.range = 12;
      return { root, flames, embers, meat, light, dispose: () => { light.dispose(); root.dispose(); } };
    }, (v, f) => {
      v.root.position.copyFrom(this.at(f.pos.x, f.pos.z));
      const lit = f.fuel > 0;
      // Flăcările scad pe măsură ce se termină lemnul (sub 25% pâlpâie slab).
      const k = lit ? 0.45 + 0.75 * Math.min(1, f.fuel / CONFIG.survival.campfireFuel) : 0;
      v.flames.forEach((n, i) => {
        n.setEnabled(lit);
        n.scaling.set(k * (1 + Math.sin(this.time * 9 + i) * 0.12), k * (1.1 + Math.sin(this.time * 11 + i * 2) * 0.3), k);
      });
      v.embers.setEnabled(lit);
      const flicker = 0.85 + Math.sin(this.time * 13 + f.id) * 0.08 + Math.sin(this.time * 7.3) * 0.07;
      v.light.intensity = lit ? (1.2 + k * 1.6) * flicker : 0;
      v.meat.setEnabled(f.cooking.length > 0);
      v.meat.rotation.x = this.time * 2;
      if (!lit && Math.random() < 0.05) this.fx.burst("smoke", this.at(f.pos.x, f.pos.z, 0.4), null, 1, 0.4, 0.25);
    });
  }

  private syncFarms(state: GameState): void {
    sync(this.farmViews, state.farms, (f) => {
      const root = new TransformNode("farm", this.scene);
      // Țarcul e mic (încape în baza ta, între ziduri).
      root.scaling.setAll(0.65);
      this.farms[f.kind].instance("farmMesh", root);
      return root;
    }, (root, f) => {
      root.position.copyFrom(this.at(f.pos.x, f.pos.z));
    });
  }

  // ---------- Animale ----------

  private syncAnimals(state: GameState, dt: number): void {
    sync(this.animalViews, state.animals, (a) => {
      const def = this.animals[a.kind];
      const root = new TransformNode(`animal_${a.kind}`, this.scene);
      def.body.instance("animalBody", root);
      const legs = def.model.legPos.map(([x, y, z]) => {
        const n = new TransformNode("animalLeg", this.scene);
        n.parent = root;
        n.position.set(x, y, z);
        def.leg.instance("animalLegMesh", n);
        return n;
      });
      return { root, legs, last: { ...a.pos }, walk: a.id, kind: a.kind, dispose: () => root.dispose() };
    }, (v, a) => {
      const moved = Math.hypot(a.pos.x - v.last.x, a.pos.z - v.last.z);
      v.last = { ...a.pos };
      const speed = moved / Math.max(dt, 0.001);
      v.walk += speed * dt * this.animals[a.kind].model.stride * 2.2;
      const amp = Math.min(1, speed / 1.5) * 0.6;
      v.legs.forEach((l, i) => {
        l.rotation.x = Math.sin(v.walk + (i === 0 || i === 3 ? 0 : Math.PI)) * amp;
      });
      v.root.position.copyFrom(this.at(a.pos.x, a.pos.z, Math.abs(Math.sin(v.walk)) * amp * 0.08));
      let diff = a.facing - v.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      v.root.rotation.y += diff * Math.min(1, dt * 8);
    });
  }

  // ---------- Obiecte pe jos ----------

  private syncDrops(state: GameState): void {
    sync(this.dropViews, state.drops, (d) => {
      const root = new TransformNode("drop", this.scene);
      const kind = d.kind === "ammo" || d.kind === "rawMeat" || d.kind === "cookedMeat" ? d.kind : "fish";
      this.drops[kind].instance("dropMesh", root);
      return root;
    }, (root, d) => {
      root.position.copyFrom(this.at(d.pos.x, d.pos.z, 0.1 + Math.sin(this.time * 3 + d.id) * 0.06));
      root.rotation.y = this.time * 1.5 + d.id;
      // În ultimele 5 secunde clipește.
      const left = CONFIG.dropLifetime - d.age;
      root.setEnabled(left > 5 || Math.sin(this.time * 14) > 0);
    });
  }

  // ---------- Zăcăminte de argint / aur ----------

  private syncOres(state: GameState): void {
    sync(this.oreViews, state.ores, (o) => {
      const root = new TransformNode("ore", this.scene);
      this.ores[o.kind].instance("oreMesh", root);
      root.rotation.y = o.id * 1.3;
      return root;
    }, (root, o) => {
      // Se micșorează pe măsură ce îl spargi.
      const k = 0.55 + 0.45 * (o.hits / CONFIG.gather.ore[o.kind].hits);
      root.scaling.setAll(k);
      root.position.copyFrom(this.at(o.pos.x, o.pos.z, -0.05));
    });
  }

  // ---------- Cufărul boss-ului ----------

  private syncChests(state: GameState, dt: number): void {
    sync(this.chestViews, state.chests, () => {
      const root = new TransformNode("chest", this.scene);
      this.chestBase.instance("chestBase", root);
      const lid = new TransformNode("chestLid", this.scene);
      lid.parent = root;
      lid.position.set(0, 0.5, -0.425);
      this.chestLid.instance("chestLidMesh", lid);
      const [glow] = this.chestGlow.instance("chestGlow", root);
      const light = new PointLight("chestLight", new Vector3(0, 1, 0), this.scene);
      light.parent = root;
      light.diffuse = AMBER;
      light.specular.set(0, 0, 0);
      light.range = 6;
      return { root, lid, glow, light, open: 0, dispose: () => { light.dispose(); root.dispose(); } };
    }, (v, c) => {
      v.root.position.copyFrom(this.at(c.pos.x, c.pos.z));
      const opened = c.openedFor !== null;
      v.open = Math.min(1, v.open + (opened ? dt * 3 : 0));
      // Capacul se dă pe spate, cu un mic recul.
      v.lid.rotation.x = -1.9 * v.open + (opened && v.open < 1 ? Math.sin(v.open * 20) * 0.05 : 0);
      v.glow.setEnabled(opened);
      // Închis: o licărire slabă de chihlimbar printre scânduri; deschis: lumina iese afară.
      v.light.intensity = opened ? 2.2 * (1 - Math.max(0, ((c.openedFor ?? 0) - CONFIG.chest.openTime + 2) / 2)) : 0.5 + Math.sin(this.time * 3) * 0.2;
      if (!opened && Math.random() < 0.1) this.fx.burst("spark", this.at(c.pos.x, c.pos.z, 0.7), new Vector3(0, 1, 0), 1, 1.5, 0.05);
    });
  }

  reset(): void {
    for (const map of [this.fireViews, this.farmViews, this.animalViews, this.dropViews, this.chestViews, this.oreViews] as Map<EntityId, Disposable>[]) {
      for (const v of map.values()) v.dispose();
      map.clear();
    }
  }
}

/** Ține un Map id → obiect 3D sincronizat cu o listă de entități (creează / actualizează / șterge). */
function sync<V extends Disposable, E extends { id: EntityId }>(
  views: Map<EntityId, V>,
  entities: readonly E[],
  create: (e: E) => V,
  update: (v: V, e: E) => void,
): void {
  const seen = new Set<EntityId>();
  for (const e of entities) {
    seen.add(e.id);
    let v = views.get(e.id);
    if (!v) {
      v = create(e);
      views.set(e.id, v);
    }
    update(v, e);
  }
  for (const [id, v] of views) {
    if (seen.has(id)) continue;
    v.dispose();
    views.delete(id);
  }
}

export type { Mesh };
