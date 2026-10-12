# OceanFPV validation

Date: 2026-10-12 (Asia/Tokyo). This records the new browser game. The original `OceanLab/VALIDATION.md` describes a separate Godot application and is not evidence that this game passed.

## Completed locally

- ZIP extracted without editing its source. SHA-256 comparison against the ZIP's file streams passed for all extracted files. Source review: `SOURCE_REVIEW.md`.
- `npm test`: **15/15** tests passed. Hover stabilization, pitch/roll directions, long-running Acro quaternion normalization, gravity after disarm, rate bounds, Xbox channels, radio throttle endpoints, missing throttle fail-closed, asymmetric calibration, directional gate crossing, full three-lap sequence, finite sea sampling, held reset button re-poll, selected-device replacement and keyboard fallback when pointer lock is unavailable.
- `npm run build`: TypeScript strict check and Vite production bundle passed.
- Chromium UI tests: **7/7** passed (six gameplay tests plus the separately executed WebGL fallback test). They exercise actual rendering without console errors, keyboard climb/pitch, stable pause, collision/reset, all 18 forward gate crossings and saved results, mocked Xbox input/disconnect, mocked radio calibration/arming safety, persisted settings, accessible dialog dismissal, a 390×844 layout and a clear WebGL-unavailable recovery screen.
- `npm audit`: **0 vulnerabilities**, including development dependencies after updating tsx.
- Independent read-only controller/lifecycle review identified held-button recursion, unsafe disconnected resume and silent device substitution. All three are corrected; corresponding regression coverage exists.

Browser tests use the development-only `?test=1` inspection hook for deterministic setup and state assertions. That hook is excluded from production builds. The race test injects positions immediately before each gate and then lets real fixed-step physics cross its plane; it verifies crossing/scoring, not a human pilot's skill.

## Rendering and hardware limits

Screenshots are actual WebGL draws, not generated mockups. Automated Chromium runs headless on this Windows host; measured FPS there is not a hardware-GPU benchmark. Performance depends on the GPU, browser, resolution and quality. BALANCED reduces reflection resolution and disables shadows/bloom; HIGH and ULTRA retain more detail.

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
```

The final command checks the published static build and writes golden-hour, daylight and FPV screenshots to ignored `artifacts/`. GitHub Actions retains browser traces/screenshots and deploys only after verification passes.
