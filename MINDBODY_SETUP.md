# Mindbody Analytics System - Setup Guide

## Overview
This system syncs all data from your Mindbody account and provides comprehensive reporting, pivot tables, charts, and Excel export capabilities.

## Mindbody API Authentication

Mindbody API v6 uses two levels of authentication:

### 1. Source Credentials (Required - Already Configured ✓)

These credentials provide access to most read-only endpoints:

- **MINDBODY_API_KEY**: `<YOUR_API_KEY>`
- **MINDBODY_SOURCE_NAME**: `<YOUR_SOURCE_NAME>`
- **MINDBODY_SOURCE_PASSWORD**: `<YOUR_SOURCE_PASSWORD>`
- **MINDBODY_SITE_ID**: `<YOUR_SITE_ID>`

✓ These are already configured and working!

### 2. Staff Credentials (Optional - For Write Operations)

Staff credentials are only needed if you want to:
- Modify client data (add/update clients)
- Book appointments or classes
- Process sales/payments
- Access sensitive staff information

For read-only operations (which this system uses), Staff credentials are NOT required.

**Current Status**: The system works with Source Credentials only for all data synchronization.

## Features

### 1. Data Synchronization
- **Manual Sync**: Click "Sync Now" button in the dashboard
- **Automatic Daily Sync**: Runs automatically via scheduled jobs (see below)

### 2. Synced Data Types
- Clients (contact information, demographics)
- Appointments (bookings, schedules)
- Classes (class schedules, descriptions)
- Class Visits (client class attendance)
- Sales (transactions, revenue)
- Staff (team members)
- Locations (studio locations)
- Products (retail items)
- Services (pricing options)

### 3. Reporting Features
- **Data Tables**: View and filter all synced data
- **Pivot Tables**: Create custom pivot analysis with configurable rows, columns, and aggregations
- **Charts**: Visualize trends (monthly revenue, appointments by staff, clients by location)
- **Excel Export**: Export any view to CSV/Excel format
- **Sync History**: Track all sync operations and their status

## Automatic Daily Sync

Automatic synchronization runs every day between **03:00 and 03:32 UTC**, broken into 19 separate steps. Each step syncs one data type and runs as an independent job. This ensures every step completes within the platform's time limit (150 seconds per call).

### Schedule

| Time (UTC) | Data type          | Typical duration |
|------------|--------------------|-----------------|
| 03:00      | sites              | ~2s             |
| 03:01      | locations          | ~2s             |
| 03:02      | staff              | ~2s             |
| 03:03      | programs           | ~2s             |
| 03:04      | services           | ~7s             |
| 03:05      | staff_services     | ~10s            |
| 03:06      | pricing_options    | ~122s           |
| 03:09      | build_pricing_links| ~67s            |
| 03:12      | clients            | ~39s            |
| 03:15      | client_services    | ~48s            |
| 03:18      | appointments       | ~32s            |
| 03:20      | sales Q1 (Jan-Mar) | ~58s            |
| 03:22      | sales Q2 (Apr-Jun) | ~57s            |
| 03:24      | sales Q3 (Jul-Sep) | ~55s            |
| 03:26      | sales Q4 (Oct-Dec) | ~1s (future)    |
| 03:28      | transactions       | ~15s            |
| 03:30      | client_visits      | ~2s             |
| 03:31      | packages           | ~3s             |
| 03:32      | retail_products    | ~5s             |

Sales is split into quarterly chunks because a full-year sync exceeds the 150-second limit. All other data types sync in a single call.

A safety job (`cleanup-stuck-sync-logs`) runs every 30 minutes to mark any sync that has been stuck for more than 10 minutes as timed out.

### Monitoring

Check the **Sync History** page in the app to see each step's status. Every step creates its own log entry, so you can tell exactly which data types succeeded and which ones had issues.

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

The system stores the last 3 months of historical data by default. You can modify the date ranges in the edge function if you need different retention periods.

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

- **Manual Sync**: `POST /functions/v1/mindbody-sync`
- **Daily Sync (legacy wrapper)**: `POST /functions/v1/daily-sync`

## Support

For Mindbody API documentation, visit:
https://developers.mindbodyonline.com/

For questions about this system, check the sync history and error logs in the dashboard.
