# Cliff detail across viewing distances

The northwestern island combines a captured 20.002069 × 20.001801 m rock face with the existing 2 m Seaside Rock grain. Small grain alone averages towards a uniform colour as its mip level increases. The larger capture retains fractures at ordinary flying distances without enlarging the small stones or changing the measured island geometry.

The three 4K Marble Cliff 05 maps are by Amal Kumar, [Poly Haven](https://polyhaven.com/a/marble_cliff_05), CC0. Original bytes, MD5/SHA-256, author, source URLs and measured dimensions are in [the texture manifest](../public/textures/manifest.json). The JPEGs add 28,461,096 bytes; a verified DAY startup requests 39 distinct coastal/HDR assets totalling 234,611,319 bytes, excluding code/audio. The game self-hosts these files.

## Material behaviour

Colour, normals and roughness use the same world-space projections and deterministic phase offsets. Explicit gradients retain the original footprint when phases crossfade. The large capture is normalized by its mean colour, then assigned the fine coastal rock's mean palette; fine colour contributes 20% of its relative variation. This avoids the pale slope-dependent patches rejected in the comparison. Rock roughness combines 80% large capture and 20% fine capture, followed by the existing grass and wet-shore treatment.

Large normals retain their captured strength; the existing fine normal strength remains 0.65. Both are expressed in the same view frame. Each normal is first projected onto the common geometric tangent plane, then divided by its clamped normal component. The sum therefore remains in the front hemisphere even when two near-tangent normals oppose each other. Clamping before tangent projection could reverse the resulting normal and is covered by an explicit grazing regression.

This changes the northwestern material only. It adds no vertices, displacement, collision surfaces or water samplers. Actual production shaders use 11/16 ground samplers and 16/16 water samplers. The other islands retain their existing fine material and suppressed 90 m slab pattern on steep slopes.

All three large maps are optional as one group. Partial delivery discards that group and retains complete fine rock/grass rendering. Losing a fine map also disables the large layer, preserving the existing coarse/grass fallback. Program variants and optional uniform bindings cover missing and restored assets.

## Verification and limits

RTX4050/D3D11 and SwiftShader pass 408 additional analytical GPU cases covering colour, roughness, metric normals, signed phase coordinates, wet/grass blending, grazing normals and cached fallback/restoration. Maximum differences are 0.001026 and 0.000322 respectively against a 0.002 bound. The original 96 projection, 2,592 detail and 20 phase/mip cases also pass. Replacing only the corrected slope formula in a browser response makes the grazing case fail with a reversed normal and error 1.9999.

Native before/after captures keep ULTRA/DAY, camera, sun and wave time fixed. The implemented material is also captured without shader or material overrides. The minified build passes real keyboard climb, light switching, pause/resume, reset and actual pointer-lock/mouse input at a 1920 × 1280 drawing buffer, with complete asset delivery and no browser errors.

The material is authored scenery from a separate photographed location. It does not reproduce Trenyken's geology. The height field still lacks captured overhang geometry; normal detail does not add physical crevices. Static captures and a working control sequence do not establish sustained frame rate or physical Xbox/USB-radio acceptance.
