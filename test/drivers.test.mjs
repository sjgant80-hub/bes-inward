import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, rng, shapeOf, permutation, run, cadence, burst, uniform, shuffled, borrowed, mimic } from '../src/drivers.mjs';
import { human, night, session } from '../src/synth.mjs';

const T = Date.UTC(2026, 9, 10);
const ev = (i, t) => ({ t, src: 's' + i, kind: 'k' + i, loc: 'l', size: i, tier: 't', priv: 'p', extra: 'dropped' });
const real = [0, 5, 7, 60, 61].map((g, i) => ev(i, T + g * 1000));

test('rng is seeded and deterministic', () => {
  const a = rng(42), b = rng(42), c = rng(43);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.equal(rng(1.5)(), rng(1)());
  assert.equal(rng('x')(), rng(1)());
  assert.equal(rng(0)(), rng(0)());
  assert.notEqual(rng(0)(), rng(1)());
});

test('shapeOf drops time and anything that is not a shape field', () => {
  assert.deepEqual(shapeOf(real[1]), { src: 's1', kind: 'k1', loc: 'l', size: 1, tier: 't', priv: 'p' });
  assert.deepEqual(shapeOf({ kind: 'x' }), { kind: 'x' });
  assert.deepEqual(shapeOf(null), {});
});

test('permutation is a seeded permutation', () => {
  const p = permutation(10, 3);
  assert.deepEqual(p.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(p, permutation(10, 3));
  assert.notDeepEqual(p, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(permutation(0, 1), []);
  assert.deepEqual(permutation(1, 1), [0]);
  assert.deepEqual(permutation(-3, 1), []);
});

test('run: consecutive real actions from a seeded start', () => {
  const long = Array.from({ length: 100 }, (_, i) => ev(i, T + i));
  const r = run(long, 30, 9);
  assert.equal(r.length, 30);
  for (let i = 1; i < 30; i++) assert.equal(r[i].size, r[0].size + i);
  assert.deepEqual(run(long, 30, 9), r);
  assert.ok(r[0].size >= 0 && r[0].size <= 70);
  assert.equal(run(real, 30, 1).length, 5);
  assert.deepEqual(run(real, 5, 123), real);
  assert.deepEqual(run([], 30, 1), []);
  assert.deepEqual(run(real, 0, 1), []);
  assert.deepEqual(run([null, { t: 'x' }], 3, 1), []);
  const starts = new Set(Array.from({ length: 40 }, (_, s) => run(long, 30, s)[0].size));
  assert.ok(starts.size > 10);
  assert.ok([...starts].some((x) => x === 70) || Math.max(...starts) <= 70);
});

test('cadence and burst: the run on a fixed interval', () => {
  const c = cadence(real, T, 60000);
  assert.deepEqual(c.map((e) => e.t), [1, 2, 3, 4, 5].map((i) => T + i * 60000));
  assert.deepEqual(c.map((e) => e.kind), ['k0', 'k1', 'k2', 'k3', 'k4']);
  assert.equal(c[0].extra, undefined);
  assert.deepEqual(burst(real, T, 500).map((e) => e.t - T), [500, 1000, 1500, 2000, 2500]);
});

test('uniform: random order at uniformly random moments over 24 hours', () => {
  const long = Array.from({ length: 200 }, (_, i) => ev(i, T + i));
  const u = uniform(long, T, 5);
  assert.equal(u.length, 200);
  for (let i = 1; i < u.length; i++) assert.ok(u[i].t >= u[i - 1].t);
  assert.ok(u.every((e) => e.t > T && e.t <= T + DAY));
  assert.ok(u[199].t - u[0].t > DAY / 2);
  assert.deepEqual(u.map((e) => e.size).sort((a, b) => a - b), long.map((e) => e.size));
  assert.notDeepEqual(u.map((e) => e.size), long.map((e) => e.size));
  assert.deepEqual(uniform(long, T, 5), u);
});

test('shuffled: the real gaps, the order shuffled', () => {
  const long = Array.from({ length: 50 }, (_, i) => ev(i, T + i * i * 1000));
  const s = shuffled(long, T + 99, 4);
  assert.deepEqual(s.map((e) => e.t), long.map((e) => T + 100 + (e.t - T)));
  assert.deepEqual(s.map((e) => e.size).sort((a, b) => a - b), long.map((e) => e.size));
  assert.notDeepEqual(s.map((e) => e.size), long.map((e) => e.size));
  assert.deepEqual(shuffled([], T, 1), []);
});

test('borrowed: one identity’s shapes on the other’s real timing', () => {
  const other = [{ t: T + 5000 }, { t: T + 9000 }, { t: T + 30000 }];
  const b = borrowed(real, other, T);
  assert.deepEqual(b.map((e) => e.t), [T + 5000, T + 9000, T + 30000]);
  assert.deepEqual(b.map((e) => e.kind), ['k0', 'k1', 'k2']);
  const early = borrowed(real, other, T + 6000);
  assert.deepEqual(early.map((e) => e.t), [T + 6001, T + 10001, T + 31001]);
  assert.equal(borrowed(real, [{ t: T + 5000 }], T + 5000)[0].t, T + 5000);
  assert.deepEqual(borrowed(real, [], T), []);
  assert.equal(borrowed(real.slice(0, 2), other, T).length, 2);
});

test('mimic: the identity’s own past week, moved forward exactly 7 days', () => {
  const week = Array.from({ length: 40 }, (_, i) => ev(i, T + i * 3600000));
  const t0 = T + 7 * DAY + 5 * 3600000;
  const m = mimic(week, t0, 10);
  assert.equal(m.length, 10);
  assert.deepEqual(m.map((e) => e.t), week.slice(5, 15).map((e) => e.t + 7 * DAY));
  assert.equal(mimic(week, t0 - 1, 10)[0].t, week[5].t + 7 * DAY);
  assert.equal(mimic(week, t0 + 1, 10)[0].t, week[6].t + 7 * DAY);
});

test('synthetic streams are seeded, ordered and shaped', () => {
  for (const g of [human, night, session]) {
    const a = g({ days: 20 });
    assert.deepEqual(a, g({ days: 20 }));
    assert.notDeepEqual(a, g({ days: 20, seed: 99 }));
    assert.ok(a.length > 20);
    for (let i = 1; i < a.length; i++) assert.ok(a[i].t >= a[i - 1].t);
    assert.ok(a.every((e) => Number.isSafeInteger(e.t) && typeof e.kind === 'string' && e.size >= 1));
  }
  const n = night({ days: 30 });
  assert.ok(n.filter((e) => e.kind === 'recall-probe').length === 30);
  assert.ok(human({ days: 30 }).some((e) => e.priv === 'elevated'));
  assert.ok(session({ days: 30 }).some((e) => e.priv === 'outward'));
  assert.ok(human(null).length > 100);
});
