type ResourceLoaderOptions<T> = {
  load: (signal: AbortSignal) => Promise<T>;
  onData: (data: T) => void;
  onError: (cause: unknown) => void;
  onSettled: () => void;
};

// Initial loads, background polls and explicit reloads share one sequence.
// A response from before a save must never replace the freshly reloaded data.
export function createResourceLoader<T>(options: ResourceLoaderOptions<T>) {
  const controller = new AbortController();
  let version = 0;
  let inFlight = false;

  function invalidate() {
    version++;
    inFlight = false;
  }

  async function refresh(force = false, propagateError = false) {
    if (controller.signal.aborted || (inFlight && !force)) return;
    const current = ++version;
    inFlight = true;
    try {
      const data = await options.load(controller.signal);
      if (!controller.signal.aborted && current === version) options.onData(data);
    } catch (cause) {
      if (!controller.signal.aborted && current === version) {
        options.onError(cause);
        if (propagateError) throw cause;
      }
    } finally {
      if (!controller.signal.aborted && current === version) {
        inFlight = false;
        options.onSettled();
      }
    }
  }

  function dispose() {
    invalidate();
    controller.abort();
  }

  return { refresh, invalidate, dispose, isLoading: () => inFlight };
}
