# FFT butterfly loop cost

The CPU FFT remains shared by rendered waves and flight contacts. This change
hoists the butterfly half-length and stride offset out of the inner loop,
advances its integer index directly, and retains input/twiddle values in local
variables. Complex multiplication, addition/subtraction and output writes keep
their original order. Grid size, wave density, cadence, foam and render quality
are unchanged.

## Measurements

Measured on 2026-10-17 against `13f7034`, before changing production source:

| Isolated 128² inverse FFT | Earlier median / 100 calls | New median / 100 calls |
| --- | --- | --- |
| Node, nine alternating rounds after 50 warmup calls | 65.9757 ms | 58.6981 ms |
| Chromium, nine rounds after 100 warmup calls | 110.7 ms | 94.9 ms |

Each call restores the same sine/cosine input arrays, avoiding a benchmark
that repeatedly transforms already attenuated output. The browser comparison
used separate native Direct3D11 ULTRA scenes, paused at exact simulation time
zero; its FFT benchmark ran in that browser while the scene was paused. These
results measure approximately 11% and 14% less time in this component. They do
not establish the same improvement in game frame rate.

A preceding 30-second animated DEV profile on an RTX 4050 at 1920×1280 found
5.632 seconds of exclusive FFT butterfly time, alongside 4.648 seconds in wave
updates, 1.902 seconds in mip generation and 1.649 seconds in foam updates.
Average frame rate was 18.4 FPS, with a 191.8 ms p95 frame interval. This is a
specific diagnostic sample, not general hardware acceptance.

## Correctness checks

- Eighteen zero, ordinary and tiny-valued transform inputs over sizes 2–128
  retain identical Float64 bits.
- Eighteen overlapping-view cases retain the legacy memory mutation results.
  The inner loop keeps reads interleaved with writes rather than snapshotting
  both channels in advance. Overlapping channels do not represent two
  independent IDFT outputs; this check preserves existing mutation behavior.
- Physical and legacy profiles over eight times, including rewind and foam
  profile changes, retain all 9,437,184 compared Float32 values and 144 scalar
  variance/compression results exactly. Fresh and residual foam are included.
- The actual browser scene retains all nine field hashes, variance,
  compression and camera values at exact time zero.
- All 193 unit tests and the strict production build pass. Native minified
  ULTRA acceptance covers all 36 assets, keyboard climb, pause/resume/reset,
  lighting changes and actual pointer-lock mouse input, with no errors.

Hoisting foam decay exponentials and caching identical wave frequencies were
also benchmarked. Neither showed a clear useful reduction and neither is
included. No approximation, precision reduction or lower visual quality is
introduced by this loop change.
