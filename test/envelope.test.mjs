import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIGH, STAGES, ENVELOPE_DOMAIN, envelopeBody, withinWallet, materialOf, approvalMaterialOf, approvalFor, admits } from '../src/envelope.mjs';
import { makeIdentity, verifyBytes, hex } from '../vendor/fall-kit-core/identity.mjs';

const SIMON = 'a'.repeat(64), KAR = 'b'.repeat(64), OTHER = 'c'.repeat(64);
const T0 = Date.UTC(2026, 9, 20), T1 = Date.UTC(2026, 9, 27);
const P = { issuer: SIMON, holder: KAR, scope: ['run', 'measure', 'commit'], budget: 100, notBefore: T0, notAfter: T1, nonce: 'env-00000001' };
const body = envelopeBody(P).body;
const ctx = (o) => ({ simon: SIMON, holder: KAR, sigOk: true, spent: 0, revoked: [], ...o });
const act = (o) => ({ verb: 'run', t: T0 + 3600000, cost: 5, ...o });
const env = { body };

test('an envelope body is checked and put in one canonical form', () => {
  assert.deepEqual(body, { kind: 'bes-envelope', v: 1, issuer: SIMON, holder: KAR, scope: ['commit', 'measure', 'run'], budget: 100, notBefore: T0, notAfter: T1, hours: null, nonce: 'env-00000001' });
  assert.deepEqual(envelopeBody({ ...P, scope: ['run', 'run'] }).body.scope, ['run']);
  assert.deepEqual(envelopeBody({ ...P, hours: [8, 20] }).body.hours, [8, 20]);
  assert.equal(materialOf(body), ENVELOPE_DOMAIN + JSON.stringify({ budget: 100, holder: KAR, hours: null, issuer: SIMON, kind: 'bes-envelope', nonce: 'env-00000001', notAfter: T1, notBefore: T0, scope: ['commit', 'measure', 'run'], v: 1 }));
  assert.ok(approvalMaterialOf({ a: 1 }).startsWith('BES/approval/v1\u0000'));
  assert.deepEqual(STAGES, ['shape', 'issuer', 'holder', 'signature', 'high-stakes', 'scope', 'window', 'expiry', 'revoked', 'budget', 'admitted']);
});

test('a standing envelope can NEVER carry money, deals, public claims or a reserved switch', () => {
  assert.deepEqual(HIGH, ['money', 'deal', 'public-claim', 'reserved']);
  for (const h of HIGH) {
    const r = envelopeBody({ ...P, scope: ['run', h] });
    assert.equal(r.ok, false, h);
    assert.match(r.why, /never carry/);
  }
});

test('malformed envelopes are refused, each for its reason', () => {
  const bad = [
    [{ issuer: 'x' }, /64-hex/], [{ holder: 'B'.repeat(64) }, /64-hex/], [{ scope: [] }, /1–32/], [{ scope: ['Run'] }, /1–32/],
    [{ scope: Array.from({ length: 33 }, (_, i) => 'v' + i) }, /1–32/], [{ scope: 'run' }, /1–32/], [{ budget: -1 }, /whole/], [{ budget: 1.5 }, /whole/],
    [{ notAfter: T0 }, /window/], [{ notBefore: -1 }, /window/], [{ notAfter: 'x' }, /window/], [{ hours: [20, 8] }, /hours/], [{ hours: [0, 25] }, /hours/],
    [{ hours: [8] }, /hours/], [{ hours: [-1, 4] }, /hours/], [{ hours: [1.5, 4] }, /hours/], [{ nonce: 'short' }, /nonce/], [{ nonce: 'x'.repeat(65) }, /nonce/], [{ nonce: 7 }, /nonce/],
  ];
  for (const [o, why] of bad) { const r = envelopeBody({ ...P, ...o }); assert.equal(r.ok, false, JSON.stringify(o)); assert.match(r.why, why); }
  assert.equal(envelopeBody({ ...P, scope: Array.from({ length: 32 }, (_, i) => 'v' + i) }).ok, true);
  assert.equal(envelopeBody({ ...P, hours: [0, 24] }).ok, true);
  assert.equal(envelopeBody({ ...P, nonce: 'x'.repeat(64) }).ok, true);
  assert.equal(envelopeBody({ ...P, nonce: '12345678' }).ok, true);
  assert.equal(envelopeBody({ ...P, budget: 0 }).ok, true);
  assert.equal(envelopeBody(null).ok, false);
  assert.equal(envelopeBody({ get issuer() { throw new Error('x'); } }).ok, false);
});

