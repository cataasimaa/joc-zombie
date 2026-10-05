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

    this.nextBeat = ctx.currentTime + 0.2;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  /** 0 = liniște deplină, 1 = groază maximă. Tranziția e lină. */
  setDanger(d: number): void {
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
    const beatLen = 60 / (70 + this.danger * 40); // tempo crește cu pericolul
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

  private drum(t: number, vol: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(this.terror);
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
    src.connect(lp).connect(ng).connect(this.terror);
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
