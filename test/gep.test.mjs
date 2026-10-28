import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERDICTS, THETA, rank, worst, sigmoid, field, salience, decide } from '../src/gep.mjs';

const near = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, a + ' ≠ ' + b);
// a single part with ε = 0 and k = 1: E = σ(d). Thresholds on x = d: 2.5θ ⇔ ln 5, 2θ ⇔ ln 2, 1.5θ ⇔ 0, θ ⇔ −ln 2
const base = { d: 0, eps: 0, k: 1, kl: 0, Amin: 0.5, dS: 0, kA: 1, grad: 0, beta: 1, dSess: 0, budget: 1 };
const v = (o) => decide({ ...base, ...o });
const h = 1e-9;

test('the ladder and its order', () => {
  assert.deepEqual(VERDICTS, ['ALLOW', 'THROTTLE', 'STEP_UP', 'BLOCK', 'ISOLATE']);
  assert.equal(THETA, 1 / 3);
  assert.deepEqual(VERDICTS.map(rank), [0, 1, 2, 3, 4]);
  assert.equal(rank('nope'), -1);
  assert.equal(worst('ALLOW', 'BLOCK'), 'BLOCK');
  assert.equal(worst('ISOLATE', 'THROTTLE'), 'ISOLATE');
  assert.equal(worst('THROTTLE', 'THROTTLE'), 'THROTTLE');
  assert.equal(worst('nope', 'ALLOW'), 'STEP_UP');
  assert.equal(worst('ALLOW', 'nope'), 'STEP_UP');
  assert.equal(worst('BLOCK', 'nope'), 'BLOCK');
  assert.equal(worst('nope', 'ISOLATE'), 'ISOLATE');
});

test('sigmoid, field, salience (clamped at 1: Property 3.1)', () => {
  assert.equal(sigmoid(0), 0.5);
  near(sigmoid(Math.log(3)), 0.75);
  assert.equal(field(2, 2, 7), 0.5);
  near(field(3, 2, Math.log(3)), 0.75);
  near(field(1, 2, Math.log(3)), 0.25);
  assert.equal(salience(0, 0, 1), 1);
  near(salience(1, 0, 1), Math.exp(-1));
  near(salience(0, 1, 2), Math.exp(-2));
  near(salience(1, 0.5, 2), Math.exp(-2));
  assert.equal(salience(0, -1, 1), 1);
  near(salience(2, -1, 1), Math.exp(-1));
});

test('the alignment paper’s matrix, rung by rung (θ = 1/3)', () => {
  assert.equal(v({ d: Math.log(5) + h }).verdict, 'BLOCK');
  assert.equal(v({ d: Math.log(5) + h }).row, 'E > 2.5θ');
  assert.equal(v({ d: Math.log(5) - h }).verdict, 'STEP_UP');
  assert.equal(v({ d: Math.log(2) + h }).verdict, 'STEP_UP');
  assert.equal(v({ d: Math.log(2) + h }).row, 'E > 2θ');
  assert.equal(v({ d: Math.log(2) - h }).verdict, 'THROTTLE');
  assert.equal(v({ d: h }).verdict, 'THROTTLE');
  assert.equal(v({ d: h }).row, 'E > 1.5θ');
  assert.equal(v({ d: 0 }).verdict, 'ALLOW');
  assert.equal(v({ d: -h }).verdict, 'ALLOW');
  assert.equal(v({ d: 0 }).row, 'within bounds, A ≥ min');
});

test('within bounds, alignment below its bar is BLOCK — and exactly at the bar is ALLOW', () => {
  const r = v({ d: -1, kl: 1, Amin: Math.exp(-1) + h });
  assert.equal(r.verdict, 'BLOCK');
  assert.equal(r.row, 'within bounds, A < min');
  assert.equal(v({ d: -1, kl: 1, Amin: Math.exp(-1) }).verdict, 'ALLOW');
  assert.equal(v({ d: -1, kl: 1, Amin: Math.exp(-1) - h }).verdict, 'ALLOW');
  assert.equal(v({ d: -1, kl: 0.5, dS: 0.5, kA: 1, Amin: Math.exp(-1) + h }).verdict, 'BLOCK');   // ΔS counts
  assert.equal(v({ d: -1, kl: 0.5, dS: 0.5, kA: 0, Amin: Math.exp(-1) + h }).verdict, 'ALLOW');
});

