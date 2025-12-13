const XLSX = require('xlsx');
const path = require('path');

// Read the land codes file
const filePath = path.join(__dirname, '../../config/examples/land codes.xls');
const workbook = XLSX.readFile(filePath);

console.log('===== LAND CODES FILE ANALYSIS =====\n');
console.log('Sheet Names:', workbook.SheetNames);
console.log('');

// Examine each sheet
workbook.SheetNames.forEach((sheetName) => {
  console.log(`\n===== SHEET: ${sheetName} =====`);
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  console.log(`Total rows: ${data.length}\n`);

  // Show first 50 rows
  console.log('First 50 rows:');
  data.slice(0, 50).forEach((row, index) => {
    if (row.some((cell) => cell !== '')) {
      console.log(`Row ${index}:`, JSON.stringify(row));
    }
  });
});
