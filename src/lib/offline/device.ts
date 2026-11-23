// Laptop browsers, the Windows app, phones and tablets share one durable
// workspace. Device support never changes an employee's project permissions.
export function supportsOfflineWorkspace(headers: Pick<Headers, 'get'>) {
  return /Android|iPhone|iPad|iPod|Tablet|Silk|Windows|Macintosh|Mac OS X|X11|Linux|CrOS/i.test(headers.get('user-agent') ?? '')
    || headers.get('sec-ch-ua-mobile') === '?1';
}

export function isOfflineDevice() {
  return typeof navigator !== 'undefined' && (
    supportsOfflineWorkspace(new Headers({ 'user-agent': navigator.userAgent }))
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}
