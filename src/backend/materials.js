const xlsx = require("xlsx");

function loadMaterials(fx) {
  const workbook = xlsx.readFile("./data/RawMat_prices.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  const materials = {};
  const siko = {};

  rows.forEach(row => {
    const country = row["Country"];
    const material = row["Raw Material"];
    const currency = row["Currency"];
    const price = Number(row["Price"]);

    if (!country || !material || !currency || isNaN(price)) return;

    const fxKey = `${currency}USD`;
    const rate = fx && fx[fxKey] ? fx[fxKey] : 1;
    const priceUSD = price * rate;

    // Detect Siko rows
    if (material.trim().toLowerCase() === "siko") {
      siko[country] = priceUSD;
      // DO NOT return — Siko is also a raw material
    }

    // Normal material rows
    const key = `${material}__${country}`;

    materials[key] = {
      material,
      country,
      priceUSD
    };
  });

  return { materials, siko };
}

module.exports = { loadMaterials };