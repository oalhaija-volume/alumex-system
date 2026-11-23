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

function streamed(chunks, headers = {}) {
  return new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(chunk);
    controller.close();
  } }), { status: 200, headers });
}

function fixture(handler = index => streamed([contents[index].slice(0, 1), contents[index].slice(1)], { 'Content-Length': String(contents[index].length) })) {
  const requests = [], progress = [];
  let blobs = 0;
  class VerifiedBlob extends Blob { constructor(...args) { super(...args); blobs++; } }
  const exports = {};
  new Function('exports', 'fetch', 'crypto', 'Blob', code)(exports, async (url, options) => {
    const index = requests.length; requests.push({ url, options }); return handler(index);
  }, webcrypto, VerifiedBlob);
  return { requests, progress, get blobs() { return blobs; },
    load: (metadata = parts, identity = expected) => exports.loadWindowsInstaller(metadata, identity, bytes => progress.push(bytes)) };
}

test('three verified streams produce one exact installer Blob with cumulative progress and private fetches', async () => {
  const x = fixture(); const blob = await x.load();
  assert.ok(blob instanceof Blob); assert.equal(x.blobs, 1);
  assert.equal(blob.size, whole.length); assert.equal(blob.type, 'application/octet-stream');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), whole);
  assert.deepEqual(x.progress, [1, 5, 6, 8, 9, 10]);
  assert.deepEqual(x.requests.map(request => request.url), parts.map(part => part.url));
  for (const { options } of x.requests) assert.deepEqual(options, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
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
  assert.equal(x.blobs, 0); assert.equal(x.requests.length, 1);
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
  assert.equal(x.blobs, 0); assert.equal(x.requests.length, 1);
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
  assert.equal(x.blobs, 0); assert.equal(x.requests.length, 1);
});

test('a stream failure during a later part retains no partial installer Blob', async () => {
  const failure = new Error('Stream interrupted');
  const x = fixture(index => index === 0 ? streamed([contents[0]]) : new Response(new ReadableStream({ start(controller) { controller.error(failure); } })));
  await assert.rejects(x.load(), cause => cause === failure);
  assert.equal(x.blobs, 0); assert.equal(x.requests.length, 2); assert.deepEqual(x.progress, [contents[0].length]);
});
