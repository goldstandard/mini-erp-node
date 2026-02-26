const xlsx = require("xlsx");

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function loadLines() {
  const workbook = xlsx.readFile("./data/Lines.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  if (!raw || raw.length === 0) return {};

  // First column = field names
  const fieldNames = raw.map(r => r[0]);

  // Remaining columns = line IDs
  const lineIds = raw[0].slice(1);

  const lines = {};

  lineIds.forEach((lineId, colIndex) => {
    if (!lineId) return;

    const obj = { lineId };

    raw.forEach((row, rowIndex) => {
      const field = fieldNames[rowIndex];
      const value = row[colIndex + 1];

      if (!field) return;

      const key = field
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

      obj[key] = value;
    });

    obj.country = obj.country || "";
    obj.currency = obj.currency || "USD";

    obj.energy = safeNumber(obj.energy);
    obj.wages = safeNumber(obj.wages);
    obj.maintenance = safeNumber(obj.maintenance);
    obj.other_costs = safeNumber(obj.other_costs);
    obj.sga_and_overhead = safeNumber(obj.sga_and_overhead);

    obj.cores = safeNumber(obj.cores);
    obj.packaging = safeNumber(obj.packaging);
    obj.pallets = safeNumber(obj.pallets);

    delete obj.cash_cost_per_hour;
    delete obj.cost_per_produced_ton;

    lines[lineId] = obj;
  });

  return lines;
}

module.exports = { loadLines };