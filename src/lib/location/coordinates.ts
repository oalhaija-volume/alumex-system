function parseCoordinate(value: unknown) {
  if (typeof value === "number") return value;
  return typeof value === "string" && value.trim()
    ? Number(value)
    : Number.NaN;
}

export const outdoorSiteDuplicateRadiusMeters = 200;

export function distanceBetweenCoordinatesMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.asin(Math.sqrt(haversine));
}

export function parseProjectLocation(latitude: unknown, longitude: unknown) {
  const parsedLatitude = parseCoordinate(latitude);
  const parsedLongitude = parseCoordinate(longitude);
  const isValid =
    Number.isFinite(parsedLatitude) &&
    parsedLatitude >= -90 &&
    parsedLatitude <= 90 &&
    Number.isFinite(parsedLongitude) &&
    parsedLongitude >= -180 &&
    parsedLongitude <= 180;

  return {
    isValid,
    latitude: isValid ? parsedLatitude : null,
    longitude: isValid ? parsedLongitude : null,
  };
}

export function normalizeGeofenceRadius(value: unknown) {
  const radius = Number(value);
  return Math.min(1000, Math.max(25, Number.isFinite(radius) ? radius : 100));
}
