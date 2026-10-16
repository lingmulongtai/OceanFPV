# Prepared measured coastal islet

`src/data/measured-islet.json` is a reproducible terrain derivative prepared for the southwestern island. The game does not consume it yet. The same main renderer has been used for a temporary comparison, but complete mesh/contact/bathymetry/placement integration and publication remain pending.

Source: ©Kartverket, [DTM1 tile 33-108-101](https://nedlasting.geonorge.no/hoydedata/DTM1/33-108-101.tif), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), [provider terms](https://www.kartverket.no/api-og-data/vilkar-for-bruk/). The source TIFF SHA-256 is `9d29a9bd0411f20b4e53bc7834f42ff829f7ba1f4822affa3b8b949e90e02d2b`. It contains a 15010×15010 Float32 raster with 1 m cells and -32767 NoData. Its embedded horizontal coordinates are ETRS89 / UTM33N. The vertical datum is unconfirmed; no survey-height, tide-datum or NN2000:2025 claim is made. The feed also names NLOD2.0, which permits adaptations/redistribution and declares CC BY4.0 compatibility; its historical scope has not been established.

The source window is `[12380,1000,12880,1500]`. The first pixel centre is E32805.5/N6455004.5. Local zero corresponds to the crop centre E33055/N6454755; increasing local Z runs south. The 500 m crop has no missing pixels and a maximum source height of 22.07818 m.

Processing retains heights above 0.3 as land, removes eight-connected land touching a crop edge, and replaces water with synthetic chamfer-distance depth at 0.4 m per metre, capped at 9 m. The depth field extends through a 50 m outer border, avoiding a rectangular underwater drop at the source crop. It is synthetic game bathymetry. Land and horizontal distances are not exaggerated. The derivative stores 193×193 millimetre-quantized heights across 600 m: actual vertex spacing is 3.125 m and the retained maximum is 21.912 m. Storage precision does not imply survey accuracy. Each boundary is -9 m.

After downloading the reviewed source TIFF, reproduce the derivative with:

```sh
npm ci
npm run import:islet -- /path/to/33-108-101.tif
```

The importer verifies the entire TIFF hash before decoding or writing. A different delivery requires reviewing its provenance and updating the recorded source explicitly. The full source TIFF is not redistributed. Generated JSON SHA-256: `dd196170ef1743d43c4e38cc1a06d34a49489169c4a9fb81eab4b5f4ccf8ee23`.

Tests cover analytical pixel-centre/slope witnesses, unchanged source data, missing/overflow rejection, and a low shore immediately inside the crop with continuous depth outside it. Independent samples from the actual raw crop also verify retained land heights and the final asset's byte identity. The existing rendering/contact grid must be retained when integrating this derivative; procedural circular rock-placement and fixed forest-count assumptions require separate changes.
