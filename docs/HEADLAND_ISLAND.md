# Western headland island

The western island previously used the same circular mound as the other islands. It now has two extended ridges, a low eastern cape, coastal shelves and a southeast bay connected to open water. The island remains inside its existing terrain grid. The other two islands retain their radial profiles.

`TerrainProfile` travels through the rendered height field, triangle interpolation, bathymetry, flight contacts, tree placement and both photographed and fallback rock placement. A bay is therefore open in the visible land, water-depth texture and collision surface. The photographed rocks sample the whole headland footprint so its inner coast receives rocks as well as the outer shore.

The fictional height field is hand-authored. [NPS Rocky Coast Landforms](https://www.nps.gov/articles/rocky-coast-landforms.htm) informed the use of headlands, protected bays and coastal terraces; this is not a measured elevation dataset or an erosion simulation.

## Verification on 2026-10-14

- Before changing the shape, 12,000 height samples, all three tree groups and 595,984 bathymetry bytes matched the previous radial implementation exactly after profile propagation.
- Final source: 55 unit tests and the strict TypeScript/Vite build pass. Tests cover both profiles, the open bay, ridge extents, dry tree roots, photographed rock supports, water-depth interpolation and complete ship-route footprints outside shallow shelves.
- All 13 browser tests pass with an RTX 4050 through ANGLE/D3D11. The scene and headland consistency cases also pass through SwiftShader. The latter checks the actual rendered vertices against the bathymetry data uploaded by the world and checks bay/ridge contacts; it is not a GPU depth readback.
- Twelve before/after pairs use four camera poses and day, golden and blue lighting at ULTRA, with the same 1920×1280 buffer, camera transform and wave/vessel time of 120 seconds. Neither capture reports page or console errors. These are still-frame checks, not sustained frame-rate measurements.
- The new island has 79 valid trees and 90 photographed rocks under the existing slope, height and contact constraints. There are 254 trees and 270 photographed rocks across the map.

## Remaining work

Nearshore water depth currently changes shading and foam rather than wave refraction or breaking geometry. More credible shallow-water motion and further coastline variety remain visual priorities. Physical Xbox/USB transmitter acceptance, other GPUs and long-session stability are not established by this change.
