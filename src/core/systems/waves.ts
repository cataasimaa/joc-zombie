// Ziua și noaptea. Ziua (60 s) construiești; noaptea atacă zombii.
// Fiecare noapte e mai lungă decât precedenta. În zori, zombii rămași iau foc și mor încet.

import { CONFIG, type Difficulty, type GameMode, isBoss, type Weather, type ZombieType } from "../config";
import { nextRandom } from "../math";
import type { GameEvent, GameState } from "../types";
import { spawnDayOres } from "./gather";
import { gunStats } from "./heroes";
import { spawnZombie } from "./zombies";

/**
 * Compoziția unei nopți: ce zombi apar, în ordine.
 * Crește cu numărul nopții și cu numărul de jucători.
 */
export function waveComposition(wave: number, playerCount: number, difficulty: Difficulty = "easy", mode: GameMode = "defend"): ZombieType[] {
  const w = CONFIG.waves;
  const total = Math.round(
    (w.baseCount + (wave - 1) * w.countPerWave) * (1 + (playerCount - 1) * w.extraPerPlayer) * CONFIG.difficulty[difficulty].zombieCount * CONFIG.modes[mode].zombieCount,
  );
  const share = (from: number, pct: number) => (wave >= from ? Math.max(1, Math.round(total * pct)) : 0);
  const runners = share(w.runnersFromWave, w.runnerShare);
  const spitters = share(w.spittersFromWave, w.spitterShare);
  const flyers = share(w.flyersFromWave, w.flyerShare);
  const brutes = share(w.brutesFromWave, w.bruteShare);
  const bloaters = share(w.bloatersFromWave, w.bloaterShare);
  const screamers = share(w.screamersFromWave, w.screamerShare);
  const burrowers = share(w.burrowersFromWave, w.burrowerShare);
  const shamans = share(w.shamansFromWave, w.shamanShare);
  const walkers = Math.max(0, total - runners - spitters - flyers - brutes - bloaters - screamers - burrowers - shamans);

  // Îi amestecăm uniform: alergătorii și brutele apar printre cei normali, nu toți la final.
  const list: ZombieType[] = Array(walkers).fill("walker");
  const insertEvenly = (type: ZombieType, n: number) => {
    for (let i = 0; i < n; i++) list.splice(Math.floor(((i + 1) * list.length) / (n + 1)), 0, type);
  };
  insertEvenly("runner", runners);
  insertEvenly("spitter", spitters);
  insertEvenly("flyer", flyers);
  insertEvenly("brute", brutes);
  insertEvenly("bloater", bloaters);
  insertEvenly("screamer", screamers);
  insertEvenly("burrower", burrowers);
  insertEvenly("shaman", shamans);
  // Boșii vin la final (fiecare noapte de boss are boss-ul ei).
  for (const b of w.bosses[wave] ?? []) list.push(b);
  return list;
}

/** Câți zombi vin deodată, din același loc. Hoardele cresc de la o noapte la alta. */
export function hordeSize(wave: number): number {
  return 3 + Math.floor(wave / 2);
}

export function nightDuration(wave: number): number {
  return CONFIG.waves.nightBase + (wave - 1) * CONFIG.waves.nightPerWave;
}

export function woodIncomeFor(wave: number, difficulty: Difficulty = "easy"): number {
  return Math.round((CONFIG.economy.woodIncomeBase + wave * CONFIG.economy.woodIncomePerWave) * CONFIG.difficulty[difficulty].wood);
}

export function startNight(state: GameState, events: GameEvent[]): void {
  if (state.phase !== "day" || state.stage !== "campaign") return;
  state.wave++;
  state.phase = "night";
  state.phaseDuration = state.phaseTimer = nightDuration(state.wave);
  state.spawnQueue = waveComposition(state.wave, Object.keys(state.players).length, state.difficulty, state.mode);
  // Zombii apar în hoarde, uniform în prima parte a nopții.
  const hordes = Math.ceil(state.spawnQueue.length / hordeSize(state.wave));
  state.spawnInterval = (state.phaseDuration * CONFIG.waves.spawnWindow) / Math.max(1, hordes);
  state.spawnTimer = 0;
  changeWeather(state, events);
  const boss = state.spawnQueue.find((t) => isBoss(t)) ?? null;
  events.push({ type: "nightStarted", wave: state.wave, boss: boss !== null, bossType: boss });
}

