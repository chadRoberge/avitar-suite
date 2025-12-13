const XLSX = require('xlsx');

/**
 * Building Codes Import Service
 * Phase 1 of municipal data import - parses building codes from Excel files
 *
 * Detects section headers and extracts codes dynamically to support
 * different municipalities with varying numbers of codes.
 */
class BuildingCodesImportService {
  constructor() {
    // Define exact section headers and their mappings
    // columnSide: 'left' uses columns 0-4, 'right' uses columns 5-7
    this.sectionHeaders = {
      'building base rate codes': {
        model: 'BuildingCode',
        saveDescriptionAsDisplayText: true,
        columnSide: 'left',
      },
      'building quality adjustments': {
        model: 'BuildingFeatureCode',
        featureType: 'quality',
        useCodeAsDisplayText: true,
        columnSide: 'left',
      },
      'building roof structures': {
        model: 'BuildingFeatureCode',
        featureType: 'roof_style',
        useDescriptionAsDisplayText: true,
        columnSide: 'left',
      },
      'building exterior wall materials': {
        model: 'BuildingFeatureCode',
        featureType: 'exterior_wall',
        useDescriptionAsDisplayText: true,
        columnSide: 'left',
      },
      'building interior wall materials': {
        model: 'BuildingFeatureCode',
        featureType: 'interior_wall',
        useDescriptionAsDisplayText: true,
        columnSide: 'left',
      },
      'building heating fuel types': {
        model: 'BuildingFeatureCode',
        featureType: 'heating_fuel',
        useDescriptionAsDisplayText: true,
        columnSide: 'left',
      },
      'building sub area codes': {
        model: 'SketchSubAreaFactor',
        useSAAsDisplayText: true,
        checkLivingSpace: true,
        columnSide: 'right',
      },
      'building story codes': {
        model: 'BuildingFeatureCode',
        featureType: 'story_height',
        useDescriptionAsDisplayText: true,
        columnSide: 'right',
      },
      'building roof materials': {
        model: 'BuildingFeatureCode',
        featureType: 'roofing',
        useDescriptionAsDisplayText: true,
        columnSide: 'left',
      },
      'building frame materials': {
        model: 'BuildingFeatureCode',
        featureType: 'frame',
        useDescriptionAsDisplayText: true,
        columnSide: 'left',
      },
      'building interior floor materials': {
        model: 'BuildingFeatureCode',
        featureType: 'flooring',
        useDescriptionAsDisplayText: true,
        columnSide: 'left',
      },
      'building heating system types': {
        model: 'BuildingFeatureCode',
        featureType: 'heating_type',
        useDescriptionAsDisplayText: true,
        columnSide: 'left',
      },
      'building accessories': {
        model: 'BuildingMiscellaneousPoints',
        columnSide: 'left',
      },
    };
  }

