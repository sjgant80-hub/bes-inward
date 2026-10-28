// judge2.test.mjs — the exact reasons the witness found unguarded in measure/judge.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from '../measure/judge.mjs';

const d = (caught) => ({ caught, sessions: 20, medianFirst: 3 });
const drv = (n, names) => Object.fromEntries(names.map((x) => [x, d(n)]));
const B2N = ['cadence', 'burst', 'uniform', 'shuffled'];
const good = () => ({
  B1: { simon: drv(20, ['cadence', 'burst', 'uniform']) },
  B2: { 'kar-session': drv(19, B2N), 'kar-night': drv(20, B2N) },
  B3: { blocked: 180, total: 180, validPassed: 20, validTotal: 20 },
  B4: { simon: { judged: 1000, fp: 10 } },
  B5: { 'kar-night': { judged: 100, fp: 1 }, 'kar-session': { judged: 5000, fp: 0 } },
  B6: { a: d(19), b: d(20), c: { raised: 7, total: 7 } },
  B7: { formation: { simon: { actions: 22, enforcedNotAllow: 0 }, 'kar-session': { actions: 700, enforcedNotAllow: 0 }, 'kar-night': { actions: 25, enforcedNotAllow: 0 } }, recovery: { passed: 12, total: 12 } },
  L1: { simon: d(9) },
});
const f = (mut) => { const g = good(); mut(g); return judge(g); };

test('the exact reasons', () => {
  assert.match(f((g) => { g.B4.simon = { judged: 10, fp: 10 }; }).B4.why, /100\.00% > 1\.0%/);
  assert.equal(f((g) => { g.B4.simon = { judged: 1000, fp: 11 }; }).B4.why, 'simon 1.10% > 1.0%');
  assert.equal(f((g) => { g.B4.simon = { judged: 10, fp: 1.5 }; }).B4.why, 'simon: no record');
  assert.equal(f((g) => { g.B4.simon = Object.assign([], { judged: 1000, fp: 0 }); }).B4.held, false);
  assert.equal(f((g) => { g.B4.simon = Object.assign(() => 0, { judged: 1000, fp: 0 }); }).B4.held, false);
  assert.match(f((g) => { g.B1.simon.burst = { caught: 1.5, sessions: 20 }; }).B1.why, /burst: no complete record/);
  assert.match(f((g) => { g.B6.c = { total: 3, raised: 'x' }; }).B6.why, /\(c\) no record/);
  assert.match(f((g) => { g.B6.c = { total: 'x', raised: 3 }; }).B6.why, /\(c\) no record/);
  assert.match(f((g) => { g.B6.c = null; }).B6.why, /\(c\) no record/);
  for (const k of ['blocked', 'total', 'validPassed', 'validTotal']) assert.equal(f((g) => { g.B3[k] = g.B3[k] + 0.5; }).B3.why, 'no record', k);
});
