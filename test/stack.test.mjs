import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify as edVerify } from 'node:crypto';
import { LAYERS, layerOf, emptyNode, receive, sha256hex, REBOUND_EPOCH_MS } from '../src/stack.mjs';
import { envelopeBody } from '../src/envelope.mjs';
import { makeIdentity, unhex } from '../vendor/fall-kit-core/identity.mjs';
import { prepare, finish, KINDS } from '../vendor/fall-kit-core/vendor/light/packet.mjs';
import { challenge, solve } from '../vendor/break-it/rebound.mjs';

const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const verify = (signed, sig, keyHex) => { try { return edVerify(null, Buffer.from(signed), createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(unhex(keyHex))]), format: 'der', type: 'spki' }), Buffer.from(sig)); } catch { return false; } };
const T = Date.UTC(2026, 9, 1, 9);
const SMALL = { W: 6, minN: 3, block: 4, formDays: 1, formBlocks: 2, minCal: 3, burn: 1 };
const ALL = ['THROTTLE', 'STEP_UP', 'BLOCK', 'ISOLATE'];

async function world(opts = {}) {
  const simon = await makeIdentity(new Uint8Array(32).fill(7));
  const kar = await makeIdentity(new Uint8Array(32).fill(9));
  const env = { body: envelopeBody({ issuer: simon.id, holder: kar.id, scope: ['run', 'measure'], budget: 50, notBefore: T - 1, notAfter: T + 365 * 86400000, nonce: 'env-test-0001' }).body };
  const node = emptyNode({ simon: simon.id, keys: [{ slot: simon.slot, id: simon.id, actor: 'simon', name: 'simon' }, { slot: kar.slot, id: kar.id, actor: 'kar', name: 'kar' }], envelope: opts.noEnvelope ? null : env, envelopeSigOk: opts.sigOk !== false, tiers: opts.tiers || ALL, params: SMALL });
  const counters = new Map();
  const pkt = async (who, value, counter) => {
    const n = counter !== undefined ? counter : (counters.get(who.id) || 0n) + 1n;
    counters.set(who.id, n);
    const p = prepare({ sender: who.slot, counter: n, dictId: 0, kind: KINDS.JSON, value });
    return finish(p.unsigned, await who.sign(p.signed)).bytes;
  };
  return { simon, kar, node, pkt };
}
const say = (o) => ({ verb: 'ask', src: 'desk', kind: 'instruction', organ: 'repo', size: 30, tier: 'default', priv: 'normal', ...o });

test('the four layers and which door stage belongs to which', () => {
  assert.deepEqual(LAYERS, ['verify-before-parse', 'light-barrier', 'bes', 'immune']);
  for (const s of ['size', 'magic', 'version', 'length', 'dictionary', 'body']) assert.equal(layerOf(s), 'light-barrier', s);
  for (const s of ['sender', 'signature', 'counter', 'error']) assert.equal(layerOf(s), 'verify-before-parse', s);
  assert.equal(sha256hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256hex(new Uint8Array([0x61, 0x62, 0x63])), sha256hex('abc'));
  assert.equal(sha256hex(null), sha256hex(new Uint8Array(0)));
  assert.equal(REBOUND_EPOCH_MS, 60000);
});

test('Simon’s valid action passes every layer while his baseline forms (observe-only)', async () => {
  const { simon, node, pkt } = await world();
  const r = receive(node, await pkt(simon, say()), { now: T, source: 'lan', verify });
  assert.equal(r.out.admitted, true);
  assert.equal(r.out.layer, 'bes');
  assert.equal(r.out.who, 'simon');
  assert.equal(r.node.counters[simon.slot], '1');
  assert.equal(r.node.keys[simon.slot].watcher.n, 1);
  assert.equal(r.node.spent, 0);
});

