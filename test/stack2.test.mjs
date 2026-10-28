// stack2.test.mjs — the cases the witness found unguarded in stack.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify as edVerify } from 'node:crypto';
import { emptyNode, receive, sha256hex } from '../src/stack.mjs';
import { envelopeBody } from '../src/envelope.mjs';
import { makeIdentity, unhex } from '../vendor/fall-kit-core/identity.mjs';
import { prepare, finish, KINDS } from '../vendor/fall-kit-core/vendor/light/packet.mjs';

const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const verify = (signed, sig, keyHex) => { try { return edVerify(null, Buffer.from(signed), createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(unhex(keyHex))]), format: 'der', type: 'spki' }), Buffer.from(sig)); } catch { return false; } };
const T = Date.UTC(2026, 9, 1, 9);
const SMALL = { W: 6, minN: 3, block: 4, formDays: 1, formBlocks: 2, minCal: 3, burn: 1 };
const ALL = ['THROTTLE', 'STEP_UP', 'BLOCK', 'ISOLATE'];
async function world() {
  const simon = await makeIdentity(new Uint8Array(32).fill(7));
  const kar = await makeIdentity(new Uint8Array(32).fill(9));
  const env = { body: envelopeBody({ issuer: simon.id, holder: kar.id, scope: ['run', 'measure'], budget: 50, notBefore: T - 1, notAfter: T + 365 * 86400000, nonce: 'env-test-0001' }).body };
  const node = emptyNode({ simon: simon.id, keys: [{ slot: simon.slot, id: simon.id, actor: 'simon', name: 'simon' }, { slot: kar.slot, id: kar.id, actor: 'kar', name: 'kar' }], envelope: env, envelopeSigOk: true, tiers: ALL, params: SMALL });
  const counters = new Map();
  const pkt = async (who, value) => {
    const n = (counters.get(who.id) || 0n) + 1n;
    counters.set(who.id, n);
    const p = prepare({ sender: who.slot, counter: n, dictId: 0, kind: KINDS.JSON, value });
    return finish(p.unsigned, await who.sign(p.signed)).bytes;
  };
  return { simon, kar, node, pkt };
}
const say = (o) => ({ verb: 'ask', src: 'desk', kind: 'instruction', organ: 'repo', size: 30, tier: 'default', priv: 'normal', ...o });

test('slots 0 and 255; a missing name falls back to the actor everywhere', () => {
  const n = emptyNode({ keys: [{ slot: 0, id: 'a', actor: 'simon' }, { slot: 255, id: 'b', actor: 'kar' }, { slot: -1, id: 'c' }, { slot: 256, id: 'd' }] });
  assert.deepEqual(Object.keys(n.keys).sort(), ['0', '255']);
  assert.equal(n.keys[255].watcher.id, 'kar');
  assert.equal(n.keys[0].name, 'simon');
});

test('a THROTTLE is admitted; spending is the agent’s alone and only whole costs', async () => {
  const { simon, kar, node, pkt } = await world();
  let n = node;
  for (let i = 0; i < 40; i++) n = receive(n, await pkt(simon, say()), { now: T + i * 3600000, source: 'lan', verify }).node;
  const parts = {};
  for (const p of ['S', 'net', 'beh', 'auth']) parts[p] = { eps: -Math.log(1.5) * 1e6, k: 1e-6, klBar: 1e9, Amin: 0 };
  const w = n.keys[simon.slot].watcher;
  n = { ...n, keys: { ...n.keys, [simon.slot]: { ...n.keys[simon.slot], watcher: { ...w, bars: { parts, beta: 0, budget: 1e9, rhythmBar: null } } } } };
  const th = receive(n, await pkt(simon, say({ cost: 5 })), { now: T + 41 * 3600000, source: 'lan', verify });
  assert.equal(th.out.verdict, 'THROTTLE');
  assert.equal(th.out.admitted, true);
  assert.equal(th.node.spent, 0);
  const k1 = receive(node, await pkt(kar, say({ verb: 'run', cost: 2.5 })), { now: T, source: 'k', verify });
  assert.equal(k1.out.admitted, true);
  assert.equal(k1.node.spent, 0);
});

test('the action’s kind falls back to its verb', async () => {
  const { simon, node, pkt } = await world();
  const r = receive(node, await pkt(simon, { verb: 'ask', organ: 'repo' }), { now: T, source: 'lan', verify });
  assert.equal(r.node.keys[simon.slot].watcher.window[0].kind, 'k:ask');
});

test('a live approval of the exact words admits a high-stakes act; with no text, the empty words are what is hashed', async () => {
  const { simon, kar, node, pkt } = await world();
  const ap = (text) => ({ body: { kind: 'bes-approval', itemId: 'deal-1', textSha256: sha256hex(text), by: simon.id, at: T, expires: T + 3600000 }, sigOk: true });
  const n1 = { ...node, approvals: [ap('sign it')] };
  assert.equal(receive(n1, await pkt(kar, say({ verb: 'deal', cost: 1, item: 'deal-1', text: 'sign it' })), { now: T + 1, source: 'k', verify }).out.admitted, true);
  const n2 = { ...node, approvals: [ap('')] };
  assert.equal(receive(n2, await pkt(kar, say({ verb: 'deal', cost: 1, item: 'deal-1' })), { now: T + 1, source: 'k', verify }).out.admitted, true);
  assert.equal(receive(node, await pkt(kar, say({ verb: 'deal', cost: 1 })), { now: T + 1, source: 'k', verify }).out.admitted, false);
});

test('something that is not a whole node is refused, never trusted', async () => {
  const { simon, node, pkt } = await world();
  const bytes = await pkt(simon, say());
  for (const broken of [null, { ...node, keys: null }, { ...node, counters: null }, { ...node, refusals: null }, { ...node, memory: null }, new Proxy({}, { get() { throw new Error('x'); } })]) {
    const r = receive(broken, bytes, { now: T, source: 'lan', verify });
    assert.equal(r.out.admitted, false);
    assert.equal(r.out.why, 'not a node');
  }
});
