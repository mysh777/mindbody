# Performance & Usability Audit

Date: 2026-10-12. Measured on the live database and from the code. **Nothing in the app or the database was changed.**

Ground rule for every proposal: money calculations stay identical and Reconciliation stays ✓. Every step in Part 7 has a before/after check.

## What was measured, and what could not be

| Source | What it gives | Status |
|---|---|---|
| `pg_stat_statements` (collecting since 2026-09-21, 21 days) | Real query counts, mean and total DB time for everything the app and sync sent | Measured |
| Table and index statistics, table sizes, rows per month | Sizes, growth, full-table scans, unused indexes | Measured |
| `sync_logs`, last 14 days | Step durations, failures | Measured |
| Code reading (pages, data hooks) | Which queries each page sends, whole-table loads, browser calculations | Read from source |
| Build output | Bundle size | Measured (earlier build) |
| **Browser timings (cold/warm open, mobile throttling, in-browser calculation ms)** | — | **Not measured.** This environment has no browser, so page-open times could not be measured. Part 1 gives the measured database side (rows, requests, DB ms per request) and the transfer time worked out from bundle size. Step 0 of the plan adds a small timing readout so real cold/warm/mobile times can be recorded before any fix. |

Key volumes:

| Period | Sales | Visits (appointments) |
|---|---|---|
| Typical: one month (Sep 2026) | 322 | 641 |
| Heavy: whole 2026 | 3,564 | 7,503 |
| All time | 8,065 | 16,354 |
| Clients | 6,252 | — |

---

## Part 1 — Page speed

### 1.1 Load that every page pays (on app open)

| Item | Measured | Cause | Fix | Gain | Risk | Effort |
|---|---|---|---|---|---|---|
| App code download | 1,703 KB JS (483 KB compressed), one file | No code splitting: all ~20 pages, charts and Excel load at start | Load each page on demand; load charts/Excel only when used | First screen downloads ~150–200 KB instead of 483 KB. On a "Fast 3G" profile (~200 KB/s) that is about 2.4 s → 0.8 s of download (calculated) | Low | Small–medium |
| Sales total for the header stats | Whole `sales` table read on every app open: 2,376 times, 200 ms each, **474 s of DB time in 21 days** | Header stats are calculated but **never shown** | Remove the query | −1 request per open, −8,000 rows | None (not displayed, no money effect) | Small |
| Menu counters | 4 exact-count queries on every open and after every sync | Counts of Appointments, Sales, Client Services, Sale Items in the Admin menu | Show them only when Admin is expanded, or use estimated counts | −4 requests per open | None | Small |
| Background reconciliation check | Runs on every open | Automatic check | Keep it, but run once per session | Small | Low | Small |

### 1.2 Per page: what loads (from the code) and the measured DB cost

"Rows" = rows sent to the browser. "Requests" = round trips (each paged at 1,000 rows, or 100 ids per lookup chunk). DB times are `pg_stat_statements` means.

