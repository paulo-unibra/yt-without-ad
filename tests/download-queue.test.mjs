import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadQueue } from '../utils/download-queue.ts';

const one = { id: 'aaaaaaaaaaa', title: 'Um' }, two = { id: 'bbbbbbbbbbb', title: 'Dois' }, three = { id: 'ccccccccccc', title: 'Três' };
test('downloads sequentially, deduplicates playlists and skips files already on this device', async () => {
  const started = [];
  let concurrent = 0, max = 0;
  const queue = new DownloadQueue({
    getPlayable: async id => id === one.id ? { id } : null,
    start: async video => { started.push(video.id); concurrent++; max = Math.max(max, concurrent); await new Promise(resolve => setTimeout(resolve, 5)); concurrent--; return video; },
    cancel: () => {},
  });
  await queue.start([one, two, two, three], 'Playlist');
  assert.deepEqual(started, [two.id, three.id]);
  assert.equal(max, 1);
  assert.deepEqual(queue.getSnapshot(), { running: false, title: 'Playlist', total: 3, completed: 2, skipped: 1, failed: [], current: null, cancelled: false });
});
test('records partial failures, continues the queue and retries missing files without redownloading successes', async () => {
  const saved = new Set();
  let fail = true;
  const queue = new DownloadQueue({ getPlayable: async id => saved.has(id),
    start: async video => { if (video.id === two.id && fail) return null; saved.add(video.id); return video; }, cancel: () => {} });
  await queue.start([one, two, three], 'Tudo');
  assert.deepEqual(queue.getSnapshot().failed, [two]);
  assert.equal(queue.getSnapshot().completed, 2);
  fail = false;
  await queue.start([one, two, three], 'Tudo');
  assert.equal(queue.getSnapshot().skipped, 2);
  assert.equal(queue.getSnapshot().completed, 1);
  assert.deepEqual(queue.getSnapshot().failed, []);
});
test('cancel stops the current download and prevents pending items; duplicate clicks share the same queue', async () => {
  let finish, notifyStarted;
  const began = new Promise(resolve => { notifyStarted = resolve; });
  const cancelled = [], started = [];
  const queue = new DownloadQueue({ getPlayable: async () => null,
    start: video => { started.push(video.id); notifyStarted(); return new Promise(resolve => { finish = resolve; }); },
    cancel: id => { cancelled.push(id); finish(null); } });
  const operation = queue.start([one, two], 'Tudo');
  assert.equal(queue.start([three], 'Outra'), operation);
  await began;
  queue.cancel();
  await operation;
  assert.deepEqual(started, [one.id]);
  assert.deepEqual(cancelled, [one.id]);
  assert.equal(queue.getSnapshot().cancelled, true);
  assert.equal(queue.getSnapshot().completed, 0);
  assert.deepEqual(queue.getSnapshot().failed, []);
});
