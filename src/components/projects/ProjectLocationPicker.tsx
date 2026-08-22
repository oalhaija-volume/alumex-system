"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";

const tileSize = 256;
const defaultLocation = {
  latitude: 33.3152,
  longitude: 44.3661,
};
const defaultGeofenceRadiusMeters = 100;

type Tile = {
  x: number;
  y: number;
  left: number;
  top: number;
};

type LocationSearchResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
};

function clampLatitude(latitude: number) {
  return Math.max(Math.min(latitude, 85.0511), -85.0511);
}

function longitudeToWorldX(longitude: number, zoom: number) {
  const scale = 2 ** zoom * tileSize;
  return ((longitude + 180) / 360) * scale;
}

function latitudeToWorldY(latitude: number, zoom: number) {
  const scale = 2 ** zoom * tileSize;
  const radians = (clampLatitude(latitude) * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) *
    scale
  );
}

function worldXToLongitude(worldX: number, zoom: number) {
  const scale = 2 ** zoom * tileSize;
  return (worldX / scale) * 360 - 180;
}

function worldYToLatitude(worldY: number, zoom: number) {
  const scale = 2 ** zoom * tileSize;
  const y = Math.PI - (2 * Math.PI * worldY) / scale;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(y) - Math.exp(-y)));
}

function formatCoordinate(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(6)
    : "Not pinned";
}

