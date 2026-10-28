// fuzz-layer.test.mjs — the BES layer's pure kernels never throw on hostile input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as entropy from '../src/entropy.mjs';
import * as gep from '../src/gep.mjs';
import * as watch from '../src/watch.mjs';
import * as trust from '../src/trust.mjs';
import * as envelope from '../src/envelope.mjs';
import * as recovery from '../src/recovery.mjs';
import * as drivers from '../src/drivers.mjs';
import * as store from '../src/store.mjs';
import * as stack from '../src/stack.mjs';
import { judge } from '../measure/judge.mjs';

const circular = {}; circular.self = circular;
const toxic = new Proxy({}, { get() { throw new Error('toxic'); }, ownKeys() { throw new Error('toxic'); }, has() { throw new Error('toxic'); } });
const getter = { get t() { throw new Error('x'); }, get verb() { throw new Error('x'); }, get body() { throw new Error('x'); } };
const HOSTILE = [undefined, null, 0, -1, NaN, Infinity, 1e308, 2n ** 70n, '', 'x'.repeat(10000), [], [null], [1, 'a', {}], {}, circular, getter, toxic, () => 1, Symbol('s'), new Uint8Array(3), { t: Number.MAX_SAFE_INTEGER }, { t: -5, size: 'big', kind: {} }];

function never(name, fn) {
  test(name + ' never throws on hostile input', () => {
    for (const a of HOSTILE) for (const b of [undefined, null, {}, toxic, getter]) assert.doesNotThrow(() => fn(a, b), name + ' threw on ' + String(typeof a));
  });
}
never('entropy.actionOf', (a) => entropy.actionOf(a));
never('entropy.symbolsOf', (a, b) => entropy.symbolsOf(a, b));
never('entropy.countsOf/stateOf', (a) => entropy.stateOf(entropy.countsOf(a)));
never('entropy.entropy', (a) => entropy.entropy(a));
never('entropy.klOf', (a, b) => entropy.klOf(a, b, 0.5, a));
never('gep.decide', (a) => gep.decide(a));
never('gep.worst', (a, b) => gep.worst(a, b));
never('watch.step', (a, b) => watch.step(b, a, a));
never('watch.confirm', (a, b) => watch.confirm(a, b));
never('watch.barsOf', (a, b) => watch.barsOf(a, b));
never('watch.paramsOf', (a) => watch.paramsOf(a));
never('trust.trust', (a) => trust.trust(a));
never('trust.enforce', (a, b) => trust.enforce(a, b));
never('envelope.envelopeBody', (a) => envelope.envelopeBody(a));
never('envelope.admits', (a, b) => envelope.admits(a, b, b));
never('envelope.approvalFor', (a, b) => envelope.approvalFor(a, a, b, b));
never('recovery.applyRecovery', (a, b) => recovery.applyRecovery(a, b, b));
never('drivers', (a) => { drivers.run(a, 30, 1); drivers.cadence(a, 0, 1); drivers.uniform(a, 0, 1); drivers.shuffled(a, 0, 1); drivers.borrowed(a, a, 0); drivers.mimic(a, 0, 3); });
never('store.unpack', (a) => store.unpack(a));
never('store.pack', (a) => store.pack(a));
never('stack.receive', (a, b) => stack.receive(stack.emptyNode(b), a, b));
never('judge', (a) => judge(a));

test('the step of a toxic watcher with a real event is a fresh watcher, not a throw', () => {
  const r = watch.step(toxic, { t: 1000, kind: 'x' }, {});
  assert.equal(r.out.ok, true);
  assert.equal(r.w.n, 1);
});
