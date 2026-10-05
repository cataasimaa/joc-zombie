// Sunetele jocului, generate din cod cu Web Audio (fără fișiere audio).
//
// Ideea: orice sunet e o combinație de câteva „ingrediente” simple:
//  - zgomot alb filtrat (vânt, pocnituri, explozii, sânge)
//  - oscilatoare (tonuri) care alunecă în frecvență (bubuituri, gemete, melodii)
//  - distorsiune (face împușcăturile „murdare”) și reverb (spațiu deschis, rece)
// Pe iPhone, sunetul pornește doar după prima atingere a ecranului (regula browserului).

import type { GameEvent, PlayerId, WeaponId } from "../core";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private distortion!: WaveShaperNode;
  private wind: { gain: GainNode; band: BiquadFilterNode; low: GainNode } | null = null;
  private gustTimer = 0;
  private groanTimer = 4;
  private crackleTimer = 0;
  private last = new Map<string, number>();
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
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    // Compresor: sunetele puternice (explozii) nu „sparg” difuzorul telefonului.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);

    // Zgomot alb (2 s), refolosit peste tot.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Reverb: „ecoul” unui spațiu mare, generat ca zgomot care se stinge.
    const ir = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(reverb).connect(this.master);

    // Distorsiune pentru împușcături și explozii.
    this.distortion = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / curve.length) * 2 - 1;
      curve[i] = Math.tanh(x * 3.5);
    }
    this.distortion.curve = curve;
    this.distortion.connect(this.sfxBus);
    this.distortion.connect(this.reverbSend);

    this.startWind();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  // ---------- Ambient: vânt, foc, gemete ----------

  private startWind(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 500;
    band.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.06;
    src.connect(band).connect(gain).connect(this.master);

    // Strat jos: vuietul gerului.
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noise;
    src2.loop = true;
    src2.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    const low = ctx.createGain();
    low.gain.value = 0.12;
    src2.connect(lp).connect(low).connect(this.master);
    src.start();
    src2.start();
    this.wind = { gain, band, low };
  }

  /** Pe fiecare cadru: ambientul + sunetele pentru evenimentele noi. */
  update(events: GameEvent[], localPlayer: PlayerId, night: number, dt: number): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;

    // Rafale de vânt: țintă nouă din câteva în câteva secunde. Noaptea vântul e mai puternic.
    this.gustTimer -= dt;
    if (this.gustTimer <= 0 && this.wind) {
      this.gustTimer = 2 + Math.random() * 4;
      const strength = 0.04 + Math.random() * 0.07 + night * 0.05;
      this.wind.gain.gain.setTargetAtTime(strength, now, 1.2);
      this.wind.band.frequency.setTargetAtTime(300 + Math.random() * 700, now, 1.5);
      this.wind.low.gain.setTargetAtTime(0.08 + night * 0.1, now, 2);
    }
    // Focul trosnește încet.
    this.crackleTimer -= dt;
    if (this.crackleTimer <= 0) {
      this.crackleTimer = 0.05 + Math.random() * 0.25;
      this.noiseHit({ type: "highpass", freq: 2500 + Math.random() * 2000, dur: 0.012, vol: 0.02 + Math.random() * 0.03 });
    }
    // Noaptea, zombii gem în depărtare.
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 3 + Math.random() * 5;
      if (night > 0.6) this.groan(0.05, 0.9 + Math.random() * 0.4, true);
    }

    for (const e of events) this.play(e, localPlayer);
  }

  private play(e: GameEvent, localPlayer: PlayerId): void {
    switch (e.type) {
      case "shot":
        if (e.source === "tower") {
          if (this.throttle("tower", 0.08)) this.ballista();
        } else if (this.throttle("shot", e.crit ? 0 : 0.05)) this.gunshot(e.crit ? "hunting" : "rusty", e.crit);
        break;
      case "zombieHit":
        if (this.throttle("hit", 0.06)) this.noiseHit({ type: "lowpass", freq: 500, dur: 0.06, vol: 0.12 });
        break;
      case "zombieDied":
        if (this.throttle("die", 0.08)) this.groan(e.zombieType === "boss" ? 0.35 : 0.13, e.zombieType === "boss" ? 0.5 : 1, false);
        break;
      case "coinPicked":
        if (e.playerId === localPlayer && this.throttle("coin", 0.04)) {
          this.tone(1320, 1320, 0.05, "square", 0.05);
          this.tone(1760, 1760, 0.09, "square", 0.05, 0.05);
        }
        break;
      case "shelterHit":
        if (this.throttle("shelter", 0.15)) this.thunk(90, 0.25);
        break;
      case "barricadeHit":
        if (this.throttle("wallHit", 0.12)) this.thunk(160, 0.18);
        break;
      case "barricadeDestroyed":
        this.noiseHit({ type: "lowpass", freq: 1200, dur: 0.4, vol: 0.4, dist: true });
        this.thunk(70, 0.3);
        break;
      case "barricadePlaced":
      case "barricadeChanged":
      case "towerPlaced":
      case "towerUpgraded":
        this.thunk(180, 0.25);
        this.thunk(140, 0.2, 0.12);
        break;
      case "mineExploded":
        this.explosion(1);
        break;
      case "ability":
        switch (e.ability) {
          case "grenade":
          case "slam":
            this.explosion(0.8);
            break;
          case "airstrike":
            for (let i = 0; i < 5; i++) setTimeout(() => this.explosion(0.7), i * 140);
            break;
          case "molotov":
            this.noiseHit({ type: "highpass", freq: 3000, dur: 0.25, vol: 0.25 });
            this.noiseHit({ type: "bandpass", freq: 600, dur: 0.8, vol: 0.2, sweepTo: 2000 });
            break;
          case "iceShot":
            this.gunshot("hunting", true);
            [1568, 2093, 2637].forEach((f, i) => this.tone(f, f * 1.02, 0.5, "sine", 0.05, i * 0.04));
            break;
          case "heal":
          case "healZone":
          case "revive":
          case "holyLight":
            this.chord([523, 659, 784], 0.6, 0.06);
            break;
          case "taunt":
          case "fortress":
            this.tone(110, 90, 0.6, "sawtooth", 0.12);
            break;
          default:
            this.tone(300, 600, 0.2, "triangle", 0.1);
        }
        break;
      case "nightStarted":
        // Corn de vânătoare jos, ca un avertisment.
        this.tone(98, 96, 1.6, "sawtooth", 0.09, 0, 500);
        this.tone(147, 145, 1.6, "sawtooth", 0.07, 0.05, 500);
        this.groan(0.12, 0.8, true);
        break;
      case "dawn":
        this.chord([392, 494, 587, 784], 1.4, 0.05);
        break;
      case "levelUp":
        this.chord([523, 784, 1047], 0.6, 0.07);
        break;
      case "shopRoll":
        if (e.playerId !== localPlayer) break;
        // Rezultatul apare după animația „păcănelei” (≈1,1 s).
        setTimeout(() => {
          if (e.rarity === "nothing") {
            this.tone(330, 320, 0.25, "triangle", 0.12);
            this.tone(247, 220, 0.5, "triangle", 0.12, 0.25);
          } else {
            const notes = { common: [523], rare: [523, 659], epic: [523, 659, 784], legendary: [523, 659, 784, 1047] }[e.rarity];
            notes.forEach((f, i) => this.tone(f, f, 0.3, "triangle", 0.12, i * 0.1));
          }
        }, 1150);
        break;
      case "heroDied":
        this.tone(400, 100, 0.7, "sawtooth", 0.15, 0, 900);
        break;
      case "gameOver":
        this.tone(220, 55, 2.5, "sawtooth", 0.18, 0, 700);
        break;
      case "victory":
        this.chord([523, 659, 784, 1047], 2, 0.08);
        break;
    }
  }

  /** Arma de foc a eroului: pocnitură + corp distorsionat + bubuitură joasă + ecou. */
  gunshot(weapon: WeaponId, heavy = false): void {
    const k = heavy ? 1.6 : 1;
    const pitch = 0.9 + Math.random() * 0.2;
    // 1. Pocnitura (transientul).
    this.noiseHit({ type: "highpass", freq: 3500, dur: 0.02, vol: 0.35 * k });
    // 2. Corpul: zgomot care se „închide” rapid, prin distorsiune.
    this.noiseHit({ type: "lowpass", freq: 5000 * pitch, sweepTo: 500, dur: 0.11 * k, vol: 0.4 * k, dist: true });
    // 3. Bubuitura joasă.
    this.tone(150 * pitch, 45, 0.12 * k, "sine", 0.45 * k);
    // 4. Coada (ecoul în reverb).
    this.noiseHit({ type: "lowpass", freq: 900, dur: 0.35 * k, vol: 0.06 * k, reverbOnly: true });
    if (weapon === "scattergun") this.tone(90, 35, 0.25, "sine", 0.3);
  }

  /** Balista turnului: „thwack” de lemn + coardă. */
  private ballista(): void {
    this.tone(220, 120, 0.12, "triangle", 0.12);
    this.noiseHit({ type: "bandpass", freq: 1200, dur: 0.06, vol: 0.12 });
  }

  private explosion(size: number): void {
    this.noiseHit({ type: "lowpass", freq: 1800, sweepTo: 80, dur: 1.2 * size, vol: 0.7 * size, dist: true });
    this.tone(70, 25, 0.6 * size, "sine", 0.7 * size);
    this.noiseHit({ type: "lowpass", freq: 400, dur: 1.5 * size, vol: 0.12, reverbOnly: true });
  }

  private thunk(freq: number, vol: number, delay = 0): void {
    this.tone(freq, freq * 0.5, 0.12, "sine", vol, delay);
    this.noiseHit({ type: "lowpass", freq: 900, dur: 0.07, vol: vol * 0.6, delay });
  }

  /** Geamăt de zombie: ton aspru care alunecă în jos, cu vibrato. */
  private groan(vol: number, speed: number, distant: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = 0.6 / speed + Math.random() * 0.3;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const base = 90 + Math.random() * 50;
    osc.frequency.setValueAtTime(base * 1.3, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.7, t + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6 + Math.random() * 4;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 6;
    vib.connect(vibGain).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = distant ? 500 : 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g);
    g.connect(distant ? this.reverbSend : this.sfxBus);
    if (!distant) g.connect(this.reverbSend);
    osc.start(t);
    vib.start(t);
    osc.stop(t + dur);
    vib.stop(t + dur);
  }

  // ---------- Ingrediente ----------

  private throttle(key: string, gap: number): boolean {
    const now = this.ctx!.currentTime;
    if (now - (this.last.get(key) ?? -1) < gap) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(f1: number, f2: number, dur: number, type: OscillatorType, vol: number, delay = 0, lowpass = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = lowpass;
      node = osc.connect(lp);
    }
    node.connect(g).connect(this.sfxBus);
    g.connect(this.reverbSend);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private chord(freqs: number[], dur: number, vol: number): void {
    freqs.forEach((f, i) => this.tone(f, f, dur, "triangle", vol, i * 0.08));
  }

  private noiseHit(o: {
    type: BiquadFilterType;
    freq: number;
    dur: number;
    vol: number;
    sweepTo?: number;
    dist?: boolean;
    reverbOnly?: boolean;
    delay?: number;
  }): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.setValueAtTime(o.freq, t);
    if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(filter).connect(g);
    if (o.reverbOnly) g.connect(this.reverbSend);
    else if (o.dist) g.connect(this.distortion);
    else {
      g.connect(this.sfxBus);
      g.connect(this.reverbSend);
    }
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.02);
  }
}
