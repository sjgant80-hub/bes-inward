import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, tiersOn, enforce, trust } from '../src/trust.mjs';

const ALL = ['THROTTLE', 'STEP_UP', 'BLOCK', 'ISOLATE'];

test('tiers switch on one at a time, in order', () => {
  assert.deepEqual(TIERS, ALL);
  assert.deepEqual(tiersOn(ALL), ALL);
  assert.deepEqual(tiersOn(['THROTTLE', 'BLOCK']), ['THROTTLE']);   // BLOCK without STEP_UP is not on
  assert.deepEqual(tiersOn(['STEP_UP']), []);
  assert.deepEqual(tiersOn([]), []);
  assert.deepEqual(tiersOn('x'), []);
  assert.deepEqual(tiersOn(['THROTTLE', 'STEP_UP']), ['THROTTLE', 'STEP_UP']);
});

test('enforce: the highest tier switched on that is not above the verdict — fail toward step-up', () => {
  assert.equal(enforce('BLOCK', ['THROTTLE']), 'THROTTLE');
  assert.equal(enforce('BLOCK', ['THROTTLE', 'STEP_UP']), 'STEP_UP');
  assert.equal(enforce('BLOCK', ALL), 'BLOCK');
  assert.equal(enforce('ISOLATE', ALL), 'ISOLATE');
  assert.equal(enforce('ISOLATE', ['THROTTLE', 'STEP_UP', 'BLOCK']), 'BLOCK');
  assert.equal(enforce('THROTTLE', ALL), 'THROTTLE');
  assert.equal(enforce('STEP_UP', ALL), 'STEP_UP');
  assert.equal(enforce('ALLOW', ALL), 'ALLOW');
  assert.equal(enforce('BLOCK', []), 'ALLOW');
  assert.equal(enforce('nope', ALL), 'STEP_UP');
  assert.equal(enforce('nope', ['THROTTLE']), 'THROTTLE');
});

test('Simon = credential ∧ his baseline', () => {
  assert.deepEqual(trust({ actor: 'simon', credential: true, bes: { raw: 'ALLOW', observing: false }, tiers: ALL }), { raw: 'ALLOW', enforced: 'ALLOW', alert: false, layer: 'behaviour', why: 'behaviour: ALLOW' });
  const t = trust({ actor: 'simon', credential: true, bes: { raw: 'THROTTLE', observing: false }, tiers: ALL });
  assert.equal(t.raw, 'THROTTLE');
  assert.equal(t.enforced, 'THROTTLE');
  assert.equal(trust({ actor: 'simon', credential: true, bes: { raw: 'BLOCK', observing: false }, tiers: ALL }).enforced, 'BLOCK');
  assert.equal(trust({ actor: 'simon', credential: true, bes: { raw: 'BLOCK', observing: false } }).enforced, 'ALLOW');
});

test('credential validity never overrides — and an unknown holder is refused', () => {
  const r = trust({ actor: 'simon', credential: false, bes: { raw: 'ALLOW' } });
  assert.deepEqual([r.raw, r.enforced, r.layer, r.alert], ['BLOCK', 'BLOCK', 'credential', true]);
  assert.equal(trust({ actor: 'simon', credential: 'yes', bes: { raw: 'ALLOW' } }).raw, 'BLOCK');
  assert.equal(trust({ actor: 'mallory', credential: true, bes: { raw: 'ALLOW' } }).layer, 'credential');
  assert.equal(trust(null).raw, 'BLOCK');
});

test('Kar = credential ∧ Kar’s baseline ∧ inside the envelope', () => {
  const ok = { ok: true, stage: 'admitted' };
  assert.equal(trust({ actor: 'kar', credential: true, bes: { raw: 'ALLOW', observing: false }, envelope: ok, tiers: ALL }).enforced, 'ALLOW');
  const none = trust({ actor: 'kar', credential: true, bes: { raw: 'ALLOW', observing: false }, envelope: null, tiers: ALL });
  assert.deepEqual([none.raw, none.enforced, none.layer], ['BLOCK', 'BLOCK', 'envelope']);
  const out = trust({ actor: 'kar', credential: true, bes: { raw: 'ALLOW', observing: true }, envelope: { ok: false, stage: 'scope', why: 'x is not in scope' }, tiers: [] });
  assert.deepEqual([out.raw, out.enforced, out.layer, out.alert], ['BLOCK', 'BLOCK', 'envelope', true]);
  assert.equal(out.why, 'outside the envelope (scope): x is not in scope');
});

test('mixed signals: Kar inside its envelope but not behaving like Kar is stepped up to Simon', () => {
  const ok = { ok: true };
  const th = trust({ actor: 'kar', credential: true, bes: { raw: 'THROTTLE', observing: false }, envelope: ok, tiers: ALL });
  assert.deepEqual([th.raw, th.enforced], ['STEP_UP', 'STEP_UP']);
  assert.match(th.why, /mixed/);
  const bl = trust({ actor: 'kar', credential: true, bes: { raw: 'BLOCK', observing: false }, envelope: ok, tiers: ALL });
  assert.deepEqual([bl.raw, bl.why], ['BLOCK', 'behaviour: BLOCK']);
  const su = trust({ actor: 'kar', credential: true, bes: { raw: 'STEP_UP', observing: false }, envelope: ok, tiers: ALL });
  assert.deepEqual([su.raw, su.why], ['STEP_UP', 'behaviour: STEP_UP']);
});

test('observe-only enforces nothing — but a strong verdict is never silent', () => {
  const r = trust({ actor: 'simon', credential: true, bes: { raw: 'BLOCK', observing: true }, tiers: ALL });
  assert.deepEqual([r.raw, r.enforced, r.alert], ['BLOCK', 'ALLOW', true]);
  assert.equal(trust({ actor: 'simon', credential: true, bes: { raw: 'THROTTLE', observing: true }, tiers: ALL }).alert, false);
  assert.equal(trust({ actor: 'simon', credential: true, bes: { raw: 'STEP_UP', observing: false }, tiers: ALL }).alert, false);
  assert.equal(trust({ actor: 'simon', credential: true, bes: { raw: 'STEP_UP', observing: false }, tiers: ['THROTTLE'] }).alert, true);
  assert.equal(trust({ actor: 'simon', credential: true, bes: { raw: 'BLOCK', observing: false }, tiers: ['THROTTLE', 'STEP_UP'] }).enforced, 'STEP_UP');
});

test('an unreadable behaviour verdict reads STEP_UP; a failure fails toward step-up', () => {
  const r = trust({ actor: 'simon', credential: true, bes: { raw: 'MAYBE', observing: false }, tiers: ALL });
  assert.deepEqual([r.raw, r.enforced], ['STEP_UP', 'STEP_UP']);
  assert.match(r.why, /unreadable/);
  assert.equal(trust({ actor: 'simon', credential: true, bes: null, tiers: ALL }).raw, 'STEP_UP');
  const toxic = { actor: 'simon', credential: true, get bes() { throw new Error('x'); } };
  assert.deepEqual([trust(toxic).raw, trust(toxic).enforced, trust(toxic).alert], ['STEP_UP', 'STEP_UP', true]);
});
