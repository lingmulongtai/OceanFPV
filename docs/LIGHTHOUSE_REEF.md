# Lighthouse reef contacts

The lighthouse reef previously used a solid elliptical column below 11 m for contacts, although its rendered rock slopes fall below that height. At world position (175, −135), the visible surface is 5.540271905 m high; a drone at 10 m wrongly collided with the reef.

The render mesh and contact BVH now share the original 180 triangles with the nonuniform scale baked into their positions. A 0.25 m nearest-surface margin uses world metres; the closed interior uses outward face normals. Empty space above the slopes is flyable. The original rock material, footprint and visible shape remain; no new assets or dependencies were introduced.

Validation covers more than 200 independent raycasts against both the previous rendered mesh and the shared geometry (height difference below 0.01 mm), every face's inward contact and outward 0.20/0.30 m margin, the previously blocked air, and external/below-rock space. All 68 unit tests and the strict build pass. The actual game scene's reef ray/contact check passes locally on RTX 4050 Direct3D11 (14.9 s) and Vulkan SwiftShader (49.4 s), retaining the existing headland and bathymetry assertions.

The water shader still uses an analytical ellipsoid for this reef's colour/foam depth. That approximation is separate from these exact rock contacts, and the reef remains excluded from the three islands' coastal wave envelope. Lighthouse tower contacts also retain their earlier conservative cylinder. Full CI, public deployment, physical controllers and sustained rendering performance remain separate checks.
