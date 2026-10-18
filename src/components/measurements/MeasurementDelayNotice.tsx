"use client";
import { useI18n } from '@/components/i18n/I18nProvider';
import type { FieldProject } from '@/lib/offline/types';

type Delay = Pick<FieldProject, 'measurement_delayed' | 'measurement_delay_note' | 'measurement_delayed_at' | 'measurementDelayedBy'>;
export function MeasurementDelayNotice({ project }: { project: Delay }) {
  const { term, formatDateTime } = useI18n();
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
