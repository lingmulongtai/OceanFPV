# Material and lighting startup order

Main `3906d36` and PR #69 at `796b6a0` failed the peer texture-retry browser
case in CI. The second rock-normal request used `cache: reload` and received
HTTP 200, but reached its real 25-second fetch/body deadline. The material group
correctly fell back as a whole, so the test's full-detail assertion failed.
Other traces also recorded an uncontrolled grass-normal timeout and recovery.

The traces show a roughly 20.5-second gap before several startup continuations
resume, including HDR, texture bodies and cliff dependencies. They do not contain
CPU marks identifying the exact blocking operation. An unmodified local software
CPU profile recovered both controlled requests and did not reproduce this gap.
This change removes a concrete source of overlapping work; remote CI must still
confirm whether it resolves the observed failures.

Commit `30d4bfc` starts surface images and HDR transfer concurrently, then waits
for the material groups to finish their transfers, decoding and any retries
before parsing HDR data and baking photographic lighting. Forest model downloads
can proceed, but geometry construction and atlas rendering wait for both material
and lighting readiness. Cliff installation still precedes forest/rock placement.
Model parsing and cliff work can still overlap material transfers.

The shared readiness promise is observed immediately alongside coastal assets.
Lighting failures propagate to boot without waiting for a pending model and do
not become unhandled rejections if an optional model fails. Missing-model fallback
remains available. The 25-second deadline, two attempts, reload policy, material
coherence and full-detail assertions are unchanged.

The ordering change passed five related cases on native Direct3D11 and
SwiftShader: normal startup, one/two image retries, deferred HDR parsing and
missing-image fallback. The final error observer is covered by two unit cases
for immediate failure and independent material readiness with model fallback.
The HDR fixture downloads the real image while readiness is pending, proves
parsing has not begun, then releases readiness and checks completion. Its old
implementation parsed prematurely; the resulting 67,108,864-byte half-float
image remains SHA-256 `8fd132dfaa7cf2aeeeb01efa67b78ff59e4fb25a5fe81f7fcf194c9f3f25bd13`
with the same sun direction.

The final minified native build passes keyboard climb, pause/resume/reset,
light settings, real pointer lock/mouse and ULTRA 1920 × 1280, with all thirty-six
asset responses and no errors. Four fixed DAY/SWELL grazing screenshots are
byte-identical to the pre-ordering baseline, including foam-enabled/disabled
controls. This is not a measured startup-speed improvement or a guarantee against
timeouts on all machines. Full remote CI and public acceptance remain pending.

Production bundle: `index-BtWJ6QPw.js`, SHA-256
`03c0bef5e61f6237921ac05685f5bc2ed9004dcf35b626385bd40d544787c3da`.

## Remaining timeout and process diagnostics

PR #72 at `88ddebe` still failed its CI peer retry. The second rock-normal
attempt reached 25,000 ms, with 7,966 ms attributed to the body phase: about
17 seconds passed before that phase began. Local three-context sequences with
and without Playwright recording both recovered all images. These passes do
not identify the CI cause or establish that the ordering fix is sufficient.

The first three startup cases now record Chromium process timing in CI, or
locally when `OCEANFPV_STARTUP_TRACE=1`. The browser CDP endpoint includes the
separate NetworkService; a page endpoint filters the process set, as shown in
[Chromium's tracing handler](https://github.com/chromium/chromium/blob/main/content/browser/devtools/protocol/tracing_handler.cc).
Network/socket events, renderer tasks and GPU events share the trace clock.
Resource timing and long tasks provide an additional page-side reference.

Each test attaches `startup-process-timing.json.gz`,
`startup-resource-timing.json` and `startup-trace-completion.json` to the normal
test output. Collection uses a 32 MiB buffer that stops recording when full;
check `dataLossOccurred` before assuming the timeline is complete. The new
collector does not copy response bodies or screenshots. Recording can affect
scheduling, so it is diagnostic evidence rather than a startup benchmark.

Normal startup and single/peer retries passed on Direct3D11 and SwiftShader.
After correcting the endpoint, the peer case passed again on both; both final
traces contain NetworkService, renderer and GPU, with no reported data loss.
The strict build and all 179 unit tests pass. Image deadlines, retry policy,
material coherence and full-detail assertions remain unchanged. This test-only
addition retains `index-C28xksFz.js`, SHA-256
`136abcdf47048b76d934f27883c59c111f40c8bdefe2ffe7c21d1fe7985e538a`.
The intermittent CI failure still requires a process trace from that environment.

## Initial GPU completion before material requests

Main `a88719f`, run `39030140052`, supplies a failed CI process trace without
reported data loss. Its single-image retry received full HTTP 200 headers and
2,097,152 body bytes within 220 ms. Ordinary 640 × 480 canvas compositing then
blocked the renderer in `GLES2::ReadPixels` for 15,315.508 ms while the GPU flushed
commands. The response continuation could not resume during that interval.

A separate socket read later waited 11,824 ms without incoming bytes. The
NetworkService was not occupied by a comparably long task. The complete
6,185,893-byte response arrived at about 27,187 ms, after the unchanged
25,000 ms application deadline. The trace proves an overlapping GPU stall, but
does not identify the server/TCP cause of the later socket wait or establish a
single cause for the failure.

Startup now inserts a WebGL2 fence after initial settings have finished their
procedural sky and PMREM work, immediately before material, HDR and model
requests begin. It flushes once and checks completion with zero-timeout
`clientWaitSync`, yielding between checks rather than blocking JavaScript.
This follows the [WebGL2 synchronization contract](https://registry.khronos.org/webgl/specs/latest/2.0/#CLIENT_WAIT_SYNC).
Context loss stops startup through its existing recovery UI; allocation or wait
failure rejects boot. Every allocated fence is deleted.

`oceanfpv:initial-gpu-start` and `oceanfpv:initial-gpu-ready` performance marks
locate this boundary in later traces. The production startup browser case
observes the real, unmodified sync return values and verifies that every
photographic texture, HDR and model fetch follows the ready mark. Unit cases
cover pending work, both completion statuses, zero-timeout polling, context-loss
races and failed waits/allocations. This removes pre-existing queued GPU work
from texture deadlines; it does not guarantee that later compositing or slow
network delivery cannot stall.