  /**
   * Parse building codes Excel file
   * @param {Buffer} fileBuffer - Excel file buffer
   * @returns {Object} Parsed codes organized by type
   */
  parseBuildingCodesFile(fileBuffer) {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0]; // Use first sheet
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
      });

      console.log(`📋 Parsing building codes from sheet: ${sheetName}`);
      console.log(`   Total rows: ${data.length}`);

      const result = {
        buildingCodes: [],
        buildingFeatureCodes: [],
        sketchSubAreaFactors: [],
        miscellaneousPoints: null,
        stats: {
          totalRows: data.length,
          sectionsFound: 0,
          buildingCodesCount: 0,
          featureCodesCount: 0,
          subAreaFactorsCount: 0,
          featureCodesByType: {},
        },
      };

      // Scan entire spreadsheet for section headers and parse each section
      this.parseSections(data, result);

      // Parse building accessories (end of document)
      const accessoriesData = this.parseBuildingAccessories(data);
      result.miscellaneousPoints = accessoriesData;

      // Update stats
      result.stats.buildingCodesCount = result.buildingCodes.length;
      result.stats.featureCodesCount = result.buildingFeatureCodes.length;
      result.stats.subAreaFactorsCount = result.sketchSubAreaFactors.length;

      // Count feature codes by type
      const featureTypeCount = {};
      result.buildingFeatureCodes.forEach((fc) => {
        featureTypeCount[fc.featureType] =
          (featureTypeCount[fc.featureType] || 0) + 1;
      });
      result.stats.featureCodesByType = featureTypeCount;

      console.log(
        `✅ Parsed ${result.stats.buildingCodesCount} building codes`,
      );
      console.log(
        `✅ Parsed ${result.stats.featureCodesCount} building feature codes`,
      );
      console.log('   Feature codes breakdown by type:');
      for (const [type, count] of Object.entries(
        result.stats.featureCodesByType,
      )) {
        console.log(`      - ${type}: ${count} codes`);
      }
      console.log(
        `✅ Parsed ${result.stats.subAreaFactorsCount} sketch sub-area factors`,
      );
      if (result.miscellaneousPoints) {
        console.log(
          `✅ Parsed building accessories: AC=${result.miscellaneousPoints.airConditioningPoints}, Kitchen=${result.miscellaneousPoints.extraKitchenPoints}, Fireplace=${result.miscellaneousPoints.fireplacePoints}, Generator=${result.miscellaneousPoints.generatorPoints}`,
        );
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to parse building codes file: ${error.message}`);
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

      // Check for ALL matching section headers on this row (handles side-by-side sections)
      const matchedSections = [];
      for (const [headerKey, config] of Object.entries(this.sectionHeaders)) {
        if (rowText.includes(headerKey)) {
          matchedSections.push({ headerKey, config });
        }
      }

      // Process all matched sections
      for (const { headerKey, config } of matchedSections) {
        console.log(`   📍 Row ${i}: Found "${headerKey}" section`);
        result.stats.sectionsFound++;

        // Parse this section starting from next row
        const sectionData = this.parseSectionData(data, i + 1, config);

        // Add parsed data to result based on model type
        if (config.model === 'BuildingCode') {
          result.buildingCodes.push(...sectionData);
        } else if (config.model === 'BuildingFeatureCode') {
          result.buildingFeatureCodes.push(...sectionData);
        } else if (config.model === 'SketchSubAreaFactor') {
          result.sketchSubAreaFactors.push(...sectionData);
        }
      }
    }
  }

  /**
   * Parse data from a specific section starting at the given row
   * Continues until hitting another section header or empty rows
   */
  parseSectionData(data, startRow, config) {
    const parsed = [];
    let foundDataHeader = false;
    let emptyRowCount = 0;

    for (let i = startRow; i < data.length; i++) {
      const row = data[i];
      const rowText = row.join(' ').toLowerCase();

      // Stop if we hit another section header
      const hitAnotherSection = Object.keys(this.sectionHeaders).some(
        (headerKey) =>
          rowText.includes(headerKey) &&
          !rowText.includes(
            Object.keys(this.sectionHeaders).find(
              (k) => config === this.sectionHeaders[k],
            ),
          ),
      );
      if (hitAnotherSection) {
        console.log(`   📍 Row ${i}: Hit another section, stopping`);
        break;
      }

      // Look for data header row (Code | Description | ... or SA | Description | ...)
      if (!foundDataHeader) {
        const hasCodeHeader =
          rowText.includes('code') && rowText.includes('description');
        const hasSAHeader =
          rowText.includes('sa') && rowText.includes('description');

        if (hasCodeHeader || hasSAHeader) {
          foundDataHeader = true;
          console.log(`   ✓ Row ${i}: Found data header row`);
          continue;
        }
      }

      // Skip until we find the data header
      if (!foundDataHeader) continue;

      // Determine which columns to use based on section configuration
      let codeCol, descCol, valueCol;

      // Use explicit columnSide from config to prevent reading wrong columns
      // when sections are side-by-side in the same rows
      if (config.columnSide === 'right') {
        codeCol = 5;
        descCol = 6;
        valueCol = 7;
      } else {
        // Default to left side (columns 0-4)
        codeCol = 0;
        descCol = 1;
        valueCol = 4;
      }

      const code = row[codeCol] ? row[codeCol].toString().trim() : '';
      const description = row[descCol] ? row[descCol].toString().trim() : '';
      const value = row[valueCol];

      // Check for empty row
      if (!code && !description) {
        emptyRowCount++;
        if (emptyRowCount >= 2) {
          console.log(`   📍 Row ${i}: Multiple empty rows, ending section`);
          break;
        }
        continue;
      } else {
        emptyRowCount = 0; // Reset counter
      }

      // Skip header-like rows
      if (code.toLowerCase() === 'code' || code.toLowerCase() === 'sa')
        continue;

      // Parse the data row based on model type
      if (code) {
        const numericValue =
          typeof value === 'number' ? value : value ? parseFloat(value) : null;

        if (config.model === 'BuildingCode') {
          // Building Base Rate Codes
          const codeUpper = code.toUpperCase();
          let buildingType = 'residential'; // default
          let sizeAdjustmentCategory = 'residential';

          if (codeUpper.startsWith('C')) {
            buildingType = 'commercial';
            sizeAdjustmentCategory = 'commercial';
          } else if (codeUpper.startsWith('E')) {
            buildingType = 'exempt';
            sizeAdjustmentCategory = 'exempt';
          } else if (codeUpper.startsWith('R')) {
            buildingType = 'residential';
            sizeAdjustmentCategory = 'residential';
          } else if (codeUpper.startsWith('M')) {
            buildingType = 'manufactured';
            sizeAdjustmentCategory = 'manufactured';
          } else if (codeUpper.startsWith('U')) {
            buildingType = 'utility';
            sizeAdjustmentCategory = 'utility';
          }

          const depreciation = row[3]
            ? typeof row[3] === 'number'
              ? row[3]
              : parseFloat(row[3])
            : 1.0;

          parsed.push({
            code: code,
            description: config.saveDescriptionAsDisplayText
              ? description
              : description || code,
            displayText: config.saveDescriptionAsDisplayText
              ? description
              : code,
            depreciation: depreciation || 1.0,
            rate: numericValue || 0,
            buildingType: buildingType,
            sizeAdjustmentCategory: sizeAdjustmentCategory,
          });

          console.log(
            `   📋 Building code: ${code} → ${buildingType}, rate: ${numericValue}`,
          );
        } else if (config.model === 'BuildingFeatureCode') {
          // Building Feature Codes
          let displayText = code;
          let desc = description || code;

          if (config.useCodeAsDisplayText) {
            displayText = code;
          } else if (config.useDescriptionAsDisplayText) {
            displayText = description;
            desc = description;
          }

          parsed.push({
            code: code, // Save original code for matching during property import
            displayText: displayText,
            description: desc,
            featureType: config.featureType,
            points: numericValue || 1.0,
          });

          console.log(
            `   📋 Feature code (${config.featureType}): code=${code}, displayText=${displayText}, points: ${numericValue}`,
          );
        } else if (config.model === 'SketchSubAreaFactor') {
          // Sub Area Factors
          let displayText = code;

          if (config.useSAAsDisplayText) {
            displayText = code; // SA code
          }

          // Check for living space
          let isLivingSpace = false;
          if (config.checkLivingSpace) {
            const descUpper = description.toUpperCase();
            // Check for " FIN" or " FINISHED" (with space before)
            isLivingSpace =
              descUpper.includes(' FIN') || descUpper.includes(' FINISHED');
          }

          parsed.push({
            displayText: displayText,
            description: description || code,
            points: numericValue || 1.0,
            livingSpace: isLivingSpace,
          });

          console.log(
            `   📐 Sub-area factor: ${displayText}, living space: ${isLivingSpace}, factor: ${numericValue}`,
          );
        }
      }
    }

    return parsed;
  }

  /**
   * Parse building accessories section at the end of the document
   * Looks for Generator, Extra Kitchen, Air Conditioning points
   */
  parseBuildingAccessories(data) {
    const accessories = {
      airConditioningPoints: 0,
      extraKitchenPoints: 0,
      fireplacePoints: 0,
      generatorPoints: 0,
    };

    // Look for "Building Accessories" section header
    // Usually appears near the end of the document
    let accessoriesStartRow = -1;

    for (let i = Math.max(0, data.length - 50); i < data.length; i++) {
      const row = data[i];
      const rowText = row.join(' ').toLowerCase();

      if (
        rowText.includes('building accessories') ||
        rowText.includes('building accessory') ||
        rowText.includes('accessories')
      ) {
        accessoriesStartRow = i;
        console.log(`   Found Building Accessories section at row ${i}`);
        break;
      }
    }

    if (accessoriesStartRow === -1) {
      console.log('   No Building Accessories section found');
      return null;
    }

    // Parse the next ~20 rows after the header for accessory items
    for (
      let i = accessoriesStartRow + 1;
      i < Math.min(accessoriesStartRow + 20, data.length);
      i++
    ) {
      const row = data[i];

      // Look for description in first few columns
      const description = row.slice(0, 3).join(' ').toLowerCase();

      // Look for points value in columns (usually in last columns)
      let points = null;
      for (let col = 0; col < row.length; col++) {
        const value = row[col];
        if (typeof value === 'number' && value !== 0) {
          points = value;
          break;
        } else if (value && !isNaN(parseFloat(value))) {
          points = parseFloat(value);
          break;
        }
      }

      if (points !== null) {
        // Match against known accessory types
        if (
          description.includes('air') &&
          (description.includes('condition') || description.includes('ac'))
        ) {
          accessories.airConditioningPoints = points;
          console.log(`   Found Air Conditioning: ${points} points`);
        } else if (
          description.includes('kitchen') &&
          description.includes('extra')
        ) {
          accessories.extraKitchenPoints = points;
          console.log(`   Found Extra Kitchen: ${points} points`);
        } else if (
          description.includes('fireplace') ||
          description.includes('fire place')
        ) {
          accessories.fireplacePoints = points;
          console.log(`   Found Fireplace: ${points} points`);
        } else if (
          description.includes('generator') ||
          description.includes('gen')
        ) {
          accessories.generatorPoints = points;
          console.log(`   Found Generator: ${points} points`);
        }
      }
    }

    return accessories;
  }
}

module.exports = new BuildingCodesImportService();
