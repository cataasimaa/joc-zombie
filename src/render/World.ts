// Lumea statică și atmosfera: teren, brazi, pietre, case, adăpost, lumini, zi/noapte, ceață, ninsoare.

import {
  type Camera,
  Color3,
  Color4,
  ColorCurves,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  ImageProcessingConfiguration,
  type InstancedMesh,
  type Mesh,
  MeshBuilder,
  ParticleSystem,
  PointLight,
  type Scene,
  SSAO2RenderingPipeline,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { CONFIG, GAME_MAP, type Weather } from "../core";
import type { Materials, Quality } from "./ModelKit";
import { PLASMA, buildHouse, buildPine, buildRock, buildShelter, buildTree } from "./models/environment";
import { buildPond, buildTrader } from "./models/gathering";
import { buildDeadTree, buildDinoSkeleton } from "./models/survival";
import { rng } from "./noise";
import { PAL, hex, mix } from "./palette";
import { createTerrain, terrainHeight } from "./Terrain";

/** Un model refolosit prin instanțe (aceeași geometrie, desenată de multe ori dintr-un singur apel). */
export class Prefab {
  constructor(readonly sources: Mesh[]) {
    for (const s of sources) s.isVisible = false;
  }

  instance(name: string, parent: TransformNode | null = null): InstancedMesh[] {
    return this.sources.map((s) => {
      const inst = s.createInstance(name);
      inst.parent = parent;
      inst.isPickable = false;
      return inst;
    });
  }
}

const SKY_DAY = hex("#c9d6e0");
const SKY_DUSK = hex("#6b6f86");
const SKY_NIGHT = hex("#0c1422");
/** Capacul minei: deschis (rotit pe spate) și momentul în care se trântește la cădere. */
const HATCH_OPEN = 2.85;
const HATCH_AT = 1.3;

export class World {
  readonly shadows: ShadowGenerator;
  readonly pipeline: DefaultRenderingPipeline;
  readonly shelter: TransformNode;
  /** Felinarul eroului local (se aprinde noaptea). */
  readonly lantern: PointLight;
  private hemi: HemisphericLight;
  private sun: DirectionalLight;
  private plasmaLight: PointLight;
  private crystals: Mesh[] = [];
  private hatch: Mesh;
  /** Secunde de la căderea minei (-1 = mina e întreagă). */
  private mineDead = -1;
  private rain: ParticleSystem;
  private flames: Mesh[];
  private snow: ParticleSystem;
  private snowEmitter = new Vector3();
  private fogPlanes: Mesh[] = [];
  private fogMat: StandardMaterial;
  private smokeTex: DynamicTexture | null = null;
  private smoke: ParticleSystem[] = [];
  private time = 0;
  private camera: Camera;
  private ssao: SSAO2RenderingPipeline | null = null;
  private orthoHalf = 26;

  /**
   * Calitatea grafică. Înaltă: umbre clare (hartă 2048, filtrare moale), ocluzie ambientală (SSAO:
   * colțurile și locurile unde lucrurile ating zăpada se întunecă, ca în realitate), claritate.
   * Medie: fără SSAO, umbre 1024. Mică: umbre 512, fără bloom și granulație (telefoane slabe).
   */
  setQuality(q: Quality): void {
    const map = this.shadows.getShadowMap();
    map?.resize(q === "high" ? 2048 : q === "medium" ? 1024 : 512);
    this.shadows.filteringQuality = q === "high" ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    this.orthoHalf = q === "high" ? 22 : q === "medium" ? 26 : 30;
    this.sun.orthoLeft = this.sun.orthoBottom = -this.orthoHalf;
    this.sun.orthoRight = this.sun.orthoTop = this.orthoHalf;
    this.pipeline.bloomEnabled = q !== "low";
    this.pipeline.grainEnabled = q !== "low";
    this.pipeline.sharpenEnabled = q !== "low";
    const manager = this.scene.postProcessRenderPipelineManager;
    if (q === "high" && SSAO2RenderingPipeline.IsSupported) {
      if (!this.ssao) {
        const ssao = new SSAO2RenderingPipeline("ssao", this.scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [this.camera]);
        ssao.radius = 1.6;
        ssao.totalStrength = 1.1;
        ssao.base = 0.12;
        ssao.samples = 12;
        ssao.maxZ = 90;
        ssao.expensiveBlur = false;
        this.ssao = ssao;
      } else {
        manager.attachCamerasToRenderPipeline("ssao", this.camera);
      }
    } else if (this.ssao) {
      manager.detachCamerasFromRenderPipeline("ssao", this.camera);
    }
  }

  constructor(private scene: Scene, mats: Materials, camera: Camera) {
    // Post-procesare „de film”: bloom (focul strălucește), antialiasing, granulație fină,
    // corecție de culoare ACES și vignetă discretă.
    const pp = new DefaultRenderingPipeline("pp", true, scene, [camera]);
    pp.samples = 1;
    pp.fxaaEnabled = true;
    pp.bloomEnabled = true;
    pp.bloomThreshold = 0.85;
    pp.bloomWeight = 0.3;
    pp.bloomKernel = 48;
    pp.bloomScale = 0.5;
    pp.grainEnabled = true;
    pp.grain.intensity = 6;
    pp.grain.animated = true;
    pp.imageProcessingEnabled = true;
    const ip = pp.imageProcessing;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.0;
    ip.contrast = 1.25;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.8;
    ip.vignetteColor = new Color4(0.04, 0.06, 0.12, 0);
    // Gradare de culoare ca la film: umbre reci (albastre), lumini puțin calde.
    ip.colorCurvesEnabled = true;
    const curves = new ColorCurves();
    curves.shadowsHue = 215;
    curves.shadowsDensity = 22;
    curves.shadowsSaturation = 15;
    curves.highlightsHue = 35;
    curves.highlightsDensity = 8;
    curves.globalSaturation = -8;
    ip.colorCurves = curves;
    pp.sharpenEnabled = true;
    pp.sharpen.edgeAmount = 0.25;
    this.pipeline = pp;
    this.camera = camera;

    scene.fogMode = 2; // Scene.FOGMODE_EXP2
    scene.fogDensity = 0.014;

    // Lumini: cer (ambient albăstrui), soare/lună (cu umbre), focul adăpostului, felinarul eroului.
    this.hemi = new HemisphericLight("sky", new Vector3(0.2, 1, -0.3), scene);
    this.sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.55).normalize(), scene);
    this.sun.autoUpdateExtends = false;
    this.sun.orthoLeft = -34;
    this.sun.orthoRight = 34;
    this.sun.orthoTop = 34;
    this.sun.orthoBottom = -34;
    this.sun.shadowMinZ = 1;
    this.sun.shadowMaxZ = 120;

    this.shadows = new ShadowGenerator(1024, this.sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    this.shadows.bias = 0.004;
    this.shadows.normalBias = 0.03;
    this.shadows.setDarkness(0.35);

    createTerrain(scene, mats);
    this.placeTrees(mats);
    this.placeRocks(mats);
    this.placeHouses(mats);
    this.placeGathering(mats);

    const shelter = buildShelter(scene, mats);
    this.shelter = new TransformNode("shelter", scene);
    for (const m of shelter.meshes) {
      m.parent = this.shelter;
      this.shadows.addShadowCaster(m);
    }
    this.flames = shelter.flames;
    this.crystals = shelter.crystals;
    for (const c of this.crystals) c.parent = this.shelter;
    this.hatch = shelter.hatch;
    this.hatch.parent = this.shelter;
    this.hatch.position.set(0, 1.12, 1.02);
    this.hatch.rotation.x = HATCH_OPEN;
    this.shadows.addShadowCaster(this.hatch);
    // Lumina rece a plasmei din mină (al doilea accent, lângă focul cald).
    this.plasmaLight = new PointLight("plasma", new Vector3(...shelter.plasmaPos), scene);
    this.plasmaLight.diffuse = PLASMA;
    this.plasmaLight.specular = Color3.Black();
    this.plasmaLight.range = 11;

    this.lantern = new PointLight("lantern", Vector3.Zero(), scene);
    this.lantern.diffuse = mix(PAL.fire, PAL.window, 0.5);
    this.lantern.specular = Color3.Black();
    this.lantern.range = 9;
    this.lantern.intensity = 0;

    this.fogMat = new StandardMaterial("fogMat", scene);
    this.createEdgeFog();
    this.snow = this.createSnowfall();
    this.rain = this.createRain();
  }

  /** Lapovița: picături lungi, reci, care cad repede. */
  private createRain(): ParticleSystem {
    const tex = new DynamicTexture("drop", { width: 8, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, "rgba(200,220,240,0)");
    g.addColorStop(1, "rgba(220,235,255,0.9)");
    ctx.fillStyle = g;
    ctx.fillRect(3, 0, 2, 64);
    tex.update();
    tex.hasAlpha = true;
    const rain = new ParticleSystem("rain", 1500, this.scene);
    rain.particleTexture = tex;
    rain.emitter = this.snowEmitter;
    rain.minEmitBox = new Vector3(-30, 0, -26);
    rain.maxEmitBox = new Vector3(30, 4, 26);
    rain.direction1 = new Vector3(0.6, -1, 0);
    rain.direction2 = new Vector3(0.9, -1, 0.1);
    rain.minEmitPower = 22;
    rain.maxEmitPower = 28;
    rain.minLifeTime = 0.8;
    rain.maxLifeTime = 1.1;
    rain.minSize = 0.6;
    rain.maxSize = 0.9;
    rain.minScaleX = 0.05;
    rain.maxScaleX = 0.08;
    rain.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    rain.emitRate = 0;
    rain.color1 = new Color4(0.8, 0.88, 1, 0.55);
    rain.color2 = new Color4(0.7, 0.8, 0.95, 0.4);
    rain.colorDead = new Color4(1, 1, 1, 0);
    rain.start();
    return rain;
  }

  private weatherKind: Weather = "clear";
  private weatherMix = { fog: 1, snow: 1, rain: 0, wind: 0, frost: 0 };

  /** Vremea curentă (o schimbăm lin, nu brusc). */
  setWeather(w: Weather): void {
    this.weatherKind = w;
  }

  /** Cât de mult se strânge ceața spre mină noaptea (0 = deloc; Hard / Nightmare mai mult). */
  private fogCloseIn = 0;
  private fogClose = 0;
  setFogCloseIn(k: number): void {
    this.fogCloseIn = k;
  }

  // ---------- Decor ----------

  private placeTrees(mats: Materials): void {
    // Brazii din sat: detaliați. Pădurea din afara hărții: brazi simpli (mai ieftini de desenat).
    const pines = [1, 2, 3].map((seed) => new Prefab(buildPine(this.scene, mats, seed * 31)));
    const simple = [1, 2, 3].map((seed) => new Prefab(buildTree(this.scene, mats, seed * 17)));
    for (const v of [...pines, ...simple]) for (const s of v.sources) this.shadows.addShadowCaster(s);
    const r = rng(42);
    const place = (variants: Prefab[], x: number, z: number, scale: number, i: number) => {
      const node = new TransformNode(`tree${i}`, this.scene);
      node.position.set(x, terrainHeight(x, z) - 0.1, z);
      node.rotation.y = r() * Math.PI * 2;
      node.scaling.setAll(scale);
      variants[i % 3].instance(`tree${i}`, node);
      return node;
    };
    // Unul din cinci copaci din sat e mort: fără ace, cu crengi rupte și țurțuri.
    const dead = [1, 2].map((seed) => new Prefab(buildDeadTree(this.scene, mats, seed)));
    for (const v of dead) for (const s of v.sources) this.shadows.addShadowCaster(s);
    this.mapTrees = GAME_MAP.trees.map((t, i) => {
      const node = place(i % 5 === 2 ? [...dead, dead[0]] : pines, t.pos.x, t.pos.z, t.scale, i);
      return { node, hits: 0, shake: 0, fall: -1, fallDir: 0, y0: node.position.y, rotY: node.rotation.y };
    });
    // Schelete de dinozaur, pe jumătate îngropate.
    GAME_MAP.fossils.forEach((f, i) => {
      const node = new TransformNode(`fossil${i}`, this.scene);
      node.position.set(f.pos.x, terrainHeight(f.pos.x, f.pos.z) - 0.1, f.pos.z);
      node.rotation.y = f.rotation;
      node.scaling.setAll(f.scale);
      for (const m of buildDinoSkeleton(this.scene, mats, f.seed)) {
        m.parent = node;
        this.shadows.addShadowCaster(m);
      }
    });
    // Pădure deasă de pini pe dealurile din afara hărții: zombii ies din ea.
    const H = CONFIG.map.halfSize;
    let i = 1000;
    for (let ring = 0; ring < 3; ring++) {
      const d = H + 3 + ring * 4.5;
      const step = 3.2 + ring * 0.6;
      for (let s = -d; s <= d; s += step) {
        for (const [x, z] of [[s, d], [s, -d], [d, s], [-d, s]]) {
          const jx = x + (r() - 0.5) * 2.5;
          const jz = z + (r() - 0.5) * 2.5;
          place(ring === 0 ? pines : simple, jx, jz, 1.1 + r() * 0.9 + ring * 0.2, i++);
        }
      }
    }
  }

  /** Brazii din sat (pot fi tăiați): se scutură la fiecare lovitură, cad și dispar. */
  private mapTrees: { node: TransformNode; hits: number; shake: number; fall: number; fallDir: number; y0: number; rotY: number }[] = [];

  /** Sincronizează brazii cu loviturile din joc (`state.treeHits`). */
  syncTrees(treeHits: number[], felledAt: number, dt: number): void {
    this.mapTrees.forEach((t, i) => {
      const hits = treeHits[i] ?? 0;
      if (hits < t.hits) {
        // Joc nou: bradul crește la loc.
        t.node.setEnabled(true);
        t.node.rotation.set(0, t.rotY, 0);
        t.node.position.y = t.y0;
        t.fall = -1;
      } else if (hits > t.hits) {
        t.shake = 1;
        if (hits >= felledAt && t.fall < 0) {
          t.fall = 0;
          t.fallDir = Math.random() * Math.PI * 2;
        }
      }
      t.hits = hits;
      if (t.fall >= 0) {
        // Cade: întâi încet, apoi tot mai repede; după ce lovește zăpada se scufundă și dispare.
        t.fall += dt;
        const k = Math.min(1, (t.fall / 1.3) ** 2);
        t.node.rotation.set(Math.cos(t.fallDir) * k * 1.5, t.rotY, Math.sin(t.fallDir) * k * 1.5);
        if (t.fall > 2.2) t.node.position.y = t.y0 - (t.fall - 2.2) * 2;
        if (t.fall > 3.2) t.node.setEnabled(false);
        return;
      }
      if (t.shake > 0) {
        t.shake = Math.max(0, t.shake - dt * 4);
        const w = Math.sin(t.shake * 30) * t.shake * 0.05;
        t.node.rotation.set(w, t.rotY, w * 0.6);
      }
    });
  }

  /** Lacul înghețat cu copca și taraba negustorului (unde vinzi peștele). */
  private placeGathering(mats: Materials): void {
    const p = GAME_MAP.pond;
    const pond = new TransformNode("pond", this.scene);
    pond.position.set(p.pos.x, terrainHeight(p.pos.x, p.pos.z), p.pos.z);
    for (const m of buildPond(this.scene, mats, p.radius)) {
      m.parent = pond;
      m.receiveShadows = true;
    }
    const t = GAME_MAP.trader;
    const node = new TransformNode("trader", this.scene);
    node.position.set(t.pos.x, terrainHeight(t.pos.x, t.pos.z), t.pos.z);
    // Tejgheaua privește spre mină.
    node.rotation.y = Math.atan2(-t.pos.x, -t.pos.z);
    const trader = buildTrader(this.scene, mats);
    for (const m of trader.meshes) {
      m.parent = node;
      this.shadows.addShadowCaster(m);
      m.receiveShadows = true;
    }
    node.computeWorldMatrix(true);
    this.traderLamp = new PointLight("traderLamp", Vector3.TransformCoordinates(new Vector3(...trader.lampPos), node.getWorldMatrix()), this.scene);
    this.traderLamp.diffuse = PAL.window;
    this.traderLamp.specular = Color3.Black();
    this.traderLamp.range = 6;
    this.traderLamp.intensity = 0;
  }
  private traderLamp: PointLight | null = null;

  private placeRocks(mats: Materials): void {
    const variants = [5, 6, 7].map((seed) => new Prefab(buildRock(this.scene, mats, seed)));
    GAME_MAP.rocks.forEach((rock, i) => {
      const node = new TransformNode(`rock${i}`, this.scene);
      node.position.set(rock.pos.x, terrainHeight(rock.pos.x, rock.pos.z), rock.pos.z);
      node.rotation.y = rock.seed % 6;
      node.scaling.setAll(rock.size);
      variants[rock.seed % 3].instance(`rock${i}`, node);
    });
  }

  private placeHouses(mats: Materials): void {
    for (const h of GAME_MAP.houses) {
      const node = new TransformNode(`house${h.seed}`, this.scene);
      node.position.set(h.pos.x, terrainHeight(h.pos.x, h.pos.z) - 0.05, h.pos.z);
      // Casele își arată fața spre adăpost.
      node.rotation.y = Math.atan2(-h.pos.x, -h.pos.z);
      const house = buildHouse(this.scene, mats, h);
      for (const m of house.meshes) {
        m.parent = node;
        this.shadows.addShadowCaster(m);
      }
      // Fum din horn (doar la casele locuite).
      if (house.chimney) {
        node.computeWorldMatrix(true);
        this.addSmoke(Vector3.TransformCoordinates(new Vector3(...house.chimney), node.getWorldMatrix()));
      }
    }
  }

  /** Fum care iese încet din horn și e dus de vânt. */
  private addSmoke(at: Vector3): void {
    if (!this.smokeTex) {
      const tex = new DynamicTexture("smokeTex", 64, this.scene, false);
      const ctx = tex.getContext() as CanvasRenderingContext2D;
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,0.7)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      tex.update();
      tex.hasAlpha = true;
      this.smokeTex = tex;
    }
    const ps = new ParticleSystem("smoke", 50, this.scene);
    ps.particleTexture = this.smokeTex;
    ps.emitter = at;
    ps.minEmitBox = new Vector3(-0.15, 0, -0.15);
    ps.maxEmitBox = new Vector3(0.15, 0, 0.15);
    ps.direction1 = new Vector3(0.3, 1, -0.1);
    ps.direction2 = new Vector3(0.7, 1.4, 0.1);
    ps.minEmitPower = 0.5;
    ps.maxEmitPower = 0.9;
    ps.minLifeTime = 4;
    ps.maxLifeTime = 6;
    ps.emitRate = 7;
    ps.addSizeGradient(0, 0.5);
    ps.addSizeGradient(1, 2.6);
    ps.color1 = new Color4(0.55, 0.57, 0.6, 0.35);
    ps.color2 = new Color4(0.45, 0.47, 0.5, 0.3);
    ps.colorDead = new Color4(0.5, 0.52, 0.55, 0);
    ps.minAngularSpeed = -0.4;
    ps.maxAngularSpeed = 0.4;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.start();
    this.smoke.push(ps);
  }

  /** Bancuri de ceață joasă la marginea hărții (plăci semi-transparente, mereu cu fața la cameră). */
  private createEdgeFog(): void {
    const tex = new DynamicTexture("fogTex", { width: 128, height: 64 }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(64, 40, 4, 64, 40, 64);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.6, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 64);
    tex.update();
    tex.hasAlpha = true;
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;

    const m = this.fogMat;
    m.diffuseTexture = tex;
    m.opacityTexture = tex;
    m.disableLighting = true;
    m.backFaceCulling = false;
    m.fogEnabled = false;

    const H = CONFIG.map.halfSize;
    const r = rng(7);
    for (let s = -H - 6; s <= H + 6; s += 7) {
      for (const [x, z] of [[s, H + 3], [s, -H - 3], [H + 3, s], [-H - 3, s]]) {
        const p = MeshBuilder.CreatePlane("fog", { width: 18, height: 7 }, this.scene);
        p.billboardMode = TransformNode.BILLBOARDMODE_Y;
        p.material = m;
        p.isPickable = false;
        p.position.set(x + (r() - 0.5) * 4, terrainHeight(x, z) + 2.2 + r() * 1.5, z + (r() - 0.5) * 4);
        p.metadata = { phase: r() * 10, base: p.position.clone() };
        this.fogPlanes.push(p);
      }
    }
  }

  private createSnowfall(): ParticleSystem {
    const tex = new DynamicTexture("flake", 32, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    tex.update();
    tex.hasAlpha = true;

    const snow = new ParticleSystem("snow", 1400, this.scene);
    snow.particleTexture = tex;
    snow.emitter = this.snowEmitter;
    snow.minEmitBox = new Vector3(-32, 0, -28);
    snow.maxEmitBox = new Vector3(32, 4, 28);
    // Vânt dinspre stânga: fulgii cad oblic.
    snow.direction1 = new Vector3(1.2, -1, 0.2);
    snow.direction2 = new Vector3(2.0, -1, -0.2);
    snow.minSize = 0.08;
    snow.maxSize = 0.24;
    snow.minLifeTime = 4;
    snow.maxLifeTime = 6.5;
    snow.emitRate = 230;
    snow.minEmitPower = 3;
    snow.maxEmitPower = 5;
    snow.minAngularSpeed = -2;
    snow.maxAngularSpeed = 2;
    snow.color1 = new Color4(1, 1, 1, 0.95);
    snow.color2 = new Color4(0.85, 0.92, 1, 0.7);
    snow.colorDead = new Color4(1, 1, 1, 0);
    snow.start();
    return snow;
  }

  // ---------- Pe fiecare cadru ----------

  /**
   * @param night 0 = zi senină, 1 = noapte deplină (valorile intermediare = amurg/zori)
   * @param focus punctul urmărit de cameră (eroul)
   */
  /** Mina a căzut: plasma pâlpâie și se stinge, capacul se trântește, cristalele se sting. */
  mineFall(): void {
    if (this.mineDead < 0) this.mineDead = 0;
  }

  /** Mina din nou întreagă (joc nou). */
  resetMine(): void {
    this.mineDead = -1;
    this.hatch.rotation.x = HATCH_OPEN;
    for (const c of this.crystals) c.setEnabled(true);
    this.plasmaLight.setEnabled(true);
  }

  /** Mina e închisă (capacul trântit) — după cădere. */
  get mineClosed(): boolean {
    return this.mineDead >= HATCH_AT + 0.3;
  }

  private updateMineFall(dt: number): void {
    this.mineDead += dt;
    const t = this.mineDead;
    // 0 – 1,3 s: plasma pâlpâie tot mai rar; cristalele clipesc.
    const flicker = t < 1.3 ? (Math.sin(t * 47) * Math.sin(t * 13.7) > (t / 1.3) * 0.6 - 0.2 ? 1 : 0.05) : Math.max(0, 1 - (t - 1.3) * 2) * 0.1;
    this.plasmaLight.intensity *= flicker;
    this.crystals.forEach((c, i) => {
      c.setEnabled(t < 1.6 && Math.sin(t * (31 + i * 7) + i) > t / 1.6 - 0.4);
      c.scaling.scaleInPlace(Math.max(0.5, 1 - t * 0.3));
    });
    // ~1,3 s: capacul cade și se trântește, cu un mic recul.
    const k = Math.min(1, Math.max(0, (t - HATCH_AT) / 0.35));
    const bounce = k >= 1 ? Math.sin(Math.min(1, (t - HATCH_AT - 0.35) / 0.35) * Math.PI) * 0.08 * Math.max(0, 1 - (t - HATCH_AT - 0.35) * 3) : 0;
    this.hatch.rotation.x = HATCH_OPEN * (1 - k * k) + bounce;
    if (t > 2) this.plasmaLight.setEnabled(false);
  }

  update(dt: number, night: number, focus: Vector3, cameraPos: Vector3): void {
    this.time += dt;
    const t = this.time;
    const dusk = Math.max(0, 1 - Math.abs(night - 0.5) * 2.5); // vârf la amurg

    // Cer și ceață.
    const sky = night < 0.5 ? mix(SKY_DAY, SKY_DUSK, night * 2) : mix(SKY_DUSK, SKY_NIGHT, (night - 0.5) * 2);
    this.scene.clearColor = new Color4(sky.r, sky.g, sky.b, 1);
    this.scene.fogColor = sky;
    // Vremea: ceață mai deasă la viscol / lapoviță, ninsoare mai multă sau deloc, vânt lateral.
    const W = CONFIG.weather[this.weatherKind];
    const target = {
      fog: W.fog,
      snow: this.weatherKind === "rain" ? 0 : this.weatherKind === "blizzard" ? 5.5 : this.weatherKind === "clear" ? 0.25 : this.weatherKind === "frost" ? 0.35 : this.weatherKind === "wind" ? 1.6 : 1,
      rain: this.weatherKind === "rain" ? 1 : 0,
      wind: this.weatherKind === "blizzard" ? 1 : this.weatherKind === "wind" ? 0.8 : 0,
      frost: this.weatherKind === "frost" ? 1 : 0,
    };
    const lerp = Math.min(1, dt * 0.5);
    for (const key of Object.keys(target) as (keyof typeof target)[]) this.weatherMix[key] += (target[key] - this.weatherMix[key]) * lerp;
    const wm = this.weatherMix;
    // Pe Hard / Nightmare ceața se strânge noaptea în jurul minei (încet, nu brusc).
    this.fogClose += (this.fogCloseIn * night - this.fogClose) * Math.min(1, dt * 0.3);
    this.scene.fogDensity = (0.011 + night * 0.012) * wm.fog * (1 + this.fogClose * 1.2);
    this.snow.emitRate = 230 * wm.snow;
    this.rain.emitRate = 900 * wm.rain;
    const side = 1.2 + wm.wind * 5;
    this.snow.direction1.set(side, -1, 0.2);
    this.snow.direction2.set(side + 0.8, -1, -0.2);
    this.snow.minEmitPower = 3 + wm.wind * 4;
    this.snow.maxEmitPower = 5 + wm.wind * 6;

    // Ambient: alb-albastru ziua, albastru închis noaptea (la ger, și mai rece).
    this.hemi.diffuse = mix(mix(hex("#e4edf5"), hex("#4d6a9c"), night), hex("#9cc8ff"), this.weatherMix.frost * 0.35);
    this.hemi.groundColor = mix(hex("#9aabb8"), hex("#1b2436"), night);
    this.hemi.intensity = 0.72 - night * 0.3;

    // Soarele (jos, rece) devine portocaliu la amurg și lună albastră noaptea.
    const sunColor = night < 0.5 ? mix(hex("#fff1df"), hex("#ff9a5a"), dusk) : mix(hex("#ff9a5a"), hex("#8fb4ff"), (night - 0.5) * 2);
    this.sun.diffuse = sunColor;
    this.sun.intensity = 1.55 - night * 0.75;
    this.shadows.setDarkness(0.25 + night * 0.3);
    // Lumina de umbre urmărește camera.
    this.sun.position = focus.subtract(this.sun.direction.scale(50));

    // Focul pâlpâie, mai puternic noaptea.
    const flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
    void flicker; // focul de tabără are acum lumina lui (vezi SurvivalView)
    this.flames.forEach((f, i) => {
      f.scaling.set(0.85 + Math.sin(t * 9 + i) * 0.15, 0.8 + Math.sin(t * 11 + i * 2) * 0.25, 0.85 + Math.cos(t * 8 + i) * 0.15);
      f.rotation.y = t * (0.5 + i * 0.3);
    });
    // Plasma pulsează încet.
    const pulse = 0.5 + Math.sin(t * 2.2) * 0.5;
    this.plasmaLight.intensity = 0.6 + night * 1.4 + pulse * 0.4;
    this.crystals.forEach((c, i) => {
      const k = 0.92 + Math.sin(t * 2.2 + i * 0.9) * 0.08;
      c.scaling.set(k, 0.95 + Math.sin(t * 2.2 + i) * 0.07, k);
    });
    if (this.mineDead >= 0) this.updateMineFall(dt);
    this.lantern.intensity = night * 1.4 * (0.95 + Math.sin(t * 9) * 0.05);
    if (this.traderLamp) this.traderLamp.intensity = 0.2 + night * 1.2 * (0.93 + Math.sin(t * 7 + 1) * 0.07);
    // Noaptea bloom-ul e mai puternic: focul și ferestrele „ard” în întuneric.
    this.pipeline.bloomWeight = 0.25 + night * 0.45;
    this.pipeline.bloomThreshold = 0.85 - night * 0.25;
    // Fumul e mai închis noaptea.
    for (const ps of this.smoke) {
      const v = 0.55 - night * 0.35;
      ps.color1 = new Color4(v, v + 0.02, v + 0.05, 0.35);
    }

    // Ceața de la margini: se mișcă încet, se întunecă noaptea.
    this.fogMat.emissiveColor = mix(hex("#e3ebf1"), hex("#26334a"), night);
    this.fogMat.alpha = 0.75 - night * 0.15;
    for (const p of this.fogPlanes) {
      const { phase, base } = p.metadata as { phase: number; base: Vector3 };
      const pull = 1 - this.fogClose * 0.5;
      p.position.x = base.x * pull + Math.sin(t * 0.15 + phase) * 2;
      p.position.z = base.z * pull + Math.cos(t * 0.12 + phase) * 2;
    }

    // Ninsoare în jurul camerei. Noaptea fulgii „prind” lumina (amestec aditiv).
    this.snowEmitter.set(cameraPos.x - 10, 16, cameraPos.z + 16);
    this.snow.blendMode = night > 0.5 ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
    const flake = night > 0.5 ? new Color4(0.55, 0.65, 0.85, 0.6) : new Color4(1, 1, 1, 0.95);
    this.snow.color1 = flake;
    this.snow.color2 = new Color4(flake.r * 0.9, flake.g * 0.95, flake.b, flake.a * 0.7);
  }
}
