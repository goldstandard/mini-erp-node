const XLSX = require("xlsx");
const path = require("path");
const { loadProducts } = require("./products");

const PRODUCTS_FILE = path.join(__dirname, "..", "..", "data", "Products.xlsx");

// Get all products in editable format
function getEditableProducts() {
  const filePath = PRODUCTS_FILE;
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (rows.length === 0) return [];

  return rows.map((row, index) => {
    const product = {
      rowIndex: index,
      sapId: row["SAP ID"] || "",
      pfnId: row["PFN ID"] || "",
      customer: row["Customer"] || "",
      marketSegment: row["Market segment"] || "",
      application: row["Application"] || "",
      s_sms: row["S/SMS"] || "",
      bonding: row["Bonding"] || "",
      basisWeight: row["Basis weight"] || "",
      slitWidth: row["Slit width"] || "",
      treatment: row["Treatment"] || "",
      author: row["Author"] || "",
      lineId: row["Line"] || "",
      country: row["Country"] || "",
      grossYield: row["Gross Yield"] || "",
      throughput: row["Throughput"] || "",
      overconsumption: row["Overconsumption"] || "",
      // Raw row for reference
      _rawRow: row,
      // Extract BOM (Bill of Materials)
      bom: extractBOM(row)
    };
    return product;
  });
}

// Extract and structure BOM from raw Excel row
function extractBOM(row) {
  const bom = [];
  const materialTypes = ["PE", "SB", "MB", "Color", "Softener", "Additive"];

  materialTypes.forEach(type => {
    let index = 1;
    let materialName = row[`${type}${index}`];
    let percentage = row[`${type}${index}%`];

    while (materialName || percentage) {
      if (materialName && percentage && percentage > 0) {
        bom.push({
          material: materialName || `${type} ${index}`,
          percentage: percentage || 0,
          baseField: `${type}${index}`,
          percentField: `${type}${index}%`
        });
      }
      index++;
      materialName = row[`${type}${index}`];
      percentage = row[`${type}${index}%`];
    }
  });

  // Add special SB1 adjustment fields
  // Note: Siko% and Repro% are portions of SB1 that come from recycled/regranulated waste
  // Adj. SB1% = SB1% - Siko% - Repro% (virgin material needed, calculated automatically on save)
  
  if (row["Siko%"] && row["Siko%"] > 0) {
    bom.push({
      material: "Siko (recycled scrap replacement)",
      percentage: row["Siko%"],
      percentField: "Siko%"
    });
  }

  if (row["Repro%"] && row["Repro%"] > 0) {
    bom.push({
      material: "Repro (regranulated waste replacement)",
      percentage: row["Repro%"],
      percentField: "Repro%"
    });
  }

  return bom;
}

