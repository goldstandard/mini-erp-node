'use strict';
/**
 * add-missing-materials.js
 * One-time script: inserts new materials (from Products.xlsx migration mapping)
 * into bom_dropdown_list_items and rm_plant_materials.
 * Safe to re-run — uses INSERT OR IGNORE to skip duplicates.
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '..', 'data', 'mini_erp.db');

// ─── NEW MATERIALS TO INSERT ────────────────────────────────────────────────
// Format: { listKey, listId, name, numericValue (optional) }
// listId from bom_dropdown_lists: sb=13, mb=14, pigment=15, additive=16, surfactant=17

const NEW_MATERIALS = [
  // SB (list_sb, id=13)
  { listKey: 'list_sb',        listId: 13, name: 'PPMF - Borflow HG485FB',        numericValue: null },
  { listKey: 'list_sb',        listId: 13, name: 'PPSB - Sasol HMD077',           numericValue: null },
  { listKey: 'list_sb',        listId: 13, name: 'PPSB - Sasol HSV103',           numericValue: null },

  // MB (list_mb, id=14)
  { listKey: 'list_mb',        listId: 14, name: 'PPMB - Z1200',                  numericValue: null },

  // Pigments (list_pigment, id=15)
  { listKey: 'list_pigment',   listId: 15, name: 'Pig - M-Color blue 51 368 PP',  numericValue: null },
  { listKey: 'list_pigment',   listId: 15, name: 'Pig - SCC 26SAM0174',           numericValue: null },
  { listKey: 'list_pigment',   listId: 15, name: 'Pig - SCC 89899 black SB',      numericValue: null },
  { listKey: 'list_pigment',   listId: 15, name: 'Pig - SCC 90015 black MB',      numericValue: null },
  { listKey: 'list_pigment',   listId: 15, name: 'Pig - SCC 91513 soft Peony SB', numericValue: null },

  // Surfactants (list_surfactant, id=17) — numericValue = concentration as fraction
  { listKey: 'list_surfactant', listId: 17, name: 'Surf - Silastol PHP 10',  numericValue: 0.85 },
  { listKey: 'list_surfactant', listId: 17, name: 'Surf - Stantex S 6677',   numericValue: 0.21 },
];

const PLANTS = ['CZ', 'EG', 'ZA'];

// ─── DB HELPERS ──────────────────────────────────────────────────────────────
function dbRun(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  const db = new sqlite3.Database(DB_PATH);
  await dbRun(db, 'PRAGMA foreign_keys = ON', []);

  console.log('=== add-missing-materials.js ===\n');
  let insertedDropdown = 0, skippedDropdown = 0;
  let insertedPlant = 0, skippedPlant = 0;

  for (const mat of NEW_MATERIALS) {
    // ── bom_dropdown_list_items ──
    const existing = await dbGet(db,
      'SELECT id FROM bom_dropdown_list_items WHERE list_id = ? AND value = ?',
      [mat.listId, mat.name]
    );

    if (existing) {
      console.log(`  SKIP (already in dropdown): [${mat.listKey}] ${mat.name}`);
      skippedDropdown++;
    } else {
      // Get current max sort_order for this list
      const maxRow = await dbGet(db,
        'SELECT MAX(sort_order) AS m FROM bom_dropdown_list_items WHERE list_id = ?',
        [mat.listId]
      );
      const nextSort = (maxRow && maxRow.m != null) ? maxRow.m + 1 : 0;

      await dbRun(db,
        'INSERT INTO bom_dropdown_list_items (list_id, value, sort_order, numeric_value) VALUES (?, ?, ?, ?)',
        [mat.listId, mat.name, nextSort, mat.numericValue]
      );
      console.log(`  ADDED  (dropdown): [${mat.listKey}] ${mat.name}` + (mat.numericValue != null ? ` (conc: ${mat.numericValue})` : ''));
      insertedDropdown++;
    }

    // ── rm_plant_materials ──
    for (const plant of PLANTS) {
      const existingPlant = await dbGet(db,
        'SELECT rowid FROM rm_plant_materials WHERE material_list_key = ? AND material_name = ? AND plant = ?',
        [mat.listKey, mat.name, plant]
      );

      if (existingPlant) {
        skippedPlant++;
      } else {
        await dbRun(db,
          'INSERT INTO rm_plant_materials (material_list_key, material_name, plant, active) VALUES (?, ?, ?, 1)',
          [mat.listKey, mat.name, plant]
        );
        insertedPlant++;
      }
    }
    console.log(`           (plant_materials): CZ/EG/ZA done`);
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`bom_dropdown_list_items: ${insertedDropdown} inserted, ${skippedDropdown} skipped`);
  console.log(`rm_plant_materials:      ${insertedPlant} inserted, ${skippedPlant} skipped`);

  db.close();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
