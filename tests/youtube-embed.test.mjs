import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createYouTubeEmbedHtml, parseYouTubePlaybackMessage } from '../utils/youtube-embed.ts';

const videoId = 'aaaaaaaaaaa';

function loadEmbed(autoPlay = true) {
  const messages = [];
  let events;
  const sandbox = {
    document: {
      createElement: () => ({}),
      getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }],
    },
    window: { ReactNativeWebView: { postMessage: (message) => messages.push(JSON.parse(message)) } },
    YT: {
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 },
      Player: function (_element, options) { events = options.events; },
    },
  };
  const html = createYouTubeEmbedHtml(videoId, autoPlay);
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], sandbox);
  sandbox.onYouTubeIframeAPIReady();
  return { messages, events };
}

test('embed notifies completion once and ignores pause/buffering', () => {
  const { messages, events } = loadEmbed();
  for (const data of [1, 2, 3, 0, 0]) events.onStateChange({ data });
  assert.deepEqual(messages, [{ type: 'playing', videoId }, { type: 'ended', videoId }]);
});

test('embed reports a new completion if the user replays the video', () => {
  const { messages, events } = loadEmbed();
  for (const data of [1, 0, 1, 0]) events.onStateChange({ data });
  assert.equal(messages.filter((message) => message.type === 'ended').length, 2);
});

test('embed respects the autoplay setting on ready', () => {
  let plays = 0;
  const event = { target: { playVideo: () => plays++ } };
  loadEmbed(false).events.onReady(event);
  assert.equal(plays, 0);
  loadEmbed(true).events.onReady(event);
  assert.equal(plays, 1);
});

test('bridge ignores malformed messages and messages for a previous video', () => {
  for (const message of ['invalid', 'null', '{}', JSON.stringify({ type: 'ended', videoId: 'bbbbbbbbbbb' }), JSON.stringify({ type: 'paused', videoId })]) {
    assert.equal(parseYouTubePlaybackMessage(message, videoId), null);
  }
  assert.equal(parseYouTubePlaybackMessage(JSON.stringify({ type: 'ended', videoId }), videoId), 'ended');
});

test('video identifiers cannot break out of the embedded script', () => {
  const html = createYouTubeEmbedHtml('</script><script>alert(1)</script>', true);
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
});
