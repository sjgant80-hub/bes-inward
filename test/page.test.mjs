// page.test.mjs — the live page is gated too: it parses, everything it touches exists, it explains itself, it credits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../page/app.mjs', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');

test('the page script parses', () => {
  const r = spawnSync(process.execPath, ['--check', 'page/app.mjs'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('every element the script reaches for exists, once', () => {
  const used = [...new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))];
  for (const id of used) assert.ok(ids.includes(id), 'missing #' + id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  assert.deepEqual(dup, []);
});

test('every name the script imports is exported by its module', async () => {
  for (const m of app.matchAll(/import \{([^}]+)\} from '\.\.\/([^']+)'/g)) {
    const mod = await import(new URL('../' + m[2], import.meta.url));
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) assert.ok(name in mod, m[2] + ' lacks ' + name);
  }
});

test('the page explains itself and carries the brochure', () => {
  for (const s of ['start', 'demo', 'how', 'results', 'blueprint', 'adoption', 'brochure', 'roles', 'cost', 'compare', 'security', 'support', 'risks', 'board', 'paper', 'faq']) assert.ok(ids.includes(s), 'section #' + s);
  for (const role of ['CEO', 'CFO', 'COO', 'CTO / CISO', 'Your team']) assert.ok(html.includes('<h4>' + role + '</h4>'), role);
  assert.match(text, /Start here/);
  assert.match(text, /synthetic/i);
});

test('credits, verbatim; supplier; no private cosmology or reserved terms; no price of our own', () => {
  assert.ok(html.includes('Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — &ldquo;GEP-Based Security: Behavioral Entropy Signatures for Cybersecurity and DevOps,&rdquo; 2025'));
  assert.ok(html.includes('Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — &ldquo;Bayesian Entropy Similarity (BES): Alignment Salience for Entropy-Regulated AI Systems,&rdquo; Technical Report, December 2025'));
  assert.ok(html.includes('Powered by the Konomi architecture, created by Thomas Frumkin.'));
  assert.ok(html.includes('AI Native Solutions'));
  for (const bad of [/\bKCC\b/, /φ/, /κ/, /\bkappa\b/i, /golden ratio/i, /per (seat|node|month) for (BES|this)/i, /\/mo\b/, /priceCurrency/]) assert.doesNotMatch(html + app, bad);
  assert.match(text, /MIT, no licence fee/);
});

test('no inline style attribute: the CSP (style-src self) would block it', () => {
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(app, /setAttribute\('style'/);
});
