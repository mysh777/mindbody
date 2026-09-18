# System Reference: Database Structure & Mindbody API Mapping

**Last updated:** 2026-09-16
**Purpose:** Single source of truth for all known schema details, Mindbody API behaviour, field mappings, quirks, and structural issues discovered during the project. Prevents re-investigating the same surprises.

---

## 1. Database Schema

28 tables in `public` schema. Tables grouped by domain.

### ID Convention

Most tables use a dual-ID pattern:
- `id` (text or uuid) — internal primary key, often set to the Mindbody ID as text, or a generated UUID.
- `mindbody_id` (text, unique) — the Mindbody-side identifier, stored as text even when numeric.

**Critical quirk:** `pricing_options` uses `id` as UUID (auto-generated) and `mindbody_id` as text. Foreign keys TO pricing_options (e.g. `client_services.pricing_option_id`) store the UUID, not the mindbody_id. All other FK references between tables use mindbody_id-as-text stored in the `id` column.

### 1.1 Clients & Client Data

#### `clients` (~6,165 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | Set to Mindbody client ID (e.g. "100006051") |
| mindbody_id | text UNIQUE | NO | Same value as `id` |
| first_name | text | YES | From `FirstName` |
| last_name | text | YES | From `LastName` |
| email | text | YES | From `Email` |
| mobile_phone | text | YES | From `MobilePhone` |
| home_phone | text | YES | From `HomePhone` |
| address_line1..postal_code | text | YES | Address fields |
| country | text | YES | ISO code (e.g. "LV") |
| birth_date | date | YES | |
| gender | text | YES | "None", "Male", "Female" |
| status | text | YES | From `Status`. Values: "Non-Member", "Active", etc. This IS meaningful (unlike client_services.status) |
| is_company | boolean | YES | |
| liability_release | boolean | YES | |
| emergency_contact_name | text | YES | |
| emergency_contact_phone | text | YES | |
| creation_date | timestamptz | YES | Client creation in Mindbody |
| last_modified_date | timestamptz | YES | |
| raw_data | jsonb | YES | Full Mindbody response |
| synced_at | timestamptz | YES | Last sync timestamp |
| created_at | timestamptz | YES | Row creation in our DB |

**Known quirk:** Mindbody returns `Active` (boolean) per client, but we have no `active` column. The value is in `raw_data->'Active'`. Low impact — inactive clients simply stop having appointments.

**Not stored:** `AccountBalance`, `FirstAppointmentDate`, `FirstClassDate`, `MembershipIcon`, `IsProspect`, `ProspectStage`, `SalesReps`, `RedAlert`, `YellowAlert`, `ClientType`, `HomeLocation`, `PhotoUrl`, `SendAccountEmails/Texts`, `SendPromotionalEmails/Texts`, `SendScheduleEmails/Texts`, `LockerNumber`. All available in `raw_data`.

#### `client_services` (~2,945 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | Auto-generated |
| mindbody_id | text UNIQUE | YES | Mindbody service instance ID (e.g. "281387") |
| client_id | text | NO | References clients by mindbody_id (no FK constraint) |
| product_id | text | NO | Mindbody ProductId — links to pricing_options.mindbody_id |
| pricing_option_id | uuid FK | YES | References `pricing_options.id` (UUID). Populated by Fix 2b migration via product_id join |
| name | text | YES | Service name (e.g. "EMS Sculptor - 10 proc.") |
| payment_date | timestamptz | YES | When client paid |
| active_date | timestamptz | YES | When service activated |
| expiration_date | timestamptz | YES | When service expires |
| count | integer | YES | Total sessions in package |
| remaining | integer | YES | Sessions left |
| current | boolean | YES | **THE real active indicator.** True = Mindbody considers it current |
| program_id | text | YES | Mindbody Program.Id |
| program_name | text | YES | Mindbody Program.Name |
| status | text | YES | **ALWAYS "Inactive" — USELESS FIELD.** Mindbody does not return a Status field in /client/clientservices. Sync defaults to "Inactive" |
| activation_type | text | YES | "OnPurchase" etc. |
| raw_data | jsonb | YES | |
| synced_at, created_at, updated_at | timestamptz | YES | |

**Critical quirks:**
1. `status` is meaningless — always "Inactive" for all 2,945 rows. Real active check: `current = true AND expiration_date > now()`.
2. `current = true` does NOT guarantee active — expired services retain `current = true` because Mindbody removes them from the API entirely rather than first setting `Current = false`. Our DB keeps the last-synced state.
3. Mindbody's `/client/clientservices` only returns **current** services. Expired/fully-used services disappear from the API. Our DB retains them from previous syncs — this is **intentional and correct** for historical pricing.
4. `pricing_option_id` is populated via a data migration (Fix 2b) that joins `product_id` to `pricing_options.mindbody_id`. Not populated directly from Mindbody.

**Not stored from raw_data:** `Action`, `SiteId`, `CannotPayForClassesBeforeActivation`, `Returned`, `Program` (nested object — we extract `program_id` and `program_name`).

