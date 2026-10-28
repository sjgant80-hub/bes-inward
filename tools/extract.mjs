#!/usr/bin/env node
// tools/extract.mjs — LOCAL ONLY. Turns this machine's real records into the three behaviour streams the claims name
// (measure/claims.json "data"), LIGHT-coded under ~/.si-didy/bes/private/. Nothing it writes may enter a repo.
//
//   simon        Simon's human turns in Claude Code (origin.kind 'human'; not meta, not tool results, not scheduled
//                tasks, not messages another session sent). The text is read ONLY to compute a structural class and a
//                word count; it is never stored.
//   kar-session  Kar's tool calls in Claude Code (assistant tool_use blocks, main sessions and sub-agents)
//   kar-night    Kar's nightly loop: kar-experiments.json, the LIGHT call book calls.lcb, kar-rsi-honesty.jsonl,
//                signals-delivered.json
//
//   node tools/extract.mjs            write the streams + private/manifest.json (counts per split, sha256 per stream)
import { createReadStream, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
import { pack } from '../src/store.mjs';

const HOME = 'C:/Users/sjgan';
const OUT = HOME + '/.si-didy/bes/private';
const CLAIMS = JSON.parse(readFileSync(new URL('../measure/claims.json', import.meta.url), 'utf8'));
const CUTOFF = Date.parse(CLAIMS.data.cutoff.slice(0, 20));
const DEV_END = Date.parse('2026-10-07T00:00:00Z');
const DAY = 86400000;

function jsonlFiles(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) jsonlFiles(p, out); else if (n.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x && x.type === 'text' && typeof x.text === 'string').map((x) => x.text).join('\n') : '');
const stripReminders = (s) => s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
function classOf(s) {
  if (s.includes('<pasted_content')) return 'paste';
  if (s.startsWith('/') || s.startsWith('<command-name>')) return 'command';
  const words = s.split(/\s+/).filter(Boolean).length;
  if (s.endsWith('?')) return 'question';
  return words <= 8 ? 'short' : 'instruction';
}
const wordsOf = (s) => s.replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content>/g, (m) => m).split(/\s+/).filter(Boolean).length;
const SRC = { 'claude-desktop': 'desktop', cli: 'cli', 'sdk-cli': 'sdk' };
const projectOf = (cwd) => {
  const p = String(cwd || '').replace(/\\/g, '/').toLowerCase();
  const m = p.match(/\/users\/sjgan\/([^/]+)/);
  if (!m) return p.startsWith('c:/tmp') ? 'tmp' : 'other';
  return m[1] === '.claude' ? (p.includes('/memory') ? 'memory' : 'claude') : m[1].replace(/^\./, '');
};

