const XLSX = require('xlsx');
const path = require('path');

// Read the land codes file
const filePath = path.join(__dirname, '../../config/examples/land codes.xls');
const workbook = XLSX.readFile(filePath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log('===== LAND CODES FILE FULL ANALYSIS =====\n');
console.log(`Total rows: ${data.length}\n`);

// Find section headers by looking for key patterns
console.log('===== IDENTIFYING SECTIONS =====\n');

const sections = [];
let currentSection = null;

data.forEach((row, index) => {
  const rowText = row.join(' ').trim();

  // Look for zone headers
  if (row[6] === 'Zone' && row[7]) {
    if (currentSection) {
      currentSection.endRow = index - 1;
      sections.push(currentSection);
    }
    currentSection = {
      type: 'Zone',
      startRow: index,
      zoneCode: row[7],
      data: []
    };
  }

  // Look for other section markers
  if (rowText.includes('Neighborhood') && rowText.includes('Code')) {
    if (currentSection) {
      currentSection.endRow = index - 1;
      sections.push(currentSection);
    }
    currentSection = {
      type: 'NeighborhoodCodes',
      startRow: index,
      data: []
    };
  }

  if (rowText.includes('Land Type') || rowText.includes('Land Ladder')) {
    if (currentSection) {
      currentSection.endRow = index - 1;
      sections.push(currentSection);
    }
    currentSection = {
      type: 'LandLadder',
      startRow: index,
      data: []
    };
  }

  if (rowText.includes('View') && rowText.includes('Code')) {
    if (currentSection) {
      currentSection.endRow = index - 1;
      sections.push(currentSection);
    }
    currentSection = {
      type: 'ViewCodes',
      startRow: index,
      data: []
    };
  }

  if (rowText.includes('Waterfront')) {
    if (currentSection) {
      currentSection.endRow = index - 1;
      sections.push(currentSection);
    }
    currentSection = {
      type: 'WaterfrontLadder',
      startRow: index,
      data: []
    };
  }

  if (rowText.includes('Attribute') || rowText.includes('Land Influence')) {
    if (currentSection) {
      currentSection.endRow = index - 1;
      sections.push(currentSection);
    }
    currentSection = {
      type: 'AttributeCodes',
      startRow: index,
      data: []
    };
  }
});

// Close last section
if (currentSection) {
  currentSection.endRow = data.length - 1;
  sections.push(currentSection);
}

console.log('Found sections:');
sections.forEach(section => {
  console.log(`  ${section.type}: rows ${section.startRow} to ${section.endRow}`);
});

// Show detailed view of each section type
console.log('\n===== SECTION DETAILS =====\n');

sections.forEach(section => {
  console.log(`\n----- ${section.type} (rows ${section.startRow}-${section.endRow}) -----`);
  const sectionData = data.slice(section.startRow, Math.min(section.endRow + 1, section.startRow + 20));
  sectionData.forEach((row, idx) => {
    if (row.some(cell => cell !== '')) {
      console.log(`  Row ${section.startRow + idx}:`, JSON.stringify(row));
    }
  });
  if (section.endRow - section.startRow > 20) {
    console.log(`  ... (${section.endRow - section.startRow - 20} more rows)`);
  }
});
