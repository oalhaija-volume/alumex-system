'use client';

import { useState, useSyncExternalStore } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { loadWindowsInstaller, type InstallerPart } from '@/lib/desktop/download';

type Release = { version: string; filename: string; bytes: number; sha256: string };
const subscribe = () => () => {};
const installed = () => /AlumexFlowDesktop\//.test(navigator.userAgent);

export function WindowsDownload({ release }: { release: Release }) {
  const { term, formatNumber } = useI18n();
  const alreadyInstalled = useSyncExternalStore(subscribe, installed, () => false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(false);
  const [downloaded, setDownloaded] = useState(0);
  const [phase, setPhase] = useState<'preparing' | 'downloading' | 'verifying'>('preparing');

  async function download() {
    if (busy) return;
    setBusy(true); setError(''); setStarted(false); setDownloaded(0); setPhase('preparing');
    try {
      if (!navigator.onLine) throw new Error('Connect to the internet to download Setup.exe.');
      const response = await fetch('/api/desktop/download', { cache: 'no-store' });
      const result: { parts?: InstallerPart[]; sha256?: string; bytes?: number } = await response.json();
      if (response.status === 401) throw new Error('Sign in again to download the Windows app.');
      if (!response.ok || !Array.isArray(result.parts) || result.sha256 !== release.sha256 || result.bytes !== release.bytes) throw new Error('The installer is temporarily unavailable. Please try again.');
      setPhase('downloading');
      let percent = -1;
      const file = await loadWindowsInstaller(result.parts, release, bytes => {
        const next = Math.floor(bytes / release.bytes * 100);
        if (next !== percent) { percent = next; setDownloaded(bytes); }
        if (bytes === release.bytes) setPhase('verifying');
      });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = release.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStarted(true);
    } catch (cause) {
      const known = ['Connect to the internet to download Setup.exe.', 'Sign in again to download the Windows app.', 'The installer could not be verified. Please download it again.'];
      setError(cause instanceof Error && known.includes(cause.message) ? cause.message : 'The installer is temporarily unavailable. Please try again.');
    } finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
    <header className="max-w-2xl">
      <p className="text-sm font-semibold text-blue-700">{term('AlumexFlow for Windows')}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{term('Download Windows app')}</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">{term('Save your work on your laptop when offline. Reconnect and keep the app open to sync your saved changes.')}</p>
    </header>
    <section aria-label={term('Windows installer')} className="rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
      <h2 className="text-lg font-semibold">{term('Windows installer')}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{term('Windows 10 or 11 · 64-bit')} · {term('Version {version}', { version: release.version })} · {formatNumber(Math.ceil(release.bytes / 1000000))} MB</p>
      {alreadyInstalled ? <p role="status" className="mt-5 rounded-md bg-blue-50 p-4 text-sm leading-6 text-blue-900">{term('AlumexFlow is already installed on this laptop.')}</p>
        : <button type="button" onClick={() => void download()} disabled={busy} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:w-auto">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>
          {busy ? phase === 'verifying' ? term('Verifying installer…') : phase === 'downloading' ? term('Downloading installer… {percent}%', { percent: formatNumber(Math.floor(downloaded / release.bytes * 100)) }) : term('Preparing download…') : term('Download Setup.exe')}
        </button>}
      {busy && phase !== 'preparing' && <progress aria-label={term('Installer download progress')} max={release.bytes} value={downloaded} className="mt-4 block h-3 w-full max-w-md accent-blue-600"/>}
      {error && <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">{term(error)} {error === 'Sign in again to download the Windows app.' && <a href="/login?redirectTo=%2Fdownloads%2Fwindows" className="font-semibold underline">{term('Sign in')}</a>}</div>}
      {started && <p role="status" className="mt-4 text-sm leading-6 text-slate-600">{term('Open Setup.exe when your browser finishes downloading it.')}</p>}
      <p className="mt-4 text-sm leading-6 text-slate-500">{term('This installer is unsigned. Windows may display “Unknown publisher”.')}</p>
    </section>
    <section aria-labelledby="windows-install-steps" className="rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
      <h2 id="windows-install-steps" className="text-lg font-semibold">{term('Install and start working')}</h2>
      <ol className="mt-4 list-decimal space-y-4 ps-5 text-sm leading-7 text-slate-700">
        <li>{term('Open Setup.exe and follow the installation steps. Then open AlumexFlow Desktop from your Desktop or Start menu.')}</li>
        <li>{term('Connect to the internet and sign in with your existing employee account. Wait for “Offline saving ready” before disconnecting.')}</li>
        <li>{term('Use Save while offline. Reconnect and keep the app open until pending changes finish syncing.')}</li>
      </ol>
      <p className="mt-5 border-t border-slate-100 pt-4 text-sm leading-7 text-slate-600">{term('Your existing project permissions apply in the app. Conflicting edits need review. Contract approval and signing require internet.')}</p>
    </section>
    <details className="rounded-lg border border-slate-200 bg-white p-5 text-sm sm:p-7">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600">{term('Installer details')}</summary>
      <p className="mt-3 text-slate-600">SHA-256</p><code dir="ltr" className="mt-2 block break-all text-xs leading-6 text-slate-600">{release.sha256}</code>
    </details>
  </div>;
}
