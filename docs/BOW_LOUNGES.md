# Bow observation lounges

The passenger ship's forward window bands previously used opaque dark glass with a visual core only about 7 cm behind the centre panes. Seven upper levels now contain approximately 6.07 m deep observation rooms with curved glazing, timber floors, ceilings, rear walls, frames, six upholstered chairs and three pedestal tables per room. This is a fictional layout, using the existing aft-room geometry and materials.

The complete room, furniture and coarse furniture geometry rotate 180 degrees about Y. Vertex winding and outward glazing normals remain intact. Occlusion charts transform back into the same room coordinates, reusing the existing furnished-room visibility bake. Ship-local photographed paint and timber UVs retain their physical scales. The upper visual core recedes behind both end rooms; the flight-contact envelope remains closed around the external glazing.

The lowest bow-facing level remains a painted opaque wall. An initial integration check found the rising sheer hull about 0.757 m above that room's proposed floor. A full-height lounge cannot fit below the next existing deck there. Keeping this level opaque avoids a room with the hull running through its floor. The eight aft rooms, side cabins and separate navigation bridge retain their layout.

## Verification

- The room/AO unit group passed 8 tests. Independent rays check outward panes, more than 6 m depth, floor and ceiling surfaces, and all 27 chair/table support points for each deck length. Rotated charts match their unrotated counterparts.
- All 115 unit tests and the strict TypeScript/Vite build passed after integration.
- Native RTX4050/D3D11 checks passed for all seven bow rooms, the painted lower wall and all eight aft rooms. Pane contacts remain solid and surrounding exterior air remains clear; rays also verify actual floor and ceiling positions. The normal complete-scene check passed during integration.
- Eight matched before/after pairs cover the close facade and whole bow in day/golden light at BALANCED and ULTRA. Four additional views inspect the upper room directly. Captures use identical frozen wave/vessel time120, FOV55 and camera transforms for each pair; ULTRA uses a1920×1280 buffer, BALANCED960×640. No page or console errors were reported.

HIGH/ULTRA reuse the existing screen-space transmission material; BALANCED uses the existing alpha-glass approximation and coarse fabric geometry. Off-screen transmission, the reused room bake, fixed furniture and the unmodified opaque bridge remain limitations. These checks do not establish physical-controller operation, sustained performance or a surveyed production-ship model.
