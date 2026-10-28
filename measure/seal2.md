# Seal 2 — the numbers frozen, before the claims are measured

Seal 1 (`65a6364`) fixed the claims, splits, drivers, bars and the tuning objective. This commit freezes everything the
measurement depends on — `params.json`, every kernel under `src/`, the harness and the measurement under `measure/` —
**before `measure/measure.mjs --real` has ever run**. Nothing below changes after this commit; a later fix gets new
claims sealed before its code.

## What tuning read

Only events before each stream's test start (7 October 2026), and the synthetic mirror. Every local tool that read a
real stream (`tools/tune.mjs`, and the two dev diagnostics used to find the problems below) drops events at or after
the test start before anything else reads it. The only thing ever printed about the test period is its size per
stream (`tools/extract.mjs`: simon 252, kar-session 24,122, kar-night 74 actions).

## The tuning objective was not reachable — the pre-declared fallback decided

The sealed objective: dev false-positive rate ≤ 0.5% for simon and kar-session, then the most driver sessions caught.
No configuration reached 0.5% on simon (the best grid row was about 4%). The fallback rule was written into
`tools/tune.mjs` before the final grid ran: the smallest LARGER of the two dev FP rates; among rows within 0.1
percentage point of it, the most driver sessions caught; then grid order. `params.json` records which rule chose.

This is itself a finding: on this owner's real behaviour, the B4 bar (≤ 1.0%) is expected to FAIL. It stays sealed
as it was.

## Design changes made during dev tuning, each for a reason found on dev or synthetic data

1. **Bucket caps** (`entropy.mjs`): gap, session-time and time-since-elevation stop growing past about a day, so a
   longer pause than ever seen does not mint a brand-new symbol.
2. **Calibration burn-in** (`watch.mjs`): samples are taken only once the baseline holds 2 blocks.
3. **Four parts** (`gep.mjs`, `watch.mjs`): Gary's unified S and each of his three domains, each against its own bars —
   a timing-only script collapses H_net while S barely moves.
4. **Quarantine + owner confirmation** (`watch.mjs`, harness): without it, one honest change in behaviour stopped the
   baseline learning and every later action flagged (synthetic FP 26.7%) — the self-lockout the spec forbids.
5. **Held shifts answered in the harness** (`harness.mjs`): the stability bound held most of the owner's blocks after
   his quiet first fortnight (22 turns), freezing his baseline; the owner answers that prompt in real use, so the
   harness does too, and **counts** each one (reported as "big shifts confirmed").
6. **The owner's privilege mapping** (`tools/extract.mjs`): `priv` and `elev` were both functions of the permission
   mode, four views of one variable; now `priv` is "elevated" only on the turn where the mode was raised to bypass —
   Gary's "privilege-elevation timing" — and the mode itself is the tier, its changes the transitions.
7. **The alignment bar learned on D_KL + k·ΔS**, the exact quantity its row compares (it had been learned on D_KL alone).
8. **The rhythm row** (`gep.mjs`, `watch.mjs`): Gary's key finding, overly regular → BLOCK, measured as the estate's v1
   rhythm (MAD over mean of the last 6 positive gaps) against each identity's own learned floor. On dev it took
   kar-session fixed-pace and machine-speed scripts from ≤ 6/20 to 20/20 at BLOCK.
9. **Only ISOLATE holds a key** (`watch.mjs`): a sticky hold on every BLOCK made one false flag refuse everything
   after it (found by clicking the live page). Raw verdicts are unchanged by this.
10. **Totality**: the hostile-input battery found throws on toxic objects in nine kernels; each now refuses or steps up.

## Interpretations fixed now, before measuring

- B4/B5 "false-positive rate over every test action": over the test actions on which the stream's watcher had
  **formed**; the number seen while still forming is reported beside it (a forming watcher enforces nothing).
- The receipts also report, unjudged: distinct episodes (runs of flagged actions — the times the owner would be asked),
  big shifts confirmed, and the verdict tally.

## What was chosen

`params.json`: W = 20, mEps = mKl = mGrad = 3, barAlpha = 0.2 (everything else at the kernel defaults), by the
FALLBACK rule — the smallest larger dev FP was 3.84% (simon; kar-session 0.10%). On dev this configuration caught, of
20 sessions: simon cadence 18, burst 18, uniform 11 (STEP_UP+); kar-session cadence 20, burst 20, uniform 0, shuffled 0
(BLOCK+). Expected on test from those dev numbers, written down before measuring: B4 fails (≈4% > 1%); B1 fails on
uniform; B2 fails on kar-session uniform and shuffled. The full grid is in ~/.si-didy/bes/private/tune.json (local).
