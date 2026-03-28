const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Parse CSV file content
 */
function parseCSV(csvContent) {
  const lines = csvContent.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = lines.shift()?.split(',').map(x => x.trim()) || [];
  
  const data = [];
  lines.forEach(line => {
    const cols = [];
    let cur = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cols.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    
    const row = {};
    header.forEach((h, i) => {
      row[h] = (cols[i] ?? '').trim();
    });
    data.push(row);
  });
  
  return data;
}

/**
 * Parse Excel file
 */
function parseExcel(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    return data;
  } catch (err) {
    throw new Error(`Failed to parse Excel file: ${err.message}`);
  }
}

/**
 * Normalize and validate FX rate import data
 * Expected format: { Year, Month, FX_pair (or CurrencyPair), Rate (or FX_Rate) }
 */
function normalizeFxRateData(rows) {
  const normalized = [];
  
  rows.forEach((row, idx) => {
    // Find year field (try various column names)
    const year = row['Year'] || row['year'] || row['YEAR'];
    const month = row['Month'] || row['month'] || row['MONTH'];
    const pair = row['FX_pair'] || row['CurrencyPair'] || row['fx_pair'] || row['currencyPair'] || row['Pair'] || row['Currency Pair'] || row['FX Pair'] || row['FX_ccy'] || row['fx_ccy'];
    const rate = row['Rate'] || row['FX_Rate'] || row['rate'] || row['fx_rate'] || row['FX Rate'];
    
    if (!year || !month || !pair || !rate) {
      // Log missing fields for debugging
      const missing = [];
      if (!year) missing.push('Year');
      if (!month) missing.push('Month');
      if (!pair) missing.push('FX_pair');
      if (!rate) missing.push('Rate');
      console.warn(`Skipping row ${idx + 1}: missing fields [${missing.join(', ')}]. Available: [${Object.keys(row).join(', ')}]`);
      return;
    }
    
    const yearNum = parseInt(year);
    const monthRaw = String(month).trim();
    const isBudgetMonth = monthRaw.toLowerCase() === 'budget';
    const monthNum = isBudgetMonth ? 0 : parseInt(monthRaw);
    const rateNum = parseFloat(rate);
    
    if (!Number.isFinite(yearNum) || yearNum < 2000) {
      console.warn(`Skipping row ${idx + 1}: invalid year (${year})`);
      return;
    }
    
    if (!Number.isFinite(monthNum) || monthNum < 0 || monthNum > 12) {
      console.warn(`Skipping row ${idx + 1}: invalid month (${month})`);
      return;
    }
    
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      console.warn(`Skipping row ${idx + 1}: invalid rate (${rate})`);
      return;
    }
    
    const pairNorm = String(pair).trim().toUpperCase();
    if (!/^[A-Z]{3}[A-Z]{3}$/.test(pairNorm)) {
      console.warn(`Skipping row ${idx + 1}: invalid currency pair format (${pair})`);
      return;
    }
    
    normalized.push({
      year: yearNum,
      month: monthNum,
      monthLabel: isBudgetMonth ? 'budget' : String(monthNum),
      pair: pairNorm,
      rate: rateNum
    });
  });
  
  return normalized;
}

/**
 * Parse and normalize FX rate file (CSV or Excel)
 */
async function parseFxRateFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let rows = [];
  
  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf8');
    rows = parseCSV(content);
  } else if (ext === '.xlsx' || ext === '.xls') {
    rows = parseExcel(filePath);
  } else {
    throw new Error('Unsupported file format. Supported formats: .csv, .xlsx, .xls');
  }
  
  if (rows.length === 0) {
    throw new Error('File is empty or could not be parsed');
  }
  
  return normalizeFxRateData(rows);
}

/**
 * Group parsed FX rates by period (year-month)
 */
function groupByPeriod(parsedRates) {
  const grouped = {};
  
  parsedRates.forEach(item => {
    const periodToken = item.month === 0 ? 'budget' : String(item.month).padStart(2, '0');
    const key = `${item.year}-${periodToken}`;
    if (!grouped[key]) {
      grouped[key] = {
        year: item.year,
        month: item.month,
        monthLabel: item.month === 0 ? 'budget' : String(item.month),
        rates: {}
      };
    }
    grouped[key].rates[item.pair] = item.rate;
  });
  
  return Object.values(grouped);
}

module.exports = {
  parseFxRateFile,
  normalizeFxRateData,
  groupByPeriod,
  parseCSV,
  parseExcel
};
