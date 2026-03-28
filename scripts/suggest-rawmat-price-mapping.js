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

function ascii(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeSourceName(value) {
  let s = ascii(value)
    .replace(/\u00A0/g, ' ')
    .replace(/^\s*[A-Z]{1,3}:\s*/i, '')
    .trim();

  s = s
    .replace(/^pig\s*[.:-]?\s*/i, '')
    .replace(/^add\s*[.:-]?\s*/i, '')
    .replace(/^surf\s*[.:-]?\s*/i, '')
    .replace(/^pp sb\s*-?\s*/i, 'ppsb ')
    .replace(/^pp mb\s*-?\s*/i, 'ppmb ')
    .replace(/^pp mf\s*-?\s*/i, 'ppmf ')
    .replace(/^co\s*pet/i, 'copet')
    .replace(/^r\s*pet/i, 'rpet')
    .replace(/xpure/gi, 'xpure')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\b(pp|sb|mb|pig|add|surf)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return s;
}

function normalizeDbName(value) {
  let s = ascii(value)
    .replace(/^\s*(Pig|Add|Surf)\s*-\s*/i, '')
    .replace(/^\s*(PPSB|PPMB|PPMF|PE|PET|PLA)\s*-\s*/i, '$1 ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return s;
}

function canonical(value) {
  return String(value || '')
    .replace(/\b(sabic)\b/g, 'sabic')
    .replace(/\bmosten nb\s*(\d+)\b/g, 'mostennb$1')
    .replace(/\bhs\s*(\d+)\s*(\d+)\b/g, 'hs$1$2')
    .replace(/\b([a-z]+)\s+(\d+[a-z]*)\b/g, '$1$2')
    .replace(/\s+/g, '')
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

    const byCanonical = new Map();
    for (const row of excelRows) {
      const rawMaterial = String(row['Raw Material'] || '').trim();
      if (!rawMaterial) continue;
      const key = canonical(normalizeSourceName(rawMaterial));
      if (!byCanonical.has(key)) byCanonical.set(key, new Set());
      byCanonical.get(key).add(rawMaterial);
    }

    const matched = [];
    const unmatched = [];
    for (const row of dbRows) {
      const key = canonical(normalizeDbName(row.material_name));
      const excelNames = byCanonical.get(key);
      if (excelNames && excelNames.size) {
        matched.push({
          material_list_key: row.material_list_key,
          material_name: row.material_name,
          excel_names: Array.from(excelNames).sort()
        });
      } else {
        unmatched.push({
          material_list_key: row.material_list_key,
          material_name: row.material_name,
          canonical: key
        });
      }
    }

    console.log('matched=' + matched.length);
    console.log('unmatched=' + unmatched.length);
    console.log('\nMATCHED SAMPLE');
    console.log(JSON.stringify(matched.slice(0, 120), null, 2));
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