test('admits: inside the envelope', () => {
  assert.deepEqual(admits(env, act(), ctx()), { ok: true, stage: 'admitted', why: 'inside the envelope' });
  assert.equal(admits(env, act({ t: T0 }), ctx()).ok, true);
  assert.equal(admits(env, act({ t: T1 - 1 }), ctx()).ok, true);
  assert.equal(admits(env, act({ cost: 100 }), ctx()).ok, true);
  assert.equal(admits(env, act({ cost: 0 }), ctx({ spent: 100 })).ok, true);
});

test('admits: every fault names its own stage', () => {
  const s = (e, a, c) => admits(e, a, c).stage;
  assert.equal(s({ body: { ...body, budget: -1 } }, act(), ctx()), 'shape');
  assert.equal(s({ body: { ...body, scope: ['run', 'commit', 'measure'] } }, act(), ctx()), 'shape');     // not canonical
  assert.equal(s(env, act({ verb: 'Run' }), ctx()), 'shape');
  assert.equal(s(env, act({ cost: -1 }), ctx()), 'shape');
  assert.equal(s(env, act({ t: 1.5 }), ctx()), 'shape');
  assert.equal(s(env, act(), ctx({ simon: OTHER })), 'issuer');
  assert.equal(s(env, act(), ctx({ holder: OTHER })), 'holder');
  assert.equal(s(env, act(), ctx({ sigOk: false })), 'signature');
  assert.equal(s(env, act(), ctx({ sigOk: 'yes' })), 'signature');
  assert.equal(s(env, act({ verb: 'deploy' }), ctx()), 'scope');
  assert.equal(s(env, act({ t: T0 - 1 }), ctx()), 'window');
  assert.equal(s(env, act({ t: T1 }), ctx()), 'expiry');
  assert.equal(s(env, act(), ctx({ revoked: ['env-00000001'] })), 'revoked');
  assert.equal(s(env, act(), ctx({ revoked: ['other-nonce'] })), 'admitted');
  assert.equal(s(env, act({ cost: 101 }), ctx()), 'budget');
  assert.equal(s(env, act({ cost: 6 }), ctx({ spent: 95 })), 'budget');
  assert.equal(s(env, act({ cost: 5 }), ctx({ spent: 95 })), 'admitted');
  assert.equal(s(env, act({ cost: 5 }), ctx({ spent: -10 })), 'admitted');
  assert.equal(s(null, act(), ctx()), 'shape');
  assert.equal(s(env, null, ctx()), 'shape');
  assert.equal(s(env, act(), null), 'issuer');
});

test('admits: the daily hours', () => {
  const e = { body: envelopeBody({ ...P, hours: [8, 20] }).body };
  const at = (h, m = 0) => act({ t: Date.UTC(2026, 9, 21, h, m) });
  assert.equal(admits(e, at(8), ctx()).ok, true);
  assert.equal(admits(e, at(19, 59), ctx()).ok, true);
  assert.equal(admits(e, at(7, 59), ctx()).stage, 'window');
  assert.equal(admits(e, at(20), ctx()).stage, 'window');
});

test('high-stakes needs Simon’s LIVE approval of those exact words', () => {
  const r = admits(env, act({ verb: 'money' }), ctx());
  assert.equal(r.stage, 'high-stakes');
  assert.match(r.why, /needs the owner/);
  assert.equal(admits(env, act({ verb: 'deal' }), ctx({ approval: { ok: true, live: false, why: 'a rehearsal approval: dry run only' } })).why.includes('rehearsal'), true);
  assert.equal(admits(env, act({ verb: 'deal' }), ctx({ approval: { ok: false, live: false, why: 'the words changed after they were approved' } })).stage, 'high-stakes');
  assert.equal(admits(env, act({ verb: 'deal' }), ctx({ approval: { ok: false, live: true } })).stage, 'high-stakes');
  const yes = admits(env, act({ verb: 'public-claim' }), ctx({ approval: { ok: true, live: true } }));
  assert.deepEqual(yes, { ok: true, stage: 'admitted', why: 'inside the envelope, on the owner’s live approval' });
  assert.equal(admits(env, act({ verb: 'money', t: T1 }), ctx({ approval: { ok: true, live: true } })).stage, 'expiry');
  assert.equal(admits(env, act({ verb: 'money', cost: 101 }), ctx({ approval: { ok: true, live: true } })).stage, 'budget');
});

