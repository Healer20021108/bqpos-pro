# AGENTS.md

## Project Overview

This repository contains a POS / reserve cash exchange decision tool for a department-store cashier workflow.

This is not a generic cash counter. The application must decide:

1. Whether the POS drawer needs cash.
2. Whether to transfer cash from the reserve fund to the POS drawer.
3. Whether the reserve fund still satisfies its hard rule after transferring cash to POS.
4. What external cash exchange is actually required.
5. How to avoid unnecessary cash exchange that wastes time during daily closing.

Primary source of truth:

- `PROJECT_SPEC.md`

If this file conflicts with `PROJECT_SPEC.md`, follow `PROJECT_SPEC.md`.

---

## Critical Business Logic

Do not calculate external exchange as:

```text
POS shortage + reserve shortage
```

That is wrong.

Correct order:

```text
1. Determine if POS needs cash.
2. Transfer same-denomination cash from reserve to POS first.
3. Deduct that transfer from reserve.
4. Re-check reserve against hard reserve targets.
5. Only the final shortage is external exchange demand.
```

---

## Rule Model

### POS drawer

POS uses soft rules.

```text
POS must be safe enough for change-making, but does not need to be perfectly equal to the target every day.
```

### Reserve fund

Reserve uses hard rules.

```text
After POS transfer, reserve must return to its fixed target counts.
```

---

## Denominations

```ts
const denominations = [500, 100, 50, 10, 5, 1] as const;
```

Units:

```text
500, 100: bills
50, 10, 5, 1: coins
```

UI language should be Traditional Chinese.

---

## POS Weekday Rules

Use for normal weekdays, sales about NT$60,000–70,000.

| Denomination | Safe Count | Recommended Count |
|---:|---:|---:|
| 500 | 5 | 6 |
| 100 | 22 | 25 |
| 50 | 5 | 6 |
| 10 | 25 | 30 |
| 5 | 12 | 16 |
| 1 | 24 | 30 |

Weekday logic:

```text
If current POS count is below safe count, top up to recommended count.
Otherwise, do not force top-up.
```

---

## POS Weekend Rules

Use for weekends or high traffic days, sales about NT$80,000–100,000.

| Denomination | Safe Count | Recommended Count |
|---:|---:|---:|
| 500 | 6 | 8 |
| 100 | 25 | 30 |
| 50 | 6 | 8 |
| 10 | 30 | 40 |
| 5 | 16 | 20 |
| 1 | 30 | 40 |

Weekend logic:

```text
If current POS count is below recommended count, top up to weekend recommended count.
```

---

## Reserve Hard Targets

| Denomination | Required Count |
|---:|---:|
| 500 | 10 |
| 100 | 25 |
| 50 | 20 |
| 10 | 100 |
| 5 | 60 |
| 1 | 200 |

Reserve total should be NT$10,000.

---

## Exchange Modes

### Exact mode

Exchange exactly the required count.

### Rounded mode

Round external exchange demand to convenient units:

| Denomination | Round Unit Count |
|---:|---:|
| 500 | 2 |
| 100 | 5 |
| 50 | 10 |
| 10 | 50 |
| 5 | 20 |
| 1 | 50 |

Any extra after rounding should be reported as extra reserve cash.

---

## Required Outputs

The app should show:

1. Daily conclusion.
2. POS adjustment suggestions.
3. Reserve hard-rule check.
4. External exchange list.
5. Detail table.

Output must be practical Traditional Chinese, suitable for cashier use.

Good example:

```text
100 元目前 21 張，低於平日安全量 22 張。
建議從預備金補 4 張，使 POS 回到 25 張。
```

Bad example:

```text
diff = 4, reserveAfter = 21, need = true
```

---

## Implementation Requirements

1. Keep calculation logic in pure functions.
2. Keep UI components separate from calculation logic.
3. Empty input should be treated as 0.
4. Negative and decimal values are invalid.
5. Display currency in NT dollars.
6. Optimize for mobile first.
7. Do not add backend, login, database, or persistence unless explicitly requested.
8. Do not expand scope into sales analytics, accounting, inventory, or shift management.

---

## Suggested File Structure

```text
/
  PROJECT_SPEC.md
  CLAUDE.md
  AGENTS.md
  README.md
  src/
    logic/
      cashRules.ts
      calculateExchange.ts
    components/
      CashInputSection.tsx
      ResultSummary.tsx
      DetailTable.tsx
    App.tsx
  tests/
    calculateExchange.test.ts
```

If using plain HTML instead of React, keep the same separation concept:

```text
index.html
style.css
cash-rules.js
calculate-exchange.js
app.js
```

---

## Validation Checklist

Before finishing any task, check:

- Weekday POS below safe count tops up to weekday recommended count.
- Weekday POS above safe count does not force top-up.
- Weekend POS below recommended count tops up to weekend recommended count.
- Reserve is checked only after POS transfer.
- External exchange is based on final shortage.
- Rounded mode correctly rounds by denomination count.
- Rounded extra is shown as reserve extra.
- Mobile layout remains usable.

<!-- SPEC_SYNC_START -->
Spec source: PROJECT_SPEC.md
Spec SHA-256 short hash: 6535e82a5c3b
Synced at: 2026-06-23T12:31:15.022Z
Instruction: If any local instruction conflicts with PROJECT_SPEC.md, follow PROJECT_SPEC.md.
<!-- SPEC_SYNC_END -->
