import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucket, actionOf, emptyCtx, symbolsOf, countsOf, entropy, stateOf, combine, normalise, klFeature, klOf, FEATURES, DOMAINS, WEIGHTS, CAP, SESSION_GAP, BURST_SPAN } from '../src/entropy.mjs';

const T = Date.UTC(2026, 9, 5, 10, 0, 0);   // a Monday, 10:00 UTC
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' ≠ ' + b);

test('bucket: the size of a number in bits, capped', () => {
  assert.deepEqual([0, -5, NaN, 0.5, 1, 1.9, 2, 3, 4, 7, 8, 90].map(bucket), [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 7]);
  assert.equal(bucket(2 ** 38), 39);
  assert.equal(bucket(2 ** 39), 40);
  assert.equal(bucket(2 ** 50), 40);
});

test('actionOf: needs a whole time; tags and cuts strings; size is whole and non-negative', () => {
  assert.equal(actionOf(null), null);
  assert.equal(actionOf({}), null);
  assert.equal(actionOf({ t: 1.5 }), null);
  assert.equal(actionOf([1]), null);
  const a = actionOf({ t: 5, src: 'desk', kind: 'x'.repeat(60), loc: '', size: 12, tier: 'default', priv: 'normal' });
  assert.deepEqual(a, { t: 5, src: 's:desk', kind: 'k:' + 'x'.repeat(48), loc: 'l:?', size: 12, tier: 't:default', priv: 'p:normal' });
  assert.equal(actionOf({ t: 5, size: -3 }).size, 0);
  assert.equal(actionOf({ t: 5, size: 2.5 }).size, 0);
  assert.equal(actionOf({ t: 5, size: 1 }).size, 1);
  assert.equal(actionOf({ t: 5, kind: 7 }).kind, 'k:?');
  assert.equal(actionOf({ t: 0 }).t, 0);
  const toxic = { get t() { throw new Error('x'); } };
  assert.equal(actionOf(toxic), null);
});

test('symbolsOf: the first action of a stream', () => {
  const s = symbolsOf({ t: T, src: 'desk', kind: 'ask', loc: 'repo', size: 9, tier: 'default', priv: 'normal' }, emptyCtx());
  assert.deepEqual(s.sym, { gap: 'g:first', burst: 'b:0', src: 's:desk', kind: 'k:ask', step: 'k:^>k:ask', loc: 'l:repo', size: 'z:4', hour: 'h:3', day: 'd:wd', sess: 'm:0', tier: 't:default', shift: 't:^>t:default', priv: 'p:normal', elev: 'n:never' });
  assert.deepEqual(s.ctx, { prevT: T, prevKind: 'k:ask', prevTier: 't:default', lastElev: null, sessStart: T, recent: [T] });
  assert.equal(symbolsOf({ t: 'no' }, emptyCtx()), null);
});

test('symbolsOf: gaps, bursts, steps, shifts and the session clock', () => {
  let s = symbolsOf({ t: T, kind: 'a', tier: 'x' }, emptyCtx());
  s = symbolsOf({ t: T + 90000, kind: 'b', tier: 'y' }, s.ctx);
  assert.equal(s.sym.gap, 'g:7');
  assert.equal(s.sym.burst, 'b:0');
  assert.equal(s.sym.step, 'k:a>k:b');
  assert.equal(s.sym.shift, 't:x>t:y');
  assert.equal(s.sym.sess, 'm:1');
  const c1 = s.ctx;
  const b = symbolsOf({ t: T + 120000, kind: 'c' }, c1);
  assert.equal(b.sym.burst, 'b:1');                       // the action 30 s earlier is inside the minute
  assert.equal(b.sym.sess, 'm:2');
  assert.equal(symbolsOf({ t: T + 90000 + BURST_SPAN, kind: 'c' }, c1).sym.burst, 'b:0');       // exactly a minute: out
  assert.equal(symbolsOf({ t: T + 90000 + BURST_SPAN - 1, kind: 'c' }, c1).sym.burst, 'b:1');
  assert.equal(symbolsOf({ t: T + 90000 + SESSION_GAP, kind: 'c' }, c1).sym.sess, 'm:5');        // exactly 30 min: same session
  const fresh = symbolsOf({ t: T + 90000 + SESSION_GAP + 1, kind: 'c' }, c1);
  assert.equal(fresh.sym.sess, 'm:0');
  assert.equal(fresh.ctx.sessStart, T + 90000 + SESSION_GAP + 1);
});

