type ClientIdentity = {
  clientName: string;
  address?: string | null;
  province?: string | null;
  city?: string | null;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
};

function normalize(value?: string | null) {
  return (value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function locationKey(client: ClientIdentity) {
  const latitude = client.locationLatitude;
  const longitude = client.locationLongitude;
  if (
    typeof latitude !== "number" || !Number.isFinite(latitude) ||
    typeof longitude !== "number" || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180
  ) return null;

  // Compare saved pins at five decimal places (approximately one metre).
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

export function isPossibleDuplicateClient(first: ClientIdentity, second: ClientIdentity) {
  const name = normalize(first.clientName);
  if (!name || name !== normalize(second.clientName)) return false;

  const firstPin = locationKey(first);
  const secondPin = locationKey(second);
  if (firstPin && secondPin) return firstPin === secondPin;

  const address = normalize(first.address);
  return Boolean(address) && address === normalize(second.address) &&
    normalize(first.province) === normalize(second.province) &&
    normalize(first.city) === normalize(second.city);
}
