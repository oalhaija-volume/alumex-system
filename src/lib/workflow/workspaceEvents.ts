const eventName = 'alumex-workspace-change';
const channelName = 'alumex-workspace-changes';
const storageKey = 'alumex-workspace-change';
const messageType = 'workspace-changed';
let sourceId: string | undefined;
const source = () => sourceId ??= crypto.randomUUID();

// The message carries no project, client or account data. Other tabs re-read
// their own authorized workspace instead of accepting the sender's snapshot.
export function notifyWorkspaceChanged(committed = true) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(eventName));
  if (!committed) return;
  try {
    if (typeof window.BroadcastChannel === 'function') {
      const channel = new window.BroadcastChannel(channelName);
      channel.postMessage({ type: messageType, source: source() });
      channel.close();
      return;
    }
  } catch { /* Polling and focus still refresh if cross-tab messaging is unavailable. */ }
  try {
    window.localStorage.setItem(storageKey, `${Date.now()}:${crypto.randomUUID()}`);
  } catch { /* A blocked browser storage must not turn a successful save into an error. */ }
}

export function subscribeWorkspaceChanges(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(eventName, listener);
  const stored = (event: StorageEvent) => {
    if (event.key === storageKey && event.newValue) listener();
  };
  window.addEventListener('storage', stored);
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof window.BroadcastChannel === 'function') {
      channel = new window.BroadcastChannel(channelName);
      channel.addEventListener('message', (event: MessageEvent<unknown>) => {
        const message = event.data;
        if (message && typeof message === 'object' && 'type' in message && message.type === messageType
          && 'source' in message && typeof message.source === 'string' && message.source !== source()) listener();
      });
    }
  } catch { /* The storage listener and periodic refresh remain available. */ }
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener('storage', stored);
    channel?.close();
  };
}
