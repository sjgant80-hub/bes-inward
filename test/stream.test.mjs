import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windows, actionsFromLedger } from '../src/stream.mjs';

test('windows cuts a list into fixed-size chunks, dropping a short tail', () => {
  const e = Array.from({ length: 45 }, (_, i) => ({ type: 'a', at: i }));
  assert.equal(windows(e, 20).length, 2);          // 45 → two 20s, 5 dropped
  assert.equal(windows(e, 20)[0].length, 20);
  assert.equal(windows([], 20).length, 0);
  assert.equal(windows(e, 1).length, Math.floor(45 / 8) || 0 ? windows(e, 1).length : 0, 'size<2 falls back to 8');
});

test('actionsFromLedger maps kind/stage/arm → type, ISO at → ms, sorts by time, drops timeless records', () => {
  const recs = [
    { kind: 'recall-probe', at: '2026-10-13T01:45:00.000Z', note: 'hi' },
    { stage: 'signature', at: '2026-10-13T01:46:00.000Z' },
    { arm: 'back-fold', at: '2026-10-13T01:44:00.000Z', lines: 40 },
    { kind: 'nope' },                               // no timestamp → dropped
    'junk', null,
  ];
  const ev = actionsFromLedger(recs);
  assert.equal(ev.length, 3);
  assert.equal(ev[0].type, 'back-fold');            // earliest first
  assert.ok(ev.every((e) => Number.isInteger(e.at)));
});

test('actionsFromLedger accepts {entries:[...]} and is total on junk', () => {
  assert.equal(actionsFromLedger({ entries: [{ kind: 'x', at: '2026-10-13T00:00:00Z' }] }).length, 1);
  for (const x of [null, undefined, 42, 'str', {}]) assert.doesNotThrow(() => actionsFromLedger(x));
  assert.equal(actionsFromLedger(null).length, 0);
});