function metersPerPixel(latitude: number, zoom: number) {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

export function ProjectLocationPicker({
  latitude,
  longitude,
  geofenceRadiusMeters,
  onChange,
  onRadiusChange,
  allowRadiusChange = true,
  readOnly = false,
  enableSearch = false,
  showGeofence = true,
  title = "Map location",
  editableDescription = "Click the map to place the exact project pin and set the check-in geofence.",
  readOnlyDescription = "Pinned project location and check-in geofence.",
  mapAriaLabel = "Project map location picker",
  searchLabel = "Search for a location",
  searchPlaceholder = "Search by place, street, or address",
  searchButtonLabel = "Search",
  searchingLabel = "Searching...",
  noResultsLabel = "No matching locations found.",
  searchErrorLabel = "Unable to search locations.",
  currentLocationLabel = "Use current location",
  locatingLabel = "Locating...",
  currentLocationErrorLabel = "Unable to access your current location.",
  radiusDescription = "Future installation check-ins can be accepted only inside this radius.",
  onSearchSelect,
  onCurrentLocationSelect,
}: {
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
  onChange: (location: { latitude: number | null; longitude: number | null }) => void;
  onRadiusChange?: (radius: number) => void;
  allowRadiusChange?: boolean;
  readOnly?: boolean;
  enableSearch?: boolean;
  showGeofence?: boolean;
  title?: string;
  editableDescription?: string;
  readOnlyDescription?: string;
  mapAriaLabel?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  searchButtonLabel?: string;
  searchingLabel?: string;
  noResultsLabel?: string;
  searchErrorLabel?: string;
  currentLocationLabel?: string;
  locatingLabel?: string;
  currentLocationErrorLabel?: string;
  radiusDescription?: string;
  onSearchSelect?: (address: string) => void;
  onCurrentLocationSelect?: (location: {
    latitude: number;
    longitude: number;
  }) => void;
}) {
  const hasPin =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude);
  const [zoom, setZoom] = useState(14);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const reverseLookupRequestId = useRef(0);
  const [center, setCenter] = useState({
    latitude: hasPin ? latitude : defaultLocation.latitude,
    longitude: hasPin ? longitude : defaultLocation.longitude,
  });
  const centerWorldX = longitudeToWorldX(center.longitude, zoom);
  const centerWorldY = latitudeToWorldY(center.latitude, zoom);
  const tileCount = 2 ** zoom;
  const radiusMeters = geofenceRadiusMeters ?? defaultGeofenceRadiusMeters;
  const radiusPixels = hasPin
    ? Math.max(radiusMeters / metersPerPixel(latitude, zoom), 12)
    : 0;
  const tiles = useMemo<Tile[]>(() => {
    const centerTileX = Math.floor(centerWorldX / tileSize);
    const centerTileY = Math.floor(centerWorldY / tileSize);
    const nextTiles: Tile[] = [];

    for (let tileY = centerTileY - 2; tileY <= centerTileY + 2; tileY += 1) {
      if (tileY < 0 || tileY >= tileCount) {
        continue;
      }

      for (let tileX = centerTileX - 3; tileX <= centerTileX + 3; tileX += 1) {
        const wrappedTileX = ((tileX % tileCount) + tileCount) % tileCount;
        nextTiles.push({
          x: wrappedTileX,
          y: tileY,
          left: tileX * tileSize - centerWorldX,
          top: tileY * tileSize - centerWorldY,
        });
      }
    }

    return nextTiles;
  }, [centerWorldX, centerWorldY, tileCount]);

  function setPin(nextLatitude: number, nextLongitude: number) {
    const nextLocation = {
      latitude: clampLatitude(nextLatitude),
      longitude: nextLongitude,
    };
    setCenter(nextLocation);
    onChange(nextLocation);
  }

  function cancelReverseLookup() {
    reverseLookupRequestId.current += 1;
    setIsResolvingAddress(false);
  }

  async function resolveAddress(nextLatitude: number, nextLongitude: number) {
    if (!onSearchSelect) {
      return;
    }

    const requestId = reverseLookupRequestId.current + 1;
    reverseLookupRequestId.current = requestId;
    setIsResolvingAddress(true);
    setSearchError("");

    try {
      const response = await fetch(
        `/api/location-search?lat=${encodeURIComponent(nextLatitude)}&lng=${encodeURIComponent(nextLongitude)}`,
      );
      const body = (await response.json().catch(() => null)) as
        | { result?: LocationSearchResult | null; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? searchErrorLabel);
      }

      const label = body?.result?.label;
      if (!label) {
        throw new Error(searchErrorLabel);
      }

      if (reverseLookupRequestId.current === requestId) {
        setSearchQuery(label);
        onSearchSelect(label);
      }
    } catch (error) {
      if (reverseLookupRequestId.current === requestId) {
        setSearchError(
          error instanceof Error ? error.message : searchErrorLabel,
        );
      }
    } finally {
      if (reverseLookupRequestId.current === requestId) {
        setIsResolvingAddress(false);
      }
    }
  }

  function handleMapClick(event: MouseEvent<HTMLButtonElement>) {
    if (readOnly) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    const nextWorldX = centerWorldX + offsetX;
    const nextWorldY = centerWorldY + offsetY;

    const nextLatitude = worldYToLatitude(nextWorldY, zoom);
    const nextLongitude = worldXToLongitude(nextWorldX, zoom);

    setPin(nextLatitude, nextLongitude);
    setSearchResults([]);
    void resolveAddress(nextLatitude, nextLongitude);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError(currentLocationErrorLabel);
      return;
    }

    setIsLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords.latitude;
        const nextLongitude = position.coords.longitude;
        setPin(nextLatitude, nextLongitude);
        onCurrentLocationSelect?.({
          latitude: nextLatitude,
          longitude: nextLongitude,
        });
        void resolveAddress(nextLatitude, nextLongitude).finally(() =>
          setIsLocating(false),
        );
      },
      () => {
        setLocationError(currentLocationErrorLabel);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      },
    );
  }

  async function searchLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();

    if (query.length < 3 || isSearching) {
      return;
    }

    setIsSearching(true);
    setSearchError("");
    cancelReverseLookup();

    try {
      const response = await fetch(
        `/api/location-search?q=${encodeURIComponent(query)}`,
      );
      const body = (await response.json().catch(() => null)) as
        | { results?: LocationSearchResult[]; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(body?.error ?? searchErrorLabel);
      }

      const nextResults = body?.results ?? [];
      setSearchResults(nextResults);
      if (nextResults.length === 0) {
        setSearchError(noResultsLabel);
      }
    } catch (error) {
      setSearchResults([]);
      setSearchError(
        error instanceof Error ? error.message : searchErrorLabel,
      );
    } finally {
      setIsSearching(false);
    }
  }

  function selectSearchResult(result: LocationSearchResult) {
    cancelReverseLookup();
    setPin(result.latitude, result.longitude);
    setSearchQuery(result.label);
    setSearchResults([]);
    setSearchError("");
    onSearchSelect?.(result.label);
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">{title}</p>
          <p className="mt-1 text-xs font-semibold text-muted">
            {readOnly ? readOnlyDescription : editableDescription}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly ? (
            <button
              type="button"
              disabled={isLocating}
              onClick={useCurrentLocation}
              className="h-11 rounded-md border border-border bg-surface px-3 text-xs font-bold text-muted-strong disabled:cursor-wait disabled:opacity-60"
            >
              {isLocating ? locatingLabel : currentLocationLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setZoom((currentZoom) => Math.max(currentZoom - 1, 3))}
            className="h-9 w-9 rounded-md border border-border bg-surface text-sm font-bold text-muted-strong"
            aria-label="Zoom out"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setZoom((currentZoom) => Math.min(currentZoom + 1, 18))}
            className="h-9 w-9 rounded-md border border-border bg-surface text-sm font-bold text-muted-strong"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>
      {locationError ? (
        <p className="mt-2 text-xs font-semibold text-danger-text" role="alert">
          {locationError}
        </p>
      ) : null}

      {enableSearch && !readOnly ? (
        <div className="relative mt-3">
          <form
            onSubmit={searchLocation}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">{searchLabel}</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  cancelReverseLookup();
                  setSearchQuery(event.target.value);
                  setSearchError("");
                }}
                placeholder={searchPlaceholder}
                minLength={3}
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-info-surface"
              />
            </label>
            <button
              type="submit"
              disabled={isSearching || searchQuery.trim().length < 3}
              className="h-11 rounded-md bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
            >
              {isSearching ? searchingLabel : searchButtonLabel}
            </button>
          </form>
          {searchError ? (
            <p
              className="mt-2 text-xs font-semibold text-danger-text"
              role="status"
            >
              {searchError}
            </p>
          ) : null}
          {isResolvingAddress ? (
            <p className="mt-2 text-xs font-semibold text-muted" role="status">
              {searchingLabel}
            </p>
          ) : null}
          {searchResults.length > 0 ? (
            <ul className="mt-2 overflow-hidden rounded-md border border-border bg-surface shadow-sm">
              {searchResults.map((result) => (
                <li
                  key={result.id}
                  className="border-b border-border last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => selectSearchResult(result)}
                    className="w-full px-3 py-3 text-start text-sm font-semibold leading-5 text-foreground transition hover:bg-info-surface"
                  >
                    {result.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleMapClick}
        className="relative mt-3 h-64 w-full overflow-hidden rounded-md border border-border bg-surface text-left sm:h-80"
        aria-label={mapAriaLabel}
      >
        {tiles.map((tile) => (
          // OpenStreetMap tiles are externally served map fragments; next/image optimization is not useful here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${zoom}-${tile.x}-${tile.y}`}
            src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
            alt=""
            className="pointer-events-none absolute h-64 w-64 select-none"
            style={{
              left: `calc(50% + ${tile.left}px)`,
              top: `calc(50% + ${tile.top}px)`,
            }}
            draggable={false}
          />
        ))}
        {hasPin ? (
          <>
            {showGeofence ? (
              <span
                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/15"
                style={{
                  width: `${radiusPixels * 2}px`,
                  height: `${radiusPixels * 2}px`,
                }}
              />
            ) : null}
            <span className="absolute left-1/2 top-1/2 z-20 h-8 w-8 -translate-x-1/2 -translate-y-full rounded-full border-4 border-white bg-danger-text shadow-lg">
              <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-danger-text" />
            </span>
          </>
        ) : (
          <span className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-md bg-surface/95 px-3 py-2 text-sm font-bold text-muted-strong shadow">
            {readOnly ? "No pin added" : "Click to add pin"}
          </span>
        )}
        <span className="absolute bottom-2 right-2 rounded bg-surface/90 px-2 py-1 text-[10px] font-semibold text-muted">
          OpenStreetMap
        </span>
      </button>

      <div className="mt-3 grid gap-2 text-xs font-semibold text-muted-strong sm:grid-cols-[1fr_1fr_auto]">
        <p className="rounded-md border border-border bg-surface px-3 py-2">
          Latitude: {formatCoordinate(latitude)}
        </p>
        <p className="rounded-md border border-border bg-surface px-3 py-2">
          Longitude: {formatCoordinate(longitude)}
        </p>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => {
              cancelReverseLookup();
              onChange({ latitude: null, longitude: null });
            }}
            className="h-9 rounded-md border border-border bg-surface px-3 text-xs font-bold text-muted-strong"
          >
            Clear pin
          </button>
        ) : null}
      </div>
      {showGeofence ? (
        <div className="mt-3 rounded-md border border-border bg-surface px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="min-w-0 flex-1">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                Geofence radius
              </span>
              {readOnly || !allowRadiusChange ? (
                <p className="mt-1 text-sm font-bold text-foreground">
                  {radiusMeters} meters
                </p>
              ) : (
                <input
                  type="range"
                  min={25}
                  max={1000}
                  step={25}
                  value={radiusMeters}
                  onChange={(event) =>
                    onRadiusChange?.(Number(event.target.value))
                  }
                  className="mt-2 w-full"
                />
              )}
            </label>
            {!readOnly && allowRadiusChange ? (
              <input
                type="number"
                min={25}
                max={1000}
                step={25}
                value={radiusMeters}
                onChange={(event) =>
                  onRadiusChange?.(Number(event.target.value))
                }
                className="h-10 w-28 rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground"
                aria-label="Geofence radius in meters"
              />
            ) : null}
          </div>
          <p className="mt-2 text-xs font-semibold text-muted">
            {radiusDescription}
          </p>
        </div>
      ) : null}
    </div>
  );
}
