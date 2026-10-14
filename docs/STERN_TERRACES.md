# Cruise stern terraces

The three aft terraces now have painted structural slabs with thin timber walking surfaces, supporting walls and guardrails. Previously the whole slab used timber, the rails lacked posts, and the upper two terraces intersected the cabin glazing. Their centres now sit at local Z=106, 106 and 103 m, beyond the corresponding cabin ends.

`buildSternTerraces` supplies both render geometry and contact primitives. Box contacts cover slabs, timber and supports; capsule distance checks cover rail segments and posts, with the existing 0.2 m flight margin. The two lowest supports sit within the 26 m promenade below. Upper supports land on the previous terrace. Existing cruise materials and texture scale are reused.

Four unit checks cover walking surfaces, painted undersides, rail contacts and clear air, foundations, and separation from the cabin glazing. A browser regression raycasts the actual merged ship geometry: all three timber tops and aft rails must match flight contacts, the space above the rails must remain clear, and the lowest support foundations must meet the original promenade.

Six matching ULTRA captures inspect the overview, waterline and underside in day and golden light. They use the main renderer on RTX 4050/Direct3D11, a 1920×1280 drawing buffer, fixed time 120 s and breeze. These captures establish appearance at those views, not sustained performance.

This change addresses the terrace construction only. The hull and cabin envelope remain procedural and still need further realism work. Rail contacts use the existing endpoint collision convention and do not establish swept contact at arbitrary flight speeds. Physical Xbox and USB transmitter acceptance remains unverified.
