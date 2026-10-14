# Shoreline foam detail

The former shoreline coverage used smooth metre-scale noise; its fine noise changed only colour. Close views therefore showed a blurred white sheet. The material now gives shoreline coverage irregular pores from three noise scales with cell widths of approximately 4.17, 1.92 and 0.87 cm. These are pattern scales, not a physical bubble-size model.

Each scale fades towards 0.5 as its cell falls from four to two screen pixels. The coverage threshold also fades to 0.5 when the coarsest cells become unresolved. Contour derivatives are evaluated before the ship-hull discard. Foam colour uses the filtered pattern too. This changes mean shoreline coverage; it does not preserve the former continuous white sheet's opacity.

The old sine hash produced visible grids in fine detail and different patterns across native Direct3D11 and Vulkan SwiftShader. A 32-bit unsigned integer mixing hash now supplies the lattice values, returning its upper 24 bits as a float. Three's generated shader precision is retained. This makes integer lattice hashing stable; floating-point coordinate interpolation and final pixels are not claimed identical across GPUs. The same hash also changes the coarse foam pattern used by wave crests and wakes.

References: [Crest's foam appearance documentation](https://docs.crest.waveharmonic.com/Manual/Appearance/Foam.html), its [coverage shader](https://github.com/wave-harmonic/crest/blob/master/crest/Assets/Crest/Crest/Shaders/OceanFoam.hlsl), [filter-width estimates](https://developer.nvidia.com/gpugems/gpugems/part-iv-image-processing/chapter-25-fast-filter-width-estimates-texture-maps), [GPU hash comparisons](https://jcgt.org/published/0009/03/02/paper.pdf), and the [GLSL ES specification](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf). The custom mixing hash has not undergone those papers' statistical test suites.

## Verification and limits

- 47 unit cases, the strict production build and all 11 native RTX 4050 browser cases passed (2.6 minutes).
- Actual production fragment-shader readback passed eight controlled flat-water cases on each GPU backend. Near pores span zero to one. Subpixel coverage converges to 0.5 and stays unchanged under a 1 mm translation. The near mean was 0.419451 on Direct3D11 and 0.419448 on SwiftShader; these are local measurements, not a global distribution claim. Wave displacement was disabled only in this isolated filter probe.
- Thirty-six fixed-camera/time ULTRA captures compare the historical material, shoreline foam disabled, and the new material: four coastal distances and three light presets, with no page/console errors and unchanged geometry/draw counts. New close day, golden shore, day cliff and far blue views were inspected. Coarse single-scale and sine-hash trials were rejected visually before committing.

There are no new textures, samplers or geometry. Fine coverage adds shader arithmetic and does not simulate breaking-wave dynamics or foam advection. Aggregate software-browser CI, sustained low-FPS gameplay, other GPUs and physical controllers remain unaccepted. The parent rock/material PRs remain unpublished while their slow-render flight/race failures are being resolved.