| Page | Typical (last month) | Heavy (2026, All locations) | Heaviest step | Whole-table loads? |
|---|---|---|---|---|
| **Overview** | Reads nightly totals (66 rows) + month detail for one month: ~10 requests | Same; the series is precomputed | Studio obligations: reads all client packages (3,255) every open | Obligations, staff list |
| **Margin by Service, sale basis** | ~322 sales → sale items and payments by sale id in chunks of 100 (~4+4 requests) + pricing options, session types, staff, locations, rates (whole reference tables, ~6 requests) + **FIFO replay of payment-on-account clients' whole history** | 3,564 sales → ~36 + 36 chunk requests, plus one history read **per payment-on-account client** (one-by-one pattern). Item lookups by `payment_ref_id`: 6,280 calls, **206 ms each, 1,295 s total**, the 2nd most expensive query in the database | FIFO history replay in the browser | Reference tables |
| **Margin by Service, visit basis / Margin by Staff** | 641 visits (1 page) + client services by id (~7 chunks) + item lookups by `payment_ref_id` (206 ms each) + reference tables | 7,503 visits (8 pages) + ~70 chunk requests | Pricing each visit from its package (`payment_ref_id` lookups) | Reference tables, staff rates |
| **Client Card** | Per client: their sales, visits and packages (period-independent) + item and staff lookups: ~10 requests | Same | Client search: queries `clients` while typing | No |
| **Expiring Packages** | Client services + client names + visits | Same (not period-based) | All active packages each open | Yes, active packages |
| **Sleeping Clients** | 17 queries in the code: clients, visits, sales, settings | Same | Last-visit per client worked out in the browser | Yes: visits for the lookback window across all clients |
| **Client Segments** | 16 queries in the code; clients in pages | Same | Segment rules over all 6,252 clients in the browser | Yes, clients |
| **Campaigns** | Lead lists + matching against all clients + results from sales/visits | Same | Client matching index (all clients) | Yes, clients |
| **Reference Tables / Staff Pricelist / Staff Pay Rates** | Whole reference tables (≤ 900 rows each) | Same | Staff ↔ service links: 61,315 calls, 10.7 ms each = 655 s total | Yes (small tables) |
| **Admin raw tables (Sales Journal, Appointments, Sale Items, Client Services, Transactions)** | `select *` with exact count, **whole table**, plus whole `clients` and `staff` name lists | Same | `sales.*` 570 ms × 2,220 calls; `appointments.*` 655 ms × 1,682; `clients.*` 444 ms × 2,395; `sale_items.*` 403 ms × 2,327; `client_services.*` 332 ms × 2,412 (**~5,170 s total**) | Yes, everything |
| **Sync History** | Last runs + usage panel (1 summary call) | — | Light | No |

### 1.3 Calculations that run in the browser

| Calculation | What it reads | Why it is heavy | Proposal |
|---|---|---|---|
| Sales by date with FIFO (Margin by Service, sale basis; Reconciliation) | Period sales, items, payments, then **for every client with a payment-on-account sale, that client's whole sale history**, loaded one client after another | One-client-at-a-time history load (round trips grow with the number of such clients), plus FIFO matching loops over credits and debits | Store each client's account balance and FIFO position at the end of each month (Part 3) so the browser only replays the selected period |
| Visit pricing (visit basis, Margin by Staff) | Visits → packages → pricing options → items by `payment_ref_id` | Lookup by `payment_ref_id` takes 206 ms per chunk | Index check plus precompute per month (Part 3) |
| Client segments | All clients + visits + sales | Rules applied to 6,252 clients | Precompute nightly |
| Studio obligations | All client packages | Recomputed on every Overview open | Nightly snapshot (the `obligation_snapshots` table already exists, but is empty) |

---

## Part 2 — Database

### 2.1 Top queries by total DB time (21 days)

