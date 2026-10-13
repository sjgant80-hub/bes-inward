import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signature, judge, fold, emptyBaseline, divergence, DEFAULTS } from '../src/bes.mjs';

const ev = (type, at, size = 1) => ({ type, at, size });
// a window with a known mix and irregular rhythm
const win = (types, gaps) => types.map((t, i) => ev(t, gaps.slice(0, i + 1).reduce((s, g) => s + g, 0)));

test('signature: op-mix is permille counts per type; the window size is reported', () => {
  const s = signature([ev('a', 0), ev('a', 10), ev('b', 25), ev('b', 40)]);
  assert.equal(s.n, 4);
  assert.equal(s.mix.a, 500); assert.equal(s.mix.b, 500);
});

test('signature variability: clockwork gaps → 0; irregular gaps → large', () => {
  const clock = signature([ev('a', 0), ev('a', 100), ev('a', 200), ev('a', 300)]);
  assert.equal(clock.variability, 0);                                  // constant 100 gaps → MAD 0
  const irregular = signature([ev('a', 0), ev('a', 10), ev('a', 300), ev('a', 320)]);
  assert.ok(irregular.variability > 100);                              // gaps 10,290,20 → high MAD/mean
});

test('signature is total on junk; an empty/1-event window has 0 variability', () => {
  for (const x of [null, undefined, 42, 'x', [null, 5, {}]]) assert.doesNotThrow(() => signature(x));
  assert.equal(signature([ev('a', 0)]).variability, 0);
  assert.equal(signature([]).n, 0);
});

test('divergence is the L1 permille distance over the union of ops', () => {
  assert.equal(divergence({ mix: { a: 1000 } }, { mix: { a: 1000 } }), 0);
  assert.equal(divergence({ mix: { a: 1000 } }, { mix: { b: 1000 } }), 2000);      // disjoint → 1000 + 1000
  assert.equal(divergence({ mix: { a: 600, b: 400 } }, { mix: { a: 500, b: 500 } }), 200);
});

test('fold: the first window seeds the baseline; later windows are an integer EMA', () => {
  let b = emptyBaseline();
  b = fold(b, signature([ev('a', 0), ev('b', 10)]));                   // mix a500 b500, count 1
  assert.equal(b.count, 1); assert.equal(b.mix.a, 500);
  b = fold(b, { mix: { a: 1000 }, variability: 0 }, 8);               // EMA toward a1000
  assert.equal(b.count, 2); assert.ok(b.mix.a > 500 && b.mix.a < 1000);
});

test('judge: calibrating until `calibrate` windows, then it decides', () => {
  const sig = signature(win(['a', 'b', 'a', 'b'], [50, 200, 60, 180]));
  assert.equal(judge(sig, { count: 0, mix: {}, variability: 0 }, {}).level, 'CALIBRATING');
  assert.equal(judge(sig, { count: 2, mix: { a: 500, b: 500 }, variability: 300 }, { calibrate: 3 }).level, 'CALIBRATING');
  assert.equal(judge(sig, { count: 3, mix: { a: 500, b: 500 }, variability: 300 }, { calibrate: 3 }).level, 'ALLOW');
});

test('judge: a clockwork window is FLAGGED as too regular (scripted)', () => {
  const scripted = signature([ev('a', 0), ev('a', 100), ev('b', 200), ev('a', 300), ev('b', 400)]);  // variability 0
  const b = { count: 5, mix: { a: 600, b: 400 }, variability: 300 };
  const v = judge(scripted, b, { minVariability: 120 });
  assert.equal(v.level, 'FLAG'); assert.match(v.reason, /regular/);
});

test('judge: a window far from the operator is FLAGGED as drift', () => {
  const sig = { n: 20, mix: { exfil: 1000 }, variability: 300 };
  const b = { count: 5, mix: { a: 500, b: 500 }, variability: 300 };
  const v = judge(sig, b, { maxDivergence: 600 });
  assert.equal(v.level, 'FLAG'); assert.match(v.reason, /unlike/);
});

test('judge: a window within rhythm and op-mix is ALLOWED', () => {
  const sig = { n: 20, mix: { a: 520, b: 480 }, variability: 280 };
  const b = { count: 5, mix: { a: 500, b: 500 }, variability: 300 };
  assert.equal(judge(sig, b, {}).level, 'ALLOW');
});

test('judge: the divergence edge — exactly maxDivergence allows, one over flags', () => {
  const b = { count: 5, mix: { a: 1000 }, variability: 300 };
  assert.equal(judge({ n: 20, mix: { a: 700, b: 300 }, variability: 300 }, b, { maxDivergence: 600 }).level, 'ALLOW');  // |700-1000|+300 = 600
  assert.equal(judge({ n: 20, mix: { a: 699, b: 301 }, variability: 300 }, b, { maxDivergence: 600 }).level, 'FLAG');  // 301+301 = 602
});

test('judge: the regularity edge — exactly minVariability allows, one under flags', () => {
  const b = { count: 5, mix: { a: 1000 }, variability: 300 };
  assert.equal(judge({ n: 20, mix: { a: 1000 }, variability: 120 }, b, { minVariability: 120 }).level, 'ALLOW');
  assert.equal(judge({ n: 20, mix: { a: 1000 }, variability: 119 }, b, { minVariability: 120 }).level, 'FLAG');
});

