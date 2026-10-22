const assert = require('node:assert/strict');
const test = require('node:test');
const { once } = require('node:events');
const { createApp } = require('../server');

const id = 'aaaaaaaaaaa';
const info = {
  url: 'https://rr1.googlevideo.com/videoplayback?ip=extractor-ip',
  title: 'Public test video', height: 360, duration: 30, ext: 'm4a', protocol: 'https',
  vcodec: 'none', acodec: 'mp4a', filesize: 16,
  http_headers: { 'User-Agent': 'extractor-client', Referer: 'https://www.youtube.com/', Cookie: 'private' },
};
const mp4 = Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0]);
async function backend(t, options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('prepared source downloads through the extraction host and streams audio bytes', async t => {
  let extractions = 0;
  const url = await backend(t, {
    getDownloadInfo: async () => { extractions++; return info; },
    fetchMedia: async (source, options) => {
      assert.equal(source, info.url);
      assert.equal(options.headers['User-Agent'], 'extractor-client');
      assert.equal(options.headers.Cookie, undefined);
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.redirect, 'manual');
      return new Response(mp4, { headers: { 'Content-Length': String(mp4.length) } });
    },
  });
  const metadata = await (await fetch(`${url}/api/download-source/${id}`)).json();
  assert.equal(metadata.downloadPath, `/api/download/${id}?audioFormat=best`);
  const response = await fetch(`${url}${metadata.downloadPath}`, { headers: { Authorization: 'phone-only' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mp4');
  assert.equal(response.headers.get('content-length'), String(mp4.length));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp4);
  assert.equal(extractions, 1);
});

test('can obtain a fresh source without a preparation request', async t => {
  const url = await backend(t, { getDownloadInfo: async () => info, fetchMedia: async () => new Response(mp4) });
  const response = await fetch(`${url}/api/download/${id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp4);
});

test('does not send an upstream error page as a successful downloaded video', async t => {
  let blocked = true;
  let extractions = 0;
  const url = await backend(t, {
    getDownloadInfo: async () => { extractions++; return info; },
    fetchMedia: async () => blocked ? new Response('forbidden', { status: 403 }) : new Response(mp4),
  });
  const failed = await fetch(`${url}/api/download/${id}`);
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).code, 'DOWNLOAD_UPSTREAM_FAILED');
  blocked = false;
  const retry = await fetch(`${url}/api/download/${id}`);
  assert.deepEqual(Buffer.from(await retry.arrayBuffer()), mp4);
  assert.equal(extractions, 2);
});

test('rejects invalid IDs before source extraction', async t => {
  const url = await backend(t, { getDownloadInfo: async () => { throw new Error('must not extract'); } });
  assert.equal((await fetch(`${url}/api/download/invalid`)).status, 400);
});

test('relay cannot fetch arbitrary hosts, credentials, custom ports or unsafe redirects', async t => {
  for (const destination of ['http://127.0.0.1/private', 'https://googlevideo.com.attacker.test/file',
    'https://user:pass@rr1.googlevideo.com/file', 'https://rr1.googlevideo.com:444/file']) {
    const url = await backend(t, {
      getDownloadInfo: async () => ({ ...info, url: destination }),
      fetchMedia: async () => { throw new Error('must not request'); },
    });
    const response = await fetch(`${url}/api/download/${id}`);
    assert.equal((await response.json()).code, 'DOWNLOAD_INVALID_SOURCE');
  }
  let calls = 0;
  const url = await backend(t, {
    getDownloadInfo: async () => info,
    fetchMedia: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }); },
  });
  const response = await fetch(`${url}/api/download/${id}`);
  assert.equal((await response.json()).code, 'DOWNLOAD_INVALID_SOURCE');
  assert.equal(calls, 1);
});

test('follows a media CDN redirect without changing extraction headers', async t => {
  const calls = [];
  const url = await backend(t, {
    getDownloadInfo: async () => info,
    fetchMedia: async (address, options) => {
      calls.push(address);
      assert.equal(options.headers['User-Agent'], 'extractor-client');
      return calls.length === 1
        ? new Response(null, { status: 302, headers: { location: 'https://rr2.googlevideo.com/redirected' } })
        : new Response(mp4);
    },
  });
  const response = await fetch(`${url}/api/download/${id}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mp4);
  assert.equal(calls.length, 2);
});

test('stalled upstream requests time out instead of leaving a download pending', async t => {
  const url = await backend(t, {
    idleTimeoutMs: 30,
    getDownloadInfo: async () => info,
    fetchMedia: (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
  });
  const response = await fetch(`${url}/api/download/${id}`);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, 'DOWNLOAD_TIMEOUT');
});

test('cancelling the app request cancels the upstream transfer', async t => {
  let aborted;
  const cancelled = new Promise(resolve => { aborted = resolve; });
  const url = await backend(t, {
    getDownloadInfo: async () => info,
    fetchMedia: async (_url, { signal }) => {
      signal.addEventListener('abort', aborted, { once: true });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(mp4); } }));
    },
  });
  const controller = new AbortController();
  const response = await fetch(`${url}/api/download/${id}`, { signal: controller.signal });
  const reader = response.body.getReader();
  assert.equal((await reader.read()).value.length, mp4.length);
  controller.abort();
  await Promise.race([cancelled, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('upstream not cancelled')), 1000); timer.unref(); })]);
});

test('format-specific preparation is cached separately and WebM has audio MIME and extension', async t => {
  const extractions = [];
  const url = await backend(t, {
    getDownloadInfo: async (_id, { audioFormat }) => {
      extractions.push(audioFormat);
      return { ...info, ext: audioFormat === 'm4a' ? 'm4a' : 'webm' };
    },
    fetchMedia: async () => new Response(mp4),
  });
  for (const format of ['best', 'm4a']) {
    const metadata = await (await fetch(`${url}/api/download-source/${id}?audioFormat=${format}`)).json();
    assert.equal(metadata.mediaType, 'audio');
    const response = await fetch(`${url}${metadata.downloadPath}`);
    assert.equal(response.status, 200);
    const extension = format === 'm4a' ? 'm4a' : 'webm';
    assert.equal(response.headers.get('content-type'), format === 'm4a' ? 'audio/mp4' : 'audio/webm');
    assert.match(response.headers.get('content-disposition'), new RegExp(`${id}\\.${extension}`));
    await response.arrayBuffer();
  }
  assert.deepEqual(extractions, ['best', 'm4a']);
});

test('download trace is reused across preparation and transfer without forwarding it to YouTube', async t => {
  const trace = 'android-download-test-123';
  const url = await backend(t, {
    getDownloadInfo: async (_id, options) => { assert.equal(options.downloadId, trace); return info; },
    fetchMedia: async (_source, options) => {
      assert.equal(options.headers['X-Download-Id'], undefined);
      return new Response(mp4);
    },
  });
  const preparation = await fetch(`${url}/api/download-source/${id}`, { headers: { 'X-Download-Id': trace } });
  assert.equal(preparation.headers.get('x-download-id'), trace);
  const source = await preparation.json();
  const transfer = await fetch(`${url}${source.downloadPath}`, { headers: { 'X-Download-Id': trace } });
  assert.equal(transfer.headers.get('x-download-id'), trace);
  assert.deepEqual(Buffer.from(await transfer.arrayBuffer()), mp4);
});
