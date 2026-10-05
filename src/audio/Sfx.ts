// Efecte sonore generate din cod (Web Audio), fără fișiere audio.
// Sunt placeholder-e: mai târziu le putem înlocui cu sunete CC0 (ex. Kenney).
// Pe iPhone, sunetul pornește doar după prima atingere a ecranului (regula browserului).

import type { GameEvent, PlayerId } from "../core";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastShot = 0;
  muted = false;

  constructor() {
    const unlock = () => {
      this.init();
      void this.ctx?.resume();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  private init(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    // Zgomot alb, refolosit pentru împușcături și explozii.
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  play(events: GameEvent[], localPlayer: PlayerId): void {
    if (!this.ctx || this.muted || this.ctx.state !== "running") return;
    for (const e of events) {
      switch (e.type) {
        case "shot": {
          // Limităm numărul de împușcături pe secundă, altfel devine zgomot continuu.
          const now = this.ctx.currentTime;
          if (now - this.lastShot < (e.crit ? 0 : 0.06)) break;
          this.lastShot = now;
          this.burst(e.source === "tower" ? 900 : 2000, 0.05, e.crit ? 0.5 : 0.18);
          break;
        }
        case "zombieDied":
          this.tone(e.zombieType === "boss" ? 60 : 140, 60, 0.25, "sawtooth", 0.12);
          break;
        case "coinPicked":
          if (e.playerId === localPlayer) {
            this.tone(990, 990, 0.06, "square", 0.08);
            this.tone(1320, 1320, 0.1, "square", 0.08, 0.06);
          }
          break;
        case "shelterHit":
          this.tone(90, 50, 0.15, "sine", 0.25);
          break;
        case "ability":
          if (["grenade", "airstrike", "slam"].includes(e.ability)) this.burst(300, 0.4, 0.6);
          else if (["heal", "healZone", "revive", "holyLight"].includes(e.ability)) this.chord([523, 659, 784], 0.4);
          else this.tone(300, 600, 0.2, "triangle", 0.2);
          break;
        case "waveStarted":
          this.tone(220, 220, 0.5, "sawtooth", 0.15);
          this.tone(165, 165, 0.7, "sawtooth", 0.15, 0.4);
          break;
        case "waveCleared":
          this.chord([392, 523, 659], 0.6);
          break;
        case "levelUp":
          this.chord([523, 784, 1047], 0.5);
          break;
        case "chestOpened":
          if (e.playerId === localPlayer) {
            const notes = { common: [523], rare: [523, 659], epic: [523, 659, 784], legendary: [523, 659, 784, 1047] }[e.rarity];
            notes.forEach((f, i) => this.tone(f, f, 0.25, "triangle", 0.2, i * 0.1));
          }
          break;
        case "towerPlaced":
        case "barricadePlaced":
        case "towerUpgraded":
          this.burst(200, 0.12, 0.3);
          break;
        case "heroDied":
          this.tone(400, 100, 0.6, "sawtooth", 0.2);
          break;
        case "gameOver":
          this.tone(300, 60, 1.5, "sawtooth", 0.25);
          break;
        case "victory":
          this.chord([523, 659, 784, 1047], 1.2);
          break;
      }
    }
  }

  private tone(f1: number, f2: number, dur: number, type: OscillatorType, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur);
  }

  private chord(freqs: number[], dur: number): void {
    freqs.forEach((f, i) => this.tone(f, f, dur, "triangle", 0.12, i * 0.08));
  }

  private burst(cutoff: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
  }
}
