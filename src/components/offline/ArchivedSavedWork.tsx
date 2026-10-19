"use client";

import { useI18n } from '@/components/i18n/I18nProvider';
import type { ArchivedFieldProject } from '@/lib/offline/types';

export function ArchivedSavedWork({ projects = [] }: { projects?: ArchivedFieldProject[] }) {
 const { term } = useI18n();
 if (!projects.length) return null;
 return <details className="mx-auto mt-5 max-w-5xl rounded-md border border-slate-200 bg-white p-4 text-sm">
  <summary className="min-h-11 cursor-pointer font-semibold text-slate-700">{term('Saved work for deleted projects')}</summary>
  <p className="mt-2 text-slate-600">{term('These projects were deleted by an Admin. Their saved work is kept on this device and will no longer retry syncing.')}</p>
  <div className="mt-3 space-y-4">{projects.map(archive => <div key={archive.projectId} className="border-t border-slate-200 pt-3">
   <p className="font-semibold">{archive.project?.project_name ?? term('Project')}</p>
   {archive.changes.filter(change => typeof change.payload.note === 'string' && change.payload.note).map(change => <p key={change.id} className="mt-2 whitespace-pre-wrap break-words">{term('Your saved note:')} {String(change.payload.note)}</p>)}
   <button className="mt-2 min-h-11 font-semibold text-blue-600 underline" onClick={() => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `saved-field-work-${archive.projectId}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
   }}>{term('Download my saved work')}</button>
  </div>)}</div>
 </details>;
}
