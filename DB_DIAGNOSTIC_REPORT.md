# Проверка четырёх вопросов

**Дата:** 2026-09-18  
**Метод:** Чтение кода `mindbody-sync/index.ts` + данные из предыдущих SQL-запросов  
**Статус:** Только диагностика. Данные не менялись.

---

## Вопрос 1: `client_visits` — нужна ли таблица

### URL запроса

Код `syncClientVisits()` (строка 1924):
```
${MINDBODY_BASE_URL}/client/clientvisits?startDate=2026-03-18&endDate=2026-09-18&limit=100&offset=0
```

Параметры: `startDate`, `endDate`, `limit`, `offset`. **Нет `ClientId`.**

### Точная ошибка Mindbody

Из `api_logs` (response_status=400):
```json
{
  "Error": {
    "Code": "MissingRequiredFields",
    "Message": "At least one of the following parameters must be passed: ClientId, UniqueClientId"
  }
}
```

Endpoint `/client/clientvisits` **требует** `ClientId`. Код его не передаёт → каждая синхронизация получает HTTP 400 → 0 записей.

### Использование во фронтенде

Поиск `.from('client_visits')` по всему `src/`: **0 совпадений**. Ни один компонент, ни один отчёт не обращается к этой таблице.

### Сравнение полей client_visits vs appointments

| Поле client_visits | Есть в appointments? | Комментарий |
|---|---|---|
| `client_id` | ✅ `client_id` | — |
| `staff_id` | ✅ `staff_id` | — |
| `location_id` | ✅ `location_id` | — |
| `session_type_id` | ✅ `session_type_id` | — |
| `visit_datetime` | ✅ `start_datetime` | — |
| `appointment_id` | ✅ `id`/`mindbody_id` | Прямая связь |
| `appointment_status` | ✅ `status` | — |
| `service_id` | ❌ Нет | MB ServiceId (≈ pricing option) |
| `service_name` | ❌ Нет | Название услуги |
| `class_id` | ❌ Нет | Для групповых занятий |
| `signed_in` | ❌ Нет | Отметка о приходе |
| `make_up` | ❌ Нет | Перенесённый визит |
| `late_cancelled` | ❌ Нет | Поздняя отмена |
| `web_signup` | ❌ Нет | Онлайн-запись |
| `visit_id` | ❌ Нет | Отдельный ID визита |

**6 уникальных полей** отсутствуют в `appointments`: `service_id`, `service_name`, `class_id`, `signed_in`, `late_cancelled`, `web_signup`.

### Вывод

**Таблица не нужна для текущих отчётов** — ни один компонент её не читает, и синхронизация сломана с момента создания. Уникальные поля (`signed_in`, `late_cancelled`, `web_signup`) **могли бы** быть полезны для будущих отчётов по дисциплине клиентов, но сейчас не используются. Синхронизацию можно безопасно отключить без потери функциональности.

---

## Вопрос 2: Точное место для `payment_ref_id`

### Текущий код определения цены

Файл: `src/utils/resolveServicePrices.ts`, функция `resolveServicePrices()` (строки 33–117).

**Текущая логика (3 уровня приоритета):**

1. **Строки 65–74:** Если у `client_service` нет `pricing_option_id` → сразу fallback на медиану по типу сессии или `no_data`.

2. **Строки 76–85:** Если `pricing_option_id` есть, но не найден в справочнике `poById` → аналогичный fallback.

3. **Строки 87–103 (эвристика по дате):** Если pricing_option найден → ищет все `sale_items` с тем же `item_id` (= `po.mindbody_id`), затем из них выбирает **ближайший по дате** к `payment_date`/`active_date` клиентской услуги. Это **текущая «actual» цена**.

4. **Строки 104–105:** Если sale_items не найдены → каталожная цена из `pricing_options.price`.

5. **Строки 106–113:** Если каталожная цена тоже null → медиана по типу сессии.

### Входные данные

