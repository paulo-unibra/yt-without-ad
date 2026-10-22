import assert from 'node:assert/strict';
import test from 'node:test';
import { loadHomeFeed, selectHistorySeeds, unseenVideos } from '../utils/home-feed.ts';

const video = (id, channelId = id) => ({
  id: id.repeat(11), title: `Vídeo ${id}`, channelId, channelTitle: `Canal ${channelId}`,
  thumbnail: '', description: '', publishedAt: '2026-10-01T12:00:00Z',
});
const a = video('a', 'recent');
const b = video('b', 'frequent');
const c = video('c', 'frequent');
const d = video('d', 'frequent');
const e = video('e', 'other');
const f = video('f', 'other');
const g = video('g', 'fourth');
const h = video('h');
const i = video('i');
const j = video('j');
const k = video('k');
const l = video('l');
const idle = { related: async () => [], trending: async () => ({ videos: [] }) };

test('starts with popular videos and does not search interests without history', async () => {
  const result = await loadHomeFeed([], {
    related: async () => { throw new Error('must not search'); },
    trending: async () => ({ videos: [h], nextPageToken: 'next' }),
  });
  assert.equal(result.hasHistory, false);
  assert.deepEqual(result.personalized, []);
  assert.deepEqual(result.popular, [h]);
  assert.equal(result.nextPageToken, 'next');
});

test('keeps the most recent interest and prioritizes frequent channels with at most three sources', () => {
  assert.deepEqual(selectHistorySeeds([a, g, b, c, d, e, f]), [a, b, e]);
});

test('does not multiply searches for repeated videos or one channel', () => {
  assert.deepEqual(selectHistorySeeds([b, b, c, d]), [b]);
  assert.deepEqual(selectHistorySeeds([{ ...a, id: 'invalid' }]), []);
});

test('interleaves interests and excludes watched, duplicated and invalid suggestions', async () => {
  const history = [a, b];
  const result = await loadHomeFeed(history, {
    related: async (seed) => seed.id === a.id ? [a, h, i, h, { ...h, id: 'bad' }] : [b, j, h, k],
    trending: async () => ({ videos: [a, h, l, l] }),
  });
  assert.deepEqual(result.personalized, [h, j, i, k]);
  assert.deepEqual(result.popular, [l]);
});

test('caps personalized suggestions at twelve while retaining multiple interests', async () => {
  const result = await loadHomeFeed([a, b], {
    ...idle,
    related: async (seed) => Array.from({ length: 20 }, (_, index) => ({
      ...h, id: `${seed.id.slice(0, 9)}${String(index).padStart(2, '0')}`,
    })),
  });
  assert.equal(result.personalized.length, 12);
  assert.equal(result.personalized[0].id.startsWith('a'), true);
  assert.equal(result.personalized[1].id.startsWith('b'), true);
});

test('filters watched items before interleaving so older results do not crowd out another interest', async () => {
  const result = await loadHomeFeed([a, b, c], {
    ...idle,
    related: async (seed) => seed.id === a.id ? [a, h, i] : [b, c, j],
  });
  assert.deepEqual(result.personalized, [h, j, i]);
});

test('keeps working suggestions when another interest or popular request fails', async () => {
  const result = await loadHomeFeed([a, b], {
    related: async (seed) => {
      if (seed.id === a.id) throw new Error('source unavailable');
      return [h];
    },
    trending: async () => { throw new Error('popular unavailable'); },
  });
  assert.deepEqual(result.personalized, [h]);
  assert.equal(result.personalizedError, false);
  assert.equal(result.popularError, true);
});

test('preserves popular fallback and offers retry when personalization fails', async () => {
  const result = await loadHomeFeed([a], {
    related: async () => { throw new Error('quota exceeded'); },
    trending: async () => ({ videos: [h] }),
  });
  assert.equal(result.personalizedError, true);
  assert.deepEqual(result.popular, [h]);
});

test('distinguishes a successful empty search from a request error', async () => {
  const result = await loadHomeFeed([a], idle);
  assert.equal(result.hasHistory, true);
  assert.equal(result.personalizedError, false);
  assert.equal(result.popularError, false);
});

test('does not issue requests after cancellation and passes the signal to each source', async () => {
  const controller = new AbortController();
  controller.abort();
  const unexpected = async () => { throw new Error('must not request'); };
  const cancelled = await loadHomeFeed([a], { related: unexpected, trending: unexpected }, controller.signal);
  assert.deepEqual(cancelled.personalized, []);
  const active = new AbortController();
  let calls = 0;
  await loadHomeFeed([a], {
    related: async (_seed, signal) => { assert.equal(signal, active.signal); calls++; return []; },
    trending: async (signal) => { assert.equal(signal, active.signal); calls++; return { videos: [] }; },
  }, active.signal);
  assert.equal(calls, 2);
});

test('drops stale responses if the user leaves before requests complete', async () => {
  const controller = new AbortController();
  const result = await loadHomeFeed([a], {
    related: async () => { controller.abort(); return [h]; },
    trending: async () => ({ videos: [i], nextPageToken: 'stale' }),
  }, controller.signal);
  assert.deepEqual(result.personalized, []);
  assert.deepEqual(result.popular, []);
  assert.equal(result.nextPageToken, undefined);
});

test('newly watched videos disappear and change the recent interest on refresh', async () => {
  const source = { related: async () => [h, i], trending: async () => ({ videos: [a, h, j] }) };
  const before = await loadHomeFeed([a], source);
  const after = await loadHomeFeed([h, a], source);
  assert.deepEqual(before.personalized, [h, i]);
  assert.deepEqual(after.personalized, [i]);
  assert.equal(selectHistorySeeds([h, a])[0].id, h.id);
  assert.deepEqual(after.popular, [j]);
});

test('pagination excludes watched and already displayed IDs while preserving relevance', () => {
  assert.deepEqual(unseenVideos([a, h, h, i, j], [a.id, i.id]), [h, j]);
});

test('personalized feed makes room for new channels even when source results favor one channel', async () => {
  const repeated = Array.from({ length: 12 }, (_, n) => ({
    ...h, id: `suggested${String(n).padStart(2, '0')}`, channelId: 'dominant',
  }));
  const result = await loadHomeFeed([a], {
    ...idle,
    related: async () => [...repeated, i, j, k],
  });
  assert.equal(result.personalized.length, 12);
  assert.deepEqual(result.personalized.slice(2, 5), [i, j, k]);
});
