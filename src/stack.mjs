// ════════════════════════════════════════════════════════════════
// stack.mjs — the living defence, four layers, one door: an action proceeds only if every layer agrees.
// Pure (crypto injected), deterministic, gated.
//
//   1 verify-before-parse   the packet's sender is pinned, its signature verifies, its counter is fresh — checked on
//   2 LIGHT barrier         raw bytes, with the language (LIGHT magic, version, length, dictionary), before one byte of
//                           the body is decoded. In code these two are ONE door: LIGHT's packet.open (vendored from
//                           fall-kit core, byte-identical), whose stages are named and mapped to their layer below.
//   3 BES                   the key is valid — is its holder behaving like itself? Simon: his baseline. Kar: Kar's
//                           baseline AND inside the envelope Simon signed. Timing is the RECEIVER's clock, never a time
//                           the sender claims. Credential validity never overrides entropy violation.
//   4 immune + tarpit       every refusal becomes memory (break-it's immune system, vendored byte-identical): a BES
//                           refusal is learned as the 'behavior' family — an antibody — and the refusal count of its
//                           source winds break-it's rebound: past its ladder a source must pay proof-of-work before its
//                           next packet is even looked at. Nothing is ever sent back at anyone.
//
// The node state is plain data (JSON-safe; counters as decimal strings) so it can be stored in LIGHT.
// ════════════════════════════════════════════════════════════════
import { open } from '../vendor/fall-kit-core/vendor/light/packet.mjs';
import { sha256 } from '../vendor/fall-kit-core/vendor/light/sha256.mjs';
import { classify, fingerprint, learn, standing, emptyMemory } from '../vendor/break-it/immune.mjs';
import { difficultyFor, challenge, verifyWork } from '../vendor/break-it/rebound.mjs';
import { step, emptyWatcher } from './watch.mjs';
import { trust, enforce } from './trust.mjs';
import { admits, approvalFor } from './envelope.mjs';
import { rank, worst } from './gep.mjs';

export const LAYERS = Object.freeze(['verify-before-parse', 'light-barrier', 'bes', 'immune']);
const BARRIER = Object.freeze(['size', 'magic', 'version', 'length', 'dictionary', 'body']);
/** Which layer a LIGHT door stage belongs to. */
export const layerOf = (stage) => (BARRIER.includes(stage) ? 'light-barrier' : 'verify-before-parse');
// LIGHT's stage names → the names break-it's immune classifier reads
const IMMUNE_STAGE = Object.freeze({ size: 'size', magic: 'magic', version: 'magic', length: 'size', dictionary: 'schema', body: 'schema', sender: 'sender', signature: 'signature', counter: 'counter', error: 'error' });
export const REBOUND_EPOCH_MS = 60000;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const hexOf = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
export const sha256hex = (s) => hexOf(sha256(typeof s === 'string' ? new TextEncoder().encode(s) : s instanceof Uint8Array ? s : new Uint8Array(0)));

/**
 * A node. cfg = { simon (hex key), keys: [{ slot, id, actor: 'simon'|'kar', name }], envelope: { body, sig }|null,
 * envelopeSigOk, tiers, params }.
 */
export function emptyNode(cfg) {
  try { return makeNode(isObj(cfg) ? cfg : {}); } catch { return makeNode({}); }
}
function makeNode(c) {
  const keys = {};
  for (const k of Array.isArray(c.keys) ? c.keys : []) if (isObj(k) && Number.isInteger(k.slot) && k.slot >= 0 && k.slot <= 255) keys[k.slot] = { id: String(k.id), actor: k.actor, name: String(k.name || k.actor), watcher: emptyWatcher(String(k.name || k.actor)) };
  return { simon: String(c.simon || ''), keys, counters: {}, memory: emptyMemory(), refusals: {}, envelope: isObj(c.envelope) ? c.envelope : null, envelopeSigOk: c.envelopeSigOk === true, spent: 0, revoked: [], approvals: [], tiers: Array.isArray(c.tiers) ? c.tiers : [], params: isObj(c.params) ? c.params : {} };
}

function okNode(n) { try { return isObj(n) && isObj(n.keys) && isObj(n.counters) && isObj(n.refusals) && isObj(n.memory); } catch { return false; } }

