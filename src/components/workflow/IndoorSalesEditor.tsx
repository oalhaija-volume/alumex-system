'use client';

import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { canAccessProjectBranch, canOwnProjectFollowUp, effectiveProjectBranch } from '@/lib/auth/projectBranchAccess';
import type { FieldProject, SalesWorkspaceData } from '@/lib/offline/types';
import { canAssignIndoorSales, normalizeIndoorSalesAssignment } from '@/lib/workflow/indoorSalesAssignment';
import { api, button, field, Notice, secondary } from './ui';

export type SavedIndoorSalesAssignment = Pick<FieldProject, 'id' | 'updated_at' | 'follow_up_owner_id' | 'followUpOwner'>;

export function IndoorSalesEditor({ project, data, onSaved }: {
  project: FieldProject;
  data: SalesWorkspaceData;
  onSaved: (assignment: SavedIndoorSalesAssignment) => Promise<void>;
}) {
  const { term, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [owner, setOwner] = useState('');
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  if (!canAssignIndoorSales(project, data.actor) || project.pending) return null;
  const owners = data.indoorSales.filter(employee =>
    (employee.role === 'Indoor Sales' || employee.role === 'Sales Manager')
    && canOwnProjectFollowUp(employee, effectiveProjectBranch(project))
    && canAccessProjectBranch({ role: employee.role, branch: employee.branch }, effectiveProjectBranch(project)),
  );

  async function save() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = normalizeIndoorSalesAssignment({ followUpOwnerId: owner, expectedUpdatedAt: version });
      if (!navigator.onLine) throw new Error('Connect to the internet before changing Indoor Sales.');
      const result = await api<{ project: SavedIndoorSalesAssignment }>(`/api/projects/${project.id}/indoor-sales`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      await onSaved(result.project);
      setEditing(false);
      setNotice('Responsible Indoor Sales updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to complete this action. Please try again or contact the administrator.');
    } finally { setBusy(false); }
  }

  return <div className="mt-3 text-sm">
    {editing ? <form aria-label={term('Change Indoor Sales')} onSubmit={event => { event.preventDefault(); void save(); }} className="max-w-xl rounded-md border border-slate-200 bg-white p-4">
      <fieldset disabled={busy} className="min-w-0">
        <label className="block font-medium text-slate-700">{term('Responsible Indoor Sales')}
          <select name="followUpOwnerId" required value={owner} onChange={event => setOwner(event.target.value)} className={field}>
            <option value="">{term('Choose Indoor Sales employee')}</option>
            {owners.map(employee => <option key={employee.id} value={employee.id}>{employee.name === 'Employee' ? term('Employee') : employee.name}</option>)}
          </select>
        </label>
        <p className="mt-2 text-sm leading-6 text-slate-600">{term('The follow-up date and notes stay the same.')}</p>
        {!owners.length && <p className="mt-2 text-sm leading-6 text-amber-900">{term('No eligible Indoor Sales employees. Connect online to refresh the employee list.')}</p>}
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="submit" disabled={!owners.length} className={button}>{busy ? t('common.saving') : t('common.saveChanges')}</button>
          <button type="button" className={secondary} onClick={() => { setEditing(false); setError(''); }}>{t('common.cancel')}</button>
        </div>
      </fieldset>
    </form> : <button type="button" className="min-h-11 rounded-md py-2 font-semibold text-blue-700 hover:underline" onClick={() => {
      setOwner(owners.some(employee => employee.id === project.follow_up_owner_id) ? project.follow_up_owner_id! : '');
      setVersion(project.updated_at); setError(''); setNotice(''); setEditing(true);
    }}>{term('Change Indoor Sales')}</button>}
    {error && <div className="mt-3"><Notice error={error}/></div>}
    {notice && <p role="status" className="mt-2 leading-6 text-emerald-800">{term(notice)}</p>}
  </div>;
}
