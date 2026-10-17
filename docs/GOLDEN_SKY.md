# Photographed golden-hour environment

GOLDEN now uses the self-hosted 4K [Kloppenheim 06 (Pure Sky)](https://polyhaven.com/a/kloppenheim_06_puresky) capture by Greg Zaal and Jarod Guest, licensed CC0. The original 17,385,661-byte HDR is retained without image editing. Its source URL, authors, provider MD5 and SHA-256 are in `public/textures/manifest.json`.

The sky and ship/water reflections share the capture and its prefiltered environment. GOLDEN normalizes the sampled upper-sky median luminance to an authored 0.25, retains the existing half-float/radiance limit of 6, and uses the average near-horizon colour for the scene's global fog. The strongest sampled upper-sky direction drives the directional light and follows the environment rotation. This is an artistic exposure/direction estimate, not photometric or solar-position calibration.

DAY keeps its existing authored 0.7 normalization. Its decoded 67,108,864 bytes have exactly the same SHA-256 before and after this change, on the preceding Linux CI build and the new native/SwiftShader fixtures: `8fd132dfaa7cf2aeeeb01efa67b78ff59e4fb25a5fe81f7fcf194c9f3f25bd13`.

## Loading and switching

- Only the selected DAY/GOLDEN capture is requested. BLUE uses the procedural atmosphere and requests no HDR. Previously even GOLDEN/BLUE downloaded the unused DAY capture.
- Pending requests and completed environments are reused per preset. A late completion may populate the cache but cannot replace the currently selected sky. A failed optional load keeps the preset's procedural fallback until reload.
- Before starting each HDR fetch, an asynchronous GPU fence drains preceding sky work. Decoding still waits for the surface-texture readiness promise. Existing 25-second fetch deadlines and quality settings are unchanged.
- A completed capture updates the sun, fog, reflection and forest lighting together, including when the light preset itself has not changed. Forest construction publishes its ready reference synchronously before queued lighting changes; installing the visible forest group still waits for the other scenery.
- Context loss keeps the recovery screen and disposes late photographic resources without issuing new rendering commands. A failed optional GPU fence retains the procedural fallback without an unhandled rejection.

## Actual minified comparison

These unedited screenshots use the preceding published build and the new minified build. Both use the real saved GOLDEN preset, ULTRA, a 960×640 viewport and a 1920×1280 scene framebuffer. A DOM observer opens the actual settings dialog before the first game animation callback; the callback count is asserted to be zero. Only the dialog/backdrop are hidden for the comparison.

Before:

![Procedural golden-hour sky](images/golden-sky-before.png)

After:

![Photographed golden-hour sky](images/golden-sky-after.png)

## Verification and limits

- All 196 unit tests and the strict production build pass.
- Native Direct3D11 checks cover DAY/GOLDEN decode ordering, stale responses, request deduplication, cached reselection, nonzero environment rotation, forest lighting, saved BLUE/GOLDEN reloads, optional HDR 404 with keyboard flight, context loss and optional fence failure. A separate forest fixture reproduces a queued light change immediately after construction.
- SwiftShader also passes the two actual 4K decode fixtures and the forest-publication fixture. Full browser CI remains the release gate.
- The minified ULTRA build passes keyboard climb, pause/resume/reset and actual pointer-lock mouse input on an RTX 4050, with both HDRs exercised across settings changes and no errors. Separate initial-preset captures contain all 36 assets for DAY/GOLDEN, or 35 for BLUE, with no missing assets or WebGL errors.
- No live asset API is used by the game. Cached DAY plus GOLDEN retain two decoded 64 MiB textures and their filtered environments; selecting only one avoids downloading the other.
- BLUE remains procedural: the trial dusk capture produced an unsuitable dark foreground and a bright global-fog band. Direction-dependent atmospheric scattering and broader hardware performance/physical-controller acceptance remain outside this change.
