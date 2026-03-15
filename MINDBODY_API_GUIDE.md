# Mindbody Public API v6 - Complete Guide

## Overview

Mindbody Public API v6 предоставляет REST-based доступ к данным бизнеса через JSON endpoints.

**Base URL**: `https://api.mindbodyonline.com/public/v6`

---

## Authentication Architecture

Mindbody API использует двухуровневую систему аутентификации:

### Level 1: Source Credentials (Developer Credentials)

**Что это?**
- Credentials разработчика, полученные в Developer Portal
- Состоят из: Source Name, Source Password, API Key

**Для чего используются?**
- Доступ к публичным endpoint'ам (read-only)
- Получение расписания классов, информации о локациях
- Чтение данных клиентов (если site активирован)

**Как использовать?**

```http
GET /public/v6/site/locations
Api-Key: {your-api-key}
SiteId: {site-id}
Authorization: Basic {base64(sourceName:sourcePassword)}
```

**Ваши Source Credentials:**
- API Key: `c4361d92b8844115a8047a410c095a7c`
- Source Name: `SIAINNOVITA`
- Source Password: `5G/5BWOrnh4YpKJ/YWljvW3tfF0=`
- Site ID: `197179` ✓ (активирован)

### Level 2: User Token (Staff/Client Credentials)

**Что это?**
- Временный токен, полученный через `/usertoken/issue` endpoint
- Требует логин и пароль реального пользователя (staff или client)

**Для чего используются?**
- Модификация данных (add/update/delete)
- Бронирование классов и appointments
- Проведение платежей
- Доступ к конфиденциальной информации

**Как получить?**

```http
POST /public/v6/usertoken/issue
Api-Key: {your-api-key}
SiteId: {site-id}
Authorization: Basic {base64(sourceName:sourcePassword)}
Content-Type: application/json

{
  "Username": "staff@example.com",
  "Password": "staff-password"
}
```

**Response:**
```json
{
  "AccessToken": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "TokenType": "Bearer"
}
```

**Использование токена:**
```http
GET /public/v6/client/clients
Api-Key: {your-api-key}
SiteId: {site-id}
Authorization: {AccessToken}
```

---

## Site Activation

**Что это?**
- Процесс связывания вашего приложения с конкретным Site ID
- Без activation code вы не получите доступ к данным студии

**Статус:** ✓ Site ID 197179 уже активирован

**Как работает activation:**

1. Получить activation code через API v5 (SOAP):
```xml
POST https://api.mindbodyonline.com/0_5/SiteService.asmx
SOAPAction: http://clients.mindbodyonline.com/api/0_5/GetActivationCode

<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope>
  <soap:Body>
    <GetActivationCode>
      <Request>
        <SourceCredentials>
          <SourceName>{sourceName}</SourceName>
          <Password>{sourcePassword}</Password>
          <SiteIDs><int>{siteId}</int></SiteIDs>
        </SourceCredentials>
      </Request>
    </GetActivationCode>
  </soap:Body>
</soap:Envelope>
```

2. Владелец студии переходит по activation link и подтверждает доступ

---

## Available Endpoints

### Site Service

#### Get Locations
```http
GET /public/v6/site/locations
```
**Auth Required:** Source Credentials
**Returns:** Все локации студии

#### Get Programs
```http
GET /public/v6/site/programs
```
**Auth Required:** Source Credentials
**Returns:** Доступные программы

#### Get Session Types
```http
GET /public/v6/site/sessiontypes
```
**Auth Required:** Source Credentials
**Returns:** Типы сессий

---

### Client Service

#### Get Clients
```http
GET /public/v6/client/clients?limit={limit}&offset={offset}
```
**Auth Required:** User Token (или Source Credentials для активированного site)
**Parameters:**
- `limit` (optional): Max 200, default 100
- `offset` (optional): Pagination offset
- `clientIds` (optional): Specific client IDs
- `searchText` (optional): Search by name/email

**Returns:**
```json
{
  "PaginationResponse": {
    "RequestedLimit": 100,
    "RequestedOffset": 0,
    "TotalResults": 250
  },
  "Clients": [
    {
      "Id": "100000001",
      "FirstName": "John",
      "LastName": "Doe",
      "Email": "john@example.com",
      "MobilePhone": "+1234567890",
      "BirthDate": "1990-01-01",
      "CreationDate": "2020-01-01T00:00:00",
      ...
    }
  ]
}
```

#### Get Client Visits
```http
GET /public/v6/client/clientvisits?clientId={id}&startDate={date}&endDate={date}
```
**Auth Required:** User Token
**Returns:** История посещений клиента

