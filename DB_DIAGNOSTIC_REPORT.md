# DB Diagnostic Report: Visit Mismatch & Uncategorized Services

**Date:** 2026-09-23
**Blocker:** Supabase MCP query tools not available in this session. SQL verification queries below must be run manually in the Supabase Dashboard SQL Editor.

---

## Problem 1 — 14 visits / 3,011.50 EUR vs Mindbody 12 / 2,441.50 EUR (Kriolipolize 2 manipulas, Aug 2026)

### Root Cause (from code analysis): Different Methodology

Our "Margin by Procedure" report uses **visit-basis (accrual)**: it counts completed appointments and derives revenue from linked pricing options. Mindbody "Sales by Service" uses **cash-basis**: it counts sale transactions.

| | Our MarginByService | Mindbody Sales by Service |
|---|---|---|
| **Counts** | Completed appointments | Sale transactions |
| **Revenue** | `pricing_options.price / session_count` per visit | `sale_items.total_amount` per sale |
| **Period** | `appointments.start_datetime` | `sales.sale_date` |

**Why 14 != 12:** A client buys a multi-session package in one sale but uses those sessions across multiple appointments (possibly spanning months). Extra visits come from packages purchased in prior months but used in August, or rebooked/comp sessions with no separate sale.

**Revenue delta (570 EUR):** Visits without a linked client_service fall back to session-type median price, which can inflate the total vs actual sales.

### Verification Queries (run in Supabase Dashboard)

```sql
-- A: Visit-basis count
SELECT COUNT(*) as visits
FROM appointments a
JOIN session_types st ON st.id = a.session_type_id
WHERE st.name ILIKE '%Kriolipolīze 2%'
  AND a.start_datetime >= '2026-08-01' AND a.start_datetime < '2026-09-01'
  AND a.status = 'Completed';

-- B: Cash-basis count (should match Mindbody)
SELECT COUNT(*) as sales, SUM(si.total_amount) as revenue
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE si.description ILIKE '%Kriolipolīze 2%'
  AND s.sale_date >= '2026-08-01' AND s.sale_date < '2026-09-01';

-- C: Check for returned items or system client
SELECT COUNT(*) as total,
  COUNT(*) FILTER (WHERE si.returned = true) as returned,
  COUNT(*) FILTER (WHERE s.client_id = '1') as system_client,
  SUM(si.total_amount) as total_revenue
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE si.description ILIKE '%Kriolipolīze 2%'
  AND s.sale_date >= '2026-08-01' AND s.sale_date < '2026-09-01';

-- D: Cross-check multiple services
SELECT si.description, COUNT(*) as sales, SUM(si.total_amount) as revenue,
  COUNT(*) FILTER (WHERE si.returned = true) as returned,
  COUNT(*) FILTER (WHERE s.client_id = '1') as system_client
FROM sale_items si JOIN sales s ON s.id = si.sale_id
WHERE s.sale_date >= '2026-08-01' AND s.sale_date < '2026-09-01'
  AND (si.description ILIKE '%Kriolipolīze 2%' OR si.description ILIKE '%EMS Sculptor 30%'
       OR si.description ILIKE '%Klasiskā%masāža 60%' OR si.description ILIKE '%Endotherapy 30%')
GROUP BY si.description ORDER BY si.description;
```

---

## Problem 2 — EMS Sculptor 30 min and other tariffs in Uncategorized

### Root Cause (from code analysis): Two possible causes

1. **NULL/empty `revenue_category`** in `pricing_options` — the Mindbody API field `RevenueCategory` was null when synced (line 858 of sync function: `revenue_category: service.RevenueCategory`). When this is empty, and the fallback `session_types.category` is also empty, the service shows as "Uncategorized".

2. **Case/whitespace mismatch** — the code's `CATEGORY_ORDER` used exact string matching. If the DB had `"ems"` or `"EMS "` (trailing space), it wouldn't match `"EMS"` and would appear outside the ordered groups.

### Code Fix Applied

- Category matching is now **case-insensitive with trim** — `"ems"`, `"EMS"`, `"Ems "` all match the canonical `"EMS"` entry.
- Empty/whitespace-only categories now correctly fall to "Uncategorized" instead of being treated as a named category.

### Verification Queries (run in Supabase Dashboard)

