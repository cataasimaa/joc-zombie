// Randarea: transformă starea jocului (date) în obiecte 3D pe ecran.
// Nu modifică NICIODATĂ starea; doar o citește. Pentru fiecare entitate din stare
// există un mesh; dacă entitatea dispare, mesh-ul e șters.

import {
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  FreeCamera,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { CONFIG, GAME_MAP, type EntityId, type GameEvent, type GameState, type Vec2 } from "../core";

const CAMERA_OFFSET = new Vector3(0, 28, -20);
const TRACER_LIFETIME = 0.07;

interface Tracer {
  mesh: Mesh;
  life: number;
}

export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private camera: FreeCamera;
  private mats: Record<string, StandardMaterial> = {};

  private heroTemplate!: Mesh;
  private zombieTemplate!: Mesh;
  private towerTemplate!: Mesh;
  private coinTemplate!: Mesh;

  private heroViews = new Map<EntityId, TransformNode>();
  private zombieViews = new Map<EntityId, Mesh>();
  private towerViews = new Map<EntityId, TransformNode>();
  private coinViews = new Map<EntityId, Mesh>();
  private zombieFlash = new Map<EntityId, number>();
  private tracers: Tracer[] = [];
  private shelterMesh!: TransformNode;
  private shelterShake = 0;
  private snowEmitter = new Vector3();
  private ghost: Mesh;
  private rangeRing: Mesh;

  constructor(canvas: HTMLCanvasElement) {
    // adaptToDeviceRatio=false: pe telefoane cu ecran retina randăm la rezoluție mai mică → mai rapid.
    this.engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false }, false);
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.78, 0.85, 0.93, 1);
    this.scene.fogMode = Scene.FOGMODE_LINEAR;
    this.scene.fogColor = new Color3(0.78, 0.85, 0.93);
    this.scene.fogStart = 30;
    this.scene.fogEnd = 75;
    this.scene.skipPointerMovePicking = true;

    this.camera = new FreeCamera("camera", CAMERA_OFFSET.clone(), this.scene);
    this.camera.setTarget(Vector3.Zero());
    this.camera.fov = 0.6;

    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.75;
    hemi.groundColor = new Color3(0.55, 0.6, 0.7);
    const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.4), this.scene);
    sun.intensity = 0.6;

    this.createMaterials();
    this.createWorld();
    this.createTemplates();
    this.createSnowfall();

    this.ghost = MeshBuilder.CreateCylinder("ghost", { diameter: CONFIG.tower.radius * 2, height: 2.4 }, this.scene);
    this.ghost.position.y = 1.2;
    this.ghost.isPickable = false;
    this.ghost.setEnabled(false);
    this.rangeRing = MeshBuilder.CreateTorus("range", { diameter: CONFIG.tower.range * 2, thickness: 0.12, tessellation: 48 }, this.scene);
    this.rangeRing.material = this.mats.range;
    this.rangeRing.position.y = 0.05;
    this.rangeRing.isPickable = false;
    this.rangeRing.setEnabled(false);

    window.addEventListener("resize", () => this.engine.resize());
  }

  // ---------- Construcția scenei ----------

  private mat(name: string, color: Color3, emissive = 0): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = color;
    m.specularColor = Color3.Black();
    if (emissive) m.emissiveColor = color.scale(emissive);
    this.mats[name] = m;
    return m;
  }

  private createMaterials(): void {
    this.mat("snow", new Color3(0.95, 0.97, 1));
    this.mat("wood", new Color3(0.45, 0.28, 0.15));
    this.mat("darkWood", new Color3(0.3, 0.18, 0.1));
    this.mat("roof", new Color3(0.85, 0.9, 0.95));
    this.mat("pine", new Color3(0.13, 0.35, 0.22));
    this.mat("hero", new Color3(0.2, 0.45, 0.95));
    this.mat("gun", new Color3(0.15, 0.15, 0.15));
    this.mat("zombie", new Color3(0.3, 0.55, 0.15));
    this.mat("zombieHit", new Color3(1, 1, 1), 1);
    this.mat("tower", new Color3(0.55, 0.55, 0.6));
    this.mat("towerTop", new Color3(0.85, 0.35, 0.2));
    this.mat("coin", new Color3(1, 0.8, 0.1), 0.5);
    this.mat("tracerHero", new Color3(1, 0.9, 0.4), 1);
    this.mat("tracerTower", new Color3(1, 0.5, 0.2), 1);
    this.mat("shelter", new Color3(0.55, 0.35, 0.2));
    this.mat("ghostOk", new Color3(0.2, 1, 0.3), 0.6).alpha = 0.5;
    this.mat("ghostBad", new Color3(1, 0.2, 0.2), 0.6).alpha = 0.5;
    this.mat("range", new Color3(1, 1, 1), 1).alpha = 0.5;
  }

  private createWorld(): void {
    const size = CONFIG.map.halfSize * 2;
    const ground = MeshBuilder.CreateGround("ground", { width: size + 60, height: size + 60 }, this.scene);
    ground.material = this.mats.snow;

    // Adăpostul: o casă mai mare în centru.
    const shelter = new TransformNode("shelter", this.scene);
    const r = CONFIG.shelter.radius;
    const body = MeshBuilder.CreateBox("shelterBody", { width: r * 1.5, depth: r * 1.5, height: 2.6 }, this.scene);
    body.position.y = 1.3;
    body.material = this.mats.shelter;
    body.parent = shelter;
    const roof = MeshBuilder.CreateCylinder("shelterRoof", { diameter: r * 1.6, height: r * 1.8, tessellation: 3 }, this.scene);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.scaling.x = 0.8;
    roof.position.y = 2.6 + 0.25 * r * 1.6 * 0.8;
    roof.material = this.mats.roof;
    roof.parent = shelter;
    const door = MeshBuilder.CreateBox("door", { width: 1, height: 1.6, depth: 0.1 }, this.scene);
    door.position.set(0, 0.8, -r * 0.76);
    door.material = this.mats.darkWood;
    door.parent = shelter;
    this.shelterMesh = shelter;

    // Case de lemn: un template, apoi instanțe (mult mai ieftin pentru GPU).
    const houseBody = MeshBuilder.CreateBox("houseBody", { size: 1 }, this.scene);
    houseBody.material = this.mats.wood;
    const houseRoof = MeshBuilder.CreateCylinder("houseRoof", { diameter: 1, height: 1, tessellation: 3 }, this.scene);
    houseRoof.material = this.mats.roof;
    for (const [i, h] of GAME_MAP.houses.entries()) {
      const node = new TransformNode(`house${i}`, this.scene);
      node.position.set(h.pos.x, 0, h.pos.z);
      node.rotation.y = h.rotation;
      const b = houseBody.createInstance(`houseBody${i}`);
      b.parent = node;
      b.scaling.set(h.width, 2.2, h.depth);
      b.position.y = 1.1;
      // Prisma triunghiulară culcată pe lungimea casei = acoperiș în două ape.
      const rf = houseRoof.createInstance(`houseRoof${i}`);
      rf.parent = node;
      rf.rotation.z = Math.PI / 2;
      rf.scaling.set(h.depth * 0.8, h.width * 1.1, h.depth * 1.2);
      rf.position.y = 2.2 + 0.25 * h.depth * 0.8;
    }
    houseBody.setEnabled(false);
    houseRoof.setEnabled(false);

    // Brazi: con + trunchi, uniți într-un singur mesh, apoi instanțe.
    const cone = MeshBuilder.CreateCylinder("cone", { diameterTop: 0, diameterBottom: 1.8, height: 3, tessellation: 6 }, this.scene);
    cone.position.y = 2.3;
    cone.material = this.mats.pine;
    const trunk = MeshBuilder.CreateCylinder("trunk", { diameter: 0.4, height: 0.9, tessellation: 5 }, this.scene);
    trunk.position.y = 0.45;
    trunk.material = this.mats.darkWood;
    const tree = Mesh.MergeMeshes([cone, trunk], true, true, undefined, false, true)!;
    for (const [i, t] of GAME_MAP.trees.entries()) {
      const inst = tree.createInstance(`tree${i}`);
      inst.position.set(t.pos.x, 0, t.pos.z);
      inst.scaling.setAll(t.scale);
    }
    tree.setEnabled(false);

    // Brazi decorativi în afara hărții, ca marginea să nu pară goală.
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const d = CONFIG.map.halfSize + 3 + (i % 3) * 3;
      const inst = tree.createInstance(`border${i}`);
      inst.position.set(Math.cos(a) * d * 1.15, 0, Math.sin(a) * d * 1.15);
      inst.scaling.setAll(1 + (i % 4) * 0.2);
    }
  }

  private createTemplates(): void {
    // Erou: capsulă albastră + armă.
    this.heroTemplate = MeshBuilder.CreateCapsule("heroTpl", { height: 1.8, radius: 0.45 }, this.scene);
    this.heroTemplate.material = this.mats.hero;
    this.heroTemplate.setEnabled(false);

    this.zombieTemplate = MeshBuilder.CreateCapsule("zombieTpl", { height: 1.7, radius: 0.45, tessellation: 8 }, this.scene);
    this.zombieTemplate.setEnabled(false);

    this.towerTemplate = MeshBuilder.CreateCylinder("towerTpl", { diameterTop: 1.4, diameterBottom: 2, height: 2.2, tessellation: 8 }, this.scene);
    this.towerTemplate.material = this.mats.tower;
    this.towerTemplate.setEnabled(false);

    this.coinTemplate = MeshBuilder.CreateCylinder("coinTpl", { diameter: 0.9, height: 0.15, tessellation: 12 }, this.scene);
    this.coinTemplate.material = this.mats.coin;
    this.coinTemplate.rotation.x = Math.PI / 2;
    this.coinTemplate.bakeCurrentTransformIntoVertices();
    this.coinTemplate.setEnabled(false);
  }

  private createSnowfall(): void {
    // Textură generată din cod: un punct alb moale (fără fișiere externe).
    const tex = new DynamicTexture("flake", 32, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    tex.update();
    tex.hasAlpha = true;

    const snow = new ParticleSystem("snow", 600, this.scene);
    snow.particleTexture = tex;
    snow.emitter = this.snowEmitter;
    snow.minEmitBox = new Vector3(-30, -2, -25);
    snow.maxEmitBox = new Vector3(30, 2, 25);
    snow.direction1 = new Vector3(-0.5, -1, 0);
    snow.direction2 = new Vector3(0.5, -1, 0);
    snow.minSize = 0.1;
    snow.maxSize = 0.25;
    snow.minLifeTime = 4;
    snow.maxLifeTime = 6;
    snow.emitRate = 100;
    snow.minEmitPower = 3;
    snow.maxEmitPower = 5;
    snow.color1 = new Color4(1, 1, 1, 0.9);
    snow.color2 = new Color4(1, 1, 1, 0.6);
    snow.colorDead = new Color4(1, 1, 1, 0);
    snow.start();
  }

  // ---------- Sincronizare cu starea ----------

  /** Apelată o dată pe cadru: aduce scena la zi cu starea jocului. */
  sync(state: GameState, events: GameEvent[], localPlayerId: string, dt: number): void {
    for (const e of events) this.handleEvent(e);

    this.syncHeroes(state);
    this.syncZombies(state, dt);
    this.syncTowers(state);
    this.syncCoins(state);
    this.updateTracers(dt);

    // Adăpostul tremură când e lovit.
    this.shelterShake = Math.max(0, this.shelterShake - dt * 4);
    this.shelterMesh.position.x = Math.sin(state.time * 60) * 0.06 * this.shelterShake;

    // Camera urmărește lin eroul local.
    const me = state.players[localPlayerId];
    const hero = me && state.heroes.find((h) => h.id === me.heroId);
    if (hero) {
      const desired = new Vector3(hero.pos.x, 0, hero.pos.z).addInPlace(CAMERA_OFFSET);
      Vector3.LerpToRef(this.camera.position, desired, Math.min(1, dt * 5), this.camera.position);
    }
    // Ninsoarea cade mereu în jurul camerei.
    this.snowEmitter.set(this.camera.position.x, 14, this.camera.position.z + 10);
  }

  private handleEvent(e: GameEvent): void {
    switch (e.type) {
      case "shot":
        this.spawnTracer(e.from, e.to, e.source);
        break;
      case "zombieHit":
        this.zombieFlash.set(e.id, 0.08);
        break;
      case "shelterHit":
        this.shelterShake = 1;
        break;
    }
  }

  private syncHeroes(state: GameState): void {
    syncMap(this.heroViews, state.heroes, () => {
      const root = new TransformNode("hero", this.scene);
      const body = this.heroTemplate.clone("heroBody", root);
      body.setEnabled(true);
      body.position.y = 0.9;
      const gun = MeshBuilder.CreateBox("gun", { width: 0.15, height: 0.15, depth: 1 }, this.scene);
      gun.material = this.mats.gun;
      gun.position.set(0.35, 1.1, 0.5);
      gun.parent = root;
      return root;
    }, (view, hero) => {
      view.setEnabled(hero.alive);
      view.position.set(hero.pos.x, 0, hero.pos.z);
      view.rotation.y = hero.facing;
    });
  }

  private syncZombies(state: GameState, dt: number): void {
    syncMap(this.zombieViews, state.zombies, () => {
      const m = this.zombieTemplate.clone("zombie");
      m.setEnabled(true);
      return m;
    }, (view, z) => {
      // Mers legănat, ca un zombie.
      const wobble = Math.sin(state.time * 6 + z.id) * 0.12;
      view.position.set(z.pos.x, 0.85, z.pos.z);
      view.rotation.set(0.15, z.facing, wobble);
      const flash = this.zombieFlash.get(z.id) ?? 0;
      view.material = flash > 0 ? this.mats.zombieHit : this.mats.zombie;
      if (flash > 0) this.zombieFlash.set(z.id, flash - dt);
    }, (id) => this.zombieFlash.delete(id));
  }

  private syncTowers(state: GameState): void {
    syncMap(this.towerViews, state.towers, () => {
      const root = new TransformNode("tower", this.scene);
      const base = this.towerTemplate.clone("towerBase", root);
      base.setEnabled(true);
      base.position.y = 1.1;
      const head = MeshBuilder.CreateBox("towerHead", { width: 1, height: 0.7, depth: 1 }, this.scene);
      head.material = this.mats.towerTop;
      head.position.y = 2.55;
      head.parent = root;
      const barrel = MeshBuilder.CreateBox("barrel", { width: 0.2, height: 0.2, depth: 1.1 }, this.scene);
      barrel.material = this.mats.gun;
      barrel.position.set(0, 2.55, 0.7);
      barrel.parent = root;
      return root;
    }, (view, t) => {
      view.position.set(t.pos.x, 0, t.pos.z);
      // Doar capul turnului se rotește; pentru prototip rotim tot turnul.
      view.rotation.y = t.facing;
    });
  }

  private syncCoins(state: GameState): void {
    syncMap(this.coinViews, state.coins, () => {
      const m = this.coinTemplate.clone("coin");
      m.setEnabled(true);
      return m;
    }, (view, c) => {
      view.position.set(c.pos.x, 0.5 + Math.sin(state.time * 4 + c.id) * 0.15, c.pos.z);
      view.rotation.y = state.time * 3;
    });
  }

  private spawnTracer(from: Vec2, to: Vec2, source: "hero" | "tower"): void {
    let tracer = this.tracers.find((t) => t.life <= 0);
    if (!tracer) {
      const mesh = MeshBuilder.CreateBox("tracer", { width: 0.08, height: 0.08, depth: 1 }, this.scene);
      mesh.isPickable = false;
      tracer = { mesh, life: 0 };
      this.tracers.push(tracer);
    }
    const y = source === "tower" ? 2.55 : 1.1;
    const a = new Vector3(from.x, y, from.z);
    const b = new Vector3(to.x, 1, to.z);
    tracer.mesh.material = source === "tower" ? this.mats.tracerTower : this.mats.tracerHero;
    tracer.mesh.position = Vector3.Center(a, b);
    tracer.mesh.scaling.z = Vector3.Distance(a, b);
    tracer.mesh.lookAt(b);
    tracer.mesh.setEnabled(true);
    tracer.life = TRACER_LIFETIME;
  }

  private updateTracers(dt: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.setEnabled(false);
    }
  }

  // ---------- Mod construcție ----------

  /** Transformă un punct de pe ecran în poziție pe sol (sau null). */
  pickGround(screenX: number, screenY: number): Vec2 | null {
    const ray = this.scene.createPickingRay(screenX, screenY, null, this.camera);
    if (ray.direction.y >= 0) return null;
    const t = -ray.origin.y / ray.direction.y;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  /** Arată „fantoma” turnului (verde = se poate construi, roșu = nu). */
  setGhost(pos: Vec2 | null, valid: boolean): void {
    this.ghost.setEnabled(!!pos);
    this.rangeRing.setEnabled(!!pos);
    if (!pos) return;
    this.ghost.position.x = this.rangeRing.position.x = pos.x;
    this.ghost.position.z = this.rangeRing.position.z = pos.z;
    this.ghost.material = valid ? this.mats.ghostOk : this.mats.ghostBad;
  }

  /** Șterge toate entitățile (pentru „Joacă din nou”). */
  reset(): void {
    for (const map of [this.heroViews, this.zombieViews, this.towerViews, this.coinViews]) {
      for (const v of map.values()) v.dispose();
      map.clear();
    }
    this.zombieFlash.clear();
    this.setGhost(null, false);
  }

  render(): void {
    this.scene.render();
  }
}

/**
 * Ține un Map id → obiect 3D sincronizat cu o listă de entități:
 * creează ce e nou, actualizează ce există, șterge ce a dispărut.
 */
function syncMap<V extends { dispose(): void }, E extends { id: EntityId }>(
  views: Map<EntityId, V>,
  entities: readonly E[],
  create: () => V,
  update: (view: V, entity: E) => void,
  onRemove?: (id: EntityId) => void,
): void {
  const seen = new Set<EntityId>();
  for (const e of entities) {
    seen.add(e.id);
    let view = views.get(e.id);
    if (!view) {
      view = create();
      views.set(e.id, view);
    }
    update(view, e);
  }
  for (const [id, view] of views) {
    if (seen.has(id)) continue;
    view.dispose();
    views.delete(id);
    onRemove?.(id);
  }
}
