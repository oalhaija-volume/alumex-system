// Offline field work is available on phones and tablets, across employee roles.
export function supportsOfflineWorkspace(headers: Pick<Headers, 'get'>) {
  return /Android|iPhone|iPad|iPod|Tablet|Silk|Windows Phone/i.test(headers.get('user-agent') ?? '')
    || headers.get('sec-ch-ua-mobile') === '?1';
}

export function isOfflineDevice() {
  return typeof navigator !== 'undefined' && (
    supportsOfflineWorkspace(new Headers({ 'user-agent': navigator.userAgent }))
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}
