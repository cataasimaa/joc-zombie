// GameSimulation = „creierul” jocului. Nu știe nimic despre ecran, Babylon sau tastatură.
// Primește comenzi, avansează timpul cu step(dt) și produce stare + evenimente.
// În faza 2 (multiplayer) exact această clasă va rula pe serverul Colyseus.

import type { Command } from "./commands";
import { CONFIG } from "./config";
import { clamp } from "./math";
import { updateCoins } from "./systems/coins";
import { updateHeroes } from "./systems/heroes";
import { placeTower, updateTowers } from "./systems/towers";
import { startNextWave, updateWaves } from "./systems/waves";
import { updateZombies } from "./systems/zombies";
import type { GameEvent, GameState, PlayerId } from "./types";

export interface GameOptions {
  playerIds: PlayerId[];
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
    for (const cmd of this.commands) this.applyCommand(cmd);
    this.commands.length = 0;

    if (s.phase === "gameover" || s.phase === "victory") return;

    s.time += dt;
    updateWaves(s, dt, this.events);
    updateHeroes(s, dt, this.events);
    updateTowers(s, dt, this.events);
    updateZombies(s, dt, this.events);
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
        const hero = s.heroes.find((h) => h.id === player.heroId);
        if (!hero) return;
        // Nu avem încredere în client: limităm vectorul la lungimea 1.
        const len = Math.hypot(cmd.x, cmd.z);
        const scale = len > 1 ? 1 / len : 1;
        hero.moveInput = { x: clamp(cmd.x * scale, -1, 1), z: clamp(cmd.z * scale, -1, 1) };
        break;
      }
      case "placeTower":
        placeTower(s, cmd.playerId, { x: cmd.x, z: cmd.z }, this.events);
        break;
      case "startWaveNow":
        startNextWave(s, this.events);
        break;
    }
  }
}

function createInitialState({ playerIds, seed = Date.now() }: GameOptions): GameState {
  const state: GameState = {
    time: 0,
    phase: "build",
    wave: 0,
    totalWaves: CONFIG.waves.list.length,
    wavesCompleted: 0,
    phaseTimer: CONFIG.waves.firstDelay,
    zombiesToSpawn: 0,
    spawnTimer: 0,
    shelter: { pos: { x: 0, z: 0 }, hp: CONFIG.shelter.maxHp, maxHp: CONFIG.shelter.maxHp, radius: CONFIG.shelter.radius },
    players: {},
    heroes: [],
    zombies: [],
    towers: [],
    coins: [],
    nextId: 1,
    rngState: seed | 0,
  };

  playerIds.forEach((playerId, i) => {
    const heroId = state.nextId++;
    const stats = CONFIG.heroes.assault;
    // Eroii pornesc în jurul adăpostului.
    const angle = (i / playerIds.length) * Math.PI * 2 - Math.PI / 2;
    const r = CONFIG.shelter.radius + 2;
    state.players[playerId] = { id: playerId, heroId, coins: CONFIG.economy.startCoins };
    state.heroes.push({
      id: heroId,
      playerId,
      heroClass: "assault",
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
    });
  });

  return state;
}
