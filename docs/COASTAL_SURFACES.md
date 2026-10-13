# Coastal rock wetness

Shoreline terrain, instanced boulders and the lighthouse rock previously retained the same dry reflection parameters at every height. They now share a smooth wetness band based on each fragment's actual world height. Instanced vertices apply instanceMatrix before modelMatrix. Colour and roughness changes run after the existing photographed rock/ground-cover blends, including the missing-photo fallback.

The authored band is saturated below 0.15 m above mean sea level, fading to zero at 1.5 times the selected sea scale with a continuous 0.8–1.0 world-position variation. Fully wet diffuse colour uses factor 0.62 and roughness factor 0.45. Geometry, collision contacts, photographed normals and dry upland cover stay the same; the effect adds no texture sampler or draw call.

[Sébastien Lagarde's wet-surface analysis](https://seblagarde.wordpress.com/2013/03/19/water-drop-3a-physically-based-wet-surfaces/) and [game approximations](https://seblagarde.wordpress.com/2013/04/14/water-drop-3b-physically-based-wet-surfaces/) informed the material adjustment. This is an authored porous-rock approximation, not measured wet/dry data for the asset, a layered water-film BRDF, tidal simulation or wetting/drying history.

## Verification

- 43/43 unit tests and strict TypeScript/Vite production build passed.
- 12 controlled RTX 4050 Direct3D11 ULTRA draws compare dry/wet terrain and instanced-rock views under DAY/GOLDEN/BLUE. Each pair retains camera, geometry, drawing counts and the 1920×1280 buffer for a 960×640 viewport. Wave/vessel updates are held at 120 s; application/sky time remains paused. The wash uniform alone is disabled for the dry control. No page or console errors were recorded, and the final wet views and daylight controls were inspected.
- Four additional BALANCED native draws deliberately block photo JPEGs. The 20 intercepted URLs and 31 expected network/GLTF warnings match; unexpected page/shader errors are zero. The fallback retains stable geometry/draw counts across each comparison pair.
- All 10 native Direct3D11 browser cases passed with fixed source in 3.6 minutes, including flight, complete race, virtual controllers, settings/mobile and recovery.
- All 10 default software-browser cases also passed with fixed source on Vulkan SwiftShader in 14.5 minutes; existing assertions and quality were retained.

The unchanged coarse terrain and boulder silhouettes still limit realism. Physical controllers, other GPUs/browsers, sustained flight performance and publication remain unverified for this revision.
