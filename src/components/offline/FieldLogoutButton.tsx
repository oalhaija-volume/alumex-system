"use client";

import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { isFieldOnline, pendingFieldChanges } from '@/lib/offline/client';
import { setFieldUser } from '@/lib/offline/store';

/** Use the same sign-out safeguards in the online and device workspaces. */
export function FieldLogoutButton({ className, formClassName }: { className: string; formClassName?: string }) {
  const { t, term } = useI18n();
  const [busy, setBusy] = useState(false);

  return <form action="/auth/logout" method="post" className={formClassName} onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    try {
      if (!isFieldOnline()) {
        alert(term('Connect to the internet before signing out.'));
        setBusy(false);
        return;
      }
      if (await pendingFieldChanges()) {
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
