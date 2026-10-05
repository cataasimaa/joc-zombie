// GameSimulation = „creierul” jocului. Nu știe nimic despre ecran, Babylon sau tastatură.
// Primește comenzi, avansează timpul cu step(dt) și produce stare + evenimente.
// În faza 3 (multiplayer) exact această clasă va rula pe serverul Colyseus.

import type { Command } from "./commands";
import { CONFIG, type Difficulty, type GameMode, type HeroClass } from "./config";
import { clamp } from "./math";
import {
  buildBarricade,
  defaultBarricadeRotation,
  demolishBarricade,
  moveBarricade,
  upgradeBarricade,
} from "./systems/barricades";
import { updateChests, updateCoins } from "./systems/coins";
import { addFuel, buildBuilding, demolishBuilding, updateAnimals, updateDrops, updateSurvival, useItem } from "./systems/survival";
import { gunStats, heroById, startReload, updateHeroes } from "./systems/heroes";
import { placeMine, updateMines } from "./systems/mines";
import { shopRoll } from "./systems/shop";
import { buildTower, demolishTower, updateFires, updateShells, updateTowers, upgradeTower } from "./systems/towers";
import { startNight, updateWaves } from "./systems/waves";
import { updateProjectiles, updateZombies } from "./systems/zombies";
import type { GameEvent, GameState, PlayerId } from "./types";

export interface PlayerSetup {
  id: PlayerId;
  heroClass: HeroClass;
  /** Numele ales în meniu. */
  name?: string;
}

export interface GameOptions {
  players: PlayerSetup[];
  seed?: number;
  /** Easy = jocul de bază; Medium / Hard / Nightmare = mai mulți zombi, mai puternici. */
  difficulty?: Difficulty;
  /** Apără mina (implicit) sau Supraviețuire. */
  mode?: GameMode;
}

export class GameSimulation {
  readonly state: GameState;
  private commands: Command[] = [];
  private events: GameEvent[] = [];

  constructor(options: GameOptions) {
    this.state = createInitialState(options);
  }

  /** Pune o comandă în coadă; va fi aplicată la începutul următorului pas. */
  enqueue(command: Command): void {
    this.commands.push(command);
  }

  /** Avansează jocul cu `dt` secunde. */
  step(dt: number): void {
    const s = this.state;
    if (s.phase === "gameover" || s.phase === "victory") {
      this.commands.length = 0;
      return;
    }
    for (const cmd of this.commands) this.applyCommand(cmd);
    this.commands.length = 0;

    s.time += dt;
    updateWaves(s, dt, this.events);
    updateHeroes(s, dt, this.events);
    updateTowers(s, dt, this.events);
    updateShells(s, dt, this.events);
    updateFires(s, dt, this.events);
    updateZombies(s, dt, this.events);
    updateProjectiles(s, dt, this.events);
    updateMines(s, dt, this.events);
    updateCoins(s, dt, this.events);
    updateChests(s, dt);
    updateSurvival(s, dt, this.events);
    updateDrops(s, dt, this.events);
    updateAnimals(s, dt, this.events);

    // Pierzi: mina cade (Apără mina) sau toți eroii sunt căzuți (Supraviețuire).
    const lost = s.mode === "survival" ? s.heroes.every((h) => !h.alive) : s.shelter.hp <= 0;
    if (lost) {
      s.phase = "gameover";
      this.events.push({ type: "gameOver" });
    }
  }

