// Navigare cu „flow field”: împărțim harta în pătrățele de 1×1 și calculăm o singură dată,
// pentru fiecare pătrățel, distanța (pe drum ocolit, nu în linie dreaptă) până la adăpost.
// Un zombie se uită la pătrățelele vecine și merge spre cel mai apropiat de adăpost.
// Așa ocolește casele și brazii fără să se blocheze. Câmpurile depind doar de hartă
// (obstacole fixe), deci se calculează o dată per mărime de zombie și se refolosesc.

import { CONFIG } from "./config";
import { OBSTACLES } from "./map";
import type { Vec2 } from "./math";

const CELL = 1;
const HALF = CONFIG.map.halfSize;
const N = Math.round((HALF * 2) / CELL);
const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

interface FlowField {
  dist: Float32Array;
  blocked: Uint8Array;
}

const fields = new Map<number, FlowField>();

const cellCenter = (i: number) => -HALF + (i + 0.5) * CELL;
const toCell = (v: number) => Math.min(N - 1, Math.max(0, Math.floor((v + HALF) / CELL)));

function buildField(radius: number): FlowField {
  const blocked = new Uint8Array(N * N);
  const dist = new Float32Array(N * N).fill(Infinity);
  const shelterR = CONFIG.shelter.radius;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = cellCenter(i);
      const z = cellCenter(j);
      if (Math.abs(x) > HALF - radius || Math.abs(z) > HALF - radius) {
        blocked[j * N + i] = 1;
        continue;
      }
      for (const o of OBSTACLES) {
        const r = o.radius + radius;
        if ((x - o.pos.x) ** 2 + (z - o.pos.z) ** 2 < r * r) {
          blocked[j * N + i] = 1;
          break;
        }
      }
    }
  }

  // Dijkstra simplu pornind de la pătrățelele din jurul adăpostului.
  const open: number[] = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(cellCenter(i), cellCenter(j));
      if (d <= shelterR + radius + 1 && !blocked[j * N + i]) {
        dist[j * N + i] = 0;
        open.push(j * N + i);
      }
    }
  }
  // Coadă de priorități naivă (heap binar), suficientă pentru 6400 de celule.
  const heap = new MinHeap();
  for (const c of open) heap.push(c, 0);
  while (heap.size > 0) {
    const [c, d] = heap.pop();
    if (d > dist[c]) continue;
    const ci = c % N;
    const cj = (c - ci) / N;
    for (const [di, dj, cost] of NEIGHBORS) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const n = nj * N + ni;
      if (blocked[n]) continue;
      // Pe diagonală doar dacă nu „tăiem colțul” unui obstacol.
      if (di !== 0 && dj !== 0 && (blocked[cj * N + ni] || blocked[nj * N + ci])) continue;
      const nd = d + cost;
      if (nd < dist[n]) {
        dist[n] = nd;
        heap.push(n, nd);
      }
    }
  }
  return { dist, blocked };
}

function fieldFor(radius: number): FlowField {
  // Grupăm zombii pe mărimi (0.5 m) ca să avem doar câteva câmpuri.
  const key = Math.ceil(radius * 2) / 2;
  let f = fields.get(key);
  if (!f) {
    f = buildField(key + 0.05);
    fields.set(key, f);
  }
  return f;
}

/** True dacă din punctul dat există drum până la adăpost pentru un zombie de raza dată. */
export function canReachShelter(pos: Vec2, radius: number): boolean {
  const f = fieldFor(radius);
  return Number.isFinite(f.dist[toCell(pos.z) * N + toCell(pos.x)]);
}

/**
 * Direcția (vector unitate) în care trebuie să meargă un zombie de raza dată ca să ajungă
 * la adăpost pe drumul cel mai scurt. Null dacă nu există drum (atunci merge direct).
 */
export function flowDirection(pos: Vec2, radius: number): Vec2 | null {
  const f = fieldFor(radius);
  const ci = toCell(pos.x);
  const cj = toCell(pos.z);
  // Căutăm vecinul cu distanța cea mai mică (într-o fereastră mai mare dacă suntem pe o celulă blocată).
  const reach = f.blocked[cj * N + ci] ? 2 : 1;
  let best = f.blocked[cj * N + ci] ? Infinity : f.dist[cj * N + ci];
  let bi = -1;
  let bj = -1;
  for (let dj = -reach; dj <= reach; dj++) {
    for (let di = -reach; di <= reach; di++) {
      if (di === 0 && dj === 0) continue;
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      // Pe o celulă blocată (lipit de un obstacol) preferăm celulele libere cele mai apropiate.
      const d = f.dist[nj * N + ni] + Math.hypot(di, dj) * (reach > 1 ? 2 : 0.01);
      if (d < best) {
        best = d;
        bi = ni;
        bj = nj;
      }
    }
  }
  if (bi < 0) return null;
  const dx = cellCenter(bi) - pos.x;
  const dz = cellCenter(bj) - pos.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

class MinHeap {
  private items: number[] = [];
  private prios: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, prio: number) {
    this.items.push(item);
    this.prios.push(prio);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.prios[p] <= this.prios[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.items[0], this.prios[0]];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prios.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prios[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prios[l] < this.prios[m]) m = l;
        if (r < this.items.length && this.prios[r] < this.prios[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prios[a], this.prios[b]] = [this.prios[b], this.prios[a]];
  }
}
