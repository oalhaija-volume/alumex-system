"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import type { FieldProject } from '@/lib/offline/types';

type Delay = Pick<FieldProject, 'measurement_delayed' | 'measurement_delay_note' | 'measurement_delayed_at' | 'measurementDelayedBy' | 'client_cancelled_at' | 'client_cancellation_note' | 'clientCancelledBy'>;
export function MeasurementDelayNotice({ project }: { project: Delay }) {
  const { term, formatDateTime } = useI18n();
  if (project.client_cancelled_at) return <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
    <p className="font-semibold">{term('Cancelled by client')}</p>
    <p dir="auto" className="mt-2 whitespace-pre-wrap break-words">{project.client_cancellation_note}</p>
    {project.clientCancelledBy && <p className="mt-2 text-xs"><bdi>{project.clientCancelledBy}</bdi></p>}
    <time dateTime={project.client_cancelled_at} dir="ltr" className="mt-1 block w-fit text-xs">{formatDateTime(project.client_cancelled_at)}</time>
  </div>;
  if (!project.measurement_delayed) return null;
  return <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="font-semibold">{term('Delayed by client')}</p>
    <p dir="auto" className="mt-2 whitespace-pre-wrap break-words">{project.measurement_delay_note}</p>
    {(project.measurementDelayedBy || project.measurement_delayed_at) && <p className="mt-2 text-xs text-amber-900">
      {project.measurementDelayedBy && <bdi>{project.measurementDelayedBy}</bdi>}
      {project.measurement_delayed_at && <time dateTime={project.measurement_delayed_at} dir="ltr" className="mt-1 block w-fit">{formatDateTime(project.measurement_delayed_at)}</time>}
    </p>}
  </div>;
}