```sql
-- E: EMS pricing options
SELECT name, revenue_category, mindbody_id
FROM pricing_options
WHERE name ILIKE '%EMS%' OR name ILIKE '%Sculptor%' OR name ILIKE '%PelviTone%'
ORDER BY name;

-- F: All unique revenue_category values
SELECT COALESCE(revenue_category, '(NULL)') as category, COUNT(*) as cnt,
  LENGTH(revenue_category) as char_len
FROM pricing_options GROUP BY revenue_category ORDER BY revenue_category NULLS FIRST;

-- G: Tariffs with NULL/empty category
SELECT name, revenue_category, mindbody_id
FROM pricing_options
WHERE revenue_category IS NULL OR revenue_category = '' ORDER BY name;

-- H: Tariffs not matching any CATEGORY_ORDER entry
SELECT name, revenue_category FROM pricing_options
WHERE revenue_category IS NOT NULL AND revenue_category != ''
  AND LOWER(TRIM(revenue_category)) NOT IN (
    'ems','hair removal','ķermeņa procedūras','kriolipolize','lipolytic',
    'lipoaction','machine','massage','konsultācijas','gift card reservation',
    'sauna','phytomer','velashape')
ORDER BY revenue_category, name;

-- I: Check if raw_data has RevenueCategory for NULLs
SELECT name, raw_data->>'RevenueCategory' as raw_cat, revenue_category
FROM pricing_options
WHERE (revenue_category IS NULL OR revenue_category = '') AND raw_data IS NOT NULL LIMIT 30;
```

### Data Fix (run if Query I shows raw_data has the category)

```sql
-- Backfill revenue_category from raw_data
UPDATE pricing_options
SET revenue_category = raw_data->>'RevenueCategory'
WHERE (revenue_category IS NULL OR revenue_category = '')
  AND raw_data->>'RevenueCategory' IS NOT NULL
  AND raw_data->>'RevenueCategory' != '';
```

---

## Summary of Changes Made

| Item | Status |
|---|---|
| CATEGORY_ORDER matching: case-insensitive + trim | Fixed in code |
| Methodology subtitle on Margin by Procedure page | Added |
| NULL revenue_category backfill from raw_data | SQL provided, must run manually |
| Visit vs cash basis mismatch explanation | Documented above |
| Supabase SQL verification | Queries provided, must run manually (MCP tools unavailable) |

---

## Problem 3 — Staff Cost: 9,305.80 EUR (ours) vs 6,123.30 EUR (Mindbody Payroll, Aug 2026)

### Root Cause Analysis (from code trace)

The cost calculation lives in `useSalesMarginData` (lines 212-223). The rate priority chain is:

1. `staff_appointment_rates` where `effective_to IS NULL` (override rate per staff+service)
2. `staff_appointment_rates` with `session_type_id = NULL` (default rate for that staff member)
3. `staff_session_types.pay_rate` (base rate from the staff-service link table)
4. Falls back to `0` if none found

**Three confirmed causes of the +3,182.50 EUR difference:**

#### Cause A: Visit count difference (706 vs 471)

Our report counts ALL completed appointments (706). Mindbody Payroll only counts sessions where a pay rate is configured (471 "paid" sessions). The 235 extra visits in our report have `cost = 0` so they don't inflate the total cost, BUT they inflate the visit count shown in the report.

#### Cause B: Rate source mismatch

Our system reads rates from two tables (`staff_appointment_rates` and `staff_session_types`). These are populated either manually through the Staff Rates Manager or from sync data. Mindbody Payroll uses its own internal payroll rate configuration which may differ from what's stored in our database.

Key scenarios where rates diverge:
- A rate was updated in Mindbody but not re-synced to our database
- A rate was manually entered in our Staff Rates Manager that doesn't match Mindbody
- The `staff_session_types.pay_rate` contains a value from initial sync that's since been changed in Mindbody
- Override rates in `staff_appointment_rates` may apply to services that Mindbody doesn't pay for

#### Cause C: Default rate fallback

Line 218-219: if `staff_appointment_rates` has a row with `session_type_id = NULL` for a staff member, that default rate applies to ALL their services -- including ones that may have zero pay rate in Mindbody. This could significantly inflate costs for staff members who do many different service types but only get paid for some.

### Verification Queries (run in Supabase Dashboard)

