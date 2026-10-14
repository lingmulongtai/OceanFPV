# Photographed coastal cliff

The west island's eastern cape uses [Coastal Cliff 02 by Rob Tuytel](https://polyhaven.com/a/coastal_cliff_02), under [Poly Haven CC0](https://polyhaven.com/license). The source package and hashes are in `public/models/coastal_cliff_02/manifest.json`. Its original glTF, binary and three 4K textures add 59,074,649 bytes; the photographic assets now total about 208 MB before code/audio. Texture resolution does not reduce this model's geometry.

The supplied mesh contains 943,284 triangles and is about 40.928 × 10.053 × 8.648 m. Its captured UVs, normals, index and scale are retained. Placement is (-390,-3,-450) m with 90° yaw. This is one photographed section of a procedural island, not a surveyed reconstruction of the whole island.

## Surface contacts and terrain

The scan has one open boundary, with 2,256 edges after exact-position welding. A back-cap experiment passed edge pairing but failed independent triangle intersection checks, so it was rejected. Gameplay instead checks the drone's previous-to-current segment against the exact photographed triangles, with a 0.25 m margin. Both face crossings and grazing contact are covered; distant air behind an open scan is not classified as a solid interior.

`CliffGround` clones the island geometry and lowers a local area in front of the scan. Its rear transition from world X=-402 to -389 m retains dry land behind the cliff; the earlier deeper cut left a visible water gap. Ground collision samples the same Float32 heights and triangle diagonal as rendering. Original distant vertices and indices remain unchanged. Trees and rocks touching the changed area are removed before detailed models load. Rendering and contact lists share their retained entries, including fallback rocks. The current scene has 165 island rocks plus nine lighthouse outcrops, 174 total.

The original terrain and placements remain intact if cliff loading fails. Once the cliff loads successfully, the joined ground, depth and contact surface are installed before forest and rock placement. The sky and ordinary surface textures can load concurrently.

## Water depth

The island's 3.25 m grid is too coarse for the cliff footprint. Uploading scan heights into that grid broadened shallow water into empty space and omitted some real shelves. The island channel therefore retains the exact carved ground heights. A separate 512² Float32 texture covers the scan plus a 0.25 m border: about 1.79 × 8.11 cm per cell, 1 MiB of scalar payload. Its highest surface is combined with the ground on both CPU and GPU, using the same triangular interpolation and gradient. Water uses one additional sampler.

This is a sampled upper envelope for wave attenuation and shoreline shading. It does not replace exact mesh contacts or represent overhangs as volumes. On the same 3,104 points at 0.5 m spacing, with the final connected ground, mean absolute height error fell from 1.35336 m for the coarse grid to 0.02022 m. Waterline sign disagreements fell from 337 to six. The two previously incorrect shelf witnesses differ by 1.78 mm and 2.69 mm after the change.

Large isolated errors remain where the footprint changes abruptly: the measured maximum is 10.347 m, and twelve sampled fringe points exceed 10 cm. These maxima must not be hidden by the mean. This grid is not fluid simulation, and the foam is an artistic approximation. Source test artifacts retain both the original and revised measurements.

## Verification

- Unit checks cover unchanged source indices, exact boundary tracing, open-surface sweeps in both directions, face-interior and grazing cases, clear air, ground interpolation, preserved distant vertices, and the detailed depth's height/gradient.
- Actual browser checks cover model activation, exact photographed contacts, shared ground/depth uploads, 174 rendered/contact rock placements, missing cliff recovery, and matching fallback rock visibility/contact counts.
- A 77-point WebGL probe compares the new depth, gradient and attenuation with CPU sampling. Native RTX 4050/Direct3D11 maximum errors: height 0.0000241 m, gradient 0.0000833, attenuation 0.0000228. SwiftShader: 0.0000668 m, 0.0000863, 0.0000525.
- ULTRA captures use 1920×1280 drawing buffers, fixed time 120 s, breeze, matching front/close/fringe views in day and golden light. The final join was inspected for the rear water gap and front terrain protrusion. Static capture HUD values are not sustained flight benchmarks.

The broader island shape and material still need further realism work. Sustained performance, other physical GPUs, and physical Xbox/USB transmitter acceptance remain separate verification tasks.
