const assert = require('node:assert/strict');
const test = require('node:test');
const { once } = require('node:events');
const { createApp } = require('../server');
const { toVideoStream, toDownloadSource, downloadFormat } = require('../extractor');

const info = {
  url: 'https://media.example.com/video.mp4',
  title: 'Public test video',
  height: 360,
  duration: 30,
  ext: 'mp4',
  protocol: 'https',
  vcodec: 'avc1',
  acodec: 'mp4a',
};

const audioInfo = { ...info, vcodec: 'none', ext: 'webm', acodec: 'opus', abr: 160 };

async function backend(t, options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('keeps progressive streams with audio and video', () => {
  const stream = toVideoStream(info);
  assert.equal(stream.url, info.url);
  assert.equal(stream.contentType, 'progressive');
});

test('rejects separate audio/video formats instead of playing a silent video', () => {
  for (const format of [{ ...info, acodec: 'none' }, { ...info, vcodec: 'none' }, { ...info, url: '' }]) {
    assert.throws(() => toVideoStream(format), { code: 'NO_PLAYABLE_FORMAT' });
  }
});

test('identifies HLS even when the URL has no m3u8 extension', () => {
  const stream = toVideoStream({ ...info, url: 'https://media.example.com/manifest', protocol: 'm3u8_native' });
  assert.equal(stream.contentType, 'hls');
});

test('forwards playback headers without passing server cookies to the app', () => {
  const stream = toVideoStream({ ...info, http_headers: { 'User-Agent': 'player', Cookie: 'private' } });
  assert.deepEqual(stream.headers, { 'User-Agent': 'player' });
});

test('health endpoint is available without contacting YouTube', async (t) => {
  const url = await backend(t, { getVideoInfo: () => { throw new Error('must not extract'); } });
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).extractor, 'yt-dlp');
});

test('stream endpoint returns the selected stream', async (t) => {
  const url = await backend(t, { getVideoInfo: async (id) => {
    assert.equal(id, 'aqz-KE-bpKQ');
    return info;
  } });
  const response = await fetch(`${url}/api/stream/aqz-KE-bpKQ`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, info.url);
});

test('invalid IDs are rejected before extraction', async (t) => {
  let calls = 0;
  const url = await backend(t, { getVideoInfo: async () => { calls++; return info; } });
  const response = await fetch(`${url}/api/stream/invalid`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_VIDEO_ID');
  assert.equal(calls, 0);
});

test('reachable backend reports extraction failures instead of a connection failure', async (t) => {
  const url = await backend(t, { getVideoInfo: async () => { throw new Error('No playable formats'); } });
  const response = await fetch(`${url}/api/stream/aqz-KE-bpKQ`);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'No playable formats');
});

test('extraction timeout returns HTTP 504', async (t) => {
  const url = await backend(t, { getVideoInfo: async () => {
    throw Object.assign(new Error('Extraction timed out'), { code: 'EXTRACTION_TIMEOUT' });
  } });
  const response = await fetch(`${url}/api/stream/aqz-KE-bpKQ`);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, 'EXTRACTION_TIMEOUT');
});

test('download endpoint returns a best audio source with its known size', async (t) => {
  const url = await backend(t, { getDownloadInfo: async () => ({ ...audioInfo, url: 'https://rr1.googlevideo.com/videoplayback', filesize: 1234 }) });
  const response = await fetch(`${url}/api/download-source/aqz-KE-bpKQ`);
  assert.equal(response.status, 200);
  const source = await response.json();
  assert.equal(source.contentType, 'progressive');
  assert.equal(source.fileSize, 1234);
  assert.equal(source.mediaType, 'audio');
  assert.equal(source.container, 'webm');
  assert.equal(source.audioBitrate, 160);
});

test('download source rejects live streams and HLS manifests', () => {
  for (const invalid of [{ ...audioInfo, is_live: true }, { ...audioInfo, protocol: 'm3u8_native' }, { ...audioInfo, vcodec: 'avc1' }]) {
    assert.throws(() => toDownloadSource(invalid), { code: 'DOWNLOAD_UNAVAILABLE' });
  }
});

test('unavailable offline formats return a specific HTTP 422 error', async (t) => {
  const url = await backend(t, { getDownloadInfo: async () => ({ ...audioInfo, is_live: true }) });
  const response = await fetch(`${url}/api/download-source/aqz-KE-bpKQ`);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'DOWNLOAD_UNAVAILABLE');
});

test('audio format selector chooses the best audio-only track and supports iOS M4A', async t => {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  const { tmpdir } = require('node:os');
  const { promisify } = require('node:util');
  const run = promisify(require('node:child_process').execFile);
  const { YOUTUBE_DL_PATH } = require('youtube-dl-exec').constants;
  const dir = await fs.mkdtemp(path.join(tmpdir(), 'yt-audio-formats-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const fixture = path.join(dir, 'info.json');
  await fs.writeFile(fixture, JSON.stringify({
    id: 'aaaaaaaaaaa', title: 'Audio format selection', extractor: 'youtube', extractor_key: 'Youtube',
    webpage_url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
    formats: [
      { format_id: 'video', url: 'https://rr1.googlevideo.com/video', ext: 'mp4', protocol: 'https', vcodec: 'avc1', acodec: 'aac', abr: 512, height: 1080 },
      { format_id: 'aac', url: 'https://rr1.googlevideo.com/aac', ext: 'm4a', protocol: 'https', vcodec: 'none', acodec: 'mp4a.40.2', abr: 128 },
      { format_id: 'opus-low', url: 'https://rr1.googlevideo.com/opus-low', ext: 'webm', protocol: 'https', vcodec: 'none', acodec: 'opus', abr: 64 },
      { format_id: 'opus-best', url: 'https://rr1.googlevideo.com/opus-best', ext: 'webm', protocol: 'https', vcodec: 'none', acodec: 'opus', abr: 160 },
    ],
  }));
  for (const [format, expected] of [['best', 'opus-best'], ['m4a', 'aac']]) {
    const { stdout } = await run(YOUTUBE_DL_PATH, ['--ignore-config', '--skip-download', '--dump-single-json', '--load-info-json', fixture, '--format', downloadFormat(format)], { timeout: 10000, maxBuffer: 1024 * 1024 });
    const selected = JSON.parse(stdout);
    assert.equal(selected.format_id, expected);
    assert.equal(selected.vcodec, 'none');
  }
});

test('audio download metadata never accepts muxed video or missing audio', () => {
  assert.throws(() => toDownloadSource(info), { code: 'DOWNLOAD_UNAVAILABLE' });
  assert.throws(() => toDownloadSource({ ...audioInfo, acodec: 'none' }), { code: 'DOWNLOAD_UNAVAILABLE' });
  assert.equal(toDownloadSource(audioInfo).mimeType, 'audio/webm');
  assert.equal(toDownloadSource({ ...audioInfo, ext: 'm4a' }).mimeType, 'audio/mp4');
});
