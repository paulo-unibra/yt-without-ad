import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseStorage } from '../utils/database-storage.ts';

function fixture() {
  const local = new Map(), documents = new Map();
  const state = { offline: false, writes: 0, failCache: false };
  const ports = {
    readLocal: async key => local.get(key) ?? null,
    writeLocal: async (key, raw) => { if (state.failCache) throw new Error('disk'); local.set(key, raw); },
    get: async key => { if (state.offline) throw new Error('offline'); return structuredClone(documents.get(key) ?? { value: null, revision: 0 }); },
    put: async (key, value, revision) => {
      if (state.offline) throw new Error('offline');
      if ((documents.get(key)?.revision ?? 0) !== revision) throw new Error('conflict');
      const document = { value, revision: revision + 1 };
      documents.set(key, structuredClone(document)); state.writes++; return document;
    },
    isUnavailable: error => error.message === 'offline',
  };
  return { local, documents, state, ports, storage: new DatabaseStorage(ports) };
}
test('migrates saved data once without removing the legacy backup', async () => {
  const { storage, local, documents, state, ports } = fixture();
  local.set('@playlists', '[{"id":"old"}]');
  assert.equal(await storage.getItem('@playlists'), '[{"id":"old"}]');
  assert.deepEqual(documents.get('playlists').value, [{ id: 'old' }]);
  assert.equal(local.get('@playlists'), '[{"id":"old"}]');
  await new DatabaseStorage(ports).getItem('@playlists');
  assert.equal(state.writes, 1);
});
test('server data takes precedence over older legacy data', async () => {
  const { storage, local, documents } = fixture();
  local.set('@favorites', '["old"]');
  documents.set('favorites', { value: ['new'], revision: 2 });
  assert.equal(await storage.getItem('@favorites'), '["new"]');
});

test('switching to an empty production database migrates the newest local cache', async () => {
  const { storage, local, documents, ports } = fixture();
  local.set('@favorites', '["legacy"]');
  await storage.getItem('@favorites');
  await storage.setItem('@favorites', '["latest"]');
  documents.clear(); // O servidor de produção ainda não tem a biblioteca deste aparelho.
  const restarted = new DatabaseStorage(ports);
  assert.equal(await restarted.getItem('@favorites'), '["latest"]');
  assert.deepEqual(documents.get('favorites'), { value: ['latest'], revision: 1 });
});
test('reads saved playlists offline after restart and never reports an offline write as saved', async () => {
  const { storage, ports, state, documents } = fixture();
  await storage.setItem('@favorites', '["saved"]');
  state.offline = true;
  const restarted = new DatabaseStorage(ports);
  assert.equal(await restarted.getItem('@favorites'), '["saved"]');
  await restarted.setItem('@favorites', '["saved"]'); // hydrate sem alteração funciona offline
  await assert.rejects(restarted.setItem('@favorites', '[]'), /offline/);
  assert.deepEqual(documents.get('favorites').value, ['saved']);
});
test('does not overwrite a newer remote document or malformed legacy data', async () => {
  const { storage, documents, local, state } = fixture();
  await storage.getItem('@favorites');
  documents.set('favorites', { value: ['other'], revision: 1 });
  await assert.rejects(storage.setItem('@favorites', '["stale"]'), /conflict/);
  assert.deepEqual(documents.get('favorites').value, ['other']);
  local.set('@playlists', '{broken');
  await assert.rejects(storage.getItem('@playlists'), SyntaxError);
  assert.equal(state.writes, 0);
});
test('cache failure after a database commit does not falsely report that the commit failed', async () => {
  const { storage, state, documents } = fixture();
  state.failCache = true;
  await storage.setItem('@favorites', '[]');
  assert.deepEqual(documents.get('favorites'), { value: [], revision: 1 });
});

test('a fresh offline installation reports a load failure instead of presenting an empty server library', async () => {
  const { storage, state } = fixture();
  state.offline = true;
  await assert.rejects(storage.getItem('@saved_videos'), /offline/);
});
