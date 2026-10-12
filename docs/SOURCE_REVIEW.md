# OceanLab review and reuse

Reviewed 2026-10-12 before the browser implementation. The supplied ZIP is preserved locally; its complete contents are extracted to `OceanLab/` and tracked as the original reference. Existing preview images and validation claims describe the **Godot** build, not OceanFPV browser validation.

The original is a procedural 92 m destroyer, not a submarine or a third-party photogrammetry model. Its 33 hull sections, `4.4 * sin(πu)^0.42` half-width, bow sheer, bridge, twin funnels, radar, railing and rigging inform `src/world.ts`. The browser model adds separate window panes, beveled structures, material detail, deck fittings, ladders and a helipad. The original self-generated ocean ambience is reused in `public/ocean_ambience.wav`.

`GPUOcean.start()` rejects Compatibility rendering. The five-cascade FFT uses Godot RenderingDevice/Vulkan compute, storage buffers and asynchronous readback. These operations do not survive a Godot WebGL2 export. Therefore this project uses Three.js/WebGL2 rather than claiming the original FFT works in a browser.

`CPUSea.rebuild()` provides the analytic wave directions, wavelengths and deep-water dispersion `ω = √(9.81k)`. `src/sea.ts` and the GPU shader share the same parameters and time for collision sampling. The browser sea is **12 analytic waves**, planar scene reflection, micro-normal detail, Fresnel F0 0.02, localized foam and GGX sun glints. It is not FFT, CFD or a validated real-world training simulator. Radial mesh spacing is inspired by `OceanMesh`.

Water optics are adapted from `ocean.gdshader`: absorption/backscatter-inspired blue-green body color, Fresnel, roughness and atmospheric distance haze. Sky uses Three.js's atmospheric Sky with procedural clouds; the reflection render sees the same sky. Original physical buoyancy and GPU particle spray are not executed by the browser port. Ship bobbing samples browser waves; collision uses conservative gameplay volumes.

All original OceanLab additions and the ambience are MIT. `OceanLab/LICENSE` is retained. The original spectral code includes Ethan Truong's GodotOceanWaves MIT license at `OceanLab/third_party/GodotOceanWaves-LICENSE`; no spectral source is shipped in the browser bundle. See `THIRD_PARTY.md` for runtime attribution.

Technical references: [Godot web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [Three.js Water](https://threejs.org/docs/pages/Water.html), [Three.js Sky](https://threejs.org/docs/pages/Sky.html), [MDN Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API).
