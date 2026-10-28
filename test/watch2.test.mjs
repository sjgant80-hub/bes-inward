// watch2.test.mjs — the cases the witness found unguarded in watch.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, COARSE, PARAMS, paramsOf, quantile, barsOf, emptyWatcher, step } from '../src/watch.mjs';

const T = Date.UTC(2026, 8, 1, 9);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' ≠ ' + b);
const P = { W: 6, minN: 3, block: 4, formDays: 1, formBlocks: 2, minCal: 3, burn: 1 };
const ev = (i, o) => ({ t: T + i * 3600000, src: 'desk', kind: i % 2 ? 'a' : 'b', loc: 'repo', size: 10, tier: 'default', priv: 'normal', ...o });
function feed(w, events, p = P) { let x = w; const outs = []; for (const e of events) { const r = step(x, e, p); x = r.w; outs.push(r.out); } return { w: x, outs }; }
const formedOn = (n) => feed(emptyWatcher('simon'), Array.from({ length: n }, (_, i) => ev(i)));
// bars that make E a constant on every action: σ(k(d − ε)) with k tiny and ε very negative ≈ σ(x0)
const fixedBars = (x0) => { const parts = {}; for (const n of COARSE) parts[n] = { eps: -x0 * 1e6, k: 1e-6, klBar: 1e9, Amin: 0 }; return { parts, beta: 0, budget: 1e9, rhythmBar: null }; };

test('a STEP_UP is flagged and quarantined, never learned at once; a THROTTLE is learned', () => {
  const { w } = formedOn(40);
  const su = { ...w, bars: fixedBars(Math.log(3)) };
  const r = step(su, ev(40), P);
  assert.equal(r.out.raw, 'STEP_UP');
  assert.equal(r.out.learned, false);
  assert.equal(r.w.quar.length, 1);
  assert.equal(r.w.pend.n, su.pend.n);
  assert.equal(r.w.held, null);
  const th = step({ ...w, bars: fixedBars(Math.log(1.5)) }, ev(40), P);
  assert.equal(th.out.raw, 'THROTTLE');
  assert.equal(th.out.learned, true);
  assert.equal(th.w.quar.length, 0);
});

test('the decision needs exactly minN actions in the window', () => {
  const Q = { ...P, W: 6, minN: 6 };
  const { w } = feed(emptyWatcher('k'), Array.from({ length: 40 }, (_, i) => ev(i)), Q);
  assert.equal(w.window.length, 6);
  assert.equal(step({ ...w, bars: fixedBars(Math.log(3)) }, ev(40), Q).out.raw, 'STEP_UP');
});

test('formation lands on the action that completes the last block once the days have passed', () => {
  const daily = Array.from({ length: 12 }, (_, i) => ev(i, { t: T + i * DAY }));
  const { w } = feed(emptyWatcher('k'), daily, P);
  assert.equal(w.formed, true);
  assert.equal(w.formedAt, T + 7 * DAY);
});

test('params refuse zero', () => {
  assert.equal(paramsOf({ mKl: 0 }).mKl, PARAMS.mKl);
  assert.equal(paramsOf({ W: 0 }).W, PARAMS.W);
});

test('with no formation shifts recorded, a formed watcher folds rather than holding', () => {
  const Q = { ...P, formBlocks: 1 };
  const { w } = feed(emptyWatcher('k'), Array.from({ length: 30 }, (_, i) => ev(i)), Q);
  const bare = { ...w, base: { ...w.base, shifts: [] }, pend: { counts: {}, n: 0, Hf: {}, samples: [] } };
  const r = feed(bare, Array.from({ length: 4 }, (_, i) => ev(30 + i)), Q);
  assert.equal(r.w.pendingShift, null);
  assert.equal(r.w.base.blocks, bare.base.blocks + 1);
});

test('|∇S| is 0 on the first measured action and |S − previous S| after', () => {
  const outs = feed(emptyWatcher('k'), Array.from({ length: 12 }, (_, i) => ev(i, { kind: 'k' + (i % 3) })), P).outs;
  const measured = outs.filter((o) => o.d !== null);
  assert.equal(measured[0].grad, 0);
  for (let i = 1; i < measured.length; i++) near(measured[i].grad, Math.abs(measured[i].S - measured[i - 1].S));
});

test('quantile and the rhythm floor drop NaN', () => {
  assert.equal(quantile([NaN, 2], 0), 2);
  const s = (r) => ({ d: { S: 0.1, net: 0.1, beh: 0.1, auth: 0.1 }, kl: { S: 1, net: 1, beh: 1, auth: 1 }, grad: 0.1, rhythm: r });
  assert.equal(barsOf({ chunks: [[s(NaN), s(NaN), s(NaN)]] }, { minCal: 3 }).rhythmBar, null);
});

test('a watcher missing any part of its state is replaced by a fresh one', () => {
  const { w } = formedOn(10);
  const breaks = [{ base: null }, { pend: null }, { pend: { ...w.pend, samples: 'x' } }, { cal: null }, { cal: { chunks: 'x' } }, { window: 'x' }, { quar: 'x' }, { times: 'x' }, { ctx: null }];
  for (const b of breaks) { const r = step({ ...w, ...b }, ev(10), P); assert.equal(r.w.n, 1, JSON.stringify(Object.keys(b))); assert.equal(r.out.ok, true); }
});

test('no calibration sample is taken before the baseline holds `burn` blocks', () => {
  const Q = { ...P, burn: 2 };
  let w = emptyWatcher('k');
  for (let i = 0; i < 6; i++) w = step(w, ev(i), Q).w;
  assert.equal(w.base.blocks, 1);
  assert.equal(w.pend.samples.length, 0);
  for (let i = 6; i < 10; i++) w = step(w, ev(i), Q).w;          // block 2 folds at the 8th action; the 9th and 10th are sampled
  assert.equal(w.base.blocks, 2);
  assert.equal(w.pend.samples.length, 2);
});
