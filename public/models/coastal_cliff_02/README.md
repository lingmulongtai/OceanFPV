# Coastal Cliff 02 source asset

[Coastal Cliff 02 by Rob Tuytel](https://polyhaven.com/a/coastal_cliff_02), distributed under [Poly Haven's CC0 licence](https://polyhaven.com/license). The unchanged 4K glTF, binary and three JPEG textures total 59,074,649 bytes. `manifest.json` records official URL/size/MD5 and local SHA-256; all files match.

The delivered glTF contains one identity-transform node named `coastal_cliff_02_LOD0`, one mesh/primitive and 943,284 triangles (482,925 vertices, 2,829,852 Uint32 indices). Its Y-up bounds are approximately 40.928 m wide, 10.053 m high and 8.648 m deep. The 2K glTF references the same geometry binary; lowering texture resolution does not select a lighter mesh.

The source is an open cliff scan. Exact-position welding for inspection produces 472,771 vertices, 2,256 boundary edges in one loop, and no non-manifold/shared-edge winding errors. It must not use a closed-solid exit-ray classification without a supported closure. The unchanged source geometry and captured UVs/normals should be retained in render/contact integration.

Runtime placement is (-390,-3,-450) metres, with a 90 degree yaw. The original surface is retained; a rigidly transformed copy supplies BVH contacts. The open scan uses swept surface distance and finite double-sided ray intersection, rather than a solid-interior classification. The adjacent island ground and its placements are changed only after successful model loading. See [integration and measured limits](../../../docs/COASTAL_CLIFF.md).