#### `client_visits` (~0 rows, mostly unused)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | |
| visit_id | text UNIQUE | YES | |
| mindbody_id | text UNIQUE | YES | |
| client_id | text | NO | |
| class_id | text | YES | |
| visit_datetime | timestamptz | NO | |
| service_id | text | YES | This is the client_service mindbody_id |
| service_name | text | YES | |
| session_type_id | text FK→session_types | YES | |
| location_id | text FK→locations | YES | |
| staff_id | text FK→staff | YES | |
| signed_in, make_up, late_cancelled, web_signup | boolean | YES | |
| appointment_id | text | YES | |
| appointment_status | text | YES | |
| raw_data | jsonb | YES | |
| synced_at, created_at, updated_at | timestamptz | YES | |

**Note:** This table is populated from `/client/clientvisits` endpoint but appears to have ~0 rows. The primary visit data comes from `appointments` (via `/appointment/appointments`).

#### `client_complete_info_snapshots` (~0 rows)

Stores full client info snapshots. Rarely used.

### 1.2 Appointments

#### `appointments` (~7,822 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | Set to Mindbody appointment ID |
| mindbody_id | text UNIQUE | NO | Same value as `id` |
| client_id | text FK→clients | YES | Mindbody ClientId as text |
| staff_id | text FK→staff | YES | Mindbody StaffId as text |
| location_id | text FK→locations | YES | Mindbody LocationId as text |
| session_type_id | text FK→session_types | YES | Mindbody SessionTypeId as text |
| start_datetime | timestamptz | NO | |
| end_datetime | timestamptz | NO | |
| duration_minutes | integer | YES | |
| status | text | YES | "Completed", "Booked", etc. |
| notes | text | YES | |
| first_appointment | boolean | YES | |
| client_service_id | text | YES | **Mindbody ClientServiceId** — matches `client_services.mindbody_id`. NOT a UUID, NOT an FK |
| raw_data | jsonb | YES | Full Mindbody response |
| synced_at, created_at, updated_at | timestamptz | YES | |

**Critical detail:** `client_service_id` stores the Mindbody service instance ID (e.g. "281387") which maps to `client_services.mindbody_id`. There is no formal FK constraint — the join is: `appointments.client_service_id = client_services.mindbody_id`.

**Not stored:** `ProgramId`, `ProviderId`, `Resources`, `IsWaitlist`, `StaffRequested`, `WaitlistEntryId`, `GenderPreference`, `OnlineDescription`. Available in `raw_data`.

#### `appointment_addons` (~0 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | |
| appointment_id | text FK→appointments | YES | ON DELETE CASCADE |
| addon_id | text | YES | |
| addon_name | text | NO | |
| addon_price | numeric(10,2) | YES | |
| created_at | timestamptz | YES | |

### 1.3 Service Catalog

#### `service_categories` (~17 rows)

Maps to Mindbody "Programs". 

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | Set to Mindbody Program Id |
| mindbody_id | text UNIQUE | NO | |
| name | text | NO | e.g. "MASAZAS UN SEJA", "ENDOTHERAPY" |
| description | text | YES | |
| active | boolean | YES | |
| created_at, updated_at | timestamptz | YES | |

#### `service_subcategories` (~0 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | |
| mindbody_id | text UNIQUE | YES | |
| category_id | text FK→service_categories | YES | |
| name | text | NO | |
| description | text | YES | |
| active | boolean | YES | |
| raw_data | jsonb | YES | |
| synced_at, created_at, updated_at | timestamptz | YES | |

#### `session_types` (~138 rows)

The core service catalog. Named "session types" in Mindbody API.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | Set to Mindbody SessionType Id |
| mindbody_id | text UNIQUE | NO | |
| name | text | NO | e.g. "EMS Sculptor 30 min" |
| service_category_id | text FK→service_categories | YES | From ProgramId |
| default_duration_minutes | integer | YES | From DefaultTimeLength |
| description | text | YES | |
| active | boolean | YES | |
| online_booking_enabled | boolean | YES | |
| program_id | text | YES | Mindbody ProgramId as text |
| category_id | text FK→service_categories | YES | From Category object |
| category_name | text | YES | |
| subcategory_id | text FK→service_subcategories | YES | |
| subcategory_name | text | YES | |
| num_deducted | integer | YES | Sessions deducted per visit |
| type | text | YES | |
| staff_time_length | integer | YES | |
| available_for_add_on | boolean | YES | |
| online_description | text | YES | |
| raw_data | jsonb | YES | |
| created_at, updated_at | timestamptz | YES | |

#### `pricing_options` (~218 rows)

Maps to Mindbody "Services" (sale/services endpoint — confusingly named).

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | **Auto-generated UUID** — NOT the Mindbody ID |
| mindbody_id | text UNIQUE | NO | Mindbody Service Id (also = ProductId in most cases) |
| name | text | NO | |
| price | numeric(10,2) | YES | Package price |
| online_price | numeric(10,2) | YES | |
| session_count | integer | YES | From `Count` — number of sessions in package |
| expiration_days | integer | YES | |
| product_id | text | YES | Mindbody ProductId. For most records = mindbody_id. Fix 2b filled NULLs |
| program_id | text FK→service_categories | YES | |
| program_name | text | YES | |
| service_type | text | YES | "Series", "Class", etc. From `Type` |
| active | boolean | YES | |
| discontinued | boolean | YES | |
| tax_included | boolean | YES | |
| tax_rate | numeric(5,2) | YES | |
| sold_online | boolean | YES | |
| revenue_category | text | YES | |
| priority | text | YES | |
| is_intro_offer | boolean | YES | |
| membership_id | text | YES | |
| expiration_type | text | YES | "SaleDate", etc. |
| expiration_unit | text | YES | "Months", "Days", etc. |
| expiration_length | integer | YES | |
| intro_offer_type | text | YES | |
| use_at_location_ids | jsonb | YES | |
| sell_at_location_ids | jsonb | YES | |
| sale_in_contract_only | boolean | YES | |
| restrict_to_membership_ids | jsonb | YES | |
| is_third_party_discount_pricing | boolean | YES | |
| apply_member_discounts_of_membership_ids | jsonb | YES | |
| raw_data | jsonb | YES | |
| synced_at | timestamptz | YES | |

