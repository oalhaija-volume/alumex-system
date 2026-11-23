import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const contents = [Uint8Array.of(77, 90, 1, 2, 3), Uint8Array.of(4, 5, 6), Uint8Array.of(7, 8)];
const whole = Uint8Array.from(contents.flatMap(bytes => [...bytes]));
const parts = contents.map((bytes, index) => ({ url: `https://storage.example.test/private/part${index + 1}?token=ephemeral`, bytes: bytes.length, sha256: hash(bytes) }));
const expected = { bytes: whole.length, sha256: hash(whole) };
const code = ts.transpileModule(readFileSync(new URL('../src/lib/desktop/download.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function streamed(chunks, headers = {}, status = 200) {
  return new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(chunk);
    controller.close();
  } }), { status, headers });
}

function fixture(handler = index => streamed([contents[index].slice(0, 1), contents[index].slice(1)], { 'Content-Length': String(contents[index].length) })) {
  const requests = [], progress = [];
  let blobs = 0;
  class VerifiedBlob extends Blob { constructor(...args) { super(...args); blobs++; } }
  const exports = {};
  new Function('exports', 'fetch', 'crypto', 'Blob', code)(exports, async (url, options) => {
    const index = requests.length; requests.push({ url, options }); return handler(index, { url, options });
  }, webcrypto, VerifiedBlob);
  return { requests, progress, get blobs() { return blobs; },
    load: (metadata = parts, identity = expected) => exports.loadWindowsInstaller(metadata, identity, bytes => progress.push(bytes)) };
}

test('three verified streams produce one exact installer Blob with cumulative progress and private fetches', async () => {
  const x = fixture(); const blob = await x.load();
  assert.ok(blob instanceof Blob); assert.equal(x.blobs, 1);
  assert.equal(blob.size, whole.length); assert.equal(blob.type, 'application/octet-stream');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), whole);
  assert.deepEqual(x.progress, [5, 8, 10], 'Only completed ranges advance progress');
  assert.deepEqual(x.requests.map(request => request.url), parts.map(part => part.url));
  for (const [index, { options }] of x.requests.entries()) {
    assert.ok(options.signal instanceof AbortSignal);
    const { signal: ignored, ...settings } = options; void ignored;
    assert.deepEqual(settings, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', headers: { Range: `bytes=0-${parts[index].bytes - 1}` } });
  }
});

test('part corruption refuses a Blob and does not fetch later parts', async () => {
  const corrupt = contents[0].slice(); corrupt[2] ^= 1;
  const x = fixture(() => streamed([corrupt]));
  await assert.rejects(x.load(), /could not be verified/);
  assert.equal(x.blobs, 0); assert.equal(x.requests.length, 1);
});

for (const [label, bytes] of [['truncated', contents[0].slice(0, -1)], ['oversized', Uint8Array.from([...contents[0], 255])]]) test(`${label} streams cannot produce an installer Blob`, async () => {
  const x = fixture(() => streamed([bytes]));
  await assert.rejects(x.load(), /could not be verified/);
  assert.equal(x.blobs, 0); assert.equal(x.requests.length, 3);
  assert.ok(x.progress.every(value => value <= parts[0].bytes), 'An oversized chunk is rejected before writing or publishing its bytes');
});

test('a mismatched Content-Length is refused before consuming a part', async () => {
  const x = fixture(() => streamed([contents[0]], { 'Content-Length': '99999' }));
  await assert.rejects(x.load(), /could not be verified/);
  assert.equal(x.blobs, 0); assert.deepEqual(x.progress, []);
});

for (const [label, response] of [['HTTP failure', () => new Response('Unavailable', { status: 503 })], ['missing body', () => new Response(null)]]) test(`${label} refuses an installer Blob`, async () => {
  const x = fixture(response);
  await assert.rejects(x.load(), /temporarily unavailable/);
  assert.equal(x.blobs, 0); assert.equal(x.requests.length, 3);
});

test('a complete installer must match the page identity even when every individual part passes', async () => {
  const x = fixture();
  await assert.rejects(x.load(parts, { ...expected, sha256: '0'.repeat(64) }), /could not be verified/);
  assert.equal(x.requests.length, 3); assert.equal(x.blobs, 0); assert.equal(x.progress.at(-1), expected.bytes);
});

for (const identity of [{ ...expected, bytes: expected.bytes + 1 }, { ...expected, bytes: 0 }, { ...expected, sha256: 'invalid' },
  { ...expected, bytes: 512 * 1024 * 1024 + 1 }]) test(`invalid release identity is rejected before any fetch: ${JSON.stringify(identity)}`, async () => {
  const x = fixture(); await assert.rejects(x.load(parts, identity));
  assert.equal(x.requests.length, 0); assert.equal(x.blobs, 0);
});

for (const url of ['http://storage.example.test/part', 'https://username:password@storage.example.test/part', 'javascript:alert(1)', 'not-a-url']) test(`unsafe part URL is rejected before any fetch: ${url}`, async () => {
  const x = fixture(); await assert.rejects(x.load(parts.map((part, index) => index === 2 ? { ...part, url } : part)));
  assert.equal(x.requests.length, 0); assert.equal(x.blobs, 0);
});

