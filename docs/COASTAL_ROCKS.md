# Coastal rock geometry

The island shores use [Rock 07 by Jenelle van Heerden](https://polyhaven.com/a/rock_07), distributed under [Poly Haven's CC0 asset licence](https://polyhaven.com/license). The unmodified 4K glTF, buffer and three textures are self-hosted. All five files match the official download sizes/MD5 hashes; `public/models/rock_07/manifest.json` also records SHA-256 hashes. They add 20,385,386 download bytes. No asset API is called during play.

The selected export contains 7,914 vertices and 14,844 triangles, including a closed underside. The runtime keeps its index, UV seams and saved normals; it applies only rigid transforms and uniform scale. A CPU audit found no boundary/non-manifold edges after position-only welding for inspection. Render geometry is not welded.

The source vertex colours darken the diffuse texture a second time. Same-camera native HDR comparisons were inspected with and without that multiplication; the runtime uses the diffuse texture with white material colour and disabled vertex colours. The supplied normal and green-channel roughness maps remain in use. The wet-coast shader composes with that material, using fragment world height after the instance transform. The separate terrain texture loader does not overwrite the rock's maps.

## Placement and contacts

Each island has 90 deterministic sites on coastal ground from -2 to 14 m above mean sea level and below 40 degrees of slope. Crowded sites are rejected. Boulders have approximately 3.5–8.9 m long axes with the source proportions retained. They follow the sampled ground normal, settle on the highest bottom support and embed 20% of their source height. Ground sampling uses the rendered terrain triangles. Earlier placement directly on the old primitive sites was rejected after renders showed stones standing upright on steep cliffs.

One shared geometry/material is instanced in 32 m shoreline cells (159 batches for the current 270 sites). The immutable matrices and computed bounds let Three.js independently cull each cell for the main camera, the obliquely clipped ocean reflection and the light shadow camera. No rock geometry, texture resolution, placement or collision is removed; batch/group transforms stay at identity. A shared indirect BVH retains the original index order. Contacts use the inverse instance transform, a 0.25 m world-space surface margin and closed-mesh interior checks. The nearest triangle must explicitly lie inside the margin: a BVH leaf admitted by bounds pruning may contain a farther triangle.

The model and its textures must all load before the new render/contact set replaces the primitive fallback. Loading has a 45 s deadline. Missing textures or model data retain the old visible rocks and their contacts; tree and lighthouse resources remain available independently.

## Verification and limits

- All 47 unit cases and the strict production build passed. The four rock cases check retained UV/index/normal data, actual model surface/interior/nearby air contacts, the false-contact regression, all 270 placements on rendered terrain, unchanged Float32 instance matrices, conservative batch bounds and camera visibility from above and below.
- Before spatial batching, native RTX 4050 Direct3D11 scene and missing-texture fallback checks passed (2/2, 35.9 s). The scene case originally verified the actual model and three island counts; its current assertion checks all 270 registered/rendered instances independently of batching; the fallback case verifies visible primitive batches and all 270 old contacts.
- Before spatial batching, the complete 10-case native RTX 4050 suite passed in 2.9 minutes, including keyboard flight, full race, virtual Xbox/radio inputs, frozen quality switches and recovery.
- Same-camera/time ULTRA comparisons cover shore, close rock and cliff views in all three light presets: 18 actual 1920×1280 captures at a 960×640 viewport, with no page/console errors. All nine new views were inspected.

- Native RTX 4050 ULTRA batch comparisons cover shore, close rock, cliff and menu-direction cameras in all three light presets (24 actual 1920×1280 captures). All 12 before/after pairs have identical RGB pixels and no page/console errors. At the 65-degree menu-direction golden camera, submitted triangles fell from 26,717,742 to 21,314,526 while draw calls rose from 197 to 478. This is a draw-budget measurement, not an FPS claim.

This still repeats one rock shape. Terrain texture scale, material variety, boulder/ground contact shading and sustained performance on other GPUs need further visual work. The captures are visual checks, not a frame-rate benchmark or proof of Unreal-level realism. Physical controllers and other browser/device acceptance are separate from this change.