/** Zorii: lemn, gloanțe, iar zombii rămași iau foc. (Și pauza dintre boși din asalt.) */
function dawnSupply(state: GameState, events: GameEvent[]): void {
  state.wavesCompleted++;
  const wood = woodIncomeFor(state.wave, state.difficulty);
  for (const p of Object.values(state.players)) p.wood += wood;
  // Aprovizionarea din zori: câteva încărcătoare pentru fiecare erou.
  for (const h of state.heroes) {
    const gun = gunStats(state, h);
    h.reserve = Math.min(gun.magazine * CONFIG.ammo.maxMagazines, h.reserve + Math.round(gun.magazine * CONFIG.ammo.dawnMagazines));
  }
  // Zombii rămași iau foc în lumina zilei și mor încet.
  state.spawnQueue = [];
  for (const z of state.zombies) {
    z.burning = true;
    z.burrowed = false;
    z.charge = null;
  }
  events.push({ type: "dawn", wave: state.wave, wood });
}

function startDay(state: GameState, events: GameEvent[]): void {
  dawnSupply(state, events);
  state.phase = "day";
  state.phaseDuration = state.phaseTimer = CONFIG.waves.day;
  changeWeather(state, events);
  // Ziua apar zăcăminte noi de argint și aur.
  spawnDayOres(state, events);
}

/** Vremea se schimbă la fiecare zi și noapte (alegere ponderată, cu RNG-ul jocului). */
function changeWeather(state: GameState, events: GameEvent[]): void {
  const entries = Object.entries(CONFIG.weather) as [Weather, (typeof CONFIG.weather)[Weather]][];
  const total = entries.reduce((a, [, w]) => a + w.weight, 0);
  let roll = nextRandom(state) * total;
  let pick: Weather = "clear";
  for (const [id, w] of entries) {
    roll -= w.weight;
    if (roll <= 0) {
      pick = id;
      break;
    }
  }
  if (pick === state.weather) return;
  state.weather = pick;
  events.push({ type: "weatherChanged", weather: pick });
}

export function updateWaves(state: GameState, dt: number, events: GameEvent[]): void {
  state.phaseTimer -= dt;
  if (state.stage === "bossRush") return updateBossRush(state, dt, events);
  if (state.stage === "endless") return updateEndless(state, dt, events);

  // Campania: ceasul mare de 30 de minute. Când ajunge la zero, începe asaltul boșilor.
  state.runTimer = Math.max(0, state.runTimer - dt);
  if (state.runTimer <= 0) return startBossRush(state, events);

  if (state.phase === "day") {
    if (state.phaseTimer <= 0) startNight(state, events);
    return;
  }
  if (state.phase !== "night") return;
  spawnFromQueue(state, dt);

  // Zorii vin când se termină noaptea, sau mai devreme dacă ai omorât tot ce a venit.
  const allDead = state.spawnQueue.length === 0 && state.zombies.every((z) => z.burning);
  if (state.phaseTimer <= 0 || allDead) startDay(state, events);
}

/** Zombii din coadă apar în hoarde: primul alege locul, ceilalți apar în jurul lui. */
function spawnFromQueue(state: GameState, dt: number): void {
  if (state.spawnQueue.length === 0) return;
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;
  state.spawnTimer = state.spawnInterval;
  const size = Math.min(hordeSize(state.wave), state.spawnQueue.length);
  const leader = spawnZombie(state, state.spawnQueue.shift()!);
  for (let i = 1; i < size; i++) {
    const z = spawnZombie(state, state.spawnQueue.shift()!, leader.pos);
    z.pos.x += (nextRandom(state) - 0.5) * 4;
    z.pos.z += (nextRandom(state) - 0.5) * 4;
  }
}

// ---------- Asaltul boșilor (după cele 30 de minute, fără limită de timp) ----------

const R = CONFIG.run;

function startBossRush(state: GameState, events: GameEvent[]): void {
  state.stage = "bossRush";
  state.phase = "night";
  state.phaseTimer = state.phaseDuration = 0;
  state.spawnQueue = [];
  state.rushIndex = 0;
  state.rushTimer = R.rushBossDelay;
  state.rushBossId = null;
  // Noaptea nu se mai termină: zombii de acum rămân (nu mai ard).
  for (const z of state.zombies) z.burning = false;
  events.push({ type: "bossRushStarted" });
}

