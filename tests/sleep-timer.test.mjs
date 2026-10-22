import test from 'node:test';
import assert from 'node:assert/strict';
import { sleepDeadline, remainingSleepSeconds, formatSleepTime } from '../utils/sleep-timer.ts';
test('temporizador usa prazo absoluto, inclusive após suspensão', () => {
  const deadline = sleepDeadline(30, 1000);
  assert.equal(remainingSleepSeconds(deadline, 1000), 1800);
  assert.equal(remainingSleepSeconds(deadline, 901000), 900);
  assert.equal(remainingSleepSeconds(deadline, 2000000), 0);
  assert.equal(remainingSleepSeconds(null), 0);
});
test('recusa duração inválida e aceita os limites', () => {
  for (const value of [0, -1, 721, NaN, Infinity, 1.5]) assert.throws(() => sleepDeadline(value));
  assert.equal(sleepDeadline(1, 0), 60000);
  assert.equal(sleepDeadline(720, 0), 43200000);
  assert.equal(formatSleepTime(3599), '59:59');
});
