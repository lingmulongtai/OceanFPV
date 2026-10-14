# Depth-responsive coastal wave heights

The three island shores previously received the same geometric wave height as offshore water. Their uploaded terrain triangles now modulate vertical displacement: an artistic shelf envelope reaches 1.3 at 2–3 m depth, fades towards zero at the waterline and returns to the offshore identity by 8 m. This restores identity before the terrain grids' −9 m boundaries, avoiding square edges against the −60 m outside default. The subsequent lighthouse follow-up also connects its resampled reef/skirt depth field to this envelope; its approximation limits are recorded in LIGHTHOUSE_REEF.md.

[GPU Gems, Effective Water Simulation from Physical Models](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models) provides a game-rendering precedent for depth-dependent geometric wave attenuation. The chosen envelope is a bounded visual approximation, not an energy-flux shoaling solution, wavelength shortening, refraction or overturning breaker simulation. [Jeschke and Wojtan's dispersive shallow-water work](https://research.nvidia.com/labs/prl/shallow-water-simulation/) demonstrates a separate spatial solver for deeper interactions; that model is not implemented here.

## Matching geometry, lighting and contacts

The envelope samples undeformed wave-source coordinates. GPU geometry and CPU contact heights use the same Float32 bathymetry triangles and diagonal. Horizontal displacement and its existing compression limit remain unchanged. CPU inverse displacement uses six iterations when a coastal envelope is present: steep coastal gradients amplified the previous three-iteration error.

Vertical tangents apply the product rule, `d(Ah) = A dh + h dA`, using triangle-derived world gradients. Screen-filtered normal bands also filter their height contribution. Unresolved slope variance includes both the amplified spectral slopes and the height-energy contribution of the coastal gradient. This remains an isotropic ensemble approximation: it omits directional covariance, inverse-Jacobian statistics and screen filtering of the terrain gradient itself. Crest lighting reads the modified height. Persistent FFT whitecaps and the existing shoreline wash remain approximate deep-water/shading effects.

## Verification on 2026-10-14

- 60 unit tests and the strict TypeScript/Vite build pass. Independent differences check envelope and terrain gradients; tests include dry/deep endpoints, both island profiles and grid-edge identity.
- 4,194 natural shoreline world points across three sea strengths and two times reconstruct their source heights within 4 mm. Measured maximum improves from 53.960 mm with three inverse iterations to 3.120 mm with six. This is sampled continuous-field accuracy, not exact finite water-mesh triangle contacts or a global error bound.
- All 14 native RTX 4050 browser cases pass, retaining vessels/deck motion, actual render stalls, keyboard flight, ordered race, virtual Xbox/radio, paused settings and recovery checks.
- The production shader header is read from `Ocean.material.vertexShader` and rendered to a Float32 target. Each GPU backend passes 3,108 comparisons across real and controlled fields, all sea strengths, dry/shallow/deep points, three normal-resolution settings and both hardware-linear/manual interpolation paths. Controlled constant-height fields allow an independent central-difference normal check.

| Backend | Maximum height difference | Normal component difference | Variance difference | GPU forward point → CPU contact height |
| --- | --- | --- | --- | --- |
| RTX 4050 / D3D11 | 0.002495 m | 0.000592 | 0.0000174 | 0.002954 m |
| Vulkan SwiftShader | 0.000140 m | 0.000114 | 0.0000237 | 0.001072 m |

- Sixteen ULTRA captures compare the envelope enabled/disabled at an exposed cape and the bay waterline over four matching times, 120–123.6 seconds. Camera, buffer and world time are held equal; captures report no page/console errors. Selected pairs and time steps were visually inspected. The disabled variant changes the shader envelope only; it is not a full historical checkout comparison. This sequence does not establish sustained FPS or temporal aliasing acceptance during free flight.

Physical controllers, other GPUs, long play sessions, genuine coastal refraction and breaking/advection dynamics remain further acceptance and implementation work.

The lighthouse follow-up checks 5052 natural source-to-world contact points, including 858 at the reef. Six inverse iterations retain maximum 3.120 mm error overall and 0.864 mm at the sampled reef points. These compare the shared water field, not exact rock-mesh heights. The GPU probe now includes all four coast descriptors: 4116 displacement/normal/variance comparisons when native float filtering is available, plus 896 explicit mip samples. Normal fields use explicit bilinear/trilinear interpolation wherever the envelope changes, preventing native texture interpolation errors from being amplified by steep gradients. Controlled-height finite differences use a 10 µm step; the earlier 1 mm step crossed the reef's clamped waterline and gave an inaccurate derivative.

Raw unresolved variance can exceed 100 at steep coasts. The probe checks normalized raw error within 1e-4 and separately checks the production GGX contribution capped at 0.2 within 1e-4. Maximum native normalized/capped errors are 5.06e-5/1.74e-5; SwiftShader gives 5.98e-5/1.10e-5. The renderer's model and roughness cap are unchanged. Steep coastal wave faces receive an additional bounded whitewater term using source-coordinate water depth; this is a visual breaker approximation, not foam transport or fluid overturning.
