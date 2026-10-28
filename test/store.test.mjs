import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAGIC, pack, unpack } from '../src/store.mjs';

test('pack → unpack round-trips a JSON value in LIGHT', () => {
  const v = { id: 'simon', xs: [1, 2, 3], s: 'αβγ', nested: { a: null } };
  const p = pack(v);
  assert.equal(p.ok, true);
  assert.deepEqual([...p.bytes.slice(0, 4)], [...MAGIC]);
  assert.deepEqual(unpack(p.bytes), { ok: true, value: v });
  assert.deepEqual(unpack(pack([]).bytes).value, []);
});

test('a changed store is refused, never read as something else', () => {
  const p = pack({ a: 'hello world, hello world' }).bytes;
  const flip = p.slice(); flip[flip.length - 1] ^= 1;
  assert.equal(unpack(flip).ok, false);
  const body = p.slice(); body[9] ^= 0x40;
  assert.equal(unpack(body).ok, false);
  const len = p.slice(); len[7] ^= 1;
  assert.equal(unpack(len).ok, false);
  const magic = p.slice(); magic[0] = 0;
  assert.equal(unpack(magic).why, 'not a BES store');
  assert.equal(unpack(p.slice(0, 39)).why, 'not a BES store');
  assert.equal(unpack('x').ok, false);
  assert.equal(unpack(null).ok, false);
});

test('pack refuses what is not JSON', () => {
  assert.equal(pack(undefined).ok, false);
  const c = {}; c.self = c;
  assert.equal(pack(c).ok, false);
  assert.equal(pack(() => 1).ok, false);
});

test('witness: exactly 40 bytes with the magic is read as a store (and refused for its body), not as a stranger', () => {
  const b = new Uint8Array(40); b.set(MAGIC, 0);
  assert.equal(unpack(b).ok, false);
  assert.notEqual(unpack(b).why, 'not a BES store');
  assert.equal(unpack(b.slice(0, 39)).why, 'not a BES store');
});
