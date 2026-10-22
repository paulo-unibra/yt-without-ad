import assert from 'node:assert/strict';
import test from 'node:test';
import { DownloadLibrary, downloadLabel, isMp4Header, isAudioHeader, parseDownloads } from '../utils/download-library.ts';

const video = { id: 'aaaaaaaaaaa', title: 'Vídeo para ouvir', description: 'Descrição salva', thumbnail: '', channelTitle: 'Canal', channelId: 'channel', publishedAt: '2026-10-01T00:00:00Z' };
const other = { ...video, id: 'bbbbbbbbbbb', title: 'Outro vídeo' };
const source = { url: 'https://media.example/video.mp4', contentType: 'progressive', mediaType: 'audio', container: 'm4a', audioBitrate: 256, fileSize: 16, headers: { 'User-Agent': 'player' } };
const record = (v = video) => ({ ...v, localUri: 'file:///old-location/video.mp4', fileSize: 16, downloadedAt: '2026-10-22T00:00:00Z' });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

function fixture() {
  const state = { stored: [], files: new Map(), partial: new Map(), resolveCalls: 0, writes: 0, initCalls: 0, failWrite: false, failDelete: false };
  const ports = {
    read: async () => structuredClone(state.stored),
    write: async (items) => {
      if (state.failWrite) throw new Error('Storage full');
      state.writes++;
      state.stored = structuredClone(items);
    },
    initialize: async () => { state.initCalls++; state.partial.clear(); },
    stat: async (id) => state.files.has(id) ? { uri: `file:///documents/offline/${id}.mp4`, size: state.files.get(id) } : null,
    resolveSource: async () => { state.resolveCalls++; return source; },
    transfer: async (id, resolved, signal, progress) => {
      assert.equal(resolved.headers['User-Agent'], source.headers['User-Agent']);
      assert.match(resolved.headers['X-Download-Id'], /^[\w-]+$/);
      assert.equal(signal.aborted, false);
      state.partial.set(id, 8);
      progress(8, 16);
      state.partial.set(id, 16);
      progress(16, 16);
    },
    commit: async (id) => {
      state.files.set(id, state.partial.get(id));
      state.partial.delete(id);
      return ports.stat(id);
    },
    cleanup: async (id, full) => {
      if (state.failDelete) throw new Error('File busy');
      state.partial.delete(id);
      if (full) state.files.delete(id);
    },
  };
  return { state, ports, library: new DownloadLibrary(ports) };
}

test('saves the complete file and metadata together and clears the active job', async () => {
  const { state, library } = fixture();
  const saved = await library.start(video);
  assert.equal(saved.mediaType, 'audio');
  assert.equal(saved.container, 'm4a');
  assert.equal(saved.audioBitrate, 256);
  assert.equal(saved.title, video.title);
  assert.equal(saved.fileSize, 16);
  assert.equal(state.files.get(video.id), 16);
  assert.equal(state.partial.size, 0);
  assert.deepEqual(state.stored, [saved]);
  assert.deepEqual(library.getSnapshot().jobs, {});
});

test('does not expose an in-progress file as available offline', async () => {
  const { state, ports, library } = fixture();
  const started = deferred();
  const finish = deferred();
  ports.transfer = async (id, _source, _signal, progress) => {
    state.partial.set(id, 8);
    progress(8, 16);
    started.resolve();
    await finish.promise;
    state.partial.set(id, 16);
  };
  const saving = library.start(video);
  await started.promise;
  assert.equal(library.getSnapshot().items.length, 0);
  assert.equal(library.getSnapshot().jobs[video.id].bytesWritten, 8);
  assert.deepEqual(state.stored, []);
  await library.refresh();
  assert.equal(state.partial.get(video.id), 8);
  assert.equal(state.initCalls, 1);
  finish.resolve();
  await saving;
});

