// Derived from OceanLab/scripts/cpu_sea.gd (MIT). This is analytic, not FFT.
import type {WaveBandScales} from './spectrum';
export const WAVELENGTHS = [210, 142, 98, 73, 51, 35, 24, 16, 11, 7, 4.5, 3.1];
export type SeaState = 'calm' | 'breeze' | 'swell';
export function waveParameters() {
  return WAVELENGTHS.map((length, i) => {
    const direction = (i < 3 ? 22 + (i - 1) * 17 : 38 + Math.sin(i * 2.399) * 42) * Math.PI / 180;
    const k = 2 * Math.PI / length;
    return { x: Math.cos(direction) * k, z: Math.sin(direction) * k, amplitude: 0.36 * Math.exp(-i * 0.27), phase: i * 1.754, frequency: Math.sqrt(9.81 * k) };
  });
}
export const WAVES = waveParameters();
export const SEA_SCALE: Record<SeaState, number> = { calm: 0.55, breeze: 1.15, swell: 2.15 };
export const SEA_BANDS: Record<SeaState,WaveBandScales>={calm:[.55,.55,.55],breeze:[1.15,1.15,1.15],swell:[2.15,2.15,2.15]};
export function seaHeight(x: number, z: number, time: number, state: SeaState = 'breeze') {
  return WAVES.reduce((sum, w) => sum + w.amplitude * Math.sin(w.x * x + w.z * z - w.frequency * time + w.phase), 0) * SEA_SCALE[state];
}
