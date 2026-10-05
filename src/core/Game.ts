// GameSimulation = „creierul” jocului. Nu știe nimic despre ecran, Babylon sau tastatură.
// Primește comenzi, avansează timpul cu step(dt) și produce stare + evenimente.
// În faza 3 (multiplayer) exact această clasă va rula pe serverul Colyseus.

import type { Command } from "./commands";
import { CONFIG, type HeroClass } from "./config";
import { clamp } from "./math";
import { updateZones, useAbility } from "./systems/abilities";
import { openChest } from "./systems/chests";
import { updateCoins } from "./systems/coins";
import { heroById, updateHeroes } from "./systems/heroes";
import { build, updateTowers, upgradeTower } from "./systems/towers";
import { startNextWave, updateWaves } from "./systems/waves";
import { updateZombies } from "./systems/zombies";
import type { GameEvent, GameState, PlayerId } from "./types";

export interface PlayerSetup {
  id: PlayerId;
  heroClass: HeroClass;
}

export interface GameOptions {
  players: PlayerSetup[];
  seed?: number;
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
    updateZombies(s, dt, this.events);
    updateZones(s, dt);
    updateCoins(s, dt, this.events);

    if (s.shelter.hp <= 0) {
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
      case "build":
        build(s, cmd.playerId, cmd.kind, { x: cmd.x, z: cmd.z }, this.events);
        break;
      case "upgradeTower":
        upgradeTower(s, cmd.playerId, cmd.towerId, this.events);
        break;
      case "useAbility": {
        const hero = heroById(s, player.heroId);
        if (hero) useAbility(s, hero, cmd.slot, this.events);
        break;
      }
      case "openChest":
        openChest(s, cmd.playerId, this.events);
        break;
      case "startWaveNow":
        startNextWave(s, this.events);
        break;
    }
  }
}

function createInitialState({ players, seed = Date.now() }: GameOptions): GameState {
  const state: GameState = {
    time: 0,
    phase: "build",
    wave: 0,
    totalWaves: CONFIG.waves.count,
    wavesCompleted: 0,
    phaseTimer: CONFIG.waves.firstDelay,
    spawnQueue: [],
    spawnTimer: 0,
    spawnInterval: 1,
    shelter: { pos: { x: 0, z: 0 }, hp: CONFIG.shelter.maxHp, maxHp: CONFIG.shelter.maxHp, radius: CONFIG.shelter.radius },
    players: {},
    heroes: [],
    zombies: [],
    towers: [],
    barricades: [],
    coins: [],
    zones: [],
    nextId: 1,
    rngState: seed | 0,
  };

  players.forEach(({ id, heroClass }, i) => {
    const heroId = state.nextId++;
    const stats = CONFIG.heroes[heroClass];
    // Eroii pornesc în jurul adăpostului.
    const angle = (i / players.length) * Math.PI * 2 - Math.PI / 2;
    const r = CONFIG.shelter.radius + 2;
    state.players[id] = {
      id,
      heroId,
      coins: 0,
      wood: CONFIG.economy.startWood,
      weaponBonus: 0,
      towerTier: 1,
      skins: [],
      skin: null,
    };
    state.heroes.push({
      id: heroId,
      playerId: id,
      heroClass,
      pos: { x: Math.cos(angle) * r, z: Math.sin(angle) * r },
      facing: 0,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      alive: true,
      respawnTimer: 0,
      fireTimer: 0,
      level: 1,
      xp: 0,
      moveInput: { x: 0, z: 0 },
      cooldowns: [0, 0, 0, 0],
      buffs: { rapidFire: 0, focus: 0, shield: 0, invulnerable: 0 },
    });
  });

  return state;
}
