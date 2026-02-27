# Quick Start Guide

Get the Manufacturing Cost ERP system up and running in 5 minutes.

## Prerequisites

- **Node.js** 14 or higher ([download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Excel files** in the `data/` directory:
  - `FX_rates.xlsx`
  - `Lines.xlsx`
  - `Products.xlsx`
  - `RawMat_prices.xlsx`

## Installation (5 minutes)

### Step 1: Install Dependencies

```bash
cd mini-erp-node
npm install
```

This installs:
- **express** - Web server
- **cors** - Cross-origin requests
- **xlsx** - Excel file parsing

### Step 2: Verify Excel Files

Ensure all Excel files are in the `data/` directory:

```bash
# Windows
dir data

# Mac/Linux
ls -la data/
```

You should see:
```
FX_rates.xlsx
Lines.xlsx
Products.xlsx
RawMat_prices.xlsx
```

### Step 3: Start the Server

```bash
npm start
```

Output should be:
```
Server running at http://localhost:3000
API docs:
  - GET /api/health - Health check
  - GET /api/metadata - Available filters
  - GET /api/costs - Main costing endpoint
  - GET /api/export/costs - Export to CSV
...
```

### Step 4: Open in Browser

Visit: **http://localhost:3000**

You should see the Manufacturing Cost ERP Dashboard.

## First Steps

### 1. View All Costs
- Click **"Load Costs"** button
- The table shows material, process, and total costs for each product-line combination

### 2. Switch to Different Currency
- Select currency from dropdown (USD, CZK, EUR, ZAR). Note: the frontend dropdown intentionally omits GBP though the server can still compute GBP if requested via the API.
- Click **"Load Costs"** 
- All values update automatically

### 3. Filter by Product (multi-select)
- Click the product filter to open the dropdown
- Use **Ctrl+click** (or **Cmd+click** on Mac) to select multiple values
- Click **"Load Costs"** to apply filters
- Table shows selected products' costs across all lines

### 4. View Detailed Breakdown
- Click any row in the table
- A modal opens showing:
  - Material composition and costs
  - Process cost components
  - Detailed calculations

### 5. Try Detailed View
- Select **"Detailed (Full Breakdown)"** from the View Mode dropdown
- Instead of a table, you see expanded sections for each product
- Useful for analyzing materials and process costs together

### 6. Export Data
- Set your filters (currency, product, country, etc.)
- Click **"Export CSV"**
- A CSV file downloads for further analysis in Excel

### 7. BOM Calculator (Optional)
- Open **http://localhost:3000/src/frontend/bom-calculator.html**
- Select a line to auto-populate Width (m), Adjusted effective width (m), and line parameters
- Throughput fields (displayed as whole numbers):
  * SB Throughput (kg/h/m/beam) from Belt BW, MB grams, Belt Speed, S Beams
  * MB Throughput (kg/h/m/beam) from MB grams, Belt Speed, M Beams
  * Total Throughput (kg/h) = (SB × S Beams × Adjusted width) + (MB × M Beams × Adjusted width)
  * Production Time (hrs/t) = 1000 / (Gross Yield × Throughput)
  * Batch Production Time (including overconsumption) = (1 + overconsumption) × minimum batch size (tons) × production time
- Required field color system: red (mandatory when empty), yellow (optional when empty), blue (completed)
### Top Horizontal Scroller
- When the aggregated table is wide, use the synchronized scrollbar at the top of the table to scroll horizontally without having to move to the bottom of the table.

## Common Tasks

### Find the Cheapest Product on a Line
1. Set **Currency** to your preferred currency
2. Set **View Mode** to **"Aggregated"**
3. Sort by **"Total Cost"** column
4. Compare costs across products

### Analyze Material Costs for a Product
1. Type **Product ID** in filter
2. Click **"Load Costs"**
3. Click any row to open detail modal
4. Review **"Material Breakdown"** table
5. See which materials contribute most to cost

### Compare Costs Across Countries
1. Clear all filters (**"Clear Filters"** button)
2. Switch to **"Detailed View"**
3. Scroll through sections organized by country
4. Compare material and process costs

### Export for Spreadsheet Analysis
1. Set filters to desired subset
2. Set currency for export
3. Click **"Export CSV"**
4. Open in Excel for further analysis

## Product Editor

The Product Editor allows you to create, edit, and copy product definitions directly in the system.

### Access the Product Editor
1. Click **"Product Editor"** link in the main dashboard navigation
2. Or visit directly: **http://localhost:3000/src/frontend/products-editor.html**

### Common Tasks in Product Editor

#### Create a Copy of an Existing Product
1. Search for the product you want to copy
2. Click the **"Copy"** button on the product row
3. The product is duplicated with SAP ID and PFN ID set to "TBD"
4. Click **"Edit"** on the new product to assign new IDs and customize

#### Edit Product Details
1. Search for or scroll to the product you want to edit
2. Click the **"Edit"** button
3. Update any field:
   - Product specifications (Customer, Market Segment, Application, etc.)
   - Production parameters (Gross Yield, Throughput, Overconsumption)
   - Bill of Materials (material names and percentages)
4. Click **"Save"** to write changes to the Excel file

#### Add New Product from Template
1. Find a similar existing product
2. Click **"Copy"** to duplicate it
3. Edit the copied product:
   - Assign new SAP ID and PFN ID
   - Modify specifications as needed
   - Update BOM and production parameters
4. Click **"Save"**
5. Return to dashboard and reload to see the new product in cost calculations

#### Manage Bill of Materials (BOM)
When editing a product, you can modify the material composition:
- **Material Fields**: Enter material names (e.g., "PE Resin", "SB1", "Additive")
- **Percentage Fields**: Enter the weight percentage for each material
- **Special Fields**:
  - `Siko%`: Recycled scrap replacement percentage
  - `Repro%`: Regranulated waste replacement percentage
  - `Adj. SB1%`: Automatically calculated (SB1% - Siko% - Repro%)

### Important Notes
- Changes are saved immediately to the Excel file
- Refresh the main dashboard to see updated costs for modified products
- Use copy feature to create product variants quickly
- Assign "TBD" IDs to new products and update them later

## API Usage (for developers)

### Test the API with curl

```bash
# Health check
curl http://localhost:3000/api/health

# Get all metadata
curl http://localhost:3000/api/metadata

# Get all costs
curl http://localhost:3000/api/costs

# Get costs for specific product
curl http://localhost:3000/api/costs?productId=PROD001

# Get costs in EUR for CZ country
curl "http://localhost:3000/api/costs?country=CZ&currency=EUR"

# Export as CSV
curl http://localhost:3000/api/export/costs > costs.csv

# View debug data
curl http://localhost:3000/api/debug/products | more
curl http://localhost:3000/api/debug/fx | more
```

## Troubleshooting

### Server Won't Start

**Error:** `ENOENT: no such file or directory`

**Solution:** Make sure Excel files are in the `data/` directory

```bash
# Create directory if it doesn't exist
mkdir data

# Copy Excel files here
# Then restart: npm start
```

---

### "No data found" Message

**Cause:** Filters are too restrictive

**Solution:** 
1. Click **"Clear Filters"**
2. Click **"Load Costs"** again
3. If still no data, check debug endpoint:
   ```bash
   curl http://localhost:3000/api/debug/products
   ```

---

### Wrong Currency Values

**Cause:** FX rate missing

**Solution:**
1. Check FX_rates.xlsx has rate pairs
2. Example: `EURUSD` = 1.10
3. System auto-generates reverse pairs
4. Restart server after updating Excel

---

### Autocomplete Not Working

**Cause:** Metadata endpoint failed

**Solution:**
1. Try manually entering values
2. Check browser console for errors
3. Verify Excel data in debug endpoints

---

## Next Steps

### Learn More
- Read [README.md](./README.md) for full documentation
- Check [API.md](./API.md) for complete API reference
- Review Excel file formats for data import

### Customize
- Update Excel files with your data
- Add new currencies to FX_rates.xlsx
- Modify styling in `src/frontend/styles.css`

### Deploy
- Deploy to production server
- Use process manager (pm2, systemctl)
- Set up reverse proxy (nginx)
- Configure HTTPS/SSL

### Develop
- Add new features to backend
- Enhance frontend UI
- Implement database backend
- Add user authentication

## Support

### Quick Debug
Check what the system is loading:

```bash
# View products being parsed
curl http://localhost:3000/api/debug/products | jq '.[0]'

# View lines and their costs
curl http://localhost:3000/api/debug/lines | jq 'keys'

# View material prices
curl http://localhost:3000/api/debug/materials | jq '.materials | keys' | head -20

# View FX rates
curl http://localhost:3000/api/debug/fx | jq 'keys' | head -20
```

### Check Browser Console
1. Press **F12** to open Developer Tools
2. Click **Console** tab
3. Look for errors (red text)
4. Copy error messages for troubleshooting

### Log File Analysis
Server logs appear in terminal where you ran `npm start`:

```bash
# Look for errors like:
# "Error computing cost for product..." 
# "Missing material price..."
# "Missing line..."
```

---

## Key Concepts

### Material Cost (Net)
Includes:
- Base material composition × prices
- Overconsumption adjustment
- Scrap losses and handling
- Final cost per net kg of product

### Process Cost
Includes:
- Hourly costs (energy, wages, maintenance, SGA)
- Spread over kg produced per hour
- Per-ton costs (cores, packaging, pallets)
- Total cost per kg produced

### Yield & Scrap
- **Gross Yield**: % of material that becomes usable product
- **Scrap**: Material that doesn't make usable product
- **Siko**: Cost to handle/process scrap
- **Formula**: `Net Cost = Gross Cost ÷ Yield + Scrap × Siko Cost`

---

## Performance Baseline

Typical performance on a standard laptop:

| Task | Time |
|------|------|
| Server start | < 1 second |
| Load all costs (JSON) | 100-500ms |
| Load metadata | 50-100ms |
| Export to CSV | 100-200ms |
| Detail modal open | instant (client-side) |

With ~1000 products across 50 lines.

---

## Files Summary

| File | Purpose |
|------|---------|
| `server.js` | Express server & API |
| `src/backend/costing.js` | Cost calculation engine |
| `src/backend/fx.js` | Currency conversion |
| `src/backend/materials.js` | Material price loading |
| `src/backend/lines.js` | Manufacturing line loading |
| `src/backend/products.js` | Product/BOM loading |
| `src/backend/products-editor.js` | Product editing and duplication logic |
| `src/frontend/index.html` | Dashboard UI structure |
| `src/frontend/products-editor.html` | Product editor UI |
| `src/frontend/styles.css` | UI styling |
| `src/frontend/script.js` | Dashboard UI logic |
| `README.md` | Full documentation |
| `API.md` | API reference |

---

**Ready to go!** If you have questions, check the full [README.md](./README.md) or [API.md](./API.md).
