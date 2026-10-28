// ════════════════════════════════════════════════════════════════
// recovery.mjs — the offline human recovery path: BES can never lock Simon out of his own estate. Pure, total, gated.
// (Simon's safety rule for the BES layer: no self-lockout, an offline recovery path always exists.)
//
// A recovery record is signed by Simon's OFFLINE recovery key — a second key kept off this machine (paper, or a
// device that is not online), pinned when BES is installed and never used for daily work. A thief holding the daily
// key cannot sign one. It does one of two things for one identity:
//   observe        clear a held BLOCK / ISOLATE and put the watcher back to observe-only for a day (it re-arms itself)
//   confirm-shift  fold a baseline shift the watcher held for Simon to confirm (this one Simon's daily key may sign too)
// Each record works once (its nonce is spent), for the identity it names, and only if its signature verifies — the
// caller verifies (WebCrypto is async) and hands in sigOk.
// ════════════════════════════════════════════════════════════════
import { canonical } from '../vendor/fall-kit-core/vendor/wallet/wallet.mjs';
import { confirmShift } from './watch.mjs';

export const RECOVERY_DOMAIN = 'BES/recovery/v1\u0000';
export const ACTS = Object.freeze(['observe', 'confirm-shift']);
export const OBSERVE_MS = 24 * 3600 * 1000;
const HEX64 = /^[0-9a-f]{64}$/;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const whole = (n) => Number.isSafeInteger(n) && n >= 0;

/** A checked recovery body, or why not. */
export function recoveryBody(p) {
  const o = isObj(p) ? p : {};
  if (typeof o.identity !== 'string' || o.identity.length === 0 || o.identity.length > 64) return { ok: false, why: 'it names one identity' };
  if (!ACTS.includes(o.act)) return { ok: false, why: 'act is observe or confirm-shift' };
  if (typeof o.nonce !== 'string' || o.nonce.length < 8 || o.nonce.length > 64) return { ok: false, why: 'a nonce of 8–64 characters' };
  if (!whole(o.at)) return { ok: false, why: 'at is a moment' };
  if (!HEX64.test(String(o.by))) return { ok: false, why: 'by is the signing key' };
  return { ok: true, body: { kind: 'bes-recovery', v: 1, identity: o.identity, act: o.act, nonce: o.nonce, at: o.at, by: o.by } };
}

export const recoveryMaterialOf = (body) => RECOVERY_DOMAIN + canonical(body);

/**
 * Apply a recovery record to a watcher. ctx = { recoveryKey, dailyKey, sigOk, used (spent nonces), now, params }.
 * → { ok, w, used, why }. Refused records change nothing.
 */
export function applyRecovery(watcher, record, ctx) {
  let c = {}, used = [];
  try { c = isObj(ctx) ? ctx : {}; used = Array.isArray(c.used) ? c.used : []; } catch { c = {}; used = []; }
  try {
    const r = isObj(record) ? record : {};
    const b = recoveryBody(r.body);
    if (!b.ok || canonical(b.body) !== canonical(r.body)) return { ok: false, w: watcher, used, why: b.ok ? 'not in canonical form' : b.why };
    const body = b.body;
    const keyOk = body.by === c.recoveryKey || (body.act === 'confirm-shift' && body.by === c.dailyKey);
    if (!keyOk) return { ok: false, w: watcher, used, why: body.act === 'observe' ? 'only the offline recovery key can lift a block' : 'not signed by the owner' };
    if (c.sigOk !== true) return { ok: false, w: watcher, used, why: 'the record does not verify — tampered or forged' };
    if (used.includes(body.nonce)) return { ok: false, w: watcher, used, why: 'this recovery record was already used' };
    if (!isObj(watcher) || watcher.id !== body.identity) return { ok: false, w: watcher, used, why: 'the record is for another identity' };
    const now = whole(c.now) ? c.now : body.at;
    const w = body.act === 'observe' ? { ...watcher, held: null, observeUntil: now + OBSERVE_MS } : confirmShift(watcher, c.params);
    return { ok: true, w, used: used.concat([body.nonce]), why: body.act === 'observe' ? 'block lifted; observe-only for 24 hours' : 'the held shift is folded into the baseline' };
  } catch { return { ok: false, w: watcher, used, why: 'the record could not be read' }; }
}
