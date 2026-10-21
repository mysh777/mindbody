/*
# Phase 3.5 — Reconciliation auto-confirm tables

## Purpose
Support automatic confirmation of provisional reconciliation mismatches
when they are fully explained by deposit spending (FIFO).

## New tables

### reconciliation_auto_confirm_log
Records every auto-confirmation event. Each row explains one mismatch
that was automatically confirmed by deposit spending data.

- period: the month being explained (e.g. "2026-09")
- check_type: "reference" | "case" | "baseline_drift" | "stored_totals"
- check_key: a unique identifier for the specific check (e.g. "case_7", "sales_total|all")
- original_expected: the Mindbody reference value before auto-confirm
- actual_value: what our data computed
- diff: actual - expected (the growth that was explained)
- explanation: human-readable explanation (e.g. "Auto-confirmed: deposit spent by Kazakova, 2026-09-22, 107.50")
- fifo_details: JSONB array of {client, date, amount} matches
- confirmed_at: timestamp

### notification_settings
Stores email notification preferences. Single row (id=1).

- email_recipients: comma-separated email addresses
- notify_red_reconciliation: boolean
- notify_sync_errors: boolean
- notify_data_issues: boolean
- updated_at: timestamp

## Security
- Both tables: RLS enabled, authenticated CRUD (app writes).
- No anon access (Phase 3 already closed anon).
*/