  /** Returnează evenimentele adunate de la ultimul apel și golește lista. */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private applyCommand(cmd: Command): void {
    const s = this.state;
    const player = s.players[cmd.playerId];
    if (!player) return;

    switch (cmd.type) {
      case "move": {
        const hero = heroById(s, player.heroId);
        if (!hero) return;
        // Nu avem încredere în client: limităm vectorul la lungimea 1.
        const len = Math.hypot(cmd.x, cmd.z);
        const scale = len > 1 ? 1 / len : 1;
        hero.moveInput = { x: clamp(cmd.x * scale, -1, 1), z: clamp(cmd.z * scale, -1, 1) };
        break;
      }
      case "build": {
        const pos = { x: cmd.x, z: cmd.z };
        if (cmd.kind === "tower") buildTower(s, cmd.playerId, pos, this.events);
        else if (cmd.kind === "barricade") buildBarricade(s, cmd.playerId, pos, cmd.rotation ?? defaultBarricadeRotation(pos), this.events);
        else buildBuilding(s, cmd.playerId, cmd.kind, pos, this.events);
        break;
      }
      case "upgradeTower":
        upgradeTower(s, cmd.playerId, cmd.towerId, cmd.to, this.events);
        break;
      case "demolishTower":
        demolishTower(s, cmd.playerId, cmd.towerId, this.events);
        break;
      case "moveBarricade":
        moveBarricade(s, cmd.playerId, cmd.barricadeId, { x: cmd.x, z: cmd.z }, cmd.rotation, this.events);
        break;
      case "upgradeBarricade":
        upgradeBarricade(s, cmd.playerId, cmd.barricadeId, cmd.to, this.events);
        break;
      case "demolish":
        demolishBarricade(s, cmd.playerId, cmd.barricadeId, this.events);
        break;
      case "placeMine":
        placeMine(s, cmd.playerId);
        break;
      case "aim": {
        const hero = heroById(s, player.heroId);
        if (!hero || !hero.alive) return;
        const len = Math.hypot(cmd.x, cmd.z);
        if (len > 0.001) hero.aim = { x: cmd.x / len, z: cmd.z / len };
        hero.firing = cmd.firing;
        hero.autoAim = cmd.auto;
        hero.aimDist = cmd.dist !== undefined && cmd.dist > 0 ? Math.min(60, cmd.dist) : 0;
        break;
      }
      case "useItem":
        useItem(s, cmd.playerId, cmd.item, this.events);
        break;
      case "addFuel":
        addFuel(s, cmd.playerId, cmd.fireId, this.events);
        break;
      case "demolishBuilding":
        demolishBuilding(s, cmd.playerId, cmd.buildingId, this.events);
        break;
      case "reload": {
        const hero = heroById(s, player.heroId);
        if (hero) startReload(s, hero, this.events);
        break;
      }
      case "shopRoll":
        shopRoll(s, cmd.playerId, this.events);
        break;
      case "startNightNow":
        startNight(s, this.events);
        break;
    }
  }
}

function createInitialState({ players, seed = Date.now(), difficulty = "easy", mode = "defend" }: GameOptions): GameState {
  const state: GameState = {
    time: 0,
    mode,
    difficulty,
    weather: "clear",
    phase: "day",
    wave: 0,
    totalWaves: CONFIG.waves.count,
    wavesCompleted: 0,
    phaseTimer: CONFIG.waves.firstDay,
    phaseDuration: CONFIG.waves.firstDay,
    spawnQueue: [],
    spawnTimer: 0,
    spawnInterval: 1,
    shelter: { pos: { x: 0, z: 0 }, hp: CONFIG.shelter.maxHp, maxHp: CONFIG.shelter.maxHp, radius: CONFIG.shelter.radius },
    players: {},
    heroes: [],
    zombies: [],
    towers: [],
    barricades: [],
    mines: [],
    coins: [],
    projectiles: [],
    shells: [],
    fires: [],
    chests: [],
    campfires: [],
    farms: [],
    animals: [],
    drops: [],
    wildTimer: 4,
    nextId: 1,
    rngState: seed | 0,
  };

  players.forEach(({ id, heroClass, name }, i) => {
    const heroId = state.nextId++;
    const stats = CONFIG.heroes[heroClass];
    // Eroii pornesc în jurul adăpostului.
    const angle = (i / players.length) * Math.PI * 2 - Math.PI / 2;
    const r = CONFIG.shelter.radius + 2;
    state.players[id] = {
      id,
      name: (name ?? "").trim().slice(0, 16) || `Supraviețuitor ${i + 1}`,
      heroId,
      coins: 0,
      wood: Math.round(CONFIG.economy.startWood * CONFIG.difficulty[difficulty].wood),
      weapon: "rusty",
      towerTier: 2,
      extraTowerSlots: 0,
      mines: 0,
      maxHpBonus: 0,
      speedBonus: 0,
      regenPerSec: 0,
      repairBonus: 0,
      skins: [],
      skin: null,
      unlocked: [],
      kills: 0,
      inventory: { rawMeat: 0, cookedMeat: mode === "survival" ? 2 : 0 },
    };
    state.heroes.push({
      id: heroId,
      playerId: id,
      heroClass,
      pos: { x: Math.cos(angle) * r, z: Math.sin(angle) * r },
      // Cu spatele la mină (privește spre sat).
      facing: Math.atan2(Math.cos(angle), Math.sin(angle)),
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      alive: true,
      respawnTimer: 0,
      fireTimer: 0,
      level: 1,
      xp: 0,
      moveInput: { x: 0, z: 0 },
      aim: { x: 0, z: 1 },
      firing: false,
      autoAim: false,
      ammo: 0,
      reloadTimer: 0,
      reserve: 0,
      aimDist: 0,
      hunger: 100,
      warmth: 100,
    });
    const hero = state.heroes[state.heroes.length - 1];
    hero.ammo = gunStats(state, hero).magazine;
    hero.reserve = hero.ammo * CONFIG.ammo.startMagazines;
  });

  // Focul de tabără de lângă mină (în Apără mina e doar decor și nu se stinge).
  state.campfires.push({ id: state.nextId++, ownerId: players[0]?.id ?? "p1", pos: { x: 1.6, z: -3.7 }, fuel: CONFIG.survival.campfireFuel, cooking: [] });
  return state;
}
