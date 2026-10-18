# Startup timing

The native ULTRA production build took 102.6 and 119.3 seconds to enable Start
in two local observations. An earlier 120-second readiness check timed out.
Those observations do not identify the cause: completed downloads do not cover
HDR conversion, model processing, lighting preparation or the first scene draw.

The application records `oceanfpv:` Performance Marks on its existing startup
path. Read them in DevTools or without changing application state:

```js
performance.getEntriesByType('mark')
  .filter(entry => entry.name.startsWith('oceanfpv:'))
  .map(({ name, startTime }) => ({ name, startTime }));
```

| Start and end suffixes | Recorded work |
| --- | --- |
| `boot-start` → `renderer-created` | WebGL renderer creation |
| `cabin-occlusion-start` → `cabin-occlusion-ready` | Existing baked cabin visibility load |
| `world-build-start` → `world-build-ready` | Initial geometry, world and collision construction |
| `procedural-lighting-start` → `procedural-lighting-submitted` | Procedural sky cube and its PMREM submission |
| `initial-gpu-start` → `initial-gpu-ready` | Existing GPU readiness fence |
| `scene-assets-start` → `scene-assets-ready` | Complete optional asset and lighting preparation gate |
| `surface-textures-start` → `surface-textures-settled` | Surface downloads, bitmap decoding and material assignment, including fallbacks |
| `cliff-load-start` → `cliff-load-settled` | Photogrammetry loading and processing, including fallback |
| `cliff-install-start` → `cliff-install-ready` | Cliff/ground join, water-depth and obstruction updates |
| `natural-assets-start` → `natural-assets-settled` | Tree, rock and surface preparation after cliff installation |
| `photo-day-download-start` → `photo-day-download-ready` | Captured sky download and response body |
| `photo-day-decode-start` → `photo-day-decode-ready` | HDR parsing, exposure conversion and texture creation |
| `photo-day-pmrem-start` → `photo-day-pmrem-submitted` | Photographic environment prefilter submission |
| `tree-model-start` → `tree-model-ready` | Tree model loading and parsing |
| `tree-build-start` → `tree-build-ready` | Tree processing and instance/atlas preparation after lighting is available |
| `tree-atlas-start` → `tree-atlas-submitted` | Initial eight-view tree atlas submission |
| `first-view-start` → `first-view-ready` | Initial vessel pose, waves, vegetation and lighting update |
| `scene-shaders-start` → `scene-shaders-ready` | Initial scene program preparation |
| `first-draw-start` → `first-draw-submitted` | Initial complete composer draw submission |
| `boot-start` → `game-ready` | Boot entry to enabling Start |

The photographic sky marks use `photo-golden-` for the other captured light
preset. Subsequent sky loads can add another set. Use the matching entries from
one startup when computing durations. A failed optional load may lack its end
mark; the tree failure path records `tree-load-failed`. A `settled` mark alone
does not prove that the photographic asset was used: check the existing surface
status and fallback diagnostics as well.

These are main-thread wall-clock boundaries. `submitted` means the renderer
call returned; it does **not** establish GPU completion or exclusive GPU time.
Only the existing initial fence explicitly waits for GPU readiness. Concurrent
downloads and lighting/model work overlap, so their durations must not be added
to estimate total startup time. Browser scheduling and driver blocking can be
included in a measured interval.

The marks themselves add no requests, timers, extra renders, GPU fences, quality changes,
new startup waits or loading-order changes. They send no telemetry and do not
expose the development-only world controls. These diagnostics establish a
baseline before choosing a startup optimization; they are not themselves a
claim of faster startup.

## Native observation

One actual minified production startup with these marks used DAY/SWELL/ULTRA,
a 1920×1280 framebuffer and an RTX4050 through D3D11. All 19 expected timing
pairs were present and ordered, with 39 successful asset responses, no fallback,
no browser errors and no pending requests at readiness. Selected wall times:

| Boundary | Seconds |
| --- | ---: |
| World construction | 14.938 |
| Initial GPU readiness fence | 0.033 |
| Complete scene asset preparation | 12.457 |
| Photographic HDR download/body | 8.584 |
| Photographic HDR decode | 1.506 |
| Photographic PMREM submission | 1.400 |
| Tree model loading/parsing | 1.458 |
| Tree build including atlas | 0.949 |
| First complete composer draw submission | 76.703 |
| Boot entry to enabling Start | 106.235 |

This sample locates the largest measured interval inside the first complete
draw call. It does not yet distinguish shader compilation, texture or geometry
uploads, draw submission, driver stalls or background contention. The initial
GPU fence and HDR decode were substantially shorter in this run; that does not
prove the cause of a different run's timeout. Do not add overlapping rows or
claim a startup improvement from this single instrumented observation.

## Prepare scene programs before the first draw

After preparing the real view, materials and lighting, boot calls
[`WebGLRenderer.compileAsync`](https://threejs.org/docs/pages/WebGLRenderer.html#compileAsync)
once. It selects programs with `composer.readBuffer` bound, matching RenderPass's
linear HDR target rather than compiling an unnecessary screen-output variant.
The original render target, cube face and mip are restored synchronously before
awaiting program readiness. The original complete composer draw still follows.

The `parallel-shaders-supported` or `parallel-shaders-unavailable` mark records
the actual `KHR_parallel_shader_compile` capability. Three uses its ordinary
fallback when the extension is unavailable. Scene preparation does not replace
texture uploads, shadow/transmission/reflection passes, background or fullscreen
postprocessing. Their remaining preparation can still occur during the draw.

One instrumented native comparison used the same full production quality and
timed original WebGL calls without changing their arguments or returned values:

| Boundary | Before | Parallel preparation |
| --- | ---: | ---: |
| Boot entry to enabling Start | 112.861 s | 81.211 s |
| First complete composer draw submission | 78.871 s | 3.239 s |
| Explicit scene program readiness | — | 47.347 s |
| Total program-info-log queries | 80.031 s | 4.447 s |

The largest original query waited 57.301 seconds for the ocean's ReflectorShader
program. A separate production run without the WebGL timing wrappers enabled
Start in 77.872 seconds and passed keyboard climb, light settings, pause/resume,
reset and real mouse pointer lock, with 40 successful asset responses and no
browser errors. These are short RTX4050/D3D11 observations in fresh browser
contexts, not a general startup percentage or an in-flight FPS claim.

Context loss retains the existing reload message and disabled Start. The
[KHR specification](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/)
requires a true completion result on context loss, allowing Three's pending
poll to finish; boot's existing support check then returns before enabling
Start. The regression fixture deliberately holds completion false during
preparation to reach this path deterministically, then uses the real
`WEBGL_lose_context` extension and verifies that polling stops. It does not
replace the actual shader output or dispatch a synthetic context-loss event.
The case passed with native D3D11 and with forced SwiftShader. It checks the
actual supported or unsupported path, a trusted loss event, the existing reload
focus, disabled Start, no game-ready transition, and zero remaining 10ms polls
whose count stays unchanged after recovery. It makes no physical-controller
acceptance claim.
