# FINDINGS

Think you can impersonate the operator? The bar: get `judge()` to **ALLOW** a run that isn't the operator
— a scripted automation, or a hijack doing a different mix of actions — or get it to **throw** instead of
failing closed, or **poison the baseline** so an impostor becomes the new normal.

## Report template

```
### <short title>
- Vector:   too-regular | drift | poison | fail-open | calibration | other
- Severity: critical (admits an impostor / poisons the baseline) | high (throws) | medium | low
- Repro:    the window of actions (events), and the baseline + params
- Observed: the { level, reason, divergence, variability } judge() returned
```

## In-house (reproduced by `attack-kit/redteam.mjs --check` — 6 cases, all held)

| Case | Result |
|---|---|
| the operator's own varied behaviour (held-out windows) | all **ALLOW** — low false positive |
| scripted automation (operator's op-mix, clockwork rhythm) | **FLAG** — too regular |
| a hijack (different op-mix) | **FLAG** — unlike the operator (drift ≫ cap) |
| impostor windows offered to the baseline | **baseline unchanged** — only allowed windows fold in |
| an empty/still-learning baseline | **CALIBRATING** — it does not flag the operator while learning |
| a malformed signature | **FLAG** — fails closed, never throws |

## Honest limits

- **Behaviour is a signal, not an oracle.** A flag means *look closer* (step up), as in Gary's deployment,
  not a hard permanent block of a single window — a legitimate operator who has one unusual window is
  allowed again on the next. The thresholds (`maxDivergence`, `minVariability`, `window`, `calibrate`) are
  parameters a deployment tunes to its operator; the defaults give the operator headroom (their own windows
  spread up to ~660‰ here, a hijack is ~1,990‰).
- **The baseline must be learned from genuine operator behaviour.** If the calibration window already
  contains an impostor, it learns the wrong normal — the same caveat as any one-class model. Negative
  selection protects it *after* calibration, not during it.
- No impostor has been admitted and the baseline has not been poisoned. If you manage it, log it above.
