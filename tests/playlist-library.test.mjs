import assert from 'node:assert/strict';
import test from 'node:test';
import { PlaylistLibrary, normalizePlaylistName } from '../utils/playlist-library.ts';

const video = { id: 'aaaaaaaaaaa', title: 'Vídeo', description: '', thumbnail: '', channelTitle: 'Canal', channelId: 'channel', publishedAt: '' };
const other = { ...video, id: 'bbbbbbbbbbb' };
function fixture() {
  const state = { raw: null, writes: 0, fail: false };
  const ports = {
    read: async () => state.raw,
    write: async raw => { if (state.fail) throw new Error('storage full'); state.raw = raw; state.writes++; },
  };
  return { state, ports, library: new PlaylistLibrary(ports) };
}

test('playlist names reject empty input and normalize spaces and unicode without losing accents', () => {
  assert.equal(normalizePlaylistName('  Músicas   para correr  '), 'Músicas para correr');
  assert.throws(() => normalizePlaylistName('   '), /Digite/);
  assert.throws(() => normalizePlaylistName('x'.repeat(61)), /60/);
});

test('creates a named playlist and persists videos across app restarts', async () => {
  const { library, ports } = fixture();
  const created = await library.create('Favoritas');
  await library.addVideo(created.id, video);
  const restarted = new PlaylistLibrary(ports);
  const [saved] = await restarted.list();
  assert.equal(saved.name, 'Favoritas');
  assert.deepEqual(saved.videos, [video]);
});

test('reuses an existing playlist by name and updates a saved video without duplicates', async () => {
  const { library } = fixture();
  const first = await library.create('Minhas músicas');
  const same = await library.create('  MINHAS   MÚSICAS ');
  assert.equal(first.id, same.id);
  await library.addVideo(first.id, video);
  await library.addVideo(first.id, { ...video, title: 'Título atualizado' });
  assert.equal((await library.list()).length, 1);
  assert.equal((await library.list())[0].videos.length, 1);
  assert.equal((await library.list())[0].videos[0].title, 'Título atualizado');
});

test('concurrent saves do not lose playlists or videos', async () => {
  const { library } = fixture();
  const [one, two] = await Promise.all([library.create('Uma'), library.create('Outra')]);
  await Promise.all([library.addVideo(one.id, video), library.addVideo(one.id, other), library.addVideo(two.id, video)]);
  const lists = await library.list();
  assert.deepEqual(lists[0].videos, [video, other]);
  assert.deepEqual(lists[1].videos, [video]);
});

test('removes only the selected playlist membership and not other saved copies', async () => {
  const { library } = fixture();
  const one = await library.create('Uma');
  const two = await library.create('Outra');
  await library.addVideo(one.id, video);
  await library.addVideo(two.id, video);
  await library.removeVideo(one.id, video.id);
  const lists = await library.list();
  assert.deepEqual(lists[0].videos, []);
  assert.deepEqual(lists[1].videos, [video]);
});

test('storage failures do not report success or block later saves', async () => {
  const { library, state } = fixture();
  const list = await library.create('Músicas');
  state.fail = true;
  await assert.rejects(library.addVideo(list.id, video), /storage full/);
  assert.deepEqual((await library.list())[0].videos, []);
  state.fail = false;
  await library.addVideo(list.id, video);
  assert.equal((await library.list())[0].videos.length, 1);
});

test('rejects unknown playlists and malformed storage without overwriting data', async () => {
  const { library, state } = fixture();
  await assert.rejects(library.addVideo('missing', video), /não encontrada/);
  for (const raw of ['{broken', '{}', '[{"name":"missing fields"}]']) {
    state.raw = raw;
    await assert.rejects(library.create('Nova'));
    assert.equal(state.raw, raw);
    assert.equal(state.writes, 0);
  }
});

test('cancelled modal causes no writes and successful changes notify subscribers', async () => {
  const { library, state } = fixture();
  let notifications = 0;
  const unsubscribe = library.subscribe(() => notifications++);
  assert.deepEqual(await library.list(), []);
  assert.equal(state.writes, 0);
  const playlist = await library.create('Músicas');
  await library.addVideo(playlist.id, video);
  assert.equal(notifications, 2);
  unsubscribe();
  await library.addVideo(playlist.id, other);
  assert.equal(notifications, 2);
});
