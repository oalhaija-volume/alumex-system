"use client";

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useCurrentRole } from '@/components/auth/useCurrentRole';
import { api, button, card, field, Notice, secondary, useResource, Workspace } from './ui';

type Employee = {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string;
  role: string;
  branch: "Karkh" | "Rasafa" | null;
  status: string;
  is_active: boolean;
  updated_at: string;
};
const employeeRoles = ['Sales Director', 'CEO', 'Sales Manager', 'Indoor Sales', 'Outdoor Sales', 'Operations Manager', 'Project Manager', 'HR'];
const primaryAdmin = (employee: Employee) => employee.email?.toLowerCase() === 'admin@alumex.com';

function PasswordReset({ employeeId, disabled, onBusyChange }: {
  employeeId: string; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const { term } = useI18n();
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function reset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || disabled) return;
    const form = event.currentTarget;
    const password = new FormData(form).get('password');
    setSaving(true); onBusyChange(true); setError(''); setNotice('');
    try {
      await api('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: employeeId, action: 'reset-password', password }) });
      form.reset(); setShow(false);
      setNotice('Password reset. Give the new password to the employee.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reset password.');
    } finally { setSaving(false); onBusyChange(false); }
  }

  return <details className="mt-6 border-t border-slate-200 pt-5">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-700">{term('Reset password')}</summary>
    <form onSubmit={reset} aria-label={term('Reset password')} className="mt-3 max-w-lg">
      <Notice error={error} />
      {notice && <p role="status" className="mb-4 text-sm text-green-800">{term(notice)}</p>}
      <fieldset disabled={saving || disabled}>
        <label className="block text-sm">{term('New password')}
          <input required name="password" type={show ? 'text' : 'password'} minLength={8} maxLength={128} autoComplete="new-password" className={field} />
        </label>
        <p className="mt-2 text-xs text-slate-500">{term('Resetting a password is separate from saving employee information.')}</p>
        <label className="my-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={event => setShow(event.target.checked)} />{term('Show password while entering')}</label>
        <button className={secondary}>{saving ? term('Please wait…') : term('Reset password')}</button>
      </fieldset>
    </form>
  </details>;
}

