const express = require("express");
const path = require("path");
const cors = require("cors");
const fs = require("fs");

const { computeCosts } = require("./src/backend/costing");
const { loadProducts } = require("./src/backend/products");
const { loadLines } = require("./src/backend/lines");
const { loadMaterials } = require("./src/backend/materials");
const { loadFxRates } = require("./src/backend/fx");
const { getEditableProducts, updateProduct, searchProducts, duplicateProduct, deleteProduct } = require("./src/backend/products-editor");
const db = require("./src/backend/db/connection");
const auth = require("./src/backend/auth");
const polymerIndexes = require("./src/backend/polymer-indexes");
const XLSX = require("xlsx");

const app = express();

const CUSTOMER_LIST_FILE_PATH = path.join(__dirname, "data", "customer-list.json");
let customerStoreInitPromise = null;
let bomListStoreInitPromise = null;
let bomRecordStoreInitPromise = null;

const DESCRIPTION_LIST_CONFIG = [
  { key: "marketSegment", sourceHeader: "Segment", editable: 1 },
  { key: "application", sourceHeader: "Application", editable: 1 },
  { key: "smms", sourceHeader: "S/SMS", editable: 1 },
  { key: "monoBico", sourceHeader: "Mono/Bico", editable: 1 },
  { key: "structure", sourceHeader: "Structure", editable: 1 },
  { key: "bicoRatioDesc", sourceHeader: "BICO_ratio", editable: 1 },
  { key: "mainRawMat", sourceHeader: "Main RawMat", editable: 1 },
  { key: "bonding", sourceHeader: "Bonding", editable: 1 },
  { key: "treatment", sourceHeader: "Treatment", editable: 1 },
  { key: "color", sourceHeader: "Color", editable: 1 },
  { key: "line", sourceHeader: "Line", editable: 0 },
  { key: "cores", sourceHeader: "Cores", editable: 0 }
];

const MATERIAL_LIST_CONFIG = [
  { key: "list_sb", columnIndex: 0 },
  { key: "list_mb", columnIndex: 1 },
  { key: "list_pigment", columnIndex: 2 },
  { key: "list_additive", columnIndex: 3 },
  { key: "list_surfactant", columnIndex: 4, numericColumnIndex: 5 }
];

function normalizeUniqueStrings(values) {
  const seen = new Set();
  const normalized = [];

  (values || []).forEach((value) => {
    const text = (value ?? "").toString().trim();
    if (!text) return;

    const key = text.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    normalized.push(text);
  });

  return normalized;
}

