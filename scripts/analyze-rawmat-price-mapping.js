'use strict';

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');

const DB_PATH = path.join(__dirname, '..', 'data', 'mini_erp.db');
const XLSX_PATH = path.join(__dirname, '..', 'data', 'RawMat_prices.xlsx');

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function normalizeName(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/^\s*[A-Z]{1,3}:\s*/i, '')
    .replace(/^Pig\s*[.:-]?\s*/i, '')
    .replace(/^Add\s*[.:-]?\s*/i, '')
    .replace(/^Surf\s*[.:-]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  try {
    const dbRows = await dbAll(
      db,
      `SELECT DISTINCT material_list_key, material_name
       FROM rm_plant_materials
       WHERE active = 1
       ORDER BY material_list_key, lower(material_name)`
    );

    const workbook = xlsx.readFile(XLSX_PATH);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const excelRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

    const excelMap = new Map();
    for (const row of excelRows) {
      const rawMaterial = String(row['Raw Material'] || '').trim();
      if (!rawMaterial) continue;
      const normalized = normalizeName(rawMaterial);
      if (!excelMap.has(normalized)) excelMap.set(normalized, new Set());
      excelMap.get(normalized).add(rawMaterial);
    }

    const matched = [];
    const unmatched = [];

    for (const row of dbRows) {
      const normalized = normalizeName(row.material_name);
      const sourceMatches = excelMap.get(normalized);
      if (sourceMatches && sourceMatches.size) {
        matched.push({
          material_list_key: row.material_list_key,
          material_name: row.material_name,
          excel_names: Array.from(sourceMatches).sort()
        });
      } else {
        unmatched.push({
          material_list_key: row.material_list_key,
          material_name: row.material_name
        });
      }
    }

    console.log('db_distinct=' + dbRows.length);
    console.log('excel_distinct=' + excelMap.size);
    console.log('matched=' + matched.length);
    console.log('unmatched=' + unmatched.length);
    console.log('\nMATCHED SAMPLE');
    console.log(JSON.stringify(matched.slice(0, 80), null, 2));
    console.log('\nUNMATCHED SAMPLE');
    console.log(JSON.stringify(unmatched.slice(0, 120), null, 2));
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});