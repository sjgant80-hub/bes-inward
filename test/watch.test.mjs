import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, COARSE, FINE, PARAMS, paramsOf, partsOf, quantile, partBars, barsOf, blendBars, distOf, shiftOf, emaDist, emptyWatcher, step, confirm, confirmShift } from '../src/watch.mjs';
import { FEATURES } from '../src/entropy.mjs';
import { rank } from '../src/gep.mjs';

const T = Date.UTC(2026, 8, 1, 9);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' ≠ ' + b);
const P = { W: 6, minN: 3, block: 4, formDays: 1, formBlocks: 2, minCal: 3, burn: 1 };
const ev = (i, o) => ({ t: T + i * 3600000, src: 'desk', kind: i % 2 ? 'a' : 'b', loc: 'repo', size: 10, tier: 'default', priv: 'normal', ...o });
function feed(w, events, p = P) { let x = w; const outs = []; for (const e of events) { const r = step(x, e, p); x = r.w; outs.push(r.out); } return { w: x, outs }; }
const formedOn = (n = 40) => feed(emptyWatcher('simon'), Array.from({ length: n }, (_, i) => ev(i)));

test('params: defaults, overrides, clamps', () => {
  assert.deepEqual(paramsOf(null), { ...PARAMS, fine: 0 });
  const p = paramsOf({ W: 10.7, qEps: 1.5, mKl: 2, block: -3, alpha: 'x', fine: 1, burn: 0.2 });
  assert.equal(p.W, 10);
  assert.equal(p.qEps, 1);
  assert.equal(p.mKl, 2);
  assert.equal(p.block, PARAMS.block);
  assert.equal(p.alpha, PARAMS.alpha);
  assert.equal(p.fine, 1);
  assert.equal(p.burn, 1);
  assert.equal(paramsOf({ fine: 2 }).fine, 0);
  assert.equal(paramsOf({ fine: true }).fine, 0);
  assert.deepEqual(partsOf(paramsOf({ fine: 1 })), FINE);
  assert.deepEqual(partsOf(paramsOf({})), COARSE);
  assert.deepEqual(COARSE, ['S', 'net', 'beh', 'auth']);
  assert.equal(FINE.length, 18);
  assert.equal(paramsOf({ minCal: 0.5 }).minCal, 1);
  assert.equal(paramsOf({ barAlpha: 3 }).barAlpha, 1);
  assert.equal(paramsOf({ qMid: 0.4 }).qMid, 0.4);
});

test('quantile: nearest rank', () => {
  assert.equal(quantile([4, 1, 3, 2], 0.5), 3);
  assert.equal(quantile([4, 1, 3, 2], 0.99), 4);
  assert.equal(quantile([4, 1, 3, 2], 1), 4);
  assert.equal(quantile([4, 1, 3, 2], 0), 1);
  assert.equal(quantile([4, 1, 3, 2], 0.25), 2);
  assert.equal(quantile([], 0.5), 0);
  assert.equal(quantile('x', 0.5), 0);
  assert.equal(quantile([NaN, 5, 'q', Infinity], 0.5), 5);
});

test('partBars and barsOf: each part learns its own bars, with floors', () => {
  const Q = paramsOf({ qEps: 0.75, qMid: 0.25, qKl: 0.75, mEps: 2, mKl: 3 });
  const b = partBars([0.1, 0.2, 0.3, 0.4], [1, 2, 3, 4], Q);
  near(b.eps, 0.8);
  near(b.k, 1 / 0.2);
  near(b.klBar, 12);
  near(b.Amin, Math.exp(-12));
  const f = partBars([0, 0, 0], [0, 0], paramsOf({}));
  assert.equal(f.eps, PARAMS.epsFloor);
  assert.equal(f.k, 1 / PARAMS.epsFloor);
  assert.equal(f.klBar, PARAMS.klFloor);
  const g = partBars([1, 1, 1, 1], [1], paramsOf({}));
  assert.equal(g.eps, 1);
  assert.equal(g.k, 1 / PARAMS.epsFloor);
  const s = (d, kl, grad) => ({ d: { S: d, net: d, beh: d, auth: d }, kl: { S: kl, net: kl, beh: kl, auth: kl }, grad });
  const cal = { chunks: [[s(0.1, 1, 0.5), s(0.2, 2, 1)], [s(0.3, 3, 2), { junk: 1 }]] };
  assert.equal(barsOf(cal, { minCal: 4 }), null);
  const bars = barsOf(cal, { minCal: 3, qEps: 1, qMid: 0.01, qKl: 1, qGrad: 1, mGrad: 2, mBudget: 3 });
  assert.deepEqual(Object.keys(bars.parts), COARSE);
  near(bars.parts.S.eps, 0.3);
  near(bars.parts.net.k, 1 / 0.2);
  near(bars.parts.auth.klBar, 3);
  near(bars.beta, 1 / 4);
  near(bars.budget, 0.9);
  assert.equal(barsOf(null, {}), null);
  assert.equal(barsOf({ chunks: 'x' }, {}), null);
  assert.equal(barsOf({ chunks: [[s(0, 0, 0), s(0, 0, 0), s(0, 0, 0)]] }, { minCal: 3 }).beta, 1000);
});