test('symbolsOf: time buckets are capped so a longer pause never mints a new symbol', () => {
  const c = symbolsOf({ t: T, kind: 'a', priv: 'outward' }, emptyCtx());
  assert.equal(c.sym.elev, 'E:never');
  assert.equal(c.ctx.lastElev, T);
  const two = symbolsOf({ t: T + 2 * 60000, kind: 'a' }, c.ctx);
  assert.equal(two.sym.elev, 'n:2');
  assert.equal(two.ctx.lastElev, T);
  const late = symbolsOf({ t: T + 2 * 86400000, kind: 'a' }, c.ctx);
  assert.equal(late.sym.gap, 'g:17+');
  assert.equal(late.sym.elev, 'n:11+');
  assert.equal(symbolsOf({ t: T + 86400000, kind: 'a' }, c.ctx).sym.gap, 'g:17+');
  assert.equal(symbolsOf({ t: T + 40000 * 1000, kind: 'a' }, c.ctx).sym.gap, 'g:16');
  assert.equal(symbolsOf({ t: T + 1023 * 60000, kind: 'a' }, c.ctx).sym.elev, 'n:10');
  assert.equal(symbolsOf({ t: T + 1024 * 60000, kind: 'a' }, c.ctx).sym.elev, 'n:11+');
  assert.equal(symbolsOf({ t: T + 60000, kind: 'a', priv: 'elevated' }, c.ctx).sym.elev, 'E:1');
  assert.deepEqual(CAP, { gap: 17, sess: 10, elev: 11 });
  let s = symbolsOf({ t: T, kind: 'a' }, emptyCtx());
  for (let i = 1; i <= 25; i++) s = symbolsOf({ t: T + i * 25 * 60000, kind: 'a' }, s.ctx);
  assert.equal(s.sym.sess, 'm:10+');
  let s9 = symbolsOf({ t: T, kind: 'a' }, emptyCtx());
  for (let i = 1; i <= 20; i++) s9 = symbolsOf({ t: T + i * 25 * 60000, kind: 'a' }, s9.ctx);
  assert.equal(s9.sym.sess, 'm:9');
});

test('symbolsOf: hours and the weekend', () => {
  const at = (iso) => symbolsOf({ t: Date.parse(iso) }, emptyCtx()).sym;
  assert.equal(at('2026-10-05T05:00:00Z').hour, 'h:1');
  assert.equal(at('2026-10-05T23:59:00Z').hour, 'h:7');
  assert.equal(at('2026-10-05T00:00:00Z').hour, 'h:0');
  assert.equal(at('2026-10-04T12:00:00Z').day, 'd:we');   // Sunday
  assert.equal(at('2026-10-03T12:00:00Z').day, 'd:we');   // Saturday
  assert.equal(at('2026-10-05T12:00:00Z').day, 'd:wd');   // Monday
  assert.equal(at('2026-10-09T12:00:00Z').day, 'd:wd');   // Friday
});

test('symbolsOf: a malformed context is a fresh one; recent keeps the last 64', () => {
  assert.equal(symbolsOf({ t: T }, null).sym.gap, 'g:first');
  assert.equal(symbolsOf({ t: T }, { recent: 'no' }).sym.gap, 'g:first');
  const odd = symbolsOf({ t: T + 1000 }, { prevT: 'x', prevKind: 3, prevTier: null, lastElev: 'y', sessStart: T, recent: [T, 'z', T + 5000] });
  assert.equal(odd.sym.gap, 'g:first');
  assert.equal(odd.sym.step, 'k:^>k:?');
  assert.equal(odd.sym.burst, 'b:1');                     // the future stamp and the junk are dropped
  let s = symbolsOf({ t: T }, emptyCtx());
  for (let i = 1; i < 70; i++) s = symbolsOf({ t: T + i * 100 }, s.ctx);
  assert.equal(s.ctx.recent.length, 64);
  assert.equal(s.ctx.recent[63], T + 6900);
  assert.equal(s.sym.burst, 'b:7');
});

