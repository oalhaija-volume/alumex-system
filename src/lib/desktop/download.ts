export type InstallerPart = { url: string; bytes: number; sha256: string };
const unavailable = 'The installer is temporarily unavailable. Please try again.';
const unverified = 'The installer could not be verified. Please download it again.';
const sha256Pattern = /^[0-9a-f]{64}$/;
const chunkSize = 1024 * 1024;

async function digest(bytes: Uint8Array<ArrayBuffer>) {
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), value => value.toString(16).padStart(2, '0')).join('');
}

// Keep the expected release hash from the page. A download response cannot
// replace that identity. Stream bounded parts into one allocation, verify the
// parts and the complete installer, then allow the browser to save Setup.exe.
export async function loadWindowsInstaller(parts: InstallerPart[], expected: { bytes: number; sha256: string }, onProgress: (bytes: number) => void): Promise<Blob> {
  if (!Number.isSafeInteger(expected.bytes) || expected.bytes <= 0 || expected.bytes > 512 * 1024 * 1024
    || !sha256Pattern.test(expected.sha256) || !Array.isArray(parts) || !parts.length || parts.length > 16) throw new Error(unavailable);
  for (const part of parts) {
    if (!part || !Number.isSafeInteger(part.bytes) || part.bytes <= 0 || part.bytes > expected.bytes || !sha256Pattern.test(part.sha256)) throw new Error(unavailable);
    const url = new URL(part.url);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(unavailable);
  }
  if (parts.reduce((sum, part) => sum + part.bytes, 0) !== expected.bytes) throw new Error(unavailable);
  const output = new Uint8Array(expected.bytes);
  const cancellation = new AbortController();
  let offset = 0, completed = 0;
  for (const part of parts) {
    let next = 0;
    async function range(start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
      const bytes = new Uint8Array(end - start + 1);
      for (let attempt = 0; attempt < 3; attempt++) {
        cancellation.signal.throwIfAborted();
        let response: Response | undefined;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        let retryable = true;
        try {
          response = await fetch(part.url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
            headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.any([cancellation.signal, AbortSignal.timeout(60000)]) });
          const wholeSmallPart = start === 0 && end === part.bytes - 1 && part.bytes <= chunkSize;
          if (response.status !== 206 && !(response.status === 200 && wholeSmallPart)) {
            retryable = response.status === 429 || response.status >= 500;
            throw new Error(unavailable);
          }
          if (!response.body) throw new Error(unavailable);
          const length = response.headers.get('Content-Length');
          if (length !== null && Number(length) !== bytes.length) throw new Error(unverified);
          reader = response.body.getReader();
          let received = 0;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (received + value.byteLength > bytes.length) throw new Error(unverified);
            bytes.set(value, received); received += value.byteLength;
          }
          if (received !== bytes.length) throw new Error(unverified);
          cancellation.signal.throwIfAborted();
          return bytes;
        } catch (cause) {
          if (reader) await reader.cancel().catch(() => {});
          else await response?.body?.cancel().catch(() => {});
          if (!retryable || attempt === 2 || cancellation.signal.aborted) throw cause;
        } finally { reader?.releaseLock(); }
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
      }
      throw new Error(unavailable);
    }
    async function worker() {
      try {
        while (next < part.bytes) {
          cancellation.signal.throwIfAborted();
          const start = next, end = Math.min(start + chunkSize, part.bytes) - 1;
          next = end + 1;
          const bytes = await range(start, end);
          cancellation.signal.throwIfAborted();
          output.set(bytes, offset + start); completed += bytes.length; onProgress(completed);
        }
      } catch (cause) { cancellation.abort(cause); throw cause; }
    }
    const workers = await Promise.allSettled(Array.from({ length: Math.min(3, Math.ceil(part.bytes / chunkSize)) }, worker));
    const failed = workers.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    if (await digest(output.subarray(offset, offset + part.bytes)) !== part.sha256) throw new Error(unverified);
    offset += part.bytes;
  }
  if (await digest(output) !== expected.sha256) throw new Error(unverified);
  return new Blob([output.buffer], { type: 'application/octet-stream' });
}
