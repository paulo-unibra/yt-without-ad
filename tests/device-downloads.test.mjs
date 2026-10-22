import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceDownloadStorage } from '../utils/device-downloads.ts';

const downloaded = { id: 'aaaaaaaaaaa', title: 'Salvo', description: '', thumbnail: '', channelTitle: '', channelId: '', publishedAt: '', localUri: 'file:///audio.m4a', downloadedAt: '', fileSize: 16 };
function fixture() {
  const local = new Map();
  return { local, storage: deviceDownloadStorage({ read: async key => local.get(key) ?? null, write: async (key, raw) => { local.set(key, raw); } }) };
}
test('migrates the latest local download index and never writes a shared cloud document', async () => {
  const { storage, local } = fixture();
  local.set('@database:downloaded_videos', JSON.stringify({ raw: JSON.stringify([downloaded]), revision: 4 }));
  assert.deepEqual(await storage.read(), [downloaded]);
  await storage.write([]); // arquivos indisponíveis neste aparelho
  assert.deepEqual(await storage.read(), []);
  assert.equal(JSON.parse(local.get('@database:downloaded_videos')).revision, 4);
  assert.equal(local.has('@saved_videos'), false);
});
test('a fresh installation starts with no local files without changing the server catalog', async () => {
  const { storage, local } = fixture();
  assert.deepEqual(await storage.read(), []);
  await storage.write([]);
  assert.deepEqual([...local.keys()], ['@device_downloads_v2']);
});
test('malformed previous index fails before any cleanup or replacement can lose files', async () => {
  const { storage, local } = fixture();
  local.set('@database:downloaded_videos', '{broken');
  await assert.rejects(storage.read(), SyntaxError);
  assert.equal(local.has('@device_downloads_v2'), false);
});