/** Zombii obișnuiți care tot vin cât trăiește boss-ul (escorta lui). */
function rushMinion(state: GameState): ZombieType {
  const pool: ZombieType[] = ["walker", "walker", "runner", "spitter", "brute", "bloater", "screamer"];
  return pool[Math.floor(nextRandom(state) * pool.length)];
}

function updateBossRush(state: GameState, dt: number, events: GameEvent[]): void {
  const total = R.rushBosses.length;
  // Pauza dintre boși (o zi scurtă): repari, iei gloanțe; apoi vine următorul.
  if (state.phase === "day") {
    if (state.phaseTimer > 0) return;
    state.phase = "night";
    state.phaseTimer = state.phaseDuration = 0;
    state.rushTimer = R.rushBossDelay;
    changeWeather(state, events);
    return;
  }
  spawnFromQueue(state, dt);
  if (state.rushBossId === null) {
    state.rushTimer -= dt;
    if (state.rushTimer > 0) return;
    const type = R.rushBosses[state.rushIndex];
    const boss = spawnZombie(state, type);
    state.rushBossId = boss.id;
    state.spawnQueue = Array.from({ length: R.rushEscort }, () => rushMinion(state));
    state.spawnInterval = 1.5;
    state.spawnTimer = 1;
    state.rushTimer = R.rushTrickleEvery;
    events.push({ type: "bossIncoming", bossType: type, index: state.rushIndex + 1, total });
    return;
  }
  const boss = state.zombies.find((z) => z.id === state.rushBossId);
  if (boss) {
    // Cât trăiește boss-ul, mai vin câțiva zombi la fiecare câteva secunde.
    state.rushTimer -= dt;
    if (state.rushTimer <= 0) {
      state.rushTimer = R.rushTrickleEvery;
      for (let i = 0; i < R.rushTrickle; i++) state.spawnQueue.push(rushMinion(state));
    }
    return;
  }
  // Boss-ul a murit: următorul (după o pauză), sau valul fără sfârșit după ultimul.
  const type = R.rushBosses[state.rushIndex];
  state.rushIndex++;
  state.rushBossId = null;
  events.push({ type: "bossDefeated", bossType: type, index: state.rushIndex, total });
  if (state.rushIndex >= total) return startEndless(state, events);
  dawnSupply(state, events);
  state.phase = "day";
  state.phaseTimer = state.phaseDuration = R.rushRespite;
}

// ---------- Valul fără sfârșit: contează cât reziști ----------

function startEndless(state: GameState, events: GameEvent[]): void {
  state.stage = "endless";
  state.phase = "night";
  state.phaseTimer = state.phaseDuration = 0;
  state.spawnQueue = [];
  state.endlessTime = 0;
  state.endlessWave = 0;
  state.endlessTimer = 3;
  events.push({ type: "endlessStarted" });
}

function updateEndless(state: GameState, dt: number, events: GameEvent[]): void {
  state.endlessTime += dt;
  spawnFromQueue(state, dt);
  state.endlessTimer -= dt;
  if (state.endlessTimer > 0) return;
  state.endlessTimer = R.endlessEvery;
  state.endlessWave++;
  // Fiecare val nou: mai mulți zombi și mai puternici (HP-ul crește cu numărul nopții).
  state.wave++;
  const players = Object.keys(state.players).length;
  const count = Math.round((R.endlessBase + state.endlessWave * R.endlessPerWave) * (1 + (players - 1) * CONFIG.waves.extraPerPlayer));
  const mix = waveComposition(state.wave, players, state.difficulty, state.mode).filter((t) => !isBoss(t));
  const queue: ZombieType[] = [];
  for (let i = 0; i < count; i++) queue.push(mix[Math.floor(nextRandom(state) * mix.length)] ?? "walker");
  let boss: ZombieType | null = null;
  if (state.endlessWave % R.endlessBossEvery === 0) {
    boss = R.rushBosses[Math.floor(nextRandom(state) * R.rushBosses.length)];
    queue.push(boss);
  }
  state.spawnQueue.push(...queue);
  state.spawnInterval = (R.endlessEvery * 0.7) / Math.max(1, Math.ceil(state.spawnQueue.length / hordeSize(state.wave)));
  state.spawnTimer = 0;
  events.push({ type: "endlessWave", wave: state.endlessWave, boss });
}
