import { isActiveSystemRoute } from '@/lib/systemScope';

const localOrigin = 'https://alumex.invalid';

/** An explicit online attempt must not return to the saved device workspace. */
export function onlineWorkspaceUrl(path: string): string {
  let target = new URL('/dashboard', localOrigin);
  if (path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')) {
    try {
      const requested = new URL(path, localOrigin);
      if (requested.origin === localOrigin && isActiveSystemRoute(requested.pathname)
        && requested.pathname !== '/unauthorized') target = requested;
    } catch { /* Use the authorized dashboard entry for invalid destinations. */ }
  }
  target.searchParams.set('__alumex_online', '1');
  return target.pathname + target.search + target.hash;
}
