# Reconciliation Rules

This document describes the reconciliation system that verifies our calculated reports match Mindbody's reference values.

## Core Principle

All checks use the exact same code path as the reports (`computeSalesByDateData` from `useSalesByDateData.ts` for revenue, `computeStaffCostByLocation` from `useSalesMarginData.ts` for staff costs). There are no separate reimplementations — if a check fails, the report is wrong too.

## Payment Classification

- **Cash (revenue-generating):** Visa/MC, AMEX, Check, Cash
- **Non-cash (no direct revenue):** Prepaid Gift Card, Account, Comp/Guest, Other
- **Unknown:** Any payment type not in the above lists triggers a warning. It must be classified before revenue calculations can be trusted.

"Other" is classified as non-cash: there are only 7 records totalling 0.00 EUR.

## Revenue Rules

### RULE 1 — Direct Cash Sales
Items paid with cash payment types. Revenue = item amount x (cash portion / total paid). No per-item rounding; the tariff total is the raw sum.

### RULE 3 — FIFO for Account-Paid Items
When a sale item is paid via "Account":
1. Build the client's full history of Payment-on-Account (PoA) credits and Account debits.
2. PoA item IDs: `-6`, `10289`.
3. PoA credit amount = totalAmount x paidCash / (paidAll - paidAccount) -- excludes Account from denominator.
4. A PoA paid entirely by Gift Card produces a noncash credit (zero revenue).
5. Account debit split: uses nonPoaTotal = paidAll - poaItemTotal as denominator (Account pays for services, not the PoA deposit).
6. ALL Account-paid items (including non-service products like water bottles) create debit events.
7. Match credits to debits in chronological (FIFO) order.
8. Revenue is attributed to the period where the cash credit falls.

### Refunds
Negative Account items create `noncash_credit` FIFO events (reversal of prior debit).

### Rounding
No per-item rounding is applied. Revenue accumulates as raw floating-point and is rounded only for display. Mindbody's Sales by Service report uses per-item floor rounding of the non-cash portion, which can differ from our totals by up to 0.01 per item. Case 3 (Veidenbauma, "2 nodarbibas") documents one such known difference (our 19.06 vs Mindbody 19.07); the check uses a tolerance of +/-0.01.

## Reconciliation Checks

### 1. Reference Values (`reconciliation_references`)
Mindbody-verified totals. Each has a period, metric, location, and expected value.

| Period  | Metric      | Location | Expected   |
|---------|-------------|----------|------------|
| 2026-07 | sales_total | all      | 39,596.05  |
| 2026-07 | sales_qty   | all      | 544        |
| 2026-07 | staff_cost  | 1        | 7,451.40   |
| 2026-07 | staff_cost  | 3        | 3,417.50   |
| 2026-08 | sales_total | all      | 26,644.85  |
| 2026-08 | sales_qty   | all      | 411        |
| 2026-08 | staff_cost  | 1        | 6,123.30   |
| 2026-08 | staff_cost  | 3        | 3,269.50   |
| 2026-09 | sales_total | all      | 18,634.75  |
| 2026-09 | sales_qty   | all      | 306        |

### 2. Baseline Snapshots (`reconciliation_baseline`)
After all reference checks pass, the full tariff-level breakdown and staff costs are saved. Any future code change that shifts a tariff's revenue or quantity triggers a "baseline drift" alert.

Baselines cover:
- `sales_by_tariff`: every tariff row for Jul/Aug/Sep (value + qty)
- `staff_cost`: per-location staff cost for Jul/Aug

### 3. Test Cases (`reconciliation_cases`)
Nine specific client/tariff scenarios, each with expected value and/or quantity. Cases filter by **client_id + tariff_name** (not just tariff total), catching edge cases in FIFO resolution.

| # | Description | Expected |
|---|-------------|----------|
| 1 | Gift-card-only sale (Ozolina) | 0.00 |
| 2 | Comp/Guest sale (Mundeciema) | 0.00 |
| 3 | Mixed payment splits (Veidenbauma) | 19.07 +/-0.01 |
| 4 | Cash return +65/-65 + rebuy (Karbanova) | 117.00 |
| 5 | Account debt covered by PoA (Luse) | 470.00 |
| 6 | PoA + refund on balance (Serebro) | 112.00 |
| 7 | Product on balance + Account on PoA (Kazakova) | 192.50 |

Cases 6 and 7 can grow after the period closes: Mindbody books later spending of a deposit back to the month the deposit was made, so references for such months must be re-verified in Mindbody when the client keeps spending the balance.
| 8 | Gift card PoA not revenue (Bacarova) | 15.00 |
| 9 | Gift card PoAs zero revenue (Sniedze + Bautre) | 0.00 |

### 4. Unknown Payment Types
Every payment type in the database is classified. Any unrecognized type triggers a warning.

## When Checks Run

- **On demand:** "Check Now" button in the Reconciliation tab.
- **After sync:** Automatically after Quick Sync completes, results shown in the dashboard warning banner if any check fails.
