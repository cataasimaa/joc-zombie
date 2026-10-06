// Terenul: zăpadă cu relief ușor, poteci bătătorite spre adăpost, petice de pământ înghețat,
// iar dincolo de marginea hărții dealuri mai înalte care „închid” satul.
// Relieful e doar vizual: logica jocului rămâne pe plan (înălțimile în zona de joc sunt mici).

import { Mesh, MeshBuilder, type Scene, VertexBuffer } from "@babylonjs/core";
import { CONFIG, GAME_MAP } from "../core";
import type { Materials } from "./ModelKit";
import { fbm, noise2, smoothstep } from "./noise";
import { PAL, mix } from "./palette";

const HALF = CONFIG.map.halfSize;
const SIZE = HALF * 2 + 70;

/** Potecile: curbe de la margine spre adăpost (unghiul de pornire + cât de șerpuită e). */
const PATHS = [
  { angle: 0.3, wiggle: 0.18 },
  { angle: 1.9, wiggle: 0.22 },
  { angle: 3.4, wiggle: 0.15 },
  { angle: 4.8, wiggle: 0.2 },
];

/** Cât de aproape e punctul de o potecă (1 = pe potecă, 0 = departe). */
function pathAmount(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r < 4) return 1;
  const a = Math.atan2(z, x);
  let best = 0;
  for (const p of PATHS) {
    // Unghiul potecii variază ușor cu distanța → potecă șerpuită.
    const pa = p.angle + Math.sin(r * 0.12 + p.angle * 3) * p.wiggle;
    let da = Math.abs(a - pa);
    da = Math.min(da, Math.PI * 2 - da);
    const width = 1.3 + noise2(r * 0.3, p.angle * 10) * 0.6;
    best = Math.max(best, 1 - smoothstep(width * 0.6, width, da * r));
  }
  return best;
}

/** Înălțimea terenului într-un punct. Entitățile o folosesc ca să stea pe zăpadă. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  // Valuri mici de zăpadă în zona de joc.
  let h = (fbm(x * 0.08, z * 0.08) - 0.5) * 0.7;
  // Plat în jurul adăpostului.
  h *= smoothstep(5, 12, r);
  // Potecile sunt puțin adâncite (zăpadă bătătorită).
  h -= pathAmount(x, z) * 0.12;
  // Albia bălții: malul coboară lin spre apă (apa stă la -0,25 m).
  const p = GAME_MAP.pond;
  const dp = Math.hypot(x - p.pos.x, z - p.pos.z);
  if (dp < p.radius + 2) {
    const k = smoothstep(p.radius + 1.8, p.radius - 0.8, dp);
    h = h * (1 - k) + -0.6 * k;
  }
  // Dincolo de margine: dealuri și troiene.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const outside = smoothstep(HALF - 2, HALF + 14, edge);
  h += outside * (2.5 + fbm(x * 0.05 + 7, z * 0.05) * 6);
  return h;
}

export function createTerrain(scene: Scene, mats: Materials): Mesh {
  const ground = MeshBuilder.CreateGround("terrain", { width: SIZE, height: SIZE, subdivisions: 140, updatable: false }, scene);
  const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
  const colors = new Float32Array((pos.length / 3) * 4);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const z = pos[i + 2];
    const h = terrainHeight(x, z);
    pos[i + 1] = h;

    // Culoarea: zăpadă, cu umbre albăstrui în adâncituri, pământ înghețat pe petice, poteci gri.
    let c = PAL.snow.clone();
    const hollow = smoothstep(0.05, -0.3, h) * 0.5 + (fbm(x * 0.2 + 3, z * 0.2) - 0.5) * 0.4;
    c = mix(c, PAL.snowShadow, Math.max(0, hollow));
    const dirtNoise = fbm(x * 0.11 + 40, z * 0.11 - 12, 3);
    const dirt = smoothstep(0.66, 0.74, dirtNoise) * smoothstep(8, 12, Math.hypot(x, z));
    c = mix(c, mix(PAL.dirt, PAL.snowShadow, 0.35), dirt * 0.85);
    // Zăpadă călcată în jurul minei (unde stau și se bat toți): gri-albăstruie, cu dâre de pași.
    const r = Math.hypot(x, z);
    const trampled = smoothstep(11, 5, r) * (0.55 + noise2(x * 0.9, z * 0.9) * 0.45);
    const streaks = noise2(x * 2.6 + z * 0.8, z * 2.6 - x * 0.8);
    c = mix(c, mix(PAL.snowShadow, PAL.path, 0.25 + streaks * 0.3), trampled * 0.55);
    // Spre margini zăpada e neatinsă și mai luminoasă (acolo începe ceața).
    c = mix(c, PAL.snow, smoothstep(HALF - 14, HALF - 2, Math.max(Math.abs(x), Math.abs(z))) * 0.5);
    const path = pathAmount(x, z) * smoothstep(HALF + 4, HALF - 4, Math.max(Math.abs(x), Math.abs(z)));
    c = mix(c, mix(PAL.path, PAL.dirt, 0.15 + noise2(x * 0.7, z * 0.7) * 0.2), path * 0.85);
    const j = i / 3;
    colors[j * 4] = c.r;
    colors[j * 4 + 1] = c.g;
    colors[j * 4 + 2] = c.b;
    colors[j * 4 + 3] = 1;
  }
  ground.setVerticesData(VertexBuffer.PositionKind, pos);
  ground.setVerticesData(VertexBuffer.ColorKind, colors);
  ground.createNormals(true);
  ground.isPickable = false;
  ground.receiveShadows = true;
  ground.material = mats.terrain;
  return ground;
}
