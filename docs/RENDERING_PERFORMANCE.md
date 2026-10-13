# Rendering performance verification

BALANCED now uses fewer rounded-edge segments for passenger-cabin linen and the three quilt materials. The room layout, photographed maps, collision geometry and contact-shading receivers remain the same. HIGH and ULTRA restore the original geometry objects. Both variants remain cached, so memory and loading improvements are not established.

A controlled native RTX 4050 Direct3D11 comparison kept the camera, vessel/wave time (120 s), materials and BALANCED renderer settings fixed. Only the furniture geometries changed. Actual rendered triangles, including reflections, changed from **7,202,421 to 4,009,077**; both views used **96 draw calls**. Bounds matched exactly for all four material batches, and switching back restored the original geometry objects. Full/coarse screenshots were inspected without page or console errors. These are geometry counts, not sustained FPS measurements or a comparison of complete quality presets.

## Fixed dialog frames

Help, settings and pause dialogs freeze scene time. An unchanged frozen view keeps its last rendered frame. Settings, viewport/visibility changes, camera pose/FOV changes and ocean material recompilation trigger a fresh draw; closing the dialog resumes animation. Gamepad polling, controller setup and HUD/audio updates continue outside the drawing cache. The FPS label displays PAUSED for a frozen view.

The added browser regression counts actual WebGL2 draw calls. It verifies no extra draws across consecutive fixed snapshots, a redraw after a FOV change, and resumed draws/time after dialog dismissal. The native branch also changes HIGH/BALANCED reflection targets while frozen and verifies that unchanged views stop drawing afterward. Development diagnostics that directly change other world geometry or uniforms must call the development-only invalidate() hook; it is excluded from production.

## Verification

- 43/43 unit tests and strict TypeScript/Vite production build passed before each implementation commit.
- The new draw-cache regression passed independently on native RTX 4050 Direct3D11.
- All 10 browser cases passed with fixed source on Vulkan SwiftShader in 12.6 minutes. Existing keyboard, complete race, virtual Xbox/radio, settings/mobile and recovery assertions were retained.

All 10 browser cases also passed on native RTX 4050 Direct3D11 in 3.7 minutes, including the frozen HIGH/BALANCED quality-switch assertions. PR CI and publication remain pending. The implementation was based on main 0a46704064db31131a05482ed1d3b9c04ded2b26; a merge alone does not establish which build is live on Pages. Physical controllers, other GPUs/browsers and sustained flight performance remain unverified.