function isNaDisplayValue(value) {
  const normalized = (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  return normalized === "n.a." || normalized === "n.a" || normalized === "na" || normalized === "n/a";
}

function sortValuesForDisplay(values) {
  return [...(values || [])].sort((a, b) => {
    const aIsNa = isNaDisplayValue(a);
    const bIsNa = isNaDisplayValue(b);

    if (aIsNa && !bIsNa) return 1;
    if (!aIsNa && bIsNa) return -1;

    return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
  });
}

function readLegacyCustomerListFile() {
  try {
    if (!fs.existsSync(CUSTOMER_LIST_FILE_PATH)) {
      return [];
    }

    const raw = fs.readFileSync(CUSTOMER_LIST_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.customers;

    return normalizeUniqueStrings(Array.isArray(list) ? list : []);
  } catch (err) {
    console.error("Error reading legacy customer list file:", err);
    return [];
  }
}

function hasCaseInsensitiveDuplicates(values) {
  const seen = new Set();

  for (const value of values || []) {
    const text = (value ?? "").toString().trim();
    if (!text) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      return true;
    }

    seen.add(key);
  }

  return false;
}

function getCustomerSeedValuesFromSources() {
  const sourceData = getListsSheetRowsFromSources();
  const headerMap = new Map(
    (sourceData.headers || []).map((header, index) => [normalizeHeaderText(header), index])
  );

  const customerColumnIndex = headerMap.get("customer");
  if (customerColumnIndex === undefined) {
    return [];
  }

  return normalizeUniqueStrings(sourceData.rows.map((row) => row[customerColumnIndex]));
}

function getCustomerSeedValuesFromProducts() {
  try {
    const products = loadProducts();
    return normalizeUniqueStrings((products || []).map((item) => item.customer));
  } catch (err) {
    console.warn("Customer seed from products failed:", err.message || err);
    return [];
  }
}

function normalizeHeaderText(value) {
  return (value || "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getListsSheetRowsFromSources() {
  const sourceCandidates = [
    path.join(__dirname, "data", "File Sources.xlsx"),
    path.join(__dirname, "data", "Sources.xlsx")
  ];

  for (const sourcePath of sourceCandidates) {
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    const workbook = XLSX.readFile(sourcePath);
    const listsSheetName = (workbook.SheetNames || []).find((name) => normalizeHeaderText(name) === "lists");
    if (!listsSheetName) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[listsSheetName], { header: 1, defval: "" });
    const headers = rows[0] || [];
    return {
      headers,
      rows: rows.slice(1)
    };
  }

  return {
    headers: [],
    rows: []
  };
}

async function ensureBomListStoreReady() {
  if (!bomListStoreInitPromise) {
    bomListStoreInitPromise = (async () => {
      await db.init();

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_dropdown_lists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          list_key TEXT NOT NULL UNIQUE,
          list_group TEXT NOT NULL,
          editable INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_dropdown_list_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          list_id INTEGER NOT NULL,
          value TEXT NOT NULL COLLATE NOCASE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          numeric_value REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (list_id) REFERENCES bom_dropdown_lists(id) ON DELETE CASCADE,
          UNIQUE(list_id, value)
        )
      `);

      for (const list of DESCRIPTION_LIST_CONFIG) {
        await db.run(
          `INSERT INTO bom_dropdown_lists (list_key, list_group, editable)
           VALUES (?, 'description', ?)
           ON CONFLICT(list_key) DO UPDATE SET
             list_group='description',
             editable=excluded.editable,
             updated_at=CURRENT_TIMESTAMP`,
          [list.key, list.editable]
        );
      }

      for (const list of MATERIAL_LIST_CONFIG) {
        await db.run(
          `INSERT INTO bom_dropdown_lists (list_key, list_group, editable)
           VALUES (?, 'material', 0)
           ON CONFLICT(list_key) DO UPDATE SET
             list_group='material',
             editable=0,
             updated_at=CURRENT_TIMESTAMP`,
          [list.key]
        );
      }

      const sourceData = getListsSheetRowsFromSources();
      const headerMap = new Map(
        (sourceData.headers || []).map((header, index) => [normalizeHeaderText(header), index])
      );

      for (const list of DESCRIPTION_LIST_CONFIG) {
        const listRow = await db.get("SELECT id FROM bom_dropdown_lists WHERE list_key = ?", [list.key]);
        if (!listRow) {
          continue;
        }

        const itemCountRow = await db.get(
          "SELECT COUNT(*) AS count FROM bom_dropdown_list_items WHERE list_id = ?",
          [listRow.id]
        );
        if ((itemCountRow?.count || 0) > 0) {
          continue;
        }

        const sourceIndex = headerMap.get(normalizeHeaderText(list.sourceHeader));
        if (sourceIndex === undefined) {
          continue;
        }

        const values = normalizeUniqueStrings(sourceData.rows.map((row) => row[sourceIndex]));
        for (let i = 0; i < values.length; i++) {
          await db.run(
            "INSERT INTO bom_dropdown_list_items (list_id, value, sort_order) VALUES (?, ?, ?)",
            [listRow.id, values[i], i]
          );
        }
      }

      for (const list of MATERIAL_LIST_CONFIG) {
        const listRow = await db.get("SELECT id FROM bom_dropdown_lists WHERE list_key = ?", [list.key]);
        if (!listRow) {
          continue;
        }

        const itemCountRow = await db.get(
          "SELECT COUNT(*) AS count FROM bom_dropdown_list_items WHERE list_id = ?",
          [listRow.id]
        );
        if ((itemCountRow?.count || 0) > 0) {
          continue;
        }

        const values = [];
        const numericMap = {};

        for (const row of sourceData.rows) {
          const rawValue = row[list.columnIndex];
          const textValue = (rawValue ?? "").toString().trim();
          if (!textValue) {
            continue;
          }

          const existingIndex = values.findIndex((item) => item.toLowerCase() === textValue.toLowerCase());
          if (existingIndex === -1) {
            values.push(textValue);
          }

          if (list.numericColumnIndex !== undefined) {
            const numericRaw = parseFloat(row[list.numericColumnIndex]);
            if (Number.isFinite(numericRaw) && numericMap[textValue] === undefined) {
              numericMap[textValue] = numericRaw;
            }
          }
        }

        for (let i = 0; i < values.length; i++) {
          const value = values[i];
          await db.run(
            "INSERT INTO bom_dropdown_list_items (list_id, value, sort_order, numeric_value) VALUES (?, ?, ?, ?)",
            [listRow.id, value, i, numericMap[value] ?? null]
          );
        }
      }
    })();
  }

  return bomListStoreInitPromise;
}

async function getDescriptionListValues() {
  await ensureBomListStoreReady();
  const rows = await db.all(`
    SELECT l.list_key, i.value
    FROM bom_dropdown_lists l
    LEFT JOIN bom_dropdown_list_items i ON i.list_id = l.id
    WHERE l.list_group = 'description'
    ORDER BY l.list_key, i.sort_order, lower(i.value)
  `);

  const result = {};
  DESCRIPTION_LIST_CONFIG.forEach((list) => {
    result[list.key] = [];
  });

  rows.forEach((row) => {
    if (row.value) {
      result[row.list_key].push(row.value);
    }
  });

  Object.keys(result).forEach((key) => {
    result[key] = sortValuesForDisplay(result[key]);
  });

  return result;
}

async function saveDescriptionListValuesWithoutDeletion(listKey, values) {
  await ensureBomListStoreReady();

  const config = DESCRIPTION_LIST_CONFIG.find((item) => item.key === listKey);
  if (!config) {
    const error = new Error("Unknown description list key.");
    error.code = "DESCRIPTION_LIST_UNKNOWN";
    throw error;
  }

  if (!config.editable) {
    const error = new Error("This list is read-only.");
    error.code = "DESCRIPTION_LIST_READONLY";
    throw error;
  }

  const normalized = normalizeUniqueStrings(values);
  const listRow = await db.get("SELECT id FROM bom_dropdown_lists WHERE list_key = ?", [listKey]);
  if (!listRow) {
    const error = new Error("Description list not found.");
    error.code = "DESCRIPTION_LIST_UNKNOWN";
    throw error;
  }

  const existingRows = await db.all(
    "SELECT id, value FROM bom_dropdown_list_items WHERE list_id = ? ORDER BY sort_order, id",
    [listRow.id]
  );

  if (normalized.length < existingRows.length) {
    const error = new Error("Removing existing values is not allowed.");
    error.code = "DESCRIPTION_LIST_REMOVAL_NOT_ALLOWED";
    throw error;
  }

  await db.run("BEGIN IMMEDIATE TRANSACTION");
  try {
    const timestamp = Date.now();

    for (const row of existingRows) {
      await db.run(
        "UPDATE bom_dropdown_list_items SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [`__tmp__${row.id}__${timestamp}`, row.id]
      );
    }

    for (let i = 0; i < existingRows.length; i++) {
      await db.run(
        `UPDATE bom_dropdown_list_items
         SET value = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [normalized[i], i, existingRows[i].id]
      );
    }

    for (let i = existingRows.length; i < normalized.length; i++) {
      await db.run(
        "INSERT INTO bom_dropdown_list_items (list_id, value, sort_order) VALUES (?, ?, ?)",
        [listRow.id, normalized[i], i]
      );
    }

    await db.run("COMMIT");
  } catch (error) {
    await db.run("ROLLBACK").catch(() => {});
    throw error;
  }

  const refreshed = await getDescriptionListValues();
  return refreshed[listKey] || [];
}

