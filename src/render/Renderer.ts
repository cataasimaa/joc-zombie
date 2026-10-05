// Randarea: transformă starea jocului (date) în lumea 3D.
// Nu modifică NICIODATĂ starea; doar o citește. Pentru fiecare entitate din stare
// există un obiect 3D; dacă entitatea dispare, obiectul e șters.

import {
  Color3,
  Engine,
  FreeCamera,
  type InstancedMesh,
  Matrix,
  type Mesh,
  MeshBuilder,
  Scene,
  type StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import {
  type Barricade,
  type BuildKind,
  CONFIG,
  DEFAULT_SKIN_COLOR,
  type EntityId,
  type GameEvent,
  type GameState,
  type Hero,
  SKINS,
  type Vec2,
  type ZombieType,
  segmentEnds,
} from "../core";
import { Fx } from "./Fx";
import { Materials } from "./ModelKit";
import { type HeroModel, type ZombieModel, buildHero, buildZombie } from "./models/characters";
import { buildCoin, buildFlame, buildMine, buildTowerBase, buildTowerHead, buildWall, towerHeadY } from "./models/structures";
import { PAL, mix } from "./palette";
import { terrainHeight } from "./Terrain";
import { Prefab, World } from "./World";

const CAMERA_OFFSET = new Vector3(0, 21, -15.5);
const ZOMBIE_SCALE: Record<ZombieType, number> = { walker: 1, runner: 0.88, brute: 1, boss: 1 };
const HP_BAR_Y: Partial<Record<ZombieType, number>> = { brute: 2.7, boss: 4.4 };

/** Bară de viață care plutește deasupra unui obiect. */
class HpBar {
  private bg: Mesh;
  private fg: Mesh;
  constructor(scene: Scene, bgMat: StandardMaterial, fgMat: StandardMaterial, private width: number) {
    this.bg = MeshBuilder.CreatePlane("hpBg", { width, height: 0.16 }, scene);
    this.fg = MeshBuilder.CreatePlane("hpFg", { width, height: 0.16 }, scene);
    this.bg.material = bgMat;
    this.fg.material = fgMat;
    for (const m of [this.bg, this.fg]) {
      m.isPickable = false;
      m.billboardMode = TransformNode.BILLBOARDMODE_ALL;
      m.renderingGroupId = 1;
    }
  }
  set(pos: Vec2, y: number, ratio: number): void {
    const show = ratio < 0.999;
    this.bg.setEnabled(show);
    this.fg.setEnabled(show);
    if (!show) return;
    const r = Math.max(0, Math.min(1, ratio));
    this.bg.position.set(pos.x, y, pos.z);
    this.fg.position.set(pos.x - (this.width * (1 - r)) / 2, y + 0.01, pos.z - 0.01);
    this.fg.scaling.x = Math.max(0.001, r);
  }
  dispose(): void {
    this.bg.dispose();
    this.fg.dispose();
  }
}

interface HeroView {
  root: TransformNode;
  body: TransformNode;
  model: HeroModel;
  key: string;
  bubble: Mesh;
  lastPos: Vec2;
  walk: number;
  kneel: number;
  dispose(): void;
}

interface ZombieView {
  root: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  bar: HpBar | null;
  type: ZombieType;
  walk: number;
  lastPos: Vec2;
  knock: number;
  lastBlood: number;
  dispose(): void;
}

interface TowerView {
  root: TransformNode;
  base: InstancedMesh[];
  head: TransformNode;
  flame: InstancedMesh;
  tier: number;
  dispose(): void;
}

interface BarricadeView {
  root: TransformNode;
  parts: InstancedMesh[];
  key: string;
  bar: HpBar;
  dispose(): void;
}

interface ZoneView {
  root: TransformNode;
  disc: Mesh;
  flames: InstancedMesh[];
  dispose(): void;
}

export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private camera: FreeCamera;
  private mats: Materials;
  private world: World;
  private fx: Fx;
  private night = 0;
  private time = 0;
  private cameraOffset = CAMERA_OFFSET.clone();

  private zombiePrefabs = {} as Record<ZombieType, { model: ZombieModel; body: Prefab; armL: Prefab; armR: Prefab; legL: Prefab; legR: Prefab }>;
  private towerBases: Prefab[] = [];
  private towerHeads: Prefab[] = [];
  private flame!: Prefab;
  private walls = new Map<string, Prefab>();
  private mine!: Prefab;
  private coin!: Prefab;

  private heroViews = new Map<EntityId, HeroView>();
  private zombieViews = new Map<EntityId, ZombieView>();
  private dying: { view: ZombieView; t: number }[] = [];
  private towerViews = new Map<EntityId, TowerView>();
  private barricadeViews = new Map<EntityId, BarricadeView>();
  private mineViews = new Map<EntityId, { root: TransformNode; light: InstancedMesh | undefined; dispose(): void }>();
  private coinViews = new Map<EntityId, InstancedMesh>();
  private zoneViews = new Map<EntityId, ZoneView>();
  private killedIds = new Set<EntityId>();
  private shelterShake = 0;

  private ghostTower: TransformNode;
  private ghostWall: TransformNode;
  private ghostParts: Mesh[] = [];
  private rangeRing: Mesh;
  private selectRing: Mesh;
  private m: Record<string, StandardMaterial> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false }, false);
    // Pe ecrane retina randăm la cel mult 1.5x → mult mai rapid, aproape la fel de clar.
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;

    this.camera = new FreeCamera("camera", CAMERA_OFFSET.clone(), this.scene);
    this.camera.setTarget(Vector3.Zero());
    this.camera.fov = 0.62;
    this.camera.maxZ = 160;

    this.mats = new Materials(this.scene);
    this.world = new World(this.scene, this.mats);
    this.fx = new Fx(this.scene, this.mats);

    const tint = (name: string, c: Color3, a: number) => (this.m[name] = this.mats.tint(name, c, a));
    tint("ghostOk", new Color3(0.3, 1, 0.45), 0.45);
    tint("ghostBad", new Color3(1, 0.25, 0.2), 0.45);
    tint("range", PAL.ice, 0.55);
    tint("select", PAL.gold, 0.8);
    tint("hpBg", new Color3(0.05, 0.06, 0.08), 0.75);
    tint("hpZombie", mix(PAL.blood, new Color3(1, 0.2, 0.2), 0.5), 1);
    tint("hpWall", mix(PAL.oldWood, PAL.gold, 0.5), 1);
    tint("shield", PAL.ice, 0.25);
    tint("invuln", PAL.gold, 0.3);
    tint("healZone", mix(PAL.ice, new Color3(0.4, 1, 0.6), 0.5), 0.22);
    tint("fireZone", PAL.fire, 0.18);

    this.createPrefabs();

    // Fantome pentru construcție: aceeași formă ca turnul / zidul final.
    this.ghostTower = new TransformNode("ghostTower", this.scene);
    this.ghostWall = new TransformNode("ghostWall", this.scene);
    const ghostOf = (sources: Mesh[], parent: TransformNode, y = 0) => {
      for (const s of sources) {
        const c = s.clone(`ghost_${s.name}`, parent)!;
        c.isVisible = true;
        c.useVertexColors = false;
        c.position.y = y;
        c.isPickable = false;
        this.ghostParts.push(c);
      }
    };
    ghostOf(this.towerBases[0].sources, this.ghostTower);
    ghostOf(this.towerHeads[0].sources, this.ghostTower, towerHeadY(1));
    ghostOf(this.walls.get("1")!.sources, this.ghostWall);
    this.rangeRing = MeshBuilder.CreateTorus("range", { diameter: 2, thickness: 0.05, tessellation: 64 }, this.scene);
    this.rangeRing.material = this.m.range;
    this.selectRing = MeshBuilder.CreateTorus("select", { diameter: 2, thickness: 0.1, tessellation: 40 }, this.scene);
    this.selectRing.material = this.m.select;
    for (const g of [this.ghostTower, this.ghostWall, this.rangeRing, this.selectRing]) g.setEnabled(false);

    window.addEventListener("resize", () => this.engine.resize());
  }

  private createPrefabs(): void {
    const s = this.scene;
    const caster = (p: Prefab) => {
      for (const src of p.sources) this.world.shadows.addShadowCaster(src);
    };
    for (const type of ["walker", "runner", "brute", "boss"] as ZombieType[]) {
      const model = buildZombie(s, this.mats, type);
      const prefab = {
        model,
        body: new Prefab(model.body),
        armL: new Prefab([model.armL]),
        armR: new Prefab([model.armR]),
        legL: new Prefab([model.legL]),
        legR: new Prefab([model.legR]),
      };
      [prefab.body, prefab.armL, prefab.armR, prefab.legL, prefab.legR].forEach(caster);
      this.zombiePrefabs[type] = prefab;
    }
    for (let tier = 1; tier <= 4; tier++) {
      this.towerBases.push(new Prefab(buildTowerBase(s, this.mats, tier)));
      this.towerHeads.push(new Prefab(buildTowerHead(s, this.mats, tier)));
    }
    [...this.towerBases, ...this.towerHeads].forEach(caster);
    this.flame = new Prefab([buildFlame(s, this.mats)]);
    for (const level of [1, 2]) {
      for (const door of [false, true]) {
        const prefab = new Prefab(buildWall(s, this.mats, level, door));
        caster(prefab);
        this.walls.set(`${level}${door ? "d" : ""}`, prefab);
      }
    }
    this.mine = new Prefab(buildMine(s, this.mats));
    this.coin = new Prefab([buildCoin(s, this.mats)]);
  }

  // ---------- Sincronizare cu starea ----------

  /** Apelată o dată pe cadru: aduce scena la zi cu starea jocului. */
  sync(state: GameState, events: GameEvent[], localPlayerId: string, dt: number): void {
    this.time += dt;
    this.killedIds.clear();
    for (const e of events) this.handleEvent(state, e);

    this.syncHeroes(state, dt);
    this.syncZombies(state, dt);
    this.syncTowers(state);
    this.syncBarricades(state);
    this.syncMines(state);
    this.syncCoins(state);
    this.syncZones(state);
    this.updateDying(dt);
    this.fx.update(dt);

    // Adăpostul tremură când e lovit.
    this.shelterShake = Math.max(0, this.shelterShake - dt * 4);
    this.world.shelter.position.x = Math.sin(this.time * 60) * 0.06 * this.shelterShake;

    // Zi / noapte: amurgul începe în ultimele 12 secunde ale zilei.
    let target = this.night;
    if (state.phase === "night") target = 1;
    else if (state.phase === "day") target = state.phaseTimer < 12 ? 0.6 * (1 - state.phaseTimer / 12) : 0;
    else if (state.phase === "victory") target = 0;
    this.night += (target - this.night) * Math.min(1, dt * 0.5);

    // Camera urmărește lin eroul local; felinarul lui se aprinde noaptea.
    const me = state.players[localPlayerId];
    const hero = me && state.heroes.find((h) => h.id === me.heroId);
    const focus = hero ? new Vector3(hero.pos.x, terrainHeight(hero.pos.x, hero.pos.z), hero.pos.z) : Vector3.Zero();
    Vector3.LerpToRef(this.camera.position, focus.add(this.cameraOffset), Math.min(1, dt * 5), this.camera.position);
    this.camera.setTarget(this.camera.position.subtract(this.cameraOffset));
    if (hero) this.world.lantern.position.set(hero.pos.x, focus.y + 2.6, hero.pos.z);
    this.world.update(dt, this.night, focus, this.camera.position);
  }

  /** Poziția pe ecran (în pixeli CSS) a unui punct de pe hartă. */
  projectToScreen(p: Vec2, y = 0): { x: number; y: number } {
    const engine = this.engine;
    const v = Vector3.Project(
      this.at(p, y),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
    );
    const scale = engine.getHardwareScalingLevel();
    return { x: v.x * scale, y: v.y * scale };
  }

  /** Pentru depanare/capturi: mută camera mai aproape sau mai departe. */
  setCameraOffset(x: number, y: number, z: number): void {
    this.cameraOffset.set(x, y, z);
  }

  /** Cât de „noapte” e acum (0..1) — util pentru sunet. */
  get nightAmount(): number {
    return this.night;
  }

  private at(p: Vec2, y = 0): Vector3 {
    return new Vector3(p.x, terrainHeight(p.x, p.z) + y, p.z);
  }

  private handleEvent(state: GameState, e: GameEvent): void {
    switch (e.type) {
      case "shot": {
        if (e.source === "tower") {
          const t = state.towers.find((x) => x.pos.x === e.from.x && x.pos.z === e.from.z);
          const f = t?.facing ?? 0;
          const from = this.at(e.from, towerHeadY(t?.tier ?? 1) + 0.6).add(new Vector3(Math.sin(f), 0, Math.cos(f)).scale(1.1));
          this.fx.tracer(from, this.at(e.to, 1.1), mix(PAL.fire, PAL.bone, 0.4), 0.07, 0.08);
          this.fx.muzzle(from, PAL.fire, 0.3);
          break;
        }
        const hero = e.heroId !== undefined ? state.heroes.find((h) => h.id === e.heroId) : undefined;
        const view = hero && this.heroViews.get(hero.id);
        const from = hero && view ? this.muzzleOf(hero, view) : this.at(e.from, 1.3);
        const weapon = hero ? state.players[hero.playerId]?.weapon : undefined;
        const color = e.crit ? mix(PAL.fire, PAL.blood, 0.2) : weapon === "iceLance" ? PAL.ice : mix(PAL.fire, PAL.bone, 0.55);
        this.fx.tracer(from, this.at(e.to, 1.1), color, e.crit ? 0.12 : 0.05, e.crit ? 0.12 : 0.06);
        this.fx.muzzle(from, weapon === "iceLance" ? PAL.ice : PAL.fire, 0.3);
        break;
      }
      case "zombieHit": {
        const view = this.zombieViews.get(e.id);
        // Limităm sângele per zombie (focul de la Molotov lovește continuu).
        if (view && this.time - view.lastBlood < 0.08) break;
        if (view) {
          view.lastBlood = this.time;
          view.knock = 1;
        }
        const h = view ? (HP_BAR_Y[view.type] ?? 1.6) : 1.4;
        const dir = new Vector3(e.pos.x - e.from.x, 0.2, e.pos.z - e.from.z);
        this.fx.burst("blood", this.at(e.pos, h * 0.7), dir.lengthSquared() > 0.01 ? dir : null, 5, 4, 0.09);
        if (Math.random() < 0.25) this.fx.decal(e.pos.x + (Math.random() - 0.5), e.pos.z + (Math.random() - 0.5), 0.35);
        break;
      }
      case "zombieDied": {
        const big = e.zombieType === "boss" ? 3 : e.zombieType === "brute" ? 1.8 : 1;
        this.fx.burst("blood", this.at(e.pos, 1), null, Math.round(10 * big), 4.5, 0.12);
        if (big > 1) this.fx.burst("bone", this.at(e.pos, 1.2), null, 8, 5, 0.12);
        this.fx.decal(e.pos.x, e.pos.z, 0.9 * big);
        this.killedIds.add(e.id);
        break;
      }
      case "barricadeHit":
        this.fx.burst("wood", this.at(e.pos, 0.9), null, 3, 3, 0.1);
        break;
      case "barricadeDestroyed":
        this.fx.burst("wood", this.at(e.pos, 0.8), null, 18, 6, 0.16);
        this.fx.burst("snow", this.at(e.pos, 0.3), null, 12, 4, 0.2);
        break;
      case "mineExploded":
        this.fx.explosion(this.at(e.pos), e.radius);
        break;
      case "shelterHit":
        this.shelterShake = 1;
        if (Math.random() < 0.4) this.fx.burst("wood", new Vector3((Math.random() - 0.5) * 4, 1.5, -2.6), null, 3, 3, 0.1);
        break;
      case "healed":
        this.fx.ring(this.at(e.pos, 0.15), 1.6, mix(PAL.ice, new Color3(0.4, 1, 0.6), 0.5), 0.5);
        break;
      case "levelUp": {
        const h = state.heroes.find((x) => x.id === e.heroId);
        if (h) {
          this.fx.ring(this.at(h.pos, 0.15), 2.6, PAL.gold, 0.8);
          this.fx.burst("spark", this.at(h.pos, 1.5), null, 16, 5, 0.08);
        }
        break;
      }
      case "heroRevived": {
        const h = state.heroes.find((x) => x.id === e.id);
        if (h) this.fx.ring(this.at(h.pos, 0.15), 2.6, PAL.ice, 0.8);
        break;
      }
      case "towerUpgraded": {
        const t = state.towers.find((x) => x.id === e.id);
        if (t) this.fx.burst("spark", this.at(t.pos, 2.5), null, 14, 4, 0.08);
        break;
      }
      case "barricadePlaced":
      case "towerPlaced":
      case "barricadeChanged": {
        const b = state.barricades.find((x) => x.id === e.id) ?? state.towers.find((x) => x.id === e.id);
        if (b) this.fx.burst("snow", this.at(b.pos, 0.3), null, 10, 3, 0.18);
        break;
      }
      case "ability":
        this.abilityFx(e);
        break;
    }
  }

  private abilityFx(e: Extract<GameEvent, { type: "ability" }>): void {
    const pos = this.at(e.pos, 0.15);
    const to = e.to ? this.at(e.to, 0.15) : null;
    const up = (v: Vector3, y: number) => v.add(new Vector3(0, y, 0));
    switch (e.ability) {
      case "grenade":
        if (to) {
          this.fx.tracer(up(pos, 1.4), up(to, 0.3), PAL.fire, 0.12, 0.15);
          this.fx.explosion(to, e.radius);
        }
        break;
      case "molotov":
        if (to) {
          this.fx.tracer(up(pos, 1.4), up(to, 0.3), PAL.fire, 0.1, 0.15);
          this.fx.burst("spark", up(to, 0.3), null, 18, 5, 0.1);
          this.fx.ring(to, e.radius, PAL.fire, 0.5);
        }
        break;
      case "airstrike":
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const d = i === 0 ? 0 : e.radius * 0.6;
          this.fx.explosion(this.at({ x: e.pos.x + Math.cos(a) * d, z: e.pos.z + Math.sin(a) * d }), 3.2);
        }
        break;
      case "spray":
        if (to) {
          const base = Math.atan2(to.x - pos.x, to.z - pos.z);
          for (let i = -3; i <= 3; i++) {
            const a = base + i * 0.17;
            this.fx.tracer(up(pos, 1.2), pos.add(new Vector3(Math.sin(a) * e.radius, 1.0, Math.cos(a) * e.radius)), mix(PAL.fire, PAL.bone, 0.5), 0.06, 0.1);
          }
        }
        break;
      case "pierce":
        if (to) this.fx.tracer(up(pos, 1.2), up(to, 1.0), PAL.fire, 0.22, 0.25);
        break;
      case "iceShot":
        if (to) {
          this.fx.ring(to, e.radius, PAL.ice, 0.6);
          this.fx.burst("ice", up(to, 0.8), null, 20, 5, 0.1);
          this.fx.burst("snow", up(to, 0.3), null, 10, 3, 0.15);
        }
        break;
      case "slam":
        this.fx.ring(pos, e.radius, PAL.snowShadow, 0.5);
        this.fx.burst("snow", up(pos, 0.3), null, 24, 6, 0.2);
        break;
      case "taunt":
      case "fortress":
        this.fx.ring(pos, e.radius, PAL.blood, 0.7);
        break;
      case "shield":
        this.fx.ring(pos, 1.6, PAL.ice, 0.4);
        break;
      case "holyLight":
        this.fx.ring(pos, e.radius, PAL.gold, 0.9);
        this.fx.ring(pos, e.radius * 0.5, PAL.ice, 0.7);
        this.fx.burst("ice", up(pos, 1), null, 24, 6, 0.08);
        break;
      case "headshot":
      case "assassinate":
        this.fx.ring(pos, 1.5, PAL.blood, 0.4);
        break;
      default:
        this.fx.ring(pos, Math.max(1.8, e.radius), mix(PAL.ice, new Color3(0.4, 1, 0.6), 0.5), 0.6);
    }
  }

  // ---------- Eroi ----------

  private heroLookKey(state: GameState, hero: Hero): string {
    const p = state.players[hero.playerId];
    const gear = hero.level >= 8 ? 3 : hero.level >= 5 ? 2 : hero.level >= 3 ? 1 : 0;
    return `${hero.heroClass}|${p?.skin ?? ""}|${gear}|${p?.weapon ?? "rusty"}`;
  }

  private buildHeroView(state: GameState, hero: Hero): HeroView {
    const p = state.players[hero.playerId];
    const skin = p?.skin ? SKINS.find((s) => s.id === p.skin) : null;
    const coat = new Color3(...(skin ? skin.color : DEFAULT_SKIN_COLOR[hero.heroClass]));
    const model = buildHero(this.scene, this.mats, { heroClass: hero.heroClass, coat, level: hero.level, weapon: p?.weapon ?? "rusty" });
    const root = new TransformNode("hero", this.scene);
    const body = new TransformNode("heroBody", this.scene);
    body.parent = root;
    for (const m of [...model.body, model.legL, model.legR]) {
      m.parent = body;
      this.world.shadows.addShadowCaster(m);
    }
    const bubble = MeshBuilder.CreateSphere("bubble", { diameter: 2.7, segments: 10 }, this.scene);
    bubble.position.y = 1.1;
    bubble.parent = root;
    bubble.isPickable = false;
    return {
      root,
      body,
      model,
      key: this.heroLookKey(state, hero),
      bubble,
      lastPos: { ...hero.pos },
      walk: 0,
      kneel: hero.alive ? 0 : 1,
      dispose: () => root.dispose(),
    };
  }

  /** Poziția gurii armei, în lume (pentru trasoare și flacără). */
  private muzzleOf(hero: Hero, view: HeroView): Vector3 {
    const [mx, my, mz] = view.model.muzzle;
    const f = hero.facing;
    return new Vector3(
      hero.pos.x + mx * Math.cos(f) + mz * Math.sin(f),
      terrainHeight(hero.pos.x, hero.pos.z) + my - view.kneel * 0.5,
      hero.pos.z - mx * Math.sin(f) + mz * Math.cos(f),
    );
  }

  private syncHeroes(state: GameState, dt: number): void {
    syncMap(this.heroViews, state.heroes, (hero) => this.buildHeroView(state, hero), (view, hero) => {
      // Echipamentul vizibil se schimbă cu nivelul, skin-ul și arma: reconstruim modelul.
      const key = this.heroLookKey(state, hero);
      if (key !== view.key) {
        view.dispose();
        Object.assign(view, this.buildHeroView(state, hero));
      }
      const y = terrainHeight(hero.pos.x, hero.pos.z);
      view.root.position.set(hero.pos.x, y, hero.pos.z);
      view.root.rotation.y = hero.facing;

      // Mers: picioarele se leagănă, corpul se mișcă ușor în sus și în jos.
      const moved = Math.hypot(hero.pos.x - view.lastPos.x, hero.pos.z - view.lastPos.z);
      view.lastPos = { ...hero.pos };
      const speed = moved / Math.max(dt, 0.001);
      view.walk += speed * dt * 2.4;
      const amp = Math.min(1, speed / 4);
      view.model.legL.rotation.x = Math.sin(view.walk) * 0.7 * amp;
      view.model.legR.rotation.x = -Math.sin(view.walk) * 0.7 * amp;

      // Căzut: îngenunchează (nu dispare), ca Healer-ul să-l poată reînvia.
      view.kneel += ((hero.alive ? 0 : 1) - view.kneel) * Math.min(1, dt * 6);
      const k = view.kneel;
      view.body.position.y = Math.abs(Math.sin(view.walk)) * 0.06 * amp - k * 0.5;
      view.body.rotation.x = k * 0.45;
      if (k > 0.01) {
        view.model.legL.rotation.x = -k * 1.5;
        view.model.legR.rotation.x = k * 0.2;
      }

      const b = hero.buffs;
      view.bubble.setEnabled(hero.alive && (b.shield > 0 || b.invulnerable > 0));
      view.bubble.material = b.invulnerable > 0 ? this.m.invuln : this.m.shield;
    });
  }

  // ---------- Zombi ----------

  private createZombieView(type: ZombieType, id: EntityId, pos: Vec2): ZombieView {
    const prefab = this.zombiePrefabs[type];
    const { shoulder, hip } = prefab.model;
    const root = new TransformNode("zombie", this.scene);
    root.scaling.setAll(ZOMBIE_SCALE[type]);
    prefab.body.instance("zBody", root);
    const pivot = (part: Prefab, x: number, y: number, z: number) => {
      const node = new TransformNode("zLimb", this.scene);
      node.parent = root;
      node.position.set(x, y, z);
      part.instance("zLimbMesh", node);
      return node;
    };
    const big = type === "brute" || type === "boss";
    const bar = big ? new HpBar(this.scene, this.m.hpBg, this.m.hpZombie, type === "boss" ? 3 : 1.6) : null;
    const view: ZombieView = {
      root,
      armL: pivot(prefab.armL, -shoulder[0], shoulder[1], shoulder[2]),
      armR: pivot(prefab.armR, shoulder[0], shoulder[1], shoulder[2]),
      legL: pivot(prefab.legL, -hip[0], hip[1], 0),
      legR: pivot(prefab.legR, hip[0], hip[1], 0),
      bar,
      type,
      walk: (id * 1.7) % 6,
      lastPos: { ...pos },
      knock: 0,
      lastBlood: -1,
      dispose: () => {
        root.dispose();
        view.bar?.dispose();
      },
    };
    return view;
  }

  private syncZombies(state: GameState, dt: number): void {
    syncMap(this.zombieViews, state.zombies, (z) => this.createZombieView(z.type, z.id, z.pos), (view, z) => {
      const y = terrainHeight(z.pos.x, z.pos.z);
      const moved = Math.hypot(z.pos.x - view.lastPos.x, z.pos.z - view.lastPos.z);
      view.lastPos = { ...z.pos };
      const speed = moved / Math.max(dt, 0.001);
      const runner = z.type === "runner";
      view.walk += speed * dt * (runner ? 3.2 : 2.2) + dt * 0.8;
      const amp = Math.min(1, speed / 1.5);
      const w = view.walk;

      // Lovit: un mic recul înapoi.
      view.knock = Math.max(0, view.knock - dt * 6);
      view.root.position.set(z.pos.x - Math.sin(z.facing) * view.knock * 0.15, y, z.pos.z - Math.cos(z.facing) * view.knock * 0.15);
      view.root.rotation.set(view.knock * -0.15 + (runner ? 0.15 : 0), z.facing, Math.sin(w * 0.5) * 0.08);

      // Mers șchiopătat; brațele întinse înainte. Când stă pe loc (atacă), le ridică și lovește.
      view.legL.rotation.x = Math.sin(w) * 0.6 * amp;
      view.legR.rotation.x = -Math.sin(w) * 0.6 * amp;
      const attacking = amp < 0.3;
      const reach = attacking ? -1.5 + Math.abs(Math.sin(this.time * 5 + z.id)) * 1.0 : -0.9;
      view.armL.rotation.x = reach + Math.sin(w + 1) * 0.3;
      view.armR.rotation.x = reach + Math.sin(w + 2.2) * 0.3;
      view.armL.rotation.z = -0.1;
      view.armR.rotation.z = 0.1;
      view.bar?.set(z.pos, y + (HP_BAR_Y[z.type] ?? 2), z.hp / z.maxHp);
    }, (id, view) => {
      // Zombie omorât: cade și se scufundă în zăpadă, în loc să dispară brusc.
      if (!this.killedIds.has(id)) return false;
      view.bar?.dispose();
      view.bar = null;
      this.dying.push({ view, t: 0 });
      return true;
    });
  }

  private updateDying(dt: number): void {
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const fall = Math.min(1, d.t / 0.45);
      d.view.root.rotation.x = -fall * 1.45;
      d.view.armL.rotation.x = -fall * 2;
      d.view.armR.rotation.x = -fall * 1.6;
      if (d.t > 1.2) d.view.root.position.y -= dt * 0.9;
      if (d.t > 2.5) {
        d.view.dispose();
        this.dying.splice(i, 1);
      }
    }
  }

  // ---------- Construcții ----------

  private syncTowers(state: GameState): void {
    syncMap(this.towerViews, state.towers, () => {
      const root = new TransformNode("tower", this.scene);
      const head = new TransformNode("towerHead", this.scene);
      head.parent = root;
      const flameNode = new TransformNode("towerFlame", this.scene);
      flameNode.parent = root;
      flameNode.position.set(0, 0.85, -1.15);
      const [flame] = this.flame.instance("towerFlame", flameNode);
      return { root, base: [], head, flame, tier: 0, dispose: () => root.dispose() };
    }, (view, t) => {
      view.root.position.set(t.pos.x, terrainHeight(t.pos.x, t.pos.z), t.pos.z);
      view.head.rotation.y = t.facing;
      if (view.tier !== t.tier) {
        // Tier nou: altă bază și altă armă.
        for (const m of view.base) m.dispose();
        for (const c of view.head.getChildMeshes()) c.dispose();
        view.base = this.towerBases[t.tier - 1].instance("towerBase", view.root);
        this.towerHeads[t.tier - 1].instance("towerHeadMesh", view.head);
        view.head.position.y = towerHeadY(t.tier);
        view.tier = t.tier;
      }
      view.flame.scaling.set(0.9 + Math.sin(this.time * 11 + t.id) * 0.15, 0.85 + Math.sin(this.time * 13 + t.id * 2) * 0.25, 0.9);
    });
  }

  private wallKey(b: Barricade): string {
    return `${b.level}${b.door ? "d" : ""}`;
  }

  private syncBarricades(state: GameState): void {
    syncMap(this.barricadeViews, state.barricades, (b) => {
      const root = new TransformNode("wall", this.scene);
      const bar = new HpBar(this.scene, this.m.hpBg, this.m.hpWall, 1.8);
      const view: BarricadeView = {
        root,
        parts: this.walls.get(this.wallKey(b))!.instance("wallMesh", root),
        key: this.wallKey(b),
        bar,
        dispose: () => {
          root.dispose();
          bar.dispose();
        },
      };
      return view;
    }, (view, b) => {
      const key = this.wallKey(b);
      if (key !== view.key) {
        for (const p of view.parts) p.dispose();
        view.parts = this.walls.get(key)!.instance("wallMesh", view.root);
        view.key = key;
      }
      const y = Math.min(...segmentEnds(b.pos, b.rotation, CONFIG.barricade.length).map((p) => terrainHeight(p.x, p.z)));
      view.root.position.set(b.pos.x, y - 0.05, b.pos.z);
      view.root.rotation.y = b.rotation;
      // Zidul se apleacă puțin pe măsură ce e spart.
      const dmg = 1 - b.hp / b.maxHp;
      view.root.rotation.z = Math.sin(b.id) * dmg * 0.12;
      view.root.rotation.x = dmg * 0.08;
      view.bar.set(b.pos, y + 2.6, b.hp / b.maxHp);
    });
  }

  private syncMines(state: GameState): void {
    syncMap(this.mineViews, state.mines, () => {
      const root = new TransformNode("mine", this.scene);
      const parts = this.mine.instance("mineMesh", root);
      return { root, light: parts[2] ?? parts[1], dispose: () => root.dispose() };
    }, (view, m) => {
      view.root.position.set(m.pos.x, terrainHeight(m.pos.x, m.pos.z), m.pos.z);
      // Lumina clipește când mina e armată.
      view.light?.setEnabled(m.armTimer > 0 || Math.sin(this.time * 6 + m.id) > 0);
    });
  }

  private syncCoins(state: GameState): void {
    syncMap(this.coinViews, state.coins, () => this.coin.instance("coin")[0], (view, c) => {
      view.position.set(c.pos.x, terrainHeight(c.pos.x, c.pos.z) + 0.5 + Math.sin(this.time * 4 + c.id) * 0.12, c.pos.z);
      view.rotation.y = this.time * 3 + c.id;
    });
  }

  private syncZones(state: GameState): void {
    syncMap(this.zoneViews, state.zones, (z) => {
      const root = new TransformNode("zone", this.scene);
      const disc = MeshBuilder.CreateDisc("zoneDisc", { radius: 1, tessellation: 36 }, this.scene);
      disc.rotation.x = Math.PI / 2;
      disc.parent = root;
      disc.material = z.kind === "fire" ? this.m.fireZone : this.m.healZone;
      disc.isPickable = false;
      const flames: InstancedMesh[] = [];
      if (z.kind === "fire") {
        for (let i = 0; i < 9; i++) {
          const node = new TransformNode("zf", this.scene);
          node.parent = root;
          const a = (i / 9) * Math.PI * 2;
          const d = i === 0 ? 0 : z.radius * (0.35 + (i % 3) * 0.18);
          node.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
          node.scaling.setAll(1.3);
          flames.push(...this.flame.instance("zFlame", node));
        }
      }
      return { root, disc, flames, dispose: () => root.dispose() };
    }, (view, z) => {
      view.root.position.set(z.pos.x, terrainHeight(z.pos.x, z.pos.z) + 0.06, z.pos.z);
      const pulse = 1 + Math.sin(this.time * 5) * 0.04;
      view.disc.scaling.set(z.radius * pulse, z.radius * pulse, 1);
      view.flames.forEach((f, i) => f.scaling.set(1, 0.7 + Math.abs(Math.sin(this.time * 9 + i * 1.3)) * 0.9, 1));
    });
  }

  // ---------- Mod construcție ----------

  /** Transformă un punct de pe ecran în poziție pe sol (sau null). */
  pickGround(screenX: number, screenY: number): Vec2 | null {
    const ray = this.scene.createPickingRay(screenX, screenY, null, this.camera);
    if (ray.direction.y >= 0) return null;
    // Intersecție cu planul y = 0, apoi câteva corecții după relieful terenului.
    let t = -ray.origin.y / ray.direction.y;
    for (let i = 0; i < 3; i++) {
      const x = ray.origin.x + ray.direction.x * t;
      const z = ray.origin.z + ray.direction.z * t;
      t = (terrainHeight(x, z) - ray.origin.y) / ray.direction.y;
    }
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  /** Arată „fantoma” construcției (verde = se poate construi, roșu = nu), cu aceeași formă ca finalul. */
  setGhost(pos: Vec2 | null, kind: BuildKind, valid: boolean, range = 0, rotation = 0): void {
    const isTower = kind === "tower";
    this.ghostTower.setEnabled(!!pos && isTower);
    this.ghostWall.setEnabled(!!pos && !isTower);
    this.rangeRing.setEnabled(!!pos && range > 0);
    if (!pos) return;
    const node = isTower ? this.ghostTower : this.ghostWall;
    node.position.set(pos.x, terrainHeight(pos.x, pos.z), pos.z);
    node.rotation.y = rotation;
    for (const g of this.ghostParts) g.material = valid ? this.m.ghostOk : this.m.ghostBad;
    this.rangeRing.position.set(pos.x, terrainHeight(pos.x, pos.z) + 0.1, pos.z);
    this.rangeRing.scaling.set(range, 1, range);
  }

  hideGhost(): void {
    this.setGhost(null, "tower", false);
  }

  /** Inel auriu sub construcția selectată (pentru editare). */
  setSelection(pos: Vec2 | null, radius = 1.6): void {
    this.selectRing.setEnabled(!!pos);
    if (!pos) return;
    this.selectRing.position.set(pos.x, terrainHeight(pos.x, pos.z) + 0.12, pos.z);
    this.selectRing.scaling.set(radius, 1, radius);
  }

  /** Șterge toate entitățile (pentru „Joacă din nou”). */
  reset(): void {
    const maps: Map<EntityId, { dispose(): void }>[] = [
      this.heroViews, this.zombieViews, this.towerViews, this.barricadeViews, this.coinViews, this.zoneViews, this.mineViews,
    ];
    for (const map of maps) {
      for (const v of map.values()) v.dispose();
      map.clear();
    }
    for (const d of this.dying) d.view.dispose();
    this.dying = [];
    this.hideGhost();
    this.setSelection(null);
    this.night = 0;
  }

  render(): void {
    this.scene.render();
  }
}

/**
 * Ține un Map id → obiect 3D sincronizat cu o listă de entități:
 * creează ce e nou, actualizează ce există, șterge ce a dispărut.
 * `onRemove` poate prelua obiectul (returnând true) ca să-l animeze înainte să dispară.
 */
function syncMap<V extends { dispose(): void }, E extends { id: EntityId }>(
  views: Map<EntityId, V>,
  entities: readonly E[],
  create: (entity: E) => V,
  update: (view: V, entity: E) => void,
  onRemove?: (id: EntityId, view: V) => boolean,
): void {
  const seen = new Set<EntityId>();
  for (const e of entities) {
    seen.add(e.id);
    let view = views.get(e.id);
    if (!view) {
      view = create(e);
      views.set(e.id, view);
    }
    update(view, e);
  }
  for (const [id, view] of views) {
    if (seen.has(id)) continue;
    if (!onRemove?.(id, view)) view.dispose();
    views.delete(id);
  }
}
