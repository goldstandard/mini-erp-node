const XLSX = require("xlsx");
const path = require("path");

function loadFxRates() {
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

module.exports = { loadFxRates, convert };