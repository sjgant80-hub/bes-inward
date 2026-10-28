import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTS, OBSERVE_MS, RECOVERY_DOMAIN, recoveryBody, recoveryMaterialOf, applyRecovery } from '../src/recovery.mjs';
import { emptyWatcher } from '../src/watch.mjs';

const REC = 'd'.repeat(64), DAILY = 'e'.repeat(64);
const NOW = Date.UTC(2026, 9, 28, 12);
const rec = (o) => ({ body: recoveryBody({ identity: 'simon', act: 'observe', nonce: 'rec-00000001', at: NOW, by: REC, ...o }).body });
const blocked = { ...emptyWatcher('simon'), formed: true, held: { verdict: 'BLOCK', at: NOW - 5 } };
const c = (o) => ({ recoveryKey: REC, dailyKey: DAILY, sigOk: true, used: [], now: NOW, ...o });

test('a recovery body', () => {
  assert.deepEqual(ACTS, ['observe', 'confirm-shift']);
  assert.equal(OBSERVE_MS, 86400000);
  assert.deepEqual(rec({}).body, { kind: 'bes-recovery', v: 1, identity: 'simon', act: 'observe', nonce: 'rec-00000001', at: NOW, by: REC });
  assert.ok(recoveryMaterialOf(rec({}).body).startsWith(RECOVERY_DOMAIN));
  for (const [o, why] of [[{ identity: '' }, /identity/], [{ identity: 'x'.repeat(65) }, /identity/], [{ act: 'erase' }, /act/], [{ nonce: 'short' }, /nonce/], [{ nonce: 'n'.repeat(65) }, /nonce/], [{ at: -1 }, /moment/], [{ by: 'x' }, /key/]]) {
    const r = recoveryBody({ identity: 'simon', act: 'observe', nonce: 'rec-00000001', at: NOW, by: REC, ...o });
    assert.equal(r.ok, false); assert.match(r.why, why);
  }
  assert.equal(recoveryBody({ identity: 'x'.repeat(64), act: 'observe', nonce: 'n'.repeat(64), at: 0, by: REC }).ok, true);
  assert.equal(recoveryBody(null).ok, false);
});

test('the offline key lifts a block and puts the watcher back to observe-only for a day', () => {
  const r = applyRecovery(blocked, rec({}), c({}));
  assert.equal(r.ok, true);
  assert.equal(r.w.held, null);
  assert.equal(r.w.observeUntil, NOW + OBSERVE_MS);
  assert.deepEqual(r.used, ['rec-00000001']);
  assert.match(r.why, /observe-only/);
  assert.equal(applyRecovery(blocked, rec({}), c({ now: undefined })).w.observeUntil, NOW + OBSERVE_MS);
  assert.equal(applyRecovery(blocked, rec({}), c({ now: NOW + 7 })).w.observeUntil, NOW + 7 + OBSERVE_MS);
});

test('the daily key cannot lift a block; a replay, a tamper and the wrong identity are refused', () => {
  const daily = applyRecovery(blocked, rec({ by: DAILY }), c({}));
  assert.deepEqual([daily.ok, daily.w, daily.why], [false, blocked, 'only the offline recovery key can lift a block']);
  const replay = applyRecovery(blocked, rec({}), c({ used: ['rec-00000001'] }));
  assert.deepEqual([replay.ok, replay.why, replay.used], [false, 'this recovery record was already used', ['rec-00000001']]);
  const tamper = applyRecovery(blocked, rec({}), c({ sigOk: false }));
  assert.deepEqual([tamper.ok, tamper.why], [false, 'the record does not verify — tampered or forged']);
  assert.equal(applyRecovery(blocked, rec({ identity: 'kar' }), c({})).why, 'the record is for another identity');
  assert.equal(applyRecovery(null, rec({}), c({})).ok, false);
  assert.equal(applyRecovery(blocked, { body: { ...rec({}).body, extra: 1 } }, c({})).why, 'not in canonical form');
  assert.equal(applyRecovery(blocked, { body: { ...rec({}).body, act: 'x' } }, c({})).ok, false);
  assert.equal(applyRecovery(blocked, rec({ by: 'f'.repeat(64) }), c({})).ok, false);
  const toxic = applyRecovery(blocked, { get body() { throw new Error('x'); } }, c({ used: ['a-nonce-1'] }));
  assert.deepEqual([toxic.ok, toxic.used], [false, ['a-nonce-1']]);
  assert.deepEqual(applyRecovery(blocked, rec({}), null).ok, false);
});

test('confirm-shift may be signed by Simon’s daily key or the offline key', () => {
  const w = emptyWatcher('simon');
  const a = applyRecovery(w, rec({ act: 'confirm-shift', by: DAILY }), c({}));
  assert.equal(a.ok, true);
  assert.match(a.why, /folded/);
  assert.equal(applyRecovery(w, rec({ act: 'confirm-shift', by: REC }), c({})).ok, true);
  assert.equal(applyRecovery(w, rec({ act: 'confirm-shift', by: 'f'.repeat(64) }), c({})).why, 'not signed by the owner');
});

test('witness: an eight-character nonce is enough', () => {
  assert.equal(recoveryBody({ identity: 'simon', act: 'observe', nonce: '12345678', at: NOW, by: REC }).ok, true);
  assert.equal(recoveryBody({ identity: 'simon', act: 'observe', nonce: '1234567', at: NOW, by: REC }).ok, false);
});