async function getMaterialListValues() {
  await ensureBomListStoreReady();

  const rows = await db.all(`
    SELECT l.list_key, i.value, i.numeric_value
    FROM bom_dropdown_lists l
    LEFT JOIN bom_dropdown_list_items i ON i.list_id = l.id
    WHERE l.list_group = 'material'
    ORDER BY l.list_key, i.sort_order, lower(i.value)
  `);

  const payload = {
    list_sb: [],
    list_mb: [],
    list_pigment: [],
    list_additive: [],
    list_surfactant: [],
    surfactant_conc_map: {}
  };

  rows.forEach((row) => {
    if (!row.value) {
      return;
    }

    if (payload[row.list_key]) {
      payload[row.list_key].push(row.value);
    }

    if (row.list_key === "list_surfactant") {
      payload.surfactant_conc_map[row.value] = Number.isFinite(row.numeric_value) ? row.numeric_value : "";
    }
  });

  payload.list_sb = sortValuesForDisplay(payload.list_sb);
  payload.list_mb = sortValuesForDisplay(payload.list_mb);
  payload.list_pigment = sortValuesForDisplay(payload.list_pigment);
  payload.list_additive = sortValuesForDisplay(payload.list_additive);
  payload.list_surfactant = sortValuesForDisplay(payload.list_surfactant);

  return payload;
}

async function ensureCustomerStoreReady() {
  if (!customerStoreInitPromise) {
    customerStoreInitPromise = (async () => {
      await db.init();

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const countRow = await db.get("SELECT COUNT(*) AS count FROM bom_customers");
      const existingCount = countRow?.count || 0;
      if (existingCount > 0) {
        return;
      }

      const legacyCustomers = readLegacyCustomerListFile();
      const sourceCustomers = getCustomerSeedValuesFromSources();
      const productCustomers = getCustomerSeedValuesFromProducts();
      const seedCustomers = normalizeUniqueStrings([
        ...legacyCustomers,
        ...sourceCustomers,
        ...productCustomers
      ]);

      if (seedCustomers.length === 0) {
        return;
      }

      await db.run("BEGIN IMMEDIATE TRANSACTION");
      try {
        for (const customerName of seedCustomers) {
          await db.run("INSERT INTO bom_customers (name) VALUES (?)", [customerName]);
        }
        await db.run("COMMIT");
      } catch (error) {
        await db.run("ROLLBACK").catch(() => {});
        throw error;
      }
    })();
  }

  return customerStoreInitPromise;
}

async function getCustomerRowsById() {
  await ensureCustomerStoreReady();
  return db.all("SELECT id, name FROM bom_customers ORDER BY id ASC");
}

async function getCustomerNames() {
  await ensureCustomerStoreReady();
  const rows = await db.all("SELECT name FROM bom_customers");
  return sortValuesForDisplay(rows.map((row) => row.name));
}

async function saveCustomerNamesWithoutDeletion(customers) {
  const normalized = normalizeUniqueStrings(customers);
  const existingRows = await getCustomerRowsById();

  if (normalized.length < existingRows.length) {
    const error = new Error("Removing existing customers is not allowed.");
    error.code = "CUSTOMER_REMOVAL_NOT_ALLOWED";
    throw error;
  }

  await db.run("BEGIN IMMEDIATE TRANSACTION");
  try {
    const timestamp = Date.now();

    // Two-phase rename avoids unique collisions during swaps (e.g. A->B and B->A).
    for (const row of existingRows) {
      await db.run(
        "UPDATE bom_customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [`__tmp__${row.id}__${timestamp}`, row.id]
      );
    }

    for (let i = 0; i < existingRows.length; i++) {
      await db.run(
        "UPDATE bom_customers SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [normalized[i], existingRows[i].id]
      );
    }

    for (let i = existingRows.length; i < normalized.length; i++) {
      await db.run(
        "INSERT INTO bom_customers (name) VALUES (?)",
        [normalized[i]]
      );
    }

    await db.run("COMMIT");
  } catch (error) {
    await db.run("ROLLBACK").catch(() => {});
    throw error;
  }

  return getCustomerNames();
}