function EmployeeEditor({ employee, isAdmin, isSelf, onCancel, onSaved }: {
  employee: Employee;
  isAdmin: boolean;
  isSelf: boolean;
  onCancel: () => void;
  onSaved: (employee: Employee) => void;
}) {
  const { term } = useI18n();
  const nameInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [selectedRole, setSelectedRole] = useState(employee.role);
  const accessLocked = isSelf || primaryAdmin(employee);
  const options = [...employeeRoles, ...(isAdmin ? ['Admin', 'Company Owner'] : [])];
  if (!options.includes(employee.role)) options.push(employee.role);
  useEffect(() => { nameInput.current?.focus(); }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || resetting) return;
    const values = new FormData(event.currentTarget);
    setSaving(true); setError('');
    try {
      const result = await api<{ user: Employee }>('/api/admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: employee.id, action: 'update-profile', updatedAt: employee.updated_at,
          fullName: values.get('fullName'), username: values.get('username'),
          role: accessLocked ? employee.role : values.get('role'),
          ...(isAdmin ? { branch: selectedRole === 'Outdoor Sales' ? null
            : (selectedRole === 'Indoor Sales' || selectedRole === 'Sales Manager') ? values.get('branch') : employee.branch ?? null } : {}),
          isActive: accessLocked ? employee.is_active : values.get('status') === 'Active' }),
      });
      onSaved(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update employee. Please try again.');
    } finally { setSaving(false); }
  }

  return <div className="mt-5 border-t border-slate-200 pt-5">
    <h3 className="mb-5 text-lg font-semibold">{term('Edit employee')}</h3>
    <form onSubmit={save} aria-label={term('Edit employee')}>
      <Notice error={error} />
      <fieldset disabled={saving || resetting}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label>{term('Employee name')}<input ref={nameInput} required name="fullName" defaultValue={employee.full_name ?? ''} maxLength={150} autoComplete="off" className={field} /></label>
          <label>{term('Username')}<input required name="username" defaultValue={employee.username ?? ''} dir="ltr" autoComplete="off" pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{1,62}[a-zA-Z0-9]" className={field} /></label>
          <label>{term('Role')}<select required name="role" value={selectedRole} onChange={event => setSelectedRole(event.target.value)} disabled={accessLocked} className={`${field} disabled:bg-slate-100`}>
            {options.map(role => <option key={role} value={role}>{term(role)}</option>)}
          </select></label>
          {isAdmin && (selectedRole === 'Indoor Sales' || selectedRole === 'Sales Manager') && <label>{term('Branch')}<select name="branch" defaultValue={(employee.role === 'Indoor Sales' || employee.role === 'Sales Manager') ? employee.branch ?? '' : ''} required className={field}>
            <option value="">{term('Not assigned')}</option><option value="Karkh">{term('Karkh')}</option><option value="Rasafa">{term('Rasafa')}</option>
          </select><span className="mt-2 block text-xs text-slate-500">{term('New projects use this branch. Existing projects keep their original branch.')}</span></label>}
          {selectedRole === 'Outdoor Sales' && <p className="self-center text-sm text-slate-600">{term('Outdoor Sales serve both Karkh and Rasafa.')}</p>}
          <label>{term('Account status')}<select name="status" defaultValue={employee.is_active ? 'Active' : 'Inactive'} disabled={accessLocked} className={`${field} disabled:bg-slate-100`}>
            <option value="Active">{term('Active')}</option><option value="Inactive">{term('Inactive')}</option>
          </select></label>
        </div>
        <p className="mt-4 text-sm text-slate-500">{term('The employee will use the updated username to sign in. Their password and project history stay the same.')}</p>
        {accessLocked && <p className="mt-2 text-sm text-slate-500">{term(primaryAdmin(employee) ? 'The primary Admin account must remain active with the Admin role.' : 'You cannot change your own role or deactivate your account.')}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button className={button}>{saving ? term('Saving changes…') : term('Save changes')}</button>
          <button type="button" className={secondary} onClick={onCancel}>{term('Cancel')}</button>
        </div>
      </fieldset>
    </form>
    {isAdmin && <PasswordReset employeeId={employee.id} disabled={saving} onBusyChange={setResetting} />}
  </div>;
}