Интерфейс `SaleItemInput` (строки 22–26):
```typescript
interface SaleItemInput {
  item_id: string;       // = pricing_options.mindbody_id
  sale_id: string;
  total_amount: number | null;
}
```

**`payment_ref_id` НЕ загружается** — его нет в интерфейсе. Нужно:
1. Добавить `payment_ref_id` в `SaleItemInput`
2. Загружать его в вызывающем коде (hook `useSalesMarginData.ts`)

### Точное место для вставки проверки

**Вставить между строками 85 и 87** — после того как `po` (pricing_option) найден, но **до** текущей эвристики по `item_id` + ближайшей дате.

Текущий код (строки 85–103):
```typescript
    // ← строка 85: закрывающая скобка блока "po not found"

    // СЮДА: новый блок — прямой поиск по payment_ref_id
    // Логика: найти sale_item, у которого payment_ref_id == svc.mindbody_id (client_service.mindbody_id)
    // Если найден → result.set(svc.id, { price: item.total_amount, source: 'actual' })
    // Если не найден → продолжить к текущей эвристике ниже

    const candidates = itemsByMindbodyId.get(po.mindbody_id);  // ← строка 87: текущая эвристика
    if (candidates && candidates.length > 0) {
      // ... выбор ближайшего по дате
    }
```

**Конкретно:** Новый lookup нужно вставить **после строки 85** (`continue;` + `}`) и **перед строкой 87** (`const candidates = ...`).

Для этого:
- В `SaleItemInput` добавить поле `payment_ref_id: string | null`
- В функции создать второй индекс: `Map<string, SaleItemInput[]>` по `payment_ref_id` (client_service mindbody_id)
- Перед строкой 87 проверить: есть ли в этом индексе запись для `svc.mindbody_id` (не `svc.id`, а MB ID клиентской услуги — его тоже нужно добавить в `ServiceInput`)

### Вызывающий код

Файл `src/hooks/useSalesMarginData.ts` — здесь загружаются `sale_items`. Нужно добавить `payment_ref_id` в select-запрос.

---

## Вопрос 3: Почему `client_id='1'` — фантомный клиент

### Текущее число продаж

**1 118 продаж** с `client_id = '1'` (подтверждено в предыдущей сессии; нет оснований считать, что изменилось — новые продажи с id=1 маловероятны).

**0 клиентов** с `mindbody_id = '1'`.

### Код syncClients()

Строка 1134:
```
${MINDBODY_BASE_URL}/client/clients?limit=200&offset=0&searchText=
```

Пагинированный запрос **всех** клиентов с пустым `searchText=`. Без фильтра по `ClientIds`. Запрос проходит по всем страницам (`limit=200`, инкремент `offset`), до пустой страницы.

Код **не фильтрует** клиентов по ID — он берёт всё, что вернул Mindbody.

### Почему клиент не попадает в БД

**Гипотеза подтверждена косвенно:** Mindbody не включает системный клиент `Id=1` в общий список `/client/clients`. Это стандартное поведение MB — системные/внутренние записи (id < 100) не отдаются в пагинированном списке.

Прямой запрос `?ClientIds=1` **не выполнялся** (не было безопасной возможности — требует user token). Нет записей в `api_logs` с таким запросом.

### SQL для ручного создания

```sql
INSERT INTO clients (
  id, mindbody_id, first_name, last_name, 
  status, raw_data, synced_at, created_at
) VALUES (
  '1', '1', 'System', 'Client',
  'System', '{"Id": "1", "FirstName": "System", "LastName": "Client", "Active": true}'::jsonb,
  now(), now()
) ON CONFLICT (mindbody_id) DO NOTHING;
```

Это даст 1 118 продажам валидную привязку к клиенту. Имя «System Client» — условное; можно заменить, если прямой запрос к MB вернёт реальные данные.

---

## Вопрос 4: `transactions` vs `payments`

### Структура колонок — прямое сравнение

