// Joystick virtual pentru touch: apeși oriunde în zona din stânga-jos,
// baza apare sub deget, iar tragerea degetului dă direcția.
// Folosește Pointer Events, deci merge și cu mouse-ul.

const MAX_DISTANCE = 55; // pixeli

export class VirtualJoystick {
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };
  private value = { x: 0, z: 0 };

  constructor(zone: HTMLElement) {
    this.base = document.createElement("div");
    this.base.className = "joystick-base";
    this.knob = document.createElement("div");
    this.knob.className = "joystick-knob";
    this.base.appendChild(this.knob);
    zone.appendChild(this.base);

    zone.addEventListener("pointerdown", (e) => {
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add("active");
      this.updateKnob(e.clientX, e.clientY);
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId === this.pointerId) this.updateKnob(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.value = { x: 0, z: 0 };
      this.base.classList.remove("active");
      this.knob.style.transform = "translate(-50%, -50%)";
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
  }

  private updateKnob(px: number, py: number): void {
    let dx = px - this.origin.x;
    let dy = py - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > MAX_DISTANCE) {
      dx = (dx / len) * MAX_DISTANCE;
      dy = (dy / len) * MAX_DISTANCE;
    }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // Pe ecran y crește în jos; în joc „înainte” (z) e sus pe ecran.
    const deadZone = 0.15;
    const mag = Math.min(len / MAX_DISTANCE, 1);
    this.value = mag < deadZone ? { x: 0, z: 0 } : { x: dx / MAX_DISTANCE, z: -dy / MAX_DISTANCE };
  }

  getMove(): { x: number; z: number } {
    return this.value;
  }
}