test('layers 1 and 2 refuse on raw bytes, and every refusal becomes immune memory', async () => {
  const { simon, kar, node, pkt } = await world();
  const good = await pkt(simon, say());
  const forged = good.slice(); forged[forged.length - 1] ^= 1;
  const f = receive(node, forged, { now: T, source: 'x', verify });
  assert.deepEqual([f.out.admitted, f.out.layer, f.out.stage, f.out.immune.family], [false, 'verify-before-parse', 'signature', 'forgery']);
  assert.equal(f.node.refusals.x, 1);
  assert.equal(f.node.memory.events, 1);
  const stranger = await makeIdentity(new Uint8Array(32).fill(3));
  const s = receive(node, await pkt(stranger, say()), { now: T, source: 'x', verify });
  assert.deepEqual([s.out.layer, s.out.stage, s.out.immune.family], ['verify-before-parse', 'sender', 'unknown-sender']);
  const m = receive(node, new Uint8Array(120).fill(65), { now: T, source: 'x', verify });
  assert.deepEqual([m.out.layer, m.out.stage, m.out.immune.family], ['light-barrier', 'magic', 'malformed']);
  const first = receive(node, good, { now: T, source: 'lan', verify });
  const replay = receive(first.node, good, { now: T + 1000, source: 'lan', verify });
  assert.deepEqual([replay.out.layer, replay.out.stage, replay.out.immune.family], ['verify-before-parse', 'counter', 'out-of-order']);
  const notAction = receive(node, await pkt(simon, 42), { now: T, source: 'x', verify });
  assert.deepEqual([notAction.out.layer, notAction.out.stage, notAction.out.immune.family], ['light-barrier', 'schema', 'schema-escape']);
  const noVerb = receive(node, await pkt(simon, { kind: 'x' }), { now: T, source: 'x', verify });
  assert.equal(noVerb.out.stage, 'schema');
  const noVerify = receive(node, await pkt(kar, say({ verb: 'run' })), { now: T, source: 'x' });
  assert.equal(noVerify.out.stage, 'signature');
  const junk = receive(node, 'nope', { now: T, source: 'x', verify });
  assert.equal(junk.out.admitted, false);
  assert.equal(receive(node, good, null).out.admitted, false);
});

test('Kar acts only inside the envelope Simon signed — outside it is blocked, whatever its baseline', async () => {
  const { kar, node, pkt } = await world();
  const ok = receive(node, await pkt(kar, say({ verb: 'run', cost: 5, tier: 'code', priv: 'read' })), { now: T, source: 'kar-host', verify });
  assert.equal(ok.out.admitted, true);
  assert.equal(ok.node.spent, 5);
  const out = receive(ok.node, await pkt(kar, say({ verb: 'deploy', cost: 1 })), { now: T + 1000, source: 'kar-host', verify });
  assert.deepEqual([out.out.admitted, out.out.layer, out.out.stage, out.out.immune.family], [false, 'bes', 'behavior', 'behavior']);
  assert.match(out.out.why, /outside the envelope \(scope\)/);
  assert.equal(out.out.verdict, 'BLOCK');
  assert.equal(out.node.spent, 5);
  assert.equal(out.node.counters[kar.slot], '1');                       // a refused packet does not spend its counter
  const broke = receive(ok.node, await pkt(kar, say({ verb: 'run', cost: 46 })), { now: T + 2000, source: 'kar-host', verify });
  assert.match(broke.out.why, /budget/);
  const money = receive(ok.node, await pkt(kar, say({ verb: 'money', cost: 1, item: 'pay-1', text: 'pay the invoice' })), { now: T + 3000, source: 'kar-host', verify });
  assert.match(money.out.why, /high-stakes/);
  const w2 = await world({ noEnvelope: true });
  const none = receive(w2.node, await w2.pkt(w2.kar, say({ verb: 'run' })), { now: T, source: 'k', verify });
  assert.match(none.out.why, /only inside an envelope/);
  const w3 = await world({ sigOk: false });
  const forgedEnv = receive(w3.node, await w3.pkt(w3.kar, say({ verb: 'run' })), { now: T, source: 'k', verify });
  assert.match(forgedEnv.out.why, /signature/);
});

