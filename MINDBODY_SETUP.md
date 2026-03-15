# Mindbody Analytics System - Setup Guide

## Overview
This system syncs all data from your Mindbody account and provides comprehensive reporting, pivot tables, charts, and Excel export capabilities.

## Mindbody API Authentication

Mindbody API v6 uses two levels of authentication:

### 1. Source Credentials (Required - Already Configured ✓)

These credentials provide access to most read-only endpoints:

- **MINDBODY_API_KEY**: `c4361d92b8844115a8047a410c095a7c`
- **MINDBODY_SOURCE_NAME**: `SIAINNOVITA`
- **MINDBODY_SOURCE_PASSWORD**: `5G/5BWOrnh4YpKJ/YWljvW3tfF0=`
- **MINDBODY_SITE_ID**: `197179`

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
- **Automatic Daily Sync**: Set up a cron job to call the daily-sync endpoint

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

## Setting Up Daily Automatic Sync

### Option 1: Using a Cron Service (Recommended)

Use a free cron service like cron-job.org or EasyCron:

1. Sign up for a free account at https://cron-job.org
2. Create a new cron job with:
   - URL: `https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/daily-sync`
   - Schedule: Daily at your preferred time (e.g., 2:00 AM)
   - Method: POST
   - Headers:
     - `Authorization: Bearer YOUR_SUPABASE_ANON_KEY`
     - `Content-Type: application/json`

### Option 2: Using Supabase Scheduled Functions (If Available)

If you have access to Supabase's scheduled functions feature, you can configure it to run daily-sync automatically.

### Option 3: Using Your Own Server

Set up a cron job on your server:

```bash
0 2 * * * curl -X POST \
  https://0ec90b57d6e95fcbda19832f.supabase.co/functions/v1/daily-sync \
  -H "Authorization: Bearer YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json"
```

## Data Retention

The system stores the last 3 months of historical data by default. You can modify the date ranges in the edge function if you need different retention periods.

## Troubleshooting

### Sync Fails
1. Check that all Mindbody credentials are correctly configured
2. Verify your Mindbody API key is active
3. Check the Sync History tab for error messages

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
- **Daily Sync**: `POST /functions/v1/daily-sync`

## Support

For Mindbody API documentation, visit:
https://developers.mindbodyonline.com/

For questions about this system, check the sync history and error logs in the dashboard.
