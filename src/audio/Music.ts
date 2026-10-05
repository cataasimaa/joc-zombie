// Muzica jocului, compusă „din mers” cu Web Audio (fără fișiere).
//
// Două straturi care se amestecă după cât de mare e pericolul (setDanger 0..1):
//  - LINIȘTE: acorduri lente, melancolice, și o melodie rară ca de pian / cutie muzicală (re minor).
//  - TEROARE: un vuiet jos și disonant, viori tremurate, tobe grele și bătăi de inimă.
// Un „planificator” programează notele puțin în avans, pe un tempo fix.

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // număr MIDI → frecvență

// Re minor: acordurile (note MIDI) și scara pentru melodie.
const CHORDS = [
  [50, 57, 62, 65], // Dm
  [46, 53, 58, 62], // Bb
  [43, 50, 55, 58], // Gm
  [45, 52, 57, 61], // A
];
const MELODY = [62, 64, 65, 67, 69, 72, 74, 76, 77];

// Tema din meniu (eroică, rece): Dm – Bb – F – C, cor + alămuri + tobe de război.
const EPIC_CHORDS = [
  [38, 50, 57, 62, 65], // Dm
  [34, 46, 53, 58, 62], // Bb
  [41, 53, 57, 60, 65], // F
  [36, 48, 55, 60, 64], // C
];
/** Melodia de alămuri: [notă MIDI, durată în timpi] (0 = pauză). */
const EPIC_THEME: [number, number][] = [
  [62, 2], [69, 1], [67, 1], [65, 2], [64, 1], [62, 1],
  [65, 2], [67, 1], [69, 1], [72, 3], [0, 1],
  [70, 2], [69, 1], [67, 1], [65, 2], [67, 1], [69, 1],
  [67, 2], [64, 1], [60, 1], [62, 4],
];
/** Ostinato de noapte (corzi joase, optimi): rădăcina acordului curent. */
const OSTINATO = [0, 0, 12, 0, 3, 0, 12, 7];

export class Music {
  private calm: GainNode;
  private terror: GainNode;
  private danger = 0;
  private nextBeat = 0;
  private beat = 0;
  private timer: number;
  private droneGain: GainNode;
  private tremGain: GainNode;
  private heartbeatAt = 0;
  private epic: GainNode;
  private menu = false;
  private themeAt = 0;
  private themeIndex = 0;

