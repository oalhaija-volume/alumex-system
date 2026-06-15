"use client";

import { useMemo, useState } from "react";
import type { MouseEvent } from "react";

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
  readOnly = false,
}: {
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
  onChange: (location: { latitude: number | null; longitude: number | null }) => void;
  onRadiusChange?: (radius: number) => void;
  readOnly?: boolean;
}) {
  const hasPin =
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude);
  const [zoom, setZoom] = useState(14);
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

  function handleMapClick(event: MouseEvent<HTMLButtonElement>) {
    if (readOnly) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    const nextWorldX = centerWorldX + offsetX;
    const nextWorldY = centerWorldY + offsetY;

    setPin(
      worldYToLatitude(nextWorldY, zoom),
      worldXToLongitude(nextWorldX, zoom),
    );
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition((position) => {
      setPin(position.coords.latitude, position.coords.longitude);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-foreground">Map location</p>
          <p className="mt-1 text-xs font-semibold text-muted">
            {readOnly
              ? "Pinned project location and check-in geofence."
              : "Click the map to place the exact project pin and set the check-in geofence."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly ? (
            <button
              type="button"
              onClick={useCurrentLocation}
              className="h-9 rounded-md border border-border bg-surface px-3 text-xs font-bold text-muted-strong"
            >
              Use current location
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

      <button
        type="button"
        onClick={handleMapClick}
        className="relative mt-3 h-80 w-full overflow-hidden rounded-md border border-border bg-surface text-left"
        aria-label="Project map location picker"
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
            <span
              className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/15"
              style={{
                width: `${radiusPixels * 2}px`,
                height: `${radiusPixels * 2}px`,
              }}
            />
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
            onClick={() => onChange({ latitude: null, longitude: null })}
            className="h-9 rounded-md border border-border bg-surface px-3 text-xs font-bold text-muted-strong"
          >
            Clear pin
          </button>
        ) : null}
      </div>
      <div className="mt-3 rounded-md border border-border bg-surface px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="min-w-0 flex-1">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">
              Geofence radius
            </span>
            {readOnly ? (
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
          {!readOnly ? (
            <input
              type="number"
              min={25}
              max={1000}
              step={25}
              value={radiusMeters}
              onChange={(event) => onRadiusChange?.(Number(event.target.value))}
              className="h-10 w-28 rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground"
              aria-label="Geofence radius in meters"
            />
          ) : null}
        </div>
        <p className="mt-2 text-xs font-semibold text-muted">
          Future installation check-ins can be accepted only inside this radius.
        </p>
      </div>
    </div>
  );
}
