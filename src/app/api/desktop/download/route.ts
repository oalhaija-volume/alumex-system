import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/adminServer';
import { desktopDownloadRoles } from '@/lib/auth/permissions';
import { windowsDesktopRelease } from '@/lib/desktop/release';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSupabaseServiceRoleKey } from '@/lib/supabase/config';

const headers = { 'Cache-Control': 'private, no-store' };
const unavailable = () => NextResponse.json({ error: 'Windows installer download is unavailable. Please try again.' }, { status: 503, headers });

export async function GET() {
  try {
    const auth = await requireRole(desktopDownloadRoles);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
    if (!hasSupabaseServiceRoleKey()) return unavailable();

    const release = windowsDesktopRelease;
    const storage = createAdminClient().storage.from(release.bucket);
    const parts = await Promise.all(release.parts.map(async part => {
      const { data, error } = await storage.createSignedUrl(part.path, 3600);
      if (error || !data?.signedUrl) throw new Error('Installer part unavailable.');
      return { url: data.signedUrl, bytes: part.bytes, sha256: part.sha256 };
    }));

    return NextResponse.json({ parts, filename: release.filename, version: release.version,
      bytes: release.bytes, sha256: release.sha256 }, { headers });
  } catch {
    return unavailable();
  }
}