**Critical quirk:** `mindbody_id` and `product_id` are often the same value but not always. The Fix 2b migration filled `product_id` NULLs from raw_data. `client_services.product_id` maps to `pricing_options.mindbody_id` (or `pricing_options.product_id`).

#### `pricing_option_session_types` (~2,686 rows)

Junction table: which pricing options can pay for which session types.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | |
| pricing_option_id | uuid FK→pricing_options | YES | ON DELETE CASCADE |
| session_type_id | text FK→session_types | YES | ON DELETE CASCADE |
| created_at | timestamptz | YES | |

UNIQUE on (pricing_option_id, session_type_id).

### 1.4 Staff

#### `staff` (~30 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | Set to Mindbody Staff Id |
| mindbody_id | text UNIQUE | NO | |
| first_name | text | YES | |
| last_name | text | YES | |
| email | text | YES | From `Email` in raw_data |
| mobile_phone | text | YES | |
| home_phone | text | YES | |
| address fields | text | YES | |
| bio | text | YES | |
| is_male | boolean | YES | |
| sort_order | integer | YES | |
| is_independent_contractor | boolean | YES | |
| always_allow_double_booking | boolean | YES | |
| phone | text | YES | Added later, meaning not documented |
| role | text | YES | Added later, meaning not documented |
| raw_data | jsonb | YES | |
| synced_at, created_at | timestamptz | YES | |

**Known quirk:** Mindbody returns `Active` (boolean) for staff but we don't store it as a column. Available in `raw_data->'Active'`. Also stores `DisplayName`, `EmpID`, `ImageUrl`, `EmploymentStart/End`, `DefaultClassPayRate`, `Appointments`, `Availabilities`, `Unavailabilities`, `StaffSettings`, `ProviderIDs` in raw_data.

#### `staff_session_types` (~817 rows)

Which staff can perform which session types.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | |
| staff_id | text FK→staff | YES | ON DELETE CASCADE |
| session_type_id | text FK→session_types | YES | ON DELETE CASCADE |
| active | boolean | YES | |
| is_active | boolean | YES | Duplicate of `active` — meaning not documented |
| location_id | text | YES | |
| duration_override | integer | YES | |
| pay_rate | numeric | YES | Default 0. Manually entered |
| time_length | integer | YES | |
| raw_data | jsonb | YES | |
| synced_at, created_at, updated_at | timestamptz | YES | |

UNIQUE on (staff_id, session_type_id).

#### `staff_appointment_rates` (~0 rows)

Manual rate overrides per staff per session type.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | |
| staff_id | text | NO | |
| session_type_id | text | YES | |
| rate_per_appointment | numeric | YES | Default 0 |
| rate_type | text | YES | Default 'fixed' |
| percentage_rate | numeric | YES | Default 0 |
| notes | text | YES | |
| effective_from | date | YES | Default CURRENT_DATE |
| effective_to | date | YES | |
| created_at, updated_at | timestamptz | YES | |

### 1.5 Sales & Payments

#### `sales` (~7,821 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | Set to Mindbody Sale Id |
| mindbody_id | text UNIQUE | NO | |
| sale_date | timestamptz | YES | |
| sale_time | text | YES | Time portion as text |
| sale_datetime | timestamptz | YES | Combined |
| client_id | text | YES | No FK to clients |
| location_id | text | YES | No FK to locations |
| total | numeric(10,2) | YES | |
| payment_amount | numeric(10,2) | YES | |
| mindbody_sale_id | text | YES | Duplicate of mindbody_id? |
| mindbody_client_id | text | YES | |
| mindbody_location_id | integer | YES | |
| sales_rep_id | text | YES | |
| recipient_client_id | text | YES | |
| original_sale_datetime | timestamptz | YES | |
| raw_data | jsonb | YES | Contains `Payments[]` and `PurchasedItems[]` |
| synced_at, created_at | timestamptz | YES | |

**Note:** Sales raw_data contains nested `Payments` and `PurchasedItems` arrays. These are denormalized into `payments` and `sale_items` tables.

#### `sale_items` (~5,138 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | |
| sale_id | text | NO | References sales.id |
| sale_detail_id | integer UNIQUE | NO | Mindbody SaleDetailId — used for upsert |
| item_type | text | YES | |
| item_id | text | YES | |
| item_name | text | YES | |
| description | text | YES | |
| amount | numeric(10,2) | YES | |
| quantity | integer | YES | |
| discount_amount | numeric(10,2) | YES | |
| discount_percent | decimal(5,2) | YES | |
| tax, tax1..tax5 | decimal(10,2) | YES | |
| tax_amount | decimal(10,2) | YES | |
| unit_price | decimal(10,2) | YES | |
| total_amount | decimal(10,2) | YES | |
| is_service | boolean | YES | |
| returned | boolean | YES | |
| exp_date | timestamptz | YES | |
| active_date | timestamptz | YES | |
| barcode_id | text | YES | |
| category_id | integer | YES | |
| subcategory_id | integer | YES | |
| contract_id | text | YES | |
| payment_ref_id | integer | YES | Maps to client_services.mindbody_id |
| notes | text | YES | |
| gift_card_barcode_id | text | YES | |
| recipient_client_id | text | YES | |
| session_type_id | text FK→session_types | YES | |
| mindbody_id | text | YES | |
| raw_data | jsonb | YES | |
| created_at | timestamptz | YES | |

