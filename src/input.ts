import { NEUTRAL, type StickInput } from './flight';
import { readStored, writeStored } from './storage';
export type Channel = 'roll' | 'pitch' | 'yaw' | 'throttle';
export interface AxisCalibration { min: number; center: number; max: number }
export interface RadioProfile {
  axes: Record<Channel, number>; invert: Record<Channel, boolean>; calibration: AxisCalibration[];
}
export const DEFAULT_RADIO: RadioProfile = {
  axes: { roll: 0, pitch: 1, yaw: 2, throttle: 3 },
  invert: { roll: false, pitch: false, yaw: false, throttle: true }, calibration: [],
};
export function normalizeAxis(value: number, calibration?: AxisCalibration, deadzone = 0.06) {
  if (!Number.isFinite(value)) return 0;
  const valid = calibration && [calibration.min, calibration.center, calibration.max].every(Number.isFinite) && calibration.min < calibration.center && calibration.center < calibration.max;
  const c = valid ? calibration : { min: -1, center: 0, max: 1 };
  deadzone = Math.max(0, Math.min(0.95, Number.isFinite(deadzone) ? deadzone : 0.06));
  const extent = value < c.center ? c.center - c.min : c.max - c.center;
  const normalized = Math.max(-1, Math.min(1, (value - c.center) / Math.max(0.05, extent)));
  return Math.abs(normalized) < deadzone ? 0 : Math.sign(normalized) * (Math.abs(normalized) - deadzone) / (1 - deadzone);
}
export function mapGamepad(pad: Pick<Gamepad, 'axes' | 'buttons'>, radio: boolean, profile: RadioProfile, deadzone: number): StickInput {
  if (radio) {
    const channel = (name: Channel) => {
      const index = profile.axes[name];
      // Missing throttle axis must fail closed rather than produce 50% thrust.
      if (index >= pad.axes.length) return name === 'throttle' ? -1 : 0;
      return normalizeAxis(pad.axes[index], profile.calibration[index], name === 'throttle' ? 0 : deadzone) * (profile.invert[name] ? -1 : 1);
    };
    return { roll: channel('roll'), pitch: channel('pitch'), yaw: channel('yaw'), throttle: (channel('throttle') + 1) / 2, absoluteThrottle: true };
  }
  return {
    roll: normalizeAxis(pad.axes[2] ?? 0, undefined, deadzone),
    pitch: normalizeAxis(pad.axes[3] ?? 0, undefined, deadzone),
    yaw: normalizeAxis(pad.axes[0] ?? 0, undefined, deadzone),
    throttle: -normalizeAxis(pad.axes[1] ?? 0, undefined, deadzone), absoluteThrottle: false,
  };
}

export class Inputs {
  keys = new Set<string>();
  mouse = { x: 0, y: 0 };
  useMouse = false;
  source: 'keyboard' | 'xbox' | 'radio' = 'keyboard';
  pad: Gamepad | null = null;
  selectedIndex = -1;
  deadzone = 0.08;
  profile: RadioProfile = structuredClone(DEFAULT_RADIO);
  calibrating = false;
  private calibratedDevice = '';
  private previousButtons = new Set<number>();
  onAction: (action: string) => void = () => {};
  onDisconnect: () => void = () => {};

  constructor() {
    window.addEventListener('keydown', e => {
      if (e.code === 'Tab' && document.querySelector('dialog[open]')) return;
      if (e.code === 'Escape' && document.querySelector('dialog[open]:not(#pause-dialog)')) return;
      if (e.target instanceof HTMLElement && (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || (e.target.tagName === 'BUTTON' && ['Space', 'Enter'].includes(e.code)))) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Escape'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) {
        const action: Record<string, string> = { Escape: 'pause', KeyR: 'reset', KeyF: 'arm', KeyC: 'camera', KeyM: 'mute', KeyH: 'hud', Tab: 'settings' };
        if (action[e.code]) this.onAction(action[e.code]);
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) this.mouse = { x: 0, y: 0 }; });
    window.addEventListener('mousemove', e => {
      if (document.pointerLockElement && this.useMouse) {
        this.mouse.x = Math.max(-1, Math.min(1, this.mouse.x + e.movementX * 0.004));
        this.mouse.y = Math.max(-1, Math.min(1, this.mouse.y + e.movementY * 0.004));
      }
    });
  }

  clear() { this.keys.clear(); this.mouse = { x: 0, y: 0 }; }
  pads(): Gamepad[] {
    try { return Array.from(navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected); }
    catch { return []; }
  }
  poll() {
    const pads = this.pads();
    const previous = this.pad;
    this.pad = pads.find(p => p.index === this.selectedIndex) ?? (this.selectedIndex < 0 ? pads[0] : null) ?? null;
    if (previous && (!this.pad || previous.index !== this.pad.index || previous.id !== this.pad.id) && this.source !== 'keyboard') this.onDisconnect();
    if (this.pad && this.pad.id !== this.calibratedDevice) {
      const saved = readStored<RadioProfile | null>(`radio:${this.pad.id}`, null);
      if (saved && Object.values(saved.axes ?? {}).length === 4 && Object.values(saved.axes).every(v => Number.isInteger(v) && v >= 0 && v < 32) && saved.invert && Array.isArray(saved.calibration)) this.profile = saved;
      else this.profile = structuredClone(DEFAULT_RADIO);
      this.calibratedDevice = this.pad.id; this.previousButtons.clear();
    }
    if (!this.pad || this.source === 'keyboard') return;
    if (this.calibrating) {
      this.pad.axes.forEach((v, i) => {
        const c = this.profile.calibration[i];
        if (c) { c.min = Math.min(c.min, v); c.max = Math.max(c.max, v); }
      });
    }
    if (this.source === 'xbox') {
      const actions: Record<number, string> = { 0: 'arm', 2: 'reset', 3: 'camera', 9: 'pause' };
      const edges: string[] = [];
      Object.entries(actions).forEach(([index, action]) => {
        const i = Number(index); const pressed = !!this.pad?.buttons[i]?.pressed;
        if (pressed && !this.previousButtons.has(i)) edges.push(action);
        if (pressed) this.previousButtons.add(i); else this.previousButtons.delete(i);
      });
      // Latch all edges before callbacks: a reset can synchronously poll again.
      edges.forEach(action => this.onAction(action));
    }
  }
  sticks(): StickInput {
    if (this.source !== 'keyboard') return this.pad ? mapGamepad(this.pad, this.source === 'radio', this.profile, this.deadzone) : { ...NEUTRAL };
    const key = (code: string) => Number(this.keys.has(code));
    const mouseActive = this.useMouse && !!document.pointerLockElement;
    return {
      roll: mouseActive ? this.mouse.x : key('KeyD') - key('KeyA'),
      pitch: mouseActive ? this.mouse.y : key('KeyS') - key('KeyW'),
      yaw: key('KeyE') - key('KeyQ'), throttle: key('Space') - key('ShiftLeft') - key('ShiftRight'), absoluteThrottle: false,
    };
  }
  beginCalibration() {
    if (!this.pad) return false;
    this.profile.calibration = this.pad.axes.map(v => ({ min: v, center: v, max: v }));
    this.calibrating = true; return true;
  }
  finishCalibration() {
    this.profile.calibration = this.profile.calibration.map(c => c.max - c.min < 0.5 ? { min: -1, center: 0, max: 1 } : c);
    this.calibrating = false; this.saveProfile();
  }
  saveProfile() { if (this.pad) writeStored(`radio:${this.pad.id}`, this.profile); }
}
