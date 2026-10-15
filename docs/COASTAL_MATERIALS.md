# Coastal material mapping

Horizontal-only terrain UVs stretch photographs on steep slopes: an 80-degree plane stretches by about 5.76 times and a vertical plane collapses that coordinate field. Ground materials now sample the three world-space XY, XZ and ZY planes, weighted by the fourth power of the absolute unperturbed surface normal. The weights sum to one and the existing terrain-cover blend stays in use.

The physical tile periods match the published capture widths: [Rocky Terrain](https://polyhaven.com/a/rocky_terrain) is 90 m, and [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock) is 15 m. Their existing self-hosted diffuse, normal and roughness photographs are reused. World-space anchoring also changes their phase relative to the former island-local horizontal UVs.

Diffuse colour and green-channel roughness use the same three projections. Each normal-map projection builds its own screen-derivative tangent frame, transforms the sampled tangent-space normal, and then blends in view space. The wet-shore material runs after the rock/cover blend. If any required photograph is unavailable, the existing coherent standard-material fallback is retained.

This changes material sampling only. Terrain vertices, cover weights, placement, collisions, texture resolution, sampler count and draw calls are unchanged. Sampling both materials from three planes adds texture fetches; it is a correction for surface appearance, not a performance claim.

## Verification and limits

- The production material helper is exercised by 96 Float32 GPU readback cases: six signed axes, two oblique normals, flat and tilted normal maps, three cover weights, and both colour and normal outputs. Expected colour periods and normals are calculated from independent planar coordinate gradients. The original native RTX 4050 maximum error was 0.00004847; the fixture also passed under Vulkan SwiftShader.
- Before integrating spatial rock culling, 46 units, the strict build and native scene/fallback/GPU checks passed. Eighteen actual ULTRA captures cover shore, close rock and cliff views in three light presets; all nine new views were inspected with no page/console errors.
- After integrating exact-source spatial rock culling, 47 units, the strict build and the native scene/fallback/GPU checks passed (3/3, 36.4 s). The complete native suite passed 11/11 in 2.7 minutes. Eighteen fresh fixed-camera/time ULTRA comparisons had no page/console errors and unchanged geometry/draw counts; new day cliff/close-rock and golden shore views were inspected. Aggregate GitHub CI and public deployment remain pending.

The source photographs still repeat. This does not add terrain displacement, captured island geometry, new contact shadowing or physical breaking waves. Acceptance on other GPUs, browsers and physical controllers remains separate.

## Metre-scale rock detail

The current island material also includes an optional 2 m Seaside Rock layer, shared with the lighthouse reef. It adds three sampler uniforms while retaining the 90 m macro and 15 m grass periods. See [composition, fallback, GPU checks and remaining limits](COASTAL_GROUND_DETAIL.md).
