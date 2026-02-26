const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(__dirname, 'data', 'Sources.xlsx');
const workbook = XLSX.readFile(filePath);

console.log('Available sheets:', workbook.SheetNames);

if (workbook.SheetNames.includes('Lists')) {
  const listsSheet = workbook.Sheets['Lists'];
  const range = listsSheet['!ref'];
  console.log('\n========== Lists Sheet ==========');
  console.log('Range:', range);
  
  const data = XLSX.utils.sheet_to_json(listsSheet, { header: 1, defval: '' });
  
  console.log('\nTotal rows:', data.length);
  console.log('\nFirst 100 rows of Lists sheet:\n');
  
  data.slice(0, 100).forEach((row, idx) => {
    const hasContent = row.some(cell => cell !== '');
    if (hasContent) {
      console.log('Row ' + idx + ':', JSON.stringify(row));
    }
  });
  
  // Save to JSON
  const outputPath = path.join(__dirname, 'lists-sheet-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log('\nFull Lists sheet data saved to: ' + outputPath);
} else {
  console.log('\nLists sheet not found!');
}