test('countsOf, entropy, stateOf, combine', () => {
  const w = [{ gap: 'a', kind: 'x' }, { gap: 'a', kind: 'y' }, null, { gap: 'b', kind: 'y' }, { gap: 'b', kind: 'y' }];
  const c = countsOf(w);
  assert.equal(c.n, 4);
  assert.deepEqual(c.counts.gap, { a: 2, b: 2 });
  assert.deepEqual(c.counts.kind, { x: 1, y: 3 });
  assert.deepEqual(c.counts.src, { '?:?': 4 });
  assert.equal(countsOf('no').n, 0);
  near(entropy({ a: 1, b: 1 }), Math.log(2));
  near(entropy({ a: 1, b: 1, c: 2 }), 1.5 * Math.log(2));
  assert.equal(entropy({ a: 3 }), 0);
  assert.equal(entropy({}), 0);
  assert.equal(entropy(null), 0);
  near(entropy({ a: 1, b: 1, z: 0, q: -2, n: NaN }), Math.log(2));
  const st = stateOf(c);
  near(st.Hf.gap, Math.log(2));
  near(st.H.net, Math.log(2) / 3);
  near(st.H.beh, entropy({ x: 1, y: 3 }) / 7);
  assert.equal(st.H.auth, 0);
  near(st.S, (st.H.net + st.H.beh + st.H.auth) / 3);
  assert.deepEqual(stateOf(null), { Hf: Object.fromEntries(FEATURES.map((f) => [f, 0])), H: { net: 0, beh: 0, auth: 0 }, S: 0 });
  const cb = combine({ gap: 3, kind: 7, tier: 4, priv: 'x' });
  assert.equal(cb.H.net, 1);
  assert.equal(cb.H.beh, 1);
  assert.equal(cb.H.auth, 1);
  assert.equal(cb.S, 1);
  assert.deepEqual(combine(null).H, { net: 0, beh: 0, auth: 0 });
  assert.deepEqual(DOMAINS.net, ['gap', 'burst', 'src']);
  assert.equal(FEATURES.length, 14);
  assert.equal(WEIGHTS.net + WEIGHTS.beh + WEIGHTS.auth, 1);
});

test('normalise', () => {
  assert.deepEqual(normalise({ a: 1, b: 3 }), { a: 0.25, b: 0.75 });
  assert.deepEqual(normalise({ a: 0, b: -1, c: 2 }), { c: 1 });
  assert.deepEqual(normalise({ a: 0 }), {});
  assert.deepEqual(normalise(null), {});
  assert.deepEqual(normalise({ a: NaN, b: 1 }), { b: 1 });
});

test('klFeature: the smoothed divergence of a window from the baseline', () => {
  near(klFeature({ a: 1, b: 1 }, { a: 0.5, b: 0.5 }, 0.5), Math.log(1.125));
  near(klFeature({ a: 1, b: 1 }, { a: 0.5, b: 0.5 }, 0.5, 2), Math.log(1.125));
  near(klFeature({ a: 1, b: 1 }, { a: 0.5, b: 0.5 }, 0.5, 10), 2 * 0.5 * Math.log(0.5 / ((0.5 + 0.5 / 11) / 1.5)));
  near(klFeature({ c: 1 }, { a: 1 }, 0.5), Math.log(9));
  near(klFeature({ c: 1 }, { a: 1 }, 1), Math.log(1 / ((1 / 3) / 2)));
  near(klFeature({ c: 1 }, { a: 1 }, 0), Math.log(9));     // a non-positive lambda keeps the default 0.5
  near(klFeature({ c: 1 }, { a: 1 }, -2), Math.log(9));
  near(klFeature({ a: 1 }, { a: 0, b: 1 }, 0.5), Math.log(1 / ((0.5 / 3) / 1.5)));
  assert.equal(klFeature({}, { a: 1 }, 0.5), 0);
  near(klFeature({ c: 1 }, null, 0.5), Math.log(1 / ((0.5 / 2) / 1.5)));
  near(klFeature({ c: 1 }, { a: 1 }, 0.5, -1), Math.log(9));
  near(klFeature({ c: 1 }, { a: 1 }, 0.5, 0), Math.log(1 / ((0.5 / 2) / 1.5)));
  assert.ok(klFeature({ a: 5, b: 1 }, { a: 0.5, b: 0.5 }, 0.5) > 0);
});

test('klOf: per feature, per domain and the weighted total', () => {
  const c = countsOf([{ gap: 'a', kind: 'k' }, { gap: 'a', kind: 'k' }]);
  const base = { gap: { a: 1 }, kind: { k: 1 } };
  const r = klOf(c, base, 0.5);
  const same = Math.log(1 / ((1 + 0.5 / 2) / 1.5));
  near(r.F.gap, same);
  near(r.F.kind, same);
  const unseen = Math.log(1 / ((0.5 / 2) / 1.5));          // '?:?' against an empty baseline row
  near(r.F.src, unseen);
  near(r.D.net, (same + 2 * unseen) / 3);
  near(r.total, (r.D.net + r.D.beh + r.D.auth) / 3);
  const z = klOf(c, base, 0.5, { gap: 4 });
  near(z.F.gap, Math.log(1 / ((1 + 0.5 / 5) / 1.5)));
  assert.equal(klOf(null, null, 0.5).total, 0);
});
