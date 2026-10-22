import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldCaptureMiniPlayerDrag, shouldMinimizePlayer } from '../utils/mini-player-gesture.ts';

test('only captures deliberate downward movement and leaves taps, upward scroll and horizontal seeking alone', () => {
  assert.equal(shouldCaptureMiniPlayerDrag(0, 0), false);
  assert.equal(shouldCaptureMiniPlayerDrag(4, 10), false);
  assert.equal(shouldCaptureMiniPlayerDrag(2, -90), false);
  assert.equal(shouldCaptureMiniPlayerDrag(90, 20), false);
  assert.equal(shouldCaptureMiniPlayerDrag(10, 40), true);
});

test('short drags return to the player; a long pull or downward flick minimizes', () => {
  assert.equal(shouldMinimizePlayer(20, 1.5), false);
  assert.equal(shouldMinimizePlayer(30, 0.1), false);
  assert.equal(shouldMinimizePlayer(70, 0.1), true);
  assert.equal(shouldMinimizePlayer(30, 1), true);
  assert.equal(shouldMinimizePlayer(-70, -1), false);
});
