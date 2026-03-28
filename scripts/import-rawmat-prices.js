'use strict';

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const xlsx = require('xlsx');
const rmPrices = require('../src/backend/rm-prices');

const DB_PATH = path.join(__dirname, '..', 'data', 'mini_erp.db');
const XLSX_PATH = path.join(__dirname, '..', 'data', 'RawMat_prices.xlsx');
const MAPPING_PATH = path.join(__dirname, 'products-to-bom-material-mapping.csv');

function parseArgs(argv) {
  const args = {
    year: 2026,
    month: 2,
    apply: false,
    xlsxPath: XLSX_PATH,
    mappingPath: MAPPING_PATH,
    userId: 'rawmat_prices_import_2026_02'
  };

  for (const item of argv) {
    if (item === '--apply') args.apply = true;
    else if (item.startsWith('--year=')) args.year = Number(item.split('=')[1]);
    else if (item.startsWith('--month=')) args.month = Number(item.split('=')[1]);
    else if (item.startsWith('--xlsx=')) args.xlsxPath = path.resolve(item.split('=')[1]);
    else if (item.startsWith('--mapping=')) args.mappingPath = path.resolve(item.split('=')[1]);
    else if (item.startsWith('--user=')) args.userId = item.split('=')[1] || args.userId;
  }

  return args;
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(current);
      current = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      continue;
    }

    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((value) => value !== '')) rows.push(row);
  }

  const [header = [], ...data] = rows;
  return data.map((cols) => {
    const obj = {};
    header.forEach((key, index) => {
      obj[String(key || '').trim()] = String(cols[index] || '').trim();
    });
    return obj;
  });
}

