import { redirect } from 'next/navigation';
import { RegistrationShell } from '@/components/intake/RegistrationShell';
import { WindowsDownload } from '@/components/desktop/WindowsDownload';
import { requireRole } from '@/lib/auth/adminServer';
import { desktopDownloadRoles } from '@/lib/auth/permissions';
import { windowsDesktopRelease } from '@/lib/desktop/release';

export default async function Page() {
  const auth = await requireRole(desktopDownloadRoles);
  if (!auth.ok) redirect(auth.status === 401 ? '/login?redirectTo=%2Fdownloads%2Fwindows' : '/unauthorized');
  const { version, filename, bytes, sha256 } = windowsDesktopRelease;
  const userName = auth.profile?.full_name?.trim() || auth.profile?.username?.trim();
  return <RegistrationShell role={auth.role} userName={userName}>
    <WindowsDownload release={{ version, filename, bytes, sha256 }}/>
  </RegistrationShell>;
}