test('a network failure propagates without producing a downloadable Blob', async () => {
  const failure = new Error('Network disconnected'); const x = fixture(() => { throw failure; });
  await assert.rejects(x.load(), cause => cause === failure);
  assert.equal(x.blobs, 0); assert.equal(x.requests.length, 3);
});

test('a stream failure during a later part retains no partial installer Blob', async () => {
  const failure = new Error('Stream interrupted');
  const x = fixture(index => index === 0 ? streamed([contents[0]]) : new Response(new ReadableStream({ start(controller) { controller.error(failure); } })));
  await assert.rejects(x.load(), cause => cause === failure);
  assert.equal(x.blobs, 0); assert.equal(x.requests.length, 4); assert.deepEqual(x.progress, [contents[0].length]);
});

const chunkSize = 1024 * 1024;
function largeFixture(length = chunkSize * 3 + 37) {
  const bytes = Uint8Array.from({ length }, (_, index) => index % 251);
  return { bytes, metadata: [{ url: 'https://storage.example.test/private/large?token=ephemeral', bytes: length, sha256: hash(bytes) }],
    identity: { bytes: length, sha256: hash(bytes) } };
}
function requestedRange(options) {
  const match = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range); assert.ok(match);
  return { start: Number(match[1]), end: Number(match[2]) };
}

test('large parts have exact nonoverlapping 1MiB coverage with at most three concurrent workers', async () => {
  const large = largeFixture(); let active = 0, maximum = 0;
  const x = fixture(async (_index, { options }) => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setImmediate(resolve));
    const { start, end } = requestedRange(options); active--;
    return streamed([large.bytes.slice(start, end + 1)], { 'Content-Length': String(end - start + 1) }, 206);
  });
  const blob = await x.load(large.metadata, large.identity);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), large.bytes); assert.equal(x.blobs, 1);
  assert.equal(maximum, 3);
  assert.deepEqual(x.requests.map(({ options }) => requestedRange(options)), [
    { start: 0, end: chunkSize - 1 }, { start: chunkSize, end: chunkSize * 2 - 1 },
    { start: chunkSize * 2, end: chunkSize * 3 - 1 }, { start: chunkSize * 3, end: large.bytes.length - 1 },
  ]);
  assert.deepEqual(x.progress, [chunkSize, chunkSize * 2, chunkSize * 3, large.bytes.length]);
});

test('network and partially read range retries preserve completed jobs without counting retry bytes twice', async () => {
  const large = largeFixture(chunkSize * 2 + 9); const attempts = new Map();
  const x = fixture((_index, { options }) => {
    const { start, end } = requestedRange(options), attempt = (attempts.get(start) ?? 0) + 1; attempts.set(start, attempt);
    if (start === 0 && attempt === 1) throw new Error('Temporary network failure');
    if (start === chunkSize && attempt === 1) {
      let pulled = false;
      return new Response(new ReadableStream({ pull(controller) {
        if (!pulled) { pulled = true; controller.enqueue(large.bytes.slice(start, start + 50)); }
        else controller.error(new Error('Interrupted response body'));
      } }), { status: 206 });
    }
    return streamed([large.bytes.slice(start, end + 1)], {}, 206);
  });
  const blob = await x.load(large.metadata, large.identity);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), large.bytes);
  assert.deepEqual([...attempts], [[0, 2], [chunkSize, 2], [chunkSize * 2, 1]]);
  assert.deepEqual(x.progress, [9, chunkSize + 9, large.bytes.length]);
  assert.equal(x.progress.length, 3, 'Each completed job is counted once despite two failed attempts');
});

test('a server ignoring ranges for a large part fails instead of downloading the whole file', async () => {
  const large = largeFixture(); const x = fixture(() => streamed([large.bytes]));
  await assert.rejects(x.load(large.metadata, large.identity), /temporarily unavailable/);
  assert.equal(x.blobs, 0); assert.deepEqual(x.progress, []); assert.equal(x.requests.length, 3);
});

for (const status of [401, 403, 404, 416]) test(`terminal HTTP ${status} fails immediately without retries`, async () => {
  let cancelled = 0;
  const x = fixture(() => new Response(new ReadableStream({ cancel() { cancelled++; } }), { status }));
  await assert.rejects(x.load(), /temporarily unavailable/);
  assert.equal(x.requests.length, 1); assert.equal(cancelled, 1); assert.equal(x.blobs, 0);
});

test('a terminal range failure aborts both other workers and prevents late progress', async () => {
  const large = largeFixture(); let cancelled = 0;
  const x = fixture((index, { options }) => index === 0 ? new Response(null, { status: 403 })
    : new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { cancelled++; reject(options.signal.reason); }, { once: true })));
  await assert.rejects(x.load(large.metadata, large.identity), /temporarily unavailable/);
  assert.equal(x.requests.length, 3); assert.equal(cancelled, 2); assert.deepEqual(x.progress, []); assert.equal(x.blobs, 0);
});

test('oversized failed attempts cancel and release every reader before bounded retries', async () => {
  const responses = []; let cancelled = 0;
  const x = fixture(() => {
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(parts[0].bytes + 1)); }, cancel() { cancelled++; } }));
    responses.push(response); return response;
  });
  await assert.rejects(x.load(), /could not be verified/);
  assert.equal(x.requests.length, 3); assert.equal(cancelled, 3); assert.ok(responses.every(response => !response.body.locked));
  assert.deepEqual(x.progress, []); assert.equal(x.blobs, 0);
});
