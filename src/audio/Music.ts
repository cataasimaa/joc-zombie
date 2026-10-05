// Muzica jocului, compusă „din mers” cu Web Audio (fără fișiere).
//
// Două straturi, ca să nu acopere sunetele importante (arbaleta se aude și pe telefon):
//  - ÎNTRE VALURI: un drone jos ca de vânt + un acord rar (re minor).
//  - ÎN VAL (noaptea): același drone + un puls ritmic JOS și energic: tobă mare pe fiecare timp,
//    bas în optimi (în șaisprezecimi la pericol mare), tom-uri sincopate și un „BRAAM” la 8 măsuri.
//    Fără melodie și fără sunete înalte. Tempo-ul crește cu pericolul.
//  - O tobă mare rară când o brută lovește un zid (accent()).
//  - Boss: vântul tace și rămâne o notă joasă ținută; când moare boss-ul, vântul revine.
//  - Victorie / game over: muzica se oprește (stinger-ele sunt în Sfx), apoi liniște.
// Un „planificator” programează notele puțin în avans, pe un tempo fix.

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // număr MIDI → frecvență

// Re minor: acordurile rare dintre valuri (note MIDI).
const CHORDS = [
  [50, 57, 62, 65], // Dm
  [46, 53, 58, 62], // Bb
  [43, 50, 55, 58], // Gm
  [45, 52, 57, 61], // A
];

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
/** Basul de noapte, pe optimi (semitonuri peste rădăcină): galop care împinge înainte. */
const BASS = [0, 0, 12, 0, 0, 10, 0, 7];
/** Tom-uri sincopate pe 16 șaisprezecimi (1 = lovitură). */
const TOMS = [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0];

export class Music {
  /** Stratul dintre valuri (drone + acord rar). */
  private calm: GainNode;
  /** Stratul de val (pulsul ritmic). */
  private terror: GainNode;
  private danger = 0;
  private nextBeat = 0;
  private beat = 0;
  private timer: number;
  private windGain: GainNode;
  private windBand: BiquadFilterNode;
  private bossGain: GainNode;
  private heartbeatAt = 0;
  private epic: GainNode;
  private menu = false;
  private themeAt = 0;
  private themeIndex = 0;
  private boss = false;
  /** După victorie / game over: liniște până la jocul următor. */
  private silent = false;
  private accentAt = 0;

