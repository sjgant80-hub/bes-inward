#!/usr/bin/env node
// tools/personas.mjs — LOCAL ONLY. The prospective-client walkthrough on the LOCAL model (sovereign-first): buyer
// personas read the live page's text cold and list every confusion, dead end, unanswered objection and unbacked claim.
//
//   node tools/personas.mjs <page-text-file> [model]   → receipts/personas.json (the questions and the model's lists)
import { readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';

const [file, model = 'qwen2.5:7b'] = process.argv.slice(2);
const page = readFileSync(file, 'utf8').replace(/\s+\n/g, '\n').slice(0, 22000);
const PERSONAS = [
  ['CFO of a 40-person software firm', 'whether the cost case is believable, what it costs us in staff time, and what we stop paying for'],
  ['CTO / CISO', 'what exactly is checked, what it does not stop, how a false alarm is handled, and whether the claims are proven'],
  ['COO', 'how it is rolled out without disrupting people, what changes on day one, and how we get unlocked if it blocks us'],
  ['owner-manager who runs an AI agent on his own keys', 'whether I can understand it in one visit, and what my agent can and cannot do'],
  ['procurement and data-protection officer', 'who the supplier is, the licence, support terms, where personal data goes, and GDPR'],
];

// node:http, not fetch: Ollama sends its headers only after it has read the whole prompt, which on a CPU 7B takes longer
// than fetch's fixed five-minute header timeout. No bill and no wall here — it is the local model.
function ask(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, prompt, stream: false, options: { num_ctx: 8192, temperature: 0.2 } });
    const req = request({ host: '127.0.0.1', port: 11434, path: '/api/generate', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let s = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { s += d; });
      res.on('end', () => { try { resolve(String(JSON.parse(s).response || '').trim()); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const out = { kind: 'bes-layer.personas', v: 1, model, pageChars: page.length, walks: [] };
for (const [who, cares] of PERSONAS) {
  // the page comes FIRST and is identical for every persona, so the model reuses what it has already read
  const prompt = 'Here is the full text of a product web page:\n<<<\n' + page + '\n>>>\n\nYou are a ' + who + ' reading this page for the first time. You care about ' + cares + '.\n\nList, as short numbered points, every question this page leaves unanswered for you, every place you were confused, and every claim you could not see backed by a number or a source on the page. Then say in one line whether you would take it to your board, and why. Be concrete; quote the page where you can.';
  const t0 = Date.now();
  const reply = await ask(prompt);
  out.walks.push({ who, cares, secs: Math.round((Date.now() - t0) / 1000), reply });
  console.log('— ' + who + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)\n' + reply + '\n');
  writeFileSync(new URL('../receipts/personas.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
}
