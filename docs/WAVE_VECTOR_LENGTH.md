# Wave derivative length cost

Wave compression and foam each evaluate a two-component derivative length for every cell of the three 128² cascades. A native 20-second gameplay CPU profile attributed 10.91 seconds to sea updates, including 4.41 seconds of exclusive cascade-update work and 1.58 seconds in foam. This is sampled diagnostic time, including profiler overhead.

`waveVectorLength` uses `sqrt(x*x+y*y)` when the squared result is normal and finite. Subnormal squares, overflow and nonfinite inputs retain `Math.hypot`; true zero returns positive zero. The normal-range result can differ from `Math.hypot` by floating-point rounding. This does not change grid resolution, wave density, update cadence, foam thresholds or rendering settings.

## Comparison

Before production edits, unchanged source and a response-only prototype ran in the same RTX4050/D3D11 Chromium page. The actual ULTRA scene was paused through Help at time zero. Independent seas used identical timestamps and the real SWELL gains `[2.15,2.15,1.15]`. Nine alternating rounds each measured 100 complete sea updates after 60 warmup updates.

| Component median / 100 updates | Earlier | New |
| --- | --- | --- |
| Native Chromium, SWELL | 1,792.9 ms | 1,666.7 ms |
| Node, mixed gains `[.85,.6,.55]` | 1,613.96 ms | 1,366.73 ms |

This is approximately 7% and 15% less component time respectively. It does not establish the same change in game FPS. A separate wrapping-index prototype preserved exact outputs but showed no useful speed gain and was rejected.

## Precision checks

- Node compared 18,873,216 Float32 field values across physical, legacy and zero profiles, sizes 2–128, and eight times including rewind and foam resets. All field bits matched; the maximum scalar compression difference was `2.23e-16`.
- Chromium compared 4,718,592 Float32 values across the actual CALM/BREEZE/SWELL profiles, including changes and rewind. All field bits and sampled contact heights matched; maximum scalar difference was `1.12e-16`.
- Unit tests compare 4,096 normal-range vectors with `Math.hypot` within four double-precision epsilons, and require exact fallback results for square underflow/overflow, signed zero, infinity and NaN.
- Related spectral reconstruction, foam aging, band profiles, simulation cadence and render/contact snapshot tests pass.

These finite samples do not prove bit identity for every possible time or input. Double-precision rounding in compression may propagate to horizontal scaling; existing CPU/GPU and contact tolerances remain the acceptance bounds. Static captures and numerical parity do not establish physical-controller or general hardware performance acceptance.