**Important:** `payment_ref_id` in Mindbody's `PurchasedItems[].PaymentRefId` maps to a `client_services.mindbody_id`. This links a sale to the service package it created.

#### `payments` (~8,091 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | |
| mindbody_id | text UNIQUE | NO | Mindbody Payment Id |
| sale_id | text | YES | References sales |
| mindbody_sale_id | text | YES | |
| type | text | YES | "Visa/MC", "Cash", etc. |
| method | integer | YES | Mindbody payment method code |
| amount | decimal(10,2) | YES | |
| notes | text | YES | |
| transaction_id | text | YES | |
| raw_data | jsonb | YES | |
| created_at, synced_at | timestamptz | YES | |

#### `transactions` (~8,086 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | |
| transaction_id | text UNIQUE | YES | |
| mindbody_id | text UNIQUE | YES | |
| sale_id | text | YES | |
| payment_processor | text | YES | |
| transaction_status | text | YES | |
| amount | numeric(10,2) | YES | |
| transaction_date | timestamptz | YES | |
| raw_data | jsonb | YES | |
| synced_at, created_at, updated_at | timestamptz | YES | |

#### `payment_types` (~0 rows)

Reference table for payment method types. Appears unused.

#### `sale_categories` (system table, no rows of interest)

### 1.6 Products & Packages

#### `products` (~0 rows)

Appears unused in practice. Pricing options serve as the main product reference.

#### `retail_products` (~151 rows)

Physical products sold in the studio.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | |
| mindbody_id | text UNIQUE | NO | |
| name | text | NO | |
| barcode | text | YES | |
| retail_price, online_price, cost | numeric(10,2) | YES | |
| active | boolean | YES | |
| sell_online | boolean | YES | |
| description, category, size, color | text | YES | |
| raw_data | jsonb | YES | |
| created_at, modified_at, synced_at | timestamptz | YES | |

#### `packages` (~0 rows)

From `/sale/packages`. Appears mostly unused.

### 1.7 Reference & Location Data

#### `locations` (~small)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | text PK | NO | |
| mindbody_id | text UNIQUE | NO | |
| name | text | NO | |
| address fields | text | YES | |
| phone | text | YES | |
| latitude, longitude | numeric(10,6) | YES | |
| site_id | text | YES | |
| description | text | YES | |
| has_classes | boolean | YES | |
| tax1..tax5 | numeric | YES | |
| raw_data | jsonb | YES | |
| synced_at, created_at | timestamptz | YES | |

#### `sites` (~small)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | |
| mindbody_id | text UNIQUE | NO | |
| name | text | YES | |
| per_staff_pricing | boolean | YES | |
| description | text | YES | |
| logo_url | text | YES | |
| page_color1..4 | text | YES | |
| accepts_visa/discover/mastercard/amex | boolean | YES | |
| contact_email | text | YES | |
| tax_inclusive_prices | boolean | YES | |
| raw_data | jsonb | YES | |
| synced_at, created_at, updated_at | timestamptz | YES | |

### 1.8 System Tables

#### `sync_logs` (~228 rows)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | |
| sync_type | text | NO | Step name (e.g. "appointments", "client_services") |
| status | text | NO | "started", "completed", "failed" |
| started_at | timestamptz | YES | |
| completed_at | timestamptz | YES | |
| records_synced | integer | YES | |
| error_message | text | YES | |
| raw_response | jsonb | YES | |

#### `api_logs` (~1,172 rows)

Every Mindbody API call logged.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| endpoint | text | Full URL |
| method | text | GET/POST |
| request_body | jsonb | |
| response_status | integer | HTTP status code |
| response_body | jsonb | |
| error_message | text | |
| duration_ms | integer | |
| created_at | timestamptz | |

#### `api_raw_data` (~507 rows)

Full paginated API responses stored as snapshots.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| endpoint_type | text | e.g. "sites", "appointments" |
| response_data | jsonb | |
| record_count | integer | |
| pagination_info | jsonb | |
| synced_at, created_at | timestamptz | |

---

## 2. Mindbody API Endpoints Used

Base URL: `https://api.mindbodyonline.com/public/v6`

### Auth Levels

- **Source Credentials:** Headers `Api-Key` + `SiteId` only. For public catalog data.
- **User Token:** Source Credentials + `Authorization: Bearer <token>`. Required for client/appointment/sales data.

Token obtained via POST `/usertoken/issue` with staff username/password.

### 2.1 POST `/usertoken/issue`

- **Auth:** Direct (Api-Key + SiteId)
- **Body:** `{ "Username": "...", "Password": "..." }`
- **Response key:** `AccessToken` or `Token`
- **Used in:** `getUserToken()`

### 2.2 GET `/site/sites`

