# Optional scalar wave FFT experiment

This branch evaluates a small WebAssembly backend for the existing CPU sea. It is held separately from the released game: component work became faster, but the measured game frame rate did not improve. The released game retains its JavaScript FFT.

## Execution and fallback

The authored Rust kernel uses scalar Float64 arithmetic with the same operation order, JavaScript-computed twiddles and normalization as `inverseFFT`. It has no imports, SIMD, fast-math, fused operations or precision reduction. Only the three 128² wave cascades use it; the exported JavaScript `inverseFFT` and its aliasing behavior remain unchanged. Grid resolution, wave spectrum, foam, 30 Hz field cadence and rendering quality remain unchanged.

The adapter validates the fixed 2 MiB memory, alignment, nonoverlapping ranges, finite stage twiddles and swap indices before entering the raw-pointer kernel. Caller fields are copied into private kernel buffers and copied back only after normal completion. Unsupported sizes, overlapping/shared buffers, rejected transforms, traps or memory replacement return to JavaScript; a failed backend is disabled. Tests include a trap after earlier accelerated fields and compare the entire recovered update.

Loading begins asynchronously after the initial GPU gate, without awaiting it during game startup. The self-hosted 1,089-byte asset uses `arrayBuffer` and normal instantiation, so it does not require a WASM content type. HTTP, network, compilation and CSP failures retain JavaScript; a real five-second fetch timeout bounds loading. A browser without `WebAssembly` makes no accelerator request. This implementation is experimental, rather than a requirement for running the game.

## Rebuild

Normal `npm ci`, tests and production builds use the checked-in asset and do not require Rust. To reproduce it, use exactly the compiler recorded in `src/generated/wave-fft.json`, with the `wasm32-unknown-unknown` target available and that compiler on `PATH`:

```sh
node scripts/build-wave-fft.mjs --check
```

The script verifies compiler identity, source hash, binary length, SHA-256 and byte-for-byte rebuild identity. Without `--check` it writes the same verified asset. Intentional kernel changes require updating the recorded provenance rather than silently changing the binary. The shipped kernel SHA-256 is `8d1e5b764c20cb372b824c5bae96c39c302c217222d0e872ab4ac65492daa11d`.

## Verification

- Unit checks cover finite Float64 transforms at sizes 2–128, memory and alias rejection, trap recovery, complete field/foam history, profile changes and rewind. Finite samples do not prove identity for every possible input.
- Six real Chromium loader modes cover healthy loading with a non-WASM MIME type, 404, corrupt bytes, a held request aborted after 5,008.8 ms, an actual document CSP blocking `wasm-eval`, and simulated absence of `WebAssembly`. Each compares 5,308,416 Float32 words and 45 contact heights exactly through configured CALM/BREEZE/SWELL profiles and rewind.
- The native RTX4050/D3D11 GPU oracle passes with both JavaScript and the installed accelerator: each covers 8,176 wave/normal cases, 24 detailed bottom cases and 896 mip samples. Existing render/contact tolerances are retained; maximum contact discrepancy is approximately 0.00503 m for both backends.
- Actual minified ULTRA builds pass keyboard climb, pause/resume, reset, real pointer lock and mouse input with both a successfully compiled kernel and an intentionally corrupt response. Both deliver 40 photographic/model responses without browser errors and use a 1920×1280 framebuffer. These are browser checks, not physical Xbox or USB-radio acceptance.

## Measured cost

One RTX4050/D3D11 Chromium page kept the actual ULTRA scene normally paused at time zero. Nine alternating rounds measured 100 complete SWELL sea updates after 60 warmups per backend. Backend installation was outside the timing window; guards, buffer copies, fields and foam were inside it.

| Median per 100 sea updates | JavaScript | Optional kernel |
| --- | --- | --- |
| Component time | 1,827.9 ms | 1,569.5 ms |

The approximately 14.1% component reduction does not imply a game FPS improvement. The final 589,824 Float32 field words matched exactly, and the real boot loader had installed the accelerator.

A separate sequential comparison used actual minified builds, identical DAY/SWELL/ULTRA settings and 1920×1280 buffers, with 20 seconds of warmup followed by 20 seconds of frame observation. Compilation was observed without replacing the FFT function. Neither build paused or reported browser errors.

| One short game sample | JavaScript | Optional kernel |
| --- | --- | --- |
| Frame rate | 17.31 fps | 16.78 fps |
| 95th-percentile frame interval | 100.0 ms | 133.3 ms |

This sample does not demonstrate a practical frame-rate benefit, or establish a causal regression across machines. It is the reason to retain this as an experiment rather than add it to the current public release. No power, physical-controller or general hardware-performance claim follows from these measurements.
