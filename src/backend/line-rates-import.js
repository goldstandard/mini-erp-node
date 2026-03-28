function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeKey(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function parseLineRatesMatrix(rawMatrix) {
  if (!Array.isArray(rawMatrix) || rawMatrix.length < 2) {
    throw new Error('Import file has invalid structure');
  }

  const firstRow = Array.isArray(rawMatrix[0]) ? rawMatrix[0] : [];
  const lineIds = firstRow.slice(1).map((v) => (v || '').toString().trim());

  if (!lineIds.some(Boolean)) {
    throw new Error('No line IDs found in the first row');
  }

  const lines = [];

  lineIds.forEach((lineId, colIndex) => {
    if (!lineId) return;

    const obj = { lineId };

    rawMatrix.forEach((row) => {
      if (!Array.isArray(row)) return;
      const rawField = row[0];
      const key = normalizeKey(rawField);
      if (!key) return;
      obj[key] = row[colIndex + 1];
    });

    obj.country = (obj.country || '').toString().trim().toUpperCase();
    obj.currency = (obj.currency || 'USD').toString().trim().toUpperCase() || 'USD';

    obj.energy = safeNumber(obj.energy);
    obj.wages = safeNumber(obj.wages);
    obj.maintenance = safeNumber(obj.maintenance);
    obj.other_costs = safeNumber(obj.other_costs);
    obj.sga_and_overhead = safeNumber(obj.sga_and_overhead);

    obj.cores = safeNumber(obj.cores);
    obj.packaging = safeNumber(obj.packaging);
    obj.pallets = safeNumber(obj.pallets);

    lines.push({
      lineId: obj.lineId,
      country: obj.country,
      currency: obj.currency,
      energy: obj.energy,
      wages: obj.wages,
      maintenance: obj.maintenance,
      other_costs: obj.other_costs,
      sga_and_overhead: obj.sga_and_overhead,
      cores: obj.cores,
      packaging: obj.packaging,
      pallets: obj.pallets
    });
  });

  if (!lines.length) {
    throw new Error('No valid line rows found in file');
  }

  return lines;
}

module.exports = {
  parseLineRatesMatrix
};
