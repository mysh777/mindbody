# Mindbody Reporting & Marketing

Reporting dashboard for a Mindbody studio. Data is pulled from the Mindbody API every night into Supabase and shown as owner-level reports.

**Stack:** Vite + React + TypeScript + Tailwind, Supabase (Postgres, edge functions, pg_cron).

## Pages (`src/lib/pages.ts`)

| Group | Pages |
|-------|-------|
| Overview | Overview |
| Clients | Client Card, Expiring Packages, Sleeping Clients, Client Segments |
| Finance | Margin by Service, Margin by Staff |
| Reference | Reference Tables, Service Pricelist, Staff Pricelist |
| Admin | Sync Data, Sync History, Reconciliation, Data Issues, Linkage Health, Appointments, Client Services, Sales Journal, Sale Items, Pivot Reports, API Logs, Raw API Data, Staff Rates |

Old addresses redirect: `sales-report`, `profitability` → Overview; `api-integration` → Sync Data; `client-activity`, `clients-report`, `client-balance`, `expired` → Client Card; `staff-report` → Margin by Staff; `sales-by-pricing`, `by-service` → Margin by Service; `transactions` → Sales Journal.

## Edge functions (`supabase/functions`)

| Function | Purpose |
|----------|---------|
| `mindbody-sync` | All Mindbody sync steps, selected by `syncType` |
| `overview-totals` | Nightly pre-computation of Overview month totals (`overview_monthly_totals`); on the 1st of each month also saves the month-end obligations total (`obligation_snapshots`) |
| `get-activation-code` | Mindbody site activation code |

## Docs

- `SYSTEM_REFERENCE.md` — schema, Mindbody endpoints, field mapping, known issues
- `MINDBODY_SETUP.md` — credentials, nightly schedule, troubleshooting
- `RECONCILIATION_RULES.md` — how dashboard figures are checked against Mindbody reports
- `UI_RULES.md` — UI conventions
- `SEGMENTS_AUDIT.md` — client segment definitions audit
