# Manufacturing Cost ERP System

Node.js + Express + vanilla JavaScript ERP for manufacturing cost analysis, product editing, BOM design, and polymer index management.

## Documentation Map

Use these files as the canonical documentation set:

- [README.md](README.md): Project overview, quick start, key features, structure
- [API.md](API.md): HTTP routes, endpoints, and payload reference
- [DEPLOYMENT.md](DEPLOYMENT.md): Local and production deployment steps
- [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md): Polymer index workflows, data model, chart feature, Mid auto-calc, data operations
- [CHANGELOG.md](CHANGELOG.md): Recent changes and feature updates
- [INDEX_VARIANT_IMPLEMENTATION.md](INDEX_VARIANT_IMPLEMENTATION.md): Historical implementation notes (reference only)

## Quick Start

1. Install dependencies
   - `npm install`
2. Initialize database and seed admin user
   - `node scripts/setup.js`
3. Start server
   - `npm start`
4. Open
   - `http://localhost:3000/`

Test credentials (created by setup script):

- Email: `testuser@pfnonwovens.com`
- Password: `TestPass123`

## Key Features

- Authenticated web app with role and group based access controls
- Cost dashboard with filters, currency conversion, and export
- Product editor (search, duplicate, update, delete)
- BOM calculator with list-driven dropdowns, throughput calculations, and recipe persistence
- BOM list management backed by SQLite tables (no runtime Excel dependency for dropdown lists)
- BOM recipe save flow with mandatory field validation before database write
- BOM snapshot storage includes Description fields, Calculation Results material percentages,
  minimum batch size/unit, and commentary notes
- **Polymer index management:**
  - Define index names with variants (Min/Mid/Max) and metadata (unit, currency, publish day)
  - Import historical values from CSV/Excel (up to 10 MB batch)
  - Admin-only bulk data operations (clear all values, recalculate Mid from Min/Max)
  - Weekly data table with sticky headers
  - **Line chart visualization** with selectable index series over chosen year range
  - Mid values are auto-calculated: Mid = (Min + Max) / 2

## Main Routes

Frontend (primary pages):

- `/` redirects to `/login.html`
- `/dashboard` cost dashboard
- `/bom-calculator` BOM calculator
- `/products` product editor
- `/polymer-indexes` polymer index manager

Frontend (supplementary pages):

- `/request-access.html` user access request form
- `/admin-access.html` admin panel (groups, users, permissions) — accessible to admins only
- `/polymer-index-admin.html` polymer index definition manager — accessible to admins only

API root:

- `/api/...` (full list in [API.md](API.md))

## Project Structure

```text
o
```

## Data and Database Notes

- Application SQLite database is at `data/mini_erp.db`
- Source Excel files for costing are in `data/`
- Polymer index values are stored separately from index definitions
- BOM calculator persistence uses tables such as `bom_records` and `bom_record_materials`

## Security Notes

- Change JWT secret for production
- Keep production behind HTTPS
- Restrict admin access to trusted users/groups

See [DEPLOYMENT.md](DEPLOYMENT.md) for production hardening details.
