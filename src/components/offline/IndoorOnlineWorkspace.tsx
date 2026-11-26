"use client";

import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { isFieldOnline, setFieldConnectionAvailable, syncFieldChanges } from '@/lib/offline/client';
import { syncOfflineQuotations, quotationSyncStatus } from '@/lib/offline/quotations';
import { activeFieldUser, readFieldState, setFieldUser } from '@/lib/offline/store';
import { canUseOfflineWorkspace, setIndoorOnlineUser } from '@/lib/offline/policy';
import { onlineWorkspaceUrl } from '@/lib/offline/navigation';
import type { FieldActor, FieldState } from '@/lib/offline/types';
import { notifyWorkspaceChanged } from '@/lib/workflow/workspaceEvents';
import { FieldLogoutButton } from './FieldLogoutButton';
import { QuotationSyncConflicts } from './QuotationSyncConflicts';
import { SyncConflicts } from './SyncConflicts';

type OnlineRole = 'Admin' | 'Indoor Sales';
const connectionPrompt = (role: OnlineRole) => role === 'Admin'
  ? 'Connect to the internet to use Admin.'
  : 'Connect to the internet to use Indoor Sales.';

/** Online-only roles use server data. Retained work is opened only for recovery. */
export function IndoorOnlineWorkspace({ children, recoveryOnly = false, onlinePath = '/dashboard', role = 'Indoor Sales' }: {
  children?: ReactNode;
  recoveryOnly?: boolean;
  onlinePath?: string;
  role?: OnlineRole;
}) {
  const { term, errorMessage, formatNumber } = useI18n();
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine);
  const [verified, setVerified] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [state, setState] = useState<FieldState | null>(null);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [accountRole, setAccountRole] = useState<OnlineRole>(role);

  useEffect(() => {
    let mounted = true, connecting = false, recovering = false;
    let employee: string | null = null;
    let employeeRole = role;
    const controller = new AbortController();
    async function readSaved() {
      const saved = await readFieldState().catch(() => null);
      if (mounted) setState(employee && activeFieldUser() === employee && saved?.actor.id === employee ? saved : null);
    }
    async function recoverSavedWork(account: string) {
      if (recovering) return;
      recovering = true;
      try {
        await syncFieldChanges();
        if (!mounted || activeFieldUser() !== account) return;
        await syncOfflineQuotations();
        if (mounted && activeFieldUser() === account) setSyncError('');
      } catch {
        if (mounted && activeFieldUser() === account) setSyncError('Saved changes could not sync. You can open the online system and review them later.');
      } finally {
        recovering = false;
        if (mounted) void readSaved();
      }
    }
    async function connect(refreshProjects = false, manual = false) {
      if (connecting) return;
      if (!navigator.onLine && !manual) return;
      connecting = true;
      const requestedAccount = activeFieldUser();
      if (mounted) setRefreshing(true);
      try {
        const response = await fetch('/api/offline?session=1', {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (!mounted || activeFieldUser() !== requestedAccount) return;
        if (!response.ok) {
          if ([401, 403].includes(response.status)) {
            setFieldUser(null);
            window.location.replace('/login');
          }
          throw new Error(connectionPrompt(employeeRole));
        }
        const identity = await response.json() as { actor: FieldActor };
        if (!mounted || activeFieldUser() !== requestedAccount) return;
        if (canUseOfflineWorkspace(identity.actor.role)) {
          setIndoorOnlineUser(null);
          setFieldUser(null);
          window.location.replace('/dashboard');
          return;
        }
        employee = identity.actor.id;
        employeeRole = identity.actor.role === 'Admin' ? 'Admin' : 'Indoor Sales';
        setAccountRole(employeeRole);
        setIndoorOnlineUser(employee);
        setFieldUser(employee);
        applyWorkerPolicy();
        setFieldConnectionAvailable(true);
        setVerified(true);
        setOnline(true);
        setError('');
        // Returning online depends on a verified connection, independently of
        // how long retained work takes to synchronize or needs review.
        void readSaved();
        void recoverSavedWork(employee);
        if (refreshProjects) notifyWorkspaceChanged();
        if (recoveryOnly) window.location.replace(onlineWorkspaceUrl(onlinePath));
      } catch (cause) {
        if (mounted) {
          setFieldConnectionAvailable(false);
          setOnline(false);
          setError(cause instanceof Error ? cause.message : connectionPrompt(employeeRole));
        }
      } finally {
        connecting = false;
        if (mounted) setRefreshing(false);
      }
    }
    function applyWorkerPolicy() {
      if (!employee || activeFieldUser() !== employee || !('serviceWorker' in navigator)) return;
      const message = { type: 'SET_OFFLINE_POLICY', onlineOnly: true };
      navigator.serviceWorker.controller?.postMessage(message);
      void navigator.serviceWorker.getRegistration().then(registration => {
        if (mounted && employee && activeFieldUser() === employee) registration?.active?.postMessage(message);
      }).catch(() => {});
    }
    const offline = () => { setOnline(false); };
    // A failed saved-change POST does not prove the online application is down.
    // Probe the session again before hiding a working online workspace.
    const connectionChanged = () => { if (!isFieldOnline()) void connect(); };
    const reconnect = () => { void connect(true); };
    const retry = () => { void connect(true, true); };
    const focus = () => { void connect(); };
    const visible = () => { if (document.visibilityState === 'visible') void connect(); };
    const changed = () => { void readSaved(); };
    // New clients must activate the worker policy even when this role no longer
    // prepares offline storage; otherwise an installed older worker stays active.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', applyWorkerPolicy);
      void navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => {});
    }
    const initial = window.setTimeout(() => { if (navigator.onLine) void connect(true); }, 0);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', focus);
    window.addEventListener('field-refresh', retry);
    window.addEventListener('field-change', changed);
    window.addEventListener('field-connection', connectionChanged);
    document.addEventListener('visibilitychange', visible);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void connect(); }, 30000);
    return () => {
      mounted = false; controller.abort(); clearInterval(interval); clearTimeout(initial);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', focus);
      window.removeEventListener('field-refresh', retry);
      window.removeEventListener('field-change', changed);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', applyWorkerPolicy);
      window.removeEventListener('field-connection', connectionChanged);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [onlinePath, recoveryOnly, role]);

  const pending = (state?.queue.length ?? 0) + quotationSyncStatus(state).pending;
  const requiresConnection = !online || !verified;
  return <>
    <div className="print:hidden">
    <div className="border-b border-slate-200 bg-white px-5 py-3 text-sm print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p role="status" className={requiresConnection ? 'text-amber-900' : 'text-slate-600'}>{term(requiresConnection ? connectionPrompt(accountRole) : accountRole === 'Admin' ? 'Admin · Online only' : 'Indoor Sales · Online only')}</p>
        <button type="button" disabled={refreshing} onClick={() => window.dispatchEvent(new Event('field-refresh'))} className="min-h-11 rounded-md px-3 font-semibold text-blue-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{term(refreshing ? 'Refreshing projects…' : 'Refresh projects')}</button>
      </div>
    </div>
    {(recoveryOnly || requiresConnection) && <section className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold text-slate-900">{term(accountRole === 'Admin' ? 'Admin requires an internet connection.' : 'Indoor Sales requires an internet connection.')}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{term(accountRole === 'Admin' ? 'Offline work is disabled for Admin. Open the online system to continue.' : 'Offline work is disabled for Indoor Sales. Open the online system to continue.')}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a href={onlineWorkspaceUrl(onlinePath)} className="inline-flex min-h-11 items-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white">{term('Open online system')}</a>
        <FieldLogoutButton role={accountRole} className="min-h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"/>
      </div>
    </section>}
    {error && <p role="alert" className="mx-auto max-w-5xl px-5 py-3 text-sm text-red-700">{errorMessage(error)}</p>}
    {syncError && verified && online && <p role="alert" className="mx-auto max-w-5xl px-5 py-3 text-sm text-amber-900">{term(syncError)}</p>}
    {verified && online && !!pending && <div className="mx-auto max-w-5xl px-5 py-4 text-sm text-amber-900">
      <p>{term(pending === 1 ? '1 saved change from this account needs syncing or review.' : '{count} saved changes from this account need syncing or review.', { count: formatNumber(pending) })}</p>
      <p className="mt-2">{term('You can log out. Unresolved work stays saved for this account and is not shown to the next employee.')}</p>
    </div>}
    {verified && online && state && <><SyncConflicts state={state}/><QuotationSyncConflicts/></>}
    </div>
    {!recoveryOnly && !requiresConnection && children}
  </>;
}
