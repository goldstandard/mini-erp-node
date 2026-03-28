const db = require('./db/connection');

/**
 * Initialize the fx_rates table in the database
 */
async function initFxRatesTable() {
  try {
    await db.init();
    
    // Create fx_rates table if it doesn't exist
    await db.run(`
      CREATE TABLE IF NOT EXISTS fx_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        currency_pair TEXT NOT NULL,
        rate REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(year, month, currency_pair)
      )
    `);
    
    console.log('FX rates table initialized');
  } catch (err) {
    console.error('Error initializing fx_rates table:', err);
  }
}

/**
 * Load FX rates for a specific year and month
 */
async function loadFxRatesForMonth(year, month) {
  try {
    await db.init();
    
    const rows = await db.all(
      'SELECT currency_pair, rate FROM fx_rates WHERE year = ? AND month = ? ORDER BY currency_pair',
      [year, month]
    );
    
    const fx = {};
    
    rows.forEach(row => {
      const pair = row.currency_pair;
      const rate = row.rate;
      
      fx[pair] = rate;
      
      // Calculate reverse rate
      const from = pair.substring(0, 3);
      const to = pair.substring(3, 6);
      const reverse = to + from;
      
      if (!fx[reverse]) {
        fx[reverse] = 1 / rate;
      }
    });
    
    return fx;
  } catch (err) {
    console.error('Error loading fx rates:', err);
    return {};
  }
}

/**
 * Get all available FX rate periods (year-month combinations)
 */
async function getAvailableFxPeriods() {
  try {
    await db.init();
    
    const rows = await db.all(
      'SELECT DISTINCT year, month FROM fx_rates ORDER BY year DESC, month DESC'
    );
    
    return rows;
  } catch (err) {
    console.error('Error getting available FX periods:', err);
    return [];
  }
}

/**
 * Get all FX rates for a specific period
 */
async function getFxRatesForPeriod(year, month) {
  try {
    await db.init();
    
    const rows = await db.all(
      'SELECT id, year, month, currency_pair, rate, created_at, updated_at FROM fx_rates WHERE year = ? AND month = ? ORDER BY currency_pair',
      [year, month]
    );
    
    return rows;
  } catch (err) {
    console.error('Error getting FX rates:', err);
    return [];
  }
}

/**
 * Get all FX rates for a specific year (months 0..12 where 0 = Budget)
 */
async function getFxRatesForYear(year) {
  try {
    await db.init();

    const rows = await db.all(
      `SELECT id, year, month, currency_pair, rate, created_at, updated_at
       FROM fx_rates
       WHERE year = ?
       ORDER BY currency_pair, month`,
      [year]
    );

    return rows;
  } catch (err) {
    console.error('Error getting FX rates for year:', err);
    return [];
  }
}

/**
 * Check if FX rates exist for a period
 */
async function fxRatesPeriodExists(year, month) {
  try {
    await db.init();
    
    const row = await db.get(
      'SELECT COUNT(*) as count FROM fx_rates WHERE year = ? AND month = ?',
      [year, month]
    );
    
    return row && row.count > 0;
  } catch (err) {
    console.error('Error checking FX period:', err);
    return false;
  }
}

/**
 * Save FX rates for a period (overwrite or skip existing)
 */
async function saveFxRates(year, month, rates, overwrite = false) {
  try {
    await db.init();
    
    const periodExists = await fxRatesPeriodExists(year, month);
    
    if (periodExists && !overwrite) {
      return { success: false, message: 'Period already exists', skipped: true };
    }
    
    // Begin transaction
    await db.run('BEGIN TRANSACTION');
    
    try {
      // Delete existing rates for this period if overwriting
      if (periodExists && overwrite) {
        await db.run('DELETE FROM fx_rates WHERE year = ? AND month = ?', [year, month]);
      }
      
      // Insert new rates
      let inserted = 0;
      for (const pair in rates) {
        const rate = rates[pair];
        
        // Skip reverse rates (they'll be calculated when needed)
        if (pair.substring(0, 3) === pair.substring(3, 6)) continue;
        
        try {
          await db.run(
            'INSERT INTO fx_rates (year, month, currency_pair, rate) VALUES (?, ?, ?, ?)',
            [year, month, pair, rate]
          );
          inserted++;
        } catch (err) {
          // Skip if unique constraint violation (already exists)
          if (err.message.includes('UNIQUE constraint failed')) {
            continue;
          }
          throw err;
        }
      }
      
      await db.run('COMMIT');
      
      return { success: true, message: 'FX rates saved', inserted };
    } catch (err) {
      await db.run('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error saving FX rates:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Delete a single FX rate
 */
async function deleteFxRate(id) {
  try {
    await db.init();
    
    const result = await db.run('DELETE FROM fx_rates WHERE id = ?', [id]);
    
    return { success: result.changes > 0, changes: result.changes };
  } catch (err) {
    console.error('Error deleting FX rate:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Get the latest available FX rates (most recent year and month)
 */
async function getLatestFxRates() {
  try {
    await db.init();
    
    const row = await db.get(
      'SELECT DISTINCT year, month FROM fx_rates ORDER BY year DESC, month DESC LIMIT 1'
    );
    
    if (!row) {
      return null;
    }
    
    return loadFxRatesForMonth(row.year, row.month);
  } catch (err) {
    console.error('Error getting latest FX rates:', err);
    return null;
  }
}

module.exports = {
  initFxRatesTable,
  loadFxRatesForMonth,
  getAvailableFxPeriods,
  getFxRatesForPeriod,
  getFxRatesForYear,
  fxRatesPeriodExists,
  saveFxRates,
  deleteFxRate,
  getLatestFxRates
};
