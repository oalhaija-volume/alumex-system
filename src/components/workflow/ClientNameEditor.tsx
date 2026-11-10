'use client';

import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { canRenameClient, normalizeClientName } from '@/lib/clients/name';
import type { FieldActor, FieldProject } from '@/lib/offline/types';
import { api, button, field, Notice, secondary } from './ui';

export function ClientNameEditor({ project, actor, onSaved }: {
  project: FieldProject;
  actor: FieldActor;
  onSaved: (clientName: string) => Promise<void>;
}) {
  const { term, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [expectedName, setExpectedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  if (!canRenameClient(project, actor) || typeof project.client_name !== 'string') return null;

  async function save() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = normalizeClientName({ clientName: name });
      if (!navigator.onLine) throw new Error('Connect to the internet before changing the client name.');
      const result = await api<{ client: { client_name: string } }>(`/api/projects/${project.id}/client`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, expectedClientName: expectedName }),
      });
      await onSaved(result.client.client_name);
      setEditing(false);
      setNotice('Client name updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete this action. Please try again or contact the administrator.');
    } finally { setBusy(false); }
  }

  return <div className="mt-3 text-sm">
    <p className="break-words text-slate-600">{term('Client name')}: <bdi className="font-medium text-slate-900">{project.client_name}</bdi></p>
    {editing ? <form aria-label={term('Edit client name')} onSubmit={event => { event.preventDefault(); void save(); }} className="mt-2 max-w-xl rounded-md border border-slate-200 bg-slate-50 p-4">
      <fieldset disabled={busy} className="min-w-0">
        <label className="block font-medium text-slate-700">{term('Client name')}
          <input name="clientName" value={name} onChange={event => setName(event.target.value)} required maxLength={150} dir="auto" className={field}/>
        </label>
        <p className="mt-2 text-xs leading-5 text-slate-600">{term('This updates the client record for all linked projects.')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="submit" className={button}>{busy ? t('common.saving') : t('common.saveChanges')}</button>
          <button type="button" className={secondary} onClick={() => { setEditing(false); setError(''); }}>{t('common.cancel')}</button>
        </div>
      </fieldset>
    </form> : <button type="button" className="min-h-11 rounded-md py-2 font-semibold text-blue-700 hover:underline" onClick={() => { setName(project.client_name!); setExpectedName(project.client_name!); setError(''); setNotice(''); setEditing(true); }}>{term('Edit client name')}</button>}
    {error && <div className="mt-3"><Notice error={error}/></div>}
    {notice && <p role="status" className="mt-2 leading-6 text-green-700">{term(notice)}</p>}
  </div>;
}
