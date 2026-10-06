// Sunetele jocului, generate din cod cu Web Audio (fără fișiere audio).
//
// Ideea: orice sunet e o combinație de câteva „ingrediente” simple:
//  - zgomot alb filtrat (vânt, pocnituri, explozii, sânge)
//  - oscilatoare (tonuri) care alunecă în frecvență (bubuituri, gemete, melodii)
//  - distorsiune (face împușcăturile „murdare”) și reverb (spațiu deschis, rece)
// Pe iPhone, sunetul pornește doar după prima atingere a ecranului (regula browserului).

import type { EntityId, GameEvent, PlayerId, ShopRarity, TowerKind, WeaponId } from "../core";
import { Music } from "./Music";

// Vocile înregistrate (generate de tools/zombie_voices.py cu un sintetizator de vorbire): gemete,
// răgete de atac, țipete, horcăit de moarte, gemetele eroului lovit. Vite le dă ca URL-uri.
const VOICE_URLS = import.meta.glob("../assets/sfx/*.mp3", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const VOICE_GROUPS = {
  moan: ["moan1", "moan2", "moan3", "moan4"],
  attack: ["attack1", "attack2", "attack3"],
  bruteAttack: ["brute_attack"],
  bruteMoan: ["brute_moan"],
  shriek: ["shriek"],
  gurgle: ["gurgle"],
  death: ["death1", "death2"],
  hurt: ["hurt1", "hurt2", "hurt3"],
} as const;
type VoiceGroup = keyof typeof VOICE_GROUPS;

export interface SfxFrame {
  events: GameEvent[];
  localPlayer: PlayerId;
  localHero: EntityId | null;
  /** 0 = zi, 1 = noapte. */
  night: number;
  /** 0..1: cât de periculos e momentul (pentru muzică). */
  danger: number;
  /** Pașii făcuți de eroul local în cadrul ăsta. */
  steps: number;
  /** Arma fiecărui erou (pentru sunetul împușcăturii). */
  weaponOf: (heroId: EntityId) => WeaponId;
  dt: number;
  /** E un boss viu pe hartă (vântul tace, rămâne o notă ținută). */
  boss?: boolean;
  /** Distanța de la eroul local la cel mai apropiat zombi (pentru gemete). */
  nearestZombie?: number;
  /** Runda e în desfășurare (zi / noapte); false după victorie / game over. */
  running?: boolean;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private distortion!: WaveShaperNode;
  private wind: { gain: GainNode; band: BiquadFilterNode; low: GainNode } | null = null;
  private gustTimer = 0;
  /** Vântul tace (boss) sau e „înghițit” o clipă (brută în zid). */
  private windHush = 0;
  private bossOn = false;
  private ended = false;
  private groanTimer = 4;
  private crackleTimer = 0;
  private last = new Map<string, number>();
  private music: Music | null = null;
  private spinIndex = 0;
  private musicBus: GainNode | null = null;
  muted = false;
  musicOn = true;
  private menu = false;

  constructor() {
    const unlock = () => {
      this.init();
      void this.ctx?.resume();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  private voices = new Map<string, AudioBuffer>();

  /** Încarcă vocile (în fundal); până se încarcă, se folosește vocea sintetizată din cod. */
  private loadVoices(ctx: AudioContext): void {
    for (const [path, url] of Object.entries(VOICE_URLS)) {
      const name = path.split("/").pop()!.replace(".mp3", "");
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
        .then((audio) => this.voices.set(name, audio))
        .catch(() => {
          // fără fișier: rămâne vocea sintetizată
        });
    }
  }

  /**
   * Redă o voce din grup (aleasă la întâmplare), cu mică variație de înălțime ca să nu sune la fel.
   * `distant` = înfundată și cu ecou (departe). Întoarce false dacă vocile nu s-au încărcat încă.
   */
  private voice(group: VoiceGroup, vol: number, opts: { pitch?: number; distant?: boolean; delay?: number } = {}): boolean {
    const names = VOICE_GROUPS[group];
    const buf = this.voices.get(names[Math.floor(Math.random() * names.length)]);
    if (!buf || !this.ctx) return false;
    const ctx = this.ctx;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.pitch ?? 1) * (0.9 + Math.random() * 0.2);
    const g = ctx.createGain();
    g.gain.value = vol;
    let node: AudioNode = src.connect(g);
    if (opts.distant) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1100;
      node = node.connect(lp);
      node.connect(this.reverbSend);
      const dry = ctx.createGain();
      dry.gain.value = 0.4;
      node.connect(dry).connect(this.sfxBus);
    } else {
      node.connect(this.sfxBus);
      const wet = ctx.createGain();
      wet.gain.value = 0.35;
      node.connect(wet).connect(this.reverbSend);
    }
    src.start(t);
    return true;
  }

  private init(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());
    this.loadVoices(ctx);
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
    const musicBus = (this.musicBus = ctx.createGain());
    musicBus.gain.value = this.musicOn ? 0.55 : 0;
    musicBus.connect(this.master);
    this.music = new Music(ctx, musicBus, this.reverbSend, this.noise);
    this.music.setMenu(this.menu);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  /** Meniul principal: tema eroică. */
  setMenu(on: boolean): void {
    this.menu = on;
    if (on) this.ended = false;
    this.music?.setMenu(on);
  }

  setMusicOn(on: boolean): void {
    this.musicOn = on;
    if (this.ctx && this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.1);
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

  /** Pe fiecare cadru: ambientul, muzica, pașii și sunetele pentru evenimentele noi. */
  update(f: SfxFrame): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const { night, dt } = f;
    // Joc nou după un final: muzica și vântul revin.
    if (f.running && this.ended) {
      this.ended = false;
      this.music?.resume();
      this.gustTimer = 0;
    }
    this.music?.setDanger(f.danger);
    const boss = !!f.boss && !this.ended;
    if (boss !== this.bossOn) {
      this.bossOn = boss;
      this.music?.setBoss(boss);
      this.gustTimer = 0;
    }

    // Rafale de vânt: țintă nouă din câteva în câteva secunde. Noaptea vântul e mai puternic.
    // Boss: vântul tace. Brută în zid: vântul scade o clipă. Final: liniște.
    this.windHush = Math.max(0, this.windHush - dt);
    this.gustTimer -= dt;
    if (this.wind && (this.bossOn || this.ended)) {
      this.wind.gain.gain.setTargetAtTime(0, now, this.ended ? 0.8 : 0.15);
      this.wind.low.gain.setTargetAtTime(0, now, this.ended ? 0.8 : 0.15);
    } else if (this.gustTimer <= 0 && this.wind && this.windHush <= 0) {
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
    // Zombii gem: rar și departe când sunt departe, des și tare când se apropie de tine.
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      const d = f.nearestZombie ?? Infinity;
      const close = d < 22 ? 1 - d / 22 : 0;
      this.groanTimer = close > 0 ? 0.7 + (1 - close) * 2.2 + Math.random() * 0.8 : 3 + Math.random() * 5;
      if (close > 0) this.groan(0.08 + close * 0.22, 0.8 + Math.random() * 0.5, close < 0.4);
      else if (night > 0.6) this.groan(0.06, 0.9 + Math.random() * 0.4, true);
    }
    for (let i = 0; i < f.steps; i++) this.footstep();

    for (const e of f.events) this.play(e, f);
  }

  private play(e: GameEvent, f: SfxFrame): void {
    const mine = (heroId: EntityId) => heroId === f.localHero;
    switch (e.type) {
      case "shot":
        if (this.throttle(`shot${e.heroId}`, 0.035)) this.gunshot(e.heroId !== undefined ? f.weaponOf(e.heroId) : "rusty", !!e.crit);
        break;
      case "towerFired":
        // Tesla: un țiuit doar cât atinge ținta. Racheta: șuieră când pleacă. Restul sună la impact.
        if (e.kind === "tesla" && this.throttle("tower_tesla", 0.05)) this.towerShot("tesla", false);
        if (e.kind === "rocket" && this.throttle("tower_rocket", 0.08)) this.towerShot("rocket", e.special === "big");
        break;
      case "towerAbility":
        // Gheața n-are sunet de atac: doar trosnetul crustei (evenimentul „frozen”).
        if (e.kind === "tesla") this.laser();
        break;
      case "frozen":
        this.iceCrack(Math.min(3, e.count));
        break;
      case "shellHit":
        this.shellHit(e.kind, e.special);
        break;
      case "towerHit":
        if (this.throttle("towerHit", 0.12)) this.thunk(130, 0.22);
        break;
      case "towerDestroyed":
        this.crumble(1.2);
        break;
      case "chestDropped":
        this.shimmer(1.5);
        break;
      case "chestOpened":
        if (e.playerId === f.localPlayer) this.spinResult(e.rarity);
        this.crumble(0.4);
        break;
      case "chestHit":
        if (this.throttle("chestHit", 0.08)) this.thunk(200, 0.3);
        break;
      case "picked":
        if (e.playerId === f.localPlayer && this.throttle("pick", 0.06)) {
          if (e.kind === "ammo") [0, 0.05, 0.1].forEach((d) => this.click(2400, 0.12, d));
          else this.thunk(260, 0.15);
        }
        break;
      case "ate":
        if (e.playerId === f.localPlayer) for (let i = 0; i < 3; i++) this.noiseHit({ type: "bandpass", freq: 900, dur: 0.06, vol: 0.12, delay: i * 0.14 });
        break;
      case "drank":
        // Înghițituri: trei „glug”-uri joase.
        if (e.playerId === f.localPlayer) for (let i = 0; i < 3; i++) this.tone(260, 150, 0.09, "sine", 0.22, i * 0.17, 900);
        break;
      case "refilled":
        // Apa care curge în canistră: un șuvoi care urcă în ton.
        if (e.playerId === f.localPlayer) {
          this.noiseHit({ type: "bandpass", freq: 700, sweepTo: 1600, dur: 0.7, vol: 0.14 });
          this.tone(380, 620, 0.5, "sine", 0.06, 0.1);
        }
        break;
      case "fishTug":
        // Peștele se smucește: firul zbârnâie și apa plescăie.
        this.noiseHit({ type: "bandpass", freq: 3200, sweepTo: 2200, dur: 0.14, vol: 0.16 });
        this.noiseHit({ type: "lowpass", freq: 700, dur: 0.16, vol: 0.3, delay: 0.03 });
        break;
      case "fuelAdded":
        this.thunk(150, 0.2);
        this.noiseHit({ type: "highpass", freq: 3000, dur: 0.6, vol: 0.06 });
        break;
      case "fireOut":
        this.noiseHit({ type: "highpass", freq: 1500, sweepTo: 4000, dur: 0.8, vol: 0.1 });
        break;
      case "cooked":
        this.tone(1320, 1320, 0.15, "sine", 0.08);
        this.tone(1760, 1760, 0.25, "sine", 0.06, 0.12);
        break;
      case "animalHit":
        if (this.throttle("animalHit", 0.08)) this.noiseHit({ type: "lowpass", freq: 600, dur: 0.07, vol: 0.14 });
        break;
      case "animalAttack":
        this.snarl(0.45);
        this.thunk(80, 0.3);
        break;
      case "animalDied":
        this.tone(e.kind === "bear" ? 160 : 520, e.kind === "bear" ? 70 : 260, 0.4, "sawtooth", 0.08, 0, 1200);
        break;
      case "barricadeRepaired":
        this.thunk(220, 0.25);
        this.thunk(180, 0.22, 0.1);
        break;
      case "noAmmo":
        if (e.heroId === f.localHero && this.throttle("noAmmo", 0.6)) this.click(1800, 0.15);
        break;
      case "weatherChanged":
        this.noiseHit({ type: "bandpass", freq: 500, sweepTo: 1200, dur: 2.2, vol: 0.12 });
        break;
      case "dryFire":
        if (mine(e.heroId) && this.throttle("dry", 0.3)) this.click(2600, 0.12);
        break;
      case "reloadStart":
        if (mine(e.heroId)) this.reload(e.time);
        break;
      case "zombieHit":
        if (this.throttle("hit", 0.05)) this.noiseHit({ type: "lowpass", freq: 600, dur: 0.07, vol: 0.14 });
        break;
      case "zombieDied":
        if (e.burned) this.noiseHit({ type: "highpass", freq: 1500, dur: 0.5, vol: 0.08 });
        else if (this.throttle("die", 0.12)) {
          const big = ["boss", "brute", "broodmother", "yeti", "witch", "colossus"].includes(e.zombieType);
          if (!this.voice("death", big ? 0.9 : 0.55, { pitch: big ? 0.7 : e.zombieType === "runner" ? 1.2 : 1 })) {
            this.groan(e.zombieType === "boss" ? 0.35 : 0.13, e.zombieType === "boss" ? 0.5 : 1, false);
          }
        }
        break;
      case "zombieAttack":
        if (this.throttle("snarl", 0.12)) this.zombieAttack(e.zombieType, !!e.wall);
        // Brută în zid: o tobă mare rară și vântul se „strânge” o clipă.
        if (e.wall && (e.zombieType === "brute" || e.zombieType === "boss")) {
          this.music?.accent();
          this.hushWind(1.6);
          this.thunk(70, 0.5);
        }
        break;
      case "heroHit":
        if (mine(e.id) && this.throttle("hurt", 0.25)) {
          // Eroul geme de durere („ugh!”) + lovitura surdă.
          if (this.throttle("hurtVoice", 0.6)) this.voice("hurt", 0.8);
          this.thunk(120, 0.35);
          this.tone(220, 140, 0.25, "triangle", 0.12, 0.02, 700);
        }
        break;
      case "spit":
        if (this.throttle("spit", 0.2)) {
          this.noiseHit({ type: "bandpass", freq: 900, sweepTo: 400, dur: 0.25, vol: 0.18 });
          this.tone(140, 80, 0.2, "sine", 0.12);
        }
        break;
      case "projectileHit":
        this.noiseHit({ type: "lowpass", freq: 1100, dur: 0.18, vol: 0.2 });
        break;
      case "coinPicked":
        if (e.playerId === f.localPlayer && this.throttle("coin", 0.04)) {
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
        this.crumble(0.7);
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
      case "nightStarted":
        // Corn de vânătoare jos, ca un avertisment.
        this.tone(98, 96, 1.6, "sawtooth", 0.09, 0, 500);
        this.tone(147, 145, 1.6, "sawtooth", 0.07, 0.05, 500);
        this.groan(0.12, 0.8, true);
        break;
      case "dawn":
        // Zorii: zombii iau foc (sfârâit) + un acord luminos.
        this.noiseHit({ type: "highpass", freq: 3000, dur: 2.5, vol: 0.12 });
        this.chord([392, 494, 587, 784], 1.4, 0.05);
        break;
      case "levelUp":
        this.chord([523, 784, 1047], 0.6, 0.07);
        break;
      case "heroDied":
        if (mine(e.id)) this.tone(400, 100, 0.7, "sawtooth", 0.15, 0, 900);
        break;
      case "toolHit":
        if (e.tool === "chainsaw") {
          // Drujba: motorul urlă și lanțul mușcă (în lemn: scrâșnet; în zombi: ceva mai umed).
          if (this.throttle(`saw${e.heroId}`, 0.2)) {
            this.tone(95 + Math.random() * 10, 110, 0.24, "sawtooth", 0.09, 0, 1400);
            this.tone(190, 230, 0.24, "square", 0.025, 0, 2200);
          }
          if (e.target === "tree") this.noiseHit({ type: "bandpass", freq: 2400, dur: 0.2, vol: 0.14 });
          else if (e.target === "zombie") this.noiseHit({ type: "lowpass", freq: 700, dur: 0.15, vol: 0.3 });
          break;
        }
        if (e.target === "tree") {
          // Topor în lemn înghețat: „toc” sec + scârțâitul trunchiului.
          this.thunk(220 + Math.random() * 40, 0.45);
          this.noiseHit({ type: "bandpass", freq: 1800, dur: 0.05, vol: 0.3 });
          if (Math.random() < 0.3) this.tone(140, 110, 0.4, "triangle", 0.05, 0.05, 600);
        } else if (e.target === "ore") {
          // Târnăcop în piatră: clinchet metalic + pietriș.
          this.tone(2400 + Math.random() * 300, 2200, 0.18, "triangle", 0.12);
          this.noiseHit({ type: "highpass", freq: 3000, dur: 0.06, vol: 0.35 });
          this.noiseHit({ type: "bandpass", freq: 800, dur: 0.15, vol: 0.15, delay: 0.04 });
        } else {
          this.noiseHit({ type: "lowpass", freq: 400, dur: 0.1, vol: 0.4 });
        }
        break;
      case "noPetrol":
        if (mine(e.heroId)) {
          // Demarorul trage în gol: „trrr-pfff”.
          this.noiseHit({ type: "bandpass", freq: 300, sweepTo: 900, dur: 0.35, vol: 0.2 });
          this.tone(120, 60, 0.3, "sawtooth", 0.05, 0.1, 800);
        }
        break;
      case "levelUp":
        if (mine(e.heroId)) [523, 659, 784, 1047].forEach((fr, i) => this.bell(fr, 0.16, i * 0.08));
        break;
      case "skillLearned":
        if (mine(e.heroId)) {
          this.bell(e.passive ? 1319 : 988, 0.2);
          if (e.passive) [1568, 2093].forEach((fr, i) => this.bell(fr, 0.15, 0.1 + i * 0.1));
        }
        break;
      case "unlocked":
        if (e.playerId === f.localPlayer) [392, 523, 659, 784].forEach((fr, i) => this.bell(fr, 0.2, i * 0.11));
        break;
      case "armorCrafted":
        if (e.playerId === f.localPlayer) {
          if (e.material === "metal") [0, 0.12].forEach((d) => this.tone(1800, 1700, 0.25, "triangle", 0.12, d));
          else this.noiseHit({ type: "bandpass", freq: 900, dur: 0.25, vol: 0.2 });
          this.thunk(160, 0.3, 0.05);
        }
        break;
      case "scream":
        // Urletul: un țipăt lung, ascuțit, cu vibrato (vocea țipătului, mai sus).
        if (!this.voice("shriek", 0.9, { pitch: 1.35 })) this.zombieVoice({ pitch: 2.2, len: 1.1, vol: 0.4, open: 1.3, gurgle: false });
        this.tone(1400, 2100, 0.9, "sawtooth", 0.04, 0, 3000);
        break;
      case "bloaterBurst":
        // Plesnește: o bufnitură umedă, gaz care șuieră.
        this.noiseHit({ type: "lowpass", freq: 900, sweepTo: 120, dur: 0.5, vol: 0.7, dist: true });
        this.tone(80, 35, 0.4, "sine", 0.6);
        this.noiseHit({ type: "highpass", freq: 3000, dur: 1.0, vol: 0.08, delay: 0.1 });
        break;
      case "burrowUp":
        this.noiseHit({ type: "lowpass", freq: 600, sweepTo: 2000, dur: 0.35, vol: 0.4 });
        this.voice("attack", 0.7, { pitch: 0.9 });
        break;
      case "shamanHeal":
        // Clopoței reci și un murmur jos.
        [880, 1109, 1319].forEach((fr, i) => this.bell(fr, 0.06, i * 0.07));
        this.tone(110, 98, 0.8, "triangle", 0.05, 0, 500);
        break;
      case "broodSpawn":
        this.noiseHit({ type: "bandpass", freq: 1200, dur: 0.3, vol: 0.2 });
        this.voice("gurgle", 0.5, { pitch: 1.4 });
        break;
      case "yetiWindup":
        // Răgetul yeti-ului: vocea brutei, mai jos și mai lungă.
        if (!this.voice("bruteMoan", 1.0, { pitch: 0.75 })) this.groan(0.5, 0.45, true);
        break;
      case "yetiCharge":
        this.noiseHit({ type: "lowpass", freq: 300, dur: 1.0, vol: 0.4 });
        this.thunk(60, 0.6);
        break;
      case "witchBlink":
        this.tone(2400, 600, 0.35, "sine", 0.1);
        this.noiseHit({ type: "highpass", freq: 4000, sweepTo: 1500, dur: 0.4, vol: 0.12 });
        break;
      case "towersFrozen":
        // Trosnetul gheții care acoperă turnurile.
        for (let i = 0; i < 4; i++) this.noiseHit({ type: "highpass", freq: 3500, dur: 0.05, vol: 0.25, delay: i * 0.08 });
        this.tone(1760, 2637, 0.6, "sine", 0.05);
        break;
      case "stomp":
        // Pasul colosului: bubuitură uriașă, pietre care cad.
        this.tone(55, 25, 0.9, "sine", 0.9);
        this.noiseHit({ type: "lowpass", freq: 400, sweepTo: 60, dur: 1.0, vol: 0.7, dist: true });
        this.noiseHit({ type: "bandpass", freq: 900, dur: 0.6, vol: 0.12, delay: 0.15 });
        this.music?.accent();
        break;
      case "throw":
        if (e.kind === "boulder") this.noiseHit({ type: "lowpass", freq: 500, sweepTo: 200, dur: 0.6, vol: 0.25 });
        else this.tone(1800, 900, 0.25, "sine", 0.06);
        break;
      case "bossEnraged":
        if (!this.voice("bruteMoan", 1.0, { pitch: 0.6 })) this.groan(0.6, 0.4, true);
        this.music?.accent();
        break;
      case "refined":
        this.noiseHit({ type: "highpass", freq: 2500, dur: 0.4, vol: 0.1 });
        this.bell(660, 0.08);
        break;
      case "treeFelled":
        // Trosnet lung, apoi bradul se prăbușește în zăpadă.
        this.tone(160, 70, 1.0, "sawtooth", 0.07, 0, 500);
        for (let i = 0; i < 5; i++) this.noiseHit({ type: "highpass", freq: 2000, dur: 0.03, vol: 0.25, delay: 0.1 + i * 0.13 + Math.random() * 0.05 });
        this.noiseHit({ type: "lowpass", freq: 900, sweepTo: 150, dur: 1.0, vol: 0.6, delay: 1.1 });
        this.tone(60, 30, 0.6, "sine", 0.6, 1.1);
        break;
      case "oreMined":
        this.noiseHit({ type: "lowpass", freq: 1500, sweepTo: 200, dur: 0.4, vol: 0.5, dist: true });
        if (e.playerId === f.localPlayer) {
          this.bell(e.kind === "gold" ? 1568 : 1319, 0.2, 0.15);
          this.coinRain(e.kind === "gold" ? 14 : 8, 0.2, 0.6);
        }
        break;
      case "fishCast":
        // Aruncarea: șuierat de fir, apoi „plop” în copcă.
        this.noiseHit({ type: "bandpass", freq: 2500, sweepTo: 900, dur: 0.35, vol: 0.12 });
        this.tone(500, 180, 0.12, "sine", 0.25, 0.4);
        break;
      case "fishBite":
        // A mușcat: bulbuc + un clopoțel (să-l auzi și dacă nu te uiți).
        this.tone(320, 900, 0.1, "sine", 0.3);
        this.bell(1760, 0.22, 0.05);
        break;
      case "fishCaught":
        this.noiseHit({ type: "lowpass", freq: 1600, dur: 0.35, vol: 0.4 });
        this.tone(400, 160, 0.15, "sine", 0.3, 0.05);
        if (e.playerId === f.localPlayer) [784, 988, 1319].forEach((fr, i) => this.bell(fr, 0.16, 0.2 + i * 0.09));
        break;
      case "fishReel":
        // Mulineta: un „zrrr” scurt și pește care se zbate.
        this.noiseHit({ type: "bandpass", freq: 2600, sweepTo: 1800, dur: 0.18, vol: 0.18 });
        this.noiseHit({ type: "lowpass", freq: 900, dur: 0.12, vol: 0.25, delay: 0.05 });
        break;
      case "fishLost":
        this.tone(300, 140, 0.18, "sine", 0.15);
        break;
      case "sold":
        if (e.playerId === f.localPlayer) {
          // Ka-ching!
          this.noiseHit({ type: "highpass", freq: 3000, dur: 0.05, vol: 0.4 });
          this.bell(2637, 0.3, 0.05);
          this.bell(3520, 0.25, 0.13);
          this.coinRain(Math.min(30, 6 + e.fish * 3), 0.2, 0.8);
        }
        break;
      case "heroRespawned":
        this.chord([392, 523, 659], 0.8, 0.06);
        break;
      case "gameOver":
        this.endStinger(false);
        break;
      case "victory":
        this.endStinger(true);
        break;
    }
  }

  // ---------- Sunete apelate direct (de HUD / randare) ----------

  /** Vântul scade brusc și revine încet (după `time` secunde). */
  private hushWind(time: number): void {
    if (!this.wind || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.windHush = time;
    this.gustTimer = time;
    this.wind.gain.gain.setTargetAtTime(0.01, now, 0.08);
    this.wind.low.gain.setTargetAtTime(0.02, now, 0.08);
  }

  /**
   * Finalul rundei. Victorie: capacul minei se deschide (scârțâit de fier + „clanc”), apoi liniște.
   * Game over: plasma se stinge (un ton care coboară și tremură), apoi un singur trosnet.
   */
  private endStinger(victory: boolean): void {
    this.ended = true;
    this.music?.end();
    if (victory) {
      this.noiseHit({ type: "bandpass", freq: 700, sweepTo: 1400, dur: 1.1, vol: 0.16, delay: 0.4 });
      this.tone(180, 260, 1.1, "sawtooth", 0.06, 0.4, 900);
      this.thunk(110, 0.55, 1.5);
      this.noiseHit({ type: "bandpass", freq: 900, dur: 0.12, vol: 0.4, dist: true, delay: 1.5 });
      this.noiseHit({ type: "lowpass", freq: 500, dur: 2, vol: 0.12, reverbOnly: true, delay: 1.5 });
    } else {
      const ctx = this.ctx!;
      const t = ctx.currentTime;
      // Plasma: un acord rece care coboară și pâlpâie până se stinge.
      for (const f of [880, 1320, 1760]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.35, t + 1.5);
        const trem = ctx.createOscillator();
        trem.frequency.setValueAtTime(14, t);
        trem.frequency.linearRampToValueAtTime(4, t + 1.5);
        const tg = ctx.createGain();
        tg.gain.value = 0.04;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);
        trem.connect(tg).connect(g.gain);
        o.connect(g).connect(this.sfxBus);
        g.connect(this.reverbSend);
        o.start(t);
        trem.start(t);
        o.stop(t + 1.6);
        trem.stop(t + 1.6);
      }
      // Un singur trosnet (capacul / piatra crapă).
      this.noiseHit({ type: "highpass", freq: 1200, dur: 0.06, vol: 0.6, delay: 1.6 });
      this.noiseHit({ type: "lowpass", freq: 1400, sweepTo: 120, dur: 0.5, vol: 0.6, dist: true, delay: 1.6 });
      this.tone(80, 35, 0.6, "sine", 0.6, 1.6);
      this.noiseHit({ type: "lowpass", freq: 600, dur: 2.2, vol: 0.14, reverbOnly: true, delay: 1.62 });
    }
  }

  /** Crusta de gheață se formează: un trosnet sec de gheață (fără „atac”). */
  private iceCrack(n: number): void {
    for (let i = 0; i < n; i++) {
      const d = i * 0.06 + Math.random() * 0.03;
      this.noiseHit({ type: "highpass", freq: 2500 + Math.random() * 1500, dur: 0.04, vol: 0.28, delay: d });
      this.noiseHit({ type: "bandpass", freq: 1200, dur: 0.09, vol: 0.16, delay: d + 0.01 });
    }
  }

  /** Pas în zăpadă: „scârț” scurt, din mai multe pocnituri mici. */
  footstep(): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const base = 1300 + Math.random() * 700;
    for (let i = 0; i < 3; i++) {
      this.noiseHit({ type: "bandpass", freq: base + i * 300, dur: 0.035, vol: 0.05, delay: i * 0.018 });
    }
    this.noiseHit({ type: "lowpass", freq: 300, dur: 0.06, vol: 0.06 });
  }

  /** Un „tic” al păcănelei: clic mecanic + bip electronic (ca la aparatele din cazino). */
  spinTick(): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    this.spinIndex = (this.spinIndex + 1) % 4;
    this.noiseHit({ type: "highpass", freq: 3000, dur: 0.018, vol: 0.22 });
    this.tone([880, 1175, 988, 1319][this.spinIndex], 0, 0.05, "square", 0.07);
  }

  /** Oprirea unei role: „CLANC” greu + un clopoțel. */
  reelStop(): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    this.thunk(140, 0.55);
    this.noiseHit({ type: "bandpass", freq: 700, dur: 0.12, vol: 0.35, dist: true });
    this.bell(1319, 0.14);
  }

  /**
   * Rezultatul: trombon trist pentru „nimic”, clopoțel pentru comun, clopote + monede pentru rar,
   * iar la JACKPOT (epic / legendar): sirenă, clopote care sună întruna, fanfară și ploaie de monede.
   */
  spinResult(rarity: ShopRarity): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    if (rarity === "nothing") {
      // „Wah-wah-wah-waaah”.
      [392, 370, 349].forEach((f, i) => this.tone(f, f * 0.97, 0.32, "sawtooth", 0.13, i * 0.34, 900));
      this.tone(330, 300, 1.0, "sawtooth", 0.14, 1.02, 900);
      return;
    }
    if (rarity === "common") {
      this.bell(1047, 0.25);
      this.bell(1568, 0.22, 0.14);
      this.coinRain(6, 0.25, 0.6);
      return;
    }
    if (rarity === "rare") {
      [784, 988, 1175, 1568].forEach((f, i) => this.bell(f, 0.22, i * 0.09));
      this.coinRain(16, 0.3, 1.2);
      return;
    }
    // JACKPOT: muzica se dă la o parte, iar aparatul „explodează”: ka-ching, sirenă, clopote,
    // tobe, fanfară care urcă și o ploaie lungă de monede.
    const legendary = rarity === "legendary";
    const len = legendary ? 3.6 : 2.6;
    this.duckMusic(len + 0.8);
    // Ka-ching (casa de marcat).
    this.noiseHit({ type: "highpass", freq: 3000, dur: 0.05, vol: 0.5 });
    this.bell(2637, 0.35, 0.06);
    this.bell(3520, 0.3, 0.14);
    this.explosion(0.6);
    this.siren(legendary ? 2.6 : 1.8);
    // Tobe de fanfară: BUM-BUM-BUM-BUUUM.
    [0.2, 0.42, 0.64, 0.9].forEach((d, i) => this.tone(90, 40, 0.3 + (i === 3 ? 0.4 : 0), "sine", 0.7, d));
    for (let i = 0; i < (legendary ? 30 : 18); i++) this.bell(i % 2 ? 1568 : 2093, 0.3, 0.15 + i * 0.08);
    const fan = legendary ? [523, 659, 784, 1047, 1319, 1568, 2093] : [523, 659, 784, 1047, 1319];
    fan.forEach((f, i) => {
      this.tone(f, f, 0.6, "sawtooth", 0.2, 0.3 + i * 0.1, 3500);
      this.tone(f * 2, f * 2, 0.7, "sine", 0.12, 0.3 + i * 0.1);
    });
    // Acordul final, ținut, cu vibrato de cazino.
    const end = 0.3 + fan.length * 0.1;
    [523, 659, 784, 1047].forEach((f) => {
      this.tone(f, f, 2.2, "triangle", 0.2, end);
      this.tone(f * 1.003, f * 1.003, 2.2, "sawtooth", 0.06, end, 2500);
    });
    this.coinRain(legendary ? 90 : 55, 0.5, len);
  }

  /** Muzica scade cât sună jackpot-ul, apoi revine. */
  private duckMusic(time: number): void {
    if (!this.ctx || !this.musicBus || !this.musicOn) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(0.12, t, 0.05);
    this.musicBus.gain.setTargetAtTime(0.55, t + time, 0.6);
  }

  /** Clopoțel metalic (ton + armonicele „strâmbe” ale unui clopot). */
  private bell(freq: number, vol: number, delay = 0): void {
    this.tone(freq, freq, 1.1, "sine", vol, delay);
    this.tone(freq * 2.76, freq * 2.76, 0.6, "sine", vol * 0.45, delay);
    this.tone(freq * 5.4, freq * 5.4, 0.3, "sine", vol * 0.25, delay);
  }

  /** Monede care cad (clinchete rapide, la întâmplare). */
  private coinRain(count: number, start: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const t = start + Math.random() * spread;
      const f = 2000 + Math.random() * 1800;
      this.tone(f, f * 0.98, 0.09, "square", 0.08, t);
      this.tone(f * 1.5, f * 1.5, 0.06, "sine", 0.06, t + 0.02);
    }
  }

  /** Sirena de jackpot: un ton care urcă și coboară rapid. */
  private siren(dur: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 900;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const depth = ctx.createGain();
    depth.gain.value = 300;
    lfo.connect(depth).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
    g.gain.setValueAtTime(0.2, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g).connect(this.sfxBus);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur);
    lfo.stop(t + dur);
  }

  /** Sclipire magică (cufărul apare). */
  private shimmer(dur: number): void {
    for (let i = 0; i < 12; i++) {
      const f = 1500 + i * 180 + Math.random() * 80;
      this.tone(f, f, 0.4, "sine", 0.06, (i / 12) * dur * 0.6);
    }
  }

  /** Reîncărcare: scoate încărcătorul (clic), îl bagă (clac), trage de închizător. */
  private reload(time: number): void {
    this.click(1200, 0.12);
    this.noiseHit({ type: "bandpass", freq: 2200, dur: 0.06, vol: 0.1, delay: 0.08 });
    this.click(900, 0.15, time * 0.55);
    this.noiseHit({ type: "bandpass", freq: 1600, sweepTo: 3000, dur: 0.12, vol: 0.12, delay: time * 0.85 });
    this.click(2000, 0.14, time - 0.05);
  }

  private click(freq: number, vol: number, delay = 0): void {
    this.noiseHit({ type: "highpass", freq, dur: 0.02, vol, delay });
    this.tone(freq * 1.5, freq, 0.03, "square", vol * 0.3, delay);
  }

  /**
   * Vocea unui zombi, sintetizată ca o voce adevărată:
   *  - sursa = „corzile vocale”: un ton aspru care tremură neregulat (jitter), plus respirație răgușită;
   *  - trece prin 3 formanți (rezonanțele gurii) care alunecă de la „aaah” la „uh” — de aici sună a gât;
   *  - volumul pâlpâie neregulat (horcăit), cu puțină saturație.
   * `pitch` < 1 = gros (brută, boss), > 1 = ascuțit (fugar, zburător). `len` = durata.
   */
  private zombieVoice(o: { pitch: number; len: number; vol: number; open?: number; delay?: number; distant?: boolean; gurgle?: boolean }): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.delay ?? 0);
    const dur = o.len * (0.85 + Math.random() * 0.3);
    const p = o.pitch * (0.92 + Math.random() * 0.16);
    const open = o.open ?? 1;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(o.vol, t + 0.05);
    out.gain.setValueAtTime(o.vol * 0.9, t + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // Horcăit: volumul tremură neregulat (două oscilații care nu se potrivesc).
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    for (const [f, d] of [[17 + Math.random() * 6, 0.25], [o.gurgle ? 31 : 6.3, o.gurgle ? 0.35 : 0.12]] as const) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = d;
      lfo.connect(g).connect(trem.gain);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    // Sursa: ton aspru cu jitter de frecvență + respirație.
    const src = ctx.createGain();
    const f0 = 95 * p;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f0 * 1.25, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
    for (const [f, d] of [[7.3, 0.06], [13.7, 0.04], [3.1, 0.05]] as const) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f * (0.8 + Math.random() * 0.4);
      const g = ctx.createGain();
      g.gain.value = f0 * d;
      lfo.connect(g).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    osc.connect(src);
    const breath = ctx.createBufferSource();
    breath.buffer = this.noise;
    const bg = ctx.createGain();
    bg.gain.value = 0.55;
    breath.connect(bg).connect(src);
    // Formanții: vocala „aaah” care se închide în „uh”.
    const formants: [number, number, number, number][] = [
      [700, 480, 8, 1],
      [1150, 850, 10, 0.55],
      [2600, 2300, 12, 0.22],
    ];
    for (const [fa, fb, q, g] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = q;
      bp.frequency.setValueAtTime(fa * p * open, t);
      bp.frequency.exponentialRampToValueAtTime(fb * p, t + dur);
      const fg = ctx.createGain();
      fg.gain.value = g * 2.2;
      src.connect(bp).connect(fg).connect(trem);
    }
    // Puțină saturație (gât răgușit), nu distorsiunea grea a armelor.
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 2.2);
    shaper.curve = curve;
    trem.connect(shaper).connect(out);
    if (o.distant) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      out.connect(lp).connect(this.reverbSend);
    } else {
      out.connect(this.sfxBus);
      out.connect(this.reverbSend);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
    breath.start(t, Math.random() * 1.5);
    breath.stop(t + dur + 0.05);
  }

  /**
   * Atacul unui zombi: un răget scurt (vocea), șuieratul ghearelor / bâtei prin aer
   * și lovitura surdă în carne sau lemn. Mai gros și mai lung la brută / boss.
   */
  private zombieAttack(type: string, wall: boolean): void {
    const big = type === "brute" || type === "boss" || type === "yeti" || type === "colossus" || type === "broodmother";
    const pitch = type === "boss" || type === "colossus" ? 0.55 : big ? 0.65 : type === "runner" || type === "screamer" ? 1.35 : type === "flyer" ? 1.8 : type === "spitter" || type === "witch" ? 1.1 : 1;
    const played = big
      ? this.voice("bruteAttack", 1.0, { pitch: type === "boss" ? 0.85 : 1 })
      : type === "runner" || type === "flyer"
        ? this.voice("shriek", 0.7, { pitch: type === "flyer" ? 1.2 : 1 })
        : type === "spitter"
          ? this.voice("gurgle", 0.75)
          : this.voice("attack", 0.8);
    if (!played) this.zombieVoice({ pitch, len: big ? 0.9 : type === "runner" ? 0.35 : 0.55, vol: big ? 0.5 : 0.38, open: 1.15, gurgle: type === "spitter" });
    // Șuieratul: zgomot care urcă rapid în frecvență (brațul / bâta trece prin aer).
    this.noiseHit({ type: "bandpass", freq: big ? 300 : 600, sweepTo: big ? 1200 : 2600, dur: big ? 0.22 : 0.13, vol: big ? 0.18 : 0.12, delay: 0.08 });
    // Impactul: lemn (zid) sau carne (erou / turn).
    const hit = big ? 0.3 : 0.2;
    if (wall) {
      this.thunk(big ? 85 : 140, big ? 0.55 : 0.35, hit);
      this.noiseHit({ type: "bandpass", freq: 1100, dur: 0.07, vol: 0.25, delay: hit });
    } else {
      this.noiseHit({ type: "lowpass", freq: 260, dur: 0.12, vol: big ? 0.6 : 0.4, delay: hit });
      this.noiseHit({ type: "bandpass", freq: 1500, dur: 0.05, vol: 0.18, delay: hit + 0.01 });
      this.tone(big ? 70 : 110, 45, 0.14, "sine", big ? 0.5 : 0.3, hit);
    }
  }

  /** Mârâitul unui animal (ursul): aceeași voce, foarte grosă. */
  private snarl(pitch: number): void {
    this.zombieVoice({ pitch: pitch * 0.9, len: 0.7, vol: 0.45, open: 1.2 });
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
    if (weapon === "hunting") this.noiseHit({ type: "highpass", freq: 5000, dur: 0.05, vol: 0.25 });
    if (weapon === "iceLance") [1568, 2349].forEach((f) => this.tone(f, f * 1.05, 0.25, "sine", 0.04));
    if (weapon === "boneBow") this.tone(260, 180, 0.12, "triangle", 0.15);
    // Pistolul: pocnitură seacă și ascuțită; pușca: bubuitură lungă cu ecou; pușca de asalt: scurt și dur.
    if (weapon === "pistol") this.noiseHit({ type: "bandpass", freq: 2600, dur: 0.04, vol: 0.25 });
    if (weapon === "rifle") {
      this.tone(110, 38, 0.3, "sine", 0.4);
      this.noiseHit({ type: "lowpass", freq: 700, dur: 0.6, vol: 0.1, reverbOnly: true });
    }
    if (weapon === "assaultRifle") this.noiseHit({ type: "highpass", freq: 2000, dur: 0.03, vol: 0.2 });
  }

  /** Sunetul fiecărui tip de turn (tare, ca să se audă peste luptă). `heavy` = abilitatea. */
  private towerShot(kind: TowerKind, heavy: boolean): void {
    const k = heavy ? 1.5 : 1;
    switch (kind) {
      case "crossbow":
        // Coarda arbaletei: „TWANG” + lemnul care lovește + șuierat.
        this.tone(190, 85, 0.18, "triangle", 0.35 * k);
        this.tone(95, 60, 0.12, "sine", 0.3 * k);
        this.noiseHit({ type: "bandpass", freq: 1000, dur: 0.05, vol: 0.3 * k });
        this.noiseHit({ type: "highpass", freq: 2500, sweepTo: 6000, dur: 0.18, vol: 0.08 * k, delay: 0.03 });
        break;
      case "rocket":
        // Lansare: un șuierat (fără bubuitură).
        this.noiseHit({ type: "bandpass", freq: 1200, sweepTo: 3500, dur: 0.6 * k, vol: 0.22 * k });
        this.noiseHit({ type: "highpass", freq: 4000, dur: 0.5 * k, vol: 0.06 * k });
        break;
      case "cannon":
        // BUM: pocnitură, corp distorsionat și bubuitură lungă cu ecou.
        this.noiseHit({ type: "highpass", freq: 2000, dur: 0.03, vol: 0.45 });
        this.noiseHit({ type: "lowpass", freq: 2500, sweepTo: 90, dur: 0.9, vol: 0.75, dist: true });
        this.tone(75, 28, 0.7, "sine", 0.8);
        this.noiseHit({ type: "lowpass", freq: 500, dur: 1.6, vol: 0.15, reverbOnly: true });
        break;
      case "tesla": {
        // Un țiuit subțire, doar cât fulgerul atinge ținta.
        const f = 1700 + Math.random() * 200;
        this.tone(f, f * 1.02, 0.09, "sine", 0.09);
        this.tone(f * 1.5, f * 1.5, 0.07, "sine", 0.03);
        break;
      }
      case "frost":
        // Cristal: clinchet înalt + șuierat rece.
        this.tone(2093, 2093, 0.35, "sine", 0.14);
        this.tone(3136, 3100, 0.25, "sine", 0.08, 0.02);
        this.noiseHit({ type: "highpass", freq: 5000, sweepTo: 2500, dur: 0.25, vol: 0.12 });
        break;
    }
  }

  /** Laserul Tesla: bâzâit gros, lung, cu vibrato. */
  private laser(): void {
    // Laserul: același țiuit, mai lung, pulsând cât trece prin linie.
    for (let i = 0; i < 4; i++) this.tone(1800, 1850, 0.08, "sine", 0.1, i * 0.09);
  }

  /** Impactul proiectilelor de turn. */
  private shellHit(kind: TowerKind, special: string): void {
    switch (kind) {
      case "rocket":
        // Racheta cade în zăpadă: un „puf” scurt, nu o explozie.
        if (this.throttle(special === "mini" ? "mini" : "rocketHit", 0.06)) {
          const k = special === "big" ? 1.4 : special === "mini" ? 0.5 : 1;
          this.noiseHit({ type: "lowpass", freq: 900, sweepTo: 200, dur: 0.3 * k, vol: 0.3 * k });
          this.tone(110, 50, 0.2, "sine", 0.25 * k);
        }
        break;
      case "cannon":
        // Tunul: o bubuitură înfundată (fără pocnitură ascuțită).
        this.noiseHit({ type: "lowpass", freq: 450, sweepTo: 70, dur: 0.9, vol: 0.7, dist: true });
        this.tone(65, 26, 0.8, "sine", 0.8);
        this.noiseHit({ type: "lowpass", freq: 300, dur: 1.4, vol: 0.14, reverbOnly: true });
        break;
      case "frost":
        break;
      case "crossbow":
        // Arbaleta: un „toc” scurt de lemn.
        if (this.throttle("arrowHit", 0.04)) {
          const k = special === "heavy" ? 1.5 : 1;
          this.noiseHit({ type: "bandpass", freq: 1400, dur: 0.035, vol: 0.38 * k });
          this.tone(420, 300, 0.05, "triangle", 0.22 * k);
        }
        break;
      default:
        break;
    }
  }

  /** Construcție dărâmată: trosnet, bubuitură și pietre/lemne care cad. */
  private crumble(size: number): void {
    this.noiseHit({ type: "lowpass", freq: 1500, sweepTo: 200, dur: 0.9 * size, vol: 0.5 * size, dist: true });
    this.tone(60, 30, 0.6, "sine", 0.5 * size);
    for (let i = 0; i < 7; i++) this.thunk(110 + Math.random() * 120, 0.18 * size, 0.15 + i * 0.09 + Math.random() * 0.05);
    this.noiseHit({ type: "bandpass", freq: 600, dur: 1.4 * size, vol: 0.12, reverbOnly: true });
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

  /** Geamăt de zombi: vocea, mai lentă, cu gura închisă („uuuh”). Departe = înfundat, cu ecou. */
  private groan(vol: number, speed: number, distant: boolean): void {
    // Geamăt înregistrat (uneori al unei brute, mai gros); dacă nu s-au încărcat, cel sintetizat.
    const group: VoiceGroup = Math.random() < 0.15 ? "bruteMoan" : "moan";
    if (this.voice(group, Math.min(1, vol * 3.2), { distant, pitch: 0.95 + (speed - 1) * 0.2 })) return;
    this.zombieVoice({ pitch: 0.8 + Math.random() * 0.35, len: 0.9 / speed + Math.random() * 0.4, vol, open: 0.75, distant });
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
