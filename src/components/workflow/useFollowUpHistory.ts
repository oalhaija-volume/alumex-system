"use client";
import { useEffect, useState } from 'react';
import { canAccessCRM } from '@/lib/auth/permissions';
import { activeFieldUser, readFieldState, updateFieldState } from '@/lib/offline/store';
import { isFieldOnline, prepareOffline } from '@/lib/offline/client';
import type { FollowUpEntry, FollowUpHistory } from '@/lib/workflow/followUps';

export function useFollowUpHistory(projectId: string, enabled = true) {
  const [data, setData] = useState<FollowUpHistory | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true, running = false, repeat = false, repeatForce = false, previousSignature = '';
    const controller = new AbortController();
    async function load(force = false) {
      if (running) { repeat = true; repeatForce ||= force; return; }
      running = true;
      try {
        let saved = await readFieldState();
        if (!saved && isFieldOnline()) saved = await prepareOffline().catch(() => null);
        if (!active) return;
        if (saved && !canAccessCRM(saved.actor.role)) throw new Error('CRM access is limited to Indoor Sales and company leadership.');
        const account = activeFieldUser();
        const project = saved?.projects.find(item => item.id === projectId);
        const awaitingRegistration = saved?.queue.some(change => change.projectId === projectId && change.action === 'register') ?? false;
        const changes = saved?.queue.filter(change => change.projectId === projectId && ['follow-up', 'ready', 'assign-measurements'].includes(change.action)) ?? [];
        // History cache writes also emit field-change. Only project/queue changes
        // should trigger a request, avoiding a cache-write/refetch loop.
        const signature = JSON.stringify([account, saved?.actor.role, project?.updated_at, project?.serverUpdatedAt, awaitingRegistration, changes]);
        if (!force && signature === previousSignature) return;
        previousSignature = signature;
        let history = saved?.followUpHistories?.[projectId];
        let fromCache = true;
        if (isFieldOnline() && !awaitingRegistration) {
          let response: Response | null = null;
          try { response = await fetch(`/api/projects/${projectId}/follow-ups`, { cache: 'no-store', signal: controller.signal }); } catch { /* Retain downloaded history when unreachable. */ }
          if (!active) return;
          if (response) {
            if (!response.ok) { const result = await response.json(); throw new Error(result.error ?? 'Unable to load follow-ups.'); }
            history = await response.json() as FollowUpHistory;
            fromCache = false;
            if (saved && account && activeFieldUser() === account) {
              const snapshot = history;
              await updateFieldState(account, state => ({ ...state!, followUpHistories: { ...state?.followUpHistories, [projectId]: snapshot } }));
            }
          }
        }
        saved = await readFieldState();
        if (!active || account !== activeFieldUser()) return;
        const localProject = saved?.projects.find(item => item.id === projectId);
        const pending: FollowUpEntry[] = (saved?.queue ?? []).filter(change => change.projectId === projectId && ['follow-up', 'ready', 'assign-measurements'].includes(change.action)).map(change => ({
          id: change.id, action: change.action === 'ready' ? 'ready' : change.action === 'assign-measurements' ? 'assign-measurements' : 'follow-up',
          note: typeof change.payload.note === 'string' ? change.payload.note : '', nextFollowUp: typeof change.payload.nextFollowUp === 'string' ? change.payload.nextFollowUp : null,
          recordedAt: change.recordedAt, recordedBy: saved!.actor.name, pending: true,
          followUpType: typeof change.payload.followUpType === 'string' ? change.payload.followUpType : null,
          followUpDetail: typeof change.payload.followUpDetail === 'string' ? change.payload.followUpDetail : null,
          followUpOwner: saved?.indoorSales?.find(person => person.id === change.payload.followUpOwnerId)?.name ?? null,
          assignedOutdoorSales: saved?.outdoorSales?.find(person => person.id === change.payload.assignedOutdoorSalesId)?.name ?? null,
        }));
        if (!history && localProject && (pending.length || awaitingRegistration)) history = { project: localProject, entries: [] };
        if (!history) throw new Error('Connect to the internet to download this project’s follow-up history.');
        const pendingIds = new Set(pending.map(entry => entry.id));
        const entries = [...pending, ...history.entries.filter(entry => !pendingIds.has(entry.id))].sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''));
        if (active) { setData({ ...history, project: pending.length && localProject ? localProject : history.project, entries }); setCached(fromCache); setError(''); }
      } catch (cause) {
        previousSignature = '';
        if (active) { setError((cause as Error).message); setData(null); }
      } finally {
        running = false;
        if (active) { setLoading(false); if (repeat) { const forceNext = repeatForce; repeat = false; repeatForce = false; void load(forceNext); } }
      }
    }
    const changed = () => { void load(); };
    const reconnected = () => { void load(true); };
    void load();
    window.addEventListener('field-change', changed);
    window.addEventListener('online', reconnected);
    return () => { active = false; controller.abort(); window.removeEventListener('field-change', changed); window.removeEventListener('online', reconnected); };
  }, [projectId, enabled]);
  return { data, error, loading, cached };
}
