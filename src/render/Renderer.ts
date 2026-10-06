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
  StandardMaterial,
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
  type Shell,
  type TowerKind,
  type Vec2,
  type ZombieType,
  GAME_MAP,
  effectiveTowerStats,
  segmentEnds,
} from "../core";
import { Fx } from "./Fx";
import { buildPickaxe, buildRod } from "./models/gathering";
import { Materials, ModelKit, type Quality } from "./ModelKit";
import { type HeroModel, type ZombieModel, buildHero, buildZombie } from "./models/characters";
import {
  type ShellModel,
  type WallState,
  TOWER_COLORS,
  buildCoin,
  buildFlame,
  buildIceShell,
  buildMine,
  buildShell,
  buildTowerBase,
  buildTowerHead,
  buildWall,
  towerHeadY,
} from "./models/structures";
import { PAL, hex, mix } from "./palette";
import { terrainHeight } from "./Terrain";
import { SurvivalView } from "./SurvivalView";
import { Prefab, World } from "./World";

const CAMERA_OFFSET = new Vector3(0, 20, -15);
const ZOMBIE_SCALE: Record<ZombieType, number> = { walker: 1, runner: 0.88, spitter: 1, flyer: 1, brute: 1, boss: 1 };
const HP_BAR_Y: Partial<Record<ZombieType, number>> = { brute: 3.0, boss: 5.3 };
/** Turnurile sunt desenate puțin mai mici decât modelul (mai ușor de așezat). */
const TOWER_SCALE = 0.85;

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
  set(pos: Vec2, y: number, ratio: number, force = false): void {
    const show = force || ratio < 0.999;
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
  lastPos: Vec2;
  walk: number;
  lastStepPhase: number;
  stepSide: number;
  kneel: number;
  recoil: number;
  /** Uneltele din mână: târnăcopul (cu lovitura) și undița (cu vârful, pentru fir). */
  pickaxe: TransformNode;
  rod: TransformNode;
  rodTip: TransformNode;
  swing: number;
  toolShow: number;
  reload: number;
  reloadTotal: number;
  dispose(): void;
}

interface ZombieView {
  root: TransformNode;
  armL: TransformNode;
  armR: TransformNode;
  legL: TransformNode;
  legR: TransformNode;
  fire: TransformNode | null;
  ice: InstancedMesh | null;
  printDist: number;
  printSide: number;
  bar: HpBar | null;
  type: ZombieType;
  walk: number;
  lastPos: Vec2;
  knock: number;
  attack: number;
  lastBlood: number;
  dispose(): void;
}

interface TowerView {
  root: TransformNode;
  base: InstancedMesh[];
  head: TransformNode;
  key: string;
  level: number;
  kind: TowerKind;
  kick: number;
  bar: HpBar;
  /** Flăcări mici pe turnul aproape distrus (sub 25% viață). */
  fire: TransformNode | null;
  dispose(): void;
}

interface ShellView {
  mesh: InstancedMesh;
  last: Vector3 | null;
  trail: number;
  dispose(): void;
}

/** O construcție distrusă care se prăbușește (animație), apoi dispare. */
interface Collapse {
  root: TransformNode;
  t: number;
  tiltX: number;
  tiltZ: number;
  y0: number;
  /** Bara de viață rămâne o clipă la zero înainte să dispară construcția. */
  bar: HpBar | null;
  barPos: Vec2;
  barY: number;
}

interface BarricadeView {
  root: TransformNode;
  parts: InstancedMesh[];
  key: string;
  bar: HpBar;
  dispose(): void;
}

