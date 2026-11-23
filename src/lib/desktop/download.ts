export type InstallerPart = { url: string; bytes: number; sha256: string };
const unavailable = 'The installer is temporarily unavailable. Please try again.';
const unverified = 'The installer could not be verified. Please download it again.';
const sha256Pattern = /^[0-9a-f]{64}$/;

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
  let offset = 0;
  for (const part of parts) {
    const response = await fetch(part.url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
    if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw new Error(unavailable); }
    const length = response.headers.get('Content-Length');
    if (length !== null && Number(length) !== part.bytes) { await response.body.cancel().catch(() => {}); throw new Error(unverified); }
    const reader = response.body.getReader();
    const start = offset;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (offset + value.byteLength > start + part.bytes) throw new Error(unverified);
        output.set(value, offset); offset += value.byteLength; onProgress(offset);
      }
    } catch (cause) { await reader.cancel().catch(() => {}); throw cause; }
    finally { reader.releaseLock(); }
    if (offset !== start + part.bytes || await digest(output.subarray(start, offset)) !== part.sha256) throw new Error(unverified);
  }
  if (await digest(output) !== expected.sha256) throw new Error(unverified);
  return new Blob([output.buffer], { type: 'application/octet-stream' });
}