test('blendBars: damped, number by number', () => {
  const mk = (x) => ({ parts: { S: { eps: x, k: x, klBar: x, Amin: Math.exp(-x) } }, beta: x, budget: x });
  const b = blendBars(mk(1), mk(3), 0.25);
  near(b.parts.S.eps, 1.5);
  near(b.parts.S.k, 1.5);
  near(b.parts.S.klBar, 1.5);
  near(b.parts.S.Amin, Math.exp(-1.5));
  near(b.beta, 1.5);
  near(b.budget, 1.5);
  assert.deepEqual(blendBars(null, mk(2), 0.5), mk(2));
  assert.deepEqual(blendBars(mk(2), null, 0.5), mk(2));
  const partial = blendBars({ parts: { S: mk(1).parts.S, net: mk(5).parts.S }, beta: 1, budget: 1 }, mk(3), 0.5);
  near(partial.parts.net.eps, 5);
  near(partial.parts.S.eps, 2);
});

test('distOf, shiftOf, emaDist', () => {
  const d = distOf({ gap: { a: 1, b: 3 } });
  assert.deepEqual(d.gap, { a: 0.25, b: 0.75 });
  assert.deepEqual(d.kind, {});
  assert.equal(Object.keys(distOf(null)).length, FEATURES.length);
  const one = Object.fromEntries(FEATURES.map((f) => [f, { x: 1 }]));
  const other = Object.fromEntries(FEATURES.map((f) => [f, { y: 1 }]));
  assert.equal(shiftOf(one, one), 0);
  assert.equal(shiftOf(one, other), 1);
  near(shiftOf({ gap: { x: 1 } }, { gap: { x: 0.5, y: 0.5 } }), 0.5 / FEATURES.length);
  assert.equal(shiftOf(null, null), 0);
  const e = emaDist({ gap: { a: 1 } }, { gap: { b: 1 } }, 0.2, 1e-4);
  near(e.gap.a, 0.8);
  near(e.gap.b, 0.2);
  const pr = emaDist({ gap: { a: 1, c: 0.0001 } }, { gap: { b: 1 } }, 0.2, 1e-4);
  assert.equal(pr.gap.c, undefined);
  const keep = emaDist({ gap: { c: 0.000125 } }, {}, 0.2, 1e-4);
  near(keep.gap.c, 0.0001);
  assert.deepEqual(emaDist(null, null, 0.2, 1e-4).gap, {});
});

test('an unreadable action changes nothing and reads STEP_UP', () => {
  const w = emptyWatcher('simon');
  const r = step(w, { t: 'soon' }, P);
  assert.equal(r.w, w);
  assert.equal(r.out.raw, 'STEP_UP');
  assert.equal(r.out.ok, false);
  assert.equal(r.out.observing, true);
  const junk = step(null, ev(0), P);
  assert.equal(junk.w.id, 'identity');
  assert.equal(junk.out.raw, 'ALLOW');
  assert.equal(emptyWatcher(7).id, 'identity');
  assert.equal(emptyWatcher('x'.repeat(80)).id.length, 64);
});

test('formation: no baseline → still learning → formed after formDays AND formBlocks; observe-only until then', () => {
  const { w, outs } = formedOn();
  assert.equal(outs[0].row, 'no baseline yet');
  assert.equal(outs[0].raw, 'ALLOW');
  assert.ok(outs.slice(0, 24).every((o) => o.observing && !o.formed));
  const firstFormed = outs.findIndex((o) => o.formed);
  assert.equal(firstFormed, 25);                          // formed on the action 24 h after the first, judged from the next
  assert.equal(outs[24].observing, true);
  assert.equal(outs[25].observing, false);
  assert.equal(w.formed, true);
  assert.equal(w.formedAt, T + 24 * 3600000);
  assert.ok(w.base.blocks >= 2);
  assert.ok(w.bars && w.bars.parts.S);
  assert.equal(w.first, T);
  assert.equal(w.n, 40);
  const quick = feed(emptyWatcher('k'), Array.from({ length: 7 }, (_, i) => ev(i)), { ...P, formDays: 0.0001 });
  assert.equal(quick.w.formed, false);                    // a day passed is not enough: the blocks are not there yet
  const blocksOnly = feed(emptyWatcher('k'), Array.from({ length: 12 }, (_, i) => ({ ...ev(i), t: T + i * 1000 })), P);
  assert.equal(blocksOnly.w.formed, false);               // blocks without the days do not form either
  assert.ok(blocksOnly.w.base.blocks >= 2);
});

