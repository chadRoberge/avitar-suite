const XLSX = require('xlsx');

/**
 * Land Codes Import Service
 * Parses land codes from Excel files including:
 * - Zones with land ladders (pricing tiers)
 * - Land use codes
 * - Neighborhood codes
 * - Site/topography modifiers
 * - Road/driveway types
 * - Current use codes
 * - View attributes (subjects, widths, depths, distances)
 * - Water bodies with frontage ladders
 * - Waterfront attributes (access, location, topography)
 */
class LandCodesImportService {
  constructor() {
    // Define exact section headers and their mappings
    this.sectionHeaders = {
      'land pricing zones': {
        type: 'zones',
        hasSubHeaders: true,
      },
      'land use codes': {
        model: 'LandUseDetail',
        useDescriptionAsDisplayText: true,
        noFactor: true, // Land use codes only have code and description (columns D, E)
        leftOnly: true, // Only parse left columns (3, 4) - neighborhoods are on the right
      },
      'neighborhoods': {
        model: 'NeighborhoodCode',
        useCodeAsDisplayText: true,
        rightOnly: true, // Only parse right columns (6-9) - land use codes are on the left
      },
      'site modifiers': {
        model: 'PropertyAttribute',
        attributeType: 'SiteAttribute',
        useDescriptionAsDisplayText: true,
        leftOnly: true, // Only parse left side to avoid duplicates
      },
      'topography modifiers': {
        model: 'PropertyAttribute',
        attributeType: 'TopologyAttribute',
        useDescriptionAsDisplayText: true,
        leftOnly: true, // Only parse left side to avoid duplicates
      },
      'road modifiers': {
        model: 'PropertyAttribute',
        attributeType: 'RoadAttribute',
        useDescriptionAsDisplayText: true,
        leftOnly: true, // Only parse left side to avoid duplicates
      },
      'driveway modifiers': {
        model: 'PropertyAttribute',
        attributeType: 'DrivewayAttribute',
        useDescriptionAsDisplayText: true,
        leftOnly: true, // Only parse left side to avoid duplicates
      },
      'current use codes': {
        model: 'CurrentUse',
        useDescriptionAsDisplayText: true,
        hasMinMax: true,
      },
      'view subjects': {
        model: 'ViewAttribute',
        attributeType: 'subject',
        useDescriptionAsDisplayText: true,
        pairLeftRight: true,  // Left column is name, right column is factor
      },
      'view widths': {
        model: 'ViewAttribute',
        attributeType: 'width',
        useDescriptionAsDisplayText: true,
        pairLeftRight: true,
      },
      'view depths': {
        model: 'ViewAttribute',
        attributeType: 'depth',
        useDescriptionAsDisplayText: true,
        pairLeftRight: true,
      },
      'view distances': {
        model: 'ViewAttribute',
        attributeType: 'distance',
        useDescriptionAsDisplayText: true,
        pairLeftRight: true,
      },
      'water body frontage foot factors': {
        type: 'waterBodies',
        hasLadders: true,
      },
      'water frontage access': {
        model: 'WaterfrontAttribute',
        attributeType: 'water_access',
        useDescriptionAsDisplayText: true,
        leftOnly: true,  // Only parse left side (col 3 code, col 6 factor)
      },
      'water frontage location': {
        model: 'WaterfrontAttribute',
        attributeType: 'water_location',
        useDescriptionAsDisplayText: true,
        rightOnly: true,  // Only parse right side (col 7 code, col 9 factor)
      },
      'water frontage topography': {
        model: 'WaterfrontAttribute',
        attributeType: 'topography',
        useDescriptionAsDisplayText: true,
        leftOnly: true,  // Only parse left side (standalone section)
      },
    };
  }