test('approvalFor mirrors the AI-first company’s binding: item + sha256 of the words', () => {
  const H = 'f'.repeat(64), now = T0 + 10;
  const ap = (b, sigOk = true) => ({ body: { kind: 'bes-approval', itemId: 'deal-1', textSha256: H, by: SIMON, at: T0, expires: T0 + 1000, ...b }, sigOk });
  const c = { simon: SIMON, now };
  assert.deepEqual(approvalFor('deal-1', H, [ap({})], c), { ok: true, live: true, why: 'approved by the owner for these exact words' });
  assert.equal(approvalFor('deal-1', H, [], c).why, 'waiting for the owner’s approval');
  assert.equal(approvalFor('deal-1', 'e'.repeat(64), [ap({})], c).why, 'the words changed after they were approved');
  assert.equal(approvalFor('deal-1', H, [ap({}), ap({ withdrawn: true })], c).why, 'the owner withdrew the approval');
  assert.equal(approvalFor('deal-1', H, [ap({}, false)], c).ok, false);
  assert.equal(approvalFor('deal-1', H, [ap({ by: OTHER })], c).ok, false);
  assert.equal(approvalFor('deal-2', H, [ap({})], c).ok, false);
  assert.equal(approvalFor('deal-1', H, [ap({ kind: 'other' })], c).ok, false);
  assert.equal(approvalFor('deal-1', H, [ap({ expires: now })], c).why, 'the approval has expired');
  assert.equal(approvalFor('deal-1', H, [ap({ expires: now + 1 })], c).ok, true);
  assert.equal(approvalFor('deal-1', H, [ap({ expires: 'soon' })], c).ok, false);
  assert.equal(approvalFor('deal-1', H, [ap({})], { simon: SIMON }).ok, false);
  assert.deepEqual(approvalFor('deal-1', H, [ap({ rehearsal: true })], c), { ok: true, live: false, why: 'a rehearsal approval: dry run only' });
  assert.equal(approvalFor('deal-1', H, [ap({ rehearsal: true }), ap({})], c).live, true);
  assert.equal(approvalFor('deal-1', H, 'x', c).ok, false);
  assert.equal(approvalFor('deal-1', H, [null, 3], c).ok, false);
  assert.equal(approvalFor('deal-1', H, [ap({})], null).ok, false);
  const toxic = [{ sigOk: true, get body() { throw new Error('x'); } }];
  assert.equal(approvalFor('deal-1', H, toxic, c).why, 'the approvals could not be read');
});

test('withinWallet: Simon can only delegate what his own wallet holds', () => {
  const wallet = { caps: ['run', 'measure', 'commit', 'deploy'], budget: { total: 1000, spent: 950 } };
  assert.equal(withinWallet(body, wallet).ok, false);
  assert.equal(withinWallet(body, { ...wallet, budget: { total: 1000, spent: 0 } }).ok, true);
  assert.equal(withinWallet(body, { caps: ['run'], budget: { total: 1000, spent: 0 } }).ok, false);
  assert.equal(withinWallet(body, null).ok, false);
});

test('a real Ed25519 signature over the canonical material verifies, and a changed body does not', async () => {
  const simon = await makeIdentity(new Uint8Array(32).fill(1));
  const b = envelopeBody({ ...P, issuer: simon.id }).body;
  const sig = await simon.sign(new TextEncoder().encode(materialOf(b)));
  assert.equal(await verifyBytes(simon.id, new TextEncoder().encode(materialOf(b)), sig), true);
  assert.equal(await verifyBytes(simon.id, new TextEncoder().encode(materialOf({ ...b, budget: 101 })), sig), false);
  assert.equal(hex(sig).length, 128);
});

test('witness: an empty daily window [h, h) is refused', () => {
  assert.equal(envelopeBody({ ...P, hours: [8, 8] }).ok, false);
  assert.equal(envelopeBody({ ...P, hours: [8, 9] }).ok, true);
});