test('the watcher learns its own steady behaviour and allows it', () => {
  const { outs } = formedOn(80);
  const post = outs.filter((o) => o.formed);
  assert.ok(post.length > 40);
  assert.ok(post.every((o) => o.raw === 'ALLOW'), JSON.stringify(post.map((o) => o.raw)));
  assert.ok(post.every((o) => o.learned));
});

test('a different hand on the key: flagged, quarantined, never learned — until the owner answers', () => {
  const { w } = formedOn(60);
  const alien = Array.from({ length: 12 }, (_, i) => ({ t: T + 60 * 3600000 + i * 500, src: 'script', kind: 'z', loc: 'elsewhere', size: 5000, tier: 'bypassPermissions', priv: 'outward' }));
  const r = feed(w, alien);
  const flagged = r.outs.filter((o) => rank(o.raw) >= 2);
  assert.ok(flagged.length >= 6, JSON.stringify(r.outs.map((o) => o.raw)));
  assert.ok(r.outs.some((o) => rank(o.raw) >= 3));
  assert.equal(r.w.quar.length, flagged.length);
  assert.ok(flagged.every((o) => o.learned === false));
  assert.ok(r.outs.every((o) => o.learned === false));
  assert.equal(r.w.pend.n, w.pend.n);
  assert.equal(r.w.base.blocks, w.base.blocks);
  assert.ok(r.w.held && rank(r.w.held.verdict) >= 3);
  const held = r.w.held;
  const again = step(r.w, { ...alien[0], t: alien[11].t + 500 }, P);
  assert.equal(again.out.held, held);                      // a held block sticks
  const c = confirm(r.w, P);
  assert.equal(c.quar.length, 0);
  assert.ok(c.pendingShift !== null && c.pendingShift.shift > c.pendingShift.bound);   // twelve alien actions confirmed at once are a big move: held for Simon, not folded silently
  assert.equal(confirm(w, P), w);
  assert.equal(confirm(null, P).id, 'identity');
});

test('nothing is held while observing (forming, or inside a recovery window)', () => {
  const { w } = formedOn(60);
  const alien = Array.from({ length: 12 }, (_, i) => ({ t: T + 60 * 3600000 + i * 500, src: 'script', kind: 'z', loc: 'elsewhere', size: 5000, tier: 'bypassPermissions', priv: 'outward' }));
  const watching = feed({ ...w, observeUntil: T + 61 * 3600000 }, alien);
  assert.ok(watching.outs.every((o) => o.observing));
  assert.equal(watching.w.held, null);
  assert.ok(watching.outs.some((o) => rank(o.raw) >= 3));
  const past = feed({ ...w, observeUntil: T + 60 * 3600000 }, alien);
  assert.ok(past.outs.every((o) => !o.observing));
  const early = Array.from({ length: 10 }, (_, i) => ({ ...alien[i], t: T + i * 500 }));
  assert.ok(feed(emptyWatcher('x'), early).outs.every((o) => o.observing));
  assert.equal(feed(emptyWatcher('x'), early).w.held, null);
});

test('a block that moves the baseline too far is held for Simon, then folded on confirmShift', () => {
  const { w } = formedOn(60);
  const shifted = { ...w, pend: { counts: Object.fromEntries(FEATURES.map((f) => [f, { ['zz:' + f]: 4 }])), n: 3, Hf: {}, samples: [] } };
  const r = step(shifted, ev(60), P);
  assert.ok(r.w.pendingShift, 'held');
  assert.equal(r.w.base.blocks, w.base.blocks);
  assert.ok(r.w.pendingShift.shift > r.w.pendingShift.bound);
  const c = confirmShift(r.w, P);
  assert.equal(c.pendingShift, null);
  assert.equal(c.base.blocks, w.base.blocks + 1);
  assert.ok(Object.keys(c.base.dist.gap).some((k) => k.startsWith('zz:')));
  assert.equal(confirmShift(w, P), w);
  assert.equal(confirmShift(null, P), null);
});

test('fine mode judges every single feature as its own part', () => {
  const { w } = feed(emptyWatcher('k'), Array.from({ length: 40 }, (_, i) => ev(i)), { ...P, fine: 1 });
  assert.deepEqual(Object.keys(w.bars.parts), FINE);
  const coarse = formedOn(40).w;
  assert.deepEqual(Object.keys(coarse.bars.parts), COARSE);
});