function ascii(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeSourceName(value) {
  return ascii(value)
    .replace(/\u00A0/g, ' ')
    .replace(/^\s*[A-Z]{1,3}:\s*/i, '')
    .replace(/^pig\s*[.:-]?\s*/i, '')
    .replace(/^add\s*[.:-]?\s*/i, '')
    .replace(/^surf\s*[.:-]?\s*/i, '')
    .replace(/^zusl\.?\s*-?\s*/i, '')
    .replace(/^z\u0075\u0161l\.?\s*-?\s*/i, '')
    .replace(/^pp\s*sb\s*-?\s*/i, 'ppsb ')
    .replace(/^pp\s*mb\s*-?\s*/i, 'ppmb ')
    .replace(/^pp\s*mf\s*-?\s*/i, 'ppmf ')
    .replace(/^co\s*pet/i, 'copet')
    .replace(/^r\s*pet/i, 'rpet')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeDbName(value) {
  return ascii(value)
    .replace(/^\s*(Pig|Add|Surf)\s*-\s*/i, '')
    .replace(/^\s*(PPSB|PPMB|PPMF|PE|PET|PLA)\s*-\s*/i, '$1 ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonical(value) {
  return String(value || '')
    .replace(/\bmosten nb\s*(\d+)\b/g, 'mostennb$1')
    .replace(/\bhs\s*(\d+)\s*(\d+)\b/g, 'hs$1$2')
    .replace(/\b([a-z]+)\s+(\d+[a-z]*)\b/g, '$1$2')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function inferListKey(materialName) {
  const name = String(materialName || '').trim();
  if (!name) return null;
  if (/^Pig\s*-/.test(name)) return 'list_pigment';
  if (/^Add\s*-/.test(name)) return 'list_additive';
  if (/^Surf\s*-/.test(name)) return 'list_surfactant';
  if (/^PPMB\s*-/.test(name)) return 'list_mb';
  if (/^(PPSB|PPMF|PE|PET|PLA)\s*-/.test(name)) return 'list_sb';
  return null;
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function loadDbMaterials() {
  const db = new sqlite3.Database(DB_PATH);
  try {
    const rows = await dbAll(
      db,
      `SELECT DISTINCT material_list_key, material_name
       FROM rm_plant_materials
       WHERE active = 1
       ORDER BY material_list_key, lower(material_name)`
    );

    const byExactName = new Map();
    const byNormalized = new Map();
    const byCanonical = new Map();

    for (const row of rows) {
      const materialName = String(row.material_name || '').trim();
      const listKey = String(row.material_list_key || '').trim();
      if (!materialName || !listKey) continue;

      byExactName.set(materialName, { material_name: materialName, material_list_key: listKey });

      const normalized = normalizeDbName(materialName);
      if (normalized) {
        if (!byNormalized.has(normalized)) byNormalized.set(normalized, []);
        byNormalized.get(normalized).push({ material_name: materialName, material_list_key: listKey });
      }

      const canonicalName = canonical(normalized);
      if (canonicalName) {
        if (!byCanonical.has(canonicalName)) byCanonical.set(canonicalName, []);
        byCanonical.get(canonicalName).push({ material_name: materialName, material_list_key: listKey });
      }
    }

    return { rows, byExactName, byNormalized, byCanonical };
  } finally {
    db.close();
  }
}

function toUniqueCandidate(list) {
  if (!Array.isArray(list) || list.length !== 1) return null;
  return list[0];
}

function buildExplicitMapping(rows) {
  const map = new Map();
  for (const row of rows) {
    const sourceName = String(row.xlsx_name || '').trim();
    if (!sourceName) continue;
    map.set(sourceName, {
      dbName: String(row.db_name || '').trim(),
      action: String(row.action || '').trim().toUpperCase(),
      notes: String(row.notes || '').trim()
    });
  }
  return map;
}

function resolveTarget(rawName, explicitMap, dbMaterials) {
  const explicit = explicitMap.get(rawName);
  if (explicit) {
    if (explicit.action === 'SKIP' || !explicit.dbName) {
      return { status: 'skip', method: 'explicit-skip', reason: explicit.notes || 'Explicitly skipped in mapping CSV' };
    }

    const exact = dbMaterials.byExactName.get(explicit.dbName);
    if (exact) {
      return {
        status: 'matched',
        method: 'explicit-map',
        material_name: exact.material_name,
        material_list_key: exact.material_list_key
      };
    }

    const inferredKey = inferListKey(explicit.dbName);
    if (inferredKey) {
      return {
        status: 'matched',
        method: 'explicit-map-inferred-key',
        material_name: explicit.dbName,
        material_list_key: inferredKey
      };
    }

    return { status: 'unmatched', method: 'explicit-map', reason: `Mapped DB material not recognized: ${explicit.dbName}` };
  }

  const exact = dbMaterials.byExactName.get(rawName);
  if (exact) {
    return {
      status: 'matched',
      method: 'exact-db-name',
      material_name: exact.material_name,
      material_list_key: exact.material_list_key
    };
  }

  const normalizedSource = normalizeSourceName(rawName);
  const normalizedCandidate = toUniqueCandidate(dbMaterials.byNormalized.get(normalizedSource));
  if (normalizedCandidate) {
    return {
      status: 'matched',
      method: 'normalized-unique',
      material_name: normalizedCandidate.material_name,
      material_list_key: normalizedCandidate.material_list_key
    };
  }

  const canonicalSource = canonical(normalizedSource);
  const canonicalCandidate = toUniqueCandidate(dbMaterials.byCanonical.get(canonicalSource));
  if (canonicalCandidate) {
    return {
      status: 'matched',
      method: 'canonical-unique',
      material_name: canonicalCandidate.material_name,
      material_list_key: canonicalCandidate.material_list_key
    };
  }

  return { status: 'unmatched', method: 'none', reason: 'No safe mapping found' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workbook = xlsx.readFile(args.xlsxPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelRows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  const explicitMap = buildExplicitMapping(parseCsv(fs.readFileSync(args.mappingPath, 'utf8')));
  const dbMaterials = await loadDbMaterials();

  const importRows = [];
  const unmatched = [];
  const skipped = [];
  const conflicts = [];
  const methodCounts = {};
  const plantCounts = {};
  const dedupedMap = new Map();

  for (const row of excelRows) {
    const plant = String(row['Country'] || '').trim().toUpperCase();
    const rawName = String(row['Raw Material'] || '').trim();
    const currency = String(row['Currency'] || '').trim().toUpperCase();
    const price = Number(row['Price']);

    if (!plant || !rawName || !currency || !Number.isFinite(price)) {
      skipped.push({ raw_material: rawName, plant, reason: 'Incomplete source row' });
      continue;
    }

    const target = resolveTarget(rawName, explicitMap, dbMaterials);
    if (target.status === 'skip') {
      skipped.push({ raw_material: rawName, plant, reason: target.reason, method: target.method });
      continue;
    }

    if (target.status !== 'matched') {
      unmatched.push({ raw_material: rawName, plant, reason: target.reason, method: target.method });
      continue;
    }

    const mappedRow = {
      material_list_key: target.material_list_key,
      material_name: target.material_name,
      plant,
      year: args.year,
      month: args.month,
      price,
      currency
    };

    const dedupeKey = [
      mappedRow.material_list_key,
      mappedRow.material_name.toLowerCase(),
      mappedRow.plant,
      mappedRow.year,
      mappedRow.month
    ].join('|');

    const existing = dedupedMap.get(dedupeKey);
    if (existing) {
      if (existing.price !== mappedRow.price || existing.currency !== mappedRow.currency) {
        conflicts.push({
          key: dedupeKey,
          first: existing,
          second: mappedRow,
          raw_material: rawName
        });
      }
    } else {
      dedupedMap.set(dedupeKey, mappedRow);
    }

    methodCounts[target.method] = (methodCounts[target.method] || 0) + 1;
    plantCounts[plant] = (plantCounts[plant] || 0) + 1;
  }

  importRows.push(...dedupedMap.values());

  const summary = {
    apply: args.apply,
    year: args.year,
    month: args.month,
    source_rows: excelRows.length,
    import_rows: importRows.length,
    duplicate_conflicts: conflicts.length,
    skipped_rows: skipped.length,
    unmatched_rows: unmatched.length,
    method_counts: methodCounts,
    plant_counts: plantCounts,
    conflict_sample: conflicts.slice(0, 20),
    skipped_sample: skipped.slice(0, 20),
    unmatched_sample: unmatched.slice(0, 40)
  };

  if (conflicts.length > 0) {
    console.log(JSON.stringify(summary, null, 2));
    throw new Error(`Import aborted due to ${conflicts.length} duplicate price conflicts`);
  }

  if (!args.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const result = await rmPrices.importPrices(importRows, args.userId);
  console.log(JSON.stringify({ ...summary, import_result: result }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});