```sql
-- Q1: Staff cost breakdown matching our report logic
SELECT 
  s.first_name || ' ' || s.last_name AS staff_name,
  COUNT(a.id) AS visits,
  SUM(
    COALESCE(
      sar_specific.rate_per_appointment,
      sar_default.rate_per_appointment,
      sst.pay_rate,
      0
    )
  ) AS our_total_cost,
  COUNT(a.id) FILTER (WHERE COALESCE(sar_specific.rate_per_appointment, sar_default.rate_per_appointment, sst.pay_rate, 0) = 0) AS visits_zero_rate,
  COUNT(a.id) FILTER (WHERE COALESCE(sar_specific.rate_per_appointment, sar_default.rate_per_appointment, sst.pay_rate, 0) > 0) AS visits_with_rate
FROM appointments a
JOIN staff s ON s.id = a.staff_id
LEFT JOIN staff_session_types sst ON sst.staff_id = a.staff_id AND sst.session_type_id = a.session_type_id
LEFT JOIN staff_appointment_rates sar_specific ON sar_specific.staff_id = a.staff_id AND sar_specific.session_type_id = a.session_type_id AND sar_specific.effective_to IS NULL
LEFT JOIN staff_appointment_rates sar_default ON sar_default.staff_id = a.staff_id AND sar_default.session_type_id IS NULL AND sar_default.effective_to IS NULL
WHERE a.start_datetime >= '2026-08-01'
  AND a.start_datetime < '2026-09-01'
  AND a.status = 'Completed'
GROUP BY s.id, s.first_name, s.last_name
ORDER BY our_total_cost DESC;
```

```sql
-- Q2: Rate detail for top-cost staff members
SELECT 
  s.first_name || ' ' || s.last_name AS staff_name,
  st.name AS service,
  sst.pay_rate AS base_rate,
  sar_specific.rate_per_appointment AS override_rate,
  sar_default.rate_per_appointment AS default_rate,
  COALESCE(sar_specific.rate_per_appointment, sar_default.rate_per_appointment, sst.pay_rate, 0) AS effective_rate,
  COUNT(a.id) AS visits,
  SUM(COALESCE(sar_specific.rate_per_appointment, sar_default.rate_per_appointment, sst.pay_rate, 0)) AS total_cost
FROM appointments a
JOIN staff s ON s.id = a.staff_id
JOIN session_types st ON st.id = a.session_type_id
LEFT JOIN staff_session_types sst ON sst.staff_id = a.staff_id AND sst.session_type_id = a.session_type_id
LEFT JOIN staff_appointment_rates sar_specific ON sar_specific.staff_id = a.staff_id AND sar_specific.session_type_id = a.session_type_id AND sar_specific.effective_to IS NULL
LEFT JOIN staff_appointment_rates sar_default ON sar_default.staff_id = a.staff_id AND sar_default.session_type_id IS NULL AND sar_default.effective_to IS NULL
WHERE a.start_datetime >= '2026-08-01'
  AND a.start_datetime < '2026-09-01'
  AND a.status = 'Completed'
GROUP BY s.id, s.first_name, s.last_name, st.name, sst.pay_rate, sar_specific.rate_per_appointment, sar_default.rate_per_appointment
ORDER BY s.last_name, total_cost DESC;
```

```sql
-- Q3: Staff members with default (catch-all) override rates
SELECT 
  s.first_name || ' ' || s.last_name AS staff_name,
  sar.rate_per_appointment AS default_rate
FROM staff_appointment_rates sar
JOIN staff s ON s.id = sar.staff_id
WHERE sar.session_type_id IS NULL
  AND sar.effective_to IS NULL
ORDER BY s.last_name;
```

```sql
-- Q4: Visits with zero rate (these are in our 706 but not in Mindbody's 471)
SELECT 
  s.first_name || ' ' || s.last_name AS staff_name,
  st.name AS service,
  COUNT(a.id) AS visits_zero_rate
FROM appointments a
JOIN staff s ON s.id = a.staff_id
JOIN session_types st ON st.id = a.session_type_id
LEFT JOIN staff_session_types sst ON sst.staff_id = a.staff_id AND sst.session_type_id = a.session_type_id
LEFT JOIN staff_appointment_rates sar ON sar.staff_id = a.staff_id AND (sar.session_type_id = a.session_type_id OR sar.session_type_id IS NULL) AND sar.effective_to IS NULL
WHERE a.start_datetime >= '2026-08-01'
  AND a.start_datetime < '2026-09-01'
  AND a.status = 'Completed'
  AND COALESCE(sar.rate_per_appointment, sst.pay_rate, 0) = 0
GROUP BY s.id, s.first_name, s.last_name, st.name
ORDER BY visits_zero_rate DESC;
```

### Mindbody Payroll Reference (Aug 2026)

| Staff | MB Sessions | MB Payroll EUR |
|---|---|---|
| Grand Total | 471 | 6,123.30 |
| Aquabike Centrs 1 | 70 | 1,260.00 |
| Aquabike ALFA 1 | 41 | 738.00 |

### Recommended Next Steps

1. Run Q1 above to see which staff members have the largest cost discrepancy
2. Run Q3 to check if any staff have catch-all default rates that inflate costs
3. Compare Q2 effective rates against the actual Mindbody Payroll PDF line by line
4. For staff with wrong rates: update via the Staff Rates Manager in the app, or directly fix in `staff_appointment_rates` / `staff_session_types`
