const { loadFxRates, convert } = require("./fx");
const { loadMaterials } = require("./materials");
const { loadLines } = require("./lines");
const { loadProducts } = require("./products");

function safe(value, fallback = 0) {
  const n = Number(value);
  return isNaN(n) ? fallback : n;
}

function computeCosts(displayCurrency, filters = {}) {
  const fx = loadFxRates() || {};

  // materials.js returns: { materials, siko }
  const loaded = loadMaterials(fx) || {};
  const materials = loaded.materials || {};
  const siko = loaded.siko || {};

  const lines = loadLines() || {};
  const products = loadProducts() || [];

  const results = [];

  products.forEach(product => {
    try {
      // Apply filters
      if (filters.sapId && product.sapId != filters.sapId) return;
      if (filters.pfnId && product.pfnId != filters.pfnId) return;
      if (filters.customer && product.customer != filters.customer) return;
      if (filters.marketSegment && product.marketSegment != filters.marketSegment) return;
      if (filters.application && product.application != filters.application) return;
      if (filters.s_sms && product.s_sms != filters.s_sms) return;
      if (filters.bonding && product.bonding != filters.bonding) return;
      if (filters.basisWeight && product.basisWeight != filters.basisWeight) return;
      if (filters.slitWidth && product.slitWidth != filters.slitWidth) return;
      if (filters.treatment && product.treatment != filters.treatment) return;
      if (filters.author && product.author != filters.author) return;
      if (filters.lineId && product.lineId != filters.lineId) return;
      if (filters.country && product.country != filters.country) return;
      if (filters.overconsumption) {
        const vals = Array.isArray(filters.overconsumption) ? filters.overconsumption : [filters.overconsumption];
        if (!vals.some(v => v == product.overconsumption)) return;
      }

      const line = lines[product.lineId];
      if (!line) {
        console.warn("Missing line for product", product.productId, product.lineId);
        return;
      }

      const lineCurrency = line.currency || "USD";

      // ------------------------------------------------------------
      // PROCESS COST — HOURLY COMPONENTS
      // ------------------------------------------------------------
      const energy = safe(line.energy);
      const wages = safe(line.wages);
      const maintenance = safe(line.maintenance);
      const other = safe(line.other_costs);
      const sgna = safe(line.sga_and_overhead);

      const hourlyCostLocal =
        energy + wages + maintenance + other + sgna;

      // ------------------------------------------------------------
      // PROCESS COST — PER TON COMPONENTS
      // ------------------------------------------------------------
      const cores = safe(line.cores);
      const packaging = safe(line.packaging);
      const pallets = safe(line.pallets);

      const perTonCostLocal =
        cores + packaging + pallets;

      // Convert to USD
      const hourlyCostUSD = safe(convert(hourlyCostLocal, lineCurrency, "USD", fx));
      const perTonCostUSD = safe(convert(perTonCostLocal, lineCurrency, "USD", fx));

      // ------------------------------------------------------------
      // MATERIAL COST — GROSS KG
      // ------------------------------------------------------------
      let materialCostPerKgUSD = 0;
      let baseMaterialCostPerKgUSD = 0;
      const materialBreakdown = [];

      if (!Array.isArray(product.materials)) {
        console.warn("Product has no materials array", product.productId);
        product.materials = [];
      }

      product.materials.forEach(m => {
        const key = `${m.material}__${product.country}`;
        const mat = materials[key];

        if (!mat) {
          console.warn("Missing material price", key);
          return;
        }

        const priceUSD = safe(mat.priceUSD);
        const basePct = safe(m.pct);
        const effectivePct = basePct * (1 + safe(product.overconsumption));

        const baseCost = basePct * priceUSD;
        const finalCost = effectivePct * priceUSD;

        baseMaterialCostPerKgUSD += baseCost;
        materialCostPerKgUSD += finalCost;

        materialBreakdown.push({
          material: m.material,
          basePct,
          effectivePct,
          priceUSD,
          baseCost,
          finalCost
        });
      });

      const overconsumptionImpact =
        materialCostPerKgUSD - baseMaterialCostPerKgUSD;

      // MATERIAL COST — NET KG (SCRAP + SIKO)
      // ------------------------------------------------------------
      const grossYield = safe(product.grossYield, 1); // fraction (e.g., 0.92)
      const scrapFraction = 1 - grossYield;

      // Siko cost per country (already converted to USD in materials.js)
      const sikoCostUSD = safe(siko[product.country]);

      // Net kg material cost formula:
      // Step 1: baseCost / grossYield = net cost before scrap adjustment
      // Step 2: scrapValue = ((1 - grossYield) / grossYield) * sikoCost
      // Step 3: netCostAfterScrap = step1 - step2 (scrap value is SUBTRACTED)
      const netCostBeforeScrapUSD = materialCostPerKgUSD / grossYield;
      const scrapValueUSD = (scrapFraction / grossYield) * sikoCostUSD;
      const netMaterialCostPerKgUSD = netCostBeforeScrapUSD - scrapValueUSD;

      // ------------------------------------------------------------
      // PROCESS COST PER KG
      // ------------------------------------------------------------
      const throughput = safe(product.throughput, 1);

      const hoursPerTon = (1000 / grossYield) / throughput;

      const hourlyCostContribution =
        (hourlyCostUSD * hoursPerTon) / 1000;

      const perTonCostContribution =
        perTonCostUSD / 1000;

      const processCostPerKgUSD =
        hourlyCostContribution + perTonCostContribution;

      // ------------------------------------------------------------
      // TOTAL COST (NET KG)
      // ------------------------------------------------------------
      const totalCostPerKgUSD =
        netMaterialCostPerKgUSD + processCostPerKgUSD;

      // Convert to display currency
      const materialCostGross = safe(convert(materialCostPerKgUSD, "USD", displayCurrency, fx));
      const materialCostNet = safe(convert(netMaterialCostPerKgUSD, "USD", displayCurrency, fx));
      const processCost = safe(convert(processCostPerKgUSD, "USD", displayCurrency, fx));
      const totalCost = safe(convert(totalCostPerKgUSD, "USD", displayCurrency, fx));

      // Backward‑compat field for old frontend (if anything still reads materialCost)
      const materialCost = materialCostNet;

      // ------------------------------------------------------------
      // RETURN RESULT
      // ------------------------------------------------------------
      results.push({
        sapId: product.sapId,
        pfnId: product.pfnId,
        customer: product.customer,
        marketSegment: product.marketSegment,
        application: product.application,
        s_sms: product.s_sms,
        bonding: product.bonding,
        basisWeight: product.basisWeight,
        slitWidth: product.slitWidth,
        treatment: product.treatment,
        author: product.author,
        lineId: product.lineId,
        country: product.country,
        grossYield: product.grossYield,
        throughput: product.throughput,
        overconsumption: product.overconsumption,

        // Gross vs net material cost
        materialCostGross,
        materialCostNet,
        materialCost, // alias for compatibility

        processCost,
        totalCost,
        currency: displayCurrency,

        fxRates: fx,

        details: {
          materials: materialBreakdown,
          baseMaterialCostPerKgUSD,
          finalMaterialCostPerKgUSD: materialCostPerKgUSD,
          overconsumptionImpact,

          netMaterialCostPerKgUSD,
          sikoCostUSD,
          scrapFraction,
          grossYield,

          process: {
            hoursPerTon,
            hourlyCostUSD,
            perTonCostUSD,
            hourlyCostContribution,
            perTonCostContribution,

            hourlyComponents: {
              energyUSD: safe(convert(energy, lineCurrency, "USD", fx)),
              wagesUSD: safe(convert(wages, lineCurrency, "USD", fx)),
              maintenanceUSD: safe(convert(maintenance, lineCurrency, "USD", fx)),
              otherUSD: safe(convert(other, lineCurrency, "USD", fx)),
              sgnaUSD: safe(convert(sgna, lineCurrency, "USD", fx))
            },

            perTonComponents: {
              coresUSD: safe(convert(cores, lineCurrency, "USD", fx)),
              packagingUSD: safe(convert(packaging, lineCurrency, "USD", fx)),
              palletsUSD: safe(convert(pallets, lineCurrency, "USD", fx))
            }
          }
        }
      });

    } catch (err) {
      console.error("Error computing cost for product", product.productId, err);
    }
  });

  return results;
}

module.exports = { computeCosts };