test('critical anomaly → ISOLATE only when the top rung, low alignment and the session budget all agree', () => {
  const top = { d: Math.log(5) + 1, kl: 5, Amin: 0.5 };
  assert.equal(v({ ...top, dSess: 1 + h }).verdict, 'ISOLATE');
  assert.match(v({ ...top, dSess: 1 + h }).row, /critical anomaly/);
  assert.equal(v({ ...top, dSess: 1 }).verdict, 'BLOCK');
  assert.equal(v({ ...top, kl: 0, dSess: 2 }).verdict, 'BLOCK');
  assert.equal(v({ d: Math.log(5) - h, kl: 5, dSess: 2 }).verdict, 'STEP_UP');
});

test('rapid escalation: β|∇S| > 1 lifts a milder verdict to STEP_UP once E is above θ', () => {
  assert.equal(v({ d: -Math.log(2) + h, grad: 1 + h }).verdict, 'STEP_UP');
  assert.match(v({ d: -Math.log(2) + h, grad: 1 + h }).row, /rapid escalation/);
  assert.equal(v({ d: -Math.log(2) + h, grad: 1 }).verdict, 'ALLOW');
  assert.equal(v({ d: -Math.log(2) - h, grad: 5 }).verdict, 'ALLOW');
  assert.equal(v({ d: -Math.log(2) + h, grad: 2, beta: 0.5 }).verdict, 'ALLOW');
  assert.equal(v({ d: h, grad: 5 }).verdict, 'STEP_UP');                   // THROTTLE lifted
  assert.equal(v({ d: Math.log(5) + h, grad: 5 }).verdict, 'BLOCK');       // never lowers a stronger verdict
  assert.equal(v({ d: Math.log(2) + h, grad: 5 }).row, 'E > 2θ');
});

test('several parts: the strongest field and the alignment furthest below its own bar decide', () => {
  const p = (name, d, kl, Amin) => ({ name, d, eps: 0, k: 1, kl, Amin });
  const r = decide({ ...base, parts: [p('S', -1, 0, 0.1), p('net', Math.log(2) + h, 0, 0.1)] });
  assert.equal(r.verdict, 'STEP_UP');
  assert.equal(r.part, 'net');
  near(r.E, sigmoid(Math.log(2) + h));
  const low = decide({ ...base, parts: [p('S', -1, 1.2, 0.1), p('beh', -1, 0.5, 0.7)] });
  assert.equal(low.verdict, 'BLOCK');
  assert.equal(low.part, 'beh');
  near(low.A, Math.exp(-0.5));
  const low2 = decide({ ...base, parts: [p('beh', -1, 0.5, 0.7), p('S', -1, 1.2, 0.1)] });
  assert.equal(low2.part, 'beh');
  near(low2.A, Math.exp(-0.5));
  const both = decide({ ...base, parts: [p('a', -1, 0.6, 0.9), p('b', -1, 0.9, 0.9)] });
  assert.equal(both.part, 'b');
  near(both.A, Math.exp(-0.9));
  const none = decide({ ...base, parts: [p('a', -1, 0.6, 0.1), p('b', -1, 0.9, 0.1)] });
  assert.equal(none.verdict, 'ALLOW');
  near(none.A, Math.exp(-0.9));
  assert.equal(none.part, 'a');
  assert.match(decide({ ...base, parts: [p('net', Math.log(2) + h, 0, 0.1)] }).why, /\(net\)$/);
  assert.equal(decide({ ...base, parts: [] }).verdict, 'ALLOW');           // an empty list falls back to the flat part
});

