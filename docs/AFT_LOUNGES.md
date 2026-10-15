# Aft lounge depth and glazing

The eight cabin decks previously used opaque dark end glazing, with the central accommodation core only 0.07 m behind it. Their aft ends now contain enclosed lounges with timber floors, ceilings, back walls, curved sill/header bands, framed windows, six upholstered chairs and three pedestal tables per deck. Bow glazing and side cabins keep their existing layout.

The room footprint follows the same `deckOutline(length+.14,27.64,6.07)` as the windows. The room extends from local Z=`length/2-6` to `length/2+.07`, 6.07 m deep at the centre. Glazing is 0.43–2.15 m above the supporting deck; the timber top is 0.06 m and the ceiling underside 2.55 m. The visual core is shortened by 6.16 m and shifted forward 3.08 m, retaining its original bow end. This leaves 4 cm behind the 12 cm back wall and avoids coplanar end caps discovered in the close visual comparison.

The original full exterior collision envelope remains closed. The lounges are visible through glazing; this is not an opening for flying inside. Their windows reuse the existing cabin glass material and its BALANCED transparency versus HIGH/ULTRA transmission path. Fabric furniture has both fine and coarse geometry, with matching bounds and feet on the actual floor.

## Interior shading

The side cabin's atlas cannot describe this wider, aft-facing room. Three separate charts cover the lounge floor, ceiling and back wall. The atlas grows from 256×256 to 256×384; previous cabin charts retain their pixel locations with updated normalized coordinates. Photographed UV0 remains intact. Unassigned surfaces sample an unused white region.

One rigid lounge template supplies opaque walls and furniture for 32 cosine-weighted visibility rays per texel, within 8 m. Glass is excluded. The other seven lounges share its geometry and furniture placement, translated to their decks. This is local ambient occlusion, not path tracing or indirect-light simulation. Its effect is modest in wide views; close comparisons show the room and furniture contact shading more clearly. The room and furniture remain procedural.

## Verification

- Unit checks preserve end-ribbon triangles and outward-facing panes; FrontSide raycasts check room depth, floor and ceiling. All 27 chair/table feet land on timber. Fine/coarse fabric bounds match.
- Atlas checks preserve geometry and photographed UVs, retain the white neutral region, and verify that the actual chair darkens the floor beneath it more than a clear point nearer the window.
- The main-scene browser test checks 6.0–6.1 m pane-to-wall depth on every deck, no duplicate coplanar back-wall face, closed window contacts, clear air outside, and the installed lounge atlas.
- Matching ULTRA overview/waterline/underside views in day and golden light use fixed time 120 s, breeze, RTX 4050 and a 1920×1280 drawing buffer. Additional close window views compare AO intensity 0 and 0.75 at the same camera. Static HUD readings do not establish sustained FPS.

Whole-ship realism, physical Xbox/USB transmitter acceptance, and sustained performance remain separate work. Passing these geometry and browser checks does not establish whole-game visual completion.