| # | Query (shortened) | Calls | Mean ms | Total s | Comment |
|---|---|---|---|---|---|
| 1 | `clients (id, first_name, last_name)` whole table, paged | **266,965** | 23.8 | **6,341** | By far the biggest DB load. About 12,700 calls a day; the clients table was fully scanned 269,581 times (928 million rows read). The code that sends it is one of: the whole-table name lists in Admin raw tables, Campaigns client matching, or a loop. **Confirm in Step 0.** |
| 2 | `sale_items` by `payment_ref_id = ANY(...)` | 6,280 | 206 | 1,295 | Margin pages; likely no suitable index |
| 3 | `sales.*` whole table + exact count | 2,220 | 570 | 1,265 | Admin Sales Journal |
| 4 | `appointments.*` whole table + count | 1,682 | 655 | 1,102 | Admin Appointments |
| 5 | `clients.*` whole table + count | 2,395 | 444 | 1,062 | Admin raw table |
| 6 | `sale_items.*` whole table + count | 2,327 | 403 | 938 | Admin raw table |
| 7 | `client_services.*` whole table + count | 2,412 | 332 | 800 | Admin raw table |
| 8 | `staff_session_types` | 61,315 | 10.7 | 655 | Reference data reloaded over and over (pages + sync) |
| 9 | `appointments` (id, client, staff …) | 2,326 | 260 | 606 | Margin / Client Card |
| 10 | `sales.total` whole table | 2,376 | 200 | 474 | Header stats that are never shown |
| 11 | `sale_items` (id, sale_id, item_id …) | 4,689 | 96.5 | 452 | Sales by date |
| 12 | `staff_schedule_items` | 694 | 640 | 444 | Staff schedule (29 MB table) |
| 13 | `appointments.*` (second variant) | 2,851 | 139 | 397 | — |
| 14 | `client_services` (id, mindbody_id …) | 844 | 458 | 386 | Expiring Packages / sync |
| 15 | `transactions.*` | 1,896 | 144 | 273 | Admin raw table |
| 16 | `client_services` (mindbody_id, pricing_option_id) | 11,472 | 19.9 | 228 | Visit pricing chunks |
| 17 | `appointments` (client_id, start, location) | 2,510 | 84 | 211 | Sleeping Clients / Segments |
| 18 | `staff_session_types` (variant) | 6,457 | 26.4 | 170 | — |
| 19 | `sales` (id, client_id, sale_datetime) by filter | 788 | 204 | 161 | FIFO history per client |
| 20 | `pricing_options` | 33,166 | 4.6 | 151 | Reference data reloaded |

Total traffic: about **883,000 requests to the database API in 21 days (~42,000 per day)** for a team-sized app. Most of these are whole-table reads and repeated reference lookups.

### 2.2 Indexes

| Finding | Measured | Fix | Risk | Effort |
|---|---|---|---|---|
| Lookup by `sale_items.payment_ref_id` is slow | 206 ms per chunk | Check for an index on `payment_ref_id` and add one if missing | None (read speed only) | Small |
| Full scans on `clients` | 269,581 scans | Remove the repeated whole-table reads (Part 4); then the name search needs a name index | None | Small |
| Duplicate, never-used indexes | `pricing_option_session_types`: 5 unused (3 on the same column); `staff_session_types`: 4 unused (2 pairs of duplicates); `appointments.session_type` unused (264 KB) | Drop the duplicates after a second check | Low (slower sync writes only) | Small |
| Filters the app uses most (sale date, visit start, client_id, staff_id, location_id, stale, run_id) | Already served by index scans (index scans on appointments 265k, sales 172k, payments 249k) | No action | — | — |

### 2.3 Table sizes and growth

Database total: **319 MB**.

| Table | Size | Of which raw JSON (TOAST) | Growth | Note |
|---|---|---|---|---|
| `api_logs` | **94 MB** | 90 MB | Sep: 48 MB, Oct (12 days): 30 MB | Stores full API responses |
| `api_raw_data` | **78 MB** | 75 MB | Sep: 43 MB, Oct: 29 MB | Raw copies of API data |
| `staff_schedule_items` | 29 MB | — | Rebuilt each sync | 13,746 rows, ~2 KB each |
| `appointments` | 22 MB | — | ~0.6–1 MB/month | Contains raw data column |
| `clients` | 21 MB | — | Small | ~3 KB per client (raw data) |
| `sale_items`, `sales`, `transactions` | 17 / 16 / 12 MB | — | ~0.5–1 MB/month each | — |
| `sync_logs` | 0.4 MB | — | ~70 KB/month | Keep |
| `mindbody_api_calls` | 0.1 MB | — | ~2,300 rows/month expected | Keep 180 days |
| `cron.job_run_details` + net responses | 2 MB | — | Grows every 30 min | Keep 14 days |

**The two logs are 172 MB, 54% of the database, and they grow about 70–90 MB a month.** The business data grows only about 3–5 MB a month.

Proposed retention (deletes old log rows only; no report reads them):