export function EmployeeWorkspace() {
  const { term } = useI18n();
  const { data, setData, error, setError, loading, reload } = useResource<{ users: Employee[] }>('/api/admin/users');
  const { role, userId } = useCurrentRole();
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState('');
  const [newRole, setNewRole] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const isAdmin = role === 'Admin';
  const canEditEmployees = isAdmin || role === 'HR';

  useEffect(() => { if (editingId === null) editButton.current?.focus(); }, [editingId]);
  function closeEditor() { setEditingId(null); }
  function saved(employee: Employee) {
    setData(previous => previous ? { ...previous, users: previous.users.map(item => item.id === employee.id ? { ...item, ...employee } : item) } : previous);
    setNotice('Employee information updated.');
    closeEditor();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true); setError(''); setNotice('');
    try {
      await api('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(values)) });
      form.reset(); setShow(false); setNewRole('');
      setNotice('Employee added. They can sign in with the username and password you set.');
      await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to add employee.'); }
    finally { setSaving(false); }
  }

  return <Workspace title={term('Employees')} description={term('Add employees, update their information, and manage system access.')}>
    <Notice error={error} />
    {notice && <p role="status" className="mb-5 rounded-md bg-green-50 p-4 text-sm text-green-800">{term(notice)}</p>}
    {canEditEmployees&&<form onSubmit={submit} aria-label={term('Add employee')} className={card}>
      <fieldset disabled={saving}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label>{term('Employee name')}<input required name="fullName" maxLength={150} autoComplete="off" className={field} /></label>
          <label>{term('Role')}<select required name="role" aria-label={term('Role')} value={newRole} onChange={event => setNewRole(event.target.value)} className={field}><option value="">{term('Choose role')}</option>{[...employeeRoles, ...(isAdmin ? ['Admin', 'Company Owner'] : [])].map(option => <option key={option} value={option}>{term(option)}</option>)}</select></label>
          {isAdmin && (newRole === 'Indoor Sales' || newRole === 'Sales Manager') && <label>{term('Branch')}<select name="branch" required className={field}>
            <option value="">{term('Not assigned')}</option><option value="Karkh">{term('Karkh')}</option><option value="Rasafa">{term('Rasafa')}</option>
          </select><span className="mt-2 block text-xs text-slate-500">{term('Required for Indoor Sales. New quotations and contracts show this branch.')}</span></label>}
          {newRole === 'Outdoor Sales' && <p className="self-center text-sm text-slate-600">{term('Outdoor Sales serve both Karkh and Rasafa.')}</p>}
          <label>{term('Username')}<input required name="username" dir="ltr" autoComplete="off" pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{1,62}[a-zA-Z0-9]" className={field} /></label>
          <label>{term('Password')}<input required name="password" aria-label={term('Password')} aria-describedby="password-help" type={show ? 'text' : 'password'} autoComplete="new-password" minLength={8} className={field} /><span id="password-help" className="mt-2 block text-xs text-slate-500">{term('At least 8 characters. Passwords are never shown in the employee list.')}</span></label>
        </div>
        <label className="my-5 flex items-center gap-2 text-sm"><input type="checkbox" checked={show} onChange={event => setShow(event.target.checked)} />{term('Show password while entering')}</label>
        <button className={button}>{saving ? term('Adding employee…') : term('Add employee')}</button>
      </fieldset>
    </form>}
    <div className="mt-9 mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{term('Team')}</h2>
      <button type="button" className={secondary} disabled={editingId !== null || loading} onClick={() => { setError(''); void reload().catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load employees.')); }}>{term('Refresh employees')}</button>
    </div>
    {loading ? <p>{term('Loading employees…')}</p> : !data?.users.length ? <p className={card}>{term('No employees to display.')}</p> : <div className="space-y-3">{data.users.map(employee => {
      const editable = isAdmin || (role === 'HR' && !['Admin','Company Owner'].includes(employee.role??'') && !primaryAdmin(employee));
      return <article key={employee.id} className={card}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0"><h3 className="break-words font-semibold">{employee.full_name || employee.username}</h3><p dir="ltr" className="mt-1 break-all text-sm text-slate-500">{employee.username}</p><p className="mt-2 text-sm text-slate-600">{term(employee.role)} · {term(employee.status)}</p>{employee.role === 'Outdoor Sales' ? <p className="mt-2 text-sm font-medium text-slate-700">{term('Both branches')}</p> : ((employee.role === 'Indoor Sales' || employee.role === 'Sales Manager') || employee.branch) && <p className="mt-2 text-sm font-medium text-slate-700">{term('Branch')}: {term(employee.branch ?? 'Not assigned')}</p>}</div>
          {editable && <button type="button" className={secondary} aria-label={term('Edit {name}', { name: employee.full_name || employee.username || term('Employee') })} aria-expanded={editingId === employee.id} disabled={editingId !== null} onClick={event => { editButton.current = event.currentTarget; setEditingId(employee.id); setNotice(''); }}>{term('Edit')}</button>}
        </div>
        {editingId === employee.id && <EmployeeEditor employee={employee} isAdmin={isAdmin} isSelf={employee.id === userId} onCancel={closeEditor} onSaved={saved} />}
      </article>;
    })}</div>}
  </Workspace>;
}
