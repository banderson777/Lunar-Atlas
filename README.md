# Lunar Surface Atlas

Serve the static files over HTTP from this directory.

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000 in a WebGL-capable browser. Click terrain to fill the coordinate fields. Use Go to coordinates to move to the picked point, or switch from Orbit to Surface to land there. Drag to look around, Shift-drag to roll, and scroll to zoom. The focused viewport also supports arrow keys, Shift with the horizontal arrow keys, and +/−. Latitude and longitude are degrees north and east, respectively. In Surface mode the camera starts 1.7 m above the rendered mesh; eye height is adjustable from 1 to 100 m. Map light adds ambient illumination. Switch it off to see modeled day and night. The clock uses UTC.

## Data and fidelity

- NASA Scientific Visualization Studio's [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) supplies the LROC color mosaic and LOLA terrain. The viewer starts with the 2048 × 1024 global mosaic and loads a 4096 × 2048 version for close orbital zoom or Surface mode on compatible GPUs. Orbital zoom centers on a picked point and uses a narrower field of view once it reaches the 15 km altitude floor. Image resolution is independent of the terrain mesh. Local terrain detail can be toggled separately. The elevation file is the 4 pixels-per-degree floating-point TIFF repacked as little-endian Float32 kilometers relative to a 1737.4 km radius. The distant mesh samples this data once per degree, giving a roughly 30 km equatorial mesh spacing. At close range a local patch loads finer LOLA tiles at 16 samples per degree, about 1.9 km spacing at the equator, together with NASA Trek LROC image tiles.
- The cyan highlight marks the [LCROSS impact location](https://svs.gsfc.nasa.gov/3654/). Amber highlights indicate broad areas described in the [Clementine titanium results](https://www.lpi.usra.edu/lunar/missions/clementine/images/). The highlight sizes are illustrative and do not encode deposit boundaries or concentrations.
- [Astronomy Engine](https://github.com/cosinekitty/astronomy) supplies Sun and Moon vectors and the lunar rotation model. The sky loads 5,044 stars through visual magnitude 6 from d3-celestial with fixed J2000 positions; a small bright-star sample remains as a loading fallback. Proper motion and apparent stellar aberration are omitted. Terrain shadows can be enabled for the local patch. Eclipses are not modeled, and the orbit is an idealized circular preview.
- Feature names are a curated sample. This version has no archive crawler, spacecraft telemetry, pixel-level abundance queries, or mission navigation validation. Use it for exploration only.

## Mission sites

Enable Mission sites to show lunar landings, rovers, and impacts independently of feature names. Click a marker or choose a catalog entry to see its date, type, coordinate status, and NASA source links. Choosing a known location moves the camera there. The layer shows the complete 96-row NASA NSSDCA artifact catalog downloaded on 2026-11-17, whose latest listed arrival is Hakuto-R Mission 2 in June 2025. It includes 78 mapped records and 18 records with unknown locations. Approximate coordinates carry an ≈ symbol. Unknown sites, including uncertain orbital decays, remain in the list without invented coordinates. Separate hardware elements may have their own entries. Historical sites remain visible independently of simulation time.

Catalog source: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html

Mission labels now use magenta for landings and rovers, amber for impacts, and yellow crosses for CLPS. Natural feature labels stay pale blue/white. Mission country/agency and CLPS filters apply to both the list and map. Apollo and LCROSS entries are presented through the mission layer to avoid duplicate natural-feature labels.

The expanded catalog includes 109 records and 16 CLPS entries from NASA's artifact catalog and CLPS delivery pages checked on 2026-11-17. Three CLPS entries have actual lunar coordinates. Peregrine is listed with its no-arrival outcome. Twelve planned CLPS deliveries (including task orders with a lander still to be selected) have destination descriptions and appear in the list. Precise target coordinates are omitted pending confirmed sites. Future delivery dates and targets can change.

CLPS sources:
- https://science.nasa.gov/lunar-science/clps-deliveries/
- https://www.nasa.gov/commercial-lunar-payload-services/clps-landing-sites/

Mission sites are enabled initially. Show mission filters independently reveals country and CLPS controls. Hiding those controls resets both filters. The water-ice layer includes a cyan annotation and illustrative LCROSS evidence patch visible independently of surface lighting. View south-pole ice evidence centers an orbital camera on Cabeus. This highlight represents a detection site with illustrative extent, rather than a measured ice abundance raster.

Mission names have an operator prefix throughout the map, list, and details. Commercial flights use their company, U.S. government flights use NASA, and other historical flights use their national government or ESA. This includes Firefly: Blue Ghost 1, Intuitive Machines: Odysseus (IM-1), and ispace: Hakuto-R Mission 2. Task order metadata remains in the mission details.

National flags on map toggles locally bundled flag images beside mission labels. It starts off and applies independently of mission filters. Soviet missions use the historical Soviet flag. ESA uses the European flag. PNG assets are from https://flagcdn.com/ and the Soviet SVG is from https://commons.wikimedia.org/wiki/File:Flag_of_the_Soviet_Union.svg.

Selecting any mission shows a short goals summary and an outcome summary, with a source link. These cover all 109 records, including individual hardware components. Planned deliveries have pending outcomes. Controlled end-of-mission impacts are described separately from mission failure.

Select a mission and choose Pictures, videos and websites to open a media dialog. Every entry links to its mission record, a NASA Image and Video Library search, and a YouTube search. Blue Ghost 1 additionally has verified Firefly mission, Flickr album, and sunset-video links. Links open in a separate tab. Search results are labeled as searches and may include related missions or artist illustrations.

## Navigation and viewpoints

- Surface mode supports W/A/S/D walking with viewport focus and Forward/Left/Right/Back buttons. Steps can be 10, 100, or 1,000 m. Camera height follows the rendered terrain after each move and tile update.
- Coordinate grid draws 15-degree reference lines. The scale bar measures a local image segment on the lunar reference sphere and hides when the segment does not intersect terrain.
- Measure between clicks selects two terrain points and reports great-circle distance and initial bearing on the 1737.4 km reference sphere. This omits local slope and obstacles.
- Nearby mission labels cluster into buttons. Click a cluster to choose a member. Mission search matches words across name, operator, date, status, and outcome.
- Save stores named viewpoints in browser local storage. Copy link encodes camera, time, lighting, filters, and layers in the URL fragment. Links require the recipient to have access to a host serving the atlas. Shared views and saved state are validated before use.
- Time inputs are bounded to 1900–2100, which is an application display range without an accuracy guarantee across that interval.

## Detailed terrain and data provenance

The local mesh is a bounded circular patch of approximately 25,000 triangles. The loader reads gzip-compressed, overlapping LOLA tiles and retains at most 120 decoded elevation tiles after a load. Each tile encodes half-metre Int16 heights, converted from the NASA SVS 16-pixels-per-degree TIFF. Source resolution and rendering resolution are shown in the viewer. LROC imagery streams from NASA Trek with a bounded 48-image cache and at most four concurrent image requests per load. Stale loads are discarded as the view moves. Internet access to NASA Trek is required for streamed imagery. Bundled imagery and the coarse global mesh remain available when detailed data cannot load.

- Elevation source and conversion metadata are in `dist/terrain/metadata.json`.
- [NASA Trek LROC WAC service](https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml)
- [NASA SVS LOLA source](https://svs.gsfc.nasa.gov/4720/)
- [d3-celestial star source](https://github.com/ofrohn/d3-celestial/blob/master/data/stars.6.json). Coordinate and magnitude fields were retained. Its BSD license is bundled in `dist/stars-LICENSE.txt`.

The measured-resource selector loads published color visualizations from NASA Trek. The bundled Clementine TiO₂/FeO previews use level-2 equirectangular tiles at 2048×1024, about 5.3 km per displayed pixel at the equator. South-polar water-equivalent hydrogen uses Lunar Prospector's colorized reconstructed product in south-polar stereographic projection. The bundled polar image is 1024×1024 (about 2.1 km per displayed pixel), with a map extent of ±1,095,930 m. Actual sensing footprints and uncertainty vary. Color maps show remotely inferred composition and hydrogen signals. No reserve estimates or per-pixel concentrations are inferred by this app. Original source metadata is linked from each layer.

- [Clementine TiO₂ map](https://trek.nasa.gov/tiles/Moon/EQ/Clem_UVVIS_TiO2_Clr_Global_152ppd/1.0.0/WMTSCapabilities.xml)
- [Clementine FeO map](https://trek.nasa.gov/tiles/Moon/EQ/Clem_UVVIS_FeO_Clr_Global_152ppd/1.0.0/WMTSCapabilities.xml)
- [Lunar Prospector polar hydrogen map](https://trek.nasa.gov/tiles/Moon/SP/sp_weh_5km_adapt.map_clr/1.0.0/WMTSCapabilities.xml)

Optional terrain shadows cover a local region and use the simplified astronomical model. Sky brightness uses a fixed exposure. Detailed terrain remains far coarser than individual rocks or landers. Coordinate frame realization, sensor registration, terrain uncertainty, and ephemerides need independent validation for operational navigation.

## Checks

With Node.js 20 or newer, run `node --test tests/navigation.test.mjs tests/terrain.test.mjs` from this directory. These checks cover distances, pole/seam crossings, saved-state validation, and overlapping elevation-tile borders.

The browser regression is `tests/browser.cjs`. It requires the Playwright package and its Chromium browser, and a running atlas server. Set `ATLAS_BASE_URL` to that server's origin if it differs from http://127.0.0.1:8002/. A locally installed Playwright is used by default; `PLAYWRIGHT_MODULE` can point to an existing installation. Run `node tests/browser.cjs`. It checks WebGL shader errors, clusters, search, resources, measurements, surface movement, eye height, shadows, saved/shared state, and mobile overflow.
