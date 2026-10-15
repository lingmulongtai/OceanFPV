# Cruise aft hull profile

The previous shared transom formula narrowed the 260 m cruise ship's aft shoulder, then widened it again at the stern. Half-width was 13.36 m at local Z=80 m, 11.57 m at Z=100 m, 11.42 m at Z=110 m and 12.24 m at the transom. The 26 m stern promenade extended beyond this pinched hull.

The cruise ship now has its own profile: a broad shoulder tapers continuously into elliptical corners and a flat transom. Rendered station half-widths are 16.53, 16.43, 16.41, 16.12 and 15.27 m at Z=80, 100, 110, 120 and 125 m. The transom stays 12.24 m. The forward half, length, beam, sheer, draft and six-row transverse section stay unchanged. This is an original procedural design, not a surveyed or named ship replica.

`closedHullGeometry` and `upperHullSidePose` accept an explicit width function; their defaults preserve the explorer, yacht and tenders. `cruiseHullGeometry` and `cruiseHullSidePose` select the new cruise profile. Portholes use those actual side triangles. Existing paint charts, bow planking, ship-name raycasts and closed-edge checks run against the new cruise geometry.

Cruise contact samples the same Float32 station coordinates and side triangle diagonal, with the existing 0.2 m axis margin. It includes the deck, lower hull and end caps. Like the existing vessel contacts, this is an endpoint volume check, not a swept collision guarantee. The ocean selects the new station-interpolated width only for cruise vessel index 1; the explorer and yacht masks keep their previous formulas. The 0.98 waterline mask inset remains an approximation of the submerged hull section.

## Verification

- Unit checks cover monotonic aft taper, promenade support, unchanged forward coordinates and legacy vessel widths, closed topology, fitted fixtures, and actual side-triangle contact with outside air clear.
- The main-scene browser regression raycasts 24 rendered aft side positions. Each surface must contact the hull, and positions 0.3 m farther outside must remain clear. The three stern terrace and promenade foundation checks also pass.
- A GPU probe extracts the production ocean's hull-mask branch and checks all three vessels at 1,704 samples, including the rounded corners and both sides of the mask edge. Native RTX 4050 maximum width error is 0.00000501 m; SwiftShader is 0.00135327 m in the unchanged forward sin/pow profile. The new aft profile's maximum is 0.00000191 m on both. Mask disagreements are zero, at 5 mm either side of the expected edge.
- Six ULTRA views use matching baseline/final camera, light, 1920×1280 drawing buffer, GPU and fixed wave/vessel time. The overview and waterline views were inspected for the aft pinch and corner shape. Static HUD readings do not establish sustained flight performance.

The cabin envelope, transverse hull section and broader ship realism still need work. This correction does not establish physical Xbox/USB transmitter acceptance or whole-game visual completion.