- **Auth:** Source Credentials
- **Pagination:** No
- **Response key:** `Sites[]`
- **Used in:** `syncSites()`

### 2.3 GET `/site/locations`

- **Auth:** Source Credentials
- **Pagination:** No
- **Response key:** `Locations[]`
- **Used in:** `syncLocations()`

### 2.4 GET `/staff/staff?limit=N&offset=N&StaffEmail=true`

- **Auth:** Source Credentials
- **Pagination:** Yes (limit=100)
- **Response key:** `StaffMembers[]`
- **Used in:** `syncStaff()`

### 2.5 GET `/site/programs`

- **Auth:** Source Credentials
- **Pagination:** No
- **Response key:** `Programs[]`
- **Used in:** `syncPrograms()`, `syncServiceCategories()`
- **Note:** Called twice in the sync — once for programs table, once for service_categories

### 2.6 GET `/site/sessiontypes?limit=N&offset=N`

- **Auth:** Source Credentials
- **Pagination:** Yes (limit=100)
- **Response key:** `SessionTypes[]`
- **Used in:** `syncSessionTypes()`
- **Sample raw response per item:**
```json
{
  "Id": 250,
  "Name": "Endotherapy 50 min - 60 €",
  "DefaultTimeLength": 60,
  "StaffTimeLength": 50,
  "ProgramId": 15,
  "NumDeducted": 1,
  "CategoryId": null,
  "Category": null,
  "SubcategoryId": null,
  "Subcategory": null,
  "Type": "Appointment",
  "AvailableForAddOn": false,
  "OnlineDescription": "",
  "ResourceRequired": false
}
```

### 2.7 GET `/staff/sessiontypes?request.staffId=X&request.limit=200`

- **Auth:** User Token
- **Pagination:** No (single page)
- **Response key:** Dynamic — finds first array key in response
- **Used in:** `fetchStaffSessionTypesFromApi()`
- **Note:** Also probed as `/staff/staffsessiontypes?staffId=X` in diagnostic mode

### 2.8 GET `/sale/services?limit=N&offset=N`

- **Auth:** User Token
- **Pagination:** Yes (limit=100)
- **Response key:** `Services[]`
- **Maps to:** `pricing_options` table
- **Sample raw response per item:**
```json
{
  "Id": "13253",
  "Name": "Endotherapy 50 min (10 reizes) - 470 €",
  "Type": "Series",
  "Count": 10,
  "Price": 470,
  "OnlinePrice": 470,
  "ProductId": 13253,
  "ProgramId": 15,
  "Program": "ENDOTHERAPY",
  "TaxRate": 0,
  "TaxIncluded": 0,
  "SellOnline": true,
  "Discontinued": false,
  "IsIntroOffer": false,
  "ExpirationType": "SaleDate",
  "ExpirationUnit": "Months",
  "ExpirationLength": 3,
  "Priority": "Medium",
  "RevenueCategory": "Massage",
  "MembershipId": null,
  "UseAtLocationIds": [1, 3],
  "SellAtLocationIds": [1, 3]
}
```
**Naming confusion:** Mindbody calls these "Services" but they are pricing/package options, not session types. Our table is named `pricing_options` to avoid confusion.

### 2.9 GET `/sale/services?request.sessionTypeIds[]=X&request.limit=200`

- **Auth:** User Token
- **Pagination:** No (per session type)
- **Response key:** `Services[]`
- **Used in:** `syncPricingOptionSessionTypeLinks()`
- **Purpose:** Finds which pricing options cover a given session type

### 2.10 GET `/appointment/staffappointments?staffIds=X&startDate=Y&endDate=Z&limit=N&offset=N`

- **Auth:** User Token
- **Pagination:** Yes (limit=200, per staff member)
- **Response key:** `Appointments[]`
- **Used in:** `syncAppointments()` (staff-based variant)

### 2.11 GET `/appointment/appointments?startDate=Y&endDate=Z&limit=N&offset=N`

- **Auth:** User Token
- **Pagination:** Yes (limit=200)
- **Response key:** `Appointments[]`
- **Used in:** `syncAppointmentsDirect()`
- **Sample raw response per item:**
```json
{
  "Id": 372575,
  "ClientId": "100009742",
  "StaffId": 100000022,
  "Staff": { "Id": 100000022, "FirstName": "Milena", "LastName": "Gode", "DisplayName": "Milena" },
  "LocationId": 1,
  "SessionTypeId": 257,
  "StartDateTime": "2025-09-24T09:15:00",
  "EndDateTime": "2025-09-24T10:00:00",
  "Duration": 45,
  "Status": "Completed",
  "ClientServiceId": 275569,
  "Notes": "",
  "ProgramId": 16,
  "FirstAppointment": false,
  "StaffRequested": false,
  "IsWaitlist": false,
  "GenderPreference": "None",
  "AddOns": null,
  "Resources": [],
  "ProviderId": "0"
}
```
**Critical:** This endpoint returns `ClientServiceId` — the link to the client's service package. This is the ONLY reliable source of appointment-to-service linkage.

### 2.12 GET `/client/clients?limit=N&offset=N&searchText=`

- **Auth:** User Token preferred, Source Credentials fallback
- **Pagination:** Yes (limit=200)
- **Response key:** `Clients[]`
- **Used in:** `syncClients()`

### 2.13 GET `/client/clientservices?clientId=X`

