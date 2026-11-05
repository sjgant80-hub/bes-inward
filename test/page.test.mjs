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

test('no money figure or statistic is typed into the page: they are rendered from the sourced files', () => {
  assert.doesNotMatch(html, /(US\$|\$|£|€)\s?\d/);
  const brochure = html.slice(html.indexOf('<section id="brochure">'), html.indexOf('<section id="paper">'));
  assert.ok(brochure.length > 1000);
  assert.doesNotMatch(brochure.replace(/<[^>]+>/g, ' '), /\d\s?%/);
  assert.doesNotMatch(text, /per[- ]seat/i);
  for (const id of ['p-p2', 'p-wl', 'p-why', 'b-breach', 'c-src', 'c-lines']) assert.ok(ids.includes(id), '#' + id + ' is filled from the sources');
});

test('every sourced figure the page renders has a primary source and the date it was read', () => {
  const c = JSON.parse(readFileSync(new URL('../costs/sources.json', import.meta.url), 'utf8'));
  for (const k of Object.keys(c.prices)) {
    const s = c.sources.find((x) => x.key === k);
    assert.ok(s, 'a source for ' + k);
    assert.match(s.url, /^https:\/\//);
    assert.match(s.read, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(s.what.length > 20 && s.quote.length > 5, k);
  }
  assert.equal(c.basis, 'vendor/sovereign-enterprise/basis.json');
  assert.match(app, /vendor\/sovereign-enterprise\/basis\.json/);
});

test('every input of the cost case reaches the kernel and redraws it', () => {
  const call = app.slice(app.indexOf('const r = costCase('), app.indexOf('if (!r.ok) { blank()'));
  const ins = [...html.slice(html.indexOf('<h3 id="cost">'), html.indexOf('<h3 id="compare">')).matchAll(/<input id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ins, ['c-people', 'c-agents', 'c-actions', 'c-sp', 'c-sa', 'c-min', 'c-setup', 'c-upkeep', 'c-years']);
  for (const id of ins) assert.ok(call.includes("field('" + id + "')"), id + ' reaches costCase');
  const redraw = app.match(/for \(const k of (\[[^\]]+\])\) \$\(k\)\.addEventListener\('input', drawCost\)/);
  assert.ok(redraw, 'the inputs redraw the case');
  assert.deepEqual(JSON.parse(redraw[1].replace(/'/g, '"')), ins);
  assert.match(text, /set-up hours are yours/);
  assert.match(text, /upkeep hours are yours/);
  assert.match(app, /upkeep ' \+ pounds\(L\.upkeep\)/);
});

test('the buyer’s operating questions are answered on the page: alerts, updates, certification', () => {
  for (const q of ['Where do its alerts go?', 'How do updates reach it?']) assert.ok(html.includes('<summary>' + q + '</summary>'), q);
  assert.match(text, /No certification report/);
});

test('the supplier, the terms and the exit are on the page', () => {
  assert.match(text, /contact them through that site/);
  assert.match(text, /Support, service levels, warranty and liability\s+are agreed per deployment/);
  assert.match(text, /keeps running without us/);
  assert.match(text, /Exit:/);
});

test('the tarpit is shown for real: the flood runs the vendored rebound ladder and pays its work, nothing typed', () => {
  assert.ok(ids.includes('p-flood') && ids.includes('pkt-ladder') && ids.includes('pktsum'));
  assert.match(app, /\$\('p-flood'\)\.addEventListener\('click'/);
  assert.match(app, /difficultyFor\(/);
  assert.match(app, /REBOUND_LADDER\.BLOCK/);
  assert.match(app, /solve\(owes\.out\.challenge, owes\.out\.owed, sha256hex\)/);
  const demo = html.slice(html.indexOf('<section id="demo">'), html.indexOf('<section id="how">')).replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(demo, /\d+\s+bits|refused \d+ times/);
});

test('what the watch keeps is stated from the frozen params, not typed', () => {
  assert.ok(ids.includes('sec-bounded'));
  assert.match(app, /const PW = paramsOf\(P\)/);
  assert.match(app, /PW\.W/);
  assert.match(app, /PW\.maxQuar/);
  assert.match(app, /PW\.maxCal/);
});

test('no inline style attribute: the CSP (style-src self) would block it', () => {
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(app, /setAttribute\('style'/);
});