async function ensureBomRecordStoreReady() {
  if (!bomRecordStoreInitPromise) {
    bomRecordStoreInitPromise = (async () => {
      await db.init();

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sap_id TEXT,
          pd_id TEXT,
          customer TEXT,
          market_segment TEXT,
          application TEXT,
          smms TEXT,
          mono_bico TEXT,
          structure TEXT,
          bico_ratio_desc TEXT,
          main_raw_mat TEXT,
          treatment TEXT,
          color TEXT,
          bonding TEXT,
          customer_bw REAL,
          belt_bw REAL,
          mb_grams REAL,
          line TEXT,
          belt_speed REAL,
          siko_percent REAL,
          repro_percent REAL,
          max_usable_width REAL,
          usable_width REAL,
          edge_trim_percent REAL,
          web_loss_percent REAL,
          other_scrap_percent REAL,
          total_scrap_percent REAL,
          gross_yield_percent REAL,
          s_beams INTEGER,
          m_beams INTEGER,
          sb_throughput REAL,
          mb_throughput REAL,
          total_throughput REAL,
          production_time REAL,
          cores TEXT,
          slit_width REAL,
          length_meters REAL,
          roll_diameter REAL,
          target_production REAL,
          target_unit TEXT,
          notes TEXT,
          author TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_by INTEGER
        )
      `);

      // Migration: Add author column if it doesn't exist
      try {
        await db.run('ALTER TABLE bom_records ADD COLUMN author TEXT');
        console.log('[MIGRATION] Added author column to bom_records');
      } catch (err) {
        // Column already exists, that's fine
        if (!err.message.includes('duplicate column name')) {
          console.error('[MIGRATION] Error adding author column:', err.message);
        }
      };

      await db.run(`
        CREATE TABLE IF NOT EXISTS bom_record_materials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id INTEGER NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          material_label TEXT NOT NULL,
          material_name TEXT NOT NULL,
          percentage REAL NOT NULL,
          FOREIGN KEY (record_id) REFERENCES bom_records(id) ON DELETE CASCADE
        )
      `);
    })();
  }
  return bomRecordStoreInitPromise;
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize database on startup
auth.initializeDatabase().catch(err => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});

polymerIndexes.initializeDatabase().catch(err => {
  console.error("Failed to initialize polymer index database:", err);
  process.exit(1);
});

ensureCustomerStoreReady().catch(err => {
  console.error("Failed to initialize customer store:", err);
  process.exit(1);
});

ensureBomListStoreReady().catch(err => {
  console.error("Failed to initialize BOM list store:", err);
  process.exit(1);
});

ensureBomRecordStoreReady().catch(err => {
  console.error("Failed to initialize BOM record store:", err);
  process.exit(1);
});

// ==================== FRONTEND ROUTING ====================

// Redirect root to login page
app.get("/", (req, res, next) => {
  try {
    console.log("[ROUTE] GET / - Redirecting to /login.html");
    res.redirect("/login.html");
  } catch (err) {
    console.error("[ERROR] Root redirect failed:", err);
    next(err);
  }
});

// Map specific URLs to HTML files - use sendFile with absolute paths
app.get("/dashboard", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "index.html");
    console.log("[ROUTE] GET /dashboard - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send index.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] Dashboard route error:", err);
    next(err);
  }
});

app.get("/bom-calculator", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "bom-calculator.html");
    console.log("[ROUTE] GET /bom-calculator - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send bom-calculator.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] BOM calculator route error:", err);
    next(err);
  }
});

app.get("/bom-recipe-browser", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "bom-recipe-browser.html");
    console.log("[ROUTE] GET /bom-recipe-browser - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send bom-recipe-browser.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] BOM recipe browser route error:", err);
    next(err);
  }
});

app.get("/products", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "products-editor.html");
    console.log("[ROUTE] GET /products - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send products-editor.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] Products route error:", err);
    next(err);
  }
});

app.get("/polymer-indexes", (req, res, next) => {
  try {
    const filePath = path.join(__dirname, "src", "frontend", "polymer-indexes.html");
    console.log("[ROUTE] GET /polymer-indexes - Serving:", filePath);
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error("[ERROR] Failed to send polymer-indexes.html:", err);
        next(err);
      }
    });
  } catch (err) {
    console.error("[ERROR] Polymer indexes route error:", err);
    next(err);
  }
});

// Public static files (CSS, JS, HTML, etc.)
app.use(express.static(path.join(__dirname, "src", "frontend"), {
  dotfiles: 'deny',
  index: false
}));

// Serve data files (e.g., PFN_logo.png) from /data
app.use('/data', express.static(path.join(__dirname, 'data')));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==================== AUTHENTICATION ENDPOINTS ====================

// Login endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await auth.login(email, password);
    res.json(result);
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

// Get current user
app.get("/api/auth/me", auth.authMiddleware, async (req, res) => {
  try {
    const user = await auth.getCurrentUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user's groups
app.get("/api/auth/me/groups", auth.authMiddleware, async (req, res) => {
  console.log(`[DEBUG] GET /api/auth/me/groups called for user: ${req.user.email}`);
  try {
    const groups = await auth.getUserGroups(req.user.id);
    console.log(`[DEBUG] Found ${groups.length} groups for ${req.user.email}`);
    res.json(groups);
  } catch (err) {
    console.error(`[ERROR] /api/auth/me/groups error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Logout endpoint (frontend just clears token, but good for audit logging)
app.post("/api/auth/logout", auth.authMiddleware, async (req, res) => {
  try {
    await auth.auditLog(req.user.id, 'LOGOUT', 'auth', {});

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Change password endpoint
app.post("/api/auth/change-password", auth.authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const result = await auth.changePassword(req.user.id, currentPassword, newPassword);
    
    if (result.success) {
      await auth.auditLog(req.user.id, 'CHANGE_PASSWORD', 'user', { email: req.user.email });
      res.json({ success: true, message: 'Password changed successfully' });
    } else {
      res.status(401).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== ACCESS REQUEST ENDPOINTS ====================

// Submit access request (public endpoint for @pfnonwovens.com users)
app.post("/api/auth/request-access", async (req, res) => {
  try {
    const { email, fullName, reason } = req.body;
    const result = await auth.requestAccess(email, fullName, reason);
    res.status(201).json({
      success: true,
      message: 'Access request submitted. Please wait for approval from an administrator.',
      request: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get access requests (admin only)
app.get("/api/admin/access-requests", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const status = req.query.status || null;
    const requests = await auth.getAccessRequests(status);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve access request (admin only)
app.post("/api/admin/access-requests/:id/approve", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await auth.approveAccessRequest(req.params.id, req.user.id);
    res.json({
      success: true,
      message: 'Access request approved. User account created.',
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Deny access request (admin only)
app.post("/api/admin/access-requests/:id/deny", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await auth.denyAccessRequest(req.params.id, req.user.id, reason);
    res.json({
      success: true,
      message: 'Access request denied.',
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==================== GROUP MANAGEMENT ENDPOINTS ====================

// Get all groups (admin only)
app.get("/api/admin/groups", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const groups = await auth.getGroups();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new group (admin only)
app.post("/api/admin/groups", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { name, description, permissions } = req.body;
    const group = await auth.createGroup(name, description, permissions);
    res.status(201).json({
      success: true,
      message: 'Group created successfully.',
      group
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update group (admin only)
app.put("/api/admin/groups/:id", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const group = await auth.updateGroup(req.params.id, name, description);
    res.json({
      success: true,
      message: 'Group updated successfully.',
      group
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Delete group (admin only)
app.delete("/api/admin/groups/:id", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await auth.deleteGroup(req.params.id);
    res.json({
      success: true,
      message: 'Group deleted successfully.',
      result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get users in group (admin only)
app.get("/api/admin/groups/:id/users", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const users = await auth.getUsersInGroup(req.params.id);
    res.json(users);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get all users (admin only)
app.get("/api/admin/users", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const users = await auth.getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create new user directly (admin only)
app.post("/api/admin/users", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { email, fullName, password, groupId } = req.body;
    const user = await auth.createDirectUser(email, fullName, password, groupId);
    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Update user (admin only)
app.put("/api/admin/users/:userId", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const { email, fullName, password } = req.body;
    const user = await auth.updateUser(req.params.userId, email, fullName, password);
    res.json({
      success: true,
      message: 'User updated successfully.',
      user
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Remove user from group (admin only)
app.delete("/api/admin/users/:userId/groups/:groupId", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await auth.removeUserFromGroup(req.params.userId, req.params.groupId);
    res.json({
      success: true,
      message: 'User removed from group successfully.',
      result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get audit logs (admin only)
app.get("/api/admin/audit-logs", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const filters = {
      userId: req.query.userId,
      action: req.query.action,
      resource: req.query.resource,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search,
      limit: req.query.limit ? parseInt(req.query.limit) : 100
    };
    
    const logs = await auth.getAuditLogs(filters);
    res.json({
      success: true,
      logs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get audit log stats (admin only)
app.get("/api/admin/audit-logs/stats", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const stats = await auth.getAuditLogStats();
    res.json({
      success: true,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== POLYMER INDEX ENDPOINTS ====================

app.get("/api/admin/polymer-indexes", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const indexes = await polymerIndexes.getIndexes(includeInactive);
    res.json({ success: true, indexes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const index = await polymerIndexes.createIndex(req.body || {});
    await auth.auditLog(req.user.id, 'INDEX_DEFINITION_CREATED', 'polymer_indexes', {
      indexId: index.id,
      indexName: index.name
    });
    res.status(201).json({ success: true, index });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put("/api/admin/polymer-indexes/:id", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const payload = req.body || {};

    if (Object.prototype.hasOwnProperty.call(payload, 'isActive')) {
      const existing = await auth.dbGet('SELECT is_active FROM polymer_indexes WHERE id = ?', [req.params.id]);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Index not found' });
      }

      const requestedIsActive = payload.isActive ? 1 : 0;
      if (requestedIsActive !== existing.is_active) {
        const groups = await auth.getUserGroups(req.user.id);
        const isAdminGroupMember = groups.some(group => String(group?.name || '').toLowerCase() === 'admin');

        if (!isAdminGroupMember) {
          return res.status(403).json({
            success: false,
            error: 'Only Admin group members can activate or deactivate indexes'
          });
        }
      }
    }

    const index = await polymerIndexes.updateIndex(req.params.id, payload);
    await auth.auditLog(req.user.id, 'INDEX_DEFINITION_UPDATED', 'polymer_indexes', {
      indexId: index.id,
      indexName: index.name
    });
    res.json({ success: true, index });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete("/api/admin/polymer-indexes/:id", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const groups = await auth.getUserGroups(req.user.id);
    const isAdminGroupMember = groups.some(group => String(group?.name || '').toLowerCase() === 'admin');

    if (!isAdminGroupMember) {
      return res.status(403).json({
        success: false,
        error: 'Only Admin group members can delete indexes'
      });
    }

    const result = await polymerIndexes.deleteIndex(req.params.id);

    await auth.auditLog(req.user.id, 'INDEX_DEFINITION_DELETED', 'polymer_indexes', {
      indexId: result.id,
      indexName: result.name
    });

    res.json({ success: true, result });
  } catch (err) {
    const status = err.message === 'Index not found'
      ? 404
      : err.message === 'Only deactivated indexes can be deleted'
        ? 400
        : 400;
    res.status(status).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/polymer-indexes/:id/values", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const values = await polymerIndexes.getIndexValues(req.params.id, {
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      limit: req.query.limit ? Number(req.query.limit) : 520
    });
    res.json({ success: true, values });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes/:id/values", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const value = await polymerIndexes.upsertIndexValue(req.params.id, req.body || {}, req.user.id);
    res.status(201).json({ success: true, value });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes/import", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const result = await polymerIndexes.bulkImport(rows, req.user.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/polymer-indexes/reminders/due", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const due = await polymerIndexes.getDueReminders(new Date());
    res.json({ success: true, due });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/admin/polymer-indexes/data/by-week", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const startYear = Number(req.query.startYear) || 2020;
    const endYear = Number(req.query.endYear) || 2026;
    const data = await polymerIndexes.getDataByWeek({ startYear, endYear });
    res.json({ success: true, weeks: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/admin/polymer-indexes/data/all", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await polymerIndexes.clearAllIndexValues();
    await auth.auditLog(req.user.id, 'DELETE_ALL_INDEX_VALUES', 'polymer_index_values', null, { deletedCount: result.deletedCount });
    res.json({ success: true, message: `Successfully deleted ${result.deletedCount} index values`, deletedCount: result.deletedCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/polymer-indexes/recalculate-mid", auth.authMiddleware, auth.requirePermission('user:manage'), async (req, res) => {
  try {
    const result = await polymerIndexes.recalculateAllMidValues(req.user.id);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Main costing endpoint
app.get("/api/costs", (req, res) => {
  try {
    const displayCurrency = req.query.currency || "USD";

    const filters = {
      sapId: req.query.sapId || null,
      pfnId: req.query.pfnId || null,
      customer: req.query.customer || null,
      marketSegment: req.query.marketSegment || null,
      application: req.query.application || null,
      s_sms: req.query.s_sms || null,
      bonding: req.query.bonding || null,
      basisWeight: req.query.basisWeight || null,
      slitWidth: req.query.slitWidth || null,
      treatment: req.query.treatment || null,
      author: req.query.author || null,
      lineId: req.query.lineId || null,
      country: req.query.country || null,
      overconsumption: req.query.overconsumption || null
    };

    const data = computeCosts(displayCurrency, filters);
    res.json(data);

  } catch (err) {
    console.error("Error in /api/costs:", err);
    res.status(500).json({ error: "Failed to compute costs", details: err.message });
  }
});

// Metadata endpoint: get available filters and options
app.get("/api/metadata", (req, res) => {
  try {
    const products = loadProducts();
    
    const sapIds = [...new Set(products.map(p => p.sapId).filter(Boolean))].sort();
    const pfnIds = [...new Set(products.map(p => p.pfnId).filter(Boolean))].sort();
    const customers = [...new Set(products.map(p => p.customer).filter(Boolean))].sort();
    const marketSegments = [...new Set(products.map(p => p.marketSegment).filter(Boolean))].sort();
    const applications = [...new Set(products.map(p => p.application).filter(Boolean))].sort();
    const smsOptions = [...new Set(products.map(p => p.s_sms).filter(Boolean))].sort();
    const bondings = [...new Set(products.map(p => p.bonding).filter(Boolean))].sort();
    const basisWeights = [...new Set(products.map(p => p.basisWeight).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b));
    const slitWidths = [...new Set(products.map(p => p.slitWidth).filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b));
    const treatments = [...new Set(products.map(p => p.treatment).filter(Boolean))].sort();
    const authors = [...new Set(products.map(p => p.author).filter(Boolean))].sort();
    const overconsumptions = [...new Set(products.map(p => p.overconsumption))].sort((a, b) => a - b);
    
    const lineIds = [...new Set(products.map(p => p.lineId))].sort();
    const countries = [...new Set(products.map(p => p.country))].sort();
    const currencies = ["USD", "CZK", "EUR", "ZAR", "GBP"];

    res.json({
      sapIds,
      pfnIds,
      customers,
      marketSegments,
      applications,
      smsOptions,
      bondings,
      basisWeights,
      slitWidths,
      treatments,
      authors,
      overconsumptions,
      lineIds,
      countries,
      currencies,
      totalProducts: products.length
    });

  } catch (err) {
    console.error("Error in /api/metadata:", err);
    res.status(500).json({ error: "Failed to load metadata", details: err.message });
  }
});

// Export data endpoint (CSV)
app.get("/api/export/costs", (req, res) => {
  try {
    const displayCurrency = req.query.currency || "USD";
    const filters = {
      sapId: req.query.sapId || null,
      pfnId: req.query.pfnId || null,
      customer: req.query.customer || null,
      marketSegment: req.query.marketSegment || null,
      application: req.query.application || null,
      s_sms: req.query.s_sms || null,
      bonding: req.query.bonding || null,
      basisWeight: req.query.basisWeight || null,
      slitWidth: req.query.slitWidth || null,
      treatment: req.query.treatment || null,
      author: req.query.author || null,
      lineId: req.query.lineId || null,
      country: req.query.country || null,
      overconsumption: req.query.overconsumption || null
    };

    const data = computeCosts(displayCurrency, filters);

    if (data.length === 0) {
      return res.status(404).json({ error: "No data to export" });
    }

    // Convert to CSV
    const headers = [
      "Product ID",
      "Line",
      "Country",
      "Material Cost (Net)",
      "Process Cost",
      "Total Cost",
      "Currency"
    ];

    const rows = data.map(item => [
      item.productId,
      item.lineId,
      item.country,
      (item.materialCostNet ?? item.materialCost ?? 0).toFixed(4),
      item.processCost.toFixed(4),
      item.totalCost.toFixed(4),
      item.currency
    ]);

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="costs-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);

  } catch (err) {
    console.error("Error in /api/export/costs:", err);
    res.status(500).json({ error: "Failed to export costs", details: err.message });
  }
});

// Debug endpoints
app.get("/api/debug/products", (req, res) => {
  try {
    const products = loadProducts();
    res.json(products);
  } catch (err) {
    console.error("Debug products error:", err);
    res.status(500).json({ error: "Failed to load products", details: err.message });
  }
});

app.get("/api/debug/lines", (req, res) => {
  try {
    const lines = loadLines();
    res.json(lines);
  } catch (err) {
    console.error("Debug lines error:", err);
    res.status(500).json({ error: "Failed to load lines", details: err.message });
  }
});

app.get("/api/debug/materials", (req, res) => {
  try {
    const fx = loadFxRates();
    const { materials, siko } = loadMaterials(fx);
    res.json({ materials, siko });
  } catch (err) {
    console.error("Debug materials error:", err);
    res.status(500).json({ error: "Failed to load materials", details: err.message });
  }
});

app.get("/api/debug/fx", (req, res) => {
  try {
    const fx = loadFxRates();
    res.json(fx);
  } catch (err) {
    console.error("Debug fx error:", err);
    res.status(500).json({ error: "Failed to load FX rates", details: err.message });
  }
});

app.get("/api/debug/costs", (req, res) => {
  try {
    const displayCurrency = req.query.currency || "USD";
    const filters = {
      productId: req.query.productId || null,
      lineId: req.query.lineId || null,
      country: req.query.country || null
    };

    const data = computeCosts(displayCurrency, filters);

    res.json({
      currency: displayCurrency,
      filters,
      count: data.length,
      costs: data
    });

  } catch (err) {
    console.error("Debug costs error:", err);
    res.status(500).json({ error: "Failed to compute debug costs", details: err.message });
  }
});

// Product editor endpoints
app.get("/api/products/editable", (req, res) => {
  try {
    const search = req.query.search || "";
    const products = search ? searchProducts(search) : getEditableProducts();
    res.json({
      count: products.length,
      products: products
    });
  } catch (err) {
    console.error("Error loading editable products:", err);
    res.status(500).json({ error: "Failed to load editable products", details: err.message });
  }
});

// BOM Calculator endpoints
app.get("/api/bom/lists", async (req, res) => {
  try {
    const materialLists = await getMaterialListValues();
    res.json(materialLists);
  } catch (err) {
    console.error("Error loading BOM material lists:", err);
    res.status(500).json({ error: "Failed to load BOM lists", details: err.message });
  }
});

app.get("/api/bom/description-lists", async (req, res) => {
  try {
    const lists = await getDescriptionListValues();
    res.json({ lists });
  } catch (err) {
    console.error("Error loading BOM description lists:", err);
    res.status(500).json({ error: "Failed to load description lists", details: err.message });
  }
});

app.put("/api/bom/description-lists/:listKey", async (req, res) => {
  try {
    const { listKey } = req.params;
    const { values } = req.body || {};

    if (!Array.isArray(values)) {
      return res.status(400).json({ error: "Request body must include a values array." });
    }

    if (hasCaseInsensitiveDuplicates(values)) {
      return res.status(400).json({ error: "Duplicate values are not allowed." });
    }

    const normalized = normalizeUniqueStrings(values);
    if (normalized.length === 0) {
      return res.status(400).json({ error: "List cannot be empty." });
    }

    const updatedValues = await saveDescriptionListValuesWithoutDeletion(listKey, normalized);
    res.json({ success: true, values: updatedValues });
  } catch (err) {
    if (err.code === "DESCRIPTION_LIST_UNKNOWN") {
      return res.status(404).json({ error: "Description list was not found." });
    }

    if (err.code === "DESCRIPTION_LIST_READONLY") {
      return res.status(400).json({ error: "This list is read-only and cannot be edited." });
    }

    if (err.code === "DESCRIPTION_LIST_REMOVAL_NOT_ALLOWED") {
      return res.status(400).json({
        error: "Removing existing values is not allowed. You can rename existing entries or add new ones."
      });
    }

    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Duplicate values are not allowed." });
    }

    console.error("Error saving BOM description list:", err);
    res.status(500).json({ error: "Failed to save description list", details: err.message });
  }
});

app.get("/api/bom/customers", async (req, res) => {
  try {
    const customers = await getCustomerNames();
    res.json({ customers });
  } catch (err) {
    console.error("Error loading customer list from database:", err);
    res.status(500).json({ error: "Failed to load customer list", details: err.message });
  }
});

app.put("/api/bom/customers", async (req, res) => {
  try {
    const { customers } = req.body || {};
    if (!Array.isArray(customers)) {
      return res.status(400).json({ error: "Request body must include a customers array." });
    }

    if (hasCaseInsensitiveDuplicates(customers)) {
      return res.status(400).json({ error: "Duplicate customer names are not allowed." });
    }

    const normalized = normalizeUniqueStrings(customers);
    if (normalized.length === 0) {
      return res.status(400).json({ error: "Customer list cannot be empty." });
    }

    const savedCustomers = await saveCustomerNamesWithoutDeletion(normalized);
    res.json({ success: true, customers: savedCustomers });
  } catch (err) {
    if (err.code === "CUSTOMER_REMOVAL_NOT_ALLOWED") {
      return res.status(400).json({
        error: "Removing existing customers is not allowed. You can rename existing entries or add new ones."
      });
    }

    if (err.message && err.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "Duplicate customer names are not allowed." });
    }

    console.error("Error saving customer list to database:", err);
    res.status(500).json({ error: "Failed to save customer list", details: err.message });
  }
});

// ==================== BOM RECORD ENDPOINTS ====================

app.post("/api/bom/records", auth.authMiddleware, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const { record, materials } = req.body || {};
    if (!record || typeof record !== 'object') {
      return res.status(400).json({ error: 'Request body must include a record object.' });
    }
    if (!Array.isArray(materials)) {
      return res.status(400).json({ error: 'Request body must include a materials array.' });
    }

    // Validate PD ID - must be numeric only
    if (record.pd_id && !/^\d+$/.test(String(record.pd_id).trim())) {
      return res.status(400).json({ error: 'PD ID must contain only numeric characters.' });
    }

    await db.run('BEGIN');
    try {
      // Generate explicit parent ID so child inserts never depend on driver-specific lastID behavior.
      let recordId = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = (Date.now() * 1000) + Math.floor(Math.random() * 1000);
        const existing = await db.get('SELECT id FROM bom_records WHERE id = ?', [candidate]);
        if (!existing) {
          recordId = candidate;
          break;
        }
      }
      if (!recordId) {
        throw new Error('Unable to allocate BOM record ID.');
      }

      const result = await db.run(`
        INSERT INTO bom_records (
          id,
          sap_id, pd_id, customer, market_segment, application, smms, mono_bico,
          structure, bico_ratio_desc, main_raw_mat, treatment, color, bonding,
          customer_bw, belt_bw, mb_grams, line, belt_speed, siko_percent, repro_percent,
          max_usable_width, usable_width, edge_trim_percent, web_loss_percent,
          other_scrap_percent, total_scrap_percent, gross_yield_percent,
          s_beams, m_beams, sb_throughput, mb_throughput, total_throughput, production_time,
          cores, slit_width, length_meters, roll_diameter,
          target_production, target_unit, notes, author, created_by
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        recordId,
        record.sap_id || null, record.pd_id || null, record.customer || null,
        record.market_segment || null, record.application || null, record.smms || null,
        record.mono_bico || null, record.structure || null, record.bico_ratio_desc || null,
        record.main_raw_mat || null, record.treatment || null, record.color || null,
        record.bonding || null, record.customer_bw || null, record.belt_bw || null,
        record.mb_grams || null, record.line || null, record.belt_speed || null,
        record.siko_percent || null, record.repro_percent || null,
        record.max_usable_width || null, record.usable_width || null,
        record.edge_trim_percent || null, record.web_loss_percent || null,
        record.other_scrap_percent || null, record.total_scrap_percent || null,
        record.gross_yield_percent || null, record.s_beams || null, record.m_beams || null,
        record.sb_throughput || null, record.mb_throughput || null,
        record.total_throughput || null, record.production_time || null,
        record.cores || null, record.slit_width || null, record.length_meters || null,
        record.roll_diameter || null, record.target_production || null,
        record.target_unit || null, record.notes || null, req.user.name || 'Unknown', req.user.id
      ]);

      if (!result || result.changes !== 1) {
        throw new Error('Failed to insert BOM record header.');
      }

      for (let i = 0; i < materials.length; i++) {
        const m = materials[i] || {};
        const materialLabel = m.material_label || '';
        const materialName = m.material_name || '';
        const materialPercentage = Number.isFinite(Number(m.percentage)) ? Number(m.percentage) : 0;

        try {
          await db.run(
            'INSERT INTO bom_record_materials (record_id, sort_order, material_label, material_name, percentage) VALUES (?, ?, ?, ?, ?)',
            [recordId, i, materialLabel, materialName, materialPercentage]
          );
        } catch (insertErr) {
          throw new Error(`Material insert failed at index ${i} (recordId=${recordId}, label=${materialLabel || '<empty>'}, name=${materialName || '<empty>'}): ${insertErr.message}`);
        }
      }

      await db.run('COMMIT');
      res.status(201).json({ success: true, id: recordId });
    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    }
  } catch (err) {
    console.error('Error saving BOM record:', err);
    res.status(500).json({ error: 'Failed to save BOM record', details: err.message });
  }
});

app.get("/api/bom/records", auth.authMiddleware, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const rows = await db.all(`
      SELECT id, pd_id, customer, line, customer_bw, author,
             created_at, updated_at, created_by
      FROM bom_records
      ORDER BY created_at DESC
    `);
    res.json({ records: rows });
  } catch (err) {
    console.error('Error listing BOM records:', err);
    res.status(500).json({ error: 'Failed to list BOM records', details: err.message });
  }
});

app.get("/api/bom/records/:id", auth.authMiddleware, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid record ID.' });

    const record = await db.get('SELECT * FROM bom_records WHERE id = ?', [id]);
    if (!record) return res.status(404).json({ error: 'Record not found.' });

    const materials = await db.all(
      'SELECT material_label, material_name, percentage, sort_order FROM bom_record_materials WHERE record_id = ? ORDER BY sort_order',
      [id]
    );
    res.json({ record, materials });
  } catch (err) {
    console.error('Error loading BOM record:', err);
    res.status(500).json({ error: 'Failed to load BOM record', details: err.message });
  }
});

app.put("/api/bom/records/:id", auth.authMiddleware, async (req, res) => {
  try {
    await ensureBomRecordStoreReady();
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid record ID.' });

    const { record, materials } = req.body || {};
    if (!record || typeof record !== 'object') {
      return res.status(400).json({ error: 'Request body must include a record object.' });
    }
    if (!Array.isArray(materials)) {
      return res.status(400).json({ error: 'Request body must include a materials array.' });
    }

    const existing = await db.get('SELECT id FROM bom_records WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Record not found.' });

    await db.run('BEGIN');
    try {
      await db.run(`
        UPDATE bom_records SET
          sap_id=?, pd_id=?, customer=?, market_segment=?, application=?, smms=?, mono_bico=?,
          structure=?, bico_ratio_desc=?, main_raw_mat=?, treatment=?, color=?, bonding=?,
          customer_bw=?, belt_bw=?, mb_grams=?, line=?, belt_speed=?, siko_percent=?, repro_percent=?,
          max_usable_width=?, usable_width=?, edge_trim_percent=?, web_loss_percent=?,
          other_scrap_percent=?, total_scrap_percent=?, gross_yield_percent=?,
          s_beams=?, m_beams=?, sb_throughput=?, mb_throughput=?, total_throughput=?, production_time=?,
          cores=?, slit_width=?, length_meters=?, roll_diameter=?,
          target_production=?, target_unit=?, notes=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `, [
        record.sap_id || null, record.pd_id || null, record.customer || null,
        record.market_segment || null, record.application || null, record.smms || null,
        record.mono_bico || null, record.structure || null, record.bico_ratio_desc || null,
        record.main_raw_mat || null, record.treatment || null, record.color || null,
        record.bonding || null, record.customer_bw || null, record.belt_bw || null,
        record.mb_grams || null, record.line || null, record.belt_speed || null,
        record.siko_percent || null, record.repro_percent || null,
        record.max_usable_width || null, record.usable_width || null,
        record.edge_trim_percent || null, record.web_loss_percent || null,
        record.other_scrap_percent || null, record.total_scrap_percent || null,
        record.gross_yield_percent || null, record.s_beams || null, record.m_beams || null,
        record.sb_throughput || null, record.mb_throughput || null,
        record.total_throughput || null, record.production_time || null,
        record.cores || null, record.slit_width || null, record.length_meters || null,
        record.roll_diameter || null, record.target_production || null,
        record.target_unit || null, record.notes || null, id
      ]);

      await db.run('DELETE FROM bom_record_materials WHERE record_id = ?', [id]);

      for (let i = 0; i < materials.length; i++) {
        const m = materials[i];
        await db.run(
          'INSERT INTO bom_record_materials (record_id, sort_order, material_label, material_name, percentage) VALUES (?,?,?,?,?)',
          [id, i, m.material_label || '', m.material_name || '', m.percentage || 0]
        );
      }

      await db.run('COMMIT');
      res.json({ success: true, id });
    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    }
  } catch (err) {
    console.error('Error updating BOM record:', err);
    res.status(500).json({ error: 'Failed to update BOM record', details: err.message });
  }
});

app.post("/api/products/update", (req, res) => {
  try {
    const { rowIndex, updates } = req.body;
    
    if (rowIndex === undefined || rowIndex === null) {
      return res.status(400).json({ error: "Missing rowIndex in request body" });
    }
    
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "Missing or invalid updates in request body" });
    }

    const result = updateProduct(rowIndex, updates);
    res.json(result);
  } catch (err) {
    console.error("Error updating product:", err);
    res.status(500).json({ error: "Failed to update product", details: err.message });
  }
});

// Duplicate (copy) a product
app.post("/api/products/duplicate", (req, res) => {
  try {
    const { rowIndex } = req.body;
    
    if (rowIndex === undefined || rowIndex === null) {
      return res.status(400).json({ error: "Missing rowIndex in request body" });
    }

    const newRowIndex = duplicateProduct(rowIndex);
    res.json({ success: true, newRowIndex });
  } catch (err) {
    console.error("Error duplicating product:", err);
    res.status(500).json({ error: "Failed to duplicate product", details: err.message });
  }
});

// Delete a product
app.post("/api/products/delete", (req, res) => {
  try {
    const { rowIndex } = req.body;
    
    if (rowIndex === undefined || rowIndex === null) {
      return res.status(400).json({ error: "Missing rowIndex in request body" });
    }

    deleteProduct(rowIndex);
    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ error: "Failed to delete product", details: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found", path: req.path });
});

// Global error handler - must be last
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // If headers already sent, delegate to default express error handler
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({ 
    error: "Internal server error", 
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = process.env.PORT || 3000;
console.log(`[STARTUP] Starting server on port ${PORT}...`);
console.log(`[STARTUP] Node version: ${process.version}`);
console.log(`[STARTUP] Working directory: ${process.cwd()}`);
console.log(`[STARTUP] __dirname: ${__dirname}`);

app.listen(PORT, () => {
  console.log(`✓ Server running at http://localhost:${PORT}`);
  console.log(`✓ Database initialized at ${path.join(__dirname, 'data', 'mini_erp.db')}`);
  console.log(``);
  console.log(`Frontend routes:`);
  console.log(`  - GET / → /login.html (redirect)`);
  console.log(`  - GET /dashboard → index.html`);
  console.log(`  - GET /bom-calculator → bom-calculator.html`);
  console.log(`  - GET /bom-recipe-browser → bom-recipe-browser.html`);
  console.log(`  - GET /products → products-editor.html`);
  console.log(``);
  console.log(`API endpoints:`);
  console.log(`  - GET /api/health - Health check`);
  console.log(`  - POST /api/auth/login - User login`);
  console.log(`  - GET /api/metadata - Available filters`);
  console.log(`  - GET /api/costs - Main costing endpoint`);
  console.log(`  - GET /api/export/costs - Export to CSV`);
  console.log(`Debug endpoints:`);
  console.log(`  - GET /api/debug/products`);
  console.log(`  - GET /api/debug/lines`);
  console.log(`  - GET /api/debug/materials`);
  console.log(`  - GET /api/debug/fx`);
});