test('the measures it reports', () => {
  const { w } = formedOn(40);
  const r = step(w, ev(40), P);
  assert.deepEqual(Object.keys(r.out.d), COARSE);
  assert.deepEqual(Object.keys(r.out.kl), COARSE);
  assert.ok(r.out.S >= 0 && r.out.grad >= 0);
  assert.equal(typeof r.out.dSess, 'number');
  assert.equal(r.out.formed, true);
  assert.equal(DAY, 86400000);
});

test('rhythmOf: the last n positive gaps, MAD over mean', async () => {
  const { rhythmOf } = await import('../src/watch.mjs');
  assert.equal(rhythmOf([0, 10, 20, 30, 40, 50, 60], 6), 0);
  assert.equal(rhythmOf([0, 10, 20, 30, 40, 50], 6), null);
  assert.equal(rhythmOf([0, 0, 10, 10, 20, 20, 30, 40, 50, 60], 6), 0);        // zero gaps are left out
  near(rhythmOf([0, 10, 30, 40, 60, 70, 90], 6), (5 * 6) / 6 / 15);
  near(rhythmOf([0, 1000, 1010, 1020, 1030, 1040, 1050, 1060], 6), 0);          // only the last six gaps count
  assert.equal(rhythmOf([0, 10, 20], 2), 0);
  assert.equal(rhythmOf([0, 10, 20], 1), null);                                // n ≤ 1 keeps the default 6
  assert.equal(rhythmOf('x', 6), null);
  assert.equal(rhythmOf([0, 'a', 10, 20, 30, 40, 50, 60], 6), 0);
  const g = rhythmOf([0, 10, 20, 30, 40, 50, 160], 6);
  near(g, ((5 * (26 + 2 / 3 - 10)) + (110 - 26 - 2 / 3)) / 6 / (26 + 2 / 3));
});

test('barsOf learns a rhythm floor once there are enough samples; blendBars damps it', () => {
  const s = (r) => ({ d: { S: 0.1, net: 0.1, beh: 0.1, auth: 0.1 }, kl: { S: 1, net: 1, beh: 1, auth: 1 }, grad: 0.1, rhythm: r });
  const bars = barsOf({ chunks: [[s(0.4), s(0.8), s(1.2), s(null)]] }, { minCal: 3, qRhythm: 0.01, mRhythm: 0.5 });
  near(bars.rhythmBar, 0.2);
  assert.equal(barsOf({ chunks: [[s(0.4), s(0.8), s(null)]] }, { minCal: 3 }).rhythmBar, null);
  const mk = (rb) => ({ parts: { S: { eps: 1, k: 1, klBar: 1, Amin: Math.exp(-1) } }, beta: 1, budget: 1, rhythmBar: rb });
  near(blendBars(mk(0.2), mk(0.6), 0.5).rhythmBar, 0.4);
  assert.equal(blendBars(mk(0.2), mk(null), 0.5).rhythmBar, 0.2);
  assert.equal(blendBars(mk(null), mk(0.6), 0.5).rhythmBar, 0.6);
  assert.equal(blendBars(mk(null), mk(null), 0.5).rhythmBar, null);
});

test('a fixed-pace script on a formed key is caught by its rhythm', () => {
  const people = Array.from({ length: 60 }, (_, i) => ev(i, { t: T + i * 3600000 + ((i * 7919) % 1700) * 1000 }));
  const { w } = feed(emptyWatcher('simon'), people);
  assert.ok(w.formed);
  assert.ok(typeof w.bars.rhythmBar === 'number' && w.bars.rhythmBar > 0);
  const t0 = people[59].t;
  const script = Array.from({ length: 10 }, (_, i) => ev(60 + i, { t: t0 + (i + 1) * 60000 }));
  const r = feed(w, script);
  assert.ok(r.outs.some((o) => o.part === 'rhythm' && o.raw === 'BLOCK'), JSON.stringify(r.outs.map((o) => o.row)));
});

test('a BLOCK refuses its action; only an ISOLATE holds the key', () => {
  const { w } = formedOn(60);
  const alien = (i) => ({ t: T + 60 * 3600000 + i * 500, src: 'script', kind: 'z', loc: 'elsewhere', size: 5000, tier: 'bypassPermissions', priv: 'outward' });
  const one = step(w, alien(0), P);
  assert.equal(one.out.raw, 'BLOCK');
  assert.equal(one.w.held, null);
  const two = step(one.w, alien(1), P);
  assert.equal(two.out.raw, 'ISOLATE');
  assert.deepEqual(two.w.held, { verdict: 'ISOLATE', at: alien(1).t });
});
