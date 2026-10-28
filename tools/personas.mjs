#!/usr/bin/env node
// tools/personas.mjs — LOCAL ONLY. The prospective-client walkthrough on the LOCAL model (sovereign-first): buyer
// personas read the live page's text cold and list every confusion, dead end, unanswered objection and unbacked claim.
//
//   node tools/personas.mjs <page-text-file> [model]   → receipts/personas.json (the questions and the model's lists)
import { readFileSync, writeFileSync } from 'node:fs';

const [file, model = 'qwen2.5:7b'] = process.argv.slice(2);
const page = readFileSync(file, 'utf8').replace(/\s+\n/g, '\n').slice(0, 14000);
const PERSONAS = [
  ['CFO of a 40-person software firm', 'whether the cost case is believable, what it costs us in staff time, and what we stop paying for'],
  ['CTO / CISO', 'what exactly is checked, what it does not stop, how a false alarm is handled, and whether the claims are proven'],
  ['COO', 'how it is rolled out without disrupting people, what changes on day one, and how we get unlocked if it blocks us'],
  ['owner-manager who runs an AI agent on his own keys', 'whether I can understand it in one visit, and what my agent can and cannot do'],
  ['procurement and data-protection officer', 'who the supplier is, the licence, support terms, where personal data goes, and GDPR'],
];
const ask = async (prompt) => {
  const r = await fetch('http://127.0.0.1:11434/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, prompt, stream: false, options: { num_ctx: 8192, temperature: 0.2 } }), signal: AbortSignal.timeout(900000) });
  const j = await r.json();
  return String(j.response || '').trim();
};
const out = { kind: 'bes-layer.personas', v: 1, model, pageChars: page.length, walks: [] };
for (const [who, cares] of PERSONAS) {
  const prompt = 'You are a ' + who + ' reading a product web page for the first time. You care about ' + cares + '.\n\nHere is the full text of the page:\n<<<\n' + page + '\n>>>\n\nList, as short numbered points, every question this page leaves unanswered for you, every place you were confused, and every claim you could not see backed by a number or a source on the page. Then say in one line whether you would take it to your board, and why. Be concrete; quote the page where you can.';
  const t0 = Date.now();
  const reply = await ask(prompt);
  out.walks.push({ who, cares, secs: Math.round((Date.now() - t0) / 1000), reply });
  console.log('— ' + who + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)\n' + reply + '\n');
}
writeFileSync(new URL('../receipts/personas.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
