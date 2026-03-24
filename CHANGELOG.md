# Changelog

All notable changes to the Mini ERP system are documented here. For current feature and API documentation, see [README.md](README.md), [API.md](API.md), and [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md).

## [Unreleased]

### Added

#### BOM Calculator Updates
- **BOM recipe persistence to SQLite**
  - Added `bom_records` table for full saved BOM snapshots
  - Added `bom_record_materials` table for Calculation Results material percentages
  - Added authenticated endpoints:
    - `POST /api/bom/records`
    - `GET /api/bom/records`
    - `GET /api/bom/records/:id`
    - `PUT /api/bom/records/:id`
  - Save flow now stores:
    - Description values (including hidden SAP ID)
    - Calculation Results material composition percentages
    - Minimum batch size + unit
    - Commentary notes
    - Beam Configuration per-column matrix is intentionally not persisted in this flow

- **BOM list migration to database-backed storage**
  - Customer list moved from `customer-list.json` to `bom_customers`
  - Description and material dropdown lists moved from Excel runtime reads to:
    - `bom_dropdown_lists`
    - `bom_dropdown_list_items`
  - Added list APIs:
    - `GET/PUT /api/bom/customers`
    - `GET /api/bom/lists`
    - `GET/PUT /api/bom/description-lists`
  - Added fallback seed sources for customers (Sources.xlsx + product data) when legacy JSON is missing

- **List editing and ordering enhancements**
  - Added in-page list editor modal for editable description lists
  - Kept Line as read-only list
  - Applied alphabetical sorting to server and client list rendering
  - `n.a.` variants are always displayed last

- **Save UX improvements**
  - Added `Save BOM Record` action to toolbar and below Calculation Results
  - Save actions appear after successful BOM calculation
  - Added save-preview modal summary
  - Updated preview fields: show `S/SMS` and `Customer BW` (instead of `Structure`)
  - Added mandatory red-field validation before saving recipe to DB

- **Scrap percentage formula simplified**: Removed "Changeover Loss" field
  - Total Scrap now calculated as: Edge trim + Web loss + Other scrap
  - Users can incorporate changeover losses into "Other scrap" field
- **Width unit clarification**: Updated field labels from "(%)" to "(m)" for width measurements
  - "Max usable width (brutto, m)"
  - "Usable width (netto, m)"

#### Polymer Index Features
- **Line Chart Visualization** (`Show Chart` button on `/polymer-indexes`)
  - Interactive chart displays index trends over selected year range
  - Checkboxes to select/deselect index series in real-time
  - "Select All" / "Deselect All" quick controls
  - Chart updates instantly as users toggle indexes
  
- **Mid Value Auto-Calculation**
  - Mid variant is now computed as (Min + Max) / 2 when both Min and Max exist for a date
  - Direct Mid writes are rejected and auto-computed instead
  - Import endpoint skips Mid rows (auto-calculated on Min/Max import)
  - Backend endpoint `POST /api/admin/polymer-indexes/recalculate-mid` for one-time backfill
  
- **Admin Data Operations**
  - `DELETE /api/admin/polymer-indexes/data/all` endpoint to clear all historical values
  - Red "Clear All Data" button with two-step confirmation (dialog + text prompt)
  - Audit logging for destructive operations
  
- **Large Import Support**
  - JSON payload limit increased to 10 MB
  - Supports bulk imports of 2000+ rows without row-count cap
  - Flexible CSV/Excel column header matching

- **UI/UX Improvements**
  - Sticky table headers (both rows stay visible while scrolling)
  - Header calculation based on actual rendered height, supporting cross-browser consistency
  - Window resize handler to maintain sticky positioning

### Changed
- BOM form field behavior and layout updates:
  - Moved Belt Speed to follow Line
  - Moved Treatment and Color after Main RawMat
  - Swapped scrap field roles:
    - Web loss is now calculated/read-only
    - Edge trim is now manual input
  - S Beams and M Beams now auto-fill from line defaults but can be manually reduced (with max clamp)
- Removed `SAP ID (similar material)` from the BOM form and data handling
- Polymer index data model now enforces single-write semantics: Min/Max writes trigger Mid auto-calculation
- Import behavior updated to skip Mid rows and auto-calculate based on Min/Max pairs
- Index metadata (unit, currency, publish_weekday) properly populated in weekly data aggregation

### Fixed
- BOM record save stability improvements:
  - Hardened parent/child insert logic for `bom_records` and `bom_record_materials`
  - Added stronger error handling and diagnostics in save endpoint
- Sticky header gap/overlap issue in Historical Data by Week table
- Missing header metadata (unit, currency) in weekly data API response
- Mid value field visibility in admin UI based on data state

## [Prior Versions]

See [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md) and [INDEX_VARIANT_IMPLEMENTATION.md](INDEX_VARIANT_IMPLEMENTATION.md) for earlier implementation history.

---

## Documentation Map

**Quick Links:**
- [README.md](README.md) — Project overview, quick start, key features
- [API.md](API.md) — Complete API endpoint reference
- [POLYMER_INDEXES_DOCUMENTATION.md](POLYMER_INDEXES_DOCUMENTATION.md) — Polymer index workflows, data model, UI features
- [DEPLOYMENT.md](DEPLOYMENT.md) — Local and production deployment instructions
- [CHANGELOG.md](CHANGELOG.md) — This file; recent changes and feature additions