const PROGRAMS = new Set(['node', 'git', 'gh', 'ls', 'cat', 'grep', 'curl', 'npm', 'npx', 'python', 'python3', 'sed', 'head', 'tail', 'find', 'mkdir', 'cp', 'mv', 'rm', 'echo', 'for', 'wc', 'diff', 'date', 'printf', 'md5sum', 'sha256sum', 'pdftotext', 'ollama', 'du', 'sort', 'awk', 'tar', 'unzip', 'which', 'test', 'touch', 'kill', 'ps', 'tasklist', 'taskkill', 'schtasks', 'powershell']);
function programOf(cmd) {
  const segs = String(cmd || '').split(/&&|;|\|\||\n/).map((x) => x.trim()).filter(Boolean);
  for (const s of segs) {
    const w = s.replace(/^\(+/, '').split(/\s+/)[0] || '';
    if (/^cd$/i.test(w) || /^[A-Z_]+=/.test(w)) continue;
    const b = basename(w.replace(/^["']|["']$/g, '')).toLowerCase().replace(/\.exe$/, '');
    if (/^(get|set|new|remove|select|where|foreach|start|stop|test|invoke|out|write)-/i.test(w)) return 'ps';
    return PROGRAMS.has(b) ? b : 'other';
  }
  return 'other';
}
const LOCAL = /11434|ollama|local_model|local_complete|qwen/i;
function karShape(name, input, cwd, side) {
  const inp = input && typeof input === 'object' ? input : {};
  const blob = JSON.stringify(inp) || '';
  let kind, tier = 'code', priv = 'read';
  if (name === 'Bash' || name === 'PowerShell') {
    kind = 'sh:' + programOf(inp.command);
    if (LOCAL.test(String(inp.command))) tier = 'local';
    if (/git\s+push|gh\s+api\s+-X\s+(POST|PUT|PATCH|DELETE)|gh\s+(pr|repo|release)\s+create|gh\s+pr\s+merge/.test(String(inp.command))) priv = 'outward';
    else if (/git\s+commit|\brm\s|\bmv\s|writeFileSync|>\s*\S/.test(String(inp.command))) priv = 'write';
  } else if (['Edit', 'Write', 'NotebookEdit'].includes(name)) { kind = name.toLowerCase(); priv = 'write'; }
  else if (['Read', 'Grep', 'Glob'].includes(name)) kind = name.toLowerCase();
  else if (/^mcp__Claude_Browser__|^mcp__claude-in-chrome__/.test(name)) { kind = 'browser'; if (/computer|form_input|navigate/.test(name)) priv = 'act'; }
  else if (/local_model|local_complete/.test(name)) { kind = 'local-model'; tier = 'local'; }
  else if (name === 'Agent' || name === 'Task' || name === 'Workflow') { kind = 'agent'; tier = 'frontier'; }
  else if (name === 'WebSearch' || name === 'WebFetch') kind = 'web';
  else if (name === 'SendMessage') { kind = 'message'; priv = 'outward'; }
  else if (name === 'Artifact') { kind = 'artifact'; priv = 'outward'; }
  else if (name.startsWith('mcp__')) kind = 'mcp:' + name.split('__')[1].slice(0, 20);
  else kind = 'tool:' + name.slice(0, 20).toLowerCase();
  const m = blob.replace(/\\\\/g, '/').toLowerCase().match(/(?:c:|\/c)\/users\/sjgan\/([a-z0-9._-]+)/);
  const loc = m ? (m[1] === '.claude' ? 'claude' : m[1].replace(/^\./, '')) : projectOf(cwd);
  return { src: side ? 'sub' : 'main', kind, loc, size: blob.length, tier, priv };
}

async function transcripts() {
  const simon = [], kar = [];
  const seenU = new Set(), seenT = new Set();
  const files = jsonlFiles(HOME + '/.claude/projects');
  for (const f of files) {
    let mode = 'default', lastHumanMode = null;
    const rl = createInterface({ input: createReadStream(f, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line || line[0] !== '{') continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      const t = Date.parse(r.timestamp);
      if (r.type === 'permission-mode' && typeof r.permissionMode === 'string') mode = r.permissionMode;
      if (!Number.isFinite(t) || t >= CUTOFF) continue;
      if (r.type === 'user') {
        if (typeof r.permissionMode === 'string') mode = r.permissionMode;
        if (r.isMeta || !r.origin || r.origin.kind !== 'human' || r.isSidechain) continue;
        const c = r.message && r.message.content;
        if (Array.isArray(c) && c.some((x) => x && x.type === 'tool_result')) continue;
        const s = stripReminders(textOf(c));
        if (!s || s.startsWith('<scheduled-task') || s.startsWith('<task-notification') || /^(Background|Task) \(from the session/.test(s)) continue;
        if (seenU.has(r.uuid)) continue;
        seenU.add(r.uuid);
        // privilege-elevation timing (Gary's H_auth): a turn is "elevated" only when the mode was RAISED to bypass on it;
        // the mode itself is the tier, and its changes are the permission-boundary transitions
        const raised = mode === 'bypassPermissions' && lastHumanMode !== 'bypassPermissions';
        lastHumanMode = mode;
        simon.push({ t, src: SRC[r.entrypoint] || 'other', kind: classOf(s), loc: projectOf(r.cwd), size: wordsOf(s), tier: mode, priv: raised ? 'elevated' : 'normal' });
      } else if (r.type === 'assistant') {
        const c = r.message && r.message.content;
        if (!Array.isArray(c)) continue;
        for (const x of c) {
          if (!x || x.type !== 'tool_use' || typeof x.name !== 'string') continue;
          const id = x.id || r.uuid + ':' + x.name;
          if (seenT.has(id)) continue;
          seenT.add(id);
          kar.push({ t, ...karShape(x.name, x.input, r.cwd, r.isSidechain === true) });
        }
      }
    }
  }
  return { simon, kar, files: files.length };
}

async function nightly() {
  const out = [];
  const B = HOME + '/.si-didy/brain/';
  const exp = JSON.parse(readFileSync(B + 'kar-experiments.json', 'utf8'));
  for (const e of exp.entries || []) out.push({ t: Date.parse(e.at), src: 'kar-loop', kind: String(e.kind), loc: 'brain', size: String(e.note || '').length, tier: /claude/i.test(String(e.model)) ? 'frontier' : 'local', priv: e.kind === 'dream-idea' ? 'spend' : 'read' });
  const { readBook } = await import('file:///' + HOME + '/kar-mind/callbook.mjs');
  const book = readBook(new Uint8Array(readFileSync(B + 'calls.lcb')));
  for (const c of book.ok ? book.records : []) out.push({ t: Date.parse(c.at), src: 'callbook', kind: 'cortex-call', loc: 'controller', size: String(c.prompt).length, tier: c.tier, priv: 'spend' });
  for (const l of readFileSync(HOME + '/rsi-honesty-pilot/kar-rsi-honesty.jsonl', 'utf8').split('\n')) {
    let r; try { r = JSON.parse(l); } catch { continue; }
    out.push({ t: Date.parse(r.at), src: 'rsi', kind: 'rsi-eval', loc: 'rsi', size: l.length, tier: 'local', priv: 'read' });
  }
  const sig = JSON.parse(readFileSync(HOME + '/.si-didy/signals-delivered.json', 'utf8'));
  for (const s of Array.isArray(sig) ? sig : sig.items || sig.entries || []) out.push({ t: Date.parse(s.deliveredAt || s.at), src: 'surface', kind: 'signal', loc: 'morning', size: String(s.say || '').length, tier: 'code', priv: 'write' });
  return out.filter((e) => Number.isFinite(e.t) && e.t < CUTOFF);
}

const order = (xs) => xs.filter((e) => Number.isSafeInteger(e.t)).sort((a, b) => a.t - b.t || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
function splits(xs) {
  if (xs.length === 0) return { n: 0 };
  const first = xs[0].t, formEnd = first + 14 * DAY, testStart = Math.max(DEV_END, formEnd);
  return { n: xs.length, first: new Date(first).toISOString(), formationEnd: new Date(formEnd).toISOString(), testStart: new Date(testStart).toISOString(),
    formation: xs.filter((e) => e.t < formEnd).length, dev: xs.filter((e) => e.t >= formEnd && e.t < testStart).length, test: xs.filter((e) => e.t >= testStart).length };
}

const t0 = Date.now();
const tr = await transcripts();
const streams = { simon: order(tr.simon), 'kar-session': order(tr.kar), 'kar-night': order(await nightly()) };
mkdirSync(OUT, { recursive: true });
const manifest = { kind: 'bes-layer.private-manifest', v: 1, cutoff: new Date(CUTOFF).toISOString(), devEnd: new Date(DEV_END).toISOString(), transcripts: tr.files, streams: {} };
for (const [name, xs] of Object.entries(streams)) {
  const p = pack(xs);
  if (!p.ok) throw new Error(name + ': ' + p.why);
  writeFileSync(join(OUT, name + '.light'), p.bytes);
  manifest.streams[name] = { ...splits(xs), sha256: createHash('sha256').update(p.bytes).digest('hex'), bytes: p.bytes.length };
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
for (const [k, v] of Object.entries(manifest.streams)) console.log(k.padEnd(12), JSON.stringify({ n: v.n, formation: v.formation, dev: v.dev, test: v.test, first: v.first.slice(0, 10), testStart: v.testStart.slice(0, 10) }));
console.log('extracted in ' + Math.round((Date.now() - t0) / 1000) + ' s from ' + tr.files + ' transcript files → ' + OUT);