test('unreadable measures fail toward STEP_UP, never ALLOW, never BLOCK', () => {
  for (const f of ['d', 'eps', 'k', 'kl', 'Amin', 'dS', 'kA', 'grad', 'beta', 'dSess', 'budget']) {
    const r = v({ [f]: NaN });
    assert.equal(r.verdict, 'STEP_UP', f);
    assert.equal(r.row, 'unreadable', f);
    assert.equal(r.E, null);
  }
  assert.equal(decide(null).verdict, 'STEP_UP');
  assert.equal(decide({ ...base, parts: [null] }).verdict, 'STEP_UP');
  assert.equal(decide({ ...base, parts: [{ name: 'x', d: 1, eps: 0, k: 1, kl: 0 }] }).row, 'unreadable');
  assert.equal(v({ d: Infinity }).verdict, 'STEP_UP');
  const toxic = { get parts() { throw new Error('x'); } };
  assert.equal(decide(toxic).verdict, 'STEP_UP');
  assert.equal(decide(toxic).row, 'error');
});

test('Gary\u2019s key finding: overly regular timing below the identity\u2019s own floor is BLOCK', () => {
  const r = v({ rhythm: 0.1, rhythmBar: 0.2 });
  assert.equal(r.verdict, 'BLOCK');
  assert.equal(r.part, 'rhythm');
  assert.match(r.row, /too regular/);
  assert.equal(v({ rhythm: 0.2, rhythmBar: 0.2 }).verdict, 'ALLOW');
  assert.equal(v({ rhythm: 0.1, rhythmBar: null }).verdict, 'ALLOW');
  assert.equal(v({ rhythm: null, rhythmBar: 0.2 }).verdict, 'ALLOW');
  assert.equal(v({ rhythm: 0, rhythmBar: 0 }).verdict, 'ALLOW');               // a clockwork identity: floor 0, never fires
  assert.equal(v({ d: Math.log(2) + h, rhythm: 0.1, rhythmBar: 0.2 }).verdict, 'BLOCK');
  const top = { d: Math.log(5) + 1, kl: 5, Amin: 0.5, dSess: 2 };
  assert.equal(v({ ...top, rhythm: 0, rhythmBar: 1 }).verdict, 'ISOLATE');      // never lowers ISOLATE
  assert.equal(v({ d: Math.log(5) + h, rhythm: 0, rhythmBar: 1 }).row, 'E > 2.5θ');
});

test('witness: exact rows, ties and the unknown-verdict rule', () => {
  assert.equal(v({ d: -Math.log(2) + h, grad: 1 + h }).row, 'rapid escalation: β|∇S| > 1');
  assert.equal(v({ d: Math.log(5) + h }).row, 'E > 2.5θ');
  assert.equal(v({ d: h }).row, 'E > 1.5θ');
  assert.equal(worst('ALLOW', 'ALLOW'), 'ALLOW');
  assert.equal(worst('ALLOW', 'THROTTLE'), 'THROTTLE');
  assert.equal(worst('THROTTLE', 'ALLOW'), 'THROTTLE');
  assert.equal(decide(null).row, 'unreadable');
  assert.equal(decide(7).row, 'unreadable');
  const p = (name, kl, Amin) => ({ name, d: -1, eps: 0, k: 1, kl, Amin });
  const tie = decide({ ...base, parts: [p('first', 0.5, 0.9), p('second', 0.5, 0.9)] });
  assert.equal(tie.part, 'first');
  const desc = decide({ ...base, parts: [p('b', 0.9, 0.1), p('a', 0.6, 0.1)] });
  near(desc.A, Math.exp(-0.9));
  const lowFirst = decide({ ...base, parts: [p('low', 0.5, 0.9), p('ok', 0.1, 0.1)] });
  assert.equal(lowFirst.part, 'low');
  near(lowFirst.A, Math.exp(-0.5));
});
