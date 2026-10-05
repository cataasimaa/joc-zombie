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
