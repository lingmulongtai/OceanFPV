# Ocean realism references

Reviewed 2026-10-12. These are technical precedents, not claims of matching their complete renderer.

- [Tessendorf, Simulating Ocean Water (author publications)](https://jtessen.people.clemson.edu/reports/index.html): Gaussian wave spectra, Hermitian time evolution, IFFT height fields and horizontal crest sharpening.
- [Ocean synthesis presentation, Tessendorf et al. 2022](https://jtessen.people.clemson.edu/gilligan/html/Os2022_tessendorf_reinhardt_gao.pdf): combining independent fields to reduce tiling repetition.
- [NVIDIA Triton Ocean SDK](https://developer.nvidia.com/triton-ocean-sdk): FFT sea, Kelvin wakes, foam/spray and wind-driven interaction as a complete visual system.
- [Epic Water Waves documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/simulating-waves-using-the-water-waves-asset): lateral motion sharpens wave crests; adjustable wavelength/amplitude alone does not guarantee natural detail.
- [Poseidon browser ocean](https://github.com/owenyuwono/poseidon): independent wavelength cascades, Jacobian foam, Fresnel/absorption/scatter and matching sky illumination. Its WebGPU implementation is a reference, not copied into this WebGL2 renderer.
- Original OceanLab MIT shaders: `spectrum_compute.comp`, `spectrum_modulate.comp`, `fft_unpack.comp`. The browser implementation uses conventional unshifted row/column transforms instead of the original transposed compute pipeline.

OceanFPV's spectral solver uses a Phillips wind spectrum with independent seeded Gaussian coefficients, three disjoint wavelength bands and noncommensurate 433/97/23.3 m patches. Its normalized CPU IFFT supplies the same displacement data to WebGL textures and collision/buoyancy sampling. This is a real spectral simulation, not a repeating photograph of water. The shading and foam/wakes remain real-time approximations; this is not CFD, path tracing or the Unreal renderer.
