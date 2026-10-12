export function readStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(`oceanfpv:${key}`); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
export function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(`oceanfpv:${key}`, JSON.stringify(value)); } catch { /* Private mode / quota: play remains available. */ }
}
