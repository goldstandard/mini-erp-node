const XLSX = require("xlsx");
const path = require("path");
const fxRatesDb = require("./fx-rates-db");

let cachedFxRates = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadFxRatesFromDb() {
  try {
    // Check if we have a valid cache
    if (cachedFxRates && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return cachedFxRates;
    }
    
    // Get latest FX rates from database
    const fx = await fxRatesDb.getLatestFxRates();
    
    if (fx) {
      cachedFxRates = fx;
      cacheTimestamp = Date.now();
      return fx;
    }
    
    // Fallback to Excel if no DB records
    return loadFxRatesFromFile();
  } catch (err) {
    console.warn("Error loading FX rates from database:", err.message);
    // Fallback to Excel
    return loadFxRatesFromFile();
  }
}

function loadFxRatesFromFile() {
  const filePath = path.join(__dirname, "..", "..", "data", "FX_rates.xlsx");
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  const fx = {};

  rows.forEach(row => {
    const pair = row.CurrencyPair;
    const rate = row.FX_Rate;

    fx[pair] = rate;

    const from = pair.substring(0, 3);
    const to = pair.substring(3, 6);
    const reverse = to + from;

    if (!fx[reverse]) {
      fx[reverse] = 1 / rate;
    }
  });

  return fx;
}

function loadFxRates() {
  // For synchronous callers, use cache or fallback to file
  if (cachedFxRates && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFxRates;
  }
  
  // Return file-based rates as fallback for sync callers
  return loadFxRatesFromFile();
}

function convert(amount, from, to, fx) {
  if (from === to) return amount;

  const direct = from + to;
  if (fx[direct]) return amount * fx[direct];

  // Try via USD
  if (fx[from + "USD"] && fx["USD" + to]) {
    return amount * fx[from + "USD"] * fx["USD" + to];
  }

  // Try via EUR
  if (fx[from + "EUR"] && fx["EUR" + to]) {
    return amount * fx[from + "EUR"] * fx["EUR" + to];
  }

  return amount; // fallback
}

module.exports = { loadFxRates, loadFxRatesFromDb, convert };