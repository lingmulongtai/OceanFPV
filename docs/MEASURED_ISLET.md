# Measured coastal islet

The southwestern island uses the reproducible derivative in `src/data/measured-islet.json`. Its metre-scale relief replaces the former radial hill with low rock shelves, small detached islets and inlets. The 600 m square is translated to game centre (-850,420); this remains a fictional map, with the northern islands retaining their procedural terrain. The same 193×193 vertices supply rendering, contact heights, slopes, vegetation and the blue channel of the ocean's depth texture. Publication verification remains pending.

Source: ©Kartverket, [DTM1 tile 33-108-101](https://nedlasting.geonorge.no/hoydedata/DTM1/33-108-101.tif), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [provider terms](https://www.kartverket.no/api-og-data/vilkar-for-bruk/). The source TIFF SHA-256 is `9d29a9bd0411f20b4e53bc7834f42ff829f7ba1f4822affa3b8b949e90e02d2b`. It contains a 15010×15010 Float32 raster with 1 m cells and -32767 NoData. Its embedded horizontal coordinates are ETRS89 / UTM33N. The vertical datum is unconfirmed; no survey-height, tide-datum or NN2000:2025 claim is made. The feed also names NLOD2.0, which permits adaptations/redistribution and declares CC BY4.0 compatibility; its historical scope has not been established.

The source window is `[12380,1000,12880,1500]`. The first pixel centre is E32805.5/N6455004.5. Local zero corresponds to the crop centre E33055/N6454755; increasing local Z runs south. The 500 m crop has no missing pixels and a maximum source height of 22.07818 m.

Processing retains heights above 0.3 as land, removes eight-connected land touching a crop edge, and replaces water with synthetic chamfer-distance depth at 0.4 m per metre, capped at 9 m. The depth field extends through a 50 m outer border, avoiding a rectangular underwater drop at the source crop. It is synthetic game bathymetry. Land and horizontal distances are not exaggerated. The derivative stores 193×193 millimetre-quantized heights across 600 m: actual vertex spacing is 3.125 m and the retained maximum is 21.912 m. Storage precision does not imply survey accuracy. Each boundary is -9 m.

After downloading the reviewed source TIFF, reproduce the derivative with:

```sh
npm ci
npm run import:islet -- /path/to/33-108-101.tif
```

The importer verifies the entire TIFF hash before decoding or writing. A different delivery requires reviewing its provenance and updating the recorded source explicitly. The full source TIFF is not redistributed. Generated JSON SHA-256: `dd196170ef1743d43c4e38cc1a06d34a49489169c4a9fb81eab4b5f4ccf8ee23`.

Tests cover analytical pixel-centre/slope witnesses, unchanged source data, missing/overflow rejection, and a low shore immediately inside the crop with continuous depth outside it. Independent samples from the actual raw crop also verify retained land heights and the final asset's byte identity.

## Integration and evidence

Rock candidates cover the irregular island rather than a radial coastal ring. The captured rocks require at least 80% of their bottom samples to be embedded in the actual terrain; rendered instances and collision placements share the accepted transforms. The measured island has 79 accepted captured rocks and 17 dry-slope trees. Fallback rocks use the same candidate locations. The original two islands retain their placement rules and forest density checks.

Detailed shelves exposed a 5.18 mm contact error under strong crossed swell: the inverse horizontal wave displacement stopped after six iterations. Coastal sampling now allows twelve iterations and stops early when successive source positions differ by less than one micrometre. The same 5,436 coastal sample/state combinations have a maximum CPU reconstruction error of 0.171 mm. The existing 4 mm shoreline unit threshold is preserved.

- All 125 unit tests and the strict production build pass, including full ship footprints at all 360 route phases, both triangle halves, independent height gradients, and every uploaded measured vertex.
- Native RTX4050/D3D11 browser checks pass 7/7: complete scene, missing cliff, fallback rock contacts, nearshore GPU sampling, keyboard flight/pause/reset after collision, help layout, and actual terrain/reef contacts. The measured mesh's 37,249 vertices match depth data; twelve dry surface ray hits contact the island while points 0.6 m above remain free. The water opening at (-850,550) has a -9 m floor and free air at 10 m.
- Native and SwiftShader both pass 4,116 GPU nearshore cases and 896 mip cases. Measured-island samples explicitly cover land, waterline and twelve depth targets through 8.2 m. Maximum native height/contact differences are 2.81/2.69 mm; SwiftShader 0.208/0.143 mm. Existing normal, variance and mip thresholds are preserved. SwiftShader terrain-contact and GPU checks pass 2/2.
- Six actual main-renderer captures use RTX4050, ULTRA1920×1280, fixed wave/vessel time120, three cameras and day/evening light. Browser errors are empty; low-shore, close and wide images were inspected. The captured composition uses all photographic materials, without fallback.

The source does not supply measured vegetation, photographic land cover or sea depth. Trees and separate boulders remain procedural placements, and their material contrast/repetition remains an appearance limit. Other islands still have smooth procedural silhouettes. These checks do not establish sustained performance, physical controller acceptance, or a fully measured map. Complete CI and public deployment checks remain separate gates.
