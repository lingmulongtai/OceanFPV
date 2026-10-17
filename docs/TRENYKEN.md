# Measured northwestern island

The former two procedural ridges are replaced by the complete Trenyken coastal terrain. Its three peaks, gullies, low shelves and surrounding small outcrops come from a measured 1 m DTM. The 1200 m square is rendered with 769² vertices, 1.5625 m apart, and millimetre-quantized Float32 heights. The derivative summit is 142.301 m; horizontal distances and elevations are not exaggerated.

The game translates this crop to `(-730,-490)` in world X/Z. This keeps the large island beside the straight liner corridor, with water separating it from the southwestern islet. All positive terrain cells remain inside the 1900 m flight boundary. Map placement, trees, grass, photographed rocks and waves are authored game scenery, not a reconstruction of Trenyken's actual environment.

## Reproduce the terrain

- Source: [Kartverket DTM1 tile 33-131-170](https://nedlasting.geonorge.no/hoydedata/DTM1/33-131-170.tif), `NDH Røst 2pkt 2019`, EPSG:25833 / ETRS89 UTM zone 33N.
- Reviewed tile: 31,650,748 bytes, ETag `"62c476b0-1e2f3bc"`, SHA-256 `4cca71e488cbab195e6e96f35227f2482d25470bd57bbc18d703c81d9d012bb6`.
- TIFF origin `(365425,7491005)`, 1 m PixelIsArea samples. Crop pixel window `[950,7050,2150,8250]`; first pixel centre `(366375.5,7483954.5)`.
- Extracted 1200² little-endian Float32 crop SHA-256: `7ebdef04ab4c796c5248a1e3b71c26ace176864a33d57202b0ec8f46fbaa5406`.
- Derivative `src/data/trenyken.json` SHA-256: `010cbc34905a47496864a3f22e5395f7c5f27e7b7c6b977907692ddb28a605ef`.

Download the pinned source to an ignored local path, then run:

```sh
npm ci
npm run import:northwest -- artifacts/dtm-33-131-170.tif
node --import tsx --test tests/trenyken-import.test.ts tests/trenyken-data.test.ts tests/trenyken.test.ts
```

The importer rejects changed bytes, unexpected TIFF dimensions/origin/resolution, missing samples and a changed extracted crop. Land is classified at >0.3 m; boundary-connected land is removed. Water is replaced by synthetic chamfer-distance depth ×0.4, capped at 9 m. **There is no measured bathymetry, and the vertical datum is unconfirmed.** Source pixels are sampled at their centres without adding terrain noise.

© Kartverket, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [provider terms](https://kartverket.no/api-og-data/vilkar-for-bruk). The game retains its existing visible Kartverket credit. See [THIRD_PARTY.md](../THIRD_PARTY.md) for separate asset licenses.

## Shared geometry and water

Flight contacts and cover slope use the same triangle diagonal and grid as rendering. The photographed 40.9 m cliff keeps its captured scale and position; its local ground join now samples the actual mesh resolution. The join's modified vertices also update water depth before the next frame. Rocks and trees are excluded from that join.

The existing detailed island sampler stores Hornøya in R and Trenyken in G of one 769² RG32F texture (4,730,888 bytes). Each island uses its own world bounds and triangle interpolation. A fine island replaces its own coarse channel, so coarse heights cannot fill narrow valleys. Installing the photographed cliff updates G and every fourth vertex in the coarse channel while preserving R. Its separate cliff-depth grid is derived from the modified fine terrain.

This adds no water sampler: the existing 16-sampler water-program budget is retained. Nearest texture sampling with explicit interpolation avoids relying on float linear-filter support.

## Evidence and limits

Native RTX 4050 / Direct3D11 comparisons used ULTRA/DAY, fixed overview and cliff cameras, frozen t=0 waves and identical sun settings. The complete natural coast is visibly less regular than the former rounded ridge masks, and the existing photographed cliff remains connected. These are static visual comparisons, not sustained frame-rate measurements. Close rock appearance can still be improved.

The GPU nearshore probe exercises both triangle halves and independent bounds for both measured islands, including dry peaks, shallow water and the sea border. It compares 8,176 wave/normal/variance cases and 24 direct fine-depth cases. Regression tests also retain the legacy procedural headland witnesses, physical rock support, all vessel footprints and the missing-cliff fallback.
