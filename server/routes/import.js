const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');

// Debug flag - set to false for production imports to improve performance
const DEBUG_IMPORT = process.env.DEBUG_IMPORT === 'true' || false;
const camaImportService = require('../services/camaImportService');
const buildingCodesImportService = require('../services/buildingCodesImportService');
const BuildingCode = require('../models/BuildingCode');
const Zone = require('../models/Zone');
const NeighborhoodCode = require('../models/NeighborhoodCode');
const BuildingFeatureCode = require('../models/BuildingFeatureCode');
const SaleQualityCode = require('../models/SaleQualityCode');
const Municipality = require('../models/Municipality');
const PropertyTreeNode = require('../models/PropertyTreeNode');
const BuildingAssessment = require('../models/BuildingAssessment');
const LandAssessment = require('../models/LandAssessment');
const PropertyFeature = require('../models/PropertyFeature');
const PropertyNotes = require('../models/PropertyNotes');
const ParcelAssessment = require('../models/ParcelAssessment');
const SalesHistory = require('../models/SalesHistory');
const { updateParcelAssessment } = require('../utils/assessment');
const LandAssessmentCalculationService = require('../services/landAssessmentCalculationService');
const mongoose = require('mongoose');
const importProgress = require('../utils/importProgress');

// Load all models to ensure they're available for cleanup
// This ensures mongoose.models contains all models, not just the ones explicitly imported above
const modelsDir = path.join(__dirname, '../models');
fs.readdirSync(modelsDir).forEach((file) => {
  if (file.endsWith('.js')) {
    try {
      require(path.join(modelsDir, file));
    } catch (error) {
      console.warn(`Could not load model ${file}:`, error.message);
    }
  }
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

/**
 * POST /api/municipalities/:municipalityId/import/parse
 * Parse uploaded Excel file and return headers/preview
 */
router.post(
  '/municipalities/:municipalityId/import/parse',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { systemKey } = req.body;

      // Debug logging
      console.log('📥 Parse request received:');
      console.log('  - req.file:', req.file ? 'Present' : 'Missing');
      console.log('  - req.body:', req.body);
      console.log('  - systemKey:', systemKey);

      if (!req.file) {
        console.log('❌ Error: No file uploaded');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      if (!systemKey) {
        console.log('❌ Error: CAMA system selection required');
        return res
          .status(400)
          .json({ error: 'CAMA system selection required' });
      }

      console.log(`Parsing Excel file for ${systemKey} import`);

      // Parse the Excel file
      const parsedData = camaImportService.parseExcelFile(req.file.buffer);

      // Get template for this CAMA system
      const template = camaImportService.getTemplate(systemKey);

      res.json({
        success: true,
        sheetNames: parsedData.sheetNames,
        sheets: parsedData.sheets,
        template: template,
        systemKey: systemKey,
      });
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      res.status(500).json({
        error: 'Failed to parse Excel file',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/import/validate-reference
 * Validate Phase 1 reference data
 */
router.post(
  '/municipalities/:municipalityId/import/validate-reference',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { parsedData, systemKey } = req.body;

      console.log(`Validating reference data for ${systemKey}`);

      const template = camaImportService.getTemplate(systemKey);
      const errors = [];
      const warnings = [];

      // Extract reference data from parsed sheets based on template
      const extractedData = {
        buildingCodes: [],
        zones: [],
        neighborhoods: [],
        featureCodes: [],
        qualityCodes: [],
        storyHeights: [],
        saleQualityCodes: [],
      };

      // For Avitar Desktop: Extract unique values from the main sheet
      // Use the first sheet, whatever it's named
      if (systemKey === 'avitar-desktop' && parsedData.sheets) {
        const sheetName =
          parsedData.sheetNames?.[0] || Object.keys(parsedData.sheets)[0];
        const sheetData = parsedData.sheets[sheetName]?.data;

        if (!sheetData || sheetData.length === 0) {
          console.log(`❌ No data found in sheet: ${sheetName}`);
        } else {
          console.log(`📊 Sheet "${sheetName}" has ${sheetData.length} rows`);
          console.log(`📋 First row columns:`, Object.keys(sheetData[0] || {}));

          // Extract unique building codes (BaseRateCode + BaseRateAmt)
          const buildingCodeMap = new Map();
          sheetData.forEach((row) => {
            if (row.BaseRateCode && row.BaseRateAmt) {
              buildingCodeMap.set(row.BaseRateCode, {
                code: row.BaseRateCode,
                rate: row.BaseRateAmt,
              });
            }
          });
          extractedData.buildingCodes = Array.from(buildingCodeMap.values());
          console.log(
            `🏗️  Extracted ${extractedData.buildingCodes.length} building codes`,
          );

          // Extract unique zones
          const zoneSet = new Set();
          sheetData.forEach((row) => {
            if (row.Zone) {
              zoneSet.add(row.Zone);
            }
          });
          extractedData.zones = Array.from(zoneSet).map((code) => ({
            code,
            name: code,
          }));
          console.log(`🗺️  Extracted ${extractedData.zones.length} zones`);

          // Extract unique neighborhoods
          const neighSet = new Set();
          sheetData.forEach((row) => {
            if (row.NeighCode) {
              neighSet.add(row.NeighCode);
            }
          });
          extractedData.neighborhoods = Array.from(neighSet).map((code) => ({
            code,
            name: code,
          }));
          console.log(
            `🏘️  Extracted ${extractedData.neighborhoods.length} neighborhoods`,
          );

          // Extract unique quality codes (QualCode + QualFactor)
          const qualityCodeMap = new Map();
          sheetData.forEach((row) => {
            if (row.QualCode) {
              qualityCodeMap.set(row.QualCode, {
                code: row.QualCode,
                factor: row.QualFactor || 1.0,
                description: `Quality Grade ${row.QualCode}`,
              });
            }
          });
          extractedData.qualityCodes = Array.from(qualityCodeMap.values());
          console.log(
            `⭐ Extracted ${extractedData.qualityCodes.length} quality codes`,
          );

          // Extract unique story heights (StoryHeight + StoryHghtFct)
          const storyHeightMap = new Map();
          sheetData.forEach((row) => {
            if (row.StoryHeight) {
              storyHeightMap.set(row.StoryHeight, {
                stories: row.StoryHeight,
                factor: row.StoryHghtFct || 1.0,
                description: `${row.StoryHeight} Story`,
              });
            }
          });
          extractedData.storyHeights = Array.from(storyHeightMap.values());
          console.log(
            `📏 Extracted ${extractedData.storyHeights.length} story heights`,
          );

          // Extract unique sale quality codes (SaleQualCode)
          const saleQualSet = new Set();
          sheetData.forEach((row) => {
            if (row.SaleQualCode) {
              const code = parseInt(row.SaleQualCode);
              if (!isNaN(code)) {
                saleQualSet.add(code);
              }
            }
          });
          extractedData.saleQualityCodes = Array.from(saleQualSet).map(
            (code) => ({
              code: code,
              description: `Sale Quality ${code}`,
              displayText: `Quality ${code}`,
            }),
          );
          console.log(
            `💰 Extracted ${extractedData.saleQualityCodes.length} sale quality codes`,
          );
        }
      } else {
        console.log(`❌ No data found or systemKey mismatch`);
        console.log(`   - systemKey: ${systemKey}`);
        console.log(
          `   - parsedData.sheets:`,
          parsedData.sheets ? Object.keys(parsedData.sheets) : 'undefined',
        );
      }

      // Use extracted data for validation
      const dataToValidate = {
        buildingCodes:
          extractedData.buildingCodes.length > 0
            ? extractedData.buildingCodes
            : parsedData.buildingCodes,
        zones:
          extractedData.zones.length > 0
            ? extractedData.zones
            : parsedData.zones,
        neighborhoods:
          extractedData.neighborhoods.length > 0
            ? extractedData.neighborhoods
            : parsedData.neighborhoods,
        featureCodes:
          extractedData.featureCodes.length > 0
            ? extractedData.featureCodes
            : parsedData.featureCodes,
        qualityCodes:
          extractedData.qualityCodes.length > 0
            ? extractedData.qualityCodes
            : parsedData.qualityCodes,
        storyHeights:
          extractedData.storyHeights.length > 0
            ? extractedData.storyHeights
            : parsedData.storyHeights,
        saleQualityCodes:
          extractedData.saleQualityCodes.length > 0
            ? extractedData.saleQualityCodes
            : parsedData.saleQualityCodes,
      };

      // Validate building codes
      if (dataToValidate.buildingCodes) {
        dataToValidate.buildingCodes.forEach((row, index) => {
          if (!row.code) {
            errors.push({
              sheet: 'Building Codes',
              row: index + 2,
              field: 'code',
              message: 'Building code is required',
            });
          }
          if (!row.rate || row.rate <= 0) {
            warnings.push({
              sheet: 'Building Codes',
              row: index + 2,
              field: 'rate',
              message: 'Rate value may be missing or invalid',
            });
          }
        });
      }

      // Validate zones
      if (dataToValidate.zones) {
        dataToValidate.zones.forEach((row, index) => {
          if (!row.code && !row.name) {
            errors.push({
              sheet: 'Zones',
              row: index + 2,
              field: 'code',
              message: 'Zone code or name is required',
            });
          }
        });
      }

      // Validate neighborhoods
      if (dataToValidate.neighborhoods) {
        dataToValidate.neighborhoods.forEach((row, index) => {
          if (!row.code) {
            errors.push({
              sheet: 'Neighborhoods',
              row: index + 2,
              field: 'code',
              message: 'Neighborhood code is required',
            });
          }
        });
      }

      // Validate quality codes
      if (dataToValidate.qualityCodes) {
        dataToValidate.qualityCodes.forEach((row, index) => {
          if (!row.code) {
            errors.push({
              sheet: 'Quality Codes',
              row: index + 2,
              field: 'code',
              message: 'Quality code is required',
            });
          }
          if (!row.factor || row.factor <= 0) {
            warnings.push({
              sheet: 'Quality Codes',
              row: index + 2,
              field: 'factor',
              message: 'Quality factor may be missing or invalid',
            });
          }
        });
      }

      // Validate story heights
      if (dataToValidate.storyHeights) {
        dataToValidate.storyHeights.forEach((row, index) => {
          if (!row.stories || row.stories <= 0) {
            errors.push({
              sheet: 'Story Heights',
              row: index + 2,
              field: 'stories',
              message: 'Story height is required',
            });
          }
          if (!row.factor || row.factor <= 0) {
            warnings.push({
              sheet: 'Story Heights',
              row: index + 2,
              field: 'factor',
              message: 'Story height factor may be missing or invalid',
            });
          }
        });
      }

      // Validate sale quality codes
      if (dataToValidate.saleQualityCodes) {
        dataToValidate.saleQualityCodes.forEach((row, index) => {
          if (!row.code) {
            errors.push({
              sheet: 'Sale Quality Codes',
              row: index + 2,
              field: 'code',
              message: 'Sale quality code is required',
            });
          }
        });
      }

      res.json({
        isValid: errors.length === 0,
        errors,
        warnings,
        buildingCodes: dataToValidate.buildingCodes?.length || 0,
        zones: dataToValidate.zones?.length || 0,
        neighborhoods: dataToValidate.neighborhoods?.length || 0,
        featureCodes: dataToValidate.featureCodes?.length || 0,
        qualityCodes: dataToValidate.qualityCodes?.length || 0,
        storyHeights: dataToValidate.storyHeights?.length || 0,
        saleQualityCodes: dataToValidate.saleQualityCodes?.length || 0,
      });
    } catch (error) {
      console.error('Error validating reference data:', error);
      res.status(500).json({
        error: 'Failed to validate reference data',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/import/execute-reference
 * Execute Phase 1 reference data import with transaction
 */
router.post(
  '/municipalities/:municipalityId/import/execute-reference',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { parsedData, systemKey } = req.body;

      console.log(`Executing reference data import for ${systemKey}`);

      const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);

      // Get municipality to find state
      const municipality = await Municipality.findById(municipalityObjectId);
      if (!municipality) {
        throw new Error('Municipality not found');
      }
      const stateId = municipality.state || 'NH'; // Default to NH if not set

      // Note: Municipality data cleanup is now done in the land codes import (first step)
      // This ensures all old data is removed before any imports begin

      // Start transaction for the import
      const session = await mongoose.startSession();
      session.startTransaction();

      const results = {
        buildingCodes: 0,
        zones: 0,
        neighborhoods: 0,
        featureCodes: 0,
        saleQualityCodes: 0,
      };

      // Extract reference data from parsed sheets for Avitar Desktop
      const extractedData = {
        buildingCodes: [],
        zones: [],
        neighborhoods: [],
        saleQualityCodes: [],
      };

      if (systemKey === 'avitar-desktop' && parsedData.sheets) {
        const sheetName =
          parsedData.sheetNames?.[0] || Object.keys(parsedData.sheets)[0];
        const sheetData = parsedData.sheets[sheetName]?.data;

        if (!sheetData || sheetData.length === 0) {
          throw new Error(`No data found in sheet: ${sheetName}`);
        }

        // Extract unique building codes (BaseRateCode + BaseRateAmt)
        const buildingCodeMap = new Map();
        sheetData.forEach((row) => {
          if (row.BaseRateCode && row.BaseRateAmt) {
            buildingCodeMap.set(row.BaseRateCode, {
              code: row.BaseRateCode,
              description: `Building Type ${row.BaseRateCode}`,
              rate: row.BaseRateAmt,
            });
          }
        });
        extractedData.buildingCodes = Array.from(buildingCodeMap.values());

        // Extract unique zones
        const zoneSet = new Set();
        sheetData.forEach((row) => {
          if (row.Zone) {
            zoneSet.add(row.Zone);
          }
        });
        extractedData.zones = Array.from(zoneSet).map((code) => ({
          code,
          name: code,
          description: `Zone ${code}`,
        }));

        // Extract unique neighborhoods
        const neighSet = new Set();
        sheetData.forEach((row) => {
          if (row.NeighCode) {
            neighSet.add(row.NeighCode);
          }
        });

        // Helper function to calculate neighborhood rate based on code
        // A=60, B=70, C=80, D=90, E=100, ... Z=310
        const calculateNeighborhoodRate = (code) => {
          // Extract last letter from code (handles codes like "N-G", "N-A", "B1", etc.)
          // N-G means Neighborhood Grade G, so G is the actual rate code
          const letters = code.toString().toUpperCase().match(/[A-Z]/g);
          if (letters && letters.length > 0) {
            const lastLetter = letters[letters.length - 1]; // Get the last letter
            const letterIndex = lastLetter.charCodeAt(0) - 'A'.charCodeAt(0); // A=0, B=1, C=2, etc.
            return 60 + letterIndex * 10; // A=60, B=70, C=80, etc.
          }
          return 100; // Default to E (100) if no letter found
        };

        extractedData.neighborhoods = Array.from(neighSet).map((code) => ({
          code,
          name: code,
          description: `Neighborhood ${code}`,
          rate: calculateNeighborhoodRate(code),
        }));

        // Extract unique sale quality codes
        const saleQualSet = new Set();
        sheetData.forEach((row) => {
          if (row.SaleQualCode) {
            const code = parseInt(row.SaleQualCode);
            if (!isNaN(code)) {
              saleQualSet.add(code);
            }
          }
        });
        extractedData.saleQualityCodes = Array.from(saleQualSet).map(
          (code) => ({
            code: code,
            description: `Sale Quality ${code}`,
            displayText: `Quality ${code}`,
          }),
        );

        console.log(
          `📦 Extracted for import: ${extractedData.buildingCodes.length} building codes, ${extractedData.zones.length} zones, ${extractedData.neighborhoods.length} neighborhoods, ${extractedData.saleQualityCodes.length} sale quality codes`,
        );
      }

      // Import building codes
      if (
        extractedData.buildingCodes &&
        extractedData.buildingCodes.length > 0
      ) {
        for (const codeData of extractedData.buildingCodes) {
          // Check if this code already exists
          const existing = await BuildingCode.findOne({
            municipalityId: municipalityObjectId,
            code: codeData.code,
          });

          if (!existing) {
            await BuildingCode.create(
              [
                {
                  municipalityId: municipalityObjectId,
                  code: codeData.code,
                  description: codeData.description,
                  rate: parseFloat(codeData.rate),
                  depreciation: parseFloat(codeData.depreciation || 0),
                  buildingType: codeData.buildingType || 'residential',
                  sizeAdjustmentCategory:
                    codeData.sizeAdjustmentCategory || 'residential',
                  isActive: true,
                },
              ],
              { session },
            );
            results.buildingCodes++;
          }
        }
      }

      // Import zones
      if (extractedData.zones && extractedData.zones.length > 0) {
        for (const zoneData of extractedData.zones) {
          await Zone.create(
            [
              {
                municipalityId: municipalityObjectId,
                name: zoneData.name,
                description: zoneData.description || '',
                minimumAcreage: parseFloat(zoneData.minimumAcreage || 0),
                minimumFrontage: parseFloat(zoneData.minimumFrontage || 0),
                isActive: true,
              },
            ],
            { session },
          );
          results.zones++;
        }
      }

      // Import neighborhoods
      if (
        extractedData.neighborhoods &&
        extractedData.neighborhoods.length > 0
      ) {
        for (const nbhdData of extractedData.neighborhoods) {
          await NeighborhoodCode.create(
            [
              {
                municipalityId: municipalityObjectId,
                code: nbhdData.code,
                name: nbhdData.name || nbhdData.code,
                description: nbhdData.description || '',
                rate: nbhdData.rate,
                isActive: true,
              },
            ],
            { session },
          );
          results.neighborhoods++;
        }
      }

      // Import feature codes (for non-Avitar Desktop systems)
      if (parsedData.featureCodes && parsedData.featureCodes.length > 0) {
        for (const featureData of parsedData.featureCodes) {
          await BuildingFeatureCode.create(
            [
              {
                municipalityId: municipalityObjectId,
                featureType: featureData.featureType,
                displayText: featureData.displayText,
                points: parseInt(featureData.points || 0),
                factor: parseFloat(featureData.factor || 0),
                isActive: true,
              },
            ],
            { session },
          );
          results.featureCodes++;
        }
      }

      // Import sale quality codes (state-specific, skip if already exists)
      let saleQualityCodesSkipped = 0;
      if (
        extractedData.saleQualityCodes &&
        extractedData.saleQualityCodes.length > 0
      ) {
        for (const saleQualData of extractedData.saleQualityCodes) {
          // Check if this code already exists for this state
          const existing = await SaleQualityCode.findOne({
            stateId: stateId,
            code: saleQualData.code,
          });

          if (!existing) {
            await SaleQualityCode.create(
              [
                {
                  code: saleQualData.code,
                  description: saleQualData.description,
                  displayText: saleQualData.displayText,
                  stateId: stateId,
                  isActive: true,
                },
              ],
              { session },
            );
            results.saleQualityCodes++;
          } else {
            saleQualityCodesSkipped++;
          }
        }
      }

      if (saleQualityCodesSkipped > 0) {
        console.log(
          `ℹ️  Skipped ${saleQualityCodesSkipped} sale quality codes (already exist for state ${stateId})`,
        );
      }

      await session.commitTransaction();
      session.endSession();

      const totalCreated =
        results.buildingCodes +
        results.zones +
        results.neighborhoods +
        results.featureCodes +
        results.saleQualityCodes;

      console.log(`Reference data import completed:`, results);

      res.json({
        success: true,
        message: 'Reference data imported successfully',
        summary: {
          totalCreated,
          buildingCodes: results.buildingCodes,
          zones: results.zones,
          neighborhoods: results.neighborhoods,
          featureCodes: results.featureCodes,
          saleQualityCodes: results.saleQualityCodes,
        },
      });
    } catch (error) {
      console.error('Error importing reference data:', error);
      res.status(500).json({
        error: 'Failed to import reference data',
        message: error.message,
        details: error.stack,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/import/validate-properties
 * Validate Phase 2 property data
 */
router.post(
  '/municipalities/:municipalityId/import/validate-properties',
  authenticateToken,
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const { parsedData, systemKey, assessmentYear } = req.body;

      console.log(`Validating property data for ${systemKey}`);

      const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);
      const errors = [];
      const warnings = [];

      // For Avitar Desktop: Get property data from combined sheet
      let propertyData = [];
      if (systemKey === 'avitar-desktop' && parsedData.sheets) {
        const sheetName =
          parsedData.sheetNames?.[0] || Object.keys(parsedData.sheets)[0];
        const sheetData = parsedData.sheets[sheetName]?.data;

        if (sheetData && sheetData.length > 0) {
          propertyData = sheetData;
          console.log(
            `📊 Found ${propertyData.length} rows in sheet "${sheetName}" for property validation`,
          );
        }
      }

      // Load reference data for validation
      const [buildingCodes, zones, neighborhoods] = await Promise.all([
        BuildingCode.find({ municipalityId: municipalityObjectId }),
        Zone.find({ municipalityId: municipalityObjectId }),
        NeighborhoodCode.find({ municipalityId: municipalityObjectId }),
      ]);

      const buildingCodeMap = new Map(
        buildingCodes.map((bc) => [bc.code, bc._id]),
      );
      const zoneMap = new Map(zones.map((z) => [z.name, z._id]));
      const neighborhoodMap = new Map(
        neighborhoods.map((n) => [n.code, n._id]),
      );

      // Track PIDs to detect duplicates
      const pidSet = new Set();

      // Validate properties
      if (parsedData.properties) {
        parsedData.properties.forEach((row, index) => {
          // Validate PID
          if (!row.pid_raw) {
            errors.push({
              sheet: 'Properties',
              row: index + 2,
              field: 'pid_raw',
              message: 'PID is required',
            });
          } else {
            // Check for duplicate PIDs in import
            if (pidSet.has(row.pid_raw)) {
              errors.push({
                sheet: 'Properties',
                row: index + 2,
                field: 'pid_raw',
                message: `Duplicate PID: ${row.pid_raw}`,
              });
            }
            pidSet.add(row.pid_raw);
          }

          // Validate property class
          if (
            row.property_class &&
            !['R', 'C', 'I', 'U'].includes(row.property_class)
          ) {
            errors.push({
              sheet: 'Properties',
              row: index + 2,
              field: 'property_class',
              message: 'Property class must be R, C, I, or U',
            });
          }
        });
      }

      // Validate buildings
      if (parsedData.buildings) {
        parsedData.buildings.forEach((row, index) => {
          // Validate base type exists
          if (row.base_type && !buildingCodeMap.has(row.base_type)) {
            errors.push({
              sheet: 'Buildings',
              row: index + 2,
              field: 'base_type',
              message: `Building code '${row.base_type}' not found in reference data`,
            });
          }

          // Validate effective area
          if (!row.effective_area || row.effective_area <= 0) {
            warnings.push({
              sheet: 'Buildings',
              row: index + 2,
              field: 'effective_area',
              message: 'Effective area should be greater than 0',
            });
          }
        });
      }

      // Validate land
      if (parsedData.land) {
        parsedData.land.forEach((row, index) => {
          // Validate zone exists
          if (row.zone && !zoneMap.has(row.zone)) {
            warnings.push({
              sheet: 'Land',
              row: index + 2,
              field: 'zone',
              message: `Zone '${row.zone}' not found in reference data`,
            });
          }

          // Validate neighborhood exists
          if (row.neighborhood && !neighborhoodMap.has(row.neighborhood)) {
            warnings.push({
              sheet: 'Land',
              row: index + 2,
              field: 'neighborhood',
              message: `Neighborhood '${row.neighborhood}' not found in reference data`,
            });
          }
        });
      }

      // Calculate counts based on system type
      let propertyCount = 0;
      let buildingCount = 0;
      let landCount = 0;
      let featureCount = 0;

      if (systemKey === 'avitar-desktop' && propertyData.length > 0) {
        // For Avitar Desktop: Count unique PIDs and buildings with data
        const uniquePIDs = new Set();
        let buildingsWithData = 0;

        propertyData.forEach((row) => {
          if (row.PID) {
            uniquePIDs.add(row.PID);
          }
          // Count rows with building data (has BaseRateCode or BldgArea)
          if (row.BaseRateCode || row.BldgArea || row.BldgEffArea) {
            buildingsWithData++;
          }
        });

        propertyCount = uniquePIDs.size;
        buildingCount = buildingsWithData;
        landCount = propertyCount; // Each property has land
        featureCount = 0; // Features not in Avitar Desktop export
      } else {
        // For other systems: use separate sheets
        propertyCount = parsedData.properties?.length || 0;
        buildingCount = parsedData.buildings?.length || 0;
        landCount = parsedData.land?.length || 0;
        featureCount = parsedData.features?.length || 0;
      }

      res.json({
        isValid: errors.length === 0,
        errors,
        warnings,
        propertyCount,
        buildingCount,
        landCount,
        featureCount,
      });
    } catch (error) {
      console.error('Error validating property data:', error);
      res.status(500).json({
        error: 'Failed to validate property data',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/import/execute-properties
 * Execute Phase 2 property data import with transaction
 */
// Get progress for an import
router.get(
  '/municipalities/:municipalityId/import/progress/:importId',
  authenticateToken,
  async (req, res) => {
    const { importId } = req.params;
    const progress = importProgress.getProgress(importId);

    if (!progress) {
      return res.status(404).json({ error: 'Import not found' });
    }

    res.json(progress);
  },
);

// Clear local storage for municipality (returns signal to client)
router.post(
  '/municipalities/:municipalityId/import/clear-cache',
  authenticateToken,
  async (req, res) => {
    // This endpoint just signals the frontend to clear its cache
    // The actual clearing happens on the frontend
    res.json({
      success: true,
      message: 'Cache clear signal sent',
      timestamp: Date.now(),
    });
  },
);

router.post(
  '/municipalities/:municipalityId/import/execute-properties',
  authenticateToken,
  async (req, res) => {
    const importId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const { municipalityId } = req.params;
      const {
        parsedData,
        systemKey,
        assessmentYear,
        permitHandling = 'remap',
      } = req.body;

      console.log(
        `Executing property data import for ${systemKey} (ID: ${importId})`,
      );
      console.log(`Permit handling strategy: ${permitHandling}`);

      const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);
      const year = parseInt(assessmentYear) || new Date().getFullYear();

      // ===== PERMIT HANDLING: Store old property IDs for remapping if needed =====
      let oldPropertyIdMap = null;
      if (permitHandling === 'remap') {
        console.log('📋 Storing old property IDs for permit remapping...');
        const oldProperties = await PropertyTreeNode.find({
          municipality_id: municipalityObjectId,
        }).lean();
        oldPropertyIdMap = new Map(
          oldProperties.map((prop) => [prop.pid_raw, prop._id.toString()]),
        );
        console.log(
          `   Stored ${oldPropertyIdMap.size} property IDs for remapping`,
        );
      }

      // ===== CLEANUP: Delete all existing property data for this municipality before import =====
      console.log(
        `🧹 Cleaning up existing property data for municipality ${municipalityId}...`,
      );

      const PropertyOwner = require('../models/PropertyOwner');
      const PropertyExemption = require('../models/PropertyExemption');
      const PropertySketch = require('../models/PropertySketch');
      const SalesHistory = require('../models/SalesHistory');
      const Permit = require('../models/Permit');

      // Build delete operations array based on permitHandling strategy
      const deleteOperations = [
        PropertyTreeNode.deleteMany({ municipality_id: municipalityObjectId }),
        BuildingAssessment.deleteMany({
          municipality_id: municipalityObjectId,
        }),
        LandAssessment.deleteMany({ municipality_id: municipalityObjectId }),
        ParcelAssessment.deleteMany({ municipality_id: municipalityObjectId }),
        PropertyFeature.deleteMany({ municipality_id: municipalityObjectId }),
        PropertyNotes.deleteMany({ municipality_id: municipalityObjectId }),
        PropertyOwner.deleteMany({ municipality_id: municipalityObjectId }),
        PropertyExemption.deleteMany({ municipality_id: municipalityObjectId }),
        PropertySketch.deleteMany({ municipality_id: municipalityObjectId }),
        SalesHistory.deleteMany({ municipality_id: municipalityObjectId }),
      ];

      const modelNames = [
        'PropertyTreeNode',
        'BuildingAssessment',
        'LandAssessment',
        'ParcelAssessment',
        'PropertyFeature',
        'PropertyNotes',
        'PropertyOwner',
        'PropertyExemption',
        'PropertySketch',
        'SalesHistory',
      ];

      // Add Permit deletion if user chose to delete permits
      if (permitHandling === 'delete') {
        deleteOperations.push(
          Permit.deleteMany({ municipalityId: municipalityObjectId }),
        );
        modelNames.push('Permit');
        console.log('   🗑️  Will delete all permits');
      } else {
        console.log('   📋 Will preserve and remap permits');
      }

      const deleteResults = await Promise.allSettled(deleteOperations);

      let totalDeleted = 0;
      deleteResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const count = result.value.deletedCount || 0;
          totalDeleted += count;
          if (count > 0) {
            console.log(`   ✅ Deleted ${count} ${modelNames[index]} records`);
          }
        } else {
          console.warn(
            `   ⚠️  Failed to delete ${modelNames[index]}: ${result.reason?.message || result.reason}`,
          );
        }
      });

      console.log(`🧹 Cleanup complete: ${totalDeleted} total records deleted`);
      console.log(`📤 Signaling frontend to clear local cache...`);
      // Note: Frontend will receive import progress updates and clear cache on its end

      const results = {
        properties: 0,
        buildings: 0,
        land: 0,
        features: 0,
      };

      // Load reference data including PropertyAttribute discriminated models
      const {
        SiteAttribute,
        RoadAttribute,
        DrivewayAttribute,
        TopologyAttribute,
      } = require('../models/PropertyAttribute');

      // Get state ID for the municipality
      const municipality = await Municipality.findById(municipalityObjectId);
      const stateId = municipality.state || 'NH'; // Default to NH if not set

      const [
        buildingCodes,
        zones,
        neighborhoods,
        featureCodes,
        landUseDetails,
        siteAttributes,
        roadAttributes,
        drivewayAttributes,
        topologyAttributes,
        saleQualityCodes,
      ] = await Promise.all([
        BuildingCode.find({ municipalityId: municipalityObjectId }),
        Zone.find({ municipalityId: municipalityObjectId }),
        NeighborhoodCode.find({ municipalityId: municipalityObjectId }),
        BuildingFeatureCode.find({ municipalityId: municipalityObjectId }),
        LandUseDetail.find({ municipalityId: municipalityObjectId }),
        SiteAttribute.find({ municipalityId: municipalityObjectId }),
        RoadAttribute.find({ municipalityId: municipalityObjectId }),
        DrivewayAttribute.find({ municipalityId: municipalityObjectId }),
        TopologyAttribute.find({ municipalityId: municipalityObjectId }),
        SaleQualityCode.find({ stateId: stateId }),
      ]);

      // Create matching maps with normalized keys (trimmed and uppercase for case-insensitive matching)
      const buildingCodeMap = new Map(
        buildingCodes.map((bc) => [
          bc.code?.toString().trim().toUpperCase(),
          bc,
        ]),
      );
      const zoneMap = new Map(
        zones.map((z) => [z.name?.toString().trim().toUpperCase(), z]),
      );
      const neighborhoodMap = new Map(
        neighborhoods.map((n) => [n.code?.toString().trim().toUpperCase(), n]),
      );

      // Create land use detail map by code and also by displayText for flexible matching
      const landUseDetailMap = new Map();
      landUseDetails.forEach((lud) => {
        const code = lud.code?.toString().trim().toUpperCase();
        const displayText = lud.displayText?.toString().trim().toUpperCase();
        if (code) {
          landUseDetailMap.set(code, lud);
        }
        if (displayText && displayText !== code) {
          landUseDetailMap.set(displayText, lud);
        }
      });

      // Create separate maps for each feature type - codes can overlap between types (e.g., "DW" for interior_wall vs exterior_wall)
      const featureCodesByType = {};
      featureCodes.forEach((fc) => {
        if (!featureCodesByType[fc.featureType]) {
          featureCodesByType[fc.featureType] = new Map();
        }
        featureCodesByType[fc.featureType].set(
          fc.code?.toString().trim().toUpperCase(),
          fc,
        );
      });

      // Create property attribute maps by code (normalized to uppercase)
      const siteAttributeMap = new Map(
        siteAttributes.map((sa) => [
          sa.code?.toString().trim().toUpperCase(),
          sa,
        ]),
      );
      const roadAttributeMap = new Map(
        roadAttributes.map((ra) => [
          ra.code?.toString().trim().toUpperCase(),
          ra,
        ]),
      );
      const drivewayAttributeMap = new Map(
        drivewayAttributes.map((da) => [
          da.code?.toString().trim().toUpperCase(),
          da,
        ]),
      );
      const topologyAttributeMap = new Map(
        topologyAttributes.map((ta) => [
          ta.code?.toString().trim().toUpperCase(),
          ta,
        ]),
      );
      const saleQualityCodeMap = new Map(
        saleQualityCodes.map((sqc) => [sqc.code?.toString().trim(), sqc]),
      );

      // Debug logging to help diagnose code matching issues
      if (DEBUG_IMPORT) {
        console.log(`📋 Reference data loaded:`);
        console.log(
          `   Building codes: ${buildingCodes.length} codes - Keys: ${Array.from(buildingCodeMap.keys()).slice(0, 10).join(', ')}${buildingCodes.length > 10 ? '...' : ''}`,
        );
        console.log(
          `   Zones: ${zones.length} zones - Keys: ${Array.from(zoneMap.keys()).join(', ')}`,
        );
        console.log(
          `   Neighborhoods: ${neighborhoods.length} neighborhoods - Keys: ${Array.from(neighborhoodMap.keys()).join(', ')}`,
        );
        console.log(
          `   Land use details: ${landUseDetails.length} types - Keys: ${Array.from(landUseDetailMap.keys()).join(', ')}`,
        );
        console.log(`   Feature codes by type:`);
        Object.keys(featureCodesByType).forEach((type) => {
          const keys = Array.from(featureCodesByType[type].keys());
          console.log(
            `      ${type}: ${keys.length} codes - ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`,
          );
        });
        console.log(
          `   Site attributes: ${siteAttributeMap.size} codes - Keys: ${Array.from(siteAttributeMap.keys()).join(', ')}`,
        );
        console.log(
          `   Road attributes: ${roadAttributeMap.size} codes - Keys: ${Array.from(roadAttributeMap.keys()).join(', ')}`,
        );
        console.log(
          `   Driveway attributes: ${drivewayAttributeMap.size} codes - Keys: ${Array.from(drivewayAttributeMap.keys()).join(', ')}`,
        );
        console.log(
          `   Topology attributes: ${topologyAttributeMap.size} codes - Keys: ${Array.from(topologyAttributeMap.keys()).join(', ')}`,
        );
      } else {
        console.log(
          `📋 Reference data loaded: ${buildingCodes.length} building codes, ${zones.length} zones, ${neighborhoods.length} neighborhoods, ${Object.keys(featureCodesByType).length} feature types`,
        );
      }

      // Group data by PID for efficient processing
      const propertiesByPID = new Map();

      // Collect notes separately (keyed by PID + card number)
      const notesByPIDAndCard = new Map();

      // For Avitar Desktop: Process combined sheet data
      if (systemKey === 'avitar-desktop' && parsedData.sheets) {
        const sheetName =
          parsedData.sheetNames?.[0] || Object.keys(parsedData.sheets)[0];
        const sheetData = parsedData.sheets[sheetName]?.data;

        if (sheetData && sheetData.length > 0) {
          console.log(
            `📦 Processing ${sheetData.length} rows from Avitar Desktop export`,
          );

          // Group rows by PID and card number
          let skippedRows = 0;
          sheetData.forEach((row, index) => {
            if (!row.PID) {
              if (DEBUG_IMPORT) {
                console.warn(`⚠️  Row ${index + 2} missing PID, skipping`);
              }
              skippedRows++;
              return;
            }

            // PID format: Can be alphanumeric with dashes (e.g., 00000400000100000A, 0000040000010001-1)
            // Avitar format: Usually 20 characters where last 2 digits = card number
            // But PIDs can include letters and dashes, so we need flexible parsing
            const fullPID = row.PID.toString().trim();

            // Try to extract card number from PID:
            // 1. If PID ends with digits and is 20+ chars, last 2 digits might be card number
            // 2. Otherwise, use the Cards column or default to 1
            let pid = fullPID;
            let cardNumberFromPID = 1;

            // Check if PID looks like standard Avitar format (20 chars, ends with digits)
            if (fullPID.length >= 20 && /\d{2}$/.test(fullPID)) {
              // Last 2 characters are digits - might be card number
              const potentialCardNum = fullPID.substring(fullPID.length - 2);
              const potentialPID = fullPID.substring(0, fullPID.length - 2);

              // Only split if we have explicit card info or the number looks like a card
              if (row.Cards || parseInt(potentialCardNum) > 0) {
                pid = potentialPID;
                cardNumberFromPID = parseInt(potentialCardNum) || 1;
              }
            }

            const cardNumber = parseInt(row.Cards) || cardNumberFromPID;

            // Initialize property data structure if this is the first card for this PID
            if (!propertiesByPID.has(pid)) {
              propertiesByPID.set(pid, {
                property: {
                  pid_raw: pid,
                  property_class: row.LandUse || 'R',
                  'location.street_number': row.Street_1 || '',
                  'location.street': row.Street || '',
                  'location.zone': row.Zone || '',
                  'location.neighborhood': row.NeighCode || '',
                  'owner.primary_name': row.Owner1 || '',
                  'owner.secondary_name': row.Owner2 || '',
                  'owner.mailing_address': row.OwnerAddr1 || '',
                  'owner.mailing_address_2': row.OwnerAddr2 || '',
                  'owner.mailing_city': row.OwnerCity || '',
                  'owner.mailing_state': row.OwnerState || '',
                  'owner.mailing_zipcode': row.OwnerZip || '',
                  // Sales data - initialize as null, will be updated when found on any card
                  'sales.sale_date': null,
                  'sales.sale_price': null,
                  'sales.sale_book': null,
                  'sales.sale_page': null,
                  'sales.sale_quality': null,
                  'sales.sale_improvements': null,
                  'sales.sale_quality_code': null,
                  'sales.seller_name': null,
                },
                buildings: [],
                land: [
                  {
                    size_acres: parseFloat(row.Acres) || 0,
                    zone: row.Zone || '',
                    neighborhood: row.NeighCode || '',
                    site: row.Site || '',
                    driveway: row.Driveway || '',
                    road: row.Road || '',
                    topology: row.Topology || row.Topo || '',
                  },
                ],
                features: [],
                totalCards: 0,
              });
            }

            const propertyData = propertiesByPID.get(pid);
            propertyData.totalCards++;

            // Update property-level fields if they're present on this row and not already set
            // This handles cases where the first card might be vacant land with incomplete data
            if (row.LandUse && !propertyData.property.property_class) {
              propertyData.property.property_class = row.LandUse;
            }
            if (
              row.Street_1 &&
              !propertyData.property['location.street_number']
            ) {
              propertyData.property['location.street_number'] = row.Street_1;
            }
            if (row.Street && !propertyData.property['location.street']) {
              propertyData.property['location.street'] = row.Street;
            }

            // Add building data for this card (if it has building info)
            // Check if we already have this card number to avoid duplicates
            const existingCard = propertyData.buildings.find(
              (b) => b.card_number === cardNumber,
            );
            if (
              (row.BaseRateCode || row.BldgArea || row.BldgEffArea) &&
              !existingCard
            ) {
              // Parse bathrooms: whole number = full baths, decimal part = half baths
              // Example: 4.5 bathrooms = 4 full baths + 1 half bath
              const bathroomValue = parseFloat(row.Bathrooms) || 0;
              const full_baths = Math.floor(bathroomValue);
              const half_baths = bathroomValue % 1 >= 0.5 ? 1 : 0;

              // Parse AC: if -1, convert to "100%"
              let airConditioning = row.AC || '';
              if (airConditioning === -1 || airConditioning === '-1') {
                airConditioning = '100%';
              }

              propertyData.buildings.push({
                pid_raw: pid,
                card_number: cardNumber,
                base_type: row.BaseRateCode || '',
                year_built: parseInt(row.ActYrBuilt) || null,
                gross_area: parseFloat(row.BldgArea) || 0,
                effective_area: parseFloat(row.BldgEffArea) || 0,
                gross_living_area: parseFloat(row.GrossLivingArea) || 0,
                bedrooms: parseInt(row.Bedrooms) || 0,
                full_baths: full_baths,
                half_baths: half_baths,
                quality_grade: row.QualCode || '',
                story_height: parseFloat(row.StoryHeight) || 1.0,
                base_rate: parseFloat(row.BaseRateAmt) || 0,
                roof_style: row.RoofType || '',
                roof_cover: row.RoofCover || '',
                exterior_wall_1: row.ExtWall1 || '',
                exterior_wall_2: row.ExtWall2 || '',
                interior_wall_1: row.IntWall1 || '',
                interior_wall_2: row.IntWall2 || '',
                flooring_1: row.Flooring1 || '',
                flooring_2: row.Flooring2 || '',
                heating_fuel: row.HeatingFuel || '',
                heating_type: row.HeatingSys || '',
                air_conditioning: airConditioning,
                frame: row.CommWall || '',
                extra_kitchen: row.ExtraKitchens || '',
                fireplaces: parseInt(row.Fireplaces) || 0,
                generator: row.Generators || '',
                condition: row.Condition || '',
                building_model: row.Model || '',
              });
            }

            // Update sales data if present on this row (even if not the first card)
            // Sales data might be on any card in the Excel file
            if (row.SaleDate || row.SalePrice) {
              if (DEBUG_IMPORT && results.properties < 5) {
                console.log(
                  `      📊 Found sales data on card ${cardNumber} for PID ${pid}:`,
                  {
                    SaleDate: row.SaleDate,
                    SalePrice: row.SalePrice,
                    SaleBook: row.SaleBook,
                    SalePage: row.SalePage,
                  },
                );
              }
              if (row.SaleDate)
                propertyData.property['sales.sale_date'] = row.SaleDate;
              if (row.SalePrice)
                propertyData.property['sales.sale_price'] = row.SalePrice;
              if (row.SaleBook)
                propertyData.property['sales.sale_book'] = row.SaleBook;
              if (row.SalePage)
                propertyData.property['sales.sale_page'] = row.SalePage;
              if (row.SaleQual)
                propertyData.property['sales.sale_quality'] = row.SaleQual;
              if (row.SaleImpr)
                propertyData.property['sales.sale_improvements'] = row.SaleImpr;
              if (row.SaleQualCode)
                propertyData.property['sales.sale_quality_code'] =
                  row.SaleQualCode;
              if (row.SaleGrantor)
                propertyData.property['sales.seller_name'] = row.SaleGrantor;
            }

            // Capture property notes for this card (if present)
            if (row.Notes && row.Notes.trim()) {
              const noteKey = `${pid}:${cardNumber}`;
              notesByPIDAndCard.set(noteKey, {
                pid_raw: pid,
                card_number: cardNumber,
                notes: row.Notes.trim(),
              });
            }
          });

          console.log(
            `🏘️  Grouped into ${propertiesByPID.size} properties with ${sheetData.length} total cards${skippedRows > 0 ? ` (${skippedRows} rows skipped)` : ''}`,
          );
        }
      }

      // Group properties
      if (parsedData.properties) {
        parsedData.properties.forEach((prop) => {
          if (!propertiesByPID.has(prop.pid_raw)) {
            propertiesByPID.set(prop.pid_raw, {
              property: prop,
              buildings: [],
              land: [],
              features: [],
            });
          }
        });
      }

      // Group buildings by PID
      if (parsedData.buildings) {
        parsedData.buildings.forEach((building) => {
          const propertyData = propertiesByPID.get(building.pid_raw);
          if (propertyData) {
            propertyData.buildings.push(building);
          }
        });
      }

      // Group land by PID
      if (parsedData.land) {
        parsedData.land.forEach((land) => {
          const propertyData = propertiesByPID.get(land.pid_raw);
          if (propertyData) {
            propertyData.land.push(land);
          }
        });
      }

      // Group features by PID
      if (parsedData.features) {
        parsedData.features.forEach((feature) => {
          const propertyData = propertiesByPID.get(feature.pid_raw);
          if (propertyData) {
            propertyData.features.push(feature);
          }
        });
      }

      // Building and land codes should already exist from Steps 1 and 1.5
      // No need to auto-create them during property import

      // Initialize progress tracking
      const totalProperties = propertiesByPID.size;
      importProgress.createProgress(importId, totalProperties);
      importProgress.updateProgress(
        importId,
        0,
        'Loading reference data and preparing import...',
      );

      // Create owner cache to prevent duplicates during import
      // Key format: "OWNERNAME::MAILINGADDRESS::ZIP"
      const ownerCache = new Map();
      let ownersCreated = 0;
      let ownersReused = 0;

      // Process each property with all its related data
      // Process without transactions to avoid timeout issues with large imports
      let processedCount = 0;
      for (const [pid, data] of propertiesByPID) {
        processedCount++;

        // Update progress every 10 properties (reduced frequency for performance)
        if (
          processedCount % 10 === 0 ||
          processedCount === 1 ||
          processedCount === totalProperties
        ) {
          importProgress.updateProgress(
            importId,
            processedCount,
            `Creating property records (${processedCount}/${totalProperties})`,
          );
          console.log(
            `📊 Processed ${processedCount}/${totalProperties} properties...`,
          );
        }

        try {
          // Create property
          if (DEBUG_IMPORT) {
            console.log(
              `   🏠 Creating property PID: ${pid} with ${data.buildings.length} buildings, ${data.land.length} land assessments`,
            );
          }
          const propertyDoc = await PropertyTreeNode.create([
            {
              municipality_id: municipalityObjectId,
              pid_raw: data.property.pid_raw,
              account_number: data.property.account_number || pid,
              property_class: data.property.property_class || 'R',
              location: {
                street_number: data.property['location.street_number'] || '',
                street: data.property['location.street'] || '',
                address:
                  `${data.property['location.street_number'] || ''} ${data.property['location.street'] || ''}`.trim(),
                zone: data.property['location.zone'] || '',
                neighborhood: data.property['location.neighborhood'] || '',
              },
              cards: {
                total_cards: data.totalCards || data.buildings.length || 1,
              },
            },
          ]);
          results.properties++;
          if (DEBUG_IMPORT) {
            console.log(
              `      ✓ Property created with ID: ${propertyDoc[0]._id}`,
            );
          }

          // Store property ID for use throughout this property's import
          const propertyId = propertyDoc[0]._id;

          // Declare primaryOwner outside the if block so it's accessible for sales history
          let primaryOwner = null;

          // Create or find primary owner (Owner1) and link to property
          if (data.property['owner.primary_name']) {
            try {
              const primaryOwnerData = {
                primary_name: data.property['owner.primary_name'],
                mailing_address: data.property['owner.mailing_address'],
                mailing_city: data.property['owner.mailing_city'],
                mailing_state: data.property['owner.mailing_state'],
                mailing_zipcode: data.property['owner.mailing_zipcode'],
              };

              // Create cache key for this owner (normalized)
              const primaryCacheKey = [
                (primaryOwnerData.primary_name || '')
                  .toString()
                  .trim()
                  .toUpperCase(),
                (primaryOwnerData.mailing_address || '')
                  .toString()
                  .trim()
                  .toUpperCase(),
                (primaryOwnerData.mailing_zipcode || '').toString().trim(),
              ].join('::');

              // Check cache first
              if (ownerCache.has(primaryCacheKey)) {
                primaryOwner = ownerCache.get(primaryCacheKey);
                ownersReused++;
              } else {
                // Not in cache - find or create in database
                primaryOwner = await camaImportService.findOrCreateOwner(
                  primaryOwnerData,
                  municipalityId,
                );

                if (primaryOwner) {
                  // Add to cache for subsequent properties
                  ownerCache.set(primaryCacheKey, primaryOwner);
                  ownersCreated++;
                }
              }

              if (primaryOwner) {
                await camaImportService.createPropertyOwner(
                  propertyId,
                  primaryOwner._id,
                  municipalityId,
                  true, // isPrimary
                );
                console.log(
                  `      ✓ Primary owner linked: ${data.property['owner.primary_name']}`,
                );
              }
            } catch (ownerError) {
              console.error(
                `      ✗ Failed to create primary owner for PID ${pid}:`,
                ownerError.message,
              );
              // Continue even if owner creation fails - property is still created
            }
          }

          // Create or find secondary owner (Owner2) and link to property
          if (data.property['owner.secondary_name']) {
            try {
              const secondaryOwnerData = {
                primary_name: data.property['owner.secondary_name'],
                mailing_address: data.property['owner.mailing_address'],
                mailing_city: data.property['owner.mailing_city'],
                mailing_state: data.property['owner.mailing_state'],
                mailing_zipcode: data.property['owner.mailing_zipcode'],
              };

              // Create cache key for this owner (normalized)
              const secondaryCacheKey = [
                (secondaryOwnerData.primary_name || '')
                  .toString()
                  .trim()
                  .toUpperCase(),
                (secondaryOwnerData.mailing_address || '')
                  .toString()
                  .trim()
                  .toUpperCase(),
                (secondaryOwnerData.mailing_zipcode || '').toString().trim(),
              ].join('::');

              let secondaryOwner;

              // Check cache first
              if (ownerCache.has(secondaryCacheKey)) {
                secondaryOwner = ownerCache.get(secondaryCacheKey);
                ownersReused++;
              } else {
                // Not in cache - find or create in database
                secondaryOwner = await camaImportService.findOrCreateOwner(
                  secondaryOwnerData,
                  municipalityId,
                );

                if (secondaryOwner) {
                  // Add to cache for subsequent properties
                  ownerCache.set(secondaryCacheKey, secondaryOwner);
                  ownersCreated++;
                }
              }

              if (secondaryOwner) {
                await camaImportService.createPropertyOwner(
                  propertyId,
                  secondaryOwner._id,
                  municipalityId,
                  false, // isPrimary = false for secondary owner
                );
                console.log(
                  `      ✓ Secondary owner linked: ${data.property['owner.secondary_name']}`,
                );
              }
            } catch (ownerError) {
              console.error(
                `      ✗ Failed to create secondary owner for PID ${pid}:`,
                ownerError.message,
              );
              // Continue even if owner creation fails - property is still created
            }
          }

          // Debug sales data availability - show ALL property fields for first 3 properties
          if (results.properties < 3) {
            console.log(
              `      🔍 ALL property fields for PID ${pid}:`,
              Object.keys(data.property),
            );
          }
          const salesFields = Object.keys(data.property).filter((k) =>
            k.toLowerCase().includes('sale'),
          );
          if (salesFields.length > 0) {
            console.log(`      🔍 Sales data found for PID ${pid}:`, {
              salesFields: salesFields,
              sampleValues: salesFields.reduce((acc, field) => {
                acc[field] = data.property[field];
                return acc;
              }, {}),
            });
          } else if (results.properties < 3) {
            console.log(`      ⚠️  No sales fields found for PID ${pid}`);
          }

          // Create sales history if sales data exists
          if (
            data.property['sales.sale_date'] &&
            data.property['sales.sale_price']
          ) {
            try {
              // Parse sale quality code and look up the SaleQualityCode reference
              let saleQualityCode = 0;
              let saleQualityCodeId = null;
              if (data.property['sales.sale_quality_code']) {
                const parsed = parseInt(
                  data.property['sales.sale_quality_code'],
                  10,
                );
                if (!isNaN(parsed)) {
                  saleQualityCode = parsed;
                  // Look up the sale quality code ObjectId
                  const saleCodeDoc = saleQualityCodeMap.get(parsed.toString());
                  if (saleCodeDoc) {
                    saleQualityCodeId = saleCodeDoc._id;
                  }
                }
              }

              // Interpret SaleQual field: U = Unqualified (invalid), Q = Qualified (valid)
              const saleQual = data.property['sales.sale_quality']
                ?.toString()
                .toUpperCase();
              const isValidSale = saleQual === 'Q'; // Q = Qualified means valid sale

              // Interpret SaleImpr field: V = Vacant, I = Improved
              const saleImpr = data.property['sales.sale_improvements']
                ?.toString()
                .toUpperCase();
              const isVacant = saleImpr === 'V'; // V = Vacant

              const salesData = {
                property_id: propertyId,
                municipality_id: municipalityObjectId,
                sale_date: data.property['sales.sale_date']
                  ? new Date(data.property['sales.sale_date'])
                  : null,
                sale_price: data.property['sales.sale_price']
                  ? parseFloat(data.property['sales.sale_price'])
                  : 0,
                sale_code: saleQualityCode,
                sale_quality_code_id: saleQualityCodeId,
                buyer_name: data.property['sales.seller_name'] || '', // Grantor becomes buyer (current owner)
                buyer_id: primaryOwner?._id || null, // Link to current owner
                seller_name: '', // We don't have previous seller info from import
                book: data.property['sales.sale_book'] || '',
                page: data.property['sales.sale_page'] || '',
                is_valid_sale: isValidSale,
                is_vacant: isVacant,
                verification_source: 'import',
                notes: '',
                created_by: req.user._id, // Use the authenticated user who initiated the import
              };

              const createdSale = await SalesHistory.create(salesData);
              results.salesHistory = (results.salesHistory || 0) + 1;
              console.log(
                `      ✓ Sales history created for ${data.property['sales.sale_date']} (${isValidSale ? 'Qualified' : 'Unqualified'}, ${isVacant ? 'Vacant' : 'Improved'})`,
              );
              console.log(
                `      ✓ Sale ID: ${createdSale._id}, Property ID: ${propertyId}, Buyer: ${salesData.buyer_name}, Buyer ID: ${salesData.buyer_id}`,
              );
            } catch (salesError) {
              console.error(
                `      ✗ Failed to create sales history for PID ${pid}:`,
                salesError.message,
              );
              console.error(
                `      ✗ Sales data that failed:`,
                JSON.stringify(salesData, null, 2),
              );
              console.error(`      ✗ Full error:`, salesError);
              // Continue even if sales creation fails
            }
          }

          // Helper functions for code normalization (used by both building and land assessments)
          // Helper to strip building code prefix (e.g., "BRSA" → "RSA")
          // Property Excel prefixes building codes with "B"
          const stripBuildingCodePrefix = (code) => {
            if (!code) return '';
            const str = code.toString().trim();
            // If starts with B and has more characters, remove the B
            if (str.length > 1 && str.toUpperCase().startsWith('B')) {
              return str.substring(1);
            }
            return str;
          };

          // Helper to strip feature code prefix (e.g., "R-CG" → "CG")
          // Property Excel prefixes feature codes with type acronym and dash
          const stripFeatureCodePrefix = (code) => {
            if (!code) return '';
            const str = code.toString().trim();
            const dashIndex = str.indexOf('-');
            // If contains dash, take everything after it
            if (dashIndex !== -1 && dashIndex < str.length - 1) {
              return str.substring(dashIndex + 1);
            }
            return str;
          };

          // Helper to normalize zone code (e.g., "4" → "04", "6" → "06")
          // Property Excel has single digit zones, DB has zero-padded zones
          const normalizeZoneCode = (code) => {
            if (!code) return '';
            const str = code.toString().trim();
            // Pad single digit with leading zero
            if (str.length === 1 && /^\d$/.test(str)) {
              return '0' + str;
            }
            return str;
          };

          // Helper to strip neighborhood prefix (e.g., "N-B" → "B", "N-L" → "L")
          // Property Excel prefixes neighborhoods with "N-"
          const stripNeighborhoodPrefix = (code) => {
            if (!code) return '';
            const str = code.toString().trim();
            const dashIndex = str.indexOf('-');
            // If contains dash, take everything after it
            if (dashIndex !== -1 && dashIndex < str.length - 1) {
              return str.substring(dashIndex + 1);
            }
            return str;
          };

          // Helper function to lookup feature code ObjectId by type
          const lookupFeatureCode = (value, featureType) => {
            if (!value || !featureType) return undefined;
            const cleaned = stripFeatureCodePrefix(value);
            const normalized = cleaned.trim().toUpperCase();
            const typeMap = featureCodesByType[featureType];
            if (!typeMap) return undefined;
            const featureCode = typeMap.get(normalized);
            return featureCode?._id;
          };

          // Create buildings (use insertMany to bypass hooks during transaction)
          if (data.buildings.length > 0) {
            try {
              // Pre-validate all building codes before inserting
              const validationErrors = [];
              data.buildings.forEach((building, index) => {
                const rawBuildingCode =
                  building.base_type?.toString().trim() || '';
                const cleanedCode = stripBuildingCodePrefix(rawBuildingCode);
                const normalizedCode = cleanedCode.toUpperCase();
                const buildingCode = buildingCodeMap.get(normalizedCode);

                if (!buildingCode) {
                  validationErrors.push(
                    `Building ${index + 1}: Code "${building.base_type}" (cleaned: "${cleanedCode}") not found`,
                  );
                } else if (DEBUG_IMPORT) {
                  console.log(
                    `      ✓ Building ${index + 1}: Code "${building.base_type}" → ${buildingCode._id}`,
                  );
                }
              });

              if (validationErrors.length > 0) {
                console.error(
                  `      ❌ Building validation failed for PID ${pid}:`,
                  validationErrors.join('; '),
                );
                throw new Error(
                  `Missing building codes: ${validationErrors.join('; ')}`,
                );
              }

              console.log(
                `      🏗️  Inserting ${data.buildings.length} building(s) for property ${propertyId} (PID: ${pid})`,
              );
              console.log(
                `      🔍 propertyId type: ${typeof propertyId}, value: ${propertyId}, isObjectId: ${propertyId?.constructor?.name}`,
              );
              const buildingDocs = await BuildingAssessment.insertMany(
                data.buildings.map((building, index) => {
                  // Look up the building code ObjectId from the code string (normalized)
                  const rawBuildingCode =
                    building.base_type?.toString().trim() || '';
                  const cleanedBuildingCode =
                    stripBuildingCodePrefix(rawBuildingCode);
                  const normalizedCode = cleanedBuildingCode.toUpperCase();
                  const buildingCode = buildingCodeMap.get(normalizedCode);

                  return {
                    property_id: propertyId,
                    municipality_id: municipalityObjectId,
                    card_number: parseInt(building.card_number) || 1,
                    effective_year: year,
                    base_type: buildingCode?._id,
                    year_built: parseInt(building.year_built) || 0,
                    gross_living_area:
                      parseInt(building.gross_living_area) || 0,
                    effective_area:
                      parseInt(building.effective_area) ||
                      parseInt(building.gross_living_area) ||
                      0,
                    gross_area: parseInt(building.gross_area) || 0,
                    quality_grade: lookupFeatureCode(
                      building.quality_grade,
                      'quality',
                    ),
                    story_height: lookupFeatureCode(
                      building.story_height,
                      'story_height',
                    ),
                    frame: lookupFeatureCode(building.frame, 'frame'),
                    ceiling_height: lookupFeatureCode(
                      building.ceiling_height,
                      'ceiling_height',
                    ),
                    roof_style: lookupFeatureCode(
                      building.roof_style,
                      'roof_style',
                    ),
                    roof_cover: lookupFeatureCode(
                      building.roof_cover,
                      'roofing',
                    ),
                    exterior_wall_1: lookupFeatureCode(
                      building.exterior_wall_1,
                      'exterior_wall',
                    ),
                    exterior_wall_2: lookupFeatureCode(
                      building.exterior_wall_2,
                      'exterior_wall',
                    ),
                    interior_wall_1: lookupFeatureCode(
                      building.interior_wall_1,
                      'interior_wall',
                    ),
                    interior_wall_2: lookupFeatureCode(
                      building.interior_wall_2,
                      'interior_wall',
                    ),
                    flooring_1: lookupFeatureCode(
                      building.flooring_1,
                      'flooring',
                    ),
                    flooring_2: lookupFeatureCode(
                      building.flooring_2,
                      'flooring',
                    ),
                    heating_fuel: lookupFeatureCode(
                      building.heating_fuel,
                      'heating_fuel',
                    ),
                    heating_type: lookupFeatureCode(
                      building.heating_type,
                      'heating_type',
                    ),
                    air_conditioning: lookupFeatureCode(
                      building.air_conditioning,
                      'air_conditioning',
                    ),
                    bedrooms: parseInt(building.bedrooms) || 0,
                    full_baths: parseInt(building.full_baths) || 0,
                    half_baths: parseInt(building.half_baths) || 0,
                    extra_kitchen: parseInt(building.extra_kitchen) || 0,
                    fireplaces: parseInt(building.fireplaces) || 0,
                    generator: lookupFeatureCode(
                      building.generator,
                      'generator',
                    ),
                    condition: lookupFeatureCode(
                      building.condition,
                      'condition',
                    ),
                    building_model: building.building_model,
                  };
                }),
              );
              console.log(
                `      ✅ Successfully inserted ${buildingDocs.length} building assessment(s) with IDs: ${buildingDocs.map((b) => b._id).join(', ')}`,
              );
              results.buildings += data.buildings.length;
              if (DEBUG_IMPORT) {
                console.log(
                  `      ✓ Created ${data.buildings.length} building(s) - Codes: ${data.buildings.map((b) => b.base_type).join(', ')}`,
                );
              }
            } catch (buildingError) {
              console.error(
                `      ✗ Failed to insert building for PID ${pid}:`,
                buildingError.message,
              );
              console.error(
                '         Building data:',
                JSON.stringify(data.buildings[0], null, 2),
              );
              throw buildingError;
            }
          }

          // Create land assessment
          if (data.land.length > 0) {
            const landLines = data.land.map((land) => {
              // Look up land use detail by code or displayText
              const normalizedLandUseType = land.land_use_type
                ?.toString()
                .trim()
                .toUpperCase();
              const landUseDetail = normalizedLandUseType
                ? landUseDetailMap.get(normalizedLandUseType)
                : null;

              // Look up topography attribute by code
              const normalizedTopography = land.topography
                ?.toString()
                .trim()
                .toUpperCase();
              const topographyAttribute = normalizedTopography
                ? topologyAttributeMap.get(normalizedTopography)
                : null;

              return {
                // Save ObjectId reference to LandUseDetail
                land_use_detail_id: landUseDetail?._id || null,
                // Keep legacy string for backward compatibility
                land_use_type: land.land_use_type || 'RES',
                size: parseFloat(land.size_acres) || 0,
                size_unit: 'AC',
                frontage: parseFloat(land.frontage) || 0,
                depth: parseFloat(land.depth) || 0,
                // Save ObjectId reference to topography attribute
                topography_id: topographyAttribute?._id || null,
                // Keep legacy string for backward compatibility
                topography: land.topography || 'LEVEL',
                condition: 100, // Land condition is numeric 0-1000, default to 100
              };
            });

            // Validate zone and neighborhood codes before creating land assessment
            const rawZone = data.land[0].zone?.toString().trim() || '';
            const cleanedZone = normalizeZoneCode(rawZone);
            const normalizedZone = cleanedZone.toUpperCase();
            let zone = zoneMap.get(normalizedZone);

            const rawNeighborhood =
              data.land[0].neighborhood?.toString().trim() || '';
            const cleanedNeighborhood =
              stripNeighborhoodPrefix(rawNeighborhood);
            const normalizedNeighborhood = cleanedNeighborhood.toUpperCase();
            const neighborhood = neighborhoodMap.get(normalizedNeighborhood);

            // Lookup property attributes (site, road, driveway, topology)
            const normalizedSite = data.land[0].site
              ?.toString()
              .trim()
              .toUpperCase();
            const siteAttribute = normalizedSite
              ? siteAttributeMap.get(normalizedSite)
              : null;

            const normalizedRoad = data.land[0].road
              ?.toString()
              .trim()
              .toUpperCase();
            const roadAttribute = normalizedRoad
              ? roadAttributeMap.get(normalizedRoad)
              : null;

            const normalizedDriveway = data.land[0].driveway
              ?.toString()
              .trim()
              .toUpperCase();
            const drivewayAttribute = normalizedDriveway
              ? drivewayAttributeMap.get(normalizedDriveway)
              : null;

            const normalizedTopology = data.land[0].topology
              ?.toString()
              .trim()
              .toUpperCase();
            const topologyAttribute = normalizedTopology
              ? topologyAttributeMap.get(normalizedTopology)
              : null;

            console.log(
              `      🌳 Creating land assessment - Zone: ${data.land[0].zone || 'N/A'}, Neighborhood: ${data.land[0].neighborhood || 'N/A'}, Site: ${data.land[0].site || 'N/A'}, Road: ${data.land[0].road || 'N/A'}, Driveway: ${data.land[0].driveway || 'N/A'}, Acres: ${landLines[0].size}`,
            );

            const landValidationErrors = [];

            // Validate zone
            if (!zone && data.land[0].zone) {
              landValidationErrors.push(
                `Zone "${rawZone}" (cleaned: "${cleanedZone}", normalized: "${normalizedZone}") not found in zoneMap`,
              );
            } else if (zone) {
              console.log(
                `      ✓ Zone "${rawZone}" (cleaned: "${cleanedZone}") → ObjectId ${zone._id}`,
              );
            }

            // Validate neighborhood
            if (!neighborhood && data.land[0].neighborhood) {
              landValidationErrors.push(
                `Neighborhood "${rawNeighborhood}" (cleaned: "${cleanedNeighborhood}", normalized: "${normalizedNeighborhood}") not found in neighborhoodMap`,
              );
            } else if (neighborhood) {
              console.log(
                `      ✓ Neighborhood "${rawNeighborhood}" (cleaned: "${cleanedNeighborhood}") → ObjectId ${neighborhood._id}`,
              );
            }

            // Validate site attribute (optional)
            if (normalizedSite && !siteAttribute) {
              console.warn(
                `      ⚠️  Site "${data.land[0].site}" (normalized: "${normalizedSite}") not found in siteAttributeMap`,
              );
            } else if (siteAttribute) {
              console.log(
                `      ✓ Site "${data.land[0].site}" → ObjectId ${siteAttribute._id}`,
              );
            }

            // Validate road attribute (optional)
            if (normalizedRoad && !roadAttribute) {
              console.warn(
                `      ⚠️  Road "${data.land[0].road}" (normalized: "${normalizedRoad}") not found in roadAttributeMap`,
              );
            } else if (roadAttribute) {
              console.log(
                `      ✓ Road "${data.land[0].road}" → ObjectId ${roadAttribute._id}`,
              );
            }

            // Validate driveway attribute (optional)
            if (normalizedDriveway && !drivewayAttribute) {
              console.warn(
                `      ⚠️  Driveway "${data.land[0].driveway}" (normalized: "${normalizedDriveway}") not found in drivewayAttributeMap`,
              );
            } else if (drivewayAttribute) {
              console.log(
                `      ✓ Driveway "${data.land[0].driveway}" → ObjectId ${drivewayAttribute._id}`,
              );
            }

            // Validate topology attribute (optional)
            if (normalizedTopology && !topologyAttribute) {
              console.warn(
                `      ⚠️  Topology "${data.land[0].topology}" (normalized: "${normalizedTopology}") not found in topologyAttributeMap`,
              );
            } else if (topologyAttribute) {
              console.log(
                `      ✓ Topology "${data.land[0].topology}" → ObjectId ${topologyAttribute._id}`,
              );
            }

            // Abort if validation failed
            if (landValidationErrors.length > 0) {
              console.error(
                `      ❌ Land assessment validation failed for PID ${pid}:`,
              );
              landValidationErrors.forEach((err) =>
                console.error(`         - ${err}`),
              );
              throw new Error(
                `Missing land codes: ${landValidationErrors.join('; ')}`,
              );
            }

            // Use insertMany to bypass post-save hooks during transaction
            try {
              await LandAssessment.insertMany([
                {
                  property_id: propertyId,
                  municipality_id: municipalityObjectId,
                  effective_year: year,
                  zone: zone?._id,
                  neighborhood: neighborhood?._id,
                  site_conditions: siteAttribute?._id,
                  road_type: roadAttribute?._id,
                  driveway_type: drivewayAttribute?._id,
                  land_use_details: landLines,
                },
              ]);
              results.land++;
              if (DEBUG_IMPORT) {
                console.log(
                  `      ✓ Land created - Zone: ${zone?._id}, Nbhd: ${neighborhood?._id}`,
                );
              }
            } catch (landError) {
              console.error(
                `      ✗ Failed to insert land for PID ${pid}:`,
                landError.message,
              );
              if (DEBUG_IMPORT) {
                console.error(
                  '         Land data:',
                  JSON.stringify(
                    {
                      zone: zone?._id,
                      neighborhood: neighborhood?._id,
                      site_conditions: siteAttribute?._id,
                      road_type: roadAttribute?._id,
                      driveway_type: drivewayAttribute?._id,
                      landLines,
                    },
                    null,
                    2,
                  ),
                );
              }
              throw landError;
            }
          }

          // Create features (use insertMany to bypass hooks during transaction)
          if (data.features.length > 0) {
            const featureDocs = [];
            for (const feature of data.features) {
              const featureCode = featureCodeMap.get(feature.feature_type);

              if (featureCode) {
                featureDocs.push({
                  property_id: propertyId,
                  card_number: parseInt(feature.card_number) || 1,
                  feature_code_id: featureCode._id,
                  description: feature.description || '',
                  measurement_type:
                    feature.length && feature.width ? 'length_width' : 'units',
                  length: parseFloat(feature.length) || 0,
                  width: parseFloat(feature.width) || 0,
                  units: parseInt(feature.units) || 1,
                  rate: parseFloat(feature.rate) || 0,
                  condition: feature.condition || 'AVERAGE',
                });
              }
            }

            if (featureDocs.length > 0) {
              await PropertyFeature.insertMany(featureDocs);
              results.features += featureDocs.length;
            }
          }

          // Save notes for this property's cards if any exist
          const propertyNotes = [];
          for (const [noteKey, noteData] of notesByPIDAndCard) {
            if (noteData.pid_raw === pid) {
              propertyNotes.push(noteData);
            }
          }

          if (propertyNotes.length > 0) {
            try {
              const bulkOps = propertyNotes.map((note) => ({
                updateOne: {
                  filter: {
                    propertyId: propertyId,
                    municipalityId: municipalityObjectId,
                    card_number: parseInt(note.card_number) || 1,
                  },
                  update: {
                    $set: {
                      notes: note.notes || '',
                      updatedBy: req.user.id,
                    },
                    $setOnInsert: {
                      createdBy: req.user.id,
                    },
                  },
                  upsert: true,
                },
              }));

              const noteResult = await PropertyNotes.bulkWrite(bulkOps);
              if (!results.notes) results.notes = 0;
              results.notes +=
                noteResult.upsertedCount + noteResult.modifiedCount;
            } catch (notesError) {
              console.error(
                `❌ Failed to insert notes for PID ${pid}:`,
                notesError.message,
              );
              // Continue even if notes fail - they're not critical to the import
            }
          }
        } catch (propertyError) {
          console.error(
            `❌ Failed to import property ${pid}:`,
            propertyError.message,
          );
          // Continue with next property instead of failing entire import
        }
      }

      // Add owner statistics to results
      results.owners = {
        created: ownersCreated,
        reused: ownersReused,
        total: ownerCache.size,
      };

      console.log(`Property data import completed:`, results);
      console.log(
        `👥 Owner management: ${ownersCreated} owners created, ${ownersReused} owners reused across properties`,
      );

      // Calculate land assessments first (before parcel calculations)
      console.log('📊 Calculating land assessments...');
      const landCalculationService = new LandAssessmentCalculationService();
      await landCalculationService.initialize(municipalityObjectId);

      let landCalculationCount = 0;
      let landCalculationErrors = 0;

      for (const [pid, data] of propertiesByPID) {
        // Only calculate if property has land data
        if (data.land && data.land.length > 0) {
          try {
            const property = await PropertyTreeNode.findOne({
              municipality_id: municipalityObjectId,
              pid_raw: pid,
            });

            if (property) {
              const landAssessment = await LandAssessment.findOne({
                property_id: property._id,
                effective_year: year,
              });

              if (landAssessment) {
                const calculatedTotals =
                  await landCalculationService.calculateLandAssessment(
                    landAssessment,
                  );
                landAssessment.calculated_totals =
                  calculatedTotals.calculated_totals;
                landAssessment.land_use_details =
                  calculatedTotals.land_use_details; // Update with calculated values
                landAssessment.last_calculated = new Date();
                landAssessment._skipBillingValidation = true; // Skip validation for import
                await landAssessment.save();
                landCalculationCount++;
              }
            }
          } catch (calcError) {
            console.warn(
              `Failed to calculate land assessment for PID ${pid}:`,
              calcError.message,
            );
            landCalculationErrors++;
          }
        }
      }

      console.log(
        `✓ Completed ${landCalculationCount} land assessment calculations (${landCalculationErrors} errors)`,
      );

      // Now trigger assessment calculations for all properties (outside transaction)
      console.log('📊 Triggering parcel assessment calculations...');
      let calculationCount = 0;
      for (const [pid, data] of propertiesByPID) {
        try {
          const property = await PropertyTreeNode.findOne({
            municipality_id: municipalityObjectId,
            pid_raw: pid,
          });

          if (property) {
            await updateParcelAssessment(
              property._id,
              municipalityObjectId,
              year,
              { trigger: 'import', userId: req.user.id },
            );
            calculationCount++;
          }
        } catch (calcError) {
          console.warn(
            `Failed to calculate assessment for PID ${pid}:`,
            calcError.message,
          );
        }
      }

      console.log(
        `Completed ${calculationCount} parcel assessment calculations`,
      );

      // ===== PERMIT REMAPPING: Update permit property references if needed =====
      let permitsRemapped = 0;
      let permitsUnmatched = 0;
      if (
        permitHandling === 'remap' &&
        oldPropertyIdMap &&
        oldPropertyIdMap.size > 0
      ) {
        console.log('📋 Remapping permits to new property IDs...');

        // Create new property ID map (PID -> new ObjectId)
        const newPropertyIdMap = new Map();
        for (const [pid, data] of propertiesByPID) {
          const property = await PropertyTreeNode.findOne({
            municipality_id: municipalityObjectId,
            pid_raw: pid,
          }).lean();
          if (property) {
            newPropertyIdMap.set(pid, property._id.toString());
          }
        }

        // Get all permits for this municipality
        const permits = await Permit.find({
          municipalityId: municipalityObjectId,
        });
        console.log(`   Found ${permits.length} permits to process`);

        for (const permit of permits) {
          if (permit.propertyId) {
            const oldPropertyId = permit.propertyId.toString();

            // Find the PID for this old property ID
            let matchedPid = null;
            for (const [pid, oldId] of oldPropertyIdMap) {
              if (oldId === oldPropertyId) {
                matchedPid = pid;
                break;
              }
            }

            if (matchedPid && newPropertyIdMap.has(matchedPid)) {
              // Update permit with new property ID
              const newPropertyId = newPropertyIdMap.get(matchedPid);
              permit.propertyId = new mongoose.Types.ObjectId(newPropertyId);
              await permit.save();
              permitsRemapped++;
            } else {
              console.warn(
                `   ⚠️  Could not find matching PID for permit ${permit._id} (old property ID: ${oldPropertyId})`,
              );
              permitsUnmatched++;
            }
          }
        }

        console.log(
          `✓ Remapped ${permitsRemapped} permits (${permitsUnmatched} unmatched)`,
        );
      }

      // Mark progress as complete
      const finalResults = {
        ...results,
        landCalculationsCompleted: landCalculationCount,
        landCalculationErrors: landCalculationErrors,
        parcelCalculationsCompleted: calculationCount,
        permitsRemapped: permitsRemapped,
        permitsUnmatched: permitsUnmatched,
      };
      importProgress.completeProgress(importId, finalResults);

      res.json({
        success: true,
        importId,
        message: 'Property data imported successfully',
        results: finalResults,
      });
    } catch (error) {
      console.error('Error importing property data:', error);
      importProgress.failProgress(importId, error);

      res.status(500).json({
        error: 'Failed to import property data',
        importId,
        message: error.message,
        details: error.stack,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/import/sketches
 * Import property sketches from VDF files
 * Supports single or multiple VDF files
 *
 * TEMPORARILY DISABLED - VDF parser not working
 */
/*
const PropertySketch = require('../models/PropertySketch');
const SketchSubAreaFactor = require('../models/SketchSubAreaFactor');
const {
  parseVDFFile,
  convertToPropertySketch,
  parseVDFFilename,
  ensureDescriptionCodes,
} = require('../utils/vdfParser');
*/

/*
// TEMPORARILY DISABLED - VDF parser not working
// Configure multer for VDF file uploads
const vdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size per VDF
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.vdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only VDF files are allowed'));
    }
  },
});

router.post(
  '/municipalities/:municipalityId/import/sketches',
  authenticateToken,
  vdfUpload.array('files', 50), // Allow up to 50 VDF files at once
  async (req, res) => {
    try {
      const { municipalityId } = req.params;
      const userId = req.user.id;
      const assessmentYear = req.body.assessmentYear || new Date().getFullYear();

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No VDF files uploaded' });
      }

      console.log(
        `📥 Sketch import request: ${req.files.length} VDF file(s) for municipality ${municipalityId}`,
      );

      const results = {
        success: [],
        errors: [],
        skipped: [],
        newDescriptionCodes: [],
      };

      // Track all description codes found across all files
      const allDescriptionCodes = new Set();

      // First pass: parse all files and collect description codes
      const parsedFiles = [];
      for (const file of req.files) {
        try {
          console.log(`📄 Parsing VDF file: ${file.originalname}`);

          // Parse filename to get PID and card number
          const { pid, cardNumber } = parseVDFFilename(file.originalname);

          // Parse VDF file
          const vdfData = await parseVDFFile(file.buffer);

          if (!vdfData.hasData) {
            results.skipped.push({
              filename: file.originalname,
              reason: 'No sketch data found in file',
            });
            continue;
          }

          // Collect description codes
          vdfData.descriptionCodes.forEach((code) =>
            allDescriptionCodes.add(code),
          );

          parsedFiles.push({
            filename: file.originalname,
            pid,
            cardNumber,
            vdfData,
          });
        } catch (error) {
          console.error(`Error parsing ${file.originalname}:`, error);
          results.errors.push({
            filename: file.originalname,
            error: error.message,
          });
        }
      }

      // Ensure all description codes exist in SketchSubAreaFactor
      console.log(
        `🔍 Ensuring ${allDescriptionCodes.size} description codes exist...`,
      );
      const factorMap = await ensureDescriptionCodes(
        Array.from(allDescriptionCodes),
        municipalityId,
        SketchSubAreaFactor,
      );

      // Track newly created codes
      results.newDescriptionCodes = Array.from(allDescriptionCodes).filter(
        (code) => {
          const factor = factorMap.get(code);
          // Check if it was recently created (within last 10 seconds)
          return (
            factor &&
            factor.createdAt &&
            Date.now() - factor.createdAt.getTime() < 10000
          );
        },
      );

      // Second pass: create PropertySketch records
      for (const parsed of parsedFiles) {
        try {
          // Find property by PID
          const property = await PropertyTreeNode.findOne({
            pid_raw: parsed.pid,
            municipality_id: municipalityId,
          });

          if (!property) {
            results.skipped.push({
              filename: parsed.filename,
              reason: `Property not found with PID ${parsed.pid}`,
            });
            continue;
          }

          // Check if sketch already exists for this property/card
          const existingSketch = await PropertySketch.findOne({
            property_id: property._id,
            card_number: parsed.cardNumber,
            assessment_year: assessmentYear,
          });

          if (existingSketch) {
            results.skipped.push({
              filename: parsed.filename,
              reason: `Sketch already exists for Card ${parsed.cardNumber}`,
              property_id: property._id.toString(),
            });
            continue;
          }

          // Convert VDF data to PropertySketch format
          const sketchData = convertToPropertySketch(
            parsed.vdfData,
            property._id,
            parsed.cardNumber,
            userId,
            assessmentYear,
            Array.from(factorMap.values()),
          );

          // Create the sketch
          const sketch = await PropertySketch.create(sketchData);

          console.log(
            `✅ Created sketch for PID ${parsed.pid}, Card ${parsed.cardNumber}`,
          );

          results.success.push({
            filename: parsed.filename,
            property_id: property._id.toString(),
            sketch_id: sketch._id.toString(),
            card_number: parsed.cardNumber,
            description_codes: parsed.vdfData.descriptionCodes,
          });
        } catch (error) {
          console.error(`Error creating sketch from ${parsed.filename}:`, error);
          results.errors.push({
            filename: parsed.filename,
            error: error.message,
          });
        }
      }

      console.log(
        `✨ Sketch import complete: ${results.success.length} created, ${results.skipped.length} skipped, ${results.errors.length} errors`,
      );

      res.json({
        success: true,
        message: `Imported ${results.success.length} sketch(es)`,
        results,
      });
    } catch (error) {
      console.error('Error importing sketches:', error);
      res.status(500).json({
        error: 'Failed to import sketches',
        message: error.message,
        details: error.stack,
      });
    }
  },
);
*/

/**
 * POST /api/municipalities/:municipalityId/import/building-codes/validate
 * Validate building codes Excel file before import
 */
router.post(
  '/municipalities/:municipalityId/import/building-codes/validate',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log(
        `📋 Validating building codes file for municipality: ${municipalityId}`,
      );

      // Parse the building codes file
      const parsed = buildingCodesImportService.parseBuildingCodesFile(
        req.file.buffer,
      );

      // Build validation summary
      const stats = parsed.stats;

      // Format feature codes by type for display
      const featureCodesByType = [];
      for (const [type, count] of Object.entries(stats.featureCodesByType)) {
        // Convert snake_case to Title Case for display
        const displayType = type
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        featureCodesByType.push({ type: displayType, count });
      }

      res.json({
        valid: true,
        message: 'Building codes file validated successfully',
        summary: {
          buildingCodes: stats.buildingCodesCount,
          featureCodes: stats.featureCodesCount,
          featureCodesByType,
          subAreaFactors: stats.subAreaFactorsCount,
          miscellaneousPoints: parsed.miscellaneousPoints,
        },
      });
    } catch (error) {
      console.error('❌ Building codes validation failed:', error);
      res.status(400).json({
        valid: false,
        error: 'Failed to validate building codes file',
        message: error.message,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/import/building-codes
 * Phase 1: Import building codes from Excel file
 * This should be run before importing property data
 */
router.post(
  '/municipalities/:municipalityId/import/building-codes',
  authenticateToken,
  upload.single('file'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      console.log('📥 Building codes import request received');
      console.log('  - Municipality:', municipalityId);
      console.log('  - File:', req.file ? req.file.originalname : 'No file');

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Verify municipality exists
      const municipality = await Municipality.findById(municipalityId);
      if (!municipality) {
        return res.status(404).json({ error: 'Municipality not found' });
      }

      console.log(`🏛️  Importing building codes for: ${municipality.name}`);

      // Parse the building codes file
      const parsedCodes = buildingCodesImportService.parseBuildingCodesFile(
        req.file.buffer,
      );

      const results = {
        buildingCodesCreated: 0,
        buildingCodesUpdated: 0,
        buildingCodesDeleted: 0,
        featureCodesCreated: 0,
        featureCodesUpdated: 0,
        featureCodesDeleted: 0,
        errors: [],
      };

      // Delete existing building codes for this municipality
      console.log(
        `🗑️  Deleting existing building codes for municipality ${municipalityId}...`,
      );
      const buildingCodesDeleteResult = await BuildingCode.deleteMany({
        municipalityId: municipalityId,
      });
      results.buildingCodesDeleted = buildingCodesDeleteResult.deletedCount;
      console.log(
        `   ✓ Deleted ${results.buildingCodesDeleted} building codes`,
      );

      // Delete existing building feature codes for this municipality
      console.log(
        `🗑️  Deleting existing building feature codes for municipality ${municipalityId}...`,
      );
      const featureCodesDeleteResult = await BuildingFeatureCode.deleteMany({
        municipalityId: municipalityId,
      });
      results.featureCodesDeleted = featureCodesDeleteResult.deletedCount;
      console.log(`   ✓ Deleted ${results.featureCodesDeleted} feature codes`);

      // Import BuildingCode entries
      console.log(
        `📋 Importing ${parsedCodes.buildingCodes.length} building codes...`,
      );
      for (const codeData of parsedCodes.buildingCodes) {
        try {
          // Create new code (no need to check for existing since we deleted all)
          await BuildingCode.create({
            municipalityId: municipalityId,
            code: codeData.code,
            description: codeData.description,
            rate: codeData.rate,
            depreciation: codeData.depreciation,
            buildingType: codeData.buildingType || 'residential',
            sizeAdjustmentCategory:
              codeData.sizeAdjustmentCategory ||
              codeData.buildingType ||
              'residential',
            isActive: true,
          });
          results.buildingCodesCreated++;
        } catch (error) {
          console.error(
            `❌ Failed to import building code ${codeData.code}:`,
            error.message,
          );
          results.errors.push({
            type: 'BuildingCode',
            code: codeData.code,
            error: error.message,
          });
        }
      }

      // Import BuildingFeatureCode entries
      console.log(
        `🏗️  Importing ${parsedCodes.buildingFeatureCodes.length} building feature codes...`,
      );

      // Count by feature type for debugging
      const featureTypeCount = {};
      parsedCodes.buildingFeatureCodes.forEach((fc) => {
        featureTypeCount[fc.featureType] =
          (featureTypeCount[fc.featureType] || 0) + 1;
      });
      console.log('   Feature codes to import by type:');
      for (const [type, count] of Object.entries(featureTypeCount)) {
        console.log(`      - ${type}: ${count} codes`);
      }

      for (const featureData of parsedCodes.buildingFeatureCodes) {
        try {
          // Create new feature code (no need to check for existing since we deleted all)
          await BuildingFeatureCode.create({
            code: featureData.code, // Save the original code
            municipalityId: municipalityId,
            displayText: featureData.displayText,
            description: featureData.description,
            featureType: featureData.featureType,
            points: featureData.points,
            isActive: true,
          });
          results.featureCodesCreated++;
          if (featureData.featureType === 'quality') {
            console.log(
              `   ➕ Created quality code: ${featureData.displayText} in BuildingFeatureCode`,
            );
          }
        } catch (error) {
          console.error(
            `❌ Failed to import feature code ${featureData.displayText}:`,
            error.message,
          );
          results.errors.push({
            type: 'BuildingFeatureCode',
            code: featureData.displayText,
            featureType: featureData.featureType,
            error: error.message,
          });
        }
      }

      // Import SketchSubAreaFactor entries
      console.log(
        `📐 Importing ${parsedCodes.sketchSubAreaFactors.length} sketch sub-area factors...`,
      );
      for (const subAreaData of parsedCodes.sketchSubAreaFactors) {
        try {
          const SketchSubAreaFactor = require('../models/SketchSubAreaFactor');
          const existing = await SketchSubAreaFactor.findOne({
            municipalityId: municipalityId,
            displayText: subAreaData.displayText,
          });

          if (existing) {
            // Update existing sub-area factor
            existing.description = subAreaData.description;
            existing.points = subAreaData.points;
            existing.livingSpace = subAreaData.livingSpace;
            await existing.save();
            console.log(
              `   ✏️  Updated sub-area factor: ${subAreaData.displayText} (living space: ${subAreaData.livingSpace})`,
            );
          } else {
            // Create new sub-area factor
            await SketchSubAreaFactor.create({
              municipalityId: municipalityId,
              displayText: subAreaData.displayText,
              description: subAreaData.description,
              points: subAreaData.points,
              livingSpace: subAreaData.livingSpace,
              isActive: true,
            });
            console.log(
              `   ➕ Created sub-area factor: ${subAreaData.displayText} (living space: ${subAreaData.livingSpace})`,
            );
          }
        } catch (error) {
          console.error(
            `❌ Failed to import sub-area factor ${subAreaData.displayText}:`,
            error.message,
          );
          results.errors.push({
            type: 'SketchSubAreaFactor',
            code: subAreaData.displayText,
            error: error.message,
          });
        }
      }

      // Import Building Miscellaneous Points (accessories)
      if (parsedCodes.miscellaneousPoints) {
        console.log('🔧 Importing building accessories...');
        try {
          const BuildingMiscellaneousPoints = require('../models/BuildingMiscellaneousPoints');

          // Find or create miscellaneous points for this municipality
          let miscPoints = await BuildingMiscellaneousPoints.findOne({
            municipalityId: municipalityId,
          });

          if (miscPoints) {
            // Update existing
            miscPoints.airConditioningPoints =
              parsedCodes.miscellaneousPoints.airConditioningPoints;
            miscPoints.extraKitchenPoints =
              parsedCodes.miscellaneousPoints.extraKitchenPoints;
            miscPoints.fireplacePoints =
              parsedCodes.miscellaneousPoints.fireplacePoints;
            miscPoints.generatorPoints =
              parsedCodes.miscellaneousPoints.generatorPoints;
            await miscPoints.save();
            console.log('   ✅ Updated building accessories');
          } else {
            // Create new
            await BuildingMiscellaneousPoints.create({
              municipalityId: municipalityId,
              airConditioningPoints:
                parsedCodes.miscellaneousPoints.airConditioningPoints,
              extraKitchenPoints:
                parsedCodes.miscellaneousPoints.extraKitchenPoints,
              fireplacePoints: parsedCodes.miscellaneousPoints.fireplacePoints,
              generatorPoints: parsedCodes.miscellaneousPoints.generatorPoints,
            });
            console.log('   ✅ Created building accessories');
          }

          results.miscellaneousPoints = parsedCodes.miscellaneousPoints;
        } catch (error) {
          console.error(
            '❌ Failed to import building accessories:',
            error.message,
          );
          results.errors.push({
            type: 'BuildingMiscellaneousPoints',
            error: error.message,
          });
        }
      }

      console.log('✅ Building codes import completed');
      console.log(
        `   Building Codes: ${results.buildingCodesCreated} created, ${results.buildingCodesUpdated} updated`,
      );
      console.log(
        `   Feature Codes: ${results.featureCodesCreated} created, ${results.featureCodesUpdated} updated`,
      );
      if (results.errors.length > 0) {
        console.log(`   ⚠️  ${results.errors.length} errors occurred`);
      }

      res.json({
        success: true,
        message: 'Building codes imported successfully',
        results: results,
        stats: parsedCodes.stats,
      });
    } catch (error) {
      console.error('❌ Building codes import failed:', error);
      res.status(500).json({
        error: 'Failed to import building codes',
        message: error.message,
        details: error.stack,
      });
    }
  },
);

/**
 * POST /api/municipalities/:municipalityId/import/land-codes
 * Import land codes from Excel file
 *
 * Imports:
 * - Zones with minimum acreage, frontage, excess costs, view values
 * - Land ladders (pricing tiers by acreage per zone)
 * - Land use codes
 * - Neighborhood codes with adjustment rates
 * - Site/topography modifiers
 * - Road and driveway types
 * - Current use codes
 * - View attributes (subjects, widths, depths, distances)
 * - Water bodies with frontage ladders
 * - Waterfront attributes (access, location, topography)
 */
// Zone and NeighborhoodCode already imported at top of file
const LandLadder = require('../models/LandLadder');
const LandUseDetail = require('../models/LandUseDetail');
const {
  SiteAttribute,
  DrivewayAttribute,
  RoadAttribute,
  TopologyAttribute,
} = require('../models/PropertyAttribute');
const CurrentUse = require('../models/CurrentUse');
const ViewAttribute = require('../models/ViewAttribute');
const WaterBody = require('../models/WaterBody');
const WaterBodyLadder = require('../models/WaterBodyLadder');
const WaterfrontAttribute = require('../models/WaterfrontAttribute');
const landCodesImportService = require('../services/landCodesImportService');

const landCodesUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files are allowed.'));
    }
  },
});

router.post(
  '/municipalities/:municipalityId/import/land-codes/validate',
  landCodesUpload.single('file'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log(
        `📋 Validating land codes file for municipality: ${municipalityId}`,
      );

      // Parse the land codes file
      const parsed = landCodesImportService.parseLandCodesFile(req.file.buffer);

      // Build validation summary
      const stats = parsed.stats;

      res.json({
        valid: true,
        message: 'Land codes file validated successfully',
        summary: {
          sectionsFound: stats.sectionsFound,
          zones: stats.zonesCount,
          landLadders: stats.landLaddersCount,
          landUseCodes: stats.landUseCodesCount,
          neighborhoodCodes: stats.neighborhoodCodesCount,
          propertyAttributes: stats.propertyAttributesCount,
          currentUseCodes: stats.currentUseCodesCount,
          viewAttributes: stats.viewAttributesCount,
          waterBodies: stats.waterBodiesCount,
          waterBodyLadders: stats.waterBodyLaddersCount,
          waterfrontAttributes: stats.waterfrontAttributesCount,
        },
      });
    } catch (error) {
      console.error('Land codes validation error:', error);
      res.status(400).json({
        valid: false,
        error: error.message || 'Failed to validate land codes file',
      });
    }
  },
);

router.post(
  '/municipalities/:municipalityId/import/land-codes',
  landCodesUpload.single('file'),
  async (req, res) => {
    try {
      const { municipalityId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log(
        `📥 Importing land codes for municipality: ${municipalityId}`,
      );

      // Clean up ALL existing data for this municipality BEFORE importing land codes
      // This ensures a clean slate for the import since land codes are the first step
      console.log('🔍 Cleaning up all existing data for municipality...');

      const municipalityObjectId = new mongoose.Types.ObjectId(municipalityId);
      let totalDeleted = 0;
      const deletionLog = [];

      // Get all models from mongoose
      const modelNames = Object.keys(mongoose.models);

      // Track critical deletions explicitly for visibility
      const criticalModels = [
        'PropertySketch',
        'ParcelAssessment',
        'BuildingAssessment',
        'LandAssessment',
      ];
      const criticalDeletions = {};

      // Delete from all models that have municipalityId or municipality_id (except Municipality itself)
      for (const modelName of modelNames) {
        if (modelName === 'Municipality') continue; // Skip the municipality model itself

        const Model = mongoose.models[modelName];

        // Check if this model has municipalityId (camelCase) or municipality_id (underscore) in its schema
        const hasCamelCase = Model.schema.path('municipalityId');
        const hasUnderscore = Model.schema.path('municipality_id');

        if (hasCamelCase || hasUnderscore) {
          try {
            // Use the appropriate field name for the query
            const fieldName = hasCamelCase
              ? 'municipalityId'
              : 'municipality_id';
            const result = await Model.deleteMany({
              [fieldName]: municipalityObjectId,
            });
            if (result.deletedCount > 0) {
              totalDeleted += result.deletedCount;
              deletionLog.push(`   - ${modelName}: ${result.deletedCount}`);

              // Track critical model deletions
              if (criticalModels.includes(modelName)) {
                criticalDeletions[modelName] = result.deletedCount;
              }
            }
          } catch (error) {
            console.warn(
              `⚠️  Could not delete from ${modelName}:`,
              error.message,
            );
          }
        }
      }

      // Log critical deletions explicitly
      if (Object.keys(criticalDeletions).length > 0) {
        console.log('🗑️  Critical assessment data deleted:');
        criticalModels.forEach((model) => {
          if (criticalDeletions[model]) {
            console.log(`   ✓ ${model}: ${criticalDeletions[model]} records`);
          }
        });
      }

      if (totalDeleted > 0) {
        console.log(
          `🗑️  Deleted ${totalDeleted} existing records from ${deletionLog.length} collections:`,
        );
        deletionLog.forEach((log) => console.log(log));
      } else {
        console.log('✅ Database is empty - ready for import');
      }

      // Parse the land codes file
      const parsed = landCodesImportService.parseLandCodesFile(req.file.buffer);

      const results = {
        zones: { created: 0, updated: 0, errors: [] },
        landLadders: { created: 0, updated: 0, errors: [] },
        landUseCodes: { created: 0, updated: 0, errors: [] },
        neighborhoodCodes: { created: 0, updated: 0, errors: [] },
        siteAttributes: { created: 0, updated: 0, errors: [] },
        topologyAttributes: { created: 0, updated: 0, errors: [] },
        roadAttributes: { created: 0, updated: 0, errors: [] },
        drivewayAttributes: { created: 0, updated: 0, errors: [] },
        currentUseCodes: { created: 0, updated: 0, errors: [] },
        viewAttributes: { created: 0, updated: 0, errors: [] },
        waterBodies: { created: 0, updated: 0, errors: [] },
        waterBodyLadders: { created: 0, updated: 0, errors: [] },
        waterfrontAttributes: { created: 0, updated: 0, errors: [] },
      };

      // Import zones
      console.log(`📋 Importing ${parsed.zones.length} zones...`);
      for (const zoneData of parsed.zones) {
        try {
          const existing = await Zone.findOne({
            municipalityId,
            name: zoneData.name,
          });

          if (existing) {
            await Zone.updateOne(
              { _id: existing._id },
              {
                ...zoneData,
                municipalityId,
                isActive: true,
              },
            );
            results.zones.updated++;
            console.log(`   ✓ Updated zone: ${zoneData.name}`);
          } else {
            await Zone.create({
              ...zoneData,
              municipalityId,
              isActive: true,
            });
            results.zones.created++;
            console.log(`   ✓ Created zone: ${zoneData.name}`);
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import zone ${zoneData.name}:`,
            error.message,
          );
          results.zones.errors.push({
            zone: zoneData.name,
            error: error.message,
          });
        }
      }

      // Log summary for zones
      console.log(
        `📊 Zones Summary: ${results.zones.created} created, ${results.zones.updated} updated, ${results.zones.errors.length} errors`,
      );

      // Import land ladders
      console.log(
        `📋 Importing ${parsed.landLadders.length} land ladder tiers...`,
      );
      for (const ladderData of parsed.landLadders) {
        try {
          // Find the zone ID
          const zone = await Zone.findOne({
            municipalityId,
            name: ladderData.zoneCode,
          });

          if (!zone) {
            results.landLadders.errors.push({
              ladder: `${ladderData.zoneCode} @ ${ladderData.acreage}ac`,
              error: `Zone ${ladderData.zoneCode} not found`,
            });
            continue;
          }

          const existing = await LandLadder.findOne({
            municipalityId,
            zoneId: zone._id,
            acreage: ladderData.acreage,
            order: ladderData.order,
          });

          if (existing) {
            await LandLadder.updateOne(
              { _id: existing._id },
              {
                value: ladderData.value,
                isActive: true,
              },
            );
            results.landLadders.updated++;
            console.log(
              `   ✓ Updated land ladder: ${ladderData.zoneCode} @ ${ladderData.acreage}ac → ${ladderData.value}`,
            );
          } else {
            await LandLadder.create({
              municipalityId,
              zoneId: zone._id,
              acreage: ladderData.acreage,
              value: ladderData.value,
              order: ladderData.order,
              isActive: true,
            });
            results.landLadders.created++;
            console.log(
              `   ✓ Created land ladder: ${ladderData.zoneCode} @ ${ladderData.acreage}ac → ${ladderData.value}`,
            );
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import land ladder ${ladderData.zoneCode} @ ${ladderData.acreage}ac:`,
            error.message,
          );
          results.landLadders.errors.push({
            ladder: `${ladderData.zoneCode} @ ${ladderData.acreage}ac`,
            error: error.message,
          });
        }
      }

      // Log summary for land ladders
      console.log(
        `📊 Land Ladders Summary: ${results.landLadders.created} created, ${results.landLadders.updated} updated, ${results.landLadders.errors.length} errors`,
      );

      // Import land use codes
      console.log(
        `📋 Importing ${parsed.landUseCodes.length} land use codes...`,
      );

      // Debug: Log first few codes to see structure
      if (parsed.landUseCodes.length > 0) {
        console.log(
          '   Sample land use codes:',
          JSON.stringify(parsed.landUseCodes.slice(0, 3), null, 2),
        );
      }

      for (const codeData of parsed.landUseCodes) {
        try {
          if (!codeData.code || codeData.code.toString().trim() === '') {
            console.warn(
              `⚠️  Skipping land use code with empty code value:`,
              codeData,
            );
            results.landUseCodes.errors.push({
              code: 'EMPTY',
              error: 'Code value is empty or missing',
              data: codeData,
            });
            continue;
          }

          // Determine landUseType based on code prefix
          const codeUpper = codeData.code.toString().toUpperCase();
          let landUseType = 'residential'; // default

          if (codeUpper.startsWith('C')) {
            landUseType = 'commercial';
          } else if (codeUpper.startsWith('R')) {
            landUseType = 'residential';
          } else if (codeUpper.startsWith('U')) {
            landUseType = 'utility';
          } else if (codeUpper.startsWith('E')) {
            landUseType = 'exempt';
          } else if (codeUpper.startsWith('M')) {
            landUseType = 'mixed_use';
          } else if (/^\d/.test(codeUpper)) {
            // Starts with a number (like 79D, 79F) - treat as residential
            landUseType = 'residential';
          }

          // Create the complete land use detail object
          const landUseDetailData = {
            code: codeData.code,
            description: codeData.description || '',
            displayText: codeData.description || codeData.code, // Use description as display text
            landUseType: landUseType,
            municipalityId,
            isActive: true,
          };

          const existing = await LandUseDetail.findOne({
            municipalityId,
            code: codeData.code,
          });

          if (existing) {
            await LandUseDetail.updateOne(
              { _id: existing._id },
              {
                description: codeData.description,
                displayText: codeData.description || codeData.code,
                landUseType: landUseType,
                isActive: true,
              },
            );
            results.landUseCodes.updated++;
            console.log(
              `   ✓ Updated land use code: ${codeData.code} (${landUseType})`,
            );
          } else {
            await LandUseDetail.create(landUseDetailData);
            results.landUseCodes.created++;
            console.log(
              `   ✓ Created land use code: ${codeData.code} (${landUseType})`,
            );
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import land use code ${codeData.code}:`,
            error.message,
          );
          results.landUseCodes.errors.push({
            code: codeData.code,
            error: error.message,
            stack: error.stack,
          });
        }
      }

      // Log summary for land use codes
      console.log(
        `📊 Land Use Codes Summary: ${results.landUseCodes.created} created, ${results.landUseCodes.updated} updated, ${results.landUseCodes.errors.length} errors`,
      );

      // Import neighborhood codes
      console.log(
        `📋 Importing ${parsed.neighborhoodCodes.length} neighborhood codes...`,
      );
      for (const codeData of parsed.neighborhoodCodes) {
        try {
          const existing = await NeighborhoodCode.findOne({
            municipalityId,
            code: codeData.code,
          });

          if (existing) {
            await NeighborhoodCode.updateOne(
              { _id: existing._id },
              {
                description: codeData.description,
                rate: codeData.rate,
                isActive: true,
              },
            );
            results.neighborhoodCodes.updated++;
            console.log(
              `   ✓ Updated neighborhood code: ${codeData.code} - ${codeData.description}`,
            );
          } else {
            await NeighborhoodCode.create({
              ...codeData,
              municipalityId,
              isActive: true,
            });
            results.neighborhoodCodes.created++;
            console.log(
              `   ✓ Created neighborhood code: ${codeData.code} - ${codeData.description}`,
            );
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import neighborhood code ${codeData.code}:`,
            error.message,
          );
          results.neighborhoodCodes.errors.push({
            code: codeData.code,
            error: error.message,
          });
        }
      }

      // Log summary for neighborhood codes
      console.log(
        `📊 Neighborhood Codes Summary: ${results.neighborhoodCodes.created} created, ${results.neighborhoodCodes.updated} updated, ${results.neighborhoodCodes.errors.length} errors`,
      );

      // Import property attributes (site, topography, road, driveway modifiers)
      console.log(
        `📋 Importing ${parsed.propertyAttributes.length} property attributes...`,
      );

      // Debug: Log first few to see structure
      if (parsed.propertyAttributes.length > 0) {
        console.log(
          '   Sample property attributes:',
          JSON.stringify(parsed.propertyAttributes.slice(0, 3), null, 2),
        );
      }

      for (const attributeData of parsed.propertyAttributes) {
        let resultKey; // Define outside try block so it's available in catch
        try {
          // Determine which discriminated model to use based on attributeType
          let Model;
          if (attributeData.attributeType === 'SiteAttribute') {
            Model = SiteAttribute;
            resultKey = 'siteAttributes';
          } else if (attributeData.attributeType === 'TopologyAttribute') {
            Model = TopologyAttribute;
            resultKey = 'topologyAttributes';
          } else if (attributeData.attributeType === 'RoadAttribute') {
            Model = RoadAttribute;
            resultKey = 'roadAttributes';
          } else if (attributeData.attributeType === 'DrivewayAttribute') {
            Model = DrivewayAttribute;
            resultKey = 'drivewayAttributes';
          } else {
            throw new Error(
              `Unknown attribute type: ${attributeData.attributeType}`,
            );
          }

          const existing = await Model.findOne({
            municipalityId,
            code: attributeData.code,
          });

          const dataToSave = {
            code: attributeData.code, // Save the original code
            description: attributeData.description,
            displayText: attributeData.displayText,
            rate: attributeData.rate || 100,
            municipalityId,
            isActive: true,
          };

          if (existing) {
            await Model.updateOne({ _id: existing._id }, dataToSave);
            results[resultKey].updated++;
            console.log(
              `   ✓ Updated ${attributeData.attributeType}: ${attributeData.code}`,
            );
          } else {
            await Model.create(dataToSave);
            results[resultKey].created++;
            console.log(
              `   ✓ Created ${attributeData.attributeType}: ${attributeData.code}`,
            );
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import ${attributeData.attributeType} ${attributeData.code}:`,
            error.message,
          );
          if (resultKey && results[resultKey]) {
            results[resultKey].errors.push({
              code: attributeData.code,
              attributeType: attributeData.attributeType,
              error: error.message,
              stack: error.stack,
            });
          }
        }
      }

      // Log summary for each property attribute type
      console.log(
        `📊 Site Attributes Summary: ${results.siteAttributes.created} created, ${results.siteAttributes.updated} updated, ${results.siteAttributes.errors.length} errors`,
      );
      console.log(
        `📊 Topology Attributes Summary: ${results.topologyAttributes.created} created, ${results.topologyAttributes.updated} updated, ${results.topologyAttributes.errors.length} errors`,
      );
      console.log(
        `📊 Road Attributes Summary: ${results.roadAttributes.created} created, ${results.roadAttributes.updated} updated, ${results.roadAttributes.errors.length} errors`,
      );
      console.log(
        `📊 Driveway Attributes Summary: ${results.drivewayAttributes.created} created, ${results.drivewayAttributes.updated} updated, ${results.drivewayAttributes.errors.length} errors`,
      );

      // Import current use codes
      console.log(
        `📋 Importing ${parsed.currentUseCodes.length} current use codes...`,
      );
      for (const codeData of parsed.currentUseCodes) {
        try {
          const existing = await CurrentUse.findOne({
            municipalityId,
            code: codeData.code,
          });

          if (existing) {
            await CurrentUse.updateOne(
              { _id: existing._id },
              {
                description: codeData.description,
                displayText: codeData.displayText,
                minRate: codeData.minRate,
                maxRate: codeData.maxRate,
                isActive: true,
              },
            );
            results.currentUseCodes.updated++;
            console.log(
              `   ✓ Updated current use code: ${codeData.code} - ${codeData.description}`,
            );
          } else {
            await CurrentUse.create({
              code: codeData.code,
              description: codeData.description,
              displayText: codeData.displayText,
              minRate: codeData.minRate,
              maxRate: codeData.maxRate,
              municipalityId,
              isActive: true,
            });
            results.currentUseCodes.created++;
            console.log(
              `   ✓ Created current use code: ${codeData.code} - ${codeData.description}`,
            );
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import current use code ${codeData.code}:`,
            error.message,
          );
          results.currentUseCodes.errors.push({
            code: codeData.code,
            error: error.message,
          });
        }
      }

      // Log summary for current use codes
      console.log(
        `📊 Current Use Codes Summary: ${results.currentUseCodes.created} created, ${results.currentUseCodes.updated} updated, ${results.currentUseCodes.errors.length} errors`,
      );

      // Import view attributes
      console.log(
        `📋 Importing ${parsed.viewAttributes.length} view attributes...`,
      );
      for (const attrData of parsed.viewAttributes) {
        try {
          const existing = await ViewAttribute.findOne({
            municipalityId,
            attributeType: attrData.attributeType,
            name: attrData.name,
          });

          if (existing) {
            await ViewAttribute.updateOne(
              { _id: existing._id },
              {
                description: attrData.description,
                displayText: attrData.displayText,
                factor: attrData.factor,
                isActive: true,
              },
            );
            results.viewAttributes.updated++;
            console.log(
              `   ✓ Updated view attribute: ${attrData.attributeType} - ${attrData.name}`,
            );
          } else {
            await ViewAttribute.create({
              ...attrData,
              municipalityId,
              isActive: true,
            });
            results.viewAttributes.created++;
            console.log(
              `   ✓ Created view attribute: ${attrData.attributeType} - ${attrData.name}`,
            );
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import view attribute ${attrData.attributeType} - ${attrData.name}:`,
            error.message,
          );
          results.viewAttributes.errors.push({
            attribute: `${attrData.attributeType}: ${attrData.name}`,
            error: error.message,
          });
        }
      }

      // Log summary for view attributes
      console.log(
        `📊 View Attributes Summary: ${results.viewAttributes.created} created, ${results.viewAttributes.updated} updated, ${results.viewAttributes.errors.length} errors`,
      );

      // Import water bodies
      console.log(`📋 Importing ${parsed.waterBodies.length} water bodies...`);
      for (const bodyData of parsed.waterBodies) {
        try {
          const existing = await WaterBody.findOne({
            municipalityId,
            name: bodyData.name,
          });

          if (existing) {
            await WaterBody.updateOne(
              { _id: existing._id },
              {
                description: bodyData.description,
                waterBodyType: bodyData.waterBodyType,
                isActive: true,
              },
            );
            results.waterBodies.updated++;
            console.log(
              `   ✓ Updated water body: ${bodyData.name} (${bodyData.waterBodyType})`,
            );
          } else {
            await WaterBody.create({
              ...bodyData,
              municipalityId,
              isActive: true,
            });
            results.waterBodies.created++;
            console.log(
              `   ✓ Created water body: ${bodyData.name} (${bodyData.waterBodyType})`,
            );
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import water body ${bodyData.name}:`,
            error.message,
          );
          results.waterBodies.errors.push({
            waterBody: bodyData.name,
            error: error.message,
          });
        }
      }

      // Log summary for water bodies
      console.log(
        `📊 Water Bodies Summary: ${results.waterBodies.created} created, ${results.waterBodies.updated} updated, ${results.waterBodies.errors.length} errors`,
      );

      // Import water body ladders
      console.log(
        `📋 Importing ${parsed.waterBodyLadders.length} water body ladder tiers...`,
      );
      for (const ladderData of parsed.waterBodyLadders) {
        try {
          // Find the water body ID
          const waterBody = await WaterBody.findOne({
            municipalityId,
            name: ladderData.waterBodyName,
          });

          if (!waterBody) {
            results.waterBodyLadders.errors.push({
              ladder: `${ladderData.waterBodyName} @ ${ladderData.frontage}ft`,
              error: `Water body ${ladderData.waterBodyName} not found`,
            });
            continue;
          }

          const existing = await WaterBodyLadder.findOne({
            municipalityId,
            waterBodyId: waterBody._id,
            frontage: ladderData.frontage,
            order: ladderData.order,
          });

          if (existing) {
            await WaterBodyLadder.updateOne(
              { _id: existing._id },
              {
                factor: ladderData.factor,
                isActive: true,
              },
            );
            results.waterBodyLadders.updated++;
            console.log(
              `   ✓ Updated water body ladder: ${ladderData.waterBodyName} @ ${ladderData.frontage}ft → ${ladderData.factor}`,
            );
          } else {
            await WaterBodyLadder.create({
              municipalityId,
              waterBodyId: waterBody._id,
              frontage: ladderData.frontage,
              factor: ladderData.factor,
              order: ladderData.order,
              isActive: true,
            });
            results.waterBodyLadders.created++;
            console.log(
              `   ✓ Created water body ladder: ${ladderData.waterBodyName} @ ${ladderData.frontage}ft → ${ladderData.factor}`,
            );
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import water body ladder ${ladderData.waterBodyName} @ ${ladderData.frontage}ft:`,
            error.message,
          );
          results.waterBodyLadders.errors.push({
            ladder: `${ladderData.waterBodyName} @ ${ladderData.frontage}ft`,
            error: error.message,
          });
        }
      }

      // Log summary for water body ladders
      console.log(
        `📊 Water Body Ladders Summary: ${results.waterBodyLadders.created} created, ${results.waterBodyLadders.updated} updated, ${results.waterBodyLadders.errors.length} errors`,
      );

      // Import waterfront attributes
      console.log(
        `📋 Importing ${parsed.waterfrontAttributes.length} waterfront attributes...`,
      );
      for (const attrData of parsed.waterfrontAttributes) {
        try {
          const existing = await WaterfrontAttribute.findOne({
            municipalityId,
            attributeType: attrData.attributeType,
            name: attrData.name,
          });

          if (existing) {
            await WaterfrontAttribute.updateOne(
              { _id: existing._id },
              {
                description: attrData.description,
                displayText: attrData.displayText,
                factor: attrData.factor,
                isActive: true,
              },
            );
            results.waterfrontAttributes.updated++;
            console.log(
              `   ✓ Updated waterfront attribute: ${attrData.attributeType} - ${attrData.name}`,
            );
          } else {
            await WaterfrontAttribute.create({
              ...attrData,
              municipalityId,
              isActive: true,
            });
            results.waterfrontAttributes.created++;
            console.log(
              `   ✓ Created waterfront attribute: ${attrData.attributeType} - ${attrData.name}`,
            );
          }
        } catch (error) {
          console.error(
            `   ✗ Failed to import waterfront attribute ${attrData.attributeType} - ${attrData.name}:`,
            error.message,
          );
          results.waterfrontAttributes.errors.push({
            attribute: `${attrData.attributeType}: ${attrData.name}`,
            error: error.message,
          });
        }
      }

      // Log summary for waterfront attributes
      console.log(
        `📊 Waterfront Attributes Summary: ${results.waterfrontAttributes.created} created, ${results.waterfrontAttributes.updated} updated, ${results.waterfrontAttributes.errors.length} errors`,
      );

      console.log('✅ Land codes import complete');

      // Build detailed summary message
      const totalErrors = Object.values(results).reduce((sum, category) => {
        return sum + (category.errors?.length || 0);
      }, 0);

      const summaryParts = [];

      // Add warnings if any category had zero imports
      if (
        results.landUseCodes.created === 0 &&
        results.landUseCodes.updated === 0 &&
        parsed.landUseCodes.length > 0
      ) {
        summaryParts.push(
          `⚠️ Land Use Codes: ${parsed.landUseCodes.length} in file, 0 imported (${results.landUseCodes.errors.length} errors)`,
        );
      }
      if (
        results.zones.created === 0 &&
        results.zones.updated === 0 &&
        parsed.zones.length > 0
      ) {
        summaryParts.push(
          `⚠️ Zones: ${parsed.zones.length} in file, 0 imported (${results.zones.errors.length} errors)`,
        );
      }
      if (
        results.neighborhoodCodes.created === 0 &&
        results.neighborhoodCodes.updated === 0 &&
        parsed.neighborhoodCodes.length > 0
      ) {
        summaryParts.push(
          `⚠️ Neighborhood Codes: ${parsed.neighborhoodCodes.length} in file, 0 imported (${results.neighborhoodCodes.errors.length} errors)`,
        );
      }

      const detailedMessage =
        summaryParts.length > 0
          ? `Land codes imported with warnings:\n${summaryParts.join('\n')}`
          : 'Land codes imported successfully';

      res.json({
        success: true,
        message: detailedMessage,
        results,
        stats: parsed.stats,
        warnings: summaryParts,
        hasErrors: totalErrors > 0,
        totalErrors,
      });
    } catch (error) {
      console.error('❌ Error importing land codes:', error);
      res.status(500).json({
        error: 'Failed to import land codes',
        message: error.message,
        details: error.stack,
      });
    }
  },
);

module.exports = router;
