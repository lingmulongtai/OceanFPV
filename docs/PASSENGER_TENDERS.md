# Passenger-vessel tenders

The passenger ship's eighteen lifeboats previously used scaled spheres and rounded boxes. A fictional 10.6×3.6 m tender now has a closed station hull with a rising forefoot, a raked canopy, sixteen framed panes, a perimeter fender, roof hatches, canopy protection rails and two release-hook eyes. The canopy coaming meets the hull deck. The davit uprights and diagonal braces meet footings on the actual balcony deck; each hoisting wire ends at its lifting eye.

[PALFINGER's passenger tender/lifeboat overview](https://app-support.palfinger.com/worldwide/en/our-products/boats-and-davits/lifeboats-rescue-and-tender-boats/partially-enclosed-lifeboats-and-tender-boats.html) and [its 2026 cruise catalogue](https://app-support.palfinger.com/content/dam/palfinger/global/marine/segments/passengers-cruise/palfinger_marine_cruise_brochure_04_2026_web.pdf), PDF page 7, supplied visual references for the window bands, protective fittings and vessel-mounted davits. Geometry is hand-authored with fictional dimensions, rather than a surveyed product model. No catalogue images or brand marks are included in the game.

## Rendering and flight contacts

One shared template supplies the eighteen placements at the existing 16 m spacing. Centres move 0.4 m outboard to clear the balcony rails. Parts are combined into the passenger ship's existing material buckets. The orange finish and other PBR materials are reused.

Contact queries use BVHs of the closed hull, coaming and sealed canopy envelope. The rendered canopy now has real openings and thickness around all sixteen windows, while its collision envelope keeps the glazed cabin solid. Small fixtures use their actual box bounds; fenders, gaskets, rails and hoist segments use padded line distances. Lifting eyes use a conservative small capsule. This removes the old whole-boat rectangle's empty-air collision at ship-local `[19.6,10.6,-72.8]`. Davit deployment, suspended-boat dynamics and release operation are not simulated.

## Initial tender/support verification on 2026-10-14

- 66 unit tests and the strict TypeScript/Vite build pass. Independent raycasts check six approach directions, closed edges and outward volumes, forefoot/end-cap integrity, hull/coaming and roof supports, window directions, all eighteen mounting footprints and free bow airspace.
- The final native RTX 4050 browser suite passes all fifteen cases. It retains moving vessels/deck motion, keyboard, virtual Xbox/radio, real rendering-stall handling, ordered race crossings, paused settings, terrain/nearshore GPU probes and context recovery.
- The browser tender case raycasts actual merged ship surfaces at all eighteen positions and checks world contacts. It also checks seventy-two upright/brace starts against the rendered balcony deck, the lifting eye, the former phantom collision point and nearby open air. The basic tender/support revision also passes this case through Vulkan SwiftShader; the final forefoot revision was checked with native rendering and CPU geometry tests. Full remote CI remains a separate publication gate.
- Eight matching ULTRA before/after pairs use four camera poses, two lights, a 1920×1280 buffer and wave/vessel time 120. A further eight renders inspect the revised forefoot. Selected left/right/front and whole-ship views were inspected without page/console errors. This is a still-frame comparison, not sustained FPS, physical-controller or long-play acceptance.

## Window and interior follow-up

[Fassmer's official yacht brochure](https://www.fassmer.de/media/download/downloads_bb_bro_yacht.pdf), PDF page 3, shows the SEL-RT 7.5's side benches, central aisle and forward helm. That photograph supplies a layout reference; this fictional model is not a reproduction or a certified seating/capacity plan. No source photographs are shipped in the game.

The roof rises 0.6 m to provide more than 2 m clear height over the rendered central floor. Windows, roof fittings and release eyes rise with it; all eighteen boats remain below the existing davit arms, with more than 0.15 m between each release point and the wire top. The passenger floor follows the actual hull station triangles, 8 mm above the deck. Twelve rounded side seats and one helm seat have supported pedestals, with a forward instrument console, dial needles and connected three-spoke steering wheel.

Tender panes share the passenger ship's glazing: BALANCED uses alpha glass (opacity 0.18, no transmission/depth write), while HIGH/ULTRA use physical transmission 0.94 with depth writes. Upholstery has its own material bucket, so the passenger rooms' BALANCED furniture replacement does not remove it.

- 73 unit tests and strict build pass. All sixteen aperture centres are free of opaque wall faces but remain solid to contact. Independent raycasts verify wall thickness, finished-floor headroom, seat support within 1 mm, upholstery inside the raked envelope and exterior views onto actual seats. All 585 floor vertices remain over the tapered hull's actual deck; this also fixes twelve formerly overhanging bow vertices.
- The actual merged game scene verifies all eighteen glazed tender surfaces, visible upholstery on both sides, hull contacts, bow airspace, hooks and all seventy-two davit support starts. Its final contact case passes locally on RTX 4050 D3D11 (38.8 s) and Vulkan SwiftShader (1.6 m).
- A real UI sequence BALANCED→HIGH→ULTRA→BALANCED retains every upholstery vertex and switches glazing/depth-write state correctly without WebGL/page/console errors. With browser pixel ratio 1.5, the drawing buffers are 960×640, 1440×960, 1920×1280 and 960×640.
- Eight final ULTRA pairs use identical camera positions/orientations, buffer sizes and wave/vessel time 120 against the opaque-window baseline. Additional aperture-only and raised-roof captures isolate those changes. These are rendering checks and still comparisons, not sustained FPS or long-play acceptance. Full remote CI and public deployment remain separate gates.

The lighthouse reef's former air collision has been repaired separately using its exact rendered triangles; see [the reef validation](LIGHTHOUSE_REEF.md). Its water-colour/foam depth and the tower contacts retain separate approximations. Real Xbox/USB-radio hardware, other GPUs, operable tender doors and deployment dynamics remain unverified or unimplemented.
