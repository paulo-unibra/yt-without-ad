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
test('library requires a private token and isolates saved data between installations', async t => {
  const { database, request } = await fixture(t);
  assert.equal((await request('favorites', undefined, '')).status, 401);
  assert.equal((await request('favorites', { value: [video], revision: 0 })).status, 200);
  assert.deepEqual((await (await request('favorites')).json()).value, [video]);
  assert.deepEqual(await (await request('favorites', undefined, other)).json(), { value: null, revision: 0 });
  const row = database.db.prepare('SELECT owner_hash FROM library_documents').get();
  assert.notEqual(row.owner_hash, token);
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
  database.put(token, 'favorites', [video], 0);
  database.close();
  database = new LibraryDatabase(join(dir, 'library.sqlite'));
  assert.deepEqual(database.get(token, 'favorites').value, [video]);
  await database.backup(join(dir, 'backup.sqlite'));
  database.put(token, 'favorites', [], 1);
  database.close();
  const restored = new LibraryDatabase(join(dir, 'backup.sqlite'));
  assert.deepEqual(restored.get(token, 'favorites').value, [video]);
  assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  restored.close();
});
