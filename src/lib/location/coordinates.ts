function parseCoordinate(value: unknown) {
  if (typeof value === "number") return value;
  return typeof value === "string" && value.trim()
    ? Number(value)
    : Number.NaN;
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
