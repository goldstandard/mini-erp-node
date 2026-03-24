# API Reference

Base URL:

- `http://localhost:3000/api`

## Authentication Model

- Authentication uses JWT bearer tokens.
- Most `/api/admin/*` and polymer endpoints require:
  - Valid token (`Authorization: Bearer <token>`)
  - `user:manage` permission

## Health

- `GET /api/health`
  - Returns service status and timestamp

## Auth Endpoints

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/auth/me/groups`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `POST /api/auth/request-access`

## Admin Access Requests

- `GET /api/admin/access-requests`
- `POST /api/admin/access-requests/:id/approve`
- `POST /api/admin/access-requests/:id/deny`

## Admin Groups

- `GET /api/admin/groups`
- `POST /api/admin/groups`
- `PUT /api/admin/groups/:id`
- `DELETE /api/admin/groups/:id`
- `GET /api/admin/groups/:id/users`

## Admin Users and Audit

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PUT /api/admin/users/:userId`
- `DELETE /api/admin/users/:userId/groups/:groupId`
- `GET /api/admin/audit-logs`
- `GET /api/admin/audit-logs/stats`

## Polymer Index Endpoints

- `GET /api/admin/polymer-indexes`
- `POST /api/admin/polymer-indexes`
- `PUT /api/admin/polymer-indexes/:id`
- `GET /api/admin/polymer-indexes/:id/values` — retrieve historical values for an index
- `POST /api/admin/polymer-indexes/:id/values` — write or update a single value (Mid writes are auto-computed)
- `POST /api/admin/polymer-indexes/import` — bulk import values from JSON rows
- `DELETE /api/admin/polymer-indexes/data/all` — **Admin only** delete all historical values (not index definitions)
- `POST /api/admin/polymer-indexes/recalculate-mid` — **One-time use** recalculate all Mid values from existing Min/Max pairs
- `GET /api/admin/polymer-indexes/reminders/due` — list pending publication reminders
- `GET /api/admin/polymer-indexes/data/by-week?startYear=YYYY&endYear=YYYY` — retrieve values grouped by ISO week

### Polymer Data Management

#### Clear All Historical Data

`DELETE /api/admin/polymer-indexes/data/all`

Deletes all values in `polymer_index_values` while preserving index definitions. Useful for bulk re-import.

Response:

```json
{
  "success": true,
  "deletedCount": 1250
}
```

#### Recalculate Mid Values (One-time)

`POST /api/admin/polymer-indexes/recalculate-mid`

Recalculates all Mid index values as the average of (Min + Max) / 2 for each shared date. This is typically run once after a bulk import if Mid values need backfilling.

**Note:** Mid values are now auto-calculated on Min/Max write; this endpoint is for historical data backfill only.

Response:

```json
{
  "success": true,
  "groupsProcessed": 8,
  "groupsSkipped": 1,
  "totalDatesProcessed": 480,
  "midCreated": 0,
  "midUpdated": 480
}
```

#### Polymer Import Payload

`POST /api/admin/polymer-indexes/import`

Request body:

```json
{
  "rows": [
    {
      "Index Name": "Platts PP",
      "Variant": "Min",
      "Value Date": "2026-02-25",
      "Value": 1.318
    }
  ]
}
```

Accepted header aliases are flexible (case and spacing tolerant), but preferred columns are:

- `Index Name` — base name (e.g., "Platts PP")
- `Variant` — "Min", "Mid", or "Max" (Mid will be auto-calculated if Min/Max exist)
- `Value Date` — ISO date format YYYY-MM-DD
- `Value` — numeric value (null or zero values are rejected)

**Max payload:** 10 MB JSON

Response shape:

```json
{
  "success": true,
  "result": {
    "totalRows": 48,
    "insertedValues": 20,
    "updatedValues": 28,
    "errors": []
  }
}
```

**Behavior:**
- Existing rows (same index + date) are updated
- New rows are inserted
- Mid values are auto-skipped on import (will be computed when Min/Max are written)
- Blank/zero values are rejected

## Costing and Metadata

- `GET /api/costs`
- `GET /api/metadata`
- `GET /api/export/costs`

## Product and BOM Endpoints

- `GET /api/products/editable`
- `POST /api/products/update`
- `POST /api/products/duplicate`
- `POST /api/products/delete`
- `GET /api/bom/lists`
- `GET /api/bom/customers`
- `PUT /api/bom/customers`
- `GET /api/bom/description-lists`
- `PUT /api/bom/description-lists/:listKey`
- `POST /api/bom/records` (auth required)
- `GET /api/bom/records` (auth required)
- `GET /api/bom/records/:id` (auth required)
- `PUT /api/bom/records/:id` (auth required)

### BOM Recipe Persistence

- `POST /api/bom/records`
  - Stores a full BOM snapshot in `bom_records` plus material percentages from Calculation Results in `bom_record_materials`
  - Request body includes:
    - `record` object (description fields, throughput/scrap values, minimum batch size + unit, notes)
    - `materials` array (`material_label`, `material_name`, `percentage`)

- `GET /api/bom/records`
  - Returns saved record list for future browsing/edit workflows

- `GET /api/bom/records/:id`
  - Returns one full BOM record including child `materials`

- `PUT /api/bom/records/:id`
  - Updates a saved BOM record and replaces its `materials` rows in a transaction

## Debug Endpoints

- `GET /api/debug/products`
- `GET /api/debug/lines`
- `GET /api/debug/materials`
- `GET /api/debug/fx`
- `GET /api/debug/costs`

## Frontend Page Routes (non-API)

- `/` — login page
- `/dashboard` — cost dashboard
- `/bom-calculator` — BOM calculator
- `/products` — product editor
- `/polymer-indexes` — polymer index manager (displays week-based data, chart, import/export)
