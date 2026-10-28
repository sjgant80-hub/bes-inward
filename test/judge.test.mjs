import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, SEAL, BAR } from '../measure/judge.mjs';

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

test('the sealed bars, carried as constants', () => {
  assert.equal(SEAL, '65a6364');
  assert.deepEqual(BAR, { sessions: 20, need: 19, fp: 0.01, b3Faults: 9, b3Actions: 20, b7Recovery: 12, l1Below: 10 });
});

test('every claim held on a record that meets every bar exactly', () => {
  const v = judge(good());
  for (const k of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'L1']) assert.equal(v[k].held, true, k + ': ' + v[k].why);
  assert.match(v.B4.why, /1\.00% ≤ 1\.0%/);
  assert.match(v.L1.why, /as predicted: only 9/);
});

test('each claim fails one step past its bar', () => {
  const f = (mut) => { const g = good(); mut(g); return judge(g); };
  assert.equal(f((g) => { g.B1.simon.burst = d(18); }).B1.held, false);
  assert.match(f((g) => { g.B1.simon.burst = d(18); }).B1.why, /burst 18\/20/);
  assert.equal(f((g) => { g.B1.simon.uniform.sessions = 19; }).B1.held, false);
  assert.equal(f((g) => { delete g.B1.simon.cadence; }).B1.held, false);
  assert.equal(f((g) => { g.B2['kar-night'].shuffled = d(18); }).B2.held, false);
  assert.equal(f((g) => { g.B2['kar-session'].cadence = d(18); }).B2.held, false);
  assert.equal(f((g) => { g.B3.blocked = 179; }).B3.held, false);
  assert.equal(f((g) => { g.B3.total = 179; g.B3.blocked = 179; }).B3.held, false);
  assert.equal(f((g) => { g.B3.validPassed = 19; }).B3.held, false);
  assert.equal(f((g) => { g.B3.validTotal = 19; g.B3.validPassed = 19; }).B3.held, false);
  assert.equal(f((g) => { g.B4.simon.fp = 11; }).B4.held, false);
  assert.equal(f((g) => { g.B4.simon.judged = 0; g.B4.simon.fp = 0; }).B4.held, false);
  assert.equal(f((g) => { g.B4.simon.fp = 2000; }).B4.held, false);
  assert.equal(f((g) => { g.B5['kar-night'].fp = 2; }).B5.held, false);
  assert.equal(f((g) => { g.B5['kar-session'].fp = 51; }).B5.held, false);
  assert.equal(f((g) => { g.B5['kar-session'].fp = 50; }).B5.held, true);
  assert.equal(f((g) => { g.B6.a = d(18); }).B6.held, false);
  assert.equal(f((g) => { g.B6.b = d(18); }).B6.held, false);
  assert.equal(f((g) => { g.B6.c.raised = 6; }).B6.held, false);
  assert.equal(f((g) => { delete g.B6.c; }).B6.held, false);
  assert.equal(f((g) => { g.B6.c = { raised: 0, total: 0 }; }).B6.held, true);
  assert.equal(f((g) => { g.B7.formation.simon.enforcedNotAllow = 1; }).B7.held, false);
  assert.equal(f((g) => { delete g.B7.formation['kar-night']; }).B7.held, false);
  assert.equal(f((g) => { g.B7.recovery.passed = 11; }).B7.held, false);
  assert.equal(f((g) => { g.B7.recovery.total = 11; g.B7.recovery.passed = 11; }).B7.held, false);
  assert.equal(f((g) => { g.L1.simon = d(10); }).L1.held, false);
  assert.match(f((g) => { g.L1.simon = d(10); }).L1.why, /prediction FAILED/);
  assert.equal(f((g) => { g.L1.simon.sessions = 19; }).L1.held, false);
});

test('a missing or malformed record fails every claim, never passes one', () => {
  const v = judge(null);
  for (const k of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'L1']) assert.equal(v[k].held, false, k);
  const w = judge({ B4: { simon: { judged: 10, fp: -1 } }, B3: { blocked: 1.5 } });
  assert.equal(w.B4.held, false);
  assert.equal(w.B3.held, false);
  const toxic = { get B1() { throw new Error('x'); } };
  const t = judge(toxic);
  for (const k of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'L1']) assert.equal(t[k].held, false, k);
});
