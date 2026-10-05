// Randarea: transformă starea jocului (date) în obiecte 3D pe ecran.
// Nu modifică NICIODATĂ starea; doar o citește. Pentru fiecare entitate din stare
// există un obiect 3D; dacă entitatea dispare, obiectul e șters.

import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  FreeCamera,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  type StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import {
  type BuildKind,
  CONFIG,
  DEFAULT_SKIN_COLOR,
  type EntityId,
  type GameEvent,
  type GameState,
  type Hero,
  type HeroClass,
  SKINS,
  type Vec2,
  type ZombieType,
} from "../core";
import { FX_COLORS, Fx } from "./Fx";
import { World, makeMaterial } from "./World";

const CAMERA_OFFSET = new Vector3(0, 28, -20);

const ZOMBIE_LOOK: Record<ZombieType, { color: Color3; scale: [number, number] }> = {
  walker: { color: new Color3(0.3, 0.55, 0.15), scale: [1, 1] },
  runner: { color: new Color3(0.55, 0.5, 0.15), scale: [0.8, 0.9] },
  brute: { color: new Color3(0.22, 0.32, 0.12), scale: [1.6, 1.4] },
  boss: { color: new Color3(0.35, 0.15, 0.4), scale: [2.5, 2.2] },
};

const TOWER_TIER_COLORS = [
  new Color3(0.85, 0.35, 0.2),
  new Color3(0.25, 0.55, 0.95),
  new Color3(0.65, 0.3, 0.9),
  new Color3(1, 0.78, 0.15),
];

/** Bară de viață (fundal negru + umplere colorată) care plutește deasupra unui obiect. */
class HpBar {
  private bg: Mesh;
  private fg: Mesh;
  constructor(scene: Scene, bgMat: StandardMaterial, fgMat: StandardMaterial, private width: number) {
    this.bg = MeshBuilder.CreatePlane("hpBg", { width, height: 0.18 }, scene);
    this.fg = MeshBuilder.CreatePlane("hpFg", { width, height: 0.18 }, scene);
    this.bg.material = bgMat;
    this.fg.material = fgMat;
    for (const m of [this.bg, this.fg]) {
      m.isPickable = false;
      m.billboardMode = TransformNode.BILLBOARDMODE_ALL;
    }
    this.fg.renderingGroupId = this.bg.renderingGroupId = 1;
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
  body: Mesh;
  mat: StandardMaterial;
  colorKey: string;
  bubble: Mesh;
  aura: Mesh;
  dispose(): void;
}

interface ZombieView {
  mesh: Mesh;
  bar: HpBar | null;
  flash: number;
  dispose(): void;
}

interface TowerView {
  root: TransformNode;
  head: Mesh;
  barrel: Mesh;
  tier: number;
  dispose(): void;
}

interface BarricadeView {
  root: TransformNode;
  bar: HpBar;
  dispose(): void;
}

export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private camera: FreeCamera;
  private world: World;
  private fx: Fx;
  private m: Record<string, StandardMaterial> = {};

  private templates!: {
    heroBody: Mesh;
    zombie: Record<ZombieType, Mesh>;
    towerBase: Mesh;
    coin: Mesh;
    fence: Mesh;
    zone: Mesh;
  };

  private heroViews = new Map<EntityId, HeroView>();
  private zombieViews = new Map<EntityId, ZombieView>();
  private towerViews = new Map<EntityId, TowerView>();
  private barricadeViews = new Map<EntityId, BarricadeView>();
  private coinViews = new Map<EntityId, Mesh>();
  private zoneViews = new Map<EntityId, Mesh>();
  private shelterShake = 0;
  private ghostTower: Mesh;
  private ghostFence: Mesh;
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

    this.world = new World(this.scene);
    this.fx = new Fx(this.scene);
    this.createMaterials();
    this.createTemplates();