function refuse(node, bytes, layer, stage, why, source, extra) {
  const family = classify({ stage, reason: why }, { bytes });
  const print = fingerprint(family, { bytes });
  const l = learn(node.memory, { family, print, source });
  const refusals = { ...node.refusals, [source]: (node.refusals[source] || 0) + 1 };
  return { node: { ...node, memory: l.memory, refusals }, out: { admitted: false, layer, stage, why, ...(extra || {}), immune: { family, novel: l.novel, standing: standing(l.memory, source) }, owed: difficultyFor(refusals[source]) } };
}

/**
 * One packet through all four layers. io = { now (receiver ms), source (where it came from), verify(signed, sig, keyHex)
 * → bool (synchronous: Node's crypto, or a browser's pre-verified answer), work (proof-of-work nonce, if owed) }.
 * → { node, out }  out.admitted true only when every layer agreed.
 */
export function receive(node, bytes, io) {
  let o = {}, source = 'unknown', now = 0;
  try { o = isObj(io) ? io : {}; source = typeof o.source === 'string' ? o.source.slice(0, 64) : 'unknown'; now = Number.isSafeInteger(o.now) ? o.now : 0; } catch { o = {}; }
  if (!okNode(node)) return { node, out: { admitted: false, layer: 'verify-before-parse', stage: 'error', why: 'not a node' } };
  try {
    const owed = difficultyFor(node.refusals[source] || 0);
    if (owed > 0) {
      const chal = challenge(Math.floor(now / REBOUND_EPOCH_MS), source, sha256hex(bytes instanceof Uint8Array ? bytes : new Uint8Array(0)));
      if (!verifyWork(chal, typeof o.work === 'string' ? o.work : null, owed, (s) => sha256hex(s))) return { node, out: { admitted: false, layer: 'immune', stage: 'rebound', why: 'this source owes proof-of-work (' + owed + ' bits) before it is looked at', challenge: chal, owed } };
    }
    const ctx = {
      keyFor: (s) => (isObj(node.keys[s]) ? node.keys[s].id : null),
      verify: (signed, sig, key) => typeof o.verify === 'function' && o.verify(signed, sig, key) === true,
      dictFor: () => null,
      lastCounter: (s) => BigInt(typeof node.counters[s] === 'string' ? node.counters[s] : '0'),
    };
    const door = open(bytes, ctx);
    if (!door.admit) return refuse(node, bytes, layerOf(door.stage), IMMUNE_STAGE[door.stage] || 'error', door.reason, source);
    const a = door.value;
    if (!isObj(a) || typeof a.verb !== 'string') return refuse(node, bytes, 'light-barrier', 'schema', 'the body is not an action', source);
    const k = node.keys[door.sender];
    const ev = { t: now, src: a.src, kind: a.kind || a.verb, loc: a.organ, size: a.size, tier: a.tier, priv: a.priv };
    const r = step(k.watcher, ev, node.params);
    let env = null;
    if (k.actor === 'kar' && isObj(node.envelope)) {
      const approval = typeof a.item === 'string' ? approvalFor(a.item, sha256hex(String(a.text || '')), node.approvals, { simon: node.simon, now }) : null;
      env = admits(node.envelope, { verb: a.verb, t: now, cost: Number.isSafeInteger(a.cost) ? a.cost : 0 }, { simon: node.simon, holder: k.id, sigOk: node.envelopeSigOk, spent: node.spent, revoked: node.revoked, approval });
    }
    const tv = trust({ actor: k.actor, credential: true, bes: { raw: r.out.raw, observing: r.out.observing }, envelope: env, tiers: node.tiers });
    const enforced = r.out.held && !r.out.observing ? worst(tv.enforced, enforce(r.out.held.verdict, node.tiers)) : tv.enforced;
    const keys = { ...node.keys, [door.sender]: { ...k, watcher: r.w } };
    const seen = { verdict: tv.raw, enforced, alert: tv.alert, part: tv.layer, why: tv.why, row: r.out.row };
    if (rank(enforced) <= 1) {
      const counters = { ...node.counters, [door.sender]: String(door.counter) };
      const spent = k.actor === 'kar' && Number.isSafeInteger(a.cost) && a.cost > 0 ? node.spent + a.cost : node.spent;
      return { node: { ...node, keys, counters, spent }, out: { admitted: true, layer: 'bes', stage: 'admitted', who: k.name, ...seen } };
    }
    return refuse({ ...node, keys }, bytes, 'bes', 'behavior', tv.why, source, { who: k.name, ...seen });
  } catch {
    return refuse(node, bytes instanceof Uint8Array ? bytes : new Uint8Array(0), 'verify-before-parse', 'error', 'the node failed closed', source);
  }
}
