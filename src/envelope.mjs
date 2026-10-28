// ════════════════════════════════════════════════════════════════
// envelope.mjs — the DELEGATION ENVELOPE: what Simon's key lets Kar do, signed, bounded, and expiring. Pure, total,
// deterministic, gated. (The estate's extension of BES — not in Gary's papers.)
//
// Kar's action is trusted only when the credential is valid AND Kar is behaving like Kar AND the action is inside an
// envelope Simon signed. Outside it = BLOCK, however perfect the behaviour. The envelope carries:
//   issuer   Simon's public key (pinned)        holder   Kar's public key
//   scope    the verbs Kar may do               budget   wallet units Kar may spend (the wallet kernel keeps the count)
//   notBefore / notAfter   the time window and its expiry      hours   an optional daily window [from, to) UTC
//   nonce    names the envelope, so Simon can revoke it
//
// HIGH-STAKES NEVER RIDE A STANDING ENVELOPE: money, deals, public claims and any switch Simon reserves are refused
// when an envelope is made and refused again when one is checked. They need Simon's LIVE approval of that exact
// item — an approval names the item and the SHA-256 of its words, so changing one character voids it (the same
// binding as the AI-first company's claim gate); a withdrawn approval is void; a rehearsal approval is a dry run only.
//
// The check runs in stages, in the order the perimeter-post checkpoint uses (shape → who → signature → what → when →
// revoked → budget), and the first that fails names itself. Signatures are verified by the caller (WebCrypto is
// async; this file is pure): admits() is handed sigOk, and approvals arrive already verified.
// The budget is the wallet kernel's own canDo (vendored byte-identical from fall-kit core, itself from the-wallet).
// ════════════════════════════════════════════════════════════════
import { canonical, canDo, attenuates } from '../vendor/fall-kit-core/vendor/wallet/wallet.mjs';

export const ENVELOPE_DOMAIN = 'BES/envelope/v1\u0000';
export const APPROVAL_DOMAIN = 'BES/approval/v1\u0000';
export const HIGH = Object.freeze(['money', 'deal', 'public-claim', 'reserved']);
export const STAGES = Object.freeze(['shape', 'issuer', 'holder', 'signature', 'high-stakes', 'scope', 'window', 'expiry', 'revoked', 'budget', 'admitted']);
const HEX64 = /^[0-9a-f]{64}$/, VERB = /^[a-z][a-z0-9-]{0,31}$/;
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const whole = (n) => Number.isSafeInteger(n) && n >= 0;
const no = (stage, why) => ({ ok: false, stage, why });

/** A checked envelope body, or the reason it cannot be one. A standing envelope can never hold a high-stakes verb. */
export function envelopeBody(p) {
  try {
    const o = isObj(p) ? p : {};
    if (!HEX64.test(String(o.issuer)) || !HEX64.test(String(o.holder))) return { ok: false, why: 'issuer and holder are 64-hex public keys' };
    if (!Array.isArray(o.scope) || o.scope.length === 0 || o.scope.length > 32 || !o.scope.every((v) => typeof v === 'string' && VERB.test(v))) return { ok: false, why: 'scope is 1–32 verbs' };
    const high = o.scope.filter((v) => HIGH.includes(v));
    if (high.length) return { ok: false, why: 'a standing envelope can never carry ' + high.join(', ') + ' — those need the owner’s live approval each time' };
    if (!whole(o.budget)) return { ok: false, why: 'budget is a whole number of wallet units' };
    if (!whole(o.notBefore) || !whole(o.notAfter) || o.notAfter <= o.notBefore) return { ok: false, why: 'the window opens before it expires' };
    if (o.hours !== null && o.hours !== undefined && !(Array.isArray(o.hours) && o.hours.length === 2 && o.hours.every((h) => Number.isInteger(h) && h >= 0 && h <= 24) && o.hours[0] < o.hours[1])) return { ok: false, why: 'hours is [from, to) in 0–24, or absent' };
    if (typeof o.nonce !== 'string' || o.nonce.length < 8 || o.nonce.length > 64) return { ok: false, why: 'a nonce of 8–64 characters names the envelope' };
    const body = { kind: 'bes-envelope', v: 1, issuer: o.issuer, holder: o.holder, scope: [...new Set(o.scope)].sort(), budget: o.budget, notBefore: o.notBefore, notAfter: o.notAfter, hours: o.hours ? [o.hours[0], o.hours[1]] : null, nonce: o.nonce };
    return { ok: true, body };
  } catch { return { ok: false, why: 'not an envelope' }; }
}