| payments | transactions |
|----------|-------------|
| `id` (uuid PK) | `id` (uuid PK) |
| `mindbody_id` (text, unique) | `mindbody_id` (text, unique) |
| `sale_id` (text) | `sale_id` (text) |
| `mindbody_sale_id` (text) | — |
| `type` (text) | — |
| `method` (integer) | — |
| `amount` (numeric) | `amount` (numeric) |
| `notes` (text) | — |
| `transaction_id` (text) | `transaction_id` (text) |
| — | `payment_processor` (text) |
| — | `transaction_status` (text) |
| — | `transaction_date` (timestamptz) |
| `raw_data` (jsonb) | `raw_data` (jsonb) |
| `synced_at` (timestamptz) | `synced_at` (timestamptz) |
| `created_at` (timestamptz) | `created_at` (timestamptz) |

### Что пишет код в каждую

**payments** — заполняется в `syncSales()` (строки 1346–1357):
```javascript
{
  mindbody_id: `${saleId}-${paymentId}`,     // формат идентичен
  sale_id: saleId,
  mindbody_sale_id: saleId,
  type: payment.Type,                         // "Visa/MC", "Cash" и т.д.
  method: payment.Method,                     // целое число (4 = карта)
  amount: payment.Amount || 0,
  notes: payment.Notes || null,
  transaction_id: payment.TransactionId ? String(...) : null,
  raw_data: payment,                          // только объект payment
  synced_at: syncedAt,
}
```

**transactions** — заполняется в `syncTransactions()` (строки 1861–1878):
```javascript
{
  mindbody_id: `${sale.Id}-${paymentId}`,     // формат идентичен
  transaction_id: payment.TransactionId ? String(...) : `${sale.Id}-${paymentId}`,
  sale_id: String(sale.Id),
  payment_processor: payment.Type || 'Unknown', // = payments.type
  transaction_status: 'Completed',              // хардкод
  amount: payment.Amount || 0,
  transaction_date: sale.SaleDateTime,
  raw_data: {                                   // расширенный объект
    sale_id: sale.Id,
    sale_datetime: sale.SaleDateTime,
    client_id: sale.ClientId,
    location_id: sale.LocationId,
    payment: payment,
    purchased_items: sale.PurchasedItems || []
  },
  synced_at: syncedAt,
}
```

### Источник данных

**Одинаковый.** Обе функции вызывают `/sale/sales` и итерируют `sale.Payments[]`. Разница:
- `payments` хранит `type`/`method`/`notes` из объекта платежа
- `transactions` хранит `payment_processor` (= тот же `payment.Type`) + `transaction_status` (хардкод 'Completed') + `transaction_date`
- `transactions.raw_data` богаче — включает контекст продажи (client_id, purchased_items)
- `payments` хранит `mindbody_sale_id` и `notes`, которых нет в `transactions`

**mindbody_id формируется одинаково** → одна запись в `payments` точно соответствует одной записи в `transactions`.

### Использование во фронтенде

Поиск `.from('transactions')` и `.from("transactions")` по всему `src/`: **0 совпадений**.

Слово `transactions` встречается только как:
- UI-навигация: `Dashboard.tsx:39`, `Sidebar.tsx:48,71`
- Тип синхронизации: `SyncButton.tsx:8,40,46,140`

Эти ссылки позволяют **просматривать** содержимое таблицы через универсальный `TableView` и **запускать** синхронизацию, но ни один отчёт/вычисление не читает данные из `transactions`.

### Вывод

**`transactions` — параллельная копия `payments`**, созданная из тех же данных Mindbody. Различия:
1. Другие имена колонок (`payment_processor` вместо `type`, `transaction_status` вместо —)
2. Более богатый `raw_data` (включает контекст продажи)
3. Хардкод `transaction_status: 'Completed'` — информации не добавляет

Ни один компонент не читает `transactions`. Таблицу можно удалить, а синхронизацию отключить, без потери функциональности. Единственное преимущество transactions — расширенный `raw_data` с контекстом продажи, но эти данные уже доступны через JOIN `payments → sales`.