#### Add Client
```http
POST /public/v6/client/addclient
```
**Auth Required:** User Token
**Body:** Client data object

#### Update Client
```http
POST /public/v6/client/updateclient
```
**Auth Required:** User Token
**Body:** Client data object with ID

---

### Class Service

#### Get Classes
```http
GET /public/v6/class/classes?startDateTime={iso}&endDateTime={iso}
```
**Auth Required:** Source Credentials
**Parameters:**
- `startDateTime` (required): ISO 8601 format
- `endDateTime` (required): ISO 8601 format
- `locationIds` (optional)
- `staffIds` (optional)
- `classDescriptionIds` (optional)

**Returns:**
```json
{
  "Classes": [
    {
      "Id": 123,
      "ClassDescription": {
        "Id": 456,
        "Name": "Yoga Flow"
      },
      "StartDateTime": "2026-03-15T10:00:00",
      "EndDateTime": "2026-03-15T11:00:00",
      "Staff": {
        "Id": 789,
        "FirstName": "Jane",
        "LastName": "Smith"
      },
      "Location": {
        "Id": 1,
        "Name": "Main Studio"
      },
      "MaxCapacity": 20,
      "TotalBooked": 15,
      "IsAvailable": true,
      "IsCanceled": false
    }
  ]
}
```

#### Get Class Descriptions
```http
GET /public/v6/class/classdescriptions
```
**Auth Required:** Source Credentials
**Returns:** Описания всех типов классов

#### Get Class Schedules
```http
GET /public/v6/class/classschedules
```
**Auth Required:** Source Credentials
**Returns:** Расписания повторяющихся классов

---

### Appointment Service

#### Get Appointments
```http
GET /public/v6/appointment/appointments?startDate={date}&endDate={date}
```
**Auth Required:** User Token
**Parameters:**
- `startDate` (required): YYYY-MM-DD
- `endDate` (required): YYYY-MM-DD
- `locationIds` (optional)
- `staffIds` (optional)

**Returns:**
```json
{
  "Appointments": [
    {
      "Id": 123,
      "StartDateTime": "2026-03-15T14:00:00",
      "EndDateTime": "2026-03-15T15:00:00",
      "Status": "Booked",
      "ClientId": "100000001",
      "StaffId": 789,
      "LocationId": 1,
      "SessionType": {
        "Id": 10,
        "Name": "Personal Training"
      }
    }
  ]
}
```

#### Book Appointment
```http
POST /public/v6/appointment/addappointment
```
**Auth Required:** User Token
**Body:** Appointment booking data

---

### Sale Service

#### Get Sales
```http
GET /public/v6/sale/sales?startSaleDateTime={iso}&endSaleDateTime={iso}
```
**Auth Required:** User Token
**Parameters:**
- `startSaleDateTime` (required): ISO 8601
- `endSaleDateTime` (required): ISO 8601
- `limit` (optional): Max 100

**Returns:**
```json
{
  "Sales": [
    {
      "Id": 12345,
      "SaleDateTime": "2026-03-15T10:30:00",
      "ClientId": "100000001",
      "LocationId": 1,
      "Total": 150.00,
      "PaymentAmount": 150.00,
      "PurchasedItems": [
        {
          "Type": "Service",
          "Id": 10,
          "Name": "10 Class Pack",
          "Amount": 150.00,
          "Quantity": 1
        }
      ]
    }
  ]
}
```

#### Get Services
```http
GET /public/v6/sale/services
```
**Auth Required:** Source Credentials
**Returns:** Доступные услуги для продажи

#### Get Products
```http
GET /public/v6/sale/products
```
**Auth Required:** Source Credentials
**Returns:** Продукты для продажи

---

### Staff Service

#### Get Staff
```http
GET /public/v6/staff/staff
```
**Auth Required:** Source Credentials (basic info) или User Token (full info)

**Returns:**
```json
{
  "StaffMembers": [
    {
      "Id": 789,
      "FirstName": "Jane",
      "LastName": "Smith",
      "Email": "jane@studio.com",
      "Bio": "Certified yoga instructor...",
      "IsMale": false
    }
  ]
}
```

---

## Common Response Structure

Все API responses имеют общую структуру:

```json
{
  "PaginationResponse": {
    "RequestedLimit": 100,
    "RequestedOffset": 0,
    "PageSize": 100,
    "TotalResults": 250
  },
  "{DataKey}": [ /* array of items */ ],
  "Message": null,
  "Status": 200
}
```

