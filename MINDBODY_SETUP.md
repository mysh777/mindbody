# Mindbody Analytics System - Setup Guide

**Last updated:** 2026-10-08

## Overview
This system syncs data from your Mindbody account every night and provides owner reports, pivot tables, Excel export and PDF printing. Page list: see README.md.

## Mindbody API Authentication

Mindbody API v6 uses two levels of authentication:

### 1. Source Credentials (Required - Already Configured ✓)

These credentials provide access to most read-only endpoints:

- **MINDBODY_API_KEY**: `<YOUR_API_KEY>`
- **MINDBODY_SOURCE_NAME**: `<YOUR_SOURCE_NAME>`
- **MINDBODY_SOURCE_PASSWORD**: `<YOUR_SOURCE_PASSWORD>`
- **MINDBODY_SITE_ID**: `<YOUR_SITE_ID>`

✓ These are already configured and working!

### 2. Staff Credentials (Required)

- **MINDBODY_STAFF_USERNAME**, **MINDBODY_STAFF_PASSWORD**

The sync exchanges these for a user token (`POST /usertoken/issue`). The token is required for sales, appointments, client_services, pricing_options, staff_services and staff_schedule. Without it those steps are skipped.

## Features

### 1. Data Synchronization
- **Manual Sync**: Admin → Sync Data page, one button per step or a full sync
- **Automatic Daily Sync**: Runs automatically via scheduled jobs (see below)

### 2. Synced Data Types
- Sites, locations, staff
- Service categories (`programs` step), session types (`services` step), staff services and pay rates
- Pricing options and pricing option ↔ session type links
- Clients and client services (packages, memberships, remaining visits)
- Appointments (per staff member)
- Sales, sale items and payments (by quarter)
- Packages, retail products
- Transactions and client visits are no longer synced (not in the nightly run or the full sync). Existing rows stay in the database; both steps can still be run on request by `syncType`.
- Staff schedule (availability / unavailability, table `staff_schedule_items`)

### 3. Reporting Features
- Owner reports: Overview, Client Card, Expiring Packages, Sleeping Clients, Client Segments, Margin by Service, Margin by Staff
- Admin tables, Pivot Reports, Excel export, PDF printing
- **Reconciliation**: checks dashboard figures against Mindbody reports (see RECONCILIATION_RULES.md)
- **Sync History**: every sync step and its status

## Automatic Daily Sync

Automatic synchronization runs every day between **03:00 and 03:36 UTC**, broken into 19 separate data steps, followed by the Overview totals job at 03:45.

The `programs`, `transactions` and `client_visits` steps were removed from the schedule on 2026-10-08 (service categories are refreshed by the `services` step). Each step syncs one data type and runs as an independent job. This ensures every step completes within the platform's time limit (150 seconds per call).

### Schedule

| Time (UTC) | Data type          | Typical duration |
|------------|--------------------|-----------------|
| 03:00      | sites              | ~2s             |
| 03:01      | locations          | ~2s             |
| 03:02      | staff              | ~2s             |
| 03:04      | services           | ~7s             |
| 03:05      | staff_services     | ~10s            |
| 03:06      | pricing_options 1/3 (offset 0)   |  |
| 03:08      | pricing_options 2/3 (offset 100) |  |
| 03:10      | pricing_options 3/3 (offset 200) |  |
| 03:12      | build_pricing_links|                 |
| 03:15      | clients            |                 |
| 03:18      | client_services    |                 |
| 03:21      | appointments       |                 |
| 03:23      | sales Q1 (Jan-Mar) |                 |
| 03:25      | sales Q2 (Apr-Jun) |                 |
| 03:27      | sales Q3 (Jul-Sep) |                 |
| 03:29      | sales Q4 (Oct-Dec) |                 |
| 03:34      | packages           |                 |
| 03:35      | retail_products    |                 |
| 03:36      | staff_schedule     |                 |
| 03:45      | overview-totals (separate function, fills `overview_monthly_totals`; on the 1st of each month also saves the obligations total for the last day of the previous month to `obligation_snapshots`) | |

Sales (by quarter) and pricing options (by 100 rows) are split into chunks because a single call would exceed the 150-second limit. All other data types sync in a single call.

A safety job (`cleanup-stuck-sync-logs`) runs every 30 minutes to mark any sync that has been stuck for more than 10 minutes as timed out.

### Monitoring

Check the **Sync History** page in the app to see each step's status. Every step creates its own log entry, so you can tell exactly which data types succeeded and which ones had issues. Statuses: `started`, `completed`, `partial` (some records skipped), `error`, `timeout` (set by the safety job).

### Changing the schedule

To shift the entire sync window (e.g., to 05:00 UTC instead of 03:00), update each job's cron expression via the Supabase SQL Editor. Example for one job:

```sql
SELECT cron.unschedule('sync-sites');
SELECT cron.schedule('sync-sites', '0 5 * * *',
  $$SELECT net.http_post(
    url := 'https://zwahnnfwcaqmcsnlqqtg.supabase.co/functions/v1/mindbody-sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"syncType": "sites"}'::jsonb
  );$$
);
```

To see all scheduled jobs: `SELECT jobname, schedule FROM cron.job ORDER BY jobid;`

## Data Retention

Sales and appointments are kept from January 2025 onwards (2025 was back-filled once). The nightly run refreshes the current year: sales by quarter, appointments for the configured window. Older data is not deleted.

## Troubleshooting

### Sync Fails
1. Check that all Mindbody credentials are correctly configured
2. Verify your Mindbody API key is active
3. Check the Sync History tab for error messages

### Individual Step Times Out
Some heavier data types (sales, pricing_options, client_services) may occasionally exceed the 150-second limit. This is normal -- the data will be caught on the next daily run or a manual sync for that specific type.

### Missing Data
1. Ensure data exists in Mindbody for the date ranges being synced
2. Check that your Mindbody account has the necessary permissions
3. Review the sync logs for any errors

### Performance
- Initial sync may take several minutes depending on data volume
- Subsequent syncs are incremental and faster
- Large datasets (>10,000 records) may take longer to load in pivot tables

## API Endpoints

- **Sync steps**: `POST /functions/v1/mindbody-sync` with `{"syncType": "<step>"}`
- **Overview totals**: `POST /functions/v1/overview-totals`
- **Activation code**: `POST /functions/v1/get-activation-code`

## Support

For Mindbody API documentation, visit:
https://developers.mindbodyonline.com/

For questions about this system, check the sync history and error logs in the dashboard.
