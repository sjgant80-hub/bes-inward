#!/usr/bin/env node
// tools/vendor.mjs — copy the kernels the BES layer stands on, byte for byte, from the commit named, and pin them.
//
//   node tools/vendor.mjs          copy every file in PINS from its repo's git objects at its commit → vendor/, write
//                                  vendor/SOURCES.json (repo, commit, path, sha256)
//   node tools/vendor.mjs --check  re-hash every vendored file against SOURCES.json (CI runs this; no git needed)
//
// Never edit a vendored file: re-vendor. The copies come from `git show <commit>:<path>`, never a working tree, so an
// uncommitted change or a witness mutant in the source repo can never ride in.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = 'C:/Users/sjgan';
const FALL_KIT = '9244d6128c7be0094c9d800acac0a9ee70ecdd97';
const BREAK_IT = 'badc6ff158b60b764aae68b3deae18014f4b5480';
const PINS = [
  { repo: 'fall-kit', commit: FALL_KIT, src: 'core/identity.mjs', to: 'fall-kit-core/identity.mjs', what: 'one Ed25519 key in every form the kernels take it (WebCrypto)' },
  { repo: 'fall-kit', commit: FALL_KIT, src: 'core/vendor/light/packet.mjs', to: 'fall-kit-core/vendor/light/packet.mjs', what: 'LIGHT: the signed packet and its verify-before-decode door (layers 1 and 2)' },
  { repo: 'fall-kit', commit: FALL_KIT, src: 'core/vendor/light/codec.mjs', to: 'fall-kit-core/vendor/light/codec.mjs', what: 'LIGHT: the lossless codec the baselines are stored in' },
  { repo: 'fall-kit', commit: FALL_KIT, src: 'core/vendor/light/sha256.mjs', to: 'fall-kit-core/vendor/light/sha256.mjs', what: 'SHA-256, pure' },
  { repo: 'fall-kit', commit: FALL_KIT, src: 'core/vendor/wallet/wallet.mjs', to: 'fall-kit-core/vendor/wallet/wallet.mjs', what: 'the wallet: capability + a budget it cannot cross (the envelope budget)' },
  { repo: 'break-it', commit: BREAK_IT, src: 'src/wire.mjs', to: 'break-it/wire.mjs', what: 'break-it wire constants the immune fingerprint reads' },
  { repo: 'break-it', commit: BREAK_IT, src: 'src/immune.mjs', to: 'break-it/immune.mjs', what: 'the immune system: every refusal becomes memory (layer 4)' },
  { repo: 'break-it', commit: BREAK_IT, src: 'src/rebound.mjs', to: 'break-it/rebound.mjs', what: 'the rebound: proof-of-work owed by a source refused too often — the tarpit (layer 4)' },
];
const sha = (b) => createHash('sha256').update(b).digest('hex');
const SOURCES = join(ROOT, 'vendor', 'SOURCES.json');

if (process.argv.includes('--check')) {
  const s = JSON.parse(readFileSync(SOURCES, 'utf8'));
  let bad = 0;
  for (const f of s.files) {
    const got = sha(readFileSync(join(ROOT, 'vendor', f.path)));
    if (got !== f.sha256) { bad++; console.log('✗ ' + f.path + ' differs from ' + f.repo + '@' + f.commit.slice(0, 7)); }
  }
  console.log(bad ? 'VENDOR CHECK FAILED' : 'VENDOR CHECK CLEAN — ' + s.files.length + ' files byte-identical to their pinned commits');
  process.exit(bad ? 1 : 0);
}

const files = [];
for (const p of PINS) {
  const bytes = execFileSync('git', ['-C', join(HOME, p.repo), 'show', p.commit + ':' + p.src], { maxBuffer: 1 << 28 });
  if (bytes.includes(13)) throw new Error(p.src + ' holds a CR byte — refuse');
  const out = join(ROOT, 'vendor', p.to);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
  files.push({ path: p.to, repo: 'sjgant80-hub/' + p.repo, commit: p.commit, src: p.src, sha256: sha(bytes), what: p.what });
}
writeFileSync(SOURCES, JSON.stringify({ kind: 'bes-inward.vendor', v: 1, note: 'Copied verbatim from git objects at the commit named. Never edit a vendored file; re-vendor.', files }, null, 1) + '\n');
console.log('vendored ' + files.length + ' files');
