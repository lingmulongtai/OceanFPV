# Ocean realism references

Reviewed 2026-10-13. These are technical precedents, not claims of matching their complete renderer.

- [Tessendorf, Simulating Ocean Water (author publications)](https://jtessen.people.clemson.edu/reports/index.html): Gaussian wave spectra, Hermitian time evolution, IFFT height fields and horizontal crest sharpening.
- [Ocean synthesis presentation, Tessendorf et al. 2022](https://jtessen.people.clemson.edu/gilligan/html/Os2022_tessendorf_reinhardt_gao.pdf): combining independent fields to reduce tiling repetition.
- [NVIDIA Triton Ocean SDK](https://developer.nvidia.com/triton-ocean-sdk): FFT sea, Kelvin wakes, foam/spray and wind-driven interaction as a complete visual system.
- [Epic Water Waves documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/simulating-waves-using-the-water-waves-asset): lateral motion sharpens wave crests; adjustable wavelength/amplitude alone does not guarantee natural detail.
- [NVIDIA GPU Gems, Effective Water Simulation from Physical Models](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models): surface derivatives and layered wave detail should remain consistent with geometric wave motion.
- [Epic Single Layer Water shading model](https://dev.epicgames.com/documentation/unreal-engine/single-layer-water-shading-model?application_version=4.27): absorption and scattering depend on the water volume. This informs depth-based coastal colour; OceanFPV does not implement Epic's volume/refraction pass.
- [Poseidon browser ocean](https://github.com/owenyuwono/poseidon): independent wavelength cascades, Jacobian foam, Fresnel/absorption/scatter and matching sky illumination. Its WebGPU implementation is a reference, not copied into this WebGL2 renderer.
- Original OceanLab MIT shaders: `spectrum_compute.comp`, `spectrum_modulate.comp`, `fft_unpack.comp`. The browser implementation uses conventional unshifted row/column transforms instead of the original transposed compute pipeline.

OceanFPV's spectral solver uses a Phillips wind spectrum with independent seeded Gaussian coefficients, three disjoint wavelength bands and noncommensurate 433/97/23.3 m patches. Its normalized CPU IFFT supplies the same displacement data to WebGL textures and collision/buoyancy sampling. This is a real spectral simulation, not a repeating photograph of water. The shading and foam/wakes remain real-time approximations; this is not CFD, path tracing or the Unreal renderer.

The marine follow-up combines unnormalized displacement tangents before deriving surface normals, including the selected sea strength in both horizontal and vertical derivatives. Persistent whitecaps use the same sea strength in each cascade's Jacobian; changing presets or rewinding time clears stale foam. Folded crest normals retain an upward-facing limit, and persistent foam remains a per-cascade approximation.

Coastal depths use a packed 193×193 float texture of the three islands' actual terrain vertices. Explicit triangle interpolation matches the rendered terrain diagonal even without float linear filtering. The depth of the smaller lighthouse rock remains an ellipsoid approximation. This replaces detached circular shoreline rings with depth-dependent shallow water and wash at the visible coast.