  constructor(private ctx: AudioContext, out: AudioNode, private reverb: AudioNode, private noise: AudioBuffer) {
    this.calm = ctx.createGain();
    this.terror = ctx.createGain();
    this.calm.gain.value = 0.5;
    this.terror.gain.value = 0;
    this.calm.connect(out);
    this.terror.connect(out);
    this.calm.connect(reverb);

    // Vuietul de fond al terorii: două tonuri foarte joase, puțin dezacordate (disonanță).
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.18;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    for (const f of [NOTE(26), NOTE(27) * 1.003, NOTE(38)]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(lp);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    lp.connect(this.droneGain).connect(this.terror);

    // Viori „tremurate”: un cluster sus, cu volumul care pulsează rapid.
    this.tremGain = ctx.createGain();
    this.tremGain.gain.value = 0;
    const strings = ctx.createGain();
    strings.gain.value = 0.035;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1100;
    bp.Q.value = 0.8;
    for (const f of [NOTE(69), NOTE(70), NOTE(76) * 1.004]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(bp);
      o.start();
    }
    const trem = ctx.createOscillator();
    trem.frequency.value = 9;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.5;
    trem.connect(tremDepth).connect(strings.gain);
    trem.start();
    bp.connect(strings).connect(this.tremGain).connect(this.terror);
    this.tremGain.connect(reverb);

    this.epic = ctx.createGain();
    this.epic.gain.value = 0;
    this.epic.connect(out);
    this.epic.connect(reverb);

    this.nextBeat = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  /** Meniul: tema eroică în locul muzicii de joc. */
  setMenu(on: boolean): void {
    if (this.menu === on) return;
    this.menu = on;
    const t = this.ctx.currentTime;
    this.epic.gain.setTargetAtTime(on ? 0.75 : 0, t, 0.8);
    if (on) {
      this.calm.gain.setTargetAtTime(0, t, 0.5);
      this.terror.gain.setTargetAtTime(0, t, 0.5);
      this.themeAt = this.nextBeat;
      this.themeIndex = 0;
    }
  }

  /** 0 = liniște deplină, 1 = groază maximă. Tranziția e lină. */
  setDanger(d: number): void {
    if (this.menu) return;
    const t = this.ctx.currentTime;
    this.danger += (d - this.danger) * 0.05;
    const k = this.danger;
    this.calm.gain.setTargetAtTime(0.5 * Math.pow(1 - k, 1.5), t, 0.5);
    this.terror.gain.setTargetAtTime(Math.min(1, k * 1.2), t, 0.5);
    this.tremGain.gain.setTargetAtTime(Math.max(0, k - 0.45) * 1.6, t, 0.8);
  }

  stop(): void {
    window.clearInterval(this.timer);
  }

  private schedule(): void {
    const ctx = this.ctx;
    const beatLen = this.menu ? 60 / 76 : 60 / (70 + this.danger * 45); // tempo crește cu pericolul
    while (this.nextBeat < ctx.currentTime + 0.25) {
      this.playBeat(this.nextBeat, beatLen);
      this.nextBeat += beatLen;
      this.beat++;
    }
  }

  private playBeat(t: number, beatLen: number): void {
    const b = this.beat;
    const bar = Math.floor(b / 4);
    const inBar = b % 4;
    if (this.menu) {
      this.playMenuBeat(t, beatLen, b);
      return;
    }

    // NOAPTE: ostinato de corzi joase pe optimi și tobe de război — muzica e alertă de la început.
    if (this.danger > 0.4) {
      const root = CHORDS[Math.floor(bar / 2) % CHORDS.length][0];
      for (const half of [0, 0.5]) {
        const step = OSTINATO[(inBar * 2 + (half ? 1 : 0)) % OSTINATO.length];
        this.lowString(NOTE(root - 12 + step), t + half * beatLen, beatLen * 0.45, 0.05 + this.danger * 0.04);
      }
      if (inBar === 1 || inBar === 3) this.snare(t, 0.25 + this.danger * 0.25);
      if (inBar === 3) this.snare(t + beatLen * 0.5, 0.18);
    }

    // LINIȘTE: un acord nou la fiecare 2 măsuri, melodie rară.
    if (b % 8 === 0) {
      const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
      for (const n of chord) this.pad(NOTE(n), t, beatLen * 8.5);
    }
    if (Math.random() < 0.35) {
      const n = MELODY[Math.floor(Math.random() * MELODY.length)];
      this.pianoNote(NOTE(n), t + (Math.random() < 0.3 ? beatLen / 2 : 0));
    }

    // TEROARE: tobe grele pe timpii 1 și 3 (și mai dese la pericol mare).
    if (this.danger > 0.25) {
      if (inBar === 0 || inBar === 2 || (this.danger > 0.7 && Math.random() < 0.4)) this.drum(t, 0.5 + this.danger * 0.5);
      if (this.danger > 0.6 && Math.random() < 0.15) this.screech(t);
    }
    // Bătăi de inimă când zombii sunt foarte aproape.
    if (this.danger > 0.55 && t >= this.heartbeatAt) {
      const gap = 0.9 - this.danger * 0.4;
      this.heartbeat(t);
      this.heartbeatAt = t + gap;
    }
  }

  /** Tema din meniu: cor, alămuri și tobe de război. */
  private playMenuBeat(t: number, beatLen: number, b: number): void {
    const bar = Math.floor(b / 4);
    const inBar = b % 4;
    if (b % 8 === 0) {
      const chord = EPIC_CHORDS[Math.floor(bar / 2) % EPIC_CHORDS.length];
      for (const n of chord.slice(1)) this.choir(NOTE(n), t, beatLen * 8.2);
      this.lowString(NOTE(chord[0]), t, beatLen * 8, 0.09, this.epic);
    }
    // Tobe de război: BUM . BUM-BUM . , cu un tunet de timpane la început de frază.
    if (inBar === 0) this.drum(t, 0.9, this.epic);
    if (inBar === 2) {
      this.drum(t, 0.7, this.epic);
      this.drum(t + beatLen * 0.5, 0.55, this.epic);
    }
    if (b % 16 === 15) for (let i = 0; i < 6; i++) this.drum(t + (i * beatLen) / 6, 0.25 + i * 0.08, this.epic);
    // Melodia de alămuri (pornește după 2 măsuri de introducere).
    if (b >= 8 && t >= this.themeAt) {
      const [note, len] = EPIC_THEME[this.themeIndex % EPIC_THEME.length];
      if (note) this.brass(NOTE(note), t, len * beatLen * 0.95);
      this.themeAt = t + len * beatLen - 0.001;
      this.themeIndex++;
    }
  }

  /** Cor („aaah”): fierăstrău filtrat prin două benzi ca vocala „a”. */
  private choir(freq: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 1.2);
    g.gain.setValueAtTime(0.03, t + dur - 1.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q] of [[750, 6], [1150, 8]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = q;
      for (const detune of [-8, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = detune;
        o.connect(bp);
        o.start(t);
        o.stop(t + dur + 0.1);
      }
      bp.connect(g);
    }
    g.connect(this.epic);
  }

  /** Alămuri: fierăstrău cu filtru care se „deschide” (atac strălucitor). */
  private brass(freq: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(2200, t + 0.15);
    lp.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.08);
    g.gain.setValueAtTime(0.06, t + Math.max(0.1, dur - 0.15));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    for (const [mult, detune] of [[1, -4], [1, 5], [0.5, 0]] as const) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq * mult;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.3);
    }
    lp.connect(g).connect(this.epic);
  }

  /** Corzi joase, scurte (ostinato) sau lungi (bas). */
  private lowString(freq: number, t: number, dur: number, vol: number, bus: GainNode = this.terror): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const detune of [-5, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lp.connect(g).connect(bus);
  }

  /** Tobă mică de război (pocnet scurt). */
  private snare(t: number, vol: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(bp).connect(g).connect(this.terror);
    src.start(t, Math.random());
    src.stop(t + 0.2);
  }

  private pad(freq: number, t: number, dur: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 2.2);
    g.gain.setValueAtTime(0.035, t + dur - 2.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    for (const detune of [-6, 5]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    lp.connect(g).connect(this.calm);
  }

  /** O notă de „pian”: atac rapid, se stinge încet, cu o armonică discretă. */
  private pianoNote(freq: number, t: number): void {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    for (const [mult, vol] of [[1, 1], [2, 0.25], [3, 0.08]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * mult;
      const og = ctx.createGain();
      og.gain.value = vol;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 2.5);
    }
    g.connect(this.calm);
  }

  private drum(t: number, vol: number, bus: GainNode = this.terror): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(bus);
    g.connect(this.reverb);
    o.start(t);
    o.stop(t + 0.65);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 300;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2 * vol, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    src.connect(lp).connect(ng).connect(bus);
    src.start(t, Math.random());
    src.stop(t + 0.3);
  }

  private heartbeat(t: number): void {
    for (const [dt, vol] of [[0, 0.5], [0.22, 0.35]] as const) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(65, t + dt);
      o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.15);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol * this.danger, t + dt);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.2);
      o.connect(g).connect(this.terror);
      o.start(t + dt);
      o.stop(t + dt + 0.25);
    }
  }

  /** Un scârțâit de vioară care urcă: tensiune. */
  private screech(t: number): void {
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(NOTE(84), t);
    o.frequency.exponentialRampToValueAtTime(NOTE(88), t + 1.5);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(bp).connect(g).connect(this.terror);
    g.connect(this.reverb);
    o.start(t);
    o.stop(t + 1.7);
  }
}