---

## Error Handling

### HTTP Status Codes

- `200 OK` - Success
- `400 Bad Request` - Invalid parameters
- `401 Unauthorized` - Missing/invalid API Key или Site ID
- `403 Forbidden` - Invalid credentials или insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

### Error Response Format

```json
{
  "Error": {
    "Message": "Invalid user token",
    "Code": "InvalidUserToken"
  }
}
```

### Common Error Codes

- `DeniedAccess` - API Key отсутствует или недействителен
- `InvalidUserToken` - User token истек или недействителен
- `InvalidCredentials` - Неверный username/password
- `SiteNotActivated` - Site не активирован для вашего приложения
- `InvalidParameters` - Неверные параметры запроса

---

## Best Practices

### 1. Pagination

Всегда используйте pagination для больших datasets:

```javascript
let offset = 0;
const limit = 100;
let allClients = [];

while (true) {
  const response = await fetch(
    `${baseUrl}/client/clients?limit=${limit}&offset=${offset}`,
    { headers }
  );
  const data = await response.json();

  if (!data.Clients || data.Clients.length === 0) break;

  allClients = allClients.concat(data.Clients);
  offset += limit;

  if (data.Clients.length < limit) break;
}
```

### 2. Rate Limiting

Mindbody API имеет rate limits:
- Не более 1000 requests в минуту
- Используйте batching где возможно
- Реализуйте exponential backoff для retry logic

### 3. Date Handling

- Всегда используйте ISO 8601 format: `2026-03-15T10:00:00`
- Указывайте timezone если необходимо: `2026-03-15T10:00:00-08:00`
- Даты без времени: `2026-03-15`

### 4. Error Recovery

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return await response.json();

      if (response.status === 401) {
        // Re-authenticate and retry
        await refreshToken();
        continue;
      }

      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 5. Caching

Кэшируйте относительно статичные данные:
- Locations (меняются редко)
- Class Descriptions (меняются редко)
- Staff (обновляйте 1 раз в день)

Часто обновляемые данные:
- Classes (в реальном времени для бронирования)
- Appointments (в реальном времени)
- Client data (обновляйте по необходимости)

---

## Regional Endpoints

Mindbody использует разные endpoints в зависимости от региона:

- **North America**: `https://api.mindbodyonline.com`
- **Europe**: `https://api-eu.mindbodyonline.com`
- **Australia**: `https://api-au.mindbodyonline.com`

Ваш site (197179) использует North America endpoint.

---

## Testing

### Using Postman

1. Download Mindbody Postman collection from Developer Portal
2. Set environment variables:
   - `apiKey`: Your API key
   - `siteId`: Your site ID
   - `sourceName`: SIAINNOVITA
   - `sourcePassword`: 5G/5BWOrnh4YpKJ/YWljvW3tfF0=

### Using curl

```bash
# Get locations
curl -X GET "https://api.mindbodyonline.com/public/v6/site/locations" \
  -H "Api-Key: c4361d92b8844115a8047a410c095a7c" \
  -H "SiteId: 197179" \
  -H "Authorization: Basic $(echo -n 'SIAINNOVITA:5G/5BWOrnh4YpKJ/YWljvW3tfF0=' | base64)"
```

---

## Current Implementation Status

### ✓ Configured & Working
- Source Credentials
- Site Activation (Site ID: 197179)
- Read-only endpoints access

### Read Operations Available
- ✓ Get Locations
- ✓ Get Clients
- ✓ Get Staff
- ✓ Get Classes
- ✓ Get Class Descriptions
- ✓ Get Appointments
- ✓ Get Sales
- ✓ Get Products
- ✓ Get Services

### Write Operations (Require Staff Credentials)
- ⚠️ Add/Update Clients
- ⚠️ Book Appointments
- ⚠️ Book Classes
- ⚠️ Process Payments

---

## Resources

- **Developer Portal**: https://developers.mindbodyonline.com
- **API Documentation**: https://developers.mindbodyonline.com/PublicDocumentation/V6
- **Support**: Contact Mindbody Developer Support
- **Postman Collection**: Available in Developer Portal

---

## Summary

Ваша текущая конфигурация **полностью работоспособна** для всех операций чтения данных (read operations). Source Credentials предоставляют доступ ко всем необходимым endpoint'ам для синхронизации данных:

- Clients
- Appointments
- Classes
- Sales
- Staff
- Locations

Staff credentials потребуются только если вы захотите добавить функционал записи (booking, payments, client management через UI).
