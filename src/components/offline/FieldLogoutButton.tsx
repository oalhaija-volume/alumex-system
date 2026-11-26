"use client";

import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { isFieldOnline, pendingFieldChanges, syncFieldChanges } from '@/lib/offline/client';
import { readFieldState, setFieldUser } from '@/lib/offline/store';
import { syncOfflineQuotations } from '@/lib/offline/quotations';
import { canUseOfflineWorkspace } from '@/lib/offline/policy';

/** Use the same sign-out safeguards in the online and device workspaces. */
export function FieldLogoutButton({ className, formClassName, role }: { className: string; formClassName?: string; role?: string }) {
  const { t, term } = useI18n();
  const [busy, setBusy] = useState(false);

  return <form action="/auth/logout" method="post" className={formClassName} onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    try {
      const onlineOnly = !canUseOfflineWorkspace(role ?? (await readFieldState().catch(() => null))?.actor.role);
      if (onlineOnly ? !navigator.onLine : !isFieldOnline()) {
        alert(term('Connect to the internet before signing out.'));
        setBusy(false);
        return;
      }
      if (onlineOnly) {
        // Attempt recovery without trapping an employee behind a conflict or
        // an unreachable server. Account-scoped drafts remain in IndexedDB.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            syncFieldChanges().then(() => syncOfflineQuotations()),
            new Promise<void>(resolve => { timer = setTimeout(resolve, 8000); }),
          ]);
        } catch { /* Retained work can be reviewed when its owner signs in again. */ }
        finally { clearTimeout(timer); }
      } else if (await pendingFieldChanges()) {
        alert(term('Sync the changes saved on this device before signing out.'));
        setBusy(false);
        return;
      }
      // Remove only the active account marker; retain account-scoped device data.
      setFieldUser(null);
      form.submit();
    } catch {
      alert(term('Unable to complete this action. Please try again or contact the administrator.'));
      setBusy(false);
    }
  }}>
    <button type="submit" disabled={busy} className={className}>
      {busy ? t('auth.loggingOut') : t('auth.logout')}
    </button>
  </form>;
}
