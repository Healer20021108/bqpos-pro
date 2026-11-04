# AGENTS.md

## Project Overview

This repository contains a cash-exchange decision tool for a department-store cashier.
The user enters how many of each denomination they currently hold, and the tool tells
them how many of each denomination to go exchange.

Primary source of truth:

- `PROJECT_SPEC.md`

Read `PROJECT_SPEC.md` first. This file holds **agent operating rules only**; it does NOT
duplicate the spec's numbers or rules. If this file conflicts with `PROJECT_SPEC.md`,
follow `PROJECT_SPEC.md`.

> Note: the tool was simplified on 2026-06-24. The earlier two-tier model (POS soft rule +
> reserve hard rule, weekday/weekend/full modes, exact/rounded exchange modes) was removed.
> For denominations, the single target holding, and the calculation, see `PROJECT_SPEC.md`.
> Do not rebuild those tables here.

UI language is Traditional Chinese.

---

## Implementation Requirements

1. Keep calculation logic in pure functions (`src/modules/<feature>/calculate.ts`).
2. Keep UI separate from calculation logic (`view.ts` only reads input, calls pure
   functions, and renders).
3. Empty input is treated as 0. Negative and decimal values are invalid.
4. Display currency in NT dollars.
5. Output must be practical Traditional Chinese, like a floor instruction, not
   engineering debug. Good: `100 元 要換 30 張 = NT$3,000。` Bad: `diff = 30, amount = 3000`.
6. Optimize for mobile first; results need both a text conclusion and a table.
7. Do not add backend, login, database, or persistence unless explicitly requested.
8. Do not expand scope into sales analytics, accounting, inventory, or shift management.

---

## Architecture

Vite + TypeScript, front-end only. Modular: a tab shell (`src/shell`) + shared core
(`src/core`) + feature modules (`src/modules/<feature>`).

```text
index.html
src/
  main.ts
  shell/            tab bar + hash routing + mount/unmount
  core/             shared: types (FeatureModule), rules, format
  modules/
    registry.ts     module registry (add features here)
    exchange/       calculate.ts (pure) / view.ts (UI) / index.ts (FeatureModule)
  styles/base.css
tests/exchange/calculate.test.ts
```

Add a feature: create `src/modules/<name>/index.ts` exporting a `FeatureModule`
(`id` / `title` / `mount(container)`), then register it in `registry.ts`. See `README.md`.

---

## Validation Checklist

Before finishing any task:

- Input normalization: empty / negative / decimal are treated as invalid (0).
- Per denomination: exchange = max(0, target - current); extra = max(0, current - target).
- Total is the sum of exchange amounts; nothing is listed when all denominations meet target.
- Pure functions covered by vitest (`npm test`); `tsc` and `vite build` pass.
- Mobile layout remains usable.

<!-- SPEC_SYNC_START -->
Spec source: PROJECT_SPEC.md
Spec SHA-256 short hash: 95d89d488d9f
Synced at: 2026-11-04T21:19:51.007Z
Instruction: If any local instruction conflicts with PROJECT_SPEC.md, follow PROJECT_SPEC.md.
<!-- SPEC_SYNC_END -->