  constructor(private ctx: AudioContext, private out: AudioNode, private reverb: AudioNode, private noise: AudioBuffer) {
    this.calm = ctx.createGain();
    this.terror = ctx.createGain();
    this.calm.gain.value = 0.5;
    this.terror.gain.value = 0;
    this.calm.connect(out);
    this.terror.connect(out);
    this.calm.connect(reverb);

    // Drone-ul de vânt: zgomot filtrat îngust, care urcă și coboară încet (se aude în ambele straturi).
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    wind.playbackRate.value = 0.35;
    this.windBand = ctx.createBiquadFilter();
    this.windBand.type = "bandpass";
    this.windBand.frequency.value = 320;
    this.windBand.Q.value = 3;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.07;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 140;
    sweep.connect(sweepDepth).connect(this.windBand.frequency);
    sweep.start();
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.5;
    wind.connect(this.windBand).connect(this.windGain).connect(out);
    this.windGain.connect(reverb);
    wind.start();
    // Sub vânt: o cvintă foarte joasă (re), abia simțită.
    const hum = ctx.createGain();
    hum.gain.value = 0.05;
    for (const f of [NOTE(38), NOTE(45)]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(hum);
      o.start();
    }
    hum.connect(this.windGain);

    // Nota ținută a boss-ului: re foarte jos + o octavă, aspre și filtrate (pornește doar la boss).
    this.bossGain = ctx.createGain();
    this.bossGain.gain.value = 0;
    const bossLp = ctx.createBiquadFilter();
    bossLp.type = "lowpass";
    bossLp.frequency.value = 420;
    for (const [f, d] of [[NOTE(26), -6], [NOTE(38), 5], [NOTE(45), 0]] as const) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(bossLp);
      o.start();
    }
    bossLp.connect(this.bossGain).connect(out);
    this.bossGain.connect(reverb);

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
      this.silent = false;
      this.setBoss(false);
      this.calm.gain.setTargetAtTime(0, t, 0.5);
      this.terror.gain.setTargetAtTime(0, t, 0.5);
      this.windGain.gain.setTargetAtTime(0.25, t, 1);
      this.themeAt = this.nextBeat;
      this.themeIndex = 0;
    }
  }

  /** 0 = liniște deplină, 1 = groază maximă. Tranziția e lină. */
  setDanger(d: number): void {
    if (this.menu || this.silent) return;
    const t = this.ctx.currentTime;
    this.danger += (d - this.danger) * 0.05;
    const k = this.danger;
    this.calm.gain.setTargetAtTime(0.5 * Math.pow(1 - k, 1.5), t, 0.5);
    this.terror.gain.setTargetAtTime(Math.min(1, 0.25 + k * 0.9) * (k > 0.2 ? 1 : k * 5), t, 0.5);
    if (!this.boss) this.windGain.gain.setTargetAtTime(0.45 + k * 0.2, t, 1);
  }

  /** Boss pe hartă: vântul tace, rămâne o notă joasă ținută. Boss mort: vântul revine. */
  setBoss(on: boolean): void {
    if (this.boss === on) return;
    this.boss = on;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(on ? 0 : 0.5, t, on ? 0.15 : 1.5);
    this.bossGain.gain.setTargetAtTime(on && !this.silent ? 0.16 : 0, t, on ? 0.6 : 0.4);
  }

  /** O tobă mare, rară (o brută a lovit un zid). */
  accent(): void {
    if (this.menu || this.silent) return;
    const t = this.ctx.currentTime;
    if (t < this.accentAt) return;
    this.accentAt = t + 2.5;
    this.drum(t + 0.02, 1.3, this.out);
    this.drum(t + 0.2, 0.6, this.out);
  }

  /** Victorie / game over: muzica se taie, rămâne liniștea (stinger-ul îl cântă Sfx). */
  end(): void {
    this.silent = true;
    const t = this.ctx.currentTime;
    for (const g of [this.calm, this.terror, this.windGain, this.bossGain]) g.gain.setTargetAtTime(0, t, 0.25);
  }

  /** Joc nou: muzica revine. */
  resume(): void {
    if (!this.silent) return;
    this.silent = false;
    this.boss = false;
    this.windGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.5);
  }

  stop(): void {
    window.clearInterval(this.timer);
  }

  private schedule(): void {
    const ctx = this.ctx;
    const beatLen = this.menu ? 60 / 76 : 60 / (112 + this.danger * 26); // tempo crește cu pericolul
    while (this.nextBeat < ctx.currentTime + 0.25) {
      if (!this.silent) this.playBeat(this.nextBeat, beatLen);
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
    const k = this.danger;
    const root = CHORDS[Math.floor(bar / 4) % CHORDS.length][0] - 24;

    // ÎNTRE VALURI: un acord rar, lung, care se pierde în vânt.
    if (b % 16 === 0 && (Math.random() < 0.5 || b === 0)) {
      const chord = CHORDS[Math.floor(bar / 4) % CHORDS.length];
      for (const n of chord) this.pad(NOTE(n), t, beatLen * 14);
    }

    // ÎN VAL: pulsul. Toba mare pe fiecare timp, basul pe optimi, tom-uri sincopate.
    if (k > 0.2) {
      this.kick(t, 0.55 + k * 0.45);
      const sixteenth = k > 0.65;
      for (let i = 0; i < (sixteenth ? 4 : 2); i++) {
        const step = BASS[(inBar * 2 + Math.floor(i / (sixteenth ? 2 : 1))) % BASS.length];
        const at = t + (i * beatLen) / (sixteenth ? 4 : 2);
        this.lowString(NOTE(root + 12 + step), at, beatLen * (sixteenth ? 0.22 : 0.42), 0.07 + k * 0.05);
      }
      if (k > 0.4) {
        for (let i = 0; i < 4; i++) {
          if (TOMS[inBar * 4 + i]) this.tom(t + (i * beatLen) / 4, 0.35 + k * 0.4, inBar % 2 ? 105 : 82);
        }
      }
      // „BRAAM”: o lovitură de alămuri joase, înfundate, la început de frază (8 măsuri).
      if (b % 32 === 0) this.braam(NOTE(root + 12), t, beatLen * 6, 0.12 + k * 0.08);
      // Tobe care se rostogolesc la sfârșit de frază.
      if (k > 0.55 && b % 16 === 15) for (let i = 0; i < 4; i++) this.tom(t + (i * beatLen) / 4, 0.3 + i * 0.12, 120 - i * 10);
    }
    // Bătăi de inimă când zombii sunt foarte aproape.
    if (k > 0.6 && t >= this.heartbeatAt) {
      this.heartbeat(t);
      this.heartbeatAt = t + 0.9 - k * 0.35;
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

  private drum(t: number, vol: number, bus: AudioNode = this.terror): void {
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

  /** Toba mare de noapte: un „bum” jos și scurt, fără pocnitură (nu acoperă arbaleta). */
  private kick(t: number, vol: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42 * vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.terror);
    o.start(t);
    o.stop(t + 0.32);
  }

  /** Tom de război (taiko mic): ton care coboară + puțin zgomot jos. */
  private tom(t: number, vol: number, freq: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.terror);
    g.connect(this.reverb);
    o.start(t);
    o.stop(t + 0.37);
  }

  /** „BRAAM”: alămuri joase, înfundate, care se umflă și se sting. */
  private braam(freq: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.exponentialRampToValueAtTime(650, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [mult, detune] of [[1, -7], [1, 6], [1.5, 0], [0.5, 0]] as const) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq * mult;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lp.connect(g).connect(this.terror);
    g.connect(this.reverb);
  }
}
