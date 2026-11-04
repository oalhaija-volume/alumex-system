'use client';

import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { FieldActor, FieldProject } from '@/lib/offline/types';
import { canRenameProject, normalizeProjectName } from '@/lib/workflow/projectName';
import { api, button, field, Notice, secondary } from './ui';

export function ProjectNameEditor({ project, actor, onSaved }: {
  project: FieldProject;
  actor: FieldActor;
  onSaved: () => Promise<void>;
}) {
  const { term, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!canRenameProject(project, actor)) return null;

  async function save() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = normalizeProjectName({ projectName: name });
      const result = await api<{ pending?: boolean }>('/api/workspace', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, action: 'rename-project', ...payload, expectedUpdatedAt: version }),
      });
      await onSaved();
      setEditing(false);
      setNotice(result.pending ? 'Project name saved on this device. It will sync when connected.' : 'Project name updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete this action. Please try again or contact the administrator.');
    } finally { setBusy(false); }
  }

  return <div className="mt-3 text-sm">
    {editing ? <form aria-label={term('Edit project name')} onSubmit={event => { event.preventDefault(); void save(); }} className="max-w-xl rounded-md border border-slate-200 bg-slate-50 p-4">
      <fieldset disabled={busy} className="min-w-0">
        <label className="block font-medium text-slate-700">{term('Project name')}
          <input name="projectName" value={name} onChange={event => setName(event.target.value)} required maxLength={150} dir="auto" className={field}/>
        </label>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="submit" className={button}>{busy ? t('common.saving') : t('common.saveChanges')}</button>
          <button type="button" className={secondary} onClick={() => { setEditing(false); setError(''); }}>{t('common.cancel')}</button>
        </div>
      </fieldset>
    </form> : <button type="button" className="min-h-11 rounded-md py-2 font-semibold text-blue-700 hover:underline" onClick={() => { setName(project.project_name); setVersion(project.updated_at); setError(''); setNotice(''); setEditing(true); }}>{term('Edit project name')}</button>}
    {error && <div className="mt-3"><Notice error={error}/></div>}
    {notice && <p role="status" className="mt-2 leading-6 text-green-700">{term(notice)}</p>}
  </div>;
}
