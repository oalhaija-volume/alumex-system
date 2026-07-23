type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  request?: Promise<T>;
};

const requestCache = new Map<string, CacheEntry<unknown>>();

export async function loadCachedClientData<T>(
  key: string,
  loader: () => Promise<T>,
  options: {
    force?: boolean;
    ttlMs?: number;
  } = {},
): Promise<T> {
  const { force = false, ttlMs = 30_000 } = options;
  const now = Date.now();
  const existing = requestCache.get(key) as CacheEntry<T> | undefined;

  if (!force && existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }

  if (existing?.request) {
    return existing.request;
  }

  const request = loader()
    .then((value) => {
      requestCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      return value;
    })
    .catch((error) => {
      if (existing?.value !== undefined) {
        requestCache.set(key, {
          value: existing.value,
          expiresAt: existing.expiresAt,
        });
      } else {
        requestCache.delete(key);
      }
      throw error;
    });

  requestCache.set(key, {
    value: existing?.value,
    expiresAt: existing?.expiresAt ?? 0,
    request,
  });

  return request;
}

export function invalidateClientData(key: string) {
  requestCache.delete(key);
}

export function clearClientDataCache() {
  requestCache.clear();
}
