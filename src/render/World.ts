// Decorul static al hărții: zăpadă, adăpost, case, brazi, ninsoare.
// Se construiește o singură dată; nu depinde de starea jocului (în afară de tremuratul adăpostului).

import {
  Color3,
  Color4,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { CONFIG, GAME_MAP } from "../core";

export function makeMaterial(scene: Scene, name: string, color: Color3, emissive = 0, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = Color3.Black();
  if (emissive) m.emissiveColor = color.scale(emissive);
  if (alpha < 1) m.alpha = alpha;
  return m;
}

export class World {
  readonly shelter: TransformNode;
  private snowEmitter = new Vector3();

  constructor(private scene: Scene) {
    const snow = makeMaterial(scene, "snow", new Color3(0.95, 0.97, 1));
    const wood = makeMaterial(scene, "wood", new Color3(0.45, 0.28, 0.15));
    const darkWood = makeMaterial(scene, "darkWood", new Color3(0.3, 0.18, 0.1));
    const roofMat = makeMaterial(scene, "roof", new Color3(0.85, 0.9, 0.95));
    const pine = makeMaterial(scene, "pine", new Color3(0.13, 0.35, 0.22));
    const shelterMat = makeMaterial(scene, "shelterWood", new Color3(0.55, 0.35, 0.2));
    const windowMat = makeMaterial(scene, "window", new Color3(1, 0.8, 0.4), 0.9);

    const size = CONFIG.map.halfSize * 2;
    const ground = MeshBuilder.CreateGround("ground", { width: size + 60, height: size + 60 }, scene);
    ground.material = snow;

    // Adăpostul: o casă mai mare în centru, cu fereastră luminată (familia e înăuntru).
    const shelter = new TransformNode("shelter", scene);
    const r = CONFIG.shelter.radius;
    const body = MeshBuilder.CreateBox("shelterBody", { width: r * 1.5, depth: r * 1.5, height: 2.6 }, scene);
    body.position.y = 1.3;
    body.material = shelterMat;
    body.parent = shelter;
    const roof = MeshBuilder.CreateCylinder("shelterRoof", { diameter: r * 1.6, height: r * 1.8, tessellation: 3 }, scene);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.scaling.x = 0.8;
    roof.position.y = 2.6 + 0.25 * r * 1.6 * 0.8;
    roof.material = roofMat;
    roof.parent = shelter;
    const door = MeshBuilder.CreateBox("door", { width: 1, height: 1.6, depth: 0.1 }, scene);
    door.position.set(0, 0.8, -r * 0.76);
    door.material = darkWood;
    door.parent = shelter;
    const win = MeshBuilder.CreateBox("window", { width: 0.8, height: 0.6, depth: 0.1 }, scene);
    win.position.set(1.2, 1.6, -r * 0.76);
    win.material = windowMat;
    win.parent = shelter;
    this.shelter = shelter;

    // Case de lemn: un template, apoi instanțe (mult mai ieftin pentru GPU).
    const houseBody = MeshBuilder.CreateBox("houseBody", { size: 1 }, scene);
    houseBody.material = wood;
    const houseRoof = MeshBuilder.CreateCylinder("houseRoof", { diameter: 1, height: 1, tessellation: 3 }, scene);
    houseRoof.material = roofMat;
    for (const [i, h] of GAME_MAP.houses.entries()) {
      const node = new TransformNode(`house${i}`, scene);
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
    const cone = MeshBuilder.CreateCylinder("cone", { diameterTop: 0, diameterBottom: 1.8, height: 3, tessellation: 6 }, scene);
    cone.position.y = 2.3;
    cone.material = pine;
    const trunk = MeshBuilder.CreateCylinder("trunk", { diameter: 0.4, height: 0.9, tessellation: 5 }, scene);
    trunk.position.y = 0.45;
    trunk.material = darkWood;
    const tree = Mesh.MergeMeshes([cone, trunk], true, true, undefined, false, true)!;
    for (const [i, t] of GAME_MAP.trees.entries()) {
      const inst = tree.createInstance(`tree${i}`);
      inst.position.set(t.pos.x, 0, t.pos.z);
      inst.scaling.setAll(t.scale);
    }
    // Brazi decorativi în afara hărții, ca marginea să nu pară goală.
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2;
      const d = (CONFIG.map.halfSize + 3 + (i % 3) * 3) * 1.15;
      const inst = tree.createInstance(`border${i}`);
      inst.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      inst.scaling.setAll(1 + (i % 4) * 0.2);
    }
    tree.setEnabled(false);

    this.createSnowfall();
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

  /** Ninsoarea cade mereu în jurul camerei. */
  followCamera(cameraPos: Vector3): void {
    this.snowEmitter.set(cameraPos.x, 14, cameraPos.z + 10);
  }
}
