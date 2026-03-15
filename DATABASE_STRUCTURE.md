# Database Structure

## Overview
This document describes the database structure for the Mindbody integration, showing how clients book appointments for services.

## Core Business Flow

```
Client → Appointment → Service (Pricing Option) → Staff
```

## Tables

### 1. `pricing_options` (Services/Pricing)
**Description**: Service catalog - what services can be booked
- **Source**: Mindbody API `/site/services`
- **Key fields**:
  - `mindbody_id` - Unique service ID
  - `name` - Service name (e.g., "Massage 60 min")
  - `service_type` - Type (Appointments, Classes, etc)
  - `service_category` - Category (e.g., "MASĀŽAS UN SEJA")
  - `price` - Base price
  - `online_price` - Online booking price
  - `duration` - Duration in minutes
  - `sold_online` - Available for online purchase
  - `bookable_online` - Can be booked online
  - `session_count` - Number of sessions (null for single)
  - `active` - Is currently active

**Example**: "10 VAKUUMA MASĀŽAS 30 min" - 345€, 10 sessions, MASĀŽAS category

### 2. `retail_products`
**Description**: Physical products sold in store
- **Source**: Mindbody API `/site/products`
- **Key fields**:
  - `mindbody_id` - Unique product ID
  - `name` - Product name
  - `barcode` - Product barcode
  - `retail_price` - Regular price
  - `online_price` - Online price
  - `cost` - Our cost
  - `sell_online` - Available online
  - `active` - Is currently active
  - `category` - Product category

### 3. `appointments`
**Description**: Scheduled appointments booked by clients
- **Source**: Mindbody API `/appointment/appointments`
- **Key fields**:
  - `mindbody_id` - Unique appointment ID
  - `client_id` - Link to client
  - `staff_id` - Link to staff member
  - `location_id` - Link to location
  - `pricing_option_id` - **Link to pricing_options table**
  - `service_name` - Service name (denormalized)
  - `start_datetime` - Appointment start time
  - `end_datetime` - Appointment end time
  - `duration` - Duration in minutes
  - `price` - Appointment price
  - `status` - Appointment status

**Relationship**: Appointment links to a service from `pricing_options`

### 4. `clients`
**Description**: Customer database
- **Source**: Mindbody API `/client/clients`
- **Key fields**:
  - `mindbody_id` - Unique client ID
  - `first_name`, `last_name` - Client name
  - `email` - Email address
  - `phone` - Phone number
  - `birth_date` - Date of birth
  - `creation_date` - When client was added

### 5. `staff`
**Description**: Staff members who provide services
- **Source**: Mindbody API `/staff/staff`
- **Key fields**:
  - `mindbody_id` - Unique staff ID
  - `first_name`, `last_name` - Staff name
  - `email` - Email address
  - `phone` - Phone number
  - `role` - Staff role/position
  - `is_independent_contractor` - Employment type
  - `always_allow_double_booking` - Booking settings

**Relationship**: Staff members are assigned to appointments

### 6. `sales`
**Description**: Sales transactions
- **Source**: Mindbody API `/sale/sales`
- **Key fields**:
  - `mindbody_id` - Unique sale ID
  - `client_id` - Link to client
  - `location_id` - Link to location
  - `sale_datetime` - When sale occurred
  - `total` - Total amount
  - `payment_amount` - Amount paid

### 7. `sale_items`
**Description**: Individual items in each sale
- **Source**: Mindbody API `/sale/sales` → PurchasedItems
- **Key fields**:
  - `sale_id` - Link to sales table
  - `mindbody_id` - Unique item ID
  - `description` - Item description
  - `quantity` - Quantity purchased
  - `amount` - Item total amount
  - `is_service` - Is this a service (true) or product (false)

### 8. `locations`
**Description**: Business locations
- **Source**: Mindbody API `/site/locations`
- **Key fields**:
  - `mindbody_id` - Unique location ID
  - `name` - Location name
  - `address_line1`, `address_line2` - Address
  - `city`, `state_prov_code`, `postal_code` - Location details
  - `phone` - Phone number
  - `latitude`, `longitude` - Coordinates

### 9. `classes`
**Description**: Scheduled group classes
- **Source**: Mindbody API `/class/classes`

### 10. `class_descriptions`
**Description**: Class types/templates
- **Source**: Mindbody API `/class/classdescriptions`

## Relationships Diagram

```
┌──────────┐
│ Client   │
└─────┬────┘
      │
      ├─────────┐
      │         │
      ▼         ▼
┌──────────┐  ┌─────────┐
│Appointment│  │  Sales  │
└─────┬────┘  └────┬────┘
      │            │
      ├────────┐   │
      │        │   ▼
      ▼        ▼  ┌──────────┐
┌─────────┐  ┌───┤Sale Items│
│ Service │  │   └──────────┘
│(Pricing)│  │
└─────────┘  ▼
           ┌──────┐
           │Staff │
           └──────┘
```

## Key Business Logic

1. **Client books an Appointment**
   - Client selects a service from `pricing_options`
   - Appointment is created linking to:
     - The client (`client_id`)
     - The service (`pricing_option_id`)
     - The staff member (`staff_id`)
     - The location (`location_id`)

2. **Service categories**
   - Each service belongs to a category (e.g., "MASĀŽAS UN SEJA")
   - Services can be single session or multiple sessions
   - Services have duration and price

3. **Sales and Items**
   - When a service is purchased, it creates:
     - A `sales` record (the transaction)
     - A `sale_items` record (the purchased service)
   - `sale_items.is_service = true` indicates service purchase
   - `sale_items.is_service = false` indicates retail product purchase

## Sync Strategy

### Quick Sync (default)
Syncs only essential data:
- Locations
- Services (pricing options)
- Sales

### Full Sync
Syncs all data:
- Locations
- Services (pricing options)
- Retail products
- Staff
- Class descriptions
- Classes
- Clients
- Appointments
- Sales

## Data Access

All tables have Row Level Security (RLS) enabled with public read access for anonymous and authenticated users.
