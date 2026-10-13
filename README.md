# BES INWARD

### ▶ Live: **https://sjgant80-hub.github.io/bes-inward/**

A system that watches **its own operator**. The question isn't *"who are you?"* — it's **"are you behaving
like yourself?"** It learns the operator's behavioural signature, then catches a hijacked or scripted run
by **how it behaves**, with no credential changing hands.

> **Identity is insufficient; behaviour is authoritative.** — the heart of Gary W. Floyd's Behavioral
> Entropy Signatures (BES). This build turns it **inward**: the operator being watched is the running body
> itself, so a prompt-injected or hijacked run is caught by its behaviour, not by any token it carries.

## How it works

A window of actions has a **signature**: the *mix* of what was done (op distribution, in permille) and the
*rhythm* of how it was done (how variable the gaps between actions are). Gary's finding, kept exactly — an
impostor fails one of two ways:

- **too regular** → scripted automation runs like clockwork (near-zero rhythm variability), or
- **randomly uncorrelated** → a hijack does a different mix of actions (far from the operator's baseline).

So the gate is two-sided: too regular → flag; too far from the baseline → flag; otherwise allow. It's
**one-class** — it models the operator, never the attacker — so a hijack it has never seen still flags. And
the baseline is the **+1**, the still centre: it only folds in windows it already *allowed*, so an impostor
cannot drift it toward itself (negative selection). Integer-only and deterministic.

## Run it

```bash
node run.mjs    # learn the operator's baseline, then watch his own behaviour pass and an impostor flag
```

In the estate it watches Kar's own nightly action ledger (`actionsFromLedger`) — the running body watching
itself.

## Proof it holds (all re-runnable; CI runs them)

- **`node attack-kit/redteam.mjs --check`** — 6 cases, byte-identical receipt: the operator's own varied
  behaviour passes (low false positive); a scripted run is flagged *too regular*; a hijack is flagged
  *unlike the operator*; the baseline **cannot be poisoned** by impostor windows; it *calibrates* while
  still learning; and a malformed signature **fails closed**.
- **`node witness-all.mjs`** — mutation + fuzz gate over `bes.mjs`: **CLEAN, 46/49 killed**, 3
  reviewed-equivalent (each with a written reason). The fuzz first caught three real total-ness gaps
  (toxic-getter events) before the gate ran; fixed, then gated on a green baseline.
- **`node --test test/*.test.mjs`** — unit + hostile-input (never-throw) suites.

## The fourth pillar

Gary's BES paper names four security pillars. This completes the estate's set:

- **[break-it](https://github.com/sjgant80-hub/break-it)** — authentication (is the message real)
- **[perimeter-post](https://github.com/sjgant80-hub/perimeter-post)** — authorization (may this agent act)
- **bes-inward** — **behaviour** (is it behaving like itself)
- the hash-chained ledgers — audit (what happened)

MIT licensed; see [`NOTICE`](NOTICE) for credits — BES is Gary W. Floyd (Lumiea / ThunderStruck); Konomi /
Thomas Frumkin.
