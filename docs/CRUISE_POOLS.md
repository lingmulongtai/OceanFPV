# Raised pools with real depth

The old cyan surface sat 0.10 m above its surrounding white box. Both pools now have closed walls, a tiled bottom 1.10 m below the water, and coping 0.18 m above it. The raised tanks sit on the existing timber deck without cutting through the cabins underneath. Six supported treads and the coping landing provide seven equal 0.20 m rises at each short end. Curved handrails and three ladder rungs lead into each basin.

Before:

![Old flat pool surface above its rim](images/cruise-pools-before.png)

After:

![Recessed water, visible tiled bottom and curved ladder](images/cruise-pools-after.png)

![Both raised basins, stairs and surrounding seating](images/cruise-pools-deck.png)

These are unprocessed native ULTRA captures. The before/after rim views use identical time 0, ship transform, camera and daylight; both rim and deck views were also compared under golden lighting. The deck image shows the new layout under daylight.

Water uses Three.js [physical transmission](https://threejs.org/docs/pages/MeshPhysicalMaterial.html), IOR 1.333, depth attenuation and two moving normal samples from a filtered, periodic ripple texture. The opaque tiles have metre-scaled 15 cm grout. Water remains reflective while transmitting the bottom and does not cast an opaque shadow. This is a screen-space optical approximation with environment reflections, not a fluid, caustic or dedicated planar-reflection simulation.

Contacts follow the actual walls, supported steps, ladder segments and water volume with the existing 0.20 m drone clearance. Finite sweeps catch narrow surfaces without extending beyond the flight path. Space above the basins and the surrounding aisles remains open.

Verification: 165 unit tests, the strict TypeScript/Vite build and the byte-identical cabin atlas check pass. The new browser case passes on native Direct3D11 and software SwiftShader, raycasting both real water/bottom pairs and checking material settings, contacts, fast stair crossings and clear air/aisles. The browser suite contains 34 cases; the complete suite was not rerun locally for this addition. Minified native acceptance passes keyboard climb, pause/resume, reset, pointer lock and mouse input; ULTRA passes at 1,920 × 1,280 with 36 photographic asset responses and no unexpected errors. Normal keyboard flight advances the retained ripple uniform with simulation time, and the normal pause handler freezes both without assigning diagnostic time or phase.

Production: `index-DSFpb1Vx.js`, SHA-256 `d6ad0cbbc5c22add54234847d05ede25196285f6fdaa9a54e2ef8069937dae45`. Public deployment, sustained hardware performance and physical Xbox/FPV-radio acceptance remain separate checks.
