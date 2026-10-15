# Metre-scale coastal ground detail

The 90 m Rocky Terrain photograph supplies broad island variation but becomes soft during low flight. Procedural islands now also use the existing 4K [Seaside Rock by Dimitrios Savva](https://polyhaven.com/a/seaside_rock), at its published 2 m width. The lighthouse reef and islands share the same three loaded texture objects. No additional asset files or image allocations are introduced.

Three world-space projections retain the existing physical scale on steep slopes. Fine colour modulates rock colour by 20%; fine roughness contributes 65%. Fine normals are rotated from the geometric normal into the broad rock normal before blending with grass. Full grass cover retains the existing 15 m material. Wet-shore shading runs after the completed blend. The layer changes shading; vertices, contacts and placements are untouched.

The optional layer requires all three detail maps. One missing map leaves macro rock and grass active. Stable uniform bindings also preserve restored cached shader variants when maps disappear and return. Normal/roughness/diffuse maps are loaded as one existing coherent group, so partial loads are disposed together.

## Evidence and limits

- The production material helper passes its original 96 GPU cases plus 1,728 detail cases. These cover signed and oblique planes, flat/tilted normals, patterned 2 m maps, colour/normal/roughness outputs, grass blending, wetness, and complete/incomplete/missing/restored states on the same material. Independent expected normals use quaternion rotation. Maximum error: native RTX 4050 0.00006320; Vulkan SwiftShader 0.00004846.
- Actual scene, single-map failure and GPU projection checks pass on the native GPU. The linked ground program uses 11 active samplers, within the checked device's 16-unit limit. Each shared detail image is requested once. The full 113 unit tests and strict production build pass.
- Four fixed-camera day/evening comparisons and four close material-toggle captures use the actual main renderer, RTX 4050, ULTRA 1920 x 1280 buffer, and sea/vessel time 120. All capture runs report no browser errors. Close views show fine grain instead of the previous soft surface. Wide-view changes are modest.

The broad photographed pattern still repeats. This layer does not solve that remaining visual issue, add rock silhouette geometry, or establish physical-controller acceptance, sustained frame rate, or parity on every GPU/browser.