    this.ghostTower = MeshBuilder.CreateCylinder("ghostTower", { diameter: CONFIG.tower.radius * 2, height: 2.4 }, this.scene);
    this.ghostTower.position.y = 1.2;
    this.ghostFence = MeshBuilder.CreateBox("ghostFence", { width: CONFIG.barricade.radius * 2, height: 1.2, depth: 0.5 }, this.scene);
    this.ghostFence.position.y = 0.6;
    this.rangeRing = MeshBuilder.CreateTorus("range", { diameter: 2, thickness: 0.06, tessellation: 48 }, this.scene);
    this.rangeRing.material = this.m.range;
    this.rangeRing.position.y = 0.05;
    for (const g of [this.ghostTower, this.ghostFence, this.rangeRing]) {
      g.isPickable = false;
      g.setEnabled(false);
    }

    window.addEventListener("resize", () => this.engine.resize());
  }

  // ---------- Construcția scenei ----------

  private createMaterials(): void {
    const s = this.scene;
    const add = (name: string, color: Color3, emissive = 0, alpha = 1) =>
      (this.m[name] = makeMaterial(s, name, color, emissive, alpha));
    add("gun", new Color3(0.15, 0.15, 0.15));
    add("downed", new Color3(0.45, 0.45, 0.5));
    add("zombieHit", new Color3(1, 1, 1), 1);
    for (const [type, look] of Object.entries(ZOMBIE_LOOK)) add(`zombie_${type}`, look.color);
    add("tower", new Color3(0.55, 0.55, 0.6));
    TOWER_TIER_COLORS.forEach((c, i) => add(`tier${i + 1}`, c, 0.15));
    add("fence", new Color3(0.5, 0.32, 0.15));
    add("coin", new Color3(1, 0.8, 0.1), 0.5);
    add("ghostOk", new Color3(0.2, 1, 0.3), 0.6, 0.5);
    add("ghostBad", new Color3(1, 0.2, 0.2), 0.6, 0.5);
    add("range", new Color3(0.2, 0.5, 1), 0.8, 0.7);
    add("hpBg", new Color3(0.1, 0.1, 0.1), 0, 0.8).disableLighting = true;
    add("hpZombie", new Color3(0.9, 0.2, 0.15), 1).disableLighting = true;
    add("hpFence", new Color3(0.95, 0.65, 0.2), 1).disableLighting = true;
    add("shield", new Color3(0.4, 0.7, 1), 0.6, 0.3);
    add("invuln", new Color3(1, 0.85, 0.3), 0.7, 0.35);
    add("aura", new Color3(1, 0.9, 0.3), 1, 0.7);
    add("healZone", FX_COLORS.heal, 0.8, 0.25);
    add("staffOrb", new Color3(0.4, 1, 0.5), 1);
    add("shieldPlate", new Color3(0.6, 0.62, 0.68));
  }

  private createTemplates(): void {
    const s = this.scene;
    const hide = <T extends Mesh>(mesh: T) => {
      mesh.setEnabled(false);
      mesh.isPickable = false;
      return mesh;
    };

    const zombie = {} as Record<ZombieType, Mesh>;
    for (const type of Object.keys(ZOMBIE_LOOK) as ZombieType[]) {
      const mesh = MeshBuilder.CreateCapsule(`zombie_${type}`, { height: 1.7, radius: 0.45, tessellation: 8 }, s);
      const [w, h] = ZOMBIE_LOOK[type].scale;
      mesh.scaling.set(w, h, w);
      mesh.bakeCurrentTransformIntoVertices();
      mesh.material = this.m[`zombie_${type}`];
      zombie[type] = hide(mesh);
    }

    const towerBase = MeshBuilder.CreateCylinder("towerBase", { diameterTop: 1.4, diameterBottom: 2, height: 2.2, tessellation: 8 }, s);
    towerBase.material = this.m.tower;

    const coin = MeshBuilder.CreateCylinder("coin", { diameter: 0.9, height: 0.15, tessellation: 12 }, s);
    coin.material = this.m.coin;
    coin.rotation.x = Math.PI / 2;
    coin.bakeCurrentTransformIntoVertices();

    // Gard de lemn: 3 stâlpi + 2 scânduri, uniți într-un singur mesh.
    const parts: Mesh[] = [];
    const w = CONFIG.barricade.radius * 2;
    for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) {
      const post = MeshBuilder.CreateBox("post", { width: 0.25, height: 1.5, depth: 0.25 }, s);
      post.position.set(x, 0.75, 0);
      parts.push(post);
    }
    for (const y of [0.5, 1.05]) {
      const plank = MeshBuilder.CreateBox("plank", { width: w, height: 0.3, depth: 0.12 }, s);
      plank.position.set(0, y, 0);
      parts.push(plank);
    }
    const fence = Mesh.MergeMeshes(parts, true)!;
    fence.material = this.m.fence;

    const zone = MeshBuilder.CreateDisc("zone", { radius: 1, tessellation: 32 }, s);
    zone.rotation.x = Math.PI / 2;
    zone.bakeCurrentTransformIntoVertices();
    zone.material = this.m.healZone;

    const heroBody = MeshBuilder.CreateCapsule("heroBody", { height: 1.8, radius: 0.45 }, s);

    this.templates = {
      heroBody: hide(heroBody),
      zombie,
      towerBase: hide(towerBase),
      coin: hide(coin),
      fence: hide(fence),
      zone: hide(zone),
    };
  }

  // ---------- Sincronizare cu starea ----------

  /** Apelată o dată pe cadru: aduce scena la zi cu starea jocului. */
  sync(state: GameState, events: GameEvent[], localPlayerId: string, dt: number): void {
    for (const e of events) this.handleEvent(state, e);

    this.syncHeroes(state);
    this.syncZombies(state, dt);
    this.syncTowers(state);
    this.syncBarricades(state);
    this.syncCoins(state);
    this.syncZones(state);
    this.fx.update(dt);

    // Adăpostul tremură când e lovit.
    this.shelterShake = Math.max(0, this.shelterShake - dt * 4);
    this.world.shelter.position.x = Math.sin(state.time * 60) * 0.06 * this.shelterShake;

    // Camera urmărește lin eroul local.
    const me = state.players[localPlayerId];
    const hero = me && state.heroes.find((h) => h.id === me.heroId);
    if (hero) {
      const desired = new Vector3(hero.pos.x, 0, hero.pos.z).addInPlace(CAMERA_OFFSET);
      Vector3.LerpToRef(this.camera.position, desired, Math.min(1, dt * 5), this.camera.position);
    }
    this.world.followCamera(this.camera.position);
  }

  private handleEvent(state: GameState, e: GameEvent): void {
    switch (e.type) {
      case "shot":
        this.fx.tracer(
          e.from,
          e.to,
          e.crit ? FX_COLORS.crit : e.source === "tower" ? FX_COLORS.towerShot : FX_COLORS.heroShot,
          e.source === "tower" ? 2.55 : 1.1,
          e.crit ? 0.16 : 0.08,
          e.crit ? 0.15 : 0.07,
        );
        break;
      case "zombieHit": {
        const v = this.zombieViews.get(e.id);
        if (v) v.flash = 0.08;
        break;
      }
      case "zombieDied":
        this.fx.ring(e.pos, e.zombieType === "boss" ? 4 : e.zombieType === "brute" ? 2 : 1.2, FX_COLORS.death, 0.35);
        break;
      case "barricadeDestroyed":
        this.fx.ring(e.pos, 2, FX_COLORS.wood, 0.4);
        break;
      case "shelterHit":
        this.shelterShake = 1;
        break;
      case "healed":
        this.fx.ring(e.pos, 1.6, FX_COLORS.heal, 0.5);
        break;
      case "levelUp": {
        const h = state.heroes.find((x) => x.id === e.heroId);
        if (h) this.fx.ring(h.pos, 2.5, FX_COLORS.level, 0.7);
        break;
      }
      case "heroRevived": {
        const h = state.heroes.find((x) => x.id === e.id);
        if (h) this.fx.ring(h.pos, 2.5, FX_COLORS.heal, 0.7);
        break;
      }
      case "ability":
        this.abilityFx(e);
        break;
    }
  }

  private abilityFx(e: Extract<GameEvent, { type: "ability" }>): void {
    switch (e.ability) {
      case "grenade":
        if (e.to) {
          this.fx.tracer(e.pos, e.to, FX_COLORS.explosion, 1.5, 0.2, 0.15);
          this.fx.explosion(e.to, e.radius);
        }
        break;
      case "airstrike":
        this.fx.explosion(e.pos, e.radius);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          this.fx.explosion({ x: e.pos.x + Math.cos(a) * e.radius * 0.6, z: e.pos.z + Math.sin(a) * e.radius * 0.6 }, 3);
        }
        break;
      case "spray":
        if (e.to) {
          const base = Math.atan2(e.to.x - e.pos.x, e.to.z - e.pos.z);
          for (let i = -3; i <= 3; i++) {
            const a = base + i * 0.17;
            this.fx.tracer(e.pos, { x: e.pos.x + Math.sin(a) * e.radius, z: e.pos.z + Math.cos(a) * e.radius }, FX_COLORS.heroShot, 1.1, 0.1, 0.12);
          }
        }
        break;
      case "pierce":
        if (e.to) this.fx.tracer(e.pos, e.to, FX_COLORS.crit, 1.1, 0.3, 0.25);
        break;
      case "slam":
        this.fx.explosion(e.pos, e.radius, FX_COLORS.wood);
        break;
      case "taunt":
      case "fortress":
        this.fx.ring(e.pos, e.radius, FX_COLORS.taunt, 0.6);
        break;
      case "healZone":
      case "heal":
      case "revive":
        this.fx.ring(e.pos, Math.max(2, e.radius), FX_COLORS.heal, 0.6);
        break;
      case "holyLight":
        this.fx.ring(e.pos, e.radius, FX_COLORS.holy, 0.8);
        this.fx.ring(e.pos, e.radius * 0.5, FX_COLORS.holy, 0.6, 0.8);
        break;
      default:
        this.fx.ring(e.pos, 1.5, FX_COLORS.buff, 0.4);
    }
  }

  private heroColor(state: GameState, hero: Hero): [number, number, number] {
    const skinId = state.players[hero.playerId]?.skin;
    const skin = skinId ? SKINS.find((s) => s.id === skinId) : null;
    return skin ? skin.color : DEFAULT_SKIN_COLOR[hero.heroClass];
  }

  private syncHeroes(state: GameState): void {
    syncMap(this.heroViews, state.heroes, (hero) => this.createHeroView(hero.heroClass), (view, hero) => {
      view.root.position.set(hero.pos.x, 0, hero.pos.z);
      view.root.rotation.y = hero.facing;

      // Skin: culoarea corpului.
      const color = this.heroColor(state, hero);
      const key = color.join(",");
      if (view.colorKey !== key) {
        view.mat.diffuseColor.set(...color);
        view.colorKey = key;
      }

      // Căzut: stă culcat și gri, ca Healer-ul să-l poată găsi și reînvia.
      view.body.rotation.x = hero.alive ? 0 : Math.PI / 2;
      view.body.position.y = hero.alive ? 0.9 : 0.45;
      view.body.material = hero.alive ? view.mat : this.m.downed;

      const b = hero.buffs;
      view.bubble.setEnabled(hero.alive && (b.shield > 0 || b.invulnerable > 0));
      view.bubble.material = b.invulnerable > 0 ? this.m.invuln : this.m.shield;
      view.aura.setEnabled(hero.alive && (b.rapidFire > 0 || b.focus > 0));
      view.aura.rotation.y = state.time * 4;
    });
  }

  private createHeroView(heroClass: HeroClass): HeroView {
    const s = this.scene;
    const root = new TransformNode("hero", s);
    const body = this.templates.heroBody.clone("heroBody", root);
    body.setEnabled(true);
    body.position.y = 0.9;
    const mat = makeMaterial(s, "heroMat", new Color3(1, 1, 1));
    body.material = mat;

    // Accesoriu diferit pentru fiecare clasă (ca să le deosebești de sus).
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: StandardMaterial) => {
      const b = MeshBuilder.CreateBox("acc", { width: w, height: h, depth: d }, s);
      b.position.set(x, y, z);
      b.material = material;
      b.parent = root;
      b.isPickable = false;
      return b;
    };
    if (heroClass === "assault") box(0.15, 0.15, 1, 0.35, 1.1, 0.5, this.m.gun);
    if (heroClass === "sniper") box(0.1, 0.1, 1.9, 0.35, 1.15, 0.85, this.m.gun);
    if (heroClass === "tank") {
      box(1.2, 1.3, 0.15, 0, 0.9, 0.6, this.m.shieldPlate);
      box(0.2, 0.2, 0.7, 0.55, 1, 0.3, this.m.gun);
    }
    if (heroClass === "healer") {
      box(0.08, 1.8, 0.08, 0.45, 0.9, 0.2, this.m.fence);
      const orb = MeshBuilder.CreateSphere("orb", { diameter: 0.35, segments: 8 }, s);
      orb.position.set(0.45, 1.85, 0.2);
      orb.material = this.m.staffOrb;
      orb.parent = root;
    }

    const bubble = MeshBuilder.CreateSphere("bubble", { diameter: 2.6, segments: 10 }, s);
    bubble.position.y = 1;
    bubble.parent = root;
    bubble.isPickable = false;
    const aura = MeshBuilder.CreateTorus("aura", { diameter: 1.8, thickness: 0.08, tessellation: 24 }, s);
    aura.position.y = 0.1;
    aura.material = this.m.aura;
    aura.parent = root;

    return { root, body, mat, colorKey: "", bubble, aura, dispose: () => { root.dispose(); mat.dispose(); } };
  }

  private syncZombies(state: GameState, dt: number): void {
    syncMap(this.zombieViews, state.zombies, (z) => {
      const mesh = this.templates.zombie[z.type].clone("zombie");
      mesh.setEnabled(true);
      const big = z.type === "brute" || z.type === "boss";
      const bar = big ? new HpBar(this.scene, this.m.hpBg, this.m.hpZombie, z.type === "boss" ? 3 : 1.6) : null;
      return { mesh, bar, flash: 0, dispose: () => { mesh.dispose(); bar?.dispose(); } };
    }, (view, z) => {
      const [, h] = ZOMBIE_LOOK[z.type].scale;
      // Mers legănat, ca un zombie.
      const wobble = Math.sin(state.time * (z.type === "runner" ? 12 : 6) + z.id) * 0.12;
      view.mesh.position.set(z.pos.x, 0.85 * h, z.pos.z);
      view.mesh.rotation.set(0.15, z.facing, wobble);
      view.mesh.material = view.flash > 0 ? this.m.zombieHit : this.m[`zombie_${z.type}`];
      view.flash -= dt;
      view.bar?.set(z.pos, 1.9 * h + 0.3, z.hp / z.maxHp);
    });
  }

  private syncTowers(state: GameState): void {
    syncMap(this.towerViews, state.towers, () => {
      const root = new TransformNode("tower", this.scene);
      const base = this.templates.towerBase.clone("towerBase", root);
      base.setEnabled(true);
      base.position.y = 1.1;
      const head = MeshBuilder.CreateBox("towerHead", { width: 1, height: 0.7, depth: 1 }, this.scene);
      head.position.y = 2.55;
      head.parent = root;
      const barrel = MeshBuilder.CreateBox("barrel", { width: 0.2, height: 0.2, depth: 1.1 }, this.scene);
      barrel.material = this.m.gun;
      barrel.parent = root;
      return { root, head, barrel, tier: 0, dispose: () => root.dispose() };
    }, (view, t) => {
      view.root.position.set(t.pos.x, 0, t.pos.z);
      view.root.rotation.y = t.facing;
      if (view.tier !== t.tier) {
        // Tier mai mare = cap mai mare, altă culoare, țeavă mai lungă.
        view.tier = t.tier;
        const k = 1 + (t.tier - 1) * 0.15;
        view.head.material = this.m[`tier${t.tier}`];
        view.head.scaling.setAll(k);
        view.barrel.scaling.set(1 + (t.tier - 1) * 0.2, 1 + (t.tier - 1) * 0.2, k);
        view.barrel.position.set(0, 2.55, 0.55 * k + 0.15);
        this.fx.ring(t.pos, 2, TOWER_TIER_COLORS[t.tier - 1], 0.6);
      }
    });
  }

  private syncBarricades(state: GameState): void {
    syncMap(this.barricadeViews, state.barricades, (b) => {
      const root = new TransformNode("barricade", this.scene);
      const fence = this.templates.fence.clone("fence", root);
      fence.setEnabled(true);
      // Gardul stă „cu fața” spre adăpost (perpendicular pe raza din centru).
      root.rotation.y = Math.atan2(b.pos.x, b.pos.z) + Math.PI / 2;
      const bar = new HpBar(this.scene, this.m.hpBg, this.m.hpFence, 1.6);
      return { root, bar, dispose: () => { root.dispose(); bar.dispose(); } };
    }, (view, b) => {
      view.root.position.set(b.pos.x, 0, b.pos.z);
      // Gardul se „lasă” pe măsură ce e lovit.
      view.root.scaling.y = 0.55 + 0.45 * (b.hp / b.maxHp);
      view.bar.set(b.pos, 1.9, b.hp / b.maxHp);
    });
  }

  private syncCoins(state: GameState): void {
    syncMap(this.coinViews, state.coins, () => {
      const m = this.templates.coin.clone("coin");
      m.setEnabled(true);
      return m;
    }, (view, c) => {
      view.position.set(c.pos.x, 0.5 + Math.sin(state.time * 4 + c.id) * 0.15, c.pos.z);
      view.rotation.y = state.time * 3;
    });
  }

  private syncZones(state: GameState): void {
    syncMap(this.zoneViews, state.zones, () => {
      const m = this.templates.zone.clone("zoneView");
      m.setEnabled(true);
      return m;
    }, (view, z) => {
      const pulse = 1 + Math.sin(state.time * 5) * 0.04;
      view.position.set(z.pos.x, 0.06, z.pos.z);
      view.scaling.set(z.radius * pulse, 1, z.radius * pulse);
    });
  }

  // ---------- Mod construcție ----------

  /** Transformă un punct de pe ecran în poziție pe sol (sau null). */
  pickGround(screenX: number, screenY: number): Vec2 | null {
    const ray = this.scene.createPickingRay(screenX, screenY, null, this.camera);
    if (ray.direction.y >= 0) return null;
    const t = -ray.origin.y / ray.direction.y;
    return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t };
  }

  /** Arată „fantoma” construcției (verde = se poate construi, roșu = nu). */
  setGhost(pos: Vec2 | null, kind: BuildKind, valid: boolean, range = 0): void {
    const isTower = kind === "tower";
    this.ghostTower.setEnabled(!!pos && isTower);
    this.ghostFence.setEnabled(!!pos && !isTower);
    this.rangeRing.setEnabled(!!pos && range > 0);
    if (!pos) return;
    const ghost = isTower ? this.ghostTower : this.ghostFence;
    ghost.position.x = pos.x;
    ghost.position.z = pos.z;
    ghost.rotation.y = Math.atan2(pos.x, pos.z) + Math.PI / 2;
    ghost.material = valid ? this.m.ghostOk : this.m.ghostBad;
    this.rangeRing.position.x = pos.x;
    this.rangeRing.position.z = pos.z;
    this.rangeRing.scaling.set(range, 1, range);
  }

  hideGhost(): void {
    this.setGhost(null, "tower", false);
  }

  /** Șterge toate entitățile (pentru „Joacă din nou”). */
  reset(): void {
    const maps: Map<EntityId, { dispose(): void }>[] = [
      this.heroViews, this.zombieViews, this.towerViews, this.barricadeViews, this.coinViews, this.zoneViews,
    ];
    for (const map of maps) {
      for (const v of map.values()) v.dispose();
      map.clear();
    }
    this.hideGhost();
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
  create: (entity: E) => V,
  update: (view: V, entity: E) => void,
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
    view.dispose();
    views.delete(id);
  }
}
