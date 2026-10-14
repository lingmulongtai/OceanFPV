# Passenger-vessel tenders

The passenger ship's eighteen lifeboats previously used scaled spheres and rounded boxes. A fictional 10.6×3.6 m tender now has a closed station hull with a rising forefoot, a raked canopy, sixteen framed panes, a perimeter fender, roof hatches, canopy protection rails and two release-hook eyes. The canopy coaming meets the hull deck. The davit uprights and diagonal braces meet footings on the actual balcony deck; each hoisting wire ends at its lifting eye.

[PALFINGER's passenger tender/lifeboat overview](https://app-support.palfinger.com/worldwide/en/our-products/boats-and-davits/lifeboats-rescue-and-tender-boats/partially-enclosed-lifeboats-and-tender-boats.html) and [its 2026 cruise catalogue](https://app-support.palfinger.com/content/dam/palfinger/global/marine/segments/passengers-cruise/palfinger_marine_cruise_brochure_04_2026_web.pdf), PDF page 7, supplied visual references for the window bands, protective fittings and vessel-mounted davits. Geometry is hand-authored with fictional dimensions, rather than a surveyed product model. No catalogue images or brand marks are included in the game.

## Rendering and flight contacts

One shared template supplies the eighteen placements at the existing 16 m spacing. Centres move 0.4 m outboard to clear the balcony rails. Parts are combined into the passenger ship's existing material buckets. The orange finish and other PBR materials are reused.

Contact queries use BVHs of the same closed hull, canopy and coaming that supply rendering. Small axis-aligned fixtures use their actual box bounds; fenders, window gaskets, rails and hoist segments use padded line distances. The lifting eyes use a conservative small capsule. This removes the old whole-boat rectangle's empty-air collision at ship-local `[19.6,10.6,-72.8]`. Glazing remains opaque reflective material with no tender interior. Davit deployment, suspended-boat dynamics and release operation are not simulated.

## Verification on 2026-10-14

- 66 unit tests and the strict TypeScript/Vite build pass. Independent raycasts check six approach directions, closed edges and outward volumes, forefoot/end-cap integrity, hull/coaming and roof supports, window directions, all eighteen mounting footprints and free bow airspace.
- The final native RTX 4050 browser suite passes all fifteen cases. It retains moving vessels/deck motion, keyboard, virtual Xbox/radio, real rendering-stall handling, ordered race crossings, paused settings, terrain/nearshore GPU probes and context recovery.
- The browser tender case raycasts actual merged ship surfaces at all eighteen positions and checks world contacts. It also checks seventy-two upright/brace starts against the rendered balcony deck, the lifting eye, the former phantom collision point and nearby open air. The basic tender/support revision also passes this case through Vulkan SwiftShader; the final forefoot revision was checked with native rendering and CPU geometry tests. Full remote CI remains a separate publication gate.
- Eight matching ULTRA before/after pairs use four camera poses, two lights, a 1920×1280 buffer and wave/vessel time 120. A further eight renders inspect the revised forefoot. Selected left/right/front and whole-ship views were inspected without page/console errors. This is a still-frame comparison, not sustained FPS, physical-controller or long-play acceptance.

The lighthouse reef still has a separate coarse collision/depth approximation. A real game-world query found a collision at `[175,10,-135]` even though a raycast of the visible rock gives height 5.5403 m there. That is a separate follow-up; this change repairs the tender geometry and contacts.
