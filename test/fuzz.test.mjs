import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signature, judge, fold, divergence, emptyBaseline } from '../src/bes.mjs';
import { windows, actionsFromLedger } from '../src/stream.mjs';
const circular = {}; circular.self = circular;
const toxic = { get mix() { throw new Error('toxic'); }, get type() { throw new Error('toxic'); } };
const HOSTILE = [null, undefined, NaN, Infinity, -1, 0, 1, '', 'str', true, 10n, [], {}, circular, toxic, () => {}, [null, 5, toxic]];
const nt = (name, fn) => test('total: ' + name + ' never throws', () => { for (const x of HOSTILE) assert.doesNotThrow(() => fn(x), name + ' threw on ' + String(x)); });
nt('signature', signature);
nt('divergence', (x) => divergence(x, x));
nt('fold', (x) => fold(x, x));
nt('judge', (x) => judge(x, x, x));
nt('windows', (x) => windows(x, 20));
nt('actionsFromLedger', actionsFromLedger);
test('judge never ADMITS junk — always CALIBRATING or FLAG, never ALLOW on a bad signature', () => {
  for (const x of HOSTILE) { const v = judge(x, { count: 9, mix: { a: 1000 }, variability: 300 }, {}); assert.notEqual(v.level, 'ALLOW'); }
});
