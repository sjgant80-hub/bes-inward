// ════════════════════════════════════════════════════════════════
// synth.mjs — SYNTHETIC behaviour, for CI and the live page only. Seeded and deterministic. Never real data: the
// real baselines stay on the device (see measure/claims.json "privacy").
//
//   human({ seed, start, days })   a person with STRUCTURED irregularity: active most days but not all, sessions at
//                                  a few favourite times of day (and some late nights), bursty messages, a handful of
//                                  projects, mostly one client, the permission mode chosen per session
//   night({ seed, start, days })   an agent's nightly loop: a fixed step order at a scheduled hour, delayed some nights
//                                  (the machine was asleep), a probe on the local model, an idea on the frontier, an
//                                  evaluation at 03:00, a delivery in the morning
//   session({ seed, start, days }) an agent's working sessions: fast tool calls, a few repos, mostly code tier
// ════════════════════════════════════════════════════════════════
import { rng } from './drivers.mjs';

const H = 3600000, M = 60000, DAY = 86400000;
function pick(r, weights) {
  const total = weights.reduce((s, w) => s + w[1], 0);
  let x = r() * total;
  for (const [v, w] of weights) { x -= w; if (x < 0) return v; }
  return weights[weights.length - 1][0];
}
function gauss(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const logn = (r, median, sigma) => median * Math.exp(sigma * gauss(r));
const zipf = (names) => names.map((n, i) => [n, 1 / (i + 1)]);

export function human(o) {
  const { seed = 7, start = Date.UTC(2026, 6, 20), days = 70 } = o || {};
  const r = rng(seed), out = [];
  const projects = zipf(['estate', 'page', 'kernel', 'notes', 'client']);
  const kinds = [['instruction', 45], ['short', 22], ['question', 15], ['paste', 10], ['command', 8]];
  const words = { instruction: 40, short: 6, question: 18, paste: 600, command: 2 };
  for (let day = 0; day < days; day++) {
    const d0 = start + day * DAY, wd = new Date(d0).getUTCDay();
    if (r() > (wd === 0 || wd === 6 ? 0.6 : 0.85)) continue;
    const sessions = 1 + (r() < 0.5 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
    let floor = d0;
    for (let s = 0; s < sessions; s++) {
      const band = pick(r, [[[8, 3], 35], [[13, 4], 20], [[19, 4], 35], [[24, 2], 10]]);
      let t = Math.max(floor, d0 + Math.floor((band[0] + r() * band[1]) * H));
      const project = pick(r, projects), src = r() < 0.95 ? 'desktop' : 'cli';
      const tier = pick(r, [['default', 60], ['acceptEdits', 15], ['bypassPermissions', 25]]);
      const n = 2 + Math.floor(-Math.log(Math.max(r(), 1e-9)) * 10);
      for (let i = 0; i < n; i++) {
        const kind = pick(r, kinds);
        out.push({ t, src, kind, loc: r() < 0.85 ? project : pick(r, projects), size: Math.max(1, Math.round(logn(r, words[kind], 0.7))), tier, priv: tier === 'bypassPermissions' ? 'elevated' : 'normal' });
        t += Math.max(2000, Math.round(logn(r, 75000, 1.1)));
      }
      floor = t + 30 * M;
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export function night(o) {
  const { seed = 11, start = Date.UTC(2026, 6, 20), days = 70 } = o || {};
  const r = rng(seed), out = [];
  for (let day = 0; day < days; day++) {
    const d0 = start + day * DAY;
    let t = d0 + 45 * M + Math.floor(r() * 4 * M);
    if (r() < 0.15) t = d0 + 2 * H + Math.floor(r() * 165 * M);
    out.push({ t, src: 'kar-loop', kind: 'recall-probe', loc: 'brain', size: Math.round(logn(r, 1500, 0.1)), tier: 'local', priv: 'read' });
    if (r() < 0.9) {
      t += 2 * M + Math.floor(r() * 8 * M);
      out.push({ t, src: 'kar-loop', kind: 'dream-idea', loc: 'dream', size: Math.round(logn(r, 1900, 0.05)), tier: 'frontier', priv: 'spend' });
      out.push({ t: t + 1000 + Math.floor(r() * 3000), src: 'callbook', kind: 'cortex-call', loc: 'controller', size: Math.round(logn(r, 3000, 0.05)), tier: 'frontier', priv: 'spend' });
    }
    if (r() < 0.85) out.push({ t: Math.max(t + M, d0 + 3 * H + Math.floor(r() * 2 * M)), src: 'rsi', kind: 'rsi-eval', loc: 'rsi', size: Math.round(logn(r, 400, 0.2)), tier: 'local', priv: 'read' });
    if (r() < 0.7) out.push({ t: d0 + 8 * H + 15 * M + Math.floor((r() - 0.5) * 10 * M), src: 'surface', kind: 'signal', loc: 'morning', size: Math.round(logn(r, 300, 0.4)), tier: 'code', priv: 'write' });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function session(o) {
  const { seed = 13, start = Date.UTC(2026, 6, 20), days = 70 } = o || {};
  const r = rng(seed), out = [];
  const repos = zipf(['estate', 'kernel', 'page', 'brain', 'gate', 'notes', 'client', 'tools']);
  const tools = [['bash:node', 30], ['bash:git', 12], ['edit', 15], ['write', 10], ['read', 7], ['browser', 10], ['grep', 3], ['bash:other', 10], ['local-model', 3]];
  for (let day = 0; day < days; day++) {
    const d0 = start + day * DAY;
    if (r() > 0.8) continue;
    const sessions = 1 + Math.floor(r() * 3);
    let floor = d0;
    for (let s = 0; s < sessions; s++) {
      let t = Math.max(floor, d0 + Math.floor((8 + r() * 15) * H));
      let repo = pick(r, repos);
      const n = 20 + Math.floor(r() * 180);
      for (let i = 0; i < n; i++) {
        if (r() > 0.9) repo = pick(r, repos);
        const kind = pick(r, tools);
        const priv = kind === 'edit' || kind === 'write' ? 'write' : kind === 'bash:git' && r() < 0.15 ? 'outward' : 'read';
        out.push({ t, src: 'main', kind, loc: repo, size: Math.max(1, Math.round(logn(r, 300, 1.0))), tier: kind === 'local-model' ? 'local' : 'code', priv });
        t += Math.max(500, Math.round(logn(r, 6000, 1.3)));
      }
      floor = t + 40 * M;
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