export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private camera: FreeCamera;
  private mats: Materials;
  private world: World;
  private fx: Fx;
  private survival: SurvivalView;
  private night = 0;
  private time = 0;
  private cameraOffset = CAMERA_OFFSET.clone();
  /** Meniul principal: camera se rotește lent în jurul minei (scena din fundal). */
  menuCamera = false;
  private localHeroId: EntityId | null = null;
  /** Câți pași a făcut eroul local de la ultima citire (pentru sunetul de pași). */
  private steps = 0;

  private zombiePrefabs = {} as Record<ZombieType, { model: ZombieModel; body: Prefab; armL: Prefab; armR: Prefab; legL: Prefab; legR: Prefab }>;
  private towerBases: Prefab[] = [];
  private towerHeads = new Map<string, Prefab>();
  private shellPrefabs = {} as Record<ShellModel, Prefab>;
  private iceShell!: Prefab;
  private flame!: Prefab;
  private pickaxePrefab!: Prefab;
  private rodPrefab!: Prefab;
  private walls = new Map<string, Prefab>();
  private mine!: Prefab;
  private coin!: Prefab;
  private glob!: Prefab;

  private heroViews = new Map<EntityId, HeroView>();
  private zombieViews = new Map<EntityId, ZombieView>();
  private dying: { view: ZombieView; t: number; burned: boolean }[] = [];
  private towerViews = new Map<EntityId, TowerView>();
  private barricadeViews = new Map<EntityId, BarricadeView>();
  private mineViews = new Map<EntityId, { root: TransformNode; light: InstancedMesh | undefined; dispose(): void }>();
  private coinViews = new Map<EntityId, InstancedMesh>();
  private projectileViews = new Map<EntityId, { mesh: InstancedMesh; trail: number; dispose(): void }>();
  private shellViews = new Map<EntityId, ShellView>();
  private fireViews = new Map<EntityId, { root: TransformNode; flames: TransformNode[]; dispose(): void }>();
  private collapsing: Collapse[] = [];
  private destroyed = new Set<EntityId>();
  private killed = new Map<EntityId, boolean>();
  private shelterShake = 0;
  /** Timpul de la căderea minei (pentru al doilea „crac” și praful la trântirea capacului). */
  private mineCrack = -1;

  private ghostTower: TransformNode;
  private ghostWall: TransformNode;
  private ghostParts: Mesh[] = [];
  private footTower: Mesh;
  private footWall: Mesh;
  private rangeRing: Mesh;
  private selectRing: Mesh;
  /** Construcția selectată (inel + contur + bara de viață mereu vizibilă). */
  selectedId: EntityId | null = null;
  /** Conturul: copii puțin mai mari ale pieselor, din care se văd doar fețele din spate. */
  private outline: { id: EntityId; parts: InstancedMesh[]; hulls: Mesh[] } | null = null;
  private outlineMat: StandardMaterial | null = null;
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
    this.world = new World(this.scene, this.mats, this.camera);
    this.fx = new Fx(this.scene, this.mats);
    this.survival = new SurvivalView(this.scene, this.mats, this.fx, this.world.shadows);

    const tint = (name: string, c: Color3, a: number) => (this.m[name] = this.mats.tint(name, c, a));
    tint("ghostOk", new Color3(0.35, 1, 0.5), 0.3);
    tint("ghostBad", new Color3(1, 0.3, 0.25), 0.3);
    tint("footOk", new Color3(0.3, 1, 0.45), 0.65);
    tint("footBad", new Color3(1, 0.25, 0.2), 0.65);
    tint("range", PAL.ice, 0.5);
    tint("select", PAL.gold, 0.85);
    tint("hpBg", new Color3(0.05, 0.06, 0.08), 0.75);
    tint("hpZombie", mix(PAL.blood, new Color3(1, 0.2, 0.2), 0.5), 1);
    tint("hpWall", mix(PAL.oldWood, PAL.gold, 0.5), 1);

    this.createPrefabs();

    // Fantome pentru construcție: aceeași formă ca turnul / zidul final, plus „baza” pe sol bine vizibilă.
    this.ghostTower = new TransformNode("ghostTower", this.scene);
    this.ghostTower.scaling.setAll(TOWER_SCALE);
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
    ghostOf(this.towerHeads.get("crossbow1")!.sources, this.ghostTower, towerHeadY(1));
    ghostOf(this.walls.get("1intact")!.sources, this.ghostWall);
    this.footTower = MeshBuilder.CreateDisc("footTower", { radius: CONFIG.tower.radius + 0.2, tessellation: 40 }, this.scene);
    this.footTower.rotation.x = Math.PI / 2;
    this.footWall = MeshBuilder.CreateBox("footWall", { width: CONFIG.barricade.length, height: 0.02, depth: CONFIG.barricade.thickness + 0.35 }, this.scene);
    this.rangeRing = MeshBuilder.CreateTorus("range", { diameter: 2, thickness: 0.05, tessellation: 64 }, this.scene);
    this.rangeRing.material = this.m.range;
    this.selectRing = MeshBuilder.CreateTorus("select", { diameter: 2, thickness: 0.1, tessellation: 40 }, this.scene);
    this.selectRing.material = this.m.select;
    for (const g of [this.ghostTower, this.ghostWall, this.footTower, this.footWall, this.rangeRing, this.selectRing]) g.setEnabled(false);
    for (const g of [this.footTower, this.footWall, this.rangeRing, this.selectRing]) g.isPickable = false;

    window.addEventListener("resize", () => this.engine.resize());
  }

  private createPrefabs(): void {
    const s = this.scene;
    const caster = (p: Prefab) => {
      for (const src of p.sources) this.world.shadows.addShadowCaster(src);
    };
    for (const type of ["walker", "runner", "spitter", "flyer", "brute", "boss"] as ZombieType[]) {
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
    for (let level = 1; level <= CONFIG.tower.maxLevel; level++) {
      this.towerBases.push(new Prefab(buildTowerBase(s, this.mats, level)));
      for (const kind of Object.keys(CONFIG.tower.kinds) as TowerKind[]) {
        this.towerHeads.set(`${kind}${level}`, new Prefab(buildTowerHead(s, this.mats, kind, level)));
      }
    }
    [...this.towerBases, ...this.towerHeads.values()].forEach(caster);
    for (const model of ["arrow", "heavy", "rocket", "ball", "fireball", "ice"] as ShellModel[]) {
      this.shellPrefabs[model] = new Prefab([buildShell(s, this.mats, model)]);
    }
    this.iceShell = new Prefab([buildIceShell(s, this.mats)]);
    this.flame = new Prefab([buildFlame(s, this.mats)]);
    this.pickaxePrefab = new Prefab(buildPickaxe(s, this.mats));
    this.rodPrefab = new Prefab(buildRod(s, this.mats));
    for (const level of [1, 2, 3]) {
      for (const door of [false, true]) {
        for (const st of ["intact", "cracked", "broken"] as WallState[]) {
          const prefab = new Prefab(buildWall(s, this.mats, level, door, st));
          caster(prefab);
          this.walls.set(`${level}${door ? "d" : ""}${st}`, prefab);
        }
      }
    }
    this.mine = new Prefab(buildMine(s, this.mats));
    this.coin = new Prefab([buildCoin(s, this.mats)]);
    const gk = new ModelKit(s, this.mats, 1300);
    gk.sphere(0.4, 8, {}, { color: hex("#9fe8c0"), mat: "glow" });
    this.glob = new Prefab([gk.buildOne("glob")]);
  }

  // ---------- Sincronizare cu starea ----------

  /** Apelată o dată pe cadru: aduce scena la zi cu starea jocului. */
  sync(state: GameState, events: GameEvent[], localPlayerId: string, dt: number): void {
    this.time += dt;
    this.killed.clear();
    this.destroyed.clear();
    const me = state.players[localPlayerId];
    this.localHeroId = me?.heroId ?? null;
    for (const e of events) this.handleEvent(state, e);

    this.syncHeroes(state, dt);
    this.syncZombies(state, dt);
    this.syncTowers(state, dt);
    this.syncBarricades(state);
    this.syncMines(state);
    this.syncCoins(state);
    this.syncProjectiles(state);
    this.syncShells(state);
    this.syncFires(state);
    this.survival.sync(state, dt);
    // Selecția: inelul pulsează ușor; dacă ținta a dispărut, selecția se șterge.
    if (this.selectedId !== null) {
      const id = this.selectedId;
      const alive = state.towers.some((t) => t.id === id) || state.barricades.some((b) => b.id === id) ||
        state.campfires.some((f) => f.id === id) || state.farms.some((f) => f.id === id);
      if (!alive) this.setSelection(null);
    }
    if (this.selectRing.isEnabled()) this.selectRing.rotation.y = this.time * 0.8;
    this.syncOutline();
    this.updateDying(dt);
    this.updateCollapsing(dt);
    this.fx.update(dt);

    // Adăpostul tremură când e lovit.
    this.shelterShake = Math.max(0, this.shelterShake - dt * 4);
    if (this.mineCrack >= 0) {
      const before = this.mineCrack;
      this.mineCrack += dt;
      if (before < 1.6 && this.mineCrack >= 1.6) {
        // Capacul s-a trântit: un nor de zăpadă și praf din jurul gurii puțului.
        this.shelterShake = 1.5;
        this.fx.dust(new Vector3(0, 1, 0), 2, 1);
        this.fx.burst("snow", new Vector3(0, 1.2, 0), null, 24, 5, 0.16);
      }
      if (this.mineCrack > 3) this.mineCrack = -1;
    }
    this.world.shelter.position.x = Math.sin(this.time * 60) * 0.06 * this.shelterShake;

    // Zi / noapte: amurgul începe în ultimele 12 secunde ale zilei.
    let target = this.night;
    if (state.phase === "night" || this.menuCamera) target = 1;
    else if (state.phase === "day") target = state.phaseTimer < 12 ? 0.6 * (1 - state.phaseTimer / 12) : 0;
    else if (state.phase === "victory") target = 0;
    this.night += (target - this.night) * Math.min(1, dt * 0.5);

    // Camera urmărește lin eroul local; felinarul lui se aprinde noaptea.
    // În meniu: o rotire lentă, cinematică, în jurul minei.
    const hero = me && state.heroes.find((h) => h.id === me.heroId);
    const focus = hero ? new Vector3(hero.pos.x, terrainHeight(hero.pos.x, hero.pos.z), hero.pos.z) : Vector3.Zero();
    if (this.menuCamera) {
      // Camera stă la sud de mină (acolo e loc liber) și se leagănă încet stânga-dreapta.
      const a = Math.PI + Math.sin(this.time * 0.05) * 0.45;
      this.camera.position.set(Math.sin(a) * 11, 3.6 + Math.sin(this.time * 0.13) * 0.4, Math.cos(a) * 11);
      // Ținta e puțin în dreapta, ca scena să stea în stânga ecranului (meniul e în dreapta).
      this.camera.setTarget(new Vector3(-Math.cos(a) * 4, 2, Math.sin(a) * 4 + 2));
    } else {
      Vector3.LerpToRef(this.camera.position, focus.add(this.cameraOffset), Math.min(1, dt * 5), this.camera.position);
      this.camera.setTarget(this.camera.position.subtract(this.cameraOffset));
    }
    if (hero) this.world.lantern.position.set(hero.pos.x, focus.y + 2.6, hero.pos.z);
    this.world.setWeather(state.weather);
    this.world.syncTrees(state.treeHits, CONFIG.gather.treeHits, dt);
    this.world.setFogCloseIn(state.difficulty === "nightmare" ? 0.75 : state.difficulty === "hard" ? 0.5 : 0);
    this.world.update(dt, this.night, focus, this.camera.position);
  }

  /** Cât de „noapte” e acum (0..1) — util pentru sunet și muzică. */
  get nightAmount(): number {
    return this.night;
  }

  /** Câți pași a făcut eroul local de la ultima întrebare (pentru sunetul de pași). */
  drainSteps(): number {
    const n = this.steps;
    this.steps = 0;
    return n;
  }

  /** Calitatea grafică (din meniu): rezoluția randării + umbre, SSAO, efecte. */
  setQuality(q: Quality): void {
    const dpr = window.devicePixelRatio || 1;
    this.engine.setHardwareScalingLevel(1 / Math.min(dpr, q === "high" ? 2 : q === "medium" ? 1.5 : 1));
    this.world.setQuality(q);
  }

  /** Poziția pe ecran (în pixeli CSS) a unui punct de pe hartă. */
  projectToScreen(p: Vec2, y = 0): { x: number; y: number } {
    const engine = this.engine;
    // Folosim direct matricele camerei (nu „transformarea curentă” a scenei, pe care umbrele
    // o schimbă temporar — de aici săreau etichetele aleatoriu pe ecran).
    const viewProj = this.camera.getViewMatrix().multiply(this.camera.getProjectionMatrix());
    const v = Vector3.Project(
      this.at(p, y),
      Matrix.Identity(),
      viewProj,
      this.camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()),
    );
    const scale = engine.getHardwareScalingLevel();
    return { x: v.x * scale, y: v.y * scale };
  }

  /** Pentru depanare/capturi: mută camera mai aproape sau mai departe. */
  setCameraOffset(x: number, y: number, z: number): void {
    this.cameraOffset.set(x, y, z);
  }

  private at(p: Vec2, y = 0): Vector3 {
    return new Vector3(p.x, terrainHeight(p.x, p.z) + y, p.z);
  }

  private zombieY(type: ZombieType): number {
    return CONFIG.zombies[type].flying ? CONFIG.zombieCommon.flyHeight : 0;
  }

  private handleEvent(state: GameState, e: GameEvent): void {
    switch (e.type) {
      case "towerFired":
        this.onTowerFired(state, e.towerId, e.kind, e.to, e.special);
        break;
      case "towerAbility":
        this.onTowerAbility(state, e.towerId, e.kind, e.pos, e.to);
        break;
      case "shellHit":
        this.onShellHit(e.kind, e.special, e.pos, e.splash);
        break;
      case "towerHit":
        this.fx.burst("stone", this.at(e.pos, 0.9), null, 3, 3, 0.1);
        break;
      case "towerDestroyed":
        this.destroyed.add(e.id);
        this.fx.dust(this.at(e.pos, 0.3), 1.8, 1.4);
        this.fx.burst("stone", this.at(e.pos, 1.2), null, 10, 5, 0.16);
        this.fx.burst("plank", this.at(e.pos, 1.8), null, 8, 5, 0.12);
        break;
      case "chestHit":
        this.fx.burst("wood", this.at(e.pos, 0.6), null, 5, 4, 0.08);
        this.fx.burst("spark", this.at(e.pos, 0.6), null, 3, 3, 0.05);
        break;
      case "barricadeRepaired":
        this.fx.dust(this.at(e.pos, 0.2), 1.2, 0.5);
        this.fx.ring(this.at(e.pos, 0.15), 1.6, PAL.gold, 0.5);
        break;
      case "structureRemoved":
        this.fx.dust(this.at(e.pos, 0.2), 1.2, 0.6);
        this.fx.burst("wood", this.at(e.pos, 0.5), null, 8, 4, 0.1);
        break;
      case "buildingPlaced":
        this.fx.burst("snow", this.at(e.pos, 0.3), null, 12, 3, 0.16);
        break;
      case "animalHit": {
        const dir = new Vector3(e.pos.x - e.from.x, 0.25, e.pos.z - e.from.z);
        this.fx.blood(this.at(e.pos, 0.9), dir.lengthSquared() > 0.01 ? dir : null, 0.7);
        break;
      }
      case "animalDied":
        this.fx.blood(this.at(e.pos, 0.7), null, e.kind === "bear" ? 2 : 1);
        this.fx.decal(e.pos.x, e.pos.z, e.kind === "bear" ? 2 : 1);
        break;
      case "cooked":
      case "fuelAdded":
        this.fx.burst("spark", this.at(e.pos, 0.6), new Vector3(0, 1, 0), 10, 3, 0.06);
        break;
      case "fireOut":
        this.fx.burst("smoke", this.at(e.pos, 0.5), null, 10, 1, 0.4);
        break;
      case "picked":
        this.fx.burst(e.kind === "ammo" ? "spark" : "snow", this.at(e.pos, 0.4), new Vector3(0, 1, 0), 6, 2.5, 0.06);
        break;
      case "chestOpened":
        this.fx.ring(this.at(e.pos, 0.15), 3, PAL.gold, 0.8);
        this.fx.burst("spark", this.at(e.pos, 1), null, 30, 7, 0.09);
        this.fx.muzzle(this.at(e.pos, 1), PAL.gold, 2.2, 0.25);
        break;
      case "shot": {
        const hero = e.heroId !== undefined ? state.heroes.find((h) => h.id === e.heroId) : undefined;
        const view = hero && this.heroViews.get(hero.id);
        const from = hero && view ? this.muzzleOf(hero, view) : this.at(e.from, 1.3);
        if (view) view.recoil = 1;
        const weapon = hero ? state.players[hero.playerId]?.weapon : undefined;
        const end = this.at(e.to, 1.1);
        const cls = hero?.heroClass;
        if (weapon === "iceLance") {
          this.fx.tracer(from, end, PAL.ice, 0.06, 0.18, true);
        } else if (cls === "sniper" || weapon === "hunting") {
          // Sniper: trasor lung și rece care rămâne o clipă în aer.
          this.fx.tracer(from, end, mix(PAL.ice, PAL.snow, 0.4), e.crit ? 0.07 : 0.045, 0.3, true);
          this.fx.bullet(from, end, PAL.snow, 0.06, 1.2, 160);
        } else if (cls === "tank" || weapon === "scattergun") {
          // Alice: scurte și închise la culoare; la izbitură, o undă de praf și zăpadă.
          this.fx.bullet(from, end, mix(PAL.fire, PAL.iron, 0.5), 0.04, 0.3, 70);
          if (Math.random() < 0.5) this.fx.impactWave(end, 0.7);
        } else {
          // Pușca: glonț scurt de fier cu urmă caldă, până în primul zombi sau în zăpadă.
          this.fx.bullet(from, end, mix(PAL.fire, PAL.bone, 0.45), 0.05, 0.55, 95);
          this.fx.tracer(from, end, mix(PAL.fire, PAL.bone, 0.6), 0.015, 0.05);
        }
        // Ratat: zăpada sare o dată, unde s-a oprit glonțul. (Lovit: zombiul tresare — vezi zombieHit.)
        if (!e.hit) this.fx.burst("snow", this.at(e.to, 0.1), new Vector3(0, 1, 0), 5, 2.4, 0.08);
        this.fx.muzzle(from, weapon === "iceLance" ? PAL.ice : PAL.fire, cls === "tank" ? 0.45 : 0.3);
        break;
      }
      case "reloadStart": {
        const v = this.heroViews.get(e.heroId);
        if (v) {
          v.reload = e.time;
          v.reloadTotal = e.time;
        }
        break;
      }
      case "zombieHit": {
        const view = this.zombieViews.get(e.id);
        // Limităm sângele per zombie (să nu facem sute de particule pe secundă).
        if (view && this.time - view.lastBlood < 0.07) break;
        if (view) {
          view.lastBlood = this.time;
          view.knock = 1;
        }
        const z = state.zombies.find((x) => x.id === e.id);
        const h = (view ? (HP_BAR_Y[view.type] ?? 1.5) * 0.65 : 1.1) + (z ? this.zombieY(z.type) : 0);
        const dir = new Vector3(e.pos.x - e.from.x, 0.25, e.pos.z - e.from.z);
        this.fx.blood(this.at(e.pos, h), dir.lengthSquared() > 0.01 ? dir : null, view?.type === "boss" || view?.type === "brute" ? 1.6 : 1);
        if (Math.random() < 0.3) this.fx.decal(e.pos.x + dir.x * 0.1 + (Math.random() - 0.5), e.pos.z + dir.z * 0.1 + (Math.random() - 0.5), 0.6);
        break;
      }
      case "zombieDied": {
        const big = e.zombieType === "boss" ? 3 : e.zombieType === "brute" ? 1.8 : 1;
        if (!e.burned) {
          this.fx.blood(this.at(e.pos, 1), null, 1.5 * big);
          this.fx.decal(e.pos.x, e.pos.z, 1.4 * big);
          if (big > 1) this.fx.burst("bone", this.at(e.pos, 1.2), null, 8, 5, 0.12);
        } else {
          this.fx.burst("spark", this.at(e.pos, 1), null, 10, 3, 0.08);
        }
        if (e.zombieType === "spitter") this.fx.burst("venom", this.at(e.pos, 1.2), null, 14, 4, 0.1);
        this.killed.set(e.id, e.burned);
        break;
      }
      case "zombieAttack": {
        const v = this.zombieViews.get(e.id);
        if (v) v.attack = 1;
        break;
      }
      case "heroHit": {
        // Sânge din erou, în direcția opusă loviturii.
        const dir = new Vector3(e.pos.x - e.from.x, 0.3, e.pos.z - e.from.z);
        this.fx.blood(this.at(e.pos, 1.3), dir.lengthSquared() > 0.01 ? dir : null, 0.8);
        if (Math.random() < 0.5) this.fx.decal(e.pos.x + (Math.random() - 0.5) * 0.6, e.pos.z + (Math.random() - 0.5) * 0.6, 0.45);
        break;
      }
      case "spit":
        this.fx.burst("venom", this.at(e.from, 1.6), new Vector3(e.to.x - e.from.x, 0.5, e.to.z - e.from.z), 5, 3, 0.07);
        break;
      case "projectileHit":
        this.fx.burst("venom", this.at(e.pos, 1), null, 12, 3.5, 0.09);
        this.fx.ring(this.at(e.pos, 0.1), 1.2, hex("#9fe8c0"), 0.35);
        break;
      case "barricadeHit":
        this.fx.burst("wood", this.at(e.pos, 0.9), null, 3, 3, 0.08);
        break;
      case "barricadeDestroyed":
        this.destroyed.add(e.id);
        this.fx.dust(this.at(e.pos, 0.2), 1.3, 0.9);
        this.fx.burst("plank", this.at(e.pos, 1), null, 7, 5, 0.12);
        this.fx.burst("wood", this.at(e.pos, 0.8), null, 10, 6, 0.1);
        this.fx.burst("snow", this.at(e.pos, 0.3), null, 12, 4, 0.18);
        break;
      case "mineExploded":
        this.fx.explosion(this.at(e.pos), e.radius);
        break;
      case "toolHit": {
        const v = this.heroViews.get(e.heroId);
        if (v) {
          v.swing = 1;
          v.toolShow = 0.6;
        }
        const at = this.at(e.pos, e.target === "tree" ? 1.1 : 0.5);
        if (e.target === "tree") {
          // Așchii de lemn și zăpadă care cade din crengi.
          this.fx.burst("wood", at, null, 5, 3.5, 0.07);
          this.fx.burst("snow", this.at(e.pos, 3.5), new Vector3(0, -1, 0), 6, 1.5, 0.1);
        } else if (e.target === "ore") {
          this.fx.burst("spark", at, null, 6, 4, 0.05);
          this.fx.burst("stone", at, null, 4, 3, 0.08);
        }
        break;
      }
      case "treeFelled":
        this.fx.dust(this.at(e.pos, 0.3), 2.2, 1);
        this.fx.burst("snow", this.at(e.pos, 2), null, 30, 5, 0.18);
        this.fx.burst("plank", this.at(e.pos, 1), null, 5, 4, 0.12);
        break;
      case "oreSpawned":
        this.fx.burst("snow", this.at(e.pos, 0.4), new Vector3(0, 1, 0), 10, 2.5, 0.12);
        break;
      case "oreMined":
        this.fx.burst("stone", this.at(e.pos, 0.5), null, 14, 5, 0.12);
        this.fx.burst("spark", this.at(e.pos, 0.6), new Vector3(0, 1, 0), 18, 5, 0.06);
        this.fx.ring(this.at(e.pos, 0.15), 1.6, PAL.gold, 0.5);
        break;
      case "fishCast":
      case "fishBite":
      case "fishCaught":
        // Stropi de apă din copcă (la prindere: și peștele care sare).
        this.fx.burst("ice", this.at(e.pos, 0.2), new Vector3(0, 1, 0), e.type === "fishCast" ? 4 : 10, e.type === "fishCaught" ? 5 : 2.5, 0.07);
        if (e.type === "fishCaught") this.fx.burst("snow", this.at(e.pos, 0.3), new Vector3(0, 1, 0), 12, 4, 0.08);
        break;
      case "sold":
        this.fx.burst("spark", this.at(e.pos, 1.4), new Vector3(0, 1, 0), 24, 4, 0.06);
        this.fx.ring(this.at(e.pos, 0.15), 2.2, PAL.gold, 0.6);
        break;
      case "gameOver":
        if (state.mode === "defend" && state.shelter.hp <= 0) {
          // Mina cade: crapă (pietre + praf), plasma pâlpâie, capacul se trântește (vezi World).
          this.world.mineFall();
          this.shelterShake = 2;
          this.fx.dust(new Vector3(0, 0.4, 0), 2.6, 1.2);
          this.fx.burst("stone", new Vector3(0, 1.2, 0), null, 18, 6, 0.18);
          this.fx.burst("plasma", new Vector3(0, 1.2, 0), new Vector3(0, 1, 0), 24, 5, 0.1);
          this.mineCrack = 0;
        }
        break;
      case "shelterHit":
        this.shelterShake = 1;
        if (Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          this.fx.burst("plasma", new Vector3(Math.cos(a) * 1.6, 1.2, Math.sin(a) * 1.6), null, 4, 3, 0.08);
          this.fx.burst("stone", new Vector3(Math.cos(a) * 2, 0.8, Math.sin(a) * 2), null, 2, 3, 0.1);
        }
        break;
      case "levelUp": {
        const h = state.heroes.find((x) => x.id === e.heroId);
        if (h) {
          this.fx.ring(this.at(h.pos, 0.15), 2.6, PAL.gold, 0.8);
          this.fx.burst("spark", this.at(h.pos, 1.5), null, 16, 5, 0.07);
        }
        break;
      }
      case "towerUpgraded": {
        const t = state.towers.find((x) => x.id === e.id);
        if (t) {
          this.fx.burst("spark", this.at(t.pos, 2.5), null, 18, 4, 0.08);
          this.fx.ring(this.at(t.pos, 0.2), 2.2, TOWER_COLORS[t.kind], 0.6);
          this.fx.dust(this.at(t.pos, 0.2), 1, 0.4);
        }
        break;
      }
      case "barricadePlaced":
      case "towerPlaced":
      case "barricadeChanged": {
        const b = state.barricades.find((x) => x.id === e.id) ?? state.towers.find((x) => x.id === e.id);
        if (b) this.fx.burst("snow", this.at(b.pos, 0.3), null, 12, 3, 0.16);
        break;
      }
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
    const model = buildHero(this.scene, this.mats, { heroClass: hero.heroClass, coat, level: hero.level, weapon: p?.weapon ?? "rusty", accessory: skin?.accessory });
    const root = new TransformNode("hero", this.scene);
    const body = new TransformNode("heroBody", this.scene);
    body.parent = root;
    for (const m of model.body) m.parent = body;
    for (const leg of [model.legL, model.legR]) {
      leg.hip.parent = root;
      for (const m of leg.meshes) this.world.shadows.addShadowCaster(m);
    }
    for (const m of model.body) this.world.shadows.addShadowCaster(m);
    return {
      root,
      body,
      model,
      key: this.heroLookKey(state, hero),
      lastPos: { ...hero.pos },
      walk: 0,
      lastStepPhase: 0,
      stepSide: 1,
      kneel: hero.alive ? 0 : 1,
      recoil: 0,
      reload: 0,
      reloadTotal: 1,
      ...this.heroTools(root),
      swing: 0,
      toolShow: 0,
      dispose: () => root.dispose(),
    };
  }

  /** Târnăcopul și undița, atașate eroului (ascunse până le folosește). */
  private heroTools(root: TransformNode): { pickaxe: TransformNode; rod: TransformNode; rodTip: TransformNode } {
    const pickaxe = new TransformNode("pickaxe", this.scene);
    pickaxe.parent = root;
    pickaxe.position.set(0.42, 1.05, 0.15);
    this.pickaxePrefab.instance("pickaxeMesh", pickaxe);
    pickaxe.setEnabled(false);
    const rod = new TransformNode("rod", this.scene);
    rod.parent = root;
    rod.position.set(0.3, 0.95, 0.25);
    this.rodPrefab.instance("rodMesh", rod);
    const rodTip = new TransformNode("rodTip", this.scene);
    rodTip.parent = rod;
    rodTip.position.set(0, 2.2, 0);
    rod.setEnabled(false);
    return { pickaxe, rod, rodTip };
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
      // Rotire lină spre direcția în care privește.
      let diff = hero.facing - view.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      view.root.rotation.y += diff * Math.min(1, dt * 18);

      // Mers: coapsa se leagănă, genunchiul se îndoaie când piciorul vine în față,
      // corpul urcă și coboară la fiecare pas și se apleacă puțin în față.
      const moved = Math.hypot(hero.pos.x - view.lastPos.x, hero.pos.z - view.lastPos.z);
      view.lastPos = { ...hero.pos };
      const speed = moved / Math.max(dt, 0.001);
      const amp = Math.min(1, speed / 5);
      view.walk += speed * dt * 1.9;
      const w = view.walk;
      const { legL, legR } = view.model;
      legL.hip.rotation.x = Math.sin(w) * 0.75 * amp;
      legR.hip.rotation.x = -Math.sin(w) * 0.75 * amp;
      legL.knee.rotation.x = Math.max(0, -Math.cos(w)) * 1.1 * amp;
      legR.knee.rotation.x = Math.max(0, Math.cos(w)) * 1.1 * amp;
      const bob = Math.abs(Math.sin(w)) * 0.07 * amp;
      const breathe = Math.sin(this.time * 2.2) * 0.012 * (1 - amp);

      // Pași: o urmă în zăpadă și un mic nor de zăpadă la fiecare jumătate de ciclu.
      const phase = Math.floor(w / Math.PI);
      if (phase !== view.lastStepPhase && amp > 0.2 && hero.alive) {
        view.lastStepPhase = phase;
        view.stepSide *= -1;
        const side = view.stepSide * 0.14;
        const fx = hero.pos.x + Math.cos(view.root.rotation.y) * side;
        const fz = hero.pos.z - Math.sin(view.root.rotation.y) * side;
        this.fx.footprint(fx, fz, view.root.rotation.y);
        this.fx.burst("snow", new Vector3(fx, y + 0.05, fz), null, 2, 1.2, 0.06);
        if (hero.id === this.localHeroId) this.steps++;
      }

      // Unelte: târnăcopul cât ții apăsat acțiunea (se ridică și lovește), undița cât pescuiești.
      const fishing = hero.alive && hero.fishTimer >= 0;
      view.toolShow = hero.alive && hero.action && !fishing ? 0.6 : Math.max(0, view.toolShow - dt);
      view.swing = Math.max(0, view.swing - dt * 3.2);
      view.pickaxe.setEnabled(view.toolShow > 0 || view.swing > 0);
      view.pickaxe.rotation.x = 0.9 - 2.9 * view.swing * view.swing;
      view.rod.setEnabled(fishing);
      if (fishing) {
        const bite = hero.biteTimer > 0;
        view.rod.rotation.x = 0.95 + (bite ? Math.sin(this.time * 40) * 0.08 : Math.sin(this.time * 1.7) * 0.03);
        // Firul: de la vârful undiței până la plută, în copcă.
        const hole = GAME_MAP.pond.pos;
        const bob = this.at(hole, 0.12 + (bite ? -0.12 + Math.sin(this.time * 30) * 0.05 : Math.sin(this.time * 3) * 0.03));
        this.fx.tracer(view.rodTip.getAbsolutePosition(), bob, PAL.bone, 0.012, 0.04);
        this.fx.muzzle(bob, bite ? PAL.fire : hex("#d8483a"), 0.12, 0.04);
      }

      // Recul la tragere, animație de reîncărcare, îngenunchere la moarte.
      view.recoil = Math.max(0, view.recoil - dt * 12);
      view.reload = Math.max(0, view.reload - dt);
      const r = view.reloadTotal > 0 ? view.reload / view.reloadTotal : 0;
      const reloadPose = view.reload > 0 ? Math.sin(r * Math.PI) : 0;
      view.kneel += ((hero.alive ? 0 : 1) - view.kneel) * Math.min(1, dt * 6);
      const k = view.kneel;
      view.body.position.y = bob + breathe - k * 0.5;
      view.body.position.z = -view.recoil * 0.06;
      view.body.rotation.x = amp * 0.12 - view.recoil * 0.08 + reloadPose * 0.35 + k * 0.45;
      view.body.rotation.z = reloadPose * 0.25 + Math.sin(w) * 0.03 * amp;
      if (k > 0.01) {
        legL.hip.rotation.x = -k * 1.4;
        legL.knee.rotation.x = k * 1.5;
        legR.hip.rotation.x = k * 0.3;
        legR.knee.rotation.x = k * 1.8;
      }
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
      fire: null,
      ice: null,
      printDist: 0,
      printSide: 1,
      bar,
      type,
      walk: (id * 1.7) % 6,
      lastPos: { ...pos },
      knock: 0,
      attack: 0,
      lastBlood: -1,
      dispose: () => {
        root.dispose();
        view.bar?.dispose();
      },
    };
    return view;
  }

  /**
   * Gheața nu face nor: apare doar o crustă pe zombi. 1 = încetinit (crustă subțire, pe jumătate),
   * 2 = înghețat (crustă întreagă). Când crusta se sparge, cad câteva cioburi.
   */
  private setFrozen(view: ZombieView, level: 0 | 1 | 2): void {
    if (level > 0 && !view.ice) {
      const [ice] = this.iceShell.instance("zIce", view.root);
      view.ice = ice;
    }
    if (view.ice && level > 0) {
      const big = view.type === "boss" ? 2.4 : view.type === "brute" ? 1.6 : view.type === "runner" ? 1.1 : 1;
      // Încetinit: crusta stă jos, pe picioare; înghețat: îl acoperă tot.
      view.ice.scaling.set(big * (level === 2 ? 1 : 0.85), big * (level === 2 ? 1 : 0.45), big * (level === 2 ? 1 : 0.85));
      view.ice.position.y = 0;
    } else if (level === 0 && view.ice) {
      view.ice.dispose();
      view.ice = null;
      this.fx.burst("ice", view.root.position.add(new Vector3(0, 0.6, 0)), null, 6, 3, 0.07);
    }
  }

  /** Flăcări pe un zombie care arde în zori. */
  private ignite(view: ZombieView): void {
    const fire = new TransformNode("zFire", this.scene);
    fire.parent = view.root;
    const big = view.type === "boss" ? 2.2 : view.type === "brute" ? 1.5 : 1;
    for (let i = 0; i < 4; i++) {
      const node = new TransformNode("zf", this.scene);
      node.parent = fire;
      node.position.set(Math.cos(i * 1.7) * 0.25 * big, 0.6 * big + i * 0.25 * big, Math.sin(i * 1.7) * 0.2 * big);
      node.scaling.setAll(0.9 * big);
      this.flame.instance("zFlame", node);
    }
    view.fire = fire;
  }

  /**
   * Nightmare: fugarii sunt invizibili în întuneric. Îi vezi doar în lumina unui foc aprins,
   * în raza unui Tesla sau foarte aproape de un erou. (Urmele lor în zăpadă rămân.)
   */
  private revealers(state: GameState): { x: number; z: number; r2: number }[] | null {
    if (state.difficulty !== "nightmare") return null;
    const out: { x: number; z: number; r2: number }[] = [];
    for (const f of state.campfires) if (f.fuel > 0) out.push({ x: f.pos.x, z: f.pos.z, r2: (CONFIG.survival.fireWarmRadius + 1.5) ** 2 });
    for (const t of state.towers) if (t.kind === "tesla") out.push({ x: t.pos.x, z: t.pos.z, r2: effectiveTowerStats(state, t).range ** 2 });
    for (const h of state.heroes) if (h.alive) out.push({ x: h.pos.x, z: h.pos.z, r2: 3.5 ** 2 });
    return out;
  }

  private syncZombies(state: GameState, dt: number): void {
    const reveal = this.revealers(state);
    syncMap(this.zombieViews, state.zombies, (z) => this.createZombieView(z.type, z.id, z.pos), (view, z) => {
      const flying = CONFIG.zombies[z.type].flying;
      const y = terrainHeight(z.pos.x, z.pos.z) + (flying ? CONFIG.zombieCommon.flyHeight + Math.sin(this.time * 3 + z.id) * 0.25 : 0);
      const moved = Math.hypot(z.pos.x - view.lastPos.x, z.pos.z - view.lastPos.z);
      view.lastPos = { ...z.pos };
      const speed = moved / Math.max(dt, 0.001);
      const runner = z.type === "runner";
      const frozen = z.frozenTimer > 0;
      this.setFrozen(view, frozen ? 2 : z.chillTimer > 0 ? 1 : 0);
      // Urme în zăpadă (zburătorii nu lasă): la viscol îi vezi după urmă, nu după corp.
      if (!flying) {
        view.printDist += moved;
        const stride = z.type === "brute" || z.type === "boss" ? 1.3 : z.type === "runner" ? 0.6 : 0.8;
        if (view.printDist > stride) {
          view.printDist = 0;
          view.printSide = -view.printSide;
          const off = view.printSide * (z.type === "boss" ? 0.4 : 0.18);
          const big = z.type === "boss" ? 2 : z.type === "brute" ? 1.5 : 1;
          this.fx.zombiePrint(z.pos.x + Math.cos(z.facing) * off, z.pos.z - Math.sin(z.facing) * off, z.facing, big);
        }
      }
      if (!frozen) view.walk += speed * dt * (runner ? 3.2 : 2.2) + dt * 0.8;
      const amp = Math.min(1, speed / 1.5);
      const w = view.walk;

      // Lovit: un mic recul înapoi. Atac: un salt scurt înainte cu brațele.
      view.knock = Math.max(0, view.knock - dt * 6);
      view.attack = Math.max(0, view.attack - dt * 3);
      const lunge = Math.sin(view.attack * Math.PI) * 0.25;
      const back = view.knock * 0.28 - lunge;
      view.root.position.set(z.pos.x - Math.sin(z.facing) * back, y, z.pos.z - Math.cos(z.facing) * back);
      let diff = z.facing - view.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      view.root.rotation.y += diff * Math.min(1, dt * 8);
      view.root.rotation.x = view.knock * -0.3 + lunge * 0.4;
      view.root.rotation.z = Math.sin(w * 0.5) * 0.08;

      if (flying) {
        // Aripile bat, picioarele atârnă.
        const flap = Math.sin(this.time * 9 + z.id) * 0.7;
        view.armL.rotation.z = flap;
        view.armR.rotation.z = -flap;
        view.legL.rotation.x = 0.3;
        view.legR.rotation.x = 0.4;
      } else if (runner) {
        // Galop în patru labe: labele din față și cele din spate în contratimp; la atac sare cu ghearele.
        const g = Math.sin(w * 1.3) * 0.75 * Math.max(0.25, amp);
        view.armL.rotation.x = g - view.attack * 1.1;
        view.armR.rotation.x = -g * 0.8 - view.attack * 1.1;
        view.legL.rotation.x = -g;
        view.legR.rotation.x = g * 0.8;
        view.root.rotation.x = Math.sin(w * 2.6) * 0.05 - view.attack * 0.25;
      } else {
        // Mers șchiopătat; brațele întinse înainte. La atac le ridică și lovește.
        view.legL.rotation.x = Math.sin(w) * 0.6 * amp;
        view.legR.rotation.x = -Math.sin(w) * 0.6 * amp;
        const reach = -1.0 - view.attack * 0.9;
        view.armL.rotation.x = reach + Math.sin(w + 1) * 0.3;
        view.armR.rotation.x = reach + Math.sin(w + 2.2) * 0.3 - view.attack * 0.4;
        view.armL.rotation.z = -0.1;
        view.armR.rotation.z = 0.1;
      }

      if (z.burning && !view.fire) this.ignite(view);
      if (view.fire) {
        for (const [i, c] of view.fire.getChildren().entries()) {
          (c as TransformNode).scaling.y = (0.8 + Math.abs(Math.sin(this.time * 9 + i * 1.7)) * 0.7) * (view.type === "boss" ? 2 : 1);
        }
      }
      view.bar?.set(z.pos, y + (HP_BAR_Y[z.type] ?? 2), z.hp / z.maxHp);
      if (reveal && runner) {
        const seen = reveal.some((r) => (z.pos.x - r.x) ** 2 + (z.pos.z - r.z) ** 2 <= r.r2);
        view.root.setEnabled(seen);
        if (!seen) view.bar?.set(z.pos, y, 1);
      } else if (!view.root.isEnabled()) view.root.setEnabled(true);
    }, (id, view) => {
      // Zombie omorât: cade și se scufundă în zăpadă, în loc să dispară brusc.
      if (!this.killed.has(id)) return false;
      view.root.setEnabled(true);
      view.bar?.dispose();
      view.bar = null;
      this.dying.push({ view, t: 0, burned: this.killed.get(id)! });
      return true;
    });
  }

  private updateDying(dt: number): void {
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const fall = Math.min(1, d.t / 0.45);
      const flying = CONFIG.zombies[d.view.type].flying;
      d.view.root.rotation.x = -fall * 1.45;
      d.view.armL.rotation.x = -fall * 2;
      d.view.armR.rotation.x = -fall * 1.6;
      if (flying) d.view.root.position.y = Math.max(terrainHeight(d.view.root.position.x, d.view.root.position.z), d.view.root.position.y - dt * 8);
      if (d.t > 1.2) d.view.root.position.y -= dt * 0.9;
      if (d.t > 2.5) {
        d.view.dispose();
        this.dying.splice(i, 1);
      }
    }
  }

  // ---------- Construcții ----------

  private syncTowers(state: GameState, dt: number): void {
    syncMap(this.towerViews, state.towers, (t) => {
      const root = new TransformNode("tower", this.scene);
      root.scaling.setAll(TOWER_SCALE);
      const head = new TransformNode("towerHead", this.scene);
      head.parent = root;
      const bar = new HpBar(this.scene, this.m.hpBg, this.m.hpWall, 1.8);
      return {
        root, base: [], head, key: "", level: 0, kind: t.kind, kick: 0, bar, fire: null,
        dispose: () => {
          root.dispose();
          bar.dispose();
        },
      };
    }, (view, t) => {
      const y = terrainHeight(t.pos.x, t.pos.z);
      view.root.position.set(t.pos.x, y, t.pos.z);
      // Arma de pe pivot se rotește lin spre țintă și „sare” puțin la fiecare foc.
      let diff = t.facing - view.head.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      view.head.rotation.y += diff * Math.min(1, dt * 10);
      view.kick = Math.max(0, view.kick - dt * 6);
      view.head.rotation.x = t.kind === "tesla" || t.kind === "frost" ? 0 : -view.kick * 0.25;
      const key = `${t.kind}${t.level}`;
      if (view.key !== key) {
        // Tip sau nivel nou: altă bază și altă armă.
        for (const m of view.base) m.dispose();
        for (const c of view.head.getChildMeshes()) c.dispose();
        view.base = this.towerBases[t.level - 1].instance("towerBase", view.root);
        this.towerHeads.get(key)!.instance("towerHeadMesh", view.head);
        view.head.position.y = towerHeadY(t.level);
        view.key = key;
        view.level = t.level;
        view.kind = t.kind;
      }
      // Gheața plutește și se rotește încet; bobina Tesla vibrează.
      if (t.kind === "frost") view.head.rotation.y = this.time * 0.6;
      if (t.kind === "tesla") view.head.position.x = Math.sin(this.time * 40) * 0.01;
      const hp = t.hp / t.maxHp;
      view.bar.set(t.pos, y + 3.6, hp, t.id === this.selectedId);
      // Stricat: fum de la jumătate de viață, foc mic de la un sfert.
      if (hp < 0.5 && Math.random() < dt * (hp < 0.25 ? 9 : 5)) {
        this.fx.burst("smoke", this.at(t.pos, 2.4 + Math.random()), new Vector3(0, 1, 0), 1, 0.8, 0.3);
      }
      if (hp < 0.25 && !view.fire) {
        const fire = new TransformNode("towerFire", this.scene);
        fire.parent = view.root;
        for (let i = 0; i < 3; i++) {
          const n = new TransformNode("tf", this.scene);
          n.parent = fire;
          n.position.set(Math.cos(i * 2.1) * 0.5, 1.6 + i * 0.35, Math.sin(i * 2.1) * 0.5);
          this.flame.instance("towerFlame", n);
        }
        view.fire = fire;
      } else if (hp >= 0.25 && view.fire) {
        view.fire.dispose();
        view.fire = null;
      }
      if (view.fire) {
        for (const [i, c] of view.fire.getChildren().entries()) {
          (c as TransformNode).scaling.set(0.55, 0.5 + Math.abs(Math.sin(this.time * 9 + i * 1.9)) * 0.45, 0.55);
        }
      }
    }, (id, view) => this.startCollapse(id, view.root, view.bar, 3.6));
  }

  /** Construcție distrusă: n-o ștergem brusc, ci o lăsăm să se prăbușească. */
  private startCollapse(id: EntityId, root: TransformNode, bar: HpBar, barY: number): boolean {
    if (!this.destroyed.has(id)) return false;
    const a = Math.random() * Math.PI * 2;
    const barPos = { x: root.position.x, z: root.position.z };
    bar.set(barPos, root.position.y + barY, 0);
    this.collapsing.push({ root, t: 0, tiltX: Math.cos(a) * 1.2, tiltZ: Math.sin(a) * 1.2, y0: root.position.y, bar, barPos, barY });
    return true;
  }

  private updateCollapsing(dt: number): void {
    for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const c = this.collapsing[i];
      c.t += dt;
      // Se clatină o clipă, apoi cade (accelerat) și se scufundă în zăpadă.
      const wobble = c.t < 0.25 ? Math.sin(c.t * 60) * 0.04 : 0;
      const fall = Math.min(1, Math.max(0, (c.t - 0.2) / 0.7) ** 2);
      c.root.rotation.x = c.tiltX * fall + wobble;
      c.root.rotation.z = c.tiltZ * fall;
      c.root.position.y = c.y0 - fall * 0.6 - Math.max(0, c.t - 1.2) * 1.2;
      // Scândurile se desprind cât se clatină; praful se ridică la impact și stă ~1 s.
      if (c.t < 0.6 && Math.random() < dt * 10) this.fx.burst("plank", c.root.position.add(new Vector3(0, 1.5 + Math.random(), 0)), null, 1, 3, 0.1);
      if (c.t > 0.85 && c.t - dt <= 0.85) this.fx.dust(c.root.position.clone(), 1.5, 0.8);
      // Bara stă goală (0) până se culcă turnul, apoi dispare.
      if (c.bar && c.t > 0.9) {
        c.bar.dispose();
        c.bar = null;
      }
      if (c.t > 2.6) {
        c.bar?.dispose();
        c.root.dispose();
        this.collapsing.splice(i, 1);
      }
    }
  }

  // ---------- Turnuri: tragere, abilități, proiectile ----------

  /** Punctul din care pleacă proiectilul (gura armei). */
  private towerMuzzle(state: GameState, towerId: EntityId): Vector3 | null {
    const t = state.towers.find((x) => x.id === towerId);
    const view = t && this.towerViews.get(t.id);
    if (!t || !view) return null;
    const up = t.kind === "tesla" ? 2.0 + t.level * 0.2 : t.kind === "frost" ? 2.4 : 0.8;
    const fwd = t.kind === "tesla" || t.kind === "frost" ? 0 : t.kind === "cannon" ? 1.5 : 1.2;
    const f = view.head.rotation.y;
    return this.at(t.pos, (towerHeadY(t.level) + up) * TOWER_SCALE).add(new Vector3(Math.sin(f), 0, Math.cos(f)).scale(fwd * TOWER_SCALE));
  }

  private targetPoint(state: GameState, to: Vec2): Vector3 {
    const z = state.zombies.find((x) => Math.abs(x.pos.x - to.x) < 0.01 && Math.abs(x.pos.z - to.z) < 0.01);
    return this.at(to, 1.1 + (z ? this.zombieY(z.type) : 0));
  }

  private onTowerFired(state: GameState, towerId: EntityId, kind: TowerKind, to: Vec2, special: Shell["special"]): void {
    const view = this.towerViews.get(towerId);
    if (view) view.kick = 1;
    const from = this.towerMuzzle(state, towerId);
    if (!from) return;
    switch (kind) {
      case "tesla": {
        // O linie subțire alb-albăstruie care pâlpâie doar cât atinge ținta (fără bile de lumină).
        const end = this.targetPoint(state, to);
        this.fx.lightning(from, end, mix(TOWER_COLORS.tesla, PAL.snow, 0.5), 0.025, 0.07, false, 0.25);
        this.fx.lightning(from, end, PAL.snow, 0.015, 0.05, false, 0.35);
        break;
      }
      case "cannon":
        // Tunul e singurul cu fum la gură.
        this.fx.muzzle(from, PAL.fire, 0.7, 0.08);
        this.fx.burst("smoke", from, null, 6, 2, 0.35);
        break;
      case "rocket":
        this.fx.burst("smoke", from, null, special === "big" ? 6 : 3, 1.2, 0.25);
        break;
      case "frost":
        // Gheața nu „trage” nimic vizibil: doar crusta apare pe zombi.
        break;
      default:
        // Arbaleta: niciun fulger, doar săgeata care se vede zburând.
        break;
    }
  }

  private onTowerAbility(state: GameState, towerId: EntityId, kind: TowerKind, pos: Vec2, to: Vec2): void {
    const view = this.towerViews.get(towerId);
    if (view) view.kick = 1;
    if (kind === "tesla") {
      // Laserul: aceeași linie subțire, dar prin toată linia și pâlpâind de câteva ori.
      const from = this.towerMuzzle(state, towerId) ?? this.at(pos, 2.5);
      const end = this.at(to, 1.2);
      this.fx.tracer(from, end, mix(TOWER_COLORS.tesla, PAL.snow, 0.6), 0.06, 0.3, true);
      for (let i = 0; i < 3; i++) this.fx.lightning(from, end, PAL.snow, 0.02, 0.1 + i * 0.08, false, 0.3);
    }
    // Gheața: nova nu are nor sau inel — crusta apare direct pe zombii înghețați.
  }

  private onShellHit(kind: TowerKind, special: Shell["special"], pos: Vec2, splash: number): void {
    const at = this.at(pos, 0.9);
    switch (kind) {
      case "crossbow":
        this.fx.burst("wood", at, null, special === "heavy" ? 5 : 2, 2.5, 0.05);
        break;
      case "rocket": {
        // Racheta: un cerc mic de zăpadă aruncată, nu o minge de foc.
        const r = special === "big" ? splash : special === "mini" ? 0.7 : splash * 0.8;
        this.fx.snowBurst(this.at(pos), r);
        break;
      }
      case "cannon":
        // Tunul e singurul cu praf; lasă o pată de jar care se stinge în ~2 s.
        this.fx.dust(this.at(pos, 0.2), splash * 0.6, 0.7);
        this.fx.burst("stone", at, null, 8, 6, 0.12);
        this.fx.ember(pos.x, pos.z, splash * 0.55, CONFIG.tower.abilities.fireDuration);
        break;
      case "frost":
        break;
      default:
        break;
    }
  }

  private shellModel(s: Shell): ShellModel {
    if (s.kind === "rocket") return "rocket";
    if (s.kind === "cannon") return s.special === "fire" ? "fireball" : "ball";
    if (s.kind === "frost") return "ice";
    return s.special === "heavy" ? "heavy" : "arrow";
  }

  private syncShells(state: GameState): void {
    syncMap(this.shellViews, state.shells, (s) => {
      const [mesh] = this.shellPrefabs[this.shellModel(s)].instance("shell");
      const scale = s.special === "mini" ? 0.55 : s.special === "big" ? 1.6 : 1;
      mesh.scaling.setAll(scale);
      // Gheața nu are proiectil vizibil.
      if (s.kind === "frost") mesh.setEnabled(false);
      return { mesh, last: null, trail: 0, dispose: () => mesh.dispose() };
    }, (view, s) => {
      // Arc de zbor: ghiulelele urcă sus, săgețile aproape drept.
      const done = Math.hypot(s.pos.x - s.from.x, s.pos.z - s.from.z);
      const left = Math.hypot(s.target.x - s.pos.x, s.target.z - s.pos.z);
      const p = done / Math.max(0.01, done + left);
      const t = state.towers.find((x) => x.id === s.towerId);
      const startY = t ? (towerHeadY(t.level) + 1) * TOWER_SCALE : 1.6;
      const target = s.targetId !== null ? state.zombies.find((z) => z.id === s.targetId) : undefined;
      const endY = 1.0 + (target ? this.zombieY(target.type) : 0);
      const arc = s.kind === "cannon" ? 3 : s.kind === "rocket" ? (s.special === "mini" ? 0.6 : 1.4) : 0.4;
      const y = startY * (1 - p) + endY * p + Math.sin(p * Math.PI) * arc;
      const pos = this.at(s.pos, y);
      if (view.last && Vector3.DistanceSquared(view.last, pos) > 1e-4) view.mesh.lookAt(pos.add(pos.subtract(view.last)));
      view.last = pos.clone();
      view.mesh.position.copyFrom(pos);
      // Dâre: fum la rachete, scântei la ghiulelele cu foc, gheață la cristale.
      view.trail++;
      // Doar racheta lasă o dâră de fum; restul zboară curat.
      if (s.kind === "rocket") this.fx.burst("smoke", pos, null, 1, 0.25, s.special === "mini" ? 0.18 : 0.3);
    });
  }

  /** Focul de pe jos de la ghiuleaua tunului. */
  private syncFires(state: GameState): void {
    syncMap(this.fireViews, state.fires, (f) => {
      const root = new TransformNode("firePatch", this.scene);
      const flames: TransformNode[] = [];
      // Jar pe zăpadă: limbi mici și joase de flacără (pata de jar e în Fx.ember).
      for (let i = 0; i < 4; i++) {
        const node = new TransformNode("fp", this.scene);
        node.parent = root;
        const a = (i / 4) * Math.PI * 2 + f.id;
        const r = i === 0 ? 0 : f.radius * 0.45;
        node.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        this.flame.instance("fpFlame", node);
        flames.push(node);
      }
      return { root, flames, dispose: () => root.dispose() };
    }, (view, f) => {
      view.root.position.set(f.pos.x, terrainHeight(f.pos.x, f.pos.z), f.pos.z);
      const fade = Math.min(1, f.life * 1.5);
      view.flames.forEach((n, i) => {
        const k = (0.35 + Math.abs(Math.sin(this.time * 9 + i * 1.3)) * 0.3) * fade;
        n.scaling.set(0.6 * fade, k, 0.6 * fade);
      });
    });
  }



  /** Modelul zidului: nivel, ușă și starea (întreg / crăpat sub 60% / dărâmat). */
  private wallKey(b: Barricade): string {
    const st: WallState = b.broken ? "broken" : b.hp < b.maxHp * 0.6 ? "cracked" : "intact";
    return `${b.level}${b.door ? "d" : ""}${st}`;
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
        // Schimbare de stare: un pic de praf și așchii, ca să se vadă trecerea.
        if (view.key) this.fx.dust(this.at(b.pos, 0.3), 1.2, b.broken ? 0.8 : 0.3);
        for (const p of view.parts) p.dispose();
        view.parts = this.walls.get(key)!.instance("wallMesh", view.root);
        view.key = key;
      }
      const y = Math.min(...segmentEnds(b.pos, b.rotation, CONFIG.barricade.length).map((p) => terrainHeight(p.x, p.z)));
      view.root.position.set(b.pos.x, y - 0.05, b.pos.z);
      view.root.rotation.y = b.rotation;
      // Dărâmat: bara arată cât mai trebuie reparat ca să se ridice la loc.
      view.bar.set(b.pos, y + (b.broken ? 1.2 : 2.6), b.broken ? Math.min(0.998, b.hp / (b.maxHp * CONFIG.barricade.rebuildAt)) : b.hp / b.maxHp, b.id === this.selectedId);
    });
  }

  private syncMines(state: GameState): void {
    syncMap(this.mineViews, state.mines, () => {
      const root = new TransformNode("mine", this.scene);
      const parts = this.mine.instance("mineMesh", root);
      // Beculețul minei = piesa strălucitoare (o găsim după material, nu după poziție).
      const light = parts.find((p) => p.sourceMesh.name.includes("_glow")) ?? parts[parts.length - 1];
      return { root, light, dispose: () => root.dispose() };
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
      // În ultimele 5 secunde moneda clipește: „ia-mă repede, că dispar”.
      const left = CONFIG.coins.lifetime - c.age;
      view.isVisible = left > 5 || Math.sin(this.time * (left < 2 ? 25 : 12)) > 0;
    });
  }

  private syncProjectiles(state: GameState): void {
    syncMap(this.projectileViews, state.projectiles, () => {
      const [mesh] = this.glob.instance("glob");
      return { mesh, trail: 0, dispose: () => mesh.dispose() };
    }, (view, p) => {
      view.mesh.position.set(p.pos.x, terrainHeight(p.pos.x, p.pos.z) + 1.4 + Math.sin(this.time * 20) * 0.05, p.pos.z);
      view.trail += 1;
      if (view.trail % 3 === 0) this.fx.burst("venom", view.mesh.position, null, 1, 0.5, 0.06);
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

  /**
   * Arată „fantoma” construcției: modelul transparent + o bază pe sol bine vizibilă
   * (verde = se poate construi, roșu = nu) + raza de tragere a turnului.
   */
  setGhost(pos: Vec2 | null, kind: BuildKind, valid: boolean, range = 0, rotation = 0): void {
    // Focul și fermele: doar „amprenta” rotundă pe sol, la mărimea lor.
    const building = kind === "campfire" || kind === "farmChicken" || kind === "farmPig";
    const isTower = kind === "tower" || building;
    this.ghostTower.setEnabled(!!pos && kind === "tower");
    this.ghostWall.setEnabled(!!pos && kind === "barricade");
    this.footTower.setEnabled(!!pos && isTower);
    this.footWall.setEnabled(!!pos && kind === "barricade");
    this.rangeRing.setEnabled(!!pos && range > 0);
    if (!pos) return;
    const y = terrainHeight(pos.x, pos.z);
    const node = isTower ? this.ghostTower : this.ghostWall;
    node.position.set(pos.x, y, pos.z);
    node.rotation.y = rotation;
    for (const g of this.ghostParts) g.material = valid ? this.m.ghostOk : this.m.ghostBad;
    const foot = isTower ? this.footTower : this.footWall;
    foot.position.set(pos.x, y + 0.06, pos.z);
    if (!isTower) foot.rotation.y = rotation;
    foot.material = valid ? this.m.footOk : this.m.footBad;
    // Baza „respiră” ușor, ca să atragă privirea.
    const pulse = (1 + Math.sin(this.time * 6) * 0.05) * (kind === "campfire" ? 0.9 : building ? 1.6 : 1);
    foot.scaling.set(pulse, 1, pulse);
    this.rangeRing.position.set(pos.x, y + 0.1, pos.z);
    this.rangeRing.scaling.set(range, 1, range);
  }

  hideGhost(): void {
    this.setGhost(null, "tower", false);
  }

  /**
   * Contur auriu pe construcția selectată (tehnica „inverted hull”): fiecare piesă e copiată,
   * mărită puțin și desenată doar cu fețele din spate, într-o culoare plată → apare ca o margine.
   */
  private syncOutline(): void {
    const id = this.selectedId;
    const view = id === null ? undefined : (this.towerViews.get(id) ?? this.barricadeViews.get(id));
    const parts = view ? view.root.getChildMeshes(false).filter((m): m is InstancedMesh => "sourceMesh" in m) : [];
    const stale = !this.outline || this.outline.id !== id || this.outline.parts.length !== parts.length ||
      this.outline.parts.some((p, i) => p !== parts[i] || p.isDisposed());
    if (!stale) {
      const pulse = 0.75 + Math.sin(this.time * 5) * 0.25;
      this.outlineMat!.emissiveColor = PAL.gold.scale(pulse);
      return;
    }
    for (const h of this.outline?.hulls ?? []) h.dispose();
    this.outline = null;
    if (id === null || parts.length === 0) return;
    if (!this.outlineMat) {
      const m = new StandardMaterial("outlineMat", this.scene);
      m.disableLighting = true;
      m.emissiveColor = PAL.gold.clone();
      m.cullBackFaces = false; // doar fețele din spate
      m.fogEnabled = false;
      this.outlineMat = m;
    }
    const hulls = parts.map((p) => {
      const h = p.sourceMesh.clone("outline", null, true, false);
      h.parent = p.parent;
      h.position.copyFrom(p.position);
      if (p.rotationQuaternion) h.rotationQuaternion = p.rotationQuaternion.clone();
      else h.rotation.copyFrom(p.rotation);
      h.scaling.copyFrom(p.scaling).multiplyInPlace(new Vector3(1.1, 1.04, 1.1));
      h.material = this.outlineMat;
      h.useVertexColors = false;
      h.isPickable = false;
      h.receiveShadows = false;
      h.isVisible = true;
      h.setEnabled(true);
      return h;
    });
    this.outline = { id, parts, hulls };
  }

  /** Inel auriu sub construcția selectată (pentru editare). */
  setSelection(pos: Vec2 | null, radius = 1.6, id: EntityId | null = null): void {
    this.selectRing.setEnabled(!!pos);
    this.selectedId = pos ? id : null;
    if (!pos) return;
    this.selectRing.position.set(pos.x, terrainHeight(pos.x, pos.z) + 0.12, pos.z);
    this.selectRing.scaling.set(radius, 1, radius);
  }

  /** Șterge toate entitățile (pentru „Joacă din nou”). */
  reset(): void {
    this.world.resetMine();
    this.mineCrack = -1;
    const maps: Map<EntityId, { dispose(): void }>[] = [
      this.heroViews, this.zombieViews, this.towerViews, this.barricadeViews, this.coinViews, this.mineViews, this.projectileViews,
      this.shellViews, this.fireViews,
    ];
    for (const map of maps) {
      for (const v of map.values()) v.dispose();
      map.clear();
    }
    for (const d of this.dying) d.view.dispose();
    this.dying = [];
    for (const c of this.collapsing) {
      c.root.dispose();
      c.bar?.dispose();
    }
    this.collapsing = [];
    this.survival.reset();
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