// Update a single product and save to Excel
function updateProduct(rowIndex, updates) {
  try {
    const filePath = PRODUCTS_FILE;
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    if (rowIndex < 0 || rowIndex >= rows.length) {
      throw new Error(`Invalid row index: ${rowIndex}`);
    }

    const row = rows[rowIndex];

    // Map field names to Excel column headers
    const fieldMap = {
      sapId: "SAP ID",
      pfnId: "PFN ID",
      customer: "Customer",
      marketSegment: "Market segment",
      application: "Application",
      s_sms: "S/SMS",
      bonding: "Bonding",
      basisWeight: "Basis weight",
      slitWidth: "Slit width",
      treatment: "Treatment",
      author: "Author",
      lineId: "Line",
      country: "Country",
      grossYield: "Gross Yield",
      throughput: "Throughput",
      overconsumption: "Overconsumption"
    };

    // Apply basic field updates
    for (const [field, value] of Object.entries(updates)) {
      if (field === "bom" || field === "_rawRow") continue;
      const excelField = fieldMap[field];
      if (excelField) {
        row[excelField] = value || "";
      }
    }

    // Handle BOM updates if present
    if (updates.bom && Array.isArray(updates.bom)) {
      // First clear all existing material entries
      const materialTypes = ["PE", "SB", "MB", "Color", "Softener", "Additive"];
      materialTypes.forEach(type => {
        let index = 1;
        while (row[`${type}${index}`] !== undefined) {
          row[`${type}${index}`] = "";
          row[`${type}${index}%`] = 0;
          index++;
        }
      });
      // Clear special fields
      row["SB1%"] = 0;  // Will be restored from BOM
      row["Siko%"] = 0;
      row["Repro%"] = 0;
      row["Adj. SB1%"] = 0;  // Will be calculated below

      // Now apply new BOM entries
      updates.bom.forEach(bomItem => {
        if (bomItem.percentField === "SB1%") {
          row["SB1"] = bomItem.material || "";
          row["SB1%"] = bomItem.percentage || 0;
        } else if (bomItem.percentField === "Siko%") {
          row["Siko%"] = bomItem.percentage || 0;
        } else if (bomItem.percentField === "Repro%") {
          row["Repro%"] = bomItem.percentage || 0;
        } else if (bomItem.baseField && bomItem.percentField) {
          row[bomItem.baseField] = bomItem.material || "";
          row[bomItem.percentField] = bomItem.percentage || 0;
        }
      });

      // Auto-calculate Adj. SB1% = SB1% - Siko% - Repro%
      // (virgin SB1 needed after accounting for recycled/regranulated waste)
      const sb1Pct = row["SB1%"] || 0;
      const sikoPct = row["Siko%"] || 0;
      const reproPct = row["Repro%"] || 0;
      row["Adj. SB1%"] = Math.max(0, sb1Pct - sikoPct - reproPct);
    }

    // Write back to Excel
    const newSheet = XLSX.utils.json_to_sheet(rows);
    wb.Sheets[wb.SheetNames[0]] = newSheet;
    XLSX.writeFile(wb, filePath);

    return {
      success: true,
      message: "Product updated successfully",
      rowIndex: rowIndex
    };
  } catch (err) {
    console.error("Error updating product:", err);
    throw new Error(`Failed to update product: ${err.message}`);
  }
}

// Search products for editing
function searchProducts(query) {
  const products = getEditableProducts();
  
  if (!query || query.trim() === "") {
    return products;
  }

  const lowerQuery = query.toLowerCase();
  return products.filter(p => 
    (p.sapId && p.sapId.toString().includes(lowerQuery)) ||
    (p.pfnId && p.pfnId.toString().includes(lowerQuery)) ||
    (p.customer && p.customer.toLowerCase().includes(lowerQuery)) ||
    (p.marketSegment && p.marketSegment.toLowerCase().includes(lowerQuery)) ||
    (p.application && p.application.toLowerCase().includes(lowerQuery))
  );
}

// Duplicate a product
function duplicateProduct(rowIndex) {
  const filePath = PRODUCTS_FILE;
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (rowIndex < 0 || rowIndex >= rows.length) {
    throw new Error("Product not found");
  }

  const sourceRow = rows[rowIndex];
  
  // Create new row with all data copied
  const newRow = {};
  Object.keys(sourceRow).forEach(key => {
    newRow[key] = sourceRow[key];
  });

  // Set SAP ID and PFN ID to TBD
  newRow["SAP ID"] = "TBD";
  newRow["PFN ID"] = "TBD";

  // Add new row to the sheet
  rows.push(newRow);

  // Write back to Excel
  const newSheet = XLSX.utils.json_to_sheet(rows);
  wb.Sheets[wb.SheetNames[0]] = newSheet;
  XLSX.writeFile(wb, filePath);

  // Return the new row index (which is length - 1)
  return rows.length - 1;
}

// Delete a product
function deleteProduct(rowIndex) {
  const filePath = PRODUCTS_FILE;
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  if (rowIndex < 0 || rowIndex >= rows.length) {
    throw new Error("Product not found");
  }

  // Remove the row at the specified index
  rows.splice(rowIndex, 1);

  // Write back to Excel
  const newSheet = XLSX.utils.json_to_sheet(rows);
  wb.Sheets[wb.SheetNames[0]] = newSheet;
  XLSX.writeFile(wb, filePath);

  return true;
}

module.exports = {
  getEditableProducts,
  updateProduct,
  searchProducts,
  duplicateProduct,
  deleteProduct
};
