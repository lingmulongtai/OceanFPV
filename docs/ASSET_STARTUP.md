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
