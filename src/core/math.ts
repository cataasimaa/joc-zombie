// Matematică 2D pe planul solului (x, z). Logica jocului nu are nevoie de înălțime (y).

export interface Vec2 {
  x: number;
  z: number;
}

export const vec = (x = 0, z = 0): Vec2 => ({ x, z });

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);

export const distSq = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/** Mută `pos` spre `target` cu cel mult `step` unități. */
export function moveTowards(pos: Vec2, target: Vec2, step: number): void {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const len = Math.hypot(dx, dz);
  if (len <= step || len === 0) {
    pos.x = target.x;
    pos.z = target.z;
    return;
  }
  pos.x += (dx / len) * step;
  pos.z += (dz / len) * step;
}

/** Unghiul (radiani) din direcția (dx, dz), măsurat de la axa +z, ca în Babylon. */
export const angleOf = (dx: number, dz: number): number => Math.atan2(dx, dz);

/**
 * Generator de numere aleatoare determinist (mulberry32).
 * Folosim un seed salvat în stare ca serverul și clienții să poată obține
 * exact aceleași rezultate (important pentru multiplayer).
 */
export function nextRandom(seedHolder: { rngState: number }): number {
  let t = (seedHolder.rngState = (seedHolder.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- Segmente (pentru zidurile de baricadă) ----------

/** Capetele unui segment de lungime `length`, centrat în `center`, rotit cu `rotation`. */
export function segmentEnds(center: Vec2, rotation: number, length: number): [Vec2, Vec2] {
  // rotation = direcția în care „privește” zidul; zidul se întinde perpendicular (stânga-dreapta).
  const hx = Math.cos(rotation) * (length / 2);
  const hz = -Math.sin(rotation) * (length / 2);
  return [
    { x: center.x - hx, z: center.z - hz },
    { x: center.x + hx, z: center.z + hz },
  ];
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq === 0 ? 0 : clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / lenSq, 0, 1);
  return { x: a.x + abx * t, z: a.z + abz * t };
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return dist(p, closestPointOnSegment(p, a, b));
}

/** Distanța minimă dintre două segmente (0 dacă se intersectează). */
export function segmentDistance(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
  const cross = (o: Vec2, p: Vec2, q: Vec2) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x);
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(
    distToSegment(a1, b1, b2),
    distToSegment(a2, b1, b2),
    distToSegment(b1, a1, a2),
    distToSegment(b2, a1, a2),
  );
}