test('fresh app instance opens persisted metadata and local file with the backend offline', async () => {
  const { ports, state, library } = fixture();
  await library.start(video);
  ports.resolveSource = async () => { throw new Error('Network is offline'); };
  const restarted = new DownloadLibrary(ports);
  const saved = await restarted.getPlayable(video.id);
  assert.equal(saved.mediaType, 'audio');
  assert.equal(saved.container, 'm4a');
  assert.equal(saved.audioBitrate, 256);
  assert.equal(saved.title, video.title);
  assert.equal(saved.localUri, `file:///documents/offline/${video.id}.mp4`);
  assert.equal(state.resolveCalls, 1);
});

test('uses a saved copy without extracting or downloading it again', async () => {
  const { library, state } = fixture();
  await library.start(video);
  await library.start(video);
  assert.equal(state.resolveCalls, 1);
  assert.equal(state.stored.length, 1);
});

test('simultaneous taps share the same transfer', async () => {
  const { library, state } = fixture();
  const first = library.start(video);
  const second = library.start(video);
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(state.resolveCalls, 1);
});

test('concurrent completions do not overwrite one another in the library', async () => {
  const { library, state } = fixture();
  await Promise.all([library.start(video), library.start(other)]);
  assert.deepEqual(new Set(state.stored.map((item) => item.id)), new Set([video.id, other.id]));
});

test('transfer failure cleans partial files and allows a new attempt with a fresh URL', async () => {
  const { ports, state, library } = fixture();
  const success = ports.transfer;
  ports.transfer = async (id) => { state.partial.set(id, 8); throw new Error('HTTP 403'); };
  assert.equal(await library.start(video), null);
  assert.equal(state.partial.size, 0);
  assert.equal(state.stored.length, 0);
  assert.match(library.getSnapshot().jobs[video.id].error, /403/);
  ports.transfer = success;
  assert.ok(await library.start(video));
  assert.equal(state.resolveCalls, 2);
});

test('cancellation while preparing ignores a late source response', async () => {
  const { ports, state, library } = fixture();
  const started = deferred();
  const prepared = deferred();
  ports.resolveSource = async () => { started.resolve(); return prepared.promise; };
  const saving = library.start(video);
  await started.promise;
  library.cancel(video.id);
  prepared.resolve(source);
  assert.equal(await saving, null);
  assert.equal(state.files.size, 0);
  assert.equal(state.stored.length, 0);
  assert.deepEqual(library.getSnapshot().jobs, {});
});

test('cancellation during transfer removes the partial file without a false error', async () => {
  const { ports, state, library } = fixture();
  const started = deferred();
  ports.transfer = (id, _source, signal) => new Promise((_resolve, reject) => {
    state.partial.set(id, 8);
    signal.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
    started.resolve();
  });
  const saving = library.start(video);
  await started.promise;
  library.cancel(video.id);
  assert.equal(await saving, null);
  assert.equal(state.partial.size, 0);
  assert.equal(state.stored.length, 0);
  assert.deepEqual(library.getSnapshot().jobs, {});
});

test('cancellation during finalization removes the complete but unindexed file', async () => {
  const { ports, state, library } = fixture();
  const commit = ports.commit;
  ports.commit = async (id) => { const saved = await commit(id); library.cancel(id); return saved; };
  assert.equal(await library.start(video), null);
  assert.equal(state.files.size, 0);
  assert.equal(state.stored.length, 0);
});

test('index-write failure rolls back the downloaded file', async () => {
  const { library, state } = fixture();
  await library.hydrate();
  state.failWrite = true;
  assert.equal(await library.start(video), null);
  assert.equal(state.files.size, 0);
  assert.deepEqual(state.stored, []);
  assert.equal(library.getSnapshot().items.length, 0);
});

test('rejects HLS manifests rather than marking them as downloaded video files', async () => {
  const { library, ports, state } = fixture();
  ports.resolveSource = async () => ({ ...source, contentType: 'hls' });
  assert.equal(await library.start(video), null);
  assert.equal(state.partial.size, 0);
  assert.equal(state.stored.length, 0);
});