test('a formed baseline refuses a different hand on Simon’s valid key; the refusal is an antibody', async () => {
  const { simon, node, pkt } = await world();
  let n = node;
  for (let i = 0; i < 40; i++) n = receive(n, await pkt(simon, say({ kind: i % 2 ? 'question' : 'instruction' })), { now: T + i * 3600000, source: 'lan', verify }).node;
  assert.equal(n.keys[simon.slot].watcher.formed, true);
  let refused = null;
  for (let i = 0; i < 10 && !refused; i++) {
    const r = receive(n, await pkt(simon, say({ src: 'script', kind: 'z', organ: 'elsewhere', size: 5000, tier: 'bypassPermissions', priv: 'outward' })), { now: T + 40 * 3600000 + i * 500, source: 'far', verify });
    n = r.node;
    if (!r.out.admitted) refused = r.out;
  }
  assert.ok(refused, 'refused');
  assert.deepEqual([refused.layer, refused.stage, refused.immune.family], ['bes', 'behavior', 'behavior']);
  assert.ok(['STEP_UP', 'BLOCK', 'ISOLATE'].includes(refused.enforced));
  assert.equal(n.memory.families.behavior >= 1, true);
});

test('observe-only admits what a formed watcher would refuse — nothing is enforced while tiers are off', async () => {
  const { simon, node, pkt } = await world({ tiers: [] });
  let n = node, all = true;
  for (let i = 0; i < 40; i++) n = receive(n, await pkt(simon, say()), { now: T + i * 3600000, source: 'lan', verify }).node;
  for (let i = 0; i < 6; i++) { const r = receive(n, await pkt(simon, say({ src: 'script', kind: 'z', organ: 'elsewhere', size: 5000 })), { now: T + 40 * 3600000 + i * 500, source: 'far', verify }); n = r.node; all = all && r.out.admitted; if (r.out.verdict !== 'ALLOW') assert.equal(r.out.enforced, 'ALLOW'); }
  assert.equal(all, true);
});

test('the tarpit: a source refused past the ladder owes proof-of-work before its next packet is looked at', async () => {
  const { simon, node, pkt } = await world();
  const n = { ...node, refusals: { hammer: 100 } };
  const bytes = await pkt(simon, say());
  const r = receive(n, bytes, { now: T, source: 'hammer', verify });
  assert.deepEqual([r.out.admitted, r.out.layer, r.out.stage, r.out.owed], [false, 'immune', 'rebound', 12]);
  assert.equal(r.node, n);
  const chal = challenge(Math.floor(T / REBOUND_EPOCH_MS), 'hammer', sha256hex(bytes));
  assert.equal(r.out.challenge, chal);
  const work = solve(chal, 12, (s) => sha256hex(s));
  const paid = receive(n, bytes, { now: T, source: 'hammer', verify, work: String(work) });
  assert.equal(paid.out.admitted, true);
  const r99 = receive({ ...node, refusals: { hammer: 99 } }, bytes, { now: T, source: 'hammer', verify });
  assert.equal(r99.out.admitted, true);
  const f = receive({ ...node, refusals: { hammer: 99 } }, bytes.slice(0, 50), { now: T, source: 'hammer', verify });
  assert.equal(f.out.owed, 12);
  assert.equal(receive({ ...node, refusals: { hammer: 500 } }, bytes, { now: T, source: 'hammer', verify }).out.owed, 18);
});

test('emptyNode is total', () => {
  const n = emptyNode(null);
  assert.deepEqual(n.keys, {});
  assert.deepEqual(n.tiers, []);
  assert.equal(n.envelope, null);
  const k = emptyNode({ keys: [{ slot: 300, id: 'x' }, { slot: 4, id: 'y', actor: 'kar' }, null] });
  assert.deepEqual(Object.keys(k.keys), ['4']);
  assert.equal(k.keys[4].name, 'kar');
  assert.equal(emptyNode({ envelopeSigOk: 'yes' }).envelopeSigOk, false);
});
