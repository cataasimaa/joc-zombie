// Muzica „de studio”: piese stereo generate offline de tools/music_synth.py (src/assets/music).
//
// Fiecare moment din joc are piesa lui, care se repetă fără cusătură:
//  - meniu: tema eroică (alămuri, cor, tobe de război);
//  - zi: două piese calme (harpă + flaut, cutie muzicală + pian), pe rând de la o zi la alta;
//  - noapte: două straturi care merg sincron — baza (drone, bas, cor) și lupta (taiko, coarde
//    staccato, alămuri, „BRAAM”), al doilea se aude tot mai tare cu cât e mai mare pericolul;
//  - boss: piesă rapidă și grea; Regele Iernii are piesa lui (clopot, orgă, cor);
//  - valul fără sfârșit: cea mai rapidă piesă.
// Piesele se decodează doar când e nevoie de ele (memorie puțină pe telefon) și trec una în
// alta cu fade. Până se încarcă, cântă muzica făcută din cod (Music.ts).

import type { ZombieType } from "../core";

const URLS = import.meta.glob("../assets/music/*.mp3", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const url = (name: string): string | undefined => URLS[`../assets/music/${name}.mp3`];

type Scene = "menu" | "day" | "night" | "boss" | "king" | "endless" | "silent";

/** Volumul fiecărei piese (cele de zi sunt calme, deci mai încet). */
const GAIN: Record<string, number> = {
  menu: 0.85, day_a: 0.5, day_b: 0.55, night_lo: 0.7, night_hi: 0.85, boss: 0.8, king: 0.85, endless: 0.75,
};
/** Câte piese decodate ținem în memorie (noaptea are nevoie de două deodată). */
const CACHE = 4;

interface Playing {
  scene: Scene;
  gain: GainNode;
  sources: AudioBufferSourceNode[];
  /** Stratul de luptă de noapte (volumul urmează pericolul). */
  hi?: GainNode;
}

export interface MusicFrame {
  menu: boolean;
  ended: boolean;
  stage?: "campaign" | "bossRush" | "endless";
  phase?: string;
  bossType?: ZombieType | null;
  danger: number;
}

export class MusicTracks {
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private failed = new Set<string>();
  private used = new Map<string, number>();
  private current: Playing | null = null;
  private wanted: Scene = "silent";
  private dayIndex = 0;
  private hiLevel = 0;

  constructor(private ctx: AudioContext, private out: AudioNode) {}

  /** Piesele există în build (altfel rămâne doar muzica din cod). */
  get available(): boolean {
    return !!url("menu");
  }

  /** Cântă acum o piesă (nu mai e nevoie de muzica din cod). */
  get active(): boolean {
    return this.current !== null && this.current.scene !== "silent";
  }

  update(f: MusicFrame): void {
    const scene = this.pick(f);
    if (scene !== this.wanted) {
      if (scene === "day" && this.wanted !== "day") this.dayIndex++;
      this.wanted = scene;
    }
    if (!this.current || this.current.scene !== this.wanted) this.tryStart(this.wanted);
    // Stratul de luptă: urcă repede, coboară încet.
    if (this.current?.hi) {
      const target = Math.min(1, Math.max(0, (f.danger - 0.12) * 1.6));
      this.hiLevel += (target - this.hiLevel) * (target > this.hiLevel ? 0.04 : 0.01);
      this.current.hi.gain.setTargetAtTime(GAIN.night_hi * (0.15 + 0.85 * this.hiLevel), this.ctx.currentTime, 0.3);
    }
  }

  private pick(f: MusicFrame): Scene {
    if (f.menu) return "menu";
    if (f.ended || f.phase === "victory" || f.phase === "gameover") return "silent";
    const boss: Scene | null = f.bossType ? (f.bossType === "frostKing" ? "king" : "boss") : null;
    if (f.stage === "endless") return boss ?? "endless";
    if (f.stage === "bossRush") {
      // Pauza de 25 s dintre boși păstrează piesa de boss (nu sare pe muzica de zi).
      if (boss) return boss;
      return this.wanted === "king" || this.wanted === "boss" ? this.wanted : "boss";
    }
    if (boss) return boss;
    return f.phase === "night" ? "night" : "day";
  }

  private names(scene: Scene): string[] {
    switch (scene) {
      case "menu": return ["menu"];
      case "day": return [this.dayIndex % 2 ? "day_a" : "day_b"];
      case "night": return ["night_lo", "night_hi"];
      case "boss": return ["boss"];
      case "king": return ["king"];
      case "endless": return ["endless"];
      default: return [];
    }
  }

  private tryStart(scene: Scene): void {
    const names = this.names(scene);
    if (names.some((n) => this.failed.has(n) || !url(n))) {
      this.fadeOut(); // piesa lipsește: lăsăm muzica din cod
      return;
    }
    const bufs: AudioBuffer[] = [];
    for (const n of names) {
      const b = this.buffers.get(n);
      if (!b) {
        void this.load(n);
        continue;
      }
      this.used.set(n, performance.now());
      bufs.push(b);
    }
    if (scene === "silent") {
      this.fadeOut();
      this.current = { scene, gain: this.ctx.createGain(), sources: [] };
      return;
    }
    if (bufs.length < names.length) return; // încă se decodează; cântă ce era

    const ctx = this.ctx;
    const t = ctx.currentTime + 0.05;
    this.fadeOut(scene === "boss" || scene === "king" ? 0.4 : 1.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + (scene === "boss" || scene === "king" ? 0.6 : 2.5));
    gain.connect(this.out);
    const playing: Playing = { scene, gain, sources: [] };
    names.forEach((n, i) => {
      const src = ctx.createBufferSource();
      src.buffer = bufs[i];
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = n === "night_hi" ? GAIN.night_hi * 0.15 : GAIN[n] ?? 0.7;
      if (n === "night_hi") playing.hi = g;
      src.connect(g).connect(gain);
      src.start(t); // straturile nopții pornesc în aceeași clipă → rămân sincrone
      playing.sources.push(src);
    });
    if (scene === "night") this.hiLevel = 0;
    this.current = playing;
  }

  private fadeOut(time = 1.2): void {
    const old = this.current;
    if (!old) return;
    this.current = null;
    const t = this.ctx.currentTime;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + time);
    for (const s of old.sources) s.stop(t + time + 0.05);
    window.setTimeout(() => old.gain.disconnect(), (time + 0.3) * 1000);
  }

  private load(name: string): Promise<AudioBuffer | null> {
    const pending = this.loading.get(name);
    if (pending) return pending;
    const u = url(name)!;
    const p = fetch(u)
      .then((r) => r.arrayBuffer())
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buf) => {
        this.evict();
        this.buffers.set(name, buf);
        this.used.set(name, performance.now());
        return buf;
      })
      .catch(() => {
        this.failed.add(name);
        return null;
      })
      .finally(() => this.loading.delete(name));
    this.loading.set(name, p);
    return p;
  }

  /** Scoate din memorie piesa folosită cel mai demult (nu pe cele care cântă acum). */
  private evict(): void {
    while (this.buffers.size >= CACHE) {
      const playingNow = new Set(this.current ? this.names(this.current.scene) : []);
      let oldest: string | null = null;
      let oldestAt = Infinity;
      for (const [n] of this.buffers) {
        if (playingNow.has(n)) continue;
        const at = this.used.get(n) ?? 0;
        if (at < oldestAt) {
          oldestAt = at;
          oldest = n;
        }
      }
      if (!oldest) return;
      this.buffers.delete(oldest);
    }
  }
}