test('judge fails closed on a malformed signature or a thrown comparison, never admits', () => {
  assert.equal(judge(null, emptyBaseline(), { calibrate: 0 }).level, 'FLAG');
  assert.equal(judge({ n: 20, mix: null }, { count: 5, mix: { a: 1000 }, variability: 300 }, {}).level, 'FLAG');
  assert.doesNotThrow(() => judge({ get mix() { throw new Error('x'); }, variability: 1 }, { count: 5, mix: {}, variability: 0 }, {}));
});

test('DEFAULTS are frozen and ordered sanely', () => {
  assert.ok(Object.isFrozen(DEFAULTS));
  assert.ok(DEFAULTS.window >= 2 && DEFAULTS.minVariability > 0 && DEFAULTS.maxDivergence > 0 && DEFAULTS.calibrate >= 1);
});

test('signature counts only OBJECT events (non-object entries filtered out)', () => {
  assert.equal(signature([{ type: 'a', at: 0 }, 'str', 5, null, { type: 'b', at: 10 }]).n, 2);
});

test('fold: exact W-1 EMA, all baseline ops kept, and foldN<2 falls back to the default', () => {
  const b = fold(emptyBaseline(), { mix: { a: 500, z: 100 }, variability: 300 });   // count 1
  const r = fold(b, { mix: { a: 1000 }, variability: 100 }, 8);
  assert.equal(r.mix.a, Math.floor((500 * 7 + 1000) / 8));           // 562 exactly — kills W-1 → W+1
  assert.ok('z' in r.mix);                                           // a baseline op is preserved — kills ||→&& on the key union
  assert.equal(fold(b, { mix: { a: 1000 }, variability: 100 }, 1).mix.a, Math.floor((500 * 7 + 1000) / 8)); // foldN 1 → default 8
});

test('fold of a null signature advances the count without corrupting the baseline', () => {
  const b = fold(emptyBaseline(), { mix: { a: 500 }, variability: 300 });
  assert.equal(fold(b, null).count, b.count + 1);                    // kills the sig normalizer (mutant would catch → return b)
});

test('judge: a null baseline calibrates; a signature missing its mix or variability flags', () => {
  assert.equal(judge({ n: 20, mix: { a: 1000 }, variability: 300 }, null, { calibrate: 3 }).level, 'CALIBRATING');
  const lowB = { count: 9, mix: { a: 300, b: 200 }, variability: 300 };
  assert.equal(judge({ n: 20, mix: null, variability: 300 }, lowB, {}).level, 'FLAG');    // no mix → FLAG (kills ||→&&)
  assert.equal(judge({ n: 20, mix: { a: 500 } }, lowB, {}).level, 'FLAG');                // no variability → FLAG
});

test('judge honours a non-default param (it is not silently ignored)', () => {
  const b = { count: 9, mix: { a: 1000 }, variability: 300 };
  const sig = { n: 20, mix: { a: 850, b: 150 }, variability: 300 };    // divergence = 150 + 150 = 300
  assert.equal(judge(sig, b, { maxDivergence: 600 }).level, 'ALLOW');   // 300 < 600
  assert.equal(judge(sig, b, { maxDivergence: 200 }).level, 'FLAG');    // 300 > 200 → the custom cap IS used
});

test('signature: a non-string op type collapses to "?" (not kept as-is)', () => {
  const s = signature([{ type: 5, at: 0 }, { type: 5, at: 10 }]);
  assert.equal(s.mix['?'], 1000);
  assert.equal(s.mix[5], undefined);
});

test('fold: a NEW op in the window appears in the baseline, and variability is the exact W-1 EMA', () => {
  const b = fold(emptyBaseline(), { mix: { a: 1000 }, variability: 300 });   // count 1
  const r = fold(b, { mix: { a: 600, newop: 400 }, variability: 100 }, 8);
  assert.ok('newop' in r.mix);                                        // kills ||→&& on the s.mix side of the key union
  assert.equal(r.variability, Math.floor((300 * 7 + 100) / 8));       // exact variability EMA — kills W-1 → W+1
});

test('signature: a window with all actions at the same instant (zero gaps) has variability 0, never NaN', () => {
  const s = signature([{ type: 'a', at: 5 }, { type: 'a', at: 5 }, { type: 'a', at: 5 }]);
  assert.equal(s.variability, 0);
  assert.ok(Number.isInteger(s.variability));
});

test('judge: even a 2-event window (one gap) is subject to the regularity floor', () => {
  const b = { count: 9, mix: { a: 1000 }, variability: 300 };
  const twoEvt = signature([{ type: 'a', at: 0 }, { type: 'a', at: 10 }]);   // n=2, variability 0, mix matches baseline
  const v = judge(twoEvt, b, { minVariability: 120 });
  assert.equal(v.level, 'FLAG'); assert.match(v.reason, /regular/);
});

test('fold: foldN of exactly 2 uses W=2 (the >= edge), not the default', () => {
  const b = fold(emptyBaseline(), { mix: { a: 500 }, variability: 300 });   // count 1
  assert.equal(fold(b, { mix: { a: 1000 }, variability: 100 }, 2).mix.a, Math.floor((500 * 1 + 1000) / 2));  // 750, not 562
});
