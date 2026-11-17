# Lunar Surface Atlas

Serve the static files over HTTP from this directory.

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000 in a WebGL-capable browser. Click terrain to fill the coordinate fields. Use Go to coordinates to move to the picked point, or switch from Orbit to Surface to land there. Drag to look around, Shift-drag to roll, and scroll to zoom. The focused viewport also supports arrow keys, Shift with the horizontal arrow keys, and +/−. Latitude and longitude are degrees north and east, respectively. In Surface mode the camera is placed 1.7 m above the rendered mesh. Map light adds ambient illumination. Switch it off to see modeled day and night. The clock uses UTC.

## Data and fidelity

- NASA Scientific Visualization Studio's [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/) supplies the LROC color mosaic and LOLA terrain. The viewer starts with the 2048 × 1024 global mosaic and loads a 4096 × 2048 version for close orbital zoom or Surface mode on compatible GPUs. Orbital zoom centers on a picked point and uses a narrower field of view once it reaches the 15 km altitude floor. The finer imagery does not change the resolution of the terrain mesh. The elevation file is the 4 pixels-per-degree floating-point TIFF repacked as little-endian Float32 kilometers relative to a 1737.4 km radius. The mesh samples this data once per degree, giving a roughly 30 km equatorial mesh spacing.
- The cyan highlight marks the [LCROSS impact location](https://svs.gsfc.nasa.gov/3654/). Amber highlights indicate broad areas described in the [Clementine titanium results](https://www.lpi.usra.edu/lunar/missions/clementine/images/). The highlight sizes are illustrative and do not encode deposit boundaries or concentrations.
- [Astronomy Engine](https://github.com/cosinekitty/astronomy) supplies Sun and Moon vectors and the lunar rotation model. The sky contains a small built-in sample of bright stars with fixed J2000 coordinates. Lighting does not model terrain-cast shadows or eclipses, and the orbit is an idealized circular preview.
- Feature names are a curated sample. This version has no archive crawler, tiled regional DEMs, resource abundance rasters, spacecraft telemetry, or mission navigation validation. Use it for exploration only.

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
