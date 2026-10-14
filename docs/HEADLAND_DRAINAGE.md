# Northern headland drainage

The northern uplands previously combined broad ridge masks and positive noise. This change adds connected downhill gullies while retaining the existing two-ridge silhouette, saddle, cape, bay and low coastal shelves.

`drainageCuts()` selects the steepest descent among eight neighbours using drop divided by neighbour distance. It accumulates contributing grid cells in descending height order, then carves smooth overlapping channel footprints. Cuts use a maximum union at junctions. A final uphill pass limits cuts so existing strict downstream edges cannot become barriers. Existing closed depressions remain; the routine does not fill sinks, simulate rain, transport sediment or claim hydraulic erosion.

The 193 x 193 grid uses the same 3.25 m spacing as the existing 260 m headland. Channels have a 3.25-cell support radius (10.56 m) and an 8 m maximum cut, faded across northern bounds, the lower slopes and crest. The cache is generated once per island size and height from the original height function. Rendering, contact sampling, tree/rock support and uploaded depth data consume the same shared height function.

Measured against the previous source, 3,261 vertices change by more than 1e-9 m, maximum cut is 7.363648 m, and no original vertex at or below 30 m changes. Exact cape, saddle, southern ridge and radial samples remain unchanged. This does not add measured geographic data or change the photographed cliff source.

Verification: full 113 unit tests and production build passed. Targeted tests check downhill connectivity, bounded and broad cuts, protected ground, actual triangle raycasts and contact/depth agreement inside the carved region. Four before/after mainrenderer screenshots use the same RTX 4050, ULTRA 1920 x 1280 buffer, camera, daylight/sunset and sea/vessel time 120. Both capture runs had no browser errors. The visible correction is modest from the present viewpoints; repetitive rock appearance remains an open visual issue. All 24 native-GPU browser tests passed in 6.7 minutes. Physical controller hardware and sustained frame rate remain unverified.

Algorithm reference: [Esri D8 flow direction](https://pro.arcgis.com/en/pro-app/3.3/tool-reference/spatial-analyst/how-flow-direction-works.htm), specifically steepest descent and diagonal distance. Our bounded art-directed carving does not reproduce that application's sink filling or tie expansion.
