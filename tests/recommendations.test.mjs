import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRelatedQuery, buildRelatedSearches, diversifyVideos, findRelatedVideos, getRelatedQueue, getAutoplayTarget } from '../utils/recommendations.ts';

const video = {
  id: 'aaaaaaaaaaa', title: 'Björk - Jóga (Official Video) [HD]', channelId: 'channel-id',
  channelTitle: 'Björk', thumbnail: '', description: '', publishedAt: '',
};
const next = { ...video, id: 'bbbbbbbbbbb', title: 'Next video' };
const later = { ...video, id: 'ccccccccccc', title: 'Another video' };

test('builds a topic query without search operators or video labels', () => {
  assert.equal(buildRelatedQuery(video), 'Björk Jóga');
  assert.equal(buildRelatedQuery({ ...video, title: '' }), video.channelTitle);
});

test('fetches details only for distinct, valid recommendations other than the current video', async () => {
  const result = await findRelatedVideos(video, {
    search: async (criteria) => {
      assert.ok(criteria.q || criteria.channelId);
      return [video.id, next.id, next.id, 'invalid'];
    },
    getDetails: async (ids) => {
      assert.deepEqual(ids, [next.id]);
      return [next, next, video];
    },
  });
  assert.deepEqual(result, [next]);
});

test('includes the channel even when also searching by subject', async () => {
  const searches = [];
  const result = await findRelatedVideos(video, {
    search: async (criteria) => {
      searches.push(criteria);
      return criteria.channelId ? [next.id] : [video.id];
    },
    getDetails: async () => [next],
  });
  assert.deepEqual(searches, [{ q: 'Björk Jóga' }, { channelId: video.channelId }]);
  assert.deepEqual(result, [next]);
});

test('does not request video details when both searches are empty', async () => {
  assert.deepEqual(await findRelatedVideos(video, {
    search: async () => [],
    getDetails: async () => { throw new Error('must not fetch empty IDs'); },
  }), []);
});

test('stops pending recommendations when the user changes videos', async () => {
  const controller = new AbortController();
  assert.deepEqual(await findRelatedVideos(video, {
    search: async () => { controller.abort(); return [next.id]; },
    getDetails: async () => { throw new Error('must not continue after cancellation'); },
  }, controller.signal), []);
});

test('reports recommendation errors so the screen can offer retry', async () => {
  await assert.rejects(findRelatedVideos(video, {
    search: async () => { throw new Error('API unavailable'); },
    getDetails: async () => [],
  }), /API unavailable/);
});

test('queue excludes repeats and previously played videos while keeping relevance order', () => {
  assert.deepEqual(getRelatedQueue([video, next, next, later], video.id, [next.id]), [later]);
});

const options = {
  currentId: video.id, endedVideoId: video.id, recommendationsFor: video.id,
  videos: [next, later], playedIds: [video.id], enabled: true, isFocused: true,
};

test('advances to the first unplayed suggestion after playback ends', () => {
  assert.equal(getAutoplayTarget(options)?.id, next.id);
  assert.equal(getAutoplayTarget({ ...options, playedIds: [video.id, next.id] })?.id, later.id);
});

test('waits for suggestions when a video ends before they load', () => {
  assert.equal(getAutoplayTarget({ ...options, videos: [] }), null);
  assert.equal(getAutoplayTarget(options)?.id, next.id);
});

test('does not advance when disabled, unfocused, replaying, or receiving stale events', () => {
  for (const change of [
    { enabled: false }, { isFocused: false }, { endedVideoId: null },
    { endedVideoId: next.id }, { recommendationsFor: next.id },
  ]) {
    assert.equal(getAutoplayTarget({ ...options, ...change }), null);
  }
});

test('stops instead of looping when all suggestions were played', () => {
  assert.equal(getAutoplayTarget({ ...options, playedIds: [video.id, next.id, later.id] }), null);
});

test('music searches include the artist and genre instead of repeating the song title', () => {
  const music = { ...video, categoryId: '10', tags: ['Jóga', 'alternative pop'], channelTitle: 'BjörkVEVO' };
  assert.deepEqual(buildRelatedSearches(music), [
    { q: 'Björk' }, { q: 'pop música' }, { channelId: video.channelId },
  ]);
  assert.equal(buildRelatedSearches({ ...music, title: 'Jóga', channelTitle: 'Björk - Topic' })[0].q, 'Björk');
  assert.equal(buildRelatedSearches({ ...music, tags: ['forro'] })[1].q, 'forró música');
});

test('uses topics for genre discovery and keeps non-music subjects intact', () => {
  assert.equal(buildRelatedSearches({ ...video, categoryId: '10', topicCategories: ['https://en.wikipedia.org/wiki/Rock_music'] })[1].q, 'rock música');
  assert.equal(buildRelatedSearches({ ...video, title: 'Python - Aula 1', categoryId: '27', tags: ['programação'] })[0].q, 'Python Aula 1');
  assert.equal(buildRelatedSearches({ ...video, title: '', channelId: '' })[0].q, 'Björk');
});

test('mixes artist, genre, channel and category discoveries in one deduplicated queue', async () => {
  const music = { ...video, categoryId: '10', tags: ['pop'] };
  const channel = { ...later, id: 'ddddddddddd', channelId: 'other-channel' };
  const category = { ...later, id: 'eeeeeeeeeee', channelId: 'discovery-channel' };
  const expected = [next, later, channel, category];
  const result = await findRelatedVideos(music, {
    search: async (criteria) => criteria.channelId ? [channel.id, next.id]
      : criteria.q === 'Björk' ? [video.id, next.id, 'bad'] : [later.id],
    category: async (categoryId) => { assert.equal(categoryId, '10'); return [category.id]; },
    // API details need not arrive in the requested order.
    getDetails: async () => [category, channel, later, next, video],
  });
  assert.deepEqual(result, [later, channel, category, next]);
  assert.equal(new Set(result.map(v => v.id)).size, expected.length);
});

test('keeps category discoveries when search fails and reports incomplete empty results', async () => {
  const source = {
    search: async () => { throw new Error('search quota'); },
    category: async () => [next.id],
    getDetails: async () => [next],
  };
  assert.deepEqual(await findRelatedVideos({ ...video, categoryId: '10' }, source), [next]);
  await assert.rejects(findRelatedVideos({ ...video, categoryId: '10' }, { ...source, category: async () => [] }), /search quota/);
});

test('makes room for other channels before filling unused slots from a single channel', () => {
  const repeated = Array.from({ length: 12 }, (_, n) => ({ ...next, id: String(n).padStart(11, '0') }));
  const discovery = { ...later, channelId: 'new-channel' };
  const result = diversifyVideos([...repeated, discovery]);
  assert.equal(result.length, 12);
  assert.equal(result[2], discovery);
  assert.deepEqual(diversifyVideos(repeated, 4), repeated.slice(0, 4));
});

test('cancellation after details arrive prevents stale suggestions', async () => {
  const controller = new AbortController();
  const result = await findRelatedVideos(video, {
    search: async () => [next.id],
    getDetails: async () => { controller.abort(); return [next]; },
  }, controller.signal);
  assert.deepEqual(result, []);
});
