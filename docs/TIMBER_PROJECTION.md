# Wood grain on vertical vessel surfaces

The cruise liner and coastal yacht previously projected every timber face onto the horizontal X/Z plane. This collapsed the image to a line on vertical furniture, table edges and canopy framing. Both builders now use the existing triangle projection at the same 1.8 m period; horizontal deck charts retain their previous coordinates.

Before:

![Collapsed stripes on table edges and sofa framing](images/timber-projection-before.png)

After:

![Visible wood grain on the same table and sofa surfaces](images/timber-projection-after.png)

These unprocessed native ULTRA frames use identical daylight, time 0, ship transform and camera. The furniture detail and complete shaded bay were also compared under golden lighting, for eight matched captures in total.

An audit of the actual merged timber meshes found 39,092 collapsed triangles out of 60,616 on the cruise liner, and 56 out of 3,104 on the yacht. Neither model has collapsed timber charts after the correction. Two tests check a geometric lower bound on projected area rather than duplicating the projection's axis choices, and verify unchanged horizontal coordinates.

All rendered positions, normals, ambient-occlusion UV1 coordinates and contact boxes retain the same combined digest. All 393,216 cabin-atlas bytes remain identical. The generated input fingerprint changes because the timber blockers are expanded from indexed to non-indexed geometry; the visibility data itself does not change.

Verification: 168 unit tests, the strict TypeScript/Vite build, the byte-identical cabin-atlas check and minified native ULTRA at 1,920 × 1,280 pass, with 36 photographic asset responses and no unexpected errors. The projection keeps the existing texture and colour. Material ageing, the strong red hue and chart seams on curved furniture are separate remaining limitations; this correction does not claim continuous cylindrical wood grain.

The integrated build also includes the pool's per-camera backface exclusion, with nested visibility restoration, to avoid invisible transmission passes. This leaves the timber geometry and photographic projection unchanged. The pool-only build and matched rendering measurements are recorded in [CRUISE_POOLS.md](CRUISE_POOLS.md).

Integrated production bundle: `index-CQwA0i0d.js`, SHA-256 `d9b8d24724d7b1459ab25b1762d24f259dd2e42d201d8f52eefed1e2e380c3eb`. Public deployment and physical-controller acceptance remain separate checks.
