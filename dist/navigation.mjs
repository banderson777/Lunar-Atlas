export const MOON_RADIUS = 1737.4;
const radians = Math.PI / 180;
export const wrapLongitude = value => ((value + 180) % 360 + 360) % 360 - 180;

export function destination(latitude, longitude, bearing, distanceKm) {
  const lat = latitude * radians;
  const lon = longitude * radians;
  const angle = distanceKm / MOON_RADIUS;
  const heading = bearing * radians;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(angle) +
    Math.cos(lat) * Math.sin(angle) * Math.cos(heading));
  const nextLon = lon + Math.atan2(Math.sin(heading) * Math.sin(angle) * Math.cos(lat),
    Math.cos(angle) - Math.sin(lat) * Math.sin(nextLat));
  return { lat: nextLat / radians, lon: wrapLongitude(nextLon / radians) };
}

export function measure(a, b) {
  const lat1 = a.lat * radians, lat2 = b.lat * radians;
  const delta = wrapLongitude(b.lon - a.lon) * radians;
  const h = Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(delta / 2) ** 2;
  const distance = 2 * MOON_RADIUS * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
  const bearing = (Math.atan2(Math.sin(delta) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta)) / radians + 360) % 360;
  return { distance, bearing: distance < 1e-8 ? null : bearing };
}

export function validateView(value) {
  if (!value || value.version !== 1 || !['orbit', 'surface'].includes(value.mode)) return false;
  const bounds = {
    latitude: [-90,90], longitude: [-180,180], orbitLat: [-90,90], orbitLon: [-180,180],
    altitude: [15,30000], heading: [-180,180], pitch: [-89.9,89.9], roll: [-180,180],
    fov: [6,90], eyeHeight: [1,100], time: [-2208988800000,4133980799999]
  };
  if (!Object.entries(bounds).every(([key,[min,max]]) =>
    Number.isFinite(value[key]) && value[key] >= min && value[key] <= max)) return false;
  if (value.filters && (typeof value.filters !== 'object' ||
    typeof value.filters.country !== 'string' || typeof value.filters.query !== 'string' ||
    typeof value.filters.clps !== 'boolean' || typeof value.filters.visible !== 'boolean')) return false;
  return value.layers && ['relief','labels','ice','metal','missions','mission-flags','grid','shadows']
    .every(key => typeof value.layers[key] === 'boolean') && typeof value.map === 'boolean';
}