test('an incomplete transfer never enters the saved library', async () => {
  const { library, ports, state } = fixture();
  ports.transfer = async (id) => { state.partial.set(id, 8); };
  assert.equal(await library.start(video), null);
  assert.equal(state.files.size, 0);
  assert.equal(state.stored.length, 0);
  assert.match(library.getSnapshot().jobs[video.id].error, /incompleto/);
});

test('missing and truncated local files are removed from the visible library on restart', async () => {
  const { library, state } = fixture();
  state.stored = [record(), record(other)];
  state.files.set(other.id, 8);
  await library.hydrate();
  assert.deepEqual(library.getSnapshot().items, []);
});

test('deleting a download removes both file and persisted entry', async () => {
  const { library, state } = fixture();
  await library.start(video);
  await library.remove(video.id);
  assert.equal(state.files.size, 0);
  assert.deepEqual(state.stored, []);
  assert.equal(await library.getPlayable(video.id), null);
});

test('deletion failure keeps the saved entry for retry', async () => {
  const { library, state } = fixture();
  await library.start(video);
  state.failDelete = true;
  await assert.rejects(library.remove(video.id), /File busy/);
  assert.equal(state.stored.length, 1);
  assert.equal(library.getSnapshot().items.length, 1);
});

test('corrupt storage fails without clearing stored metadata or deleting files', async () => {
  const { library, ports, state } = fixture();
  ports.read = async () => parseDownloads('{broken');
  await assert.rejects(library.hydrate());
  assert.equal(state.writes, 0);
  assert.equal(state.initCalls, 0);
  assert.equal(library.getSnapshot().ready, false);
});

test('persisted records reject path traversal IDs, partial entries, and duplicates', () => {
  assert.deepEqual(parseDownloads(JSON.stringify([record(), record(), { ...record(), id: '../unsafe/path' }, { ...record(other), fileSize: 0 }])), [record()]);
});

test('MP4 validation rejects HTML errors and HLS playlists', () => {
  const header = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
  assert.equal(isMp4Header(header), true);
  assert.equal(isMp4Header(new TextEncoder().encode('<html>Error</html>')), false);
  assert.equal(isMp4Header(new TextEncoder().encode('#EXTM3U\nsegment.ts')), false);
});

test('unknown content length shows bytes instead of invalid percentages', () => {
  assert.equal(downloadLabel({ video, phase: 'downloading', bytesWritten: 1024, totalBytes: -1 }), 'Baixando 1 KB');
  assert.equal(downloadLabel({ video, phase: 'downloading', bytesWritten: 8, totalBytes: 16 }), 'Baixando 50%');
});

test('audio signatures support M4A and WebM and reject HTTP error pages', () => {
  const m4a = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 77, 52, 65, 32]);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f]);
  assert.equal(isAudioHeader(m4a, 'm4a'), true);
  assert.equal(isAudioHeader(webm, 'webm'), true);
  assert.equal(isAudioHeader(m4a, 'webm'), false);
  assert.equal(isAudioHeader(webm, 'm4a'), false);
  for (const container of ['m4a', 'webm']) {
    assert.equal(isAudioHeader(new TextEncoder().encode('<html>Forbidden</html>'), container), false);
  }
});

test('keeps legacy video records while saving new audio downloads', async () => {
  const { state, library } = fixture();
  state.stored = [record(other)];
  state.files.set(other.id, 16);
  await library.start(video);
  const items = library.getSnapshot().items;
  assert.equal(items.length, 2);
  assert.equal(items.find(item => item.id === video.id).mediaType, 'audio');
  assert.equal(items.find(item => item.id === other.id).mediaType, undefined);
});

test('rejects outdated video download sources instead of silently saving video', async () => {
  const { library, ports, state } = fixture();
  ports.resolveSource = async () => ({ ...source, mediaType: undefined });
  assert.equal(await library.start(video), null);
  assert.equal(state.partial.size, 0);
  assert.equal(state.stored.length, 0);
});
