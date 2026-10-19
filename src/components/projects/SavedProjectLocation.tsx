"use client";

import { useI18n } from '@/components/i18n/I18nProvider';
import { parseProjectLocation } from '@/lib/location/coordinates';
import type { FieldProject } from '@/lib/offline/types';
import { ProjectLocationPicker } from './ProjectLocationPicker';

const keepSavedLocation = () => {};

export function SavedProjectLocation({ project }: { project: Pick<FieldProject, 'id' | 'address' | 'location_latitude' | 'location_longitude'> }) {
  const { term } = useI18n();
  const location = parseProjectLocation(project.location_latitude, project.location_longitude);
  return <div className="min-w-0 space-y-3 sm:col-span-2">
    {project.address && <p className="break-words text-slate-700" dir="auto">{project.address}</p>}
    {location.isValid ? <>
      <ProjectLocationPicker
        key={`${project.id}:${location.latitude}:${location.longitude}`}
        latitude={location.latitude} longitude={location.longitude}
        readOnly showGeofence={false} allowRadiusChange={false}
        onChange={keepSavedLocation}
        title="Map location" readOnlyDescription="Saved project site location."
        mapAriaLabel="Saved project location map"
      />
      <a href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
        target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center font-semibold text-blue-700 underline underline-offset-4">
        {term('Open in Google Maps')}
      </a>
    </> : <p className="rounded-md bg-slate-50 p-3 text-slate-600">{term('No map pin saved for this project.')}</p>}
  </div>;
}
