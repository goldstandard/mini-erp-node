const db = require('./db/connection');

const NUMERIC_FIELDS = [
  'energy',
  'wages',
  'maintenance',
  'other_costs',
  'sga_and_overhead',
  'cores',
  'packaging',
  'pallets'
];

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeLineId(value) {
  return (value || '').toString().trim();
}

function normalizeYear(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 2000 && n <= 9999 ? n : null;
}

async function initLineRatesTable() {
  await db.init();

  await db.run(`
    CREATE TABLE IF NOT EXISTS line_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      line_id TEXT NOT NULL,
      country TEXT,
      currency TEXT,
      energy REAL DEFAULT 0,
      wages REAL DEFAULT 0,
      maintenance REAL DEFAULT 0,
      other_costs REAL DEFAULT 0,
      sga_and_overhead REAL DEFAULT 0,
      cores REAL DEFAULT 0,
      packaging REAL DEFAULT 0,
      pallets REAL DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(year, line_id)
    )
  `);

  await db.run('CREATE INDEX IF NOT EXISTS idx_line_rates_year ON line_rates(year)');
}

async function listLineRateYears() {
  await db.init();
  const rows = await db.all('SELECT DISTINCT year FROM line_rates ORDER BY year DESC');
  return rows.map((row) => Number(row.year)).filter(Number.isFinite);
}

async function getLineRatesForYear(year) {
  const yearNum = normalizeYear(year);
  if (!yearNum) {
    throw new Error('Invalid year');
  }

  await db.init();
  return db.all(
    `SELECT year, line_id, country, currency,
            energy, wages, maintenance, other_costs, sga_and_overhead,
            cores, packaging, pallets,
            created_at, updated_at
     FROM line_rates
     WHERE year = ?
     ORDER BY line_id`,
    [yearNum]
  );
}

function normalizeRateEntry(entry) {
  const lineId = normalizeLineId(entry?.lineId || entry?.line_id);
  if (!lineId) return null;

  const country = (entry?.country || '').toString().trim().toUpperCase();
  const currency = (entry?.currency || 'USD').toString().trim().toUpperCase() || 'USD';

  const normalized = {
    lineId,
    country,
    currency
  };

  for (const key of NUMERIC_FIELDS) {
    normalized[key] = safeNumber(entry?.[key], 0);
  }

  return normalized;
}

async function importLineRates({ year, lines, overwrite = false, userId = null }) {
  const yearNum = normalizeYear(year);
  if (!yearNum) {
    throw new Error('Invalid year');
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('No rows to import');
  }

  await db.init();

  const deduped = new Map();
  for (const line of lines) {
    const normalized = normalizeRateEntry(line);
    if (!normalized) continue;
    deduped.set(normalized.lineId.toUpperCase(), normalized);
  }

  if (!deduped.size) {
    throw new Error('No valid line rows found in import data');
  }

  await db.run('BEGIN');
  try {
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const line of deduped.values()) {
      const existing = await db.get(
        'SELECT id FROM line_rates WHERE year = ? AND line_id = ?',
        [yearNum, line.lineId]
      );

      if (existing && !overwrite) {
        skipped += 1;
        continue;
      }

      if (existing) {
        await db.run(
          `UPDATE line_rates
           SET country = ?, currency = ?,
               energy = ?, wages = ?, maintenance = ?, other_costs = ?, sga_and_overhead = ?,
               cores = ?, packaging = ?, pallets = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            line.country,
            line.currency,
            line.energy,
            line.wages,
            line.maintenance,
            line.other_costs,
            line.sga_and_overhead,
            line.cores,
            line.packaging,
            line.pallets,
            existing.id
          ]
        );
        updated += 1;
      } else {
        await db.run(
          `INSERT INTO line_rates (
             year, line_id, country, currency,
             energy, wages, maintenance, other_costs, sga_and_overhead,
             cores, packaging, pallets,
             created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            yearNum,
            line.lineId,
            line.country,
            line.currency,
            line.energy,
            line.wages,
            line.maintenance,
            line.other_costs,
            line.sga_and_overhead,
            line.cores,
            line.packaging,
            line.pallets,
            userId
          ]
        );
        inserted += 1;
      }
    }

    await db.run('COMMIT');

    return {
      year: yearNum,
      totalParsed: lines.length,
      totalValid: deduped.size,
      inserted,
      updated,
      skipped,
      overwrite: !!overwrite
    };
  } catch (err) {
    await db.run('ROLLBACK').catch(() => {});
    throw err;
  }
}

module.exports = {
  NUMERIC_FIELDS,
  initLineRatesTable,
  listLineRateYears,
  getLineRatesForYear,
  importLineRates
};
