const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const { LibraryDatabase } = require('../library-database');
const { createApp } = require('../server');

const token = 'a'.repeat(64), other = 'b'.repeat(64);
const video = { id: 'aaaaaaaaaaa', title: 'Música', description: '', thumbnail: '', channelTitle: 'Cantor', channelId: 'c', publishedAt: '' };
async function fixture(t) {
  const database = new LibraryDatabase(':memory:');
  const server = createApp({ database }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); database.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/library`;
  const request = (key, body, auth = token) => fetch(`${url}/${key}`, {
    method: body ? 'PUT' : 'GET', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { database, request };
}
test('one shared library is restored without login or an installation token', async t => {
  const { database, request } = await fixture(t);
  assert.equal((await request('favorites', undefined, '')).status, 200);
  assert.equal((await request('favorites', { value: [video], revision: 0 })).status, 200);
  assert.deepEqual((await (await request('favorites')).json()).value, [video]);
  assert.deepEqual(await (await request('favorites', undefined, other)).json(), { value: [video], revision: 1 });
  const columns = database.db.prepare('PRAGMA table_info(shared_library_documents)').all().map(row => row.name);
  assert.equal(columns.includes('owner_hash'), false);
});
test('outdated writes are rejected without losing newer saved videos', async t => {
  const { request } = await fixture(t);
  await request('favorites', { value: [video], revision: 0 });
  assert.equal((await request('favorites', { value: [], revision: 0 })).status, 409);
  assert.equal((await request('favorites', { value: [], revision: 1 })).status, 200);
  assert.deepEqual(await (await request('favorites')).json(), { value: [], revision: 2 });
});
test('invalid collections, malformed JSON and duplicate videos are rejected', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('passwords')).status, 404);
  for (const value of [{}, [video, video], [{ ...video, id: '../../bad' }]]) {
    assert.equal((await request('favorites', { value, revision: 0 })).status, 400);
  }
  assert.equal((await request('playlists', { value: [{ id: 'list', name: ' ', createdAt: '', videos: [] }], revision: 0 })).status, 400);
  assert.equal((await request('favorites', { value: [], revision: -1 })).status, 400);
});
test('database survives restart and creates a consistent recoverable backup', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'yt-database-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let database = new LibraryDatabase(join(dir, 'library.sqlite'));
  database.put('favorites', [video], 0);
  database.close();
  database = new LibraryDatabase(join(dir, 'library.sqlite'));
  assert.deepEqual(database.get('favorites').value, [video]);
  await database.backup(join(dir, 'backup.sqlite'));
  database.put('favorites', [], 1);
  database.close();
  const restored = new LibraryDatabase(join(dir, 'backup.sqlite'));
  assert.deepEqual(restored.get('favorites').value, [video]);
  assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  restored.close();
});

test('saving playlists registers durable titles even if a fresh installation has no local downloads', async t => {
  const { request } = await fixture(t);
  const playlist = { id: 'music', name: 'Músicas', createdAt: '2026-10-22', videos: [video] };
  await request('playlists', { value: [playlist], revision: 0 });
  assert.deepEqual((await (await request('playlists', undefined, '')).json()).value, [playlist]);
  await request('downloaded_videos', { value: [], revision: 0 });
  assert.deepEqual((await (await request('saved_videos', undefined, '')).json()).value, [video]);
});

test('merges previous installation libraries once and preserves them as an archive', t => {
  const { DatabaseSync } = require('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'yt-legacy-library-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'library.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec('CREATE TABLE library_documents(owner_hash TEXT, document_key TEXT, value TEXT, revision INTEGER, updated_at TEXT)');
  const insert = legacy.prepare('INSERT INTO library_documents VALUES(?, ?, ?, 1, ?)');
  const second = { ...video, id: 'bbbbbbbbbbb', title: 'Outro título' };
  insert.run('old-installation', 'playlists', JSON.stringify([{ id: 'list', name: 'Músicas', createdAt: '', videos: [video] }]), '2026-10-21');
  insert.run('new-installation', 'playlists', JSON.stringify([{ id: 'list', name: 'Músicas', createdAt: '', videos: [second] }]), '2026-10-22');
  insert.run('old-installation', 'downloaded_videos', JSON.stringify([{ ...video, localUri: 'file:///old/audio.m4a', downloadedAt: '', fileSize: 16 }]), '2026-10-22');
  legacy.close();
  let database = new LibraryDatabase(path);
  assert.deepEqual(database.get('playlists').value[0].videos, [video, second]);
  assert.deepEqual(database.get('saved_videos').value, [video, second]);
  assert.equal(database.db.prepare('SELECT count(*) AS n FROM library_documents').get().n, 3);
  database.put('playlists', [], 1);
  database.close();
  database = new LibraryDatabase(path);
  assert.deepEqual(database.get('playlists').value, []); // não ressuscita listas removidas
  assert.deepEqual(database.get('saved_videos').value, [video, second]);
  database.close();
});
