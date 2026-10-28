// ════════════════════════════════════════════════════════════════
// store.mjs — a baseline or a private stream, kept in LIGHT on this device. Pure, total, gated; the file glue is the
// caller's. (Simon's privacy rule for BES: behavioural baselines stay local, in LIGHT, and never leave the device.)
//
//   pack(value)   → { ok, bytes }   'BESL', the JSON's length (4 bytes), the JSON coded by the shared foundation's LIGHT
//                                   codec (vendored byte-identical), then the SHA-256 of the JSON
//   unpack(bytes) → { ok, value } | { ok: false, why }   a file whose bytes changed is refused, never read as something else
// ════════════════════════════════════════════════════════════════
import { encode, decode } from '../vendor/fall-kit-core/vendor/light/codec.mjs';
import { sha256 } from '../vendor/fall-kit-core/vendor/light/sha256.mjs';

export const MAGIC = Object.freeze([0x42, 0x45, 0x53, 0x4c]);   // 'BESL'
const te = new TextEncoder(), td = new TextDecoder('utf-8', { fatal: true });
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function pack(value) {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== 'string') return { ok: false, why: 'not a JSON value' };
    const raw = te.encode(json);
    const e = encode(raw);
    if (!e.ok) return { ok: false, why: e.why };
    const out = new Uint8Array(4 + 4 + e.bytes.length + 32);
    out.set(MAGIC, 0);
    new DataView(out.buffer).setUint32(4, raw.length);
    out.set(e.bytes, 8);
    out.set(sha256(raw), 8 + e.bytes.length);
    return { ok: true, bytes: out };
  } catch { return { ok: false, why: 'could not pack' }; }
}

export function unpack(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length < 40 || !MAGIC.every((m, i) => bytes[i] === m)) return { ok: false, why: 'not a BES store' };
    const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4);
    const d = decode(bytes.subarray(8, bytes.length - 32), undefined, { max: n });
    if (!d.ok || d.bytes.length !== n) return { ok: false, why: 'the body does not decode' };
    if (!same(sha256(d.bytes), bytes.subarray(bytes.length - 32))) return { ok: false, why: 'the hash does not match — the store changed' };
    return { ok: true, value: JSON.parse(td.decode(d.bytes)) };
  } catch { return { ok: false, why: 'could not unpack' }; }
}
