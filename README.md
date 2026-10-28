# BES — the behaviour layer

### ▶ Live: **https://sjgant80-hub.github.io/bes-inward/**

**A stolen key still works. Its thief's behaviour doesn't.** The BES layer checks every action that arrives with a
valid signature against how the holder of that key really behaves. It learns the owner's own behaviour and his AI
agent's own behaviour — each from itself, on the device — and steps up or blocks a valid key in the wrong hands.
For the agent, a third part: it may act only inside a **delegation envelope** the owner signed, and money, deals,
public claims and reserved switches are never in a standing envelope.

It is layer 3 of four: **verify-before-parse → the LIGHT barrier → BES → the immune system and tarpit.** An action
proceeds only if every layer agrees. Credential validity never overrides a behaviour violation.

The live page runs the real kernels in your tab on **synthetic** behaviour only, explains itself (start here, how it
works traced from your run, the blueprint, adoption, the brochure, the white paper) and reads every result from the
committed receipts.

## The method — credited

- **Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — "GEP-Based Security: Behavioral
  Entropy Signatures for Cybersecurity and DevOps," 2025** (open defensive prior art, CC BY 4.0): the three entropy
  domains H_net · H_beh · H_auth, S in nats, E(t) = σ(k(|S − S_b| − ε)), A(t), β|∇S|, ΔS, the five verdicts, and the
  key finding — attackers fail by being overly regular or randomly variant.
- **Gary W. Floyd, Lumiea Systems Research Division — ThunderStruck Service LLC — "Bayesian Entropy Similarity (BES):
  Alignment Salience for Entropy-Regulated AI Systems," Technical Report, December 2025** (MIT, defensive prior art):
  A_t = exp(−D_KL(O‖B) − k·ΔS) and the decision matrix; "agent alignment ≠ operator alignment — track both separately."

Every place the papers are silent, and what this build chose there, is listed in the kernel headers and on the page
(white paper §3). The layer, its choices, its kernels and its measurements are the estate's.
Powered by the Konomi architecture, created by Thomas Frumkin.

## What is proven, and how to re-run it

| proof | command | what it checks |
|---|---|---|
| sealed claims | [`measure/claims.json`](measure/claims.json) @ `65a6364` | B1–B7 + the predicted limit L1, committed before any measuring code |
| frozen numbers | [`params.json`](params.json) | chosen by `tools/tune.mjs` on data before 7 Oct 2026 only (rule in the seal) |
| real measurement | `node measure/measure.mjs --real` (local) | the owner's and agent's real behaviour 7–28 Oct → [`receipts/real.json`](receipts/real.json): counts and rates only, plus each private input's SHA-256 |
| synthetic mirror | `node measure/measure.mjs --synthetic --check` (CI) | the same claims on seeded synthetic streams, reproduced byte for byte |
| mutation gate | `node witness-all.mjs` (CI, one job per kernel) | every operator flipped; no unreviewed survivor; nothing capped |
| vendored kernels | `node tools/vendor.mjs --check` (CI) | LIGHT, the wallet and identity (fall-kit), immune + rebound (break-it) byte-identical to their pins |
| suites | `node --test test/*.test.mjs` | unit + a hostile-input battery: no kernel throws on junk |

Failures are kept: a claim that failed stays failed in the receipt and on the page.

## Privacy

Real behavioural streams and baselines live only under `~/.si-didy/bes/private/` on the owner's machine, LIGHT-coded
(`src/store.mjs`). `tools/extract.mjs` reads the text of the owner's turns only to compute a structural class and a
word count, and never stores it. Nothing private is in this repository, its CI, or the page.

## Layout

`src/` kernels (entropy, gep, watch, trust, envelope, recovery, stack, store, drivers, cost, synth; v1 `bes.mjs`,
`stream.mjs`) · `measure/` claims, harness, judge, measurement · `tools/` vendor, extract, tune (local) · `vendor/`
pinned kernels · `page/` + `index.html` the live page · `receipts/`.

MIT. Supplier: [AI Native Solutions](https://www.ai-nativesolutions.com). See [`NOTICE`](NOTICE).
