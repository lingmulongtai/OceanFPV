# Fresh and residual whitecaps

The fresh/aged distinction and wind-aligned breakup are adapted from [web-ocean](https://github.com/Noniv/web-ocean/tree/a07c7fd522ef0a897601c114f927a49d93d95520), under the [retained MIT notice](../public/licenses/web-ocean.txt).

Each existing cascade now carries fresh density in its previously unused `tangentX.w`. Geometric derivatives remain in XYZ. Total density retains its existing `displacement.w` and 0.85/s decay; fresh density decays at 1.6/s. Both receive the same bounded breaking injection and reset together on preset changes or time reversal. Fresh density therefore never exceeds total density, including after bilinear sampling. The existing maximum 0.1s history step is retained.

The shader uses `max(fresh)/max(total)` as the fresh fraction, without adding the two densities. Fresh crests retain the previous porous coverage. Older foam receives breakup aligned to the 0.7-radian local wind, with separate along/across scales. Final coverage stays in [0,1], and HIGH/ULTRA retain the existing 16-point integration of the complete nonlinear coverage. There are no new textures or sampler bindings; the fragment shader performs three additional base-level tangent reads per point sample.

This preserves per-cascade breaking and persistence. It does **not** implement combined world-space Jacobian histories, fluid advection or the reference's baked bubble texture. The long swell travels independently of the local wind, while aged foam breakup follows the local wind.

## Verification

- Controlled injection/analytic decay, repeated paused time, preset changes and rewinds pass CPU tests. Existing cross-band reset checks now compare fresh tangent alpha as well as residual density.
- A comparison against the pre-change `e7b5acb` implementation checked 4,866,048 Float32 values over nine time/profile updates: displacement including total foam, geometric tangent XYZ, tangentZ, slope/height statistics and sampled contact heights remained bit-identical. Only fresh alpha is added.
- The production footprint GPU probe now advances through one second of real wave history, including 225 aged texels. Its independent CPU oracle explicitly receives the render time rather than the possibly older 30Hz spectral timestamp. Both native Direct3D11 and SwiftShader passed normal and forced manual-interpolation paths, with 576/288 cases and unchanged tolerances. Native quadrature error was below `5.2e-8`; filtered RMSE was below `0.0045` against a dense reference, versus approximately `0.102` without footprint integration.
- Eighteen raw native ULTRA DAY/GOLDEN captures compared the previous shader, the new breakup and foam disabled at identical simulation/camera/vessel state. The visible effect in those views was small. The dominant pale wave network remained with foam disabled, identifying reflection as a separate appearance issue; this foam change is not evidence that the ocean's overall realism is finished.
