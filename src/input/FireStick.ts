// Butonul de tras, care e și joystick de ochire (ca în jocurile shooter pe mobil):
//  - apeși și ții → trage, ochind automat cel mai apropiat zombie;
//  - apeși și tragi cu degetul → trage exact în direcția în care tragi;
//  - ridici degetul → se oprește.

const DRAG_START = 14; // pixeli: de la cât începe ochirea manuală
const MAX_DRAG = 60;

export interface AimState {
  firing: boolean;
  /** true = ochire automată (n-ai tras de buton). */
  auto: boolean;
  /** Direcția de ochire pe hartă (x = dreapta, z = sus pe ecran). */
  x: number;
  z: number;
}

export class FireStick {
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };
  private state: AimState = { firing: false, auto: true, x: 0, z: 1 };

  constructor(el: HTMLElement, private knob: HTMLElement) {
    el.addEventListener("pointerdown", (e) => {
      if (this.pointerId !== null) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      this.origin = { x: e.clientX, y: e.clientY };
      this.state = { ...this.state, firing: true, auto: true };
      el.classList.add("active");
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.pointerId) return;
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const len = Math.hypot(dx, dy);
      if (len > DRAG_START) {
        // Ecran: y crește în jos; pe hartă „sus” = +z.
        this.state = { firing: true, auto: false, x: dx / len, z: -dy / len };
        el.classList.add("aiming");
      }
      if (len > MAX_DRAG) {
        dx = (dx / len) * MAX_DRAG;
        dy = (dy / len) * MAX_DRAG;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.state = { ...this.state, firing: false };
      this.knob.style.transform = "";
      el.classList.remove("active", "aiming");
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  get(): AimState {
    return this.state;
  }
}