/** Does Simon's own wallet hold what the envelope grants? (attenuation: a delegate can never out-reach its parent) */
export function withinWallet(body, parentWallet) {
  try { return attenuates(parentWallet, { caps: body.scope, budget: body.budget }); } catch { return { ok: false, why: 'not a wallet' }; }
}

/** The exact string a signature covers: the domain, then the body in canonical key order. */
export const materialOf = (body) => ENVELOPE_DOMAIN + canonical(body);
export const approvalMaterialOf = (body) => APPROVAL_DOMAIN + canonical(body);

/**
 * Is there a usable approval from Simon for this exact item? approvals = [{ body: { kind:'bes-approval', itemId,
 * textSha256, by, at, expires, rehearsal?, withdrawn? }, sigOk }]. → { ok, live, why }.
 */
export function approvalFor(itemId, textSha256, approvals, ctx) {
  try {
    const c = isObj(ctx) ? ctx : {};
    const list = (Array.isArray(approvals) ? approvals : []).filter((a) => isObj(a) && a.sigOk === true && isObj(a.body) && a.body.kind === 'bes-approval' && a.body.by === c.simon && a.body.itemId === itemId);
    if (list.some((a) => a.body.withdrawn === true)) return { ok: false, live: false, why: 'the owner withdrew the approval' };
    const exact = list.filter((a) => a.body.textSha256 === textSha256);
    if (exact.length === 0) return { ok: false, live: false, why: list.length ? 'the words changed after they were approved' : 'waiting for the owner’s approval' };
    const fresh = exact.filter((a) => whole(a.body.expires) && whole(c.now) && c.now < a.body.expires);
    if (fresh.length === 0) return { ok: false, live: false, why: 'the approval has expired' };
    const live = fresh.find((a) => a.body.rehearsal !== true);
    if (live) return { ok: true, live: true, why: 'approved by the owner for these exact words' };
    return { ok: true, live: false, why: 'a rehearsal approval: dry run only' };
  } catch { return { ok: false, live: false, why: 'the approvals could not be read' }; }
}

const hourOf = (t) => new Date(t).getUTCHours();

/**
 * May the holder do this action under this envelope? action = { verb, t, cost }.
 * ctx = { simon (pinned issuer key), holder (the acting key), sigOk, spent (units already spent under this envelope),
 *         revoked (nonces), approval (approvalFor's result for a high-stakes action) }.
 * → { ok, stage, why } — `stage` names the first check that failed, or 'admitted'.
 */
export function admits(envelope, action, ctx) {
  try {
    const c = isObj(ctx) ? ctx : {};
    const env = isObj(envelope) ? envelope : {};
    const b = envelopeBody(env.body);
    if (!b.ok || canonical(b.body) !== canonical(env.body)) return no('shape', b.ok ? 'the envelope is not in its one canonical form' : b.why);
    const body = b.body;
    const a = isObj(action) ? action : {};
    if (typeof a.verb !== 'string' || !VERB.test(a.verb) || !whole(a.t) || !whole(a.cost)) return no('shape', 'the action needs a verb, a time and a whole cost');
    if (body.issuer !== c.simon) return no('issuer', 'the envelope was not issued by the owner’s key');
    if (body.holder !== c.holder) return no('holder', 'the envelope belongs to another key');
    if (c.sigOk !== true) return no('signature', 'the envelope’s signature does not verify — forged or changed after signing');
    const high = HIGH.includes(a.verb);
    if (high && !(isObj(c.approval) && c.approval.ok === true && c.approval.live === true)) return no('high-stakes', a.verb + ' is high-stakes: never in a standing envelope — ' + (isObj(c.approval) && c.approval.why ? c.approval.why : 'it needs the owner’s live approval'));
    if (!high && !body.scope.includes(a.verb)) return no('scope', a.verb + ' is not in the envelope’s scope');
    if (a.t < body.notBefore) return no('window', 'the envelope’s window has not opened');
    if (body.hours && (hourOf(a.t) < body.hours[0] || hourOf(a.t) >= body.hours[1])) return no('window', 'outside the envelope’s daily hours');
    if (a.t >= body.notAfter) return no('expiry', 'the envelope has expired');
    if (Array.isArray(c.revoked) && c.revoked.includes(body.nonce)) return no('revoked', 'the owner revoked this envelope');
    const spent = whole(c.spent) ? c.spent : 0;
    const wallet = { caps: high ? body.scope.concat([a.verb]) : body.scope, budget: { total: body.budget, spent } };
    const can = canDo(wallet, { type: a.verb, cost: a.cost });
    if (!can.ok) return no('budget', can.why);
    return { ok: true, stage: 'admitted', why: high ? 'inside the envelope, on the owner’s live approval' : 'inside the envelope' };
  } catch { return no('shape', 'the envelope could not be read'); }
}