- **Auth:** User Token
- **Pagination:** No (per client)
- **Response key:** `ClientServices[]`
- **Used in:** `syncClientServices()`, `backfillOrphanedClientServices()`
- **Sample raw response per item:**
```json
{
  "Id": 277794,
  "Name": "Limfodrenazas masaza 60 min - 55 €",
  "Count": 1,
  "Remaining": 0,
  "Current": false,
  "ProductId": 13245,
  "ActiveDate": "2026-02-02T00:00:00",
  "PaymentDate": "2026-02-02T00:00:00",
  "ExpirationDate": "2027-02-01T00:00:00",
  "ActivationType": "OnPurchase",
  "ClientID": "100000001",
  "SiteId": 197179,
  "Program": { "Id": 3, "Name": "MASAZAS UN SEJA", "ScheduleType": "Appointment" },
  "Action": "None",
  "Returned": false,
  "CannotPayForClassesBeforeActivation": true
}
```
**Known limitations:**
1. **No `Status` field** — our DB defaults to "Inactive", making the column useless.
2. **No `Price` field** — price is on the pricing_option, not on the individual client service.
3. **Only returns current/active services.** Expired or fully-used services disappear from the API.

### 2.14 GET `/sale/sales?startSaleDateTime=X&endSaleDateTime=Y&limit=N&offset=N`

- **Auth:** User Token
- **Pagination:** Yes (limit=200)
- **Response key:** `Sales[]`
- **Used in:** `syncSales()`, `syncTransactions()`
- **Sample raw response per item:**
```json
{
  "Id": 215192,
  "ClientId": "100010294",
  "LocationId": 3,
  "SaleDate": "2026-01-03T00:00:00Z",
  "SaleTime": "10:33:46",
  "SaleDateTime": "2026-01-03T10:33:46Z",
  "OriginalSaleDateTime": "2026-01-03T10:33:46Z",
  "SalesRepId": null,
  "RecipientClientId": 100010294,
  "Payments": [{
    "Id": 216341, "Type": "Visa/MC", "Amount": 34, "Method": 4, "Notes": "", "TransactionId": null
  }],
  "PurchasedItems": [{
    "SaleDetailId": 237319, "Description": "2 nodarbibas 36 EUR",
    "UnitPrice": 34, "TotalAmount": 34, "Quantity": 1,
    "IsService": true, "BarcodeId": "10628", "PaymentRefId": 277248,
    "ActiveDate": "2026-01-03T00:00:00", "ExpDate": "2026-02-03T00:00:00",
    "CategoryId": -5, "DiscountAmount": 0, "DiscountPercent": 0,
    "Tax1": 0, "Tax2": 0, "Tax3": 0, "Tax4": 0, "Tax5": 0, "TaxAmount": 0,
    "Returned": false, "RecipientClientId": 100010294
  }]
}
```
**Note:** `PurchasedItems[].PaymentRefId` is the `client_services.mindbody_id` — it links the sale to the service package it created.

### 2.15 GET `/client/clientvisits?startDate=X&endDate=Y&limit=N&offset=N`

- **Auth:** User Token
- **Pagination:** Yes (limit=100)
- **Response key:** `Visits[]`
- **Used in:** `syncClientVisits()`
- **Known limitations:**
  1. **Only returns Completed visits** — not Booked/future appointments
  2. `ClientServiceId` is **always null** in the response
  3. Service linkage is available as `ServiceId` and `Service.Id` (same value, = client_services.mindbody_id)

### 2.16 GET `/sale/packages?limit=N&offset=N`

- **Auth:** User Token
- **Pagination:** Yes (limit=100)
- **Response key:** `Packages[]`
- **Used in:** `syncPackages()`

### 2.17 GET `/sale/products?limit=N&offset=N`

- **Auth:** User Token preferred, Source Credentials fallback
- **Pagination:** Yes (limit=200)
- **Response key:** `Products[]`
- **Used in:** `syncProducts()`

---

## 3. Database <-> Mindbody Field Mapping

### 3.1 clients

| DB Column | Endpoint | MB Field | Notes |
|-----------|----------|----------|-------|
| id / mindbody_id | /client/clients | `Id` | Stored as text |
| first_name | /client/clients | `FirstName` | |
| last_name | /client/clients | `LastName` | |
| email | /client/clients | `Email` | |
| mobile_phone | /client/clients | `MobilePhone` | |
| home_phone | /client/clients | `HomePhone` | |
| status | /client/clients | `Status` | "Non-Member", "Active", etc. |
| _(not stored)_ | /client/clients | `Active` | Boolean. Available in raw_data |
| creation_date | /client/clients | `CreationDate` | |
| last_modified_date | /client/clients | `LastModifiedDateTime` | |

### 3.2 appointments

| DB Column | Endpoint | MB Field | Notes |
|-----------|----------|----------|-------|
| id / mindbody_id | /appointment/appointments | `Id` | |
| client_id | /appointment/appointments | `ClientId` | |
| staff_id | /appointment/appointments | `StaffId` | |
| location_id | /appointment/appointments | `LocationId` | |
| session_type_id | /appointment/appointments | `SessionTypeId` | |
| start_datetime | /appointment/appointments | `StartDateTime` | |
| end_datetime | /appointment/appointments | `EndDateTime` | |
| duration_minutes | /appointment/appointments | `Duration` | |
| status | /appointment/appointments | `Status` | "Completed", "Booked" |
| client_service_id | /appointment/appointments | `ClientServiceId` | **Same value in /clientvisits is called `ServiceId`** |
| first_appointment | /appointment/appointments | `FirstAppointment` | |
| notes | /appointment/appointments | `Notes` | |

