const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../../config/examples/land codes.xls');
const workbook = XLSX.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log('===== WATER BODY LADDER ROWS (180-228) =====\n');

for (let i = 180; i < 229; i++) {
  if (i >= data.length) break;

  const row = data[i];
  const rowText = row.join(' | ');

  if (rowText.trim()) {
    console.log(`Row ${i}:`, JSON.stringify(row));
  }
}
