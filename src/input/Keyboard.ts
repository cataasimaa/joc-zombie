// Tastatura pentru testat în browser: WASD / săgeți.

export class Keyboard {
  private down = new Set<string>();
  private pressedHandlers = new Map<string, () => void>();

  constructor() {
    window.addEventListener("keydown", (e) => {
      // Space/Enter sunt comenzi de joc: nu lăsăm browserul să „apese” butonul care are focus.
      if (e.code === "Space" || e.code === "Enter") e.preventDefault();
      if (!e.repeat) this.pressedHandlers.get(e.code)?.();
      this.down.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    window.addEventListener("blur", () => this.down.clear());
  }

  /** Rulează `fn` o dată la apăsarea tastei (ex. "KeyB"). */
  onPress(code: string, fn: () => void): void {
    this.pressedHandlers.set(code, fn);
  }

  /** E ținută apăsată tasta? (ex. "Space") */
  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Direcția de mișcare: x = dreapta, z = înainte (sus pe ecran). */
  getMove(): { x: number; z: number } {
    const k = (...codes: string[]) => (codes.some((c) => this.down.has(c)) ? 1 : 0);
    const x = k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft");
    const z = k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown");
    const len = Math.hypot(x, z);
    return len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }
}
