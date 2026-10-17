# Cruise deck planking and mooring fittings

The foredeck timber follows the vessel's length. After the existing metre-scale
projection, only its UV0 is rotated `(u,v) -> (v,-u)`. The colour, normal and
roughness maps follow the same rotation. Room occlusion uses UV1 separately.

Four mooring fittings stand at vessel-local `x = ±5 m`, `z = -113 / 116 m`.
Their original base and post dimensions are retained:

| Part | Dimensions |
| --- | --- |
| Base | 1.9 × 0.12 × 1.2 m |
| Post | 0.4 m radius, 0.9 m height, 20 sides, closed flat caps |

The bow base previously floated about 2.9–6.1 cm above the walking triangles.
The aft base was entirely below its timber surface. The corrected bow support
comes from a ray intersection with the actual Float32 foredeck triangles; its
normal tilts the whole fitting by about 1.52°. The aft support is the timber top
at 9.28 m. Each base underside meets that support, and its post starts at the
base's upper face, using one shared pose.

Contacts retain an independent merged copy of those closed meshes in a BVH.
The 0.2 m flight padding follows the polygon faces and flat caps. Finite paths
test triangle crossings and closest distance, so a fast drone cannot pass
through a post between frames. The explicit triangle-crossing check is needed:
the installed segment-distance helper checks edges and endpoints and can miss
a crossing through a face interior. World queries transform both path endpoints
into the moving vessel's coordinates.

## Verification

- Four unit tests cover rendered support corners, the base/post joint, polygon
  clearance, flat and diagonal cap clearance, finite sweeps in both directions,
  and independence from render batching/disposal.
- The browser integration checks all four fittings at 0, 39 and 900 seconds of
  vessel motion. It checks real `World.collision` results for contact, clear air,
  clear endpoints, and crossings in both directions.
- Native RTX4050/D3D11 images use DAY/SWELL/ULTRA at 1920×1280. Bow views preserve
  the accepted timber UVs, complete other timber attributes, occlusion, wave
  fields, camera and texture bindings; an aft close view checks the new seating.
- `npm run check:cabin` confirms the existing baked room-occlusion bytes and
  input signature. Run `npm test`, `npm run build`, and `npm run test:browser`
  for the wider regression checks.

The still-image comparisons use a paused scene and controlled camera poses.
Physical Xbox controllers and USB FPV transmitters remain external acceptance.
