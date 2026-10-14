# Lighthouse reef contacts

The lighthouse reef previously used a solid elliptical column below 11 m for contacts, although its rendered rock slopes fall below that height. At world position (175, −135), the visible surface is 5.540271905 m high; a drone at 10 m wrongly collided with the reef.

The render mesh and contact BVH now share the original 180 triangles with the nonuniform scale baked into their positions. A 0.25 m nearest-surface margin uses world metres; the closed interior uses outward face normals. Empty space above the slopes is flyable. The original rock material, footprint and visible shape remain; no new assets or dependencies were introduced.

Validation covers more than 200 independent raycasts against both the previous rendered mesh and the shared geometry (height difference below 0.01 mm), every face's inward contact and outward 0.20/0.30 m margin, the previously blocked air, and external/below-rock space. All 68 unit tests and the strict build pass. The actual game scene's reef ray/contact check passes locally on RTX 4050 Direct3D11 (14.9 s) and Vulkan SwiftShader (49.4 s), retaining the existing headland and bathymetry assertions.

Lighthouse tower contacts retain their earlier conservative cylinder. Physical controllers and sustained rendering performance remain separate checks.

## Reef-derived shallow water

The same reef instance now supplies vertical BVH rays for water depth. Its upper heights are resampled into the previously unused alpha channel of the 193×193 bathymetry texture over 76.8×57.6 m, preserving the geometry's 3:4 axis ratio. Samples outside the rock use an authored submerged skirt: a BVH closest point at −1 m supplies horizontal distance, with height `max(-60,-1-4*distance)`. This avoids interpolating a −60 m outside sentinel directly into shoreline cells. The envelope reaches offshore identity before all grid edges. No extra sampler, asset or dependency is required.

Colour, wash, geometric wave attenuation, normals and CPU water contacts use this shared field. The three islands' RGB terrain vertices stay unchanged. The old analytical reef colour/foam ellipsoid is removed. Exact solid-rock contacts still use the original 180 triangles; the new alpha heightfield is a separate approximation. In an independent ray comparison, all-mesh cells have mean 1.77 mm/max 114 mm height differences. Mixed outline cells have mean 337 mm/max 1.851 m; some points can change land/water classification within these cells. At the known dry point (140.17,−160.89), the mesh is 0.849381 m and the grid 0.297781 m. This is not exact mesh bathymetry or a surveyed seabed.

Validation: all 86 unit tests and strict build pass. Native D3D11 and SwiftShader probes pass 4116 coastal and 896 mip samples each. Maximum native/SwiftShader contact differences are 2.954/1.072 mm; normal component differences are 0.001390/0.000407. Four matching ULTRA 1920×1280 before/after poses cover two reef views in day/golden light at 120 s; camera, orientation, wave/vessel time and buffer match, with no page/console errors. These static captures do not establish sustained FPS or acceptance of every shoreline cell.
