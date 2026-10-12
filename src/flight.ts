import { Euler, Quaternion, Vector3 } from 'three';

export type FlightMode = 'angle' | 'acro';
export interface StickInput { roll: number; pitch: number; yaw: number; throttle: number; absoluteThrottle: boolean }
export const NEUTRAL: StickInput = { roll: 0, pitch: 0, yaw: 0, throttle: 0, absoluteThrottle: false };
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export function rateCurve(value: number, rate: number, expo: number) {
  const v = clamp(Number.isFinite(value) ? value : 0, -1, 1);
  return ((1 - expo) * v + expo * v * v * v) * rate * Math.PI / 180;
}

/** SI units, body frame right/up/back, 120 Hz fixed step. Simplified quadrotor. */
export class Flight {
  position = new Vector3(0, 5.4, 38);
  previous = this.position.clone();
  velocity = new Vector3();
  orientation = new Quaternion();
  angularVelocity = new Vector3();
  mode: FlightMode = 'angle';
  armed = false;
  crashed = false;
  motor = 0;
  rate = 520;
  expo = 0.3;
  distance = 0;
  maxSpeed = 0;
  private up = new Vector3();
  private delta = new Quaternion();
  private euler = new Euler(0, 0, 0, 'YXZ');

  reset() {
    this.position.set(0, 5.4, 38); this.previous.copy(this.position);
    this.velocity.set(0, 0, 0); this.orientation.identity(); this.angularVelocity.set(0, 0, 0);
    this.crashed = false; this.armed = false; this.motor = 0; this.distance = 0; this.maxSpeed = 0;
  }

  step(dt: number, sticks: StickInput, wind: number) {
    if (this.crashed) return;
    this.previous.copy(this.position);
    if (!this.armed) {
      this.motor = 0;
      this.velocity.y -= 9.81 * dt;
      this.velocity.multiplyScalar(Math.exp(-(0.18 + this.velocity.length() * 0.017) * dt));
      this.position.addScaledVector(this.velocity, dt);
      this.distance += this.position.distanceTo(this.previous);
      return;
    }
    if (this.mode === 'angle') {
      this.euler.setFromQuaternion(this.orientation, 'YXZ');
      const response = 1 - Math.exp(-dt * 7);
      this.euler.x += (clamp(sticks.pitch, -1, 1) * 0.52 - this.euler.x) * response;
      this.euler.z += (-clamp(sticks.roll, -1, 1) * 0.52 - this.euler.z) * response;
      this.euler.y -= rateCurve(sticks.yaw, 155, this.expo) * dt;
      this.orientation.setFromEuler(this.euler);
      this.angularVelocity.set(0, 0, 0);
    } else {
      const response = 1 - Math.exp(-dt * 22);
      this.angularVelocity.x += (rateCurve(sticks.pitch, this.rate, this.expo) - this.angularVelocity.x) * response;
      this.angularVelocity.y += (-rateCurve(sticks.yaw, this.rate * 0.7, this.expo) - this.angularVelocity.y) * response;
      this.angularVelocity.z += (-rateCurve(sticks.roll, this.rate, this.expo) - this.angularVelocity.z) * response;
      const magnitude = this.angularVelocity.length();
      if (magnitude > 1e-8) {
        this.up.copy(this.angularVelocity).divideScalar(magnitude);
        this.delta.setFromAxisAngle(this.up, magnitude * dt);
        this.orientation.multiply(this.delta).normalize();
      }
    }
    this.up.set(0, 1, 0).applyQuaternion(this.orientation);
    // Spring-centered Xbox/keyboard throttle controls climb in Angle. A radio
    // or Acro uses the actual throttle channel: no automatic inverted flight.
    let target = clamp(sticks.throttle, 0, 1);
    if (this.mode === 'angle' && !sticks.absoluteThrottle) {
      const desiredVertical = clamp(sticks.throttle, -1, 1) * 7;
      const acceleration = 9.81 + (desiredVertical - this.velocity.y) * 3.2;
      target = clamp(acceleration / (31 * Math.max(0.35, this.up.y)), 0, 1);
    } else if (!sticks.absoluteThrottle) {
      target = clamp(9.81 / 31 + sticks.throttle * 0.45, 0, 1);
    }
    this.motor += (target - this.motor) * (1 - Math.exp(-dt * 28));
    const speed = this.velocity.length();
    const drag = 0.18 + speed * 0.017;
    this.velocity.addScaledVector(this.up, this.motor * 31 * dt);
    this.velocity.y -= 9.81 * dt;
    this.velocity.x += wind * dt * 0.35;
    this.velocity.multiplyScalar(Math.exp(-drag * dt));
    this.position.addScaledVector(this.velocity, dt);
    this.distance += this.position.distanceTo(this.previous);
    this.maxSpeed = Math.max(this.maxSpeed, this.velocity.length());
  }
}
