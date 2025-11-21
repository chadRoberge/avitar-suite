const fs = require('fs');
const path = require('path');
const landCodesImportService = require('../services/landCodesImportService');

console.log('===== TESTING LAND CODES PARSER =====\n');

// Read the land codes file
const filePath = path.join(__dirname, '../../config/examples/land codes.xls');
const fileBuffer = fs.readFileSync(filePath);

console.log(`Reading file: ${filePath}\n`);

try {
  // Parse the file
  const result = landCodesImportService.parseLandCodesFile(fileBuffer);

  console.log('\n===== PARSING RESULTS =====\n');

  // Display zones
  console.log('ZONES:');
  result.zones.forEach(zone => {
    console.log(`  ${zone.name}: ${zone.description}`);
    console.log(`    Lot Size: ${zone.minimumAcreage} ac, Frontage: ${zone.minimumFrontage} ft`);
    console.log(`    Excess Land: $${zone.excessLandCostPerAcre?.toLocaleString()}/ac`);
    console.log(`    Base View: $${zone.baseViewValue?.toLocaleString()}`);
  });

  // Display land ladders
  console.log('\n\nLAND LADDERS (first 10):');
  result.landLadders.slice(0, 10).forEach(ladder => {
    console.log(`  Zone ${ladder.zoneCode}: ${ladder.acreage} ac @ $${ladder.value.toLocaleString()}`);
  });
  if (result.landLadders.length > 10) {
    console.log(`  ... and ${result.landLadders.length - 10} more`);
  }

  // Display land use codes
  console.log('\n\nLAND USE CODES (first 10):');
  result.landUseCodes.slice(0, 10).forEach(code => {
    console.log(`  ${code.code}: ${code.description}`);
  });
  if (result.landUseCodes.length > 10) {
    console.log(`  ... and ${result.landUseCodes.length - 10} more`);
  }

  // Display neighborhood codes
  console.log('\n\nNEIGHBORHOOD CODES (first 10):');
  result.neighborhoodCodes.slice(0, 10).forEach(code => {
    console.log(`  ${code.code}: ${code.description} (${code.rate}%)`);
  });
  if (result.neighborhoodCodes.length > 10) {
    console.log(`  ... and ${result.neighborhoodCodes.length - 10} more`);
  }

  // Display site conditions
  console.log('\n\nSITE/TOPOGRAPHY CONDITIONS:');
  result.siteConditions.forEach(condition => {
    console.log(`  ${condition.code} (${condition.type}): ${condition.description} (${condition.factor}%)`);
  });

  // Display road types
  console.log('\n\nROAD TYPES:');
  result.roadTypes.forEach(road => {
    console.log(`  ${road.code}: ${road.description} (${road.factor}%)`);
  });

  // Display driveway types
  console.log('\n\nDRIVEWAY TYPES:');
  result.drivewayTypes.forEach(driveway => {
    console.log(`  ${driveway.code}: ${driveway.description} (${driveway.factor}%)`);
  });

  // Display current use codes
  console.log('\n\nCURRENT USE CODES:');
  result.currentUseCodes.forEach(code => {
    console.log(`  ${code.code}: ${code.description} ($${code.minValue}-$${code.maxValue})`);
  });

  console.log('\n\n===== STATISTICS =====');
  console.log(`Zones: ${result.stats.zonesCount}`);
  console.log(`Land Ladder Tiers: ${result.stats.landLaddersCount}`);
  console.log(`Land Use Codes: ${result.stats.landUseCodesCount}`);
  console.log(`Neighborhood Codes: ${result.stats.neighborhoodCodesCount}`);
  console.log(`Site/Topography Conditions: ${result.stats.siteConditionsCount}`);
  console.log(`Road Types: ${result.stats.roadTypesCount}`);
  console.log(`Driveway Types: ${result.stats.drivewayTypesCount}`);
  console.log(`Current Use Codes: ${result.stats.currentUseCodesCount}`);

  console.log('\n✅ PARSER TEST SUCCESSFUL\n');

  // Save results to JSON file for inspection
  const outputPath = path.join(__dirname, '../../output/land_codes_parsed.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`📄 Detailed results saved to: ${outputPath}\n`);

} catch (error) {
  console.error('❌ PARSER TEST FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