| Data | Keep |
|---|---|
| `api_logs` response bodies | 30 days (keep the row summaries for 90 days) |
| `api_raw_data` | 30 days |
| `mindbody_api_calls` | 180 days |
| `cron.job_run_details` | 14 days |
| `sync_logs`, reconciliation tables | Keep everything (tiny) |

Expected result: the database levels off at about 160 MB instead of growing to about 1.3 GB over 12 months.

### 2.4 Plan headroom

The plan tier is not visible from inside the database. The table assumes the free tier (500 MB database); Pro allows 8 GB.

| Resource | Now | In 12 months, no change | In 12 months, with retention |
|---|---|---|---|
| Database size | 319 MB | ~1.3 GB (**over 500 MB in ~2–3 months**) | ~160–200 MB |
| Database API traffic | ~42k requests/day, mostly whole tables | Grows with data | Large drop after Part 4 fixes |
| Edge Function run time | Longest step 96.5 s (pricing links) | Rises slowly with data | Pricing links rebuild now runs weekly/monthly |

Download volume (egress) is not visible from SQL. It should be checked on the Supabase usage page.

### 2.5 Queries that load whole tables when only a period is needed

1. The Admin raw tables load the whole sales, visits, sale items, client services and transactions tables, with exact counts. They should load one page at a time, filtered by the selected period, with server-side search.
2. The header stats read every sale's total, and the result is never shown.
3. Reference tables (staff, locations, pricing options, session types, staff rates) are loaded in full by every page separately. They are small, but there are tens of thousands of calls.
4. The client name list is loaded whole for name lookups (query #1). It should look up only the ids on screen.
5. Studio obligations read all packages on every Overview open.

---

## Part 3 — Precomputation candidates

Pattern, same as Overview totals: store the results nightly, recalculate the last 3 months each night, and compare stored against live for the same month in Reconciliation.

| Candidate | Today (DB side) | After | Storage | Risk | Effort |
|---|---|---|---|---|---|
| **Client account balance / FIFO position at each month end** | The browser replays each payment-on-account client's whole history, one client at a time | The browser starts from the stored month-end position and replays only the period. Request count no longer grows with history | ~6k clients × ~12 months, small rows: < 2 MB/year | Medium. FIFO must match exactly; check by recomputing the full history for 2 closed months and comparing to the cent | Medium |
| **Margin by Service, sale basis, per month × location** | Tens of chunk requests + FIFO per open; year view ~100+ requests | 1 request (~36 rows per year per location) | < 1 MB | Low–medium. Last 3 months recomputed nightly; Reconciliation compares live and stored | Medium |
| **Margin by Service, visit basis, and Margin by Staff, per month** | 8 visit pages + ~70 chunks for a year | 1 request | < 1 MB | Low | Medium |
| **Studio obligations** | All 3,255 packages read each Overview open | Nightly snapshot (the `obligation_snapshots` table already exists and is empty) | Tiny | Low | Small |
| **Client segments** | Rules over all clients in the browser | Nightly segment per client (6k rows) | < 1 MB | Low (no money) | Small–medium |
| **Campaign results** | Recomputed from sales/visits each open | Store after each list upload + nightly refresh | Tiny | Low | Small |
| **Sleeping clients' last visit** | Visits scanned in the browser | Nightly "last visit per client" (6k rows) | Tiny | Low | Small |

Money figures stay identical: the stored results come from the same calculation code, and Reconciliation flags any difference.

---

## Part 4 — Front end

| # | Finding | Measured | Fix | Gain | Risk | Effort |
|---|---|---|---|---|---|---|
| 4.1 | One bundle | 1,703 KB JS / 483 KB compressed, CSS 59 KB. No page loads on demand | Load pages on demand; split charts and Excel into separate files | ~60–70% less to download before the first screen | Low | Small–medium |
| 4.2 | Charts and Excel always load | Charts are used by Overview, Segments and Linkage Health. Excel is used by ~18 pages, but only when Export is clicked | Load Excel only on Export click; load charts only with the pages that use them | Several hundred KB off the first load | Low | Small |
| 4.3 | Unused libraries | None; all 6 are used | — | — | — | — |
| 4.4 | Pages stay loaded in the background | Every visited page stays in memory, hidden. All hidden pages are re-rendered with the active page's URL settings | Unload heavy pages when hidden, or keep only their filters; pass each page only its own settings | Lower memory use after visiting many pages; fewer hidden re-renders | Low | Small |
| 4.5 | Reference data loaded separately by each page | Staff 53k calls, pricing options 33k, staff↔services 61k, staff rates 65k (some from sync) | Load once per session into a shared store; refresh after sync | Tens of thousands of requests fewer; ~0.3–1 s per page open | Low | Medium |
| 4.6 | Large tables | Admin raw tables render the whole table (thousands of rows); other report tables need checking page by page | Server-side pages of 50–100 rows | Admin pages open in < 1 s instead of several seconds | Low | Medium |
| 4.7 | Shared filter store | Only Appointments uses it; the other five filter groups are never used | Use it on all report pages, or remove it | Consistency | Low | Small |

---

## Part 5 — Sync and server

### 5.1 Step durations, last 14 days (no failures)

| Step | Runs | Avg s | Max s | Note |
|---|---|---|---|---|
| Pricing links | 15 | 73.9 | **96.5** | Closest to the Edge Function time limit; now weekly "new only", full rebuild monthly |
| Sales | 58 | 20.2 | 85.3 | Max is a quarter reload |
| Clients | 16 | 42.5 | 85.3 | Now "changed only" nightly |
| Client services | 16 | 23.0 | 66.9 | Now "changed only" nightly |
| Appointments | 38 | 24.8 | 50.1 | — |
| Overview totals | 6 | 20.7 | 41.3 | — |
| Staff schedule | 7 | 17.1 | 27.4 | — |
| All others | — | < 15 | < 17 | — |

No step failed and none timed out. The longest step (96.5 s) is the one closest to the time limit. With the new schedule it runs less often but still does a full rebuild monthly, so watch it as the number of services grows.

### 5.2 Mindbody API calls vs the free limit

| Day | Calls recorded |
|---|---|
| 2026-10-12 | 66 (test runs) |

The first night on the new schedule is 2026-10-13. The projection from the test runs is about **2,300 calls per billing cycle, inside the free 5,000**. The actual per-step night report is still owed from the previous task and will be added here after that night.

---

## Part 6 — Ease of use

| Task | Who | Steps now | Problems | Simpler way |
|---|---|---|---|---|
| See last month's result | Owner | Opens on Overview (0 clicks), then pick the month (1–2 clicks) | Default is the current month, not the last closed one. The last sync time is loaded but not shown | Default to last closed month at the start of a month; show "Data as of …" |
| Find a client, see balance and obligations | Manager | 1 click to Client Card + search | Search queries the database on each keystroke | Shared, debounced search box at the top of the app |
| Today's call list (expiring + sleeping) | Manager | 2 separate pages, each with its own filters and export | Two lists, two exports | One "Call list today" view combining both with one export |
| Load a lead file, see campaign result | Owner / Manager | 1 click + upload wizard + match review (~4–5 steps) | Results recomputed each time the page opens | Store results after the upload |
| Monthly reconciliation | Admin | Admin group is collapsed, so 2 clicks (or 1 from the amber banner) | — | Fine; add a ✓/✗ badge on the menu item |
| Check last night's sync | Admin | 2 clicks (Admin → Sync History) | Sync status not visible on the first screen | Small "Last sync: 03:12 ✓" badge in the header |

Other checks:

| Area | Finding | Proposal |
|---|---|---|
| Filters and date pickers | Each page has its own filters, and default periods differ | Same picker and same default ("last month") on all report pages |
| Loading indicators | Present on main pages; header stats and menu counters fail silently | Fine once those queries are removed |
| Errors | Red banner with Retry is not used everywhere; some loads only log to the console | Use the red Retry banner on every page |
| Naming | "Client Services" in Admin vs "Expiring Packages" for the same thing; "Staff Pricelist" vs "Staff Rates" vs rates inside "Reference Tables" | Use one name ("Packages"); merge or clearly label the rate pages |
| Menu | Admin shows debug pages (API Logs, Raw API Data, Linkage Health, Sale Items, Pivot Reports) | Move them to an "Advanced" sub-section |
| Mobile | The side menu has a fixed width of 256 px and does not collapse, so on a phone the page area is screen width minus 256 px | Collapsible menu (hamburger) under tablet width |
| Language | Interface is in English | — |
| Sign-in | None; everyone with the link sees all data | A separate decision (security), not speed |

---

## Part 7 — Summary and plan

### 7.1 All findings by visible gain

| Area | Now | After fix | Effort | Risk |
|---|---|---|---|---|
| App start (all pages) | 483 KB compressed download + 5 extra queries | ~150–200 KB + 0 extra | Small–medium | Low |
| Margin by Service, sale basis (year) | ~100+ requests incl. per-client history | 1 request from stored months | Medium | Medium (FIFO check) |
| Margin by Service, visit basis / Margin by Staff (year) | ~80 requests, slow `payment_ref_id` lookups (206 ms each) | Index: ~5–10× faster lookups; precompute: 1 request | Small / Medium | Low |
| Admin raw tables | Whole table + exact count, 330–655 ms DB per page × several pages | 1 page of rows, < 100 ms | Medium | Low |
| Client name lookups | 267k calls, 6,341 s DB time | Only the ids on screen | Small | None |
| Reference data on every page | Tens of thousands of repeat calls | Loaded once per session | Medium | Low |
| Database growth | 172 MB of logs, +70–90 MB/month | Stays around 160–200 MB | Small | Low (old logs only) |
| Overview obligations | All packages each open | Nightly snapshot | Small | Low |
| Mobile | Menu takes 256 px | Collapsible menu | Small | None |

### 7.2 Quick wins (small effort, big gain)

1. Remove the unused header sales-total query and the menu counters (−5 requests on every open; −474 s DB time per 3 weeks).
2. Find and stop the whole-table client name reads (query #1, the largest DB load).
3. Add or confirm the index for `sale_items.payment_ref_id` (Margin pages).
4. Load Excel only when Export is clicked; split pages into on-demand files.
5. Retention for `api_logs` / `api_raw_data` (30 days). Prevents reaching the 500 MB database limit in ~2–3 months.
6. Collapsible menu on phones.

### 7.3 Recommended order of work

Every step has the same checks before and after:
- Page open times (from Step 0).
- Reconciliation ✓.
- Overview, Margin by Service (both bases) and Margin by Staff for September and October identical to the cent.

| Step | Work | Specific check |
|---|---|---|
| 0 | Add a small timing readout (load ms, requests, rows per page); record cold/warm/mobile baselines; confirm the code sending query #1 | Baseline table filled in Part 1 |
| 1 | Quick wins 1–3 (unused queries, client name reads, index) | DB time of the top 3 queries drops; numbers unchanged |
| 2 | On-demand page loading + Excel on demand | Bundle size and first-screen time before/after |
| 3 | Retention for logs | Database size; Sync History and the usage panel still show their data |
| 4 | Shared reference data store | Request count per page open |
| 5 | Admin raw tables: server-side pages | Admin page open time |
| 6 | Nightly obligations snapshot, segments, sleeping clients | Overview/Segments numbers match live |
| 7 | Monthly stored Margin results (visit basis, staff) | Reconciliation compares stored and live for the last 3 months |
| 8 | Month-end FIFO positions + stored sale-basis margin | Full-history recompute equals stored for 2 closed months, to the cent |
| 9 | Usability: same default period, red Retry banner everywhere, names, menu clean-up, mobile menu | Manual walk-through of the 6 tasks in Part 6 |
