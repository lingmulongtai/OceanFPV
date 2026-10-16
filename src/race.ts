import { Vector3 } from 'three';
export const GATE_POSITIONS = [[86, 11, 28], [90, 12, -8], [79, 14, -48], [51, 10, -27], [50, 7, 15], [70, 7, 43]];
export const GATES = GATE_POSITIONS.map((p, i) => {
  const position = new Vector3(...p);
  const previous = new Vector3(...GATE_POSITIONS[(i + GATE_POSITIONS.length - 1) % GATE_POSITIONS.length]);
  return { position, normal: position.clone().sub(previous).normalize(), radius: 4.3 };
});
export function crossedGate(previous: Vector3, current: Vector3, gate: typeof GATES[number]) {
  const a = previous.clone().sub(gate.position).dot(gate.normal);
  const b = current.clone().sub(gate.position).dot(gate.normal);
  if (!(a < 0 && b >= 0)) return false;
  return previous.clone().lerp(current, -a / (b - a)).distanceTo(gate.position) <= gate.radius;
}
export class Race {
  active = false;
  finished = false;
  next = 0;
  lap = 1;
  elapsed = 0;
  split = 0;
  laps: number[] = [];
  best: number | null = null;
  reset(active: boolean) {
    this.active = active; this.finished = false; this.next = 0; this.lap = 1;
    this.elapsed = 0; this.split = 0; this.laps = [];
  }
  step(dt: number, previous: Vector3, current: Vector3) {
    if (!this.active || this.finished) return false;
    this.elapsed += dt;
    if (!crossedGate(previous, current, GATES[this.next])) return false;
    this.next++;
    if (this.next === GATES.length) {
      this.next = 0; this.laps.push(this.elapsed - this.split); this.split = this.elapsed;
      if (this.lap === 3) { this.finished = true; this.best = Math.min(this.best ?? Infinity, this.elapsed); }
      else this.lap++;
    }
    return true;
  }
}
export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}
