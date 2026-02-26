const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

// Load the Sources.xlsx file
const filePath = path.join(__dirname, "data", "Sources.xlsx");
const workbook = XLSX.readFile(filePath);

console.log("Available sheets:", workbook.SheetNames);

// Focus on Calc sheet
if (workbook.SheetNames.includes("Calc")) {
  const calcSheet = workbook.Sheets["Calc"];
  const range = calcSheet['!ref'];
  console.log("\n========== Calc Sheet ==========");
  console.log("Range:", range);
  
  // Get raw data with all rows
  const data = XLSX.utils.sheet_to_json(calcSheet, { header: 1, defval: "" });
  
  console.log("\nTotal rows:", data.length);
  console.log("\nFirst 50 rows of Calc sheet:\n");
  
  data.slice(0, 50).forEach((row, idx) => {
    // Only show rows that have some content
    const hasContent = row.some(cell => cell !== "");
    if (hasContent) {
      console.log(`Row ${idx}:`);
      row.forEach((cell, colIdx) => {
        if (cell !== "") {
          console.log(`  Col ${colIdx}: ${JSON.stringify(cell)}`);
        }
      });
      console.log("");
    }
  });
  
  // Save to JSON file for easier inspection
  const outputPath = path.join(__dirname, "calc-sheet-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`\nFull Calc sheet data saved to: ${outputPath}`);
  
} else {
  console.log("\nCalc sheet not found!");
}