### 3.3 client_services

| DB Column | Endpoint | MB Field | Notes |
|-----------|----------|----------|-------|
| mindbody_id | /client/clientservices | `Id` | |
| client_id | /client/clientservices | `ClientID` | Note: uppercase "ID" |
| product_id | /client/clientservices | `ProductId` | Links to pricing_options |
| name | /client/clientservices | `Name` | |
| payment_date | /client/clientservices | `PaymentDate` | |
| active_date | /client/clientservices | `ActiveDate` | |
| expiration_date | /client/clientservices | `ExpirationDate` | |
| count | /client/clientservices | `Count` | |
| remaining | /client/clientservices | `Remaining` | |
| current | /client/clientservices | `Current` | Boolean |
| program_id | /client/clientservices | `Program.Id` | Nested |
| program_name | /client/clientservices | `Program.Name` | Nested |
| activation_type | /client/clientservices | `ActivationType` | |
| status | _(none)_ | _(absent)_ | **MB does not return Status. Defaults to "Inactive"** |
| pricing_option_id | _(computed)_ | _(none)_ | Populated via Fix 2b: join product_id → pricing_options.mindbody_id |

### 3.4 pricing_options

| DB Column | Endpoint | MB Field | Notes |
|-----------|----------|----------|-------|
| mindbody_id | /sale/services | `Id` | **Note: MB returns as string** |
| name | /sale/services | `Name` | |
| price | /sale/services | `Price` | |
| online_price | /sale/services | `OnlinePrice` | |
| session_count | /sale/services | `Count` | |
| product_id | /sale/services | `ProductId` | Often = Id |
| program_id | /sale/services | `ProgramId` | |
| program_name | /sale/services | `Program` | **String, not object** (unlike clientservices where it's an object) |
| service_type | /sale/services | `Type` | "Series", "Class" |
| tax_rate | /sale/services | `TaxRate` | |
| revenue_category | /sale/services | `RevenueCategory` | |
| expiration_type | /sale/services | `ExpirationType` | |
| expiration_unit | /sale/services | `ExpirationUnit` | |
| expiration_length | /sale/services | `ExpirationLength` | |

### 3.5 session_types

| DB Column | Endpoint | MB Field | Notes |
|-----------|----------|----------|-------|
| id / mindbody_id | /site/sessiontypes | `Id` | |
| name | /site/sessiontypes | `Name` | |
| default_duration_minutes | /site/sessiontypes | `DefaultTimeLength` | |
| service_category_id | /site/sessiontypes | `ProgramId` | |
| num_deducted | /site/sessiontypes | `NumDeducted` | |
| staff_time_length | /site/sessiontypes | `StaffTimeLength` | |
| type | /site/sessiontypes | `Type` | |
| category_id | /site/sessiontypes | `CategoryId` | |
| subcategory_id | /site/sessiontypes | `SubcategoryId` | |
| available_for_add_on | /site/sessiontypes | `AvailableForAddOn` | |

### 3.6 sales / sale_items / payments

| DB Column | Endpoint | MB Field | Notes |
|-----------|----------|----------|-------|
| sales.id / mindbody_id | /sale/sales | `Id` | |
| sales.client_id | /sale/sales | `ClientId` | |
| sales.sale_datetime | /sale/sales | `SaleDateTime` | |
| sale_items.sale_detail_id | /sale/sales | `PurchasedItems[].SaleDetailId` | Unique key for upsert |
| sale_items.unit_price | /sale/sales | `PurchasedItems[].UnitPrice` | |
| sale_items.total_amount | /sale/sales | `PurchasedItems[].TotalAmount` | |
| sale_items.payment_ref_id | /sale/sales | `PurchasedItems[].PaymentRefId` | = client_services.mindbody_id |
| sale_items.is_service | /sale/sales | `PurchasedItems[].IsService` | |
| payments.mindbody_id | /sale/sales | `Payments[].Id` | |
| payments.type | /sale/sales | `Payments[].Type` | "Visa/MC", "Cash" |
| payments.amount | /sale/sales | `Payments[].Amount` | |
| payments.method | /sale/sales | `Payments[].Method` | Integer code |

### 3.7 staff

| DB Column | Endpoint | MB Field | Notes |
|-----------|----------|----------|-------|
| id / mindbody_id | /staff/staff | `Id` | |
| first_name | /staff/staff | `FirstName` | |
| last_name | /staff/staff | `LastName` | |
| email | /staff/staff | `Email` | Often null |
| _(not stored)_ | /staff/staff | `Active` | In raw_data |
| _(not stored)_ | /staff/staff | `DisplayName` | In raw_data |
| is_independent_contractor | /staff/staff | `IndependentContractor` | |

---

## 4. Known Structural Issues

### REQUIRES FIX

| # | Issue | Location | Severity |
|---|-------|----------|----------|
| 1 | `client_services.status` always "Inactive" | client_services.status | Medium — misleading column. Use `current` + `expiration_date > now()` instead |
| 2 | `current=true` on expired services | client_services.current | Low — not a bug, but "active service" logic must also check `expiration_date` |

### CONFIRMED CORRECT (previously investigated)

| # | Item | Status |
|---|------|--------|
| 3 | DB retains expired services that MB removes from API | **Correct.** Intentional superset for historical pricing |
| 4 | DB has Booked (future) appointments not in /clientvisits | **Correct.** /clientvisits only returns Completed; we sync from /appointment/appointments which includes all statuses |
| 5 | `ClientServiceId` null in /clientvisits but populated in /appointment/appointments | **Correct.** Different endpoints use different field names. `ServiceId` in /clientvisits = `ClientServiceId` in /appointments = `client_services.mindbody_id` |
| 6 | `pricing_option_id` populated via data migration, not direct sync | **Correct.** Fix 2b links via product_id |
| 7 | `start_datetime` vs `created_at` for report filtering | **Documented.** Use `start_datetime` for reports (real visit date). `created_at` includes backfilled visits from wrong months |

### NOT FIXED / INFORMATIONAL

| # | Item | Notes |
|---|------|-------|
| 8 | `clients.active` column missing | Mindbody `Active` boolean not stored as column. Low impact |
| 9 | `staff.active` column missing | Mindbody `Active` boolean not stored as column. In raw_data |
| 10 | `staff_session_types` has both `active` and `is_active` columns | Meaning undocumented. Both appear to serve the same purpose |
| 11 | `staff.phone` and `staff.role` columns | Added later, source/meaning not documented |
| 12 | Mindbody naming inconsistency: "Services" (pricing) vs "SessionTypes" (actual services) | Our schema resolves this: `session_types` = actual services, `pricing_options` = pricing packages |

---

## 5. Unknowns (Require Investigation)

| # | Question | Why It Matters |
|---|----------|----------------|
| 1 | `client_services.product_id` NOT NULL constraint — what happens when ProductId is missing from MB? | Could cause insert failures |
| 2 | `sale_items.payment_ref_id` — is this consistently the client_services.mindbody_id? | Important for sale-to-service linking |
| 3 | `staff.phone` vs `staff.mobile_phone` — which is populated from what? | |
| 4 | `staff.role` — where does it come from? Not in MB raw_data | May be manually set |
| 5 | `products` table (0 rows) — is it actually used? | Could be dead code |
| 6 | `client_visits` table (~0 rows) — is the /clientvisits sync actually running? | May be disabled or broken |
| 7 | `appointment_addons` (0 rows) — are addons synced? | Appointments with AddOns show `null` in raw_data |
| 8 | `sale_categories` — purpose? | |
| 9 | `pricing_options.mindbody_id` type is string in MB ("13253") vs other tables where IDs are numeric | Confirmed working but unusual |
| 10 | How does the sync handle MB rate limits (429 responses)? | Backfill has retry logic; main sync unclear |

---

## 6. Approximate Row Counts (as of 2026-09-16)

| Table | Rows |
|-------|------|
| payments | ~8,091 |
| transactions | ~8,086 |
| appointments | ~7,822 |
| sales | ~7,821 |
| clients | ~6,165 |
| sale_items | ~5,138 |
| client_services | ~2,945 |
| pricing_option_session_types | ~2,686 |
| api_logs | ~1,172 |
| staff_session_types | ~817 |
| api_raw_data | ~507 |
| sync_logs | ~228 |
| pricing_options | ~218 |
| retail_products | ~151 |
| session_types | ~138 |
| staff | ~30 |
| service_categories | ~17 |
| locations, sites, packages, etc. | <10 each |
| products, appointment_addons, client_visits, payment_types, sale_categories, staff_appointment_rates | 0 |

---

## 7. Foreign Key Constraints (Formal)

| From | To | Column(s) | On Delete |
|------|----|-----------|-----------|
| appointment_addons.appointment_id | appointments.id | | CASCADE |
| appointments.client_id | clients.id | | (default) |
| appointments.staff_id | staff.id | | (default) |
| appointments.location_id | locations.id | | (default) |
| appointments.session_type_id | session_types.id | | SET NULL |
| client_services.pricing_option_id | pricing_options.id | | SET NULL |
| client_visits.session_type_id | session_types.id | | SET NULL |
| client_visits.location_id | locations.id | | SET NULL |
| client_visits.staff_id | staff.id | | SET NULL |
| pricing_option_session_types.pricing_option_id | pricing_options.id | | CASCADE |
| pricing_option_session_types.session_type_id | session_types.id | | CASCADE |
| pricing_options.program_id | service_categories.id | | CASCADE |
| sale_items.session_type_id | session_types.id | | (default) |
| service_subcategories.category_id | service_categories.id | | CASCADE |
| session_types.category_id | service_categories.id | | SET NULL |
| session_types.service_category_id | service_categories.id | | (default) |
| session_types.subcategory_id | service_subcategories.id | | SET NULL |
| staff_session_types.staff_id | staff.id | | CASCADE |
| staff_session_types.session_type_id | session_types.id | | CASCADE |

**Informal (no FK constraint, used in code):**
- `appointments.client_service_id` → `client_services.mindbody_id`
- `client_services.client_id` → `clients.mindbody_id`
- `client_services.product_id` → `pricing_options.mindbody_id`
- `sales.client_id` → `clients.mindbody_id`
- `sale_items.sale_id` → `sales.id`
- `sale_items.payment_ref_id` → `client_services.mindbody_id`
- `payments.sale_id` → `sales.id`
