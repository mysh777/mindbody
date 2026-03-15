# Mindbody API Endpoints

## Implemented Endpoints

### ✅ Working (Public - Source Credentials Only)

1. **site/locations** - Get all business locations
   - Status: ✅ Working
   - Auth: Source credentials only
   - Data: 3 locations synced

2. **staff/staff** - Get all staff members
   - Status: ✅ Working
   - Auth: Source credentials only
   - Data: 27 staff synced

3. **class/classdescriptions** - Get class type descriptions
   - Status: ✅ Working
   - Auth: Source credentials only
   - Data: Synced

4. **class/classes** - Get scheduled classes
   - Status: ✅ Working
   - Auth: Source credentials only
   - Data: Synced

### ✅ Working (Protected - User Token Required)

5. **sale/sales** - Get sales transactions
   - Status: ✅ Working
   - Auth: User token required (Bearer)
   - Data: 944 sales synced
   - Mapping: Fixed - now correctly reads `Payments[].Amount` and `PurchasedItems[].TotalAmount`

6. **sale/sales -> PurchasedItems** - Get sale line items
   - Status: ✅ Working
   - Auth: User token required (Bearer)
   - Data: 10,930 items synced
   - Mapping: Fixed - now reads `Description`, `TotalAmount`, `TaxAmount`, `IsService`

7. **client/clients** - Get all clients
   - Status: ⚠️ Returns empty array
   - Auth: Now using User token (Bearer)
   - Issue: API returns `TotalResults: 0` - may need different parameters or permissions

### ⚠️ Not Yet Working

8. **appointment/appointments** - Get appointments
   - Status: ❌ 404 Not Found
   - Endpoint tried: `/appointment/appointments`
   - Auth: User token (Bearer)
   - Issue: Wrong endpoint URL - need to verify correct path

9. **appointment/staffappointments** - Get staff appointments
   - Status: ⚠️ Being used but may need adjustment
   - Auth: User token (Bearer)

## Available Endpoints Not Yet Implemented

### Client Management
- `client/clientcontracts` - Client membership contracts
- `client/clientvisits` - Client visit history
- `client/clientpurchases` - Client purchase history
- `client/clientreferraltypes` - Client referral sources

### Classes
- `class/classvisits` - Individual class visit records
- `class/classcancellations` - Cancelled classes
- `class/waitlistentries` - Class waitlist entries

### Products & Services
- `site/products` - Retail products
- `site/services` - Services/session types
- `site/programs` - Programs/packages

### Enrollment
- `enrollment/enrollments` - Client enrollments

### Site Information
- `site/activationsessions` - Site activation sessions
- `site/genders` - Gender options
- `site/countries` - Country list
- `site/relationships` - Relationship types

## API Response Structures

### Sales Response Structure
```json
{
  "Sales": [
    {
      "Id": 215319,
      "ClientId": "...",
      "LocationId": "...",
      "SaleDate": "2026-01-15",
      "SaleDateTime": "2026-01-15T12:00:00",
      "Payments": [
        {
          "Id": 216469,
          "Type": "Check",
          "Amount": 135,
          "Method": 2
        }
      ],
      "PurchasedItems": [
        {
          "Id": 10106,
          "Description": "6 sessijas 30min (2 mēn.)",
          "TotalAmount": 135,
          "UnitPrice": 135,
          "Quantity": 1,
          "TaxAmount": 0,
          "DiscountAmount": 0,
          "IsService": true,
          "CategoryId": -5,
          "RecipientClientId": 100010331
        }
      ]
    }
  ],
  "PaginationResponse": {
    "RequestedLimit": 100,
    "RequestedOffset": 0,
    "PageSize": 100,
    "TotalResults": 944
  }
}
```

### Client Response Structure
```json
{
  "Clients": [],
  "PaginationResponse": {
    "PageSize": 0,
    "TotalResults": 0,
    "RequestedLimit": 100,
    "RequestedOffset": 0
  }
}
```

## Authentication Details

### Source Credentials (Public Endpoints)
Headers:
- `Api-Key`: Your API key
- `SiteId`: Your site ID (197179)
- `Content-Type`: application/json

### User Token (Protected Endpoints)
Headers:
- `Api-Key`: Your API key
- `SiteId`: Your site ID (197179)
- `Authorization`: Bearer {user_token}
- `Content-Type`: application/json

User token obtained via:
```
POST /public/v6/usertoken/issue
Body: {
  "Username": "staff_username",
  "Password": "staff_password"
}
```

## Current Status Summary

| Endpoint Type | Count | Status |
|--------------|-------|---------|
| Locations | 3 | ✅ Synced |
| Staff | 27 | ✅ Synced |
| Sales | 944 | ✅ Synced |
| Sale Items | 10,930 | ✅ Synced |
| Clients | 0 | ⚠️ Empty response |
| Appointments | 0 | ❌ 404 Error |
| Classes | 0 | ⚠️ Empty or not syncing |
| Class Descriptions | 0 | ⚠️ Empty or not syncing |