  /**
   * Parse land codes Excel file
   * @param {Buffer} fileBuffer - Excel file buffer
   * @returns {Object} Parsed codes organized by type
   */
  parseLandCodesFile(fileBuffer) {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      console.log(`📋 Parsing land codes from sheet: ${sheetName}`);
      console.log(`   Total rows: ${data.length}`);

      const result = {
        zones: [],
        landLadders: [],
        landUseCodes: [],
        neighborhoodCodes: [],
        propertyAttributes: [],
        currentUseCodes: [],
        viewAttributes: [],
        waterBodies: [],
        waterBodyLadders: [],
        waterfrontAttributes: [],
        stats: {
          totalRows: data.length,
          sectionsFound: 0,
          zonesCount: 0,
          landLaddersCount: 0,
          landUseCodesCount: 0,
          neighborhoodCodesCount: 0,
          propertyAttributesCount: 0,
          currentUseCodesCount: 0,
          viewAttributesCount: 0,
          waterBodiesCount: 0,
          waterBodyLaddersCount: 0,
          waterfrontAttributesCount: 0,
        },
      };

      // Scan entire spreadsheet for section headers and parse each section
      this.parseSections(data, result);

      // Update stats
      result.stats.zonesCount = result.zones.length;
      result.stats.landLaddersCount = result.landLadders.length;
      result.stats.landUseCodesCount = result.landUseCodes.length;
      result.stats.neighborhoodCodesCount = result.neighborhoodCodes.length;
      result.stats.propertyAttributesCount = result.propertyAttributes.length;
      result.stats.currentUseCodesCount = result.currentUseCodes.length;
      result.stats.viewAttributesCount = result.viewAttributes.length;
      result.stats.waterBodiesCount = result.waterBodies.length;
      result.stats.waterBodyLaddersCount = result.waterBodyLadders.length;
      result.stats.waterfrontAttributesCount = result.waterfrontAttributes.length;

      console.log(`✅ Parsed ${result.stats.zonesCount} zones`);
      console.log(`✅ Parsed ${result.stats.landLaddersCount} land ladder tiers`);
      console.log(`✅ Parsed ${result.stats.landUseCodesCount} land use codes`);
      console.log(`✅ Parsed ${result.stats.neighborhoodCodesCount} neighborhood codes`);
      console.log(`✅ Parsed ${result.stats.propertyAttributesCount} property attributes`);
      console.log(`✅ Parsed ${result.stats.currentUseCodesCount} current use codes`);
      console.log(`✅ Parsed ${result.stats.viewAttributesCount} view attributes`);
      console.log(`✅ Parsed ${result.stats.waterBodiesCount} water bodies`);
      console.log(`✅ Parsed ${result.stats.waterBodyLaddersCount} water body ladder tiers`);
      console.log(`✅ Parsed ${result.stats.waterfrontAttributesCount} waterfront attributes`);

      return result;
    } catch (error) {
      throw new Error(`Failed to parse land codes file: ${error.message}`);
    }
  }

  /**
   * Scan entire spreadsheet for section headers and parse each section
   */
  parseSections(data, result) {
    console.log('   🔍 Scanning spreadsheet for section headers...');

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowText = row.join(' ').toLowerCase();

      // Check for each known section header
      // NOTE: Don't break after finding one - multiple sections can be on the same row!
      for (const [headerKey, config] of Object.entries(this.sectionHeaders)) {
        if (rowText.includes(headerKey)) {
          console.log(`   📍 Row ${i}: Found "${headerKey}" section`);
          result.stats.sectionsFound++;

          // Parse this section based on type
          if (config.type === 'zones') {
            const zonesData = this.parseZonesSection(data, i + 1);
            result.zones.push(...zonesData.zones);
            result.landLadders.push(...zonesData.landLadders);
          } else if (config.type === 'waterBodies') {
            const waterData = this.parseWaterBodiesSection(data, i + 1);
            result.waterBodies.push(...waterData.waterBodies);
            result.waterBodyLadders.push(...waterData.waterBodyLadders);
          } else {
            // Standard code section
            const sectionData = this.parseSectionData(data, i + 1, config);

            // Add parsed data to result based on model type
            if (config.model === 'LandUseDetail') {
              result.landUseCodes.push(...sectionData);
            } else if (config.model === 'NeighborhoodCode') {
              result.neighborhoodCodes.push(...sectionData);
            } else if (config.model === 'PropertyAttribute') {
              result.propertyAttributes.push(...sectionData);
            } else if (config.model === 'CurrentUse') {
              result.currentUseCodes.push(...sectionData);
            } else if (config.model === 'ViewAttribute') {
              result.viewAttributes.push(...sectionData);
            } else if (config.model === 'WaterfrontAttribute') {
              result.waterfrontAttributes.push(...sectionData);
            }
          }

          // Don't break - continue checking for more headers on this row
        }
      }
    }
  }

  /**
   * Parse standard data section (codes with descriptions and factors)
   */
  parseSectionData(data, startRow, config) {
    const parsed = [];
    let foundDataHeader = false;
    let emptyRowCount = 0;

    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      const rowText = row.join(' ').toLowerCase();

      // Stop if we hit another section header
      const hitAnotherSection = Object.keys(this.sectionHeaders).some(headerKey => rowText.includes(headerKey));
      if (hitAnotherSection) {
        console.log(`   📍 Row ${i}: Hit another section, stopping`);
        break;
      }

      // Look for data header row (Code | Description | Factor/Rate)
      if (!foundDataHeader) {
        const hasCodeHeader = rowText.includes('code') && rowText.includes('description');
        if (hasCodeHeader) {
          foundDataHeader = true;
          console.log(`   ✓ Row ${i}: Found data header row`);
          continue;
        }
      }

      // Skip until we find the data header
      if (!foundDataHeader) continue;

      // Determine columns based on data layout
      // Left side: columns [3, 4, 6]
      // Right side: columns [7, 8, 9] or [6, 7, 9]
      const leftCode = row[3] ? row[3].toString().trim() : '';
      const leftDesc = row[4] ? row[4].toString().trim() : '';
      const leftValue = row[6];

      const rightCode = row[6] ? row[6].toString().trim() : (row[7] ? row[7].toString().trim() : '');
      const rightDesc = row[7] ? row[7].toString().trim() : (row[8] ? row[8].toString().trim() : '');
      const rightValue = row[9];

      // Check for empty row on both sides
      if (!leftCode && !leftDesc && !rightCode && !rightDesc) {
        emptyRowCount++;
        if (emptyRowCount >= 2) {
          console.log(`   📍 Row ${i}: Multiple empty rows, ending section`);
          break;
        }
        continue;
      } else {
        emptyRowCount = 0;
      }

      // Skip header rows
      if (leftCode.toLowerCase() === 'code' && leftDesc.toLowerCase() === 'description') continue;
      if (rightCode.toLowerCase() === 'code' && rightDesc.toLowerCase() === 'description') continue;

      // Special handling for pairLeftRight: left column is name, right column is factor
      if (config.pairLeftRight && leftCode && leftCode.toLowerCase() !== 'code') {
        const value = typeof rightValue === 'number' ? rightValue : (rightValue ? parseFloat(rightValue) : null);

        // Skip rows where factor is null/missing (required for these models)
        if (value === null || isNaN(value)) {
          console.log(`   📋 ${config.model} (${config.attributeType}): ${leftCode} → null (skipped - missing factor)`);
          continue;
        }

        const item = {
          code: leftCode, // Save code for matching during property import
          name: leftCode,
          description: leftDesc || leftCode,
          displayText: leftDesc || leftCode,
          factor: value, // ViewAttribute uses 'factor'
        };

        // Set attribute type if applicable
        if (config.attributeType) {
          item.attributeType = config.attributeType;
        }

        parsed.push(item);
        console.log(`   📋 ${config.model} (${config.attributeType}): ${leftCode} → ${value}`);
        continue; // Skip normal left/right parsing
      }

      // Parse left side data if present (unless rightOnly is specified)
      if (!config.rightOnly && leftCode && leftCode.toLowerCase() !== 'code') {
        const value = typeof leftValue === 'number' ? leftValue : (leftValue ? parseFloat(leftValue) : null);

        const item = {
          code: leftCode,
          description: leftDesc || leftCode,
        };

        // ViewAttribute and WaterfrontAttribute use 'name' instead of 'code'
        if (config.model === 'ViewAttribute' || config.model === 'WaterfrontAttribute') {
          item.name = leftCode;
          delete item.code;
        }

        // Set displayText based on config
        if (config.useCodeAsDisplayText) {
          item.displayText = leftCode;
        } else if (config.useDescriptionAsDisplayText) {
          item.displayText = leftDesc || leftCode;
        }

        // Set attribute type if applicable
        if (config.attributeType) {
          item.attributeType = config.attributeType;
        }

        // Add factor/rate/points (unless noFactor is specified)
        if (!config.noFactor && value !== null && !isNaN(value)) {
          if (config.model === 'NeighborhoodCode') {
            item.rate = value;
          } else if (config.model === 'PropertyAttribute') {
            item.rate = value; // PropertyAttribute uses 'rate' not 'factor'
          } else {
            item.factor = value;
          }
        }

        // Handle min/max values for Current Use Codes
        if (config.hasMinMax) {
          const minValue = row[8];
          const maxValue = row[9];
          item.minRate = typeof minValue === 'number' ? minValue : (minValue ? parseFloat(minValue) : null);
          item.maxRate = typeof maxValue === 'number' ? maxValue : (maxValue ? parseFloat(maxValue) : null);
        }

        parsed.push(item);
        console.log(`   📋 ${config.model} (left): ${leftCode}`);
      }

      // Parse right side data if present (unless leftOnly is specified)
      if (!config.leftOnly && rightCode && rightCode.toLowerCase() !== 'code' && rightCode !== leftCode) {
        const value = typeof rightValue === 'number' ? rightValue : (rightValue ? parseFloat(rightValue) : null);

        const item = {
          code: rightCode,
          description: rightDesc || rightCode,
        };

        // ViewAttribute and WaterfrontAttribute use 'name' instead of 'code'
        if (config.model === 'ViewAttribute' || config.model === 'WaterfrontAttribute') {
          item.name = rightCode;
          delete item.code;
        }

        // Set displayText based on config
        if (config.useCodeAsDisplayText) {
          item.displayText = rightCode;
        } else if (config.useDescriptionAsDisplayText) {
          item.displayText = rightDesc || rightCode;
        }

        // Set attribute type if applicable
        if (config.attributeType) {
          item.attributeType = config.attributeType;
        }

        // Add factor/rate/points (unless noFactor is specified)
        if (!config.noFactor && value !== null && !isNaN(value)) {
          if (config.model === 'NeighborhoodCode') {
            item.rate = value;
          } else if (config.model === 'PropertyAttribute') {
            item.rate = value; // PropertyAttribute uses 'rate' not 'factor'
          } else {
            item.factor = value;
          }
        }

        parsed.push(item);
        console.log(`   📋 ${config.model} (right): ${rightCode}`);
      }
    }

    return parsed;
  }

  /**
   * Parse zones section with sub-headers and land ladders
   * Scans entire document for zone sub-headers
   */
  parseZonesSection(data, startRow) {
    const zones = [];
    const landLadders = [];

    // Scan ENTIRE document for zone sub-headers (they can be anywhere)
    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      // Detect zone sub-header: Look for "Zone" followed by zone number/code
      // Can be in various column positions
      let zoneCodeValue = null;
      let zoneColIndex = -1;

      for (let col = 0; col < row.length; col++) {
        if (row[col] && row[col].toString().trim().toLowerCase() === 'zone' && row[col + 1]) {
          zoneCodeValue = row[col + 1].toString().trim();
          zoneColIndex = col;
          break;
        }
      }

      if (zoneCodeValue && zoneColIndex >= 0) {
        const zoneCode = zoneCodeValue;

        console.log(`   🏞️  Found Zone: ${zoneCode}`);

        // Parse zone details from the next rows
        // First 2 columns are labels and values for zone info
        // Columns 3-6 are land ladder data
        let name = '';
        let minimumAcreage = null;
        let minimumFrontage = null;
        let excessLandCostPerAcre = null;
        let excessFrontageCostPerFoot = null;
        let baseViewValue = null;
        const ladderTiers = [];

        // Parse next ~15-20 rows for this zone
        for (let j = i + 1; j < Math.min(i + 25, data.length); j++) {
          const detailRow = data[j];

          // Check if we hit another zone
          let nextZone = false;
          for (let col = 0; col < detailRow.length; col++) {
            if (detailRow[col] && detailRow[col].toString().trim().toLowerCase() === 'zone' && detailRow[col + 1]) {
              nextZone = true;
              break;
            }
          }
          if (nextZone) break;

          // Parse labels and values from columns 4 and 5
          const label = detailRow[4] ? detailRow[4].toString().trim().toLowerCase() : '';
          const value = detailRow[5];

          if (label === 'description' || label === 'description:') {
            name = value ? value.toString().trim() : '';
          } else if (label === 'lot size' || label === 'lot size:') {
            if (value !== null && value !== undefined && value !== '') {
              const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
              minimumAcreage = !isNaN(parsed) ? parsed : null;
            }
          } else if (label === 'frontage' || label === 'frontage:') {
            if (value !== null && value !== undefined && value !== '') {
              const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
              minimumFrontage = !isNaN(parsed) ? parsed : null;
            }
          } else if (label === 'lot price' || label === 'lot price:') {
            // This is the base land value, not used in current system
            // Skip it
          } else if (label.includes('excess acreage')) {
            if (value !== null && value !== undefined && value !== '') {
              const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
              excessLandCostPerAcre = !isNaN(parsed) ? parsed : null;
            }
          } else if (label.includes('excess frontage')) {
            if (value !== null && value !== undefined && value !== '') {
              const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
              excessFrontageCostPerFoot = !isNaN(parsed) ? parsed : null;
            }
          } else if (label === 'view' || label === 'view:') {
            if (value !== null && value !== undefined && value !== '') {
              const parsed = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, ''));
              baseViewValue = !isNaN(parsed) ? parsed : null;
            }
          }

          // Parse land ladder data
          // Look for pattern: landValue @ acreage (e.g., 380000 @ 0.01)
          // Format is typically: [landValue, "", "@", acreage, "ac"]
          // So the @ symbol is the middle marker, with landValue 2 cols before and acreage 1 col after

          for (let col = 2; col < Math.min(detailRow.length - 1, 10); col++) {
            const atSymbol = detailRow[col];

            // Check if this column contains the @ symbol
            if (atSymbol && (atSymbol.toString().trim() === '@' || atSymbol === '@')) {
              // Land value is 2 columns BEFORE the @ (skip empty column)
              const landValueCol = detailRow[col - 2];
              // Acreage is 1 column AFTER the @
              const acreageCol = detailRow[col + 1];

              const landValue = typeof landValueCol === 'number' ? landValueCol : parseFloat(landValueCol);
              const acreage = typeof acreageCol === 'number' ? acreageCol : parseFloat(acreageCol);

              if (!isNaN(landValue) && !isNaN(acreage) && landValue > 0 && acreage > 0) {
                // Check if we already have a tier with this acreage (avoid duplicates)
                const existingTier = ladderTiers.find(t => t.acreage === acreage);
                if (!existingTier) {
                  ladderTiers.push({
                    acreage: acreage,
                    value: landValue,
                  });
                  console.log(`      📊 Ladder tier: ${landValue} @ ${acreage} ac`);
                }
                break; // Only one ladder tier per row
              }
            }
          }
        }

        zones.push({
          name: zoneCode,  // Use zone code as the name (e.g., "01", "02")
          description: name || zoneCode,  // Use parsed name as description (e.g., "RD RES DISTRICT")
          minimumAcreage: minimumAcreage,
          minimumFrontage: minimumFrontage,
          excessLandCostPerAcre: excessLandCostPerAcre,
          excessFrontageCostPerFoot: excessFrontageCostPerFoot,
          baseViewValue: baseViewValue,
        });

        // Add land ladder tiers with order
        ladderTiers.forEach((tier, index) => {
          landLadders.push({
            zoneCode: zoneCode,
            zoneName: name || zoneCode,
            acreage: tier.acreage,
            value: tier.value,
            order: index,
          });
        });

        console.log(`   ✓ Zone ${zoneCode}: ${ladderTiers.length} ladder tiers`);
      }
    }

    return { zones, landLadders };
  }

  /**
   * Parse water bodies section with ladders
   * Scans entire document for water body entries
   */
  parseWaterBodiesSection(data, startRow) {
    const waterBodies = [];
    const waterBodyLadders = [];

    console.log(`   🌊 Starting water body parsing from row ${startRow}`);

    // Find the "Water Body Name" column header
    let waterBodyNameCol = -1;
    let headerRow = -1;

    for (let i = startRow; i < Math.min(startRow + 10, data.length); i++) {
      const row = data[i];
      for (let col = 0; col < row.length; col++) {
        if (row[col] && row[col].toString().trim().toLowerCase().includes('water body name')) {
          waterBodyNameCol = col;
          headerRow = i;
          console.log(`   🔍 Found "Water Body Name" column header at row ${i}, col ${col}`);
          break;
        }
      }
      if (waterBodyNameCol >= 0) break;
    }

    if (waterBodyNameCol < 0) {
      console.log(`   ❌ Could not find "Water Body Name" column header`);
      return { waterBodies, waterBodyLadders };
    }

    // First pass: find all water body name rows
    const waterBodyRows = [];

    // Track where the Water Frontage Access section starts
    let waterAccessRow = -1;
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      const rowText = row.join(' ').toLowerCase();

      // Find the "Water Frontage Access" header row
      if (rowText.includes('water frontage access')) {
        waterAccessRow = i;
        break;
      }
    }

    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];

      // Stop at Water Frontage Access section
      if (waterAccessRow !== -1 && i >= waterAccessRow) {
        break;
      }

      const waterBodyName = row[waterBodyNameCol] ? row[waterBodyNameCol].toString().trim() : '';

      // Skip empty names or header-like text
      if (!waterBodyName || waterBodyName.toLowerCase().includes('water body') || waterBodyName.toLowerCase() === 'code') {
        continue;
      }

      waterBodyRows.push({ name: waterBodyName, row: i });
      console.log(`   🔍 Found water body "${waterBodyName}" at row ${i}`);
    }

    // Second pass: for each water body, parse its ladders
    for (let idx = 0; idx < waterBodyRows.length; idx++) {
      const waterBody = waterBodyRows[idx];
      const nextWaterBody = waterBodyRows[idx + 1];

      console.log(`   🌊 Parsing Water Body: ${waterBody.name}`);

      // Determine water body type from name
      let waterBodyType = 'other'; // default
      const nameUpper = waterBody.name.toUpperCase();
      if (nameUpper.includes('OCEAN')) {
        waterBodyType = 'ocean';
      } else if (nameUpper.includes('BAY')) {
        waterBodyType = 'bay';
      } else if (nameUpper.includes('RIVER')) {
        waterBodyType = 'river';
      } else if (nameUpper.includes('LAKE')) {
        waterBodyType = 'lake';
      } else if (nameUpper.includes('POND')) {
        waterBodyType = 'pond';
      } else if (nameUpper.includes('STREAM')) {
        waterBodyType = 'stream';
      } else if (nameUpper.includes('HARBOR')) {
        waterBodyType = 'bay'; // Harbor is similar to a bay
      }

      waterBodies.push({
        name: waterBody.name,
        description: waterBody.name,
        baseWaterValue: null,
        waterBodyType: waterBodyType,
      });

      // Ladders start 1 row below the water body name
      const ladderStartRow = waterBody.row + 1;
      // Ladders end 1 row before the next water body (or end of data)
      const ladderEndRow = nextWaterBody ? nextWaterBody.row - 1 : data.length;

      let tierOrder = 0;
      for (let i = ladderStartRow; i <= ladderEndRow; i++) {
        if (i >= data.length) break;

        const row = data[i];

        // Look for pattern: number, "ft.", number (frontage, "ft.", factor)
        // Frontage is in col 8, "ft." in col 9, factor in col 10
        for (let col = 0; col < row.length - 2; col++) {
          const frontage = row[col];
          const units = row[col + 1];
          const factor = row[col + 2];

          // Check for the pattern: number, "ft.", number
          if (typeof frontage === 'number' && frontage > 0 &&
              units && units.toString().toLowerCase().includes('ft') &&
              typeof factor === 'number' && factor > 0) {
            waterBodyLadders.push({
              waterBodyName: waterBody.name,
              frontage: frontage,
              factor: factor,  // Use 'factor' field name (matches WaterBodyLadder model)
              order: tierOrder++,
            });
            console.log(`      📊 Ladder tier ${tierOrder}: ${frontage} ft → factor ${factor}`);
            col += 2; // Skip the "ft." and factor columns since we just processed them
          }
        }
      }

      console.log(`   ✓ Water Body ${waterBody.name}: ${tierOrder} ladder tiers`);
    }

    return { waterBodies, waterBodyLadders };
  }
}

module.exports = new LandCodesImportService();
