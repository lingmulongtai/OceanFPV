# OceanFPV validation

Date: 2026-10-13 (Asia/Tokyo). This records the new browser game. The original `OceanLab/VALIDATION.md` describes a separate Godot application and is not evidence that this game passed.

## Marine follow-up

The 2026-10-13 follow-up passed **27/27 unit tests** and the strict production build. Added coverage checks curved-deck airspace versus solid contacts, bow planking against the closed hull's actual station vertices, packed coastal depths against rendered terrain triangles, displaced wave tangents at all sea strengths, and stronger whitecaps plus deterministic foam reset on preset changes/time rewind. An additional check samples combined horizontal Jacobians at 4,000 positions/times and verifies that SWELL height is preserved when excessive crest compression is limited. The final browser suite and publication are checked separately before this revision is deployed.

HIGH comparison images at 1100×740 verify curved passenger-deck ends, wraparound windows and translucent balcony glazing, shoreline wash, and the updated ocean normals. These use a paused diagnostic camera and are WebGL renders, not human flight or real-device performance acceptance. The rendering and hardware limits below still apply.

## Earlier visual-release verification

- ZIP extracted without editing its source. SHA-256 comparison against the ZIP's file streams passed for all extracted files. Source review: `SOURCE_REVIEW.md`.
- `npm test`: **21/21** tests passed. Hover stabilization, pitch/roll directions, long-running Acro quaternion normalization, gravity after disarm, rate bounds, Xbox channels, radio throttle endpoints, missing throttle fail-closed, asymmetric calibration, directional gate crossing, full three-lap sequence, finite sea sampling, held reset button re-poll, selected-device replacement and keyboard fallback when pointer lock is unavailable. New cases verify a known 2D IFFT impulse/cosine, spectral-field evolution/periodicity/finite contacts, watertight hull end caps, continuous vessel-route velocities/headings, coastline continuity and contact heights that match the rendered terrain triangles.
- `npm run build`: TypeScript strict check and Vite production bundle passed.
- Chromium UI tests: **9/9 cases** passed across local runs. They exercise actual rendering without console errors, moving-vessel travel and pause, launch from a moving deck, failed photographic-asset fallback, keyboard climb/pitch, stable pause, collision/reset, all 18 forward gate crossings and saved results, mocked Xbox input/disconnect, mocked radio calibration/arming safety, persisted settings, accessible dialog dismissal, a 390×844 layout, a WebGL-unavailable recovery screen and actual WebGL context loss while a pause dialog is open. The earlier combined Windows run passed its first six cases, then the test browser crashed while creating a page before case seven. Settings/mobile and fallback cases passed in fresh browser runs; this was not counted as a clean full-suite run. The later context-loss regression passed independently. GitHub Actions verifies the complete final suite before deployment.
- All **21** self-hosted photo/model files match their recorded SHA-256 digests. All **59** extracted source files still match the original ZIP streams.
- `npm audit`: **0 vulnerabilities**, including development dependencies after updating tsx.
- Independent read-only controller/lifecycle review identified held-button recursion, unsafe disconnected resume and silent device substitution. All three are corrected; corresponding regression coverage exists.

Browser tests use the development-only `?test=1` inspection hook for deterministic setup and state assertions. That hook is excluded from production builds. The race test injects positions immediately before each gate and then lets real fixed-step physics cross its plane; it verifies crossing/scoring, not a human pilot's skill.

## Rendering and hardware limits

Screenshots are actual WebGL draws, not generated mockups. The production-build verification identified the headless Windows renderer as **ANGLE / Vulkan SwiftShader Device (Subzero)**. Its FPS is not a hardware-GPU benchmark. Performance depends on the GPU, browser, resolution and quality. HIGH/ULTRA support up to 4×MSAA for fine rigging/edges; BALANCED reduces reflection resolution and disables shadows/bloom/MSAA.

The initial PR CI run also passed **15 unit tests and all 7 browser tests on Ubuntu**: [run 38253679438](https://github.com/lingmulongtai/OceanFPV/actions/runs/38253679438). Final changes and main deployments are independently checked by the same workflow.

The first full visual-update CI run passed five browser cases and timed out four: [run 38292300779](https://github.com/lingmulongtai/OceanFPV/actions/runs/38292300779). The race screenshot reached lap 3, gate 6 before the 120-second whole-test deadline; the radio screenshot showed an armed flight. Reload used an inconsistent 20-second startup wait. The harness now allows 180 seconds per case and the same 90-second readiness wait on initial load/reload. Functional cases use a 640×480 viewport on the software renderer; the scene-render case keeps 960×640 and the separate HIGH/ULTRA rendered evidence retains its actual quality settings. Product rendering and assertions are unchanged.

The final visual PR passed all nine cases in [run 38296460247](https://github.com/lingmulongtai/OceanFPV/actions/runs/38296460247). Main verification [38298110127](https://github.com/lingmulongtai/OceanFPV/actions/runs/38298110127) ran roughly twice as slowly in both attempts: eight cases passed, while settings/reload/mobile reached its final layout assertion or screenshot at the 180-second case deadline. That one case now has a 300-second budget because it initializes the complete photo/model scene twice. Its assertions, capture and product rendering remain unchanged; other case budgets remain 180 seconds.

Visual-fidelity review captured actual 1440×900 HIGH renders of the spectral sea, passenger-vessel balconies and coastline. The scene reported about **2.23 million rendered triangles including reflection**, 2048-pixel metal normal maps and a 1024-pixel teak map. The sky is a self-hosted 4096×2048 HDR image with exposure normalization. These draws produced no page/console errors. Diagnostic close-up camera placement uses the development inspection hook and is not a human-flown run or a hardware performance benchmark.

The later scanned-forest review captured a real 960×640 BALANCED frame with a nearby full 3D tree. Its source mesh contains **1,072,213 triangles**; the reflected scene reported about **2.57 million rendered triangles**, no page/console errors and no collision at the diagnostic camera position. Near-tree limits are 1/4/8 for BALANCED/HIGH/ULTRA; distant trees use an eight-view atlas derived from that same scan. Close-up screenshots use a safely positioned diagnostic camera.

**Xbox hardware, USB FPV transmitter hardware, Bluetooth latency, unusual HID descriptors and browser-specific real-device mappings are not physically tested.** The input code and browser API paths are tested with virtual Gamepad objects. Device detection still depends on the OS and browser exposing the controller. Follow the in-game controller setup and verify each channel before flight.

Mobile menu/dialog layout is checked, but touch flight controls are not implemented. Safari/iOS, physical mobile GPU performance and other browser engines have not been accepted. This is a playable visual simulator with simplified quadrotor physics, not a calibrated real-world FPV training product.

## Reproduction

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:browser
node scripts/verify-deployment.mjs https://lingmulongtai.github.io/OceanFPV/
node scripts/verify-deployment.mjs https://lingmulongtai.github.io/OceanFPV/ --quality=ultra --visual-only
```

The publication check uses BALANCED for controls, real pointer lock/mouse movement and photo/model delivery. The separate ULTRA command checks the actual 2× drawing buffer and captures its daylight render without using the development hook. Both write screenshots to ignored `artifacts/`. GitHub Actions retains browser traces/screenshots and deploys only after verification passes.
